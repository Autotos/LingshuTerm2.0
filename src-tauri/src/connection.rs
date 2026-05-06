use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::TcpStream;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex, RwLock};
use std::time::Duration;

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use tracing::{info, warn};

use crate::block::{self, MarkerScanner, ShellType};
use crate::output_sanitizer::sanitize_output;
use crate::stream_cleaner::StreamCleaner;

// ─── Types ───────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "protocol", rename_all = "camelCase")]
pub enum ConnectionConfig {
    #[serde(rename_all = "camelCase")]
    Ssh {
        host: String,
        port: u16,
        username: String,
        password: String,
    },
    #[serde(rename_all = "camelCase")]
    Telnet {
        host: String,
        port: u16,
    },
    #[serde(rename_all = "camelCase")]
    Serial {
        port_name: String,
        baud_rate: u32,
        data_bits: u8,
        stop_bits: u8,
        parity: String,
    },
    /// Local PTY session; handled by `PtyManager`, not `ConnectionManager`.
    /// Present in this enum so the unified `SessionConfig` frontend type can
    /// be deserialized in one shot by the dispatcher command.
    #[serde(rename_all = "camelCase")]
    Local {
        shell: String,
        cwd: Option<String>,
    },
}

#[derive(Debug, Clone, Serialize)]
pub struct PortInfo {
    pub name: String,
    pub port_type: String,
}

// ─── Internal session ────────────────────────────────────────

/// Writer adapter: wraps tokio unbounded sender as std::io::Write.
/// Used for SSH where the channel lives in an async tokio task.
struct TokioMpscWriter(tokio::sync::mpsc::UnboundedSender<Vec<u8>>);

impl Write for TokioMpscWriter {
    fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
        self.0
            .send(buf.to_vec())
            .map_err(|_| std::io::Error::new(std::io::ErrorKind::BrokenPipe, "channel closed"))?;
        Ok(buf.len())
    }
    fn flush(&mut self) -> std::io::Result<()> {
        Ok(())
    }
}

struct ConnectionSession {
    _session_id: String,
    _protocol: String,
    writer: Mutex<Box<dyn Write + Send>>,
    shutdown_flag: Arc<AtomicBool>,
}

// ─── SSH client handler (russh) ──────────────────────────────

struct SshHandler;

impl russh::client::Handler for SshHandler {
    type Error = anyhow::Error;

    fn check_server_key(
        &mut self,
        _server_public_key: &russh::keys::PublicKey,
    ) -> impl std::future::Future<Output = std::result::Result<bool, Self::Error>> + Send {
        async { Ok(true) }
    }
}

// ─── ConnectionManager ──────────────────────────────────────

pub struct ConnectionManager {
    sessions: Arc<RwLock<HashMap<String, ConnectionSession>>>,
    next_ids: Mutex<HashMap<String, AtomicUsize>>,
    app_handle: Arc<RwLock<Option<AppHandle>>>,
    /// Per-session OSC 7701 marker scanners — enables Blocks mode detection
    /// on SSH (and future protocol) sessions by scanning inbound bytes.
    scanners: Arc<std::sync::Mutex<HashMap<String, MarkerScanner>>>,
    /// Per-session OSC 133 stream cleaners (pure Blocks output extractor).
    cleaners: Arc<std::sync::Mutex<HashMap<String, StreamCleaner>>>,
}

impl ConnectionManager {
    pub fn new() -> Self {
        let mut ids = HashMap::new();
        ids.insert("ssh".to_string(), AtomicUsize::new(1));
        ids.insert("telnet".to_string(), AtomicUsize::new(1));
        ids.insert("serial".to_string(), AtomicUsize::new(1));
        Self {
            sessions: Arc::new(RwLock::new(HashMap::new())),
            next_ids: Mutex::new(ids),
            app_handle: Arc::new(RwLock::new(None)),
            scanners: Arc::new(std::sync::Mutex::new(HashMap::new())),
            cleaners: Arc::new(std::sync::Mutex::new(HashMap::new())),
        }
    }

    pub fn set_app_handle(&self, app: AppHandle) {
        *self.app_handle.write().unwrap() = Some(app);
    }

    fn next_session_id(&self, protocol: &str) -> String {
        let ids = self.next_ids.lock().unwrap();
        let counter = ids.get(protocol).expect("unknown protocol");
        let n = counter.fetch_add(1, Ordering::Relaxed);
        format!("{}-{}", protocol, n)
    }

    fn get_app_handle(&self) -> Option<AppHandle> {
        self.app_handle.read().unwrap().clone()
    }

    // ─── Unified connect (async — SSH requires async) ────────

    pub async fn connect(&self, config: ConnectionConfig) -> Result<String> {
        match config {
            ConnectionConfig::Ssh { host, port, username, password } => {
                self.connect_ssh(&host, port, &username, &password).await
            }
            ConnectionConfig::Telnet { host, port } => {
                self.connect_telnet(&host, port)
            }
            ConnectionConfig::Serial { port_name, baud_rate, data_bits, stop_bits, parity } => {
                self.connect_serial(&port_name, baud_rate, data_bits, stop_bits, &parity)
            }
            ConnectionConfig::Local { .. } => {
                anyhow::bail!("Local config must be dispatched to PtyManager, not ConnectionManager")
            }
        }
    }

    // ─── SSH (async, pure Rust via russh) ────────────────────

    async fn connect_ssh(&self, host: &str, port: u16, username: &str, password: &str) -> Result<String> {
        let session_id = self.next_session_id("ssh");
        info!(session_id = %session_id, host = %host, port = %port, "Connecting SSH");

        let config = Arc::new(russh::client::Config {
            ..Default::default()
        });
        let handler = SshHandler;

        let mut handle = russh::client::connect(config, (host, port), handler)
            .await
            .context("SSH connect failed")?;

        let auth_result = handle
            .authenticate_password(username, password)
            .await
            .context("SSH authentication failed")?;

        if !auth_result.success() {
            anyhow::bail!("SSH authentication failed: invalid credentials");
        }

        let channel = handle
            .channel_open_session()
            .await
            .context("Failed to open SSH channel")?;

        channel
            .request_pty(false, "xterm-256color", 80, 24, 0, 0, &[])
            .await
            .context("Failed to request PTY")?;

        channel
            .request_shell(false)
            .await
            .context("Failed to start shell")?;

        let shutdown_flag = Arc::new(AtomicBool::new(false));
        let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<Vec<u8>>();

        let sid = session_id.clone();
        let flag = shutdown_flag.clone();
        let app = self.get_app_handle();

        // Register a MarkerScanner for this session so Blocks mode can detect
        // OSC 7701 markers emitted by wrapped remote commands.
        if let Ok(mut s) = self.scanners.lock() {
            s.insert(session_id.clone(), MarkerScanner::new());
        }
        // Register a StreamCleaner for OSC 133 state machine / line filter.
        if let Ok(mut c) = self.cleaners.lock() {
            c.insert(session_id.clone(), StreamCleaner::new());
        }
        let scanners = Arc::clone(&self.scanners);
        let cleaners = Arc::clone(&self.cleaners);

        // Spawn async reader/writer task
        tokio::spawn(async move {
            let mut channel = channel;
            loop {
                if flag.load(Ordering::Relaxed) {
                    break;
                }

                tokio::select! {
                    msg = channel.wait() => {
                        match msg {
                            Some(russh::ChannelMsg::Data { data }) => {
                                let bytes: &[u8] = &data;
                                if let Some(ref app) = app {
                                    // Scan for OSC 7701 markers on the RAW byte stream first;
                                    // sanitize_output below would strip those markers.
                                    if let Ok(mut guard) = scanners.lock() {
                                        if let Some(scanner) = guard.get_mut(&sid) {
                                            scanner.scan_chunk(bytes, &sid, app);
                                        }
                                    }

                                    // Run StreamCleaner on the RAW stream to produce a pure
                                    // Blocks-only output (prompt + user input echoes stripped).
                                    let block_text = if let Ok(mut guard) = cleaners.lock() {
                                        guard
                                            .get_mut(&sid)
                                            .map(|c| c.process_chunk(bytes))
                                            .unwrap_or_default()
                                    } else {
                                        String::new()
                                    };
                                    if !block_text.is_empty() {
                                        let _ = app.emit("block-output", serde_json::json!({
                                            "session_id": sid,
                                            "data": block_text
                                        }));
                                    }

                                    // Then emit a sanitized pty-output to the frontend so that
                                    // Terminal mode still receives a faithful interactive stream.
                                    let raw = String::from_utf8_lossy(bytes).to_string();
                                    let text = sanitize_output(raw);
                                    let _ = app.emit("pty-output", serde_json::json!({
                                        "session_id": sid,
                                        "data": text
                                    }));
                                }
                            }
                            Some(russh::ChannelMsg::Eof) | None => {
                                if let Some(ref app) = app {
                                    let _ = app.emit("session-ended", serde_json::json!({
                                        "session_id": sid
                                    }));
                                }
                                break;
                            }
                            _ => {}
                        }
                    }
                    Some(data) = rx.recv() => {
                        if channel.data(&data[..]).await.is_err() {
                            break;
                        }
                    }
                }
            }
            let _ = channel.close().await;
            // Keep handle alive so the SSH session doesn't drop
            drop(handle);
        });

        let session = ConnectionSession {
            _session_id: session_id.clone(),
            _protocol: "ssh".to_string(),
            writer: Mutex::new(Box::new(TokioMpscWriter(tx))),
            shutdown_flag,
        };

        self.sessions.write().unwrap().insert(session_id.clone(), session);
        info!(session_id = %session_id, "SSH connected");
        Ok(session_id)
    }

    // ─── Telnet ──────────────────────────────────────────────

    fn connect_telnet(&self, host: &str, port: u16) -> Result<String> {
        let session_id = self.next_session_id("telnet");
        info!(session_id = %session_id, host = %host, port = %port, "Connecting Telnet");

        let stream = TcpStream::connect_timeout(
            &format!("{}:{}", host, port).parse().context("Invalid address")?,
            Duration::from_secs(10),
        ).context("Telnet TCP connect failed")?;

        let reader_stream = stream.try_clone().context("Failed to clone TCP stream")?;
        let writer_stream = stream;

        let shutdown_flag = Arc::new(AtomicBool::new(false));
        let sid = session_id.clone();
        let flag = shutdown_flag.clone();
        let app = self.get_app_handle();

        std::thread::spawn(move || {
            let mut reader = reader_stream;
            reader.set_read_timeout(Some(Duration::from_millis(100))).ok();
            let mut buf = [0u8; 4096];

            loop {
                if flag.load(Ordering::Relaxed) {
                    break;
                }

                match reader.read(&mut buf) {
                    Ok(0) => {
                        if let Some(ref app) = app {
                            let _ = app.emit("session-ended", serde_json::json!({ "session_id": sid }));
                        }
                        break;
                    }
                    Ok(n) => {
                        let chunk = &buf[..n];
                        let (clean_data, responses) = telnet_process_chunk(chunk);

                        for resp in responses {
                            let mut w: &TcpStream = &reader;
                            let _ = w.write_all(&resp);
                        }

                        if !clean_data.is_empty() {
                            if let Some(ref app) = app {
                                let data = String::from_utf8_lossy(&clean_data).to_string();
                                let _ = app.emit("pty-output", serde_json::json!({
                                    "session_id": sid,
                                    "data": data
                                }));
                            }
                        }
                    }
                    Err(ref e) if e.kind() == std::io::ErrorKind::TimedOut
                        || e.kind() == std::io::ErrorKind::WouldBlock => {
                        continue;
                    }
                    Err(e) => {
                        if !flag.load(Ordering::Relaxed) {
                            warn!(session_id = %sid, error = %e, "Telnet read error");
                            if let Some(ref app) = app {
                                let _ = app.emit("session-error", serde_json::json!({
                                    "session_id": sid,
                                    "error": e.to_string()
                                }));
                                let _ = app.emit("session-ended", serde_json::json!({ "session_id": sid }));
                            }
                        }
                        break;
                    }
                }
            }
        });

        let session = ConnectionSession {
            _session_id: session_id.clone(),
            _protocol: "telnet".to_string(),
            writer: Mutex::new(Box::new(writer_stream)),
            shutdown_flag,
        };

        self.sessions.write().unwrap().insert(session_id.clone(), session);
        info!(session_id = %session_id, "Telnet connected");
        Ok(session_id)
    }

    // ─── Serial ──────────────────────────────────────────────

    fn connect_serial(
        &self,
        port_name: &str,
        baud_rate: u32,
        data_bits: u8,
        stop_bits: u8,
        parity: &str,
    ) -> Result<String> {
        let session_id = self.next_session_id("serial");
        info!(session_id = %session_id, port = %port_name, baud = %baud_rate, "Connecting Serial");

        let db = match data_bits {
            5 => serialport::DataBits::Five,
            6 => serialport::DataBits::Six,
            7 => serialport::DataBits::Seven,
            _ => serialport::DataBits::Eight,
        };
        let sb = match stop_bits {
            2 => serialport::StopBits::Two,
            _ => serialport::StopBits::One,
        };
        let p = match parity {
            "odd" => serialport::Parity::Odd,
            "even" => serialport::Parity::Even,
            _ => serialport::Parity::None,
        };

        let port = serialport::new(port_name, baud_rate)
            .data_bits(db)
            .stop_bits(sb)
            .parity(p)
            .timeout(Duration::from_millis(100))
            .open()
            .context("Failed to open serial port")?;

        let reader_port = port.try_clone().context("Failed to clone serial port")?;
        let writer_port = port;

        let shutdown_flag = Arc::new(AtomicBool::new(false));
        let sid = session_id.clone();
        let flag = shutdown_flag.clone();
        let app = self.get_app_handle();

        std::thread::spawn(move || {
            let mut reader = reader_port;
            let mut buf = [0u8; 4096];

            loop {
                if flag.load(Ordering::Relaxed) {
                    break;
                }

                match reader.read(&mut buf) {
                    Ok(0) => {
                        if let Some(ref app) = app {
                            let _ = app.emit("session-ended", serde_json::json!({ "session_id": sid }));
                        }
                        break;
                    }
                    Ok(n) => {
                        if let Some(ref app) = app {
                            let data = String::from_utf8_lossy(&buf[..n]).to_string();
                            let _ = app.emit("pty-output", serde_json::json!({
                                "session_id": sid,
                                "data": data
                            }));
                        }
                    }
                    Err(ref e) if e.kind() == std::io::ErrorKind::TimedOut
                        || e.kind() == std::io::ErrorKind::WouldBlock => {
                        continue;
                    }
                    Err(e) => {
                        if !flag.load(Ordering::Relaxed) {
                            warn!(session_id = %sid, error = %e, "Serial read error");
                            if let Some(ref app) = app {
                                let _ = app.emit("session-error", serde_json::json!({
                                    "session_id": sid,
                                    "error": e.to_string()
                                }));
                                let _ = app.emit("session-ended", serde_json::json!({ "session_id": sid }));
                            }
                        }
                        break;
                    }
                }
            }
        });

        let session = ConnectionSession {
            _session_id: session_id.clone(),
            _protocol: "serial".to_string(),
            writer: Mutex::new(Box::new(writer_port)),
            shutdown_flag,
        };

        self.sessions.write().unwrap().insert(session_id.clone(), session);
        info!(session_id = %session_id, "Serial connected");
        Ok(session_id)
    }

    // ─── Write / Resize / Disconnect ────────────────────────

    pub fn write_input(&self, session_id: &str, data: &[u8]) -> Result<()> {
        // 诊断用：确认前端 invoke→后端只收到 1 次。
        tracing::debug!(
            session_id = %session_id,
            bytes = data.len(),
            "ConnectionManager::write_input"
        );
        let sessions = self.sessions.read().unwrap();
        let session = sessions.get(session_id)
            .ok_or_else(|| anyhow::anyhow!("Connection session not found: {}", session_id))?;
        let mut writer = session.writer.lock().unwrap();
        writer.write_all(data).context("Failed to write to connection")?;
        writer.flush().context("Failed to flush connection writer")?;
        Ok(())
    }

    /// Execute a command in block mode on a remote connection session
    /// (currently only SSH is supported; Telnet / Serial lack shell semantics
    /// required for OSC 7701 wrapping).
    ///
    /// Writes an OSC 7701 wrapped command to the remote shell so the inbound
    /// marker scanner can detect command start/end and emit block-cmd-* events.
    pub fn execute_block_command(&self, session_id: &str, command: &str) -> Result<String> {
        if !session_id.starts_with("ssh-") {
            anyhow::bail!("Blocks mode is only supported for SSH connection sessions");
        }
        let sessions = self.sessions.read().unwrap();
        let session = sessions.get(session_id)
            .ok_or_else(|| anyhow::anyhow!("Connection session not found: {}", session_id))?;

        // Remote shell type is unknown; default to Bash (compatible with zsh /
        // sh via POSIX printf). Fish / csh / Windows remote shells are not
        // supported yet — documented as a known limitation.
        let shell_type = ShellType::Bash;
        let command_id = block::generate_command_id();
        let wrapped = block::wrap_command(shell_type, &command_id, command);

        info!(
            session_id = %session_id,
            command_id = %command_id,
            "ConnectionManager: executing block command"
        );

        let mut writer = session.writer.lock().unwrap();
        writer.write_all(wrapped.as_bytes()).context("Failed to write block command")?;
        writer.flush().context("Failed to flush block command")?;

        Ok(command_id)
    }

    pub fn resize(&self, session_id: &str, _cols: u16, _rows: u16) -> Result<()> {
        let sessions = self.sessions.read().unwrap();
        if !sessions.contains_key(session_id) {
            anyhow::bail!("Connection session not found: {}", session_id);
        }
        Ok(())
    }

    pub fn disconnect(&self, session_id: &str) -> Result<()> {
        let mut sessions = self.sessions.write().unwrap();
        if let Some(session) = sessions.remove(session_id) {
            session.shutdown_flag.store(true, Ordering::Relaxed);
            info!(session_id = %session_id, "Connection disconnected");
        } else {
            warn!(session_id = %session_id, "Disconnect: session not found");
        }
        // Drop the marker scanner for this session (if any)
        if let Ok(mut s) = self.scanners.lock() {
            s.remove(session_id);
        }
        // Drop the stream cleaner for this session (if any)
        if let Ok(mut c) = self.cleaners.lock() {
            c.remove(session_id);
        }
        Ok(())
    }

    pub fn list_serial_ports() -> Vec<PortInfo> {
        match serialport::available_ports() {
            Ok(ports) => ports.iter().map(|p| PortInfo {
                name: p.port_name.clone(),
                port_type: format!("{:?}", p.port_type),
            }).collect(),
            Err(e) => {
                warn!(error = %e, "Failed to list serial ports");
                Vec::new()
            }
        }
    }
}

// ─── Telnet IAC negotiation ──────────────────────────────────

const IAC: u8 = 255;
const DONT: u8 = 254;
const DO: u8 = 253;
const WONT: u8 = 252;
const WILL: u8 = 251;
const SB: u8 = 250;
const SE: u8 = 240;
const OPT_ECHO: u8 = 1;
const OPT_SUPPRESS_GO_AHEAD: u8 = 3;

fn telnet_process_chunk(data: &[u8]) -> (Vec<u8>, Vec<Vec<u8>>) {
    let mut clean = Vec::with_capacity(data.len());
    let mut responses: Vec<Vec<u8>> = Vec::new();
    let mut i = 0;

    while i < data.len() {
        if data[i] == IAC && i + 1 < data.len() {
            match data[i + 1] {
                DO if i + 2 < data.len() => {
                    let opt = data[i + 2];
                    if opt == OPT_ECHO || opt == OPT_SUPPRESS_GO_AHEAD {
                        responses.push(vec![IAC, WILL, opt]);
                    } else {
                        responses.push(vec![IAC, WONT, opt]);
                    }
                    i += 3;
                }
                DONT if i + 2 < data.len() => {
                    let opt = data[i + 2];
                    responses.push(vec![IAC, WONT, opt]);
                    i += 3;
                }
                WILL if i + 2 < data.len() => {
                    let opt = data[i + 2];
                    if opt == OPT_ECHO || opt == OPT_SUPPRESS_GO_AHEAD {
                        responses.push(vec![IAC, DO, opt]);
                    } else {
                        responses.push(vec![IAC, DONT, opt]);
                    }
                    i += 3;
                }
                WONT if i + 2 < data.len() => {
                    let opt = data[i + 2];
                    responses.push(vec![IAC, DONT, opt]);
                    i += 3;
                }
                SB => {
                    i += 2;
                    while i + 1 < data.len() {
                        if data[i] == IAC && data[i + 1] == SE {
                            i += 2;
                            break;
                        }
                        i += 1;
                    }
                }
                IAC => {
                    clean.push(255);
                    i += 2;
                }
                _ => {
                    i += 2;
                }
            }
        } else {
            clean.push(data[i]);
            i += 1;
        }
    }

    (clean, responses)
}

// ─── Tests ───────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_session_id_format() {
        let mgr = ConnectionManager::new();
        let id1 = mgr.next_session_id("ssh");
        let id2 = mgr.next_session_id("ssh");
        let id3 = mgr.next_session_id("telnet");
        assert!(id1.starts_with("ssh-"));
        assert!(id2.starts_with("ssh-"));
        assert!(id3.starts_with("telnet-"));
        assert_ne!(id1, id2);
    }

    #[test]
    fn test_list_serial_ports_no_panic() {
        let ports = ConnectionManager::list_serial_ports();
        let _ = ports.len();
    }

    #[test]
    fn test_telnet_iac_negotiation() {
        let data = vec![IAC, DO, OPT_ECHO, b'H', b'i'];
        let (clean, responses) = telnet_process_chunk(&data);
        assert_eq!(clean, b"Hi");
        assert_eq!(responses.len(), 1);
        assert_eq!(responses[0], vec![IAC, WILL, OPT_ECHO]);
    }

    #[test]
    fn test_telnet_iac_refuse_unknown() {
        let data = vec![IAC, DO, 99, b'O', b'K'];
        let (clean, responses) = telnet_process_chunk(&data);
        assert_eq!(clean, b"OK");
        assert_eq!(responses[0], vec![IAC, WONT, 99]);
    }

    #[test]
    fn test_telnet_clean_data_passthrough() {
        let data = b"Hello World\r\n";
        let (clean, responses) = telnet_process_chunk(data);
        assert_eq!(clean, data.to_vec());
        assert!(responses.is_empty());
    }

    #[test]
    fn test_connection_config_serde() {
        let config = ConnectionConfig::Ssh {
            host: "example.com".to_string(),
            port: 22,
            username: "user".to_string(),
            password: "pass".to_string(),
        };
        let json = serde_json::to_string(&config).unwrap();
        assert!(json.contains("\"protocol\":\"ssh\""));

        let parsed: ConnectionConfig = serde_json::from_str(&json).unwrap();
        match parsed {
            ConnectionConfig::Ssh { host, port, .. } => {
                assert_eq!(host, "example.com");
                assert_eq!(port, 22);
            }
            _ => panic!("expected SSH config"),
        }
    }

    #[test]
    fn test_tokio_mpsc_writer() {
        let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<Vec<u8>>();
        let mut writer = TokioMpscWriter(tx);
        let n = writer.write(b"hello").unwrap();
        assert_eq!(n, 5);
        writer.flush().unwrap();
        let received = rx.try_recv().unwrap();
        assert_eq!(received, b"hello");
    }

    #[tokio::test]
    async fn test_ssh_connect_invalid_host() {
        let mgr = ConnectionManager::new();
        let result = mgr.connect(ConnectionConfig::Ssh {
            host: "192.0.2.1".to_string(),
            port: 22,
            username: "test".to_string(),
            password: "test".to_string(),
        }).await;
        assert!(result.is_err());
    }
}

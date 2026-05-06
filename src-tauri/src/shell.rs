use anyhow::{Context, Result};
use parking_lot::RwLock;
use portable_pty::{
    ChildKiller, CommandBuilder, MasterPty, PtySize, PtySystem, NativePtySystem,
};
use std::{
    collections::HashMap,
    io::Write,
    sync::{
        atomic::{AtomicUsize, Ordering},
        Arc, Mutex,
    },
};
use tauri::{AppHandle, Emitter};
use tracing::{error, info, warn};

use crate::block::{self, MarkerScanner, ShellType};
use crate::output_sanitizer::sanitize_output;
use crate::stream_cleaner::StreamCleaner;

/// Wrapper to make non-Send/Sync PTY types safe behind a lock.
/// Safety: All access to inner values is guarded by RwLock on the sessions HashMap.
struct SendSync<T>(T);
unsafe impl<T> Send for SendSync<T> {}
unsafe impl<T> Sync for SendSync<T> {}

/// Terminal session holding a PTY instance
pub struct TerminalSession {
    pub session_id: String,
    pub shell: String,
    pub cwd: String,
    master: SendSync<Box<dyn MasterPty>>,
    writer: Mutex<Box<dyn Write + Send>>,
    child_killer: Mutex<Box<dyn ChildKiller + Send + Sync>>,
}

/// PTY Manager manages multiple terminal sessions
pub struct PtyManager {
    sessions: Arc<RwLock<HashMap<String, TerminalSession>>>,
    next_id: AtomicUsize,
    app_handle: Arc<RwLock<Option<AppHandle>>>,
    /// Per-session marker scanners for block command detection
    scanners: Arc<std::sync::Mutex<HashMap<String, MarkerScanner>>>,
    /// Per-session OSC 133 stream cleaners (pure Blocks output extractor)
    cleaners: Arc<std::sync::Mutex<HashMap<String, StreamCleaner>>>,
}

impl PtyManager {
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(RwLock::new(HashMap::new())),
            next_id: AtomicUsize::new(1),
            app_handle: Arc::new(RwLock::new(None)),
            scanners: Arc::new(std::sync::Mutex::new(HashMap::new())),
            cleaners: Arc::new(std::sync::Mutex::new(HashMap::new())),
        }
    }

    /// Set app handle for event emission
    pub fn set_app_handle(&self, app: AppHandle) {
        let mut handle = self.app_handle.write();
        *handle = Some(app);
    }

    /// Create a new PTY session
    pub fn create_session(&self, shell: Option<String>, cwd: Option<String>) -> Result<String> {
        let pty_system: Box<dyn PtySystem> = Box::new(NativePtySystem::default());

        let shell_path = shell.unwrap_or_else(|| Self::default_shell());
        let working_dir = cwd.unwrap_or_else(|| Self::default_cwd());

        let mut cmd = CommandBuilder::new(&shell_path);
        cmd.cwd(&working_dir);

        #[cfg(not(target_os = "windows"))]
        {
            cmd.arg("-l");
        }

        let pair = pty_system
            .openpty(PtySize {
                rows: 24,
                cols: 80,
                pixel_width: 0,
                pixel_height: 0,
            })
            .context("Failed to open PTY")?;

        let child = pair
            .slave
            .spawn_command(cmd)
            .context("Failed to spawn shell")?;

        let session_id = format!("session-{}", self.next_id.fetch_add(1, Ordering::SeqCst));
        let reader = pair.master.try_clone_reader()?;
        let writer = pair.master.take_writer()?;

        info!("Created session {} with shell: {}", session_id, shell_path);

        // Initialize a marker scanner for this session
        if let Ok(mut scanners) = self.scanners.lock() {
            scanners.insert(session_id.clone(), MarkerScanner::new());
        }
        // Initialize a stream cleaner for this session (OSC 133 state machine)
        if let Ok(mut cleaners) = self.cleaners.lock() {
            cleaners.insert(session_id.clone(), StreamCleaner::new());
        }

        // Spawn reader task to continuously read PTY output
        if let Some(app) = self.app_handle.read().clone() {
            let sid = session_id.clone();
            let scanners = Arc::clone(&self.scanners);
            let cleaners = Arc::clone(&self.cleaners);
            std::thread::spawn(move || {
                Self::read_pty_output(reader, &sid, &app, scanners, cleaners);
            });
        }

        let session = TerminalSession {
            session_id: session_id.clone(),
            shell: shell_path.clone(),
            cwd: working_dir.clone(),
            master: SendSync(pair.master),
            writer: Mutex::new(writer),
            child_killer: Mutex::new(child),
        };

        self.sessions
            .write()
            .insert(session_id.clone(), session);

        // Emit session created event
        if let Some(app) = self.app_handle.read().clone() {
            let _ = app.emit("session-created", &serde_json::json!({
                "session_id": session_id,
                "shell": shell_path,
                "cwd": working_dir,
            }));
        }

        Ok(session_id)
    }

    /// Write input to PTY
    pub fn write_input(&self, session_id: &str, data: &[u8]) -> Result<()> {
        // 诊断用：确认"每次前端 invoke 后端只收到 1 次"——排除后端双写嫌疑。
        tracing::debug!(
            session_id = %session_id,
            bytes = data.len(),
            "PtyManager::write_input"
        );
        let sessions = self.sessions.read();
        if let Some(session) = sessions.get(session_id) {
            let mut writer = session.writer.lock()
                .map_err(|e| anyhow::anyhow!("Writer lock poisoned: {}", e))?;
            writer.write_all(data)?;
            writer.flush()?;
            Ok(())
        } else {
            Err(anyhow::anyhow!("Session not found: {}", session_id))
        }
    }

    /// Resize PTY terminal
    pub fn resize(&self, session_id: &str, cols: u16, rows: u16) -> Result<()> {
        let sessions = self.sessions.read();
        if let Some(session) = sessions.get(session_id) {
            session.master.0.resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })?;
            info!("Resized session {} to {}x{}", session_id, cols, rows);
            Ok(())
        } else {
            Err(anyhow::anyhow!("Session not found: {}", session_id))
        }
    }

    /// Destroy a PTY session
    pub fn destroy_session(&self, session_id: &str) -> Result<()> {
        // Remove the marker scanner
        if let Ok(mut scanners) = self.scanners.lock() {
            scanners.remove(session_id);
        }
        // Remove the stream cleaner
        if let Ok(mut cleaners) = self.cleaners.lock() {
            cleaners.remove(session_id);
        }

        let mut sessions = self.sessions.write();
        if let Some(session) = sessions.remove(session_id) {
            let mut killer = session.child_killer.lock()
                .map_err(|e| anyhow::anyhow!("Killer lock poisoned: {}", e))?;
            if let Err(e) = killer.kill() {
                warn!("Failed to kill child process: {}", e);
            }
            info!("Destroyed session: {}", session_id);
        }
        Ok(())
    }

    /// Execute a command in block mode: wraps user command with OSC 7701 markers,
    /// writes it to the PTY, and returns the generated command_id.
    pub fn execute_block_command(&self, session_id: &str, command: &str) -> Result<String> {
        let sessions = self.sessions.read();
        let session = sessions
            .get(session_id)
            .ok_or_else(|| anyhow::anyhow!("Session not found: {}", session_id))?;

        let shell_type = ShellType::from_path(&session.shell);
        let command_id = block::generate_command_id();
        let wrapped = block::wrap_command(shell_type, &command_id, command);

        info!(
            "Executing block command: session={} cmd_id={} shell={:?}",
            session_id, command_id, shell_type
        );

        let mut writer = session
            .writer
            .lock()
            .map_err(|e| anyhow::anyhow!("Writer lock poisoned: {}", e))?;
        writer.write_all(wrapped.as_bytes())?;
        writer.flush()?;

        Ok(command_id)
    }

    /// Read PTY output and emit events to frontend.
    /// Also scans for OSC 7701 markers and emits block-cmd-* events.
    fn read_pty_output<R: std::io::Read + Send + 'static>(
        mut reader: R,
        session_id: &str,
        app: &AppHandle,
        scanners: Arc<std::sync::Mutex<HashMap<String, MarkerScanner>>>,
        cleaners: Arc<std::sync::Mutex<HashMap<String, StreamCleaner>>>,
    ) {
        let session_id = session_id.to_string();
        let app = app.clone();

        let mut buffer = [0u8; 4096];
        loop {
            match reader.read(&mut buffer) {
                Ok(0) => {
                    info!("PTY EOF for session: {}", session_id);
                    let _ = app.emit("session-ended", &serde_json::json!({
                        "session_id": session_id
                    }));
                    break;
                }
                Ok(n) => {
                    let chunk = &buffer[..n];

                    // 1. Scan raw bytes for OSC 7701 markers BEFORE sanitization.
                    //    sanitize_output would strip those markers away, so scanner must see
                    //    the original stream to emit block-cmd-started / block-cmd-completed.
                    if let Ok(mut scanners) = scanners.lock() {
                        if let Some(scanner) = scanners.get_mut(&session_id) {
                            scanner.scan_chunk(chunk, &session_id, &app);
                        }
                    }

                    // 2. Run StreamCleaner (OSC 133 state machine / line-filter fallback)
                    //    on the RAW chunk to produce the pure Blocks stream.
                    let block_text = if let Ok(mut guard) = cleaners.lock() {
                        guard
                            .get_mut(&session_id)
                            .map(|c| c.process_chunk(chunk))
                            .unwrap_or_default()
                    } else {
                        String::new()
                    };
                    if !block_text.is_empty() {
                        let _ = app.emit("block-output", &serde_json::json!({
                            "session_id": session_id,
                            "data": block_text
                        }));
                    }

                    // 3. Sanitize Warp integration noise (DECSET/DECRST + OSC 7701/133 +
                    //    printf / __ls_rc helper-line echoes) before emitting to the frontend.
                    //    This stream still contains prompts + user input echoes, which is
                    //    required for xterm.js Terminal mode to render a faithful session.
                    let raw = String::from_utf8_lossy(chunk).to_string();
                    let data = sanitize_output(raw);
                    let _ = app.emit("pty-output", &serde_json::json!({
                        "session_id": session_id,
                        "data": data
                    }));
                }
                Err(e) => {
                    error!("Error reading PTY output: {}", e);
                    let _ = app.emit("session-error", &serde_json::json!({
                        "session_id": session_id,
                        "error": e.to_string()
                    }));
                    break;
                }
            }
        }
    }

    /// Get default shell for current platform
    fn default_shell() -> String {
        #[cfg(target_os = "windows")]
        {
            if let Ok(path) = std::env::var("POWERSHELL_PATH") {
                return path;
            }
            "pwsh".to_string()
        }

        #[cfg(target_os = "macos")]
        {
            "/bin/zsh".to_string()
        }

        #[cfg(target_os = "linux")]
        {
            "/bin/bash".to_string()
        }

        #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
        {
            "/bin/sh".to_string()
        }
    }

    /// Get default working directory
    fn default_cwd() -> String {
        std::env::current_dir()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string()
    }
}

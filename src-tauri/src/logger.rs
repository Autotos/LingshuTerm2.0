//! Terminal session log persistence with rotation.
//!
//! Directory layout:
//!   {Log Path}/{Session Name}/{Terminal Name}.log
//!
//! Rotation: when a log file exceeds `max_size_mb`, it is renamed to
//!   {Terminal Name}_{YYYYMMDD_HHmmss}.log and a new empty file is created.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;

use regex::Regex;
use serde::Serialize;
use tauri::AppHandle;
use tokio::fs::{self, OpenOptions};
use tokio::io::AsyncWriteExt;

use crate::utils::workspace_dir;

/// Per-file buffer of partial lines that haven't ended with \n yet.
static LINE_BUFFERS: std::sync::LazyLock<Mutex<HashMap<String, String>>> =
    std::sync::LazyLock::new(|| Mutex::new(HashMap::new()));

/// Generate a display timestamp: `[YYYY-MM-DD HH:mm:ss]`
fn log_timestamp() -> String {
    use std::time::SystemTime;
    let dur = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default();
    let secs = dur.as_secs();
    let days = secs / 86400;
    let mut y = 1970i64;
    let mut remaining = days as i64;
    loop {
        let diy = if (y % 4 == 0 && y % 100 != 0) || y % 400 == 0 { 366 } else { 365 };
        if remaining < diy { break; }
        remaining -= diy;
        y += 1;
    }
    let leap = (y % 4 == 0 && y % 100 != 0) || y % 400 == 0;
    let md = [31, if leap { 29 } else { 28 }, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    let mut m = 1i64;
    for &d in &md { if remaining < d { break; } remaining -= d; m += 1; }
    let d = remaining + 1;
    let ts = secs % 86400;
    let h = ts / 3600;
    let min = (ts % 3600) / 60;
    let s = ts % 60;
    format!("[{:04}-{:02}-{:02} {:02}:{:02}:{:02}]", y, m, d, h, min, s)
}

/// Strip ANSI escape sequences (SGR colors, OSC codes, CSI sequences) from log data.
fn strip_ansi(data: &str) -> String {
    // CSI sequences: ESC [ ...  (e.g. ESC[01;32m for color, ESC[?2004h for bracketed paste)
    let re_csi = Regex::new(r"\x1b\[[0-9;?]*[A-Za-z]").unwrap();
    // OSC sequences: ESC ] ... BEL (0x07) or ESC ] ... ESC \ (ST)
    let re_osc = Regex::new(r"\x1b\][^\x07\x1b]*(\x07|\x1b\\)").unwrap();
    let s = re_csi.replace_all(data, "").into_owned();
    re_osc.replace_all(&s, "").into_owned()
}

fn default_log_path() -> Result<PathBuf, String> {
    workspace_dir().map(|d| d.join("logs"))
}

fn timestamp() -> String {
    use std::time::SystemTime;
    let dur = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default();
    let secs = dur.as_secs();
    // Manual YYYYMMDD_HHmmss from Unix seconds
    let days = secs / 86400;
    // days since 1970-01-01 → approximate year/month/day
    let mut y = 1970i64;
    let mut remaining = days as i64;
    loop {
        let days_in_year = if (y % 4 == 0 && y % 100 != 0) || y % 400 == 0 { 366 } else { 365 };
        if remaining < days_in_year { break; }
        remaining -= days_in_year;
        y += 1;
    }
    let leap = (y % 4 == 0 && y % 100 != 0) || y % 400 == 0;
    let month_days: [i64; 12] = [
        31, if leap { 29 } else { 28 }, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31,
    ];
    let mut m = 1i64;
    for &md in &month_days {
        if remaining < md { break; }
        remaining -= md;
        m += 1;
    }
    let d = remaining + 1;
    let time_secs = (secs % 86400) as i64;
    let hh = time_secs / 3600;
    let mm = (time_secs % 3600) / 60;
    let ss = time_secs % 60;
    format!("{:04}{:02}{:02}_{:02}{:02}{:02}", y, m, d, hh, mm, ss)
}

/// Sanitize a path component by replacing characters invalid on common filesystems.
fn sanitize_filename(name: &str) -> String {
    name.chars()
        .map(|c| match c {
            ':' | '/' | '\\' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            _ => c,
        })
        .collect()
}

/// Append data to a session terminal log file, rotating if needed.
#[tauri::command]
pub async fn write_log(
    _app: AppHandle,
    log_path: String,
    session_name: String,
    terminal_name: String,
    data: String,
    max_size_mb: u64,
) -> Result<(), String> {
    // Strip ANSI escapes; keep newlines so the log mirrors the terminal.
    let cleaned = strip_ansi(&data);
    let trimmed = cleaned.replace("\r", "");

    let base = if log_path.is_empty() {
        default_log_path()?
    } else {
        PathBuf::from(&log_path)
    };

    let session_dir = sanitize_filename(&session_name);
    let term_file = sanitize_filename(&terminal_name);
    let dir = base.join(&session_dir);
    fs::create_dir_all(&dir)
        .await
        .map_err(|e| format!("create log dir: {}", e))?;

    let file_path = dir.join(format!("{}.log", &term_file));

    // Rotation check
    let max_bytes = max_size_mb * 1024 * 1024;
    if let Ok(meta) = fs::metadata(&file_path).await {
        if meta.len() >= max_bytes {
            let ts = timestamp();
            let rotated = dir.join(format!("{}_{}.log", &terminal_name, ts));
            fs::rename(&file_path, &rotated)
                .await
                .map_err(|e| format!("rotate log: {}", e))?;
        }
    }

    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&file_path)
        .await
        .map_err(|e| format!("open log file: {}", e))?;

    // Buffer partial lines: only write complete lines with a single timestamp.
    // Individual keystroke echoes (e.g. 'l', 's') are buffered until Enter (\n) arrives.
    let output = {
        let mut buffers = LINE_BUFFERS.lock().unwrap();
        let buf = buffers.entry(file_path.to_string_lossy().to_string()).or_default();
        buf.push_str(&trimmed);

        if trimmed.is_empty() || !buf.contains('\n') {
            return Ok(());
        }

        let mut out = String::new();
        while let Some(pos) = buf.find('\n') {
            let line = buf[..=pos].trim_end_matches(['\r', '\n']).to_string();
            buf.drain(..=pos);
            if !line.is_empty() {
                out.push_str(&format!("{} {}\n", log_timestamp(), line));
            } else {
                out.push('\n');
            }
        }
        out
    }; // MutexGuard dropped here, before .await

    if !output.is_empty() {
        file.write_all(output.as_bytes())
            .await
            .map_err(|e| format!("write log: {}", e))?;
    }

    file.flush()
        .await
        .map_err(|e| format!("flush log: {}", e))?;

    Ok(())
}

#[derive(Debug, Clone, Serialize)]
pub struct LogEntry {
    pub name: String,
    pub path: String,
    pub size: u64,
    pub is_rotated: bool,
}

/// List log files for a session directory.
#[tauri::command]
pub async fn list_logs(
    _app: AppHandle,
    log_path: String,
    session_name: String,
) -> Result<Vec<LogEntry>, String> {
    let base = if log_path.is_empty() {
        default_log_path()?
    } else {
        PathBuf::from(&log_path)
    };

    let dir = base.join(&sanitize_filename(&session_name));
    if !fs::try_exists(&dir).await.unwrap_or(false) {
        return Ok(Vec::new());
    }

    let mut rd = fs::read_dir(&dir)
        .await
        .map_err(|e| format!("read log dir: {}", e))?;

    let mut entries = Vec::new();
    while let Some(entry) = rd
        .next_entry()
        .await
        .map_err(|e| format!("iterate log dir: {}", e))?
    {
        let ft = match entry.file_type().await {
            Ok(t) => t,
            Err(_) => continue,
        };
        if !ft.is_file() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        if !name.ends_with(".log") {
            continue;
        }
        let path = entry.path().to_string_lossy().to_string();
        let size = match fs::metadata(&entry.path()).await {
            Ok(m) => m.len(),
            Err(_) => 0,
        };
        // A rotated file has a timestamp suffix: `name_YYYYMMDD_HHmmss.log`
        let is_rotated = name.contains('_') && name[..name.len() - 4].contains('_');
        entries.push(LogEntry {
            name,
            path,
            size,
            is_rotated,
        });
    }

    entries.sort_by(|a, b| b.name.cmp(&a.name));
    Ok(entries)
}

/// Read the full content of a log file.
#[tauri::command]
pub async fn read_log_file(
    _app: AppHandle,
    path: String,
) -> Result<String, String> {
    fs::read_to_string(&path)
        .await
        .map_err(|e| format!("read log file {}: {}", path, e))
}

/// Open a file or directory in the system file explorer.
#[tauri::command]
pub async fn open_in_explorer(
    _app: AppHandle,
    path: String,
) -> Result<(), String> {
    let p = PathBuf::from(&path);
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(if p.is_dir() { &p } else { p.parent().unwrap_or(&p) })
            .spawn()
            .map_err(|e| format!("open explorer: {}", e))?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(if p.is_dir() { "-R" } else { "-R" })
            .arg(&p)
            .spawn()
            .map_err(|e| format!("open finder: {}", e))?;
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(if p.is_dir() { &p } else { p.parent().unwrap_or(&p) })
            .spawn()
            .map_err(|e| format!("open file manager: {}", e))?;
    }
    Ok(())
}

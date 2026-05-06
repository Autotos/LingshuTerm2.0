use serde::Serialize;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter};
use tracing::{debug, warn};

// ---------------------------------------------------------------------------
// ShellType
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ShellType {
    Bash,
    Zsh,
    PowerShell,
    Sh,
    Unknown,
}

impl ShellType {
    /// Detect shell type from the executable path / name.
    pub fn from_path(shell: &str) -> Self {
        let lower = shell.to_ascii_lowercase();
        // Check the basename (handle both `/usr/bin/zsh` and plain `zsh`)
        let base = lower.rsplit(&['/', '\\'][..]).next().unwrap_or(&lower);
        if base.starts_with("bash") {
            ShellType::Bash
        } else if base.starts_with("zsh") {
            ShellType::Zsh
        } else if base.starts_with("pwsh") || base.starts_with("powershell") {
            ShellType::PowerShell
        } else if base == "sh" || base == "sh.exe" {
            ShellType::Sh
        } else {
            ShellType::Unknown
        }
    }
}

// ---------------------------------------------------------------------------
// Command wrapping – embeds OSC 7701 markers around a user command
// ---------------------------------------------------------------------------

/// Build a shell-specific string that:
///   1. Emits  `\x1b]7701;S;<id>\x07`  (start marker)
///   2. Runs   the user command
///   3. Emits  `\x1b]7701;E;<id>;<exit_code>\x07`  (end marker)
pub fn wrap_command(shell_type: ShellType, command_id: &str, user_command: &str) -> String {
    match shell_type {
        ShellType::PowerShell => {
            // PowerShell: use [Console]::Write to emit raw bytes.
            // $LASTEXITCODE is set by native commands; $? covers cmdlet failures.
            format!(
                "[Console]::Write([char]27 + ']7701;S;{id}' + [char]7); \
                 {cmd}; \
                 $__ls_rc = $(if ($?) {{ if ($LASTEXITCODE -ne $null) {{ $LASTEXITCODE }} else {{ 0 }} }} else {{ 1 }}); \
                 [Console]::Write([char]27 + ']7701;E;{id};' + $__ls_rc + [char]7)\r\n",
                id = command_id,
                cmd = user_command,
            )
        }
        ShellType::Bash | ShellType::Zsh | ShellType::Sh | ShellType::Unknown => {
            // POSIX shells: printf is the most portable way to emit arbitrary bytes.
            format!(
                "printf '\\033]7701;S;{id}\\007'\n\
                 {cmd}\n\
                 __ls_rc=$?\n\
                 printf '\\033]7701;E;{id};%d\\007' \"$__ls_rc\"\n",
                id = command_id,
                cmd = user_command,
            )
        }
    }
}

// ---------------------------------------------------------------------------
// Command ID generation
// ---------------------------------------------------------------------------

static BLOCK_COUNTER: AtomicUsize = AtomicUsize::new(1);

pub fn generate_command_id() -> String {
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let seq = BLOCK_COUNTER.fetch_add(1, Ordering::Relaxed);
    format!("blk-{}-{}", ts, seq)
}

// ---------------------------------------------------------------------------
// Event payloads
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize)]
pub struct BlockCmdStartedPayload {
    pub session_id: String,
    pub command_id: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct BlockCmdOutputPayload {
    pub session_id: String,
    pub command_id: String,
    pub data: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct BlockCmdCompletedPayload {
    pub session_id: String,
    pub command_id: String,
    pub exit_code: i32,
}

// ---------------------------------------------------------------------------
// MarkerScanner – detects OSC 7701 markers inside raw PTY output chunks
// ---------------------------------------------------------------------------

/// OSC 7701 protocol prefix bytes: ESC ] 7 7 0 1 ;
const OSC_PREFIX: &[u8] = b"\x1b]7701;";
const OSC_TERMINATOR: u8 = 0x07; // BEL

pub struct MarkerScanner {
    /// Bytes carried over from a previous chunk where a partial OSC was detected
    leftover: Vec<u8>,
}

impl MarkerScanner {
    pub fn new() -> Self {
        Self {
            leftover: Vec::new(),
        }
    }

    /// Scan a raw PTY output chunk for OSC 7701 markers.
    ///
    /// For every marker found the corresponding Tauri event is emitted.
    /// Data *between* a start marker and end marker is emitted as
    /// `block-cmd-output`.  The raw `pty-output` event is emitted
    /// separately by the caller (unchanged), so xterm.js keeps working.
    pub fn scan_chunk(&mut self, chunk: &[u8], session_id: &str, app: &AppHandle) {
        // Prepend any leftover bytes from the previous call
        let data = if self.leftover.is_empty() {
            chunk.to_vec()
        } else {
            let mut combined = std::mem::take(&mut self.leftover);
            combined.extend_from_slice(chunk);
            combined
        };

        let mut pos = 0;
        while pos < data.len() {
            // Look for ESC (0x1b) which may start an OSC sequence
            if let Some(offset) = memchr_esc(&data[pos..]) {
                let esc_pos = pos + offset;

                // Emit any non-marker data before this ESC as block output
                // (only if we are currently tracking a command – handled by frontend)

                // Check if we have enough bytes for the prefix
                let remaining = &data[esc_pos..];
                if remaining.len() < OSC_PREFIX.len() {
                    // Partial prefix at end of chunk – save as leftover
                    self.leftover = remaining.to_vec();
                    return;
                }

                if remaining.starts_with(OSC_PREFIX) {
                    // Look for the BEL terminator
                    let payload_start = esc_pos + OSC_PREFIX.len();
                    if let Some(bel_offset) = find_byte(&data[payload_start..], OSC_TERMINATOR) {
                        let bel_pos = payload_start + bel_offset;
                        let payload = &data[payload_start..bel_pos];
                        let payload_str = String::from_utf8_lossy(payload);

                        self.handle_marker(&payload_str, session_id, app);

                        pos = bel_pos + 1; // skip past BEL
                        continue;
                    } else {
                        // BEL not found – partial marker at chunk end
                        self.leftover = remaining.to_vec();
                        return;
                    }
                } else {
                    // ESC but not our OSC – skip past it
                    pos = esc_pos + 1;
                    continue;
                }
            } else {
                // No more ESC bytes in the remaining data
                break;
            }
        }
        // Any leftover is empty at this point
    }

    /// Interpret the payload between `\x1b]7701;` and `\x07`.
    fn handle_marker(&self, payload: &str, session_id: &str, app: &AppHandle) {
        // Expected formats:
        //   S;{command_id}
        //   E;{command_id};{exit_code}
        let parts: Vec<&str> = payload.splitn(3, ';').collect();
        match parts.as_slice() {
            ["S", command_id] => {
                debug!("Block start marker: session={} cmd={}", session_id, command_id);
                let _ = app.emit(
                    "block-cmd-started",
                    BlockCmdStartedPayload {
                        session_id: session_id.to_string(),
                        command_id: command_id.to_string(),
                    },
                );
            }
            ["E", command_id, exit_code_str] => {
                let exit_code = exit_code_str.trim().parse::<i32>().unwrap_or(-1);
                debug!(
                    "Block end marker: session={} cmd={} exit={}",
                    session_id, command_id, exit_code
                );
                let _ = app.emit(
                    "block-cmd-completed",
                    BlockCmdCompletedPayload {
                        session_id: session_id.to_string(),
                        command_id: command_id.to_string(),
                        exit_code,
                    },
                );
            }
            _ => {
                warn!("Unknown OSC 7701 payload: {}", payload);
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Helper: find first occurrence of ESC (0x1b) in a byte slice
// ---------------------------------------------------------------------------

fn memchr_esc(haystack: &[u8]) -> Option<usize> {
    haystack.iter().position(|&b| b == 0x1b)
}

fn find_byte(haystack: &[u8], needle: u8) -> Option<usize> {
    haystack.iter().position(|&b| b == needle)
}

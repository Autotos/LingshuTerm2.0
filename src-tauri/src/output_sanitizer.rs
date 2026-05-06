//! 输出清洗器：把 Warp 集成脚本注入的控制序列 / 辅助命令回显从 PTY 输出里剥掉。
//!
//! 设计原则：
//! * 只动"垃圾"；不动 SGR（`\x1b[...m`）等正常颜色与格式序列；
//! * 逐事件输入流水线调用，必须轻量，因此所有正则都用 `OnceLock` 缓存；
//! * 不破坏 OSC 7701 协议链路 —— 调用方（`shell.rs` / `connection.rs`）必须先把
//!   原始字节交给 `MarkerScanner` 扫描，再把 UTF-8 文本传入本模块清洗。
//!
//! 清洗内容：
//! 1. ANSI 模式切换：`\x1b[?2004h`、`\x1b[?2004l`（bracketed-paste 开关）；
//! 2. Warp OSC 序列：`\x1b]7701;...\x07` 与 `\x1b]133;...\x07`；
//! 3. Shell 辅助命令回显：包含 `printf ... 7701` 的行、以 `__ls_rc=`/`$__ls_rc` 起头的行。
//!
//! 以上均为"可以安全丢弃"的流量 —— Blocks 模式需要它们被消除，Terminal 模式也不
//! 依赖它们做视觉渲染。

use regex::Regex;
use std::sync::OnceLock;

// ---------------------------------------------------------------------------
// Regex 缓存
// ---------------------------------------------------------------------------

/// `\x1b[?2004h` / `\x1b[?2004l` —— bracketed-paste DECSET/DECRST。
fn re_bracketed_paste() -> &'static Regex {
    static R: OnceLock<Regex> = OnceLock::new();
    R.get_or_init(|| Regex::new(r"\x1b\[\?2004[hl]").expect("bracketed-paste regex"))
}

/// `\x1b]7701;<payload>\x07` —— Warp 自定义状态 OSC。
fn re_osc_7701() -> &'static Regex {
    static R: OnceLock<Regex> = OnceLock::new();
    R.get_or_init(|| Regex::new(r"\x1b\]7701;[^\x07]*\x07").expect("osc 7701 regex"))
}

/// `\x1b]133;<payload>\x07` —— Warp/iTerm2 Prompt 标记。
fn re_osc_133() -> &'static Regex {
    static R: OnceLock<Regex> = OnceLock::new();
    R.get_or_init(|| Regex::new(r"\x1b\]133;[^\x07]*\x07").expect("osc 133 regex"))
}

/// 含 `printf ... 7701` 的整行（shell 把我们注入的辅助命令回显出来的形式）。
/// 使用 `(?m)` 让 `^` / `$` 作用于每一行。
fn re_printf_7701_line() -> &'static Regex {
    static R: OnceLock<Regex> = OnceLock::new();
    R.get_or_init(|| {
        Regex::new(r"(?m)^.*printf[^\n]*7701[^\n]*\r?\n?")
            .expect("printf 7701 line regex")
    })
}

/// 以 `__ls_rc=` 或 `$__ls_rc =` 起头的整行（POSIX / PowerShell 变量赋值回显）。
fn re_ls_rc_line() -> &'static Regex {
    static R: OnceLock<Regex> = OnceLock::new();
    R.get_or_init(|| {
        Regex::new(r"(?m)^[ \t]*\$?__ls_rc[ \t]*=.*?\r?\n?")
            .expect("__ls_rc line regex")
    })
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/// 对一段 UTF-8 文本执行所有清洗规则，返回清洗后的新字符串。
///
/// 调用约定：
/// * 入参通常是 `String::from_utf8_lossy(chunk).to_string()`；
/// * 调用前请确保原始 `chunk` 已经被 `MarkerScanner::scan_chunk` 扫描过，
///   否则会丢失 OSC 7701 协议事件；
/// * 该函数幂等 —— 对一段已经清洗过的文本再次调用结果不变。
pub fn sanitize_output(raw_output: String) -> String {
    // 1) 先剥 OSC（BEL 结尾的复杂结构），否则一旦误分行会污染后续行级规则
    let s = re_osc_7701().replace_all(&raw_output, "").into_owned();
    let s = re_osc_133().replace_all(&s, "").into_owned();

    // 2) DECSET/DECRST（bracketed paste）
    let s = re_bracketed_paste().replace_all(&s, "").into_owned();

    // 3) 辅助命令回显（逐行）
    let s = re_printf_7701_line().replace_all(&s, "").into_owned();
    let s = re_ls_rc_line().replace_all(&s, "").into_owned();

    s
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn removes_bracketed_paste_mode() {
        let input = "hello\x1b[?2004hworld\x1b[?2004l!".to_string();
        assert_eq!(sanitize_output(input), "helloworld!");
    }

    #[test]
    fn removes_osc_7701_markers() {
        let input = "\x1b]7701;S;blk-123\x07output\x1b]7701;E;blk-123;0\x07".to_string();
        assert_eq!(sanitize_output(input), "output");
    }

    #[test]
    fn removes_osc_133_prompts() {
        let input = "\x1b]133;A\x07$ ls\x1b]133;C\x07file".to_string();
        assert_eq!(sanitize_output(input), "$ lsfile");
    }

    #[test]
    fn strips_printf_7701_echo_line() {
        let input = "printf '\\033]7701;E;blk-1;0\\007'\nreal output\n".to_string();
        assert_eq!(sanitize_output(input), "real output\n");
    }

    #[test]
    fn strips_ls_rc_assignment_line() {
        // POSIX 形式
        let input = "total 3\n__ls_rc=$?\nfile.txt\n".to_string();
        assert_eq!(sanitize_output(input), "total 3\nfile.txt\n");
    }

    #[test]
    fn strips_powershell_ls_rc_assignment_line() {
        let input = "output\n$__ls_rc = 0\nnext\n".to_string();
        assert_eq!(sanitize_output(input), "output\nnext\n");
    }

    #[test]
    fn preserves_sgr_colors() {
        let input = "plain \x1b[32mgreen\x1b[0m tail".to_string();
        assert_eq!(sanitize_output(input), "plain \x1b[32mgreen\x1b[0m tail");
    }

    #[test]
    fn preserves_crlf_line_endings() {
        let input = "a\r\nb\r\n".to_string();
        assert_eq!(sanitize_output(input), "a\r\nb\r\n");
    }

    #[test]
    fn end_to_end_warp_ls_output() {
        // 复刻用户反馈的现象：OSC + bracketed-paste + printf 回显 + __ls_rc 混杂
        let input = "\x1b[?2004l\x1b]7701;S;blk-1\x07\
                     file1  file2  file3\n\
                     __ls_rc=$?\n\
                     printf '\\033]7701;E;blk-1;%d\\007' \"$__ls_rc\"\n\
                     \x1b]7701;E;blk-1;0\x07\x1b[?2004h"
            .to_string();
        assert_eq!(
            sanitize_output(input),
            "file1  file2  file3\n"
        );
    }

    #[test]
    fn idempotent() {
        let input = "\x1b[?2004h\x1b]7701;S;x\x07hi\x1b]7701;E;x;0\x07".to_string();
        let once = sanitize_output(input);
        let twice = sanitize_output(once.clone());
        assert_eq!(once, twice);
    }
}

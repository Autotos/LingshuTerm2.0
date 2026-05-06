/**
 * Input type detection: distinguish Shell commands from natural language queries.
 * Supports `/ai` prefix and automatic NL detection (Chinese chars, sentence patterns).
 */

export type InputType = 'shell' | 'ai';

/** Result of input detection */
export interface DetectResult {
  type: InputType;
  /** Cleaned input text (prefix stripped if `/ai` was used) */
  text: string;
}

/** Common shell command prefixes / builtins */
const SHELL_PREFIXES = new Set([
  'ls', 'cd', 'pwd', 'cat', 'echo', 'grep', 'find', 'mkdir', 'rm', 'cp', 'mv',
  'chmod', 'chown', 'tar', 'gzip', 'curl', 'wget', 'ssh', 'scp', 'git', 'docker',
  'npm', 'npx', 'yarn', 'pnpm', 'node', 'python', 'python3', 'pip', 'pip3',
  'cargo', 'rustc', 'go', 'java', 'javac', 'mvn', 'gradle',
  'apt', 'apt-get', 'yum', 'dnf', 'brew', 'pacman',
  'systemctl', 'journalctl', 'ps', 'kill', 'top', 'htop',
  'touch', 'head', 'tail', 'sort', 'uniq', 'wc', 'awk', 'sed', 'xargs',
  'env', 'export', 'source', 'sudo', 'su', 'man', 'which', 'whereis',
  'ping', 'traceroute', 'netstat', 'ss', 'ifconfig', 'ip',
  'du', 'df', 'free', 'uname', 'whoami', 'hostname', 'date',
  'vim', 'nano', 'less', 'more', 'diff', 'patch',
  // Windows / PowerShell
  'dir', 'type', 'copy', 'move', 'del', 'ren', 'cls', 'set', 'ipconfig',
  'Get-ChildItem', 'Get-Content', 'Set-Location', 'Write-Output',
  'Invoke-WebRequest', 'New-Item', 'Remove-Item', 'Get-Process',
]);

/** Characters that strongly indicate a shell command */
const SHELL_CHARS = /^[.\/~$!]/;

/** Pipe, redirect, semicolon, &&, || — shell syntax */
const SHELL_SYNTAX = /[|><;&]{1,2}/;

/** Detect if input contains significant Chinese text (NL indicator) */
function hasChinese(text: string): boolean {
  const chinese = text.match(/[\u4e00-\u9fff]/g);
  if (!chinese) return false;
  // At least 2 Chinese characters, or Chinese makes up > 30% of non-space chars
  const nonSpace = text.replace(/\s/g, '').length;
  return chinese.length >= 2 || (nonSpace > 0 && chinese.length / nonSpace > 0.3);
}

/** Detect if input looks like a natural language sentence */
function isSentenceLike(text: string): boolean {
  // Ends with Chinese punctuation
  if (/[。？！，、；：]$/.test(text)) return true;
  // Contains question words
  if (/[\u5982\u4f55\u600e\u4e48\u600e\u6837\u4ec0\u4e48\u54ea\u4e2a\u54ea\u4e9b\u8bf7\u5e2e\u6211\u80fd\u5426\u662f\u5426\u53ef\u4ee5]/.test(text)) return true;
  // Starts with common NL verbs (Chinese)
  if (/^[\u67e5\u770b\u663e\u793a\u5217\u51fa\u521b\u5efa\u5220\u9664\u5b89\u88c5\u5378\u8f7d\u542f\u52a8\u505c\u6b62\u91cd\u542f\u66f4\u65b0\u4fee\u6539\u8bbe\u7f6e\u914d\u7f6e\u6253\u5f00\u5173\u95ed\u8fd0\u884c\u6267\u884c\u7f16\u8bd1\u6784\u5efa\u90e8\u7f72\u53d1\u5e03\u4e0b\u8f7d\u4e0a\u4f20\u5907\u4efd\u6062\u590d\u641c\u7d22\u67e5\u627e\u7edf\u8ba1\u76d1\u63a7\u5206\u6790\u6d4b\u8bd5\u68c0\u67e5]/.test(text)) return true;
  // English sentence patterns: starts with verb or question word
  if (/^(how|what|where|who|when|why|which|can|could|please|show|list|create|delete|find|help|tell|give|make|do|is|are|will|would)\b/i.test(text)) return true;
  return false;
}

/**
 * Detect whether user input is a shell command or AI query.
 *
 * Priority:
 * 1. `/ai ` prefix → always AI
 * 2. Starts with known shell command or shell-like syntax → Shell
 * 3. Contains Chinese + sentence pattern → AI
 * 4. Default → Shell
 */
export function detectInputType(input: string): DetectResult {
  const trimmed = input.trim();

  // 1. Explicit /ai prefix
  if (/^\/ai\s+/i.test(trimmed)) {
    return { type: 'ai', text: trimmed.replace(/^\/ai\s+/i, '').trim() };
  }

  // If empty after trim, treat as shell (will be no-op anyway)
  if (!trimmed) {
    return { type: 'shell', text: trimmed };
  }

  // 2. Check for shell-like patterns
  const firstWord = trimmed.split(/\s/)[0];

  // Starts with path-like or variable-like chars
  if (SHELL_CHARS.test(trimmed)) {
    return { type: 'shell', text: trimmed };
  }

  // First word is a known shell command
  if (SHELL_PREFIXES.has(firstWord)) {
    return { type: 'shell', text: trimmed };
  }

  // Contains shell syntax operators (but not inside quotes)
  if (SHELL_SYNTAX.test(trimmed) && !hasChinese(trimmed)) {
    return { type: 'shell', text: trimmed };
  }

  // 3. Chinese NL detection
  if (hasChinese(trimmed) && isSentenceLike(trimmed)) {
    return { type: 'ai', text: trimmed };
  }

  // Plain Chinese text (even without sentence markers)
  if (hasChinese(trimmed)) {
    return { type: 'ai', text: trimmed };
  }

  // English sentence detection
  if (isSentenceLike(trimmed) && !SHELL_PREFIXES.has(firstWord)) {
    return { type: 'ai', text: trimmed };
  }

  // 4. Default: treat as shell
  return { type: 'shell', text: trimmed };
}

/**
 * Command output dispatcher — 根据 command + clean text 决定渲染组件。
 *
 * 所有 detector 在 `OutputRenderer` 内部调用；对外零配置。
 */

import { parseAnsiToSegments, stripAllAnsi } from './ansi';
import { detectLsAl } from './fileParser';

export type OutputKind =
  | 'fileListTable'
  | 'fileList'
  | 'diskUsage'
  | 'processTable'
  | 'gitStatus'
  | 'directoryChart'
  | 'json'
  | 'code'
  | 'markdown'
  | 'plain';

export interface FileEntry {
  name: string;
  kind: 'dir' | 'exe' | 'link' | 'file';
}

// --- Command 与输出的轻量特征提取 -----------------------------------------

const FILE_LIST_CMD_RE = /^\s*(ls|dir|tree)\b/i;
const CODE_FILE_CMD_RE = /\b(cat|bat|type|less|more)\b\s+\S*\.(json|py|rs|ts|tsx|js|jsx|yaml|yml|toml|md|sh)\b/i;

const EXT_LANG: Record<string, string> = {
  json: 'json',
  py: 'python',
  rs: 'rust',
  ts: 'typescript',
  tsx: 'tsx',
  js: 'javascript',
  jsx: 'jsx',
  yaml: 'yaml',
  yml: 'yaml',
  toml: 'toml',
  md: 'markdown',
  sh: 'bash',
};

// --- detectOutputKind -----------------------------------------------------

/**
 * 根据命令 + 去 ANSI 后的纯文本判断输出类型。
 *
 * 短路规则（按优先级）：
 *   1. 检测到 JSON 开头 { / [ 且可 parse → json
 *   2. df -h 表头特征 → diskUsage
 *   3. ps aux 表头特征 → processTable
 *   4. git status 特征词 → gitStatus
 *   5. du -sh 行格式 → directoryChart
 *   6. ls -al 长格式 → fileListTable
 *   7. ls/dir/tree 且看起来是多列短词 → fileList
 *   8. 纯文本首字符 `{` 或 `[` → code（JSON 不可 parse 时）
 *   9. 命令形如 `cat foo.json` → code（按扩展名）
 *   10. 含 Markdown 语法（#, fenced, table） → markdown
 *   11. 其它 → plain
 */
export function detectOutputKind(command: string, cleanText: string): OutputKind {
  // 已在本模块内使用 detectDiskUsage 等，但这里保持函数独立
  const cmd = command.trim();
  const text = cleanText;
  const trimmed = text.trimStart();

  // 1. JSON
  if (detectJsonIntra(text)) {
    return 'json';
  }

  // 2. df -h
  if (detectDiskUsageIntra(text)) {
    return 'diskUsage';
  }

  // 3. ps aux
  if (detectProcessTableIntra(text)) {
    return 'processTable';
  }

  // 4. git status
  if (detectGitStatusIntra(text)) {
    return 'gitStatus';
  }

  // 5. du -sh
  if (detectDirectoryChartIntra(text)) {
    return 'directoryChart';
  }

  // 6. ls -al 长格式（必须在短 ls 前面检测，避免权限位被 looksLikeFileList 误判）
  if (detectLsAl(text)) {
    return 'fileListTable';
  }

  // 7. ls 短格式
  if (FILE_LIST_CMD_RE.test(cmd) && looksLikeFileList(text)) {
    return 'fileList';
  }

  // 8. JSON 兜头但不可 parse → code
  const firstChar = trimmed.charAt(0);
  if (firstChar === '{' || firstChar === '[') {
    const lastChar = trimmed.trimEnd().slice(-1);
    if (lastChar === '}' || lastChar === ']') {
      return 'code';
    }
  }

  // 9. cat foo.ext
  if (CODE_FILE_CMD_RE.test(cmd)) {
    return 'code';
  }

  // 10. Markdown
  if (looksLikeMarkdown(text)) {
    return 'markdown';
  }

  return 'plain';
}

// 内联检测函数（避免循环依赖）
const DF_HEADER_RE = /\b(Filesystem|文件系统)\b.*\b(Size|容量|大小)\b.*\b(Used|已用)\b.*\b(Avail|可用)\b.*\b(Use%|使用率)\b.*\b(Mounted|挂载点)\b/i;
const PS_HEADER_RE = /^\s*USER\s+(?:PID\s+)?%CPU\s+%MEM\b/m;
const GIT_BRANCH_RE = /^\s*(?:On branch|位于分支)\s+\S+/m;
const GIT_CHANGES_RE = /Changes (?:to be committed|not staged for commit):/i;
const GIT_UNTRACKED_RE = /Untracked files:/i;
const DU_LINE_RE = /^\s*(\d+(?:\.\d+)?)\s*([KMGT]?)\t?\s+\S.*$/;

function detectDiskUsageIntra(text: string): boolean {
  return DF_HEADER_RE.test(text);
}

function detectProcessTableIntra(text: string): boolean {
  return PS_HEADER_RE.test(text);
}

function detectGitStatusIntra(text: string): boolean {
  return (
    GIT_BRANCH_RE.test(text) ||
    GIT_CHANGES_RE.test(text) ||
    GIT_UNTRACKED_RE.test(text)
  );
}

function detectDirectoryChartIntra(text: string): boolean {
  if (DF_HEADER_RE.test(text)) return false;
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return false;
  let matched = 0;
  for (const line of lines) {
    if (DU_LINE_RE.test(line.trim())) matched++;
  }
  return matched >= Math.max(1, lines.length * 0.6);
}

function detectJsonIntra(text: string): boolean {
  const trimmed = text.trimStart();
  const first = trimmed.charAt(0);
  if (first !== '{' && first !== '[') return false;
  const lastNonBlank = trimmed.trimEnd().slice(-1);
  if (first === '{' && lastNonBlank !== '}') return false;
  if (first === '[' && lastNonBlank !== ']') return false;
  try {
    JSON.parse(trimmed);
    return true;
  } catch {
    return false;
  }
}

function looksLikeFileList(text: string): boolean {
  const lines = text.split(/\r?\n/).map((l) => l.trimEnd()).filter(Boolean);
  if (lines.length === 0) return false;
  // 典型 ls 输出：多行、每行多个空白分隔的短 token；或单行多 token
  const tokenCounts = lines.map((l) => l.split(/\s+/).filter(Boolean).length);
  const totalTokens = tokenCounts.reduce((s, n) => s + n, 0);
  if (totalTokens < 2) return false;
  // 避免把带长路径/多词自然语言当成文件列表
  const avgTokenLen =
    lines.join(' ').replace(/\s+/g, ' ').length / Math.max(totalTokens, 1);
  return avgTokenLen <= 40;
}

function looksLikeMarkdown(text: string): boolean {
  // 多特征至少命中一个
  if (/^\s{0,3}#{1,6}\s+\S/m.test(text)) return true; // 标题
  if (/^\s*```/m.test(text)) return true; // fenced code
  if (/^\s*\|.*\|\s*$/m.test(text) && /\|[\s:-]+\|/.test(text)) return true; // 表格（至少含对齐行）
  if (/^\s*[-*]\s+\S/m.test(text)) {
    // 连续两行列表项才算
    const listLines = text.match(/^\s*[-*]\s+\S/gm) ?? [];
    if (listLines.length >= 2) return true;
  }
  return false;
}

// --- detectCodeLang -------------------------------------------------------

/** 按命令扩展名 + 内容启发式推断 Shiki 语言键。 */
export function detectCodeLang(command: string, text: string): string {
  const m = command.match(/\.([a-zA-Z0-9]+)\b/);
  if (m) {
    const ext = m[1].toLowerCase();
    if (EXT_LANG[ext]) return EXT_LANG[ext];
  }
  const t = text.trimStart();
  const c = t.charAt(0);
  if (c === '{' || c === '[') return 'json';
  if (/^\s*(def |class |import |from \S+ import)/m.test(t)) return 'python';
  if (/^\s*(fn |struct |impl |pub )/m.test(t)) return 'rust';
  if (/^\s*(function |const |let |import )/m.test(t)) return 'typescript';
  return 'text';
}

// --- detectFileListEntries ------------------------------------------------

/**
 * 从 ls/dir 输出中抽取文件条目，双路并用：
 *   A. 有 SGR：按 fg 颜色推断 kind（34=dir, 32=exe, 36=link, 其它=file）
 *   B. 无 SGR：按 ls -F 后缀（/, *, @）推断
 *   C. 皆无：全 file
 */
export function detectFileListEntries(rawWithSgr: string): FileEntry[] {
  const hasSgr = /\x1b\[[\d;]*m/.test(rawWithSgr); // eslint-disable-line no-control-regex
  return hasSgr ? entriesFromSgr(rawWithSgr) : entriesFromSuffix(stripAllAnsi(rawWithSgr));
}

function kindFromFg(fg: string | undefined): FileEntry['kind'] {
  if (!fg) return 'file';
  const f = fg.toLowerCase();
  // 对照 BASIC_COLORS
  if (f === '#7ea8c7' || f === '#95bad4') return 'dir';  // 34 / 94
  if (f === '#8fba7a' || f === '#a3c990') return 'exe';  // 32 / 92
  if (f === '#8fb8b8' || f === '#a6c9c9') return 'link'; // 36 / 96
  return 'file';
}

function entriesFromSgr(raw: string): FileEntry[] {
  const segs = parseAnsiToSegments(raw);
  const entries: FileEntry[] = [];
  // ls 输出里文件名之间用空白或换行分隔；同一段里颜色保持一致 → 这段里可能含多个文件名（列对齐）
  for (const seg of segs) {
    const kind = kindFromFg(seg.fg);
    const tokens = seg.text.split(/\s+/).map((t) => t.trim()).filter(Boolean);
    for (let name of tokens) {
      // 去掉 ls -F 后缀（如果同时带了颜色和后缀）
      name = stripFileSuffix(name).name;
      if (!name) continue;
      entries.push({ name, kind });
    }
  }
  return dedupe(entries);
}

function entriesFromSuffix(text: string): FileEntry[] {
  const tokens = text.split(/\s+/).map((t) => t.trim()).filter(Boolean);
  const entries: FileEntry[] = tokens.map(stripFileSuffix);
  return dedupe(entries);
}

function stripFileSuffix(raw: string): FileEntry {
  if (raw.endsWith('/')) return { name: raw.slice(0, -1), kind: 'dir' };
  if (raw.endsWith('*')) return { name: raw.slice(0, -1), kind: 'exe' };
  if (raw.endsWith('@')) return { name: raw.slice(0, -1), kind: 'link' };
  // 去掉某些 shell 添加的其它 trailing marker（=, |, > 等不展示）
  if (/[=|>]$/.test(raw)) return { name: raw.slice(0, -1), kind: 'file' };
  return { name: raw, kind: 'file' };
}

function dedupe(entries: FileEntry[]): FileEntry[] {
  const seen = new Set<string>();
  const out: FileEntry[] = [];
  for (const e of entries) {
    const key = `${e.kind}:${e.name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return out;
}

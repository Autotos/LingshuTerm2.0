/**
 * Output content detector —— 根据输出文本特征判断渲染类型并解析结构化数据。
 *
 * 覆盖：
 *  - df -h      → DiskUsageCard
 *  - ps aux     → ProcessTable
 *  - git status → GitStatus
 *  - du -sh *   → DirectoryChart
 *  - JSON       → JsonViewer
 */

// ---------------------------------------------------------------------------
// 类型定义
// ---------------------------------------------------------------------------

export interface DiskEntry {
  filesystem: string;
  size: string;
  used: string;
  avail: string;
  /** 0-100 */
  usePercent: number;
  mountedOn: string;
}

export interface ProcessEntry {
  user: string;
  pid: string;
  cpu: number;
  mem: number;
  vsz?: string;
  rss?: string;
  tty?: string;
  stat?: string;
  start?: string;
  time?: string;
  command: string;
}

export interface GitStatusData {
  branch: string;
  staged: GitFileEntry[];
  unstaged: GitFileEntry[];
  untracked: string[];
}

export interface GitFileEntry {
  status: 'modified' | 'new' | 'deleted' | 'renamed';
  file: string;
  /** 重命名时的目标文件 */
  renamedTo?: string;
}

export interface DirSizeEntry {
  path: string;
  /** 原始大小字符串（如 "4.0K", "12M"） */
  sizeDisplay: string;
  /** 字节数（用于排序/比例计算） */
  bytes: number;
}

// ---------------------------------------------------------------------------
// 检测正则
// ---------------------------------------------------------------------------

/** df -h 表头：含 Filesystem, Size, Use%, Mounted 等关键词 */
const DF_HEADER_RE = /\b(Filesystem|文件系统)\b.*\b(Size|容量|大小)\b.*\b(Used|已用)\b.*\b(Avail|可用)\b.*\b(Use%|使用率)\b.*\b(Mounted|挂载点)\b/i;

/** ps aux 表头：USER PID %CPU %MEM */
const PS_HEADER_RE = /^\s*USER\s+(?:PID\s+)?%CPU\s+%MEM\b/m;

/** git status 特征 */
const GIT_BRANCH_RE = /^\s*(?:On branch|位于分支)\s+(\S+)/m;
const GIT_STAGED_RE = /Changes to be committed:/i;
const GIT_UNSTAGED_RE = /Changes not staged for commit:/i;
const GIT_UNTRACKED_RE = /Untracked files:/i;

/** du -sh 行：数字+单位 + 路径 */
const DU_LINE_RE = /^\s*(\d+(?:\.\d+)?)\s*([KMGT]?)\t?\s+(\S.*)\s*$/;

// ---------------------------------------------------------------------------
// 检测函数
// ---------------------------------------------------------------------------

export function detectDiskUsage(text: string): boolean {
  return DF_HEADER_RE.test(text);
}

export function detectProcessTable(text: string): boolean {
  return PS_HEADER_RE.test(text);
}

export function detectGitStatus(text: string): boolean {
  return (
    GIT_BRANCH_RE.test(text) ||
    GIT_STAGED_RE.test(text) ||
    GIT_UNSTAGED_RE.test(text) ||
    GIT_UNTRACKED_RE.test(text)
  );
}

export function detectDirectoryChart(text: string): boolean {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return false;
  // 排除 df -h 误判（df 也有 数字+路径 格式的行）
  if (DF_HEADER_RE.test(text)) return false;
  let matched = 0;
  for (const line of lines) {
    if (DU_LINE_RE.test(line.trim())) matched++;
  }
  return matched >= Math.max(1, lines.length * 0.6);
}

export function detectJson(text: string): boolean {
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

// ---------------------------------------------------------------------------
// 解析函数
// ---------------------------------------------------------------------------

export function parseDiskUsage(text: string): DiskEntry[] {
  const lines = text.split(/\r?\n/);
  const entries: DiskEntry[] = [];
  let headerFound = false;

  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    if (!headerFound) {
      if (DF_HEADER_RE.test(t)) {
        headerFound = true;
        continue;
      }
    }
    if (/^Mounted\s+on/i.test(t) || /^挂载点/i.test(t)) continue;

    // 用 >=2 个空格或 tab 切列
    const columns = t.split(/\s{2,}|\t/).filter(Boolean);
    if (columns.length >= 5) {
      const mountedOn = columns[columns.length - 1];
      const usePctStr = columns[columns.length - 2].replace('%', '');
      const usePercent = parseFloat(usePctStr);
      if (!isNaN(usePercent)) {
        entries.push({
          filesystem: columns[0],
          size: columns[1] || '',
          used: columns[2] || '',
          avail: columns[3] || '',
          usePercent,
          mountedOn,
        });
        continue;
      }
    }

    // Fallback：宽松单空格切分 /dev/xxx ... N% /path
    const m = t.match(/^(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\d+)%\s+(.+)$/);
    if (m) {
      entries.push({
        filesystem: m[1],
        size: m[2],
        used: m[3],
        avail: m[4],
        usePercent: parseInt(m[5], 10),
        mountedOn: m[6],
      });
    }
  }
  return entries;
}

export function parseProcessTable(text: string): ProcessEntry[] {
  const lines = text.split(/\r?\n/);
  const entries: ProcessEntry[] = [];
  let headerFound = false;

  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    if (/^\s*USER\b/.test(t) && /\bCOMMAND\b/.test(t) && /%CPU/.test(t)) {
      headerFound = true;
      continue;
    }
    if (!headerFound) continue;

    const parts = t.split(/\s+/);
    if (parts.length < 11) continue;

    const cpu = parseFloat(parts[2]);
    const mem = parseFloat(parts[3]);
    if (isNaN(cpu) || isNaN(mem)) continue;

    entries.push({
      user: parts[0],
      pid: parts[1],
      cpu,
      mem,
      vsz: parts[4],
      rss: parts[5],
      tty: parts[6],
      stat: parts[7],
      start: parts[8],
      time: parts[9],
      command: parts.slice(10).join(' '),
    });
  }
  return entries;
}

export function parseGitStatus(text: string): GitStatusData | null {
  const branchMatch = text.match(GIT_BRANCH_RE);
  const branch = branchMatch ? branchMatch[1] : '';

  const staged: GitFileEntry[] = [];
  const unstaged: GitFileEntry[] = [];
  const untracked: string[] = [];

  let section: 'staged' | 'unstaged' | 'untracked' | null = null;
  const lines = text.split(/\r?\n/);

  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;

    // 检测 section 切换
    if (GIT_STAGED_RE.test(t)) {
      section = 'staged';
      continue;
    }
    if (GIT_UNSTAGED_RE.test(t)) {
      section = 'unstaged';
      continue;
    }
    if (GIT_UNTRACKED_RE.test(t)) {
      section = 'untracked';
      continue;
    }

    // 跳过 Git 的提示说明行
    if (/\(use "git /i.test(t)) continue;
    if (/no changes added to commit/i.test(t)) continue;
    if (/^\s*\(/i.test(t) && t.length < 5) continue;
    if (/^\s*"/.test(t) && /".*"/.test(t)) continue;

    if (!section) continue;

    if (section === 'staged' || section === 'unstaged') {
      let status: GitFileEntry['status'] = 'modified';
      let file = t;

      if (/^\s*modified:/i.test(t)) {
        status = 'modified';
        file = t.replace(/^\s*modified:\s*/i, '');
      } else if (/^\s*new file:/i.test(t)) {
        status = 'new';
        file = t.replace(/^\s*new file:\s*/i, '');
      } else if (/^\s*deleted:/i.test(t)) {
        status = 'deleted';
        file = t.replace(/^\s*deleted:\s*/i, '');
      } else if (/^\s*renamed:/i.test(t)) {
        status = 'renamed';
        file = t.replace(/^\s*renamed:\s*/i, '');
      }

      // 重命名：a -> b
      if (file.includes('->')) {
        const parts = file.split('->');
        const entry: GitFileEntry = {
          status: 'renamed',
          file: parts[0].trim(),
          renamedTo: parts[1].trim(),
        };
        if (section === 'staged') staged.push(entry);
        else unstaged.push(entry);
      } else {
        file = file.trim().replace(/^\s+/, '').replace(/\s+$/, '');
        if (file) {
          const entry: GitFileEntry = { status, file };
          if (section === 'staged') staged.push(entry);
          else unstaged.push(entry);
        }
      }
    } else if (section === 'untracked') {
      const f = t.trim();
      if (f && !f.startsWith('(') && !f.includes('no changes')) {
        untracked.push(f);
      }
    }
  }

  return { branch, staged, unstaged, untracked };
}

export function parseDirectoryChart(text: string): DirSizeEntry[] {
  const entries: DirSizeEntry[] = [];
  const lines = text.split(/\r?\n/);

  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    const m = t.match(DU_LINE_RE);
    if (!m) continue;

    const [, sizeNum, unit, path] = m;
    const bytes = parseSize(sizeNum, unit);
    entries.push({
      path,
      sizeDisplay: `${sizeNum}${unit}`,
      bytes,
    });
  }

  entries.sort((a, b) => b.bytes - a.bytes);
  return entries;
}

// ---------------------------------------------------------------------------
// 辅助
// ---------------------------------------------------------------------------

function parseSize(num: string, unit: string): number {
  const n = parseFloat(num);
  const u = (unit || 'B').toUpperCase();
  const multipliers: Record<string, number> = {
    B: 1,
    K: 1024,
    M: 1024 * 1024,
    G: 1024 * 1024 * 1024,
    T: 1024 * 1024 * 1024 * 1024,
  };
  return n * (multipliers[u] || 1);
}

/**
 * `ls -al` 长格式输出解析器。
 *
 * 将原始 ANSI-cleaned 文本解析为结构化条目列表，供 FileListTable 渲染。
 */

// ---------------------------------------------------------------------------
// 类型定义
// ---------------------------------------------------------------------------

export interface LsAlEntry {
  /** 完整 10 字符权限字符串（如 `-rw-r--r--` / `drwxr-xr-x` / `lrwxrwxrwx`） */
  permission: string;
  /** 硬链接数 */
  links: number;
  /** 所有者 */
  owner: string;
  /** 所属组 */
  group: string;
  /** 字节大小 */
  size: number;
  /** 月份缩写（Jan-Dec） */
  month: string;
  /** 日期 */
  day: string;
  /** 时间（HH:MM 或 YYYY） */
  time: string;
  /** 文件名 */
  name: string;
  /** 软链接目标（仅 link 类型有效） */
  linkTarget?: string;
  /** 从权限位推断的类型 */
  kind: 'dir' | 'link' | 'exe' | 'file';
}

// ---------------------------------------------------------------------------
// 正则
// ---------------------------------------------------------------------------

/** 匹配一行 ls -al 长格式输出。
 *  分组：1=权限  2=链接数  3=所有者  4=组  5=大小  6=月  7=日  8=时间/年份  9=文件名(含链接目标)
 *
 *  列结构（以 GNU ls 为准）：
 *    -rw-r--r--  1  user  group  4096  Jan  7  14:30  file.txt
 *    drwxr-xr-x  2  user  group  4096  Jan  7    2025  old-dir   (老文件显示年份)
 *
 *  权限字符集覆盖所有 Unix 文件类型：
 *  - 第一位: `d`(目录) `l`(链接) `-`(普通) `c`(字符设备) `b`(块设备) `p`(管道) `s`(socket)
 *  - 后九位: `rwxstST-` 任意组合
 */
const LS_AL_LINE_RE = /^([d\-lcbps][rwxsStT\-]{9})\s+(\d+)\s+(\S+)\s+(\S+)\s+(\d+)\s+(\w{3})\s+(\d{1,2})\s+(\S{1,5})\s+(.+)$/;

/** "total" 汇总行 */
const TOTAL_LINE_RE = /^total\s+\d+/i;

/** 软链接目标提取：最后出现 " -> " */
const SYMLINK_SPLIT_RE = /\s+->\s+(.+)$/;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * 检测文本是否包含 ls -al 长格式输出。
 * 规则：至少 2 行符合权限位格式，且匹配率 ≥ 50%。
 */
export function detectLsAl(text: string): boolean {
  // 防御：非字符串直接返回 false
  if (typeof text !== 'string' || !text) {
    console.log('[detectLsAl] ❌ input not a string, got:', typeof text);
    return false;
  }

  const lines = text.split(/\r?\n/).map((l) => l?.trim?.() ?? '').filter(Boolean);
  console.log('[detectLsAl] 📄 total non-empty lines:', lines.length, '| preview:', text.substring(0, 120));

  // 必须有至少 2 行才能构成列表
  if (lines.length < 2) {
    console.log('[detectLsAl] ❌ too few lines (<2)');
    return false;
  }

  let total = 0;
  let matched = 0;

  for (const line of lines) {
    // 防御：跳过非预期类型行
    if (!line || typeof line !== 'string') continue;
    // 跳过 total 行
    if (TOTAL_LINE_RE.test(line)) {
      console.log('[detectLsAl] ⏭ skipped total line:', line);
      continue;
    }
    total++;
    const ok = LS_AL_LINE_RE.test(line);
    if (ok) matched++;
    else console.log('[detectLsAl] ❌ non-matching line:', line.substring(0, 80));
  }

  const result = total >= 2 && matched >= 2 && matched >= total * 0.5;
  console.log('[detectLsAl] 📊 total=', total, 'matched=', matched, '→', result);
  return result;
}

/**
 * 解析 ls -al 长格式输出文本。
 * 跳过 `total` 行；非匹配行静默跳过。
 */
export function parseLsAl(text: string): LsAlEntry[] {
  // 防御：非字符串或空串直接返回空数组
  if (typeof text !== 'string' || !text) {
    console.log('[parseLsAl] ❌ input not a string, got:', typeof text);
    return [];
  }

  console.log('[parseLsAl] 🔍 parsing, length=', text.length, '| preview:', text.substring(0, 150));

  const lines = text.split(/\r?\n/);
  const entries: LsAlEntry[] = [];

  for (const raw of lines) {
    // 1. 防御：跳过 null / undefined / 非字符串行
    if (raw == null || typeof raw !== 'string') continue;

    const t = raw.trim();
    // 2. 跳过空行
    if (!t) continue;
    // 3. 跳过 "total …" 汇总行
    if (TOTAL_LINE_RE.test(t)) continue;

    // 4. 安全匹配：match() 返回 null 时直接用 continue 跳过
    const m = t.match(LS_AL_LINE_RE);
    if (!m) {
      console.log('[parseLsAl] ❌ regex no-match:', t.substring(0, 80));
      continue;
    }

    // 5. 安全解构：捕获组必须在才取值，否则跳过
    const permission = m[1];
    const links = m[2];
    const owner = m[3];
    const group = m[4];
    const size = m[5];
    const month = m[6];
    const day = m[7];
    const time = m[8];
    const nameRaw = m[9];

    if (!permission || !owner || !size || !month || !day || !time || !nameRaw) {
      console.log('[parseLsAl] ❌ group guard failed:', { permission, owner, size, month, day, time, nameRaw });
      continue;
    }

    // 处理软链接：`name -> target`（nameRaw 已确认为 string）
    let name: string = nameRaw;
    let linkTarget: string | undefined;
    const symMatch = nameRaw.match(SYMLINK_SPLIT_RE);
    if (symMatch) {
      name = nameRaw.slice(0, nameRaw.length - symMatch[0].length);
      linkTarget = symMatch[1];
    }

    const kind = inferKind(permission);

    entries.push({
      permission,
      links: parseInt(links, 10),
      owner,
      group,
      size: parseInt(size, 10),
      month,
      day,
      time,
      name,
      linkTarget,
      kind,
    });
  }

  console.log('[parseLsAl] ✅ parsed entries:', entries.length);
  return entries;
}

// ---------------------------------------------------------------------------
// 内部辅助
// ---------------------------------------------------------------------------

function inferKind(perm: string): LsAlEntry['kind'] {
  const type = perm.charAt(0);
  if (type === 'd') return 'dir';
  if (type === 'l') return 'link';
  // 可执行：owner/group/other 任意一个位置含 x
  if (perm.includes('x')) return 'exe';
  return 'file';
}

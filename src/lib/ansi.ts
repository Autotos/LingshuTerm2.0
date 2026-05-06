/**
 * ANSI 序列处理工具。
 *
 * 三种使用场景：
 *   1) `stripControl(text)` —— 给渲染器：清掉非 SGR 控制字符（OSC 7701/DECSET/DECRST/光标位移/其它 CSI/C0），
 *      保留 SGR（`\x1b[...m`），后续由 `parseAnsiToSegments` 拿来做颜色渲染。
 *   2) `stripAllAnsi(text)` —— 给内容分析器：剥光所有 ANSI，产出纯文本用于模式识别。
 *   3) `parseAnsiToSegments(text)` —— 把带 SGR 的文本切成 Segment 数组，给 `<AnsiText>` 渲染。
 *
 * 为保持向后兼容，保留 `stripAnsi` 作为 `stripAllAnsi` 的别名。
 */

/* eslint-disable no-control-regex */

// --- Regex ----------------------------------------------------------------

// OSC: ESC ] ... (BEL | ESC \)
// 覆盖 Warp 的 `]7701;S;id\x07`、`]7701;E;id;exit\x07` 以及 iTerm/终端标题序列等。
const OSC_RE = /\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g;

// 非 SGR 的 CSI: ESC [ ? 可选 ... 终止符 \in [A-Za-l n-~]（显式排除 'm'，SGR 走 m）
// 覆盖 DECSET/DECRST（`\x1b[?2004h/l`）、光标定位（H/f/A/B/C/D）、清屏（J/K）等。
const CSI_NON_SGR_RE = /\x1b\[\??[\d;]*[A-Za-ln-~]/g;

// SGR: ESC [ 数字; ... m —— 保留，仅供 parse
const SGR_RE = /\x1b\[([\d;]*)m/g;

// 全部 CSI（包括 SGR）—— 给 stripAllAnsi 用
const CSI_ANY_RE = /\x1b\[[\d;?]*[A-Za-z]/g;

// 两字节 ESC: ESC + 单个非 `[` 非 `]` 字符（如 `\x1b=`, `\x1b>`）
const ESC_SINGLE_RE = /\x1b[^\[\]]/g;

// C0 控制字符（保留 \t \n \r 和 \x1B ESC）: 0x00-0x08, 0x0B-0x0C, 0x0E-0x1A, 0x1C-0x1F, 0x7F
// 注：\x1B 必须排除，否则会误删 SGR 里的 ESC 字节；孤立 ESC 由上面 ESC_SINGLE_RE 处理。
const C0_RE = /[\x00-\x08\x0B\x0C\x0E-\x1A\x1C-\x1F\x7F]/g;

// --- Public API -----------------------------------------------------------

/**
 * 清掉非 SGR 的控制字符，保留 SGR（颜色/粗体等），供渲染层消费。
 *
 * 处理顺序：
 *   OSC → 非 SGR 的 CSI → 两字节 ESC → C0（仍保留 \t\n\r）
 */
export function stripControl(text: string): string {
  return text
    .replace(OSC_RE, '')
    .replace(CSI_NON_SGR_RE, '')
    .replace(ESC_SINGLE_RE, '')
    .replace(C0_RE, '');
}

/** 剥光所有 ANSI 序列 + 控制字符，产出纯文本（供内容分析器使用）。 */
export function stripAllAnsi(text: string): string {
  return text
    .replace(OSC_RE, '')
    .replace(CSI_ANY_RE, '')
    .replace(ESC_SINGLE_RE, '')
    .replace(C0_RE, '');
}

/** 向后兼容别名。 */
export const stripAnsi = stripAllAnsi;

// --- Segment parsing ------------------------------------------------------

export interface AnsiSegment {
  text: string;
  /** 前景色 CSS，如 `#8fba7a`；undefined 表示未着色。 */
  fg?: string;
  /** 背景色 CSS。 */
  bg?: string;
  bold?: boolean;
  dim?: boolean;
  italic?: boolean;
  underline?: boolean;
}

/** 16 色 SGR 码 → Warp 风格色表（与 xterm 主题近似）。 */
const BASIC_COLORS: Record<number, string> = {
  // Normal
  30: '#1c1c1b', 31: '#d4867c', 32: '#8fba7a', 33: '#c9b87a',
  34: '#7ea8c7', 35: '#b08dba', 36: '#8fb8b8', 37: '#afaeac',
  // Bright
  90: '#666469', 91: '#e09a90', 92: '#a3c990', 93: '#d9ca8e',
  94: '#95bad4', 95: '#c4a4cc', 96: '#a6c9c9', 97: '#faf9f6',
};

/** 256 色立方体部分采用经典 xterm 调色板（简化实现：前 16 色走 BASIC，216 立方体 + 24 灰度按公式）。 */
function xterm256ToHex(n: number): string | undefined {
  if (n < 0 || n > 255) return undefined;
  if (n < 16) {
    // 0-7 映射 30-37, 8-15 映射 90-97
    return BASIC_COLORS[n < 8 ? 30 + n : 82 + n];
  }
  if (n < 232) {
    // 6x6x6 cube
    const i = n - 16;
    const r = Math.floor(i / 36);
    const g = Math.floor((i % 36) / 6);
    const b = i % 6;
    const v = (c: number) => (c === 0 ? 0 : 55 + c * 40);
    return rgbToHex(v(r), v(g), v(b));
  }
  // 24-step grayscale
  const g = 8 + (n - 232) * 10;
  return rgbToHex(g, g, g);
}

function rgbToHex(r: number, g: number, b: number): string {
  const h = (x: number) => x.toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

interface SgrState {
  fg?: string;
  bg?: string;
  bold?: boolean;
  dim?: boolean;
  italic?: boolean;
  underline?: boolean;
}

/** 对一串 SGR 参数（如 `0;1;34`）应用到 state；返回新 state。 */
function applySgrParams(state: SgrState, params: number[]): SgrState {
  const next: SgrState = { ...state };
  // 空参数视作 reset
  if (params.length === 0) params = [0];

  for (let i = 0; i < params.length; i++) {
    const p = params[i];
    if (p === 0) {
      next.fg = undefined;
      next.bg = undefined;
      next.bold = false;
      next.dim = false;
      next.italic = false;
      next.underline = false;
    } else if (p === 1) next.bold = true;
    else if (p === 2) next.dim = true;
    else if (p === 3) next.italic = true;
    else if (p === 4) next.underline = true;
    else if (p === 22) { next.bold = false; next.dim = false; }
    else if (p === 23) next.italic = false;
    else if (p === 24) next.underline = false;
    else if ((p >= 30 && p <= 37) || (p >= 90 && p <= 97)) {
      next.fg = BASIC_COLORS[p];
    } else if (p === 39) next.fg = undefined;
    else if ((p >= 40 && p <= 47) || (p >= 100 && p <= 107)) {
      next.bg = BASIC_COLORS[p - 10];
    } else if (p === 49) next.bg = undefined;
    else if (p === 38 || p === 48) {
      // 扩展色：38;5;N (256) 或 38;2;R;G;B (truecolor)
      const mode = params[i + 1];
      const target: 'fg' | 'bg' = p === 38 ? 'fg' : 'bg';
      if (mode === 5 && params[i + 2] !== undefined) {
        const hex = xterm256ToHex(params[i + 2]);
        if (hex) next[target] = hex;
        i += 2;
      } else if (mode === 2 && params[i + 4] !== undefined) {
        next[target] = rgbToHex(params[i + 2] & 0xff, params[i + 3] & 0xff, params[i + 4] & 0xff);
        i += 4;
      }
    }
  }
  return next;
}

/**
 * 将包含 SGR 的文本切成段序列；非 SGR 控制字符若未被 `stripControl` 预清理，
 * 会残留在 text 中（Segment 层不做二次清洗）。
 */
export function parseAnsiToSegments(text: string): AnsiSegment[] {
  const segments: AnsiSegment[] = [];
  let state: SgrState = {};
  let lastIndex = 0;

  // 需要一个可重置的 regex，每次新建实例避免跨调用 lastIndex 残留
  const re = new RegExp(SGR_RE.source, 'g');
  let match: RegExpExecArray | null;

  while ((match = re.exec(text)) !== null) {
    // 前面一段（上一次 SGR 之后到本次 SGR 之前）使用 *旧* state 渲染
    if (match.index > lastIndex) {
      const chunk = text.slice(lastIndex, match.index);
      if (chunk) segments.push({ text: chunk, ...state });
    }
    const params = match[1].split(';').filter(Boolean).map((s) => parseInt(s, 10));
    state = applySgrParams(state, params);
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex), ...state });
  }

  // 合并相邻同态段（减少 DOM 节点）
  return mergeSegments(segments);
}

function mergeSegments(segs: AnsiSegment[]): AnsiSegment[] {
  const out: AnsiSegment[] = [];
  for (const s of segs) {
    if (!s.text) continue;
    const last = out[out.length - 1];
    if (
      last &&
      last.fg === s.fg &&
      last.bg === s.bg &&
      !!last.bold === !!s.bold &&
      !!last.dim === !!s.dim &&
      !!last.italic === !!s.italic &&
      !!last.underline === !!s.underline
    ) {
      last.text += s.text;
    } else {
      out.push({ ...s });
    }
  }
  return out;
}

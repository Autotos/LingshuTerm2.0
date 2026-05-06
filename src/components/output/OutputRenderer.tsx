import { useMemo } from 'react';
import { stripAllAnsi, stripControl } from '../../lib/ansi';
import {
  detectCodeLang,
  detectFileListEntries,
  detectOutputKind,
} from '../../lib/outputDispatch';
import { AnsiText } from './AnsiText';
import { CodeBlock } from './CodeBlock';
import { FileGrid } from './FileGrid';
import { MarkdownRenderer } from './MarkdownRenderer';

export interface OutputRendererProps {
  /** 原始包含控制字符的 stdout 字符串。 */
  rawOutput: string;
  /** 执行的命令（用于启发式识别）。 */
  command: string;
  /** 'auto'：智能分派；'raw'：保留 SGR 颜色的纯文本渲染。 */
  mode?: 'auto' | 'raw';
}

/**
 * 结构化输出总入口。
 *
 * 流水线：
 *   1. stripControl 清洗 OSC/DECSET/非 SGR CSI，保留 SGR
 *   2. mode === 'raw' → AnsiText 直接渲染
 *   3. mode === 'auto' → detectOutputKind 后分派
 */
export function OutputRenderer({ rawOutput, command, mode = 'auto' }: OutputRendererProps) {
  // sanitized：含 SGR 的干净文本（交给 AnsiText / FileGrid SGR 路径）
  // plain    ：彻底剥光的纯文本（交给 detectOutputKind / CodeBlock / MarkdownRenderer）
  const { sanitized, plain, kind, lang } = useMemo(() => {
    // 统一 CRLF → LF，避免 <pre> 里的孤立 \r 造成视觉上的行错位
    const LF = String.fromCharCode(10);
    const normalized = rawOutput
      .replace(new RegExp('\r\n', 'g'), LF)
      .replace(new RegExp('\r(?!\n)', 'g'), LF);
    const sanitized = stripControl(normalized);
    const plain = stripAllAnsi(sanitized);
    if (mode === 'raw') {
      return { sanitized, plain, kind: 'plain' as const, lang: 'text' };
    }
    const kind = detectOutputKind(command, plain);
    const lang = kind === 'code' ? detectCodeLang(command, plain) : 'text';
    return { sanitized, plain, kind, lang };
  }, [rawOutput, command, mode]);

  if (mode === 'raw') {
    return <AnsiText text={sanitized} />;
  }

  switch (kind) {
    case 'fileList': {
      const entries = detectFileListEntries(sanitized);
      if (entries.length === 0) {
        return <AnsiText text={sanitized} />;
      }
      return <FileGrid entries={entries} />;
    }
    case 'code':
      return <CodeBlock text={plain} lang={lang} />;
    case 'markdown':
      return <MarkdownRenderer text={plain} />;
    case 'plain':
    default:
      return <AnsiText text={sanitized} />;
  }
}

import { useMemo } from 'react';
import { parseAnsiToSegments } from '@/lib/ansi';

interface AnsiTextProps {
  /** 已经 stripControl 过（保留 SGR）的文本；也可直接传原始字符串，内部再解析。 */
  text: string;
  /** 额外 className（挂在外层 pre 上）。 */
  className?: string;
}

/**
 * 将带 SGR 的文本渲染为 pre 内多个 span。
 *
 * 颜色通过内联 style 注入，避免 Tailwind 动态 class 扫描不到。
 */
export function AnsiText({ text, className }: AnsiTextProps) {
  const segments = useMemo(() => parseAnsiToSegments(text), [text]);

  return (
    <pre
      className={
        'text-[13px] font-mono text-[var(--text-2)] whitespace-pre-wrap break-all leading-relaxed m-0 ' +
        (className ?? '')
      }
    >
      {segments.map((seg, i) => {
        const style: React.CSSProperties = {};
        if (seg.fg) style.color = seg.fg;
        if (seg.bg) style.backgroundColor = seg.bg;
        if (seg.bold) style.fontWeight = 600;
        if (seg.dim) style.opacity = 0.7;
        if (seg.italic) style.fontStyle = 'italic';
        if (seg.underline) style.textDecoration = 'underline';
        const hasStyle = Object.keys(style).length > 0;
        return hasStyle ? (
          <span key={i} style={style}>
            {seg.text}
          </span>
        ) : (
          <span key={i}>{seg.text}</span>
        );
      })}
    </pre>
  );
}

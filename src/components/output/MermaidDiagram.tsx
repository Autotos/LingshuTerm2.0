import { useEffect, useRef, useState } from 'react';

// --- 单例 mermaid 加载 -----------------------------------------------------

let mermaidPromise: Promise<typeof import('mermaid').default> | null = null;

function getMermaid() {
  if (!mermaidPromise) {
    mermaidPromise = import('mermaid').then((mod) => {
      const m = mod.default;
      m.initialize({
        startOnLoad: false,
        theme: 'dark',
        securityLevel: 'strict',
        fontFamily: 'ui-sans-serif, system-ui, sans-serif',
      });
      return m;
    });
  }
  return mermaidPromise;
}

let idSeq = 0;
function nextId(): string {
  idSeq += 1;
  return `mermaid-${Date.now().toString(36)}-${idSeq}`;
}

// --- 组件 ------------------------------------------------------------------

interface MermaidDiagramProps {
  /** mermaid 源码（不带 fence）。 */
  code: string;
}

export function MermaidDiagram({ code }: MermaidDiagramProps) {
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;

    (async () => {
      try {
        const mermaid = await getMermaid();
        if (cancelled || !mountedRef.current) return;
        const { svg: rendered } = await mermaid.render(nextId(), code);
        if (cancelled || !mountedRef.current) return;
        setSvg(rendered);
        setError(null);
      } catch (err) {
        console.warn('[MermaidDiagram] render failed:', err);
        if (!cancelled) {
          setSvg(null);
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    })();

    return () => {
      cancelled = true;
      mountedRef.current = false;
    };
  }, [code]);

  if (error) {
    return (
      <div className="rounded bg-[var(--raised)] border border-[var(--border)] p-2">
        <div className="text-[10px] text-[var(--text-4)] mb-1">mermaid render failed — fallback to source</div>
        <pre className="text-[12px] font-mono text-[var(--text-2)] whitespace-pre-wrap break-all m-0">{code}</pre>
      </div>
    );
  }

  if (!svg) {
    return (
      <div className="rounded bg-[var(--raised)] p-3 text-[11px] text-[var(--text-4)]">Rendering diagram…</div>
    );
  }

  return (
    <div
      className="mermaid-wrap rounded bg-[var(--raised)] p-3 overflow-x-auto flex justify-center"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

import { useEffect, useState, useRef } from 'react';
import { Copy, Check } from 'lucide-react';
import type { Highlighter } from 'shiki';

// --- 单例 highlighter -----------------------------------------------------

const SUPPORTED_LANGS = [
  'json',
  'python',
  'rust',
  'typescript',
  'tsx',
  'javascript',
  'jsx',
  'bash',
  'yaml',
  'toml',
  'markdown',
] as const;

type Lang = (typeof SUPPORTED_LANGS)[number] | 'text';

const THEME = 'dracula';

let highlighterPromise: Promise<Highlighter> | null = null;

function getHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = import('shiki').then((shiki) =>
      shiki.createHighlighter({
        themes: [THEME],
        langs: SUPPORTED_LANGS as unknown as string[],
      }),
    );
  }
  return highlighterPromise;
}

function normalizeLang(input: string): Lang {
  const l = input.toLowerCase();
  if ((SUPPORTED_LANGS as readonly string[]).includes(l)) return l as Lang;
  return 'text';
}

// --- 组件 -----------------------------------------------------------------

interface CodeBlockProps {
  /** 已 stripAllAnsi 的纯代码文本。 */
  text: string;
  /** 语言（来自 detectCodeLang 或 markdown fence）。 */
  lang: string;
  /** 可选：显示 lang 标签（MarkdownRenderer 内嵌时可传 false 省去）。 */
  showLangLabel?: boolean;
}

export function CodeBlock({ text, lang, showLangLabel = true }: CodeBlockProps) {
  const normalized = normalizeLang(lang);
  const [html, setHtml] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    if (normalized === 'text') {
      // 文本不走 shiki，直接显示朴素 pre
      setHtml(null);
      return () => {
        mountedRef.current = false;
      };
    }

    let cancelled = false;
    (async () => {
      try {
        const hl = await getHighlighter();
        if (cancelled || !mountedRef.current) return;
        const out = hl.codeToHtml(text, {
          lang: normalized,
          theme: THEME,
        });
        setHtml(out);
      } catch (err) {
        // shiki 加载/高亮失败 → 朴素降级
        console.warn('[CodeBlock] shiki failed:', err);
        if (!cancelled) setHtml(null);
      }
    })();

    return () => {
      cancelled = true;
      mountedRef.current = false;
    };
  }, [text, normalized]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="relative group rounded bg-[var(--raised)] overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1 text-[10px] text-[var(--text-4)] border-b border-[var(--border)]">
        <span>{showLangLabel ? normalized : ''}</span>
        <button
          onClick={handleCopy}
          title="Copy code"
          className="flex items-center gap-1 hover:text-[var(--text-2)] transition-colors"
        >
          {copied ? (
            <>
              <Check className="w-3 h-3" />
              <span>Copied</span>
            </>
          ) : (
            <>
              <Copy className="w-3 h-3" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      {html ? (
        <div
          className="shiki-wrap text-[12.5px] leading-relaxed overflow-x-auto"
          // shiki 的 html 是我们可控源头（hl.codeToHtml），不含用户 XSS。
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        <pre className="text-[12.5px] font-mono text-[var(--text-2)] whitespace-pre-wrap break-all leading-relaxed m-0 px-3 py-2">
          {text}
        </pre>
      )}
    </div>
  );
}

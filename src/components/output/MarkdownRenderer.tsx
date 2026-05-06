import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { CodeBlock } from './CodeBlock';
import { MermaidDiagram } from './MermaidDiagram';

interface MarkdownRendererProps {
  text: string;
}

/**
 * react-markdown 代码节点覆写：
 * - ```mermaid → MermaidDiagram
 * - 其它 fenced 语言 → CodeBlock
 * - 行内 code → 原生 <code>
 */
// react-markdown v9 传入 components.code 的是 HTML code 节点，
// 通过 className="language-xxx" 识别 fence 语言；`inline` prop 在 v9 中仍可用（通过 rehype 行为）。
// 此处通过 className 缺失判断为行内。
function CodeRenderer(props: {
  className?: string;
  children?: React.ReactNode;
  node?: unknown;
}) {
  const { className, children } = props;
  const match = /language-(\w+)/.exec(className ?? '');
  const raw = Array.isArray(children) ? children.join('') : String(children ?? '');
  const codeText = raw.replace(/\n$/, '');

  // 无 language- 前缀 → 行内 code
  if (!match) {
    return (
      <code className="px-1 py-0.5 rounded bg-[var(--raised)] text-[var(--text-2)] text-[12px] font-mono">
        {children}
      </code>
    );
  }

  const lang = match[1].toLowerCase();
  if (lang === 'mermaid') {
    return <MermaidDiagram code={codeText} />;
  }
  return <CodeBlock text={codeText} lang={lang} />;
}

export function MarkdownRenderer({ text }: MarkdownRendererProps) {
  return (
    <div className="prose prose-invert prose-sm max-w-none">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // react-markdown v9 的 code 组件签名：{ className, children, node, ... }
          code: CodeRenderer as never,
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

import { useState } from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';

interface JsonViewerProps {
  text: string;
}

/**
 * 递归 JSON 树视图。
 * - Key 蓝色、String 绿色、Number 橙色、Boolean 紫色、null 灰色
 * - 支持折叠/展开深层对象与数组
 */
export function JsonViewer({ text }: JsonViewerProps) {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return (
      <pre className="text-[12px] font-mono text-[var(--sem-red)] whitespace-pre-wrap">
        {text}
      </pre>
    );
  }

  return (
    <div className="rounded border border-[var(--border)] bg-[var(--surface)] p-3 overflow-x-auto">
      <div className="text-[12.5px] font-mono leading-relaxed">
        <JsonNode value={data} depth={0} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// JSON Node
// ---------------------------------------------------------------------------

interface JsonNodeProps {
  keyName?: string;
  value: unknown;
  depth: number;
}

function JsonNode({ keyName, value, depth }: JsonNodeProps) {
  if (value === null) {
    return (
      <span>
        {keyName !== undefined && (
          <>
            <span className="text-[#7ea8c7]">"{keyName}"</span>
            <span className="text-[var(--text-4)]">: </span>
          </>
        )}
        <span className="text-[#666469] italic">null</span>
      </span>
    );
  }

  if (typeof value === 'boolean') {
    return (
      <span>
        {keyName !== undefined && (
          <>
            <span className="text-[#7ea8c7]">"{keyName}"</span>
            <span className="text-[var(--text-4)]">: </span>
          </>
        )}
        <span className="text-[#b08dba]">{String(value)}</span>
      </span>
    );
  }

  if (typeof value === 'number') {
    return (
      <span>
        {keyName !== undefined && (
          <>
            <span className="text-[#7ea8c7]">"{keyName}"</span>
            <span className="text-[var(--text-4)]">: </span>
          </>
        )}
        <span className="text-[#d9a86c]">{value}</span>
      </span>
    );
  }

  if (typeof value === 'string') {
    return (
      <span>
        {keyName !== undefined && (
          <>
            <span className="text-[#7ea8c7]">"{keyName}"</span>
            <span className="text-[var(--text-4)]">: </span>
          </>
        )}
        <span className="text-[#8fba7a]">"{value}"</span>
      </span>
    );
  }

  if (Array.isArray(value)) {
    return <JsonArray keyName={keyName} value={value} depth={depth} />;
  }

  if (typeof value === 'object') {
    return <JsonObject keyName={keyName} value={value as Record<string, unknown>} depth={depth} />;
  }

  // fallback
  return (
    <span>
      {keyName !== undefined && (
        <>
          <span className="text-[#7ea8c7]">"{keyName}"</span>
          <span className="text-[var(--text-4)]">: </span>
        </>
      )}
      <span className="text-[var(--text-2)]">{String(value)}</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// JSON Object
// ---------------------------------------------------------------------------

interface JsonObjectProps {
  keyName?: string;
  value: Record<string, unknown>;
  depth: number;
}

function JsonObject({ keyName, value, depth }: JsonObjectProps) {
  const [collapsed, setCollapsed] = useState(depth >= 3);
  const keys = Object.keys(value);
  const isEmpty = keys.length === 0;

  const header = (
    <span
      className="cursor-pointer select-none hover:text-[var(--text-2)] inline-flex items-center gap-0.5"
      onClick={() => setCollapsed((v) => !v)}
    >
      {collapsed ? (
        <ChevronRight className="w-3 h-3 inline text-[var(--text-4)]" />
      ) : (
        <ChevronDown className="w-3 h-3 inline text-[var(--text-4)]" />
      )}
      {keyName !== undefined ? (
        <>
          <span className="text-[#7ea8c7]">"{keyName}"</span>
          <span className="text-[var(--text-4)]">: </span>
        </>
      ) : null}
      <span className="text-[var(--text-3)]">{isEmpty ? '{}' : collapsed ? `{…} ${keys.length} keys` : '{'}</span>
    </span>
  );

  if (isEmpty || collapsed) {
    return <div style={{ paddingLeft: depth > 0 ? 16 : 0 }}>{header}</div>;
  }

  return (
    <div style={{ paddingLeft: depth > 0 ? 16 : 0 }}>
      {header}
      <div style={{ paddingLeft: 16 }}>
        {keys.map((k, i) => (
          <div key={k}>
            <JsonNode keyName={k} value={value[k]} depth={depth + 1} />
            {i < keys.length - 1 && <span className="text-[var(--text-4)]">,</span>}
          </div>
        ))}
      </div>
      <span className="text-[var(--text-3)]">{'}'}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// JSON Array
// ---------------------------------------------------------------------------

interface JsonArrayProps {
  keyName?: string;
  value: unknown[];
  depth: number;
}

function JsonArray({ keyName, value, depth }: JsonArrayProps) {
  const [collapsed, setCollapsed] = useState(depth >= 3);
  const isEmpty = value.length === 0;

  const header = (
    <span
      className="cursor-pointer select-none hover:text-[var(--text-2)] inline-flex items-center gap-0.5"
      onClick={() => setCollapsed((v) => !v)}
    >
      {collapsed ? (
        <ChevronRight className="w-3 h-3 inline text-[var(--text-4)]" />
      ) : (
        <ChevronDown className="w-3 h-3 inline text-[var(--text-4)]" />
      )}
      {keyName !== undefined ? (
        <>
          <span className="text-[#7ea8c7]">"{keyName}"</span>
          <span className="text-[var(--text-4)]">: </span>
        </>
      ) : null}
      <span className="text-[var(--text-3)]">
        {isEmpty ? '[]' : collapsed ? `[…] ${value.length} items` : '['}
      </span>
    </span>
  );

  if (isEmpty || collapsed) {
    return <div style={{ paddingLeft: depth > 0 ? 16 : 0 }}>{header}</div>;
  }

  return (
    <div style={{ paddingLeft: depth > 0 ? 16 : 0 }}>
      {header}
      <div style={{ paddingLeft: 16 }}>
        {value.map((item, i) => (
          <div key={i}>
            <JsonNode value={item} depth={depth + 1} />
            {i < value.length - 1 && <span className="text-[var(--text-4)]">,</span>}
          </div>
        ))}
      </div>
      <span className="text-[var(--text-3)]">{']'}</span>
    </div>
  );
}

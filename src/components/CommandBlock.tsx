import { useState } from 'react';
import {
  CheckCircle2,
  XCircle,
  Loader2,
  Circle,
  Copy,
  Wand2,
  Terminal as TerminalIcon,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import type { CommandBlock as CommandBlockType } from '@/models/block';
import { OutputRenderer } from './output/OutputRenderer';

interface CommandBlockProps {
  block: CommandBlockType;
}

export function CommandBlock({ block }: CommandBlockProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mode, setMode] = useState<'auto' | 'raw'>('auto');
  const [copied, setCopied] = useState(false);

  const borderColor = {
    pending: 'border-l-[var(--text-4)]',
    running: 'border-l-[var(--sem-yellow)] animate-pulse-border',
    success: 'border-l-[var(--sem-green)]',
    error: 'border-l-[var(--sem-red)]',
  }[block.status];

  const StatusIcon = {
    pending: <Circle className="w-3.5 h-3.5 text-[var(--text-4)]" />,
    running: <Loader2 className="w-3.5 h-3.5 text-[var(--sem-yellow)] animate-spin" />,
    success: <CheckCircle2 className="w-3.5 h-3.5 text-[var(--sem-green)]" />,
    error: <XCircle className="w-3.5 h-3.5 text-[var(--sem-red)]" />,
  }[block.status];

  const handleCopy = async () => {
    await navigator.clipboard.writeText(block.command);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const timeLabel = block.startedAt
    ? new Date(block.startedAt).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    : '';

  const hasOutput = (block.output ?? '').length > 0;

  return (
    <div
      className={`border-l-2 ${borderColor} rounded bg-[var(--surface)] overflow-hidden animate-block-in`}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-[var(--raised)] border-b border-[var(--border)]">
        <button
          onClick={() => setCollapsed((v) => !v)}
          className="flex-shrink-0 text-[var(--text-3)] hover:text-[var(--text-1)] transition-colors"
        >
          {collapsed ? (
            <ChevronRight className="w-3.5 h-3.5" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5" />
          )}
        </button>

        {StatusIcon}

        <span className="text-[var(--text-3)] text-[11px] select-none">$</span>
        <span className="flex-1 text-[var(--text-1)] text-[13px] font-mono truncate select-all">
          {block.command}
        </span>

        {timeLabel && (
          <span className="text-[10px] text-[var(--text-4)] flex-shrink-0">{timeLabel}</span>
        )}

        {/* Auto / Raw 切换 */}
        <button
          onClick={() => setMode((m) => (m === 'auto' ? 'raw' : 'auto'))}
          title={mode === 'auto' ? 'Switch to Raw output' : 'Switch to Auto render'}
          className="w-6 h-6 flex items-center justify-center rounded text-[var(--text-4)] hover:text-[var(--text-2)] hover:bg-[var(--veil)] transition-all"
        >
          {mode === 'auto' ? (
            <Wand2 className="w-3 h-3" />
          ) : (
            <TerminalIcon className="w-3 h-3" />
          )}
        </button>

        <button
          onClick={handleCopy}
          title="Copy command"
          className="w-6 h-6 flex items-center justify-center rounded text-[var(--text-4)] hover:text-[var(--text-2)] hover:bg-[var(--veil)] transition-all"
        >
          <Copy className="w-3 h-3" />
        </button>
        {copied && (
          <span className="text-[10px] text-[var(--sem-green)] flex-shrink-0">Copied</span>
        )}
      </div>

      {/* Output area */}
      {!collapsed && hasOutput && (
        <div className="px-3 py-2 bg-[var(--deep)] max-h-[400px] overflow-y-auto scrollbar-thin">
          <OutputRenderer
            rawOutput={block.output}
            command={block.command}
            mode={mode}
          />
        </div>
      )}

      {/* Error footer */}
      {block.status === 'error' && block.exitCode !== null && (
        <div className="flex items-center gap-3 px-3 py-1.5 bg-[var(--surface)] border-t border-[var(--border)]">
          <span className="text-[11px] text-[var(--sem-red)]">
            Exit code: {block.exitCode}
          </span>
          <button className="text-[11px] text-[var(--sem-red)] border border-[var(--sem-red)]/30 rounded px-2 py-0.5 hover:bg-[var(--sem-red)]/10 transition-colors">
            View diagnostics
          </button>
        </div>
      )}
    </div>
  );
}

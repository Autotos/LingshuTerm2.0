import { useEffect, useRef } from 'react';
import { TerminalSquare } from 'lucide-react';
import { useSessionBlocks } from '@/stores/commandStore';
import { CommandBlock } from './CommandBlock';
import { CommandInput } from './CommandInput';

interface BlocksPanelProps {
  sessionId: string | null;
  executeCommand: (command: string) => Promise<string | null>;
  isExecuting: boolean;
  onAiSubmit?: (query: string) => Promise<void>;
  isAiLoading?: boolean;
  aiError?: string | null;
  onClearAiError?: () => void;
}

export function BlocksPanel({ sessionId, executeCommand, isExecuting, onAiSubmit, isAiLoading, aiError, onClearAiError }: BlocksPanelProps) {
  const blocks = useSessionBlocks(sessionId);
  const listRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new blocks appear or running block gets output
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    // Only auto-scroll if user is near the bottom (within 120px)
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (isNearBottom) {
      el.scrollTop = el.scrollHeight;
    }
  }, [blocks]);

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* Block list */}
      <div
        ref={listRef}
        className="flex-1 overflow-y-auto px-4 py-3 space-y-3 scrollbar-thin"
      >
        {blocks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-[var(--text-4)]">
            <TerminalSquare className="w-10 h-10 opacity-30" />
            <p className="text-[13px]">No commands yet</p>
            <p className="text-[11px]">Type a command below to get started.</p>
          </div>
        ) : (
          blocks.map((block) => <CommandBlock key={block.id} block={block} />)
        )}
      </div>

      {/* Command input */}
      <CommandInput
        sessionId={sessionId}
        onExecute={executeCommand}
        onAiSubmit={onAiSubmit}
        isExecuting={isExecuting}
        isAiLoading={isAiLoading}
        aiError={aiError}
        onClearAiError={onClearAiError}
      />
    </div>
  );
}

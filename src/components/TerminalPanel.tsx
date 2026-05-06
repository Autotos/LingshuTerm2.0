import { useRef } from 'react';
import { useTerminal } from '@/hooks/useTerminal';

interface TerminalPanelProps {
  sessionId: string | null;
  onFit?: () => void;
}

export function TerminalPanel({ sessionId }: TerminalPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useTerminal({
    containerRef,
    sessionId,
  });

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div ref={containerRef} className="flex-1 overflow-hidden" />
      <div className="flex gap-4 px-4 pt-1 pb-1 text-[10px] text-[var(--text-4)]">
        <span><kbd>Enter</kbd> execute</span>
        <span><kbd>Ctrl+L</kbd> clear</span>
        <span><kbd>Ctrl+C</kbd> cancel</span>
      </div>
    </div>
  );
}

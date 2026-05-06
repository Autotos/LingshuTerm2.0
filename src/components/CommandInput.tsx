import { useState, useRef, useCallback, type KeyboardEvent } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Loader2, Zap } from 'lucide-react';
import { detectInputType } from '@/lib/aiDetect';

interface CommandInputProps {
  sessionId: string | null;
  onExecute: (command: string) => Promise<string | null>;
  onAiSubmit?: (query: string) => Promise<void>;
  isExecuting: boolean;
  isAiLoading?: boolean;
  aiError?: string | null;
  onClearAiError?: () => void;
}

export function CommandInput({ sessionId, onExecute, onAiSubmit, isExecuting, isAiLoading, aiError, onClearAiError }: CommandInputProps) {
  const [value, setValue] = useState('');
  const [historyIndex, setHistoryIndex] = useState(-1);
  const historyRef = useRef<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // Detect if current input looks like AI query
  const detected = value.trim() ? detectInputType(value.trim()) : null;
  const isAiMode = detected?.type === 'ai';
  const isBusy = isExecuting || (isAiLoading ?? false);

  const handleSubmit = useCallback(async () => {
    const cmd = value.trim();
    if (!cmd || isBusy) return;

    historyRef.current.push(cmd);
    setHistoryIndex(-1);
    setValue('');

    const detection = detectInputType(cmd);
    if (detection.type === 'ai' && onAiSubmit) {
      onClearAiError?.();
      await onAiSubmit(detection.text);
    } else {
      await onExecute(cmd);
    }
  }, [value, isBusy, onExecute, onAiSubmit, onClearAiError]);

  const handleCancel = useCallback(async () => {
    if (!sessionId) return;
    // Send Ctrl+C (ETX) to the PTY to interrupt the running command
    try {
      await invoke('write_to_terminal', { sessionId, data: '\x03' });
    } catch (err) {
      console.error('Failed to send SIGINT:', err);
    }
  }, [sessionId]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
        return;
      }

      // Ctrl+C while a command is running
      if (e.key === 'c' && e.ctrlKey && isExecuting) {
        e.preventDefault();
        handleCancel();
        return;
      }

      // History navigation
      const history = historyRef.current;
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (history.length === 0) return;
        const next = historyIndex === -1 ? history.length - 1 : Math.max(0, historyIndex - 1);
        setHistoryIndex(next);
        setValue(history[next]);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (historyIndex === -1) return;
        const next = historyIndex + 1;
        if (next >= history.length) {
          setHistoryIndex(-1);
          setValue('');
        } else {
          setHistoryIndex(next);
          setValue(history[next]);
        }
      }
    },
    [handleSubmit, handleCancel, isExecuting, historyIndex],
  );

  return (
    <div className="flex-shrink-0 border-t border-[var(--border)] bg-[var(--deep)]">
      {/* AI error banner */}
      {aiError && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-[var(--red)]/10 border-b border-[var(--red)]/20">
          <span className="text-[10px] text-[var(--red)] flex-1 truncate">{aiError}</span>
          <button
            onClick={onClearAiError}
            className="text-[9px] text-[var(--red)] hover:text-[var(--text-1)] transition-colors"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="flex items-center gap-2 px-3 py-2">
        {/* Prompt indicator — changes for AI mode */}
        <span className={`text-[13px] font-mono select-none flex-shrink-0 ${
          isAiMode ? 'text-[var(--magenta)]' : 'text-[var(--accent-hi)]'
        }`}>
          {isAiMode ? '>' : '$'}
        </span>

        {/* Input field */}
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => { setValue(e.target.value); onClearAiError?.(); }}
          onKeyDown={handleKeyDown}
          disabled={!sessionId}
          placeholder={
            isAiLoading ? 'AI thinking...'
            : isExecuting ? 'Running...'
            : 'Command or /ai + natural language...'
          }
          autoFocus
          className={`flex-1 bg-transparent text-[13px] font-mono text-[var(--text-1)] placeholder:text-[var(--text-4)] outline-none ${
            isBusy ? 'opacity-50' : ''
          }`}
        />

        {/* AI mode badge */}
        {isAiMode && !isBusy && (
          <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] text-[var(--magenta)] border border-[var(--magenta)]/30 bg-[var(--magenta)]/5">
            <Zap className="w-2.5 h-2.5" />
            AI
          </span>
        )}

        {/* Status / action button */}
        {isAiLoading ? (
          <span className="flex items-center gap-1.5 px-2 py-1 rounded text-[10px] text-[var(--magenta)]">
            <Loader2 className="w-3 h-3 animate-spin" />
          </span>
        ) : isExecuting ? (
          <button
            onClick={handleCancel}
            title="Cancel (Ctrl+C)"
            className="flex items-center gap-1.5 px-2 py-1 rounded text-[10px] text-[var(--red)] border border-[var(--red)]/30 hover:bg-[var(--red)]/10 transition-colors"
          >
            <Loader2 className="w-3 h-3 animate-spin" />
            Cancel
          </button>
        ) : (
          <kbd className="text-[10px] text-[var(--text-4)] border border-[var(--border)] rounded px-1.5 py-0.5">
            Enter
          </kbd>
        )}
      </div>

      {/* Hints */}
      <div className="flex items-center gap-3 px-3 pb-1.5 text-[9px] text-[var(--text-4)]">
        <span>Enter execute</span>
        <span>&middot;</span>
        <span>&uarr;&darr; history</span>
        <span>&middot;</span>
        <span>/ai ask AI</span>
        <span>&middot;</span>
        <span>Ctrl+C cancel</span>
      </div>
    </div>
  );
}

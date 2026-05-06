import type { SessionMode } from '@/models/sessionData';
import { CommandInput } from './CommandInput';

interface BottomInputAreaProps {
  sessionId: string | null;
  activeView: SessionMode;
  /** Blocks mode: 命令执行回调 */
  executeCommand: (command: string) => Promise<string | null>;
  /** Blocks mode: 是否正在执行中 */
  isExecuting: boolean;
  /** Blocks mode: AI 查询提交 */
  onAiSubmit?: (query: string) => Promise<void>;
  /** Blocks mode: AI 是否加载中 */
  isAiLoading?: boolean;
  /** Blocks mode: AI 错误信息 */
  aiError?: string | null;
  /** Blocks mode: 清除 AI 错误 */
  onClearAiError?: () => void;
}

/**
 * 固定底部输入栏 — 仅在 Blocks 模式下显示。
 * Terminal 模式由 xterm.js 原生处理输入，Editor 模式无需命令行。
 */
export function BottomInputArea({
  sessionId,
  activeView,
  executeCommand,
  isExecuting,
  onAiSubmit,
  isAiLoading,
  aiError,
  onClearAiError,
}: BottomInputAreaProps) {
  // Terminal / Editor 模式不显示底部输入栏
  if (activeView !== 'blocks') return null;

  return (
    <div className="flex-shrink-0 border-t border-[var(--border)] bg-[var(--deep)]">
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

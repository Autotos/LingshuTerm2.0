import { useState } from 'react';
import {
  CheckCircle2,
  XCircle,
  Loader2,
  Circle,
  SkipForward,
  ChevronDown,
  ChevronRight,
  Play,
  Pause,
  RotateCcw,
  Trash2,
  MessageSquare,
} from 'lucide-react';
import { useSessionGroups, useTaskStore } from '@/stores/taskStore';
import type { TaskGroup, TaskItem, TaskStatus } from '@/models/task';
import { stripAnsi } from '@/lib/ansi';

interface TaskBoardProps {
  sessionId: string | null;
  collapsed: boolean;
}

export function TaskBoard({ sessionId, collapsed }: TaskBoardProps) {
  const groups = useSessionGroups(sessionId);

  if (collapsed) return null;

  if (groups.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2 text-[var(--text-4)]">
        <MessageSquare className="w-6 h-6" />
        <span className="text-[11px]">No AI tasks yet</span>
        <span className="text-[9px]">Type /ai or natural language in Blocks input</span>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-2 space-y-2">
      {groups.map((group) => (
        <TaskGroupCard key={group.id} group={group} />
      ))}
    </div>
  );
}

function TaskGroupCard({ group }: { group: TaskGroup }) {
  const [expanded, setExpanded] = useState(true);
  const { toggleGroupPause, removeGroup, retryTask, skipTask } = useTaskStore();

  const completed = group.tasks.filter((t) => t.status === 'success').length;
  const total = group.tasks.length;
  const hasFailed = group.tasks.some((t) => t.status === 'error');

  return (
    <div className="rounded border border-[var(--border)] bg-[var(--surface)] overflow-hidden animate-block-in">
      {/* Group header */}
      <div className="flex items-center gap-2 px-2.5 py-2 cursor-pointer hover:bg-[var(--veil)] transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? (
          <ChevronDown className="w-3 h-3 text-[var(--text-3)] flex-shrink-0" />
        ) : (
          <ChevronRight className="w-3 h-3 text-[var(--text-3)] flex-shrink-0" />
        )}
        <span className="flex-1 text-[11px] text-[var(--text-2)] truncate">{group.query}</span>
        <span className="text-[9px] text-[var(--text-4)] flex-shrink-0">{completed}/{total}</span>
      </div>

      {/* Progress bar */}
      <div className="h-[2px] bg-[var(--raised)]">
        <div
          className={`h-full transition-all duration-300 ${hasFailed ? 'bg-[var(--red)]' : 'bg-[var(--green)]'}`}
          style={{ width: `${total > 0 ? (completed / total) * 100 : 0}%` }}
        />
      </div>

      {expanded && (
        <>
          {/* Task list */}
          <div className="px-1 py-1">
            {group.tasks.map((task) => (
              <TaskItemRow
                key={task.id}
                task={task}
                onRetry={() => retryTask(group.id, task.id)}
                onSkip={() => skipTask(group.id, task.id)}
              />
            ))}
          </div>

          {/* Group actions */}
          <div className="flex items-center gap-1 px-2.5 py-1.5 border-t border-[var(--border)]">
            <button
              onClick={(e) => { e.stopPropagation(); toggleGroupPause(group.id); }}
              className="task-action-btn"
              title={group.paused ? 'Resume' : 'Pause'}
            >
              {group.paused ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); removeGroup(group.id); }}
              className="task-action-btn text-[var(--red)]"
              title="Remove"
            >
              <Trash2 className="w-3 h-3" />
            </button>
            {group.paused && (
              <span className="text-[9px] text-[var(--yellow)] ml-1">Paused</span>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function TaskItemRow({
  task,
  onRetry,
  onSkip,
}: {
  task: TaskItem;
  onRetry: () => void;
  onSkip: () => void;
}) {
  const [showOutput, setShowOutput] = useState(false);

  return (
    <div className="px-1.5 py-1">
      <div className="flex items-center gap-2">
        <StatusIcon status={task.status} />
        <div className="flex-1 min-w-0">
          <div className="text-[10px] text-[var(--text-2)] truncate">{task.description}</div>
          <div className="text-[9px] text-[var(--text-4)] font-mono truncate">{task.command}</div>
        </div>
        <div className="flex items-center gap-0.5 flex-shrink-0">
          {task.status === 'error' && (
            <>
              <button onClick={onRetry} className="task-action-btn" title="Retry">
                <RotateCcw className="w-2.5 h-2.5" />
              </button>
              <button onClick={onSkip} className="task-action-btn" title="Skip">
                <SkipForward className="w-2.5 h-2.5" />
              </button>
            </>
          )}
          {task.output && (
            <button
              onClick={() => setShowOutput(!showOutput)}
              className="task-action-btn"
              title="Toggle output"
            >
              {showOutput ? <ChevronDown className="w-2.5 h-2.5" /> : <ChevronRight className="w-2.5 h-2.5" />}
            </button>
          )}
        </div>
      </div>
      {showOutput && task.output && (
        <pre className="mt-1 ml-5 p-1.5 rounded bg-[var(--raised)] text-[9px] text-[var(--text-3)] font-mono overflow-x-auto max-h-[100px] overflow-y-auto">
          {stripAnsi(task.output).slice(-2000)}
        </pre>
      )}
      {task.error && (
        <div className="mt-0.5 ml-5 text-[9px] text-[var(--red)]">{task.error}</div>
      )}
    </div>
  );
}

function StatusIcon({ status }: { status: TaskStatus }) {
  switch (status) {
    case 'success':
      return <CheckCircle2 className="w-3 h-3 text-[var(--green)] flex-shrink-0" />;
    case 'error':
      return <XCircle className="w-3 h-3 text-[var(--red)] flex-shrink-0" />;
    case 'running':
      return <Loader2 className="w-3 h-3 text-[var(--yellow)] animate-spin flex-shrink-0" />;
    case 'skipped':
      return <SkipForward className="w-3 h-3 text-[var(--text-4)] flex-shrink-0" />;
    default:
      return <Circle className="w-3 h-3 text-[var(--text-4)] flex-shrink-0" />;
  }
}

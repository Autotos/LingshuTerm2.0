import { useMemo } from 'react';
import { create } from 'zustand';
import type { TaskGroup, TaskItem, TaskStatus } from '@/models/task';
import { generateGroupId, generateTaskId } from '@/models/task';
import type { AiTaskStep } from '@/lib/aiService';

interface TaskState {
  /** All task groups, newest first */
  groups: TaskGroup[];
  /** Currently active group id (for highlighting in TaskBoard) */
  activeGroupId: string | null;

  /** Create a new task group from AI-generated steps */
  createGroup: (sessionId: string, query: string, steps: AiTaskStep[]) => string;
  /** Set the active group */
  setActiveGroup: (groupId: string | null) => void;
  /** Update a specific task's status */
  setTaskStatus: (groupId: string, taskId: string, status: TaskStatus) => void;
  /** Append output to a task */
  appendTaskOutput: (groupId: string, taskId: string, data: string) => void;
  /** Complete a task with exit code */
  completeTask: (groupId: string, taskId: string, exitCode: number) => void;
  /** Set task error */
  setTaskError: (groupId: string, taskId: string, error: string) => void;
  /** Pause/resume a group's queue */
  toggleGroupPause: (groupId: string) => void;
  /** Skip a failed/pending task */
  skipTask: (groupId: string, taskId: string) => void;
  /** Retry a failed task (reset to pending) */
  retryTask: (groupId: string, taskId: string) => void;
  /** Remove a task group */
  removeGroup: (groupId: string) => void;
  /** Clear all groups for a session */
  clearSessionGroups: (sessionId: string) => void;
  /** 用持久化数据全量替换某 session 的 groups（启动恢复用） */
  setSessionGroups: (sessionId: string, groups: TaskGroup[]) => void;
}

function updateTask(
  groups: TaskGroup[],
  groupId: string,
  taskId: string,
  updater: (task: TaskItem) => TaskItem,
): TaskGroup[] {
  return groups.map((g) =>
    g.id === groupId
      ? { ...g, tasks: g.tasks.map((t) => (t.id === taskId ? updater(t) : t)) }
      : g,
  );
}

export const useTaskStore = create<TaskState>((set) => ({
  groups: [],
  activeGroupId: null,

  createGroup: (sessionId, query, steps) => {
    const groupId = generateGroupId();
    const tasks: TaskItem[] = steps.map((step, i) => ({
      id: generateTaskId(i),
      description: step.description,
      command: step.command,
      status: 'pending',
      output: '',
      exitCode: null,
      error: null,
    }));

    set((s) => ({
      groups: [
        {
          id: groupId,
          query,
          sessionId,
          tasks,
          createdAt: new Date().toISOString(),
          paused: false,
        },
        ...s.groups,
      ],
      activeGroupId: groupId,
    }));

    return groupId;
  },

  setActiveGroup: (groupId) => set({ activeGroupId: groupId }),

  setTaskStatus: (groupId, taskId, status) =>
    set((s) => ({
      groups: updateTask(s.groups, groupId, taskId, (t) => ({
        ...t,
        status,
      })),
    })),

  appendTaskOutput: (groupId, taskId, data) =>
    set((s) => ({
      groups: updateTask(s.groups, groupId, taskId, (t) => ({
        ...t,
        output: t.output + data,
      })),
    })),

  completeTask: (groupId, taskId, exitCode) =>
    set((s) => {
      const updated = updateTask(s.groups, groupId, taskId, (t) => ({
        ...t,
        status: (exitCode === 0 ? 'success' : 'error') as TaskStatus,
        exitCode,
        error: exitCode !== 0 ? `Exit code: ${exitCode}` : null,
      }));
      // Auto-pause on failure
      if (exitCode !== 0) {
        return {
          groups: updated.map((g) =>
            g.id === groupId ? { ...g, paused: true } : g,
          ),
        };
      }
      return { groups: updated };
    }),

  setTaskError: (groupId, taskId, error) =>
    set((s) => {
      const updated = updateTask(s.groups, groupId, taskId, (t) => ({
        ...t,
        status: 'error' as TaskStatus,
        error,
      }));
      // Auto-pause on error
      return {
        groups: updated.map((g) =>
          g.id === groupId ? { ...g, paused: true } : g,
        ),
      };
    }),

  toggleGroupPause: (groupId) =>
    set((s) => ({
      groups: s.groups.map((g) =>
        g.id === groupId ? { ...g, paused: !g.paused } : g,
      ),
    })),

  skipTask: (groupId, taskId) =>
    set((s) => ({
      groups: updateTask(s.groups, groupId, taskId, (t) => ({
        ...t,
        status: 'skipped',
      })),
    })),

  retryTask: (groupId, taskId) =>
    set((s) => ({
      groups: s.groups.map((g) =>
        g.id === groupId
          ? {
              ...g,
              paused: false,
              tasks: g.tasks.map((t) =>
                t.id === taskId
                  ? { ...t, status: 'pending', output: '', exitCode: null, error: null }
                  : t,
              ),
            }
          : g,
      ),
    })),

  removeGroup: (groupId) =>
    set((s) => ({
      groups: s.groups.filter((g) => g.id !== groupId),
      activeGroupId: s.activeGroupId === groupId ? null : s.activeGroupId,
    })),

  clearSessionGroups: (sessionId) =>
    set((s) => ({
      groups: s.groups.filter((g) => g.sessionId !== sessionId),
    })),

  setSessionGroups: (sessionId, groups) =>
    set((s) => ({
      groups: [
        ...groups.filter((g) => g.sessionId === sessionId),
        ...s.groups.filter((g) => g.sessionId !== sessionId),
      ],
    })),
}));

/** Selector: get groups for a specific session */
export function useSessionGroups(sessionId: string | null) {
  // 同 useSessionBlocks：仅订阅稳定的 groups 引用，由 useMemo 缓存过滤结果，避免无限循环
  const groups = useTaskStore((s) => s.groups);
  return useMemo(
    () => (sessionId ? groups.filter((g) => g.sessionId === sessionId) : []),
    [groups, sessionId],
  );
}

/** Selector: get the next pending task in a group */
export function getNextPendingTask(group: TaskGroup): TaskItem | null {
  return group.tasks.find((t) => t.status === 'pending') ?? null;
}

/** Selector: check if a group has any running task */
export function hasRunningTask(group: TaskGroup): boolean {
  return group.tasks.some((t) => t.status === 'running');
}

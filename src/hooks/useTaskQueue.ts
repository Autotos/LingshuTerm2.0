import { useEffect, useRef, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { useTaskStore, getNextPendingTask, hasRunningTask } from '@/stores/taskStore';
import type { BlockCmdStartedPayload, BlockCmdCompletedPayload } from '@/models/block';

interface UseTaskQueueOptions {
  sessionId: string | null;
}

/**
 * Task queue execution engine.
 * Sequentially executes pending tasks in active groups.
 * Auto-pauses on failure, supports retry/skip.
 * Mount at Layout level.
 */
export function useTaskQueue({ sessionId }: UseTaskQueueOptions) {
  const processingRef = useRef(false);
  const currentTaskRef = useRef<{ groupId: string; taskId: string; commandId: string } | null>(null);

  // Process the next task in queue
  const processNext = useCallback(async () => {
    if (!sessionId || processingRef.current) return;

    const { groups, setTaskStatus, setTaskError } = useTaskStore.getState();

    // Find the first non-paused group that has pending tasks and no running tasks
    for (const group of groups) {
      if (group.sessionId !== sessionId) continue;
      if (group.paused) continue;
      if (hasRunningTask(group)) return; // Wait for current task

      const next = getNextPendingTask(group);
      if (!next) continue;

      // Execute this task
      processingRef.current = true;
      setTaskStatus(group.id, next.id, 'running');

      try {
        const commandId: string = await invoke('execute_block_command', {
          sessionId,
          command: next.command,
        });
        currentTaskRef.current = { groupId: group.id, taskId: next.id, commandId };
      } catch (err) {
        setTaskError(group.id, next.id, err instanceof Error ? err.message : String(err));
        currentTaskRef.current = null;
      } finally {
        processingRef.current = false;
      }
      return;
    }
  }, [sessionId]);

  // Listen to PTY events to track task completion
  useEffect(() => {
    if (!sessionId) return;

    const unlisteners: UnlistenFn[] = [];

    const setup = async () => {
      // block-cmd-started: confirm task started (already set to running)
      unlisteners.push(
        await listen<BlockCmdStartedPayload>('block-cmd-started', (_event) => {
          // Task already marked running in processNext
        }),
      );

      // block-cmd-completed: mark task done, trigger next
      unlisteners.push(
        await listen<BlockCmdCompletedPayload>('block-cmd-completed', (event) => {
          const { command_id, exit_code } = event.payload;
          const current = currentTaskRef.current;
          if (current && current.commandId === command_id) {
            useTaskStore.getState().completeTask(current.groupId, current.taskId, exit_code);
            currentTaskRef.current = null;
            // Trigger next task after a short delay
            setTimeout(processNext, 100);
          }
        }),
      );

      // block-output: StreamCleaner-sanitized stream for task output
      unlisteners.push(
        await listen<{ session_id: string; data: string }>('block-output', (event) => {
          const { session_id, data } = event.payload;
          if (session_id !== sessionId) return;

          const current = currentTaskRef.current;
          if (current) {
            useTaskStore.getState().appendTaskOutput(current.groupId, current.taskId, data);
          }
        }),
      );
    };

    setup();

    return () => {
      unlisteners.forEach((fn) => fn());
    };
  }, [sessionId, processNext]);

  // Watch for store changes that should trigger queue processing
  useEffect(() => {
    const unsub = useTaskStore.subscribe(() => {
      // Check if we should process next task
      if (!processingRef.current && !currentTaskRef.current) {
        processNext();
      }
    });
    return unsub;
  }, [processNext]);

  // Manual trigger for retry/resume
  const triggerProcess = useCallback(() => {
    processNext();
  }, [processNext]);

  return { triggerProcess };
}

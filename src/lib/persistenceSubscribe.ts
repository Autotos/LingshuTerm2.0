/**
 * Session 持久化订阅编排
 *
 * 职责：
 *  1) 监听四个 store 的变更，按 session 分组、debounced 写回磁盘
 *  2) 提供 restoreAll() 启动恢复：list_sessions → 逐个 load_session → hydrate stores
 *  3) 提供 flushAll() 强制立刻落盘（关闭窗口前调用）
 *
 * 设计要点：
 *  - 持久化失败仅 console.error，不影响 UI
 *  - hydrate 过程用 `paused` 标志抑制反向写回
 *  - 各类数据独立 debounce，避免相互拖累
 */
import type { CommandBlock } from '@/models/block';
import type { SessionInfo } from '@/models/session';
import type { BlocksData, EditorData, SessionMode } from '@/models/sessionData';
import type { TaskGroup } from '@/models/task';

import {
  appendTerminalBatch,
  clearSession as clearSessionCmd,
  listSessions,
  loadSession,
  saveSessionBlocks,
  saveSessionEditor,
  saveSessionMeta,
  type SessionMetaPayload,
  type TerminalLogEntry,
} from './persistenceService';

import { useCommandStore } from '@/stores/commandStore';
import { useEditorStore } from '@/stores/editorStore';
import { useSessionStore } from '@/stores/sessionStore';
import { useTaskStore } from '@/stores/taskStore';

// -------------------------- 全局状态 --------------------------

const SAVE_DEBOUNCE_MS = 400;
const TERM_FLUSH_MS = 200;
const TERM_FLUSH_BYTES = 16 * 1024;

/** 当正在从磁盘恢复数据时开启，避免订阅回写又把刚 hydrate 的状态覆盖回磁盘 */
let paused = false;

const metaTimers = new Map<string, ReturnType<typeof setTimeout>>();
const blocksTimers = new Map<string, ReturnType<typeof setTimeout>>();
const editorTimers = new Map<string, ReturnType<typeof setTimeout>>();

interface TermBuffer {
  entries: TerminalLogEntry[];
  byteCount: number;
  timer: ReturnType<typeof setTimeout> | null;
}
const termBuffers = new Map<string, TermBuffer>();

/** 卸载订阅的 dispose 集合 */
const disposers: Array<() => void> = [];
let started = false;

// -------------------------- 工具函数 --------------------------

function schedule(
  map: Map<string, ReturnType<typeof setTimeout>>,
  key: string,
  fn: () => Promise<void> | void,
) {
  if (paused) return;
  const prev = map.get(key);
  if (prev) clearTimeout(prev);
  const handle = setTimeout(async () => {
    map.delete(key);
    try {
      await fn();
    } catch (e) {
      console.error(`[persistence] save for ${key} failed:`, e);
    }
  }, SAVE_DEBOUNCE_MS);
  map.set(key, handle);
}

/** 立即 flush 所有挂起的写任务，等待它们完成 */
async function flushTimers(
  map: Map<string, ReturnType<typeof setTimeout>>,
  executors: Map<string, () => Promise<void> | void>,
) {
  const keys = Array.from(map.keys());
  for (const k of keys) {
    const h = map.get(k);
    if (h) clearTimeout(h);
    map.delete(k);
  }
  await Promise.allSettled(keys.map((k) => executors.get(k)?.()));
}

/** 将 SessionInfo 转为磁盘上的 meta payload */
function toMetaPayload(info: SessionInfo): SessionMetaPayload {
  const now = new Date().toISOString();
  return {
    id: info.id,
    name: info.connectionName || info.title || info.id,
    mode: (info.mode as SessionMode) ?? 'terminal',
    createdAt: info.createdAt ?? now,
    lastAccessed: info.lastAccessed ?? now,
    shell: info.shell,
    cwd: info.cwd,
    status: info.status,
    connectionType: info.connectionType,
    connectionName: info.connectionName,
  };
}

/** 聚合 commandStore + taskStore 生成 blocks.json 内容 */
function buildBlocksData(sessionId: string): BlocksData {
  const blocks = useCommandStore
    .getState()
    .blocks.filter((b) => b.sessionId === sessionId);
  const groups = useTaskStore
    .getState()
    .groups.filter((g) => g.sessionId === sessionId);
  return {
    type: 'blocks',
    tasks: blocks,
    currentFlow: groups[0]?.query ?? '',
    taskGroups: groups,
  };
}

// -------------------------- 订阅启动 --------------------------

export function startPersistenceSubscriptions() {
  if (started) return;
  started = true;

  // -- 1) sessionStore：每个 session 的 meta ----
  const unsubSession = useSessionStore.subscribe((state, prev) => {
    if (state.sessions === prev.sessions) return;
    // 找到新增 / 变化的 session
    for (const [id, session] of state.sessions) {
      if (prev.sessions.get(id) !== session) {
        schedule(metaTimers, id, () => saveSessionMeta(id, toMetaPayload(session)));
      }
    }
    // 找到被移除的 session → 清理磁盘，同时取消所有 pending timers / buffer
    for (const [id] of prev.sessions) {
      if (!state.sessions.has(id)) {
        cancelPendingFor(id);
        clearSessionCmd(id).catch((e) =>
          console.error(`[persistence] clear_session(${id}) failed:`, e),
        );
      }
    }
  });
  disposers.push(unsubSession);

  // -- 2) commandStore：blocks 变更时按 sessionId 重写 blocks.json ----
  const unsubCommand = useCommandStore.subscribe((state, prev) => {
    if (state.blocks === prev.blocks) return;
    const changed = diffSessionIds(prev.blocks, state.blocks, (b) => b.sessionId, (b) => b.id);
    for (const sid of changed) {
      schedule(blocksTimers, sid, () => saveSessionBlocks(sid, buildBlocksData(sid)));
    }
  });
  disposers.push(unsubCommand);

  // -- 3) taskStore：groups 变更时同步写 blocks.json（合并存储）----
  const unsubTask = useTaskStore.subscribe((state, prev) => {
    if (state.groups === prev.groups) return;
    const changed = diffSessionIds(prev.groups, state.groups, (g) => g.sessionId, (g) => g.id);
    for (const sid of changed) {
      schedule(blocksTimers, sid, () => saveSessionBlocks(sid, buildBlocksData(sid)));
    }
  });
  disposers.push(unsubTask);

  // -- 4) editorStore：bySession 变更时按 sessionId 重写 editor.json ----
  const unsubEditor = useEditorStore.subscribe((state, prev) => {
    if (state.bySession === prev.bySession) return;
    const keys = new Set<string>([
      ...Object.keys(state.bySession),
      ...Object.keys(prev.bySession),
    ]);
    for (const sid of keys) {
      if (state.bySession[sid] !== prev.bySession[sid]) {
        const data = state.bySession[sid];
        if (data) {
          schedule(editorTimers, sid, () => saveSessionEditor(sid, data));
        }
      }
    }
  });
  disposers.push(unsubEditor);
}

export function stopPersistenceSubscriptions() {
  for (const d of disposers) {
    try {
      d();
    } catch {
      /* ignore */
    }
  }
  disposers.length = 0;
  started = false;
}

// 找出 prev / next 中哪些 sessionId 发生了增量变化
function diffSessionIds<T>(
  prev: T[],
  next: T[],
  sidOf: (x: T) => string,
  idOf: (x: T) => string,
): Set<string> {
  const changed = new Set<string>();
  const prevById = new Map(prev.map((x) => [idOf(x), x]));
  const nextById = new Map(next.map((x) => [idOf(x), x]));
  for (const [k, v] of nextById) {
    if (prevById.get(k) !== v) changed.add(sidOf(v));
  }
  for (const [k, v] of prevById) {
    if (!nextById.has(k)) changed.add(sidOf(v));
  }
  return changed;
}

// -------------------------- 启动恢复 --------------------------

/**
 * 读取磁盘上全部 session，依次 hydrate 到各 store。
 * 恢复过程中 paused=true，避免订阅回写。
 */
export async function restoreAllSessions(options?: { terminalTailLimit?: number }) {
  paused = true;
  try {
    const ids = await listSessions();
    if (ids.length === 0) return { restoredCount: 0, activeId: null };

    const snapshots = await Promise.all(
      ids.map((id) =>
        loadSession(id, options?.terminalTailLimit).catch((e) => {
          console.error(`[persistence] loadSession(${id}) failed:`, e);
          return null;
        }),
      ),
    );

    const sessionInfos: SessionInfo[] = [];
    for (const snap of snapshots) {
      if (!snap || !snap.meta) continue;
      const m = snap.meta;
      const info: SessionInfo = {
        id: m.id,
        status: (m.status as SessionInfo['status']) ?? 'disconnected',
        shell: m.shell ?? 'default',
        cwd: m.cwd ?? '~',
        title: m.name ?? m.id,
        createdAt: m.createdAt,
        mode: m.mode,
        lastAccessed: m.lastAccessed,
        connectionType: m.connectionType,
        connectionName: m.connectionName,
      };
      sessionInfos.push(info);

      // blocks.json：拆分 commandBlocks 和 taskGroups
      if (snap.blocks) {
        const bd = snap.blocks;
        const cmdBlocks = (bd.tasks ?? []) as CommandBlock[];
        useCommandStore.getState().setSessionBlocks(m.id, cmdBlocks);
        const tg = (bd.taskGroups ?? []) as TaskGroup[];
        useTaskStore.getState().setSessionGroups(m.id, tg);
      }

      // editor.json
      if (snap.editor) {
        useEditorStore.getState().hydrate(m.id, snap.editor as EditorData);
      }
    }

    // 选最近访问的作为 active
    sessionInfos.sort((a, b) =>
      (b.lastAccessed ?? '').localeCompare(a.lastAccessed ?? ''),
    );
    const activeId = sessionInfos[0]?.id ?? null;
    useSessionStore.getState().hydrateSessions(sessionInfos, activeId);

    return { restoredCount: sessionInfos.length, activeId };
  } finally {
    paused = false;
  }
}

// -------------------------- Flush（窗口关闭前） --------------------------

export async function flushAll() {
  // 构建 executor：读取最新 state 直接写
  const metaExecutors = new Map<string, () => Promise<void>>();
  for (const id of metaTimers.keys()) {
    const session = useSessionStore.getState().sessions.get(id);
    if (session) {
      metaExecutors.set(id, () => saveSessionMeta(id, toMetaPayload(session)));
    }
  }
  const blocksExecutors = new Map<string, () => Promise<void>>();
  for (const id of blocksTimers.keys()) {
    blocksExecutors.set(id, () => saveSessionBlocks(id, buildBlocksData(id)));
  }
  const editorExecutors = new Map<string, () => Promise<void>>();
  for (const id of editorTimers.keys()) {
    const data = useEditorStore.getState().bySession[id];
    if (data) editorExecutors.set(id, () => saveSessionEditor(id, data));
  }

  await Promise.allSettled([
    flushTimers(metaTimers, metaExecutors),
    flushTimers(blocksTimers, blocksExecutors),
    flushTimers(editorTimers, editorExecutors),
    // 终端缓冲区也一并落盘
    ...Array.from(termBuffers.keys()).map((sid) => flushTerminalBuffer(sid)),
  ]);
}

// -------------------------- Terminal 日志透传 --------------------------

/** 供 useTerminal 直接调用，内部失败吞掉 */
export function persistTerminalChunk(
  sessionId: string,
  stream: 'stdout' | 'stderr' | 'input' | 'system',
  data: string,
) {
  if (paused || !sessionId || !data) return;
  let buf = termBuffers.get(sessionId);
  if (!buf) {
    buf = { entries: [], byteCount: 0, timer: null };
    termBuffers.set(sessionId, buf);
  }
  buf.entries.push({ ts: Date.now(), stream, data });
  buf.byteCount += data.length;

  // 达到容量阈值立刻 flush
  if (buf.byteCount >= TERM_FLUSH_BYTES) {
    void flushTerminalBuffer(sessionId);
    return;
  }
  // 否则起定时器，时间窗口合并
  if (!buf.timer) {
    buf.timer = setTimeout(() => {
      void flushTerminalBuffer(sessionId);
    }, TERM_FLUSH_MS);
  }
}

async function flushTerminalBuffer(sessionId: string) {
  const buf = termBuffers.get(sessionId);
  if (!buf) return;
  if (buf.timer) {
    clearTimeout(buf.timer);
    buf.timer = null;
  }
  if (buf.entries.length === 0) return;
  const entries = buf.entries;
  buf.entries = [];
  buf.byteCount = 0;
  try {
    await appendTerminalBatch(sessionId, entries);
  } catch (e) {
    console.debug('[persistence] append_terminal_batch failed:', e);
  }
}

/** 取消某 session 的所有 pending 定时器（删除 session 前调用） */
function cancelPendingFor(sessionId: string) {
  for (const map of [metaTimers, blocksTimers, editorTimers]) {
    const h = map.get(sessionId);
    if (h) {
      clearTimeout(h);
      map.delete(sessionId);
    }
  }
  const buf = termBuffers.get(sessionId);
  if (buf) {
    if (buf.timer) clearTimeout(buf.timer);
    termBuffers.delete(sessionId);
  }
}

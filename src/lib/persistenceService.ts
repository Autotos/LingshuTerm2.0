/**
 * Session 持久化薄封装
 *
 * 对应 src-tauri/src/persistence.rs 中的 7 个 invoke 命令。
 * 仅做「类型 + invoke 转发 + JSON 序列化」，不在此文件做 debounce / 订阅，
 * 那些由 Task 7 的订阅层负责。
 */
import { invoke } from '@tauri-apps/api/core';

import type { BlocksData, EditorData, SessionMode } from '@/models/sessionData';

/** 与 Rust 端保持一致的 meta 结构（可按需扩展） */
export interface SessionMetaPayload {
  id: string;
  name: string;
  mode: SessionMode;
  createdAt: string;
  lastAccessed: string;
  /** 透传 SessionInfo 里的其它非敏感字段 */
  shell?: string;
  cwd?: string;
  status?: string;
  connectionType?: string;
  connectionName?: string;
}

/** terminal.ndjson 每一行的记录结构 */
export interface TerminalLogEntry {
  /** 毫秒时间戳 */
  ts: number;
  /** stdout / stderr / input / system */
  stream: 'stdout' | 'stderr' | 'input' | 'system';
  /** 原始文本（可含 ANSI） */
  data: string;
}

/** load_session 的返回值结构，与 Rust 端 SessionSnapshot 对应 */
export interface SessionSnapshot {
  session_id: string;
  meta: SessionMetaPayload | null;
  blocks: BlocksData | null;
  editor: EditorData | null;
  terminal_tail: string[];
}

// ---------------------------- Commands ----------------------------

export function saveSessionMeta(sessionId: string, meta: SessionMetaPayload): Promise<void> {
  return invoke('save_session_meta', { sessionId, meta });
}

export function saveSessionBlocks(sessionId: string, blocks: BlocksData): Promise<void> {
  return invoke('save_session_blocks', { sessionId, blocks });
}

export function saveSessionEditor(sessionId: string, editor: EditorData): Promise<void> {
  return invoke('save_session_editor', { sessionId, editor });
}

/**
 * 追加一条终端日志。传入结构化对象，由本函数负责 stringify 并交由 Rust 追加 `\n`。
 */
export function appendTerminalLog(sessionId: string, entry: TerminalLogEntry): Promise<void> {
  return invoke('append_terminal_log', {
    sessionId,
    entry: JSON.stringify(entry),
  });
}

/**
 * 批量追加多条终端日志（单次 invoke，消减高频调用的性能抗抗代价）。
 */
export function appendTerminalBatch(
  sessionId: string,
  entries: TerminalLogEntry[],
): Promise<void> {
  if (entries.length === 0) return Promise.resolve();
  return invoke('append_terminal_batch', {
    sessionId,
    entries: entries.map((e) => JSON.stringify(e)),
  });
}

/**
 * 加载指定 session 的完整快照。
 * @param tailLimit  读取 terminal.ndjson 的尾部行数上限，默认 Rust 侧 2000
 */
export function loadSession(sessionId: string, tailLimit?: number): Promise<SessionSnapshot> {
  return invoke('load_session', { sessionId, tailLimit });
}

export function listSessions(): Promise<string[]> {
  return invoke('list_sessions');
}

export function clearSession(sessionId: string): Promise<void> {
  return invoke('clear_session', { sessionId });
}

// -------------------------- 解析辅助 --------------------------

/**
 * 安全解析 terminal_tail 的每一行 NDJSON。
 * 非法行会被跳过而不是抛错，保证回放不会因为一行脏数据全挂。
 */
export function parseTerminalTail(lines: string[]): TerminalLogEntry[] {
  const out: TerminalLogEntry[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const obj = JSON.parse(trimmed) as TerminalLogEntry;
      if (typeof obj?.data === 'string') out.push(obj);
    } catch {
      // 容错：把非 JSON 行当作 stdout 裸文本
      out.push({ ts: Date.now(), stream: 'stdout', data: trimmed });
    }
  }
  return out;
}

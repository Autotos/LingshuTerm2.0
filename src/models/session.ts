import type { SessionMode } from './sessionData';

export interface SessionInfo {
  id: string;
  status: SessionStatus;
  shell: string;
  cwd: string;
  title: string;
  createdAt: string;
  /** Connection type: 'pty' for local, or 'ssh'/'telnet'/'serial' */
  connectionType?: string;
  /** Display name for connection sessions */
  connectionName?: string;
  /** 当前视图模式，默认 terminal；切换 session 时用于恢复主区域视图（未设置时由 sessionStore.addSession 兵底填充） */
  mode?: SessionMode;
  /** ISO timestamp 最后一次激活时间，用于排序 / 持久化 */
  lastAccessed?: string;
}

export type SessionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

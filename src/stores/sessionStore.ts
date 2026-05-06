import { create } from 'zustand';
import type { SessionInfo } from '@/models/session';
import type { SessionMode } from '@/models/sessionData';

interface SessionState {
  sessions: Map<string, SessionInfo>;
  activeSessionId: string | null;
  addSession: (session: SessionInfo) => void;
  removeSession: (id: string) => void;
  setActiveSession: (id: string | null) => void;
  updateSessionStatus: (id: string, status: SessionInfo['status']) => void;
  /** 切换指定 session 的视图模式（terminal/blocks/editor） */
  setMode: (id: string, mode: SessionMode) => void;
  /** 更新最后激活时间 */
  touch: (id: string) => void;
  /** 用持久化数据批量恢复 sessions（启动恢复用） */
  hydrateSessions: (list: SessionInfo[], activeId?: string | null) => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  sessions: new Map(),
  activeSessionId: null,

  addSession: (session) =>
    set((state) => {
      const next = new Map(state.sessions);
      const now = new Date().toISOString();
      next.set(session.id, {
        ...session,
        mode: session.mode ?? 'terminal',
        lastAccessed: session.lastAccessed ?? now,
      });
      return { sessions: next, activeSessionId: session.id };
    }),

  removeSession: (id) =>
    set((state) => {
      const next = new Map(state.sessions);
      next.delete(id);
      const activeSessionId =
        state.activeSessionId === id
          ? (next.keys().next().value ?? null)
          : state.activeSessionId;
      return { sessions: next, activeSessionId };
    }),

  setActiveSession: (id) =>
    set((state) => {
      if (!id) return { activeSessionId: null };
      const session = state.sessions.get(id);
      if (!session) return { activeSessionId: id };
      const next = new Map(state.sessions);
      next.set(id, { ...session, lastAccessed: new Date().toISOString() });
      return { activeSessionId: id, sessions: next };
    }),

  updateSessionStatus: (id, status) =>
    set((state) => {
      const session = state.sessions.get(id);
      if (!session) return state;
      const next = new Map(state.sessions);
      next.set(id, { ...session, status });
      return { sessions: next };
    }),

  setMode: (id, mode) =>
    set((state) => {
      const session = state.sessions.get(id);
      if (!session || session.mode === mode) return state;
      const next = new Map(state.sessions);
      next.set(id, { ...session, mode });
      return { sessions: next };
    }),

  touch: (id) =>
    set((state) => {
      const session = state.sessions.get(id);
      if (!session) return state;
      const next = new Map(state.sessions);
      next.set(id, { ...session, lastAccessed: new Date().toISOString() });
      return { sessions: next };
    }),

  hydrateSessions: (list, activeId) =>
    set(() => {
      const map = new Map<string, SessionInfo>();
      for (const s of list) map.set(s.id, s);
      return {
        sessions: map,
        activeSessionId: activeId ?? (list[0]?.id ?? null),
      };
    }),
}));

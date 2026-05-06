import { useMemo } from 'react';
import { create } from 'zustand';
import type { EditorData } from '@/models/sessionData';
import { emptyEditorData } from '@/models/sessionData';

interface EditorState {
  /** Per-session editor data */
  bySession: Record<string, EditorData>;

  /** 确保某 session 有一份 EditorData，若不存在则用空数据初始化 */
  ensureSession: (sessionId: string) => void;
  /** 打开或更新一个虚拟文件，并设为活动文件 */
  openFile: (sessionId: string, path: string, content?: string) => void;
  /** 更新已打开文件的内容 */
  updateFile: (sessionId: string, path: string, content: string) => void;
  /** 关闭一个文件（从 openFiles 移除，但保留 files 中的内容以便重新打开） */
  closeFile: (sessionId: string, path: string) => void;
  /** 切换活动文件 */
  setActiveFile: (sessionId: string, path: string | null) => void;
  /** 用外部数据（持久化恢复）覆盖指定 session */
  hydrate: (sessionId: string, data: EditorData) => void;
  /** 清除指定 session 的编辑器数据 */
  clearSession: (sessionId: string) => void;
}

function withSession(
  state: EditorState['bySession'],
  sessionId: string,
  updater: (data: EditorData) => EditorData,
): EditorState['bySession'] {
  const current = state[sessionId] ?? emptyEditorData();
  return { ...state, [sessionId]: updater(current) };
}

export const useEditorStore = create<EditorState>((set) => ({
  bySession: {},

  ensureSession: (sessionId) =>
    set((s) =>
      s.bySession[sessionId]
        ? s
        : { bySession: { ...s.bySession, [sessionId]: emptyEditorData() } },
    ),

  openFile: (sessionId, path, content = '') =>
    set((s) => ({
      bySession: withSession(s.bySession, sessionId, (data) => {
        const existing = path in data.files;
        return {
          ...data,
          files: existing ? data.files : { ...data.files, [path]: content },
          openFiles: data.openFiles.includes(path)
            ? data.openFiles
            : [...data.openFiles, path],
          activeFile: path,
        };
      }),
    })),

  updateFile: (sessionId, path, content) =>
    set((s) => ({
      bySession: withSession(s.bySession, sessionId, (data) => ({
        ...data,
        files: { ...data.files, [path]: content },
      })),
    })),

  closeFile: (sessionId, path) =>
    set((s) => ({
      bySession: withSession(s.bySession, sessionId, (data) => {
        const nextOpen = data.openFiles.filter((p) => p !== path);
        const nextActive =
          data.activeFile === path
            ? (nextOpen[nextOpen.length - 1] ?? null)
            : data.activeFile;
        return { ...data, openFiles: nextOpen, activeFile: nextActive };
      }),
    })),

  setActiveFile: (sessionId, path) =>
    set((s) => ({
      bySession: withSession(s.bySession, sessionId, (data) => ({
        ...data,
        activeFile: path,
      })),
    })),

  hydrate: (sessionId, data) =>
    set((s) => ({ bySession: { ...s.bySession, [sessionId]: data } })),

  clearSession: (sessionId) =>
    set((s) => {
      if (!(sessionId in s.bySession)) return s;
      const next = { ...s.bySession };
      delete next[sessionId];
      return { bySession: next };
    }),
}));

/**
 * 选择器：获取指定 session 的 EditorData
 * 采用"稳定引用订阅 + useMemo 派生"两段式，避免 useSyncExternalStore 无限循环
 */
export function useSessionEditor(sessionId: string | null): EditorData {
  const bySession = useEditorStore((s) => s.bySession);
  return useMemo(
    () => (sessionId ? bySession[sessionId] ?? emptyEditorData() : emptyEditorData()),
    [bySession, sessionId],
  );
}

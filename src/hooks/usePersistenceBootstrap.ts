/**
 * 应用级启动恢复钩子：仅在顶层组件挂载一次
 * - 首次挂载时调用 restoreAllSessions() 从磁盘恢复
 * - 然后启动订阅写回
 * - 监听 beforeunload，窗口关闭前 flushAll()
 */
import { useEffect, useRef, useState } from 'react';

import {
  flushAll,
  startPersistenceSubscriptions,
  stopPersistenceSubscriptions,
} from '@/lib/persistenceSubscribe';

interface BootstrapState {
  ready: boolean;
  restoredCount: number;
  activeId: string | null;
  error: string | null;
}

export function usePersistenceBootstrap(): BootstrapState {
  const mountedRef = useRef(false);
  const [state, setState] = useState<BootstrapState>({
    ready: false,
    restoredCount: 0,
    activeId: null,
    error: null,
  });

  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;

    let cancelled = false;

    (async () => {
      try {
        // Start with a blank slate — no sessions auto-restored from disk.
        // Saved data in session.json is still available via Session Manager.
        startPersistenceSubscriptions();
        if (cancelled) return;
        setState({ ready: true, restoredCount: 0, activeId: null, error: null });
      } catch (e) {
        console.error('[persistence] bootstrap failed:', e);
        if (cancelled) return;
        startPersistenceSubscriptions();
        setState({
          ready: true,
          restoredCount: 0,
          activeId: null,
          error: (e as Error)?.message ?? String(e),
        });
      }
    })();

    const onBeforeUnload = () => {
      // flushAll 是 async，浏览器不会等待，但我们同步触发写任务可减少丢失窗口
      void flushAll();
    };
    window.addEventListener('beforeunload', onBeforeUnload);

    return () => {
      cancelled = true;
      window.removeEventListener('beforeunload', onBeforeUnload);
      stopPersistenceSubscriptions();
    };
  }, []);

  return state;
}

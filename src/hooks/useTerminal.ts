import { useEffect, useRef, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import type { PtyOutputPayload, SessionErrorPayload } from '@/models/terminal';
import { getWriteCommand, getResizeCommand } from '@/lib/sessionUtils';
import { persistTerminalChunk } from '@/lib/persistenceSubscribe';
import '@xterm/xterm/css/xterm.css';

// --- Diagnostic counter (Bug 1 investigation) ----------------------------
// StrictMode 下每个 Hook 实例分配递增 id，便于区分 mount-1 / mount-2 泄漏源。
const __useTerminalHookCounter = { n: 0 };

interface UseTerminalOptions {
  containerRef: React.RefObject<HTMLDivElement | null>;
  sessionId: string | null;
}

export function useTerminal({ containerRef, sessionId }: UseTerminalOptions) {
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const webglAddonRef = useRef<WebglAddon | null>(null);
  // 诊断用：本 Hook 实例 ID（模块级计数器分配）
  const instanceIdRef = useRef<number>(0);
  if (instanceIdRef.current === 0) {
    instanceIdRef.current = ++__useTerminalHookCounter.n;
  }

  // Initialize terminal
  useEffect(() => {
    if (!containerRef.current || terminalRef.current) return;

    const container = containerRef.current;

    const terminal = new Terminal({
      allowProposedApi: true,
      cursorBlink: true,
      cursorStyle: 'bar',
      fontFamily: 'Berkeley Mono, JetBrains Mono, SF Mono, Monaco, Menlo, Consolas, monospace',
      fontSize: 13,
      lineHeight: 1.4,
      theme: {
        background: '#0e0e0d',
        foreground: '#faf9f6',
        cursor: '#a0917e',
        cursorAccent: '#0e0e0d',
        selectionBackground: 'rgba(160, 145, 126, 0.25)',
        black: '#1c1c1b',
        red: '#d4867c',
        green: '#8fba7a',
        yellow: '#c9b87a',
        blue: '#7ea8c7',
        magenta: '#b08dba',
        cyan: '#8fb8b8',
        white: '#afaeac',
        brightBlack: '#666469',
        brightRed: '#e09a90',
        brightGreen: '#a3c990',
        brightYellow: '#d9ca8e',
        brightBlue: '#95bad4',
        brightMagenta: '#c4a4cc',
        brightCyan: '#a6c9c9',
        brightWhite: '#faf9f6',
      },
      scrollback: 10000,
      convertEol: true,
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);

    // 1) 必须先 open，初始化 Terminal 的 _core / RenderService / Viewport
    terminal.open(container);

    // 2) 再加载 WebglAddon，否则内部访问 RenderService.dimensions 会报 undefined
    let webglAddon: WebglAddon | null = null;
    try {
      webglAddon = new WebglAddon();
      webglAddon.onContextLoss(() => {
        webglAddon?.dispose();
        webglAddonRef.current = null;
      });
      terminal.loadAddon(webglAddon);
      webglAddonRef.current = webglAddon;
    } catch (e) {
      console.warn('WebGL not available, falling back to canvas rendering', e);
      webglAddon = null;
    }

    // 3) 延迟到下一帧再 fit，避免容器宽高为 0 导致渲染异常
    const rafId = requestAnimationFrame(() => {
      try {
        if (container.clientWidth > 0 && container.clientHeight > 0) {
          fitAddon.fit();
        }
      } catch (e) {
        console.warn('fitAddon.fit() failed:', e);
      }
    });

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    return () => {
      cancelAnimationFrame(rafId);
      // 先卸载 WebGL，再 dispose terminal，并用 try/catch 容忍 StrictMode 下的重复调用
      try {
        webglAddonRef.current?.dispose();
      } catch {
        /* ignore */
      }
      webglAddonRef.current = null;
      try {
        terminal.dispose();
      } catch {
        /* ignore */
      }
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
  }, [containerRef]);

  // Setup Tauri event listeners
  //
  // 修复 Bug 1（字符/输出双写）：
  // 旧实现用共享的 `listenersRef.current` + `async setupListeners`，在
  // React StrictMode 双挂载下存在时序竞态 —— 两份 pending `listen()` 会先后
  // 把各自的 unlisten 函数 push 进同一个数组，导致两个 pty-output 监听器并存，
  // 每条输出被 `terminal.write()` 两次。
  //
  // 新实现：
  //   1) 改用本 Effect 闭包内的 `cancelled` flag + 局部 `localUnlisteners`，
  //      与其它 Effect run 完全隔离；
  //   2) 每个 listener 回调入口先 `if (cancelled) return`，即使 unlisten()
  //      未来得及执行也不会产生副作用；
  //   3) 若 await 期间已 cancelled，立即 unlisten 新返回的句柄，防止泄漏。
  useEffect(() => {
    if (!terminalRef.current) return;
    const hid = instanceIdRef.current;

    let cancelled = false;
    const localUnlisteners: UnlistenFn[] = [];

    (async () => {
      console.debug('[useTerminal#%d] setup start sid=%s', hid, sessionId);

      const unlistenOutput = await listen<PtyOutputPayload>(
        'pty-output',
        (event) => {
          if (cancelled) return;
          if (
            terminalRef.current &&
            event.payload.session_id === sessionId
          ) {
            console.debug(
              '[useTerminal#%d] pty-output WRITE sid=%s bytes=%d',
              hid, event.payload.session_id, event.payload.data.length,
            );
            terminalRef.current.write(event.payload.data);
            // 异步追加到 NDJSON（失败仅 debug，不阻塞渲染）
            persistTerminalChunk(sessionId, 'stdout', event.payload.data);
          }
        },
      );
      if (cancelled) {
        unlistenOutput();
        return;
      }
      localUnlisteners.push(unlistenOutput);

      const unlistenError = await listen<SessionErrorPayload>(
        'session-error',
        (event) => {
          if (cancelled) return;
          if (
            terminalRef.current &&
            event.payload.session_id === sessionId
          ) {
            terminalRef.current.writeln(
              `\r\n[Error: ${event.payload.error}]`,
            );
            persistTerminalChunk(sessionId, 'stderr', event.payload.error);
          }
        },
      );
      if (cancelled) {
        unlistenError();
        return;
      }
      localUnlisteners.push(unlistenError);

      console.debug(
        '[useTerminal#%d] setup complete sid=%s listeners=%d',
        hid, sessionId, localUnlisteners.length,
      );
    })();

    return () => {
      cancelled = true;
      console.debug(
        '[useTerminal#%d] cleanup disposing=%d sid=%s',
        hid, localUnlisteners.length, sessionId,
      );
      for (const unlisten of localUnlisteners) {
        unlisten();
      }
      localUnlisteners.length = 0;
    };
  }, [sessionId]);

  // Setup terminal data events (user input → PTY)
  useEffect(() => {
    if (!terminalRef.current || !sessionId) return;

    const terminal = terminalRef.current;

    const hid = instanceIdRef.current;
    const onData = terminal.onData(async (data: string) => {
      console.debug(
        '[useTerminal#%d] onData sid=%s bytes=%d',
        hid, sessionId, data.length,
      );
      try {
        await invoke(getWriteCommand(sessionId), { sessionId, data });
        persistTerminalChunk(sessionId, 'input', data);
      } catch (error) {
        console.error('Failed to write to terminal:', error);
      }
    });

    const onResize = terminal.onResize(async ({ cols, rows }) => {
      try {
        await invoke(getResizeCommand(sessionId), { sessionId, cols, rows });
      } catch (error) {
        console.error('Failed to resize terminal:', error);
      }
    });

    return () => {
      onData.dispose();
      onResize.dispose();
    };
  }, [sessionId]);

  const createSession = useCallback(async (shell?: string, cwd?: string) => {
    // Routes through the unified `create_session(config)` entry point.
    const newSessionId: string = await invoke('create_session', {
      config: {
        protocol: 'local',
        shell: shell ?? '',
        cwd: cwd || undefined,
      },
    });
    return newSessionId;
  }, []);

  const fit = useCallback(() => {
    fitAddonRef.current?.fit();
  }, []);

  return {
    terminal: terminalRef.current,
    createSession,
    fit,
  };
}

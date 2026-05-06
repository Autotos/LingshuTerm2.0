import { useRef, useState, useCallback, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useTerminal } from '@/hooks/useTerminal';
import { ContextMenu } from './ContextMenu';
import type { ContextMenuItem } from './ContextMenu';

interface TerminalPanelProps {
  sessionId: string | null;
  /** 外部告知面板当前是否可见（CSS hidden → visible 时触发 fit） */
  isVisible?: boolean;
}

export function TerminalPanel({ sessionId, isVisible }: TerminalPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);

  const { fit, clear, getSelection } = useTerminal({
    containerRef,
    sessionId,
  });

  // 面板从 hidden → visible 时重新 fit，补偿 display:none 期间容器尺寸归零
  useEffect(() => {
    if (!isVisible) return;
    // 延迟到下一帧确保 DOM 布局完成（display:none→h-full 切换后容器需要重排）
    const raf = requestAnimationFrame(() => fit());
    return () => cancelAnimationFrame(raf);
  }, [isVisible, fit]);

  // --- 右键菜单 ---
  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setMenu({ x: e.clientX, y: e.clientY });
    },
    [],
  );

  const handleCopy = useCallback(async () => {
    const sel = getSelection();
    if (sel) {
      try {
        await navigator.clipboard.writeText(sel);
      } catch {
        // 降级：fallback textarea 方式（极少触发）
        const ta = document.createElement('textarea');
        ta.value = sel;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
    }
  }, [getSelection]);

  const handlePaste = useCallback(async () => {
    if (!sessionId) return;
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        await invoke('write_to_terminal', { sessionId, data: text });
      }
    } catch {
      // clipboard read denied
    }
  }, [sessionId]);

  const menuItems: ContextMenuItem[] = [
    { label: 'Clear Screen', shortcut: 'Ctrl+L', onClick: clear },
    { label: 'Copy', shortcut: 'Ctrl+C', onClick: handleCopy },
    { label: 'Paste', shortcut: 'Ctrl+V', onClick: handlePaste, disabled: !sessionId },
  ];

  return (
    <div
      className="flex-1 flex flex-col min-h-0"
      onContextMenu={handleContextMenu}
    >
      <div ref={containerRef} className="flex-1 overflow-hidden" />

      {menu && (
        <ContextMenu
          items={menuItems}
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}

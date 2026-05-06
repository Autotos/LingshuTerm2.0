import { useEffect, useRef, useState, useCallback } from 'react';
import { TerminalSquare } from 'lucide-react';
import { useSessionBlocks, useCommandStore } from '@/stores/commandStore';
import { CommandBlock } from './CommandBlock';
import { ContextMenu } from './ContextMenu';
import type { ContextMenuItem } from './ContextMenu';

interface BlocksPanelProps {
  sessionId: string | null;
}

export function BlocksPanel({ sessionId }: BlocksPanelProps) {
  const blocks = useSessionBlocks(sessionId);
  const clearSessionBlocks = useCommandStore((s) => s.clearSessionBlocks);
  const listRef = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);

  // Auto-scroll to bottom when new blocks appear or running block gets output
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    // Only auto-scroll if user is near the bottom (within 120px)
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (isNearBottom) {
      el.scrollTop = el.scrollHeight;
    }
  }, [blocks]);

  // --- 右键菜单 ---
  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setMenu({ x: e.clientX, y: e.clientY });
    },
    [],
  );

  const handleClearBlocks = useCallback(() => {
    if (sessionId) {
      clearSessionBlocks(sessionId);
    }
  }, [sessionId, clearSessionBlocks]);

  const menuItems: ContextMenuItem[] = [
    {
      label: 'Clear Blocks',
      onClick: handleClearBlocks,
      disabled: !sessionId || blocks.length === 0,
    },
  ];

  return (
    <div
      className="flex-1 flex flex-col min-h-0 overflow-hidden"
      onContextMenu={handleContextMenu}
    >
      {/* Block list */}
      <div
        ref={listRef}
        className="flex-1 overflow-y-auto px-4 py-3 space-y-3 scrollbar-thin"
      >
        {blocks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-[var(--text-4)]">
            <TerminalSquare className="w-10 h-10 opacity-30" />
            <p className="text-[13px]">No commands yet</p>
            <p className="text-[11px]">Type a command below to get started.</p>
          </div>
        ) : (
          blocks.map((block) => <CommandBlock key={block.id} block={block} />)
        )}
      </div>

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

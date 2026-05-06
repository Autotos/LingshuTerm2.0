import { useEffect, useRef, useCallback } from 'react';

export interface ContextMenuItem {
  label: string;
  shortcut?: string;
  disabled?: boolean;
  danger?: boolean;
  onClick: () => void;
}

interface ContextMenuProps {
  items: ContextMenuItem[];
  /** 菜单显示坐标 */
  x: number;
  y: number;
  /** 关闭回调 */
  onClose: () => void;
}

export function ContextMenu({ items, x, y, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  const handleClickOutside = useCallback(
    (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    },
    [onClose],
  );

  useEffect(() => {
    // 延迟一帧绑定监听，避免右键事件本身触发关闭
    const raf = requestAnimationFrame(() => {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('contextmenu', handleClickOutside);
    });
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('contextmenu', handleClickOutside);
    };
  }, [handleClickOutside]);

  // 键盘关闭
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  // 调整位置防止溢出视口
  const adjustedPos = useAdjustedPosition(x, y, menuRef);

  return (
    <div
      ref={menuRef}
      className="fixed z-[9999] bg-[var(--deep)] border border-[var(--border)] rounded-md shadow-2xl py-1 min-w-[180px]"
      style={{ left: adjustedPos.x, top: adjustedPos.y }}
      onClick={(e) => e.stopPropagation()}
    >
      {items.map((item, i) => (
        <button
          key={i}
          disabled={item.disabled}
          onClick={() => {
            if (!item.disabled) {
              item.onClick();
              onClose();
            }
          }}
          className={`w-full flex items-center justify-between px-3 py-1.5 text-[12px] transition-colors ${
            item.disabled
              ? 'text-[var(--text-4)] cursor-not-allowed'
              : item.danger
                ? 'text-[var(--red)] hover:bg-[var(--red)]/10'
                : 'text-[var(--text-2)] hover:bg-[var(--veil)] hover:text-[var(--text-1)]'
          }`}
        >
          <span>{item.label}</span>
          {item.shortcut && (
            <span className="text-[10px] text-[var(--text-4)] ml-4">
              {item.shortcut}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

/** 根据视口边界调整菜单位置 */
function useAdjustedPosition(
  x: number,
  y: number,
  menuRef: React.RefObject<HTMLDivElement | null>,
) {
  // 默认用 ref 测量菜单尺寸；首帧未测量时用估计值
  const menu = menuRef.current;
  const menuW = menu?.offsetWidth ?? 200;
  const menuH = menu?.offsetHeight ?? 160;

  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const adjX = x + menuW > vw ? Math.max(0, vw - menuW - 8) : x;
  const adjY = y + menuH > vh ? Math.max(0, vh - menuH - 8) : y;

  return { x: adjX, y: adjY };
}

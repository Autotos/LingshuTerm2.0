import { Folder, FileText, Cog, Link as LinkIcon } from 'lucide-react';
import type { FileEntry } from '@/lib/outputDispatch';

interface FileGridProps {
  entries: FileEntry[];
}

const KIND_META: Record<
  FileEntry['kind'],
  { color: string; Icon: typeof Folder }
> = {
  dir:  { color: '#7ea8c7', Icon: Folder },
  exe:  { color: '#8fba7a', Icon: Cog },
  link: { color: '#8fb8b8', Icon: LinkIcon },
  file: { color: '#faf9f6', Icon: FileText },
};

/**
 * CSS Grid 布局的文件列表。auto-fill / minmax(180px,1fr) 实现宽度自适应多列。
 */
export function FileGrid({ entries }: FileGridProps) {
  if (entries.length === 0) {
    return (
      <div className="text-[12px] text-[var(--text-4)] italic">
        (empty)
      </div>
    );
  }
  return (
    <div
      className="grid gap-x-4 gap-y-1"
      style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}
    >
      {entries.map((e, i) => {
        const { color, Icon } = KIND_META[e.kind];
        return (
          <div
            key={`${e.kind}:${e.name}:${i}`}
            className="flex items-center gap-1.5 text-[13px] font-mono select-text"
            title={`${e.kind}: ${e.name}`}
          >
            <Icon className="w-3.5 h-3.5 flex-shrink-0" style={{ color }} />
            <span className="truncate" style={{ color }}>
              {e.name}
            </span>
          </div>
        );
      })}
    </div>
  );
}

import type { LsAlEntry } from '@/lib/fileParser';
import { Folder, FileText, Cog, Link as LinkIcon, ArrowRight } from 'lucide-react';

// ---------------------------------------------------------------------------
// 类型元数据
// ---------------------------------------------------------------------------

const KIND_META: Record<
  LsAlEntry['kind'],
  { color: string; Icon: typeof Folder; label: string }
> = {
  dir: { color: '#7ea8c7', Icon: Folder, label: 'D' }, // 蓝色
  exe: { color: '#8fba7a', Icon: Cog, label: 'X' }, // 绿色
  link: { color: '#8fb8b8', Icon: LinkIcon, label: 'L' }, // 青色
  file: { color: '#999', Icon: FileText, label: 'F' }, // 灰色
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface FileListTableProps {
  entries: LsAlEntry[];
}

// ---------------------------------------------------------------------------
// 辅助
// ---------------------------------------------------------------------------

/** 将字节数转为人类可读大小（1KB=1024B，但 ls -al 里 size 列就是字节） */
function humanSize(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}G`;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}M`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)}K`;
  return `${bytes}`;
}

function permColor(perm: string): string {
  const t = perm.charAt(0);
  if (t === 'd') return '#7ea8c7';
  if (t === 'l') return '#8fb8b8';
  if (perm.includes('x')) return '#8fba7a';
  return 'var(--text-4)';
}

// ---------------------------------------------------------------------------
// 组件
// ---------------------------------------------------------------------------

export function FileListTable({ entries }: FileListTableProps) {
  if (entries.length === 0) {
    return <div className="text-[12px] text-[var(--text-4)] italic">(empty)</div>;
  }

  return (
    <div className="overflow-x-auto rounded border border-[var(--border)]">
      <table className="w-full text-[12px] font-mono border-collapse">
        {/* 表头 */}
        <thead>
          <tr className="bg-[var(--raised)] text-[var(--text-4)] text-[11px]">
            <th className="text-left px-3 py-1.5 font-medium w-[28px]" />
            <th className="text-left px-1 py-1.5 font-medium">Name</th>
            <th className="text-left hidden sm:table-cell px-1 py-1.5 font-medium">
              Permissions
            </th>
            <th className="text-right px-1 py-1.5 font-medium">Size</th>
            <th className="text-left px-1 py-1.5 font-medium hidden sm:table-cell">
              Owner
            </th>
            <th className="text-right px-3 py-1.5 font-medium hidden md:table-cell whitespace-nowrap">
              Modified
            </th>
          </tr>
        </thead>

        {/* 表体 */}
        <tbody>
          {entries.map((e, i) => {
            const { color, Icon } = KIND_META[e.kind];
            return (
              <tr
                key={`${e.name}-${i}`}
                className="border-t border-[var(--border)] hover:bg-[var(--veil)] transition-colors"
              >
                {/* 图标 */}
                <td className="px-3 py-1">
                  <Icon className="w-3.5 h-3.5 flex-shrink-0" style={{ color }} />
                </td>

                {/* 文件名 + 链接目标 */}
                <td
                  className="px-1 py-1 truncate max-w-[300px] select-text"
                  title={e.linkTarget ? `${e.name} → ${e.linkTarget}` : e.name}
                >
                  <span style={{ color }}>{e.name}</span>
                  {e.linkTarget && (
                    <span className="text-[var(--text-3)] ml-1.5">
                      <ArrowRight className="w-2.5 h-2.5 inline -mt-px" />
                      {' '}
                      {e.linkTarget}
                    </span>
                  )}
                </td>

                {/* 权限位 */}
                <td
                  className="px-1 py-1 text-left hidden sm:table-cell tracking-wider"
                  style={{ color: permColor(e.permission) }}
                >
                  {e.permission}
                </td>

                {/* 大小 */}
                <td className="px-1 py-1 text-right tabular-nums text-[var(--text-3)] whitespace-nowrap">
                  {humanSize(e.size)}
                </td>

                {/* 所有者 */}
                <td className="px-1 py-1 text-left text-[var(--text-2)] truncate max-w-[80px] hidden sm:table-cell">
                  {e.owner}
                </td>

                {/* 修改时间 */}
                <td className="px-3 py-1 text-right text-[var(--text-3)] tabular-nums whitespace-nowrap hidden md:table-cell">
                  {e.month} {e.day.toString().padStart(2, ' ')} {e.time}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* 表尾摘要 */}
      <div className="px-3 py-1.5 border-t border-[var(--border)] bg-[var(--raised)] text-[10px] text-[var(--text-4)]">
        {entries.length} entr{entries.length !== 1 ? 'ies' : 'y'}
        {summarizeKinds(entries)}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 表尾种类统计
// ---------------------------------------------------------------------------

function summarizeKinds(entries: LsAlEntry[]): string {
  const counts: Record<string, number> = {};
  for (const e of entries) {
    counts[e.kind] = (counts[e.kind] || 0) + 1;
  }
  const parts: string[] = [];
  if (counts.dir) parts.push(`${counts.dir} dir`);
  if (counts.file) parts.push(`${counts.file} file`);
  if (counts.exe) parts.push(`${counts.exe} exe`);
  if (counts.link) parts.push(`${counts.link} link`);
  return parts.length > 0 ? ` (${parts.join(', ')})` : '';
}

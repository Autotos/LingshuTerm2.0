import { useMemo } from 'react';
import type { ProcessEntry } from '@/lib/outputDetector';

interface ProcessTableProps {
  entries: ProcessEntry[];
}

/** 找前三 CPU/MEM */
function topN(entries: ProcessEntry[], key: 'cpu' | 'mem', n: number): Set<string> {
  const top = new Set<string>();
  const sorted = [...entries].sort((a, b) => b[key] - a[key]).slice(0, n);
  for (const e of sorted) top.add(e.pid);
  return top;
}

function cpuColor(cpu: number): string | undefined {
  if (cpu >= 50) return 'var(--sem-red)';
  if (cpu >= 20) return 'var(--sem-yellow)';
  return undefined;
}

function memColor(mem: number): string | undefined {
  if (mem >= 30) return 'var(--sem-red)';
  if (mem >= 10) return 'var(--sem-yellow)';
  return undefined;
}

export function ProcessTable({ entries }: ProcessTableProps) {
  const topCpu = useMemo(() => topN(entries, 'cpu', 3), [entries]);
  const topMem = useMemo(() => topN(entries, 'mem', 3), [entries]);

  if (entries.length === 0) return null;

  return (
    <div className="overflow-x-auto rounded border border-[var(--border)]">
      <table className="w-full text-[12px] font-mono border-collapse">
        <thead>
          <tr className="bg-[var(--raised)] text-[var(--text-3)] text-[11px]">
            <th className="text-left px-2 py-1.5 font-medium">USER</th>
            <th className="text-right px-2 py-1.5 font-medium">PID</th>
            <th className="text-right px-2 py-1.5 font-medium">%CPU</th>
            <th className="text-right px-2 py-1.5 font-medium">%MEM</th>
            <th className="text-right px-2 py-1.5 font-medium hidden sm:table-cell">VSZ</th>
            <th className="text-right px-2 py-1.5 font-medium hidden sm:table-cell">RSS</th>
            <th className="text-center px-2 py-1.5 font-medium hidden sm:table-cell">TTY</th>
            <th className="text-center px-2 py-1.5 font-medium">STAT</th>
            <th className="text-center px-2 py-1.5 font-medium hidden md:table-cell">START</th>
            <th className="text-center px-2 py-1.5 font-medium hidden md:table-cell">TIME</th>
            <th className="text-left px-2 py-1.5 font-medium">COMMAND</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => {
            const isTopCpu = topCpu.has(e.pid);
            const isTopMem = topMem.has(e.pid);
            const highlight = isTopCpu || isTopMem;
            return (
              <tr
                key={e.pid}
                className={
                  'border-t border-[var(--border)] transition-colors ' +
                  (highlight ? 'bg-[var(--sem-yellow)]/10' : 'hover:bg-[var(--veil)]')
                }
              >
                <td className="px-2 py-1 text-[var(--text-2)] truncate max-w-[80px]">
                  {e.user}
                </td>
                <td className="px-2 py-1 text-right text-[var(--text-4)]">{e.pid}</td>
                <td
                  className="px-2 py-1 text-right tabular-nums"
                  style={{ color: cpuColor(e.cpu) || 'var(--text-2)' }}
                >
                  {e.cpu.toFixed(1)}
                </td>
                <td
                  className="px-2 py-1 text-right tabular-nums"
                  style={{ color: memColor(e.mem) || 'var(--text-2)' }}
                >
                  {e.mem.toFixed(1)}
                </td>
                <td className="px-2 py-1 text-right text-[var(--text-3)] hidden sm:table-cell">
                  {e.vsz ?? '-'}
                </td>
                <td className="px-2 py-1 text-right text-[var(--text-3)] hidden sm:table-cell">
                  {e.rss ?? '-'}
                </td>
                <td className="px-2 py-1 text-center text-[var(--text-3)] hidden sm:table-cell">
                  {e.tty ?? '?'}
                </td>
                <td className="px-2 py-1 text-center text-[var(--text-3)]">{e.stat ?? '?'}</td>
                <td className="px-2 py-1 text-center text-[var(--text-3)] hidden md:table-cell">
                  {e.start ?? '-'}
                </td>
                <td className="px-2 py-1 text-center text-[var(--text-3)] hidden md:table-cell">
                  {e.time ?? '-'}
                </td>
                <td className="px-2 py-1 text-[var(--text-1)] truncate max-w-[200px]">
                  {e.command}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

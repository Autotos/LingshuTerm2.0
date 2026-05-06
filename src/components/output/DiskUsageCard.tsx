import { HardDrive } from 'lucide-react';
import type { DiskEntry } from '@/lib/outputDetector';

interface DiskUsageCardProps {
  entries: DiskEntry[];
}

function usageColor(pct: number): string {
  if (pct < 50) return 'var(--sem-green)';
  if (pct <= 80) return 'var(--sem-yellow)';
  return 'var(--sem-red)';
}

function usageBarClass(pct: number): string {
  if (pct < 50) return 'bg-[var(--sem-green)]';
  if (pct <= 80) return 'bg-[var(--sem-yellow)]';
  return 'bg-[var(--sem-red)]';
}

function DiskBar({ pct }: { pct: number }) {
  const isCritical = pct > 80;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 rounded-full bg-[var(--raised)] overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${usageBarClass(pct)} ${
            isCritical ? 'animate-pulse' : ''
          }`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      <span
        className="text-[11px] font-mono w-9 text-right flex-shrink-0"
        style={{ color: usageColor(pct) }}
      >
        {pct}%
      </span>
    </div>
  );
}

export function DiskUsageCard({ entries }: DiskUsageCardProps) {
  if (entries.length === 0) return null;

  return (
    <div className="space-y-3">
      {entries.map((e, i) => (
        <div
          key={`${e.mountedOn}-${i}`}
          className="rounded border border-[var(--border)] bg-[var(--surface)] p-3"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 min-w-0">
              <HardDrive className="w-4 h-4 text-[var(--text-3)] flex-shrink-0" />
              <span className="text-[12px] font-mono text-[var(--text-2)] truncate" title={e.mountedOn}>
                {e.mountedOn}
              </span>
            </div>
            <span className="text-[11px] text-[var(--text-4)] flex-shrink-0 ml-2">
              {e.used} / {e.size}
            </span>
          </div>
          <DiskBar pct={e.usePercent} />
          <div className="mt-1.5 flex items-center gap-3 text-[10px] text-[var(--text-4)]">
            <span title="Filesystem">{truncateFs(e.filesystem)}</span>
            {e.avail && <span>{e.avail} avail</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

function truncateFs(fs: string): string {
  if (fs.length <= 28) return fs;
  return fs.slice(0, 12) + '…' + fs.slice(-14);
}

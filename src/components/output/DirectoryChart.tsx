import type { DirSizeEntry } from '@/lib/outputDetector';

interface DirectoryChartProps {
  entries: DirSizeEntry[];
}

export function DirectoryChart({ entries }: DirectoryChartProps) {
  if (entries.length === 0) return null;

  const maxBytes = entries[0]?.bytes ?? 1;

  return (
    <div className="space-y-1.5">
      {entries.map((e, i) => {
        const ratio = maxBytes > 0 ? e.bytes / maxBytes : 1;
        const opacity = 0.4 + ratio * 0.6;
        const widthPct = Math.max(ratio * 100, 4);

        return (
          <div key={`${e.path}-${i}`} className="flex items-center gap-2">
            {/* Label */}
            <span
              className="text-[12px] font-mono text-[var(--text-2)] w-[120px] flex-shrink-0 truncate text-right"
              title={e.path}
            >
              {e.path}
            </span>

            {/* Bar */}
            <div className="flex-1 h-5 rounded-sm bg-[var(--raised)] overflow-hidden">
              <div
                className="h-full rounded-sm transition-all duration-500 ease-out"
                style={{
                  width: `${widthPct}%`,
                  backgroundColor: `rgba(126, 168, 199, ${opacity})`,
                }}
              />
            </div>

            {/* Size */}
            <span className="text-[11px] font-mono text-[var(--text-3)] w-[60px] flex-shrink-0 text-left">
              {e.sizeDisplay}
            </span>
          </div>
        );
      })}
    </div>
  );
}

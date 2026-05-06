import { GitBranch, Plus, Minus, File, ArrowRight } from 'lucide-react';
import type { GitStatusData, GitFileEntry } from '@/lib/outputDetector';

interface GitStatusProps {
  data: GitStatusData;
}

const STATUS_META: Record<GitFileEntry['status'], { icon: typeof File; color: string; label: string }> = {
  modified: { icon: Minus, color: 'var(--sem-yellow)', label: 'M' },
  new: { icon: Plus, color: 'var(--sem-green)', label: 'A' },
  deleted: { icon: Minus, color: 'var(--sem-red)', label: 'D' },
  renamed: { icon: ArrowRight, color: '#8fb8b8', label: 'R' },
};

function FileRow({ entry }: { entry: GitFileEntry }) {
  const { icon: Icon, color } = STATUS_META[entry.status];
  return (
    <div className="flex items-center gap-2 py-0.5 text-[12px] font-mono">
      <Icon className="w-3.5 h-3.5 flex-shrink-0" style={{ color }} />
      {entry.status === 'renamed' ? (
        <>
          <span className="text-[var(--text-2)]">{entry.file}</span>
          <ArrowRight className="w-3 h-3 text-[var(--text-4)] flex-shrink-0" />
          <span className="text-[var(--text-1)]">{entry.renamedTo}</span>
        </>
      ) : (
        <span className="text-[var(--text-2)] truncate">{entry.file}</span>
      )}
    </div>
  );
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  if (count === 0) return null;
  return (
    <div>
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wide">
          {title}
        </span>
        <span className="text-[10px] text-[var(--text-4)] bg-[var(--raised)] rounded-full px-1.5 py-px">
          {count}
        </span>
      </div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

export function GitStatus({ data }: GitStatusProps) {
  const { branch, staged, unstaged, untracked } = data;
  const totalChanges = staged.length + unstaged.length + untracked.length;

  return (
    <div className="rounded border border-[var(--border)] bg-[var(--surface)] p-3 space-y-4">
      {/* Branch header */}
      {branch && (
        <div className="flex items-center gap-2 pb-2 border-b border-[var(--border)]">
          <GitBranch className="w-4 h-4 text-[var(--text-3)]" />
          <span className="text-[13px] font-mono text-[var(--text-1)]">{branch}</span>
          {totalChanges > 0 && (
            <span className="text-[11px] text-[var(--text-4)] ml-auto">
              {totalChanges} change{totalChanges !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      )}

      {/* Clean working tree */}
      {totalChanges === 0 && (
        <div className="text-[12px] text-[var(--text-3)] italic py-1">
          nothing to commit, working tree clean
        </div>
      )}

      <Section title="Staged" count={staged.length}>
        {staged.map((e, i) => (
          <FileRow key={`staged-${e.file}-${i}`} entry={e} />
        ))}
      </Section>

      <Section title="Unstaged" count={unstaged.length}>
        {unstaged.map((e, i) => (
          <FileRow key={`unstaged-${e.file}-${i}`} entry={e} />
        ))}
      </Section>

      <Section title="Untracked" count={untracked.length}>
        {untracked.map((f, i) => (
          <div key={`untracked-${i}`} className="flex items-center gap-2 py-0.5 text-[12px] font-mono">
            <File className="w-3.5 h-3.5 text-[var(--text-4)] flex-shrink-0" />
            <span className="text-[var(--text-2)] truncate">{f}</span>
          </div>
        ))}
      </Section>
    </div>
  );
}

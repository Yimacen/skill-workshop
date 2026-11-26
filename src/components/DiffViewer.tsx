import { useMemo } from 'react';
import { computeLineDiff } from '../utils/diff';

interface DiffViewerProps {
  before: string;
  after: string;
  title?: string;
}

export function DiffViewer({ before, after, title }: DiffViewerProps) {
  const diffLines = useMemo(() => computeLineDiff(before, after), [before, after]);
  const addedCount = diffLines.filter((d) => d.type === 'add').length;
  const removedCount = diffLines.filter((d) => d.type === 'remove').length;

  return (
    <div className="border border-slate-200 rounded-md overflow-hidden bg-white">
      <div className="px-3.5 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs">
        <span className="font-medium text-slate-700">
          {title || 'SKILL.md 行级变更对比 (Diff Preview)'}
        </span>
        <span className="font-mono tabular-nums text-slate-600">
          <span className="text-emerald-700">+{addedCount}</span>
          <span className="mx-1.5 text-slate-300">/</span>
          <span className="text-red-600">-{removedCount}</span>
        </span>
      </div>
      <div className="max-h-80 overflow-y-auto font-mono text-xs leading-relaxed">
        {diffLines.map((item, idx) => (
          <div
            key={idx}
            className={`px-3 py-0.5 flex items-start gap-3 whitespace-pre-wrap break-all ${
              item.type === 'add'
                ? 'bg-emerald-50 text-emerald-950'
                : item.type === 'remove'
                  ? 'bg-red-50 text-red-950'
                  : 'text-slate-600'
            }`}
          >
            <span className="w-8 shrink-0 text-right text-[11px] text-slate-400 select-none tabular-nums">
              {item.oldLineNo ?? ''}
            </span>
            <span className="w-8 shrink-0 text-right text-[11px] text-slate-400 select-none tabular-nums">
              {item.newLineNo ?? ''}
            </span>
            <span className="w-3 shrink-0 select-none font-semibold">
              {item.type === 'add' ? '+' : item.type === 'remove' ? '-' : ' '}
            </span>
            <span className="flex-1">{item.line || ' '}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

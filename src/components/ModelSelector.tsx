import type { ModelOption, ReasoningProfile } from '../types/skill';

interface ModelSelectorProps {
  models: ModelOption[];
  value: ReasoningProfile;
  onChange: (value: ReasoningProfile) => void;
  ariaLabel?: string;
}

export function ModelSelector({
  models,
  value,
  onChange,
  ariaLabel = '选择执行模型',
}: ModelSelectorProps) {
  const selected = models.find((m) => m.id === value);

  return (
    <div className="flex flex-col items-end gap-1">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as ReasoningProfile)}
        aria-label={ariaLabel}
        className="px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md text-slate-700 focus:outline-none focus:border-blue-600 max-w-64"
      >
        {models.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label}
            {m.configured ? '' : ' (未配置 Secret)'}
          </option>
        ))}
      </select>
      {selected && !selected.configured && selected.missingEnvHint && (
        <span className="text-[11px] text-amber-700">
          {selected.missingEnvHint}
        </span>
      )}
    </div>
  );
}

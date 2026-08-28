export interface SegmentedOption {
  value: string;
  label: string;
}

export function Segmented({
  value,
  options,
  onChange,
}: {
  value: string;
  options: SegmentedOption[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="inline-flex rounded-[var(--radius-control)] border border-border bg-surface p-0.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          aria-pressed={value === opt.value}
          className={`rounded-[4px] px-3 py-1.5 text-[13px] font-medium transition-colors ${
            value === opt.value ? 'bg-accent text-accent-fg' : 'text-muted hover:text-fg'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

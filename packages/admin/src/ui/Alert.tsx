import { AlertTriangle, Info } from 'lucide-react';
import type { ReactNode } from 'react';

type Tone = 'info' | 'warning' | 'danger';

const TONE_CLASSES: Record<Tone, string> = {
  info: 'border-border bg-surface-hover text-fg',
  warning: 'border-transparent bg-warning-soft text-warning-fg',
  danger: 'border-transparent bg-danger-soft text-danger',
};

export function Alert({
  tone = 'info',
  message,
  description,
}: {
  tone?: Tone;
  message: string;
  description?: ReactNode;
}) {
  const Icon = tone === 'info' ? Info : AlertTriangle;
  return (
    <div
      className={`flex gap-2.5 rounded-[var(--radius-panel)] border px-4 py-3 text-[13px] ${TONE_CLASSES[tone]}`}
    >
      <Icon className="mt-0.5 size-4 shrink-0" />
      <div>
        <p className="font-medium">{message}</p>
        {description ? <p className="mt-0.5 text-muted">{description}</p> : null}
      </div>
    </div>
  );
}

import type { ReactNode } from 'react';

type Tone = 'neutral' | 'danger' | 'warning' | 'accent';

const TONE_CLASSES: Record<Tone, string> = {
  neutral: 'bg-surface-hover text-fg border-border',
  danger: 'bg-danger-soft text-danger border-transparent',
  warning: 'bg-warning-soft text-[oklch(0.4_0.12_70)] border-transparent',
  accent: 'bg-accent-soft text-accent border-transparent',
};

export function Tag({
  children,
  tone = 'neutral',
  hex,
}: {
  children: ReactNode;
  tone?: Tone;
  /** 品牌色圆点，用于社媒平台标签 */
  hex?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[12px] font-medium ${TONE_CLASSES[tone]}`}
    >
      {hex ? <span className="size-2 rounded-full" style={{ background: hex }} /> : null}
      {children}
    </span>
  );
}

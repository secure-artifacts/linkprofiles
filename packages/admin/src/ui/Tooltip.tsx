import * as RadixTooltip from '@radix-ui/react-tooltip';
import type { ReactNode } from 'react';

export const TooltipProvider = RadixTooltip.Provider;

export function Tooltip({ content, children }: { content: string; children: ReactNode }) {
  return (
    <RadixTooltip.Root delayDuration={200}>
      <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content
          sideOffset={6}
          className="z-50 max-w-xs whitespace-pre-line rounded-[var(--radius-control)] border border-border
            bg-fg px-2.5 py-1.5 text-[12px] leading-snug text-bg shadow-[var(--shadow-float)]"
        >
          {content}
          <RadixTooltip.Arrow className="fill-fg" />
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  );
}

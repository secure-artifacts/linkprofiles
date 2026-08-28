import * as RadixCheckbox from '@radix-ui/react-checkbox';
import { Check } from 'lucide-react';
import type { ReactNode } from 'react';

interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children?: ReactNode;
  disabled?: boolean;
}

export function Checkbox({ checked, onChange, children, disabled }: CheckboxProps) {
  return (
    <label
      className={`inline-flex items-center gap-2 text-[13px] text-fg ${disabled ? 'opacity-50' : 'cursor-pointer'}`}
    >
      <RadixCheckbox.Root
        checked={checked}
        onCheckedChange={(v) => onChange(v === true)}
        disabled={disabled}
        className="flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-border bg-surface
          outline-none data-[state=checked]:border-accent data-[state=checked]:bg-accent
          focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <RadixCheckbox.Indicator>
          <Check className="size-3 text-accent-fg" strokeWidth={3} />
        </RadixCheckbox.Indicator>
      </RadixCheckbox.Root>
      {children}
    </label>
  );
}

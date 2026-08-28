import * as RadixSelect from '@radix-ui/react-select';
import { Check, ChevronDown } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  value?: string;
  placeholder?: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  size?: 'sm' | 'md';
  disabled?: boolean;
  'aria-label'?: string;
}

/** 下拉选择。取代 antd Select（单选场景：归属指派、时区、维度筛选等）。 */
export function Select({
  value,
  placeholder,
  options,
  onChange,
  size = 'md',
  disabled,
  ...rest
}: SelectProps) {
  const heightClass = size === 'sm' ? 'h-8 px-2.5 text-[13px]' : 'h-9 px-3 text-sm';
  return (
    <RadixSelect.Root value={value} onValueChange={onChange} disabled={disabled}>
      <RadixSelect.Trigger
        aria-label={rest['aria-label']}
        className={`inline-flex w-full items-center justify-between gap-2 rounded-[var(--radius-control)]
          border border-border bg-surface text-fg outline-none data-[placeholder]:text-muted
          focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-accent
          disabled:cursor-not-allowed disabled:opacity-50 ${heightClass}`}
      >
        <RadixSelect.Value placeholder={placeholder} />
        <RadixSelect.Icon>
          <ChevronDown className="size-3.5 text-muted" />
        </RadixSelect.Icon>
      </RadixSelect.Trigger>
      <RadixSelect.Portal>
        <RadixSelect.Content
          position="popper"
          sideOffset={4}
          className="z-50 overflow-hidden rounded-[var(--radius-control)] border border-border bg-surface
            text-sm shadow-[var(--shadow-float)]"
        >
          <RadixSelect.Viewport className="p-1">
            {options.length === 0 ? (
              <div className="px-3 py-2 text-[13px] text-muted">暂无数据</div>
            ) : (
              options.map((opt) => (
                <RadixSelect.Item
                  key={opt.value}
                  value={opt.value}
                  className="relative flex cursor-pointer select-none items-center rounded-[4px] py-1.5 pl-7 pr-3
                    text-fg outline-none data-[highlighted]:bg-surface-hover data-[state=checked]:font-medium"
                >
                  <RadixSelect.ItemIndicator className="absolute left-2 inline-flex items-center">
                    <Check className="size-3.5 text-accent" />
                  </RadixSelect.ItemIndicator>
                  <RadixSelect.ItemText>{opt.label}</RadixSelect.ItemText>
                </RadixSelect.Item>
              ))
            )}
          </RadixSelect.Viewport>
        </RadixSelect.Content>
      </RadixSelect.Portal>
    </RadixSelect.Root>
  );
}

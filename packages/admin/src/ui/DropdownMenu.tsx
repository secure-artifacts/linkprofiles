import * as RadixDropdown from '@radix-ui/react-dropdown-menu';
import type { ReactNode } from 'react';

export interface DropdownMenuItem {
  key: string;
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  danger?: boolean;
}

interface DropdownMenuProps {
  trigger: ReactNode;
  items: DropdownMenuItem[];
  align?: 'start' | 'center' | 'end';
}

/**
 * 触发器点开的菜单。
 *
 * **点击触发，不是 hover**：hover 菜单键盘走不到、触屏点不开，而这里挂的是登出
 * 这种误触代价不小的操作。触发器上的 hover 只用来变色，提示它可以点。
 */
export function DropdownMenu({ trigger, items, align = 'end' }: DropdownMenuProps) {
  return (
    <RadixDropdown.Root>
      <RadixDropdown.Trigger asChild>{trigger}</RadixDropdown.Trigger>
      <RadixDropdown.Portal>
        <RadixDropdown.Content
          align={align}
          sideOffset={6}
          className="z-50 min-w-[168px] overflow-hidden rounded-[var(--radius-control)] border border-border
            bg-surface p-1 text-sm shadow-[var(--shadow-float)]"
        >
          {items.map((item) => (
            <RadixDropdown.Item
              key={item.key}
              onSelect={item.onSelect}
              className={`flex cursor-pointer select-none items-center gap-2 rounded-[4px] px-2.5 py-1.5
                text-[13px] outline-none data-[highlighted]:bg-surface-hover
                ${item.danger ? 'text-danger data-[highlighted]:bg-danger-soft' : 'text-fg'}`}
            >
              {item.icon}
              {item.label}
            </RadixDropdown.Item>
          ))}
        </RadixDropdown.Content>
      </RadixDropdown.Portal>
    </RadixDropdown.Root>
  );
}

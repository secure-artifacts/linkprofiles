import * as RadixSelect from '@radix-ui/react-select';
import { Check, ChevronDown, Search } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useAdminT } from '../i18n/runtime.js';

export interface SelectOption {
  value: string;
  label: string;
  /** 标签左侧的小图标。放进 ItemText，选中后触发器上也跟着显示。 */
  icon?: ReactNode;
}

interface SelectProps {
  value?: string;
  placeholder?: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  size?: 'sm' | 'md';
  disabled?: boolean;
  /** 选项多到翻不动时打开：下拉顶部多一个过滤框。 */
  searchable?: boolean;
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
  searchable,
  ...rest
}: SelectProps) {
  const t = useAdminT();
  const [query, setQuery] = useState('');
  const heightClass = size === 'sm' ? 'h-8 px-2.5 text-[13px]' : 'h-9 px-3 text-sm';

  const term = query.trim().toLowerCase();
  const matches =
    term === '' ? options : options.filter((opt) => opt.label.toLowerCase().includes(term));
  // 选中项即使没匹配上也要留在树里：Radix 的触发器渲染的是选中那个 Item 的
  // 内容，把它卸掉触发器会跟着空掉。它只是藏起来，不占列表。
  const hiddenSelected =
    value !== undefined && !matches.some((opt) => opt.value === value)
      ? options.find((opt) => opt.value === value)
      : undefined;

  return (
    <RadixSelect.Root
      value={value}
      onValueChange={onChange}
      disabled={disabled}
      onOpenChange={(open) => {
        if (!open) setQuery('');
      }}
    >
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
          {searchable ? <SelectSearch value={query} onChange={setQuery} /> : null}
          <RadixSelect.Viewport className="max-h-72 p-1">
            {options.length === 0 ? (
              <div className="px-3 py-2 text-[13px] text-muted">{t('common.noData')}</div>
            ) : (
              <>
                {matches.length === 0 ? (
                  <div className="px-3 py-2 text-[13px] text-muted">{t('common.noMatch')}</div>
                ) : null}
                {matches.map((opt) => (
                  <Option key={opt.value} option={opt} />
                ))}
                {hiddenSelected ? <Option option={hiddenSelected} hidden /> : null}
              </>
            )}
          </RadixSelect.Viewport>
        </RadixSelect.Content>
      </RadixSelect.Portal>
    </RadixSelect.Root>
  );
}

function Option({ option, hidden }: { option: SelectOption; hidden?: boolean }) {
  return (
    <RadixSelect.Item
      value={option.value}
      className={`relative flex cursor-pointer select-none items-center rounded-[4px] py-1.5 pl-7 pr-3
        text-fg outline-none data-[highlighted]:bg-surface-hover data-[state=checked]:font-medium
        ${hidden ? 'hidden' : ''}`}
    >
      <RadixSelect.ItemIndicator className="absolute left-2 inline-flex items-center">
        <Check className="size-3.5 text-accent" />
      </RadixSelect.ItemIndicator>
      <RadixSelect.ItemText>
        {option.icon ? (
          <span className="flex items-center gap-2">
            {option.icon}
            {option.label}
          </span>
        ) : (
          option.label
        )}
      </RadixSelect.ItemText>
    </RadixSelect.Item>
  );
}

/**
 * 下拉里的过滤框。
 *
 * 单独拆出来是为了拿到「内容刚挂载」这个时机：Radix 打开时会把焦点送到选中
 * 项上，直接在渲染里调 focus 会被它覆盖，排到下一帧才抢得回来。
 */
function SelectSearch({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  const t = useAdminT();
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const frame = requestAnimationFrame(() => ref.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div className="flex items-center gap-1.5 border-b border-border px-2.5 py-2">
      <Search className="size-3.5 shrink-0 text-muted" />
      <input
        ref={ref}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={t('common.search')}
        aria-label={t('common.search')}
        className="w-full bg-transparent text-[13px] text-fg outline-none placeholder:text-muted"
        // 字母键要留给输入框，否则 Radix 的首字母跳转会把它抢去跳选项
        onKeyDown={(event) => {
          if (event.key !== 'Escape' && event.key !== 'ArrowDown' && event.key !== 'ArrowUp') {
            event.stopPropagation();
          }
        }}
      />
    </div>
  );
}

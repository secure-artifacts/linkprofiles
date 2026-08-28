import { Eye, EyeOff } from 'lucide-react';
import { forwardRef, useState } from 'react';
import type { InputHTMLAttributes, TextareaHTMLAttributes } from 'react';

const FIELD_CLASSES =
  'w-full rounded-[var(--radius-control)] border border-border bg-surface px-3 py-2 text-sm text-fg ' +
  'placeholder:text-muted focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-accent ' +
  'disabled:cursor-not-allowed disabled:opacity-50';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  addonBefore?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { addonBefore, className = '', ...rest },
  ref,
) {
  if (addonBefore) {
    return (
      <div className="flex w-full overflow-hidden rounded-[var(--radius-control)] border border-border bg-surface focus-within:outline focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-accent">
        <span className="flex items-center border-r border-border bg-bg px-3 text-sm text-muted">
          {addonBefore}
        </span>
        <input
          ref={ref}
          className={`flex-1 px-3 py-2 text-sm text-fg outline-none ${className}`}
          {...rest}
        />
      </div>
    );
  }
  return <input ref={ref} className={`${FIELD_CLASSES} ${className}`} {...rest} />;
});

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className = '', ...rest }, ref) {
  return <textarea ref={ref} className={`${FIELD_CLASSES} resize-y ${className}`} {...rest} />;
});

export function PasswordInput(props: Omit<InputProps, 'type'>) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input
        {...props}
        type={visible ? 'text' : 'password'}
        className={`pr-10 ${props.className ?? ''}`}
      />
      <button
        type="button"
        aria-label={visible ? '隐藏密码' : '显示密码'}
        onClick={() => setVisible((v) => !v)}
        className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-muted hover:text-fg"
      >
        {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

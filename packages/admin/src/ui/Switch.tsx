import * as RadixSwitch from '@radix-ui/react-switch';

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  'aria-label'?: string;
  disabled?: boolean;
}

export function Switch({ checked, onChange, disabled, ...rest }: SwitchProps) {
  return (
    <RadixSwitch.Root
      checked={checked}
      onCheckedChange={onChange}
      disabled={disabled}
      aria-label={rest['aria-label']}
      className="relative h-5 w-9 shrink-0 rounded-full border border-border bg-border/60 outline-none
        transition-colors data-[state=checked]:border-accent data-[state=checked]:bg-accent
        focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent
        disabled:cursor-not-allowed disabled:opacity-50"
    >
      <RadixSwitch.Thumb
        className="block size-3.5 translate-x-0.5 rounded-full bg-surface shadow transition-transform
          data-[state=checked]:translate-x-[18px]"
      />
    </RadixSwitch.Root>
  );
}

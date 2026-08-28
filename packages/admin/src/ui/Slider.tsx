import * as RadixSlider from '@radix-ui/react-slider';

interface SliderProps {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
  'aria-label'?: string;
}

export function Slider({ value, min = 0, max = 1, step = 0.05, onChange, ...rest }: SliderProps) {
  return (
    <RadixSlider.Root
      value={[value]}
      min={min}
      max={max}
      step={step}
      onValueChange={([v]) => onChange(v ?? value)}
      aria-label={rest['aria-label']}
      className="relative flex h-5 w-full touch-none select-none items-center"
    >
      <RadixSlider.Track className="relative h-1 grow rounded-full bg-border">
        <RadixSlider.Range className="absolute h-full rounded-full bg-accent" />
      </RadixSlider.Track>
      <RadixSlider.Thumb
        className="block size-4 rounded-full border-2 border-accent bg-surface shadow outline-none
          focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      />
    </RadixSlider.Root>
  );
}

import { Loader2 } from 'lucide-react';

export function Spinner({ fullscreen }: { fullscreen?: boolean }) {
  const spinner = <Loader2 className="size-6 animate-spin text-accent" />;
  if (!fullscreen) return spinner;
  return <div className="flex min-h-dvh items-center justify-center bg-bg">{spinner}</div>;
}

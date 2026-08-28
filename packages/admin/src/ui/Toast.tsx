import { CheckCircle2, XCircle } from 'lucide-react';
import { createContext, useCallback, useContext, useRef, useState } from 'react';
import type { ReactNode } from 'react';

interface ToastItem {
  id: number;
  kind: 'success' | 'error';
  text: string;
}

interface ToastApi {
  success: (text: string) => void;
  error: (text: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

/** 取代 antd 的 `message`。用法一致：`toast.success(...)` / `toast.error(...)`。 */
export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const push = useCallback((kind: ToastItem['kind'], text: string) => {
    const id = nextId.current++;
    setItems((prev) => [...prev, { id, kind, text }]);
    setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), 3200);
  }, []);

  const api: ToastApi = {
    success: (text) => push('success', text),
    error: (text) => push('error', text),
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed bottom-6 left-1/2 z-[100] flex -translate-x-1/2 flex-col gap-2">
        {items.map((item) => (
          <div
            key={item.id}
            className={`pointer-events-auto flex items-center gap-2 rounded-[var(--radius-control)] border
              px-3.5 py-2.5 text-[13px] shadow-[var(--shadow-float)]
              ${item.kind === 'success' ? 'border-accent-soft bg-surface text-fg' : 'border-danger-soft bg-surface text-danger'}`}
          >
            {item.kind === 'success' ? (
              <CheckCircle2 className="size-4 shrink-0 text-accent" />
            ) : (
              <XCircle className="size-4 shrink-0 text-danger" />
            )}
            {item.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

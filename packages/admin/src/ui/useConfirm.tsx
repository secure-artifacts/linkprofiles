import { useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Button } from './Button.js';
import { Dialog } from './Dialog.js';

interface ConfirmOptions {
  title: string;
  description?: ReactNode;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
}

/** 取代 antd `Modal.confirm`：`if (await confirm({...})) { ... }`。渲染一次 `dialog` 挂在组件树里。 */
export function useConfirm() {
  const [state, setState] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<(value: boolean) => void>(null);

  const confirm = (options: ConfirmOptions) =>
    new Promise<boolean>((resolve) => {
      resolver.current = resolve;
      setState(options);
    });

  const settle = (value: boolean) => {
    resolver.current?.(value);
    setState(null);
  };

  const dialog = state ? (
    <Dialog
      open
      onOpenChange={(open) => !open && settle(false)}
      title={state.title}
      description={typeof state.description === 'string' ? state.description : undefined}
      footer={
        <>
          <Button variant="default" onClick={() => settle(false)}>
            {state.cancelText ?? '取消'}
          </Button>
          <Button variant={state.danger ? 'danger' : 'primary'} onClick={() => settle(true)}>
            {state.confirmText ?? '确认'}
          </Button>
        </>
      }
    >
      {typeof state.description !== 'string' ? state.description : null}
    </Dialog>
  ) : null;

  return { confirm, dialog };
}

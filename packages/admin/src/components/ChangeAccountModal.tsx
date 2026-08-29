import { useEffect, useState } from 'react';
import { validateAccountName } from '@link-profile/shared';
import { request } from '../api/client.js';
import { Alert } from '../ui/Alert.js';
import { Button } from '../ui/Button.js';
import { Dialog } from '../ui/Dialog.js';
import { Input, PasswordInput } from '../ui/Input.js';
import { useToast } from '../ui/Toast.js';

export function ChangeAccountModal({
  open,
  currentAccount,
  onClose,
  onSignedOut,
}: {
  open: boolean;
  currentAccount: string;
  onClose: () => void;
  onSignedOut: () => void;
}) {
  const toast = useToast();
  const [account, setAccount] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setAccount(currentAccount);
      setCurrentPassword('');
      setError(null);
    }
  }, [open, currentAccount]);

  const submit = async () => {
    const parsed = validateAccountName(account);
    if (!parsed.ok) return setError(parsed.error);
    const next = parsed.value;
    if (!currentPassword) return setError('请输入当前密码');
    if (next === currentAccount) return setError('新登录用户名与当前相同');

    setSubmitting(true);
    setError(null);
    try {
      await request('/auth/account', {
        method: 'PUT',
        body: { account: next, currentPassword },
      });
      toast.success(`登录用户名已改为 ${next}，请重新登录`);
      onSignedOut();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => !value && onClose()}
      title="修改登录用户名"
      footer={
        <>
          <Button variant="default" onClick={onClose}>
            取消
          </Button>
          <Button variant="primary" loading={submitting} onClick={() => void submit()}>
            确认修改
          </Button>
        </>
      }
    >
      <Alert
        tone="info"
        message="修改后旧用户名立即失效，所有设备都会退出；个人页地址、数据和 API Key 不会改变。"
      />
      <div className="mt-4 flex flex-col gap-1.5">
        <label className="text-[13px] font-medium text-fg">新登录用户名</label>
        <Input
          autoComplete="off"
          value={account}
          onChange={(event) => setAccount(event.target.value.toLowerCase())}
          placeholder="例如 lisa.usa"
        />
        <span className="text-[12px] text-muted">
          3–32 位；支持小写字母、数字、点、下划线和横线。
        </span>
      </div>
      <div className="mt-4 flex flex-col gap-1.5">
        <label className="text-[13px] font-medium text-fg">当前密码</label>
        <PasswordInput
          autoComplete="current-password"
          value={currentPassword}
          onChange={(event) => setCurrentPassword(event.target.value)}
        />
      </div>
      {error ? <p className="mt-3 text-[12px] text-danger">{error}</p> : null}
    </Dialog>
  );
}

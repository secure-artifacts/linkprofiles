import { useState } from 'react';
import { request } from '../api/client.js';
import { Alert } from '../ui/Alert.js';
import { Button } from '../ui/Button.js';
import { Dialog } from '../ui/Dialog.js';
import { PasswordInput } from '../ui/Input.js';
import { useToast } from '../ui/Toast.js';

/**
 * 自助改密码。
 *
 * 与管理员重置是两条路：这条要验旧密码。改完该账号的**全部**会话都会失效
 * （含当前这条），所以成功后直接把人送回登录页。
 */
export function ChangePasswordModal({
  open,
  onClose,
  onSignedOut,
}: {
  open: boolean;
  onClose: () => void;
  onSignedOut: () => void;
}) {
  const toast = useToast();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<{ current?: string; next?: string }>({});

  const submit = async () => {
    const nextErrors: typeof errors = {};
    if (!currentPassword) nextErrors.current = '请输入当前密码';
    if (!newPassword || newPassword.length < 8) nextErrors.next = '新密码至少 8 位';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);
    try {
      await request('/auth/password', { method: 'POST', body: { currentPassword, newPassword } });
      toast.success('密码已修改，请用新密码重新登录');
      setCurrentPassword('');
      setNewPassword('');
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
      onOpenChange={(o) => !o && onClose()}
      title="修改密码"
      footer={
        <>
          <Button variant="default" onClick={onClose}>
            取消
          </Button>
          <Button variant="primary" loading={submitting} onClick={() => void submit()}>
            修改
          </Button>
        </>
      }
    >
      <Alert tone="info" message="改完之后这个账号在所有设备上的登录都会失效，需要重新登录。" />
      <div className="mt-4 flex flex-col gap-1.5">
        <label className="text-[13px] font-medium text-fg">当前密码</label>
        <PasswordInput
          autoComplete="current-password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
        />
        {errors.current ? <p className="text-[12px] text-danger">{errors.current}</p> : null}
      </div>
      <div className="mt-4 flex flex-col gap-1.5">
        <label className="text-[13px] font-medium text-fg">新密码</label>
        <PasswordInput
          autoComplete="new-password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
        />
        {errors.next ? <p className="text-[12px] text-danger">{errors.next}</p> : null}
      </div>
    </Dialog>
  );
}

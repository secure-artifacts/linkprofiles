import { useEffect, useState } from 'react';
import { validateAccountName } from '@link-profile/shared';
import { request } from '../api/client.js';
import { Alert } from '../ui/Alert.js';
import { Button } from '../ui/Button.js';
import { Dialog } from '../ui/Dialog.js';
import { Input, PasswordInput } from '../ui/Input.js';
import { useToast } from '../ui/Toast.js';
import { useAdminT, useErrorT } from '../i18n/runtime.js';

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
  const t = useAdminT();
  const errorT = useErrorT();
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
    if (!parsed.ok) return setError(errorT(parsed.error));
    const next = parsed.value;
    if (!currentPassword) return setError(t('common.validation.currentPasswordRequired'));
    if (next === currentAccount) return setError(t('account.change.same'));

    setSubmitting(true);
    setError(null);
    try {
      await request('/auth/account', {
        method: 'PUT',
        body: { account: next, currentPassword },
      });
      toast.success(t('account.change.done', { account: next }));
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
      title={t('account.change.title')}
      footer={
        <>
          <Button variant="default" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" loading={submitting} onClick={() => void submit()}>
            {t('account.change.submit')}
          </Button>
        </>
      }
    >
      <Alert tone="info" message={t('account.change.description')} />
      <div className="mt-4 flex flex-col gap-1.5">
        <label className="text-[13px] font-medium text-fg">{t('account.change.field')}</label>
        <Input
          autoComplete="off"
          value={account}
          onChange={(event) => setAccount(event.target.value.toLowerCase())}
          placeholder={t('common.accountExample')}
        />
        <span className="text-[12px] text-muted">{t('account.change.rule')}</span>
      </div>
      <div className="mt-4 flex flex-col gap-1.5">
        <label className="text-[13px] font-medium text-fg">
          {t('common.field.currentPassword')}
        </label>
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

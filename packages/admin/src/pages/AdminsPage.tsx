import { useCallback, useEffect, useState } from 'react';
import { validateAccountName } from '@link-profile/shared';
import { request } from '../api/client.js';
import type { AdminSummary } from '../api/types.js';
import { Button } from '../ui/Button.js';
import { Dialog } from '../ui/Dialog.js';
import { Input, PasswordInput } from '../ui/Input.js';
import { Spinner } from '../ui/Spinner.js';
import { useToast } from '../ui/Toast.js';
import { useConfirm } from '../ui/useConfirm.js';
import { useBreadcrumb } from '../nav/breadcrumb.js';
import { useAdminT } from '../i18n/runtime.js';

/** 管理员管理。只有超级管理员进得来。 */
export function AdminsPage() {
  const t = useAdminT();
  useBreadcrumb([{ label: t('nav.admins') }]);
  const toast = useToast();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [admins, setAdmins] = useState<AdminSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<AdminSummary | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setAdmins((await request<{ admins: AdminSummary[] }>('/admins')).admins);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const remove = async (admin: AdminSummary) => {
    const ok = await confirm({
      title: t('admins.delete.confirm', { name: admin.label || admin.account }),
      description: t('admins.delete.consequence'),
      confirmText: t('common.delete'),
      danger: true,
    });
    if (!ok) return;
    await request(`/admins/${admin.id}`, { method: 'DELETE' });
    toast.success(t('admins.delete.done'));
    await load();
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-xl font-semibold text-fg">{t('nav.admins')}</h1>
        <Button variant="primary" onClick={() => setCreating(true)}>
          {t('admins.create.title')}
        </Button>
      </div>

      <div className="overflow-x-auto rounded-[var(--radius-panel)] border border-border bg-surface">
        {loading ? (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        ) : (
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="border-b border-border bg-surface-hover text-muted">
                <th className="px-4 py-2.5 font-medium">{t('common.field.label')}</th>
                <th className="px-4 py-2.5 font-medium">{t('common.field.account')}</th>
                <th className="px-4 py-2.5 font-medium">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {admins.map((admin) => (
                <tr
                  key={admin.id}
                  className="border-b border-border last:border-0 hover:bg-surface-hover"
                >
                  <td className="px-4 py-3 text-fg">{admin.label || '—'}</td>
                  <td className="px-4 py-3 font-mono text-fg">{admin.account}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Button variant="default" size="sm" onClick={() => setEditing(admin)}>
                        {t('common.edit')}
                      </Button>
                      <Button variant="danger-ghost" size="sm" onClick={() => void remove(admin)}>
                        {t('common.delete')}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <CreateAdminDialog
        open={creating}
        onClose={() => setCreating(false)}
        onDone={async () => {
          setCreating(false);
          await load();
        }}
      />
      <EditAdminDialog
        admin={editing}
        onClose={() => setEditing(null)}
        onDone={async () => {
          setEditing(null);
          await load();
        }}
      />
      {confirmDialog}
    </div>
  );
}

function EditAdminDialog({
  admin,
  onClose,
  onDone,
}: {
  admin: AdminSummary | null;
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const t = useAdminT();
  const toast = useToast();
  const [account, setAccount] = useState('');
  const [label, setLabel] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setAccount(admin?.account ?? '');
    setLabel(admin?.label ?? '');
  }, [admin]);
  if (!admin) return null;

  const save = async () => {
    setSaving(true);
    try {
      const parsedAccount = validateAccountName(account);
      if (!parsedAccount.ok) throw new Error(parsedAccount.error);
      await request(`/admins/${admin.id}`, {
        method: 'PATCH',
        body: { account: parsedAccount.value, label },
      });
      toast.success(t('admins.updated'));
      await onDone();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(value) => !value && onClose()}
      title={t('admins.edit.title', { name: admin.label || admin.account })}
      footer={
        <>
          <Button variant="default" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" loading={saving} onClick={() => void save()}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-[13px] font-medium text-fg">{t('common.field.account')}</label>
          <Input
            autoComplete="off"
            value={account}
            onChange={(event) => setAccount(event.target.value.toLowerCase())}
          />
          <span className="text-[12px] text-muted">{t('admins.rename.warning')}</span>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-[13px] font-medium text-fg">{t('common.field.label')}</label>
          <Input value={label} onChange={(event) => setLabel(event.target.value)} />
        </div>
      </div>
    </Dialog>
  );
}

function CreateAdminDialog({
  open,
  onClose,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const t = useAdminT();
  const toast = useToast();
  const [label, setLabel] = useState('');
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!account) return setError(t('common.validation.accountRequired'));
    if (!password || password.length < 8) return setError(t('common.validation.passwordMin'));
    const parsedAccount = validateAccountName(account);
    if (!parsedAccount.ok) return setError(parsedAccount.error);
    setError(null);
    setSubmitting(true);
    try {
      await request('/admins', {
        method: 'POST',
        body: { label, account: parsedAccount.value, password },
      });
      toast.success(t('common.created'));
      setLabel('');
      setAccount('');
      setPassword('');
      await onDone();
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
      title={t('admins.create.title')}
      footer={
        <>
          <Button variant="default" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" loading={submitting} onClick={() => void submit()}>
            {t('common.create')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-[13px] font-medium text-fg">{t('common.field.label')}</label>
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={t('admins.label.hint')}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-[13px] font-medium text-fg">{t('common.field.account')}</label>
          <Input autoComplete="off" value={account} onChange={(e) => setAccount(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-[13px] font-medium text-fg">
            {t('common.field.password.initial')}
          </label>
          <PasswordInput
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {error ? <p className="text-[12px] text-danger">{error}</p> : null}
      </div>
    </Dialog>
  );
}

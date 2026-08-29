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

/** 管理员管理。只有超级管理员进得来。 */
export function AdminsPage() {
  useBreadcrumb([{ label: '管理员' }]);
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
      title: `删除管理员 ${admin.label || admin.account}？`,
      description: '他名下的用户不会被删除，而是转为「无归属」，需要你重新指派。',
      confirmText: '删除',
      danger: true,
    });
    if (!ok) return;
    await request(`/admins/${admin.id}`, { method: 'DELETE' });
    toast.success('已删除，名下用户已转为无归属');
    await load();
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-xl font-semibold text-fg">管理员</h1>
        <Button variant="primary" onClick={() => setCreating(true)}>
          新建管理员
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
                <th className="px-4 py-2.5 font-medium">后台备注</th>
                <th className="px-4 py-2.5 font-medium">登录用户名</th>
                <th className="px-4 py-2.5 font-medium">操作</th>
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
                        编辑
                      </Button>
                      <Button variant="danger-ghost" size="sm" onClick={() => void remove(admin)}>
                        删除
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
      toast.success('管理员账号已更新');
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
      title={`编辑管理员 · ${admin.label || admin.account}`}
      footer={
        <>
          <Button variant="default" onClick={onClose}>
            取消
          </Button>
          <Button variant="primary" loading={saving} onClick={() => void save()}>
            保存
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-[13px] font-medium text-fg">登录用户名</label>
          <Input
            autoComplete="off"
            value={account}
            onChange={(event) => setAccount(event.target.value.toLowerCase())}
          />
          <span className="text-[12px] text-muted">改名后该管理员当前的所有登录都会失效。</span>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-[13px] font-medium text-fg">后台备注</label>
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
  const toast = useToast();
  const [label, setLabel] = useState('');
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!account) return setError('账号必填');
    if (!password || password.length < 8) return setError('密码至少 8 位');
    const parsedAccount = validateAccountName(account);
    if (!parsedAccount.ok) return setError(parsedAccount.error);
    setError(null);
    setSubmitting(true);
    try {
      await request('/admins', {
        method: 'POST',
        body: { label, account: parsedAccount.value, password },
      });
      toast.success('已创建');
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
      title="新建管理员"
      footer={
        <>
          <Button variant="default" onClick={onClose}>
            取消
          </Button>
          <Button variant="primary" loading={submitting} onClick={() => void submit()}>
            创建
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-[13px] font-medium text-fg">后台备注</label>
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="用来认人，如「华东组」"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-[13px] font-medium text-fg">登录用户名</label>
          <Input autoComplete="off" value={account} onChange={(e) => setAccount(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-[13px] font-medium text-fg">初始密码</label>
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

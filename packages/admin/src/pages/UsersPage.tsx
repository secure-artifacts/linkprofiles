import { CheckCircle2, XCircle } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { validateAccountName } from '@link-profile/shared';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { request } from '../api/client.js';
import type { AdminSummary, ProfileSummary, UserSummary } from '../api/types.js';
import { useBreadcrumb } from '../nav/breadcrumb.js';
import { useSession } from '../session.js';
import { Alert } from '../ui/Alert.js';
import { Button } from '../ui/Button.js';
import { Dialog } from '../ui/Dialog.js';
import { Input, PasswordInput, Textarea } from '../ui/Input.js';
import { Select } from '../ui/Select.js';
import { Tag } from '../ui/Tag.js';
import { useToast } from '../ui/Toast.js';
import { useConfirm } from '../ui/useConfirm.js';
import { useAdminT } from '../i18n/runtime.js';

const PAGE_SIZE = 20;

/**
 * 用户管理。
 *
 * 管理员在这里只看得到归属于自己的用户（服务端过滤，不是前端藏起来）。
 * 超级管理员额外看得到「无归属」——归属管理员被删除后留下的账号，
 * 做成显眼的红色标记，避免它们长期没人管理。
 */
export function UsersPage() {
  const t = useAdminT();
  const session = useSession();
  const navigate = useNavigate();
  useBreadcrumb([{ label: t('nav.users') }]);
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [admins, setAdmins] = useState<AdminSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [editing, setEditing] = useState<UserSummary | null>(null);
  const [page, setPage] = useState(1);
  const toast = useToast();
  const { confirm, dialog: confirmDialog } = useConfirm();

  const isSuperadmin = session.role === 'superadmin';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await request<{ users: UserSummary[] }>('/users');
      setUsers(list.users);
      if (isSuperadmin) {
        setAdmins((await request<{ admins: AdminSummary[] }>('/admins')).admins);
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuperadmin]);

  useEffect(() => {
    void load();
  }, [load]);

  const unownedCount = users.filter((u) => u.owningAdminId === null).length;
  const totalPages = Math.max(1, Math.ceil(users.length / PAGE_SIZE));
  const pageUsers = users.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const remove = async (user: UserSummary) => {
    const ok = await confirm({
      title: t('users.delete.confirm', { name: user.label || user.account }),
      description: (
        <div className="flex flex-col gap-1.5 text-[13px] text-fg">
          <span>
            {t('users.delete.pagesCount', { count: user.profileCount })}
            <strong className="font-semibold">{t('users.delete.retiredAddress')}</strong>
            {t('users.delete.retiredTail')}
          </span>
          <span>{t('users.delete.mediaNote')}</span>
        </div>
      ),
      confirmText: t('common.delete'),
      danger: true,
    });
    if (!ok) return;
    await request(`/users/${user.id}`, { method: 'DELETE' });
    toast.success(t('common.deleted'));
    await load();
  };

  const assign = async (user: UserSummary, owningAdminId: string | null) => {
    await request(`/users/${user.id}/owner`, { method: 'PUT', body: { owningAdminId } });
    toast.success(t('users.reassigned'));
    await load();
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-fg">{t('nav.users')}</h1>
        <div className="flex gap-2">
          <Button variant="default" onClick={() => setBulkOpen(true)}>
            {t('users.bulk.title')}
          </Button>
          <Button variant="primary" onClick={() => setCreating(true)}>
            {t('users.create.title')}
          </Button>
        </div>
      </div>

      {isSuperadmin && unownedCount > 0 ? (
        <Alert
          tone="warning"
          message={t('users.unowned.count', { count: unownedCount })}
          description={t('users.unowned.hint')}
        />
      ) : null}

      <div className="overflow-x-auto rounded-[var(--radius-panel)] border border-border bg-surface">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-bg text-left text-[12px] font-medium text-muted">
              <th className="px-4 py-2.5">{t('common.field.label')}</th>
              <th className="px-4 py-2.5">{t('common.field.account')}</th>
              <th className="px-4 py-2.5">{t('users.pages')}</th>
              {isSuperadmin ? <th className="px-4 py-2.5">{t('users.owningAdmin')}</th> : null}
              <th className="px-4 py-2.5">{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={isSuperadmin ? 5 : 4} className="px-4 py-8 text-center text-muted">
                  {t('common.loading')}
                </td>
              </tr>
            ) : pageUsers.length === 0 ? (
              <tr>
                <td colSpan={isSuperadmin ? 5 : 4} className="px-4 py-8 text-center text-muted">
                  {t('users.empty')}
                </td>
              </tr>
            ) : (
              pageUsers.map((user) => (
                <tr
                  key={user.id}
                  className="h-[52px] border-b border-border last:border-b-0 hover:bg-surface-hover"
                >
                  <td className="px-4 py-2 text-fg">
                    {user.label || <span className="text-muted">—</span>}
                  </td>
                  <td className="px-4 py-2 font-mono text-[13px] text-fg">{user.account}</td>
                  <td className="px-4 py-2">
                    <button
                      type="button"
                      onClick={() => navigate(`/users/${user.id}/profiles`)}
                      className="text-accent hover:underline"
                    >
                      {t('users.pagesCount', { count: user.profileCount })}
                    </button>
                  </td>
                  {isSuperadmin ? (
                    <td className="px-4 py-2">
                      {user.owningAdminId === null ? (
                        <div className="flex items-center gap-2">
                          <Tag tone="danger">{t('users.unowned')}</Tag>
                          <div className="w-36">
                            <Select
                              size="sm"
                              placeholder={t('users.assignTo')}
                              value={undefined}
                              options={admins.map((a) => ({
                                value: a.id,
                                label: a.label || a.account,
                              }))}
                              onChange={(value) => void assign(user, value)}
                            />
                          </div>
                        </div>
                      ) : (
                        (user.owningAdminLabel ?? '—')
                      )}
                    </td>
                  ) : null}
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-1">
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => navigate(`/users/${user.id}/profiles`)}
                      >
                        {t('users.managePages')}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setEditing(user)}>
                        {t('users.accountSettings')}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => navigate(`/analytics?userId=${user.id}`)}
                      >
                        {t('users.analytics')}
                      </Button>
                      <Button variant="danger-ghost" size="sm" onClick={() => void remove(user)}>
                        {t('common.delete')}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {users.length > PAGE_SIZE ? (
          <div className="flex items-center justify-between border-t border-border px-4 py-2.5 text-[13px] text-muted">
            <span>{t('users.pagination', { count: users.length, size: PAGE_SIZE })}</span>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                {t('common.prevPage')}
              </Button>
              <span className="font-mono">
                {page} / {totalPages}
              </span>
              <Button
                variant="ghost"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                {t('common.nextPage')}
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      <AccountSettingsModal user={editing} onClose={() => setEditing(null)} onDone={load} />
      <CreateUserModal open={creating} onClose={() => setCreating(false)} onDone={load} />
      <BulkCreateModal open={bulkOpen} onClose={() => setBulkOpen(false)} onDone={load} />
      {confirmDialog}
    </div>
  );
}

/**
 * 账号设置：改登录用户名、个人页显示名、备注与密码。
 *
 * 页面地址不在这里改 —— 一个账号可以有多个个人页，地址属于页面而不属于账号，
 * 改名在个人页列表那一侧做。
 */
function AccountSettingsModal({
  user,
  onClose,
  onDone,
}: {
  user: UserSummary | null;
  onClose: () => void;
  onDone: () => Promise<void> | void;
}) {
  const t = useAdminT();
  const [label, setLabel] = useState('');
  const [account, setAccount] = useState('');
  const [profileOptions, setProfileOptions] = useState<ProfileSummary[]>([]);
  const [profileId, setProfileId] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loadingProfiles, setLoadingProfiles] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  useEffect(() => {
    setLabel(user?.label ?? '');
    setAccount(user?.account ?? '');
    setProfileOptions([]);
    setProfileId('');
    setDisplayName('');
    setNewPassword('');

    if (!user) return;
    let active = true;
    setLoadingProfiles(true);
    void request<{ profiles: ProfileSummary[] }>(`/users/${user.id}/profiles`)
      .then(({ profiles }) => {
        if (!active) return;
        const first = profiles[0];
        setProfileOptions(profiles);
        setProfileId(first?.id ?? '');
        setDisplayName(first?.displayName ?? '');
      })
      .catch((err) => {
        if (active) toast.error((err as Error).message);
      })
      .finally(() => {
        if (active) setLoadingProfiles(false);
      });

    return () => {
      active = false;
    };
    // toast is stable for the lifetime of the provider.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  if (!user) return null;

  const save = async () => {
    setSaving(true);
    try {
      const parsedAccount = validateAccountName(account);
      if (!parsedAccount.ok) throw new Error(parsedAccount.error);
      const nextAccount = parsedAccount.value;
      if (nextAccount !== user.account) {
        await request(`/users/${user.id}/account`, {
          method: 'PUT',
          body: { account: nextAccount },
        });
      }
      if (label !== user.label) {
        await request(`/users/${user.id}`, { method: 'PATCH', body: { label } });
      }
      const selectedProfile = profileOptions.find((profile) => profile.id === profileId);
      const nextDisplayName = displayName.trim();
      if (selectedProfile && !nextDisplayName) throw new Error(t('users.displayName.required'));
      if (selectedProfile && nextDisplayName.length > 60)
        throw new Error(t('users.displayName.tooLong'));
      if (selectedProfile && nextDisplayName !== selectedProfile.displayName) {
        await request(`/profiles/${selectedProfile.id}`, {
          method: 'PATCH',
          body: { displayName: nextDisplayName },
        });
      }
      if (newPassword) {
        await request(`/users/${user.id}/password`, { method: 'PUT', body: { newPassword } });
      }
      toast.success(t('common.saved'));
      onClose();
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
      onOpenChange={(open) => !open && onClose()}
      title={t('users.settings.title', { name: user.label || user.account })}
      footer={
        <>
          <Button variant="default" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="primary"
            loading={saving}
            disabled={loadingProfiles}
            onClick={() => void save()}
          >
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-fg">{t('common.field.account')}</span>
          <Input
            value={account}
            onChange={(e) => setAccount(e.target.value.toLowerCase())}
            placeholder={t('common.accountExample')}
            autoComplete="off"
          />
          <span className="text-[12px] text-muted">{t('users.rename.warning')}</span>
        </div>

        {profileOptions.length > 1 ? (
          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-fg">{t('users.selectProfile')}</span>
            <Select
              value={profileId}
              options={profileOptions.map((profile) => ({
                value: profile.id,
                label: `/${profile.shortName}`,
              }))}
              onChange={(value) => {
                const profile = profileOptions.find((item) => item.id === value);
                setProfileId(value);
                setDisplayName(profile?.displayName ?? '');
              }}
            />
          </div>
        ) : null}

        {profileId ? (
          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-fg">{t('users.field.displayName')}</span>
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={t('users.field.displayName.hint')}
              maxLength={60}
            />
            <span className="text-[12px] text-muted">
              {t('users.shownOn', {
                shortName: profileOptions.find((profile) => profile.id === profileId)?.shortName,
              })}
            </span>
          </div>
        ) : null}

        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-fg">{t('common.field.label')}</span>
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={t('users.field.label.hint')}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-fg">{t('users.resetPassword')}</span>
          <PasswordInput
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder={t('users.field.password.keep')}
            autoComplete="new-password"
          />
          <span className="text-[12px] text-muted">{t('users.resetPassword.warning')}</span>
        </div>
      </div>
    </Dialog>
  );
}

interface ModalProps {
  open: boolean;
  onClose: () => void;
  onDone: () => Promise<void> | void;
}

function CreateUserModal({ open, onClose, onDone }: ModalProps) {
  const t = useAdminT();
  const [label, setLabel] = useState('');
  const [account, setAccount] = useState('');
  const [shortName, setShortName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (open) {
      setLabel('');
      setAccount('');
      setShortName('');
      setPassword('');
      setError(null);
    }
  }, [open]);

  const valid = account.trim().length > 0 && shortName.trim().length > 0 && password.length >= 8;

  const submit = async () => {
    const parsedAccount = validateAccountName(account);
    if (!valid) {
      setError(
        !account.trim()
          ? t('users.validation.accountRequired')
          : !shortName.trim()
            ? t('users.validation.shortNameRequired')
            : t('common.validation.passwordMin'),
      );
      return;
    }
    if (!parsedAccount.ok) return setError(parsedAccount.error);
    setError(null);
    setSubmitting(true);
    try {
      await request('/users', {
        method: 'POST',
        body: { label, account: parsedAccount.value, shortName, password },
      });
      toast.success(t('common.created'));
      onClose();
      await onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={t('users.create.title')}
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
        {error ? <Alert tone="danger" message={error} /> : null}

        <Field label={t('common.field.label')} hint={t('users.field.label.hint')}>
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={t('users.label.example')}
          />
        </Field>
        <Field label={t('common.field.account')} hint={t('users.account.rule')}>
          <Input
            value={account}
            onChange={(e) => setAccount(e.target.value)}
            placeholder={t('users.account.hint')}
            autoComplete="off"
          />
        </Field>
        <Field label={t('users.field.shortName')} hint={t('users.shortName.hint')}>
          <Input
            addonBefore="/"
            value={shortName}
            onChange={(e) => setShortName(e.target.value)}
            placeholder={t('users.shortName.rule')}
          />
        </Field>
        <Field label={t('common.field.password.initial')}>
          <PasswordInput
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
          />
        </Field>
      </div>
    </Dialog>
  );
}

interface BulkResult {
  createdCount: number;
  failedCount: number;
  failed: { line: number; error: string }[];
}

const BULK_PLACEHOLDER = 'Lisa Reyes\tlisa.usa\tlisa-usa\tpassword-1234';

function BulkCreateModal({ open, onClose, onDone }: ModalProps) {
  const t = useAdminT();
  const [text, setText] = useState('');
  const [result, setResult] = useState<BulkResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const toast = useToast();

  const close = () => {
    setResult(null);
    onClose();
  };

  const submit = async () => {
    setSubmitting(true);
    try {
      const res = await request<BulkResult>('/users/bulk', { method: 'POST', body: { text } });
      setResult(res);
      if (res.createdCount > 0) await onDone();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && close()}
      title={t('users.bulk.title')}
      width={640}
      footer={
        result ? (
          <>
            <Button variant="default" onClick={close}>
              {t('common.cancel')}
            </Button>
            <Button variant="primary" onClick={() => setResult(null)}>
              {t('users.bulk.retryFailed')}
            </Button>
          </>
        ) : (
          <>
            <Button variant="default" onClick={close}>
              {t('common.cancel')}
            </Button>
            <Button variant="primary" loading={submitting} onClick={() => void submit()}>
              {t('users.bulk.start')}
            </Button>
          </>
        )
      }
    >
      {result ? (
        <div className="flex flex-col gap-4">
          <div className="flex gap-3">
            <div className="flex-1 rounded-[var(--radius-control)] border border-border bg-bg px-4 py-3">
              <div className="text-[12px] text-muted">{t('users.bulk.succeeded')}</div>
              <div className="font-mono text-2xl font-semibold text-accent">
                {result.createdCount}
              </div>
            </div>
            <div className="flex-1 rounded-[var(--radius-control)] border border-border bg-bg px-4 py-3">
              <div className="text-[12px] text-muted">{t('users.bulk.failed')}</div>
              <div className="font-mono text-2xl font-semibold text-danger">
                {result.failedCount}
              </div>
            </div>
          </div>

          <div className="max-h-80 overflow-y-auto rounded-[var(--radius-control)] border border-border">
            {Array.from({ length: result.createdCount + result.failedCount }, (_, i) => i + 1).map(
              (line) => {
                const failure = result.failed.find((f) => f.line === line);
                return (
                  <div
                    key={line}
                    className={`flex items-center gap-2.5 border-b border-border px-3 py-2 text-[13px] last:border-b-0
                    ${failure ? 'bg-danger-soft' : ''}`}
                  >
                    {failure ? (
                      <XCircle className="size-4 shrink-0 text-danger" />
                    ) : (
                      <CheckCircle2 className="size-4 shrink-0 text-accent" />
                    )}
                    <span className="w-14 shrink-0 whitespace-nowrap font-mono text-muted">
                      {t('users.bulk.line', { line })}
                    </span>
                    <span className={failure ? 'text-danger' : 'text-muted'}>
                      {failure ? failure.error : t('users.bulk.done')}
                    </span>
                  </div>
                );
              },
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-[13px] text-muted">
            {t('users.bulk.format')}
            <br />
            <code className="rounded bg-bg px-1.5 py-0.5 font-mono text-[12px]">
              {t('users.bulk.columns')}
            </code>
            <br />
            {t('users.bulk.partial')}
          </p>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={10}
            placeholder={BULK_PLACEHOLDER}
          />
        </div>
      )}
    </Dialog>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[13px] font-medium text-fg">
        {label}
        {hint ? <span className="ml-1.5 font-normal text-muted">· {hint}</span> : null}
      </span>
      {children}
    </label>
  );
}

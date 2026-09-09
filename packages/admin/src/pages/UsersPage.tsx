import { CheckCircle2, ChevronDown, ChevronRight, Search, X, XCircle } from 'lucide-react';
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { validateAccountName } from '@link-profile/shared';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { request } from '../api/client.js';
import type { ProfileSummary, RegionSummary, UserSummary } from '../api/types.js';
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
import { useAdminT, useErrorT } from '../i18n/runtime.js';
import { regionLabel } from '../regions/label.js';

/** 分页数的是区域，不是用户 —— 表格按「区域 → 用户」两层展开。 */
const PAGE_SIZE = 10;

/** 「全部区域」在下拉里得有个真值：Radix 的 Select 不接受空串当选项值。 */
const ALL_REGIONS = 'all';

/**
 * 用户管理。
 *
 * 管理员在这里只看得到自己名下区域里的用户（服务端过滤，不是前端藏起来）。
 * 超级管理员额外看得到无归属区域里的账号——归属管理员被删除后留下的那些，
 * 做成显眼的红色标记，避免它们长期没人管理。
 */
export function UsersPage() {
  const t = useAdminT();
  const session = useSession();
  const navigate = useNavigate();
  useBreadcrumb([{ label: t('nav.users') }]);
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [regions, setRegions] = useState<RegionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [editing, setEditing] = useState<UserSummary | null>(null);
  const [page, setPage] = useState(1);
  const [regionFilter, setRegionFilter] = useState<string | undefined>(undefined);
  const [search, setSearch] = useState('');
  const [term, setTerm] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // 记「收起了哪些」而不是「展开了哪些」：新出现的区域默认是打开的，
  // 搜索之后结果才不会藏在一排收起的行里。
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [moving, setMoving] = useState(false);
  const toast = useToast();
  const { confirm, dialog: confirmDialog } = useConfirm();

  const isSuperadmin = session.role === 'superadmin';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (regionFilter) params.set('region', regionFilter);
      if (term) params.set('q', term);
      const query = params.size > 0 ? `?${params}` : '';
      const list = await request<{ users: UserSummary[] }>(`/users${query}`);
      setUsers(list.users);
      setSelected(new Set());
      setRegions((await request<{ regions: RegionSummary[] }>('/regions')).regions);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuperadmin, regionFilter, term]);

  useEffect(() => {
    void load();
  }, [load]);

  // 停手再查。逐个字符发请求既压库，也会让结果在打字过程中乱跳。
  useEffect(() => {
    const timer = setTimeout(() => {
      setTerm(search.trim());
      setPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);

  const unownedCount = users.filter((u) => u.regionOwnerAdminId === null).length;
  const ownedRegions = regions.filter((r) => r.ownerAdminId !== null);

  /** 按区域分组。区域的先后跟着用户列表里第一次出现的顺序，与服务端排序一致。 */
  const groups = useMemo(() => {
    const byRegion = new Map<string, { key: string; name: string; users: UserSummary[] }>();
    for (const user of users) {
      const key = user.regionId ?? 'none';
      let group = byRegion.get(key);
      if (!group) {
        group = {
          key,
          name:
            user.regionId && user.regionName
              ? regionLabel(user.regionId, user.regionName)
              : t('users.unowned'),
          users: [],
        };
        byRegion.set(key, group);
      }
      group.users.push(user);
    }
    return [...byRegion.values()];
  }, [users, t]);

  const totalPages = Math.max(1, Math.ceil(groups.length / PAGE_SIZE));
  const pageGroups = groups.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const pageUsers = pageGroups.flatMap((group) => group.users);

  const toggleGroup = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const toggleGroupSelection = (group: { users: UserSummary[] }, checked: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const user of group.users) {
        if (checked) next.add(user.id);
        else next.delete(user.id);
      }
      return next;
    });

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

  const moveToRegion = async (userIds: string[], regionId: string) => {
    await request('/users/region', { method: 'PUT', body: { userIds, regionId } });
    toast.success(t('users.move.done'));
    await load();
  };

  const toggleSelected = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-fg">{t('nav.users')}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-64">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t('users.search.placeholder')}
              className="pl-8 pr-8"
            />
            {search === '' ? null : (
              <button
                type="button"
                aria-label={t('users.search.clear')}
                onClick={() => setSearch('')}
                className="absolute inset-y-0 right-0 flex w-8 items-center justify-center text-muted hover:text-fg"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
          <div className="w-48">
            <Select
              searchable
              placeholder={t('users.filter.region')}
              value={regionFilter ?? ALL_REGIONS}
              options={[
                { value: ALL_REGIONS, label: t('users.filter.region') },
                ...regions.map((r) => ({ value: r.id, label: regionLabel(r.id, r.name) })),
              ]}
              onChange={(value) => {
                setRegionFilter(value === ALL_REGIONS ? undefined : value);
                setPage(1);
              }}
            />
          </div>
          {selected.size > 0 ? (
            <Button variant="default" onClick={() => setMoving(true)}>
              {t('users.move.action')} · {t('users.selected', { count: selected.size })}
            </Button>
          ) : null}
          <Button variant="default" onClick={() => setBulkOpen(true)}>
            {t('bulk.title')}
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
              <th className="w-10 px-4 py-2.5">
                <input
                  type="checkbox"
                  aria-label={t('users.selectAll')}
                  checked={pageUsers.length > 0 && pageUsers.every((u) => selected.has(u.id))}
                  onChange={(event) =>
                    setSelected(
                      event.target.checked ? new Set(pageUsers.map((u) => u.id)) : new Set(),
                    )
                  }
                />
              </th>
              <th className="px-4 py-2.5">{t('common.field.label')}</th>
              <th className="px-4 py-2.5">{t('common.field.account')}</th>
              <th className="px-4 py-2.5">{t('users.pages')}</th>
              <th className="px-4 py-2.5">{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted">
                  {t('common.loading')}
                </td>
              </tr>
            ) : pageUsers.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted">
                  {term === '' ? t('users.empty') : t('users.search.empty', { term })}
                </td>
              </tr>
            ) : (
              pageGroups.map((group) => {
                const open = !collapsed.has(group.key);
                const allSelected = group.users.every((user) => selected.has(user.id));
                return (
                  <Fragment key={group.key}>
                    <tr className="border-b border-border bg-bg">
                      <td className="px-4 py-2">
                        <input
                          type="checkbox"
                          aria-label={group.name}
                          checked={allSelected}
                          onChange={(event) => toggleGroupSelection(group, event.target.checked)}
                        />
                      </td>
                      <td className="px-4 py-2" colSpan={4}>
                        <button
                          type="button"
                          onClick={() => toggleGroup(group.key)}
                          aria-expanded={open}
                          className="flex items-center gap-1.5 text-[13px] font-medium text-fg"
                        >
                          {open ? (
                            <ChevronDown className="size-3.5 text-muted" />
                          ) : (
                            <ChevronRight className="size-3.5 text-muted" />
                          )}
                          {group.name}
                          <span className="font-normal text-muted">
                            · {t('regions.membersCount', { count: group.users.length })}
                          </span>
                        </button>
                      </td>
                    </tr>
                    {open
                      ? group.users.map((user) => (
                          <tr
                            key={user.id}
                            className="h-[52px] border-b border-border last:border-b-0 hover:bg-surface-hover"
                          >
                            <td className="px-4 py-2">
                              <input
                                type="checkbox"
                                aria-label={user.label || user.account}
                                checked={selected.has(user.id)}
                                onChange={() => toggleSelected(user.id)}
                              />
                            </td>
                            <td className="py-2 pl-9 pr-4 text-fg">
                              {user.label || <span className="text-muted">—</span>}
                            </td>
                            <td className="px-4 py-2 font-mono text-[13px] text-fg">
                              {user.account}
                            </td>
                            <td className="px-4 py-2">
                              <button
                                type="button"
                                onClick={() => navigate(`/users/${user.id}/profiles`)}
                                className="text-accent hover:underline"
                              >
                                {t('users.pagesCount', { count: user.profileCount })}
                              </button>
                            </td>
                            <td className="px-4 py-2">
                              <div className="flex items-center gap-1">
                                {isSuperadmin && user.regionOwnerAdminId === null ? (
                                  <div className="mr-1 flex items-center gap-2">
                                    <Tag tone="danger">{t('users.unowned')}</Tag>
                                    <div className="w-36">
                                      <Select
                                        size="sm"
                                        searchable
                                        placeholder={t('users.assignTo')}
                                        value={undefined}
                                        options={ownedRegions.map((r) => ({
                                          value: r.id,
                                          label: regionLabel(r.id, r.name),
                                        }))}
                                        onChange={(value) => void moveToRegion([user.id], value)}
                                      />
                                    </div>
                                  </div>
                                ) : null}
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
                                <Button
                                  variant="danger-ghost"
                                  size="sm"
                                  onClick={() => void remove(user)}
                                >
                                  {t('common.delete')}
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))
                      : null}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>

        {groups.length > PAGE_SIZE ? (
          <div className="flex items-center justify-between border-t border-border px-4 py-2.5 text-[13px] text-muted">
            <span>{t('users.pagination', { count: users.length, regions: groups.length })}</span>
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
      <CreateUserModal
        open={creating}
        onClose={() => setCreating(false)}
        onDone={load}
        regions={ownedRegions}
      />
      <BulkCreateModal
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        onDone={load}
        regions={ownedRegions}
      />
      <MoveRegionDialog
        open={moving}
        count={selected.size}
        regions={regions}
        onClose={() => setMoving(false)}
        onConfirm={async (regionId) => {
          await moveToRegion([...selected], regionId);
          setMoving(false);
        }}
      />
      {confirmDialog}
    </div>
  );
}

function MoveRegionDialog({
  open,
  count,
  regions,
  onClose,
  onConfirm,
}: {
  open: boolean;
  count: number;
  regions: RegionSummary[];
  onClose: () => void;
  onConfirm: (regionId: string) => Promise<void>;
}) {
  const t = useAdminT();
  const toast = useToast();
  const [regionId, setRegionId] = useState<string | undefined>(undefined);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setRegionId(undefined);
  }, [open]);

  if (!open) return null;

  const submit = async () => {
    if (!regionId) return;
    setSaving(true);
    try {
      await onConfirm(regionId);
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
      title={t('users.move.title')}
      footer={
        <>
          <Button variant="default" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="primary"
            loading={saving}
            disabled={!regionId}
            onClick={() => void submit()}
          >
            {t('users.move.action')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-[13px] text-fg">{t('users.selected', { count })}</p>
        <div className="flex flex-col gap-1.5">
          <label className="text-[13px] font-medium text-fg">{t('users.move.target')}</label>
          <Select
            value={regionId}
            options={regions.map((r) => ({ value: r.id, label: regionLabel(r.id, r.name) }))}
            onChange={(value) => setRegionId(value)}
          />
        </div>
        {/* 移区会改变历史报表的区域数字，见 ADR-0019 */}
        <p className="text-[12px] text-muted">{t('users.move.note')}</p>
      </div>
    </Dialog>
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
  const errorT = useErrorT();
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
      if (!parsedAccount.ok) throw new Error(errorT(parsedAccount.error));
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

function CreateUserModal({
  open,
  onClose,
  onDone,
  regions,
}: ModalProps & { regions: RegionSummary[] }) {
  const t = useAdminT();
  const errorT = useErrorT();
  const [label, setLabel] = useState('');
  const [account, setAccount] = useState('');
  const [shortName, setShortName] = useState('');
  const [password, setPassword] = useState('');
  const [regionId, setRegionId] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (open) {
      setLabel('');
      setAccount('');
      setShortName('');
      setPassword('');
      setRegionId(undefined);
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
    if (!parsedAccount.ok) return setError(errorT(parsedAccount.error));
    setError(null);
    setSubmitting(true);
    try {
      await request('/users', {
        method: 'POST',
        body: {
          label,
          account: parsedAccount.value,
          shortName,
          password,
          ...(regionId ? { regionId } : {}),
        },
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
        {regions.length > 0 ? (
          <Field label={t('users.create.region')} hint={t('users.create.region.hint')}>
            <Select
              value={regionId}
              placeholder={t('users.create.region.hint')}
              options={regions.map((r) => ({ value: r.id, label: regionLabel(r.id, r.name) }))}
              onChange={(value) => setRegionId(value)}
            />
          </Field>
        ) : null}
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
  created: { line: number; shortName: string }[];
  failed: { line: number; error: string }[];
}

const BULK_PLACEHOLDER = 'Lisa Reyes\tlisa.usa\tlisa-usa\tpassword-1234';

function BulkCreateModal({
  open,
  onClose,
  onDone,
  regions,
}: ModalProps & { regions: RegionSummary[] }) {
  const t = useAdminT();
  const [text, setText] = useState('');
  const [regionId, setRegionId] = useState<string | undefined>(undefined);
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
      const res = await request<BulkResult>('/users/bulk', {
        method: 'POST',
        body: { text, ...(regionId ? { regionId } : {}) },
      });
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
      title={t('bulk.title')}
      width={640}
      footer={
        result ? (
          // 全建成了就没有「失败行」可回去改，只留一个收尾按钮
          result.failedCount === 0 ? (
            <Button variant="primary" onClick={close}>
              {t('common.close')}
            </Button>
          ) : (
            <>
              <Button variant="default" onClick={close}>
                {t('common.cancel')}
              </Button>
              <Button variant="primary" onClick={() => setResult(null)}>
                {t('bulk.retryFailed')}
              </Button>
            </>
          )
        ) : (
          <>
            <Button variant="default" onClick={close}>
              {t('common.cancel')}
            </Button>
            <Button variant="primary" loading={submitting} onClick={() => void submit()}>
              {t('bulk.start')}
            </Button>
          </>
        )
      }
    >
      {result ? (
        <div className="flex flex-col gap-4">
          <div className="flex gap-3">
            <div className="flex-1 rounded-[var(--radius-control)] border border-border bg-bg px-4 py-3">
              <div className="text-[12px] text-muted">{t('bulk.succeeded')}</div>
              <div className="font-mono text-2xl font-semibold text-accent">
                {result.createdCount}
              </div>
            </div>
            <div className="flex-1 rounded-[var(--radius-control)] border border-border bg-bg px-4 py-3">
              <div className="text-[12px] text-muted">{t('bulk.failed')}</div>
              <div className="font-mono text-2xl font-semibold text-danger">
                {result.failedCount}
              </div>
            </div>
          </div>

          <div className="max-h-80 overflow-y-auto rounded-[var(--radius-control)] border border-border">
            {/* 逐行回放按服务端给的行号排，不按结果条数从 1 数 —— 中间的空行是
                跳过的，从 1 数会让后面每一行的行号都对不上用户的原文。 */}
            {[
              ...result.created.map((row) => ({
                line: row.line,
                text: `/${row.shortName}`,
                ok: true,
              })),
              ...result.failed.map((row) => ({ line: row.line, text: row.error, ok: false })),
            ]
              .sort((a, b) => a.line - b.line)
              .map((row) => (
                <div
                  key={row.line}
                  className={`flex items-center gap-2.5 border-b border-border px-3 py-2 text-[13px] last:border-b-0
                    ${row.ok ? '' : 'bg-danger-soft'}`}
                >
                  {row.ok ? (
                    <CheckCircle2 className="size-4 shrink-0 text-accent" />
                  ) : (
                    <XCircle className="size-4 shrink-0 text-danger" />
                  )}
                  <span className="w-14 shrink-0 whitespace-nowrap font-mono text-muted">
                    {t('bulk.line', { line: row.line })}
                  </span>
                  <span className={row.ok ? 'font-mono text-fg' : 'text-danger'}>{row.text}</span>
                </div>
              ))}
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
            {t('bulk.partial')}
          </p>
          {regions.length > 0 ? (
            <Field label={t('users.create.region')} hint={t('users.create.region.hint')}>
              <Select
                value={regionId}
                placeholder={t('users.create.region.hint')}
                options={regions.map((r) => ({ value: r.id, label: regionLabel(r.id, r.name) }))}
                onChange={(value) => setRegionId(value)}
              />
            </Field>
          ) : null}
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

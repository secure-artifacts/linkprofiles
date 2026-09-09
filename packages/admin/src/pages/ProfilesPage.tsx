import { AvatarPlaceholder } from '@link-profile/profile-ui';
import { ArrowRight, Copy, ExternalLink, KeyRound, Plus, Share2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { request } from '../api/client.js';
import type { ProfileSummary, ShortNameChange, UserSummary } from '../api/types.js';
import { useBreadcrumb } from '../nav/breadcrumb.js';
import { useSession } from '../session.js';
import { Alert } from '../ui/Alert.js';
import { Button } from '../ui/Button.js';
import { Dialog } from '../ui/Dialog.js';
import { Input } from '../ui/Input.js';
import { Spinner } from '../ui/Spinner.js';
import { useToast } from '../ui/Toast.js';
import { useConfirm } from '../ui/useConfirm.js';
import { useAdminT } from '../i18n/runtime.js';
import { isoDate } from '../format.js';

/** 布局的名字在 CONTEXT.md 里就是这四个，属于术语而不是文案，不进译文目录。 */
const LAYOUT_LABELS: Record<string, string> = {
  classic: 'Classic',
  hero: 'Hero',
  banner: 'Banner',
  shape: 'Shape',
};

/**
 * 一个账号名下的个人页列表。
 *
 * 用户看到的是「我的页面」，管理员是从用户列表点进来的同一个页面 —— 区别只在
 * 能不能新建、改地址、删除（那一档权限用户没有，服务端拦，这里同步隐藏）。
 */
export function ProfilesPage() {
  const t = useAdminT();
  const { userId = '' } = useParams();
  const session = useSession();
  const navigate = useNavigate();
  const toast = useToast();
  const { confirm, dialog: confirmDialog } = useConfirm();

  const [profiles, setProfiles] = useState<ProfileSummary[]>([]);
  const [owner, setOwner] = useState<UserSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [duplicating, setDuplicating] = useState<ProfileSummary | null>(null);
  const [renaming, setRenaming] = useState<ProfileSummary | null>(null);
  const [sharing, setSharing] = useState<ProfileSummary | null>(null);
  const [managingApi, setManagingApi] = useState<ProfileSummary | null>(null);

  const isSelf = userId === session.id;
  // 建页面与改地址不用判断：进得来这个列表的人（本人，或他的管理员）本来就有
  // 这两档权限。删不一样 —— 它不可逆（地址进墓碑、媒体从磁盘删掉），本人做不了。
  const canDelete = !isSelf && session.role !== 'user';

  const ownerName = owner?.label || owner?.account || '';
  useBreadcrumb(
    isSelf
      ? [{ label: t('nav.myPages') }]
      : [{ label: t('nav.users'), to: '/users' }, { label: ownerName || t('nav.account') }],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, users] = await Promise.all([
        request<{ profiles: ProfileSummary[] }>(`/users/${userId}/profiles`),
        isSelf
          ? Promise.resolve({ users: [] as UserSummary[] })
          : request<{ users: UserSummary[] }>('/users'),
      ]);
      setProfiles(list.profiles);
      setOwner(users.users.find((u) => u.id === userId) ?? null);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [userId, isSelf]);

  useEffect(() => {
    void load();
  }, [load]);

  const remove = async (profile: ProfileSummary) => {
    const ok = await confirm({
      title: t('profiles.delete.confirm', { shortName: profile.shortName }),
      description: (
        <div className="flex flex-col gap-1.5 text-[13px] text-fg">
          <span>
            {t('profiles.tombstone.lead')}
            <strong className="font-semibold">{t('profiles.tombstone.retired')}</strong>
            {t('profiles.tombstone.tail')}
          </span>
          <span>{t('profiles.delete.mediaNote')}</span>
          {profiles.length === 1 ? (
            <span className="text-danger">{t('profiles.lastPageWarning')}</span>
          ) : null}
        </div>
      ),
      confirmText: t('common.delete'),
      danger: true,
    });
    if (!ok) return;
    try {
      await request(`/profiles/${profile.id}`, { method: 'DELETE' });
      toast.success(t('common.deleted'));
      await load();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  if (loading) return <Spinner fullscreen />;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h1 className="text-xl font-semibold text-fg">
            {isSelf ? t('nav.myPages') : t('profiles.owner.pages', { name: ownerName })}
          </h1>
          <span className="text-[13px] text-muted">
            {t('profiles.multiHint')}
            {isSelf ? t('profiles.delete.askAdmin') : ''}
          </span>
        </div>
        <Button variant="primary" onClick={() => setCreating(true)}>
          <Plus className="size-4" />
          {t('profiles.create.title')}
        </Button>
      </div>

      {error ? <Alert tone="danger" message={error} /> : null}

      {profiles.length === 0 ? (
        <div className="rounded-[var(--radius-panel)] border border-dashed border-border bg-surface px-6 py-16 text-center text-[13px] text-muted">
          {t('profiles.empty')}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {profiles.map((profile) => (
            <article
              key={profile.id}
              className="flex min-w-0 flex-col overflow-hidden rounded-[var(--radius-panel)] border border-border bg-surface"
            >
              <div className="flex items-center gap-3 px-4 py-3">
                <button
                  type="button"
                  onClick={() => navigate(`/profiles/${profile.id}`)}
                  className="flex min-w-0 flex-1 items-center gap-3 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <span className="size-10 shrink-0 overflow-hidden rounded-full border border-border bg-bg">
                    {profile.avatarUrl ? (
                      <img src={profile.avatarUrl} alt="" className="size-full object-cover" />
                    ) : (
                      <AvatarPlaceholder />
                    )}
                  </span>
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate font-display text-[15px] font-semibold text-fg">
                      {profile.displayName || profile.shortName}
                    </span>
                    <span className="text-[11px] text-muted">{t('profiles.previewHint')}</span>
                  </span>
                </button>
                <div className="flex shrink-0 items-center gap-2 text-[11px] text-muted">
                  <span className="rounded-full border border-border px-2 py-0.5">
                    {LAYOUT_LABELS[profile.layout] ?? profile.layout}
                  </span>
                  <a
                    href={`/${profile.shortName}`}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={t('profiles.openInNewTab', { shortName: profile.shortName })}
                    className="rounded p-1 text-accent hover:bg-bg"
                  >
                    <ExternalLink className="size-3.5" />
                  </a>
                </div>
              </div>

              <div className="relative h-56 overflow-hidden border-y border-border bg-bg/60">
                <iframe
                  src={`/_api/profiles/${profile.id}/preview`}
                  title={t('profiles.previewAlt', {
                    name: profile.displayName || profile.shortName,
                  })}
                  sandbox="allow-same-origin"
                  tabIndex={-1}
                  className="pointer-events-none absolute left-1/2 top-0 h-[820px] w-[390px] origin-top -translate-x-1/2 scale-[0.68] border-0"
                />
                <button
                  type="button"
                  aria-label={t('profiles.editAria', {
                    name: profile.displayName || profile.shortName,
                  })}
                  onClick={() => navigate(`/profiles/${profile.id}`)}
                  className="absolute inset-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
                />
              </div>

              <div className="flex min-w-0 items-center gap-1 px-3 py-2.5">
                <span className="mr-auto min-w-0 truncate font-mono text-[12px] text-accent">
                  /{profile.shortName}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate(`/analytics?profileId=${profile.id}`)}
                >
                  {t('profiles.action.analytics')}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setSharing(profile)}>
                  <Share2 className="size-3.5" />
                  {t('profiles.action.promo')}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setDuplicating(profile)}>
                  <Copy className="size-3.5" />
                  {t('profiles.action.duplicate')}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setManagingApi(profile)}>
                  <KeyRound className="size-3.5" />
                  API
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setRenaming(profile)}>
                  {t('profiles.action.changeAddress')}
                </Button>
                {canDelete ? (
                  <Button variant="danger-ghost" size="sm" onClick={() => void remove(profile)}>
                    {t('common.delete')}
                  </Button>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      )}

      <CreateProfileModal
        open={creating}
        userId={userId}
        onClose={() => setCreating(false)}
        onDone={load}
      />
      <DuplicateProfileModal profile={duplicating} onClose={() => setDuplicating(null)} />
      <RenameProfileModal profile={renaming} onClose={() => setRenaming(null)} onDone={load} />
      <ShareLinksModal profile={sharing} onClose={() => setSharing(null)} />
      <ApiKeysModal profile={managingApi} onClose={() => setManagingApi(null)} />
      {confirmDialog}
    </div>
  );
}

interface ApiKeySummary {
  id: string;
  label: string;
  tokenPrefix: string;
  scopes: string[];
  expiresAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
}

function ApiKeysModal({
  profile,
  onClose,
}: {
  profile: ProfileSummary | null;
  onClose: () => void;
}) {
  const t = useAdminT();
  const toast = useToast();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [keys, setKeys] = useState<ApiKeySummary[]>([]);
  const [label, setLabel] = useState(t('apiKeys.title'));
  const [expiresAt, setExpiresAt] = useState('');
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const profileId = profile?.id;
  const loadKeys = useCallback(async () => {
    if (!profileId) return;
    setLoading(true);
    try {
      const result = await request<{ keys: ApiKeySummary[] }>(`/profiles/${profileId}/api-keys`);
      setKeys(result.keys);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [profileId]);

  useEffect(() => {
    if (!profileId) return;
    setCreatedToken(null);
    setLabel(t('apiKeys.title'));
    setExpiresAt('');
    void loadKeys();
  }, [profileId, loadKeys]);

  if (!profile) return null;

  const create = async () => {
    if (!label.trim()) {
      setError(t('apiKeys.label.required'));
      return;
    }
    setCreating(true);
    try {
      const result = await request<ApiKeySummary & { token: string }>(
        `/profiles/${profile.id}/api-keys`,
        {
          method: 'POST',
          body: {
            label: label.trim(),
            scopes: ['contacts:read', 'contacts:write'],
            expiresAt: expiresAt ? new Date(`${expiresAt}T23:59:59Z`).toISOString() : null,
          },
        },
      );
      setCreatedToken(result.token);
      toast.success(t('apiKeys.created'));
      await loadKeys();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCreating(false);
    }
  };

  const revoke = async (key: ApiKeySummary) => {
    const ok = await confirm({
      title: t('apiKeys.revoke.confirm', { label: key.label }),
      description: t('apiKeys.revoke.warning'),
      confirmText: t('apiKeys.revoke'),
      danger: true,
    });
    if (!ok) return;
    await request(`/profiles/${profile.id}/api-keys/${key.id}`, { method: 'DELETE' });
    toast.success(t('apiKeys.revoked'));
    await loadKeys();
  };

  const endpoint = `${window.location.origin}/_api/v1/profiles/${profile.id}/contacts`;
  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={t('apiKeys.manage.title', { shortName: profile.shortName })}
      width={720}
    >
      <div className="flex flex-col gap-4">
        {error ? <Alert tone="danger" message={error} /> : null}
        <Alert tone="info" message={t('apiKeys.purpose')} description={t('apiKeys.scope')} />

        {createdToken ? (
          <div className="flex flex-col gap-2 rounded-[var(--radius-control)] border border-warning bg-warning-soft p-3">
            <span className="text-[13px] font-semibold text-fg">{t('apiKeys.copyNow')}</span>
            <div className="flex gap-2">
              <Input value={createdToken} readOnly />
              <Button
                variant="primary"
                onClick={() => {
                  void navigator.clipboard.writeText(createdToken);
                  toast.success(t('apiKeys.copied'));
                }}
              >
                <Copy className="size-4" />
                {t('profiles.action.duplicate')}
              </Button>
            </div>
          </div>
        ) : null}

        <div className="grid gap-3 rounded-[var(--radius-control)] border border-border bg-bg p-3 sm:grid-cols-[1fr_180px_auto]">
          <Input
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder={t('apiKeys.field.label')}
          />
          <Input
            type="date"
            value={expiresAt}
            onChange={(event) => setExpiresAt(event.target.value)}
            aria-label={t('apiKeys.field.expiry')}
          />
          <Button variant="primary" loading={creating} onClick={() => void create()}>
            <KeyRound className="size-4" />
            {t('apiKeys.create')}
          </Button>
          <span className="text-[11px] text-muted sm:col-span-3">{t('apiKeys.expiryHint')}</span>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-fg">{t('apiKeys.endpoint')}</span>
          <code className="overflow-x-auto rounded-[var(--radius-control)] border border-border bg-bg px-3 py-2 text-[12px] text-muted">
            PATCH {endpoint}
          </code>
        </div>

        <div className="flex flex-col overflow-hidden rounded-[var(--radius-control)] border border-border">
          {loading ? (
            <div className="py-8">
              <Spinner />
            </div>
          ) : keys.length === 0 ? (
            <div className="px-3 py-8 text-center text-[12px] text-muted">{t('apiKeys.empty')}</div>
          ) : (
            keys.map((key) => (
              <div
                key={key.id}
                className="flex items-center gap-3 border-b border-border px-3 py-2.5 last:border-0"
              >
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-[13px] font-medium text-fg">{key.label}</span>
                  <span className="font-mono text-[11px] text-muted">
                    {key.tokenPrefix}••••••••
                  </span>
                </div>
                <span className="hidden text-[11px] text-muted sm:block">
                  {key.lastUsedAt
                    ? t('apiKeys.lastUsed', { date: isoDate(key.lastUsedAt) })
                    : t('apiKeys.neverUsed')}
                </span>
                <span className="hidden text-[11px] text-muted md:block">
                  {key.expiresAt
                    ? t('apiKeys.expiresOn', { date: isoDate(key.expiresAt) })
                    : t('apiKeys.noExpiry')}
                </span>
                <Button variant="danger-ghost" size="sm" onClick={() => void revoke(key)}>
                  {t('apiKeys.revoke')}
                </Button>
              </div>
            ))
          )}
        </div>
      </div>
      {confirmDialog}
    </Dialog>
  );
}

const SOURCE_PRESETS = [
  { id: 'tiktok', label: 'TikTok' },
  { id: 'instagram', label: 'Instagram' },
  { id: 'youtube', label: 'YouTube' },
  { id: 'facebook', label: 'Facebook' },
  { id: 'whatsapp', label: 'WhatsApp' },
] as const;

function ShareLinksModal({
  profile,
  onClose,
}: {
  profile: ProfileSummary | null;
  onClose: () => void;
}) {
  const t = useAdminT();
  const [customSource, setCustomSource] = useState('');
  const toast = useToast();
  if (!profile) return null;

  const base = `${window.location.origin}/${profile.shortName}`;
  const validCustom = /^[a-z0-9_-]{1,32}$/.test(customSource.trim().toLowerCase());
  const copy = async (source: string) => {
    const url = `${base}?src=${encodeURIComponent(source)}`;
    await navigator.clipboard.writeText(url);
    toast.success(t('promo.copied', { source }));
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={t('promo.title', { shortName: profile.shortName })}
      width={600}
    >
      <div className="flex flex-col gap-4">
        <Alert tone="info" message={t('promo.perPlatform')} description={t('promo.why')} />
        <div className="flex flex-col overflow-hidden rounded-[var(--radius-control)] border border-border">
          {SOURCE_PRESETS.map((source) => (
            <div
              key={source.id}
              className="flex items-center gap-3 border-b border-border px-3 py-2.5 last:border-0"
            >
              <span className="w-24 shrink-0 text-[13px] font-medium text-fg">{source.label}</span>
              <code className="min-w-0 flex-1 truncate text-[12px] text-muted">
                {base}?src={source.id}
              </code>
              <Button size="sm" variant="default" onClick={() => void copy(source.id)}>
                <Copy className="size-3.5" />
                {t('profiles.action.duplicate')}
              </Button>
            </div>
          ))}
        </div>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-fg">{t('promo.customSource')}</span>
          <div className="flex gap-2">
            <Input
              value={customSource}
              onChange={(event) => setCustomSource(event.target.value)}
              placeholder={t('promo.customSource.hint')}
            />
            <Button
              variant="default"
              disabled={!validCustom}
              onClick={() => void copy(customSource.trim().toLowerCase())}
            >
              <Copy className="size-4" />
              {t('profiles.action.duplicate')}
            </Button>
          </div>
        </label>
      </div>
    </Dialog>
  );
}

function DuplicateProfileModal({
  profile,
  onClose,
}: {
  profile: ProfileSummary | null;
  onClose: () => void;
}) {
  const t = useAdminT();
  const navigate = useNavigate();
  const toast = useToast();
  const [shortName, setShortName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!profile) return;
    const suffix = '-copy';
    setShortName(`${profile.shortName.slice(0, 30 - suffix.length)}${suffix}`);
    setDisplayName(
      t('duplicate.suffix', { name: profile.displayName || profile.shortName }).slice(0, 60),
    );
    setError(null);
  }, [profile]);

  if (!profile) return null;

  const submit = async () => {
    if (!shortName.trim() || !displayName.trim()) {
      setError(t('duplicate.required'));
      return;
    }
    setSubmitting(true);
    try {
      const created = await request<{ id: string }>(`/profiles/${profile.id}/duplicate`, {
        method: 'POST',
        body: { shortName: shortName.trim(), displayName: displayName.trim() },
      });
      toast.success(t('duplicate.done'));
      onClose();
      navigate(`/profiles/${created.id}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={t('duplicate.title', { shortName: profile.shortName })}
      footer={
        <>
          <Button variant="default" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" loading={submitting} onClick={() => void submit()}>
            {t('duplicate.action')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {error ? <Alert tone="danger" message={error} /> : null}
        <Alert
          tone="info"
          message={t('duplicate.subtitle')}
          description={t('duplicate.whatCopies')}
        />
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-fg">{t('duplicate.field.shortName')}</span>
          <Input
            addonBefore="/"
            value={shortName}
            onChange={(event) => setShortName(event.target.value)}
            placeholder={t('users.shortName.rule')}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-fg">
            {t('duplicate.field.displayName')}
          </span>
          <Input value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
        </label>
      </div>
    </Dialog>
  );
}

function CreateProfileModal({
  open,
  userId,
  onClose,
  onDone,
}: {
  open: boolean;
  userId: string;
  onClose: () => void;
  onDone: () => Promise<void> | void;
}) {
  const t = useAdminT();
  const [shortName, setShortName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (open) {
      setShortName('');
      setDisplayName('');
      setError(null);
    }
  }, [open]);

  const submit = async () => {
    if (!shortName.trim()) {
      setError(t('users.validation.shortNameRequired'));
      return;
    }
    setSubmitting(true);
    try {
      await request(`/users/${userId}/profiles`, {
        method: 'POST',
        body: { shortName: shortName.trim(), displayName: displayName.trim() },
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
      title={t('profiles.create.title')}
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
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-fg">{t('shortName.field.new')}</span>
          <Input
            addonBefore="/"
            value={shortName}
            onChange={(e) => setShortName(e.target.value)}
            placeholder={t('users.shortName.rule')}
          />
          <span className="text-[12px] text-muted">{t('shortName.publicAsset')}</span>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-fg">{t('profiles.field.displayName')}</span>
          <Input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder={t('profiles.create.displayNameHint')}
          />
        </label>
      </div>
    </Dialog>
  );
}

function RenameProfileModal({
  profile,
  onClose,
  onDone,
}: {
  profile: ProfileSummary | null;
  onClose: () => void;
  onDone: () => Promise<void> | void;
}) {
  const t = useAdminT();
  const [shortName, setShortName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  /** 填完地址先看一遍后果，再点第二次才真的改 */
  const [confirming, setConfirming] = useState(false);
  const [changes, setChanges] = useState<ShortNameChange[]>([]);
  const toast = useToast();

  const profileId = profile?.id;
  useEffect(() => {
    setShortName(profile?.shortName ?? '');
    setError(null);
    setConfirming(false);
    if (!profileId) return;
    request<{ changes: ShortNameChange[] }>(`/profiles/${profileId}/short-name-history`)
      .then((res) => setChanges(res.changes))
      .catch(() => setChanges([]));
  }, [profile, profileId]);

  if (!profile) return null;

  const next = shortName.trim();
  const unchanged = next === profile.shortName;

  const save = async () => {
    setSaving(true);
    try {
      await request(`/profiles/${profile.id}/short-name`, {
        method: 'PATCH',
        body: { shortName: next },
      });
      toast.success(t('shortName.changed'));
      onClose();
      await onDone();
    } catch (err) {
      setError((err as Error).message);
      setConfirming(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={t('shortName.change.title', { shortName: profile.shortName })}
      width={520}
      footer={
        <>
          <Button variant="default" onClick={confirming ? () => setConfirming(false) : onClose}>
            {confirming ? t('shortName.change.back') : t('common.cancel')}
          </Button>
          <Button
            variant={confirming ? 'danger' : 'primary'}
            loading={saving}
            disabled={next.length === 0 || unchanged}
            onClick={() => (confirming ? void save() : setConfirming(true))}
          >
            {confirming ? t('shortName.change.confirm', { next }) : t('shortName.change.next')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {error ? <Alert tone="danger" message={error} /> : null}

        {confirming ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 text-[15px] font-medium text-fg">
              <span className="font-mono text-muted line-through">/{profile.shortName}</span>
              <ArrowRight className="size-4 text-muted" />
              <span className="font-mono text-accent">/{next}</span>
            </div>
            <Alert
              tone="warning"
              message={t('shortName.change.consequences')}
              description={
                <ul className="flex list-disc flex-col gap-1 pl-4">
                  <li>
                    {t('shortName.change.printed')}
                    <span className="font-mono"> /{profile.shortName} </span>
                    {t('shortName.change.printedTail')}
                  </li>
                  <li>{t('shortName.change.released')}</li>
                  <li>{t('shortName.change.tracking')}</li>
                </ul>
              }
            />
            <p className="text-[12px] text-muted">{t('shortName.change.logged')}</p>
          </div>
        ) : (
          <>
            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] font-medium text-fg">{t('shortName.field.new')}</span>
              <Input
                addonBefore="/"
                value={shortName}
                onChange={(e) => setShortName(e.target.value)}
                placeholder={t('users.shortName.rule')}
              />
              <span className="text-[12px] text-muted">{t('shortName.change.tombstoned')}</span>
            </label>

            {changes.length > 0 ? (
              <div className="flex flex-col gap-2">
                <span className="text-[13px] font-medium text-fg">{t('shortName.history')}</span>
                <div className="flex max-h-44 flex-col overflow-y-auto rounded-[var(--radius-control)] border border-border">
                  {changes.map((change) => (
                    <div
                      key={change.id}
                      className="flex items-center gap-2 border-b border-border px-3 py-2 text-[12px] last:border-b-0"
                    >
                      <span className="font-mono text-muted line-through">
                        /{change.fromShortName}
                      </span>
                      <ArrowRight className="size-3 shrink-0 text-border" />
                      <span className="font-mono text-fg">/{change.toShortName}</span>
                      <span className="ml-auto shrink-0 text-muted">
                        {isoDate(change.createdAt)}
                        {change.changedByLabel ? ` · ${change.changedByLabel}` : ''}
                      </span>
                      {change.fromShortName === profile.shortName ? null : (
                        <button
                          type="button"
                          onClick={() => setShortName(change.fromShortName)}
                          className="shrink-0 text-accent hover:underline"
                        >
                          {t('shortName.revert')}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>
    </Dialog>
  );
}

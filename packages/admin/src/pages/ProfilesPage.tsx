import { AvatarPlaceholder } from '@link-profile/profile-ui';
import { ArrowRight, ExternalLink, Plus } from 'lucide-react';
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

const LAYOUT_LABELS: Record<string, string> = {
  classic: '经典',
  hero: '大图',
  banner: '横幅',
  cutout: '抠像',
  shape: '异形',
};

/**
 * 一个账号名下的个人页列表。
 *
 * 用户看到的是「我的页面」，管理员是从用户列表点进来的同一个页面 —— 区别只在
 * 能不能新建、改地址、删除（那一档权限用户没有，服务端拦，这里同步隐藏）。
 */
export function ProfilesPage() {
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
  const [renaming, setRenaming] = useState<ProfileSummary | null>(null);

  const isSelf = userId === session.id;
  // 建页面与改地址不用判断：进得来这个列表的人（本人，或他的管理员）本来就有
  // 这两档权限。删不一样 —— 它不可逆（地址进墓碑、媒体从磁盘删掉），本人做不了。
  const canDelete = !isSelf && session.role !== 'user';

  const ownerName = owner?.label || owner?.account || '';
  useBreadcrumb(
    isSelf
      ? [{ label: '我的页面' }]
      : [{ label: '用户', to: '/users' }, { label: ownerName || '账号' }],
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
      title: `删除页面 /${profile.shortName}？`,
      description: (
        <div className="flex flex-col gap-1.5 text-[13px] text-fg">
          <span>
            这个地址会进入墓碑并<strong className="font-semibold">永不再分配</strong>
            ，已经发出去的链接从此返回 404。
          </span>
          <span>页面上的图片与视频会从磁盘删除；埋点数据保留，历史汇总不断档。</span>
          {profiles.length === 1 ? (
            <span className="text-danger">
              这是该账号最后一个页面。删掉之后他登录进来会是空的，需要你再给他新建。
            </span>
          ) : null}
        </div>
      ),
      confirmText: '删除',
      danger: true,
    });
    if (!ok) return;
    try {
      await request(`/profiles/${profile.id}`, { method: 'DELETE' });
      toast.success('已删除');
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
            {isSelf ? '我的页面' : `${ownerName} 的页面`}
          </h1>
          <span className="text-[13px] text-muted">
            一个账号可以有多个个人页，每个页面有自己的地址、布局与数据。
            {isSelf ? '页面的删除请找管理员——地址一旦回收就永不再分配。' : ''}
          </span>
        </div>
        <Button variant="primary" onClick={() => setCreating(true)}>
          <Plus className="size-4" />
          新建页面
        </Button>
      </div>

      {error ? <Alert tone="danger" message={error} /> : null}

      {profiles.length === 0 ? (
        <div className="rounded-[var(--radius-panel)] border border-dashed border-border bg-surface px-6 py-16 text-center text-[13px] text-muted">
          还没有任何页面。
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {profiles.map((profile) => (
            <div
              key={profile.id}
              className="flex flex-col gap-3 rounded-[var(--radius-panel)] border border-border bg-surface p-4"
            >
              <div className="flex items-center gap-3">
                <div className="size-11 shrink-0 overflow-hidden rounded-full border border-border bg-bg">
                  {profile.avatarUrl ? (
                    <img src={profile.avatarUrl} alt="" className="size-full object-cover" />
                  ) : (
                    <AvatarPlaceholder />
                  )}
                </div>
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="truncate font-display text-[15px] font-semibold text-fg">
                    {profile.displayName || profile.shortName}
                  </span>
                  <a
                    href={`/${profile.shortName}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex w-fit items-center gap-1 font-mono text-[13px] text-accent hover:underline"
                  >
                    /{profile.shortName}
                    <ExternalLink className="size-3" />
                  </a>
                </div>
              </div>

              <div className="flex items-center gap-2 text-[12px] text-muted">
                <span className="rounded-full border border-border px-2 py-0.5">
                  {LAYOUT_LABELS[profile.layout] ?? profile.layout}
                </span>
                <span>{new Date(profile.createdAt).toLocaleDateString('zh-CN')} 创建</span>
              </div>

              <div className="flex flex-wrap items-center gap-1">
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => navigate(`/profiles/${profile.id}`)}
                >
                  编辑
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate(`/analytics?profileId=${profile.id}`)}
                >
                  数据
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setRenaming(profile)}>
                  改地址
                </Button>
                {canDelete ? (
                  <Button variant="danger-ghost" size="sm" onClick={() => void remove(profile)}>
                    删除
                  </Button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}

      <CreateProfileModal
        open={creating}
        userId={userId}
        onClose={() => setCreating(false)}
        onDone={load}
      />
      <RenameProfileModal profile={renaming} onClose={() => setRenaming(null)} onDone={load} />
      {confirmDialog}
    </div>
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
      setError('页面地址必填');
      return;
    }
    setSubmitting(true);
    try {
      await request(`/users/${userId}/profiles`, {
        method: 'POST',
        body: { shortName: shortName.trim(), displayName: displayName.trim() },
      });
      toast.success('已创建');
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
      title="新建页面"
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
        {error ? <Alert tone="danger" message={error} /> : null}
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-fg">页面地址</span>
          <Input
            addonBefore="/"
            value={shortName}
            onChange={(e) => setShortName(e.target.value)}
            placeholder="小写字母、数字与连字符，3–30 位"
          />
          <span className="text-[12px] text-muted">一经发布即为对外资产，删除后永不再分配。</span>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-fg">显示名</span>
          <Input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="留空则先跟地址一致，之后可以在编辑器里改"
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
      toast.success('已改地址');
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
      title={`改地址 · /${profile.shortName}`}
      width={520}
      footer={
        <>
          <Button variant="default" onClick={confirming ? () => setConfirming(false) : onClose}>
            {confirming ? '再改改' : '取消'}
          </Button>
          <Button
            variant={confirming ? 'danger' : 'primary'}
            loading={saving}
            disabled={next.length === 0 || unchanged}
            onClick={() => (confirming ? void save() : setConfirming(true))}
          >
            {confirming ? `确认改成 /${next}` : '下一步'}
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
              message="改完之后会发生这些事"
              description={
                <ul className="flex list-disc flex-col gap-1 pl-4">
                  <li>
                    印在名片、二维码、投放素材上的
                    <span className="font-mono"> /{profile.shortName} </span>
                    立刻失效，访客拿到 404。
                  </li>
                  <li>旧地址会被释放，可能被别人抢注，到时候就改不回来了。</li>
                  <li>埋点数据跟着页面走，历史汇总不断档。</li>
                </ul>
              }
            />
            <p className="text-[12px] text-muted">
              这次改动会记进变更历史，暂时没人抢注的话还能照着改回去。
            </p>
          </div>
        ) : (
          <>
            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] font-medium text-fg">页面地址</span>
              <Input
                addonBefore="/"
                value={shortName}
                onChange={(e) => setShortName(e.target.value)}
                placeholder="小写字母、数字与连字符，3–30 位"
              />
              <span className="text-[12px] text-muted">
                被删除页面占用过的地址永不再分配，换不到。
              </span>
            </label>

            {changes.length > 0 ? (
              <div className="flex flex-col gap-2">
                <span className="text-[13px] font-medium text-fg">改过的地址</span>
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
                        {new Date(change.createdAt).toLocaleDateString('zh-CN')}
                        {change.changedByLabel ? ` · ${change.changedByLabel}` : ''}
                      </span>
                      {change.fromShortName === profile.shortName ? null : (
                        <button
                          type="button"
                          onClick={() => setShortName(change.fromShortName)}
                          className="shrink-0 text-accent hover:underline"
                        >
                          改回去
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

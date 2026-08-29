import { THEMES } from '@link-profile/profile-ui';
import { layoutEnum, themeEnum } from '@link-profile/shared/schema';
import { Check } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { request } from '../api/client.js';
import type { AppSettings, EditableProfile, EntryDraft, SocialPlatformInfo } from '../api/types.js';
import { useBreadcrumb } from '../nav/breadcrumb.js';
import { PreviewFrame } from '../preview/PreviewFrame.js';
import { useSession } from '../session.js';
import { Alert } from '../ui/Alert.js';
import { Button } from '../ui/Button.js';
import { Input, Textarea } from '../ui/Input.js';
import { Checkbox } from '../ui/Checkbox.js';
import { Spinner } from '../ui/Spinner.js';
import { useToast } from '../ui/Toast.js';
import { ContentEditor } from './editor/ContentEditor.js';
import { MediaEditor } from './editor/MediaEditor.js';
import {
  draftFromServer,
  draftToProfileView,
  isLocalId,
  type Draft,
  type LiveMedia,
} from './editor/draft.js';

const LAYOUT_LABELS: Record<string, string> = {
  classic: 'Classic',
  hero: 'Hero',
  banner: 'Banner',
  shape: 'Shape',
};

/**
 * 个人页编辑器。
 *
 * 左边改，右边那台手机同步变 —— 不用保存、不用切设备。预览渲染的是与
 * 公开页同一批组件，见 `PreviewFrame` 与 ADR-0004。
 */
export function EditorPage() {
  const { profileId = '' } = useParams();
  const session = useSession();
  const toast = useToast();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [platforms, setPlatforms] = useState<SocialPlatformInfo[]>([]);
  const [caveat, setCaveat] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 裁切弹窗开着时的临时构图。不进 draft，取消即消失。
  const [liveMedia, setLiveMedia] = useState<LiveMedia>({});

  const load = useCallback(async () => {
    const [loaded, platformList, settings] = await Promise.all([
      request<EditableProfile>(`/profiles/${profileId}`),
      request<{ platforms: SocialPlatformInfo[] }>('/social-platforms'),
      request<AppSettings>('/settings'),
    ]);

    setPlatforms(platformList.platforms);
    setCaveat(settings.sourcePassthroughCaveat);
    setDraft(
      draftFromServer(loaded, {
        avatar: loaded.profile.avatarUrl,
        banner: loaded.profile.bannerUrl,
        background: loaded.profile.backgroundUrl,
        avatarIsVideo: loaded.profile.avatarIsVideo,
      }),
    );
  }, [profileId]);

  useEffect(() => {
    load().catch((err: Error) => setError(err.message));
  }, [load]);

  // 草稿一变就重新算一份预览用的视图。没有 debounce：改一个字那边就跟着动。
  const preview = useMemo(
    () => (draft ? draftToProfileView(draft, liveMedia) : null),
    [draft, liveMedia],
  );

  const editingSelf = draft?.fields.userId === session.id;
  useBreadcrumb(
    draft
      ? editingSelf
        ? [
            { label: '我的页面', to: `/users/${session.id}/profiles` },
            { label: `/${draft.fields.shortName}` },
          ]
        : [
            { label: '用户', to: '/users' },
            { label: '页面', to: `/users/${draft.fields.userId}/profiles` },
            { label: `/${draft.fields.shortName}` },
          ]
      : [],
  );

  if (error) return <Alert tone="danger" message="打不开这个页面" description={error} />;
  if (!draft || !preview) return <Spinner fullscreen />;

  /**
   * 草稿更新一律走函数式：同一个事件循环里发生两次更新时，
   * 基于闭包里那份 `draft` 去合并会让后一次覆盖掉前一次
   * （例如同时改主题和布局，只有一个生效）。
   */
  const patch = (next: Partial<Draft>) => setDraft((prev) => (prev ? { ...prev, ...next } : prev));

  const patchFields = (next: Partial<Draft['fields']>) =>
    setDraft((prev) => (prev ? { ...prev, fields: { ...prev.fields, ...next } } : prev));

  const save = async () => {
    setSaving(true);
    try {
      await uploadPendingMedia(profileId, draft);

      await request(`/profiles/${profileId}`, {
        method: 'PATCH',
        body: {
          displayName: draft.fields.displayName,
          bio: draft.fields.bio,
          bioTypewriter: draft.fields.bioTypewriter,
          layout: draft.fields.layout,
          theme: draft.fields.theme,
          solidBackground: draft.fields.solidBackground,
          iconPlate: draft.fields.iconPlate,
          backgroundOverlay: Number(draft.fields.backgroundOverlay),
        },
      });

      // 已有条目要把自己的 id 带回去：换 id 会让它的历史点击成为孤儿，
      // 逐条点击率归零。新加的条目 id 是 `local-…`，不往上送。
      await request(`/profiles/${profileId}/entries`, {
        method: 'PUT',
        body: { entries: draft.entries.map(toPayload) },
      });

      await load();
      toast.success('已保存，刷新公开页即可看到');
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-wrap items-start justify-center gap-6">
      {/* 限宽照 SettingsPage 的先例：不封顶的话宽屏上输入框与素材卡会一路撑满 */}
      <div className="flex min-w-[380px] max-w-[720px] flex-1 flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-display text-[22px] font-semibold text-fg">
            {editingSelf ? '我的个人页' : '代改个人页'}
          </h1>
          <div className="flex gap-2">
            <a
              href={`/${draft.fields.shortName}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-8 items-center justify-center rounded-[var(--radius-control)]
                border border-border bg-surface px-3 text-[13px] font-medium text-fg
                hover:bg-surface-hover focus-visible:outline focus-visible:outline-2
                focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              打开公开页
            </a>
            <Button variant="primary" size="sm" loading={saving} onClick={() => void save()}>
              保存
            </Button>
          </div>
        </div>

        <Panel title="基本信息">
          <div className="flex flex-col gap-3">
            <Input
              value={draft.fields.displayName}
              onChange={(e) => patchFields({ displayName: e.target.value })}
              placeholder="显示名，访客在头像下方看到的名字"
              maxLength={60}
            />
            <Textarea
              value={draft.fields.bio}
              onChange={(e) => patchFields({ bio: e.target.value })}
              placeholder="简介"
              maxLength={300}
              rows={3}
            />
            <div className="flex w-fit items-center gap-2">
              <Checkbox
                checked={draft.fields.bioTypewriter}
                onChange={(checked) => patchFields({ bioTypewriter: checked })}
              >
                简介逐字打出
              </Checkbox>
              <span className="text-[12px] text-muted">· 访客系统设了「减少动效」时自动跳过</span>
            </div>
            <p className="text-[12px] text-muted">
              页面地址：/{draft.fields.shortName}
              {editingSelf ? '（地址由管理员维护，改动会使已发出的链接失效）' : ''}
            </p>
          </div>
        </Panel>

        <Panel
          title="布局"
          hint="布局只决定头像与头图区域的形状和占比，不决定配色。没传头图时该区域用主题渐变填充。"
        >
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {layoutEnum.enumValues.map((value) => {
              const active = draft.fields.layout === value;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => patchFields({ layout: value })}
                  aria-pressed={active}
                  className={`relative rounded-[var(--radius-control)] border p-2 text-left transition-colors
                    ${active ? 'border-accent ring-1 ring-accent' : 'border-border hover:bg-surface-hover'}`}
                >
                  {active ? (
                    // z-10 不能省：hero 的示意图色块盖住整条顶边，排在对号之后，
                    // 同层叠上下文里后来的绝对定位元素会压住它。
                    <span className="absolute right-1.5 top-1.5 z-10 flex size-4 items-center justify-center rounded-full bg-accent text-accent-fg">
                      <Check className="size-2.5" strokeWidth={3} />
                    </span>
                  ) : null}
                  <LayoutGlyph layout={value} />
                  <span className="mt-1.5 block text-[12px] font-medium text-fg">
                    {LAYOUT_LABELS[value] ?? value}
                  </span>
                </button>
              );
            })}
          </div>
        </Panel>

        <Panel title="主题" hint="一组主题包含背景渐变、文字与按钮颜色，圆角是主题的一部分。">
          <div className="flex flex-wrap gap-2.5">
            {themeEnum.enumValues.map((value) => {
              const tokens = THEMES[value];
              const active = draft.fields.theme === value;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => patchFields({ theme: value })}
                  aria-pressed={active}
                  className={`w-24 overflow-hidden rounded-[var(--radius-control)] border transition-colors
                    ${active ? 'border-accent ring-1 ring-accent' : 'border-border hover:bg-surface-hover'}`}
                >
                  <span
                    className="block h-11"
                    style={{
                      background: `linear-gradient(168deg, ${tokens.gradient[0]} 0%, ${tokens.gradient[1]} 52%, ${tokens.gradient[2]} 100%)`,
                    }}
                  />
                  <span className="block px-1 py-1 text-[12px] text-fg">{tokens.label}</span>
                </button>
              );
            })}
          </div>
        </Panel>

        <Panel title="素材">
          <MediaEditor
            draft={draft}
            onChange={patch}
            onChangeFields={patchFields}
            onLiveMedia={setLiveMedia}
          />
        </Panel>

        <Panel title="内容编排">
          <ContentEditor
            platforms={platforms}
            entries={draft.entries}
            onChange={(entries) => patch({ entries })}
            passthroughCaveat={caveat}
            solidBackground={draft.fields.solidBackground}
            iconPlate={draft.fields.iconPlate}
            onChangeStyle={patchFields}
          />
        </Panel>
      </div>

      <div className="sticky top-6 flex flex-col items-center gap-2">
        <PreviewFrame profile={preview} />
      </div>
    </div>
  );
}

function Panel({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="rounded-[var(--radius-panel)] border border-border bg-surface p-4">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold text-fg">{title}</h2>
        {hint ? <p className="text-[12px] text-muted">{hint}</p> : null}
      </div>
      {children}
    </section>
  );
}

/** 四种布局的形状意向图：不追求像素级还原，只求一眼看出四者不同。 */
function LayoutGlyph({ layout }: { layout: string }) {
  const base = 'flex h-14 w-full flex-col items-center justify-center gap-1 rounded-[4px] bg-bg';
  switch (layout) {
    case 'hero':
      return (
        <div className={`${base} relative overflow-hidden !justify-end !gap-0.5 pb-1.5`}>
          <span className="absolute inset-0 top-0 h-9 bg-accent-soft" />
          <Bars />
        </div>
      );
    case 'banner':
      return (
        <div className={`${base} !justify-start gap-1 pt-1.5`}>
          <span className="h-4 w-[85%] rounded-[2px] bg-accent-soft" />
          <Bars />
        </div>
      );
    case 'shape':
      return (
        <div className={`${base} !justify-start gap-1 pt-1.5`}>
          <span className="h-6 w-8 rounded-tl-lg rounded-br-lg rounded-tr-sm rounded-bl-sm bg-accent-soft" />
          <Bars />
        </div>
      );
    case 'classic':
    default:
      return (
        <div className={base}>
          <span className="size-4 rounded-full bg-accent-soft" />
          <Bars />
        </div>
      );
  }
}

function Bars({ align = 'center' }: { align?: 'center' | 'left' }) {
  return (
    <div
      className={`flex w-[70%] flex-col gap-[3px] ${align === 'left' ? 'items-start' : 'items-center'}`}
    >
      <span className="h-[3px] w-full rounded-full bg-border" />
      <span className="h-[3px] w-2/3 rounded-full bg-border" />
    </div>
  );
}

/**
 * 已落库的条目原样带上 id，本地新加的（`local-` 前缀，见 draft.ts 的
 * `localId`）去掉 id 交给服务端发新的。
 */
/**
 * 草稿条目 → 提交体。
 *
 * 按 kind 只送对应的字段：草稿里 url/platform/value 三个都在（表单切换时留着
 * 旧值方便回退），但服务端那条 CHECK 要求 link 不带 platform/value、social 不带
 * url，整份送上去会被数据库拒掉。
 *
 * 本地新建的条目 id 是 `local-…`，不往上送 —— 服务端会发一个真的。已保存的
 * 必须原样带回去：换 id 会让它的历史点击成为孤儿。
 */
function toPayload(entry: EntryDraft): Record<string, unknown> {
  const common = {
    ...(isLocalId(entry.id) ? {} : { id: entry.id }),
    kind: entry.kind,
    title: entry.title,
    subtitle: entry.subtitle,
    isLead: entry.isLead,
    passSource: entry.passSource,
  };

  return entry.kind === 'social'
    ? {
        ...common,
        platform: entry.platform,
        value: entry.value,
        directMessage: entry.directMessage,
        message: entry.message,
      }
    : { ...common, url: entry.url };
}

/** 保存时才真正上传选中的素材，用户在确认满意之前不必先落库。 */
async function uploadPendingMedia(profileId: string, draft: Draft): Promise<void> {
  if (draft.pendingAvatar) {
    const form = new FormData();
    form.append('slot', 'avatar');
    form.append('file', draft.pendingAvatar.file);
    if (draft.pendingAvatarPoster) {
      form.append('poster', draft.pendingAvatarPoster.file);
    }
    await request(`/profiles/${profileId}/media`, { method: 'POST', formData: form });
  } else if (draft.savedAvatarUrl === null) {
    await request(`/profiles/${profileId}/media/avatar`, { method: 'DELETE' }).catch(
      () => undefined,
    );
  }

  if (draft.pendingBackground) {
    const form = new FormData();
    form.append('slot', 'background');
    form.append('file', draft.pendingBackground.file);
    await request(`/profiles/${profileId}/media`, { method: 'POST', formData: form });
  } else if (draft.savedBackgroundUrl === null) {
    await request(`/profiles/${profileId}/media/background`, { method: 'DELETE' }).catch(
      () => undefined,
    );
  }

  if (draft.pendingBanner) {
    const form = new FormData();
    form.append('slot', 'banner');
    form.append('file', draft.pendingBanner.file);
    await request(`/profiles/${profileId}/media`, { method: 'POST', formData: form });
  } else if (draft.savedBannerUrl === null) {
    await request(`/profiles/${profileId}/media/banner`, { method: 'DELETE' }).catch(
      () => undefined,
    );
  }
}

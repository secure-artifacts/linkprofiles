import { THEMES } from '@link-profile/profile-ui';
import { layoutEnum, themeEnum } from '@link-profile/shared/schema';
import {
  Alert,
  Button,
  Card,
  Flex,
  Input,
  Segmented,
  Space,
  Spin,
  Typography,
  message,
} from 'antd';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { request } from '../api/client.js';
import type { AppSettings, EditableProfile, SocialPlatformInfo } from '../api/types.js';
import { PreviewFrame } from '../preview/PreviewFrame.js';
import { ButtonsEditor } from './editor/ButtonsEditor.js';
import { MediaEditor } from './editor/MediaEditor.js';
import { SocialIconsEditor } from './editor/SocialIconsEditor.js';
import { draftFromServer, draftToProfileView, type Draft } from './editor/draft.js';

const LAYOUT_LABELS: Record<string, string> = {
  classic: 'Classic',
  hero: 'Hero',
  banner: 'Banner',
  cutout: 'Cutout',
  shape: 'Shape',
};

interface EditorPageProps {
  userId: string;
  /** 当前登录者是不是页面的主人。管理员代改时提示语不一样。 */
  editingSelf: boolean;
}

/**
 * 个人页编辑器。
 *
 * 左边改，右边那台手机同步变 —— 不用保存、不用切设备。预览渲染的是与
 * 公开页同一批组件，见 `PreviewFrame` 与 ADR-0004。
 */
export function EditorPage({ userId, editingSelf }: EditorPageProps) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [platforms, setPlatforms] = useState<SocialPlatformInfo[]>([]);
  const [caveat, setCaveat] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [loaded, platformList, settings] = await Promise.all([
      request<EditableProfile>(`/users/${userId}/profile`),
      request<{ platforms: SocialPlatformInfo[] }>('/social-platforms'),
      request<AppSettings>('/settings'),
    ]);

    setPlatforms(platformList.platforms);
    setCaveat(settings.sourcePassthroughCaveat);
    setDraft(
      draftFromServer(loaded, {
        avatar: loaded.profile.avatarUrl,
        background: loaded.profile.backgroundUrl,
        avatarIsVideo: loaded.profile.avatarIsVideo,
      }),
    );
  }, [userId]);

  useEffect(() => {
    load().catch((err: Error) => setError(err.message));
  }, [load]);

  // 草稿一变就重新算一份预览用的视图。没有 debounce：改一个字那边就跟着动。
  const preview = useMemo(() => (draft ? draftToProfileView(draft) : null), [draft]);

  if (error) return <Alert type="error" showIcon message="打不开这个页面" description={error} />;
  if (!draft || !preview) return <Spin />;

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
      await uploadPendingMedia(userId, draft);

      await request(`/users/${userId}/profile`, {
        method: 'PATCH',
        body: {
          displayName: draft.fields.displayName,
          bio: draft.fields.bio,
          layout: draft.fields.layout,
          theme: draft.fields.theme,
          backgroundOverlay: Number(draft.fields.backgroundOverlay),
        },
      });

      await request(`/users/${userId}/buttons`, {
        method: 'PUT',
        body: {
          buttons: draft.buttons.map(({ id: _id, ...button }) => button),
        },
      });

      await request(`/users/${userId}/social-icons`, {
        method: 'PUT',
        body: {
          socialIcons: draft.socialIcons.map(({ id: _id, ...icon }) => icon),
        },
      });

      await load();
      message.success('已保存，刷新公开页即可看到');
    } catch (err) {
      message.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Flex gap="large" align="flex-start" wrap>
      <Space direction="vertical" size="middle" style={{ flex: '1 1 480px', minWidth: 380 }}>
        <Flex justify="space-between" align="center" gap="small" wrap>
          <Typography.Title level={4} style={{ margin: 0 }}>
            {editingSelf ? '我的个人页' : '代改个人页'}
          </Typography.Title>
          <Space>
            {draft.fields.shortName ? (
              <Button href={`/${draft.fields.shortName}`} target="_blank">
                打开公开页
              </Button>
            ) : null}
            <Button type="primary" loading={saving} onClick={() => void save()}>
              保存
            </Button>
          </Space>
        </Flex>

        <Card size="small" title="基本信息">
          <Space direction="vertical" size="small" style={{ width: '100%' }}>
            <Input
              value={draft.fields.displayName}
              onChange={(e) => patchFields({ displayName: e.target.value })}
              placeholder="显示名，访客在头像下方看到的名字"
              maxLength={60}
            />
            <Input.TextArea
              value={draft.fields.bio}
              onChange={(e) => patchFields({ bio: e.target.value })}
              placeholder="简介"
              maxLength={300}
              autoSize={{ minRows: 2, maxRows: 4 }}
            />
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              页面地址：/{draft.fields.shortName ?? '—'}
              {editingSelf ? '（地址由管理员维护，改动会使已发出的链接失效）' : ''}
            </Typography.Text>
          </Space>
        </Card>

        <Card size="small" title="布局">
          <Space direction="vertical" size="small" style={{ width: '100%' }}>
            <Segmented
              block
              value={draft.fields.layout}
              options={layoutEnum.enumValues.map((value) => ({
                value,
                label: LAYOUT_LABELS[value] ?? value,
              }))}
              onChange={(value) => patchFields({ layout: value as typeof draft.fields.layout })}
            />
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              布局只决定头像与头图区域的形状和占比，不决定配色。没传头图时该区域用主题渐变填充。
            </Typography.Text>
          </Space>
        </Card>

        <Card size="small" title="主题">
          <Flex gap="small" wrap>
            {themeEnum.enumValues.map((value) => {
              const tokens = THEMES[value];
              const active = draft.fields.theme === value;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => patchFields({ theme: value })}
                  aria-pressed={active}
                  style={{
                    cursor: 'pointer',
                    padding: 0,
                    borderRadius: 12,
                    border: active ? '2px solid #1677ff' : '1px solid rgba(0,0,0,.15)',
                    overflow: 'hidden',
                    width: 92,
                    background: 'transparent',
                  }}
                >
                  <span
                    style={{
                      display: 'block',
                      height: 44,
                      background: `linear-gradient(168deg, ${tokens.gradient[0]} 0%, ${tokens.gradient[1]} 52%, ${tokens.gradient[2]} 100%)`,
                    }}
                  />
                  <span style={{ display: 'block', fontSize: 12, padding: '4px 0' }}>
                    {tokens.label}
                  </span>
                </button>
              );
            })}
          </Flex>
        </Card>

        <Card size="small" title="素材">
          <MediaEditor draft={draft} onChange={patch} onChangeFields={patchFields} />
        </Card>

        <Card size="small" title="按钮">
          <ButtonsEditor
            buttons={draft.buttons}
            onChange={(buttons) => patch({ buttons })}
            passthroughCaveat={caveat}
          />
        </Card>

        <Card size="small" title="社媒图标">
          <SocialIconsEditor
            platforms={platforms}
            icons={draft.socialIcons}
            onChange={(socialIcons) => patch({ socialIcons })}
            passthroughCaveat={caveat}
          />
        </Card>
      </Space>

      <Space direction="vertical" align="center" style={{ position: 'sticky', top: 24 }}>
        <PreviewFrame profile={preview} />
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          375px 实时预览 · 未保存的改动也看得到
        </Typography.Text>
      </Space>
    </Flex>
  );
}

/** 保存时才真正上传选中的素材，用户在确认满意之前不必先落库。 */
async function uploadPendingMedia(userId: string, draft: Draft): Promise<void> {
  if (draft.pendingAvatar) {
    const form = new FormData();
    form.append('slot', 'avatar');
    form.append('file', draft.pendingAvatar.file);
    if (draft.pendingAvatarPoster) {
      form.append('poster', draft.pendingAvatarPoster.file);
    }
    await request(`/users/${userId}/media`, { method: 'POST', formData: form });
  } else if (draft.savedAvatarUrl === null) {
    await request(`/users/${userId}/media/avatar`, { method: 'DELETE' }).catch(() => undefined);
  }

  if (draft.pendingBackground) {
    const form = new FormData();
    form.append('slot', 'background');
    form.append('file', draft.pendingBackground.file);
    await request(`/users/${userId}/media`, { method: 'POST', formData: form });
  } else if (draft.savedBackgroundUrl === null) {
    await request(`/users/${userId}/media/background`, { method: 'DELETE' }).catch(() => undefined);
  }
}

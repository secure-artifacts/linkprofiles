import type { ProfileView } from '@link-profile/profile-ui';
import { buildSocialUrl, findSocialPlatform, inferPlatformFromUrl } from '@link-profile/shared';
import type {
  ButtonDraft,
  EditableProfile,
  ProfileFields,
  SocialIconDraft,
} from '../../api/types.js';

/**
 * 编辑器里的草稿状态。
 *
 * 与保存接口一一对应，另外多两样只活在浏览器里的东西：尚未上传的图片与
 * 视频。它们以 blob 地址进预览，用户在确认满意之前不必先落库。
 */
export interface PendingMedia {
  /** 本地 blob 地址，仅供预览 */
  objectUrl: string;
  file: File;
}

export interface Draft {
  fields: ProfileFields;
  buttons: ButtonDraft[];
  socialIcons: SocialIconDraft[];
  /** 已保存的素材地址，由服务端给出 */
  savedAvatarUrl: string | null;
  savedAvatarIsVideo: boolean;
  savedBackgroundUrl: string | null;
  /** 选了但还没上传的素材 */
  pendingAvatar: PendingMedia | null;
  pendingAvatarPoster: PendingMedia | null;
  pendingBackground: PendingMedia | null;
}

export function draftFromServer(
  loaded: EditableProfile,
  urls: { avatar: string | null; background: string | null; avatarIsVideo: boolean },
): Draft {
  return {
    fields: loaded.profile,
    buttons: loaded.buttons.map(stripPosition),
    socialIcons: loaded.socialIcons.map(stripPosition),
    savedAvatarUrl: urls.avatar,
    savedAvatarIsVideo: urls.avatarIsVideo,
    savedBackgroundUrl: urls.background,
    pendingAvatar: null,
    pendingAvatarPoster: null,
    pendingBackground: null,
  };
}

function stripPosition<T extends { position: number }>(row: T): Omit<T, 'position'> {
  const { position: _position, ...rest } = row;
  return rest;
}

/**
 * 草稿 → 预览用的 ProfileView。
 *
 * 这是编辑器与公开页之间唯一的翻译层：拼社媒 URL、按 URL 反推品牌图形、
 * 决定头像位放图还是放视频。用的都是 shared 里那几个纯函数，与服务端
 * 渲染走的是同一套规则。
 */
export function draftToProfileView(draft: Draft): ProfileView {
  const avatarUrl = draft.pendingAvatar?.objectUrl ?? draft.savedAvatarUrl;
  // 新选的文件看它自己的 MIME；没有新选就沿用服务端给的判断
  const isVideo = draft.pendingAvatar
    ? draft.pendingAvatar.file.type.startsWith('video/')
    : draft.savedAvatarIsVideo;
  const posterUrl = draft.pendingAvatarPoster?.objectUrl ?? null;
  const backgroundUrl = draft.pendingBackground?.objectUrl ?? draft.savedBackgroundUrl;

  return {
    displayName: draft.fields.displayName,
    bio: draft.fields.bio,
    layout: draft.fields.layout,
    theme: draft.fields.theme,
    avatar: !isVideo && avatarUrl ? { src: avatarUrl } : null,
    video: isVideo && avatarUrl ? { src: avatarUrl, poster: posterUrl } : null,
    background: backgroundUrl
      ? { src: backgroundUrl, overlay: Number(draft.fields.backgroundOverlay) }
      : null,
    socialIcons: draft.socialIcons.flatMap((icon) => {
      const platform = findSocialPlatform(icon.platform);
      const url = buildSocialUrl(icon.platform, icon.value);
      if (!platform || !url) return [];
      return [
        { id: icon.id, platform: icon.platform, url, label: platform.label, isLead: icon.isLead },
      ];
    }),
    buttons: draft.buttons.map((button) => ({
      id: button.id,
      title: button.title || '未命名按钮',
      subtitle: button.subtitle,
      url: button.url,
      isLead: button.isLead,
      platform: inferPlatformFromUrl(button.url),
    })),
  };
}

/** 新按钮与新社媒图标只在浏览器里需要一个 key，保存时服务端会重新发 id。 */
export function localId(): string {
  return `local-${crypto.randomUUID()}`;
}

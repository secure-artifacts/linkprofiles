import type { ProfileView } from '@link-profile/profile-ui';
import { buildSocialUrl, findSocialPlatform, inferPlatformFromUrl } from '@link-profile/shared';
import type { EditableProfile, EntryDraft, ProfileFields } from '../../api/types.js';

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
  entries: EntryDraft[];
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
    entries: loaded.entries.map(stripPosition),
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
/**
 * 裁切弹窗开着时边调边推过来的低清图。
 *
 * 它压在 `pending` 之上但不进 `Draft` —— 还没确认的构图不是待上传的素材，
 * 取消就该干净消失。
 */
export interface LiveMedia {
  avatar?: string | undefined;
  background?: string | undefined;
}

export function draftToProfileView(draft: Draft, live: LiveMedia = {}): ProfileView {
  const avatarUrl = live.avatar ?? draft.pendingAvatar?.objectUrl ?? draft.savedAvatarUrl;
  // 新选的文件看它自己的 MIME；没有新选就沿用服务端给的判断。
  // 裁切中的实时图一定是图片（视频不进裁切）。
  const isVideo = live.avatar
    ? false
    : draft.pendingAvatar
      ? draft.pendingAvatar.file.type.startsWith('video/')
      : draft.savedAvatarIsVideo;
  const posterUrl = draft.pendingAvatarPoster?.objectUrl ?? null;
  const backgroundUrl =
    live.background ?? draft.pendingBackground?.objectUrl ?? draft.savedBackgroundUrl;

  return {
    displayName: draft.fields.displayName,
    bio: draft.fields.bio,
    bioTypewriter: draft.fields.bioTypewriter,
    layout: draft.fields.layout,
    theme: draft.fields.theme,
    solidBackground: draft.fields.solidBackground,
    iconPlate: draft.fields.iconPlate,
    avatar: !isVideo && avatarUrl ? { src: avatarUrl } : null,
    video: isVideo && avatarUrl ? { src: avatarUrl, poster: posterUrl } : null,
    background: backgroundUrl
      ? { src: backgroundUrl, overlay: Number(draft.fields.backgroundOverlay) }
      : null,
    // 拼不出地址的社媒条目整条不进预览 —— 与公开页同一条规则。
    // 编辑器里那条红边就是把这个静默丢弃显性化的。
    buttons: draft.entries.flatMap((entry) => {
      const url = entry.kind === 'social' ? buildSocialUrl(entry.platform, entry.value) : entry.url;
      if (entry.kind === 'social' && (!url || !findSocialPlatform(entry.platform))) return [];

      return [
        {
          id: entry.id,
          kind: entry.kind,
          title: entry.title || '未命名条目',
          subtitle: entry.subtitle,
          url: url ?? '',
          isLead: entry.isLead,
          platform: entry.kind === 'social' ? entry.platform : inferPlatformFromUrl(entry.url),
        },
      ];
    }),
  };
}

/**
 * 新按钮与新社媒图标在浏览器里先要一个 key。
 *
 * 带这个前缀的 id 保存时不往服务端送，由服务端发一个真的；
 * 已落库的条目则原样带回去，好让它保住自己的 id —— 换 id 会让它的
 * 历史点击成为孤儿（见 EditorPage 的 `withPersistedId`）。
 */
const LOCAL_ID_PREFIX = 'local-';

export function localId(): string {
  return `${LOCAL_ID_PREFIX}${crypto.randomUUID()}`;
}

export function isLocalId(id: string): boolean {
  return id.startsWith(LOCAL_ID_PREFIX);
}

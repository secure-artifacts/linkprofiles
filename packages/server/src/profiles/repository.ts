import type { ButtonView, ProfileView } from '@link-profile/profile-ui';
import { loadMediaByIds, toMediaSource, toVideoSource } from './media-view.js';
import {
  appendSource,
  buildSocialTargetUrl,
  findSocialPlatform,
  inferPlatformFromUrl,
} from '@link-profile/shared';
import { buttons, profiles } from '@link-profile/shared/schema';
import { asc, eq } from 'drizzle-orm';
import type { Db } from '../db/client.js';

/**
 * short_name 大小写不敏感：入库前已强制小写，查询前压一次即可，
 * 不需要在 SQL 里做 lower()，索引照常命中。
 */
export function normalizeShortName(raw: string): string {
  return raw.trim().toLowerCase();
}

/**
 * 渲染这一次页面时的上下文。
 *
 * `source` 是本次访问地址上清洗过的来源；开了透传的按钮会把它挂到
 * 目标 URL 上，见 13。`passthroughDefault` 是超级管理员设的全局默认。
 */
export interface RenderContext {
  source: string | null;
  passthroughDefault: boolean;
}

const NO_SOURCE: RenderContext = { source: null, passthroughDefault: false };

export interface ProfileRecord {
  id: string;
  shortName: string;
  view: ProfileView;
}

/**
 * 查出可公开渲染的个人页。
 *
 * 不必再校验角色：`profiles` 表本身就只挂在 `role='user'` 的账号下，
 * 管理员没有个人页这件事由建号流程保证，不需要每次渲染都 join 一次。
 */
export async function findProfileByShortName(
  db: Db,
  shortName: string,
  context: RenderContext = NO_SOURCE,
): Promise<ProfileRecord | null> {
  const [row] = await db
    .select({
      id: profiles.id,
      shortName: profiles.shortName,
      displayName: profiles.displayName,
      bio: profiles.bio,
      bioTypewriter: profiles.bioTypewriter,
      layout: profiles.layout,
      theme: profiles.theme,
      solidBackground: profiles.solidBackground,
      iconPlate: profiles.iconPlate,
      avatarMediaId: profiles.avatarMediaId,
      avatarPosterId: profiles.avatarPosterId,
      bannerMediaId: profiles.bannerMediaId,
      backgroundMediaId: profiles.backgroundMediaId,
      backgroundOverlay: profiles.backgroundOverlay,
    })
    .from(profiles)
    .where(eq(profiles.shortName, normalizeShortName(shortName)))
    .limit(1);

  if (!row?.shortName) return null;

  const mediaById = await loadMediaByIds(db, [
    row.avatarMediaId,
    row.avatarPosterId,
    row.bannerMediaId,
    row.backgroundMediaId,
  ]);
  const avatarRow = row.avatarMediaId ? mediaById.get(row.avatarMediaId) : undefined;
  const posterRow = row.avatarPosterId ? mediaById.get(row.avatarPosterId) : undefined;
  const bannerRow = row.bannerMediaId ? mediaById.get(row.bannerMediaId) : undefined;
  const backgroundRow = row.backgroundMediaId ? mediaById.get(row.backgroundMediaId) : undefined;
  const background = toMediaSource(backgroundRow);

  return {
    id: row.id,
    shortName: row.shortName,
    view: {
      displayName: row.displayName,
      bio: row.bio,
      bioTypewriter: row.bioTypewriter,
      layout: row.layout,
      theme: row.theme,
      solidBackground: row.solidBackground,
      iconPlate: row.iconPlate,
      // 头像位放的是图还是视频，二者互斥
      avatar: toMediaSource(avatarRow),
      video: toVideoSource(avatarRow, posterRow),
      banner: toMediaSource(bannerRow),
      background: background
        ? { src: background.src, overlay: Number(row.backgroundOverlay) }
        : null,
      buttons: await loadEntries(db, row.id, context),
    },
  };
}

/** 后台缩略预览按页面 id 读取，与公开页同一套渲染数据。 */
export async function findProfileById(
  db: Db,
  profileId: string,
  context: RenderContext = NO_SOURCE,
): Promise<ProfileRecord | null> {
  const [name] = await db
    .select({ shortName: profiles.shortName })
    .from(profiles)
    .where(eq(profiles.id, profileId))
    .limit(1);
  return name ? findProfileByShortName(db, name.shortName, context) : null;
}

/**
 * 一个个人页的全部条目，按 position 排。
 *
 * 两种 kind 的地址来源不同：`link` 用用户填的 url，`social` 由平台 id 与
 * 用户填的号码/用户名现拼。社媒平台不在内置清单里（清单调整后残留的旧行）
 * 或值拼不出地址时整条跳过，不渲染死链。
 */
export async function loadEntries(
  db: Db,
  profileId: string,
  context: RenderContext = NO_SOURCE,
): Promise<ButtonView[]> {
  const rows = await db
    .select({
      id: buttons.id,
      kind: buttons.kind,
      title: buttons.title,
      subtitle: buttons.subtitle,
      url: buttons.url,
      platform: buttons.platform,
      value: buttons.value,
      directMessage: buttons.directMessage,
      message: buttons.message,
      isLead: buttons.isLead,
      passSource: buttons.passSource,
    })
    .from(buttons)
    .where(eq(buttons.profileId, profileId))
    .orderBy(asc(buttons.position));

  const views: ButtonView[] = [];
  for (const row of rows) {
    const target = resolveUrl(row);
    if (!target) continue;
    const url = shouldPass(row.passSource, context) ? appendSource(target, context.source) : target;

    views.push({
      id: row.id,
      kind: row.kind,
      title: row.title,
      subtitle: row.subtitle,
      url,
      isLead: row.isLead,
      // link 的品牌图形从目标地址认出来，用户不必为此多填一个字段；
      // social 本来就带着平台 id。
      platform: row.kind === 'social' ? row.platform : inferPlatformFromUrl(url),
    });
  }
  return views;
}

/** 拼不出地址就返回 null，调用方整条跳过。 */
function resolveUrl(row: {
  kind: 'link' | 'social';
  url: string | null;
  platform: string | null;
  value: string | null;
  directMessage: boolean;
  message: string;
}): string | null {
  if (row.kind === 'link') return row.url;
  if (!row.platform || !row.value) return null;
  if (!findSocialPlatform(row.platform)) return null;
  return buildSocialTargetUrl(row.platform, row.value, row.directMessage, row.message);
}

/** 逐条的开关优先；关着的时候由超级管理员的全局默认兜底。 */
function shouldPass(passSource: boolean, context: RenderContext): boolean {
  return passSource || context.passthroughDefault;
}

import type { ButtonView, ProfileView, SocialIconView } from '@link-profile/profile-ui';
import { loadMediaByIds, toMediaSource, toVideoSource } from './media-view.js';
import { buildSocialUrl, findSocialPlatform, inferPlatformFromUrl } from '@link-profile/shared';
import { buttons, socialIcons, users } from '@link-profile/shared/schema';
import { and, asc, eq } from 'drizzle-orm';
import type { Db } from '../db/client.js';

/**
 * short_name 大小写不敏感：入库前已强制小写，查询前压一次即可，
 * 不需要在 SQL 里做 lower()，索引照常命中。
 */
export function normalizeShortName(raw: string): string {
  return raw.trim().toLowerCase();
}

export interface ProfileRecord {
  id: string;
  shortName: string;
  view: ProfileView;
}

/** 查出可公开渲染的个人页。只有 `user` 角色拥有个人页。 */
export async function findProfileByShortName(
  db: Db,
  shortName: string,
): Promise<ProfileRecord | null> {
  const [row] = await db
    .select({
      id: users.id,
      shortName: users.shortName,
      displayName: users.displayName,
      bio: users.bio,
      layout: users.layout,
      theme: users.theme,
      avatarMediaId: users.avatarMediaId,
      avatarPosterId: users.avatarPosterId,
      backgroundMediaId: users.backgroundMediaId,
      backgroundOverlay: users.backgroundOverlay,
    })
    .from(users)
    .where(and(eq(users.shortName, normalizeShortName(shortName)), eq(users.role, 'user')))
    .limit(1);

  if (!row?.shortName) return null;

  const mediaById = await loadMediaByIds(db, [
    row.avatarMediaId,
    row.avatarPosterId,
    row.backgroundMediaId,
  ]);
  const avatarRow = row.avatarMediaId ? mediaById.get(row.avatarMediaId) : undefined;
  const posterRow = row.avatarPosterId ? mediaById.get(row.avatarPosterId) : undefined;
  const backgroundRow = row.backgroundMediaId ? mediaById.get(row.backgroundMediaId) : undefined;
  const background = toMediaSource(backgroundRow);

  return {
    id: row.id,
    shortName: row.shortName,
    view: {
      displayName: row.displayName,
      bio: row.bio,
      layout: row.layout,
      theme: row.theme,
      // 头像位放的是图还是视频，二者互斥
      avatar: toMediaSource(avatarRow),
      video: toVideoSource(avatarRow, posterRow),
      background: background
        ? { src: background.src, overlay: Number(row.backgroundOverlay) }
        : null,
      socialIcons: await loadSocialIcons(db, row.id),
      buttons: await loadButtons(db, row.id),
    },
  };
}

export async function loadButtons(db: Db, userId: string): Promise<ButtonView[]> {
  const rows = await db
    .select({
      id: buttons.id,
      title: buttons.title,
      subtitle: buttons.subtitle,
      url: buttons.url,
      isLead: buttons.isLead,
    })
    .from(buttons)
    .where(eq(buttons.userId, userId))
    .orderBy(asc(buttons.position));

  // 品牌图形从目标地址认出来，用户不必为此多填一个字段。
  return rows.map((r) => ({ ...r, platform: inferPlatformFromUrl(r.url) }));
}

/**
 * 社媒图标存的是用户填的号码 / 邮箱 / 用户名，目标 URL 在这里按平台拼装。
 * 平台不在内置清单里（例如清单调整后残留的旧行）就整条跳过，不渲染死链。
 */
export async function loadSocialIcons(db: Db, userId: string): Promise<SocialIconView[]> {
  const rows = await db
    .select({
      id: socialIcons.id,
      platform: socialIcons.platform,
      value: socialIcons.value,
      isLead: socialIcons.isLead,
    })
    .from(socialIcons)
    .where(eq(socialIcons.userId, userId))
    .orderBy(asc(socialIcons.position));

  const views: SocialIconView[] = [];
  for (const row of rows) {
    const platform = findSocialPlatform(row.platform);
    const url = buildSocialUrl(row.platform, row.value);
    if (!platform || !url) continue;
    views.push({
      id: row.id,
      platform: row.platform,
      url,
      label: platform.label,
      isLead: row.isLead,
    });
  }
  return views;
}

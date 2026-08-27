import type { ProfileView } from '@link-profile/profile-ui';
import { users } from '@link-profile/shared/schema';
import { and, eq } from 'drizzle-orm';
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
    })
    .from(users)
    .where(and(eq(users.shortName, normalizeShortName(shortName)), eq(users.role, 'user')))
    .limit(1);

  if (!row?.shortName) return null;

  return {
    id: row.id,
    shortName: row.shortName,
    view: {
      displayName: row.displayName,
      bio: row.bio,
      layout: row.layout,
      theme: row.theme,
      avatar: null,
    },
  };
}

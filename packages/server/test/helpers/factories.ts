import { profiles, users, type NewProfileRow, type NewUserRow } from '@link-profile/shared/schema';
import type { Db } from '../../src/db/client.js';

let seq = 0;

/** 只建账号，不建个人页。管理员与超级管理员用这个。 */
export async function createUserAccount(db: Db, overrides: Partial<NewUserRow> = {}) {
  seq += 1;
  const [row] = await db
    .insert(users)
    .values({
      role: 'user',
      account: `account-${seq}`,
      passwordHash: 'not-a-real-hash',
      label: `用户 ${seq}`,
      ...overrides,
    })
    .returning();
  if (!row) throw new Error('创建账号失败');
  return row;
}

/** 给某个账号建一个个人页。同一个账号可以建多个。 */
export async function createProfile(
  db: Db,
  userId: string,
  overrides: Partial<Omit<NewProfileRow, 'userId'>> = {},
) {
  seq += 1;
  const [row] = await db
    .insert(profiles)
    .values({
      userId,
      shortName: `user-${seq}`,
      displayName: `显示名 ${seq}`,
      bio: '',
      ...overrides,
    })
    .returning();
  if (!row) throw new Error('创建个人页失败');
  return row;
}

const PROFILE_KEYS = new Set([
  'shortName',
  'displayName',
  'bio',
  'layout',
  'theme',
  'avatarMediaId',
  'avatarPosterId',
  'bannerMediaId',
  'backgroundMediaId',
  'backgroundOverlay',
]);

type UserWithProfileOverrides = Partial<NewUserRow> & Partial<Omit<NewProfileRow, 'userId'>>;

/**
 * 建一个账号 + 它的第一个个人页，字段按名字自动分流到两张表。
 *
 * 返回值里 `id` 是**账号 id**（大多数调用点拿它拼 `/_api/users/:id/...`），
 * `profileId` 是个人页 id（拼 `/_api/profiles/:id/...`、或直接往
 * buttons / media / page_views / clicks 插数据时用）。
 *
 * `role` 不是 `user` 时不建个人页，`profileId` 为 null —— 与「只有 user
 * 拥有个人页」这条不变式对齐。
 */
export async function createUser(db: Db, overrides: UserWithProfileOverrides = {}) {
  const accountOverrides: Record<string, unknown> = {};
  const profileOverrides: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(overrides)) {
    (PROFILE_KEYS.has(key) ? profileOverrides : accountOverrides)[key] = value;
  }

  const account = await createUserAccount(db, accountOverrides);
  if (account.role !== 'user') {
    return { ...account, profileId: null as string | null, shortName: null, displayName: null };
  }

  const profile = await createProfile(db, account.id, profileOverrides);
  return {
    ...account,
    profileId: profile.id as string | null,
    shortName: profile.shortName,
    displayName: profile.displayName,
  };
}

/** 建一个能真正登录的账号：密码走 argon2，与生产同一条路径。 */
export async function createLoginableUser(
  db: Db,
  password: string,
  overrides: UserWithProfileOverrides = {},
) {
  const { hashPassword } = await import('../../src/auth/passwords.js');
  return createUser(db, { ...overrides, passwordHash: await hashPassword(password) });
}

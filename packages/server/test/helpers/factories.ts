import {
  profiles,
  regions,
  users,
  UNASSIGNED_REGION_ID,
  type NewProfileRow,
  type NewRegionRow,
  type NewUserRow,
} from '@link-profile/shared/schema';
import { and, eq } from 'drizzle-orm';
import type { Db } from '../../src/db/client.js';

let seq = 0;

/**
 * 确保「未分配」区域存在，返回它的 id。
 *
 * 迁移建过它，但测试普遍用 `truncate table users cascade` 清场，而 `regions`
 * 有指向 `users` 的外键，会被一并截断。所以每次造账号前重新补上，既有调用点
 * 才不必逐个去关心区域。
 */
export async function ensureUnassignedRegion(db: Db) {
  await db
    .insert(regions)
    .values({ id: UNASSIGNED_REGION_ID, name: '未分配', ownerAdminId: null, isDefault: false })
    .onConflictDoNothing();
  return UNASSIGNED_REGION_ID;
}

/** 建一个区域。默认无归属，传 `ownerAdminId` 挂到某个管理员名下。 */
export async function createRegion(db: Db, overrides: Partial<NewRegionRow> = {}) {
  seq += 1;
  const [row] = await db
    .insert(regions)
    .values({ name: `区域 ${seq}`, ...overrides })
    .returning();
  if (!row) throw new Error('创建区域失败');
  return row;
}

/**
 * 取某个管理员的默认区域，没有就建一个。
 *
 * 测试里普遍要表达「这个用户归属于 alice」，而归属现在沿区域推导，直接落到
 * alice 的默认区域就是那个意思。
 */
export async function defaultRegionOf(db: Db, adminId: string) {
  const [existing] = await db
    .select({ id: regions.id })
    .from(regions)
    .where(and(eq(regions.ownerAdminId, adminId), eq(regions.isDefault, true)))
    .limit(1);
  if (existing) return existing.id;
  const created = await createRegion(db, { ownerAdminId: adminId, isDefault: true });
  return created.id;
}

type AccountOverrides = Partial<NewUserRow> & {
  /** 落进这个管理员的默认区域。`regionId` 的语义糖，别名不代表用户身上还有归属字段。 */
  ownedBy?: string;
};

/** 只建账号，不建个人页。管理员与超级管理员用这个。 */
export async function createUserAccount(db: Db, overrides: AccountOverrides = {}) {
  seq += 1;
  const { ownedBy, ...rest } = overrides;
  const role = rest.role ?? 'user';
  // 只有 user 属于区域；管理员与超级管理员不属于任何区域，见 ADR-0017。
  const regionId =
    role !== 'user'
      ? null
      : ownedBy
        ? await defaultRegionOf(db, ownedBy)
        : 'regionId' in rest
          ? rest.regionId
          : await ensureUnassignedRegion(db);

  const [row] = await db
    .insert(users)
    .values({
      role: 'user',
      account: `account-${seq}`,
      passwordHash: 'not-a-real-hash',
      label: `用户 ${seq}`,
      ...rest,
      regionId,
    })
    .returning();
  if (!row) throw new Error('创建账号失败');
  // 管理员一被创建就该有默认区域，与 POST /_api/admins 走的是同一条不变式。
  if (row.role === 'admin') await defaultRegionOf(db, row.id);
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

type UserWithProfileOverrides = AccountOverrides & Partial<Omit<NewProfileRow, 'userId'>>;

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

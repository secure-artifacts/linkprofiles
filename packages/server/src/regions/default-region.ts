import { regions, UNASSIGNED_REGION_ID } from '@link-profile/shared/schema';
import { and, eq } from 'drizzle-orm';
import type { CurrentUser } from '../auth/sessions.js';
import type { Db } from '../db/client.js';
import { issueInviteCode } from './invite-code.js';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/**
 * 给管理员建默认区域。管理员一被创建就该有一个，见 ADR-0017。
 *
 * 区域名全站唯一（它会在注册页展示给注册者），所以重名时追加序号。用
 * `onConflictDoNothing` 试探而不是先查后插：并发建两个管理员时先查后插会
 * 双双查空、双双插入、双双撞唯一索引。
 */
export async function createDefaultRegion(
  db: Db | Tx,
  adminId: string,
  base: string,
): Promise<string> {
  const trimmed = base.trim() || adminId;
  for (let n = 1; n <= 50; n += 1) {
    const name = n === 1 ? trimmed : `${trimmed} ${n}`;
    const [row] = await db
      .insert(regions)
      .values({ name, ownerAdminId: adminId, isDefault: true })
      .onConflictDoNothing({ target: regions.name })
      .returning({ id: regions.id });
    if (row) {
      await issueInviteCode(db, row.id);
      return row.id;
    }
  }
  throw new Error('无法为管理员生成不重名的默认区域');
}

/**
 * 新建用户默认落进哪个区域。
 *
 * 超级管理员不拥有区域，他建的用户先落「未分配」，之后再移。管理员的默认
 * 区域理论上建号时就有了；取不到时补一个，免得升级路径上漏建的管理员从此
 * 建不了用户。
 */
export async function ensureUnassignedRegion(db: Db | Tx): Promise<string> {
  await db
    .insert(regions)
    .values({ id: UNASSIGNED_REGION_ID, name: '未分配', ownerAdminId: null, isDefault: false })
    .onConflictDoNothing();
  return UNASSIGNED_REGION_ID;
}

export async function defaultRegionFor(db: Db, actor: CurrentUser, label: string): Promise<string> {
  if (actor.role !== 'admin') return ensureUnassignedRegion(db);

  const [row] = await db
    .select({ id: regions.id })
    .from(regions)
    .where(and(eq(regions.ownerAdminId, actor.id), eq(regions.isDefault, true)))
    .limit(1);
  if (row) return row.id;

  return createDefaultRegion(db, actor.id, label || actor.account);
}

import { profiles } from '@link-profile/shared/schema';
import { eq } from 'drizzle-orm';
import { loadTargetUser } from '../auth/guards.js';
import type { UserAction } from '../auth/policy.js';
import type { CurrentUser } from '../auth/sessions.js';
import type { Db } from '../db/client.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 能不能碰这个个人页，能就返回它的 id。
 *
 * 个人页自己不带权限，权限挂在它归属的账号上，所以这里先查出主人再委托给
 * `loadTargetUser` —— 三级可见范围与「用户改不了自己的对外资产」这两条规则
 * 仍然只有那一处说了算。
 *
 * **只有这一份**：内容编辑与媒体上传曾各写过一份形状相同的实现，两边一旦
 * 漂移就是一个越权漏洞。
 *
 * `role !== 'user'` 一律拒绝，对齐「只有用户角色拥有个人页」这条不变式 ——
 * 管理员名下没有个人页，拿着一个 id 来问只可能是越权或脏数据。
 */
export async function resolveProfileAccess(
  db: Db,
  actor: CurrentUser,
  profileId: string,
  action: UserAction,
): Promise<string | null> {
  if (!UUID.test(profileId)) return null;

  const [profile] = await db
    .select({ id: profiles.id, userId: profiles.userId })
    .from(profiles)
    .where(eq(profiles.id, profileId))
    .limit(1);
  if (!profile) return null;

  const owner = await loadTargetUser(db, actor, profile.userId, action);
  return owner && owner.role === 'user' ? profile.id : null;
}

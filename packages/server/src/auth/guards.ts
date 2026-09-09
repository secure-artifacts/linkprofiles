import { users } from '@link-profile/shared/schema';
import { and, eq } from 'drizzle-orm';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Db } from '../db/client.js';
import {
  can,
  canTouchUser,
  visibleUsersFilter,
  type Capability,
  type UserAction,
} from './policy.js';
import type { CurrentUser } from './sessions.js';
import { forbidden, unauthorized } from '../http/errors.js';

/**
 * 「不因资源是否存在而给出不同响应」由 `loadTargetUser` 保证：不可见与不存在
 * 都返回 403，调用方拿不到任何存在性线索。401 与 403 的分工见 http/errors。
 */

/** 只看角色能力的接口用这个 preHandler。 */
export function requireCapability(capability: Capability) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.currentUser) {
      await unauthorized(reply);
      return;
    }
    if (!can(req.currentUser, capability)) {
      await forbidden(reply);
    }
  };
}

export interface TargetUserRow {
  id: string;
  role: CurrentUser['role'];
  owningAdminId: string | null;
  uiLanguage: string;
}

/**
 * 取出操作目标，并在同一处裁定「这个人能不能这么对它」。
 *
 * 查询本身就带上可见范围过滤，因此越权目标在 SQL 层面就取不到，
 * 与「目标不存在」在响应上完全一致。
 */
export async function loadTargetUser(
  db: Db,
  actor: CurrentUser,
  targetId: string,
  action: UserAction,
): Promise<TargetUserRow | null> {
  const scope = visibleUsersFilter(actor);
  const [row] = await db
    .select({
      id: users.id,
      role: users.role,
      owningAdminId: users.owningAdminId,
      uiLanguage: users.uiLanguage,
    })
    .from(users)
    .where(scope ? and(eq(users.id, targetId), scope) : eq(users.id, targetId))
    .limit(1);

  if (!row) return null;
  return canTouchUser(actor, row, action) ? row : null;
}

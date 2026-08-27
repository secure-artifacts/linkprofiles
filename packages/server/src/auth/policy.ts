import { users } from '@link-profile/shared/schema';
import { eq, type SQL } from 'drizzle-orm';
import type { CurrentUser } from './sessions.js';

/**
 * 唯一的授权检查点。
 *
 * 所有受保护接口都经这里裁定权限，不在各个 handler 里各判各的。
 * 05 的归属过滤只需要改这个文件里的 `visibleUsersFilter` 与 `canTouchUser`，
 * 不必逐个接口重复实现。
 */

export type Capability =
  'admin:create' | 'admin:delete' | 'admin:list' | 'user:create' | 'user:list' | 'settings:write';

/** 与「能对某个具体用户做什么」无关的能力，只看角色。 */
const CAPABILITIES: Record<CurrentUser['role'], readonly Capability[]> = {
  superadmin: [
    'admin:create',
    'admin:delete',
    'admin:list',
    'user:create',
    'user:list',
    'settings:write',
  ],
  admin: ['user:create', 'user:list'],
  // 用户也能列「用户」，只是 visibleUsersFilter 把范围收到自己一个人。
  user: ['user:list'],
};

export function can(actor: CurrentUser, capability: Capability): boolean {
  return CAPABILITIES[actor.role].includes(capability);
}

export interface TargetUser {
  id: string;
  role: CurrentUser['role'];
  owningAdminId: string | null;
}

export type UserAction = 'read' | 'update' | 'delete' | 'update:shortName';

/**
 * 能不能对这个具体的用户下手。
 *
 * - 超级管理员不受限
 * - 管理员只能碰归属于自己的用户（05 收紧的就是这一条）
 * - 用户只能碰自己，且改不了自己的 short_name
 */
export function canTouchUser(actor: CurrentUser, target: TargetUser, action: UserAction): boolean {
  if (actor.role === 'superadmin') return true;

  if (actor.role === 'admin') {
    // 管理员管不了另一个管理员，也管不了超级管理员。
    // 05 在这里加上「且归属于自己」，是归属分权的唯一落点之一。
    return target.role === 'user';
  }

  if (target.id !== actor.id) return false;
  // 用户改不了自己的 short_name，避免手滑把已印在物料上的链接搞失效
  return action !== 'update:shortName';
}

/**
 * 列表查询的可见范围。返回 undefined 表示不加限制。
 * 每一个列出用户的地方都必须用它，漏一处就是越权。
 */
export function visibleUsersFilter(actor: CurrentUser): SQL | undefined {
  switch (actor.role) {
    case 'superadmin':
      return undefined;
    case 'admin':
      // 05 在这里收紧为 eq(users.owningAdminId, actor.id)，
      // 归属分权只改这一行，不逐个接口重复实现过滤。
      return undefined;
    case 'user':
      return eq(users.id, actor.id);
  }
}

import { users } from '@link-profile/shared/schema';
import { eq, type SQL } from 'drizzle-orm';
import type { CurrentUser } from './sessions.js';

/**
 * 唯一的授权检查点。
 *
 * 所有受保护接口都经这里裁定权限，不在各个 handler 里各判各的。
 * 归属分权（ADR-0005）就落在本文件的 `canTouchUser` 与 `visibleUsersFilter`
 * 两处，接口侧不重复实现过滤 —— 漏一处就是越权，所以只留一处可漏。
 */

export type Capability =
  | 'admin:create'
  | 'admin:delete'
  | 'admin:list'
  | 'admin:update'
  | 'user:create'
  | 'user:list'
  /** 把用户指派给某个归属管理员，只有超级管理员做得了 */
  | 'user:assign'
  | 'settings:write';

/** 与「能对某个具体用户做什么」无关的能力，只看角色。 */
const CAPABILITIES: Record<CurrentUser['role'], readonly Capability[]> = {
  superadmin: [
    'admin:create',
    'admin:delete',
    'admin:list',
    'admin:update',
    'user:create',
    'user:list',
    'user:assign',
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

export type UserAction =
  | 'read'
  /** 改页面内容、改账号备注 */
  | 'update'
  /** 改个人页地址。会让已发出去的链接失效，所以单列一档 */
  | 'update:shortName'
  /** 给这个账号新建一个个人页 */
  | 'profile:create'
  /** 删一个个人页。地址进墓碑、永不再分配，媒体文件一并从磁盘删除 */
  | 'profile:delete'
  /** 删整个账号 */
  | 'delete';

/**
 * 用户对自己做得了的事。
 *
 * 白名单而不是黑名单：以后加新动作时默认是拒绝，得有人显式想清楚才放进来。
 * 反过来写的话，新增一个动作就悄悄对所有人开放了。
 *
 * 建页面与改地址在列表里，删除不在 —— 删是唯一不可逆的那个（地址进墓碑
 * 永不再分配，媒体从磁盘删掉），留给管理员。
 */
const SELF_SERVE_ACTIONS: readonly UserAction[] = [
  'read',
  'update',
  'update:shortName',
  'profile:create',
];

/**
 * 能不能对这个具体的用户下手。
 *
 * - 超级管理员不受限
 * - 管理员只能碰归属于自己的用户
 * - 用户只能碰自己，且只做得了 `SELF_SERVE_ACTIONS` 里那几件
 */
export function canTouchUser(actor: CurrentUser, target: TargetUser, action: UserAction): boolean {
  if (actor.role === 'superadmin') return true;

  if (actor.role === 'admin') {
    // 管理员管不了另一个管理员，也管不了超级管理员；
    // 用户里也只碰得到归属于自己的那些，无归属的一概碰不到。
    return target.role === 'user' && target.owningAdminId === actor.id;
  }

  if (target.id !== actor.id) return false;
  return SELF_SERVE_ACTIONS.includes(action);
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
      // 归属于自己的才看得见。无归属（外键为空）也不可见，
      // 只有超级管理员能看到并重新指派。
      return eq(users.owningAdminId, actor.id);
    case 'user':
      return eq(users.id, actor.id);
  }
}

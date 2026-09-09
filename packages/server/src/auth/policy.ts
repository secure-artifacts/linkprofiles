import { regions, users } from '@link-profile/shared/schema';
import { eq, sql, type SQL } from 'drizzle-orm';
import type { CurrentUser } from './sessions.js';

/**
 * 唯一的授权检查点。
 *
 * 所有受保护接口都经这里裁定权限，不在各个 handler 里各判各的。
 * 归属分权（ADR-0005）就落在本文件的 `canTouchUser` 与 `visibleUsersFilter`
 * 两处，接口侧不重复实现过滤 —— 漏一处就是越权，所以只留一处可漏。
 *
 * 归属本身沿「用户 → 区域 → 管理员」这一条单链推导（ADR-0017），用户身上
 * 没有独立的归属管理员字段。
 */

export type Capability =
  | 'admin:create'
  | 'admin:delete'
  | 'admin:list'
  | 'admin:update'
  | 'user:create'
  | 'user:list'
  /**
   * 把用户移到另一个区域。管理员也有，但目标区域必须归属于他自己 ——
   * 「跨管理员移动只有超级管理员做得了」由这条区域归属检查自然成立，
   * 不需要第二个能力去表达。
   */
  | 'user:move'
  | 'region:list'
  | 'region:create'
  | 'region:update'
  | 'region:delete'
  /** 建区域时指定归属给别的管理员，只有超级管理员做得了 */
  | 'region:assignOwner'
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
    'user:move',
    'region:list',
    'region:create',
    'region:update',
    'region:delete',
    'region:assignOwner',
    'settings:write',
  ],
  admin: [
    'user:create',
    'user:list',
    'user:move',
    'region:list',
    'region:create',
    'region:update',
    'region:delete',
  ],
  // 用户也能列「用户」，只是 visibleUsersFilter 把范围收到自己一个人。
  user: ['user:list'],
};

export function can(actor: CurrentUser, capability: Capability): boolean {
  return CAPABILITIES[actor.role].includes(capability);
}

export interface TargetUser {
  id: string;
  role: CurrentUser['role'];
  /** 目标所在区域的归属管理员。为空即无归属区域，仅超级管理员碰得到。 */
  regionOwnerAdminId: string | null;
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
    // 用户里也只碰得到自己名下区域里的那些，无归属区域的一概碰不到。
    return target.role === 'user' && target.regionOwnerAdminId === actor.id;
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
      // 自己名下区域里的才看得见。无归属区域里的也不可见，
      // 只有超级管理员能看到并重新指派。
      //
      // 写成相关子查询而不是连接：调用点只把它塞进 where，不必为了鉴权
      // 去改自己的 from/join，接缝仍然只有这一处。
      return sql`exists (select 1 from ${regions} where ${regions.id} = ${users.regionId} and ${regions.ownerAdminId} = ${actor.id})`;
    case 'user':
      return eq(users.id, actor.id);
  }
}

/**
 * 区域列表查询的可见范围。与 `visibleUsersFilter` 同源：管理员看得见的用户，
 * 正是他看得见的那些区域里的用户。
 */
export function visibleRegionsFilter(actor: CurrentUser): SQL | undefined {
  switch (actor.role) {
    case 'superadmin':
      return undefined;
    case 'admin':
      return eq(regions.ownerAdminId, actor.id);
    case 'user':
      // 用户后台不出现区域这个概念，一个都看不到。
      return sql`false`;
  }
}

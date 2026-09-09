import type { Role } from '../api/types.js';

/**
 * 后台分区对角色的准入。
 *
 * 导航与路由守卫共用这一张表。只挡导航不够，地址直接敲进去照样进得去，
 * 普通用户会看到一整页自己按不动的按钮。
 *
 * 这里只做「这个分区给谁看」的粗粒度判断，具体到某个用户能不能被碰仍然由
 * 服务端的 policy 裁定 —— 前端挡的是误导，不是越权。
 */
const SECTION_ROLES = {
  users: ['superadmin', 'admin'],
  regions: ['superadmin', 'admin'],
  admins: ['superadmin'],
  settings: ['superadmin'],
} satisfies Record<string, readonly Role[]>;

export type Section = keyof typeof SECTION_ROLES;

export function canOpen(role: Role, section: Section): boolean {
  return (SECTION_ROLES[section] as readonly Role[]).includes(role);
}

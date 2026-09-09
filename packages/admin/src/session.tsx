import { createContext, useContext } from 'react';
import type { Role, Session } from './api/types.js';

const SessionContext = createContext<Session | null>(null);

export const SessionProvider = SessionContext.Provider;

/** 只在登录后的子树里调用，未登录时整棵子树根本不渲染。 */
export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) throw new Error('useSession 只能在登录后的子树里使用');
  return session;
}

/** 角色到文案 key 的映射。文案本身在译文目录里，这里只留结构。 */
export const ROLE_KEYS: Record<Role, 'role.superadmin' | 'role.admin' | 'role.user'> = {
  superadmin: 'role.superadmin',
  admin: 'role.admin',
  user: 'role.user',
};

/** 登录后落在哪个页面。用户看自己的页面列表，运营角色看用户列表。 */
export function landingPath(session: Session): string {
  return session.role === 'user' ? `/users/${session.id}/profiles` : '/users';
}

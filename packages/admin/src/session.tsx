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

export const ROLE_LABELS: Record<Role, string> = {
  superadmin: '超级管理员',
  admin: '管理员',
  user: '用户',
};

/** 登录后落在哪个页面。用户看自己的页面列表，运营角色看用户列表。 */
export function landingPath(session: Session): string {
  return session.role === 'user' ? `/users/${session.id}/profiles` : '/users';
}

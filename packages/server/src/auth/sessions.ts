import { createHash, randomBytes } from 'node:crypto';
import { sessions, users } from '@link-profile/shared/schema';
import { and, eq, gt } from 'drizzle-orm';
import type { Db } from '../db/client.js';

export const SESSION_COOKIE = 'lp_session';
export const SESSION_TTL_DAYS = 30;
const SESSION_TTL_MS = SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export interface CurrentUser {
  id: string;
  role: 'superadmin' | 'admin' | 'user';
  account: string;
  owningAdminId: string | null;
}

/** 建一个 30 天有效期的会话，返回要写进 cookie 的明文令牌。 */
export async function createSession(db: Db, userId: string, now = new Date()): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  await db.insert(sessions).values({
    tokenHash: hashToken(token),
    userId,
    expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
  });
  return token;
}

/** 用 cookie 里的令牌换出当前用户。过期的会话当作不存在。 */
export async function resolveSession(
  db: Db,
  token: string,
  now = new Date(),
): Promise<CurrentUser | null> {
  const [row] = await db
    .select({
      id: users.id,
      role: users.role,
      account: users.account,
      owningAdminId: users.owningAdminId,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, now)))
    .limit(1);

  return row ?? null;
}

export async function deleteSession(db: Db, token: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
}

/** 改密码或删账号时调用：该账号的全部既有会话立即失效。 */
export async function deleteSessionsForUser(db: Db, userId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}

export function sessionCookieOptions(now = new Date()) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    path: '/',
    secure: process.env.NODE_ENV === 'production',
    expires: new Date(now.getTime() + SESSION_TTL_MS),
  };
}

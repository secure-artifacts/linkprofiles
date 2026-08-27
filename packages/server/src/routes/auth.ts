import { users } from '@link-profile/shared/schema';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { hashPassword, verifyPassword } from '../auth/passwords.js';
import {
  createSession,
  deleteSession,
  deleteSessionsForUser,
  SESSION_COOKIE,
  sessionCookieOptions,
} from '../auth/sessions.js';

const loginBody = z.object({
  account: z.string().min(1),
  password: z.string().min(1),
});

const passwordBody = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, '新密码至少 8 位'),
});

export async function authRoutes(app: FastifyInstance) {
  app.post('/auth/login', async (req, reply) => {
    const parsed = loginBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_body' });
    }

    const [user] = await app.db
      .select({ id: users.id, role: users.role, account: users.account, hash: users.passwordHash })
      .from(users)
      .where(eq(users.account, parsed.data.account))
      .limit(1);

    // 账号不存在与密码错误给同一个响应，不透露账号是否存在。
    if (!user || !(await verifyPassword(user.hash, parsed.data.password))) {
      return reply.code(401).send({ error: 'invalid_credentials' });
    }

    const token = await createSession(app.db, user.id);
    return reply
      .setCookie(SESSION_COOKIE, token, sessionCookieOptions())
      .send({ id: user.id, role: user.role, account: user.account });
  });

  app.post('/auth/logout', async (req, reply) => {
    const token = req.cookies[SESSION_COOKIE];
    if (token) await deleteSession(app.db, token);
    return reply.clearCookie(SESSION_COOKIE, { path: '/' }).code(204).send();
  });

  app.get('/auth/me', { onRequest: [app.requireAuth] }, async (req) => {
    const me = req.currentUser!;
    return { id: me.id, role: me.role, account: me.account };
  });

  app.post('/auth/password', { onRequest: [app.requireAuth] }, async (req, reply) => {
    const parsed = passwordBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_body', issues: parsed.error.issues });
    }

    const me = req.currentUser!;
    const [user] = await app.db
      .select({ hash: users.passwordHash })
      .from(users)
      .where(eq(users.id, me.id))
      .limit(1);

    if (!user || !(await verifyPassword(user.hash, parsed.data.currentPassword))) {
      return reply.code(401).send({ error: 'invalid_credentials' });
    }

    await app.db
      .update(users)
      .set({ passwordHash: await hashPassword(parsed.data.newPassword), updatedAt: new Date() })
      .where(eq(users.id, me.id));

    // 改密码即踢下线：包括当前这条会话，必须重新登录。
    await deleteSessionsForUser(app.db, me.id);

    return reply.clearCookie(SESSION_COOKIE, { path: '/' }).code(204).send();
  });
}

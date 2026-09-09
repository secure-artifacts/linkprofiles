import { accountNameSchema } from '@link-profile/shared';
import { users } from '@link-profile/shared/schema';
import { eq, or, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { SUPPORTED_LOCALES } from '@link-profile/i18n';
import { hashPassword, verifyPassword } from '../auth/passwords.js';
import {
  createSession,
  deleteSession,
  deleteSessionsForUser,
  SESSION_COOKIE,
  sessionCookieOptions,
} from '../auth/sessions.js';
import { renameAccount } from '../users/rename-account.js';
import { fail } from '../http/errors.js';

const loginBody = z.object({
  account: z.string().min(1),
  password: z.string().min(1),
});

const passwordBody = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, 'field.newPassword.min'),
});

const languageBody = z.object({
  uiLanguage: z.enum(SUPPORTED_LOCALES),
});

const accountBody = z.object({
  currentPassword: z.string().min(1),
  account: accountNameSchema,
});

export async function authRoutes(app: FastifyInstance) {
  app.post('/auth/login', async (req, reply) => {
    const parsed = loginBody.safeParse(req.body);
    if (!parsed.success) {
      return fail(reply, 400, 'invalid_body');
    }

    const [user] = await app.db
      .select({
        id: users.id,
        role: users.role,
        account: users.account,
        uiLanguage: users.uiLanguage,
        hash: users.passwordHash,
      })
      .from(users)
      // 标准账号不区分大小写；历史宽松账号保留精确匹配以免迁移伤及登录。
      .where(
        or(
          eq(users.account, parsed.data.account),
          sql`lower(${users.account}) = lower(${parsed.data.account.trim()})`,
        ),
      )
      .limit(1);

    // 账号不存在与密码错误给同一个响应，不透露账号是否存在。
    if (!user || !(await verifyPassword(user.hash, parsed.data.password))) {
      return fail(reply, 401, 'invalid_credentials');
    }

    const token = await createSession(app.db, user.id);
    return reply
      .setCookie(SESSION_COOKIE, token, sessionCookieOptions())
      .send({ id: user.id, role: user.role, account: user.account, uiLanguage: user.uiLanguage });
  });

  app.post('/auth/logout', async (req, reply) => {
    const token = req.cookies[SESSION_COOKIE];
    if (token) await deleteSession(app.db, token);
    return reply.clearCookie(SESSION_COOKIE, { path: '/' }).code(204).send();
  });

  app.get('/auth/me', { onRequest: [app.requireAuth] }, async (req) => {
    const me = req.currentUser!;
    return { id: me.id, role: me.role, account: me.account, uiLanguage: me.uiLanguage };
  });

  /**
   * 自助切换界面语言。它不是登录凭证，改它不必验密码，也不踢下线 ——
   * 与改密码、改账号那两条路径的纪律不同，见 ADR-0014。
   */
  app.put('/auth/language', { onRequest: [app.requireAuth] }, async (req, reply) => {
    const parsed = languageBody.safeParse(req.body);
    if (!parsed.success) {
      return fail(reply, 400, 'invalid_body', { issues: parsed.error.issues });
    }

    const me = req.currentUser!;
    await app.db
      .update(users)
      .set({ uiLanguage: parsed.data.uiLanguage, updatedAt: new Date() })
      .where(eq(users.id, me.id));

    return { uiLanguage: parsed.data.uiLanguage };
  });

  app.post('/auth/password', { onRequest: [app.requireAuth] }, async (req, reply) => {
    const parsed = passwordBody.safeParse(req.body);
    if (!parsed.success) {
      return fail(reply, 400, 'invalid_body', { issues: parsed.error.issues });
    }

    const me = req.currentUser!;
    const [user] = await app.db
      .select({ hash: users.passwordHash })
      .from(users)
      .where(eq(users.id, me.id))
      .limit(1);

    if (!user || !(await verifyPassword(user.hash, parsed.data.currentPassword))) {
      return fail(reply, 401, 'invalid_credentials');
    }

    await app.db
      .update(users)
      .set({ passwordHash: await hashPassword(parsed.data.newPassword), updatedAt: new Date() })
      .where(eq(users.id, me.id));

    // 改密码即踢下线：包括当前这条会话，必须重新登录。
    await deleteSessionsForUser(app.db, me.id);

    return reply.clearCookie(SESSION_COOKIE, { path: '/' }).code(204).send();
  });

  app.put('/auth/account', { onRequest: [app.requireAuth] }, async (req, reply) => {
    const parsed = accountBody.safeParse(req.body);
    if (!parsed.success) {
      return fail(reply, 400, 'invalid_body', { issues: parsed.error.issues });
    }

    const me = req.currentUser!;
    const [user] = await app.db
      .select({ hash: users.passwordHash })
      .from(users)
      .where(eq(users.id, me.id))
      .limit(1);
    if (!user || !(await verifyPassword(user.hash, parsed.data.currentPassword))) {
      return fail(reply, 401, 'invalid_credentials');
    }

    const renamed = await renameAccount(app.db, {
      userId: me.id,
      changedBy: me.id,
      account: parsed.data.account,
    });
    if (renamed.status === 'account_taken') {
      return fail(reply, 409, 'account_taken');
    }

    // 登录凭证变化后所有设备重新认证；即使名称没变也不制造无意义流水。
    if (renamed.status === 'changed') await deleteSessionsForUser(app.db, me.id);
    return reply
      .clearCookie(SESSION_COOKIE, { path: '/' })
      .send({ account: renamed.status === 'not_found' ? me.account : renamed.account });
  });
}

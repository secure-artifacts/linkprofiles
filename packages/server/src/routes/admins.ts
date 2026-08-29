import { accountNameSchema } from '@link-profile/shared';
import { users } from '@link-profile/shared/schema';
import { and, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { FORBIDDEN, requireCapability } from '../auth/guards.js';
import { hashPassword } from '../auth/passwords.js';
import { deleteSessionsForUser } from '../auth/sessions.js';
import { renameAccount } from '../users/rename-account.js';
import { findUserConflict } from '../users/conflicts.js';

const createAdminBody = z.object({
  account: accountNameSchema,
  password: z.string().min(8, '密码至少 8 位'),
  label: z.string().trim().default(''),
});

const updateAdminBody = z.object({
  account: accountNameSchema.optional(),
  label: z.string().trim().optional(),
});

/** 管理员账号的增删查，只有超级管理员做得了。 */
export async function adminRoutes(app: FastifyInstance) {
  app.get('/admins', { onRequest: [requireCapability('admin:list')] }, async () => {
    const rows = await app.db
      .select({
        id: users.id,
        account: users.account,
        label: users.label,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.role, 'admin'))
      .orderBy(users.createdAt);
    return { admins: rows };
  });

  app.post('/admins', { onRequest: [requireCapability('admin:create')] }, async (req, reply) => {
    const parsed = createAdminBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_body', issues: parsed.error.issues });
    }

    if (await findUserConflict(app.db, { account: parsed.data.account })) {
      return reply.code(409).send({ error: 'account_taken' });
    }

    const [row] = await app.db
      .insert(users)
      .values({
        role: 'admin',
        account: parsed.data.account,
        passwordHash: await hashPassword(parsed.data.password),
        label: parsed.data.label,
      })
      .returning({ id: users.id, account: users.account, label: users.label });

    return reply.code(201).send(row);
  });

  app.patch<{ Params: { id: string } }>(
    '/admins/:id',
    { onRequest: [requireCapability('admin:update')] },
    async (req, reply) => {
      const parsed = updateAdminBody.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'invalid_body', issues: parsed.error.issues });
      }
      const [target] = await app.db
        .select({ id: users.id, account: users.account })
        .from(users)
        .where(and(eq(users.id, req.params.id), eq(users.role, 'admin')))
        .limit(1);
      if (!target) return reply.code(403).send(FORBIDDEN);

      let account = target.account;
      if (parsed.data.account !== undefined) {
        const renamed = await renameAccount(app.db, {
          userId: target.id,
          changedBy: req.currentUser!.id,
          account: parsed.data.account,
        });
        if (renamed.status === 'account_taken') {
          return reply.code(409).send({ error: 'account_taken' });
        }
        if (renamed.status === 'changed') {
          account = renamed.account;
          await deleteSessionsForUser(app.db, target.id);
        }
      }
      const [row] = await app.db
        .update(users)
        .set({
          ...(parsed.data.label !== undefined ? { label: parsed.data.label } : {}),
          updatedAt: new Date(),
        })
        .where(eq(users.id, target.id))
        .returning({
          id: users.id,
          account: users.account,
          label: users.label,
          createdAt: users.createdAt,
        });
      return row ?? { ...target, account };
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/admins/:id',
    { onRequest: [requireCapability('admin:delete')] },
    async (req, reply) => {
      const [target] = await app.db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.id, req.params.id), eq(users.role, 'admin')))
        .limit(1);

      // 不存在与不是管理员给同一个响应，不透露这个 id 是谁。
      if (!target) return reply.code(403).send(FORBIDDEN);

      await deleteSessionsForUser(app.db, target.id);
      // 管理员没有 short_name，走普通删除即可；名下用户由外键置空转为无归属
      await app.db.delete(users).where(eq(users.id, target.id));

      return reply.code(204).send();
    },
  );
}

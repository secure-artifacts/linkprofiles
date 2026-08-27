import { users } from '@link-profile/shared/schema';
import { and, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { FORBIDDEN, requireCapability } from '../auth/guards.js';
import { hashPassword } from '../auth/passwords.js';
import { deleteSessionsForUser } from '../auth/sessions.js';

const createAdminBody = z.object({
  account: z.string().trim().min(1, '账号不能为空'),
  password: z.string().min(8, '密码至少 8 位'),
  label: z.string().trim().default(''),
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

    const [existing] = await app.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.account, parsed.data.account))
      .limit(1);
    if (existing) {
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
      await app.db.delete(users).where(eq(users.id, target.id));

      return reply.code(204).send();
    },
  );
}

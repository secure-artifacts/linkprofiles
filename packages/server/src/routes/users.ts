import { users } from '@link-profile/shared/schema';
import { shortNameSchema } from '@link-profile/shared';
import { and, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { FORBIDDEN, loadTargetUser, requireCapability, UNAUTHORIZED } from '../auth/guards.js';
import { hashPassword } from '../auth/passwords.js';
import { deleteSessionsForUser } from '../auth/sessions.js';
import { visibleUsersFilter } from '../auth/policy.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const createUserBody = z.object({
  account: z.string().trim().min(1, '账号不能为空'),
  password: z.string().min(8, '密码至少 8 位'),
  /** 用户名称：后台中文备注，可重复，不做唯一约束 */
  label: z.string().trim().default(''),
  shortName: shortNameSchema,
  /** 显示名：个人页上给访客看的名字，可重复。留空时先跟 short_name 一致 */
  displayName: z.string().trim().optional(),
});

const updateUserBody = z.object({
  label: z.string().trim().optional(),
  shortName: shortNameSchema.optional(),
});

const publicColumns = {
  id: users.id,
  account: users.account,
  label: users.label,
  shortName: users.shortName,
  displayName: users.displayName,
  owningAdminId: users.owningAdminId,
  createdAt: users.createdAt,
};

export async function userRoutes(app: FastifyInstance) {
  app.get('/users', { onRequest: [requireCapability('user:list')] }, async (req) => {
    const scope = visibleUsersFilter(req.currentUser!);
    const rows = await app.db
      .select(publicColumns)
      .from(users)
      .where(scope ? and(eq(users.role, 'user'), scope) : eq(users.role, 'user'))
      .orderBy(users.createdAt);
    return { users: rows };
  });

  app.get<{ Params: { id: string } }>('/users/:id', async (req, reply) => {
    if (!req.currentUser) return reply.code(401).send(UNAUTHORIZED);
    if (!UUID.test(req.params.id)) return reply.code(403).send(FORBIDDEN);

    const target = await loadTargetUser(app.db, req.currentUser, req.params.id, 'read');
    if (!target) return reply.code(403).send(FORBIDDEN);

    const [row] = await app.db.select(publicColumns).from(users).where(eq(users.id, target.id));
    return row;
  });

  app.post('/users', { onRequest: [requireCapability('user:create')] }, async (req, reply) => {
    const parsed = createUserBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_body', issues: parsed.error.issues });
    }
    const { account, password, label, shortName, displayName } = parsed.data;

    const conflict = await findConflict(app, account, shortName);
    if (conflict) return reply.code(409).send({ error: conflict });

    const [row] = await app.db
      .insert(users)
      .values({
        role: 'user',
        account,
        passwordHash: await hashPassword(password),
        label,
        shortName,
        displayName: displayName || shortName,
      })
      .returning(publicColumns);

    return reply.code(201).send(row);
  });

  app.patch<{ Params: { id: string } }>('/users/:id', async (req, reply) => {
    if (!req.currentUser) return reply.code(401).send(UNAUTHORIZED);
    if (!UUID.test(req.params.id)) return reply.code(403).send(FORBIDDEN);

    const parsed = updateUserBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_body', issues: parsed.error.issues });
    }

    // 改 short_name 与改其他字段是两种权限：用户改得了自己的备注，改不了自己的地址。
    const action = parsed.data.shortName === undefined ? 'update' : 'update:shortName';
    const target = await loadTargetUser(app.db, req.currentUser, req.params.id, action);
    if (!target) return reply.code(403).send(FORBIDDEN);

    if (parsed.data.shortName) {
      const conflict = await findConflict(app, null, parsed.data.shortName, target.id);
      if (conflict) return reply.code(409).send({ error: conflict });
    }

    const [row] = await app.db
      .update(users)
      .set({
        ...(parsed.data.label !== undefined ? { label: parsed.data.label } : {}),
        ...(parsed.data.shortName !== undefined ? { shortName: parsed.data.shortName } : {}),
        updatedAt: new Date(),
      })
      .where(eq(users.id, target.id))
      .returning(publicColumns);

    return row;
  });

  app.delete<{ Params: { id: string } }>('/users/:id', async (req, reply) => {
    if (!req.currentUser) return reply.code(401).send(UNAUTHORIZED);
    if (!UUID.test(req.params.id)) return reply.code(403).send(FORBIDDEN);

    const target = await loadTargetUser(app.db, req.currentUser, req.params.id, 'delete');
    // 用户删不了自己
    if (!target || req.currentUser.role === 'user') return reply.code(403).send(FORBIDDEN);

    await deleteSessionsForUser(app.db, target.id);
    await app.db.delete(users).where(eq(users.id, target.id));

    return reply.code(204).send();
  });
}

type Conflict = 'account_taken' | 'short_name_taken';

async function findConflict(
  app: FastifyInstance,
  account: string | null,
  shortName: string,
  excludeId?: string,
): Promise<Conflict | null> {
  if (account) {
    const [row] = await app.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.account, account))
      .limit(1);
    if (row && row.id !== excludeId) return 'account_taken';
  }

  const [row] = await app.db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.shortName, shortName))
    .limit(1);
  if (row && row.id !== excludeId) return 'short_name_taken';

  return null;
}

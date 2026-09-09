import { accountNameSchema, passwordSchema } from '@link-profile/shared';
import { regions, users } from '@link-profile/shared/schema';
import { and, count, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireCapability } from '../auth/guards.js';
import { hashPassword } from '../auth/passwords.js';
import { deleteSessionsForUser } from '../auth/sessions.js';
import { deleteUserAccount } from '../profiles/deletion.js';
import { renameAccount } from '../users/rename-account.js';
import { findUserConflict } from '../users/conflicts.js';
import { fail, forbidden } from '../http/errors.js';
import { createDefaultRegion } from '../regions/default-region.js';

const createAdminBody = z.object({
  account: accountNameSchema,
  password: passwordSchema,
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
        regionCount: count(regions.id),
      })
      .from(users)
      .leftJoin(regions, eq(regions.ownerAdminId, users.id))
      .where(eq(users.role, 'admin'))
      .groupBy(users.id)
      .orderBy(users.createdAt);
    return { admins: rows };
  });

  app.post('/admins', { onRequest: [requireCapability('admin:create')] }, async (req, reply) => {
    const parsed = createAdminBody.safeParse(req.body);
    if (!parsed.success) {
      return fail(reply, 400, 'invalid_body', { issues: parsed.error.issues });
    }

    if (await findUserConflict(app.db, { account: parsed.data.account })) {
      return fail(reply, 409, 'account_taken');
    }

    // 账号与它的默认区域同一个事务：管理员一被创建就该有一个区域可用，
    // 否则他建的第一个用户没有地方落，见 ADR-0017。
    const row = await app.db.transaction(async (tx) => {
      const [admin] = await tx
        .insert(users)
        .values({
          role: 'admin',
          account: parsed.data.account,
          passwordHash: await hashPassword(parsed.data.password),
          label: parsed.data.label,
          uiLanguage: req.currentUser!.uiLanguage,
        })
        .returning({ id: users.id, account: users.account, label: users.label });

      await createDefaultRegion(tx, admin!.id, admin!.label || admin!.account);
      return admin!;
    });

    return reply.code(201).send(row);
  });

  app.patch<{ Params: { id: string } }>(
    '/admins/:id',
    { onRequest: [requireCapability('admin:update')] },
    async (req, reply) => {
      const parsed = updateAdminBody.safeParse(req.body);
      if (!parsed.success) {
        return fail(reply, 400, 'invalid_body', { issues: parsed.error.issues });
      }
      const [target] = await app.db
        .select({ id: users.id, account: users.account })
        .from(users)
        .where(and(eq(users.id, req.params.id), eq(users.role, 'admin')))
        .limit(1);
      if (!target) return forbidden(reply);

      let account = target.account;
      if (parsed.data.account !== undefined) {
        const renamed = await renameAccount(app.db, {
          userId: target.id,
          changedBy: req.currentUser!.id,
          account: parsed.data.account,
        });
        if (renamed.status === 'account_taken') {
          return fail(reply, 409, 'account_taken');
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
      if (!target) return forbidden(reply);

      await deleteSessionsForUser(app.db, target.id);

      // 管理员没有 short_name，与删用户共用同一条删除路径；名下区域由外键置空
      // 转为无归属，其邀请码在 deleteUserAccount 里一并作废。
      await deleteUserAccount(app.db, target.id);

      return reply.code(204).send();
    },
  );
}

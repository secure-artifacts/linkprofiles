import { profiles, users } from '@link-profile/shared/schema';
import { shortNameSchema } from '@link-profile/shared';
import { and, count, eq, isNull, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { FORBIDDEN, loadTargetUser, requireCapability, UNAUTHORIZED } from '../auth/guards.js';
import { hashPassword } from '../auth/passwords.js';
import { deleteSessionsForUser } from '../auth/sessions.js';
import { deleteUserAccount } from '../profiles/deletion.js';
import { findUserConflict } from '../users/conflicts.js';
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

const resetPasswordBody = z.object({
  newPassword: z.string().min(8, '密码至少 8 位'),
});

const assignOwnerBody = z.object({
  /** null 表示置为无归属 */
  owningAdminId: z.string().uuid().nullable(),
});

const updateUserBody = z.object({
  label: z.string().trim().optional(),
});

/**
 * 账号字段。**不再拍平个人页字段**：一个账号可以有多个个人页，
 * 拍平就得任选一个，那是撒谎。要具体个人页走 `/users/:id/profiles`，
 * 见 ADR-0008。
 */
const publicColumns = {
  id: users.id,
  account: users.account,
  label: users.label,
  owningAdminId: users.owningAdminId,
  createdAt: users.createdAt,
};

export async function userRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { owner?: string } }>(
    '/users',
    { onRequest: [requireCapability('user:list')] },
    async (req) => {
      const scope = visibleUsersFilter(req.currentUser!);
      // `?owner=none` 单列无归属用户。可见范围仍然叠在上面，
      // 因此只有超级管理员真的取得到东西。
      const unowned = req.query.owner === 'none' ? isNull(users.owningAdminId) : undefined;

      // 归属人的名字在这里一并取出来。前端拿 `/admins` 自己对照是不行的 ——
      // 那个清单只含 role='admin'，归属给超级管理员的用户会对不上，显示成
      // 「—」，与真正需要处理的「无归属」混为一谈。
      const owner = alias(users, 'owner');

      // count(profiles.id) 对没有个人页的账号得 0，正是想要的
      const rows = await app.db
        .select({
          ...publicColumns,
          owningAdminLabel: sql<
            string | null
          >`coalesce(nullif(${owner.label}, ''), ${owner.account})`,
          profileCount: count(profiles.id),
        })
        .from(users)
        .leftJoin(profiles, eq(profiles.userId, users.id))
        .leftJoin(owner, eq(owner.id, users.owningAdminId))
        .where(and(eq(users.role, 'user'), scope, unowned))
        .groupBy(users.id, owner.label, owner.account)
        .orderBy(users.createdAt);
      return { users: rows };
    },
  );

  app.get<{ Params: { id: string } }>('/users/:id', async (req, reply) => {
    if (!req.currentUser) return reply.code(401).send(UNAUTHORIZED);
    if (!UUID.test(req.params.id)) return reply.code(403).send(FORBIDDEN);

    const target = await loadTargetUser(app.db, req.currentUser, req.params.id, 'read');
    if (!target) return reply.code(403).send(FORBIDDEN);

    const [row] = await app.db
      .select({ ...publicColumns, profileCount: count(profiles.id) })
      .from(users)
      .leftJoin(profiles, eq(profiles.userId, users.id))
      .where(eq(users.id, target.id))
      .groupBy(users.id);
    return row;
  });

  app.post('/users', { onRequest: [requireCapability('user:create')] }, async (req, reply) => {
    const parsed = createUserBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_body', issues: parsed.error.issues });
    }
    const { account, password, label, shortName, displayName } = parsed.data;

    const conflict = await findUserConflict(app.db, { account, shortName });
    if (conflict) return reply.code(409).send({ error: conflict });

    const passwordHash = await hashPassword(password);
    // 账号与它的第一个个人页一起建，同一个事务：建了账号却没有页面，
    // 对调用方来说就是一次半成品的创建。
    const row = await app.db.transaction(async (tx) => {
      const [account_] = await tx
        .insert(users)
        .values({
          role: 'user',
          account,
          passwordHash,
          label,
          // 创建者自动成为归属管理员，见 ADR-0005。
          owningAdminId: req.currentUser!.id,
        })
        .returning(publicColumns);

      const [profile] = await tx
        .insert(profiles)
        .values({
          userId: account_!.id,
          shortName,
          displayName: displayName || shortName,
        })
        .returning({
          id: profiles.id,
          shortName: profiles.shortName,
          displayName: profiles.displayName,
        });

      return { ...account_!, profileCount: 1, firstProfile: profile! };
    });

    return reply.code(201).send(row);
  });

  app.patch<{ Params: { id: string } }>('/users/:id', async (req, reply) => {
    if (!req.currentUser) return reply.code(401).send(UNAUTHORIZED);
    if (!UUID.test(req.params.id)) return reply.code(403).send(FORBIDDEN);

    const parsed = updateUserBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_body', issues: parsed.error.issues });
    }

    // 这里只改账号字段。个人页地址归 `PATCH /profiles/:id/short-name` 管，
    // 它自带二次确认与变更流水，见 ADR-0010。
    const target = await loadTargetUser(app.db, req.currentUser, req.params.id, 'update');
    if (!target) return reply.code(403).send(FORBIDDEN);

    const [row] = await app.db
      .update(users)
      .set({
        ...(parsed.data.label !== undefined ? { label: parsed.data.label } : {}),
        updatedAt: new Date(),
      })
      .where(eq(users.id, target.id))
      .returning(publicColumns);

    return row;
  });

  /**
   * 重新指派归属管理员。只有超级管理员做得了，因此不走 loadTargetUser 的
   * 可见范围过滤 —— 那条路径按定义看不见无归属用户，而这里要的正是它们。
   */
  app.put<{ Params: { id: string } }>(
    '/users/:id/owner',
    { onRequest: [requireCapability('user:assign')] },
    async (req, reply) => {
      if (!UUID.test(req.params.id)) return reply.code(403).send(FORBIDDEN);

      const parsed = assignOwnerBody.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'invalid_body', issues: parsed.error.issues });
      }

      const [target] = await app.db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.id, req.params.id), eq(users.role, 'user')))
        .limit(1);
      if (!target) return reply.code(403).send(FORBIDDEN);

      // 只能指派给真正的管理员，不能塞一个用户或超级管理员的 id 进去。
      if (parsed.data.owningAdminId !== null) {
        const [admin] = await app.db
          .select({ id: users.id })
          .from(users)
          .where(and(eq(users.id, parsed.data.owningAdminId), eq(users.role, 'admin')))
          .limit(1);
        if (!admin) return reply.code(400).send({ error: 'not_an_admin' });
      }

      const [row] = await app.db
        .update(users)
        .set({ owningAdminId: parsed.data.owningAdminId, updatedAt: new Date() })
        .where(eq(users.id, target.id))
        .returning(publicColumns);

      return row;
    },
  );

  /**
   * 重置名下用户的密码。
   *
   * 与用户自助改密码（`POST /_api/auth/password`）是两条路：那条要验旧密码，
   * 这条是「他忘了密码，管理员立刻解决」，因此不验旧密码 —— 也正因为如此，
   * **只有管理员与超级管理员能调**，否则用户就能绕开旧密码校验改自己的。
   */
  app.put<{ Params: { id: string } }>('/users/:id/password', async (req, reply) => {
    if (!req.currentUser) return reply.code(401).send(UNAUTHORIZED);
    if (!UUID.test(req.params.id)) return reply.code(403).send(FORBIDDEN);
    if (req.currentUser.role === 'user') return reply.code(403).send(FORBIDDEN);

    const parsed = resetPasswordBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_body', issues: parsed.error.issues });
    }

    const target = await loadTargetUser(app.db, req.currentUser, req.params.id, 'update');
    if (!target || target.role !== 'user') return reply.code(403).send(FORBIDDEN);

    await app.db
      .update(users)
      .set({ passwordHash: await hashPassword(parsed.data.newPassword), updatedAt: new Date() })
      .where(eq(users.id, target.id));

    // 改了密码就把他的既有会话全部踢掉，与自助改密码同一条规则
    await deleteSessionsForUser(app.db, target.id);

    return reply.code(204).send();
  });

  app.delete<{ Params: { id: string } }>('/users/:id', async (req, reply) => {
    if (!req.currentUser) return reply.code(401).send(UNAUTHORIZED);
    if (!UUID.test(req.params.id)) return reply.code(403).send(FORBIDDEN);

    const target = await loadTargetUser(app.db, req.currentUser, req.params.id, 'delete');
    // 用户删不了自己
    if (!target || req.currentUser.role === 'user') return reply.code(403).send(FORBIDDEN);

    await deleteSessionsForUser(app.db, target.id);
    // 名下全部个人页的 short_name 迁入墓碑、媒体文件下架、埋点保留，见 16
    await deleteUserAccount(app.db, target.id);

    return reply.code(204).send();
  });
}

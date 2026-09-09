import { inviteCodes, regions, users } from '@link-profile/shared/schema';
import { and, count, eq, ne, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { loadTargetRegion, requireCapability } from '../auth/guards.js';
import { can, visibleRegionsFilter } from '../auth/policy.js';
import { fail, forbidden } from '../http/errors.js';
import { issueInviteCode } from '../regions/invite-code.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const regionName = z.string().trim().min(1, 'field.region.name.required').max(60);

const createRegionBody = z.object({
  name: regionName,
  /** 只有超级管理员给得了别人；管理员建的一律归自己。 */
  ownerAdminId: z.string().uuid().nullable().optional(),
});

const updateRegionBody = z
  .object({
    name: regionName.optional(),
    /** 重新指派归属管理员。只有超级管理员给得了，null 表示置为无归属。 */
    ownerAdminId: z.string().uuid().nullable().optional(),
  })
  .refine((v) => v.name !== undefined || v.ownerAdminId !== undefined, {
    message: 'field.atLeastOne',
  });

/** 不传 code 就系统随机生成；传了就按管理员指定的来。 */
const resetInviteCodeBody = z.object({ code: z.string().optional() }).default({});

/** 区域的增删改查。归属管理员由区域推导，见 ADR-0017。 */
export async function regionRoutes(app: FastifyInstance) {
  app.get('/regions', { onRequest: [requireCapability('region:list')] }, async (req) => {
    const scope = visibleRegionsFilter(req.currentUser!);
    const owner = alias(users, 'owner');

    const rows = await app.db
      .select({
        id: regions.id,
        name: regions.name,
        ownerAdminId: regions.ownerAdminId,
        ownerAdminLabel: owner.label,
        ownerAdminAccount: owner.account,
        isDefault: regions.isDefault,
        createdAt: regions.createdAt,
        memberCount: count(users.id),
        // 关联子查询而不是再连一张表：invite_codes 与 users 同时 join 会让
        // 成员数按码的行数翻倍。
        inviteCode: sql<string | null>`(
          select ic.code from ${inviteCodes} ic
          where ic.region_id = ${regions.id} and ic.is_active
          limit 1
        )`,
      })
      .from(regions)
      .leftJoin(users, and(eq(users.regionId, regions.id), eq(users.role, 'user')))
      .leftJoin(owner, eq(owner.id, regions.ownerAdminId))
      .where(scope)
      .groupBy(regions.id, owner.label, owner.account)
      .orderBy(regions.createdAt);

    return { regions: rows };
  });

  app.post('/regions', { onRequest: [requireCapability('region:create')] }, async (req, reply) => {
    const parsed = createRegionBody.safeParse(req.body);
    if (!parsed.success) {
      return fail(reply, 400, 'invalid_body', { issues: parsed.error.issues });
    }

    const actor = req.currentUser!;
    // 管理员建的区域一律归自己，请求里带别人的 id 也不作数。
    const ownerAdminId = can(actor, 'region:assignOwner')
      ? (parsed.data.ownerAdminId ?? null)
      : actor.id;

    if (ownerAdminId !== null && ownerAdminId !== actor.id) {
      const [admin] = await app.db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.id, ownerAdminId), eq(users.role, 'admin')))
        .limit(1);
      if (!admin) return fail(reply, 400, 'not_an_admin');
    }

    const [row] = await app.db
      .insert(regions)
      .values({ name: parsed.data.name, ownerAdminId, isDefault: false })
      .onConflictDoNothing({ target: regions.name })
      .returning({
        id: regions.id,
        name: regions.name,
        ownerAdminId: regions.ownerAdminId,
        isDefault: regions.isDefault,
        createdAt: regions.createdAt,
      });
    if (!row) return fail(reply, 409, 'region_name_taken');

    const issued = await issueInviteCode(app.db, row.id);
    return reply.code(201).send({
      ...row,
      memberCount: 0,
      inviteCode: issued.ok ? issued.code : null,
    });
  });

  app.patch<{ Params: { id: string } }>(
    '/regions/:id',
    { onRequest: [requireCapability('region:update')] },
    async (req, reply) => {
      if (!UUID.test(req.params.id)) return forbidden(reply);
      const parsed = updateRegionBody.safeParse(req.body);
      if (!parsed.success) {
        return fail(reply, 400, 'invalid_body', { issues: parsed.error.issues });
      }

      const target = await loadTargetRegion(app.db, req.currentUser!, req.params.id);
      if (!target) return forbidden(reply);

      if (parsed.data.name !== undefined) {
        // 名字全站唯一：先看有没有别人占了，再改。
        const [clash] = await app.db
          .select({ id: regions.id })
          .from(regions)
          .where(and(eq(regions.name, parsed.data.name), ne(regions.id, target.id)))
          .limit(1);
        if (clash) return fail(reply, 409, 'region_name_taken');
      }

      if (parsed.data.ownerAdminId !== undefined) {
        if (!can(req.currentUser!, 'region:assignOwner')) return forbidden(reply);
        if (parsed.data.ownerAdminId !== null) {
          const [admin] = await app.db
            .select({ id: users.id })
            .from(users)
            .where(and(eq(users.id, parsed.data.ownerAdminId), eq(users.role, 'admin')))
            .limit(1);
          if (!admin) return fail(reply, 400, 'not_an_admin');
        }
      }

      const [row] = await app.db
        .update(regions)
        .set({
          ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
          ...(parsed.data.ownerAdminId !== undefined
            ? { ownerAdminId: parsed.data.ownerAdminId }
            : {}),
          updatedAt: new Date(),
        })
        .where(eq(regions.id, target.id))
        .returning({
          id: regions.id,
          name: regions.name,
          ownerAdminId: regions.ownerAdminId,
          isDefault: regions.isDefault,
        });

      // 指派给别人之后，原来那个码属于上一任管理员的分发渠道，一并停掉。
      if (parsed.data.ownerAdminId !== undefined) {
        await app.db
          .update(inviteCodes)
          .set({ isActive: false, revokedAt: new Date() })
          .where(and(eq(inviteCodes.regionId, target.id), eq(inviteCodes.isActive, true)));
      }

      return row;
    },
  );

  app.post<{ Params: { id: string } }>(
    '/regions/:id/invite-code',
    { onRequest: [requireCapability('region:update')] },
    async (req, reply) => {
      if (!UUID.test(req.params.id)) return forbidden(reply);
      const parsed = resetInviteCodeBody.safeParse(req.body ?? {});
      if (!parsed.success) {
        return fail(reply, 400, 'invalid_body', { issues: parsed.error.issues });
      }

      const target = await loadTargetRegion(app.db, req.currentUser!, req.params.id);
      if (!target) return forbidden(reply);

      // 没人管的区域不该招人，见 ADR-0017。先指派归属，再发码。
      if (target.ownerAdminId === null) return fail(reply, 409, 'region_unowned');

      const issued = await issueInviteCode(app.db, target.id, parsed.data.code);
      if (!issued.ok) {
        return issued.reason === 'taken'
          ? fail(reply, 409, 'invite_code_taken')
          : fail(reply, 400, 'invalid_body', {
              issues: [{ path: ['code'], message: issued.message }],
            });
      }

      return { inviteCode: issued.code };
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/regions/:id',
    { onRequest: [requireCapability('region:delete')] },
    async (req, reply) => {
      if (!UUID.test(req.params.id)) return forbidden(reply);

      const target = await loadTargetRegion(app.db, req.currentUser!, req.params.id);
      if (!target) return forbidden(reply);

      if (target.isDefault) return fail(reply, 409, 'region_is_default');

      // 先清空才删得掉：删一个区域不该静默搬走里面几百个账号。
      const [members] = await app.db
        .select({ n: count(users.id) })
        .from(users)
        .where(eq(users.regionId, target.id));
      const n = members?.n ?? 0;
      if (n > 0) {
        // 带上人数：前端不必再查一次就能把「还有几个人」说清楚。
        return fail(reply, 409, 'region_not_empty', {
          messageKey: 'code.region_not_empty',
          messageVars: { count: n },
          memberCount: n,
        });
      }

      await app.db.delete(regions).where(eq(regions.id, target.id));
      return reply.code(204).send();
    },
  );
}

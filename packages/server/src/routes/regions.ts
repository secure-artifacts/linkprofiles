import { inviteCodes, regions, users } from '@link-profile/shared/schema';
import { and, count, eq, ne, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { loadTargetRegion, requireCapability } from '../auth/guards.js';
import { can, visibleRegionsFilter } from '../auth/policy.js';
import { fail, forbidden, localeOf } from '../http/errors.js';
import { issueInviteCode } from '../regions/invite-code.js';
import { FIELD_LIMIT_VARS, REGION_NAME_MAX } from '@link-profile/shared';
import { errorT } from '@link-profile/i18n/server';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** drizzle 把驱动的错误包一层再抛，带 SQLSTATE 的在 cause 链上。 */
function isForeignKeyViolation(err: unknown): boolean {
  for (let cur: unknown = err, depth = 0; cur && depth < 5; depth += 1) {
    const pg = cur as { code?: string; cause?: unknown };
    if (pg.code === '23503') return true;
    cur = pg.cause;
  }
  return false;
}

const regionName = z
  .string()
  .trim()
  .min(1, 'field.region.name.required')
  .max(REGION_NAME_MAX, 'field.region.name.max');

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

const bulkRegionsBody = z.object({
  /** 原文照贴，一行一个区域名。解析放在服务端，行号才对得上用户看到的那一行。 */
  text: z.string(),
  ownerAdminId: z.string().uuid().nullable().optional(),
});

interface BulkRegionFailure {
  line: number;
  error: string;
}

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

    // 归属必须是真管理员。不能因为填的是自己就跳过这一步 —— 超级管理员填
    // 自己会造出一个他自己都管不了的区域，而 ADR-0017 说超管不拥有区域。
    if (ownerAdminId !== null) {
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

    // 超级管理员建得出无归属区域，那种区域不该带码。
    const issued = ownerAdminId === null ? null : await issueInviteCode(app.db, row.id);
    return reply.code(201).send({
      ...row,
      memberCount: 0,
      inviteCode: issued?.ok ? issued.code : null,
    });
  });

  /**
   * 批量建区域。一行一个名字。
   *
   * 与批量建用户同一套取舍：**不做整批回滚**，能建的先建好，失败的行带行号与
   * 原因回去。管理员粘几十行进来，个别名字被占不该逼他整批重来。
   *
   * 批内重名单独报，而不是让第二行去撞唯一索引 —— 撞出来的「名字已被占用」
   * 会让人以为是别人占的，跑去改一个其实自己刚写重的名字。
   */
  app.post(
    '/regions/bulk',
    { onRequest: [requireCapability('region:create')] },
    async (req, reply) => {
      const parsed = bulkRegionsBody.safeParse(req.body);
      if (!parsed.success) {
        return fail(reply, 400, 'invalid_body', { issues: parsed.error.issues });
      }

      const actor = req.currentUser!;
      const translate = errorT(localeOf(req));
      const ownerAdminId = can(actor, 'region:assignOwner')
        ? (parsed.data.ownerAdminId ?? null)
        : actor.id;

      if (ownerAdminId !== null) {
        const [admin] = await app.db
          .select({ id: users.id })
          .from(users)
          .where(and(eq(users.id, ownerAdminId), eq(users.role, 'admin')))
          .limit(1);
        if (!admin) return fail(reply, 400, 'not_an_admin');
      }

      const created: { line: number; id: string; name: string; inviteCode: string | null }[] = [];
      const failed: BulkRegionFailure[] = [];
      const seen = new Set<string>();

      // \r\n 与 \r 都当换行：从表格复制过来的内容换行符不一定是哪种。
      const lines = parsed.data.text.split(/\r\n|\r|\n/);
      for (const [index, raw] of lines.entries()) {
        const line = index + 1;
        const name = raw.trim();
        // 整行空白跳过，不占行号也不算失败：粘贴时结尾常常多一个换行。
        if (name === '') continue;

        if (name.length > REGION_NAME_MAX) {
          failed.push({ line, error: translate('field.region.name.max', FIELD_LIMIT_VARS) });
          continue;
        }
        if (seen.has(name)) {
          failed.push({ line, error: translate('bulk.duplicateName') });
          continue;
        }
        seen.add(name);

        const [row] = await app.db
          .insert(regions)
          .values({ name, ownerAdminId, isDefault: false })
          .onConflictDoNothing({ target: regions.name })
          .returning({ id: regions.id, name: regions.name });
        if (!row) {
          failed.push({ line, error: translate('code.region_name_taken') });
          continue;
        }

        // 超级管理员建得出无归属区域，那种区域不该带码。
        const issued = ownerAdminId === null ? null : await issueInviteCode(app.db, row.id);
        created.push({
          line,
          id: row.id,
          name: row.name,
          inviteCode: issued?.ok ? issued.code : null,
        });
      }

      return { created, failed, createdCount: created.length, failedCount: failed.length };
    },
  );

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
        // unowned 是拿到区域行锁之后才发现的：上面那道检查与它之间，
        // 归属管理员可能刚好被删掉。
        if (issued.reason === 'unowned') return fail(reply, 409, 'region_unowned');
        if (issued.reason === 'taken') return fail(reply, 409, 'invite_code_taken');
        return fail(reply, 400, 'invalid_body', {
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

      try {
        await app.db.delete(regions).where(eq(regions.id, target.id));
      } catch (err) {
        // 上面数完到这里删掉之间，有人可能刚把用户移进来或注册进来。
        // `onDelete: 'restrict'` 会挡住，但那是个外键违例，不处理就是一个
        // 莫名其妙的 500。数据库才是最终裁判，照它的结果回同一个 409。
        if (!isForeignKeyViolation(err)) throw err;
        return fail(reply, 409, 'region_not_empty', { messageKey: 'code.region_not_empty' });
      }
      return reply.code(204).send();
    },
  );
}

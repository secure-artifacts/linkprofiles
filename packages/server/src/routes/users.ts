import { profiles, regions, users } from '@link-profile/shared/schema';
import { accountNameSchema, passwordSchema, shortNameSchema } from '@link-profile/shared';
import { and, count, eq, inArray, isNull } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { SUPPORTED_LOCALES } from '@link-profile/i18n';
import { loadTargetUser, requireCapability } from '../auth/guards.js';
import { hashPassword } from '../auth/passwords.js';
import { deleteSessionsForUser } from '../auth/sessions.js';
import { deleteUserAccount } from '../profiles/deletion.js';
import { findUserConflict } from '../users/conflicts.js';
import { visibleRegionsFilter, visibleUsersFilter } from '../auth/policy.js';
import { renameAccount } from '../users/rename-account.js';
import { defaultRegionFor } from '../regions/default-region.js';
import type { CurrentUser } from '../auth/sessions.js';
import { fail, forbidden, unauthorized } from '../http/errors.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const createUserBody = z.object({
  account: accountNameSchema,
  password: passwordSchema,
  /** 用户名称：后台中文备注，可重复，不做唯一约束 */
  label: z.string().trim().default(''),
  shortName: shortNameSchema,
  /** 落进哪个区域。不传就用创建者的默认区域。 */
  regionId: z.string().uuid().optional(),
  /** 显示名：个人页上给访客看的名字，可重复。留空时先跟 short_name 一致 */
  displayName: z.string().trim().optional(),
});

const resetPasswordBody = z.object({
  newPassword: passwordSchema,
});

const moveRegionBody = z.object({
  userIds: z.array(z.string().uuid()).min(1).max(500),
  regionId: z.string().uuid(),
});

const updateUserBody = z.object({
  label: z.string().trim().optional(),
  uiLanguage: z.enum(SUPPORTED_LOCALES).optional(),
});

const updateAccountBody = z.object({ account: accountNameSchema });

/**
 * 账号字段。**不再拍平个人页字段**：一个账号可以有多个个人页，
 * 拍平就得任选一个，那是撒谎。要具体个人页走 `/users/:id/profiles`，
 * 见 ADR-0008。
 */
const publicColumns = {
  id: users.id,
  account: users.account,
  label: users.label,
  uiLanguage: users.uiLanguage,
  regionId: users.regionId,
  createdAt: users.createdAt,
};

/**
 * 定下新用户落哪个区域：显式指定的必须在操作者可见范围内，不指定就用他的
 * 默认区域。返回 null 表示指定了一个碰不到的区域。
 */
async function resolveTargetRegion(
  app: FastifyInstance,
  actor: CurrentUser,
  requested: string | undefined,
): Promise<string | null> {
  if (requested === undefined) return defaultRegionFor(app.db, actor, actor.account);

  const scope = visibleRegionsFilter(actor);
  const [row] = await app.db
    .select({ id: regions.id })
    .from(regions)
    .where(scope ? and(eq(regions.id, requested), scope) : eq(regions.id, requested))
    .limit(1);
  return row?.id ?? null;
}

export async function userRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { region?: string } }>(
    '/users',
    { onRequest: [requireCapability('user:list')] },
    async (req) => {
      const scope = visibleUsersFilter(req.currentUser!);
      // 别名避开 `visibleUsersFilter` 子查询里未加别名的 regions。
      const region = alias(regions, 'member_region');

      // `?region=unowned` 单列无归属区域里的用户。可见范围仍然叠在上面，
      // 因此只有超级管理员真的取得到东西。具体某个区域用它的 id 筛。
      const regionFilter =
        req.query.region === 'unowned'
          ? isNull(region.ownerAdminId)
          : req.query.region && UUID.test(req.query.region)
            ? eq(users.regionId, req.query.region)
            : undefined;

      // count(profiles.id) 对没有个人页的账号得 0，正是想要的
      const rows = await app.db
        .select({
          ...publicColumns,
          regionName: region.name,
          regionOwnerAdminId: region.ownerAdminId,
          profileCount: count(profiles.id),
        })
        .from(users)
        .leftJoin(profiles, eq(profiles.userId, users.id))
        .leftJoin(region, eq(region.id, users.regionId))
        .where(and(eq(users.role, 'user'), scope, regionFilter))
        .groupBy(users.id, region.name, region.ownerAdminId)
        .orderBy(users.createdAt);
      return { users: rows };
    },
  );

  app.get<{ Params: { id: string } }>('/users/:id', async (req, reply) => {
    if (!req.currentUser) return unauthorized(reply);
    if (!UUID.test(req.params.id)) return forbidden(reply);

    const target = await loadTargetUser(app.db, req.currentUser, req.params.id, 'read');
    if (!target) return forbidden(reply);

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
      return fail(reply, 400, 'invalid_body', { issues: parsed.error.issues });
    }
    const { account, password, label, shortName, displayName } = parsed.data;

    // 指定了区域就必须是自己看得见的那些，否则等于借建号把人塞进别人的地盘。
    const targetRegionId = await resolveTargetRegion(app, req.currentUser!, parsed.data.regionId);
    if (targetRegionId === null) return fail(reply, 400, 'region_not_found');

    const conflict = await findUserConflict(app.db, { account, shortName });
    if (conflict) return fail(reply, 409, conflict);

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
          // 新账号继承创建者的界面语言：菲律宾管理员开的号天然是菲律宾语。
          uiLanguage: req.currentUser!.uiLanguage,
          // 归属管理员由区域推导，见 ADR-0017。
          regionId: targetRegionId,
        })
        .returning(publicColumns);

      const [profile] = await tx
        .insert(profiles)
        .values({
          userId: account_!.id,
          shortName,
          displayName: displayName || shortName,
          // 页面语言跟所有者的界面语言，所有者本人又刚继承了创建者的。
          pageLanguage: req.currentUser!.uiLanguage,
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
    if (!req.currentUser) return unauthorized(reply);
    if (!UUID.test(req.params.id)) return forbidden(reply);

    const parsed = updateUserBody.safeParse(req.body);
    if (!parsed.success) {
      return fail(reply, 400, 'invalid_body', { issues: parsed.error.issues });
    }

    // 这里只改账号字段。个人页地址归 `PATCH /profiles/:id/short-name` 管，
    // 它自带二次确认与变更流水，见 ADR-0010。
    const target = await loadTargetUser(app.db, req.currentUser, req.params.id, 'update');
    if (!target) return forbidden(reply);

    const [row] = await app.db
      .update(users)
      .set({
        ...(parsed.data.label !== undefined ? { label: parsed.data.label } : {}),
        ...(parsed.data.uiLanguage !== undefined ? { uiLanguage: parsed.data.uiLanguage } : {}),
        updatedAt: new Date(),
      })
      .where(eq(users.id, target.id))
      .returning(publicColumns);

    return row;
  });

  /** 管理员修改名下用户的登录用户名；本人自助走 /auth/account 并验证密码。 */
  app.put<{ Params: { id: string } }>('/users/:id/account', async (req, reply) => {
    if (!req.currentUser) return unauthorized(reply);
    if (!UUID.test(req.params.id)) return forbidden(reply);
    if (req.currentUser.role === 'user') return forbidden(reply);

    const parsed = updateAccountBody.safeParse(req.body);
    if (!parsed.success) {
      return fail(reply, 400, 'invalid_body', { issues: parsed.error.issues });
    }
    const target = await loadTargetUser(app.db, req.currentUser, req.params.id, 'update');
    if (!target || target.role !== 'user') return forbidden(reply);

    const renamed = await renameAccount(app.db, {
      userId: target.id,
      changedBy: req.currentUser.id,
      account: parsed.data.account,
    });
    if (renamed.status === 'account_taken') {
      return fail(reply, 409, 'account_taken');
    }
    if (renamed.status === 'changed') await deleteSessionsForUser(app.db, target.id);
    return { account: renamed.status === 'not_found' ? parsed.data.account : renamed.account };
  });

  /**
   * 把一个或多个用户移到另一个区域。
   *
   * 管理员也做得了，但两头都受限：源用户要在他名下（`loadTargetUser` 裁定），
   * 目标区域也要归属于他。「跨管理员移动只有超级管理员做得了」由此自然成立。
   *
   * 移区会改变历史报表的区域数字，见 ADR-0019。
   */
  app.put('/users/region', { onRequest: [requireCapability('user:move')] }, async (req, reply) => {
    const parsed = moveRegionBody.safeParse(req.body);
    if (!parsed.success) {
      return fail(reply, 400, 'invalid_body', { issues: parsed.error.issues });
    }

    const actor = req.currentUser!;
    const regionScope = visibleRegionsFilter(actor);
    const [region] = await app.db
      .select({ id: regions.id })
      .from(regions)
      .where(
        regionScope
          ? and(eq(regions.id, parsed.data.regionId), regionScope)
          : eq(regions.id, parsed.data.regionId),
      )
      .limit(1);
    if (!region) return fail(reply, 400, 'region_not_found');

    // 逐个过授权检查点。有一个碰不了就整批不动，避免搬了一半的中间态。
    const targets: string[] = [];
    for (const id of parsed.data.userIds) {
      const target = await loadTargetUser(app.db, actor, id, 'update');
      if (!target || target.role !== 'user') return forbidden(reply);
      targets.push(target.id);
    }

    await app.db
      .update(users)
      .set({ regionId: region.id, updatedAt: new Date() })
      .where(inArray(users.id, targets));

    return { moved: targets.length, regionId: region.id };
  });

  /**
   * 重置名下用户的密码。
   *
   * 与用户自助改密码（`POST /_api/auth/password`）是两条路：那条要验旧密码，
   * 这条是「他忘了密码，管理员立刻解决」，因此不验旧密码 —— 也正因为如此，
   * **只有管理员与超级管理员能调**，否则用户就能绕开旧密码校验改自己的。
   */
  app.put<{ Params: { id: string } }>('/users/:id/password', async (req, reply) => {
    if (!req.currentUser) return unauthorized(reply);
    if (!UUID.test(req.params.id)) return forbidden(reply);
    if (req.currentUser.role === 'user') return forbidden(reply);

    const parsed = resetPasswordBody.safeParse(req.body);
    if (!parsed.success) {
      return fail(reply, 400, 'invalid_body', { issues: parsed.error.issues });
    }

    const target = await loadTargetUser(app.db, req.currentUser, req.params.id, 'update');
    if (!target || target.role !== 'user') return forbidden(reply);

    await app.db
      .update(users)
      .set({ passwordHash: await hashPassword(parsed.data.newPassword), updatedAt: new Date() })
      .where(eq(users.id, target.id));

    // 改了密码就把他的既有会话全部踢掉，与自助改密码同一条规则
    await deleteSessionsForUser(app.db, target.id);

    return reply.code(204).send();
  });

  app.delete<{ Params: { id: string } }>('/users/:id', async (req, reply) => {
    if (!req.currentUser) return unauthorized(reply);
    if (!UUID.test(req.params.id)) return forbidden(reply);

    const target = await loadTargetUser(app.db, req.currentUser, req.params.id, 'delete');
    // 用户删不了自己
    if (!target || req.currentUser.role === 'user') return forbidden(reply);

    await deleteSessionsForUser(app.db, target.id);
    // 名下全部个人页的 short_name 迁入墓碑、媒体文件下架、埋点保留，见 16
    await deleteUserAccount(app.db, target.id);

    return reply.code(204).send();
  });
}

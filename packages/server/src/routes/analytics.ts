import {
  DEFAULT_DISPLAY_TIMEZONE,
  granularityFor,
  isValidTimeZone,
  presetRange,
  type RangePreset,
} from '@link-profile/shared';
import { profiles, users } from '@link-profile/shared/schema';
import { and, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { visibleUsersFilter } from '../auth/policy.js';
import type { CurrentUser } from '../auth/sessions.js';
import { UNAUTHORIZED } from '../auth/guards.js';
import {
  queryButtons,
  queryDimension,
  queryHourlyLeads,
  queryTrend,
  type QueryScope,
} from '../analytics/queries.js';
import { queryCrossBreakdowns } from '../analytics/cross-breakdowns.js';
import {
  queryScopePerformance,
  type VisibleAccount,
  type VisibleProfile,
} from '../analytics/scope-performance.js';

const querySchema = z
  .object({
    /** 汇总视图：某个账号名下全部个人页的合计 */
    userId: z.string().uuid().optional(),
    /** 单页视图：只看这一个个人页 */
    profileId: z.string().uuid().optional(),
    preset: z.enum(['today', '7d', '30d']).optional(),
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
    tz: z.string().optional(),
  })
  .refine((v) => !(v.userId && v.profileId), {
    message: 'userId 与 profileId 不能同时指定',
  });

export async function analyticsRoutes(app: FastifyInstance) {
  /**
   * 数据分析。
   *
   * 可见范围复用 04 建立的授权检查点：用户只看得到自己的，管理员只看得到
   * 名下的，超级管理员看得到全部 —— 这里不重新实现一遍过滤，而是把
   * `visibleUsersFilter` 的结果先解析成一组个人页 id 再往下查。
   */
  app.get('/analytics', async (req, reply) => {
    if (!req.currentUser) return reply.code(401).send(UNAUTHORIZED);

    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_query', issues: parsed.error.issues });
    }

    const timeZone = parsed.data.tz ?? DEFAULT_DISPLAY_TIMEZONE;
    if (!isValidTimeZone(timeZone)) {
      return reply.code(400).send({ error: 'invalid_timezone', timeZone });
    }

    const range = resolveRange(parsed.data, timeZone);
    if ('error' in range) return reply.code(400).send(range);

    const filter = {
      ...(parsed.data.userId ? { userId: parsed.data.userId } : {}),
      ...(parsed.data.profileId ? { profileId: parsed.data.profileId } : {}),
    };
    const [visibleProfiles, visibleAccounts] = await Promise.all([
      resolveVisibleProfiles(app, req.currentUser, filter),
      resolveVisibleAccounts(app, req.currentUser, filter),
    ]);
    // 指名道姓要看一个自己看不见的对象，与「它不存在」同一个响应
    if (
      (parsed.data.profileId && visibleProfiles.length === 0) ||
      (parsed.data.userId && visibleAccounts.length === 0)
    ) {
      return reply.code(403).send({ error: 'forbidden' });
    }

    const scope: QueryScope = {
      profileIds: visibleProfiles.map((profile) => profile.id),
      from: range.from,
      to: range.to,
      timeZone,
    };
    const granularity = granularityFor(range.from, range.to);

    const selectedProfile = parsed.data.profileId ? visibleProfiles[0] : undefined;
    const selectedAccount =
      parsed.data.userId || req.currentUser.role === 'user' ? visibleAccounts[0] : undefined;
    const scopeKind = selectedProfile ? 'profile' : selectedAccount ? 'account' : 'portfolio';
    const performance = await queryScopePerformance(
      app.sql,
      scope,
      visibleProfiles,
      visibleAccounts,
    );
    const totals = totalsFromAccounts(performance.accounts);

    // 账号列表只算账号行；账号汇总再加趋势；最重的多维细分只在单个个人页里查。
    // 这既让界面层级明确，也避免为了没有渲染的图表反复扫描埋点表。
    const trend = scopeKind === 'portfolio' ? [] : await queryTrend(app.sql, scope, granularity);
    const [
      hourlyLeads,
      buttons,
      countries,
      cities,
      devices,
      operatingSystems,
      sources,
      crossBreakdowns,
    ] =
      scopeKind === 'profile'
        ? await Promise.all([
            queryHourlyLeads(app.sql, scope),
            queryButtons(app.sql, scope, totals.pageViews),
            queryDimension(app.sql, scope, 'country'),
            queryDimension(app.sql, scope, 'city'),
            queryDimension(app.sql, scope, 'device_type'),
            queryDimension(app.sql, scope, 'os'),
            queryDimension(app.sql, scope, 'source'),
            queryCrossBreakdowns(app.sql, scope),
          ])
        : [
            Array.from({ length: 24 }, () => 0),
            [],
            [],
            [],
            [],
            [],
            [],
            { sources: [], countries: [], targets: [] },
          ];

    return {
      scope:
        scopeKind === 'profile'
          ? {
              kind: 'profile',
              profileId: selectedProfile!.id,
              userId: selectedProfile!.userId,
              shortName: selectedProfile!.shortName,
              displayName: selectedProfile!.displayName,
              account: selectedProfile!.account,
              label: selectedProfile!.userLabel,
            }
          : scopeKind === 'account'
            ? {
                kind: 'account',
                userId: selectedAccount!.id,
                account: selectedAccount!.account,
                label: selectedAccount!.label,
              }
            : { kind: 'portfolio' },
      range: {
        from: range.from.toISOString(),
        to: range.to.toISOString(),
        timeZone,
        granularity,
      },
      totals,
      trend,
      hourlyLeads,
      buttons,
      dimensions: { countries, cities, devices, operatingSystems, sources },
      crossBreakdowns,
      performance,
    };
  });
}

function totalsFromAccounts(accounts: { pageViews: number; clicks: number; leads: number }[]) {
  const totals = accounts.reduce(
    (sum, row) => ({
      pageViews: sum.pageViews + row.pageViews,
      clicks: sum.clicks + row.clicks,
      leads: sum.leads + row.leads,
    }),
    { pageViews: 0, clicks: 0, leads: 0 },
  );
  return {
    ...totals,
    ctr: totals.pageViews === 0 ? 0 : totals.clicks / totals.pageViews,
  };
}

type ResolvedRange = { from: Date; to: Date } | { error: string };

function resolveRange(
  query: { preset?: RangePreset; from?: string; to?: string },
  timeZone: string,
): ResolvedRange {
  if (query.from && query.to) {
    const from = new Date(query.from);
    const to = new Date(query.to);
    if (to <= from) return { error: 'invalid_range' };
    return { from, to };
  }
  if (query.from || query.to) return { error: 'invalid_range' };

  // 预设区间以所选展示时区的「今天」为基准，不是服务器时区的
  return presetRange(query.preset ?? '7d', timeZone);
}

/**
 * 把可见范围解析成一组个人页 id。
 *
 * 三级角色的可见范围仍然由 `visibleUsersFilter` 一处说了算，这里只是在它
 * 外面多 join 一层 `profiles`，绝不重新实现一遍过滤 —— 漏一处就是越权。
 *
 * 三种形态：
 * - 都不给：可见范围内全部账号的全部个人页（用户自己即「我的全部页面汇总」）
 * - 给 userId：窄到这一个账号名下的全部个人页
 * - 给 profileId：窄到这一个个人页
 *
 * 管理员名下没人时得到空数组，查询直接给零值。
 */
async function resolveVisibleProfiles(
  app: FastifyInstance,
  actor: CurrentUser,
  filter: { userId?: string; profileId?: string },
): Promise<VisibleProfile[]> {
  const scope = visibleUsersFilter(actor);
  const conditions = [eq(users.role, 'user' as const)];
  if (scope) conditions.push(scope);
  if (filter.userId) conditions.push(eq(profiles.userId, filter.userId));
  if (filter.profileId) conditions.push(eq(profiles.id, filter.profileId));

  const rows = await app.db
    .select({
      id: profiles.id,
      userId: profiles.userId,
      shortName: profiles.shortName,
      displayName: profiles.displayName,
      account: users.account,
      userLabel: users.label,
    })
    .from(profiles)
    .innerJoin(users, eq(users.id, profiles.userId))
    .where(and(...conditions));

  return rows;
}

async function resolveVisibleAccounts(
  app: FastifyInstance,
  actor: CurrentUser,
  filter: { userId?: string; profileId?: string },
): Promise<VisibleAccount[]> {
  const scope = visibleUsersFilter(actor);
  const conditions = [eq(users.role, 'user' as const)];
  if (scope) conditions.push(scope);
  if (filter.userId) conditions.push(eq(users.id, filter.userId));
  if (filter.profileId) conditions.push(eq(profiles.id, filter.profileId));

  const selection = { id: users.id, account: users.account, label: users.label };
  if (filter.profileId) {
    return app.db
      .selectDistinct(selection)
      .from(users)
      .innerJoin(profiles, eq(profiles.userId, users.id))
      .where(and(...conditions));
  }

  return app.db
    .select(selection)
    .from(users)
    .where(and(...conditions));
}

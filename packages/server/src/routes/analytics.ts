import {
  DEFAULT_DISPLAY_TIMEZONE,
  granularityFor,
  isValidTimeZone,
  presetRange,
  type RangePreset,
} from '@link-profile/shared';
import { profiles, regions, users } from '@link-profile/shared/schema';
import { alias } from 'drizzle-orm/pg-core';
import { and, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { visibleRegionsFilter, visibleUsersFilter } from '../auth/policy.js';
import type { CurrentUser } from '../auth/sessions.js';
import {
  queryButtons,
  queryDimension,
  queryHourlyLeads,
  queryTrend,
  type QueryScope,
} from '../analytics/queries.js';
import { queryCrossBreakdowns } from '../analytics/cross-breakdowns.js';
import { queryCountryDaily } from '../analytics/country-daily.js';
import { queryActivityHeatmap, queryProfileHighlights } from '../analytics/overview.js';
import {
  foldAccountsIntoRegions,
  queryScopePerformance,
  type VisibleAccount,
  type VisibleProfile,
} from '../analytics/scope-performance.js';
import { fail, unauthorized } from '../http/errors.js';

const querySchema = z
  .object({
    /** 最外层筛选：只看这个区域里的用户 */
    regionId: z.string().uuid().optional(),
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
    message: 'query.exclusiveScope',
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
    if (!req.currentUser) return unauthorized(reply);

    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) {
      return fail(reply, 400, 'invalid_query', { issues: parsed.error.issues });
    }

    const timeZone = parsed.data.tz ?? DEFAULT_DISPLAY_TIMEZONE;
    if (!isValidTimeZone(timeZone)) {
      return fail(reply, 400, 'invalid_timezone', { timeZone });
    }

    const range = resolveRange(parsed.data, timeZone);
    if ('error' in range) return reply.code(400).send(range);

    const filter = {
      ...(parsed.data.regionId ? { regionId: parsed.data.regionId } : {}),
      ...(parsed.data.userId ? { userId: parsed.data.userId } : {}),
      ...(parsed.data.profileId ? { profileId: parsed.data.profileId } : {}),
    };
    const [visibleProfiles, visibleAccounts, visibleRegions] = await Promise.all([
      resolveVisibleProfiles(app, req.currentUser, filter),
      resolveVisibleAccounts(app, req.currentUser, filter),
      resolveVisibleRegions(app, req.currentUser),
    ]);
    // 指名道姓要看一个自己看不见的对象，与「它不存在」同一个响应
    const selectedRegion = parsed.data.regionId
      ? visibleRegions.find((region) => region.id === parsed.data.regionId)
      : undefined;
    if (
      (parsed.data.profileId && visibleProfiles.length === 0) ||
      (parsed.data.userId && visibleAccounts.length === 0) ||
      (parsed.data.regionId && !selectedRegion)
    ) {
      return fail(reply, 403, 'forbidden');
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
    const scopeKind = selectedProfile
      ? 'profile'
      : selectedAccount
        ? 'account'
        : selectedRegion
          ? 'region'
          : 'portfolio';
    const duration = range.to.getTime() - range.from.getTime();
    const previousScope: QueryScope = {
      ...scope,
      from: new Date(range.from.getTime() - duration),
      to: range.from,
    };
    const [performance, previousPerformance] = await Promise.all([
      queryScopePerformance(app.sql, scope, visibleProfiles, visibleAccounts),
      queryScopePerformance(app.sql, previousScope, visibleProfiles, visibleAccounts),
    ]);
    const totals = totalsFromAccounts(performance.accounts);
    const previousTotals = totalsFromAccounts(previousPerformance.accounts);

    // 所有层级都提供同口径的总指标与趋势。最重的多维细分仍只在单个个人页里查，
    // 因而总览能直接回答整体表现，也不会为了未渲染的细分反复扫描埋点表。
    const [
      trend,
      hourlyLeads,
      buttons,
      cities,
      devices,
      operatingSystems,
      crossBreakdowns,
      countryDaily,
      activityHeatmap,
      profileHighlights,
    ] = await Promise.all([
      queryTrend(app.sql, scope, granularity),
      queryHourlyLeads(app.sql, scope),
      scopeKind === 'profile'
        ? queryButtons(app.sql, scope, totals.pageViews)
        : Promise.resolve([]),
      scopeKind === 'profile' ? queryDimension(app.sql, scope, 'city') : Promise.resolve([]),
      queryDimension(app.sql, scope, 'device_type'),
      queryDimension(app.sql, scope, 'os'),
      queryCrossBreakdowns(app.sql, scope),
      queryCountryDaily(app.sql, scope),
      queryActivityHeatmap(app.sql, scope),
      queryProfileHighlights(app.sql, scope),
    ]);
    const countries = crossBreakdowns.countries.map(({ key, pageViews, clicks, leads }) => ({
      key,
      pageViews,
      clicks,
      leads,
    }));
    const sources = crossBreakdowns.sources.map(({ key, pageViews, clicks, leads }) => ({
      key,
      pageViews,
      clicks,
      leads,
    }));

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
            : selectedRegion
              ? { kind: 'region', regionId: selectedRegion.id, regionName: selectedRegion.name }
              : { kind: 'portfolio' },
      range: {
        from: range.from.toISOString(),
        to: range.to.toISOString(),
        timeZone,
        granularity,
      },
      comparison: {
        range: {
          from: previousScope.from.toISOString(),
          to: previousScope.to.toISOString(),
        },
        totals: previousTotals,
        profiles: previousPerformance.profiles,
      },
      totals,
      trend,
      hourlyLeads,
      buttons,
      dimensions: { countries, cities, devices, operatingSystems, sources },
      crossBreakdowns,
      countryDaily,
      activityHeatmap,
      profileHighlights,
      performance: {
        ...performance,
        // 折叠而不是另查：区域指标恒等于其中全部账号之和，见 ADR-0015。
        regions: foldAccountsIntoRegions(performance.accounts),
      },
      regions: visibleRegions,
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
  filter: { regionId?: string; userId?: string; profileId?: string },
): Promise<VisibleProfile[]> {
  const scope = visibleUsersFilter(actor);
  const conditions = [eq(users.role, 'user' as const)];
  if (scope) conditions.push(scope);
  if (filter.regionId) conditions.push(eq(users.regionId, filter.regionId));
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
  filter: { regionId?: string; userId?: string; profileId?: string },
): Promise<VisibleAccount[]> {
  const scope = visibleUsersFilter(actor);
  const conditions = [eq(users.role, 'user' as const)];
  if (scope) conditions.push(scope);
  if (filter.regionId) conditions.push(eq(users.regionId, filter.regionId));
  if (filter.userId) conditions.push(eq(users.id, filter.userId));
  if (filter.profileId) conditions.push(eq(profiles.id, filter.profileId));

  // 区域名一并取出来，路由折叠区域行时不必再查一次。
  const region = alias(regions, 'account_region');
  const selection = {
    id: users.id,
    account: users.account,
    label: users.label,
    regionId: users.regionId,
    regionName: region.name,
  };
  if (filter.profileId) {
    return app.db
      .selectDistinct(selection)
      .from(users)
      .leftJoin(region, eq(region.id, users.regionId))
      .innerJoin(profiles, eq(profiles.userId, users.id))
      .where(and(...conditions));
  }

  return app.db
    .select(selection)
    .from(users)
    .leftJoin(region, eq(region.id, users.regionId))
    .where(and(...conditions));
}

/** 区域筛选器的可选项。与用户可见范围同源，见 ADR-0017。 */
async function resolveVisibleRegions(
  app: FastifyInstance,
  actor: CurrentUser,
): Promise<{ id: string; name: string }[]> {
  // 用户角色没有区域概念，筛选器整个不给。
  if (actor.role === 'user') return [];

  const scope = visibleRegionsFilter(actor);
  return app.db
    .select({ id: regions.id, name: regions.name })
    .from(regions)
    .where(scope)
    .orderBy(regions.createdAt);
}

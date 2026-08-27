import {
  DEFAULT_DISPLAY_TIMEZONE,
  granularityFor,
  isValidTimeZone,
  presetRange,
  type RangePreset,
} from '@link-profile/shared';
import { users } from '@link-profile/shared/schema';
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
  queryTotals,
  queryTrend,
  type QueryScope,
} from '../analytics/queries.js';

const querySchema = z.object({
  /** 只看某一个用户。不给就看可见范围内的全部。 */
  userId: z.string().uuid().optional(),
  preset: z.enum(['today', '7d', '30d']).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  tz: z.string().optional(),
});

export async function analyticsRoutes(app: FastifyInstance) {
  /**
   * 数据分析。
   *
   * 可见范围复用 04 建立的授权检查点：用户只看得到自己的，管理员只看得到
   * 名下的，超级管理员看得到全部 —— 这里不重新实现一遍过滤，而是把
   * `visibleUsersFilter` 的结果先解析成一组 userId 再往下查。
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

    const userIds = await resolveVisibleUserIds(app, req.currentUser, parsed.data.userId);
    // 指名道姓要看一个自己看不见的用户，与「这个用户不存在」同一个响应
    if (parsed.data.userId && userIds.length === 0) {
      return reply.code(403).send({ error: 'forbidden' });
    }

    const scope: QueryScope = { userIds, from: range.from, to: range.to, timeZone };
    const granularity = granularityFor(range.from, range.to);

    const totals = await queryTotals(app.sql, scope);
    const [trend, hourlyLeads, buttons, countries, cities, devices, operatingSystems, sources] =
      await Promise.all([
        queryTrend(app.sql, scope, granularity),
        queryHourlyLeads(app.sql, scope),
        queryButtons(app.sql, scope, totals.pageViews),
        queryDimension(app.sql, scope, 'country'),
        queryDimension(app.sql, scope, 'city'),
        queryDimension(app.sql, scope, 'device_type'),
        queryDimension(app.sql, scope, 'os'),
        queryDimension(app.sql, scope, 'source'),
      ]);

    return {
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
    };
  });
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

/** 把可见范围解析成一组 userId。管理员名下没人时得到空数组，查询直接给零值。 */
async function resolveVisibleUserIds(
  app: FastifyInstance,
  actor: CurrentUser,
  onlyUserId: string | undefined,
): Promise<string[]> {
  const scope = visibleUsersFilter(actor);
  const conditions = [eq(users.role, 'user' as const)];
  if (scope) conditions.push(scope);
  if (onlyUserId) conditions.push(eq(users.id, onlyUserId));

  const rows = await app.db
    .select({ id: users.id })
    .from(users)
    .where(and(...conditions));

  return rows.map((r) => r.id);
}

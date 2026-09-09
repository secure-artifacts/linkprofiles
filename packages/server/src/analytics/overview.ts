import type { Sql } from 'postgres';
import type { QueryScope } from './queries.js';

export interface ActivityHeatmapPoint {
  /** ISO weekday: 1 = Monday, 7 = Sunday. */
  day: number;
  hour: number;
  pageViews: number;
  leads: number;
}

export interface ProfileHighlightMetric {
  key: string;
  pageViews: number;
  leads: number;
}

export interface ProfileHighlightTarget {
  id: string;
  /** 条目已被删除时为 null，占位文案由前端按界面语言渲染。 */
  title: string | null;
  platform: string;
  leads: number;
}

export interface ProfileHighlight {
  profileId: string;
  topSource: ProfileHighlightMetric | null;
  topCountry: ProfileHighlightMetric | null;
  topTarget: ProfileHighlightTarget | null;
}

type HighlightMetricRow = {
  profile_id: string;
  key: string;
  page_views: number;
  leads: number;
};

type HighlightTargetRow = {
  profile_id: string;
  id: string;
  /** 条目已被删除时为 null，占位文案由前端按界面语言渲染。 */
  title: string | null;
  platform: string;
  leads: number;
};

/**
 * 星期 × 小时只使用仍保留精确时间的明细事件。永久日汇总已经失去小时信息，
 * 不能伪造到某一个时段；界面会明确说明这个口径。
 */
export async function queryActivityHeatmap(
  sql: Sql,
  scope: QueryScope,
): Promise<ActivityHeatmapPoint[]> {
  if (scope.profileIds.length === 0) return [];

  const rows = await sql<{ day: number; hour: number; page_views: number; leads: number }[]>`
    with events as (
      select
        extract(isodow from occurred_at at time zone ${scope.timeZone})::int as day,
        extract(hour from occurred_at at time zone ${scope.timeZone})::int as hour,
        1 as page_views,
        0 as leads
      from page_views
      where profile_id = any(${scope.profileIds}::uuid[])
        and occurred_at >= ${scope.from.toISOString()}::timestamptz
        and occurred_at < ${scope.to.toISOString()}::timestamptz
      union all
      select
        extract(isodow from occurred_at at time zone ${scope.timeZone})::int,
        extract(hour from occurred_at at time zone ${scope.timeZone})::int,
        0,
        1
      from clicks
      where is_lead
        and profile_id = any(${scope.profileIds}::uuid[])
        and occurred_at >= ${scope.from.toISOString()}::timestamptz
        and occurred_at < ${scope.to.toISOString()}::timestamptz
    )
    select day, hour, sum(page_views)::int as page_views, sum(leads)::int as leads
    from events
    group by day, hour
    order by day, hour
  `;

  return rows.map((row) => ({
    day: row.day,
    hour: row.hour,
    pageViews: row.page_views,
    leads: row.leads,
  }));
}

/**
 * 排行榜补充每个个人页的第一来源、第一国家和第一联系方式。三组查询按个人页
 * 一次聚合，避免在界面逐行请求造成 N+1。
 */
export async function queryProfileHighlights(
  sql: Sql,
  scope: QueryScope,
): Promise<ProfileHighlight[]> {
  if (scope.profileIds.length === 0) return [];

  const [sources, countries, targets] = await Promise.all([
    queryTopDimension(sql, scope, 'source'),
    queryTopDimension(sql, scope, 'country'),
    queryTopTargets(sql, scope),
  ]);
  const sourceByProfile = new Map(sources.map((row) => [row.profile_id, row]));
  const countryByProfile = new Map(countries.map((row) => [row.profile_id, row]));
  const targetByProfile = new Map(targets.map((row) => [row.profile_id, row]));

  return scope.profileIds.map((profileId) => {
    const source = sourceByProfile.get(profileId);
    const country = countryByProfile.get(profileId);
    const target = targetByProfile.get(profileId);
    return {
      profileId,
      topSource: source
        ? { key: source.key, pageViews: source.page_views, leads: source.leads }
        : null,
      topCountry: country
        ? { key: country.key, pageViews: country.page_views, leads: country.leads }
        : null,
      topTarget: target
        ? {
            id: target.id,
            title: target.title,
            platform: target.platform,
            leads: target.leads,
          }
        : null,
    };
  });
}

async function queryTopDimension(
  sql: Sql,
  scope: QueryScope,
  dimension: 'source' | 'country',
): Promise<HighlightMetricRow[]> {
  const column = sql(dimension);
  return sql<HighlightMetricRow[]>`
    with events as (
      select profile_id, coalesce(${column}::text, '') as key, 1 as page_views, 0 as leads
      from page_views
      where profile_id = any(${scope.profileIds}::uuid[])
        and occurred_at >= ${scope.from.toISOString()}::timestamptz
        and occurred_at < ${scope.to.toISOString()}::timestamptz
      union all
      select profile_id, coalesce(${column}::text, ''), 0,
        case when is_lead then 1 else 0 end
      from clicks
      where profile_id = any(${scope.profileIds}::uuid[])
        and occurred_at >= ${scope.from.toISOString()}::timestamptz
        and occurred_at < ${scope.to.toISOString()}::timestamptz
      union all
      select profile_id, coalesce(${column}::text, ''), page_views, leads
      from daily_summaries
      where profile_id = any(${scope.profileIds}::uuid[])
        and day >= (${scope.from.toISOString()}::timestamptz at time zone ${scope.timeZone})::date
        and day <= (${scope.to.toISOString()}::timestamptz at time zone ${scope.timeZone})::date
    ), totals as (
      select profile_id, key, sum(page_views)::int as page_views, sum(leads)::int as leads
      from events
      group by profile_id, key
    )
    select distinct on (profile_id) profile_id, key, page_views, leads
    from totals
    order by profile_id, page_views desc, leads desc, key
  `;
}

async function queryTopTargets(sql: Sql, scope: QueryScope): Promise<HighlightTargetRow[]> {
  return sql<HighlightTargetRow[]>`
    with totals as (
      select
        c.profile_id,
        c.target_id::text as id,
        b.title as title,
        coalesce(b.platform, case when b.kind = 'link' then 'custom' else 'unknown' end, 'unknown') as platform,
        count(*)::int as leads
      from clicks c
      left join buttons b on b.id = c.target_id
      where c.is_lead
        and c.profile_id = any(${scope.profileIds}::uuid[])
        and c.occurred_at >= ${scope.from.toISOString()}::timestamptz
        and c.occurred_at < ${scope.to.toISOString()}::timestamptz
      group by c.profile_id, c.target_id, b.title, b.platform, b.kind
    )
    select distinct on (profile_id) profile_id, id, title, platform, leads
    from totals
    order by profile_id, leads desc, title
  `;
}

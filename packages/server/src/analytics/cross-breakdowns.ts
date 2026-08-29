import type { Sql } from 'postgres';
import type { QueryScope } from './queries.js';

export interface CrossMetrics {
  pageViews: number;
  clicks: number;
  leads: number;
  clickRate: number;
  leadRate: number;
}

export interface TargetBreakdown {
  id: string;
  title: string;
  platform: string;
  isLead: boolean;
  clicks: number;
  leads: number;
}

export interface SourceBreakdown extends CrossMetrics {
  key: string;
  targets: TargetBreakdown[];
}

export interface CountrySourceBreakdown extends CrossMetrics {
  key: string;
  targets: TargetBreakdown[];
}

export interface CountryBreakdown extends CrossMetrics {
  key: string;
  sources: CountrySourceBreakdown[];
}

export interface CrossBreakdowns {
  sources: SourceBreakdown[];
  countries: CountryBreakdown[];
  targets: (TargetBreakdown & { sources: { key: string; clicks: number; leads: number }[] })[];
}

type MetricRow = {
  country?: string;
  source: string;
  page_views: number;
  clicks: number;
  leads: number;
};

type TargetRow = {
  country: string;
  source: string;
  id: string;
  title: string;
  platform: string;
  is_lead: boolean;
  clicks: number;
  leads: number;
};

const ratio = (value: number, pageViews: number) => (pageViews === 0 ? 0 : value / pageViews);

function metrics(row: Pick<MetricRow, 'page_views' | 'clicks' | 'leads'>): CrossMetrics {
  return {
    pageViews: row.page_views,
    clicks: row.clicks,
    leads: row.leads,
    clickRate: ratio(row.clicks, row.page_views),
    leadRate: ratio(row.leads, row.page_views),
  };
}

/**
 * 来源、国家与联系方式的交叉分析。
 *
 * 外部只有这一个 interface；明细与永久日汇总如何合并、目标被删除后如何命名、
 * 以及三种视角之间如何复用同一批点击行，都藏在 module 内部。
 */
export async function queryCrossBreakdowns(sql: Sql, scope: QueryScope): Promise<CrossBreakdowns> {
  if (scope.profileIds.length === 0) return { sources: [], countries: [], targets: [] };

  const [sourceRows, countrySourceRows, targetRows] = await Promise.all([
    querySourceMetrics(sql, scope),
    queryCountrySourceMetrics(sql, scope),
    queryTargetDetails(sql, scope),
  ]);

  const sourceTargets = groupTargets(targetRows, (row) => row.source);
  const countrySourceTargets = groupTargets(
    targetRows,
    (row) => `${row.country}\u0000${row.source}`,
  );

  const sources = sourceRows.map((row) => ({
    key: row.source,
    ...metrics(row),
    targets: sourceTargets.get(row.source) ?? [],
  }));

  const countriesByKey = new Map<string, CountryBreakdown>();
  for (const row of countrySourceRows) {
    const country = row.country ?? '';
    const source: CountrySourceBreakdown = {
      key: row.source,
      ...metrics(row),
      targets: countrySourceTargets.get(`${country}\u0000${row.source}`) ?? [],
    };
    const existing = countriesByKey.get(country);
    if (existing) {
      existing.pageViews += source.pageViews;
      existing.clicks += source.clicks;
      existing.leads += source.leads;
      existing.sources.push(source);
    } else {
      countriesByKey.set(country, {
        key: country,
        pageViews: source.pageViews,
        clicks: source.clicks,
        leads: source.leads,
        clickRate: 0,
        leadRate: 0,
        sources: [source],
      });
    }
  }
  const countries = [...countriesByKey.values()]
    .map((country) => ({
      ...country,
      clickRate: ratio(country.clicks, country.pageViews),
      leadRate: ratio(country.leads, country.pageViews),
      sources: country.sources.sort((a, b) => b.pageViews - a.pageViews || b.leads - a.leads),
    }))
    .sort((a, b) => b.pageViews - a.pageViews || b.leads - a.leads);

  const targetsById = new Map<
    string,
    TargetBreakdown & { sources: { key: string; clicks: number; leads: number }[] }
  >();
  for (const row of targetRows) {
    const target = targetsById.get(row.id) ?? {
      id: row.id,
      title: row.title,
      platform: row.platform,
      isLead: row.is_lead,
      clicks: 0,
      leads: 0,
      sources: [],
    };
    target.clicks += row.clicks;
    target.leads += row.leads;
    const source = target.sources.find((item) => item.key === row.source);
    if (source) {
      source.clicks += row.clicks;
      source.leads += row.leads;
    } else {
      target.sources.push({ key: row.source, clicks: row.clicks, leads: row.leads });
    }
    targetsById.set(row.id, target);
  }

  const targets = [...targetsById.values()]
    .map((target) => ({
      ...target,
      sources: target.sources.sort((a, b) => b.clicks - a.clicks),
    }))
    .sort((a, b) => b.clicks - a.clicks);

  return { sources, countries, targets };
}

async function querySourceMetrics(sql: Sql, scope: QueryScope): Promise<MetricRow[]> {
  return sql<MetricRow[]>`
    with events as (
      select coalesce(source, '') as source, 1 as page_views, 0 as clicks, 0 as leads
      from page_views
      where profile_id = any(${scope.profileIds}::uuid[])
        and occurred_at >= ${scope.from.toISOString()}::timestamptz
        and occurred_at < ${scope.to.toISOString()}::timestamptz
      union all
      select coalesce(source, ''), 0, 1, case when is_lead then 1 else 0 end
      from clicks
      where profile_id = any(${scope.profileIds}::uuid[])
        and occurred_at >= ${scope.from.toISOString()}::timestamptz
        and occurred_at < ${scope.to.toISOString()}::timestamptz
      union all
      select source, page_views, clicks, leads
      from daily_summaries
      where profile_id = any(${scope.profileIds}::uuid[])
        and day >= (${scope.from.toISOString()}::timestamptz at time zone ${scope.timeZone})::date
        and day <= (${scope.to.toISOString()}::timestamptz at time zone ${scope.timeZone})::date
    )
    select source, sum(page_views)::int as page_views, sum(clicks)::int as clicks,
      sum(leads)::int as leads
    from events
    group by source
    order by sum(page_views) desc, sum(leads) desc, source
  `;
}

async function queryCountrySourceMetrics(sql: Sql, scope: QueryScope): Promise<MetricRow[]> {
  return sql<MetricRow[]>`
    with events as (
      select coalesce(country, '') as country, coalesce(source, '') as source,
        1 as page_views, 0 as clicks, 0 as leads
      from page_views
      where profile_id = any(${scope.profileIds}::uuid[])
        and occurred_at >= ${scope.from.toISOString()}::timestamptz
        and occurred_at < ${scope.to.toISOString()}::timestamptz
      union all
      select coalesce(country, ''), coalesce(source, ''),
        0, 1, case when is_lead then 1 else 0 end
      from clicks
      where profile_id = any(${scope.profileIds}::uuid[])
        and occurred_at >= ${scope.from.toISOString()}::timestamptz
        and occurred_at < ${scope.to.toISOString()}::timestamptz
      union all
      select country, source, page_views, clicks, leads
      from daily_summaries
      where profile_id = any(${scope.profileIds}::uuid[])
        and day >= (${scope.from.toISOString()}::timestamptz at time zone ${scope.timeZone})::date
        and day <= (${scope.to.toISOString()}::timestamptz at time zone ${scope.timeZone})::date
    )
    select country, source, sum(page_views)::int as page_views, sum(clicks)::int as clicks,
      sum(leads)::int as leads
    from events
    group by country, source
    order by sum(page_views) desc, sum(leads) desc, country, source
  `;
}

async function queryTargetDetails(sql: Sql, scope: QueryScope): Promise<TargetRow[]> {
  return sql<TargetRow[]>`
    select
      coalesce(c.country, '') as country,
      coalesce(c.source, '') as source,
      c.target_id::text as id,
      coalesce(b.title, '已删除条目') as title,
      coalesce(b.platform, case when b.kind = 'link' then 'custom' else 'unknown' end, 'unknown') as platform,
      bool_or(c.is_lead) as is_lead,
      count(*)::int as clicks,
      count(*) filter (where c.is_lead)::int as leads
    from clicks c
    left join buttons b on b.id = c.target_id
    where c.profile_id = any(${scope.profileIds}::uuid[])
      and c.occurred_at >= ${scope.from.toISOString()}::timestamptz
      and c.occurred_at < ${scope.to.toISOString()}::timestamptz
    group by c.country, c.source, c.target_id, b.title, b.platform, b.kind
    order by count(*) desc
  `;
}

function groupTargets(
  rows: TargetRow[],
  keyOf: (row: TargetRow) => string,
): Map<string, TargetBreakdown[]> {
  const grouped = new Map<string, Map<string, TargetBreakdown>>();
  for (const row of rows) {
    const key = keyOf(row);
    const bucket = grouped.get(key) ?? new Map<string, TargetBreakdown>();
    const target = bucket.get(row.id) ?? {
      id: row.id,
      title: row.title,
      platform: row.platform,
      isLead: row.is_lead,
      clicks: 0,
      leads: 0,
    };
    target.clicks += row.clicks;
    target.leads += row.leads;
    bucket.set(row.id, target);
    grouped.set(key, bucket);
  }
  return new Map(
    [...grouped].map(([key, bucket]) => [
      key,
      [...bucket.values()].sort((a, b) => b.clicks - a.clicks),
    ]),
  );
}

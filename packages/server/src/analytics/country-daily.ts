import type { Sql } from 'postgres';
import type { QueryScope } from './queries.js';

export interface CountryDailyPlatform {
  key: string;
  clicks: number;
  leads: number;
}

export interface CountryDailyBreakdown {
  day: string;
  country: string;
  pageViews: number;
  clicks: number;
  leads: number;
  platforms: CountryDailyPlatform[];
}

type MetricRow = {
  day: string;
  country: string;
  page_views: number;
  clicks: number;
  leads: number;
};

type PlatformRow = {
  day: string;
  country: string;
  platform: string;
  clicks: number;
  leads: number;
};

/**
 * 全球国家日报。
 *
 * 国家总数与打开/点击指标同时合并明细表和永久日汇总；联系方式平台需要目标
 * 条目才能识别，因此保留期外已经只有日汇总的数据归到「其他」。这样总数不会
 * 因为明细清理而变小，也不会把无法证明的平台硬猜成 WhatsApp 或 Messenger。
 */
export async function queryCountryDaily(
  sql: Sql,
  scope: QueryScope,
): Promise<CountryDailyBreakdown[]> {
  if (scope.profileIds.length === 0) return [];

  const [metricRows, platformRows] = await Promise.all([
    queryCountryDayMetrics(sql, scope),
    queryCountryDayPlatforms(sql, scope),
  ]);
  const platformsByBucket = new Map<string, CountryDailyPlatform[]>();
  for (const row of platformRows) {
    const bucket = `${row.day}\u0000${row.country}`;
    const platforms = platformsByBucket.get(bucket) ?? [];
    platforms.push({ key: row.platform, clicks: row.clicks, leads: row.leads });
    platformsByBucket.set(bucket, platforms);
  }

  return metricRows.map((row) => {
    const bucket = `${row.day}\u0000${row.country}`;
    const platforms = platformsByBucket.get(bucket) ?? [];
    const knownClicks = platforms.reduce((sum, platform) => sum + platform.clicks, 0);
    const knownLeads = platforms.reduce((sum, platform) => sum + platform.leads, 0);
    if (row.clicks > knownClicks || row.leads > knownLeads) {
      platforms.push({
        key: 'unknown',
        clicks: Math.max(0, row.clicks - knownClicks),
        leads: Math.max(0, row.leads - knownLeads),
      });
    }
    return {
      day: row.day,
      country: row.country,
      pageViews: row.page_views,
      clicks: row.clicks,
      leads: row.leads,
      platforms: platforms.sort((a, b) => b.clicks - a.clicks || a.key.localeCompare(b.key)),
    };
  });
}

async function queryCountryDayMetrics(sql: Sql, scope: QueryScope): Promise<MetricRow[]> {
  return sql<MetricRow[]>`
    with events as (
      select to_char(occurred_at at time zone ${scope.timeZone}, 'YYYY-MM-DD') as day,
        coalesce(country, '') as country, 1 as page_views, 0 as clicks, 0 as leads
      from page_views
      where profile_id = any(${scope.profileIds}::uuid[])
        and occurred_at >= ${scope.from.toISOString()}::timestamptz
        and occurred_at < ${scope.to.toISOString()}::timestamptz
      union all
      select to_char(occurred_at at time zone ${scope.timeZone}, 'YYYY-MM-DD'),
        coalesce(country, ''), 0, 1, case when is_lead then 1 else 0 end
      from clicks
      where profile_id = any(${scope.profileIds}::uuid[])
        and occurred_at >= ${scope.from.toISOString()}::timestamptz
        and occurred_at < ${scope.to.toISOString()}::timestamptz
      union all
      select day::text, country, page_views, clicks, leads
      from daily_summaries
      where profile_id = any(${scope.profileIds}::uuid[])
        and day >= (${scope.from.toISOString()}::timestamptz at time zone ${scope.timeZone})::date
        and day <= (${scope.to.toISOString()}::timestamptz at time zone ${scope.timeZone})::date
    )
    select day, country, sum(page_views)::int as page_views, sum(clicks)::int as clicks,
      sum(leads)::int as leads
    from events
    group by day, country
    order by day, sum(page_views) desc, country
  `;
}

async function queryCountryDayPlatforms(sql: Sql, scope: QueryScope): Promise<PlatformRow[]> {
  return sql<PlatformRow[]>`
    select
      to_char(c.occurred_at at time zone ${scope.timeZone}, 'YYYY-MM-DD') as day,
      coalesce(c.country, '') as country,
      coalesce(
        b.platform,
        case when b.kind = 'link' then 'custom' else 'unknown' end,
        'unknown'
      ) as platform,
      count(*)::int as clicks,
      count(*) filter (where c.is_lead)::int as leads
    from clicks c
    left join buttons b on b.id = c.target_id
    where c.profile_id = any(${scope.profileIds}::uuid[])
      and c.occurred_at >= ${scope.from.toISOString()}::timestamptz
      and c.occurred_at < ${scope.to.toISOString()}::timestamptz
    group by 1, 2, 3
    order by 1, 2, count(*) desc, 3
  `;
}

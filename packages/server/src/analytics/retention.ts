import { DETAIL_RETENTION_DAYS } from '@link-profile/shared/schema';
import type { Sql } from 'postgres';

export interface AggregationResult {
  /** 聚合进日汇总的桶数 */
  buckets: number;
  deletedPageViews: number;
  deletedClicks: number;
  /** 这次处理的截止时刻，早于它的明细已经不在了 */
  cutoff: Date;
}

/**
 * 把超过保留期的明细聚合进日汇总，然后删掉明细。
 *
 * 整件事在一个事务里做完，且**可重复执行**：
 * - 聚合走 `on conflict do update`，把增量加到已有的桶上而不是新插一行；
 * - 聚合与删除同一个事务，因此不会出现「加过一遍但没删掉」的状态，
 *   重跑也就不会把同一批明细算第二次。
 *
 * 用原生 SQL 而不是先查出来再在 Node 里分组：半年的明细可能是几百万行，
 * 没有理由把它们搬进内存。
 */
export async function aggregateAndPrune(
  sql: Sql,
  now = new Date(),
  retentionDays = DETAIL_RETENTION_DAYS,
): Promise<AggregationResult> {
  const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);

  // 显式传 ISO 串并在 SQL 里转型：参数出现在 CTE 里，驱动推不出它的类型。
  const cutoffIso = cutoff.toISOString();

  return sql.begin(async (tx) => {
    // 页面浏览与点击各自按「用户 × UTC 日 × 维度」收拢，再合并成同一批桶。
    const upserted = await tx`
      with page_buckets as (
        select
          profile_id,
          (occurred_at at time zone 'UTC')::date as day,
          coalesce(country, '') as country,
          coalesce(city, '') as city,
          device_type,
          coalesce(os, '') as os,
          coalesce(source, '') as source,
          count(*)::int as page_views,
          0 as clicks,
          0 as leads
        from page_views
        where occurred_at < ${cutoffIso}::timestamptz
        group by 1, 2, 3, 4, 5, 6, 7
      ),
      click_buckets as (
        select
          profile_id,
          (occurred_at at time zone 'UTC')::date as day,
          coalesce(country, '') as country,
          coalesce(city, '') as city,
          device_type,
          coalesce(os, '') as os,
          coalesce(source, '') as source,
          0 as page_views,
          count(*)::int as clicks,
          count(*) filter (where is_lead)::int as leads
        from clicks
        where occurred_at < ${cutoffIso}::timestamptz
        group by 1, 2, 3, 4, 5, 6, 7
      ),
      merged as (
        select
          profile_id, day, country, city, device_type, os, source,
          sum(page_views)::int as page_views,
          sum(clicks)::int as clicks,
          sum(leads)::int as leads
        from (select * from page_buckets union all select * from click_buckets) both_kinds
        group by 1, 2, 3, 4, 5, 6, 7
      )
      insert into daily_summaries
        (profile_id, day, country, city, device_type, os, source, page_views, clicks, leads)
      select profile_id, day, country, city, device_type, os, source, page_views, clicks, leads
      from merged
      on conflict (profile_id, day, country, city, device_type, os, source) do update set
        page_views = daily_summaries.page_views + excluded.page_views,
        clicks = daily_summaries.clicks + excluded.clicks,
        leads = daily_summaries.leads + excluded.leads
      returning 1
    `;

    const deletedPageViews =
      await tx`delete from page_views where occurred_at < ${cutoffIso}::timestamptz`;
    const deletedClicks =
      await tx`delete from clicks where occurred_at < ${cutoffIso}::timestamptz`;

    return {
      buckets: upserted.length,
      deletedPageViews: deletedPageViews.count,
      deletedClicks: deletedClicks.count,
      cutoff,
    };
  });
}

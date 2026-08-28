import type { Granularity } from '@link-profile/shared';
import type { Sql } from 'postgres';

/**
 * 数据分析读取。
 *
 * 两件事贯穿全文件：
 *
 * 1. **切天与分桶一律在所选展示时区里算**，不是服务器时区。做法是
 *    `occurred_at at time zone $tz` 把 UTC 时刻转成当地墙上时间再
 *    `date_trunc`。夏令时之类的规则交给 Postgres 的 tz 库，比自己算可靠。
 * 2. **明细与日汇总要合起来读**。近半年在明细里、更早的在日汇总里
 *    （见 15），历史图表因此不断档。日汇总按 UTC 日切，跨时区展示时
 *    老数据是个近似，这一点在 15 里写清楚了。
 */

export interface QueryScope {
  /** 要看的用户。空数组表示可见范围里一个用户都没有。 */
  profileIds: string[];
  from: Date;
  to: Date;
  timeZone: string;
}

export interface Totals {
  pageViews: number;
  clicks: number;
  leads: number;
  /** 全部点击 ÷ 页面浏览。分母永远是页面浏览，不是访客数。 */
  ctr: number;
}

export interface TrendPoint {
  bucket: string;
  pageViews: number;
  clicks: number;
  leads: number;
}

export interface DimensionRow {
  key: string;
  pageViews: number;
  clicks: number;
  leads: number;
}

export interface ButtonRow {
  id: string;
  kind: 'link' | 'social';
  title: string;
  isLead: boolean;
  clicks: number;
  /** 单按钮点击 ÷ 页面浏览 */
  ctr: number;
}

/** 空范围（例如管理员名下一个用户都没有）时的零值，省掉一趟查询。 */
const EMPTY_TOTALS: Totals = { pageViews: 0, clicks: 0, leads: 0, ctr: 0 };

function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

export async function queryTotals(sql: Sql, scope: QueryScope): Promise<Totals> {
  if (scope.profileIds.length === 0) return EMPTY_TOTALS;

  const [row] = await sql<{ page_views: number; clicks: number; leads: number }[]>`
    select
      coalesce(sum(page_views), 0)::int as page_views,
      coalesce(sum(clicks), 0)::int as clicks,
      coalesce(sum(leads), 0)::int as leads
    from (
      select count(*)::int as page_views, 0 as clicks, 0 as leads
      from page_views
      where profile_id = any(${scope.profileIds}::uuid[])
        and occurred_at >= ${scope.from.toISOString()}::timestamptz
        and occurred_at < ${scope.to.toISOString()}::timestamptz
      union all
      select 0, count(*)::int, count(*) filter (where is_lead)::int
      from clicks
      where profile_id = any(${scope.profileIds}::uuid[])
        and occurred_at >= ${scope.from.toISOString()}::timestamptz
        and occurred_at < ${scope.to.toISOString()}::timestamptz
      union all
      select
        coalesce(sum(page_views), 0)::int,
        coalesce(sum(clicks), 0)::int,
        coalesce(sum(leads), 0)::int
      from daily_summaries
      where profile_id = any(${scope.profileIds}::uuid[])
        and day >= (${scope.from.toISOString()}::timestamptz at time zone ${scope.timeZone})::date
        and day <= (${scope.to.toISOString()}::timestamptz at time zone ${scope.timeZone})::date
    ) parts
  `;

  const pageViews = row?.page_views ?? 0;
  const clicks = row?.clicks ?? 0;
  return { pageViews, clicks, leads: row?.leads ?? 0, ctr: ratio(clicks, pageViews) };
}

/**
 * 趋势图。区间不超过两天时按小时，否则按天；两种粒度都在展示时区里切。
 * 日汇总只参与按天的那一档 —— 它已经没有小时信息了。
 */
export async function queryTrend(
  sql: Sql,
  scope: QueryScope,
  granularity: Granularity,
): Promise<TrendPoint[]> {
  if (scope.profileIds.length === 0) return [];

  const rows = await sql<{ bucket: string; page_views: number; clicks: number; leads: number }[]>`
    with detail as (
      select
        date_trunc(${granularity}, occurred_at at time zone ${scope.timeZone}) as bucket,
        1 as page_views, 0 as clicks, 0 as leads
      from page_views
      where profile_id = any(${scope.profileIds}::uuid[])
        and occurred_at >= ${scope.from.toISOString()}::timestamptz
        and occurred_at < ${scope.to.toISOString()}::timestamptz
      union all
      select
        date_trunc(${granularity}, occurred_at at time zone ${scope.timeZone}),
        0, 1, case when is_lead then 1 else 0 end
      from clicks
      where profile_id = any(${scope.profileIds}::uuid[])
        and occurred_at >= ${scope.from.toISOString()}::timestamptz
        and occurred_at < ${scope.to.toISOString()}::timestamptz
    ),
    summarised as (
      select
        day::timestamp as bucket,
        page_views, clicks, leads
      from daily_summaries
      where ${granularity} = 'day'
        and profile_id = any(${scope.profileIds}::uuid[])
        and day >= (${scope.from.toISOString()}::timestamptz at time zone ${scope.timeZone})::date
        and day <= (${scope.to.toISOString()}::timestamptz at time zone ${scope.timeZone})::date
    )
    select
      to_char(bucket, ${granularity === 'hour' ? 'YYYY-MM-DD"T"HH24:00' : 'YYYY-MM-DD'}) as bucket,
      sum(page_views)::int as page_views,
      sum(clicks)::int as clicks,
      sum(leads)::int as leads
    from (select * from detail union all select * from summarised) merged
    group by bucket
    order by bucket
  `;

  return rows.map((r) => ({
    bucket: r.bucket,
    pageViews: r.page_views,
    clicks: r.clicks,
    leads: r.leads,
  }));
}

/**
 * 24 小时分布：把区间内的线索汇总到 0–23 点，用于判断发帖引流的最佳时段。
 * 小时同样按展示时区算 —— 受众在哪个时区活跃，就该按哪个时区看。
 */
export async function queryHourlyLeads(sql: Sql, scope: QueryScope): Promise<number[]> {
  const buckets = Array.from({ length: 24 }, () => 0);
  if (scope.profileIds.length === 0) return buckets;

  const rows = await sql<{ hour: number; leads: number }[]>`
    select
      extract(hour from occurred_at at time zone ${scope.timeZone})::int as hour,
      count(*)::int as leads
    from clicks
    where is_lead
      and profile_id = any(${scope.profileIds}::uuid[])
      and occurred_at >= ${scope.from.toISOString()}::timestamptz
      and occurred_at < ${scope.to.toISOString()}::timestamptz
    group by hour
  `;

  for (const row of rows) buckets[row.hour] = row.leads;
  return buckets;
}

export type Dimension = 'country' | 'city' | 'device_type' | 'os' | 'source';

/** 维度拆分。明细里的 NULL 与日汇总里的空串都归到「未知」同一桶。 */
export async function queryDimension(
  sql: Sql,
  scope: QueryScope,
  dimension: Dimension,
): Promise<DimensionRow[]> {
  if (scope.profileIds.length === 0) return [];

  const column = sql(dimension);
  const rows = await sql<{ key: string; page_views: number; clicks: number; leads: number }[]>`
    with detail as (
      select coalesce(${column}::text, '') as key, 1 as page_views, 0 as clicks, 0 as leads
      from page_views
      where profile_id = any(${scope.profileIds}::uuid[])
        and occurred_at >= ${scope.from.toISOString()}::timestamptz
        and occurred_at < ${scope.to.toISOString()}::timestamptz
      union all
      select coalesce(${column}::text, ''), 0, 1, case when is_lead then 1 else 0 end
      from clicks
      where profile_id = any(${scope.profileIds}::uuid[])
        and occurred_at >= ${scope.from.toISOString()}::timestamptz
        and occurred_at < ${scope.to.toISOString()}::timestamptz
    ),
    summarised as (
      select coalesce(${column}::text, '') as key, page_views, clicks, leads
      from daily_summaries
      where profile_id = any(${scope.profileIds}::uuid[])
        and day >= (${scope.from.toISOString()}::timestamptz at time zone ${scope.timeZone})::date
        and day <= (${scope.to.toISOString()}::timestamptz at time zone ${scope.timeZone})::date
    )
    select
      key,
      sum(page_views)::int as page_views,
      sum(clicks)::int as clicks,
      sum(leads)::int as leads
    from (select * from detail union all select * from summarised) merged
    group by key
    order by sum(clicks) desc, key
  `;

  return rows.map((r) => ({
    key: r.key,
    pageViews: r.page_views,
    clicks: r.clicks,
    leads: r.leads,
  }));
}

/**
 * 每个按钮的点击与点击率。
 *
 * 分母是**页面级的页面浏览数**，不是这个按钮自己的曝光 —— 按钮没有独立曝光，
 * 页面渲染一次全部按钮就都露过一次面。
 * 只看明细：日汇总里没有按钮粒度。
 */
export async function queryButtons(
  sql: Sql,
  scope: QueryScope,
  pageViews: number,
): Promise<ButtonRow[]> {
  if (scope.profileIds.length === 0) return [];

  /*
   * 不按 target_kind 过滤：合表之后只有 buttons 一张表，target_id 能 join 上
   * 就说明点的是这一行。历史上 target_kind='social' 的点击因此自动归位到
   * 合并后的条目上，社媒条目也第一次有了逐条明细。
   */
  const rows = await sql<
    { id: string; kind: string; title: string; is_lead: boolean; clicks: number }[]
  >`
    select
      b.id,
      b.kind,
      b.title,
      b.is_lead,
      count(c.id)::int as clicks
    from buttons b
    left join clicks c
      on c.target_id = b.id
      and c.occurred_at >= ${scope.from.toISOString()}::timestamptz
      and c.occurred_at < ${scope.to.toISOString()}::timestamptz
    where b.profile_id = any(${scope.profileIds}::uuid[])
    group by b.id, b.kind, b.title, b.is_lead, b.position
    order by b.position
  `;

  return rows.map((r) => ({
    id: r.id,
    kind: r.kind === 'social' ? 'social' : 'link',
    title: r.title,
    isLead: r.is_lead,
    clicks: r.clicks,
    ctr: ratio(r.clicks, pageViews),
  }));
}

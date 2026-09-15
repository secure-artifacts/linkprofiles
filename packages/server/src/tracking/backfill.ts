import type { Sql } from 'postgres';
import type { GeoLookup } from './geo.js';

export const BACKFILL_BATCH = 500;

export interface UnresolvedCounts {
  pageViews: number;
  clicks: number;
}

export interface BackfillBatch {
  scanned: number;
  resolved: number;
  pageViews: number;
  clicks: number;
  /** null 表示查完了 */
  next: string | null;
}

/** 国家为空但留着截断 IP 的记录才补得了；没有 IP 的永远是未知。 */
export async function countUnresolved(sql: Sql): Promise<UnresolvedCounts> {
  const [row] = await sql<{ page_views: number; clicks: number }[]>`
    select
      (select count(*)::int from page_views where country is null and ip_truncated is not null) as page_views,
      (select count(*)::int from clicks where country is null and ip_truncated is not null) as clicks
  `;
  return { pageViews: row?.page_views ?? 0, clicks: row?.clicks ?? 0 };
}

/**
 * 游标按 IP 排序往后走，而不是每次都从头找「国家还为空的」：查不出国家的 IP
 * 补完仍然为空，从头找会让同一批 IP 被反复拿出来，永远走不完。
 */
export async function backfillBatch(
  sql: Sql,
  geo: GeoLookup,
  after: string | null,
  limit = BACKFILL_BATCH,
): Promise<BackfillBatch> {
  const candidates = await sql<{ ip: string }[]>`
    select ip from (
      select ip_truncated as ip from page_views where country is null and ip_truncated is not null
      union
      select ip_truncated from clicks where country is null and ip_truncated is not null
    ) unresolved
    where ip collate "C" > ${after ?? ''}
    order by ip collate "C"
    limit ${limit + 1}
  `;
  const ips = candidates.slice(0, limit).map((row) => row.ip);

  const matches: { ip: string; country: string; city: string | null }[] = [];
  for (const ip of ips) {
    const { country, city } = await geo(ip);
    if (country) matches.push({ ip, country, city });
  }

  let pageViews = 0;
  let clicks = 0;
  if (matches.length > 0) {
    const ipList = matches.map((m) => m.ip);
    const countries = matches.map((m) => m.country);
    const cities = matches.map((m) => m.city);
    const views = await sql`
      update page_views as t set country = v.country, city = v.city
      from unnest(${ipList}::text[], ${countries}::text[], ${cities}::text[]) as v (ip, country, city)
      where t.ip_truncated = v.ip and t.country is null
    `;
    const clickRows = await sql`
      update clicks as t set country = v.country, city = v.city
      from unnest(${ipList}::text[], ${countries}::text[], ${cities}::text[]) as v (ip, country, city)
      where t.ip_truncated = v.ip and t.country is null
    `;
    pageViews = views.count;
    clicks = clickRows.count;
  }

  return {
    scanned: ips.length,
    resolved: matches.length,
    pageViews,
    clicks,
    next: candidates.length > limit ? (ips.at(-1) ?? null) : null,
  };
}

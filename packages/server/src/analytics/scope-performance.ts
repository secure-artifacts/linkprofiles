import type { Sql } from 'postgres';
import type { QueryScope } from './queries.js';

export interface VisibleProfile {
  id: string;
  userId: string;
  shortName: string;
  displayName: string;
  account: string;
  userLabel: string;
}

export interface VisibleAccount {
  id: string;
  account: string;
  label: string;
}

export interface PerformanceTotals {
  pageViews: number;
  clicks: number;
  leads: number;
  ctr: number;
  leadRate: number;
}

export interface ProfilePerformance extends PerformanceTotals {
  id: string;
  userId: string;
  shortName: string;
  displayName: string;
}

export interface AccountPerformance extends PerformanceTotals {
  id: string;
  account: string;
  label: string;
  profileCount: number;
}

const ratio = (numerator: number, denominator: number) =>
  denominator === 0 ? 0 : numerator / denominator;

/**
 * 一次查询给每个个人页算出同一口径的表现。路由再把它折叠成账号行；这样
 * 「账号汇总」和「个人页分析」不会各自实现一套容易漂移的统计公式。
 */
export async function queryScopePerformance(
  sql: Sql,
  scope: QueryScope,
  visibleProfiles: VisibleProfile[],
  visibleAccounts: VisibleAccount[],
): Promise<{ accounts: AccountPerformance[]; profiles: ProfilePerformance[] }> {
  const rows = visibleProfiles.length
    ? await sql<{ profile_id: string; page_views: number; clicks: number; leads: number }[]>`
    select
      profile_id,
      sum(page_views)::int as page_views,
      sum(clicks)::int as clicks,
      sum(leads)::int as leads
    from (
      select profile_id, count(*)::int as page_views, 0 as clicks, 0 as leads
      from page_views
      where profile_id = any(${scope.profileIds}::uuid[])
        and occurred_at >= ${scope.from.toISOString()}::timestamptz
        and occurred_at < ${scope.to.toISOString()}::timestamptz
      group by profile_id
      union all
      select profile_id, 0, count(*)::int, count(*) filter (where is_lead)::int
      from clicks
      where profile_id = any(${scope.profileIds}::uuid[])
        and occurred_at >= ${scope.from.toISOString()}::timestamptz
        and occurred_at < ${scope.to.toISOString()}::timestamptz
      group by profile_id
      union all
      select
        profile_id,
        coalesce(sum(page_views), 0)::int,
        coalesce(sum(clicks), 0)::int,
        coalesce(sum(leads), 0)::int
      from daily_summaries
      where profile_id = any(${scope.profileIds}::uuid[])
        and day >= (${scope.from.toISOString()}::timestamptz at time zone ${scope.timeZone})::date
        and day <= (${scope.to.toISOString()}::timestamptz at time zone ${scope.timeZone})::date
      group by profile_id
    ) parts
    group by profile_id
  `
    : [];

  const byProfile = new Map(rows.map((row) => [row.profile_id, row]));
  const profiles = visibleProfiles.map((profile): ProfilePerformance => {
    const metric = byProfile.get(profile.id);
    const pageViews = metric?.page_views ?? 0;
    const clicks = metric?.clicks ?? 0;
    const leads = metric?.leads ?? 0;
    return {
      id: profile.id,
      userId: profile.userId,
      shortName: profile.shortName,
      displayName: profile.displayName,
      pageViews,
      clicks,
      leads,
      ctr: ratio(clicks, pageViews),
      leadRate: ratio(leads, pageViews),
    };
  });

  const accountMap = new Map<string, AccountPerformance>(
    visibleAccounts.map((account) => [
      account.id,
      {
        id: account.id,
        account: account.account,
        label: account.label,
        profileCount: 0,
        pageViews: 0,
        clicks: 0,
        leads: 0,
        ctr: 0,
        leadRate: 0,
      },
    ]),
  );
  const performanceByProfile = new Map(profiles.map((profile) => [profile.id, profile]));
  for (const profile of visibleProfiles) {
    const metric = performanceByProfile.get(profile.id)!;
    const current = accountMap.get(profile.userId)!;
    current.profileCount += 1;
    current.pageViews += metric.pageViews;
    current.clicks += metric.clicks;
    current.leads += metric.leads;
    accountMap.set(profile.userId, current);
  }

  const accounts = [...accountMap.values()].map((account) => ({
    ...account,
    ctr: ratio(account.clicks, account.pageViews),
    leadRate: ratio(account.leads, account.pageViews),
  }));

  accounts.sort(
    (a, b) => b.leads - a.leads || b.pageViews - a.pageViews || a.account.localeCompare(b.account),
  );
  profiles.sort(
    (a, b) =>
      b.leads - a.leads || b.pageViews - a.pageViews || a.shortName.localeCompare(b.shortName),
  );
  return { accounts, profiles };
}

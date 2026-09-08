import type { ProfilePerformance } from '../api/types.js';

export type ProfileRankKey = 'leads' | 'pageViews' | 'leadRate' | 'growth' | 'opportunity';

/**
 * 总览切换排序只改变视图顺序，不修改接口响应，避免切换后影响其他汇总组件。
 * 主指标相同时用联系点击、进入页面和地址稳定打破平局。
 */
export function rankProfiles(
  rows: ProfilePerformance[],
  rankBy: ProfileRankKey,
  previousRows: ProfilePerformance[] = [],
) {
  const previousById = new Map(previousRows.map((row) => [row.id, row]));
  const score = (row: ProfilePerformance) => {
    if (rankBy === 'growth') {
      const previous = previousById.get(row.id)?.leads ?? 0;
      if (previous === 0) return row.leads > 0 ? Number.MAX_SAFE_INTEGER + row.leads : 0;
      return (row.leads - previous) / previous;
    }
    if (rankBy === 'opportunity') return row.pageViews * (1 - row.leadRate);
    return row[rankBy];
  };
  return [...rows].sort(
    (a, b) =>
      score(b) - score(a) ||
      b.leads - a.leads ||
      b.pageViews - a.pageViews ||
      a.shortName.localeCompare(b.shortName),
  );
}

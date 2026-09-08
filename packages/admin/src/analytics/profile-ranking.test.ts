import { describe, expect, test } from 'vitest';
import type { ProfilePerformance } from '../api/types.js';
import { rankProfiles } from './profile-ranking.js';

const row = (
  id: string,
  shortName: string,
  pageViews: number,
  leads: number,
): ProfilePerformance => ({
  id,
  userId: `user-${id}`,
  shortName,
  displayName: shortName,
  account: `account-${id}`,
  accountLabel: `账号 ${id}`,
  pageViews,
  clicks: leads,
  leads,
  ctr: pageViews === 0 ? 0 : leads / pageViews,
  leadRate: pageViews === 0 ? 0 : leads / pageViews,
});

describe('个人页排行', () => {
  const rows = [row('a', 'alpha', 100, 5), row('b', 'beta', 20, 10), row('c', 'charlie', 10, 4)];

  test('可分别按联系点击、进入页面、联系率和优化机会排序', () => {
    expect(rankProfiles(rows, 'leads').map((item) => item.id)).toEqual(['b', 'a', 'c']);
    expect(rankProfiles(rows, 'pageViews').map((item) => item.id)).toEqual(['a', 'b', 'c']);
    expect(rankProfiles(rows, 'leadRate').map((item) => item.id)).toEqual(['b', 'c', 'a']);
    expect(rankProfiles(rows, 'opportunity').map((item) => item.id)).toEqual(['a', 'b', 'c']);
  });

  test('可按相对上一周期的联系点击增长排序', () => {
    const previous = [
      row('a', 'alpha', 80, 10),
      row('b', 'beta', 10, 2),
      row('c', 'charlie', 5, 0),
    ];
    expect(rankProfiles(rows, 'growth', previous).map((item) => item.id)).toEqual(['c', 'b', 'a']);
  });

  test('不修改接口返回的原始顺序', () => {
    rankProfiles(rows, 'pageViews');
    expect(rows.map((item) => item.id)).toEqual(['a', 'b', 'c']);
  });
});

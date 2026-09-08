import { describe, expect, test } from 'vitest';
import type { AnalyticsResponse } from '../api/types.js';
import { buildDashboardInsights, periodChange } from './dashboard-insights.js';

const data = {
  totals: { pageViews: 100, clicks: 40, leads: 20, ctr: 0.4 },
  comparison: {
    range: { from: '', to: '' },
    totals: { pageViews: 80, clicks: 30, leads: 10, ctr: 0.375 },
    profiles: [],
  },
  crossBreakdowns: {
    sources: [
      {
        key: 'tiktok',
        pageViews: 70,
        clicks: 30,
        leads: 18,
        clickRate: 30 / 70,
        leadRate: 18 / 70,
        targets: [],
      },
      {
        key: '',
        pageViews: 30,
        clicks: 10,
        leads: 2,
        clickRate: 1 / 3,
        leadRate: 2 / 30,
        targets: [],
      },
    ],
    countries: [],
    targets: [],
  },
  performance: { accounts: [], profiles: [] },
} as unknown as AnalyticsResponse;

describe('数据分析自动结论', () => {
  test('识别周期增长、第一来源和来源标记缺失', () => {
    const insights = buildDashboardInsights(data);
    expect(insights.map((item) => item.title)).toEqual(
      expect.arrayContaining([
        '联系点击增长 100.0%',
        'TikTok贡献联系点击最多',
        '30.0% 的进入没有来源标记',
      ]),
    );
  });

  test('上一周期为零时使用新增而不是无穷大', () => {
    expect(periodChange(3, 0)).toBeNull();
    expect(periodChange(0, 0)).toBe(0);
    expect(periodChange(15, 10)).toBe(0.5);
  });
});

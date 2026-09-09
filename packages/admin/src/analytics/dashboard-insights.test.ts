import { createI18n, fixedTranslate, type AdminKey } from '@link-profile/i18n';
import { adminEn } from '@link-profile/i18n/source';
import { describe, expect, test } from 'vitest';
import type { AnalyticsResponse } from '../api/types.js';
import { buildDashboardInsights, periodChange } from './dashboard-insights.js';

/** 断言英文源文，它是这份文案的唯一来源，见 ADR-0021。 */
const t = fixedTranslate<AdminKey>(createI18n('admin', { en: { ...adminEn } }), 'admin', 'en');

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
    const insights = buildDashboardInsights(data, t, 'en');
    expect(insights.map((item) => item.title)).toEqual(
      expect.arrayContaining([
        'Contact clicks up 100.0%',
        'TikTok brings the most contact clicks',
        '30.0% of visits carry no source tag',
      ]),
    );
  });

  test('上一周期为零时使用新增而不是无穷大', () => {
    expect(periodChange(3, 0)).toBeNull();
    expect(periodChange(0, 0)).toBe(0);
    expect(periodChange(15, 10)).toBe(0.5);
  });
});

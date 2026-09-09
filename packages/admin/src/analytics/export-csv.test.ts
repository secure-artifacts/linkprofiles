import { describe, expect, it } from 'vitest';
import type { AnalyticsResponse } from '../api/types.js';
import { buildAnalyticsCsv } from './export-csv.js';

/** 译文只做透传，断言看的是结构与转义，不是文案。 */
const t = ((key: string) => key) as unknown as Parameters<typeof buildAnalyticsCsv>[1];

const empty = { pageViews: 0, clicks: 0, leads: 0, ctr: 0 };

const data = {
  scope: { kind: 'portfolio' },
  range: { from: '2026-09-01', to: '2026-09-07', timeZone: 'America/New_York', granularity: 'day' },
  comparison: { range: { from: '2026-08-25', to: '2026-08-31' }, totals: empty, profiles: [] },
  totals: { pageViews: 1314, clicks: 430, leads: 302, ctr: 0.3273 },
  trend: [{ bucket: '2026-09-01', pageViews: 50, clicks: 11, leads: 9 }],
  hourlyLeads: [],
  buttons: [],
  dimensions: {
    countries: [{ key: 'PH', pageViews: 10, clicks: 3, leads: 2 }],
    cities: [],
    devices: [{ key: '', pageViews: 4, clicks: 1, leads: 0 }],
    operatingSystems: [],
    sources: [{ key: 'tiktok', pageViews: 8, clicks: 2, leads: 1 }],
  },
  crossBreakdowns: {
    sources: [],
    countries: [],
    targets: [
      {
        id: 'b1',
        // 表格软件会把 = 开头的单元格当公式执行，显示名是终端用户自己填的
        title: '=HYPERLINK("http://evil.example","claim")',
        platform: 'whatsapp',
        isLead: true,
        clicks: 5,
        leads: 5,
        sources: [{ key: 'tiktok', clicks: 5, leads: 5 }],
      },
    ],
  },
  countryDaily: [],
  activityHeatmap: [],
  profileHighlights: [],
  performance: {
    accounts: [],
    profiles: [
      {
        id: 'p1',
        userId: 'u1',
        shortName: 'joy-manila',
        displayName: 'Ramirez, Joy',
        account: 'manila.joy',
        accountLabel: 'Joy',
        pageViews: 129,
        clicks: 40,
        leads: 20,
        ctr: 0.31,
        leadRate: 0.155,
      },
    ],
    regions: [],
  },
  regions: [],
} as unknown as AnalyticsResponse;

const csv = () => buildAnalyticsCsv(data, t, 'en', 'Analytics overview');

describe('buildAnalyticsCsv', () => {
  it('每一段之间空一行，段名单独占一行', () => {
    const lines = csv().split('\r\n');
    expect(lines[0]).toBe('analytics.title,Analytics overview');
    expect(lines).toContain('analytics.total');
    expect(lines).toContain('');
  });

  it('带逗号的值加引号，比率写成可直接计算的数字', () => {
    const lines = csv().split('\r\n');
    expect(lines).toContain('"Ramirez, Joy",/joy-manila,manila.joy,129,40,20,15.5');
    // 点击率取服务端的 ctr，联系率是联系点击 / 进入页面，两者不是同一个数
    expect(lines).toContain('analytics.clickRate %,32.7,0');
    expect(lines).toContain('analytics.leadRate %,23,0');
  });

  it('公式开头的单元格被降级成文本', () => {
    // 前置单引号让 Sheets 与 Excel 按字面量显示，而不是执行
    expect(csv()).toContain(`"'=HYPERLINK(""http://evil.example"",""claim"")"`);
  });

  it('空的维度键回落到「未知」，空的段整段不出现', () => {
    const out = csv();
    expect(out).toContain('analytics.unknown,4,1,0');
    expect(out).not.toContain('analytics.regions.title');
  });
});

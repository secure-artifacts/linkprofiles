import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { AnalyticsResponse } from '../api/types.js';
import { GlobalCountryAnalytics } from './GlobalCountryAnalytics.js';

const metrics = { clickRate: 1, leadRate: 1 };
const data = {
  totals: { pageViews: 3, clicks: 3, leads: 3, ctr: 1 },
  crossBreakdowns: {
    sources: [],
    targets: [],
    countries: [
      {
        key: 'US',
        pageViews: 2,
        clicks: 2,
        leads: 2,
        ...metrics,
        sources: [
          {
            key: 'tiktok',
            pageViews: 2,
            clicks: 2,
            leads: 2,
            ...metrics,
            targets: [],
          },
        ],
      },
      {
        key: 'NZ',
        pageViews: 1,
        clicks: 1,
        leads: 1,
        ...metrics,
        sources: [],
      },
    ],
  },
  countryDaily: [
    {
      day: '2026-08-31',
      country: 'US',
      pageViews: 2,
      clicks: 2,
      leads: 2,
      platforms: [
        { key: 'whatsapp', clicks: 1, leads: 1 },
        { key: 'messenger', clicks: 1, leads: 1 },
      ],
    },
    {
      day: '2026-08-31',
      country: 'NZ',
      pageViews: 1,
      clicks: 1,
      leads: 1,
      platforms: [{ key: 'whatsapp', clicks: 1, leads: 1 }],
    },
  ],
} satisfies Pick<AnalyticsResponse, 'totals' | 'crossBreakdowns' | 'countryDaily'>;

describe('GlobalCountryAnalytics', () => {
  it('renders a global map, every-country summary and daily contact-platform details', () => {
    const html = renderToStaticMarkup(createElement(GlobalCountryAnalytics, { data }));

    expect(html).toContain('全球国家分析');
    expect(html).toContain('按打开次数着色的全球国家地图');
    expect(html).toContain('全部国家汇总');
    expect(html).toContain('每天明细');
    expect(html).toContain('美国');
    expect(html).toContain('新西兰');
    expect(html).toContain('TikTok · 2');
    expect(html).toContain('WhatsApp');
    expect(html).toContain('Messenger');
    expect(html).toContain('2026-08-31');
  });
});

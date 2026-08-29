import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { AnalyticsResponse } from '../api/types.js';
import { AnalyticsVisualOverview } from './AnalyticsVisualOverview.js';

const data = {
  sources: [
    {
      key: 'tiktok',
      pageViews: 100,
      clicks: 30,
      leads: 20,
      clickRate: 0.3,
      leadRate: 0.2,
      targets: [],
    },
  ],
  countries: [
    {
      key: 'US',
      pageViews: 80,
      clicks: 24,
      leads: 16,
      clickRate: 0.3,
      leadRate: 0.2,
      sources: [],
    },
  ],
  targets: [
    {
      id: 'whatsapp',
      title: 'WhatsApp',
      platform: 'whatsapp',
      isLead: true,
      clicks: 20,
      leads: 20,
      sources: [{ key: 'tiktok', clicks: 20, leads: 20 }],
    },
  ],
} satisfies AnalyticsResponse['crossBreakdowns'];

describe('AnalyticsVisualOverview', () => {
  it('renders source, country map and contact summaries from the same breakdown', () => {
    const html = renderToStaticMarkup(createElement(AnalyticsVisualOverview, { data }));

    expect(html).toContain('来源转化');
    expect(html).toContain('国家分布');
    expect(html).toContain('联系方式排行');
    expect(html).toContain('TikTok');
    expect(html).toContain('WhatsApp');
    expect(html).toContain('美国');
    expect(html).toContain('按进入页面次数着色的世界地图');
    expect(html).toContain('<path');
  });
});

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
  it('renders source and contact summaries from the same breakdown', () => {
    const html = renderToStaticMarkup(createElement(AnalyticsVisualOverview, { data }));

    // 组件默认按英文源文渲染，切语言由运行时负责，见 ADR-0021
    expect(html).toContain('Source conversion');
    expect(html).toContain('Contact channel ranking');
    expect(html).toContain('TikTok');
    expect(html).toContain('WhatsApp');
  });
});

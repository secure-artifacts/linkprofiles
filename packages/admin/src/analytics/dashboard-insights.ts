import type { AnalyticsResponse } from '../api/types.js';
import { countryLabel, percent, sourceLabel } from './labels.js';

export interface DashboardInsight {
  tone: 'positive' | 'warning' | 'neutral';
  title: string;
  description: string;
}

export function periodChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return (current - previous) / previous;
}

export function buildDashboardInsights(data: AnalyticsResponse): DashboardInsight[] {
  const insights: DashboardInsight[] = [];
  const leadChange = periodChange(data.totals.leads, data.comparison.totals.leads);
  if (leadChange === null) {
    insights.push({
      tone: 'positive',
      title: '本周期开始产生联系点击',
      description: `上一周期为 0，本周期已有 ${data.totals.leads} 次联系点击。`,
    });
  } else if (Math.abs(leadChange) >= 0.05) {
    insights.push({
      tone: leadChange > 0 ? 'positive' : 'warning',
      title: `联系点击${leadChange > 0 ? '增长' : '下降'} ${percent(Math.abs(leadChange))}`,
      description: `本周期 ${data.totals.leads} 次，上一周期 ${data.comparison.totals.leads} 次。`,
    });
  }

  const topSource = [...data.crossBreakdowns.sources].sort(
    (a, b) => b.leads - a.leads || b.pageViews - a.pageViews,
  )[0];
  if (topSource) {
    insights.push({
      tone: 'neutral',
      title: `${sourceLabel(topSource.key)}贡献联系点击最多`,
      description: `${topSource.pageViews} 次进入、${topSource.leads} 次联系，联系率 ${percent(topSource.leadRate)}。`,
    });
  }

  const unknownSource = data.crossBreakdowns.sources.find((source) => !source.key);
  const unknownRate = data.totals.pageViews
    ? (unknownSource?.pageViews ?? 0) / data.totals.pageViews
    : 0;
  if (unknownRate >= 0.2) {
    insights.push({
      tone: 'warning',
      title: `${percent(unknownRate)} 的进入没有来源标记`,
      description: '建议投放时使用带来源参数的推广地址，否则无法判断平台贡献。',
    });
  }

  const overallLeadRate = data.totals.pageViews ? data.totals.leads / data.totals.pageViews : 0;
  const opportunity = [...data.performance.profiles]
    .filter((profile) => profile.pageViews >= 10 && profile.leadRate < overallLeadRate)
    .sort((a, b) => b.pageViews - a.pageViews)[0];
  if (opportunity) {
    insights.push({
      tone: 'warning',
      title: `${opportunity.displayName || opportunity.shortName} 值得优先优化`,
      description: `${opportunity.pageViews} 次进入，但联系率只有 ${percent(opportunity.leadRate)}，低于整体 ${percent(overallLeadRate)}。`,
    });
  }

  const topCountry = data.crossBreakdowns.countries[0];
  if (topCountry && insights.length < 4) {
    insights.push({
      tone: 'neutral',
      title: `${countryLabel(topCountry.key)}是第一访问地区`,
      description: `${topCountry.pageViews} 次进入、${topCountry.leads} 次联系，联系率 ${percent(topCountry.leadRate)}。`,
    });
  }

  return insights.slice(0, 4);
}

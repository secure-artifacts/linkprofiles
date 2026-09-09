import type { Locale } from '@link-profile/i18n';
import type { AnalyticsResponse } from '../api/types.js';
import type { useAdminT } from '../i18n/runtime.js';
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

type T = ReturnType<typeof useAdminT>;

export function buildDashboardInsights(
  data: AnalyticsResponse,
  t: T,
  locale: Locale,
): DashboardInsight[] {
  const insights: DashboardInsight[] = [];
  const leadChange = periodChange(data.totals.leads, data.comparison.totals.leads);
  if (leadChange === null) {
    insights.push({
      tone: 'positive',
      title: t('insights.leadsStarted.title'),
      description: t('insights.leadsStarted.body', { leads: data.totals.leads }),
    });
  } else if (Math.abs(leadChange) >= 0.05) {
    insights.push({
      tone: leadChange > 0 ? 'positive' : 'warning',
      title: t(leadChange > 0 ? 'insights.leadsUp.title' : 'insights.leadsDown.title', {
        percent: percent(Math.abs(leadChange)),
      }),
      description: t('insights.leadsChange.body', {
        current: data.totals.leads,
        previous: data.comparison.totals.leads,
      }),
    });
  }

  const topSource = [...data.crossBreakdowns.sources].sort(
    (a, b) => b.leads - a.leads || b.pageViews - a.pageViews,
  )[0];
  if (topSource) {
    insights.push({
      tone: 'neutral',
      title: t('insights.topSource.title', { source: sourceLabel(t, topSource.key) }),
      description: t('insights.topSource.body', {
        views: topSource.pageViews,
        leads: topSource.leads,
        rate: percent(topSource.leadRate),
      }),
    });
  }

  const unknownSource = data.crossBreakdowns.sources.find((source) => !source.key);
  const unknownRate = data.totals.pageViews
    ? (unknownSource?.pageViews ?? 0) / data.totals.pageViews
    : 0;
  if (unknownRate >= 0.2) {
    insights.push({
      tone: 'warning',
      title: t('insights.untagged.title', { percent: percent(unknownRate) }),
      description: t('insights.untagged.body'),
    });
  }

  const overallLeadRate = data.totals.pageViews ? data.totals.leads / data.totals.pageViews : 0;
  const opportunity = [...data.performance.profiles]
    .filter((profile) => profile.pageViews >= 10 && profile.leadRate < overallLeadRate)
    .sort((a, b) => b.pageViews - a.pageViews)[0];
  if (opportunity) {
    insights.push({
      tone: 'warning',
      title: t('insights.opportunity.title', {
        name: opportunity.displayName || opportunity.shortName,
      }),
      description: t('insights.opportunity.body', {
        views: opportunity.pageViews,
        rate: percent(opportunity.leadRate),
        overall: percent(overallLeadRate),
      }),
    });
  }

  const topCountry = data.crossBreakdowns.countries[0];
  if (topCountry && insights.length < 4) {
    insights.push({
      tone: 'neutral',
      title: t('insights.topCountry.title', { country: countryLabel(t, locale, topCountry.key) }),
      description: t('insights.topCountry.body', {
        views: topCountry.pageViews,
        leads: topCountry.leads,
        rate: percent(topCountry.leadRate),
      }),
    });
  }

  return insights.slice(0, 4);
}

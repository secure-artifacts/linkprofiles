import { useMemo, useState } from 'react';
import type { AnalyticsResponse, SourceBreakdown } from '../api/types.js';
import { Segmented } from '../ui/Segmented.js';
import { Select } from '../ui/Select.js';
import { countryLabel, percent, platformLabel, sourceLabel } from './labels.js';
import { useAdminT, useLocale } from '../i18n/runtime.js';
import { compareText } from '@link-profile/shared';

export function SourceContactMatrix({ data }: { data: AnalyticsResponse['crossBreakdowns'] }) {
  const t = useAdminT();
  const locale = useLocale();
  const [sourceFilter, setSourceFilter] = useState('');
  const [countryFilter, setCountryFilter] = useState('');
  const selectedCountry = data.countries.find((country) => country.key === countryFilter);
  const rows = (selectedCountry?.sources ?? data.sources).filter(
    (source) => !sourceFilter || source.key === sourceFilter,
  );
  const matrix = useMemo(() => buildMatrix(rows), [rows]);

  return (
    <DashboardCard title={t('analytics.matrix.title')} description={t('analytics.matrix.hint')}>
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-[var(--radius-control)] bg-bg p-2">
        <span className="px-1 text-[12px] font-medium text-muted">
          {t('analytics.filter.linked')}
        </span>
        <Select
          value={sourceFilter}
          onChange={setSourceFilter}
          aria-label={t('analytics.matrix.sourceFilter')}
          options={[
            { value: '', label: t('analytics.matrix.allSources') },
            ...data.sources.map((source) => ({
              value: source.key,
              label: sourceLabel(t, source.key),
            })),
          ]}
        />
        <Select
          value={countryFilter}
          onChange={setCountryFilter}
          aria-label={t('analytics.matrix.countryFilter')}
          options={[
            { value: '', label: t('analytics.matrix.allCountries') },
            ...data.countries.map((country) => ({
              value: country.key,
              label: countryLabel(t, locale, country.key),
            })),
          ]}
        />
        {sourceFilter || countryFilter ? (
          <button
            type="button"
            className="px-2 text-[12px] font-medium text-accent hover:underline"
            onClick={() => {
              setSourceFilter('');
              setCountryFilter('');
            }}
          >
            {t('analytics.filter.clear')}
          </button>
        ) : null}
      </div>
      {matrix.platforms.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-[13px]">
            <thead>
              <tr className="border-b border-border text-muted">
                <th className="py-2 text-left font-medium">{t('analytics.source')}</th>
                {matrix.platforms.map((platform) => (
                  <th key={platform} className="px-3 py-2 text-right font-medium">
                    {platformLabel(t, platform)}
                  </th>
                ))}
                <th className="py-2 pl-3 text-right font-medium">{t('analytics.total')}</th>
              </tr>
            </thead>
            <tbody>
              {matrix.rows.map((row) => (
                <tr key={row.key} className="border-b border-border last:border-0">
                  <td className="py-3 font-medium text-fg">{sourceLabel(t, row.key)}</td>
                  {matrix.platforms.map((platform) => (
                    <td key={platform} className="px-3 py-3 text-right font-mono text-fg">
                      {row.values[platform] ?? 0}
                    </td>
                  ))}
                  <td className="py-3 pl-3 text-right font-mono font-semibold text-accent">
                    {row.total}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty />
      )}
    </DashboardCard>
  );
}

type HeatmapMetric = 'pageViews' | 'leads';

export function ActivityHeatmap({ data, timeZone }: { data: AnalyticsResponse; timeZone: string }) {
  const t = useAdminT();
  const [metric, setMetric] = useState<HeatmapMetric>('leads');
  const byCell = new Map(
    data.activityHeatmap.map((point) => [`${point.day}:${point.hour}`, point]),
  );
  const max = Math.max(1, ...data.activityHeatmap.map((point) => point[metric]));
  const days = [
    t('analytics.weekday.mon'),
    t('analytics.weekday.tue'),
    t('analytics.weekday.wed'),
    t('analytics.weekday.thu'),
    t('analytics.weekday.fri'),
    t('analytics.weekday.sat'),
    t('analytics.weekday.sun'),
  ];

  return (
    <DashboardCard
      title={t('analytics.heatmap.title')}
      description={t('analytics.heatmap.hint', { timeZone })}
      action={
        <Segmented
          value={metric}
          onChange={(value) => setMetric(value as HeatmapMetric)}
          options={[
            { value: 'leads', label: t('analytics.leads') },
            { value: 'pageViews', label: t('analytics.pageViews') },
          ]}
        />
      }
    >
      <div className="overflow-x-auto">
        <div className="min-w-[720px]">
          <div className="mb-1 grid grid-cols-[44px_repeat(24,minmax(18px,1fr))] gap-1">
            <span />
            {Array.from({ length: 24 }, (_, hour) => (
              <span key={hour} className="text-center font-mono text-[9px] text-muted">
                {hour % 3 === 0 ? hour : ''}
              </span>
            ))}
          </div>
          <div className="flex flex-col gap-1">
            {days.map((dayLabel, dayIndex) => (
              <div
                key={dayLabel}
                className="grid grid-cols-[44px_repeat(24,minmax(18px,1fr))] gap-1"
              >
                <span className="self-center text-[11px] text-muted">{dayLabel}</span>
                {Array.from({ length: 24 }, (_, hour) => {
                  const point = byCell.get(`${dayIndex + 1}:${hour}`);
                  const value = point?.[metric] ?? 0;
                  const opacity = value ? 0.15 + Math.sqrt(value / max) * 0.85 : 0;
                  return (
                    <div
                      key={hour}
                      title={t('analytics.heatmap.cell', {
                        day: dayLabel,
                        hour,
                        value,
                        metric:
                          metric === 'leads' ? t('analytics.leads') : t('analytics.pageViews'),
                      })}
                      className="aspect-square rounded-[3px] bg-surface-hover"
                      style={
                        value
                          ? {
                              backgroundColor: `color-mix(in oklch, var(--accent) ${Math.round(opacity * 100)}%, var(--surface-hover))`,
                            }
                          : undefined
                      }
                    />
                  );
                })}
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-end gap-1 text-[10px] text-muted">
            <span>{t('analytics.low')}</span>
            {[0.15, 0.35, 0.55, 0.75, 1].map((opacity) => (
              <span key={opacity} className="size-3 rounded-[2px] bg-accent" style={{ opacity }} />
            ))}
            <span>{t('analytics.high')}</span>
          </div>
        </div>
      </div>
    </DashboardCard>
  );
}

function buildMatrix(rows: SourceBreakdown[]) {
  const platformTotals = new Map<string, number>();
  const values = rows.map((source) => {
    const byPlatform: Record<string, number> = {};
    for (const target of source.targets) {
      if (!target.isLead || target.leads === 0) continue;
      const platform = target.platform || 'unknown';
      byPlatform[platform] = (byPlatform[platform] ?? 0) + target.leads;
      platformTotals.set(platform, (platformTotals.get(platform) ?? 0) + target.leads);
    }
    return {
      key: source.key,
      values: byPlatform,
      total: Object.values(byPlatform).reduce((sum, value) => sum + value, 0),
    };
  });
  const platforms = [...platformTotals]
    .sort((a, b) => b[1] - a[1] || compareText(a[0], b[0]))
    .slice(0, 8)
    .map(([platform]) => platform);
  return { platforms, rows: values.sort((a, b) => b.total - a.total) };
}

function DashboardCard({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[var(--radius-panel)] border border-border bg-surface p-4">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-fg">{title}</h2>
          <p className="mt-0.5 text-[11px] text-muted">{description}</p>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function Empty() {
  const t = useAdminT();
  return <p className="py-6 text-center text-[13px] text-muted">{t('analytics.empty.leads')}</p>;
}

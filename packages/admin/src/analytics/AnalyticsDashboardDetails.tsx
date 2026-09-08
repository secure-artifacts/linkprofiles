import { useMemo, useState } from 'react';
import type { AnalyticsResponse, SourceBreakdown } from '../api/types.js';
import { Segmented } from '../ui/Segmented.js';
import { Select } from '../ui/Select.js';
import { countryLabel, percent, platformLabel, sourceLabel } from './labels.js';

export function SourceContactMatrix({ data }: { data: AnalyticsResponse['crossBreakdowns'] }) {
  const [sourceFilter, setSourceFilter] = useState('');
  const [countryFilter, setCountryFilter] = useState('');
  const selectedCountry = data.countries.find((country) => country.key === countryFilter);
  const rows = (selectedCountry?.sources ?? data.sources).filter(
    (source) => !sourceFilter || source.key === sourceFilter,
  );
  const matrix = useMemo(() => buildMatrix(rows), [rows]);

  return (
    <DashboardCard
      title="来源 × 联系方式"
      description="直接看每个平台最终带来了哪些联系点击；来源和国家筛选会同时更新矩阵。"
    >
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-[var(--radius-control)] bg-bg p-2">
        <span className="px-1 text-[12px] font-medium text-muted">联动筛选</span>
        <Select
          value={sourceFilter}
          onChange={setSourceFilter}
          aria-label="矩阵来源筛选"
          options={[
            { value: '', label: '全部来源' },
            ...data.sources.map((source) => ({
              value: source.key,
              label: sourceLabel(source.key),
            })),
          ]}
        />
        <Select
          value={countryFilter}
          onChange={setCountryFilter}
          aria-label="矩阵国家筛选"
          options={[
            { value: '', label: '全部国家' },
            ...data.countries.map((country) => ({
              value: country.key,
              label: countryLabel(country.key),
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
            清除筛选
          </button>
        ) : null}
      </div>
      {matrix.platforms.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-[13px]">
            <thead>
              <tr className="border-b border-border text-muted">
                <th className="py-2 text-left font-medium">来源</th>
                {matrix.platforms.map((platform) => (
                  <th key={platform} className="px-3 py-2 text-right font-medium">
                    {platformLabel(platform)}
                  </th>
                ))}
                <th className="py-2 pl-3 text-right font-medium">合计</th>
              </tr>
            </thead>
            <tbody>
              {matrix.rows.map((row) => (
                <tr key={row.key} className="border-b border-border last:border-0">
                  <td className="py-3 font-medium text-fg">{sourceLabel(row.key)}</td>
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
  const [metric, setMetric] = useState<HeatmapMetric>('leads');
  const byCell = new Map(
    data.activityHeatmap.map((point) => [`${point.day}:${point.hour}`, point]),
  );
  const max = Math.max(1, ...data.activityHeatmap.map((point) => point[metric]));
  const days = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

  return (
    <DashboardCard
      title="星期 × 小时热力图"
      description={`按 ${timeZone} 展示；只统计仍保留精确发生时间的明细事件。`}
      action={
        <Segmented
          value={metric}
          onChange={(value) => setMetric(value as HeatmapMetric)}
          options={[
            { value: 'leads', label: '联系点击' },
            { value: 'pageViews', label: '进入页面' },
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
                      title={`${dayLabel} ${hour}:00：${value} 次${metric === 'leads' ? '联系点击' : '进入'}`}
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
            <span>少</span>
            {[0.15, 0.35, 0.55, 0.75, 1].map((opacity) => (
              <span key={opacity} className="size-3 rounded-[2px] bg-accent" style={{ opacity }} />
            ))}
            <span>多</span>
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
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
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
  return <p className="py-6 text-center text-[13px] text-muted">当前范围暂无联系点击</p>;
}

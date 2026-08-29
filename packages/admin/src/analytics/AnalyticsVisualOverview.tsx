import type { AnalyticsResponse } from '../api/types.js';
import worldMap from '../assets/world-map.json';
import { countryLabel, percent, sourceLabel } from './labels.js';

type CrossBreakdowns = AnalyticsResponse['crossBreakdowns'];

export function AnalyticsVisualOverview({ data }: { data: CrossBreakdowns }) {
  return (
    <section aria-labelledby="analytics-overview-title">
      <div className="mb-3">
        <h2 id="analytics-overview-title" className="text-base font-semibold text-fg">
          转化概览
        </h2>
        <p className="mt-1 text-[12px] text-muted">先看分布和差异，再到下方查看完整明细。</p>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <VisualCard title="来源转化" description="各来源带来的进入页面与联系点击">
          <SourceRanking rows={data.sources} />
        </VisualCard>
        <VisualCard title="联系方式排行" description="联系按钮点击量及主要来源">
          <ContactRanking rows={data.targets} />
        </VisualCard>
        <div className="xl:col-span-2">
          <VisualCard title="国家分布" description="颜色越深，进入页面次数越多">
            <CountryDistribution rows={data.countries} />
          </VisualCard>
        </div>
      </div>
    </section>
  );
}

function SourceRanking({ rows }: { rows: CrossBreakdowns['sources'] }) {
  const topRows = rows.slice(0, 8);
  const maxViews = Math.max(1, ...topRows.map((row) => row.pageViews));
  if (!topRows.length) return <EmptyVisual />;

  return (
    <div className="flex flex-col gap-3">
      {topRows.map((row) => (
        <div key={row.key}>
          <div className="mb-1.5 flex items-baseline justify-between gap-3 text-[13px]">
            <span className="truncate font-medium text-fg">{sourceLabel(row.key)}</span>
            <span className="shrink-0 font-mono text-fg">
              {row.pageViews} 进入 · <span className="text-accent">{row.leads} 联系</span>
            </span>
          </div>
          <div className="relative h-2 overflow-hidden rounded-full bg-surface-hover">
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-accent/25"
              style={{ width: `${Math.max(2, (row.pageViews / maxViews) * 100)}%` }}
            />
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-accent"
              style={{ width: `${row.pageViews ? (row.leads / maxViews) * 100 : 0}%` }}
            />
          </div>
          <p className="mt-1 text-right text-[11px] text-muted">
            联系 / 进入 {percent(row.leadRate)}
          </p>
        </div>
      ))}
      <div className="flex gap-4 border-t border-border pt-2 text-[11px] text-muted">
        <Key color="bg-accent/25" label="进入页面" />
        <Key color="bg-accent" label="联系点击" />
      </div>
    </div>
  );
}

function ContactRanking({ rows }: { rows: CrossBreakdowns['targets'] }) {
  const contacts = rows.filter((row) => row.isLead).slice(0, 8);
  const totalClicks = contacts.reduce((sum, row) => sum + row.clicks, 0);
  const maxClicks = Math.max(1, ...contacts.map((row) => row.clicks));
  if (!contacts.length) return <EmptyVisual />;

  return (
    <div className="flex flex-col gap-3">
      {contacts.map((row, index) => {
        const primarySource = [...row.sources].sort((a, b) => b.clicks - a.clicks)[0];
        return (
          <div
            key={row.id}
            className="grid grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-2.5"
          >
            <span className="font-mono text-[12px] text-muted">{index + 1}</span>
            <div className="min-w-0">
              <div className="mb-1.5 flex items-baseline justify-between gap-2">
                <span className="truncate text-[13px] font-medium text-fg">{row.title}</span>
                <span className="shrink-0 text-[11px] text-muted">
                  {primarySource ? `主要来自 ${sourceLabel(primarySource.key)}` : '暂无来源'}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-surface-hover">
                <div
                  className="h-full rounded-full bg-[#2563eb]"
                  style={{ width: `${Math.max(2, (row.clicks / maxClicks) * 100)}%` }}
                />
              </div>
            </div>
            <div className="min-w-16 text-right">
              <p className="font-mono text-[13px] font-medium text-fg">{row.clicks}</p>
              <p className="text-[11px] text-muted">
                {totalClicks ? percent(row.clicks / totalClicks) : '0.0%'}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CountryDistribution({ rows }: { rows: CrossBreakdowns['countries'] }) {
  const values = new Map(rows.map((row) => [row.key.toLowerCase(), row.pageViews]));
  const maxViews = Math.max(1, ...rows.map((row) => row.pageViews));
  const topCountries = rows.slice(0, 6);
  if (!rows.length) return <EmptyVisual />;

  return (
    <div className="grid items-center gap-5 lg:grid-cols-[minmax(0,1.7fr)_minmax(240px,0.7fr)]">
      <div className="overflow-hidden rounded-[var(--radius-control)] bg-bg p-2">
        <svg
          viewBox={worldMap.viewBox}
          role="img"
          aria-label="按进入页面次数着色的世界地图"
          className="h-auto w-full"
        >
          {worldMap.layers.map((country) => {
            const value = values.get(country.id) ?? 0;
            const intensity = value ? 0.22 + Math.sqrt(value / maxViews) * 0.78 : 0;
            return (
              <path
                key={country.id}
                d={country.d}
                fill={value ? 'var(--accent)' : 'var(--surface-hover)'}
                fillOpacity={value ? intensity : 1}
                stroke="var(--surface)"
                strokeWidth="0.8"
              >
                <title>{`${countryLabel(country.id)}：${value} 次进入`}</title>
              </path>
            );
          })}
        </svg>
      </div>
      <div className="flex flex-col gap-2">
        {topCountries.map((row, index) => (
          <div
            key={row.key || 'unknown'}
            className="grid grid-cols-[22px_minmax(0,1fr)_auto] items-center gap-2 border-b border-border py-2 last:border-0"
          >
            <span className="font-mono text-[11px] text-muted">{index + 1}</span>
            <div className="min-w-0">
              <p className="truncate text-[13px] font-medium text-fg">{countryLabel(row.key)}</p>
              <p className="text-[11px] text-muted">联系 / 进入 {percent(row.leadRate)}</p>
            </div>
            <div className="text-right font-mono text-[12px]">
              <p className="text-fg">{row.pageViews} 进入</p>
              <p className="text-accent">{row.leads} 联系</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Key({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`size-2 rounded-full ${color}`} />
      {label}
    </span>
  );
}

function EmptyVisual() {
  return <p className="py-8 text-center text-[13px] text-muted">当前时间范围暂无数据</p>;
}

function VisualCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="h-full rounded-[var(--radius-panel)] border border-border bg-surface p-4">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-fg">{title}</h3>
        <p className="mt-0.5 text-[11px] text-muted">{description}</p>
      </div>
      {children}
    </div>
  );
}

import type { AnalyticsResponse } from '../api/types.js';
import { percent, sourceLabel } from './labels.js';
import { useAdminT, useLocale } from '../i18n/runtime.js';

type CrossBreakdowns = AnalyticsResponse['crossBreakdowns'];

export function AnalyticsVisualOverview({ data }: { data: CrossBreakdowns }) {
  const t = useAdminT();
  return (
    <section aria-labelledby="analytics-overview-title">
      <div className="mb-3">
        <h2 id="analytics-overview-title" className="text-base font-semibold text-fg">
          {t('overview.title')}
        </h2>
        <p className="mt-1 text-[12px] text-muted">{t('overview.hint')}</p>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <VisualCard title={t('overview.sources.title')} description={t('overview.sources.hint')}>
          <SourceRanking rows={data.sources} />
        </VisualCard>
        <VisualCard title={t('overview.channels.title')} description={t('overview.channels.hint')}>
          <ContactRanking rows={data.targets} />
        </VisualCard>
      </div>
    </section>
  );
}

function SourceRanking({ rows }: { rows: CrossBreakdowns['sources'] }) {
  const t = useAdminT();
  const topRows = rows.slice(0, 8);
  const maxViews = Math.max(1, ...topRows.map((row) => row.pageViews));
  if (!topRows.length) return <EmptyVisual />;

  return (
    <div className="flex flex-col gap-3">
      {topRows.map((row) => (
        <div key={row.key}>
          <div className="mb-1.5 flex items-baseline justify-between gap-3 text-[13px]">
            <span className="truncate font-medium text-fg">{sourceLabel(t, row.key)}</span>
            <span className="shrink-0 font-mono text-fg">
              {t('analytics.viewsAndLeads', { views: row.pageViews, leads: row.leads })}
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
            {t('analytics.leadPerVisit', { percent: percent(row.leadRate) })}
          </p>
        </div>
      ))}
      <div className="flex gap-4 border-t border-border pt-2 text-[11px] text-muted">
        <Key color="bg-accent/25" label={t('analytics.pageViews')} />
        <Key color="bg-accent" label={t('analytics.leads')} />
      </div>
    </div>
  );
}

function ContactRanking({ rows }: { rows: CrossBreakdowns['targets'] }) {
  const t = useAdminT();
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
                  {primarySource
                    ? t('overview.mostlyFrom', { source: sourceLabel(t, primarySource.key) })
                    : t('overview.noSource')}
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

function Key({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`size-2 rounded-full ${color}`} />
      {label}
    </span>
  );
}

function EmptyVisual() {
  const t = useAdminT();
  return <p className="py-8 text-center text-[13px] text-muted">{t('analytics.empty.range')}</p>;
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

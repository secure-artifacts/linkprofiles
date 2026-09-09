import { useEffect, useMemo, useState } from 'react';
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { AnalyticsResponse, CountryDailyBreakdown } from '../api/types.js';
import worldMap from '../assets/world-map.json';
import { Segmented } from '../ui/Segmented.js';
import { countryLabel, percent, platformLabel, sourceLabel } from './labels.js';
import { useAdminT, useLocale } from '../i18n/runtime.js';
import { compareText } from '@link-profile/shared';

type CountryMetric = 'pageViews' | 'clicks' | 'leads';
type PlatformMetric = { key: string; clicks: number; leads: number };
type GlobalCountryData = Pick<AnalyticsResponse, 'totals' | 'crossBreakdowns' | 'countryDaily'>;

const METRIC_KEYS = {
  pageViews: 'analytics.opens',
  clicks: 'analytics.clicks',
  leads: 'analytics.leads',
} as const satisfies Record<CountryMetric, string>;

export function GlobalCountryAnalytics({ data }: { data: GlobalCountryData }) {
  const t = useAdminT();
  const locale = useLocale();
  const countries = data.crossBreakdowns.countries;
  const [metric, setMetric] = useState<CountryMetric>('pageViews');
  const [selectedCountry, setSelectedCountry] = useState(countries[0]?.key ?? '');
  const countryByKey = useMemo(
    () => new Map(countries.map((country) => [country.key.toUpperCase(), country])),
    [countries],
  );
  const dailyByCountry = useMemo(() => groupDailyByCountry(data.countryDaily), [data.countryDaily]);
  const platformByCountry = useMemo(
    () => aggregatePlatformsByCountry(data.countryDaily),
    [data.countryDaily],
  );
  const topPlatforms = useMemo(() => topPlatformKeys(data.countryDaily, 5), [data.countryDaily]);

  useEffect(() => {
    if (selectedCountry && countries.some((country) => country.key === selectedCountry)) return;
    setSelectedCountry(countries[0]?.key ?? '');
  }, [countries, selectedCountry]);

  if (!countries.length) {
    return (
      <section className="rounded-[var(--radius-panel)] border border-border bg-surface p-4">
        <Header />
        <p className="py-10 text-center text-[13px] text-muted">{t('analytics.empty.countries')}</p>
      </section>
    );
  }

  const selected = countries.find((country) => country.key === selectedCountry) ?? countries[0]!;
  const selectedDaily = dailyByCountry.get(selected.key) ?? [];
  const selectedPlatforms = platformByCountry.get(selected.key) ?? [];
  const maxValue = Math.max(1, ...countries.map((country) => country[metric]));
  const knownCountries = countries.filter((country) => country.key).length;
  const topCountry = countries.find((country) => country.key) ?? countries[0]!;

  return (
    <section
      aria-labelledby="global-country-title"
      className="rounded-[var(--radius-panel)] border border-border bg-surface p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <Header />
        <Segmented
          value={metric}
          onChange={(value) => setMetric(value as CountryMetric)}
          options={[
            { value: 'pageViews', label: t('analytics.opens') },
            { value: 'clicks', label: t('analytics.clicks') },
            { value: 'leads', label: t('analytics.leads') },
          ]}
        />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Summary label={t('country.coverage')} value={knownCountries} />
        <Summary label={t('country.globalOpens')} value={data.totals.pageViews} />
        <Summary label={t('country.globalLeads')} value={data.totals.leads} />
        <Summary
          label={t('country.mostOpens')}
          value={countryLabel(t, locale, topCountry.key)}
          hint={t('country.opensCount', { count: topCountry.pageViews })}
        />
      </div>

      <div className="mt-4 grid items-start gap-4 xl:grid-cols-[minmax(0,1.55fr)_360px]">
        <div className="overflow-hidden rounded-[var(--radius-control)] bg-bg p-2">
          <svg
            viewBox={worldMap.viewBox}
            role="img"
            aria-label={t('country.map.aria', { metric: t(METRIC_KEYS[metric]) })}
            className="h-auto w-full"
          >
            {worldMap.layers.map((layer) => {
              const country = countryByKey.get(layer.id.toUpperCase());
              const value = country?.[metric] ?? 0;
              const intensity = value ? 0.2 + Math.sqrt(value / maxValue) * 0.8 : 0;
              const active = selected.key.toLowerCase() === layer.id;
              return (
                <path
                  key={layer.id}
                  d={layer.d}
                  fill={value ? 'var(--accent)' : 'var(--surface-hover)'}
                  fillOpacity={value ? intensity : 1}
                  stroke={active ? 'var(--fg)' : 'var(--surface)'}
                  strokeWidth={active ? 2.4 : 0.8}
                  role={country ? 'button' : undefined}
                  tabIndex={country ? 0 : undefined}
                  className={country ? 'cursor-pointer outline-none' : undefined}
                  onClick={() => country && setSelectedCountry(country.key)}
                  onKeyDown={(event) => {
                    if (country && (event.key === 'Enter' || event.key === ' ')) {
                      event.preventDefault();
                      setSelectedCountry(country.key);
                    }
                  }}
                >
                  <title>
                    {country
                      ? t('country.map.tooltip', {
                          country: countryLabel(t, locale, country.key),
                          opens: country.pageViews,
                          leads: country.leads,
                        })
                      : t('country.map.noData', { country: countryLabel(t, locale, layer.id) })}
                  </title>
                </path>
              );
            })}
          </svg>
          <div className="mt-1 flex items-center justify-end gap-2 px-2 text-[11px] text-muted">
            <span>{t('analytics.low')}</span>
            {[0.18, 0.38, 0.6, 0.82, 1].map((opacity) => (
              <span key={opacity} className="size-3 rounded-sm bg-accent" style={{ opacity }} />
            ))}
            <span>{t('analytics.high')}</span>
          </div>
        </div>

        <CountryRanking
          countries={countries}
          metric={metric}
          selected={selected.key}
          onSelect={setSelectedCountry}
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(300px,0.75fr)]">
        <CountryDailyTrend country={selected.key} rows={selectedDaily} />
        <PlatformComposition country={selected.key} rows={selectedPlatforms} />
      </div>

      <CountrySummaryTable
        countries={countries}
        platformByCountry={platformByCountry}
        topPlatforms={topPlatforms}
        selected={selected.key}
        onSelect={setSelectedCountry}
      />

      <CountryDailyTable country={selected.key} rows={selectedDaily} platformKeys={topPlatforms} />
    </section>
  );
}

function Header() {
  const t = useAdminT();
  return (
    <div>
      <h2 id="global-country-title" className="text-base font-semibold text-fg">
        {t('country.title')}
      </h2>
      <p className="mt-1 text-[12px] text-muted">{t('country.hint')}</p>
    </div>
  );
}

function Summary({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <div className="rounded-[var(--radius-control)] bg-bg px-3 py-3">
      <p className="text-[11px] text-muted">{label}</p>
      <p className="mt-1 truncate font-mono text-lg font-semibold text-fg">{value}</p>
      {hint ? <p className="mt-0.5 text-[11px] text-muted">{hint}</p> : null}
    </div>
  );
}

function CountryRanking({
  countries,
  metric,
  selected,
  onSelect,
}: {
  countries: AnalyticsResponse['crossBreakdowns']['countries'];
  metric: CountryMetric;
  selected: string;
  onSelect: (country: string) => void;
}) {
  const t = useAdminT();
  const locale = useLocale();
  const rows = [...countries].sort((a, b) => b[metric] - a[metric]).slice(0, 12);
  const max = Math.max(1, ...rows.map((country) => country[metric]));
  return (
    <div className="rounded-[var(--radius-control)] border border-border p-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[13px] font-semibold text-fg">{t('country.ranking.title')}</h3>
        <span className="text-[11px] text-muted">{t(METRIC_KEYS[metric])}</span>
      </div>
      <div className="max-h-[420px] overflow-y-auto pr-1">
        {rows.map((country, index) => (
          <button
            key={country.key || 'unknown'}
            type="button"
            onClick={() => onSelect(country.key)}
            className={`grid w-full grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-2 rounded-md px-2 py-2 text-left ${
              selected === country.key ? 'bg-accent-soft' : 'hover:bg-surface-hover'
            }`}
          >
            <span className="font-mono text-[11px] text-muted">{index + 1}</span>
            <span className="min-w-0">
              <span className="block truncate text-[12px] font-medium text-fg">
                {countryLabel(t, locale, country.key)}
              </span>
              <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-surface-hover">
                <span
                  className="block h-full rounded-full bg-accent"
                  style={{ width: `${Math.max(2, (country[metric] / max) * 100)}%` }}
                />
              </span>
            </span>
            <span className="font-mono text-[12px] font-medium text-fg">{country[metric]}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function CountryDailyTrend({ country, rows }: { country: string; rows: CountryDailyBreakdown[] }) {
  const t = useAdminT();
  const locale = useLocale();
  return (
    <div className="rounded-[var(--radius-control)] border border-border p-3">
      <h3 className="text-[13px] font-semibold text-fg">
        {t('country.dailyTrend', { country: countryLabel(t, locale, country) })}
      </h3>
      <p className="mt-0.5 text-[11px] text-muted">{t('country.ranking.hint')}</p>
      {rows.length ? (
        <ResponsiveContainer width="100%" height={240}>
          <ComposedChart data={rows} margin={{ top: 16, right: 8, left: -14, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="day"
              tickFormatter={(value: string) => value.slice(5).replace('-', '/')}
              tick={{ fontSize: 10, fill: 'var(--muted)' }}
              axisLine={{ stroke: 'var(--border)' }}
              tickLine={false}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fontSize: 10, fill: 'var(--muted)' }}
              axisLine={false}
              tickLine={false}
              width={34}
            />
            <RechartsTooltip
              formatter={(value, name) => [
                String(value ?? 0),
                name === 'pageViews'
                  ? t('analytics.opens')
                  : name === 'clicks'
                    ? t('analytics.clicks')
                    : t('analytics.leads'),
              ]}
              contentStyle={{ borderRadius: 6, border: '1px solid var(--border)', fontSize: 12 }}
            />
            <Area
              type="monotone"
              dataKey="pageViews"
              stroke="var(--accent)"
              fill="var(--accent-soft)"
              strokeWidth={2}
            />
            <Bar dataKey="clicks" fill="#2563eb" opacity={0.55} radius={[3, 3, 0, 0]} />
            <Area
              type="monotone"
              dataKey="leads"
              stroke="#e11d48"
              fill="transparent"
              strokeWidth={2}
            />
          </ComposedChart>
        </ResponsiveContainer>
      ) : (
        <Empty />
      )}
    </div>
  );
}

function PlatformComposition({ country, rows }: { country: string; rows: PlatformMetric[] }) {
  const t = useAdminT();
  const locale = useLocale();
  const total = rows.reduce((sum, row) => sum + row.clicks, 0);
  const max = Math.max(1, ...rows.map((row) => row.clicks));
  return (
    <div className="rounded-[var(--radius-control)] border border-border p-3">
      <h3 className="text-[13px] font-semibold text-fg">
        {t('country.channelClicks', { country: countryLabel(t, locale, country) })}
      </h3>
      <p className="mt-0.5 text-[11px] text-muted">{t('country.platformMix')}</p>
      {rows.length ? (
        <div className="mt-4 flex flex-col gap-3">
          {rows.map((row) => (
            <div key={row.key}>
              <div className="flex items-baseline justify-between gap-3 text-[12px]">
                <span className="font-medium text-fg">{platformLabel(t, row.key)}</span>
                <span className="font-mono text-fg">
                  {t('country.clicksShare', {
                    count: row.clicks,
                    percent: total ? percent(row.clicks / total) : '0.0%',
                  })}
                </span>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-hover">
                <div
                  className="h-full rounded-full bg-[#2563eb]"
                  style={{ width: `${Math.max(2, (row.clicks / max) * 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <Empty />
      )}
    </div>
  );
}

function CountrySummaryTable({
  countries,
  platformByCountry,
  topPlatforms,
  selected,
  onSelect,
}: {
  countries: AnalyticsResponse['crossBreakdowns']['countries'];
  platformByCountry: Map<string, PlatformMetric[]>;
  topPlatforms: string[];
  selected: string;
  onSelect: (country: string) => void;
}) {
  const t = useAdminT();
  const locale = useLocale();
  return (
    <div className="mt-4">
      <div className="mb-2">
        <h3 className="text-[13px] font-semibold text-fg">{t('country.table.title')}</h3>
        <p className="mt-0.5 text-[11px] text-muted">{t('country.table.hint')}</p>
      </div>
      <div className="overflow-x-auto rounded-[var(--radius-control)] border border-border">
        <table className="w-full min-w-[860px] border-collapse text-[12px]">
          <thead className="bg-bg text-left text-muted">
            <tr>
              <th className="px-3 py-2 font-medium">{t('country.column.country')}</th>
              <th className="px-3 py-2 text-right font-medium">{t('country.column.opens')}</th>
              <th className="px-3 py-2 text-right font-medium">{t('analytics.clicks')}</th>
              <th className="px-3 py-2 text-right font-medium">{t('analytics.leads')}</th>
              <th className="px-3 py-2 font-medium">{t('country.column.topSources')}</th>
              {topPlatforms.map((platform) => (
                <th key={platform} className="px-3 py-2 text-right font-medium">
                  {platformLabel(t, platform)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {countries.map((country) => {
              const platforms = new Map(
                (platformByCountry.get(country.key) ?? []).map((row) => [row.key, row.clicks]),
              );
              const topSource = country.sources[0];
              return (
                <tr
                  key={country.key || 'unknown'}
                  className={`cursor-pointer border-t border-border hover:bg-surface-hover ${
                    selected === country.key ? 'bg-accent-soft' : ''
                  }`}
                  onClick={() => onSelect(country.key)}
                >
                  <td className="px-3 py-2.5 font-medium text-fg">
                    {countryLabel(t, locale, country.key)}
                  </td>
                  <Number value={country.pageViews} />
                  <Number value={country.clicks} />
                  <Number value={country.leads} accent />
                  <td className="px-3 py-2.5 text-muted">
                    {topSource
                      ? `${sourceLabel(t, topSource.key)} · ${topSource.pageViews}`
                      : t('analytics.none')}
                  </td>
                  {topPlatforms.map((platform) => (
                    <Number key={platform} value={platforms.get(platform) ?? 0} />
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CountryDailyTable({
  country,
  rows,
  platformKeys,
}: {
  country: string;
  rows: CountryDailyBreakdown[];
  platformKeys: string[];
}) {
  const t = useAdminT();
  const locale = useLocale();
  return (
    <div className="mt-4">
      <h3 className="text-[13px] font-semibold text-fg">
        {t('country.dailyDetail', { country: countryLabel(t, locale, country) })}
      </h3>
      <p className="mt-0.5 text-[11px] text-muted">{t('country.daily.hint')}</p>
      <div className="mt-2 overflow-x-auto rounded-[var(--radius-control)] border border-border">
        <table className="w-full min-w-[760px] border-collapse text-[12px]">
          <thead className="bg-bg text-muted">
            <tr>
              <th className="px-3 py-2 text-left font-medium">{t('analytics.date')}</th>
              <th className="px-3 py-2 text-right font-medium">{t('country.column.opens')}</th>
              <th className="px-3 py-2 text-right font-medium">{t('analytics.clicks')}</th>
              <th className="px-3 py-2 text-right font-medium">{t('analytics.leads')}</th>
              {platformKeys.map((platform) => (
                <th key={platform} className="px-3 py-2 text-right font-medium">
                  {platformLabel(t, platform)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...rows].reverse().map((row) => {
              const platforms = new Map(row.platforms.map((item) => [item.key, item.clicks]));
              return (
                <tr key={row.day} className="border-t border-border">
                  <td className="px-3 py-2.5 font-mono text-fg">{row.day}</td>
                  <Number value={row.pageViews} />
                  <Number value={row.clicks} />
                  <Number value={row.leads} accent />
                  {platformKeys.map((platform) => (
                    <Number key={platform} value={platforms.get(platform) ?? 0} />
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
        {!rows.length ? <Empty /> : null}
      </div>
    </div>
  );
}

function Number({ value, accent = false }: { value: number; accent?: boolean }) {
  return (
    <td className={`px-3 py-2.5 text-right font-mono ${accent ? 'text-accent' : 'text-fg'}`}>
      {value}
    </td>
  );
}

function Empty() {
  const t = useAdminT();
  return <p className="py-8 text-center text-[12px] text-muted">{t('analytics.empty.inRange')}</p>;
}

function groupDailyByCountry(rows: CountryDailyBreakdown[]) {
  const grouped = new Map<string, CountryDailyBreakdown[]>();
  for (const row of rows) {
    const bucket = grouped.get(row.country) ?? [];
    bucket.push(row);
    grouped.set(row.country, bucket);
  }
  for (const bucket of grouped.values()) bucket.sort((a, b) => compareText(a.day, b.day));
  return grouped;
}

function aggregatePlatformsByCountry(rows: CountryDailyBreakdown[]) {
  const grouped = new Map<string, Map<string, PlatformMetric>>();
  for (const row of rows) {
    const country = grouped.get(row.country) ?? new Map<string, PlatformMetric>();
    for (const platform of row.platforms) {
      const total = country.get(platform.key) ?? { key: platform.key, clicks: 0, leads: 0 };
      total.clicks += platform.clicks;
      total.leads += platform.leads;
      country.set(platform.key, total);
    }
    grouped.set(row.country, country);
  }
  return new Map(
    [...grouped].map(([country, platforms]) => [
      country,
      [...platforms.values()].sort((a, b) => b.clicks - a.clicks || compareText(a.key, b.key)),
    ]),
  );
}

function topPlatformKeys(rows: CountryDailyBreakdown[], limit: number) {
  const totals = new Map<string, number>();
  for (const row of rows) {
    for (const platform of row.platforms) {
      totals.set(platform.key, (totals.get(platform.key) ?? 0) + platform.clicks);
    }
  }
  return [...totals]
    .sort((a, b) => b[1] - a[1] || compareText(a[0], b[0]))
    .slice(0, limit)
    .map(([key]) => key);
}

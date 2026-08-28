import { DEFAULT_DISPLAY_TIMEZONE } from '@link-profile/shared';
import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { request } from '../api/client.js';
import type { AnalyticsResponse, DimensionRow } from '../api/types.js';
import { Alert } from '../ui/Alert.js';
import { Segmented } from '../ui/Segmented.js';
import { Select } from '../ui/Select.js';

/** 展示时区。默认受众所在地，不是运营自己所在地。 */
const TIME_ZONES = [
  DEFAULT_DISPLAY_TIMEZONE,
  'America/Los_Angeles',
  'America/Chicago',
  'UTC',
  'Europe/London',
  'Asia/Shanghai',
  'Asia/Tokyo',
];

const ACCENT = 'oklch(0.455 0.105 151)';

interface AnalyticsPageProps {
  /** 只看某一个用户；不给就看可见范围内的全部 */
  userId?: string;
}

type Preset = 'today' | '7d' | '30d' | 'custom';

export function AnalyticsPage({ userId }: AnalyticsPageProps) {
  const [preset, setPreset] = useState<Preset>('7d');
  const [customRange, setCustomRange] = useState<[Date, Date] | null>(null);
  const [timeZone, setTimeZone] = useState(DEFAULT_DISPLAY_TIMEZONE);
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams({ tz: timeZone });
    if (preset === 'custom') {
      // 自定义区间要两端都选好了才查
      if (!customRange) return;
      params.set('from', customRange[0].toISOString());
      params.set('to', customRange[1].toISOString());
    } else {
      params.set('preset', preset);
    }
    if (userId) params.set('userId', userId);

    setError(null);
    request<AnalyticsResponse>(`/analytics?${params}`)
      .then(setData)
      .catch((err: Error) => setError(err.message));
  }, [preset, customRange, timeZone, userId]);

  if (error) return <Alert tone="danger" message="读不到数据" description={error} />;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-xl font-semibold text-fg">数据分析</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            value={preset}
            onChange={(value) => setPreset(value as Preset)}
            options={[
              { value: 'today', label: '今天' },
              { value: '7d', label: '7 天' },
              { value: '30d', label: '30 天' },
              { value: 'custom', label: '自定义' },
            ]}
          />
          {preset === 'custom' ? (
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                className="h-9 rounded-[var(--radius-control)] border border-border bg-surface px-2.5 text-[13px] text-fg outline-none focus:outline-2 focus:outline-accent"
                onChange={(e) => {
                  const from = e.target.value ? new Date(`${e.target.value}T00:00:00`) : null;
                  setCustomRange((prev) => (from ? [from, prev?.[1] ?? from] : null));
                }}
              />
              <span className="text-muted">—</span>
              <input
                type="date"
                className="h-9 rounded-[var(--radius-control)] border border-border bg-surface px-2.5 text-[13px] text-fg outline-none focus:outline-2 focus:outline-accent"
                onChange={(e) => {
                  const to = e.target.value ? new Date(`${e.target.value}T23:59:59.999`) : null;
                  setCustomRange((prev) => (to && prev ? [prev[0], to] : prev));
                }}
              />
            </div>
          ) : null}
          <Select
            value={timeZone}
            onChange={setTimeZone}
            options={TIME_ZONES.map((tz) => ({ value: tz, label: tz }))}
            aria-label="展示时区"
          />
        </div>
      </div>

      <Alert
        tone="info"
        message="这里的数字是次数，不是人数"
        description="不做访客去重：同一个人刷十次页就是十次页面浏览，连点五次就是五条线索。对外汇报时请说明这一点。"
      />

      {data ? (
        <AnalyticsResults data={data} timeZone={timeZone} />
      ) : (
        <p className="text-[13px] text-muted">选好起止日期后显示数据。</p>
      )}
    </div>
  );
}

/**
 * 把趋势桶补齐成区间内每天连续一根，缺失的天填零值。
 *
 * 后端 `queryTrend` 只 group by 真实有事件的行，数据稀疏时（比如区间内只有
 * 一天有数据）返回的数组会比区间短很多——直接喂给图表，单个数据点在
 * 等分布局下会占满整个宽度，读不出趋势。见 22 号票。
 *
 * 只处理按天粒度：按小时粒度（'today' 预设）数据量小，且已有 hourlyLeads
 * 覆盖对应视角，本身就是定长 24，不需要这里补。
 */
function fillDailyTrend(
  trend: AnalyticsResponse['trend'],
  range: AnalyticsResponse['range'],
): AnalyticsResponse['trend'] {
  if (range.granularity !== 'day') return trend;

  const byBucket = new Map(trend.map((point) => [point.bucket, point]));
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: range.timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const end = new Date(range.to);
  const filled: AnalyticsResponse['trend'] = [];
  for (let t = new Date(range.from); t < end; t = new Date(t.getTime() + 86_400_000)) {
    const bucket = fmt.format(t);
    filled.push(byBucket.get(bucket) ?? { bucket, pageViews: 0, clicks: 0, leads: 0 });
  }
  return filled;
}

/** 指标与图表。只有拿到数据才渲染，因此这里的 data 一定非空。 */
function AnalyticsResults({ data, timeZone }: { data: AnalyticsResponse; timeZone: string }) {
  const trend = useMemo(() => fillDailyTrend(data.trend, data.range), [data]);

  const peakHour = useMemo(() => {
    const max = Math.max(...data.hourlyLeads);
    return max === 0 ? null : data.hourlyLeads.indexOf(max);
  }, [data]);

  const hourly = useMemo(() => data.hourlyLeads.map((value, hour) => ({ hour, value })), [data]);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <MetricCard label="线索" value={data.totals.leads} />
        <MetricCard label="点击" value={data.totals.clicks} />
        <MetricCard label="页面浏览" value={data.totals.pageViews} />
        <MetricCard label="点击率" value={data.totals.ctr * 100} suffix="%" precision={1} />
      </div>

      <Panel title={`趋势（按${data.range.granularity === 'hour' ? '小时' : '天'}，${timeZone}）`}>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={trend} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
            <defs>
              <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={ACCENT} stopOpacity={0.28} />
                <stop offset="100%" stopColor={ACCENT} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="bucket"
              tickFormatter={(v: string) => v.slice(5).replace('-', '/')}
              tick={{ fontSize: 11, fill: 'var(--muted)' }}
              axisLine={{ stroke: 'var(--border)' }}
              tickLine={false}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fontSize: 11, fill: 'var(--muted)' }}
              axisLine={false}
              tickLine={false}
              width={36}
            />
            <RechartsTooltip
              formatter={(value, name) => [
                String(value ?? 0),
                name === 'pageViews' ? '浏览' : name === 'clicks' ? '点击' : '线索',
              ]}
              labelFormatter={(label) => String(label)}
              contentStyle={{
                borderRadius: 6,
                border: '1px solid var(--border)',
                fontSize: 12,
              }}
            />
            <Area
              type="monotone"
              dataKey="pageViews"
              stroke={ACCENT}
              strokeWidth={2}
              fill="url(#trendFill)"
              dot={{ r: 3, stroke: ACCENT, strokeWidth: 2, fill: 'var(--surface)' }}
              activeDot={{ r: 4 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </Panel>

      <Panel title="一天里的线索分布">
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={hourly} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="hour"
              ticks={[0, 4, 8, 12, 16, 20, 24]}
              tick={{ fontSize: 11, fill: 'var(--muted)' }}
              axisLine={{ stroke: 'var(--border)' }}
              tickLine={false}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fontSize: 11, fill: 'var(--muted)' }}
              axisLine={false}
              tickLine={false}
              width={28}
            />
            <RechartsTooltip
              formatter={(value) => [String(value ?? 0), '线索']}
              labelFormatter={(h) => `${h}:00`}
              contentStyle={{ borderRadius: 6, border: '1px solid var(--border)', fontSize: 12 }}
            />
            <Bar dataKey="value" fill={ACCENT} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
        {peakHour !== null ? (
          <p className="mt-2 text-[13px] text-muted">
            最活跃的时段是 {peakHour}:00（{timeZone}）。发帖引流挑这个前后最划算。
          </p>
        ) : null}
      </Panel>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <DimensionCard title="来源" rows={data.dimensions.sources} />
        <DimensionCard title="国家" rows={data.dimensions.countries} />
        <DimensionCard title="城市" rows={data.dimensions.cities} />
        <DimensionCard title="设备类型" rows={data.dimensions.devices} />
        <DimensionCard title="操作系统" rows={data.dimensions.operatingSystems} />
      </div>

      <Panel title="各按钮的点击率" action={<ExportCsvButton buttons={data.buttons} />}>
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-border text-left text-muted">
              <th className="py-2 font-medium">按钮</th>
              <th className="py-2 font-medium">类型</th>
              <th className="py-2 font-medium">点击</th>
              <th className="py-2 font-medium">点击率</th>
            </tr>
          </thead>
          <tbody>
            {data.buttons.map((button) => (
              <tr key={button.id} className="border-b border-border last:border-0">
                <td className="py-2 text-fg">{button.title}</td>
                <td className="py-2 text-muted">{button.isLead ? '联系类' : '内容类'}</td>
                <td className="py-2 font-mono text-fg">{button.clicks}</td>
                <td className="py-2 font-mono text-fg">{(button.ctr * 100).toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-[12px] text-muted">
          分母是页面浏览数，不是访客数 —— 按钮没有独立曝光，页面渲染一次全部按钮就都露过一次面。
        </p>
      </Panel>
    </div>
  );
}

function Panel({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="rounded-[var(--radius-panel)] border border-border bg-surface p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-fg">{title}</h2>
        {action}
      </div>
      {children}
    </div>
  );
}

function MetricCard({
  label,
  value,
  suffix = '',
  precision = 0,
}: {
  label: string;
  value: number;
  suffix?: string;
  precision?: number;
}) {
  return (
    <div className="rounded-[var(--radius-panel)] border border-border bg-surface p-4">
      <p className="text-[13px] text-muted">{label}</p>
      <p className="mt-1 font-mono text-2xl font-semibold text-fg">
        {value.toLocaleString('zh-CN', {
          minimumFractionDigits: precision,
          maximumFractionDigits: precision,
        })}
        {suffix}
      </p>
    </div>
  );
}

function DimensionCard({ title, rows }: { title: string; rows: DimensionRow[] }) {
  const top = rows.slice(0, 10);
  const max = Math.max(1, ...top.map((r) => r.pageViews));

  return (
    <Panel title={title}>
      {top.length === 0 ? (
        <p className="text-[13px] text-muted">暂无数据</p>
      ) : (
        <div className="flex flex-col gap-2.5">
          <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 text-[12px] font-medium text-muted">
            <span>{title}</span>
            <span className="w-12 text-right">浏览</span>
            <span className="w-12 text-right">点击</span>
            <span className="w-12 text-right">线索</span>
          </div>
          {top.map((row) => (
            <div key={row.key} className="flex flex-col gap-1">
              <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-2 text-[13px]">
                <span className="truncate text-fg">
                  {row.key || <span className="text-muted">未知</span>}
                </span>
                <span className="w-12 text-right font-mono text-fg">{row.pageViews}</span>
                <span className="w-12 text-right font-mono text-fg">{row.clicks}</span>
                <span className="w-12 text-right font-mono text-fg">{row.leads}</span>
              </div>
              <div className="h-1 w-full overflow-hidden rounded-full bg-surface-hover">
                <div
                  className="h-full rounded-full bg-accent"
                  style={{ width: `${Math.max(2, (row.pageViews / max) * 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

function ExportCsvButton({ buttons }: { buttons: AnalyticsResponse['buttons'] }) {
  const download = () => {
    const rows = [
      ['按钮', '类型', '点击', '点击率'],
      ...buttons.map((b) => [
        b.title,
        b.isLead ? '联系类' : '内容类',
        String(b.clicks),
        `${(b.ctr * 100).toFixed(1)}%`,
      ]),
    ];
    const csv = rows
      .map((r) => r.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '按钮点击率.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <button
      type="button"
      onClick={download}
      className="rounded-[var(--radius-control)] border border-border bg-surface px-2.5 py-1 text-[12px] font-medium text-fg hover:bg-surface-hover"
    >
      导出 CSV
    </button>
  );
}

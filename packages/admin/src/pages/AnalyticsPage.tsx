import { DEFAULT_DISPLAY_TIMEZONE } from '@link-profile/shared';
import { ArrowLeft, Copy, ExternalLink } from 'lucide-react';
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
import { useNavigate, useSearchParams } from 'react-router-dom';
import { request } from '../api/client.js';
import type {
  AnalyticsResponse,
  ContactTarget,
  CountryBreakdown,
  ProfilePerformance,
  SourceBreakdown,
  TargetBreakdown,
} from '../api/types.js';
import { useBreadcrumb } from '../nav/breadcrumb.js';
import { AnalyticsVisualOverview } from '../analytics/AnalyticsVisualOverview.js';
import { ActivityHeatmap, SourceContactMatrix } from '../analytics/AnalyticsDashboardDetails.js';
import { GlobalCountryAnalytics } from '../analytics/GlobalCountryAnalytics.js';
import { buildDashboardInsights, periodChange } from '../analytics/dashboard-insights.js';
import { countryLabel, percent, sourceLabel } from '../analytics/labels.js';
import { rankProfiles, type ProfileRankKey } from '../analytics/profile-ranking.js';
import { useSession } from '../session.js';
import { Alert } from '../ui/Alert.js';
import { Button } from '../ui/Button.js';
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

type Preset = 'today' | '7d' | '30d' | 'custom';

/**
 * 数据分析。
 *
 * 范围由查询串决定：`profileId` 看单个页面、`userId` 看一个账号名下全部页面的
 * 合计、都不给就是可见范围内的全部。放在 URL 里而不是组件状态里，前进后退
 * 才回得到刚才那个范围。
 */
export function AnalyticsPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const session = useSession();
  const userId = searchParams.get('userId');
  const profileId = searchParams.get('profileId');
  const [preset, setPreset] = useState<Preset>('7d');
  const [customRange, setCustomRange] = useState<[Date, Date] | null>(null);
  const [timeZone, setTimeZone] = useState(DEFAULT_DISPLAY_TIMEZONE);
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scope = data?.scope;
  const scopeName =
    scope?.kind === 'profile'
      ? scope.displayName || scope.shortName
      : scope?.kind === 'account'
        ? scope.label || scope.account
        : '数据分析总览';
  useBreadcrumb(
    scope?.kind === 'profile'
      ? [
          { label: '数据分析', to: '/analytics' },
          { label: scope.label || scope.account, to: `/analytics?userId=${scope.userId}` },
          { label: scopeName },
        ]
      : scope?.kind === 'account' && session.role !== 'user'
        ? [{ label: '数据分析', to: '/analytics' }, { label: scopeName }]
        : [{ label: scopeName }],
  );

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
    if (profileId) params.set('profileId', profileId);
    else if (userId) params.set('userId', userId);

    setError(null);
    request<AnalyticsResponse>(`/analytics?${params}`)
      .then(setData)
      .catch((err: Error) => setError(err.message));
  }, [preset, customRange, timeZone, userId, profileId]);

  if (error) return <Alert tone="danger" message="读不到数据" description={error} />;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          {scope?.kind === 'profile' || (scope?.kind === 'account' && session.role !== 'user') ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                navigate(
                  scope.kind === 'profile' ? `/analytics?userId=${scope.userId}` : '/analytics',
                )
              }
            >
              <ArrowLeft size={15} />
              返回
            </Button>
          ) : null}
          <div className="min-w-0">
            <h1 className="truncate font-display text-xl font-semibold text-fg">{scopeName}</h1>
            {scope?.kind === 'portfolio' ? (
              <p className="mt-1 text-[13px] text-muted">
                汇总全部可见个人页，并直接比较每个个人页的表现。
              </p>
            ) : scope?.kind === 'account' ? (
              <p className="mt-1 text-[13px] text-muted">
                登录账号 {scope.account} · {data?.performance.profiles.length ?? 0} 个个人页
              </p>
            ) : scope?.kind === 'profile' ? (
              <div className="mt-1 flex flex-wrap items-center gap-2 text-[13px] text-muted">
                <span className="font-mono">/{scope.shortName}</span>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 hover:text-fg"
                  onClick={() =>
                    void navigator.clipboard.writeText(`${location.origin}/${scope.shortName}`)
                  }
                >
                  <Copy size={13} /> 复制
                </button>
                <a
                  href={`/${scope.shortName}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 hover:text-fg"
                >
                  <ExternalLink size={13} /> 打开个人页
                </a>
              </div>
            ) : null}
          </div>
        </div>
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
        data.scope.kind === 'portfolio' ? (
          <PortfolioResults
            data={data}
            timeZone={timeZone}
            onOpenProfile={(id) => navigate(`/analytics?profileId=${id}`)}
            onOpenAccount={(id) => navigate(`/analytics?userId=${id}`)}
          />
        ) : data.scope.kind === 'account' ? (
          <AccountResults
            data={data}
            timeZone={timeZone}
            onOpen={(id) => navigate(`/analytics?profileId=${id}`)}
          />
        ) : (
          <AnalyticsResults data={data} timeZone={timeZone} />
        )
      ) : (
        <p className="text-[13px] text-muted">选好起止日期后显示数据。</p>
      )}
    </div>
  );
}

function PortfolioResults({
  data,
  timeZone,
  onOpenProfile,
  onOpenAccount,
}: {
  data: AnalyticsResponse;
  timeZone: string;
  onOpenProfile: (id: string) => void;
  onOpenAccount: (id: string) => void;
}) {
  const [rankBy, setRankBy] = useState<ProfileRankKey>('leads');
  const rankedProfiles = useMemo(
    () => rankProfiles(data.performance.profiles, rankBy, data.comparison.profiles),
    [data.performance.profiles, data.comparison.profiles, rankBy],
  );
  const previousById = useMemo(
    () => new Map(data.comparison.profiles.map((row) => [row.id, row])),
    [data.comparison.profiles],
  );
  const highlightsById = useMemo(
    () => new Map(data.profileHighlights.map((row) => [row.profileId, row])),
    [data.profileHighlights],
  );

  return (
    <div className="flex flex-col gap-4">
      <AnalyticsResults data={data} timeZone={timeZone} compact />
      <GlobalCountryAnalytics data={data} />

      <Panel
        title={`个人页排行 · ${rankedProfiles.length} 个个人页`}
        action={
          <Select
            value={rankBy}
            onChange={(value) => setRankBy(value as ProfileRankKey)}
            options={[
              { value: 'leads', label: '联系点击' },
              { value: 'pageViews', label: '进入页面' },
              { value: 'leadRate', label: '联系率' },
              { value: 'growth', label: '增长最快' },
              { value: 'opportunity', label: '待优化机会' },
            ]}
            aria-label="个人页排行方式"
          />
        }
      >
        <p className="mb-3 text-[12px] text-muted">
          跨账号直接比较全部个人页；点击任意一行查看该页的来源、国家与联系方式明细。
        </p>
        <ResponsiveTable
          headers={[
            '排名',
            '个人页',
            '所属账号',
            '主要来源 / 国家',
            '主要联系方式',
            '进入页面',
            '联系点击',
            '联系率',
            '较上期',
          ]}
        >
          {rankedProfiles.map((row, index) => (
            <PortfolioProfileRow
              key={row.id}
              rank={index + 1}
              row={row}
              previous={previousById.get(row.id)}
              highlight={highlightsById.get(row.id)}
              onOpen={onOpenProfile}
            />
          ))}
        </ResponsiveTable>
        {rankedProfiles.length === 0 ? <EmptyData /> : null}
      </Panel>

      <AggregateAnalysis data={data} timeZone={timeZone} showGlobalCountry={false} />

      <Panel title={`按账号汇总 · ${data.performance.accounts.length} 个账号`}>
        <p className="mb-3 text-[12px] text-muted">
          用于查看每个账号的整体贡献；点击账号可筛选其名下的个人页。
        </p>
        <ResponsiveTable
          headers={['账号', '个人页', '进入页面', '按钮点击', '联系点击', '联系 / 进入']}
        >
          {data.performance.accounts.map((row) => (
            <tr
              key={row.id}
              className="cursor-pointer border-b border-border last:border-0 hover:bg-surface-hover"
              onClick={() => onOpenAccount(row.id)}
            >
              <td className="py-3 pr-4">
                <div className="font-medium text-fg">{row.label || row.account}</div>
                <div className="mt-0.5 font-mono text-[11px] text-muted">{row.account}</div>
              </td>
              <NumberCell value={row.profileCount} />
              <NumberCell value={row.pageViews} />
              <NumberCell value={row.clicks} />
              <NumberCell value={row.leads} />
              <td className="py-3 pl-4 text-right font-mono font-medium text-accent">
                {percent(row.leadRate)}
              </td>
            </tr>
          ))}
        </ResponsiveTable>
        {data.performance.accounts.length === 0 ? <EmptyData /> : null}
      </Panel>
    </div>
  );
}

function PortfolioProfileRow({
  rank,
  row,
  previous,
  highlight,
  onOpen,
}: {
  rank: number;
  row: ProfilePerformance;
  previous?: ProfilePerformance;
  highlight?: AnalyticsResponse['profileHighlights'][number];
  onOpen: (id: string) => void;
}) {
  const leadChange = periodChange(row.leads, previous?.leads ?? 0);
  return (
    <tr
      className="cursor-pointer border-b border-border last:border-0 hover:bg-surface-hover"
      onClick={() => onOpen(row.id)}
    >
      <td className="py-3 pr-4 font-mono font-semibold text-muted">#{rank}</td>
      <td className="py-3 pr-4">
        <div className="font-medium text-fg">{row.displayName || row.shortName}</div>
        <div className="mt-0.5 font-mono text-[11px] text-muted">/{row.shortName}</div>
      </td>
      <td className="py-3 pr-4">
        <div className="text-fg">{row.accountLabel || row.account}</div>
        <div className="mt-0.5 font-mono text-[11px] text-muted">{row.account}</div>
      </td>
      <td className="min-w-40 py-3 pr-4 text-[12px]">
        <div className="text-fg">
          {highlight?.topSource ? sourceLabel(highlight.topSource.key) : '暂无来源'}
        </div>
        <div className="mt-0.5 text-muted">
          {highlight?.topCountry ? countryLabel(highlight.topCountry.key) : '未知国家'}
        </div>
      </td>
      <td className="min-w-36 py-3 pr-4 text-[12px]">
        <div className="truncate text-fg">{highlight?.topTarget?.title ?? '暂无联系点击'}</div>
        {highlight?.topTarget ? (
          <div className="mt-0.5 font-mono text-muted">{highlight.topTarget.leads} 次</div>
        ) : null}
      </td>
      <NumberCell value={row.pageViews} />
      <NumberCell value={row.leads} />
      <td className="py-3 pl-4 text-right font-mono font-medium text-accent">
        {percent(row.leadRate)}
      </td>
      <td className="py-3 pl-4 text-right">
        <ChangeBadge value={leadChange} />
      </td>
    </tr>
  );
}

function AccountResults({
  data,
  timeZone,
  onOpen,
}: {
  data: AnalyticsResponse;
  timeZone: string;
  onOpen: (id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <AnalyticsResults data={data} timeZone={timeZone} compact />
      <GlobalCountryAnalytics data={data} />
      <Panel title={`个人页表现 · ${data.performance.profiles.length} 个个人页`}>
        <p className="mb-3 text-[12px] text-muted">
          账号数据只在这里汇总；点击个人页进入独立分析，再查看来源、国家与联系方式。
        </p>
        <ResponsiveTable
          headers={['个人页', '进入页面', '按钮点击', '联系点击', '按钮点击率', '联系率']}
        >
          {data.performance.profiles.map((row) => (
            <ProfilePerformanceRow key={row.id} row={row} onOpen={onOpen} />
          ))}
        </ResponsiveTable>
        {data.performance.profiles.length === 0 ? <EmptyData /> : null}
      </Panel>
      <AggregateAnalysis data={data} timeZone={timeZone} showGlobalCountry={false} />
    </div>
  );
}

function ProfilePerformanceRow({
  row,
  onOpen,
}: {
  row: ProfilePerformance;
  onOpen: (id: string) => void;
}) {
  return (
    <tr
      className="cursor-pointer border-b border-border last:border-0 hover:bg-surface-hover"
      onClick={() => onOpen(row.id)}
    >
      <td className="py-3 pr-4">
        <div className="font-medium text-fg">{row.displayName || row.shortName}</div>
        <div className="mt-0.5 font-mono text-[11px] text-muted">/{row.shortName}</div>
      </td>
      <NumberCell value={row.pageViews} />
      <NumberCell value={row.clicks} />
      <NumberCell value={row.leads} />
      <td className="py-3 text-right font-mono text-fg">{percent(row.ctr)}</td>
      <td className="py-3 pl-4 text-right font-mono font-medium text-accent">
        {percent(row.leadRate)}
      </td>
    </tr>
  );
}

/**
 * 把趋势桶补齐成区间内每天连续一根，缺失的天填零值。
 *
 * 后端 `queryTrend` 只 group by 真实有事件的行，数据稀疏时（比如区间内只有
 * 一天/一小时有数据）返回的数组会比区间短很多——直接喂给图表，单个数据点在
 * 等分布局下会占满整个宽度；就算不是单点，折线图也会在缺失的桶之间直接
 * 插值连线，画出一条实际并不存在的平滑曲线。见 22 号票。按天、按小时两种
 * 粒度都要补，桶键格式不同（天是 `YYYY-MM-DD`，小时是服务端
 * `to_char(..., 'HH24:00')` 出来的 `YYYY-MM-DDTHH:00`），分开处理。
 */
function fillTrend(
  trend: AnalyticsResponse['trend'],
  range: AnalyticsResponse['range'],
): AnalyticsResponse['trend'] {
  const byBucket = new Map(trend.map((point) => [point.bucket, point]));
  const isHour = range.granularity === 'hour';
  const stepMs = isHour ? 3_600_000 : 86_400_000;

  const bucketKey = (d: Date): string => {
    if (!isHour) {
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: range.timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(d);
    }
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: range.timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hour12: false,
    }).formatToParts(d);
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
    // Intl 在整点时偶尔把小时格式化成 "24" 而不是 "00"，这里对齐服务端的 00-23 记法。
    const hour = get('hour') === '24' ? '00' : get('hour');
    return `${get('year')}-${get('month')}-${get('day')}T${hour}:00`;
  };

  const end = new Date(range.to);
  const filled: AnalyticsResponse['trend'] = [];
  for (let t = new Date(range.from); t < end; t = new Date(t.getTime() + stepMs)) {
    const bucket = bucketKey(t);
    filled.push(byBucket.get(bucket) ?? { bucket, pageViews: 0, clicks: 0, leads: 0 });
  }
  return filled;
}

/** 指标与图表。只有拿到数据才渲染，因此这里的 data 一定非空。 */
function AnalyticsResults({
  data,
  timeZone,
  compact = false,
}: {
  data: AnalyticsResponse;
  timeZone: string;
  compact?: boolean;
}) {
  const trend = useMemo(() => fillTrend(data.trend, data.range), [data]);
  const leadRate = data.totals.pageViews === 0 ? 0 : data.totals.leads / data.totals.pageViews;
  const previousLeadRate = data.comparison.totals.pageViews
    ? data.comparison.totals.leads / data.comparison.totals.pageViews
    : 0;
  const insights = useMemo(() => buildDashboardInsights(data), [data]);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <MetricCard
          label="进入页面"
          value={data.totals.pageViews}
          hint="页面被打开的次数"
          change={periodChange(data.totals.pageViews, data.comparison.totals.pageViews)}
        />
        <MetricCard
          label="按钮点击"
          value={data.totals.clicks}
          hint="所有条目的点击次数"
          change={periodChange(data.totals.clicks, data.comparison.totals.clicks)}
        />
        <MetricCard
          label="联系点击"
          value={data.totals.leads}
          hint="联系类条目的点击次数"
          change={periodChange(data.totals.leads, data.comparison.totals.leads)}
        />
        <MetricCard
          label="按钮点击 / 进入"
          value={data.totals.ctr * 100}
          suffix="%"
          precision={1}
          change={data.totals.ctr - data.comparison.totals.ctr}
          changeAsPoints
        />
        <MetricCard
          label="联系点击 / 进入"
          value={leadRate * 100}
          suffix="%"
          precision={1}
          change={leadRate - previousLeadRate}
          changeAsPoints
        />
      </div>

      <AnalyticsInsights insights={insights} />

      <FunnelSummary data={data} />

      <Panel
        title={`进入与联系趋势（按${data.range.granularity === 'hour' ? '小时' : '天'}，${timeZone}）`}
      >
        <div className="mb-2 flex flex-wrap gap-4 text-[12px] text-muted">
          <Legend color={ACCENT} label="进入页面" />
          <Legend color="#2563eb" label="按钮点击" />
          <Legend color="#e11d48" label="联系点击" />
        </div>
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={trend} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
            <defs>
              <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={ACCENT} stopOpacity={0.2} />
                <stop offset="100%" stopColor={ACCENT} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="bucket"
              tickFormatter={(v: string) =>
                data.range.granularity === 'hour' ? v.slice(11) : v.slice(5).replace('-', '/')
              }
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
                name === 'pageViews' ? '进入页面' : name === 'clicks' ? '按钮点击' : '联系点击',
              ]}
              contentStyle={{ borderRadius: 6, border: '1px solid var(--border)', fontSize: 12 }}
            />
            <Area
              type="monotone"
              dataKey="pageViews"
              stroke={ACCENT}
              strokeWidth={2}
              fill="url(#trendFill)"
            />
            <Area
              type="monotone"
              dataKey="clicks"
              stroke="#2563eb"
              strokeWidth={2}
              fill="transparent"
            />
            <Area
              type="monotone"
              dataKey="leads"
              stroke="#e11d48"
              strokeWidth={2}
              fill="transparent"
            />
          </AreaChart>
        </ResponsiveContainer>
      </Panel>

      {compact ? null : <AggregateAnalysis data={data} timeZone={timeZone} />}
    </div>
  );
}

function AnalyticsInsights({ insights }: { insights: ReturnType<typeof buildDashboardInsights> }) {
  if (!insights.length) return null;
  const toneClass = {
    positive: 'border-accent/25 bg-accent-soft text-accent',
    warning: 'border-amber-300/60 bg-amber-50 text-amber-900',
    neutral: 'border-border bg-bg text-fg',
  };
  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-fg">系统发现</h2>
        <span className="text-[11px] text-muted">根据当前范围自动生成</span>
      </div>
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        {insights.map((insight) => (
          <div
            key={insight.title}
            className={`rounded-[var(--radius-control)] border p-3 ${toneClass[insight.tone]}`}
          >
            <p className="text-[13px] font-semibold">{insight.title}</p>
            <p className="mt-1 text-[11px] leading-5 opacity-75">{insight.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function FunnelSummary({ data }: { data: AnalyticsResponse }) {
  const pageViews = data.totals.pageViews;
  const clickRate = pageViews ? data.totals.clicks / pageViews : 0;
  const leadRate = pageViews ? data.totals.leads / pageViews : 0;
  const stages = [
    { label: '进入页面', value: pageViews, rate: 1, color: 'bg-accent' },
    { label: '点击条目', value: data.totals.clicks, rate: clickRate, color: 'bg-[#2563eb]' },
    { label: '联系点击', value: data.totals.leads, rate: leadRate, color: 'bg-[#e11d48]' },
  ];
  return (
    <Panel title="进入 → 点击 → 联系漏斗">
      <div className="grid gap-3 md:grid-cols-3">
        {stages.map((stage, index) => (
          <div key={stage.label} className="relative overflow-hidden rounded-lg bg-bg p-4">
            <div
              className={`absolute inset-y-0 left-0 opacity-[0.08] ${stage.color}`}
              style={{ width: `${Math.max(3, Math.min(100, stage.rate * 100))}%` }}
            />
            <div className="relative">
              <p className="text-[12px] text-muted">
                {index + 1}. {stage.label}
              </p>
              <div className="mt-1 flex items-end justify-between gap-2">
                <span className="font-mono text-2xl font-semibold text-fg">{stage.value}</span>
                <span className="font-mono text-[12px] text-muted">
                  {index === 0 ? '基准 100%' : `进入占比 ${percent(stage.rate)}`}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
      {data.totals.clicks > data.totals.pageViews ? (
        <p className="mt-2 text-[11px] text-muted">
          同一访客可以连续点击多个条目，因此按钮点击次数可能高于进入页面次数。
        </p>
      ) : null}
    </Panel>
  );
}

function AggregateAnalysis({
  data,
  timeZone,
  showGlobalCountry = true,
}: {
  data: AnalyticsResponse;
  timeZone: string;
  showGlobalCountry?: boolean;
}) {
  const peakHour = useMemo(() => {
    const max = Math.max(...data.hourlyLeads);
    return max === 0 ? null : data.hourlyLeads.indexOf(max);
  }, [data.hourlyLeads]);
  const hourly = useMemo(
    () => data.hourlyLeads.map((value, hour) => ({ hour, value })),
    [data.hourlyLeads],
  );
  return (
    <div className="flex flex-col gap-4">
      {showGlobalCountry ? <GlobalCountryAnalytics data={data} /> : null}
      <AnalyticsVisualOverview data={data.crossBreakdowns} />
      <SourceContactMatrix data={data.crossBreakdowns} />
      <CrossAnalysis data={data.crossBreakdowns} />
      <ActivityHeatmap data={data} timeZone={timeZone} />
      <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <Panel title="联系点击时段">
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={hourly} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis
                dataKey="hour"
                ticks={[0, 4, 8, 12, 16, 20, 23]}
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
                formatter={(value) => [String(value ?? 0), '联系点击']}
                labelFormatter={(hour) => `${hour}:00`}
                contentStyle={{
                  borderRadius: 6,
                  border: '1px solid var(--border)',
                  fontSize: 12,
                }}
              />
              <Bar dataKey="value" fill={ACCENT} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          {peakHour !== null ? (
            <p className="mt-2 text-[13px] text-muted">
              联系最活跃时段：{peakHour}:00（{timeZone}）
            </p>
          ) : null}
        </Panel>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
          <CompactDimension title="设备" rows={data.dimensions.devices} />
          <CompactDimension title="操作系统" rows={data.dimensions.operatingSystems} />
        </div>
      </div>
      <p className="text-right text-[11px] text-muted">
        地区数据：
        <a
          href="https://www.maxmind.com"
          target="_blank"
          rel="noreferrer"
          className="underline decoration-border underline-offset-2 hover:text-fg"
        >
          GeoLite2 by MaxMind
        </a>
      </p>
    </div>
  );
}

function ChangeBadge({ value, asPoints = false }: { value: number | null; asPoints?: boolean }) {
  if (value === null) {
    return (
      <span className="inline-flex rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-accent">
        新增
      </span>
    );
  }
  const positive = value > 0;
  const negative = value < 0;
  const label = asPoints
    ? `${positive ? '+' : ''}${(value * 100).toFixed(1)} 个百分点`
    : value === 0
      ? '持平'
      : `${positive ? '+' : ''}${percent(value)}`;
  return (
    <span
      className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ${
        positive
          ? 'bg-accent-soft text-accent'
          : negative
            ? 'bg-red-50 text-red-700'
            : 'bg-surface-hover text-muted'
      }`}
    >
      {label}
    </span>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="size-2 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}

type AnalysisMode = 'source' | 'country' | 'target';

function CrossAnalysis({ data }: { data: AnalyticsResponse['crossBreakdowns'] }) {
  const [mode, setMode] = useState<AnalysisMode>('source');
  const [sourceFilter, setSourceFilter] = useState('');
  const [countryFilter, setCountryFilter] = useState('');
  const selectedCountry = data.countries.find((country) => country.key === countryFilter);
  const sources = (selectedCountry?.sources ?? data.sources).filter(
    (source) => !sourceFilter || source.key === sourceFilter,
  );
  const countries = data.countries
    .filter((country) => !countryFilter || country.key === countryFilter)
    .flatMap((country) => {
      if (!sourceFilter) return [country];
      const source = country.sources.find((item) => item.key === sourceFilter);
      return source
        ? [
            {
              ...country,
              pageViews: source.pageViews,
              clicks: source.clicks,
              leads: source.leads,
              clickRate: source.clickRate,
              leadRate: source.leadRate,
              sources: [source],
            },
          ]
        : [];
    });
  const targets = filteredTargets(data.targets, selectedCountry, sourceFilter);
  return (
    <Panel
      title="详细拆分"
      action={
        <Segmented
          value={mode}
          onChange={(value) => setMode(value as AnalysisMode)}
          options={[
            { value: 'source', label: '按来源' },
            { value: 'country', label: '按国家' },
            { value: 'target', label: '按联系方式' },
          ]}
        />
      }
    >
      <p className="mb-3 text-[12px] text-muted">
        {mode === 'source'
          ? '每个平台带来多少进入，并产生了哪些联系点击。'
          : mode === 'country'
            ? '每个国家的访客来自哪些平台，并点击了多少次联系方式。'
            : '每个联系方式的点击来自哪些平台。'}
      </p>
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-[var(--radius-control)] bg-bg p-2">
        <span className="px-1 text-[12px] font-medium text-muted">联动筛选</span>
        <Select
          value={sourceFilter}
          onChange={setSourceFilter}
          aria-label="筛选来源"
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
          aria-label="筛选国家"
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
            onClick={() => {
              setSourceFilter('');
              setCountryFilter('');
            }}
            className="px-2 text-[12px] font-medium text-accent hover:underline"
          >
            清除筛选
          </button>
        ) : null}
      </div>
      {mode === 'source' ? (
        <SourceTable rows={sources} />
      ) : mode === 'country' ? (
        <CountryTable rows={countries} />
      ) : (
        <TargetTable rows={targets} />
      )}
    </Panel>
  );
}

function filteredTargets(
  allTargets: TargetBreakdown[],
  country: CountryBreakdown | undefined,
  sourceFilter: string,
): TargetBreakdown[] {
  if (!country) {
    if (!sourceFilter) return allTargets;
    return allTargets.flatMap((target) => {
      const source = target.sources.find((item) => item.key === sourceFilter);
      return source
        ? [{ ...target, clicks: source.clicks, leads: source.leads, sources: [source] }]
        : [];
    });
  }

  const byId = new Map<string, TargetBreakdown>();
  for (const source of country.sources) {
    if (sourceFilter && source.key !== sourceFilter) continue;
    for (const target of source.targets) {
      const existing = byId.get(target.id) ?? {
        ...target,
        clicks: 0,
        leads: 0,
        sources: [],
      };
      existing.clicks += target.clicks;
      existing.leads += target.leads;
      existing.sources.push({ key: source.key, clicks: target.clicks, leads: target.leads });
      byId.set(target.id, existing);
    }
  }
  return [...byId.values()].sort((a, b) => b.clicks - a.clicks);
}

function SourceTable({ rows }: { rows: SourceBreakdown[] }) {
  return (
    <ResponsiveTable
      headers={['来源', '进入页面', '按钮点击', '联系点击', '联系 / 进入', '主要联系方式']}
    >
      {rows.map((row) => (
        <tr key={row.key} className="border-b border-border last:border-0">
          <td className="py-3 font-medium text-fg">{sourceLabel(row.key)}</td>
          <NumberCell value={row.pageViews} />
          <NumberCell value={row.clicks} />
          <NumberCell value={row.leads} />
          <td className="py-3 text-right font-mono text-fg">{percent(row.leadRate)}</td>
          <td className="min-w-52 py-3 pl-4">
            <TargetPills targets={row.targets} />
          </td>
        </tr>
      ))}
    </ResponsiveTable>
  );
}

function CountryTable({ rows }: { rows: CountryBreakdown[] }) {
  const [expanded, setExpanded] = useState<string | null>(rows[0]?.key ?? null);
  return (
    <div className="flex flex-col gap-2">
      {rows.map((country) => (
        <div
          key={country.key}
          className="overflow-hidden rounded-[var(--radius-control)] border border-border"
        >
          <button
            type="button"
            onClick={() => setExpanded(expanded === country.key ? null : country.key)}
            className="grid w-full grid-cols-[1fr_repeat(3,80px)] items-center gap-2 bg-bg px-3 py-3 text-left hover:bg-surface-hover"
          >
            <span className="font-medium text-fg">{countryLabel(country.key)}</span>
            <span className="text-right font-mono text-fg">
              {country.pageViews}
              <small className="ml-1 font-sans text-muted">进入</small>
            </span>
            <span className="text-right font-mono text-fg">
              {country.clicks}
              <small className="ml-1 font-sans text-muted">点击</small>
            </span>
            <span className="text-right font-mono text-fg">
              {country.leads}
              <small className="ml-1 font-sans text-muted">联系</small>
            </span>
          </button>
          {expanded === country.key ? (
            <div className="border-t border-border px-3 py-2">
              <ResponsiveTable
                headers={['来源', '进入页面', '按钮点击', '联系点击', '联系 / 进入', '联系方式']}
              >
                {country.sources.map((source) => (
                  <tr key={source.key} className="border-b border-border last:border-0">
                    <td className="py-2 text-fg">{sourceLabel(source.key)}</td>
                    <NumberCell value={source.pageViews} />
                    <NumberCell value={source.clicks} />
                    <NumberCell value={source.leads} />
                    <td className="py-2 text-right font-mono text-fg">
                      {percent(source.leadRate)}
                    </td>
                    <td className="min-w-52 py-2 pl-4">
                      <TargetPills targets={source.targets} />
                    </td>
                  </tr>
                ))}
              </ResponsiveTable>
            </div>
          ) : null}
        </div>
      ))}
      {rows.length === 0 ? <EmptyData /> : null}
    </div>
  );
}

function TargetTable({ rows }: { rows: TargetBreakdown[] }) {
  return (
    <ResponsiveTable headers={['联系方式', '类型', '总点击', '联系点击', '来源分布']}>
      {rows.map((row) => (
        <tr key={row.id} className="border-b border-border last:border-0">
          <td className="py-3 font-medium text-fg">{row.title}</td>
          <td className="py-3 text-muted">{row.isLead ? '联系类' : '内容类'}</td>
          <NumberCell value={row.clicks} />
          <NumberCell value={row.leads} />
          <td className="min-w-64 py-3 pl-4">
            <div className="flex flex-wrap gap-1.5">
              {row.sources.map((source) => (
                <span
                  key={source.key}
                  className="rounded-full bg-surface-hover px-2 py-1 text-[12px] text-fg"
                >
                  {sourceLabel(source.key)} · {source.clicks}
                </span>
              ))}
            </div>
          </td>
        </tr>
      ))}
    </ResponsiveTable>
  );
}

function ResponsiveTable({ headers, children }: { headers: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-border text-left text-muted">
            {headers.map((header, index) => (
              <th
                key={header}
                className={`whitespace-nowrap py-2 font-medium ${index > 0 && index < headers.length - 1 ? 'text-right' : index === headers.length - 1 ? 'pl-4' : ''}`}
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function NumberCell({ value }: { value: number }) {
  return <td className="py-3 text-right font-mono text-fg">{value}</td>;
}
function TargetPills({ targets }: { targets: ContactTarget[] }) {
  const contacts = targets.filter((target) => target.isLead && target.leads > 0);
  return contacts.length ? (
    <div className="flex flex-wrap gap-1.5">
      {contacts.slice(0, 5).map((target) => (
        <span
          key={target.id}
          className="rounded-full bg-accent-soft px-2 py-1 text-[12px] text-accent"
        >
          {target.title} · {target.leads}
        </span>
      ))}
    </div>
  ) : (
    <span className="text-[12px] text-muted">暂无联系点击</span>
  );
}
function EmptyData() {
  return <p className="py-4 text-center text-[13px] text-muted">暂无数据</p>;
}

function CompactDimension({
  title,
  rows,
}: {
  title: string;
  rows: AnalyticsResponse['dimensions']['devices'];
}) {
  return (
    <Panel title={title}>
      {rows.length ? (
        <div className="flex flex-col gap-2">
          {rows.slice(0, 5).map((row) => (
            <div key={row.key} className="grid grid-cols-[1fr_auto_auto] gap-3 text-[13px]">
              <span className="text-fg">{row.key || '未知'}</span>
              <span className="font-mono text-fg">{row.pageViews} 进入</span>
              <span className="font-mono text-accent">{row.leads} 联系</span>
            </div>
          ))}
        </div>
      ) : (
        <EmptyData />
      )}
    </Panel>
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
  hint,
  suffix = '',
  precision = 0,
  change,
  changeAsPoints = false,
}: {
  label: string;
  value: number;
  hint?: string;
  suffix?: string;
  precision?: number;
  change?: number | null;
  changeAsPoints?: boolean;
}) {
  return (
    <div className="rounded-[var(--radius-panel)] border border-border bg-surface p-4">
      <p className="text-[13px] text-muted">{label}</p>
      <div className="mt-1 flex flex-wrap items-end justify-between gap-2">
        <p className="font-mono text-2xl font-semibold text-fg">
          {value.toLocaleString('zh-CN', {
            minimumFractionDigits: precision,
            maximumFractionDigits: precision,
          })}
          {suffix}
        </p>
        {change !== undefined ? <ChangeBadge value={change} asPoints={changeAsPoints} /> : null}
      </div>
      {hint ? <p className="mt-1 text-[11px] text-muted">{hint}</p> : null}
    </div>
  );
}

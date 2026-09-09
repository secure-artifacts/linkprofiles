import type { Locale } from '@link-profile/i18n';
import type { AnalyticsResponse } from '../api/types.js';
import type { useAdminT } from '../i18n/runtime.js';
import { countryLabel, sourceLabel } from './labels.js';
import { regionLabel } from '../regions/label.js';

type T = ReturnType<typeof useAdminT>;
type Cell = string | number;

/**
 * 把当前这一屏分析数据导成 CSV，给管理员贴进 Google Sheet。
 *
 * 一个文件装多张表：每段之间空一行、开头一行段名。Sheets 与 Excel 都按
 * 这种排布导入，管理员再自己切分，比下载十个文件省事。
 *
 * 数字一律用不带千分位的原样写法。按界面语言格式化的话，德语的 `1.234`
 * 与英语的 `1,234` 会被表格当成两个完全不同的数，或者干脆识别成文本。
 */

/**
 * 以 `=`、`+`、`-`、`@` 开头的单元格会被 Sheets 与 Excel 当公式执行。
 * 个人页显示名是终端用户自己填的，直接写进去就是一条注入路径，前面加一个
 * 单引号让它保持文本。我们自己产出的数字不走这里。
 */
function sanitize(text: string): string {
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

function cell(value: Cell): string {
  const text = typeof value === 'number' ? String(value) : sanitize(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** 百分比按「30.2」这种写法给出，列名里带 %，表格才好继续算。 */
function percentValue(ratio: number): number {
  return Math.round(ratio * 1000) / 10;
}

export function buildAnalyticsCsv(
  data: AnalyticsResponse,
  t: T,
  locale: Locale,
  scopeName: string,
): string {
  const rows: Cell[][] = [];
  const section = (title: string, header: Cell[], body: Cell[][]) => {
    if (body.length === 0) return;
    if (rows.length > 0) rows.push([]);
    rows.push([title]);
    rows.push(header);
    rows.push(...body);
  };

  const views = t('analytics.pageViews');
  const clicks = t('analytics.entryClicks');
  const leads = t('analytics.leads');
  const rate = `${t('analytics.leadRate')} %`;
  const day = new Intl.DateTimeFormat('en-CA', {
    timeZone: data.range.timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const leadRateOf = (totals: { pageViews: number; leads: number }) =>
    totals.pageViews === 0 ? 0 : totals.leads / totals.pageViews;

  rows.push([t('analytics.title'), scopeName]);
  rows.push([
    t('analytics.date'),
    day.format(new Date(data.range.from)),
    day.format(new Date(data.range.to)),
  ]);
  rows.push([t('analytics.timeZone'), data.range.timeZone]);

  section(
    t('analytics.total'),
    ['', t('analytics.total'), t('analytics.vsPrevious')],
    [
      [views, data.totals.pageViews, data.comparison.totals.pageViews],
      [clicks, data.totals.clicks, data.comparison.totals.clicks],
      [leads, data.totals.leads, data.comparison.totals.leads],
      [
        `${t('analytics.clickRate')} %`,
        percentValue(data.totals.ctr),
        percentValue(data.comparison.totals.ctr),
      ],
      [
        rate,
        percentValue(leadRateOf(data.totals)),
        percentValue(leadRateOf(data.comparison.totals)),
      ],
    ],
  );

  section(
    t('analytics.trend.title', {
      granularity: t(
        data.range.granularity === 'hour'
          ? 'analytics.granularity.hour'
          : 'analytics.granularity.day',
      ),
      timeZone: data.range.timeZone,
    }),
    [t('analytics.date'), views, clicks, leads],
    data.trend.map((point) => [point.bucket, point.pageViews, point.clicks, point.leads]),
  );

  section(
    t('analytics.regions.title', { count: data.performance.regions.length }),
    [t('users.region'), t('analytics.account'), views, clicks, leads, rate],
    data.performance.regions.map((row) => [
      row.name === null ? t('regions.unowned') : regionLabel(row.id ?? '', row.name),
      row.accountCount,
      row.pageViews,
      row.clicks,
      row.leads,
      percentValue(row.leadRate),
    ]),
  );

  section(
    t('analytics.accounts.title', { count: data.performance.accounts.length }),
    [
      t('analytics.account'),
      t('common.field.label'),
      t('users.region'),
      t('users.pages'),
      views,
      clicks,
      leads,
      rate,
    ],
    data.performance.accounts.map((row) => [
      row.account,
      row.label,
      row.regionId && row.regionName ? regionLabel(row.regionId, row.regionName) : '',
      row.profileCount,
      row.pageViews,
      row.clicks,
      row.leads,
      percentValue(row.leadRate),
    ]),
  );

  section(
    t('analytics.profiles.title', { count: data.performance.profiles.length }),
    [
      t('analytics.profile'),
      t('users.field.shortName'),
      t('analytics.ownerAccount'),
      views,
      clicks,
      leads,
      rate,
    ],
    data.performance.profiles.map((row) => [
      row.displayName,
      `/${row.shortName}`,
      row.account,
      row.pageViews,
      row.clicks,
      row.leads,
      percentValue(row.leadRate),
    ]),
  );

  section(
    t('analytics.source'),
    [t('analytics.source'), views, clicks, leads],
    data.dimensions.sources.map((row) => [
      sourceLabel(t, row.key),
      row.pageViews,
      row.clicks,
      row.leads,
    ]),
  );

  section(
    t('analytics.breakdown.byCountry'),
    [t('analytics.breakdown.byCountry'), views, clicks, leads],
    data.dimensions.countries.map((row) => [
      countryLabel(t, locale, row.key),
      row.pageViews,
      row.clicks,
      row.leads,
    ]),
  );

  for (const [title, dimension] of [
    [t('analytics.device'), data.dimensions.devices],
    [t('analytics.os'), data.dimensions.operatingSystems],
  ] as const) {
    section(
      title,
      [title, views, clicks, leads],
      dimension.map((row) => [
        row.key || t('analytics.unknown'),
        row.pageViews,
        row.clicks,
        row.leads,
      ]),
    );
  }

  section(
    t('analytics.breakdown.byChannel'),
    [
      t('analytics.channel'),
      t('analytics.type'),
      t('analytics.totalClicks'),
      leads,
      t('analytics.sourceMix'),
    ],
    data.crossBreakdowns.targets.map((row) => [
      row.title ?? t('analytics.deletedEntry'),
      t(row.isLead ? 'analytics.type.contact' : 'analytics.type.content'),
      row.clicks,
      row.leads,
      // 分号分隔：来源名本身可能带斜杠（「直接访问 / 未标记」），再用斜杠就分不清了
      row.sources.map((source) => `${sourceLabel(t, source.key)} ${source.clicks}`).join('; '),
    ]),
  );

  return rows.map((row) => row.map(cell).join(',')).join('\r\n');
}

/** 文件名里只留下能安全落到磁盘的字符。 */
function slug(raw: string): string {
  return raw.replace(/[^\p{Letter}\p{Number}-]+/gu, '-').replace(/^-|-$/g, '') || 'analytics';
}

export function downloadCsv(data: AnalyticsResponse, scopeName: string, content: string): void {
  // BOM：没有它 Excel 会把中文与带重音的拉丁字母读成乱码。Sheets 两种都认。
  const blob = new Blob(['\uFEFF', content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${slug(scopeName)}-${data.range.from.slice(0, 10)}-${data.range.to.slice(0, 10)}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

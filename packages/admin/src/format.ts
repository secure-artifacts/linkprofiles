import type { Locale } from '@link-profile/i18n';

/**
 * 日期一律 ISO 年月日。
 *
 * 七种语言里日月顺序不一致，`03/04` 在英语与西语读者眼中是两个不同的日子，
 * 而后台到处都是要跟别人对账的数字。用 `en-CA` 拿的是本地时区下的 ISO 写法，
 * 与分析模块按天分桶用的是同一套。
 */
const ISO_DATE = new Intl.DateTimeFormat('en-CA', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function isoDate(value: string | number | Date): string {
  return ISO_DATE.format(new Date(value));
}

/** 数字按当前界面语言分组，千分位与小数点各语言写法不同。 */
export function formatNumber(
  value: number,
  locale: Locale,
  options?: Intl.NumberFormatOptions,
): string {
  return new Intl.NumberFormat(locale, options).format(value);
}

/**
 * 排序用的比较。
 *
 * 固定中立比较而不是跟界面语言走：并列时的先后顺序若因人而异，两个语言
 * 不同的管理员看同一份排行会得到不同的顺序，对账时说不清。
 */
export function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

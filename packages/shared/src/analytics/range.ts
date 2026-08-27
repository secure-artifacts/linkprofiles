/**
 * 数据分析的区间与分桶粒度。
 *
 * 底层一律存 UTC；这里只决定「按什么粒度切」，具体的切天与分桶交给
 * Postgres 在所选展示时区里算，不在 Node 里算 —— 时区规则（夏令时之类）
 * 由数据库的 tz 库负责，比自己算可靠。
 */

/** 受众所在时区。后台展示时区的默认值。 */
export const DEFAULT_DISPLAY_TIMEZONE = 'America/New_York';

export type Granularity = 'hour' | 'day';

/** 区间不超过两天时按小时聚合，否则按天。 */
export const HOURLY_THRESHOLD_MS = 2 * 24 * 60 * 60 * 1000;

export function granularityFor(from: Date, to: Date): Granularity {
  return to.getTime() - from.getTime() <= HOURLY_THRESHOLD_MS ? 'hour' : 'day';
}

/** 时区名是否被运行时认得。认不出的直接拒绝，不要拿去拼 SQL。 */
export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export interface AnalyticsRange {
  from: Date;
  to: Date;
  timeZone: string;
  granularity: Granularity;
}

export type RangePreset = 'today' | '7d' | '30d';

/** 预设区间。以所选展示时区的「今天」为基准，不是服务器时区的。 */
export function presetRange(
  preset: RangePreset,
  timeZone: string,
  now = new Date(),
): { from: Date; to: Date } {
  const startOfToday = startOfDayIn(timeZone, now);

  switch (preset) {
    case 'today':
      return { from: startOfToday, to: now };
    case '7d':
      return { from: addDays(startOfToday, -6), to: now };
    case '30d':
      return { from: addDays(startOfToday, -29), to: now };
  }
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

/**
 * 某个时刻在某个时区的 UTC 偏移量（毫秒）。
 *
 * 绕 Intl 一圈是因为 JS 的 Date 只认 UTC 与本机时区，没有第三个选择：
 * 把时刻格式化到目标时区拿到当地的墙上时间，再把它**当作 UTC 解释**，
 * 两者之差就是偏移。
 */
export function timeZoneOffsetMs(timeZone: string, at: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at);

  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? '0');
  // Intl 在午夜可能给出 24，规范化成 0
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour') % 24,
    get('minute'),
    get('second'),
  );

  // 秒以下的精度不参与偏移计算
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}

/**
 * 所选时区里「今天零点」对应的那个 UTC 时刻。
 *
 * 算两遍：第一遍用 `at` 时刻的偏移求出午夜，第二遍用午夜自己的偏移校正 ——
 * 夏令时切换当天这两个偏移不一样，只算一遍会差一小时。
 */
export function startOfDayIn(timeZone: string, at = new Date()): Date {
  const midnightWith = (offset: number) => {
    const local = new Date(at.getTime() + offset);
    return Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - offset;
  };

  const firstPass = midnightWith(timeZoneOffsetMs(timeZone, at));
  return new Date(midnightWith(timeZoneOffsetMs(timeZone, new Date(firstPass))));
}

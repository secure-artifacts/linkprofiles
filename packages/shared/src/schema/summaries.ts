import { date, index, integer, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { deviceTypeEnum } from './tracking.js';

/**
 * 日汇总。明细保留六个月，超期聚合进这里后删除；日汇总**永久保留**，
 * 因此跨越清理边界的历史图表不断档。
 *
 * 一行 = 一个个人页 × 一天 × 一组维度取值。维度全留着，因此聚合之后
 * 「按国家拆」「按设备拆」「按来源拆」这些查询照样答得出来，只是失去了
 * 单条明细的时刻。
 *
 * 维度列用空串表示「未知」而不是 NULL：Postgres 的唯一索引不把两个 NULL
 * 当作相等，用 NULL 的话 `on conflict` 去重会失效，聚合任务重跑就会
 * 产生重复汇总。读的时候空串映射回「未知」。
 */
export const dailySummaries = pgTable(
  'daily_summaries',
  {
    id: uuid().primaryKey().defaultRandom(),
    profileId: uuid().notNull(),
    /** UTC 日期。见本 ticket 的说明：跨时区展示时这是个近似。 */
    day: date().notNull(),

    country: text().notNull().default(''),
    city: text().notNull().default(''),
    deviceType: deviceTypeEnum().notNull().default('unknown'),
    os: text().notNull().default(''),
    source: text().notNull().default(''),

    pageViews: integer().notNull().default(0),
    clicks: integer().notNull().default(0),
    /** 线索是点击的子集 */
    leads: integer().notNull().default(0),
  },
  (t) => [
    uniqueIndex('daily_summaries_profile_bucket_unique').on(
      t.profileId,
      t.day,
      t.country,
      t.city,
      t.deviceType,
      t.os,
      t.source,
    ),
    index('daily_summaries_profile_day_idx').on(t.profileId, t.day),
  ],
);

export type DailySummaryRow = typeof dailySummaries.$inferSelect;

/** 明细保留期。超过这个天数的明细会被聚合后删除。 */
export const DETAIL_RETENTION_DAYS = 183;

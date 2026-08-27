import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * short_name 墓碑。
 *
 * 用户被删除后 short_name 迁到这里并**永不释放**：他印在名片上、挂在社媒
 * 简介里的旧链接会返回 404，而不是把访客导到另一个陌生人的页面上。
 * 这就是不做「删除后释放地址」的原因 —— 抢注一个刚被释放的旧地址，
 * 等于白捡别人的流量。
 */
export const shortNameTombstones = pgTable('short_name_tombstones', {
  /** 已经是小写，与 users.short_name 同一口径 */
  shortName: text().primaryKey(),
  /** 原主人的 id，仅供排查，用户行已经删了，因此不设外键 */
  formerUserId: uuid().notNull(),
  retiredAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export type ShortNameTombstoneRow = typeof shortNameTombstones.$inferSelect;

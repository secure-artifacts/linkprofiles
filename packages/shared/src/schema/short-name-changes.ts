import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { profiles } from './profiles.js';
import { users } from './users.js';

/**
 * 个人页地址的变更流水。
 *
 * 改地址会让已经发出去的链接立刻失效，是个后果外溢到系统之外的操作（名片、
 * 二维码、投放素材上印着旧地址）。留一条流水，改错了能照着改回去。
 *
 * 与 `short_name_tombstones` 是两回事：墓碑记的是**删除**产生的、永不再分配
 * 的地址；这里记的是**改名**，旧地址会被释放，可以被改回来，也可能被别人抢注。
 */
export const shortNameChanges = pgTable(
  'short_name_changes',
  {
    id: uuid().primaryKey().defaultRandom(),
    profileId: uuid()
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    fromShortName: text().notNull(),
    toShortName: text().notNull(),
    /** 谁改的。改名人账号被删后置空，流水本身留着 */
    changedBy: uuid().references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('short_name_changes_profile_idx').on(t.profileId, t.createdAt)],
);

export type ShortNameChangeRow = typeof shortNameChanges.$inferSelect;
export type NewShortNameChangeRow = typeof shortNameChanges.$inferInsert;

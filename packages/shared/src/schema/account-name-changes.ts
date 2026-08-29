import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './users.js';

/** 登录用户名变更流水。账号删除后仍保留改前、改后与操作者信息。 */
export const accountNameChanges = pgTable(
  'account_name_changes',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid().references(() => users.id, { onDelete: 'set null' }),
    changedBy: uuid().references(() => users.id, { onDelete: 'set null' }),
    fromAccount: text().notNull(),
    toAccount: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('account_name_changes_user_idx').on(t.userId, t.createdAt)],
);

export type AccountNameChangeRow = typeof accountNameChanges.$inferSelect;

import { relations } from 'drizzle-orm';
import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './users.js';

/**
 * 会话存库，30 天过期。删账号或改密码时删除对应会话，立即踢下线。
 *
 * 存的是 cookie 里那串令牌的 sha256，不是令牌本身：库被拖走也换不到
 * 可用的登录态。
 */
export const sessions = pgTable(
  'sessions',
  {
    tokenHash: text().primaryKey(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('sessions_user_idx').on(t.userId), index('sessions_expires_idx').on(t.expiresAt)],
);

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export type SessionRow = typeof sessions.$inferSelect;

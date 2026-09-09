import { relations, sql } from 'drizzle-orm';
import { boolean, index, pgTable, timestamp, uniqueIndex, text, uuid } from 'drizzle-orm/pg-core';
import { regions } from './regions.js';

/**
 * 邀请码。自助注册时必填，决定新用户落进哪个区域，见 ADR-0018。
 *
 * 与区域是多对一：重置的实现是把旧码置为无效再插一条新的，而不是原地覆盖，
 * 这样「这个人当初是拿哪个码进来的」这段历史还在。任一时刻一个区域至多一个
 * 有效码，由部分唯一索引保证，不靠应用层自觉。
 */
export const inviteCodes = pgTable(
  'invite_codes',
  {
    id: uuid().primaryKey().defaultRandom(),
    regionId: uuid()
      .notNull()
      .references(() => regions.id, { onDelete: 'cascade' }),

    /** 入库前已归一化为大写，因此普通唯一索引即为「大小写不敏感唯一」。 */
    code: text().notNull(),
    isActive: boolean().notNull().default(true),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    uniqueIndex('invite_codes_code_unique').on(t.code),
    uniqueIndex('invite_codes_one_active_per_region')
      .on(t.regionId)
      .where(sql`${t.isActive}`),
    index('invite_codes_region_idx').on(t.regionId),
  ],
);

export const inviteCodesRelations = relations(inviteCodes, ({ one }) => ({
  region: one(regions, { fields: [inviteCodes.regionId], references: [regions.id] }),
}));

export type InviteCodeRow = typeof inviteCodes.$inferSelect;
export type NewInviteCodeRow = typeof inviteCodes.$inferInsert;

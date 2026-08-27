import { relations } from 'drizzle-orm';
import { boolean, index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './users.js';

/** 单页按钮数量上限。 */
export const MAX_BUTTONS_PER_USER = 50;

/**
 * 个人页主体区域的可点击条目。
 *
 * **不分组**：全部按钮共处一个用户可自由排序的列表，联系类与内容类可以混排，
 * 页面上没有区段标题。两者的视觉分级只由 `isLead` 决定 —— 靠样式，不靠位置。
 */
export const buttons = pgTable(
  'buttons',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    title: text().notNull(),
    /** 一行选填说明，如「通常当天回复」。留空则不渲染该行。 */
    subtitle: text().notNull().default(''),
    url: text().notNull(),

    /** 排序位。用户拖拽后重排，同一用户内连续。 */
    position: integer().notNull(),

    /** 联系类渠道。决定视觉分级，也决定这次点击算不算线索。 */
    isLead: boolean().notNull().default(false),
    /** 跳转时把来源参数透传给目标地址，见 13。 */
    passSource: boolean().notNull().default(false),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('buttons_user_position_idx').on(t.userId, t.position)],
);

export const buttonsRelations = relations(buttons, ({ one }) => ({
  user: one(users, { fields: [buttons.userId], references: [users.id] }),
}));

export type ButtonRow = typeof buttons.$inferSelect;
export type NewButtonRow = typeof buttons.$inferInsert;

/**
 * 页面头部的图标式入口，从内置清单逐个启用。
 * 存在一行即为启用；用户填的是号码或用户名，目标 URL 由系统拼装。
 */
export const socialIcons = pgTable(
  'social_icons',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    /** 取值限定于 shared 的内置清单，仅含海外平台。 */
    platform: text().notNull(),
    /** 用户原样填的号码 / 邮箱 / 用户名，不是拼好的 URL。 */
    value: text().notNull(),

    position: integer().notNull(),
    isLead: boolean().notNull().default(false),
    passSource: boolean().notNull().default(false),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('social_icons_user_position_idx').on(t.userId, t.position)],
);

export const socialIconsRelations = relations(socialIcons, ({ one }) => ({
  user: one(users, { fields: [socialIcons.userId], references: [users.id] }),
}));

export type SocialIconRow = typeof socialIcons.$inferSelect;
export type NewSocialIconRow = typeof socialIcons.$inferInsert;

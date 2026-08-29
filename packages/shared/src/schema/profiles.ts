import { relations } from 'drizzle-orm';
import {
  boolean,
  index,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './users.js';

export const layoutEnum = pgEnum('layout', ['classic', 'hero', 'banner', 'shape']);

export const themeEnum = pgEnum('theme', [
  'dawn',
  'harbor',
  'moss',
  'ember',
  'slate',
  'nocturne',
  'ocean',
  'rose',
  'lavender',
  'sunset',
  'mono',
  'glass',
  'glass-ocean',
  'glass-rose',
  'glass-aurora',
]);

/**
 * 个人页。一个账号（`role='user'`）可以拥有任意多个，不设上限。
 *
 * `shortName` 与 `displayName` 归属在这里而不是账号上，见 ADR-0008：
 * 一个人可以为不同投放渠道各做一个页面，各有各的地址与展示名。
 *
 * `shortName` 是 NOT NULL 的——页面存在即必须有地址。旧 `users.short_name`
 * 之所以可空，只是因为同一行要兼容没有个人页的管理员；本表专职装个人页，
 * 不存在「没有地址的个人页」这个状态。
 */
export const profiles = pgTable(
  'profiles',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    shortName: text().notNull(),
    displayName: text().notNull().default(''),
    bio: text().notNull().default(''),
    /** 简介逐字打出来。关掉、或访客设了减少动效时，直接静态显示全文。 */
    bioTypewriter: boolean().notNull().default(false),

    layout: layoutEnum().notNull().default('classic'),
    theme: themeEnum().notNull().default('dawn'),

    /** 条目一律实心卡片，还是一律描边行。整页统一，不逐条配，见 ADR-0013。 */
    solidBackground: boolean().notNull().default(false),
    /** 条目左侧品牌图形背后垫不垫那枚白色衬底。与 `solidBackground` 相互独立。 */
    iconPlate: boolean().notNull().default(true),

    /** 头像位：图片或短视频。视频时 `avatarPosterId` 是它的首帧封面。 */
    avatarMediaId: uuid(),
    avatarPosterId: uuid(),
    /** Banner 布局顶部的独立宽幅图，不与头像位共用。 */
    bannerMediaId: uuid(),
    /** 背景图。上传后覆盖主题的背景渐变，按钮色与文字色仍生效。 */
    backgroundMediaId: uuid(),
    /** 背景图上那层遮罩的暗度，0–1，默认四成，保证文字对比度。 */
    backgroundOverlay: numeric({ precision: 3, scale: 2 }).notNull().default('0.40'),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // short_name 入库前已强制小写，因此普通唯一索引即为「按小写唯一」。
    uniqueIndex('profiles_short_name_unique').on(t.shortName),
    index('profiles_user_idx').on(t.userId),
  ],
);

export const profilesRelations = relations(profiles, ({ one }) => ({
  user: one(users, { fields: [profiles.userId], references: [users.id] }),
}));

export type ProfileRow = typeof profiles.$inferSelect;
export type NewProfileRow = typeof profiles.$inferInsert;
export type Layout = (typeof layoutEnum.enumValues)[number];
export type Theme = (typeof themeEnum.enumValues)[number];

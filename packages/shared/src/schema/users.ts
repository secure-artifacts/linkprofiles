import { relations } from 'drizzle-orm';
import {
  index,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';

/**
 * 三级角色。超级管理员与管理员是纯后台运营者，不拥有个人页；
 * 只有 `user` 拥有个人页，因此个人页相关字段对另外两种角色恒为空。
 */
export const roleEnum = pgEnum('role', ['superadmin', 'admin', 'user']);

export const layoutEnum = pgEnum('layout', ['classic', 'hero', 'banner', 'cutout', 'shape']);

export const themeEnum = pgEnum('theme', ['dawn', 'harbor', 'moss', 'ember', 'slate', 'nocturne']);

/**
 * 四个标识字段互不兼任，见 CONTEXT.md：
 * - `account`     登录凭证，全站唯一，不对外可见
 * - `label`       用户名称，后台中文备注，可重复
 * - `shortName`   个人页地址，全站唯一（入库前已强制小写）
 * - `displayName` 个人页上展示给访客的名字，可重复
 */
export const users = pgTable(
  'users',
  {
    id: uuid().primaryKey().defaultRandom(),
    role: roleEnum().notNull(),

    account: text().notNull(),
    passwordHash: text().notNull(),
    label: text().notNull().default(''),

    shortName: text(),
    displayName: text().notNull().default(''),
    bio: text().notNull().default(''),

    layout: layoutEnum().notNull().default('classic'),
    theme: themeEnum().notNull().default('dawn'),

    /** 头像位：图片或短视频。视频时 `avatarPosterId` 是它的首帧封面。 */
    avatarMediaId: uuid(),
    avatarPosterId: uuid(),
    /** 背景图。上传后覆盖主题的背景渐变，按钮色与文字色仍生效。 */
    backgroundMediaId: uuid(),
    /** 背景图上那层遮罩的暗度，0–1，默认四成，保证文字对比度。 */
    backgroundOverlay: numeric({ precision: 3, scale: 2 }).notNull().default('0.40'),

    /**
     * 归属管理员。为空即「无归属」，仅超级管理员可见。见 ADR-0005。
     * 管理员被删除时置空而非连带删除名下用户。
     */
    owningAdminId: uuid().references((): AnyPgColumn => users.id, { onDelete: 'set null' }),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('users_account_unique').on(t.account),
    // short_name 入库前已强制小写，因此普通唯一索引即为「按小写唯一」。
    uniqueIndex('users_short_name_unique').on(t.shortName),
    index('users_owning_admin_idx').on(t.owningAdminId),
  ],
);

export const usersRelations = relations(users, ({ one, many }) => ({
  owningAdmin: one(users, {
    fields: [users.owningAdminId],
    references: [users.id],
    relationName: 'owning_admin',
  }),
  ownedUsers: many(users, { relationName: 'owning_admin' }),
}));

export type UserRow = typeof users.$inferSelect;
export type NewUserRow = typeof users.$inferInsert;
export type Role = (typeof roleEnum.enumValues)[number];
export type Layout = (typeof layoutEnum.enumValues)[number];
export type Theme = (typeof themeEnum.enumValues)[number];

import { relations, sql } from 'drizzle-orm';
import {
  index,
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
 * 只有 `user` 拥有个人页，且可以拥有任意多个，见 `profiles` 表与 ADR-0008。
 */
export const roleEnum = pgEnum('role', ['superadmin', 'admin', 'user']);

/**
 * 账号。**只管登录与归属，不再兼任个人页**（见 ADR-0008）。
 *
 * 两个标识字段互不兼任，见 CONTEXT.md：
 * - `account`  登录凭证，全站唯一，不对外可见
 * - `label`    用户名称，后台中文备注，可重复
 *
 * 另外两个（`shortName` / `displayName`）已随个人页迁到 `profiles` 表。
 */
export const users = pgTable(
  'users',
  {
    id: uuid().primaryKey().defaultRandom(),
    role: roleEnum().notNull(),

    account: text().notNull(),
    passwordHash: text().notNull(),
    label: text().notNull().default(''),

    /**
     * 归属管理员。为空即「无归属」，仅超级管理员可见。见 ADR-0005。
     * 管理员被删除时置空而非连带删除名下用户。
     */
    owningAdminId: uuid().references((): AnyPgColumn => users.id, { onDelete: 'set null' }),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // 登录用户名不区分大小写；历史值不强制改写，新增与改名路径统一存小写。
    uniqueIndex('users_account_unique').on(sql`lower(${t.account})`),
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

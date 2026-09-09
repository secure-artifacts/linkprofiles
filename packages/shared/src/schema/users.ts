import { relations, sql } from 'drizzle-orm';
import {
  check,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { regions } from './regions.js';

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
     * 界面语言。属于账号，只服务后台，不出现在任何对外页面上，见 CONTEXT.md。
     *
     * 存 text 而不是 pgEnum：加一种语言应该只是往译文目录添一个文件，用枚举
     * 会把它变成一次数据库迁移。取值白名单由 i18n 包持有。默认值只为让存量行
     * 在迁移时拿到简体中文，新行一律由应用显式写入创建者的界面语言。
     */
    uiLanguage: text().notNull().default('zh-Hans'),

    /**
     * 区域。归属的唯一载体，见 ADR-0017。归属管理员由「用户 → 区域 → 管理员」
     * 推导，不在本表上单独存。
     *
     * 列上可空是因为管理员与超级管理员不属于任何区域；`role = 'user'` 必须有
     * 区域这条规则由下面的检查约束表达。
     *
     * 删除时**限制**而非级联：区域必须先清空才删得掉，误删一个区域不该带走
     * 里面几百个账号。
     */
    regionId: uuid().references((): AnyPgColumn => regions.id, { onDelete: 'restrict' }),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // 登录用户名不区分大小写；历史值不强制改写，新增与改名路径统一存小写。
    uniqueIndex('users_account_unique').on(sql`lower(${t.account})`),
    index('users_region_idx').on(t.regionId),
    // 只有用户属于区域，管理员与超级管理员一个都不属于。两边同时为真或同时
    // 为假，写成等式就把两个方向一次约束住。
    check('users_region_matches_role', sql`(${t.role} = 'user') = (${t.regionId} is not null)`),
  ],
);

export const usersRelations = relations(users, ({ one, many }) => ({
  region: one(regions, {
    fields: [users.regionId],
    references: [regions.id],
    relationName: 'region_members',
  }),
  ownedRegions: many(regions, { relationName: 'region_owner' }),
}));

export type UserRow = typeof users.$inferSelect;
export type NewUserRow = typeof users.$inferInsert;
export type Role = (typeof roleEnum.enumValues)[number];

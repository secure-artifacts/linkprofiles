import { relations } from 'drizzle-orm';
import {
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { users } from './users.js';

/**
 * 「未分配」区域的固定主键。
 *
 * 它由迁移 SQL 创建，**不放在超级管理员初始化流程里** —— 那段代码在
 * `index.ts` 里跑，`buildApp` 不经过它，挂在那里测试上下文就没有这个区域。
 * 放在迁移里，全新安装、存量升级、测试上下文三条路径拿到的是同一个东西。
 */
export const UNASSIGNED_REGION_ID = '00000000-0000-4000-8000-000000000001';

/**
 * 区域。用户的归属单位，见 ADR-0017。
 *
 * 归属链是单向的一条：用户 → 区域 → 管理员。用户身上不再有独立的归属管理员
 * 字段，可见范围一律沿这条链推导。
 *
 * `ownerAdminId` 为空即**无归属区域**，仅超级管理员可见，等着被指派。两个来源：
 * 迁移创建的那一个「未分配」区域，以及归属管理员被删除后留下的那些。
 */
export const regions = pgTable(
  'regions',
  {
    id: uuid().primaryKey().defaultRandom(),

    /** 会在注册页展示给注册者，所以全站唯一，不能当内部便签用。 */
    name: text().notNull(),

    ownerAdminId: uuid().references((): AnyPgColumn => users.id, { onDelete: 'set null' }),

    /** 管理员被创建时随之产生的那一个，删不掉。名字改得了。 */
    isDefault: boolean().notNull().default(false),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('regions_name_unique').on(t.name),
    index('regions_owner_idx').on(t.ownerAdminId),
  ],
);

export const regionsRelations = relations(regions, ({ one, many }) => ({
  ownerAdmin: one(users, {
    fields: [regions.ownerAdminId],
    references: [users.id],
    relationName: 'region_owner',
  }),
  members: many(users, { relationName: 'region_members' }),
}));

export type RegionRow = typeof regions.$inferSelect;
export type NewRegionRow = typeof regions.$inferInsert;

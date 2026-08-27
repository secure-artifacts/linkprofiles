import { relations } from 'drizzle-orm';
import { boolean, index, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './users.js';

export const deviceTypeEnum = pgEnum('device_type', ['mobile', 'tablet', 'desktop', 'unknown']);
export const clickTargetEnum = pgEnum('click_target', ['button', 'social']);

/**
 * 每次访问都记录的维度。三张表共用这一组字段。
 *
 * `ipTruncated` 存的已经是截断过的地址（IPv4 去掉最后一段、IPv6 去掉后 80 位），
 * 完整 IP 从不落库 —— 它只在内存里活到地域查完为止，见 ADR-0006。
 */
const visitorColumns = {
  country: text(),
  city: text(),
  deviceType: deviceTypeEnum().notNull().default('unknown'),
  os: text(),
  /** 来源。无参数或脏值记为 null，即未知来源。 */
  source: text(),
  ipTruncated: text(),
  occurredAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
};

/**
 * 页面浏览：个人页被渲染一次。作为点击率的分母。
 * **不做任何访客去重，全部纯计次**：同一个人刷十次就是十条。
 */
export const pageViews = pgTable(
  'page_views',
  {
    id: uuid().primaryKey().defaultRandom(),
    // 用户被删除后埋点保留，历史汇总不断档，因此不级联删除，见 16。
    userId: uuid().notNull(),
    ...visitorColumns,
  },
  (t) => [
    index('page_views_user_time_idx').on(t.userId, t.occurredAt),
    index('page_views_time_idx').on(t.occurredAt),
  ],
);

/** 点击：对任意按钮或社媒图标的一次点击。线索是点击的子集。 */
export const clicks = pgTable(
  'clicks',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid().notNull(),

    targetKind: clickTargetEnum().notNull(),
    /** 指向 buttons.id 或 social_icons.id。目标被删后这条记录仍然保留。 */
    targetId: uuid().notNull(),
    /**
     * 这次点击算不算线索，落库时按当时的 is_lead 定死。
     * 用户事后改了标记不该让历史数据跟着变。
     */
    isLead: boolean().notNull(),

    ...visitorColumns,
  },
  (t) => [
    index('clicks_user_time_idx').on(t.userId, t.occurredAt),
    index('clicks_target_idx').on(t.targetId),
    index('clicks_time_idx').on(t.occurredAt),
  ],
);

export const pageViewsRelations = relations(pageViews, ({ one }) => ({
  user: one(users, { fields: [pageViews.userId], references: [users.id] }),
}));

export const clicksRelations = relations(clicks, ({ one }) => ({
  user: one(users, { fields: [clicks.userId], references: [users.id] }),
}));

export type PageViewRow = typeof pageViews.$inferSelect;
export type ClickRow = typeof clicks.$inferSelect;

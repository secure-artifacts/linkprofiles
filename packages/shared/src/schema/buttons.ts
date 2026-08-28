import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { profiles } from './profiles.js';

/** 单个个人页的自定义链接数量上限。社媒条目另受内置清单长度约束，不占这个额度。 */
export const MAX_BUTTONS_PER_PROFILE = 50;

/**
 * 条目是自己填地址的链接，还是从内置清单启用的社媒入口。
 *
 * 与 `clicks.click_target` 取值不同名（那边历史值是 `button`）。两者各是各的
 * 类型：内容层不该反过来依赖分析层。写埋点时映射一下即可。
 */
export const buttonKindEnum = pgEnum('button_kind', ['link', 'social']);

/**
 * 个人页主体区域的可点击条目。
 *
 * **链接与社媒入口是同一种东西**，只差地址从哪来：`link` 由用户直接填，
 * `social` 存平台 id 与用户填的号码/用户名，地址读时由 `buildSocialUrl` 拼。
 * 两者在页面上渲染成同一种卡片，见 ADR-0011。
 *
 * **不分组**：全部条目共处一个可自由排序的列表，页面上没有区段标题。
 * 实心卡片还是描边行由 `profiles.solidBackground` 整页统一决定，不逐条配。
 */
export const buttons = pgTable(
  'buttons',
  {
    id: uuid().primaryKey().defaultRandom(),
    profileId: uuid()
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),

    /** 没有默认值是故意的：写路径必须显式表态，缺省只会把「忘了传」推迟到渲染时才炸。 */
    kind: buttonKindEnum().notNull(),

    title: text().notNull(),
    /** 一行选填说明，如「通常当天回复」。留空则不渲染该行。 */
    subtitle: text().notNull().default(''),
    /** `link` 用。`social` 为空，地址读时由 platform + value 拼出来。 */
    url: text(),

    /** `social` 用，取值限定于 shared 的内置清单，仅含海外平台。 */
    platform: text(),
    /** `social` 用，用户原样填的号码 / 邮箱 / 用户名，不是拼好的 URL。 */
    value: text(),

    /** 排序位。用户拖拽后重排，同一个人页内连续。 */
    position: integer().notNull(),

    /** 联系类渠道。只决定这次点击算不算线索，**不决定长相**。 */
    isLead: boolean().notNull().default(false),
    /** 跳转时把来源参数透传给目标地址，见 13。 */
    passSource: boolean().notNull().default(false),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('buttons_profile_position_idx').on(t.profileId, t.position),
    /*
     * 两种 kind 各自要求哪些列有值。
     *
     * 写在 schema 里而不是只写进迁移 SQL：只写在 SQL 里的话 `db:generate`
     * 下次不知道它存在，代码里也读不出这条不变式。而 drizzle 推出来的插入
     * 类型允许 url/platform/value 同时为空，TS 拦不住畸形行，这条约束是
     * 最后一道墙。
     */
    check(
      'buttons_kind_shape_chk',
      sql`(${t.kind} = 'link' AND ${t.url} IS NOT NULL AND ${t.platform} IS NULL AND ${t.value} IS NULL)
          OR (${t.kind} = 'social' AND ${t.url} IS NULL AND ${t.platform} IS NOT NULL AND ${t.value} IS NOT NULL)`,
    ),
  ],
);

export const buttonsRelations = relations(buttons, ({ one }) => ({
  profile: one(profiles, { fields: [buttons.profileId], references: [profiles.id] }),
}));

export type ButtonRow = typeof buttons.$inferSelect;
export type NewButtonRow = typeof buttons.$inferInsert;
export type ButtonKind = (typeof buttonKindEnum.enumValues)[number];

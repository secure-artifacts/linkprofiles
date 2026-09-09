import { boolean, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/**
 * 全站设置。单行表，主键固定为 `singleton`。
 *
 * 用一张单行表而不是一堆键值对：设置项少且各有类型，键值对会把类型
 * 丢给调用方每次现解析。
 */
export const settings = pgTable('settings', {
  id: text().primaryKey().default('singleton'),

  /** 来源透传的全局默认值，只有超级管理员改得了。按钮可逐条覆盖。 */
  sourcePassthroughDefault: boolean().notNull().default(false),

  /**
   * 自助注册总闸。只有超级管理员改得了。
   *
   * 邀请码泄露时唯一的止损手段——本系统不做限流也不做名额上限，见 ADR-0018。
   * 关掉只挡新注册，不影响已有用户登录与使用。
   */
  registrationEnabled: boolean().notNull().default(false),

  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const SETTINGS_ID = 'singleton';
export type SettingsRow = typeof settings.$inferSelect;

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

  /**
   * reCAPTCHA v2 的站点密钥。公开值，注册页要拿它渲染控件。
   *
   * 与私钥一起放在设置表而不是环境变量：换密钥不必重新部署，而且开注册的
   * 那个人和去 Google 后台申请密钥的是同一个人，在同一个页面填完最顺。
   */
  recaptchaSiteKey: text().notNull().default(''),
  /** reCAPTCHA v2 的私钥。只用于服务端校验，任何接口都不回传它。 */
  recaptchaSecretKey: text().notNull().default(''),

  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const SETTINGS_ID = 'singleton';
export type SettingsRow = typeof settings.$inferSelect;

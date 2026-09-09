import { z } from 'zod';

export const PASSWORD_MIN = 8;
/**
 * 上限存在的理由不是密码强度，是成本：每次校验通过都要跑一次 argon2id，
 * 而自助注册是匿名入口且本系统不做限流（ADR-0018）。没有上限就等于让任何人
 * 用一个请求体决定服务端花多少内存。
 */
export const PASSWORD_MAX = 200;

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN, 'field.password.min')
  .max(PASSWORD_MAX, 'field.password.max');

export const newPasswordSchema = z
  .string()
  .min(PASSWORD_MIN, 'field.newPassword.min')
  .max(PASSWORD_MAX, 'field.password.max');

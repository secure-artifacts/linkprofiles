import { z } from 'zod';
import type { ErrorKey } from '@link-profile/i18n';

export const ACCOUNT_MIN = 3;
export const ACCOUNT_MAX = 32;

/** 登录用户名统一小写；历史账号不在迁移时强制改写。 */
export function normalizeAccountName(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * 新建或改名时采用的登录用户名规则。
 *
 * 历史数据可能比这宽松，仍可继续登录；只有新写入的名称必须经过这里。
 */
export const accountNameSchema = z
  .string()
  .transform(normalizeAccountName)
  .pipe(
    z
      .string()
      .min(ACCOUNT_MIN, 'field.account.min')
      .max(ACCOUNT_MAX, 'field.account.max')
      .regex(/^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/, 'field.account.charset')
      .refine((value) => !/[._-]{2}/.test(value), 'field.account.consecutive'),
  );

export function validateAccountName(
  value: string,
): { ok: true; value: string } | { ok: false; error: ErrorKey } {
  const parsed = accountNameSchema.safeParse(value);
  if (parsed.success) return { ok: true, value: parsed.data };
  return {
    ok: false,
    error: (parsed.error.issues[0]?.message as ErrorKey) ?? 'field.account.invalid',
  };
}

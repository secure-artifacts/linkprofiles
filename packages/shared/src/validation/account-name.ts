import { z } from 'zod';

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
      .min(3, '登录用户名至少 3 位')
      .max(32, '登录用户名最多 32 位')
      .regex(
        /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/,
        '只能使用小写字母、数字、点、下划线或横线，且首尾必须是字母或数字',
      )
      .refine((value) => !/[._-]{2}/.test(value), '点、下划线和横线不能连续出现'),
  );

export function validateAccountName(
  value: string,
): { ok: true; value: string } | { ok: false; error: string } {
  const parsed = accountNameSchema.safeParse(value);
  if (parsed.success) return { ok: true, value: parsed.data };
  return { ok: false, error: parsed.error.issues[0]?.message ?? '登录用户名格式不正确' };
}

import { z } from 'zod';

export const SHORT_NAME_MIN = 3;
export const SHORT_NAME_MAX = 30;

/**
 * short_name 是个人页在 URL 中的唯一标识，一经发布即为对外资产。
 *
 * 规则：强制小写，限 `[a-z0-9-]`，3–30 位，不以连字符开头结尾。
 * 字符集本身已经排除了下划线，因此「不得以下划线开头」这条
 * （ADR-0003 为系统路径让路的约束）自动成立。
 */
const PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

export type ShortNameError =
  | 'short_name 不能为空'
  | 'short_name 长度需在 3–30 位之间'
  | 'short_name 只能包含小写字母、数字与连字符，且不能以连字符开头或结尾';

/** 大小写不敏感，因此统一压小写后再校验与入库。 */
export function normalizeShortName(raw: string): string {
  return raw.trim().toLowerCase();
}

export function validateShortName(
  raw: string,
): { ok: true; value: string } | { ok: false; error: ShortNameError } {
  const value = normalizeShortName(raw);

  if (value.length === 0) return { ok: false, error: 'short_name 不能为空' };
  if (value.length < SHORT_NAME_MIN || value.length > SHORT_NAME_MAX) {
    return { ok: false, error: 'short_name 长度需在 3–30 位之间' };
  }
  if (!PATTERN.test(value)) {
    return {
      ok: false,
      error: 'short_name 只能包含小写字母、数字与连字符，且不能以连字符开头或结尾',
    };
  }

  return { ok: true, value };
}

export const shortNameSchema = z
  .string()
  .transform(normalizeShortName)
  .superRefine((value, ctx) => {
    const result = validateShortName(value);
    if (!result.ok) {
      ctx.addIssue({ code: 'custom', message: result.error });
    }
  });

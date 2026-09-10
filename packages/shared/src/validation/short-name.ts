import { z } from 'zod';
import type { ErrorKey } from '@link-profile/i18n';

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

export type ShortNameError = Extract<ErrorKey, `field.shortName.${string}`>;

/** 大小写不敏感，因此统一压小写后再校验与入库。 */
export function normalizeShortName(raw: string): string {
  return raw.trim().toLowerCase();
}

export function validateShortName(
  raw: string,
): { ok: true; value: string } | { ok: false; error: ShortNameError } {
  const value = normalizeShortName(raw);

  if (value.length === 0) return { ok: false, error: 'field.shortName.required' };
  if (value.length < SHORT_NAME_MIN || value.length > SHORT_NAME_MAX) {
    return { ok: false, error: 'field.shortName.length' };
  }
  if (!PATTERN.test(value)) return { ok: false, error: 'field.shortName.charset' };

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

/**
 * 把用户粘进来的东西压成 short_name。
 *
 * 输入框旁边印着域名，照样有人把整条 `https://域名/名字` 贴进去。直接拿去
 * 校验只会报「只能包含小写字母」，看不出问题在哪，所以先剥掉协议、域名、
 * 查询串再校验。含斜杠的一定是整条地址 —— short_name 本身不含斜杠。
 */
export function extractShortName(raw: string): string {
  const withoutScheme = raw
    .trim()
    .toLowerCase()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, '');
  const path = withoutScheme.split(/[?#]/, 1)[0] ?? '';
  if (!path.includes('/')) return path;
  return path.split('/').find((part, index) => index > 0 && part !== '') ?? '';
}

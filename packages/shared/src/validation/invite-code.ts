import { z } from 'zod';

export const INVITE_CODE_MIN = 8;
export const INVITE_CODE_MAX = 10;

/**
 * 邀请码字母表。
 *
 * 剔除了 O、0、I、1 —— 码要靠人抄写和口头转达，这四个字符在多数字体里
 * 分不出来，抄错一次就是一次注册失败。
 */
export const INVITE_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const PATTERN = new RegExp(`^[${INVITE_CODE_ALPHABET}]{${INVITE_CODE_MIN},${INVITE_CODE_MAX}}$`);

/** 大小写不敏感，统一压大写后再校验、入库与比对。 */
export function normalizeInviteCode(raw: string): string {
  return raw.trim().toUpperCase();
}

export function validateInviteCode(
  raw: string,
): { ok: true; value: string } | { ok: false; error: string } {
  const value = normalizeInviteCode(raw);

  if (value.length === 0) return { ok: false, error: 'field.inviteCode.required' };
  if (value.length < INVITE_CODE_MIN || value.length > INVITE_CODE_MAX) {
    return { ok: false, error: 'field.inviteCode.length' };
  }
  if (!PATTERN.test(value)) return { ok: false, error: 'field.inviteCode.charset' };

  return { ok: true, value };
}

export const inviteCodeSchema = z
  .string()
  .transform(normalizeInviteCode)
  .superRefine((value, ctx) => {
    const result = validateInviteCode(value);
    if (!result.ok) ctx.addIssue({ code: 'custom', message: result.error });
  });

/**
 * 生成一个邀请码。
 *
 * 用 `crypto.getRandomValues` 而不是 `Math.random`：码是注册的唯一凭据，
 * 可预测的伪随机等于把闸门敞开。取模会让字母表前几位略微偏高，这里靠
 * 拒绝采样避开。
 */
export function generateInviteCode(length = INVITE_CODE_MAX): string {
  const alphabet = INVITE_CODE_ALPHABET;
  const limit = 256 - (256 % alphabet.length);
  let out = '';

  while (out.length < length) {
    const bytes = new Uint8Array(length - out.length);
    crypto.getRandomValues(bytes);
    for (const byte of bytes) {
      if (byte >= limit) continue;
      out += alphabet[byte % alphabet.length];
      if (out.length === length) break;
    }
  }

  return out;
}

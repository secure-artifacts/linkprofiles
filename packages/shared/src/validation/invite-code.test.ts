import { describe, expect, test } from 'vitest';
import {
  generateInviteCode,
  INVITE_CODE_ALPHABET,
  INVITE_CODE_MAX,
  INVITE_CODE_MIN,
  normalizeInviteCode,
  validateInviteCode,
} from './invite-code.js';

describe('归一化', () => {
  test('去空白并转大写', () => {
    expect(normalizeInviteCode('  ab3xk9mq  ')).toBe('AB3XK9MQ');
  });

  test('空串归一化后仍是空串', () => {
    expect(normalizeInviteCode('   ')).toBe('');
  });
});

describe('校验', () => {
  test('接受合法的码，返回归一化后的值', () => {
    const result = validateInviteCode(' ab3xk9mq ');
    expect(result).toEqual({ ok: true, value: 'AB3XK9MQ' });
  });

  test('拒绝空串', () => {
    expect(validateInviteCode('')).toMatchObject({ ok: false });
  });

  test('长度边界：下界之内接受，之外拒绝', () => {
    const short = 'A'.repeat(INVITE_CODE_MIN - 1);
    const exact = 'A'.repeat(INVITE_CODE_MIN);
    expect(validateInviteCode(short)).toMatchObject({ ok: false });
    expect(validateInviteCode(exact)).toMatchObject({ ok: true });
  });

  test('长度边界：上界之内接受，之外拒绝', () => {
    const exact = 'A'.repeat(INVITE_CODE_MAX);
    const long = 'A'.repeat(INVITE_CODE_MAX + 1);
    expect(validateInviteCode(exact)).toMatchObject({ ok: true });
    expect(validateInviteCode(long)).toMatchObject({ ok: false });
  });

  test('拒绝字母表之外的字符', () => {
    expect(validateInviteCode('AB-3XK9M')).toMatchObject({ ok: false });
    expect(validateInviteCode('AB 3XK9M')).toMatchObject({ ok: false });
    expect(validateInviteCode('AB@3XK9M')).toMatchObject({ ok: false });
  });

  test('拒绝容易看混的 O、0、I、1', () => {
    for (const bad of ['O', '0', 'I', '1']) {
      expect(validateInviteCode(`ABCDEF${bad}H`), bad).toMatchObject({ ok: false });
    }
  });

  test('小写输入按归一化后判定，不是直接拒绝', () => {
    expect(validateInviteCode('ab3xk9mq')).toMatchObject({ ok: true, value: 'AB3XK9MQ' });
  });
});

describe('生成', () => {
  test('长度落在允许区间内', () => {
    for (let i = 0; i < 50; i += 1) {
      const code = generateInviteCode();
      expect(code.length).toBeGreaterThanOrEqual(INVITE_CODE_MIN);
      expect(code.length).toBeLessThanOrEqual(INVITE_CODE_MAX);
    }
  });

  test('生成的码一定通过自己的校验', () => {
    for (let i = 0; i < 50; i += 1) {
      expect(validateInviteCode(generateInviteCode())).toMatchObject({ ok: true });
    }
  });

  test('字母表不含容易看混的 O、0、I、1', () => {
    for (const bad of ['O', '0', 'I', '1']) {
      expect(INVITE_CODE_ALPHABET).not.toContain(bad);
    }
  });

  test('连着生成不会撞在一起', () => {
    const seen = new Set(Array.from({ length: 200 }, () => generateInviteCode()));
    expect(seen.size).toBe(200);
  });
});

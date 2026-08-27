import { describe, expect, test } from 'vitest';
import { validateShortName } from './short-name.js';

const ok = (raw: string) => validateShortName(raw);

describe('validateShortName', () => {
  test('大小写与空白被压平，不算错误', () => {
    expect(ok('MimNZ')).toEqual({ ok: true, value: 'mimnz' });
    expect(ok('  mimnz  ')).toEqual({ ok: true, value: 'mimnz' });
  });

  test('接受小写字母、数字与中间的连字符', () => {
    for (const value of ['abc', 'a-b', 'mim-nz-2026', 'x9y', 'a'.repeat(30)]) {
      expect(ok(value)).toEqual({ ok: true, value });
    }
  });

  test('长度不足三位或超过三十位被拒', () => {
    expect(ok('ab').ok).toBe(false);
    expect(ok('a'.repeat(31)).ok).toBe(false);
  });

  test('不以连字符开头或结尾', () => {
    expect(ok('-abc').ok).toBe(false);
    expect(ok('abc-').ok).toBe(false);
    expect(ok('---').ok).toBe(false);
  });

  test('下划线开头被拒，系统路径的命名空间不会被抢占', () => {
    expect(ok('_admin').ok).toBe(false);
    expect(ok('_api').ok).toBe(false);
    expect(ok('a_b').ok).toBe(false);
  });

  test('URL 不安全字符与非 ASCII 一概被拒', () => {
    for (const value of [
      'a b',
      'a/b',
      'a.b',
      'a?b',
      'a%20b',
      'a#b',
      '中文名',
      'émile',
      'ab\n',
      'a\tb',
    ]) {
      expect(ok(value).ok).toBe(false);
    }
  });

  test('空串给出专门的提示', () => {
    expect(ok('')).toEqual({ ok: false, error: 'short_name 不能为空' });
    expect(ok('   ')).toEqual({ ok: false, error: 'short_name 不能为空' });
  });
});

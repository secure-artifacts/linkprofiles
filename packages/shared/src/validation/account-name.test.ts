import { describe, expect, test } from 'vitest';
import { validateAccountName } from './account-name.js';

describe('登录用户名', () => {
  test('统一裁掉空白并转成小写', () => {
    expect(validateAccountName('  Lisa.USA  ')).toEqual({ ok: true, value: 'lisa.usa' });
  });

  test.each(['ab', '有中文', 'a b', '-start', 'end_', 'two..dots', 'a__b'])(
    '拒绝非法值 %s',
    (value) => expect(validateAccountName(value).ok).toBe(false),
  );

  test.each(['lisa', 'team_01', 'clare-polly', 'a.b'])('接受 %s', (value) => {
    expect(validateAccountName(value)).toEqual({ ok: true, value });
  });
});

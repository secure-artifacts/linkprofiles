import { describe, expect, test } from 'vitest';
import { truncateIp } from './ip.js';
import { sanitizeSource, SOURCE_MAX_LENGTH } from './source.js';
import { parseUserAgent } from './user-agent.js';

describe('truncateIp', () => {
  test('IPv4 去掉最后一段', () => {
    expect(truncateIp('203.0.113.42')).toBe('203.0.113.0');
    expect(truncateIp('8.8.8.8')).toBe('8.8.8.0');
    expect(truncateIp('192.168.1.255')).toBe('192.168.1.0');
  });

  test('已经是整段的地址不受影响', () => {
    expect(truncateIp('203.0.113.0')).toBe('203.0.113.0');
  });

  test('IPv6 只留前 48 位', () => {
    expect(truncateIp('2001:0db8:85a3:0000:0000:8a2e:0370:7334')).toBe('2001:db8:85a3::');
    expect(truncateIp('2001:db8:85a3::8a2e:370:7334')).toBe('2001:db8:85a3::');
    expect(truncateIp('fe80::1')).toBe('fe80:0:0::');
  });

  test('IPv4-mapped IPv6 按 IPv4 处理', () => {
    expect(truncateIp('::ffff:203.0.113.42')).toBe('203.0.113.0');
    expect(truncateIp('::FFFF:203.0.113.42')).toBe('203.0.113.0');
  });

  test('反代带上的端口被忽略', () => {
    expect(truncateIp('203.0.113.42:51234')).toBe('203.0.113.0');
  });

  test('空值与认不出来的输入返回 null，不把脏值落库', () => {
    for (const value of [
      null,
      undefined,
      '',
      '   ',
      '不是地址',
      '999.1.1.1',
      '1.2.3',
      'localhost',
    ]) {
      expect(truncateIp(value), String(value)).toBeNull();
    }
  });

  test('截断之后再也还原不出最后一段', () => {
    const truncated = truncateIp('203.0.113.42');
    expect(truncated).not.toContain('42');
  });
});

describe('sanitizeSource', () => {
  test('放行合法的来源标识', () => {
    expect(sanitizeSource('tiktok')).toBe('tiktok');
    expect(sanitizeSource('ig_bio')).toBe('ig_bio');
    expect(sanitizeSource('fb-ads-2026')).toBe('fb-ads-2026');
  });

  test('大小写不敏感，前后空白压掉', () => {
    expect(sanitizeSource('TikTok')).toBe('tiktok');
    expect(sanitizeSource('  tiktok  ')).toBe('tiktok');
    // 换行也算前后空白；中间夹着空白的仍然整条丢弃，见下一条用例
    expect(sanitizeSource('tiktok\n')).toBe('tiktok');
  });

  test('无参数记为未知来源', () => {
    expect(sanitizeSource(null)).toBeNull();
    expect(sanitizeSource(undefined)).toBeNull();
    expect(sanitizeSource('')).toBeNull();
    expect(sanitizeSource('   ')).toBeNull();
  });

  test('注入类畸形输入整条丢弃，而不是截断后凑合用', () => {
    for (const value of [
      "tiktok'; drop table page_views;--",
      '<script>alert(1)</script>',
      'tiktok<script>',
      '../../etc/passwd',
      'tik tok',
      'tik\ttok',
      'tiktok\u0000',
      '中文来源',
      'tik.tok',
      'tik/tok',
      'tik%20tok',
      '${jndi:ldap://evil}',
    ]) {
      expect(sanitizeSource(value), value).toBeNull();
    }
  });

  test('超长即丢弃，不截断', () => {
    expect(sanitizeSource('a'.repeat(SOURCE_MAX_LENGTH))).toBe('a'.repeat(SOURCE_MAX_LENGTH));
    expect(sanitizeSource('a'.repeat(SOURCE_MAX_LENGTH + 1))).toBeNull();
  });
});

describe('parseUserAgent', () => {
  test('认出手机', () => {
    const iphone = parseUserAgent(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    );
    expect(iphone).toEqual({ deviceType: 'mobile', os: 'iOS' });

    const android = parseUserAgent(
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
    );
    expect(android.deviceType).toBe('mobile');
    expect(android.os).toBe('Android');
  });

  test('认出平板', () => {
    const ipad = parseUserAgent(
      'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    );
    expect(ipad.deviceType).toBe('tablet');
  });

  test('桌面浏览器归到桌面档', () => {
    const mac = parseUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    );
    expect(mac.deviceType).toBe('desktop');
    expect(mac.os).toBe('macOS');

    const windows = parseUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    );
    expect(windows.deviceType).toBe('desktop');
    expect(windows.os).toBe('Windows');
  });

  test('空的、乱七八糟的 User-Agent 不抛异常', () => {
    expect(parseUserAgent(null)).toEqual({ deviceType: 'unknown', os: null });
    expect(parseUserAgent('')).toEqual({ deviceType: 'unknown', os: null });
    expect(parseUserAgent('   ')).toEqual({ deviceType: 'unknown', os: null });
    expect(() => parseUserAgent('()()()'.repeat(500))).not.toThrow();
  });
});

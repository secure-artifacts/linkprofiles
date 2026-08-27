import { describe, expect, test } from 'vitest';
import { inferPlatformFromUrl } from './infer-platform.js';
import { buildSocialUrl, SOCIAL_PLATFORMS } from './platforms.js';

describe('buildSocialUrl', () => {
  test('用户填号码，系统拼 wa.me，只留数字', () => {
    expect(buildSocialUrl('whatsapp', '+1 (555) 010-9999')).toBe('https://wa.me/15550109999');
  });

  test('用户填邮箱，系统拼 mailto:', () => {
    expect(buildSocialUrl('email', ' hi@example.com ')).toBe('mailto:hi@example.com');
  });

  test('Messenger 指向 m.me 直接开对话，不是 Facebook 主页', () => {
    expect(buildSocialUrl('messenger', 'mimnz')).toBe('https://m.me/mimnz');
    expect(buildSocialUrl('facebook', 'mimnz')).toBe('https://facebook.com/mimnz');
  });

  test('用户名去掉 @ 前缀与整条 URL 前缀', () => {
    expect(buildSocialUrl('instagram', '@mimnz')).toBe('https://instagram.com/mimnz');
    expect(buildSocialUrl('instagram', 'https://instagram.com/mimnz')).toBe(
      'https://instagram.com/mimnz',
    );
    expect(buildSocialUrl('instagram', 'https://instagram.com/mimnz/')).toBe(
      'https://instagram.com/mimnz',
    );
  });

  test('不带协议整条粘贴也认得出来', () => {
    // 用户很少只填用户名，更常见的是从地址栏整条复制，而且经常不带协议
    expect(buildSocialUrl('instagram', 'instagram.com/mimnz')).toBe('https://instagram.com/mimnz');
    expect(buildSocialUrl('instagram', 'www.instagram.com/mimnz/')).toBe(
      'https://instagram.com/mimnz',
    );
  });

  test('地址上的查询串与锚点被去掉，不会拼进用户名', () => {
    expect(buildSocialUrl('youtube', 'youtube.com/@mimnz?si=abc123')).toBe(
      'https://youtube.com/@mimnz',
    );
    expect(buildSocialUrl('instagram', 'instagram.com/mimnz#about')).toBe(
      'https://instagram.com/mimnz',
    );
  });

  test('LinkedIn 拼到 /in/ 下，整条粘贴也不会拼出 in/in/', () => {
    expect(buildSocialUrl('linkedin', 'mimnz')).toBe('https://linkedin.com/in/mimnz');
    expect(buildSocialUrl('linkedin', '@mimnz')).toBe('https://linkedin.com/in/mimnz');
    expect(buildSocialUrl('linkedin', 'linkedin.com/in/mimnz')).toBe(
      'https://linkedin.com/in/mimnz',
    );
    expect(buildSocialUrl('linkedin', 'https://www.linkedin.com/in/mimnz/')).toBe(
      'https://linkedin.com/in/mimnz',
    );
  });

  test('不认识的平台与空值返回 null', () => {
    expect(buildSocialUrl('weixin', 'anything')).toBeNull();
    expect(buildSocialUrl('whatsapp', '   ')).toBeNull();
  });

  test('清单里不含任何大陆 app', () => {
    const ids = SOCIAL_PLATFORMS.map((p) => p.id);
    for (const banned of ['weixin', 'wechat', 'qq', 'weibo', 'douyin', 'xiaohongshu', 'bilibili']) {
      expect(ids).not.toContain(banned);
    }
  });

  test('联系类默认计入线索，内容类默认不计', () => {
    const leadDefault = Object.fromEntries(SOCIAL_PLATFORMS.map((p) => [p.id, p.defaultIsLead]));
    expect(leadDefault).toMatchObject({
      whatsapp: true,
      messenger: true,
      telegram: true,
      email: true,
      instagram: false,
      youtube: false,
      tiktok: false,
      x: false,
      linkedin: false,
    });
  });
});

describe('inferPlatformFromUrl', () => {
  test('从目标地址认出平台', () => {
    expect(inferPlatformFromUrl('https://wa.me/15550109999')).toBe('whatsapp');
    expect(inferPlatformFromUrl('https://m.me/mimnz')).toBe('messenger');
    expect(inferPlatformFromUrl('mailto:hi@example.com')).toBe('email');
    expect(inferPlatformFromUrl('https://www.youtube.com/@mimnz')).toBe('youtube');
    expect(inferPlatformFromUrl('https://twitter.com/mimnz')).toBe('x');
    expect(inferPlatformFromUrl('https://www.linkedin.com/in/mimnz')).toBe('linkedin');
    expect(inferPlatformFromUrl('https://lnkd.in/abc123')).toBe('linkedin');
  });

  test('认不出来就返回 null，按钮照常可用', () => {
    expect(inferPlatformFromUrl('https://example.com/whatever')).toBeNull();
    expect(inferPlatformFromUrl('不是一个地址')).toBeNull();
  });

  test('不会被子域名蒙混：evil-wa.me 不算 WhatsApp', () => {
    expect(inferPlatformFromUrl('https://evil-wa.me/x')).toBeNull();
    expect(inferPlatformFromUrl('https://wa.me.evil.com/x')).toBeNull();
  });
});

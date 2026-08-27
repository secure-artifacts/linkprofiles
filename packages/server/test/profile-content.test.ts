import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { createTestContext, type TestContext } from './helpers/context.js';
import { createLoginableUser } from './helpers/factories.js';
import { login, withSession } from './helpers/http.js';

let ctx: TestContext;
let ownerToken: string;
let adminToken: string;
let strangerToken: string;
let userId: string;

beforeAll(async () => {
  ctx = await createTestContext();
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.sql`truncate table users cascade`;

  const admin = await createLoginableUser(ctx.db, 'admin-pass', {
    role: 'admin',
    account: 'admin',
    shortName: null,
  });
  await createLoginableUser(ctx.db, 'other-pass', {
    role: 'admin',
    account: 'other-admin',
    shortName: null,
  });
  const user = await createLoginableUser(ctx.db, 'user-pass', {
    role: 'user',
    account: 'mimnz',
    shortName: 'mimnz',
    displayName: 'mimnz',
    owningAdminId: admin.id,
  });
  userId = user.id;

  ownerToken = (await login(ctx, 'mimnz', 'user-pass')).token;
  adminToken = (await login(ctx, 'admin', 'admin-pass')).token;
  strangerToken = (await login(ctx, 'other-admin', 'other-pass')).token;
});

const putButtons = (token: string, list: unknown[]) =>
  ctx.app.inject({
    method: 'PUT',
    url: `/_api/users/${userId}/buttons`,
    ...withSession(token),
    payload: { buttons: list },
  });

const page = () => ctx.app.inject({ method: 'GET', url: '/mimnz' });

test('改显示名与简介，公开页随之变化', async () => {
  const res = await ctx.app.inject({
    method: 'PATCH',
    url: `/_api/users/${userId}/profile`,
    ...withSession(ownerToken),
    payload: { displayName: '新的名字', bio: '我是一个基督徒，来自美国' },
  });
  expect(res.statusCode).toBe(200);

  const html = (await page()).body;
  expect(html).toContain('新的名字');
  expect(html).toContain('我是一个基督徒，来自美国');
});

test('按钮可增删改，顺序持久化并反映在公开页上', async () => {
  await putButtons(ownerToken, [
    { title: '第一个', url: 'https://example.com/a' },
    { title: '第二个', url: 'https://example.com/b' },
    { title: '第三个', url: 'https://example.com/c' },
  ]);

  let html = (await page()).body;
  expect(html.indexOf('第一个')).toBeLessThan(html.indexOf('第二个'));
  expect(html.indexOf('第二个')).toBeLessThan(html.indexOf('第三个'));

  // 拖拽重排 + 删掉一个 + 改一个的标题，都是对同一个数组的操作
  await putButtons(ownerToken, [
    { title: '第三个', url: 'https://example.com/c' },
    { title: '改过名的第一个', url: 'https://example.com/a' },
  ]);

  html = (await page()).body;
  expect(html).not.toContain('第二个');
  expect(html.indexOf('第三个')).toBeLessThan(html.indexOf('改过名的第一个'));
});

test('公开页按 is_lead 呈现两级视觉，分级与位置无关', async () => {
  await putButtons(ownerToken, [
    { title: '内容在前', url: 'https://example.com/blog', isLead: false },
    { title: '联系在后', url: 'https://wa.me/15550109999', isLead: true },
  ]);

  const html = (await page()).body;

  // 联系类是实心卡片，内容类是描边行——即使联系类排在后面
  expect(html).toMatch(/class="pp-lead"[^>]*>(?:(?!<\/a>).)*联系在后/s);
  expect(html).toMatch(/class="pp-link"[^>]*>(?:(?!<\/a>).)*内容在前/s);
  // 页面上没有任何区段标题
  expect(html).not.toContain('联系方式');
  expect(html).not.toContain('内容链接');
});

test('副标题留空时不渲染那一行', async () => {
  await putButtons(ownerToken, [
    { title: '有副标题', url: 'https://wa.me/1', isLead: true, subtitle: '通常当天回复' },
    { title: '没副标题', url: 'https://wa.me/2', isLead: true },
  ]);

  const html = (await page()).body;
  expect(html).toContain('通常当天回复');

  const withSubtitle = html.slice(html.indexOf('有副标题'), html.indexOf('没副标题'));
  const withoutSubtitle = html.slice(html.indexOf('没副标题'));
  expect(withSubtitle).toContain('<span>');
  // 「没副标题」那张卡片的 tx 里只剩 <b>，没有第二个 span
  expect(withoutSubtitle.slice(0, withoutSubtitle.indexOf('</a>'))).not.toContain('<span>通常');
});

test('单页按钮数量上限五十', async () => {
  const fifty = Array.from({ length: 50 }, (_, i) => ({
    title: `按钮 ${i}`,
    url: `https://example.com/${i}`,
  }));

  expect((await putButtons(ownerToken, fifty)).statusCode).toBe(200);

  const fiftyOne = [...fifty, { title: '第 51 个', url: 'https://example.com/51' }];
  const res = await putButtons(ownerToken, fiftyOne);
  expect(res.statusCode).toBe(400);
});

test('目标链接的危险协议被拒，不会变成存储型 XSS', async () => {
  for (const url of ['javascript:alert(1)', 'data:text/html,<script>alert(1)</script>']) {
    const res = await putButtons(ownerToken, [{ title: '坏链接', url }]);
    expect(res.statusCode, url).toBe(400);
    expect(res.json().error).toBe('invalid_url');
  }

  const html = (await page()).body;
  expect(html).not.toContain('javascript:');
});

test('按钮文字里的尖括号被转义，不会注入标签', async () => {
  await putButtons(ownerToken, [
    { title: '<script>alert(1)</script>', url: 'https://example.com/x' },
  ]);

  const html = (await page()).body;
  expect(html).not.toContain('<script>alert(1)</script>');
  expect(html).toContain('&lt;script&gt;');
});

test('社媒图标只填号码或邮箱，目标 URL 由系统拼装', async () => {
  const res = await ctx.app.inject({
    method: 'PUT',
    url: `/_api/users/${userId}/social-icons`,
    ...withSession(ownerToken),
    payload: {
      socialIcons: [
        { platform: 'whatsapp', value: '+1 (555) 010-9999' },
        { platform: 'email', value: 'hi@example.com' },
        { platform: 'instagram', value: '@mimnz' },
      ],
    },
  });
  expect(res.statusCode).toBe(200);

  const html = (await page()).body;
  expect(html).toContain('href="https://wa.me/15550109999"');
  expect(html).toContain('href="mailto:hi@example.com"');
  expect(html).toContain('href="https://instagram.com/mimnz"');
});

test('社媒图标的默认 is_lead 按平台给出，且可覆盖', async () => {
  await ctx.app.inject({
    method: 'PUT',
    url: `/_api/users/${userId}/social-icons`,
    ...withSession(ownerToken),
    payload: {
      socialIcons: [
        { platform: 'whatsapp', value: '15550109999' },
        { platform: 'instagram', value: 'mimnz' },
        { platform: 'youtube', value: 'mimnz', isLead: true },
      ],
    },
  });

  const saved = await ctx.app.inject({
    method: 'GET',
    url: `/_api/users/${userId}/profile`,
    ...withSession(ownerToken),
  });
  const byPlatform = Object.fromEntries(
    saved
      .json()
      .socialIcons.map((i: { platform: string; isLead: boolean }) => [i.platform, i.isLead]),
  );
  expect(byPlatform).toEqual({ whatsapp: true, instagram: false, youtube: true });
});

test('清单外的平台被拒，绕过后台直接调接口也塞不进大陆 app', async () => {
  const res = await ctx.app.inject({
    method: 'PUT',
    url: `/_api/users/${userId}/social-icons`,
    ...withSession(ownerToken),
    payload: { socialIcons: [{ platform: 'weixin', value: 'mimnz' }] },
  });

  expect(res.statusCode).toBe(400);
  expect(res.json()).toMatchObject({ error: 'unknown_platform', platform: 'weixin' });
});

test('同一个平台不能启用两次', async () => {
  const res = await ctx.app.inject({
    method: 'PUT',
    url: `/_api/users/${userId}/social-icons`,
    ...withSession(ownerToken),
    payload: {
      socialIcons: [
        { platform: 'whatsapp', value: '1' },
        { platform: 'whatsapp', value: '2' },
      ],
    },
  });

  expect(res.statusCode).toBe(400);
  expect(res.json()).toMatchObject({ error: 'duplicate_platform' });
});

test('内置平台清单只含海外平台', async () => {
  const res = await ctx.app.inject({ method: 'GET', url: '/_api/social-platforms' });

  const ids = res.json().platforms.map((p: { id: string }) => p.id);
  expect(ids).toContain('whatsapp');
  expect(ids).toContain('messenger');
  for (const banned of ['weixin', 'wechat', 'qq', 'weibo', 'douyin', 'xiaohongshu']) {
    expect(ids).not.toContain(banned);
  }
});

test('归属管理员可以代改名下用户的内容', async () => {
  const res = await ctx.app.inject({
    method: 'PATCH',
    url: `/_api/users/${userId}/profile`,
    ...withSession(adminToken),
    payload: { bio: '运营统一控版' },
  });

  expect(res.statusCode).toBe(200);
  expect((await page()).body).toContain('运营统一控版');
});

test('非归属管理员改不动别人的用户', async () => {
  for (const call of [
    {
      method: 'PATCH' as const,
      url: `/_api/users/${userId}/profile`,
      payload: { bio: '我乱改的' },
    },
    {
      method: 'PUT' as const,
      url: `/_api/users/${userId}/buttons`,
      payload: { buttons: [{ title: '我塞的', url: 'https://evil.example.com' }] },
    },
    {
      method: 'PUT' as const,
      url: `/_api/users/${userId}/social-icons`,
      payload: { socialIcons: [{ platform: 'whatsapp', value: '1' }] },
    },
    { method: 'GET' as const, url: `/_api/users/${userId}/profile` },
  ]) {
    const res = await ctx.app.inject({ ...call, ...withSession(strangerToken) });
    expect(res.statusCode, `${call.method} ${call.url}`).toBe(403);
  }

  expect((await page()).body).not.toContain('我乱改的');
});

test('未登录改不了任何内容', async () => {
  const res = await ctx.app.inject({
    method: 'PUT',
    url: `/_api/users/${userId}/buttons`,
    payload: { buttons: [] },
  });

  expect(res.statusCode).toBe(401);
});

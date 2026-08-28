import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pageViews } from '@link-profile/shared/schema';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { createTestContext, type TestContext } from './helpers/context.js';
import { createLoginableUser } from './helpers/factories.js';
import { login, withSession } from './helpers/http.js';
import { makePng, multipart } from './helpers/media-fixtures.js';

let ctx: TestContext;
let userId: string;
let profileId: string;
let token: string;
let uploads: string;

const WHATSAPP_BOT = 'WhatsApp/2.23.20.0 A';
const FACEBOOK_BOT = 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)';
const BROWSER_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

beforeAll(async () => {
  uploads = await mkdtemp(path.join(tmpdir(), 'lp-og-'));
  process.env.UPLOADS_DIR = uploads;
  ctx = await createTestContext();
});

afterAll(async () => {
  await ctx.close();
  await rm(uploads, { recursive: true, force: true });
  delete process.env.UPLOADS_DIR;
  delete process.env.PUBLIC_ORIGIN;
});

beforeEach(async () => {
  await ctx.sql`truncate table users cascade`;
  await ctx.sql`truncate table page_views, clicks`;
  delete process.env.PUBLIC_ORIGIN;

  const user = await createLoginableUser(ctx.db, 'user-pass', {
    role: 'user',
    account: 'mimnz',
    shortName: 'mimnz',
    displayName: 'mimnz',
    bio: '我是一个基督徒，来自美国',
  });
  userId = user.id;
  profileId = user.profileId!;
  token = (await login(ctx, 'mimnz', 'user-pass')).token;
});

const fetchPage = (headers: Record<string, string> = {}) =>
  ctx.app.inject({
    method: 'GET',
    url: '/mimnz',
    headers: { 'user-agent': BROWSER_UA, ...headers },
  });

function metaOf(html: string, attr: string, name: string): string | null {
  const pattern = new RegExp(`<meta ${attr}="${name}" content="([^"]*)"`);
  return pattern.exec(html)?.[1] ?? null;
}

test('公开页输出完整的 og 标签：标题、描述与预览图', async () => {
  const html = (await fetchPage()).body;

  expect(metaOf(html, 'property', 'og:title')).toBe('mimnz');
  expect(metaOf(html, 'property', 'og:description')).toBe('我是一个基督徒，来自美国');
  expect(metaOf(html, 'property', 'og:image')).toBeTruthy();
  expect(metaOf(html, 'property', 'og:url')).toBeTruthy();
});

test('og 里的地址是绝对地址，爬虫不解析相对路径', async () => {
  process.env.PUBLIC_ORIGIN = 'https://links.example.com';

  const html = (await fetchPage()).body;

  expect(metaOf(html, 'property', 'og:url')).toBe('https://links.example.com/mimnz');
  expect(metaOf(html, 'property', 'og:image')).toMatch(/^https:\/\/links\.example\.com\//);
});

test('反代做 TLS 时协议从 X-Forwarded-Proto 取，卡片里不会出现 http', async () => {
  const html = (
    await fetchPage({ 'x-forwarded-proto': 'https', 'x-forwarded-host': 'links.example.com' })
  ).body;

  expect(metaOf(html, 'property', 'og:url')).toBe('https://links.example.com/mimnz');
});

test('预览图取用户的头像', async () => {
  const { payload, headers } = multipart(
    { slot: 'avatar' },
    { file: { filename: 'a.png', contentType: 'image/png', data: await makePng() } },
  );
  await ctx.app.inject({
    method: 'POST',
    url: `/_api/profiles/${profileId}/media`,
    ...withSession(token),
    headers,
    payload,
  });

  const html = (await fetchPage()).body;
  expect(metaOf(html, 'property', 'og:image')).toContain('/_static/uploads/');
});

test('没有素材时预览图回落到与主题一致的占位图', async () => {
  await ctx.app.inject({
    method: 'PATCH',
    url: `/_api/profiles/${profileId}`,
    ...withSession(token),
    payload: { theme: 'nocturne' },
  });

  const html = (await fetchPage()).body;
  const image = metaOf(html, 'property', 'og:image')!;
  expect(image).toContain('/_static/og/nocturne.png');

  // 这张图真的取得到，而且是 PNG —— 不少爬虫不认 SVG
  const fetched = await ctx.app.inject({ method: 'GET', url: '/_static/og/nocturne.png' });
  expect(fetched.statusCode).toBe(200);
  expect(fetched.headers['content-type']).toBe('image/png');
  expect(fetched.rawPayload.subarray(1, 4).toString()).toBe('PNG');
});

test('不认识的主题拿不到占位图', async () => {
  const res = await ctx.app.inject({ method: 'GET', url: '/_static/og/neon.png' });

  expect(res.statusCode).toBe(404);
});

test('输出 noindex 阻止搜索引擎收录', async () => {
  const html = (await fetchPage()).body;

  expect(metaOf(html, 'name', 'robots')).toBe('noindex, nofollow');
});

test('noindex 与 og 标签并行不冲突：社媒爬虫仍能抓到完整卡片', async () => {
  for (const bot of [WHATSAPP_BOT, FACEBOOK_BOT]) {
    const res = await fetchPage({ 'user-agent': bot });

    expect(res.statusCode, bot).toBe(200);
    expect(metaOf(res.body, 'name', 'robots'), bot).toBe('noindex, nofollow');
    expect(metaOf(res.body, 'property', 'og:title'), bot).toBe('mimnz');
    expect(metaOf(res.body, 'property', 'og:image'), bot).toBeTruthy();
  }
});

test('爬虫抓取不产生埋点记录，与 12 的规则一致', async () => {
  await fetchPage({ 'user-agent': WHATSAPP_BOT });
  await fetchPage({ 'user-agent': FACEBOOK_BOT });

  expect(await ctx.db.select().from(pageViews)).toHaveLength(0);

  // 真人访问照常记
  await fetchPage();
  expect(await ctx.db.select().from(pageViews)).toHaveLength(1);
});

test('简介为空时描述有个说得过去的兜底', async () => {
  await ctx.app.inject({
    method: 'PATCH',
    url: `/_api/profiles/${profileId}`,
    ...withSession(token),
    payload: { bio: '' },
  });

  const html = (await fetchPage()).body;
  expect(metaOf(html, 'property', 'og:description')).toContain('mimnz');
});

test('显示名里的引号与尖括号被转义，不会撑破 meta 标签', async () => {
  await ctx.app.inject({
    method: 'PATCH',
    url: `/_api/profiles/${profileId}`,
    ...withSession(token),
    payload: { displayName: '"><script>alert(1)</script>' },
  });

  const html = (await fetchPage()).body;
  const head = html.slice(0, html.indexOf('</head>'));
  expect(head).not.toContain('<script>alert(1)</script>');
  expect(head).toContain('&quot;&gt;&lt;script&gt;');
});

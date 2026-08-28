import { PASSTHROUGH_CAVEAT } from '@link-profile/shared';
import { clicks, pageViews } from '@link-profile/shared/schema';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { createTestContext, type TestContext } from './helpers/context.js';
import { createLoginableUser } from './helpers/factories.js';
import { login, withSession } from './helpers/http.js';

let ctx: TestContext;
let userId: string;
let profileId: string;
let token: string;
let superToken: string;

beforeAll(async () => {
  ctx = await createTestContext();
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.sql`truncate table users cascade`;
  await ctx.sql`truncate table page_views, clicks, settings`;

  const user = await createLoginableUser(ctx.db, 'user-pass', {
    role: 'user',
    account: 'mimnz',
    shortName: 'mimnz',
    displayName: 'mimnz',
  });
  await createLoginableUser(ctx.db, 'super-pass', {
    role: 'superadmin',
    account: 'super',
  });
  userId = user.id;
  profileId = user.profileId!;
  token = (await login(ctx, 'mimnz', 'user-pass')).token;
  superToken = (await login(ctx, 'super', 'super-pass')).token;
});

/**
 * inject 的默认 User-Agent 是 `lightMyRequest`，isbot 会把它认成爬虫而不写埋点 ——
 * 这正是我们想要的行为，但这个文件测的是来源，所以统一带一个真浏览器的 UA。
 */
const BROWSER_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const visit = (url: string) =>
  ctx.app.inject({ method: 'GET', url, headers: { 'user-agent': BROWSER_UA } });

async function setButtons(list: Record<string, unknown>[]) {
  const res = await ctx.app.inject({
    method: 'PUT',
    url: `/_api/profiles/${profileId}/entries`,
    ...withSession(token),
    payload: { entries: list.map((item) => ({ kind: 'link', ...item })) },
  });
  expect(res.statusCode).toBe(200);
  return res.json().entries as { id: string; url: string }[];
}

/** 从直出的 HTML 里取出某个按钮的 href。 */
function hrefOf(html: string, title: string): string {
  const index = html.indexOf(title);
  const before = html.slice(0, index);
  const start = before.lastIndexOf('href="');
  return before.slice(start + 6, before.indexOf('"', start + 6));
}

test('src 随该次访问的页面浏览一并记录', async () => {
  await visit('/mimnz?src=tiktok');
  await visit('/mimnz?src=instagram');
  await visit('/mimnz');

  const rows = await ctx.db.select().from(pageViews);
  // 无参数那次记为未知来源
  expect(rows.map((r) => r.source ?? '(未知)').sort()).toEqual(['(未知)', 'instagram', 'tiktok']);
});

test('src 随点击一并记录', async () => {
  const [button] = await setButtons([
    { kind: 'link', title: '联系我', url: 'https://wa.me/1', isLead: true },
  ]);

  await ctx.app.inject({
    method: 'POST',
    url: '/_api/track/click',
    headers: { 'user-agent': BROWSER_UA },
    payload: { kind: 'button', id: button!.id, src: 'tiktok' },
  });

  const [row] = await ctx.db.select().from(clicks);
  expect(row?.source).toBe('tiktok');
});

test('无参数访问记为未知来源', async () => {
  await visit('/mimnz');

  const [row] = await ctx.db.select().from(pageViews);
  expect(row?.source).toBeNull();
});

test('脏值整条丢弃，不得进入数据库', async () => {
  for (const raw of [
    '<script>alert(1)</script>',
    "tiktok'; drop table page_views;--",
    'a'.repeat(64),
    '../../etc/passwd',
  ]) {
    await visit(`/mimnz?src=${encodeURIComponent(raw)}`);
  }

  const rows = await ctx.db.select().from(pageViews);
  expect(rows).toHaveLength(4);
  expect(rows.every((r) => r.source === null)).toBe(true);
});

test('脏值也不会出现在后台图表读到的任何地方', async () => {
  await visit('/mimnz?src=%3Cscript%3E');

  const sources = (await ctx.db.select().from(pageViews)).map((r) => r.source);
  expect(sources.join('')).not.toContain('script');
});

test('按钮可逐条开启透传，开启后目标 URL 上带上来源', async () => {
  await setButtons([
    { kind: 'link', title: '透传的', url: 'https://example.com/landing', passSource: true },
    { kind: 'link', title: '不透传的', url: 'https://example.com/other', passSource: false },
  ]);

  const html = (await visit('/mimnz?src=tiktok')).body;

  expect(hrefOf(html, '透传的')).toBe('https://example.com/landing?src=tiktok');
  expect(hrefOf(html, '不透传的')).toBe('https://example.com/other');
});

test('没有来源时开着透传也不改地址', async () => {
  await setButtons([
    { kind: 'link', title: '透传的', url: 'https://example.com/landing', passSource: true },
  ]);

  const html = (await visit('/mimnz')).body;

  expect(hrefOf(html, '透传的')).toBe('https://example.com/landing');
});

test('目标本来就带了 src 就不覆盖，用户手写的优先', async () => {
  await setButtons([
    {
      kind: 'link',
      title: '手写过',
      url: 'https://example.com/landing?src=manual',
      passSource: true,
    },
  ]);

  const html = (await visit('/mimnz?src=tiktok')).body;

  expect(hrefOf(html, '手写过')).toContain('src=manual');
  expect(hrefOf(html, '手写过')).not.toContain('tiktok');
});

test('mailto 与 tel 这类地址不挂参数', async () => {
  await setButtons([
    { kind: 'link', title: '发邮件', url: 'mailto:hi@example.com', passSource: true },
    { kind: 'link', title: '打电话', url: 'tel:+15550109999', passSource: true },
  ]);

  const html = (await visit('/mimnz?src=tiktok')).body;

  expect(hrefOf(html, '发邮件')).toBe('mailto:hi@example.com');
  expect(hrefOf(html, '打电话')).toBe('tel:+15550109999');
});

test('超级管理员可设置透传的全局默认值', async () => {
  await setButtons([{ kind: 'link', title: '没单独开', url: 'https://example.com/landing' }]);

  // 默认关着
  expect(hrefOf((await visit('/mimnz?src=tiktok')).body, '没单独开')).toBe(
    'https://example.com/landing',
  );

  const saved = await ctx.app.inject({
    method: 'PATCH',
    url: '/_api/settings',
    ...withSession(superToken),
    payload: { sourcePassthroughDefault: true },
  });
  expect(saved.statusCode).toBe(200);

  // 打开之后没单独开关的按钮也跟着透传
  expect(hrefOf((await visit('/mimnz?src=tiktok')).body, '没单独开')).toBe(
    'https://example.com/landing?src=tiktok',
  );
});

test('全局默认只有超级管理员改得了', async () => {
  const res = await ctx.app.inject({
    method: 'PATCH',
    url: '/_api/settings',
    ...withSession(token),
    payload: { sourcePassthroughDefault: true },
  });

  expect(res.statusCode).toBe(403);
});

test('后台读得到已知取舍的文案，说明用的是 src 而不是 utm_source', async () => {
  const res = await ctx.app.inject({
    method: 'GET',
    url: '/_api/settings',
    ...withSession(token),
  });

  expect(res.statusCode).toBe(200);
  expect(res.json().sourcePassthroughCaveat).toBe(PASSTHROUGH_CAVEAT);
  expect(res.json().sourcePassthroughCaveat).toContain('utm_source');
  expect(res.json().sourcePassthroughCaveat).toContain('第三方');
});

test('社媒图标同样支持逐条透传', async () => {
  await ctx.app.inject({
    method: 'PUT',
    url: `/_api/profiles/${profileId}/entries`,
    ...withSession(token),
    payload: {
      entries: [
        {
          kind: 'social',
          title: 'Instagram',
          platform: 'instagram',
          value: 'mimnz',
          passSource: true,
        },
      ],
    },
  });

  const html = (await visit('/mimnz?src=tiktok')).body;
  expect(html).toContain('https://instagram.com/mimnz?src=tiktok');
});

test('来源大小写不敏感，TikTok 与 tiktok 是同一个来源', async () => {
  await visit('/mimnz?src=TikTok');
  await visit('/mimnz?src=tiktok');

  const rows = await ctx.db.select().from(pageViews);
  expect(rows.map((r) => r.source)).toEqual(['tiktok', 'tiktok']);
});

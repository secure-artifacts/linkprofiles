import { clicks, pageViews } from '@link-profile/shared/schema';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import type { GeoLookup } from '../src/tracking/geo.js';
import { createTestContext, type TestContext } from './helpers/context.js';
import { createLoginableUser } from './helpers/factories.js';
import { login, withSession } from './helpers/http.js';

let ctx: TestContext;
let userId: string;
let profileId: string;
let token: string;
/** 记下地域查询实际收到的 IP，用来证明「先查后截断」的顺序。 */
let geoSawIps: (string | null)[] = [];

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const FACEBOOK_BOT = 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)';

/** 假的地域库：只对测试里用的那个网段有答案。 */
const fakeGeo: GeoLookup = async (ip) => {
  geoSawIps.push(ip);
  if (ip === '203.0.113.42') return { country: 'US', city: 'Austin' };
  return { country: null, city: null };
};

beforeAll(async () => {
  ctx = await createTestContext({ geo: fakeGeo });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.sql`truncate table users cascade`;
  await ctx.sql`truncate table page_views, clicks`;
  geoSawIps = [];

  const user = await createLoginableUser(ctx.db, 'user-pass', {
    role: 'user',
    account: 'mimnz',
    shortName: 'mimnz',
    displayName: 'mimnz',
  });
  userId = user.id;
  profileId = user.profileId!;
  token = (await login(ctx, 'mimnz', 'user-pass')).token;
});

const visit = (url = '/mimnz', headers: Record<string, string> = {}) =>
  ctx.app.inject({
    method: 'GET',
    url,
    headers: { 'user-agent': IPHONE, 'x-forwarded-for': '203.0.113.42', ...headers },
  });

/**
 * 一次建好两个按钮并把 id 取回来。
 * 按钮是整份列表提交的，分两次调用会把第一次的 id 冲掉。
 */
async function addButtons() {
  await ctx.app.inject({
    method: 'PUT',
    url: `/_api/profiles/${profileId}/entries`,
    ...withSession(token),
    payload: {
      entries: [
        { kind: 'link', title: '联系我', url: 'https://wa.me/15550109999', isLead: true },
        { kind: 'link', title: '看内容', url: 'https://example.com/blog', isLead: false },
      ],
    },
  });
  const saved = await ctx.app.inject({
    method: 'GET',
    url: `/_api/profiles/${profileId}`,
    ...withSession(token),
  });
  const list = saved.json().entries as { id: string; isLead: boolean }[];
  return { lead: list.find((b) => b.isLead)!, plain: list.find((b) => !b.isLead)! };
}

const click = (payload: Record<string, unknown>, headers: Record<string, string> = {}) =>
  ctx.app.inject({
    method: 'POST',
    url: '/_api/track/click',
    headers: { 'user-agent': IPHONE, 'x-forwarded-for': '203.0.113.42', ...headers },
    payload,
  });

test('公开页每渲染一次写一条页面浏览', async () => {
  await visit();
  await visit();
  await visit();

  const rows = await ctx.db.select().from(pageViews);
  expect(rows).toHaveLength(3);
  expect(rows.every((r) => r.profileId === profileId)).toBe(true);
});

test('不做任何访客去重，同一个人刷十次就是十条', async () => {
  for (let i = 0; i < 10; i += 1) await visit();

  const rows = await ctx.db.select().from(pageViews);
  expect(rows).toHaveLength(10);
});

test('爬虫直接不写记录，页面照常返回', async () => {
  const res = await visit('/mimnz', { 'user-agent': FACEBOOK_BOT });

  expect(res.statusCode).toBe(200);
  expect(res.body).toContain('mimnz');
  expect(await ctx.db.select().from(pageViews)).toHaveLength(0);
});

test('爬虫点击也不写记录', async () => {
  const { lead } = await addButtons();

  await click({ kind: 'button', id: lead.id }, { 'user-agent': FACEBOOK_BOT });

  expect(await ctx.db.select().from(clicks)).toHaveLength(0);
});

test('IP 先用于查地域，随后立刻截断再落库；顺序不可颠倒', async () => {
  await visit();

  // 地域查询拿到的是完整 IP
  expect(geoSawIps).toContain('203.0.113.42');

  const [row] = await ctx.db.select().from(pageViews);
  // 落库的是截断过的
  expect(row?.ipTruncated).toBe('203.0.113.0');
  // 而且地域没有因为截断而丢失
  expect(row?.country).toBe('US');
  expect(row?.city).toBe('Austin');
});

test('完整 IP 不出现在任何一张埋点表里', async () => {
  await visit();
  const { lead } = await addButtons();
  await click({ kind: 'button', id: lead.id });

  const stored = [
    ...(await ctx.db.select().from(pageViews)).map((r) => r.ipTruncated),
    ...(await ctx.db.select().from(clicks)).map((r) => r.ipTruncated),
  ];
  expect(stored).not.toContain('203.0.113.42');
  expect(stored.every((ip) => ip === '203.0.113.0')).toBe(true);
});

test('IPv6 去掉后 80 位', async () => {
  await visit('/mimnz', { 'x-forwarded-for': '2001:db8:85a3:1234:5678:8a2e:370:7334' });

  const [row] = await ctx.db.select().from(pageViews);
  expect(row?.ipTruncated).toBe('2001:db8:85a3::');
});

test('解析 User-Agent 得到设备类型与操作系统并落库', async () => {
  await visit();
  await visit('/mimnz', {
    'user-agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });

  const rows = await ctx.db.select().from(pageViews);
  expect(rows.map((r) => `${r.deviceType}/${r.os}`).sort()).toEqual([
    'desktop/macOS',
    'mobile/iOS',
  ]);
});

test('每次点击写一条点击记录，并标明是否计入线索', async () => {
  const { lead, plain } = await addButtons();

  await click({ kind: 'button', id: lead.id });
  await click({ kind: 'button', id: plain.id });
  await click({ kind: 'button', id: lead.id });

  const rows = await ctx.db.select().from(clicks);
  expect(rows).toHaveLength(3);
  expect(rows.filter((r) => r.isLead)).toHaveLength(2);
  expect(rows.every((r) => r.targetKind === 'button')).toBe(true);
});

test('点击记录关联到具体条目，链接与社媒各记各的', async () => {
  // 合表之后是整份列表一次提交，两种 kind 得一起送 —— 只送一半会把另一半删掉
  await ctx.app.inject({
    method: 'PUT',
    url: `/_api/profiles/${profileId}/entries`,
    ...withSession(token),
    payload: {
      entries: [
        { kind: 'link', title: '联系我', url: 'https://wa.me/15550109999', isLead: true },
        { kind: 'social', title: 'WhatsApp', platform: 'whatsapp', value: '15550109999' },
      ],
    },
  });
  const profile = await ctx.app.inject({
    method: 'GET',
    url: `/_api/profiles/${profileId}`,
    ...withSession(token),
  });
  const entries = profile.json().entries as { id: string; kind: string }[];
  const button = entries.find((e) => e.kind === 'link')!;
  const icon = entries.find((e) => e.kind === 'social')!;

  // 客户端传什么 kind 都不算数，服务端按库里的 buttons.kind 落库
  await click({ id: button.id });
  await click({ id: icon.id });

  const rows = await ctx.db.select().from(clicks);
  expect(rows.map((r) => `${r.targetKind}:${r.targetId}`).sort()).toEqual(
    [`button:${button.id}`, `social:${icon.id}`].sort(),
  );
});

test('is_lead 以库里为准，不信客户端传来的', async () => {
  const { plain } = await addButtons();

  // 客户端硬说这是条线索
  await click({ kind: 'button', id: plain.id, isLead: true });

  const [row] = await ctx.db.select().from(clicks);
  expect(row?.isLead).toBe(false);
});

test('落库时把当时的 is_lead 定死，事后改标记不影响历史数据', async () => {
  const { lead } = await addButtons();
  await click({ kind: 'button', id: lead.id });

  // 用户把这个按钮改成非联系类
  await ctx.app.inject({
    method: 'PUT',
    url: `/_api/profiles/${profileId}/entries`,
    ...withSession(token),
    payload: {
      entries: [{ kind: 'link', title: '联系我', url: 'https://wa.me/15550109999', isLead: false }],
    },
  });

  const [row] = await ctx.db.select().from(clicks);
  expect(row?.isLead).toBe(true);
});

test('不存在的目标不写记录，也不泄露它存不存在', async () => {
  const res = await click({ kind: 'button', id: '00000000-0000-4000-8000-000000000000' });

  expect(res.statusCode).toBe(204);
  expect(await ctx.db.select().from(clicks)).toHaveLength(0);
});

test('公开页带上埋点用的标记，供那一小段客户端脚本读取', async () => {
  await addButtons();
  const html = (await visit()).body;

  expect(html).toMatch(/data-track="button"/);
  expect(html).toMatch(/data-track-id="[0-9a-f-]{36}"/);
  expect(html).toContain("navigator.sendBeacon('/_api/track/click'");
});

test('没有 GeoLite2 库时地域为空，其余埋点照常写入', async () => {
  const noGeoCtx = await createTestContext();
  try {
    const user = await createLoginableUser(noGeoCtx.db, 'p', {
      role: 'user',
      account: 'nogeo',
      shortName: 'nogeo',
    });
    await noGeoCtx.app.inject({
      method: 'GET',
      url: '/nogeo',
      headers: { 'user-agent': IPHONE, 'x-forwarded-for': '203.0.113.42' },
    });

    const [row] = await noGeoCtx.db.select().from(pageViews);
    expect(row?.profileId).toBe(user.profileId);
    expect(row?.country).toBeNull();
    expect(row?.city).toBeNull();
    // 少一个维度，但 IP 照样截断、UA 照样解析
    expect(row?.ipTruncated).toBe('203.0.113.0');
    expect(row?.deviceType).toBe('mobile');
  } finally {
    await noGeoCtx.close();
  }
});

test('落库的 target_kind 以库里为准，客户端说了不算', async () => {
  await ctx.app.inject({
    method: 'PUT',
    url: `/_api/profiles/${profileId}/entries`,
    ...withSession(token),
    payload: {
      entries: [{ kind: 'social', title: 'WhatsApp', platform: 'whatsapp', value: '15550109999' }],
    },
  });
  const profile = await ctx.app.inject({
    method: 'GET',
    url: `/_api/profiles/${profileId}`,
    ...withSession(token),
  });
  const social = (profile.json().entries as { id: string; kind: string }[])[0]!;

  // 谎称这是个普通按钮
  await click({ kind: 'button', id: social.id });

  const [row] = await ctx.db.select().from(clicks);
  expect(row?.targetKind).toBe('social');
});

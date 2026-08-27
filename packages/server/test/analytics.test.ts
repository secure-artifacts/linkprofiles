import { clicks, dailySummaries, pageViews } from '@link-profile/shared/schema';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { createTestContext, type TestContext } from './helpers/context.js';
import { createLoginableUser } from './helpers/factories.js';
import { login, withSession } from './helpers/http.js';

let ctx: TestContext;
let userId: string;
let otherUserId: string;
let userToken: string;
let adminToken: string;
let strangerToken: string;
let superToken: string;

const NY = 'America/New_York';

beforeAll(async () => {
  ctx = await createTestContext();
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.sql`truncate table users cascade`;
  await ctx.sql`truncate table page_views, clicks, daily_summaries`;

  await createLoginableUser(ctx.db, 'super-pass', {
    role: 'superadmin',
    account: 'super',
    shortName: null,
  });
  const admin = await createLoginableUser(ctx.db, 'admin-pass', {
    role: 'admin',
    account: 'admin',
    shortName: null,
  });
  const stranger = await createLoginableUser(ctx.db, 'stranger-pass', {
    role: 'admin',
    account: 'stranger',
    shortName: null,
  });
  const user = await createLoginableUser(ctx.db, 'user-pass', {
    role: 'user',
    account: 'mimnz',
    shortName: 'mimnz',
    owningAdminId: admin.id,
  });
  const other = await createLoginableUser(ctx.db, 'other-pass', {
    role: 'user',
    account: 'other',
    shortName: 'other',
    owningAdminId: stranger.id,
  });
  userId = user.id;
  otherUserId = other.id;

  superToken = (await login(ctx, 'super', 'super-pass')).token;
  adminToken = (await login(ctx, 'admin', 'admin-pass')).token;
  strangerToken = (await login(ctx, 'stranger', 'stranger-pass')).token;
  userToken = (await login(ctx, 'mimnz', 'user-pass')).token;
});

async function seedView(when: string, forUser = userId, overrides: Record<string, unknown> = {}) {
  await ctx.db.insert(pageViews).values({
    userId: forUser,
    occurredAt: new Date(when),
    country: 'US',
    city: 'Austin',
    deviceType: 'mobile',
    os: 'iOS',
    source: 'tiktok',
    ...overrides,
  });
}

async function seedClick(
  when: string,
  isLead: boolean,
  forUser = userId,
  overrides: Record<string, unknown> = {},
) {
  await ctx.db.insert(clicks).values({
    userId: forUser,
    occurredAt: new Date(when),
    targetKind: 'button',
    targetId: '00000000-0000-4000-8000-000000000001',
    isLead,
    country: 'US',
    city: 'Austin',
    deviceType: 'mobile',
    os: 'iOS',
    source: 'tiktok',
    ...overrides,
  });
}

function analytics(token: string, query = '') {
  return ctx.app.inject({
    method: 'GET',
    url: `/_api/analytics${query}`,
    ...withSession(token),
  });
}

/** 固定一个跨越纽约午夜的区间，方便断言切天。 */
const RANGE = '&from=2026-08-01T00:00:00.000Z&to=2026-08-10T00:00:00.000Z';

test('呈现线索数、点击数、页面浏览数与点击率', async () => {
  await seedView('2026-08-05T12:00:00Z');
  await seedView('2026-08-05T13:00:00Z');
  await seedView('2026-08-05T14:00:00Z');
  await seedView('2026-08-05T15:00:00Z');
  await seedClick('2026-08-05T12:30:00Z', true);
  await seedClick('2026-08-05T13:30:00Z', false);

  const res = await analytics(userToken, `?tz=${NY}${RANGE}`);

  expect(res.statusCode).toBe(200);
  expect(res.json().totals).toEqual({
    pageViews: 4,
    clicks: 2,
    leads: 1,
    ctr: 0.5,
  });
});

test('线索是对联系类渠道的点击，由每条的 is_lead 决定', async () => {
  await seedView('2026-08-05T12:00:00Z');
  await seedClick('2026-08-05T12:10:00Z', true);
  await seedClick('2026-08-05T12:20:00Z', true);
  await seedClick('2026-08-05T12:30:00Z', false);

  const totals = (await analytics(userToken, `?tz=${NY}${RANGE}`)).json().totals;

  expect(totals.leads).toBe(2);
  expect(totals.clicks).toBe(3);
});

test('点击率的分母永远是页面浏览，没有浏览时为零而不是除零', async () => {
  await seedClick('2026-08-05T12:00:00Z', true);

  const totals = (await analytics(userToken, `?tz=${NY}${RANGE}`)).json().totals;

  expect(totals.pageViews).toBe(0);
  expect(totals.ctr).toBe(0);
  expect(Number.isFinite(totals.ctr)).toBe(true);
});

test('单按钮点击率也以页面浏览为分母', async () => {
  const created = await ctx.app.inject({
    method: 'PUT',
    url: `/_api/users/${userId}/buttons`,
    ...withSession(userToken),
    payload: { buttons: [{ title: '联系我', url: 'https://wa.me/1', isLead: true }] },
  });
  const button = created.json().buttons[0] as { id: string };

  for (let i = 0; i < 10; i += 1) await seedView(`2026-08-05T1${i % 10}:00:00Z`);
  await seedClick('2026-08-05T12:10:00Z', true, userId, { targetId: button.id });
  await seedClick('2026-08-05T12:20:00Z', true, userId, { targetId: button.id });

  const body = (await analytics(userToken, `?tz=${NY}${RANGE}`)).json();

  expect(body.buttons).toHaveLength(1);
  expect(body.buttons[0]).toMatchObject({ title: '联系我', clicks: 2 });
  expect(body.buttons[0].ctr).toBeCloseTo(0.2);
});

test('维度可拆分：国家与城市、设备类型与操作系统、来源', async () => {
  await seedView('2026-08-05T12:00:00Z', userId, { country: 'US', city: 'Austin' });
  await seedView('2026-08-05T12:00:00Z', userId, { country: 'CA', city: 'Toronto' });
  await seedView('2026-08-05T12:00:00Z', userId, { deviceType: 'desktop', os: 'Windows' });
  await seedView('2026-08-05T12:00:00Z', userId, { source: 'instagram' });

  const dims = (await analytics(userToken, `?tz=${NY}${RANGE}`)).json().dimensions;

  expect(dims.countries.map((d: { key: string }) => d.key).sort()).toEqual(['CA', 'US']);
  expect(dims.cities.map((d: { key: string }) => d.key).sort()).toEqual(['Austin', 'Toronto']);
  expect(dims.devices.map((d: { key: string }) => d.key).sort()).toEqual(['desktop', 'mobile']);
  expect(dims.operatingSystems.map((d: { key: string }) => d.key).sort()).toEqual([
    'Windows',
    'iOS',
  ]);
  expect(dims.sources.map((d: { key: string }) => d.key).sort()).toEqual(['instagram', 'tiktok']);
});

test('未知维度归到同一桶，空串表示未知', async () => {
  await seedView('2026-08-05T12:00:00Z', userId, { country: null, source: null });
  await seedView('2026-08-05T13:00:00Z', userId, { country: null, source: null });

  const dims = (await analytics(userToken, `?tz=${NY}${RANGE}`)).json().dimensions;

  const unknown = dims.sources.find((d: { key: string }) => d.key === '');
  expect(unknown?.pageViews).toBe(2);
});

test('区间不超过两天按小时聚合，否则按天', async () => {
  await seedView('2026-08-05T12:00:00Z');

  const hourly = await analytics(
    userToken,
    `?tz=${NY}&from=2026-08-05T00:00:00.000Z&to=2026-08-06T00:00:00.000Z`,
  );
  expect(hourly.json().range.granularity).toBe('hour');
  expect(hourly.json().trend[0]?.bucket).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:00$/);

  const daily = await analytics(userToken, `?tz=${NY}${RANGE}`);
  expect(daily.json().range.granularity).toBe('day');
  expect(daily.json().trend[0]?.bucket).toMatch(/^\d{4}-\d{2}-\d{2}$/);
});

test('切天按所选展示时区算，不是服务器时区；跨日边界归属正确', async () => {
  // 世界时 8 月 6 日 02:00 = 纽约 8 月 5 日 22:00，也就是纽约的「前一天」
  await seedView('2026-08-06T02:00:00Z');

  const inNewYork = (await analytics(userToken, `?tz=${NY}${RANGE}`)).json().trend;
  expect(inNewYork).toHaveLength(1);
  expect(inNewYork[0].bucket).toBe('2026-08-05');

  // 同一条数据在 UTC 下属于 8 月 6 日
  const inUtc = (await analytics(userToken, `?tz=UTC${RANGE}`)).json().trend;
  expect(inUtc[0].bucket).toBe('2026-08-06');

  // 东京比世界时快九小时，这条落在 8 月 6 日
  const inTokyo = (await analytics(userToken, `?tz=Asia/Tokyo${RANGE}`)).json().trend;
  expect(inTokyo[0].bucket).toBe('2026-08-06');
});

test('24 小时分布图把区间内的线索汇总到零至二十三点，按展示时区分桶', async () => {
  // 世界时 16:00 = 纽约 12:00（夏令时 -4）
  await seedClick('2026-08-05T16:00:00Z', true);
  await seedClick('2026-08-06T16:00:00Z', true);
  // 非线索的点击不进这张图
  await seedClick('2026-08-05T16:00:00Z', false);

  const hourly = (await analytics(userToken, `?tz=${NY}${RANGE}`)).json().hourlyLeads;

  expect(hourly).toHaveLength(24);
  expect(hourly[12]).toBe(2);
  expect(hourly.reduce((a: number, b: number) => a + b, 0)).toBe(2);

  // 换成 UTC 看，同样两条落在 16 点
  const inUtc = (await analytics(userToken, `?tz=UTC${RANGE}`)).json().hourlyLeads;
  expect(inUtc[16]).toBe(2);
});

test('底层存 UTC，切换展示时区不改数据只改归属', async () => {
  await seedView('2026-08-06T02:00:00Z');

  const ny = (await analytics(userToken, `?tz=${NY}${RANGE}`)).json();
  const utc = (await analytics(userToken, `?tz=UTC${RANGE}`)).json();

  expect(ny.totals).toEqual(utc.totals);
  expect(ny.trend[0].bucket).not.toBe(utc.trend[0].bucket);
});

test('默认展示时区是受众所在的 America/New_York', async () => {
  const res = await analytics(userToken, `?${RANGE.slice(1)}`);

  expect(res.json().range.timeZone).toBe('America/New_York');
});

test('不认识的时区被拒，不会被拿去拼 SQL', async () => {
  const res = await analytics(userToken, `?tz=Mars/Olympus${RANGE}`);

  expect(res.statusCode).toBe(400);
  expect(res.json()).toMatchObject({ error: 'invalid_timezone' });
});

test('跨越清理边界的历史不断档：日汇总与明细一起算进总数', async () => {
  await seedView('2026-08-05T12:00:00Z');
  await ctx.db.insert(dailySummaries).values({
    userId,
    day: '2026-08-02',
    country: 'US',
    city: 'Austin',
    deviceType: 'mobile',
    os: 'iOS',
    source: 'tiktok',
    pageViews: 10,
    clicks: 4,
    leads: 3,
  });

  const body = (await analytics(userToken, `?tz=${NY}${RANGE}`)).json();

  expect(body.totals.pageViews).toBe(11);
  expect(body.totals.clicks).toBe(4);
  expect(body.totals.leads).toBe(3);
  // 趋势图上两天都在
  expect(body.trend.map((p: { bucket: string }) => p.bucket).sort()).toEqual([
    '2026-08-02',
    '2026-08-05',
  ]);
  // 维度拆分也把汇总算进去了
  const us = body.dimensions.countries.find((d: { key: string }) => d.key === 'US');
  expect(us.pageViews).toBe(11);
});

test('用户只看得到自己的数据', async () => {
  await seedView('2026-08-05T12:00:00Z', userId);
  await seedView('2026-08-05T12:00:00Z', otherUserId);
  await seedView('2026-08-05T13:00:00Z', otherUserId);

  const body = (await analytics(userToken, `?tz=${NY}${RANGE}`)).json();
  expect(body.totals.pageViews).toBe(1);
});

test('管理员只看得到名下用户的数据', async () => {
  await seedView('2026-08-05T12:00:00Z', userId);
  await seedView('2026-08-05T12:00:00Z', otherUserId);

  const mine = (await analytics(adminToken, `?tz=${NY}${RANGE}`)).json();
  expect(mine.totals.pageViews).toBe(1);

  const theirs = (await analytics(strangerToken, `?tz=${NY}${RANGE}`)).json();
  expect(theirs.totals.pageViews).toBe(1);
});

test('超级管理员看得到全部', async () => {
  await seedView('2026-08-05T12:00:00Z', userId);
  await seedView('2026-08-05T12:00:00Z', otherUserId);

  const body = (await analytics(superToken, `?tz=${NY}${RANGE}`)).json();
  expect(body.totals.pageViews).toBe(2);
});

test('指名看一个自己看不见的用户，与看不见给同一个响应', async () => {
  await seedView('2026-08-05T12:00:00Z', otherUserId);

  const res = await analytics(adminToken, `?userId=${otherUserId}&tz=${NY}${RANGE}`);
  const missing = await analytics(
    adminToken,
    `?userId=00000000-0000-4000-8000-000000000000&tz=${NY}${RANGE}`,
  );

  expect(res.statusCode).toBe(403);
  expect(missing.statusCode).toBe(403);
  expect(res.body).toBe(missing.body);
});

test('管理员可以单看名下某一个用户', async () => {
  await seedView('2026-08-05T12:00:00Z', userId);

  const res = await analytics(adminToken, `?userId=${userId}&tz=${NY}${RANGE}`);

  expect(res.statusCode).toBe(200);
  expect(res.json().totals.pageViews).toBe(1);
});

test('未登录读不到任何数据', async () => {
  const res = await ctx.app.inject({ method: 'GET', url: '/_api/analytics' });

  expect(res.statusCode).toBe(401);
});

test('预设区间可用，且以展示时区的今天为基准', async () => {
  const res = await analytics(userToken, `?preset=7d&tz=${NY}`);

  expect(res.statusCode).toBe(200);
  expect(res.json().range.granularity).toBe('day');
  // 起点应当是纽约时间某一天的零点
  const from = new Date(res.json().range.from);
  const hourInNy = Number(
    new Intl.DateTimeFormat('en-US', { timeZone: NY, hour: '2-digit', hour12: false }).format(from),
  );
  expect(hourInNy % 24).toBe(0);
});

test('自定义区间的起止颠倒被拒', async () => {
  const res = await analytics(
    userToken,
    `?tz=${NY}&from=2026-08-10T00:00:00.000Z&to=2026-08-01T00:00:00.000Z`,
  );

  expect(res.statusCode).toBe(400);
  expect(res.json()).toMatchObject({ error: 'invalid_range' });
});

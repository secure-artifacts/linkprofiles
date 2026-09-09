import { clicks, pageViews } from '@link-profile/shared/schema';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { createTestContext, type TestContext } from './helpers/context.js';
import { createLoginableUser, createRegion, defaultRegionOf } from './helpers/factories.js';
import { login, withSession } from './helpers/http.js';

let ctx: TestContext;
let superToken: string;
let aliceToken: string;
let aliceId: string;
let bobId: string;
let regionA: string;
let regionB: string;
let bobRegion: string;
const profileIds: Record<string, string> = {};

beforeAll(async () => {
  ctx = await createTestContext();
});

afterAll(async () => {
  await ctx.close();
});

/** 给某个个人页灌 n 次打开与 m 次点击（其中 leads 次算线索）。 */
async function seed(profileId: string, opens: number, hits: number, leads: number) {
  const now = new Date();
  for (let i = 0; i < opens; i += 1) {
    await ctx.db.insert(pageViews).values({ profileId, occurredAt: now });
  }
  for (let i = 0; i < hits; i += 1) {
    await ctx.db.insert(clicks).values({
      profileId,
      isLead: i < leads,
      occurredAt: now,
      targetKind: 'button',
      targetId: '00000000-0000-4000-8000-000000000001',
    });
  }
}

beforeEach(async () => {
  await ctx.sql`truncate table users cascade`;

  await createLoginableUser(ctx.db, 'super-pass', { role: 'superadmin', account: 'super' });
  const alice = await createLoginableUser(ctx.db, 'alice-pass', {
    role: 'admin',
    account: 'alice',
  });
  const bob = await createLoginableUser(ctx.db, 'bob-pass', { role: 'admin', account: 'bob' });
  aliceId = alice.id;
  bobId = bob.id;

  regionA = await defaultRegionOf(ctx.db, aliceId);
  regionB = (await createRegion(ctx.db, { ownerAdminId: aliceId, name: '第二批' })).id;
  bobRegion = await defaultRegionOf(ctx.db, bobId);

  const inA = await createLoginableUser(ctx.db, 'p', { account: 'in-a', regionId: regionA });
  const inB = await createLoginableUser(ctx.db, 'p', { account: 'in-b', regionId: regionB });
  const inBob = await createLoginableUser(ctx.db, 'p', { account: 'in-bob', regionId: bobRegion });
  profileIds['a'] = inA.profileId!;
  profileIds['b'] = inB.profileId!;
  profileIds['bob'] = inBob.profileId!;

  await seed(profileIds['a']!, 10, 4, 2);
  await seed(profileIds['b']!, 20, 6, 3);
  await seed(profileIds['bob']!, 100, 50, 25);

  superToken = (await login(ctx, 'super', 'super-pass')).token;
  aliceToken = (await login(ctx, 'alice', 'alice-pass')).token;
});

async function analytics(token: string, query = '') {
  const res = await ctx.app.inject({
    method: 'GET',
    url: `/_api/analytics?preset=30d${query}`,
    ...withSession(token),
  });
  return res;
}

test('不带区域参数时等于全部可见区域之和', async () => {
  const res = await analytics(aliceToken);
  expect(res.statusCode).toBe(200);
  const body = res.json();

  expect(body.totals).toMatchObject({ pageViews: 30, clicks: 10, leads: 5 });
  const regionSum = body.performance.regions.reduce(
    (acc: { pageViews: number; clicks: number; leads: number }, r: typeof acc) => ({
      pageViews: acc.pageViews + r.pageViews,
      clicks: acc.clicks + r.clicks,
      leads: acc.leads + r.leads,
    }),
    { pageViews: 0, clicks: 0, leads: 0 },
  );
  expect(regionSum).toEqual({ pageViews: 30, clicks: 10, leads: 5 });
});

test('区域指标等于该区域内全部账号之和，账号仍等于名下个人页之和', async () => {
  const body = (await analytics(aliceToken)).json();

  for (const region of body.performance.regions) {
    const accounts = body.performance.accounts.filter(
      (a: { regionId: string | null }) => a.regionId === region.id,
    );
    const sum = accounts.reduce((acc: number, a: { leads: number }) => acc + a.leads, 0);
    expect(sum, region.name).toBe(region.leads);
  }

  for (const account of body.performance.accounts) {
    const pages = body.performance.profiles.filter(
      (p: { userId: string }) => p.userId === account.id,
    );
    const sum = pages.reduce((acc: number, p: { leads: number }) => acc + p.leads, 0);
    expect(sum, account.account).toBe(account.leads);
  }
});

test('选中一个区域后只看那一个区域', async () => {
  const res = await analytics(aliceToken, `&regionId=${regionB}`);
  expect(res.statusCode).toBe(200);
  const body = res.json();

  expect(body.scope).toMatchObject({ kind: 'region', regionId: regionB, regionName: '第二批' });
  expect(body.totals).toMatchObject({ pageViews: 20, clicks: 6, leads: 3 });
  expect(body.performance.profiles.map((p: { id: string }) => p.id)).toEqual([profileIds['b']]);
});

test('管理员看不见别人的区域，指名要看与不存在同一个响应', async () => {
  const res = await analytics(aliceToken, `&regionId=${bobRegion}`);
  expect(res.statusCode).toBe(403);

  const nonexistent = await analytics(aliceToken, '&regionId=00000000-0000-4000-8000-0000000000ff');
  expect(nonexistent.statusCode).toBe(403);
});

test('超级管理员的总览覆盖全部区域', async () => {
  const body = (await analytics(superToken)).json();
  expect(body.totals).toMatchObject({ pageViews: 130, clicks: 60, leads: 30 });
  expect(body.performance.regions).toHaveLength(3);
});

test('区域筛选器只列得出自己看得见的区域', async () => {
  const forAlice = (await analytics(aliceToken)).json();
  expect(forAlice.regions.map((r: { id: string }) => r.id).sort()).toEqual(
    [regionA, regionB].sort(),
  );

  const forSuper = (await analytics(superToken)).json();
  expect(forSuper.regions.map((r: { id: string }) => r.id)).toContain(bobRegion);
});

test('区域与账号叠加时以更内层的账号为准', async () => {
  const inA = (await analytics(aliceToken, `&regionId=${regionA}`)).json();
  const userId = inA.performance.accounts[0].id;

  const res = await analytics(aliceToken, `&regionId=${regionA}&userId=${userId}`);
  expect(res.statusCode).toBe(200);
  expect(res.json().scope).toMatchObject({ kind: 'account', userId });
  expect(res.json().totals).toMatchObject({ pageViews: 10, clicks: 4, leads: 2 });
});

test('区域与账号对不上时当作看不见', async () => {
  const inB = (await analytics(aliceToken, `&regionId=${regionB}`)).json();
  const userInB = inB.performance.accounts[0].id;

  const res = await analytics(aliceToken, `&regionId=${regionA}&userId=${userInB}`);
  expect(res.statusCode).toBe(403);
});

test('移区之后历史数据立刻算进新区域', async () => {
  const before = (await analytics(aliceToken, `&regionId=${regionA}`)).json();
  expect(before.totals.leads).toBe(2);

  const inA = before.performance.accounts[0].id;
  const moved = await ctx.app.inject({
    method: 'PUT',
    url: '/_api/users/region',
    ...withSession(aliceToken),
    payload: { userIds: [inA], regionId: regionB },
  });
  expect(moved.statusCode).toBe(200);

  const afterA = (await analytics(aliceToken, `&regionId=${regionA}`)).json();
  expect(afterA.totals.leads).toBe(0);

  const afterB = (await analytics(aliceToken, `&regionId=${regionB}`)).json();
  expect(afterB.totals.leads).toBe(5);

  // 总计不变，只是换了一个区域装
  expect((await analytics(aliceToken)).json().totals.leads).toBe(5);
});

test('用户角色拿不到区域筛选器', async () => {
  const member = await createLoginableUser(ctx.db, 'member-pass', {
    account: 'member-1',
    regionId: regionA,
  });
  expect(member.id).toBeDefined();
  const token = (await login(ctx, 'member-1', 'member-pass')).token;

  const body = (await analytics(token)).json();
  expect(body.regions).toEqual([]);
});

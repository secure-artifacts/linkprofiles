import { validateInviteCode } from '@link-profile/shared';
import { inviteCodes } from '@link-profile/shared/schema';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { createTestContext, type TestContext } from './helpers/context.js';
import { createLoginableUser } from './helpers/factories.js';
import { login, withSession } from './helpers/http.js';

let ctx: TestContext;
let superToken: string;
let aliceToken: string;
let bobToken: string;

beforeAll(async () => {
  ctx = await createTestContext();
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.sql`truncate table users cascade`;

  await createLoginableUser(ctx.db, 'super-pass', { role: 'superadmin', account: 'super' });
  await createLoginableUser(ctx.db, 'alice-pass', { role: 'admin', account: 'alice' });
  await createLoginableUser(ctx.db, 'bob-pass', { role: 'admin', account: 'bob' });

  superToken = (await login(ctx, 'super', 'super-pass')).token;
  aliceToken = (await login(ctx, 'alice', 'alice-pass')).token;
  bobToken = (await login(ctx, 'bob', 'bob-pass')).token;
});

async function newRegion(token: string, name: string) {
  const res = await ctx.app.inject({
    method: 'POST',
    url: '/_api/regions',
    ...withSession(token),
    payload: { name },
  });
  expect(res.statusCode).toBe(201);
  return res.json() as { id: string; inviteCode: string | null };
}

function reset(token: string, regionId: string, body: Record<string, unknown> = {}) {
  return ctx.app.inject({
    method: 'POST',
    url: `/_api/regions/${regionId}/invite-code`,
    ...withSession(token),
    payload: body,
  });
}

test('新建区域时随之发一个合法的邀请码', async () => {
  const region = await newRegion(aliceToken, '华东一批');
  expect(region.inviteCode).not.toBeNull();
  expect(validateInviteCode(region.inviteCode!)).toMatchObject({ ok: true });
});

test('区域列表带上当前有效的那一个码', async () => {
  const region = await newRegion(aliceToken, '华东一批');

  const res = await ctx.app.inject({
    method: 'GET',
    url: '/_api/regions',
    ...withSession(aliceToken),
  });
  const row = res.json().regions.find((r: { id: string }) => r.id === region.id);
  expect(row.inviteCode).toBe(region.inviteCode);
});

test('重置之后旧码失效、新码可用，区域上仍只有一个有效码', async () => {
  const region = await newRegion(aliceToken, '华东一批');
  const old = region.inviteCode!;

  const res = await reset(aliceToken, region.id);
  expect(res.statusCode).toBe(200);
  const fresh = res.json().inviteCode as string;
  expect(fresh).not.toBe(old);

  const rows = await ctx.db
    .select({ code: inviteCodes.code, isActive: inviteCodes.isActive })
    .from(inviteCodes)
    .where(eq(inviteCodes.regionId, region.id));
  expect(rows).toHaveLength(2);
  expect(rows.filter((r) => r.isActive).map((r) => r.code)).toEqual([fresh]);
  expect(rows.find((r) => r.code === old)!.isActive).toBe(false);
});

test('重置不动已经用旧码进来的人的归属', async () => {
  const region = await newRegion(aliceToken, '华东一批');
  const member = await createLoginableUser(ctx.db, 'p', {
    account: 'member-1',
    regionId: region.id,
  });

  await reset(aliceToken, region.id);

  const res = await ctx.app.inject({
    method: 'GET',
    url: `/_api/users/${member.id}`,
    ...withSession(aliceToken),
  });
  expect(res.json().regionId).toBe(region.id);
});

test('可以指定一个好记的自定义码', async () => {
  const region = await newRegion(aliceToken, '华东一批');

  // 字母表剔除了 O、0、I、1，所以好记的码也得绕开它们
  const res = await reset(aliceToken, region.id, { code: 'manyla24' });
  expect(res.statusCode).toBe(200);
  // 归一化成大写入库
  expect(res.json().inviteCode).toBe('MANYLA24');
});

test('自定义码撞上别人的码被拒，且原来的码没被作废', async () => {
  const mine = await newRegion(aliceToken, '我的');
  const theirs = await newRegion(bobToken, '别人的');

  const res = await reset(aliceToken, mine.id, { code: theirs.inviteCode! });
  expect(res.statusCode).toBe(409);
  expect(res.json()).toMatchObject({ error: 'invite_code_taken' });

  const list = await ctx.app.inject({
    method: 'GET',
    url: '/_api/regions',
    ...withSession(aliceToken),
  });
  const row = list.json().regions.find((r: { id: string }) => r.id === mine.id);
  expect(row.inviteCode).toBe(mine.inviteCode);
});

test('自定义码不合格式被拒', async () => {
  const region = await newRegion(aliceToken, '华东一批');

  for (const bad of ['short', 'has-dash-x', 'CONTAINS0', 'WAYTOOLONGCODE']) {
    const res = await reset(aliceToken, region.id, { code: bad });
    expect(res.statusCode, bad).toBe(400);
  }
});

test('并发重置同一个区域的码，不会两条都成功也不会炸成 500', async () => {
  const region = await newRegion(aliceToken, '华东一批');

  const results = await Promise.all([
    reset(aliceToken, region.id),
    reset(aliceToken, region.id),
    reset(aliceToken, region.id),
  ]);
  for (const res of results) {
    expect(res.statusCode, JSON.stringify(res.json())).toBe(200);
  }

  // 「每区域至多一个有效码」这条不变式必须还在
  const active = await ctx.db
    .select({ code: inviteCodes.code })
    .from(inviteCodes)
    .where(and(eq(inviteCodes.regionId, region.id), eq(inviteCodes.isActive, true)));
  expect(active).toHaveLength(1);
});

test('超级管理员建的无归属区域不带邀请码', async () => {
  const res = await ctx.app.inject({
    method: 'POST',
    url: '/_api/regions',
    ...withSession(superToken),
    payload: { name: '先放着没人管', ownerAdminId: null },
  });
  expect(res.statusCode).toBe(201);
  expect(res.json()).toMatchObject({ ownerAdminId: null, inviteCode: null });
});

test('管理员重置不了别人名下区域的码', async () => {
  const theirs = await newRegion(bobToken, '别人的');

  const res = await reset(aliceToken, theirs.id);
  expect(res.statusCode).toBe(403);
});

test('超级管理员重置得了任意区域的码', async () => {
  const theirs = await newRegion(bobToken, '别人的');

  const res = await reset(superToken, theirs.id);
  expect(res.statusCode).toBe(200);
});

test('删除区域时它的码一并消失', async () => {
  const region = await newRegion(aliceToken, '建错了');

  const removed = await ctx.app.inject({
    method: 'DELETE',
    url: `/_api/regions/${region.id}`,
    ...withSession(aliceToken),
  });
  expect(removed.statusCode).toBe(204);

  const left = await ctx.db
    .select({ id: inviteCodes.id })
    .from(inviteCodes)
    .where(eq(inviteCodes.regionId, region.id));
  expect(left).toEqual([]);
});

test('通过接口新建的管理员，其默认区域一建出来就带码', async () => {
  const created = await ctx.app.inject({
    method: 'POST',
    url: '/_api/admins',
    ...withSession(superToken),
    payload: { account: 'carol', password: 'carol-pass-1234', label: '运营三组' },
  });
  expect(created.statusCode).toBe(201);
  const carolId = created.json().id as string;

  const res = await ctx.app.inject({
    method: 'GET',
    url: '/_api/regions',
    ...withSession(superToken),
  });
  const defaultRegion = res
    .json()
    .regions.find(
      (r: { ownerAdminId: string; isDefault: boolean }) =>
        r.ownerAdminId === carolId && r.isDefault,
    );
  expect(defaultRegion).toBeDefined();
  expect(defaultRegion.inviteCode).not.toBeNull();
  expect(validateInviteCode(defaultRegion.inviteCode)).toMatchObject({ ok: true });
});

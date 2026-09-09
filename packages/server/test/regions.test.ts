import { regions, users } from '@link-profile/shared/schema';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { createTestContext, type TestContext } from './helpers/context.js';
import { createLoginableUser, createRegion, defaultRegionOf } from './helpers/factories.js';
import { login, withSession } from './helpers/http.js';

let ctx: TestContext;
let superToken: string;
let aliceToken: string;
let bobToken: string;
let aliceId: string;
let bobId: string;

beforeAll(async () => {
  ctx = await createTestContext();
});

afterAll(async () => {
  await ctx.close();
});

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

  superToken = (await login(ctx, 'super', 'super-pass')).token;
  aliceToken = (await login(ctx, 'alice', 'alice-pass')).token;
  bobToken = (await login(ctx, 'bob', 'bob-pass')).token;
});

function createRegionAs(token: string, body: Record<string, unknown>) {
  return ctx.app.inject({
    method: 'POST',
    url: '/_api/regions',
    ...withSession(token),
    payload: body,
  });
}

test('管理员新建的区域归属自己', async () => {
  const res = await createRegionAs(aliceToken, { name: '华东一批' });
  expect(res.statusCode).toBe(201);
  expect(res.json()).toMatchObject({
    name: '华东一批',
    ownerAdminId: aliceId,
    isDefault: false,
    memberCount: 0,
  });
});

test('管理员指定别人当归属也不作数，仍归自己', async () => {
  const res = await createRegionAs(aliceToken, { name: '想塞给 bob', ownerAdminId: bobId });
  expect(res.statusCode).toBe(201);
  expect(res.json().ownerAdminId).toBe(aliceId);
});

test('超级管理员建区域时可以指定归属管理员', async () => {
  const res = await createRegionAs(superToken, { name: '给 bob 的', ownerAdminId: bobId });
  expect(res.statusCode).toBe(201);
  expect(res.json().ownerAdminId).toBe(bobId);

  const bobSees = await ctx.app.inject({
    method: 'GET',
    url: '/_api/regions',
    ...withSession(bobToken),
  });
  expect(bobSees.json().regions.map((r: { name: string }) => r.name)).toContain('给 bob 的');
});

test('超级管理员只能把区域指给真正的管理员', async () => {
  const ok = await createRegionAs(superToken, { name: '指给 alice', ownerAdminId: aliceId });
  expect(ok.statusCode).toBe(201);

  const bad = await createRegionAs(superToken, {
    name: '更乱',
    ownerAdminId: '00000000-0000-4000-8000-0000000000aa',
  });
  expect(bad.statusCode).toBe(400);
  expect(bad.json()).toMatchObject({ error: 'not_an_admin' });
});

test('超级管理员不能把区域归属给自己——超管不拥有区域', async () => {
  const me = await ctx.app.inject({
    method: 'GET',
    url: '/_api/auth/me',
    ...withSession(superToken),
  });
  const superId = me.json().id as string;

  const res = await createRegionAs(superToken, { name: '想归给自己', ownerAdminId: superId });
  expect(res.statusCode).toBe(400);
  expect(res.json()).toMatchObject({ error: 'not_an_admin' });
});

test('区域名全站唯一，重名被拒并说明原因', async () => {
  expect((await createRegionAs(aliceToken, { name: '同一个名字' })).statusCode).toBe(201);

  const again = await createRegionAs(bobToken, { name: '同一个名字' });
  expect(again.statusCode).toBe(409);
  expect(again.json()).toMatchObject({ error: 'region_name_taken' });
});

test('区域名不能为空', async () => {
  const res = await createRegionAs(aliceToken, { name: '   ' });
  expect(res.statusCode).toBe(400);
});

test('区域列表带成员数与归属管理员，管理员只看得到自己的', async () => {
  const created = (await createRegionAs(aliceToken, { name: '华东一批' })).json();
  await createLoginableUser(ctx.db, 'p', { account: 'member-1', regionId: created.id });
  await createLoginableUser(ctx.db, 'p', { account: 'member-2', regionId: created.id });
  await createRegionAs(bobToken, { name: 'bob 的一批' });

  const forAlice = await ctx.app.inject({
    method: 'GET',
    url: '/_api/regions',
    ...withSession(aliceToken),
  });
  const names = forAlice.json().regions.map((r: { name: string }) => r.name);
  expect(names).toContain('华东一批');
  expect(names).not.toContain('bob 的一批');

  const row = forAlice.json().regions.find((r: { name: string }) => r.name === '华东一批');
  expect(row).toMatchObject({ memberCount: 2, ownerAdminId: aliceId });
});

test('管理员看不见无归属区域，超级管理员看得见', async () => {
  await createRegion(ctx.db, { name: '没人管的', ownerAdminId: null });

  const forAlice = await ctx.app.inject({
    method: 'GET',
    url: '/_api/regions',
    ...withSession(aliceToken),
  });
  expect(forAlice.json().regions.map((r: { name: string }) => r.name)).not.toContain('没人管的');

  const forSuper = await ctx.app.inject({
    method: 'GET',
    url: '/_api/regions',
    ...withSession(superToken),
  });
  expect(forSuper.json().regions.map((r: { name: string }) => r.name)).toContain('没人管的');
});

test('区域改名生效', async () => {
  const created = (await createRegionAs(aliceToken, { name: '旧名字' })).json();

  const res = await ctx.app.inject({
    method: 'PATCH',
    url: `/_api/regions/${created.id}`,
    ...withSession(aliceToken),
    payload: { name: '新名字' },
  });
  expect(res.statusCode).toBe(200);
  expect(res.json().name).toBe('新名字');
});

test('改名撞上别人的区域名被拒', async () => {
  const mine = (await createRegionAs(aliceToken, { name: '我的' })).json();
  await createRegionAs(bobToken, { name: '别人的' });

  const res = await ctx.app.inject({
    method: 'PATCH',
    url: `/_api/regions/${mine.id}`,
    ...withSession(aliceToken),
    payload: { name: '别人的' },
  });
  expect(res.statusCode).toBe(409);
  expect(res.json()).toMatchObject({ error: 'region_name_taken' });
});

test('改成自己现在的名字不算撞车', async () => {
  const mine = (await createRegionAs(aliceToken, { name: '原地不动' })).json();

  const res = await ctx.app.inject({
    method: 'PATCH',
    url: `/_api/regions/${mine.id}`,
    ...withSession(aliceToken),
    payload: { name: '原地不动' },
  });
  expect(res.statusCode).toBe(200);
});

test('删除空区域成功', async () => {
  const created = (await createRegionAs(aliceToken, { name: '建错了' })).json();

  const res = await ctx.app.inject({
    method: 'DELETE',
    url: `/_api/regions/${created.id}`,
    ...withSession(aliceToken),
  });
  expect(res.statusCode).toBe(204);

  const left = await ctx.db
    .select({ id: regions.id })
    .from(regions)
    .where(eq(regions.id, created.id));
  expect(left).toEqual([]);
});

test('删除还有人的区域被拒，并带上人数，人一个没少', async () => {
  const created = (await createRegionAs(aliceToken, { name: '还有人' })).json();
  await createLoginableUser(ctx.db, 'p', { account: 'member-1', regionId: created.id });

  const res = await ctx.app.inject({
    method: 'DELETE',
    url: `/_api/regions/${created.id}`,
    ...withSession(aliceToken),
  });
  expect(res.statusCode).toBe(409);
  expect(res.json()).toMatchObject({ error: 'region_not_empty', memberCount: 1 });

  const still = await ctx.db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.regionId, created.id));
  expect(still.length).toBe(1);
});

test('默认区域删不掉', async () => {
  const defaultId = await defaultRegionOf(ctx.db, aliceId);

  const res = await ctx.app.inject({
    method: 'DELETE',
    url: `/_api/regions/${defaultId}`,
    ...withSession(aliceToken),
  });
  expect(res.statusCode).toBe(409);
  expect(res.json()).toMatchObject({ error: 'region_is_default' });
});

test('管理员改不动也删不掉别人名下的区域', async () => {
  const bobs = (await createRegionAs(bobToken, { name: 'bob 的' })).json();

  const renamed = await ctx.app.inject({
    method: 'PATCH',
    url: `/_api/regions/${bobs.id}`,
    ...withSession(aliceToken),
    payload: { name: '抢过来' },
  });
  expect(renamed.statusCode).toBe(403);

  const removed = await ctx.app.inject({
    method: 'DELETE',
    url: `/_api/regions/${bobs.id}`,
    ...withSession(aliceToken),
  });
  expect(removed.statusCode).toBe(403);
});

test('用户角色一个区域都看不到', async () => {
  const member = await createLoginableUser(ctx.db, 'member-pass', { account: 'member-1' });
  expect(member.id).toBeDefined();
  const memberToken = (await login(ctx, 'member-1', 'member-pass')).token;

  const res = await ctx.app.inject({
    method: 'GET',
    url: '/_api/regions',
    ...withSession(memberToken),
  });
  expect(res.statusCode).toBe(403);
});

test('管理员列表带上每人的区域数', async () => {
  await createRegionAs(aliceToken, { name: '华东一批' });
  await createRegionAs(aliceToken, { name: '华东二批' });

  const res = await ctx.app.inject({
    method: 'GET',
    url: '/_api/admins',
    ...withSession(superToken),
  });
  const alice = res.json().admins.find((a: { id: string }) => a.id === aliceId);
  const bob = res.json().admins.find((a: { id: string }) => a.id === bobId);
  // alice 有默认区域 + 新建两个；bob 只有默认区域
  expect(alice.regionCount).toBe(3);
  expect(bob.regionCount).toBe(1);
});

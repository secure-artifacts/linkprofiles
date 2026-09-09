import { inviteCodes, regions } from '@link-profile/shared/schema';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { createTestContext, type TestContext } from './helpers/context.js';
import { createLoginableUser } from './helpers/factories.js';
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

function deleteAdmin(id: string) {
  return ctx.app.inject({
    method: 'DELETE',
    url: `/_api/admins/${id}`,
    ...withSession(superToken),
  });
}

async function activeCodesOf(regionId: string) {
  return ctx.db
    .select({ code: inviteCodes.code })
    .from(inviteCodes)
    .where(and(eq(inviteCodes.regionId, regionId), eq(inviteCodes.isActive, true)));
}

test('删除管理员后，名下区域归属置空而不是连带删除', async () => {
  const region = await newRegion(aliceToken, '华东一批');
  const member = await createLoginableUser(ctx.db, 'p', {
    account: 'member-1',
    regionId: region.id,
  });

  expect((await deleteAdmin(aliceId)).statusCode).toBe(204);

  const [row] = await ctx.db
    .select({ ownerAdminId: regions.ownerAdminId })
    .from(regions)
    .where(eq(regions.id, region.id));
  expect(row).toMatchObject({ ownerAdminId: null });

  // 人还在，只是没人管了
  const seen = await ctx.app.inject({
    method: 'GET',
    url: `/_api/users/${member.id}`,
    ...withSession(superToken),
  });
  expect(seen.statusCode).toBe(200);
});

test('无归属区域的邀请码立即失效', async () => {
  const region = await newRegion(aliceToken, '华东一批');
  expect(await activeCodesOf(region.id)).toHaveLength(1);

  await deleteAdmin(aliceId);

  expect(await activeCodesOf(region.id)).toEqual([]);
});

test('超管走通用的删用户路径删掉管理员，邀请码同样立刻失效', async () => {
  const region = await newRegion(aliceToken, '华东一批');
  expect(await activeCodesOf(region.id)).toHaveLength(1);

  // 不走 /admins/:id，走 /users/:id —— 两条路径的行为必须一致
  const removed = await ctx.app.inject({
    method: 'DELETE',
    url: `/_api/users/${aliceId}`,
    ...withSession(superToken),
  });
  expect(removed.statusCode).toBe(204);

  expect(await activeCodesOf(region.id)).toEqual([]);
  const [row] = await ctx.db
    .select({ ownerAdminId: regions.ownerAdminId })
    .from(regions)
    .where(eq(regions.id, region.id));
  expect(row).toMatchObject({ ownerAdminId: null });
});

test('无归属区域只有超级管理员看得见', async () => {
  const region = await newRegion(aliceToken, '华东一批');
  await deleteAdmin(aliceId);

  const forBob = await ctx.app.inject({
    method: 'GET',
    url: '/_api/regions',
    ...withSession(bobToken),
  });
  expect(forBob.json().regions.map((r: { id: string }) => r.id)).not.toContain(region.id);

  const forSuper = await ctx.app.inject({
    method: 'GET',
    url: '/_api/regions',
    ...withSession(superToken),
  });
  const row = forSuper.json().regions.find((r: { id: string }) => r.id === region.id);
  expect(row).toMatchObject({ ownerAdminId: null, inviteCode: null });
});

test('无归属区域发不了新码，先指派才行', async () => {
  const region = await newRegion(aliceToken, '华东一批');
  await deleteAdmin(aliceId);

  const blocked = await ctx.app.inject({
    method: 'POST',
    url: `/_api/regions/${region.id}/invite-code`,
    ...withSession(superToken),
    payload: {},
  });
  expect(blocked.statusCode).toBe(409);
  expect(blocked.json()).toMatchObject({ error: 'region_unowned' });
});

test('超级管理员重新指派后，区域重新有人管，码也能重新发', async () => {
  const region = await newRegion(aliceToken, '华东一批');
  await deleteAdmin(aliceId);

  const assigned = await ctx.app.inject({
    method: 'PATCH',
    url: `/_api/regions/${region.id}`,
    ...withSession(superToken),
    payload: { ownerAdminId: bobId },
  });
  expect(assigned.statusCode).toBe(200);
  expect(assigned.json().ownerAdminId).toBe(bobId);

  const issued = await ctx.app.inject({
    method: 'POST',
    url: `/_api/regions/${region.id}/invite-code`,
    ...withSession(bobToken),
    payload: {},
  });
  expect(issued.statusCode).toBe(200);
  expect(await activeCodesOf(region.id)).toHaveLength(1);

  // bob 现在看得见这个区域了
  const forBob = await ctx.app.inject({
    method: 'GET',
    url: '/_api/regions',
    ...withSession(bobToken),
  });
  expect(forBob.json().regions.map((r: { id: string }) => r.id)).toContain(region.id);
});

test('把区域指派给别人时，上一任的码一并停掉', async () => {
  const region = await newRegion(aliceToken, '华东一批');
  expect(await activeCodesOf(region.id)).toHaveLength(1);

  await ctx.app.inject({
    method: 'PATCH',
    url: `/_api/regions/${region.id}`,
    ...withSession(superToken),
    payload: { ownerAdminId: bobId },
  });

  expect(await activeCodesOf(region.id)).toEqual([]);
});

test('管理员指派不动区域归属', async () => {
  const region = await newRegion(aliceToken, '华东一批');

  const res = await ctx.app.inject({
    method: 'PATCH',
    url: `/_api/regions/${region.id}`,
    ...withSession(aliceToken),
    payload: { ownerAdminId: bobId },
  });
  expect(res.statusCode).toBe(403);
});

test('只能指派给真正的管理员', async () => {
  const region = await newRegion(aliceToken, '华东一批');
  const member = await createLoginableUser(ctx.db, 'p', { account: 'member-1' });

  const res = await ctx.app.inject({
    method: 'PATCH',
    url: `/_api/regions/${region.id}`,
    ...withSession(superToken),
    payload: { ownerAdminId: member.id },
  });
  expect(res.statusCode).toBe(400);
  expect(res.json()).toMatchObject({ error: 'not_an_admin' });
});

test('改名与指派可以分开做，也可以一起做', async () => {
  const region = await newRegion(aliceToken, '华东一批');

  const res = await ctx.app.inject({
    method: 'PATCH',
    url: `/_api/regions/${region.id}`,
    ...withSession(superToken),
    payload: { name: '换个名字', ownerAdminId: bobId },
  });
  expect(res.statusCode).toBe(200);
  expect(res.json()).toMatchObject({ name: '换个名字', ownerAdminId: bobId });
});

test('两个字段都不给的改动被拒', async () => {
  const region = await newRegion(aliceToken, '华东一批');

  const res = await ctx.app.inject({
    method: 'PATCH',
    url: `/_api/regions/${region.id}`,
    ...withSession(superToken),
    payload: {},
  });
  expect(res.statusCode).toBe(400);
});

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

function move(token: string, userIds: string[], regionId: string) {
  return ctx.app.inject({
    method: 'PUT',
    url: '/_api/users/region',
    ...withSession(token),
    payload: { userIds, regionId },
  });
}

async function regionIdOf(userId: string) {
  const [row] = await ctx.db
    .select({ regionId: users.regionId })
    .from(users)
    .where(eq(users.id, userId));
  return row?.regionId ?? null;
}

test('管理员在自己名下的两个区域之间移人', async () => {
  const from = await defaultRegionOf(ctx.db, aliceId);
  const to = await createRegion(ctx.db, { ownerAdminId: aliceId });
  const one = await createLoginableUser(ctx.db, 'p', { account: 'one', regionId: from });
  const two = await createLoginableUser(ctx.db, 'p', { account: 'two', regionId: from });

  const res = await move(aliceToken, [one.id, two.id], to.id);
  expect(res.statusCode).toBe(200);
  expect(res.json()).toMatchObject({ moved: 2, regionId: to.id });
  expect(await regionIdOf(one.id)).toBe(to.id);
  expect(await regionIdOf(two.id)).toBe(to.id);
});

test('管理员移不到别人名下的区域', async () => {
  const mine = await createLoginableUser(ctx.db, 'p', {
    account: 'mine',
    regionId: await defaultRegionOf(ctx.db, aliceId),
  });
  const bobsRegion = await defaultRegionOf(ctx.db, bobId);

  const res = await move(aliceToken, [mine.id], bobsRegion);
  expect(res.statusCode).toBe(400);
  expect(res.json()).toMatchObject({ error: 'region_not_found' });
  expect(await regionIdOf(mine.id)).not.toBe(bobsRegion);
});

test('管理员移不动别人的用户', async () => {
  const theirs = await createLoginableUser(ctx.db, 'p', {
    account: 'theirs',
    regionId: await defaultRegionOf(ctx.db, bobId),
  });
  const myRegion = await createRegion(ctx.db, { ownerAdminId: aliceId });

  const res = await move(aliceToken, [theirs.id], myRegion.id);
  expect(res.statusCode).toBe(403);
});

test('整批里有一个碰不了就整批不动', async () => {
  const from = await defaultRegionOf(ctx.db, aliceId);
  const to = await createRegion(ctx.db, { ownerAdminId: aliceId });
  const ok = await createLoginableUser(ctx.db, 'p', { account: 'ok', regionId: from });
  const theirs = await createLoginableUser(ctx.db, 'p', {
    account: 'theirs',
    regionId: await defaultRegionOf(ctx.db, bobId),
  });

  const res = await move(aliceToken, [ok.id, theirs.id], to.id);
  expect(res.statusCode).toBe(403);
  expect(await regionIdOf(ok.id)).toBe(from);
});

test('超级管理员跨管理员移人', async () => {
  const someone = await createLoginableUser(ctx.db, 'p', {
    account: 'someone',
    regionId: await defaultRegionOf(ctx.db, aliceId),
  });
  const bobsRegion = await defaultRegionOf(ctx.db, bobId);

  const res = await move(superToken, [someone.id], bobsRegion);
  expect(res.statusCode).toBe(200);
  expect(await regionIdOf(someone.id)).toBe(bobsRegion);

  const bobSees = await ctx.app.inject({
    method: 'GET',
    url: `/_api/users/${someone.id}`,
    ...withSession(bobToken),
  });
  expect(bobSees.statusCode).toBe(200);
});

test('移走之后原来的管理员就看不见了', async () => {
  const someone = await createLoginableUser(ctx.db, 'p', {
    account: 'someone',
    regionId: await defaultRegionOf(ctx.db, aliceId),
  });

  await move(superToken, [someone.id], await defaultRegionOf(ctx.db, bobId));

  const aliceSees = await ctx.app.inject({
    method: 'GET',
    url: `/_api/users/${someone.id}`,
    ...withSession(aliceToken),
  });
  expect(aliceSees.statusCode).toBe(403);
});

test('用户列表按区域筛选', async () => {
  const from = await defaultRegionOf(ctx.db, aliceId);
  const other = await createRegion(ctx.db, { ownerAdminId: aliceId, name: '另一批' });
  await createLoginableUser(ctx.db, 'p', { account: 'in-default', regionId: from });
  await createLoginableUser(ctx.db, 'p', { account: 'in-other', regionId: other.id });

  const res = await ctx.app.inject({
    method: 'GET',
    url: `/_api/users?region=${other.id}`,
    ...withSession(aliceToken),
  });
  expect(res.json().users.map((u: { account: string }) => u.account)).toEqual(['in-other']);
});

test('筛别人的区域筛不出东西，不泄露它存在', async () => {
  const bobsRegion = await defaultRegionOf(ctx.db, bobId);
  await createLoginableUser(ctx.db, 'p', { account: 'bobs-user', regionId: bobsRegion });

  const res = await ctx.app.inject({
    method: 'GET',
    url: `/_api/users?region=${bobsRegion}`,
    ...withSession(aliceToken),
  });
  expect(res.statusCode).toBe(200);
  expect(res.json().users).toEqual([]);
});

test('建用户时可以指定落到自己名下的哪个区域', async () => {
  const target = await createRegion(ctx.db, { ownerAdminId: aliceId, name: '指定这个' });

  const res = await ctx.app.inject({
    method: 'POST',
    url: '/_api/users',
    ...withSession(aliceToken),
    payload: {
      account: 'picked',
      password: 'a-good-password',
      label: '指定区域',
      shortName: 'picked',
      regionId: target.id,
    },
  });
  expect(res.statusCode).toBe(201);
  expect(res.json().regionId).toBe(target.id);
});

test('建用户时指定别人的区域被拒', async () => {
  const bobsRegion = await defaultRegionOf(ctx.db, bobId);

  const res = await ctx.app.inject({
    method: 'POST',
    url: '/_api/users',
    ...withSession(aliceToken),
    payload: {
      account: 'sneaky',
      password: 'a-good-password',
      label: '塞进别人地盘',
      shortName: 'sneaky',
      regionId: bobsRegion,
    },
  });
  expect(res.statusCode).toBe(400);
  expect(res.json()).toMatchObject({ error: 'region_not_found' });
});

test('不指定区域时落创建者的默认区域', async () => {
  const res = await ctx.app.inject({
    method: 'POST',
    url: '/_api/users',
    ...withSession(aliceToken),
    payload: {
      account: 'defaulted',
      password: 'a-good-password',
      label: '走默认',
      shortName: 'defaulted',
    },
  });
  expect(res.statusCode).toBe(201);
  expect(res.json().regionId).toBe(await defaultRegionOf(ctx.db, aliceId));
});

test('批量创建可以整批指定区域', async () => {
  const target = await createRegion(ctx.db, { ownerAdminId: aliceId, name: '批量落这里' });

  const res = await ctx.app.inject({
    method: 'POST',
    url: '/_api/users/bulk',
    ...withSession(aliceToken),
    payload: {
      text: ['张三\tzhangsan\tzhangsan\tpass-1234', '李四\tlisi\tlisi\tpass-1234'].join('\n'),
      regionId: target.id,
    },
  });
  expect(res.statusCode).toBe(200);
  expect(res.json().createdCount).toBe(2);

  const rows = await ctx.db
    .select({ account: users.account })
    .from(users)
    .where(eq(users.regionId, target.id));
  expect(rows.map((r) => r.account).sort()).toEqual(['lisi', 'zhangsan']);
});

test('批量创建指定别人的区域被拒，一个人都不建', async () => {
  const bobsRegion = await defaultRegionOf(ctx.db, bobId);

  const res = await ctx.app.inject({
    method: 'POST',
    url: '/_api/users/bulk',
    ...withSession(aliceToken),
    payload: { text: '张三\tzhangsan\tzhangsan\tpass-1234', regionId: bobsRegion },
  });
  expect(res.statusCode).toBe(400);
  expect(res.json()).toMatchObject({ error: 'region_not_found' });

  const created = await ctx.db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.account, 'zhangsan'));
  expect(created).toEqual([]);
});

test('用户角色移不动任何人', async () => {
  const member = await createLoginableUser(ctx.db, 'member-pass', {
    account: 'member-1',
    regionId: await defaultRegionOf(ctx.db, aliceId),
  });
  const memberToken = (await login(ctx, 'member-1', 'member-pass')).token;
  const [anyRegion] = await ctx.db.select({ id: regions.id }).from(regions).limit(1);

  const res = await move(memberToken, [member.id], anyRegion!.id);
  expect(res.statusCode).toBe(403);
});

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

/** alice 与 bob 是两个互不相干的运营小组的管理员。 */
beforeAll(async () => {
  ctx = await createTestContext();
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.sql`truncate table users cascade`;

  await createLoginableUser(ctx.db, 'super-pass', {
    role: 'superadmin',
    account: 'super',
    shortName: null,
  });
  const alice = await createLoginableUser(ctx.db, 'alice-pass', {
    role: 'admin',
    account: 'alice',
    shortName: null,
  });
  const bob = await createLoginableUser(ctx.db, 'bob-pass', {
    role: 'admin',
    account: 'bob',
    shortName: null,
  });
  aliceId = alice.id;
  bobId = bob.id;

  superToken = (await login(ctx, 'super', 'super-pass')).token;
  aliceToken = (await login(ctx, 'alice', 'alice-pass')).token;
  bobToken = (await login(ctx, 'bob', 'bob-pass')).token;
});

async function createUserAs(token: string, shortName: string) {
  const res = await ctx.app.inject({
    method: 'POST',
    url: '/_api/users',
    ...withSession(token),
    payload: {
      account: shortName,
      password: 'a-good-password',
      label: shortName,
      shortName,
    },
  });
  expect(res.statusCode).toBe(201);
  return res.json() as { id: string; owningAdminId: string | null };
}

test('创建者自动成为归属管理员', async () => {
  const created = await createUserAs(aliceToken, 'alice-one');
  expect(created.owningAdminId).toBe(aliceId);
});

test('管理员的列表只返回归属于自己的用户', async () => {
  await createUserAs(aliceToken, 'alice-one');
  await createUserAs(bobToken, 'bob-one');

  const forAlice = await ctx.app.inject({
    method: 'GET',
    url: '/_api/users',
    ...withSession(aliceToken),
  });
  expect(forAlice.json().users.map((u: { shortName: string }) => u.shortName)).toEqual([
    'alice-one',
  ]);

  const forBob = await ctx.app.inject({
    method: 'GET',
    url: '/_api/users',
    ...withSession(bobToken),
  });
  expect(forBob.json().users.map((u: { shortName: string }) => u.shortName)).toEqual(['bob-one']);
});

test('管理员访问非名下用户的任一接口都被拒', async () => {
  const bobsUser = await createUserAs(bobToken, 'bob-one');

  const calls = [
    { method: 'GET' as const, url: `/_api/users/${bobsUser.id}` },
    { method: 'PATCH' as const, url: `/_api/users/${bobsUser.id}`, payload: { label: '抢过来' } },
    {
      method: 'PATCH' as const,
      url: `/_api/users/${bobsUser.id}`,
      payload: { shortName: 'stolen-name' },
    },
    { method: 'DELETE' as const, url: `/_api/users/${bobsUser.id}` },
    {
      method: 'PUT' as const,
      url: `/_api/users/${bobsUser.id}/password`,
      payload: { newPassword: 'stolen-password' },
    },
  ];

  for (const call of calls) {
    const res = await ctx.app.inject({ ...call, ...withSession(aliceToken) });
    expect(res.statusCode, `${call.method} ${call.url}`).toBe(403);
  }

  // 确认真的没改动
  const check = await ctx.app.inject({
    method: 'GET',
    url: `/_api/users/${bobsUser.id}`,
    ...withSession(bobToken),
  });
  expect(check.json()).toMatchObject({ shortName: 'bob-one', label: 'bob-one' });
});

test('超级管理员不受归属限制，看得到全部用户', async () => {
  await createUserAs(aliceToken, 'alice-one');
  await createUserAs(bobToken, 'bob-one');

  const res = await ctx.app.inject({
    method: 'GET',
    url: '/_api/users',
    ...withSession(superToken),
  });

  expect(
    res
      .json()
      .users.map((u: { shortName: string }) => u.shortName)
      .sort(),
  ).toEqual(['alice-one', 'bob-one']);
});

test('删除管理员后，其名下用户转为无归属而不是被连带删除', async () => {
  const orphan = await createUserAs(aliceToken, 'alice-one');

  const removed = await ctx.app.inject({
    method: 'DELETE',
    url: `/_api/admins/${aliceId}`,
    ...withSession(superToken),
  });
  expect(removed.statusCode).toBe(204);

  const detail = await ctx.app.inject({
    method: 'GET',
    url: `/_api/users/${orphan.id}`,
    ...withSession(superToken),
  });
  expect(detail.statusCode).toBe(200);
  expect(detail.json().owningAdminId).toBeNull();
});

test('无归属用户仅超级管理员可见，可单独列出', async () => {
  const orphan = await createUserAs(aliceToken, 'alice-one');
  await createUserAs(bobToken, 'bob-one');
  await ctx.app.inject({
    method: 'DELETE',
    url: `/_api/admins/${aliceId}`,
    ...withSession(superToken),
  });

  const unowned = await ctx.app.inject({
    method: 'GET',
    url: '/_api/users?owner=none',
    ...withSession(superToken),
  });
  expect(unowned.json().users.map((u: { id: string }) => u.id)).toEqual([orphan.id]);

  // bob 既看不到无归属的，也拿不到这份清单
  const bobSees = await ctx.app.inject({
    method: 'GET',
    url: '/_api/users?owner=none',
    ...withSession(bobToken),
  });
  expect(bobSees.json().users).toEqual([]);

  const bobDetail = await ctx.app.inject({
    method: 'GET',
    url: `/_api/users/${orphan.id}`,
    ...withSession(bobToken),
  });
  expect(bobDetail.statusCode).toBe(403);
});

test('超级管理员可以把无归属用户重新指派给某个管理员', async () => {
  const orphan = await createUserAs(aliceToken, 'alice-one');
  await ctx.app.inject({
    method: 'DELETE',
    url: `/_api/admins/${aliceId}`,
    ...withSession(superToken),
  });

  const assigned = await ctx.app.inject({
    method: 'PUT',
    url: `/_api/users/${orphan.id}/owner`,
    ...withSession(superToken),
    payload: { owningAdminId: bobId },
  });
  expect(assigned.statusCode).toBe(200);
  expect(assigned.json().owningAdminId).toBe(bobId);

  // 指派之后 bob 就管得了
  const bobSees = await ctx.app.inject({
    method: 'GET',
    url: `/_api/users/${orphan.id}`,
    ...withSession(bobToken),
  });
  expect(bobSees.statusCode).toBe(200);
});

test('管理员不能自己抢用户', async () => {
  const bobsUser = await createUserAs(bobToken, 'bob-one');

  const res = await ctx.app.inject({
    method: 'PUT',
    url: `/_api/users/${bobsUser.id}/owner`,
    ...withSession(aliceToken),
    payload: { owningAdminId: aliceId },
  });

  expect(res.statusCode).toBe(403);
});

test('只能指派给真正的管理员', async () => {
  const someone = await createUserAs(bobToken, 'bob-one');

  const res = await ctx.app.inject({
    method: 'PUT',
    url: `/_api/users/${someone.id}/owner`,
    ...withSession(superToken),
    payload: { owningAdminId: someone.id },
  });

  expect(res.statusCode).toBe(400);
  expect(res.json()).toEqual({ error: 'not_an_admin' });
});

test('可以显式把用户置为无归属', async () => {
  const someone = await createUserAs(bobToken, 'bob-one');

  const res = await ctx.app.inject({
    method: 'PUT',
    url: `/_api/users/${someone.id}/owner`,
    ...withSession(superToken),
    payload: { owningAdminId: null },
  });

  expect(res.statusCode).toBe(200);
  expect(res.json().owningAdminId).toBeNull();
});

test('用户自己不受归属影响，仍然只看得到自己', async () => {
  const mine = await createUserAs(aliceToken, 'alice-one');
  await ctx.sql`update users set password_hash = (select password_hash from users where account = 'alice') where id = ${mine.id}`;
  const { token } = await login(ctx, 'alice-one', 'alice-pass');

  const list = await ctx.app.inject({ method: 'GET', url: '/_api/users', ...withSession(token) });
  expect(list.json().users.map((u: { id: string }) => u.id)).toEqual([mine.id]);
});

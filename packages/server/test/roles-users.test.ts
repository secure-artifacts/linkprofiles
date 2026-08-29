import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { createTestContext, type TestContext } from './helpers/context.js';
import { createLoginableUser } from './helpers/factories.js';
import { login, withSession } from './helpers/http.js';

let ctx: TestContext;
let superToken: string;
let adminToken: string;
let userToken: string;
let adminId: string;
let userId: string;
let profileId: string;

beforeAll(async () => {
  ctx = await createTestContext();
});

afterAll(async () => {
  await ctx.close();
});

/** 每个用例从同一组干净的三级角色出发。 */
beforeEach(async () => {
  await ctx.sql`truncate table users cascade`;

  await createLoginableUser(ctx.db, 'super-pass', {
    role: 'superadmin',
    account: 'super',
  });
  const admin = await createLoginableUser(ctx.db, 'admin-pass', {
    role: 'admin',
    account: 'admin',
  });
  // 归属于上面这个管理员 —— 05 之后管理员只碰得到名下用户
  const user = await createLoginableUser(ctx.db, 'user-pass', {
    role: 'user',
    account: 'user',
    shortName: 'plain-user',
    owningAdminId: admin.id,
  });
  adminId = admin.id;
  userId = user.id;
  profileId = user.profileId!;

  superToken = (await login(ctx, 'super', 'super-pass')).token;
  adminToken = (await login(ctx, 'admin', 'admin-pass')).token;
  userToken = (await login(ctx, 'user', 'user-pass')).token;
});

const newUser = (over: Record<string, unknown> = {}) => ({
  account: 'fresh-account',
  password: 'fresh-password',
  label: '新来的',
  shortName: 'fresh-name',
  ...over,
});

test('超级管理员可以创建和删除管理员', async () => {
  const created = await ctx.app.inject({
    method: 'POST',
    url: '/_api/admins',
    ...withSession(superToken),
    payload: { account: 'new-admin', password: 'new-admin-pass', label: '华东组' },
  });
  expect(created.statusCode).toBe(201);

  const listed = await ctx.app.inject({
    method: 'GET',
    url: '/_api/admins',
    ...withSession(superToken),
  });
  expect(listed.json().admins.map((a: { account: string }) => a.account)).toContain('new-admin');

  const removed = await ctx.app.inject({
    method: 'DELETE',
    url: `/_api/admins/${created.json().id}`,
    ...withSession(superToken),
  });
  expect(removed.statusCode).toBe(204);
});

test('管理员不能创建管理员，用户更不能', async () => {
  for (const token of [adminToken, userToken]) {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/_api/admins',
      ...withSession(token),
      payload: { account: 'sneaky-admin', password: 'sneaky-password' },
    });
    expect(res.statusCode).toBe(403);
  }
});

test('管理员不能删除管理员', async () => {
  const res = await ctx.app.inject({
    method: 'DELETE',
    url: `/_api/admins/${adminId}`,
    ...withSession(adminToken),
  });
  expect(res.statusCode).toBe(403);
});

test('超级管理员与管理员都能创建用户，用户不能', async () => {
  const bySuper = await ctx.app.inject({
    method: 'POST',
    url: '/_api/users',
    ...withSession(superToken),
    payload: newUser({ account: 'by-super', shortName: 'by-super' }),
  });
  expect(bySuper.statusCode).toBe(201);

  const byAdmin = await ctx.app.inject({
    method: 'POST',
    url: '/_api/users',
    ...withSession(adminToken),
    payload: newUser({ account: 'by-admin', shortName: 'by-admin' }),
  });
  expect(byAdmin.statusCode).toBe(201);

  const byUser = await ctx.app.inject({
    method: 'POST',
    url: '/_api/users',
    ...withSession(userToken),
    payload: newUser({ account: 'by-user', shortName: 'by-user' }),
  });
  expect(byUser.statusCode).toBe(403);
});

test('四个标识字段各就各位：账号唯一、short_name 唯一、用户名称与显示名可重复', async () => {
  const first = await ctx.app.inject({
    method: 'POST',
    url: '/_api/users',
    ...withSession(superToken),
    payload: newUser({
      account: 'account-one',
      shortName: 'a-one',
      label: '同名备注',
      displayName: '小王',
    }),
  });
  expect(first.statusCode).toBe(201);
  expect(first.json()).toMatchObject({
    account: 'account-one',
    label: '同名备注',
    firstProfile: { shortName: 'a-one', displayName: '小王' },
  });

  // 用户名称与显示名可以重复
  const second = await ctx.app.inject({
    method: 'POST',
    url: '/_api/users',
    ...withSession(superToken),
    payload: newUser({
      account: 'account-two',
      shortName: 'a-two',
      label: '同名备注',
      displayName: '小王',
    }),
  });
  expect(second.statusCode).toBe(201);

  // 账号唯一
  const dupAccount = await ctx.app.inject({
    method: 'POST',
    url: '/_api/users',
    ...withSession(superToken),
    payload: newUser({ account: 'ACCOUNT-ONE', shortName: 'a-three' }),
  });
  expect(dupAccount.statusCode).toBe(409);
  expect(dupAccount.json()).toEqual({ error: 'account_taken' });

  // short_name 按小写唯一
  const dupShortName = await ctx.app.inject({
    method: 'POST',
    url: '/_api/users',
    ...withSession(superToken),
    payload: newUser({ account: 'account-four', shortName: 'A-ONE' }),
  });
  expect(dupShortName.statusCode).toBe(409);
  expect(dupShortName.json()).toEqual({ error: 'short_name_taken' });
});

test('非法 short_name 被拒', async () => {
  for (const shortName of ['ab', '-lead', 'trail-', '_admin', '有中文', 'a'.repeat(31)]) {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/_api/users',
      ...withSession(superToken),
      payload: newUser({ account: `acct-${shortName}`, shortName }),
    });
    expect(res.statusCode, `short_name=${shortName}`).toBe(400);
  }
});

test('short_name 入库即强制小写，公开页按小写地址可达', async () => {
  const res = await ctx.app.inject({
    method: 'POST',
    url: '/_api/users',
    ...withSession(superToken),
    payload: newUser({ account: 'mixedcase', shortName: 'MixedCase' }),
  });

  expect(res.json().firstProfile.shortName).toBe('mixedcase');
  const page = await ctx.app.inject({ method: 'GET', url: '/MixedCase' });
  expect(page.statusCode).toBe(200);
});

test('用户改得了自己的 short_name 与备注', async () => {
  const rename = await ctx.app.inject({
    method: 'PATCH',
    url: `/_api/profiles/${profileId}/short-name`,
    ...withSession(userToken),
    payload: { shortName: 'i-want-this' },
  });
  expect(rename.statusCode).toBe(200);
  expect(rename.json().profile.shortName).toBe('i-want-this');

  const relabel = await ctx.app.inject({
    method: 'PATCH',
    url: `/_api/users/${userId}`,
    ...withSession(userToken),
    payload: { label: '我改的备注' },
  });
  expect(relabel.statusCode).toBe(200);
  expect(relabel.json().label).toBe('我改的备注');
});

test('用户建得了自己的新页面，但删不掉任何一个', async () => {
  const created = await ctx.app.inject({
    method: 'POST',
    url: `/_api/users/${userId}/profiles`,
    ...withSession(userToken),
    payload: { shortName: 'my-second-page', displayName: '第二个' },
  });
  expect(created.statusCode).toBe(201);

  // 删除是唯一不可逆的那个（地址进墓碑、媒体从磁盘删掉），仍然只有管理员做得了
  const removed = await ctx.app.inject({
    method: 'DELETE',
    url: `/_api/profiles/${created.json().id}`,
    ...withSession(userToken),
  });
  expect(removed.statusCode).toBe(403);
});

test('管理员可以修改用户的 short_name', async () => {
  const res = await ctx.app.inject({
    method: 'PATCH',
    url: `/_api/profiles/${profileId}/short-name`,
    ...withSession(adminToken),
    payload: { shortName: 'renamed-by-admin' },
  });

  expect(res.statusCode).toBe(200);
  expect(res.json().profile.shortName).toBe('renamed-by-admin');
});

test('管理员能修改名下用户的登录用户名，用户不能绕过密码调用管理接口', async () => {
  const renamed = await ctx.app.inject({
    method: 'PUT',
    url: `/_api/users/${userId}/account`,
    ...withSession(adminToken),
    payload: { account: 'renamed.user' },
  });
  expect(renamed.statusCode).toBe(200);
  expect(renamed.json()).toEqual({ account: 'renamed.user' });
  expect((await login(ctx, 'user', 'user-pass')).res.statusCode).toBe(401);
  expect((await login(ctx, 'renamed.user', 'user-pass')).res.statusCode).toBe(200);

  const bypass = await ctx.app.inject({
    method: 'PUT',
    url: `/_api/users/${userId}/account`,
    ...withSession((await login(ctx, 'renamed.user', 'user-pass')).token),
    payload: { account: 'no-password-needed' },
  });
  expect(bypass.statusCode).toBe(403);
});

test('超级管理员能修改管理员登录用户名，普通管理员不能', async () => {
  const denied = await ctx.app.inject({
    method: 'PATCH',
    url: `/_api/admins/${adminId}`,
    ...withSession(adminToken),
    payload: { account: 'not-allowed' },
  });
  expect(denied.statusCode).toBe(403);

  const changed = await ctx.app.inject({
    method: 'PATCH',
    url: `/_api/admins/${adminId}`,
    ...withSession(superToken),
    payload: { account: 'operations.admin', label: '运营组' },
  });
  expect(changed.statusCode).toBe(200);
  expect(changed.json()).toMatchObject({ account: 'operations.admin', label: '运营组' });
  expect((await login(ctx, 'admin', 'admin-pass')).res.statusCode).toBe(401);
  expect((await login(ctx, 'operations.admin', 'admin-pass')).res.statusCode).toBe(200);
});

test('用户删不了任何人，包括自己', async () => {
  const res = await ctx.app.inject({
    method: 'DELETE',
    url: `/_api/users/${userId}`,
    ...withSession(userToken),
  });
  expect(res.statusCode).toBe(403);
});

test('删除用户会踢掉他的会话', async () => {
  const removed = await ctx.app.inject({
    method: 'DELETE',
    url: `/_api/users/${userId}`,
    ...withSession(adminToken),
  });
  expect(removed.statusCode).toBe(204);

  const me = await ctx.app.inject({
    method: 'GET',
    url: '/_api/auth/me',
    ...withSession(userToken),
  });
  expect(me.statusCode).toBe(401);
});

test('用户只看得到自己，看不到别人', async () => {
  const other = await createLoginableUser(ctx.db, 'other-pass', {
    role: 'user',
    account: 'other',
    shortName: 'other-user',
  });

  const list = await ctx.app.inject({
    method: 'GET',
    url: '/_api/users',
    ...withSession(userToken),
  });
  expect(list.json().users.map((u: { id: string }) => u.id)).toEqual([userId]);

  const detail = await ctx.app.inject({
    method: 'GET',
    url: `/_api/users/${other.id}`,
    ...withSession(userToken),
  });
  expect(detail.statusCode).toBe(403);
});

test('管理员碰不了管理员，也碰不了超级管理员', async () => {
  const res = await ctx.app.inject({
    method: 'GET',
    url: `/_api/users/${adminId}`,
    ...withSession(adminToken),
  });
  expect(res.statusCode).toBe(403);
});

test('越权与不存在给出同一个响应，不构成存在性探针', async () => {
  const other = await createLoginableUser(ctx.db, 'probe-pass', {
    role: 'user',
    account: 'probe',
    shortName: 'probe-user',
  });

  const forbidden = await ctx.app.inject({
    method: 'GET',
    url: `/_api/users/${other.id}`,
    ...withSession(userToken),
  });
  const missing = await ctx.app.inject({
    method: 'GET',
    url: '/_api/users/00000000-0000-4000-8000-000000000000',
    ...withSession(userToken),
  });
  const malformed = await ctx.app.inject({
    method: 'GET',
    url: '/_api/users/not-a-uuid',
    ...withSession(userToken),
  });

  expect(forbidden.statusCode).toBe(403);
  expect(missing.statusCode).toBe(403);
  expect(malformed.statusCode).toBe(403);
  expect(forbidden.body).toBe(missing.body);
  expect(forbidden.body).toBe(malformed.body);
});

test('未登录访问后台接口一律未授权', async () => {
  for (const [method, url] of [
    ['GET', '/_api/users'],
    ['POST', '/_api/users'],
    ['GET', '/_api/admins'],
    ['POST', '/_api/admins'],
    ['GET', `/_api/users/${userId}`],
    ['PATCH', `/_api/users/${userId}`],
    ['DELETE', `/_api/users/${userId}`],
  ] as const) {
    const res = await ctx.app.inject({ method, url, payload: {} });
    expect(res.statusCode, `${method} ${url}`).toBe(401);
  }
});

test('管理员可以重置名下用户的密码，旧会话立刻失效', async () => {
  const before = await ctx.app.inject({
    method: 'GET',
    url: '/_api/auth/me',
    ...withSession(userToken),
  });
  expect(before.statusCode).toBe(200);

  const reset = await ctx.app.inject({
    method: 'PUT',
    url: `/_api/users/${userId}/password`,
    ...withSession(adminToken),
    payload: { newPassword: 'reset-by-admin-1234' },
  });
  expect(reset.statusCode).toBe(204);

  // 旧会话被踢掉
  const after = await ctx.app.inject({
    method: 'GET',
    url: '/_api/auth/me',
    ...withSession(userToken),
  });
  expect(after.statusCode).toBe(401);

  // 新密码可用，旧密码不可用
  expect((await login(ctx, 'user', 'user-pass')).res.statusCode).toBe(401);
  expect((await login(ctx, 'user', 'reset-by-admin-1234')).res.statusCode).toBe(200);
});

test('超级管理员也可以重置用户密码', async () => {
  const res = await ctx.app.inject({
    method: 'PUT',
    url: `/_api/users/${userId}/password`,
    ...withSession(superToken),
    payload: { newPassword: 'reset-by-super-1234' },
  });

  expect(res.statusCode).toBe(204);
  expect((await login(ctx, 'user', 'reset-by-super-1234')).res.statusCode).toBe(200);
});

test('用户不能用重置接口绕开旧密码校验改自己的密码', async () => {
  const res = await ctx.app.inject({
    method: 'PUT',
    url: `/_api/users/${userId}/password`,
    ...withSession(userToken),
    payload: { newPassword: 'sneaky-new-password' },
  });

  expect(res.statusCode).toBe(403);
  // 原密码仍然有效
  expect((await login(ctx, 'user', 'user-pass')).res.statusCode).toBe(200);
});

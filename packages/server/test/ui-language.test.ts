import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { createTestContext, type TestContext } from './helpers/context.js';
import { createLoginableUser } from './helpers/factories.js';
import { login, withSession } from './helpers/http.js';

let ctx: TestContext;
let superToken: string;
let adminToken: string;
let userToken: string;
let userId: string;
let outsiderId: string;

beforeAll(async () => {
  ctx = await createTestContext();
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.sql`truncate table users cascade`;

  await createLoginableUser(ctx.db, 'super-pass', { role: 'superadmin', account: 'super' });
  const admin = await createLoginableUser(ctx.db, 'admin-pass', {
    role: 'admin',
    account: 'admin',
    uiLanguage: 'fil',
  });
  const otherAdmin = await createLoginableUser(ctx.db, 'other-pass', {
    role: 'admin',
    account: 'other-admin',
  });
  const user = await createLoginableUser(ctx.db, 'user-pass', {
    account: 'user',
    ownedBy: admin.id,
    uiLanguage: 'zh-Hans',
  });
  const outsider = await createLoginableUser(ctx.db, 'outsider-pass', {
    account: 'outsider',
    ownedBy: otherAdmin.id,
  });
  userId = user.id;
  outsiderId = outsider.id;

  superToken = (await login(ctx, 'super', 'super-pass')).token;
  adminToken = (await login(ctx, 'admin', 'admin-pass')).token;
  userToken = (await login(ctx, 'user', 'user-pass')).token;
});

test('登录与 /auth/me 都带上界面语言', async () => {
  const { res } = await login(ctx, 'user', 'user-pass');
  expect(res.json()).toMatchObject({ account: 'user', uiLanguage: 'zh-Hans' });

  const me = await ctx.app.inject({
    method: 'GET',
    url: '/_api/auth/me',
    ...withSession(userToken),
  });
  expect(me.json()).toMatchObject({ uiLanguage: 'zh-Hans' });
});

test('用户自助切换界面语言，换一条会话仍然是同一种语言', async () => {
  const res = await ctx.app.inject({
    method: 'PUT',
    url: '/_api/auth/language',
    payload: { uiLanguage: 'fil' },
    ...withSession(userToken),
  });
  expect(res.statusCode).toBe(200);
  expect(res.json()).toEqual({ uiLanguage: 'fil' });

  // 切语言不是改凭证，不该踢下线
  const me = await ctx.app.inject({
    method: 'GET',
    url: '/_api/auth/me',
    ...withSession(userToken),
  });
  expect(me.statusCode).toBe(200);

  const again = await login(ctx, 'user', 'user-pass');
  expect(again.res.json()).toMatchObject({ uiLanguage: 'fil' });
});

test('白名单之外的语言标签被拒', async () => {
  const res = await ctx.app.inject({
    method: 'PUT',
    url: '/_api/auth/language',
    payload: { uiLanguage: 'tl' },
    ...withSession(userToken),
  });
  expect(res.statusCode).toBe(400);
  expect(res.json()).toMatchObject({ error: 'invalid_body' });
});

test('归属管理员改得了名下账号的界面语言', async () => {
  const res = await ctx.app.inject({
    method: 'PATCH',
    url: `/_api/users/${userId}`,
    payload: { uiLanguage: 'es' },
    ...withSession(adminToken),
  });
  expect(res.statusCode).toBe(200);
  expect(res.json()).toMatchObject({ uiLanguage: 'es' });
});

test('管理员改不了非名下账号的界面语言', async () => {
  const res = await ctx.app.inject({
    method: 'PATCH',
    url: `/_api/users/${outsiderId}`,
    payload: { uiLanguage: 'es' },
    ...withSession(adminToken),
  });
  expect(res.statusCode).toBe(403);

  const stillDefault = await ctx.app.inject({
    method: 'GET',
    url: `/_api/users/${outsiderId}`,
    ...withSession(superToken),
  });
  expect(stillDefault.json()).toMatchObject({ uiLanguage: 'zh-Hans' });
});

test('新建账号继承创建者的界面语言', async () => {
  const res = await ctx.app.inject({
    method: 'POST',
    url: '/_api/users',
    payload: {
      account: 'nieves',
      password: 'password123',
      label: '新用户',
      shortName: 'nieves',
      displayName: 'Nieves',
    },
    ...withSession(adminToken),
  });
  expect(res.statusCode).toBe(201);
  expect(res.json()).toMatchObject({ uiLanguage: 'fil' });
});

test('批量开号继承操作者的界面语言', async () => {
  const res = await ctx.app.inject({
    method: 'POST',
    url: '/_api/users/bulk',
    payload: { text: '批量一\tbatch-one\tbatch-one\tpassword123' },
    ...withSession(adminToken),
  });
  expect(res.statusCode).toBe(200);

  const [row] = await ctx.sql`select ui_language from users where account = 'batch-one'`;
  expect(row?.['ui_language']).toBe('fil');
});

import { users } from '@link-profile/shared/schema';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { bootstrapSuperadmin } from '../src/auth/bootstrap.js';
import { SESSION_TTL_DAYS } from '../src/auth/sessions.js';
import { createTestContext, type TestContext } from './helpers/context.js';
import { createLoginableUser } from './helpers/factories.js';
import { login, sessionCookieOf, withSession } from './helpers/http.js';

let ctx: TestContext;

beforeAll(async () => {
  ctx = await createTestContext();
});

afterAll(async () => {
  await ctx.close();
});

test('首次启动按环境变量建出超级管理员，之后可以登录', async () => {
  const result = await bootstrapSuperadmin(ctx.db, {
    account: 'boot-super',
    password: 'boot-password',
  });
  expect(result).toBe('created');

  const { res } = await login(ctx, 'boot-super', 'boot-password');
  expect(res.statusCode).toBe(200);
  expect(res.json()).toMatchObject({ account: 'boot-super', role: 'superadmin' });
});

test('重复启动幂等：已存在超级管理员时跳过，且不覆盖已有密码', async () => {
  const again = await bootstrapSuperadmin(ctx.db, {
    account: 'another-super',
    password: 'another-password',
  });
  expect(again).toBe('already-exists');

  // 没有建出第二个账号
  const rows = await ctx.db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.role, 'superadmin'));
  expect(rows).toHaveLength(1);

  // 原密码依然有效，环境变量里的新密码无效
  const stillWorks = await login(ctx, 'boot-super', 'boot-password');
  expect(stillWorks.res.statusCode).toBe(200);
  const notApplied = await login(ctx, 'boot-super', 'another-password');
  expect(notApplied.res.statusCode).toBe(401);
});

test('登录成功下发 HttpOnly + SameSite 的会话 cookie，有效期三十天', async () => {
  await createLoginableUser(ctx.db, 'correct-horse', { account: 'cookie-user' });

  const res = await ctx.app.inject({
    method: 'POST',
    url: '/_api/auth/login',
    payload: { account: 'cookie-user', password: 'correct-horse' },
  });

  const cookie = (res.cookies as { name: string; [k: string]: unknown }[]).find(
    (c) => c.name === 'lp_session',
  );
  expect(cookie).toBeDefined();
  expect(cookie?.['httpOnly']).toBe(true);
  expect(String(cookie?.['sameSite']).toLowerCase()).toBe('lax');
  expect(cookie?.['path']).toBe('/');

  const expires = new Date(String(cookie?.['expires']));
  const days = (expires.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
  expect(days).toBeGreaterThan(SESSION_TTL_DAYS - 1);
  expect(days).toBeLessThanOrEqual(SESSION_TTL_DAYS);
});

test('任何响应都不回传密码哈希', async () => {
  await createLoginableUser(ctx.db, 'secret-pass', { account: 'no-hash' });

  const { res, token } = await login(ctx, 'no-hash', 'secret-pass');
  const me = await ctx.app.inject({ method: 'GET', url: '/_api/auth/me', ...withSession(token) });

  for (const body of [res.body, me.body]) {
    expect(body).not.toContain('$argon2');
    expect(body).not.toContain('passwordHash');
    expect(body).not.toContain('password_hash');
  }
});

test('账号不存在与密码错误给同一个响应', async () => {
  await createLoginableUser(ctx.db, 'right-pass', { account: 'exists-user' });

  const wrongPassword = await login(ctx, 'exists-user', 'wrong-pass');
  const noSuchAccount = await login(ctx, 'ghost-user', 'right-pass');

  expect(wrongPassword.res.statusCode).toBe(401);
  expect(noSuchAccount.res.statusCode).toBe(401);
  expect(wrongPassword.res.json()).toEqual(noSuchAccount.res.json());
});

test('登出后原会话立即不可用', async () => {
  await createLoginableUser(ctx.db, 'logout-pass', { account: 'logout-user' });
  const { token } = await login(ctx, 'logout-user', 'logout-pass');

  const before = await ctx.app.inject({
    method: 'GET',
    url: '/_api/auth/me',
    ...withSession(token),
  });
  expect(before.statusCode).toBe(200);

  const out = await ctx.app.inject({
    method: 'POST',
    url: '/_api/auth/logout',
    ...withSession(token),
  });
  expect(out.statusCode).toBe(204);

  const after = await ctx.app.inject({
    method: 'GET',
    url: '/_api/auth/me',
    ...withSession(token),
  });
  expect(after.statusCode).toBe(401);
});

test('修改密码后该账号的全部既有会话失效', async () => {
  await createLoginableUser(ctx.db, 'old-password', { account: 'rotate-user' });

  // 同一个账号在两台设备上登录
  const phone = await login(ctx, 'rotate-user', 'old-password');
  const laptop = await login(ctx, 'rotate-user', 'old-password');
  expect(phone.token).not.toBe(laptop.token);

  const changed = await ctx.app.inject({
    method: 'POST',
    url: '/_api/auth/password',
    ...withSession(laptop.token),
    payload: { currentPassword: 'old-password', newPassword: 'brand-new-password' },
  });
  expect(changed.statusCode).toBe(204);

  // 两条会话都被踢掉，含发起改密码的那条
  for (const token of [phone.token, laptop.token]) {
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/_api/auth/me',
      ...withSession(token),
    });
    expect(res.statusCode).toBe(401);
  }

  expect((await login(ctx, 'rotate-user', 'old-password')).res.statusCode).toBe(401);
  expect((await login(ctx, 'rotate-user', 'brand-new-password')).res.statusCode).toBe(200);
});

test('改密码要先验旧密码', async () => {
  await createLoginableUser(ctx.db, 'guard-pass', { account: 'guard-user' });
  const { token } = await login(ctx, 'guard-user', 'guard-pass');

  const res = await ctx.app.inject({
    method: 'POST',
    url: '/_api/auth/password',
    ...withSession(token),
    payload: { currentPassword: 'not-the-password', newPassword: 'whatever-long-enough' },
  });

  expect(res.statusCode).toBe(401);
});

test('未登录访问受保护接口返回未授权', async () => {
  const res = await ctx.app.inject({ method: 'GET', url: '/_api/auth/me' });

  expect(res.statusCode).toBe(401);
  expect(res.json()).toEqual({ error: 'unauthorized' });
});

test('伪造的会话令牌不被接受', async () => {
  const res = await ctx.app.inject({
    method: 'GET',
    url: '/_api/auth/me',
    ...withSession('made-up-token'),
  });

  expect(res.statusCode).toBe(401);
});

test('过期的会话不再有效', async () => {
  const user = await createLoginableUser(ctx.db, 'expire-pass', { account: 'expire-user' });
  const { token } = await login(ctx, 'expire-user', 'expire-pass');

  await ctx.sql`update sessions set expires_at = now() - interval '1 day' where user_id = ${user.id}`;

  const res = await ctx.app.inject({ method: 'GET', url: '/_api/auth/me', ...withSession(token) });
  expect(res.statusCode).toBe(401);
});

test('会话令牌不以明文入库', async () => {
  await createLoginableUser(ctx.db, 'plain-pass', { account: 'plain-user' });
  const res = await ctx.app.inject({
    method: 'POST',
    url: '/_api/auth/login',
    payload: { account: 'plain-user', password: 'plain-pass' },
  });
  const token = sessionCookieOf(res);

  const rows = await ctx.sql<{ token_hash: string }[]>`select token_hash from sessions`;
  expect(rows.map((r) => r.token_hash)).not.toContain(token);
});

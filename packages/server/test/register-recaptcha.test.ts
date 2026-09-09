import { afterAll, beforeAll, beforeEach, expect, test, vi } from 'vitest';
import { createTestContext, VALID_RECAPTCHA_TOKEN, type TestContext } from './helpers/context.js';
import { createLoginableUser } from './helpers/factories.js';
import { login, withSession } from './helpers/http.js';

let ctx: TestContext;
let superToken: string;
let code: string;

/** 记下每次调用，好断言「验的是哪个密钥、哪枚令牌、来自哪个 IP」。 */
const calls: { secret: string; token: string; remoteIp?: string }[] = [];

beforeAll(async () => {
  ctx = await createTestContext({
    recaptcha: async (secret, token, remoteIp) => {
      calls.push({ secret, token, ...(remoteIp ? { remoteIp } : {}) });
      return token === VALID_RECAPTCHA_TOKEN;
    },
  });
});

afterAll(async () => {
  await ctx.close();
});

async function configure(patch: Record<string, unknown>) {
  const res = await ctx.app.inject({
    method: 'PATCH',
    url: '/_api/settings',
    ...withSession(superToken),
    payload: patch,
  });
  expect(res.statusCode).toBe(200);
  return res.json();
}

beforeEach(async () => {
  calls.length = 0;
  await ctx.sql`truncate table users cascade`;
  await ctx.sql`truncate table settings cascade`;

  await createLoginableUser(ctx.db, 'super-pass', { role: 'superadmin', account: 'super' });
  await createLoginableUser(ctx.db, 'alice-pass', { role: 'admin', account: 'alice' });
  superToken = (await login(ctx, 'super', 'super-pass')).token;
  const aliceToken = (await login(ctx, 'alice', 'alice-pass')).token;

  const region = await ctx.app.inject({
    method: 'POST',
    url: '/_api/regions',
    ...withSession(aliceToken),
    payload: { name: '马尼拉一批' },
  });
  code = region.json().inviteCode;

  await configure({
    registrationEnabled: true,
    recaptchaSiteKey: 'the-site-key',
    recaptchaSecretKey: 'the-secret-key',
  });
});

const GOOD = { password: 'a-good-password', shortName: 'maria-ph', account: 'maria.ph' };

function register(payload: Record<string, unknown>) {
  return ctx.app.inject({ method: 'POST', url: '/_api/register', payload });
}

test('注册页拿得到站点密钥，但拿不到私钥', async () => {
  const res = await ctx.app.inject({ method: 'GET', url: '/_api/register/config' });
  expect(res.statusCode).toBe(200);
  expect(res.json()).toEqual({ recaptchaSiteKey: 'the-site-key' });
  expect(JSON.stringify(res.json())).not.toContain('the-secret-key');
});

test('私钥不从设置接口回传，只回一个配没配', async () => {
  const res = await ctx.app.inject({
    method: 'GET',
    url: '/_api/settings',
    ...withSession(superToken),
  });
  const body = res.json();
  expect(body).toMatchObject({ recaptchaSiteKey: 'the-site-key', recaptchaConfigured: true });
  expect(body).not.toHaveProperty('recaptchaSecretKey');
  expect(JSON.stringify(body)).not.toContain('the-secret-key');
});

test('带上有效令牌才注册得了，且服务端拿私钥去验', async () => {
  const res = await register({ ...GOOD, code, recaptchaToken: VALID_RECAPTCHA_TOKEN });
  expect(res.statusCode).toBe(201);

  expect(calls).toHaveLength(1);
  expect(calls[0]).toMatchObject({ secret: 'the-secret-key', token: VALID_RECAPTCHA_TOKEN });
});

test('令牌验不过就注册不了', async () => {
  const res = await register({ ...GOOD, code, recaptchaToken: 'forged' });
  expect(res.statusCode).toBe(400);
  expect(res.json()).toMatchObject({ error: 'recaptcha_failed' });
});

test('不带令牌直接打接口被拒', async () => {
  const res = await register({ ...GOOD, code });
  expect(res.statusCode).toBe(400);
  expect(res.json().issues?.[0]?.path).toEqual(['recaptchaToken']);
});

test('人机验证排在账号冲突与密码哈希之前，验不过就不往下走', async () => {
  // 账号已被占用，但令牌是坏的：应当先报人机验证，不泄露账号占没占
  await register({ ...GOOD, code, recaptchaToken: VALID_RECAPTCHA_TOKEN });
  calls.length = 0;

  const res = await register({ ...GOOD, code, recaptchaToken: 'forged' });
  expect(res.json()).toMatchObject({ error: 'recaptcha_failed' });
  expect(res.json().error).not.toBe('account_taken');
});

test('密钥没配齐时注册一律当关着，三个接口都拒', async () => {
  await configure({ recaptchaSecretKey: '' });

  const config = await ctx.app.inject({ method: 'GET', url: '/_api/register/config' });
  expect(config.statusCode).toBe(403);
  expect(config.json()).toMatchObject({ error: 'recaptcha_not_configured' });

  const preview = await ctx.app.inject({
    method: 'GET',
    url: `/_api/register/preview?code=${code}`,
  });
  expect(preview.statusCode).toBe(403);

  const res = await register({ ...GOOD, code, recaptchaToken: VALID_RECAPTCHA_TOKEN });
  expect(res.statusCode).toBe(403);
  expect(res.json()).toMatchObject({ error: 'recaptcha_not_configured' });
});

test('总闸关掉时，即便密钥配齐了也一样拒，且优先报关闭', async () => {
  await configure({ registrationEnabled: false });

  const res = await register({ ...GOOD, code, recaptchaToken: VALID_RECAPTCHA_TOKEN });
  expect(res.statusCode).toBe(403);
  expect(res.json()).toMatchObject({ error: 'registration_closed' });
});

test('校验器抛异常时不会把注册接口带成 500', async () => {
  const boom = await createTestContext({
    recaptcha: () => Promise.reject(new Error('google unreachable')),
  });
  try {
    await createLoginableUser(boom.db, 'super-pass', { role: 'superadmin', account: 'super' });
    const token = (await login(boom, 'super', 'super-pass')).token;
    await boom.app.inject({
      method: 'PATCH',
      url: '/_api/settings',
      ...withSession(token),
      payload: {
        registrationEnabled: true,
        recaptchaSiteKey: 'k',
        recaptchaSecretKey: 's',
      },
    });

    const res = await boom.app.inject({
      method: 'POST',
      url: '/_api/register',
      payload: { ...GOOD, code: 'ZZZZZZZZ', recaptchaToken: 'anything' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: 'recaptcha_failed' });
  } finally {
    await boom.close();
  }
});

test('只有超级管理员改得了人机验证的密钥', async () => {
  const aliceToken = (await login(ctx, 'alice', 'alice-pass')).token;
  const res = await ctx.app.inject({
    method: 'PATCH',
    url: '/_api/settings',
    ...withSession(aliceToken),
    payload: { recaptchaSiteKey: 'stolen' },
  });
  expect(res.statusCode).toBe(403);
});

test('校验器收到访客 IP，方便 Google 侧判断', async () => {
  await register({ ...GOOD, code, recaptchaToken: VALID_RECAPTCHA_TOKEN });
  expect(calls[0]?.remoteIp).toBeTruthy();
  expect(vi.isMockFunction(register)).toBe(false);
});

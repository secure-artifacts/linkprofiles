import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { createTestContext, type TestContext } from './helpers/context.js';
import { createLoginableUser } from './helpers/factories.js';
import { login, withSession } from './helpers/http.js';

let ctx: TestContext;
let userToken: string;
let profileId: string;

beforeAll(async () => {
  ctx = await createTestContext();
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.sql`truncate table users cascade`;
  const user = await createLoginableUser(ctx.db, 'user-pass', { account: 'lang-user' });
  profileId = user.profileId!;
  userToken = (await login(ctx, 'lang-user', 'user-pass')).token;
});

/** 复制个人页时显示名留空必然触发一条带 message 的校验失败，用它观察语言。 */
async function submitEmptyDisplayName(acceptLanguage?: string) {
  return ctx.app.inject({
    method: 'POST',
    url: `/_api/profiles/${profileId}/duplicate`,
    payload: { shortName: 'copy-of-it', displayName: '' },
    headers: acceptLanguage ? { 'accept-language': acceptLanguage } : {},
    ...withSession(userToken),
  });
}

test('请求带上语言时，逐字段的报错按那种语言返回', async () => {
  const res = await submitEmptyDisplayName('fil');
  expect(res.statusCode).toBe(400);
  expect(res.json()).toMatchObject({ error: 'invalid_body' });
  expect(res.json().issues[0].message).toBe('Hindi puwedeng walang laman ang display name');
});

test('同一条报错换一种语言就换一份文案，错误码不变', async () => {
  const zh = await submitEmptyDisplayName('zh-Hans');
  const en = await submitEmptyDisplayName('en');

  expect(zh.json().issues[0].message).toBe('显示名不能为空');
  expect(en.json().issues[0].message).toBe('Display name cannot be empty');
  expect(zh.json().error).toBe(en.json().error);
});

test('带地区后缀与权重的请求头照样协商得出来', async () => {
  const res = await submitEmptyDisplayName('ja;q=1.0, fil-PH;q=0.8, en;q=0.5');
  expect(res.json().issues[0].message).toBe('Hindi puwedeng walang laman ang display name');
});

test('不携带或不受支持的语言一律英语', async () => {
  expect((await submitEmptyDisplayName()).json().issues[0].message).toBe(
    'Display name cannot be empty',
  );
  expect((await submitEmptyDisplayName('ja,ko')).json().issues[0].message).toBe(
    'Display name cannot be empty',
  );
});

test('登录失败固定英语，因为这时还没有账号语言可依据', async () => {
  const res = await ctx.app.inject({
    method: 'POST',
    url: '/_api/auth/login',
    headers: { 'accept-language': 'zh-Hans' },
    payload: { account: 'lang-user', password: 'wrong-pass' },
  });
  expect(res.statusCode).toBe(401);
  expect(res.json()).toEqual({ error: 'invalid_credentials' });
});

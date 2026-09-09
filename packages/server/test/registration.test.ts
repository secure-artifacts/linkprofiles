import { profiles, settings, users } from '@link-profile/shared/schema';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { createTestContext, type TestContext } from './helpers/context.js';
import { createLoginableUser } from './helpers/factories.js';
import { login, withSession } from './helpers/http.js';

let ctx: TestContext;
let superToken: string;
let aliceToken: string;
let aliceId: string;
let code: string;
let regionId: string;

beforeAll(async () => {
  ctx = await createTestContext();
});

afterAll(async () => {
  await ctx.close();
});

async function setRegistration(enabled: boolean) {
  const res = await ctx.app.inject({
    method: 'PATCH',
    url: '/_api/settings',
    ...withSession(superToken),
    payload: { registrationEnabled: enabled },
  });
  expect(res.statusCode).toBe(200);
}

beforeEach(async () => {
  await ctx.sql`truncate table users cascade`;
  await ctx.sql`truncate table settings cascade`;
  await ctx.sql`truncate table short_name_tombstones cascade`;

  await createLoginableUser(ctx.db, 'super-pass', { role: 'superadmin', account: 'super' });
  const alice = await createLoginableUser(ctx.db, 'alice-pass', {
    role: 'admin',
    account: 'alice',
  });
  aliceId = alice.id;

  superToken = (await login(ctx, 'super', 'super-pass')).token;
  aliceToken = (await login(ctx, 'alice', 'alice-pass')).token;

  const region = await ctx.app.inject({
    method: 'POST',
    url: '/_api/regions',
    ...withSession(aliceToken),
    payload: { name: '马尼拉一批' },
  });
  regionId = region.json().id;
  code = region.json().inviteCode;

  await setRegistration(true);
});

function register(payload: Record<string, unknown>) {
  return ctx.app.inject({ method: 'POST', url: '/_api/register', payload });
}

function preview(value: string) {
  return ctx.app.inject({ method: 'GET', url: `/_api/register/preview?code=${value}` });
}

const GOOD = { password: 'a-good-password', shortName: 'maria-ph', account: 'maria.ph' };

test('用有效邀请码换得区域名，不需要登录', async () => {
  const res = await preview(code);
  expect(res.statusCode).toBe(200);
  expect(res.json()).toEqual({ regionName: '马尼拉一批' });
});

test('邀请码大小写不敏感', async () => {
  const res = await preview(code.toLowerCase());
  expect(res.statusCode).toBe(200);
});

test('无效码换不到区域名', async () => {
  expect((await preview('ZZZZZZZZ')).statusCode).toBe(404);
});

test('注册一次建出账号和它的第一个个人页', async () => {
  const res = await register({ ...GOOD, code });
  expect(res.statusCode).toBe(201);
  expect(res.json()).toEqual({ shortName: 'maria-ph' });

  const [account] = await ctx.db
    .select({ id: users.id, role: users.role, regionId: users.regionId })
    .from(users)
    .where(eq(users.account, 'maria.ph'));
  expect(account).toMatchObject({ role: 'user', regionId });

  const pages = await ctx.db
    .select({ shortName: profiles.shortName })
    .from(profiles)
    .where(eq(profiles.userId, account!.id));
  expect(pages).toEqual([{ shortName: 'maria-ph' }]);
});

test('注册不发会话，得自己再登一次', async () => {
  const res = await register({ ...GOOD, code });
  expect(res.cookies).toEqual([]);

  const { res: logged } = await login(ctx, 'maria.ph', 'a-good-password');
  expect(logged.statusCode).toBe(200);
});

test('注册进来的人落在码所属的区域，归属管理员随之推导出来', async () => {
  await register({ ...GOOD, code });

  const list = await ctx.app.inject({
    method: 'GET',
    url: '/_api/users',
    ...withSession(aliceToken),
  });
  const row = list.json().users.find((u: { account: string }) => u.account === 'maria.ph');
  expect(row).toMatchObject({ regionId, regionOwnerAdminId: aliceId });
});

test('账号重复、short_name 重复、撞墓碑各给一个可区分的原因', async () => {
  await register({ ...GOOD, code });

  const sameAccount = await register({ ...GOOD, code, shortName: 'another-name' });
  expect(sameAccount.statusCode).toBe(409);
  expect(sameAccount.json()).toMatchObject({ error: 'account_taken' });

  const sameShortName = await register({ ...GOOD, code, account: 'other.person' });
  expect(sameShortName.statusCode).toBe(409);
  expect(sameShortName.json()).toMatchObject({ error: 'short_name_taken' });

  // 墓碑走真实路径产生：建一个页面再删掉，地址就永不再分配
  const doomed = await ctx.app.inject({
    method: 'POST',
    url: '/_api/users',
    ...withSession(aliceToken),
    payload: {
      account: 'doomed.one',
      password: 'a-good-password',
      label: '待删',
      shortName: 'retired-one',
    },
  });
  expect(doomed.statusCode).toBe(201);
  const removed = await ctx.app.inject({
    method: 'DELETE',
    url: `/_api/users/${doomed.json().id}`,
    ...withSession(superToken),
  });
  expect(removed.statusCode).toBe(204);

  const retired = await register({
    ...GOOD,
    code,
    account: 'third.person',
    shortName: 'retired-one',
  });
  expect(retired.statusCode).toBe(409);
  expect(retired.json()).toMatchObject({ error: 'short_name_retired' });
});

test('密码太短被拒', async () => {
  const res = await register({ ...GOOD, code, password: 'short' });
  expect(res.statusCode).toBe(400);
});

test('无效码注册被拒', async () => {
  const res = await register({ ...GOOD, code: 'ZZZZZZZZ' });
  expect(res.statusCode).toBe(400);
  expect(res.json()).toMatchObject({ error: 'invite_code_invalid' });
});

test('区域没人管之后，它的码注册不了', async () => {
  await ctx.app.inject({
    method: 'DELETE',
    url: `/_api/admins/${aliceId}`,
    ...withSession(superToken),
  });

  expect((await preview(code)).statusCode).toBe(404);
  const res = await register({ ...GOOD, code });
  expect(res.statusCode).toBe(400);
});

test('总闸关掉后两个接口都拒，且不透露区域信息', async () => {
  await setRegistration(false);

  const previewed = await preview(code);
  expect(previewed.statusCode).toBe(403);
  expect(previewed.json()).toMatchObject({ error: 'registration_closed' });
  expect(JSON.stringify(previewed.json())).not.toContain('马尼拉');

  const res = await register({ ...GOOD, code });
  expect(res.statusCode).toBe(403);
  expect(res.json()).toMatchObject({ error: 'registration_closed' });
});

test('总闸关掉不影响已有用户登录', async () => {
  await register({ ...GOOD, code });
  await setRegistration(false);

  const { res } = await login(ctx, 'maria.ph', 'a-good-password');
  expect(res.statusCode).toBe(200);
});

test('注册总闸默认是关着的', async () => {
  await ctx.sql`truncate table settings cascade`;

  const res = await ctx.app.inject({
    method: 'GET',
    url: '/_api/settings',
    ...withSession(superToken),
  });
  expect(res.json().registrationEnabled).toBe(false);
});

test('只有超级管理员改得了总闸', async () => {
  const res = await ctx.app.inject({
    method: 'PATCH',
    url: '/_api/settings',
    ...withSession(aliceToken),
    payload: { registrationEnabled: false },
  });
  expect(res.statusCode).toBe(403);

  const [row] = await ctx.db
    .select({ registrationEnabled: settings.registrationEnabled })
    .from(settings);
  expect(row?.registrationEnabled).toBe(true);
});

test('注册进来的人跟随区域归属管理员的界面语言，不是写死的中文', async () => {
  // alice 的界面语言由她的创建者（超管）决定，这里显式改成菲律宾语
  await ctx.app.inject({
    method: 'PATCH',
    url: `/_api/users/${aliceId}`,
    ...withSession(superToken),
    payload: { uiLanguage: 'fil' },
  });

  await register({ ...GOOD, code });

  const [row] = await ctx.db
    .select({ uiLanguage: users.uiLanguage })
    .from(users)
    .where(eq(users.account, 'maria.ph'));
  expect(row?.uiLanguage).toBe('fil');
});

test('注册进来的账号立刻可用，不经审核', async () => {
  await register({ ...GOOD, code });
  const { token } = await login(ctx, 'maria.ph', 'a-good-password');

  const mine = await ctx.app.inject({ method: 'GET', url: '/_api/users', ...withSession(token) });
  expect(mine.statusCode).toBe(200);
  expect(mine.json().users).toHaveLength(1);

  // 公开页当场就渲染得出来
  const page = await ctx.app.inject({ method: 'GET', url: '/maria-ph' });
  expect(page.statusCode).toBe(200);
});

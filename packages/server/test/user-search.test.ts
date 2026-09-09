import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { createTestContext, type TestContext } from './helpers/context.js';
import { createLoginableUser } from './helpers/factories.js';
import { login, withSession } from './helpers/http.js';

let ctx: TestContext;
let superToken: string;
let adminToken: string;

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
  });

  await createLoginableUser(ctx.db, 'pass', {
    account: 'manila.joy',
    label: 'Joy · 马尼拉',
    shortName: 'joy-manila',
    displayName: 'Joy Ramirez',
    ownedBy: admin.id,
  });
  await createLoginableUser(ctx.db, 'pass', {
    account: 'davao.ken',
    label: 'Ken · 达沃',
    shortName: 'ken-davao',
    displayName: 'Ken Aquino',
    ownedBy: admin.id,
  });
  // 归属另一个管理员，用来验证搜索不会越过可见范围
  await createLoginableUser(ctx.db, 'pass', {
    account: 'other.one',
    label: '别人家的',
    shortName: 'other-one',
    displayName: 'Somebody Else',
  });

  superToken = (await login(ctx, 'super', 'super-pass')).token;
  adminToken = (await login(ctx, 'admin', 'admin-pass')).token;
});

const search = async (token: string, q: string) => {
  const res = await ctx.app.inject({
    method: 'GET',
    url: `/_api/users?q=${encodeURIComponent(q)}`,
    ...withSession(token),
  });
  expect(res.statusCode).toBe(200);
  return (res.json().users as { account: string }[]).map((u) => u.account).sort();
};

test('四个标识字段都搜得到', async () => {
  expect(await search(superToken, 'manila.joy')).toEqual(['manila.joy']);
  expect(await search(superToken, '达沃')).toEqual(['davao.ken']);
  expect(await search(superToken, 'joy-manila')).toEqual(['manila.joy']);
  expect(await search(superToken, 'Aquino')).toEqual(['davao.ken']);
});

test('大小写不敏感，并且匹配的是子串', async () => {
  expect(await search(superToken, 'MANILA')).toEqual(['manila.joy']);
  expect(await search(superToken, 'davao')).toEqual(['davao.ken']);
});

test('搜索叠在可见范围之上，管理员搜不到别人名下的用户', async () => {
  expect(await search(superToken, 'other')).toEqual(['other.one']);
  expect(await search(adminToken, 'other')).toEqual([]);
});

test('LIKE 的通配符按字面量处理', async () => {
  // 不转义的话 `%` 会把所有人都捞回来
  expect(await search(superToken, '%')).toEqual([]);
  expect(await search(superToken, '_')).toEqual([]);
});

test('空搜索词等于不筛选', async () => {
  expect(await search(superToken, '   ')).toEqual(['davao.ken', 'manila.joy', 'other.one']);
});

test('搜索不影响个人页计数', async () => {
  const res = await ctx.app.inject({
    method: 'GET',
    url: '/_api/users?q=manila',
    ...withSession(superToken),
  });
  expect(res.json().users[0].profileCount).toBe(1);
});

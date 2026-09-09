import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { createTestContext, type TestContext } from './helpers/context.js';
import { createLoginableUser } from './helpers/factories.js';
import { login, withSession } from './helpers/http.js';

let ctx: TestContext;
let superToken: string;
let adminToken: string;
let adminId: string;

beforeAll(async () => {
  ctx = await createTestContext();
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.sql`truncate table users cascade`;
  await ctx.sql`truncate table regions cascade`;

  await createLoginableUser(ctx.db, 'super-pass', { role: 'superadmin', account: 'super' });
  const admin = await createLoginableUser(ctx.db, 'admin-pass', {
    role: 'admin',
    account: 'admin',
  });
  adminId = admin.id;

  superToken = (await login(ctx, 'super', 'super-pass')).token;
  adminToken = (await login(ctx, 'admin', 'admin-pass')).token;
});

const bulk = async (token: string, text: string, body: Record<string, unknown> = {}) =>
  ctx.app.inject({
    method: 'POST',
    url: '/_api/regions/bulk',
    payload: { text, ...body },
    ...withSession(token),
  });

test('一行一个，全部建出来并各带一个邀请码', async () => {
  const res = await bulk(adminToken, ['马尼拉一组', '达沃三组', '宿务二批'].join('\n'));

  expect(res.statusCode).toBe(200);
  const body = res.json();
  expect(body.createdCount).toBe(3);
  expect(body.failedCount).toBe(0);
  expect(body.created.map((r: { name: string }) => r.name)).toEqual([
    '马尼拉一组',
    '达沃三组',
    '宿务二批',
  ]);
  expect(body.created.every((r: { inviteCode: string | null }) => r.inviteCode)).toBe(true);
});

test('空行跳过，行号仍是原始输入里的位置', async () => {
  const res = await bulk(adminToken, ['', '甲组', '   ', '乙组', ''].join('\n'));

  expect(res.json().created.map((r: { line: number }) => r.line)).toEqual([2, 4]);
});

test('批内重名单独报，与「已被占用」分开', async () => {
  await bulk(adminToken, '已有组');
  const res = await bulk(adminToken, ['甲组', '甲组', '已有组'].join('\n'));

  const body = res.json();
  expect(body.createdCount).toBe(1);
  expect(body.failed).toHaveLength(2);
  expect(body.failed[0]).toMatchObject({ line: 2 });
  expect(body.failed[0].error).not.toBe(body.failed[1].error);
});

test('不做整批回滚：失败行之前建好的留在库里', async () => {
  await bulk(adminToken, '占位组');
  await bulk(adminToken, ['先建的', '占位组', '后建的'].join('\n'));

  const res = await ctx.app.inject({
    method: 'GET',
    url: '/_api/regions',
    ...withSession(adminToken),
  });
  const names = res.json().regions.map((r: { name: string }) => r.name);
  expect(names).toContain('先建的');
  expect(names).toContain('后建的');
});

test('超长的名字被挡下，其余行照常', async () => {
  const res = await bulk(adminToken, ['正常组', 'x'.repeat(61)].join('\n'));

  const body = res.json();
  expect(body.createdCount).toBe(1);
  expect(body.failed[0]).toMatchObject({ line: 2 });
  expect(body.failed[0].error).toContain('60');
});

test('管理员建的一律归自己，请求里带别人的 id 也不作数', async () => {
  const res = await bulk(adminToken, '我的组', { ownerAdminId: null });

  expect(res.statusCode).toBe(200);
  const [row] = await ctx.sql`select owner_admin_id from regions where name = '我的组'`;
  expect(row!['owner_admin_id']).toBe(adminId);
});

test('超级管理员建得出无归属区域，那种区域不带码', async () => {
  const res = await bulk(superToken, '无人认领组', { ownerAdminId: null });

  expect(res.json().created[0].inviteCode).toBeNull();
});

test('归属必须是真管理员', async () => {
  const user = await createLoginableUser(ctx.db, 'pass', {
    account: 'plain',
    shortName: 'plain-user',
    ownedBy: adminId,
  });
  const res = await bulk(superToken, '张三组', { ownerAdminId: user.id });

  expect(res.statusCode).toBe(400);
  expect(res.json().error).toBe('not_an_admin');
});

test('普通用户建不了', async () => {
  await createLoginableUser(ctx.db, 'user-pass', {
    account: 'user',
    shortName: 'plain',
    ownedBy: adminId,
  });
  const userToken = (await login(ctx, 'user', 'user-pass')).token;

  expect((await bulk(userToken, '偷偷建的')).statusCode).toBe(403);
});

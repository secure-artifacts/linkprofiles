import { users } from '@link-profile/shared/schema';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { createTestContext, type TestContext } from './helpers/context.js';
import { createLoginableUser } from './helpers/factories.js';
import { login, withSession } from './helpers/http.js';

let ctx: TestContext;
let adminToken: string;
let adminId: string;
let userToken: string;

beforeAll(async () => {
  ctx = await createTestContext();
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.sql`truncate table users cascade`;

  const admin = await createLoginableUser(ctx.db, 'admin-pass', {
    role: 'admin',
    account: 'admin',
    shortName: null,
  });
  adminId = admin.id;
  await createLoginableUser(ctx.db, 'user-pass', {
    role: 'user',
    account: 'plain',
    shortName: 'plain-user',
    owningAdminId: admin.id,
  });

  adminToken = (await login(ctx, 'admin', 'admin-pass')).token;
  userToken = (await login(ctx, 'plain', 'user-pass')).token;
});

const row = (label: string, account: string, shortName: string, password: string) =>
  [label, account, shortName, password].join('\t');

function bulk(token: string, text: string) {
  return ctx.app.inject({
    method: 'POST',
    url: '/_api/users/bulk',
    ...withSession(token),
    payload: { text },
  });
}

test('一次粘贴多行建出多个账号', async () => {
  const res = await bulk(
    adminToken,
    [
      row('张三', 'zhangsan', 'zhangsan', 'pass-1234'),
      row('李四', 'lisi', 'lisi', 'pass-1234'),
      row('王五', 'wangwu', 'wangwu', 'pass-1234'),
    ].join('\n'),
  );

  expect(res.statusCode).toBe(200);
  expect(res.json()).toMatchObject({ createdCount: 3, failedCount: 0, failed: [] });

  const page = await ctx.app.inject({ method: 'GET', url: '/lisi' });
  expect(page.statusCode).toBe(200);
});

test('个别行出错不影响其余行，结果带行号与原因', async () => {
  await bulk(adminToken, row('已有', 'mimnz', 'mimnz', 'pass-1234'));

  const res = await bulk(
    adminToken,
    [
      row('张三', 'zhangsan', 'zhangsan', 'pass-1234'),
      row('抢注', 'mimnz', 'another', 'pass-1234'),
      row('太短', 'duanming', 'ab', 'pass-1234'),
      row('没密码', 'nopass', 'nopass', ''),
      '少了一列\tque-lie\tque-lie',
      row('王五', 'wangwu', 'wangwu', 'pass-1234'),
    ].join('\n'),
  );

  const body = res.json();
  expect(body.createdCount).toBe(2);
  expect(body.created.map((c: { line: number }) => c.line)).toEqual([1, 6]);

  expect(body.failed).toEqual([
    { line: 2, error: '账号 mimnz 已存在' },
    { line: 3, error: 'short_name 长度需在 3–30 位之间' },
    { line: 4, error: '密码为空' },
    { line: 5, error: '列数不对，应为四列：用户名称、账号、short_name、密码' },
  ]);
});

test('不做整批回滚：失败行之前建好的照常留在库里', async () => {
  await bulk(
    adminToken,
    [
      row('张三', 'zhangsan', 'zhangsan', 'pass-1234'),
      row('坏行', '', 'bad-row', 'pass-1234'),
    ].join('\n'),
  );

  const rows = await ctx.db.select().from(users).where(eq(users.account, 'zhangsan'));
  expect(rows).toHaveLength(1);
});

test('同一批里的重复也被挡住，先到先得', async () => {
  const res = await bulk(
    adminToken,
    [
      row('先到', 'samename', 'first-one', 'pass-1234'),
      row('后到', 'samename', 'second-one', 'pass-1234'),
      row('撞地址', 'other', 'first-one', 'pass-1234'),
    ].join('\n'),
  );

  const body = res.json();
  expect(body.createdCount).toBe(1);
  expect(body.failed).toEqual([
    { line: 2, error: '账号 samename 已存在' },
    { line: 3, error: 'short_name first-one 已被占用' },
  ]);
});

test('批量创建的用户归属于操作者', async () => {
  await bulk(adminToken, row('张三', 'zhangsan', 'zhangsan', 'pass-1234'));

  const [row0] = await ctx.db
    .select({ owningAdminId: users.owningAdminId })
    .from(users)
    .where(eq(users.account, 'zhangsan'));
  expect(row0?.owningAdminId).toBe(adminId);
});

test('密码以 argon2 哈希入库，不是明文', async () => {
  await bulk(adminToken, row('张三', 'zhangsan', 'zhangsan', 'pass-1234'));

  const [stored] = await ctx.db
    .select({ hash: users.passwordHash })
    .from(users)
    .where(eq(users.account, 'zhangsan'));
  expect(stored?.hash).toMatch(/^\$argon2/);
  expect(stored?.hash).not.toContain('pass-1234');

  // 并且真的能用这个密码登录
  const { res } = await login(ctx, 'zhangsan', 'pass-1234');
  expect(res.statusCode).toBe(200);
});

test('批量创建同样抢不到墓碑里的 short_name', async () => {
  // 先建一个再删掉，其 short_name 进墓碑
  await bulk(adminToken, row('原主人', 'former', 'taken-name', 'pass-1234'));
  const [victim] = await ctx.db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.account, 'former'));
  const removed = await ctx.app.inject({
    method: 'DELETE',
    url: `/_api/users/${victim!.id}`,
    ...withSession(adminToken),
  });
  expect(removed.statusCode).toBe(204);

  // 单个创建挡得住，批量创建也必须挡得住 —— 否则绕一下就能抢注旧地址
  const single = await ctx.app.inject({
    method: 'POST',
    url: '/_api/users',
    ...withSession(adminToken),
    payload: {
      account: 'squatter-single',
      password: 'a-good-password',
      shortName: 'taken-name',
    },
  });
  expect(single.statusCode).toBe(409);

  const res = await bulk(adminToken, row('抢注', 'squatter-bulk', 'taken-name', 'pass-1234'));

  expect(res.json().createdCount).toBe(0);
  expect(res.json().failed).toEqual([
    { line: 1, error: 'short_name taken-name 属于一个已删除的用户，永不再分配' },
  ]);
});

test('用户不能批量创建', async () => {
  const res = await bulk(userToken, row('张三', 'zhangsan', 'zhangsan', 'pass-1234'));

  expect(res.statusCode).toBe(403);
});

test('未登录不能批量创建', async () => {
  const res = await ctx.app.inject({
    method: 'POST',
    url: '/_api/users/bulk',
    payload: { text: row('张三', 'zhangsan', 'zhangsan', 'pass-1234') },
  });

  expect(res.statusCode).toBe(401);
});

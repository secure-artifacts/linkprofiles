import { afterAll, beforeAll, expect, test } from 'vitest';
import { DEBUG_QUERY_TOKEN } from '../src/debug/query.js';
import { createTestContext, type TestContext } from './helpers/context.js';
import { createUser } from './helpers/factories.js';

let ctx: TestContext;

beforeAll(async () => {
  ctx = await createTestContext();
  await createUser(ctx.db, { account: 'debug-user', shortName: 'debug-user' });
});

afterAll(async () => {
  await ctx.close();
});

function query(sql: string, extra: { limit?: number; token?: string | null } = {}) {
  const token = extra.token === undefined ? DEBUG_QUERY_TOKEN : extra.token;
  return ctx.app.inject({
    method: 'POST',
    url: '/_api/debug/query',
    headers: token === null ? {} : { 'x-debug-token': token },
    payload: { sql, ...(extra.limit === undefined ? {} : { limit: extra.limit }) },
  });
}

async function userCount(): Promise<number> {
  const [row] = await ctx.sql<{ c: number }[]>`select count(*)::int as c from users`;
  return row!.c;
}

test('缺少或写错令牌一律 401', async () => {
  expect((await query('select 1', { token: null })).statusCode).toBe(401);
  expect((await query('select 1', { token: 'wrong' })).statusCode).toBe(401);
});

test('令牌正确时返回列名与数据行', async () => {
  const res = await query('select account, 1 as n from users');

  expect(res.statusCode).toBe(200);
  expect(res.json()).toMatchObject({
    columns: ['account', 'n'],
    rows: [{ account: 'debug-user', n: 1 }],
    rowCount: 1,
    truncated: false,
  });
});

test('超过行数上限时截断并标记', async () => {
  const res = await query('select generate_series(1, 10) as n', { limit: 3 });

  expect(res.json()).toMatchObject({
    rows: [{ n: 1 }, { n: 2 }, { n: 3 }],
    rowCount: 3,
    truncated: true,
  });
});

test('没有结果行时仍然 200', async () => {
  const res = await query('select account from users where false');

  expect(res.statusCode).toBe(200);
  expect(res.json()).toMatchObject({ rows: [], rowCount: 0, truncated: false });
});

test.each([
  ['delete from users'],
  ['update users set account = account'],
  ["copy (select 1) to program 'true'"],
  ['set transaction read write'],
  ['/* x */ delete from users'],
])('非查询语句在执行前被拒：%s', async (sql) => {
  const res = await query(sql);

  expect(res.statusCode).toBe(400);
  expect(res.json()).toMatchObject({ error: 'query_rejected' });
  expect(await userCount()).toBe(1);
});

test.each([
  ["select pg_read_file('/etc/hostname')"],
  ['select "pg_catalog"."pg_advisory_lock"(1)'],
  ["select query_to_xml('select 1', true, false, '')"],
  ["select set_config('transaction_read_only', 'off', true)"],
  ['select pg_terminate_backend(pg_backend_pid())'],
])('有副作用或能执行任意 SQL 的函数被拒：%s', async (sql) => {
  const res = await query(sql);

  expect(res.statusCode).toBe(400);
  expect(res.json()).toMatchObject({ error: 'query_rejected' });
});

test('只读事务挡住藏在查询里的写操作', async () => {
  const res = await query('with d as (delete from users returning 1) select count(*) from d');

  expect(res.statusCode).toBe(400);
  expect(res.json()).toMatchObject({ error: 'query_failed', code: '25006' });
  expect(await userCount()).toBe(1);
});

test('一次只能执行一条语句', async () => {
  const res = await query('select 1; delete from users');

  expect(res.statusCode).toBe(400);
  expect(res.json()).toMatchObject({ error: 'query_failed', code: '42601' });
  expect(await userCount()).toBe(1);
});

test('语法错误把数据库的报错带回去', async () => {
  const res = await query('select from_nowhere from nothing');

  expect(res.statusCode).toBe(400);
  expect(res.json()).toMatchObject({ error: 'query_failed', code: '42P01' });
});

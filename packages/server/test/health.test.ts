import { afterAll, beforeAll, expect, test } from 'vitest';
import { createTestContext, type TestContext } from './helpers/context.js';

let ctx: TestContext;

beforeAll(async () => {
  ctx = await createTestContext();
});

afterAll(async () => {
  await ctx.close();
});

test('健康检查返回正常，并且数据库连接可用', async () => {
  const res = await ctx.app.inject({ method: 'GET', url: '/_api/health' });

  expect(res.statusCode).toBe(200);
  expect(res.json()).toEqual({ status: 'ok', database: 'ok' });
});

test('迁移已灌进本测试文件独立的 schema', async () => {
  const [row] = await ctx.sql<{ schema: string }[]>`select current_schema() as schema`;

  expect(row?.schema).toBe(ctx.schema);

  const tables = await ctx.sql<{ table_name: string }[]>`
    select table_name from information_schema.tables where table_schema = ${ctx.schema}
  `;
  expect(tables.map((t) => t.table_name)).toContain('users');
});

import { randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import postgres from 'postgres';
import { buildApp } from '../../src/app.js';
import { createDb, type Db } from '../../src/db/client.js';
import { applyMigrations } from '../../src/db/migrate.js';

export interface TestContext {
  app: FastifyInstance;
  db: Db;
  sql: postgres.Sql;
  schema: string;
  close(): Promise<void>;
}

function baseUrl(): string {
  return (
    process.env.TEST_DATABASE_URL ??
    process.env.DATABASE_URL ??
    'postgres://localhost:5432/link_profile_test'
  );
}

/**
 * 每个测试文件一个独立 schema：建 schema、灌迁移、把连接钉在上面，
 * 跑完 drop。真连数据库，不 mock ORM —— 否则测不出 SQL 层面的真错。
 */
export async function createTestContext(): Promise<TestContext> {
  const url = baseUrl();
  const schema = `test_${randomBytes(6).toString('hex')}`;

  const admin = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await admin.unsafe(`create schema "${schema}"`);
  } finally {
    await admin.end();
  }

  const { db, client } = createDb({ url, searchPath: schema, max: 5 });
  await applyMigrations(client);

  const app = await buildApp({ db, sql: client });
  await app.ready();

  return {
    app,
    db,
    sql: client,
    schema,
    async close() {
      await app.close();
      await client.end();
      const cleanup = postgres(url, { max: 1, onnotice: () => {} });
      try {
        await cleanup.unsafe(`drop schema "${schema}" cascade`);
      } finally {
        await cleanup.end();
      }
    },
  };
}

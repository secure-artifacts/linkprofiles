import { randomBytes, randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { applyMigrations } from '../src/db/migrate.js';

const UP_TO_0017 = '0017_account_name_changes.sql';
const UP_TO_0018 = '0018_ui_language.sql';

let sql: postgres.Sql;
let schema: string;

const userId = randomUUID();

beforeAll(async () => {
  const url =
    process.env['TEST_DATABASE_URL'] ??
    process.env['DATABASE_URL'] ??
    'postgres://localhost:5432/link_profile_test';
  schema = `mig_${randomBytes(6).toString('hex')}`;

  const admin = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await admin.unsafe(`create schema "${schema}"`);
  } finally {
    await admin.end();
  }

  sql = postgres(url, { max: 1, connection: { search_path: schema }, onnotice: () => {} });
  await applyMigrations(sql, undefined, { upTo: UP_TO_0017 });

  await sql`insert into users (id, role, account, password_hash, label)
            values (${userId}, 'user', 'legacy-account', 'x', '存量用户')`;

  await applyMigrations(sql, undefined, { upTo: UP_TO_0018 });
});

afterAll(async () => {
  await sql.unsafe(`drop schema "${schema}" cascade`);
  await sql.end();
});

test('存量账号回填成简体中文，升级当天界面逐字不变', async () => {
  const [row] = await sql`select ui_language from users where id = ${userId}`;
  expect(row?.['ui_language']).toBe('zh-Hans');
});

test('界面语言列非空', async () => {
  const [column] = await sql`
    select is_nullable
    from information_schema.columns
    where table_schema = ${schema} and table_name = 'users' and column_name = 'ui_language'
  `;
  expect(column?.['is_nullable']).toBe('NO');
});

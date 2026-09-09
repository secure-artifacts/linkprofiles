import { randomBytes, randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { applyMigrations } from '../src/db/migrate.js';

const UP_TO_0018 = '0018_ui_language.sql';
const UP_TO_0019 = '0019_page_language.sql';

let sql: postgres.Sql;
let schema: string;

const userId = randomUUID();
const profileId = randomUUID();

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
  await applyMigrations(sql, undefined, { upTo: UP_TO_0018 });

  await sql`insert into users (id, role, account, password_hash, label)
            values (${userId}, 'user', 'legacy-page', 'x', '存量用户')`;
  await sql`insert into profiles (id, user_id, short_name, display_name)
            values (${profileId}, ${userId}, 'legacy-page', '存量个人页')`;

  await applyMigrations(sql, undefined, { upTo: UP_TO_0019 });
});

afterAll(async () => {
  await sql.unsafe(`drop schema "${schema}" cascade`);
  await sql.end();
});

test('存量个人页回填成简体中文，升级当天公开页逐字不变', async () => {
  const [row] = await sql`select page_language from profiles where id = ${profileId}`;
  expect(row?.['page_language']).toBe('zh-Hans');
});

test('页面语言列非空', async () => {
  const [column] = await sql`
    select is_nullable
    from information_schema.columns
    where table_schema = ${schema} and table_name = 'profiles' and column_name = 'page_language'
  `;
  expect(column?.['is_nullable']).toBe('NO');
});

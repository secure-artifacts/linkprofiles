import { randomBytes, randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { applyMigrations } from '../src/db/migrate.js';

const UP_TO_0019 = '0019_page_language.sql';
const UP_TO_0021 = '0021_wet_nemesis.sql';

let sql: postgres.Sql;
let schema: string;

const ids = { admin: randomUUID(), owned: randomUUID(), orphan: randomUUID() };

function dbUrl(): string {
  return (
    process.env['TEST_DATABASE_URL'] ??
    process.env['DATABASE_URL'] ??
    'postgres://localhost:5432/link_profile_test'
  );
}

beforeAll(async () => {
  schema = `mig_${randomBytes(6).toString('hex')}`;

  const admin = postgres(dbUrl(), { max: 1, onnotice: () => {} });
  try {
    await admin.unsafe(`create schema "${schema}"`);
  } finally {
    await admin.end();
  }

  sql = postgres(dbUrl(), { max: 1, connection: { search_path: schema }, onnotice: () => {} });
  await applyMigrations(sql, undefined, { upTo: UP_TO_0019 });

  await sql`insert into users (id, role, account, password_hash, label)
            values (${ids.admin}, 'admin', 'alice', 'x', '运营一组')`;
  await sql`insert into users (id, role, account, password_hash, label, owning_admin_id)
            values (${ids.owned}, 'user', 'owned', 'x', '', ${ids.admin})`;
  await sql`insert into users (id, role, account, password_hash, label, owning_admin_id)
            values (${ids.orphan}, 'user', 'orphan', 'x', '', null)`;

  // 一路跑到删列那一版：检查约束能不能加上，取决于 0020 是否真的给每个用户
  // 都补齐了区域。存量数据里漏一行，这里就直接失败。
  await applyMigrations(sql, undefined, { upTo: UP_TO_0021 });
});

afterAll(async () => {
  await sql.end();
  const cleanup = postgres(dbUrl(), { max: 1, onnotice: () => {} });
  try {
    await cleanup.unsafe(`drop schema "${schema}" cascade`);
  } finally {
    await cleanup.end();
  }
});

test('归属管理员列被删除', async () => {
  const rows = await sql`
    select column_name from information_schema.columns
    where table_schema = current_schema() and table_name = 'users'
      and column_name = 'owning_admin_id'`;
  expect(rows.length).toBe(0);
});

test('搬迁过的数据满足检查约束，归属仍沿区域推导', async () => {
  const rows = await sql`
    select u.id, r.owner_admin_id
    from users u left join regions r on r.id = u.region_id
    where u.role = 'user' order by u.account`;
  expect(rows).toEqual([
    { id: ids.orphan, owner_admin_id: null },
    { id: ids.owned, owner_admin_id: ids.admin },
  ]);
});

test('检查约束挡住没有区域的用户', async () => {
  await expect(
    sql`insert into users (role, account, password_hash, label)
        values ('user', 'no-region', 'x', '')`,
  ).rejects.toThrow(/users_region_matches_role/);
});

test('检查约束挡住带区域的管理员', async () => {
  const [region] = await sql`select id from regions limit 1`;
  await expect(
    sql`insert into users (role, account, password_hash, label, region_id)
        values ('admin', 'admin-with-region', 'x', '', ${region!['id']})`,
  ).rejects.toThrow(/users_region_matches_role/);
});

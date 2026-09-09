import { randomBytes, randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { applyMigrations } from '../src/db/migrate.js';

const UP_TO_0019 = '0019_page_language.sql';
const UP_TO_0020 = '0020_yielding_ares.sql';
const UNASSIGNED = '00000000-0000-4000-8000-000000000001';

let sql: postgres.Sql;
let schema: string;

/**
 * alice 与 bob 是两个互不相干的运营小组的管理员，carol 与 alice 同名（用户名称
 * 相同、账号不同），用来验证默认区域重名时的追加序号。dup 的用户名称正好是
 * 「未分配」，用来验证它不会与迁移自带的那个区域撞名。
 */
const ids = {
  superadmin: randomUUID(),
  alice: randomUUID(),
  bob: randomUUID(),
  carol: randomUUID(),
  dup: randomUUID(),
  aliceUser: randomUUID(),
  bobUser: randomUUID(),
  carolUser: randomUUID(),
  orphanUser: randomUUID(),
  superUser: randomUUID(),
};

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
            values (${ids.superadmin}, 'superadmin', 'super', 'x', '超级管理员')`;
  await sql`insert into users (id, role, account, password_hash, label, created_at)
            values (${ids.alice}, 'admin', 'alice', 'x', '运营一组', '2024-01-01T00:00:00Z')`;
  await sql`insert into users (id, role, account, password_hash, label, created_at)
            values (${ids.bob}, 'admin', 'bob', 'x', '', '2024-01-02T00:00:00Z')`;
  await sql`insert into users (id, role, account, password_hash, label, created_at)
            values (${ids.carol}, 'admin', 'carol', 'x', '运营一组', '2024-01-03T00:00:00Z')`;
  await sql`insert into users (id, role, account, password_hash, label, created_at)
            values (${ids.dup}, 'admin', 'dup', 'x', '未分配', '2024-01-04T00:00:00Z')`;

  await sql`insert into users (id, role, account, password_hash, label, owning_admin_id)
            values (${ids.aliceUser}, 'user', 'alice-one', 'x', '', ${ids.alice})`;
  await sql`insert into users (id, role, account, password_hash, label, owning_admin_id)
            values (${ids.bobUser}, 'user', 'bob-one', 'x', '', ${ids.bob})`;
  await sql`insert into users (id, role, account, password_hash, label, owning_admin_id)
            values (${ids.carolUser}, 'user', 'carol-one', 'x', '', ${ids.carol})`;
  await sql`insert into users (id, role, account, password_hash, label, owning_admin_id)
            values (${ids.orphanUser}, 'user', 'orphan', 'x', '', null)`;
  await sql`insert into users (id, role, account, password_hash, label, owning_admin_id)
            values (${ids.superUser}, 'user', 'super-made', 'x', '', ${ids.superadmin})`;

  await applyMigrations(sql, undefined, { upTo: UP_TO_0020 });
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

async function regionOf(userId: string) {
  const [row] = await sql`
    select r.id, r.name, r.owner_admin_id, r.is_default
    from users u join regions r on r.id = u.region_id
    where u.id = ${userId}`;
  return row;
}

test('迁移自带一个无归属的「未分配」区域，主键固定', async () => {
  const [row] =
    await sql`select name, owner_admin_id, is_default from regions where id = ${UNASSIGNED}`;
  expect(row).toMatchObject({ name: '未分配', owner_admin_id: null, is_default: false });
});

test('每个管理员恰好得到一个默认区域，超级管理员没有', async () => {
  const rows = await sql`
    select owner_admin_id, count(*)::int as n
    from regions where is_default = true group by owner_admin_id`;
  const byAdmin = new Map(rows.map((r) => [r['owner_admin_id'], r['n']]));

  expect(byAdmin.get(ids.alice)).toBe(1);
  expect(byAdmin.get(ids.bob)).toBe(1);
  expect(byAdmin.get(ids.carol)).toBe(1);
  expect(byAdmin.get(ids.dup)).toBe(1);
  expect(byAdmin.has(ids.superadmin)).toBe(false);
});

test('默认区域的名字取用户名称，为空时退回账号', async () => {
  const [bobRegion] = await sql`select name from regions where owner_admin_id = ${ids.bob}`;
  expect(bobRegion?.['name']).toBe('bob');
});

test('默认区域重名时追加序号', async () => {
  const [aliceRegion] = await sql`select name from regions where owner_admin_id = ${ids.alice}`;
  const [carolRegion] = await sql`select name from regions where owner_admin_id = ${ids.carol}`;
  expect(aliceRegion?.['name']).toBe('运营一组');
  expect(carolRegion?.['name']).toBe('运营一组 2');
});

test('管理员的用户名称正好是「未分配」时也不与自带区域撞名', async () => {
  const [dupRegion] = await sql`select name from regions where owner_admin_id = ${ids.dup}`;
  expect(dupRegion?.['name']).toBe('未分配 2');
});

test('归属于某个管理员的用户落进该管理员的默认区域', async () => {
  expect(await regionOf(ids.aliceUser)).toMatchObject({
    owner_admin_id: ids.alice,
    is_default: true,
  });
  expect(await regionOf(ids.bobUser)).toMatchObject({ owner_admin_id: ids.bob, is_default: true });
  expect(await regionOf(ids.carolUser)).toMatchObject({
    owner_admin_id: ids.carol,
    is_default: true,
  });
});

test('原本无归属的用户落进「未分配」', async () => {
  expect(await regionOf(ids.orphanUser)).toMatchObject({ id: UNASSIGNED });
});

test('归属指向超级管理员的用户也落进「未分配」——超管不拥有区域', async () => {
  expect(await regionOf(ids.superUser)).toMatchObject({ id: UNASSIGNED });
});

test('每个用户都拿到了区域，管理员与超级管理员都没有', async () => {
  const rows =
    await sql`select role, count(*)::int as n from users where region_id is null group by role`;
  const byRole = new Map(rows.map((r) => [r['role'], r['n']]));
  expect(byRole.get('user')).toBeUndefined();
  expect(byRole.get('admin')).toBe(4);
  expect(byRole.get('superadmin')).toBe(1);
});

test('归属管理员列本张票不删，与新列并存', async () => {
  const [row] = await sql`
    select column_name from information_schema.columns
    where table_schema = current_schema() and table_name = 'users'
      and column_name = 'owning_admin_id'`;
  expect(row).toBeDefined();
});

/**
 * 这是本次迁移的验收标准：可见性是沿旧字段算还是沿新的区域链算，结果必须
 * 逐人一致。不一致就是越权或漏看。
 */
test('迁移前后逐人可见性一致', async () => {
  const rows = await sql`
    select u.id,
           u.owning_admin_id as before_admin,
           r.owner_admin_id as after_admin
    from users u left join regions r on r.id = u.region_id
    where u.role = 'user'`;

  for (const row of rows) {
    // 归属指向超级管理员的那个，迁移前只有超管看得见（管理员看不到别人的）；
    // 迁移后落进无归属区域，仍然只有超管看得见。两边等价。
    const before = row['before_admin'] === ids.superadmin ? null : row['before_admin'];
    expect(row['after_admin']).toBe(before);
  }
  expect(rows.length).toBe(5);
});

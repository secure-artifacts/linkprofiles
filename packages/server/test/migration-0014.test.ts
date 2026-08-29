import { randomBytes, randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { applyMigrations } from '../src/db/migrate.js';

const UP_TO_0013 = '0013_familiar_tenebrous.sql';
const UP_TO_0014 = '0014_ambiguous_gateway.sql';

let sql: postgres.Sql;
let schema: string;

const ids = {
  user: randomUUID(),
  cutoutProfile: randomUUID(),
  bannerProfile: randomUUID(),
  avatarMedia: randomUUID(),
};

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
  await applyMigrations(sql, undefined, { upTo: UP_TO_0013 });

  await sql`insert into users (id, role, account, password_hash, label)
            values (${ids.user}, 'user', 'layout-migration', 'x', '迁移测试')`;
  await sql`insert into profiles (id, user_id, short_name, display_name, layout)
            values (${ids.cutoutProfile}, ${ids.user}, 'old-cutout', '旧 Cutout', 'cutout')`;
  await sql`insert into profiles (id, user_id, short_name, display_name, layout, avatar_media_id)
            values (${ids.bannerProfile}, ${ids.user}, 'old-banner', '旧 Banner', 'banner', ${ids.avatarMedia})`;

  await applyMigrations(sql, undefined, { upTo: UP_TO_0014 });
});

afterAll(async () => {
  await sql.end();
  const url =
    process.env['TEST_DATABASE_URL'] ??
    process.env['DATABASE_URL'] ??
    'postgres://localhost:5432/link_profile_test';
  const cleanup = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await cleanup.unsafe(`drop schema "${schema}" cascade`);
  } finally {
    await cleanup.end();
  }
});

test('下线 Cutout 时把旧页面平稳迁到 Classic', async () => {
  const [row] = await sql`select layout from profiles where id = ${ids.cutoutProfile}`;
  expect(row?.['layout']).toBe('classic');

  const enumRows = await sql`
    select enumlabel
    from pg_enum
    join pg_type on pg_type.oid = pg_enum.enumtypid
    join pg_namespace on pg_namespace.oid = pg_type.typnamespace
    where pg_type.typname = 'layout' and pg_namespace.nspname = current_schema()
    order by enumsortorder`;
  expect(enumRows.map((item) => item['enumlabel'])).toEqual([
    'classic',
    'hero',
    'banner',
    'shape',
  ]);
});

test('旧 Banner 页面把原头像引用复制到独立 Banner 图槽', async () => {
  const [row] = await sql`
    select avatar_media_id, banner_media_id
    from profiles
    where id = ${ids.bannerProfile}`;
  expect(row).toMatchObject({
    avatar_media_id: ids.avatarMedia,
    banner_media_id: ids.avatarMedia,
  });
});

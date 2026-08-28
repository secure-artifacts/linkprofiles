import { randomBytes, randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { applyMigrations } from '../src/db/migrate.js';

/**
 * 0010（social_icons 并入 buttons）在**有存量数据**时的行为。
 *
 * 常规测试都是从空 schema 一次跑完全部迁移，那条迁移里的自校验因此永远是
 * 0 行对 0 行的空跑 —— 测不出任何搬运错误。这里先跑到 0009、灌一批旧形状的
 * 数据、再跑 0010，才真正覆盖到「存量被正确搬过来」这件事。
 *
 * 尤其是**历史点击不能断链**：`clicks.target_id` 没有外键，一旦搬运时换了
 * 主键，那些点击会静默变成孤儿，逐条点击率归零且无从恢复。
 */

const UP_TO_0009 = '0009_short_name_change_log.sql';
/*
 * 本文件测的是 0010 这一步本身，因此**停在 0010**，不把后续迁移跑完。
 *
 * 不停的话，0012 会把 `buttons.solid_background` 删掉（那个视觉开关提到了
 * 页面级），下面那条断言就查不到列了。而 0010 当时确实按 `is_lead` 回填过
 * 它 —— 这是那一刻的事实，后来这列被移走不代表当时搬错了，断言该留着。
 */
const UP_TO_0010 = '0010_merge_social_icons_into_buttons.sql';

let sql: postgres.Sql;
let schema: string;

const ids = {
  user: randomUUID(),
  profile: randomUUID(),
  button: randomUUID(),
  social: randomUUID(),
  clickOnButton: randomUUID(),
  clickOnSocial: randomUUID(),
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

  // 先跑到合并之前那一版
  await applyMigrations(sql, undefined, { upTo: UP_TO_0009 });

  // 灌一批旧形状的数据：两张表各一行，外加两条分别指向它们的点击
  await sql`insert into users (id, role, account, password_hash, label)
            values (${ids.user}, 'user', 'mig-user', 'x', '迁移测试')`;
  await sql`insert into profiles (id, user_id, short_name, display_name)
            values (${ids.profile}, ${ids.user}, 'mig-page', '迁移测试页')`;
  await sql`insert into buttons (id, profile_id, title, subtitle, url, position, is_lead, pass_source)
            values (${ids.button}, ${ids.profile}, '老按钮', '副标题', 'https://example.com', 0, true, false)`;
  await sql`insert into social_icons (id, profile_id, platform, value, position, is_lead, pass_source)
            values (${ids.social}, ${ids.profile}, 'whatsapp', '15550109999', 0, true, true)`;
  await sql`insert into clicks (id, profile_id, target_kind, target_id, is_lead, occurred_at)
            values (${ids.clickOnButton}, ${ids.profile}, 'button', ${ids.button}, true, now())`;
  await sql`insert into clicks (id, profile_id, target_kind, target_id, is_lead, occurred_at)
            values (${ids.clickOnSocial}, ${ids.profile}, 'social', ${ids.social}, true, now())`;

  // 再跑到 0010 为止
  await applyMigrations(sql, undefined, { upTo: UP_TO_0010 });
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

test('社媒行原样搬进 buttons，主键一个字节都不变', async () => {
  const rows = await sql`select * from buttons where id = ${ids.social}`;
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    kind: 'social',
    platform: 'whatsapp',
    value: '15550109999',
    url: null,
    is_lead: true,
    pass_source: true,
  });
});

test('搬过来的社媒行标题回填成平台名，不是空的', async () => {
  const [row] = await sql`select title from buttons where id = ${ids.social}`;
  expect(row?.['title']).toBe('WhatsApp');
});

test('历史点击一条不断链，仍然 join 得上合并后的行', async () => {
  const rows = await sql`
    select c.id, b.kind
    from clicks c join buttons b on b.id = c.target_id
    where c.id in (${ids.clickOnButton}, ${ids.clickOnSocial})
    order by b.kind`;

  expect(rows).toHaveLength(2);
  expect(rows.map((r) => r['kind'])).toEqual(['link', 'social']);

  const orphans = await sql`
    select count(*)::int as n from clicks c
    where not exists (select 1 from buttons b where b.id = c.target_id)`;
  expect(orphans[0]?.['n']).toBe(0);
});

test('原有按钮打上 link 标记，url 与副标题原样保留', async () => {
  const [row] = await sql`select * from buttons where id = ${ids.button}`;
  expect(row).toMatchObject({
    kind: 'link',
    url: 'https://example.com',
    subtitle: '副标题',
    platform: null,
    value: null,
  });
});

test('视觉开关按 is_lead 回填，迁移当天页面不跳变', async () => {
  const rows = await sql`
    select id, is_lead, solid_background from buttons where profile_id = ${ids.profile}`;
  expect(rows).toHaveLength(2);
  for (const row of rows) {
    expect(row['solid_background']).toBe(row['is_lead']);
  }
});

test('position 重排后连续无洞，社媒排在链接之前', async () => {
  const rows = await sql`
    select kind, position from buttons where profile_id = ${ids.profile} order by position`;
  expect(rows.map((r) => r['position'])).toEqual([0, 1]);
  expect(rows.map((r) => r['kind'])).toEqual(['social', 'link']);
});

test('形状约束真的拦得住畸形行', async () => {
  // link 不该带 platform/value
  await expect(
    sql`insert into buttons (id, profile_id, kind, title, url, platform, value, position)
        values (${randomUUID()}, ${ids.profile}, 'link', '畸形', 'https://a.example', 'whatsapp', '1', 9)`,
  ).rejects.toThrow();

  // social 不该带 url
  await expect(
    sql`insert into buttons (id, profile_id, kind, title, url, platform, value, position)
        values (${randomUUID()}, ${ids.profile}, 'social', '畸形', 'https://a.example', 'whatsapp', '1', 9)`,
  ).rejects.toThrow();
});

test('旧表已经不在了', async () => {
  const rows = await sql`
    select count(*)::int as n from information_schema.tables
    where table_schema = ${schema} and table_name = 'social_icons'`;
  expect(rows[0]?.['n']).toBe(0);
});

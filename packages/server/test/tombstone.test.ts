import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { media, pageViews, shortNameTombstones } from '@link-profile/shared/schema';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { createTestContext, type TestContext } from './helpers/context.js';
import { createLoginableUser } from './helpers/factories.js';
import { login, withSession } from './helpers/http.js';
import { makePng, multipart } from './helpers/media-fixtures.js';

let ctx: TestContext;
let adminToken: string;
let adminId: string;
let uploads: string;

const BROWSER_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

beforeAll(async () => {
  uploads = await mkdtemp(path.join(tmpdir(), 'lp-tomb-'));
  process.env.UPLOADS_DIR = uploads;
  ctx = await createTestContext();
});

afterAll(async () => {
  await ctx.close();
  await rm(uploads, { recursive: true, force: true });
  delete process.env.UPLOADS_DIR;
});

beforeEach(async () => {
  await ctx.sql`truncate table users cascade`;
  await ctx.sql`truncate table page_views, clicks, short_name_tombstones`;

  const admin = await createLoginableUser(ctx.db, 'admin-pass', {
    role: 'admin',
    account: 'admin',
  });
  adminId = admin.id;
  adminToken = (await login(ctx, 'admin', 'admin-pass')).token;
});

async function createUser(shortName: string) {
  const res = await ctx.app.inject({
    method: 'POST',
    url: '/_api/users',
    ...withSession(adminToken),
    payload: { account: shortName, password: 'a-good-password', label: shortName, shortName },
  });
  return res;
}

const removeUser = (id: string) =>
  ctx.app.inject({ method: 'DELETE', url: `/_api/users/${id}`, ...withSession(adminToken) });

const visit = (shortName: string) =>
  ctx.app.inject({ method: 'GET', url: `/${shortName}`, headers: { 'user-agent': BROWSER_UA } });

test('删除用户后 short_name 迁入墓碑', async () => {
  const created = await createUser('mimnz');
  await removeUser(created.json().id);

  const rows = await ctx.db.select().from(shortNameTombstones);
  expect(rows.map((r) => r.shortName)).toEqual(['mimnz']);
  expect(rows[0]?.formerProfileId).toBe(created.json().firstProfile.id);
});

test('访问墓碑中的 short_name 返回 404，而不是另一个陌生人的页面', async () => {
  const created = await createUser('mimnz');
  expect((await visit('mimnz')).statusCode).toBe(200);

  await removeUser(created.json().id);

  const res = await visit('mimnz');
  expect(res.statusCode).toBe(404);
  expect(res.body).toContain('页面不存在');
});

test('新建用户抢不到墓碑里的 short_name', async () => {
  const created = await createUser('mimnz');
  await removeUser(created.json().id);

  const squatter = await createUser('mimnz');
  expect(squatter.statusCode).toBe(409);
  expect(squatter.json()).toEqual({ error: 'short_name_retired' });
});

test('改名也抢不到墓碑里的 short_name', async () => {
  const gone = await createUser('mimnz');
  await removeUser(gone.json().id);
  const other = await createUser('someone-else');

  const res = await ctx.app.inject({
    method: 'PATCH',
    url: `/_api/profiles/${other.json().firstProfile.id}/short-name`,
    ...withSession(adminToken),
    payload: { shortName: 'mimnz' },
  });

  expect(res.statusCode).toBe(409);
  expect(res.json()).toEqual({ error: 'short_name_retired' });
});

test('大小写不同也抢不到：墓碑按小写比较', async () => {
  const created = await createUser('mimnz');
  await removeUser(created.json().id);

  const squatter = await createUser('MimNZ');
  expect(squatter.statusCode).toBe(409);
});

test('short_name 永不释放：删两次也只有一条墓碑，地址一直是 404', async () => {
  const first = await createUser('mimnz');
  await removeUser(first.json().id);

  // 另建一个别的地址的用户再删，不影响原墓碑
  const second = await createUser('another-one');
  await removeUser(second.json().id);

  expect(await ctx.db.select().from(shortNameTombstones)).toHaveLength(2);
  expect((await visit('mimnz')).statusCode).toBe(404);
});

test('删除用户时其上传的媒体文件从磁盘移除，不留孤儿', async () => {
  const created = await createUser('mimnz');
  const userId = created.json().id as string;
  const profileId = created.json().firstProfile.id as string;

  const { payload, headers } = multipart(
    { slot: 'avatar' },
    { file: { filename: 'a.png', contentType: 'image/png', data: await makePng() } },
  );
  const uploaded = await ctx.app.inject({
    method: 'POST',
    url: `/_api/profiles/${profileId}/media`,
    ...withSession(adminToken),
    headers,
    payload,
  });
  expect(uploaded.statusCode).toBe(201);

  const [row] = await ctx.db.select().from(media);
  const directory = path.join(uploads, row!.directory);
  expect(existsSync(directory)).toBe(true);

  await removeUser(userId);

  expect(existsSync(directory)).toBe(false);
  expect(await ctx.db.select().from(media)).toHaveLength(0);
});

test('删除用户时其埋点数据保留，历史汇总不断档', async () => {
  const created = await createUser('mimnz');
  const userId = created.json().id as string;
  const profileId = created.json().firstProfile.id as string;

  await visit('mimnz');
  await visit('mimnz');
  expect(await ctx.db.select().from(pageViews)).toHaveLength(2);

  await removeUser(userId);

  const rows = await ctx.db.select().from(pageViews);
  expect(rows).toHaveLength(2);
  expect(rows.every((r) => r.profileId === profileId)).toBe(true);
});

test('删除管理员不产生墓碑：管理员没有 short_name', async () => {
  const superadmin = await createLoginableUser(ctx.db, 'super-pass', {
    role: 'superadmin',
    account: 'super',
  });
  expect(superadmin.role).toBe('superadmin');
  const superToken = (await login(ctx, 'super', 'super-pass')).token;

  await ctx.app.inject({
    method: 'DELETE',
    url: `/_api/admins/${adminId}`,
    ...withSession(superToken),
  });

  expect(await ctx.db.select().from(shortNameTombstones)).toHaveLength(0);
});

import { profiles } from '@link-profile/shared/schema';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { createTestContext, type TestContext } from './helpers/context.js';
import { createLoginableUser } from './helpers/factories.js';
import { login, withSession } from './helpers/http.js';

/**
 * 改地址的流水。
 *
 * 改地址的后果外溢到系统之外（名片、二维码、投放素材上印着旧地址），所以每次
 * 改动都要留一条能照着回退的记录。
 */

let ctx: TestContext;
let adminToken: string;
let userToken: string;
let userId: string;
let profileId: string;

beforeAll(async () => {
  ctx = await createTestContext();
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.sql`truncate table users cascade`;
  await ctx.sql`truncate table short_name_tombstones`;

  const admin = await createLoginableUser(ctx.db, 'admin-pass', {
    role: 'superadmin',
    account: 'admin',
  });
  adminToken = (await login(ctx, 'admin', 'admin-pass')).token;

  const user = await createLoginableUser(ctx.db, 'user-pass', {
    account: 'lena',
    shortName: 'lena',
    owningAdminId: admin.id,
  });
  userId = user.id;
  profileId = user.profileId!;
  userToken = (await login(ctx, 'lena', 'user-pass')).token;
});

const rename = (token: string, shortName: string) =>
  ctx.app.inject({
    method: 'PATCH',
    url: `/_api/profiles/${profileId}/short-name`,
    ...withSession(token),
    payload: { shortName },
  });

const history = (token: string) =>
  ctx.app.inject({
    method: 'GET',
    url: `/_api/profiles/${profileId}/short-name-history`,
    ...withSession(token),
  });

test('改一次地址就留一条流水，记着改前改后与改动人', async () => {
  expect((await rename(userToken, 'lena-studio')).statusCode).toBe(200);

  const rows = (await history(userToken)).json().changes;
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    fromShortName: 'lena',
    toShortName: 'lena-studio',
    changedByLabel: expect.any(String),
  });
});

test('流水按时间倒序，最近一次在最前', async () => {
  await rename(userToken, 'step-one');
  await rename(userToken, 'step-two');
  await rename(adminToken, 'step-three');

  const rows = (await history(userToken)).json().changes;
  expect(rows.map((r: { toShortName: string }) => r.toShortName)).toEqual([
    'step-three',
    'step-two',
    'step-one',
  ]);
  expect(rows.map((r: { fromShortName: string }) => r.fromShortName)).toEqual([
    'step-two',
    'step-one',
    'lena',
  ]);
});

test('照着流水能把地址改回去', async () => {
  await rename(userToken, 'oops-typo');

  const [previous] = (await history(userToken)).json().changes;
  expect(previous.fromShortName).toBe('lena');

  // 回退没有单独的接口，就是拿旧地址再改一次 —— 冲突与墓碑检查都在那条路径上
  expect((await rename(userToken, previous.fromShortName)).statusCode).toBe(200);

  const [row] = await ctx.db
    .select({ shortName: profiles.shortName })
    .from(profiles)
    .where(eq(profiles.id, profileId));
  expect(row?.shortName).toBe('lena');

  // 回退本身也是一次改动，同样留痕
  expect((await history(userToken)).json().changes).toHaveLength(2);
});

test('改成原来那个不留流水', async () => {
  expect((await rename(userToken, 'lena')).statusCode).toBe(200);
  expect((await history(userToken)).json().changes).toHaveLength(0);
});

test('被墓碑占住的旧地址回退不回去，且不留流水', async () => {
  // 另建一个页面再删掉，它的地址进墓碑
  const created = await ctx.app.inject({
    method: 'POST',
    url: `/_api/users/${userId}/profiles`,
    ...withSession(adminToken),
    payload: { shortName: 'retired-one' },
  });
  expect(created.statusCode).toBe(201);
  await ctx.app.inject({
    method: 'DELETE',
    url: `/_api/profiles/${created.json().id}`,
    ...withSession(adminToken),
  });

  const blocked = await rename(userToken, 'retired-one');
  expect(blocked.statusCode).toBe(409);
  expect(blocked.json()).toEqual({ error: 'short_name_retired' });
  expect((await history(userToken)).json().changes).toHaveLength(0);
});

test('冲突的改名不留流水，地址也没动', async () => {
  const other = await createLoginableUser(ctx.db, 'other-pass', {
    account: 'other',
    shortName: 'taken-name',
  });
  expect(other.shortName).toBe('taken-name');

  expect((await rename(userToken, 'taken-name')).statusCode).toBe(409);
  expect((await history(userToken)).json().changes).toHaveLength(0);

  const [row] = await ctx.db
    .select({ shortName: profiles.shortName })
    .from(profiles)
    .where(eq(profiles.id, profileId));
  expect(row?.shortName).toBe('lena');
});

test('看不见的页面，流水也读不到', async () => {
  const stranger = await createLoginableUser(ctx.db, 'stranger-pass', {
    account: 'stranger',
    shortName: 'stranger',
  });
  expect(stranger.profileId).toBeTruthy();
  const strangerToken = (await login(ctx, 'stranger', 'stranger-pass')).token;

  const res = await history(strangerToken);
  expect(res.statusCode).toBe(403);
});

test('删掉页面，它的流水一并消失，不留孤儿', async () => {
  await rename(userToken, 'lena-studio');
  expect((await history(userToken)).json().changes).toHaveLength(1);

  await ctx.app.inject({
    method: 'DELETE',
    url: `/_api/profiles/${profileId}`,
    ...withSession(adminToken),
  });

  const rows = await ctx.sql`select count(*)::int as n from short_name_changes`;
  expect(rows[0]?.n).toBe(0);
});

import { clicks, pageViews } from '@link-profile/shared/schema';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import type { GeoLookup, GeoResult, GeoStatus } from '../src/tracking/geo.js';
import { createTestContext, type TestContext } from './helpers/context.js';
import { createLoginableUser } from './helpers/factories.js';
import { login, withSession } from './helpers/http.js';

const KNOWN: Record<string, GeoResult> = {
  '203.0.113.0': { country: 'US', city: 'Boston' },
  '198.51.100.0': { country: 'AU', city: null },
  '2001:db8:85a3::': { country: 'JP', city: 'Tokyo' },
};

function fakeGeo(status: GeoStatus): GeoLookup {
  const lookup: GeoLookup = async (ip) => KNOWN[ip ?? ''] ?? { country: null, city: null };
  lookup.status = async () => status;
  return lookup;
}

let ctx: TestContext;
let superToken: string;
let adminToken: string;
let profileId: string;

beforeAll(async () => {
  ctx = await createTestContext({
    geo: fakeGeo({ state: 'loaded', path: '/x', type: 't', builtAt: '2026-09-01T00:00:00.000Z' }),
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.sql`truncate table users, page_views, clicks cascade`;
  await createLoginableUser(ctx.db, 'super-pass', { role: 'superadmin', account: 'super' });
  await createLoginableUser(ctx.db, 'admin-pass', { role: 'admin', account: 'boss' });
  const owner = await createLoginableUser(ctx.db, 'user-pass', {
    account: 'owner',
    shortName: 'owner',
  });
  profileId = owner.profileId!;
  superToken = (await login(ctx, 'super', 'super-pass')).token;
  adminToken = (await login(ctx, 'boss', 'admin-pass')).token;
});

async function seedVisits(rows: Array<{ ip: string | null; country?: string; city?: string }>) {
  await ctx.db.insert(pageViews).values(
    rows.map((row) => ({
      profileId,
      ipTruncated: row.ip,
      country: row.country ?? null,
      city: row.city ?? null,
    })),
  );
}

async function seedClicks(ips: string[]) {
  await ctx.db.insert(clicks).values(
    ips.map((ip) => ({
      profileId,
      targetKind: 'button' as const,
      targetId: randomUUID(),
      isLead: false,
      ipTruncated: ip,
    })),
  );
}

function backfill(token: string, body: Record<string, unknown> = {}) {
  return ctx.app.inject({
    method: 'POST',
    url: '/_api/geo/backfill',
    ...withSession(token),
    payload: body,
  });
}

test('状态接口给出地域库状态与能补识别的记录数', async () => {
  await seedVisits([{ ip: '203.0.113.0' }, { ip: null }, { ip: '203.0.113.0', country: 'US' }]);
  await seedClicks(['198.51.100.0']);

  const res = await ctx.app.inject({ method: 'GET', url: '/_api/geo', ...withSession(superToken) });

  expect(res.statusCode).toBe(200);
  expect(res.json()).toEqual({
    library: { state: 'loaded', path: '/x', type: 't', builtAt: '2026-09-01T00:00:00.000Z' },
    unresolved: { pageViews: 1, clicks: 1 },
  });
});

test('只有超级管理员能看状态和补识别', async () => {
  expect((await ctx.app.inject({ method: 'GET', url: '/_api/geo' })).statusCode).toBe(401);
  expect(
    (await ctx.app.inject({ method: 'GET', url: '/_api/geo', ...withSession(adminToken) }))
      .statusCode,
  ).toBe(403);
  expect((await backfill(adminToken)).statusCode).toBe(403);
});

test('按 IP 分批补上国家与城市，查不出的与已有国家的原样不动', async () => {
  await seedVisits([
    { ip: '203.0.113.0' },
    { ip: '203.0.113.0' },
    { ip: '2001:db8:85a3::' },
    { ip: '10.0.0.0' },
    { ip: null },
    { ip: '198.51.100.0', country: 'NZ', city: 'Auckland' },
  ]);
  await seedClicks(['198.51.100.0', '203.0.113.0', '10.0.0.0']);

  const totals = { scanned: 0, resolved: 0, pageViews: 0, clicks: 0 };
  let after: string | null = null;
  let rounds = 0;
  do {
    const res = await backfill(superToken, { limit: 2, ...(after ? { after } : {}) });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    for (const key of Object.keys(totals) as Array<keyof typeof totals>) totals[key] += body[key];
    after = body.next;
    rounds += 1;
  } while (after !== null && rounds < 10);

  expect(rounds).toBe(2);
  expect(totals).toEqual({ scanned: 4, resolved: 3, pageViews: 3, clicks: 2 });

  const views = await ctx.sql<{ ip: string | null; country: string | null; city: string | null }[]>`
    select ip_truncated as ip, country, city from page_views order by ip_truncated, country
  `;
  expect(views).toEqual([
    { ip: '10.0.0.0', country: null, city: null },
    { ip: '198.51.100.0', country: 'NZ', city: 'Auckland' },
    { ip: '2001:db8:85a3::', country: 'JP', city: 'Tokyo' },
    { ip: '203.0.113.0', country: 'US', city: 'Boston' },
    { ip: '203.0.113.0', country: 'US', city: 'Boston' },
    { ip: null, country: null, city: null },
  ]);

  const clickRows = await ctx.sql<{ ip: string; country: string | null }[]>`
    select ip_truncated as ip, country from clicks order by ip_truncated
  `;
  expect(clickRows).toEqual([
    { ip: '10.0.0.0', country: null },
    { ip: '198.51.100.0', country: 'AU' },
    { ip: '203.0.113.0', country: 'US' },
  ]);

  const status = await ctx.app.inject({
    method: 'GET',
    url: '/_api/geo',
    ...withSession(superToken),
  });
  expect(status.json().unresolved).toEqual({ pageViews: 1, clicks: 1 });
});

test('地域库不可用时拒绝补识别，不动任何记录', async () => {
  const offline = await createTestContext({ geo: fakeGeo({ state: 'unconfigured' }) });
  try {
    await createLoginableUser(offline.db, 'super-pass', { role: 'superadmin', account: 'super' });
    const token = (await login(offline, 'super', 'super-pass')).token;

    const res = await offline.app.inject({
      method: 'POST',
      url: '/_api/geo/backfill',
      ...withSession(token),
      payload: {},
    });

    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ error: 'geo_unavailable' });
  } finally {
    await offline.close();
  }
});

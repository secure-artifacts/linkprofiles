import { clicks, dailySummaries, pageViews } from '@link-profile/shared/schema';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { aggregateAndPrune } from '../src/analytics/retention.js';
import { createTestContext, type TestContext } from './helpers/context.js';
import { createUser } from './helpers/factories.js';

let ctx: TestContext;
let profileId: string;
let userAccountId: string;

beforeAll(async () => {
  ctx = await createTestContext();
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.sql`truncate table users cascade`;
  await ctx.sql`truncate table page_views, clicks, daily_summaries`;
  const user = await createUser(ctx.db, { shortName: 'mimnz' });
  profileId = user.profileId!;
  userAccountId = user.id;
});

const daysAgo = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000);

async function seedPageView(when: Date, overrides: Record<string, unknown> = {}) {
  await ctx.db.insert(pageViews).values({
    profileId,
    occurredAt: when,
    country: 'US',
    city: 'Austin',
    deviceType: 'mobile',
    os: 'iOS',
    source: 'tiktok',
    ...overrides,
  });
}

async function seedClick(when: Date, isLead: boolean, overrides: Record<string, unknown> = {}) {
  await ctx.db.insert(clicks).values({
    profileId,
    occurredAt: when,
    targetKind: 'button',
    targetId: '00000000-0000-4000-8000-000000000001',
    isLead,
    country: 'US',
    city: 'Austin',
    deviceType: 'mobile',
    os: 'iOS',
    source: 'tiktok',
    ...overrides,
  });
}

test('超过保留期的明细被聚合进日汇总后删除', async () => {
  const old = daysAgo(200);
  await seedPageView(old);
  await seedPageView(old);
  await seedClick(old, true);
  await seedClick(old, false);

  const result = await aggregateAndPrune(ctx.sql);

  expect(result.deletedPageViews).toBe(2);
  expect(result.deletedClicks).toBe(2);
  expect(await ctx.db.select().from(pageViews)).toHaveLength(0);
  expect(await ctx.db.select().from(clicks)).toHaveLength(0);

  const [summary] = await ctx.db.select().from(dailySummaries);
  expect(summary).toMatchObject({
    profileId,
    country: 'US',
    city: 'Austin',
    deviceType: 'mobile',
    os: 'iOS',
    source: 'tiktok',
    pageViews: 2,
    clicks: 2,
    leads: 1,
  });
});

test('保留期内的明细一条不动', async () => {
  await seedPageView(daysAgo(10));
  await seedClick(daysAgo(10), true);

  await aggregateAndPrune(ctx.sql);

  expect(await ctx.db.select().from(pageViews)).toHaveLength(1);
  expect(await ctx.db.select().from(clicks)).toHaveLength(1);
  expect(await ctx.db.select().from(dailySummaries)).toHaveLength(0);
});

test('日汇总按维度拆分，不同维度取值各成一行', async () => {
  const old = daysAgo(200);
  await seedPageView(old, { country: 'US', source: 'tiktok' });
  await seedPageView(old, { country: 'CA', source: 'tiktok' });
  await seedPageView(old, { country: 'US', source: 'instagram' });
  await seedPageView(old, { country: 'US', source: 'tiktok', deviceType: 'desktop' });

  await aggregateAndPrune(ctx.sql);

  const rows = await ctx.db.select().from(dailySummaries);
  expect(rows).toHaveLength(4);
  expect(rows.reduce((n, r) => n + r.pageViews, 0)).toBe(4);
});

test('未知维度用空串归并，两条未知不会各成一行', async () => {
  const old = daysAgo(200);
  await seedPageView(old, { country: null, city: null, os: null, source: null });
  await seedPageView(old, { country: null, city: null, os: null, source: null });

  await aggregateAndPrune(ctx.sql);

  const rows = await ctx.db.select().from(dailySummaries);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ country: '', city: '', os: '', source: '', pageViews: 2 });
});

test('聚合任务可重复执行而不产生重复汇总', async () => {
  const old = daysAgo(200);
  await seedPageView(old);
  await seedPageView(old);
  await seedClick(old, true);

  await aggregateAndPrune(ctx.sql);
  const first = await ctx.db.select().from(dailySummaries);

  // 再跑两次
  await aggregateAndPrune(ctx.sql);
  await aggregateAndPrune(ctx.sql);
  const after = await ctx.db.select().from(dailySummaries);

  expect(after).toHaveLength(first.length);
  expect(after[0]).toMatchObject({ pageViews: 2, clicks: 1, leads: 1 });
});

test('新的超期明细累加到已有的桶上，而不是新插一行', async () => {
  const old = daysAgo(200);
  await seedPageView(old);
  await aggregateAndPrune(ctx.sql);

  // 同一天又来了一批（补写的明细），再次超期
  await seedPageView(old);
  await seedPageView(old);
  await aggregateAndPrune(ctx.sql);

  const rows = await ctx.db.select().from(dailySummaries);
  expect(rows).toHaveLength(1);
  expect(rows[0]?.pageViews).toBe(3);
});

test('不同天各成一行，历史图表按天连续', async () => {
  await seedPageView(daysAgo(200));
  await seedPageView(daysAgo(201));
  await seedPageView(daysAgo(202));

  await aggregateAndPrune(ctx.sql);

  const rows = await ctx.db.select().from(dailySummaries);
  expect(rows).toHaveLength(3);
  expect(new Set(rows.map((r) => r.day)).size).toBe(3);
});

test('跨越清理边界的历史不断档：老的在汇总里，新的在明细里，加起来是全部', async () => {
  await seedPageView(daysAgo(200));
  await seedPageView(daysAgo(199));
  await seedPageView(daysAgo(5));
  await seedPageView(daysAgo(1));

  await aggregateAndPrune(ctx.sql);

  const summarised = (await ctx.db.select().from(dailySummaries)).reduce(
    (n, r) => n + r.pageViews,
    0,
  );
  const remaining = (await ctx.db.select().from(pageViews)).length;

  expect(summarised).toBe(2);
  expect(remaining).toBe(2);
  expect(summarised + remaining).toBe(4);
});

test('日汇总永久保留：再跑多少次都不会被清掉', async () => {
  await seedPageView(daysAgo(400));
  await aggregateAndPrune(ctx.sql);

  for (let i = 0; i < 3; i += 1) await aggregateAndPrune(ctx.sql);

  expect(await ctx.db.select().from(dailySummaries)).toHaveLength(1);
});

test('删掉的用户，其历史汇总仍在', async () => {
  await seedPageView(daysAgo(200));
  await aggregateAndPrune(ctx.sql);

  await ctx.sql`delete from users where id = ${userAccountId}`;

  const rows = await ctx.db
    .select()
    .from(dailySummaries)
    .where(and(eq(dailySummaries.profileId, profileId)));
  expect(rows).toHaveLength(1);
});

test('保留期可调，便于运维按需改口径', async () => {
  await seedPageView(daysAgo(30));

  // 默认 183 天，这条还在保留期内
  await aggregateAndPrune(ctx.sql);
  expect(await ctx.db.select().from(pageViews)).toHaveLength(1);

  // 改成 7 天就该被聚合掉了
  await aggregateAndPrune(ctx.sql, new Date(), 7);
  expect(await ctx.db.select().from(pageViews)).toHaveLength(0);
  expect(await ctx.db.select().from(dailySummaries)).toHaveLength(1);
});

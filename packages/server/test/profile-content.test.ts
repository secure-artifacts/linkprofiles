import { buttons, pageViews, profiles } from '@link-profile/shared/schema';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { createTestContext, type TestContext } from './helpers/context.js';
import { createLoginableUser } from './helpers/factories.js';
import { login, withSession } from './helpers/http.js';

let ctx: TestContext;
let ownerToken: string;
let adminToken: string;
let strangerToken: string;
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

  const admin = await createLoginableUser(ctx.db, 'admin-pass', {
    role: 'admin',
    account: 'admin',
  });
  await createLoginableUser(ctx.db, 'other-pass', {
    role: 'admin',
    account: 'other-admin',
  });
  const user = await createLoginableUser(ctx.db, 'user-pass', {
    role: 'user',
    account: 'mimnz',
    shortName: 'mimnz',
    displayName: 'mimnz',
    owningAdminId: admin.id,
  });
  userId = user.id;
  profileId = user.profileId!;

  ownerToken = (await login(ctx, 'mimnz', 'user-pass')).token;
  adminToken = (await login(ctx, 'admin', 'admin-pass')).token;
  strangerToken = (await login(ctx, 'other-admin', 'other-pass')).token;
});

/** 只提交链接条目。社媒条目走 putEntries。 */
const putButtons = (token: string, list: Record<string, unknown>[]) =>
  putEntries(
    token,
    list.map((item) => ({ kind: 'link', ...item })),
  );

const putEntries = (token: string, entries: unknown[]) =>
  ctx.app.inject({
    method: 'PUT',
    url: `/_api/profiles/${profileId}/entries`,
    ...withSession(token),
    payload: { entries },
  });

const page = () => ctx.app.inject({ method: 'GET', url: '/mimnz' });

test('后台缩略预览复用真实页面渲染但不写访问统计', async () => {
  const res = await ctx.app.inject({
    method: 'GET',
    url: `/_api/profiles/${profileId}/preview`,
    ...withSession(ownerToken),
  });

  expect(res.statusCode).toBe(200);
  expect(res.headers['content-type']).toContain('text/html');
  expect(res.body).toContain('mimnz');
  expect(res.body).not.toContain('/_api/track');
  expect(await ctx.db.select().from(pageViews)).toHaveLength(0);
});

test('复制页面保留内容与条目，使用新 id 且不复制统计', async () => {
  await ctx.app.inject({
    method: 'PATCH',
    url: `/_api/profiles/${profileId}`,
    ...withSession(ownerToken),
    payload: {
      displayName: '来源页面',
      bio: '复制这段简介',
      layout: 'shape',
      theme: 'glass-ocean',
      solidBackground: true,
    },
  });
  await putButtons(ownerToken, [
    { title: '复制的按钮', subtitle: '说明', url: 'https://example.com/copied', isLead: true },
  ]);

  const res = await ctx.app.inject({
    method: 'POST',
    url: `/_api/profiles/${profileId}/duplicate`,
    ...withSession(ownerToken),
    payload: { shortName: 'mimnz-copy', displayName: '来源页面 副本' },
  });

  expect(res.statusCode).toBe(201);
  const copiedId = res.json().id as string;
  expect(copiedId).not.toBe(profileId);
  const [copied] = await ctx.db.select().from(profiles).where(eq(profiles.id, copiedId));
  expect(copied).toMatchObject({
    shortName: 'mimnz-copy',
    displayName: '来源页面 副本',
    bio: '复制这段简介',
    layout: 'shape',
    theme: 'glass-ocean',
    solidBackground: true,
  });
  const sourceEntries = await ctx.db.select().from(buttons).where(eq(buttons.profileId, profileId));
  const copiedEntries = await ctx.db.select().from(buttons).where(eq(buttons.profileId, copiedId));
  expect(copiedEntries).toHaveLength(1);
  expect(copiedEntries[0]).toMatchObject({ title: '复制的按钮', isLead: true });
  expect(copiedEntries[0]!.id).not.toBe(sourceEntries[0]!.id);
  expect(
    await ctx.db.select().from(pageViews).where(eq(pageViews.profileId, copiedId)),
  ).toHaveLength(0);
});

test('改显示名与简介，公开页随之变化', async () => {
  const res = await ctx.app.inject({
    method: 'PATCH',
    url: `/_api/profiles/${profileId}`,
    ...withSession(ownerToken),
    payload: { displayName: '新的名字', bio: '我是一个基督徒，来自美国' },
  });
  expect(res.statusCode).toBe(200);

  const html = (await page()).body;
  expect(html).toContain('新的名字');
  expect(html).toContain('我是一个基督徒，来自美国');
});

test('按钮可增删改，顺序持久化并反映在公开页上', async () => {
  await putButtons(ownerToken, [
    { title: '第一个', url: 'https://example.com/a' },
    { title: '第二个', url: 'https://example.com/b' },
    { title: '第三个', url: 'https://example.com/c' },
  ]);

  let html = (await page()).body;
  expect(html.indexOf('第一个')).toBeLessThan(html.indexOf('第二个'));
  expect(html.indexOf('第二个')).toBeLessThan(html.indexOf('第三个'));

  // 拖拽重排 + 删掉一个 + 改一个的标题，都是对同一个数组的操作
  await putButtons(ownerToken, [
    { title: '第三个', url: 'https://example.com/c' },
    { title: '改过名的第一个', url: 'https://example.com/a' },
  ]);

  html = (await page()).body;
  expect(html).not.toContain('第二个');
  expect(html.indexOf('第三个')).toBeLessThan(html.indexOf('改过名的第一个'));
});

test('实心还是描边整页统一，与 is_lead 和位置都无关', async () => {
  await putButtons(ownerToken, [
    { title: '内容在前', url: 'https://example.com/blog', isLead: false },
    { title: '联系在后', url: 'https://wa.me/15550109999', isLead: true },
  ]);

  const setSolid = (solidBackground: boolean) =>
    ctx.app.inject({
      method: 'PATCH',
      url: `/_api/profiles/${profileId}`,
      ...withSession(ownerToken),
      payload: { solidBackground },
    });

  await setSolid(false);
  const outline = (await page()).body;
  expect(outline).toMatch(/class="pp-link"[^>]*>(?:(?!<\/a>).)*内容在前/s);
  expect(outline).toMatch(/class="pp-link"[^>]*>(?:(?!<\/a>).)*联系在后/s);
  expect(outline).not.toContain('class="pp-lead"');

  await setSolid(true);
  const solid = (await page()).body;
  expect(solid).toMatch(/class="pp-lead"[^>]*>(?:(?!<\/a>).)*内容在前/s);
  expect(solid).toMatch(/class="pp-lead"[^>]*>(?:(?!<\/a>).)*联系在后/s);
  expect(solid).not.toContain('class="pp-link"');

  // 视觉换了口径不能跟着换：联系类照样记线索，内容类照样不记
  expect(solid).toMatch(/data-lead="1"[^>]*>(?:(?!<\/a>).)*联系在后/s);
  expect(solid).toMatch(/data-lead="0"[^>]*>(?:(?!<\/a>).)*内容在前/s);

  // 条目列表里没有任何区段标题：只有 <a>，没有标题元素
  const body = solid.slice(solid.indexOf('<div class="pp-body">'), solid.indexOf('</body>'));
  expect(body).not.toMatch(/<h[2-6][\s>]/);
  expect(body).not.toContain('联系方式');
  expect(body).not.toContain('内容链接');
});

test('图标白底关掉后，那条 CSS 规则的开关属性不再输出', async () => {
  await putButtons(ownerToken, [
    { title: '带图标', url: 'https://wa.me/15550109999', isLead: true },
  ]);

  const setPlate = (iconPlate: boolean) =>
    ctx.app.inject({
      method: 'PATCH',
      url: `/_api/profiles/${profileId}`,
      ...withSession(ownerToken),
      payload: { iconPlate },
    });

  await setPlate(true);
  expect((await page()).body).toContain('data-icon-plate');

  await setPlate(false);
  const off = (await page()).body;
  expect(off).not.toContain('data-icon-plate=""');
  // 图标本身还在，只是没了衬底 —— 关白底不该把品牌图形一起弄没
  expect(off).toContain('class="ic"');
});

test('副标题留空时不渲染那一行', async () => {
  await putButtons(ownerToken, [
    { title: '有副标题', url: 'https://wa.me/1', isLead: true, subtitle: '通常当天回复' },
    { title: '没副标题', url: 'https://wa.me/2', isLead: true },
  ]);

  const html = (await page()).body;
  expect(html).toContain('通常当天回复');

  const withSubtitle = html.slice(html.indexOf('有副标题'), html.indexOf('没副标题'));
  const withoutSubtitle = html.slice(html.indexOf('没副标题'));
  expect(withSubtitle).toContain('<span>');
  // 「没副标题」那张卡片的 tx 里只剩 <b>，没有第二个 span
  expect(withoutSubtitle.slice(0, withoutSubtitle.indexOf('</a>'))).not.toContain('<span>通常');
});

test('单页自定义链接数量上限五十', async () => {
  const fifty = Array.from({ length: 50 }, (_, i) => ({
    title: `按钮 ${i}`,
    url: `https://example.com/${i}`,
  }));

  expect((await putButtons(ownerToken, fifty)).statusCode).toBe(200);

  const fiftyOne = [...fifty, { title: '第 51 个', url: 'https://example.com/51' }];
  const res = await putButtons(ownerToken, fiftyOne);
  expect(res.statusCode).toBe(400);
});

test('目标链接的危险协议被拒，不会变成存储型 XSS', async () => {
  for (const url of ['javascript:alert(1)', 'data:text/html,<script>alert(1)</script>']) {
    const res = await putButtons(ownerToken, [{ title: '坏链接', url }]);
    expect(res.statusCode, url).toBe(400);
    expect(res.json().error).toBe('invalid_url');
  }

  const html = (await page()).body;
  expect(html).not.toContain('javascript:');
});

test('按钮文字里的尖括号被转义，不会注入标签', async () => {
  await putButtons(ownerToken, [
    { title: '<script>alert(1)</script>', url: 'https://example.com/x' },
  ]);

  const html = (await page()).body;
  expect(html).not.toContain('<script>alert(1)</script>');
  expect(html).toContain('&lt;script&gt;');
});

test('社媒及电话入口只填号码或邮箱，目标 URL 由系统拼装', async () => {
  const res = await ctx.app.inject({
    method: 'PUT',
    url: `/_api/profiles/${profileId}/entries`,
    ...withSession(ownerToken),
    payload: {
      entries: [
        { kind: 'social', title: 'WhatsApp', platform: 'whatsapp', value: '+1 (555) 010-9999' },
        { kind: 'social', title: '发短信', platform: 'sms', value: '+64 (21) 000 0000' },
        { kind: 'social', title: '打电话', platform: 'phone', value: '+64 (21) 000 0000' },
        { kind: 'social', title: 'Email', platform: 'email', value: 'hi@example.com' },
        {
          kind: 'social',
          title: 'Instagram',
          platform: 'instagram',
          value: '@mimnz',
          directMessage: true,
        },
      ],
    },
  });
  expect(res.statusCode).toBe(200);

  const html = (await page()).body;
  expect(html).toContain('href="https://wa.me/15550109999"');
  expect(html).toContain('href="sms:+64210000000"');
  expect(html).toContain('href="tel:+64210000000"');
  expect(html).toContain('href="mailto:hi@example.com"');
  expect(html).toContain('href="https://ig.me/m/mimnz"');
});

test('联系渠道拒绝明显错误的号码与用户名', async () => {
  for (const entry of [
    { platform: 'whatsapp', value: '123' },
    { platform: 'phone', value: 'not-a-phone' },
    { platform: 'instagram', value: 'bad..name' },
    { platform: 'messenger', value: 'a!' },
  ]) {
    const res = await ctx.app.inject({
      method: 'PUT',
      url: `/_api/profiles/${profileId}/entries`,
      ...withSession(ownerToken),
      payload: { entries: [{ kind: 'social', title: '测试', ...entry }] },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('invalid_social_value');
  }
});

test('社媒图标的默认 is_lead 按平台给出，且可覆盖', async () => {
  await ctx.app.inject({
    method: 'PUT',
    url: `/_api/profiles/${profileId}/entries`,
    ...withSession(ownerToken),
    payload: {
      entries: [
        { kind: 'social', title: 'WhatsApp', platform: 'whatsapp', value: '15550109999' },
        { kind: 'social', title: 'Instagram', platform: 'instagram', value: 'mimnz' },
        { kind: 'social', title: 'YouTube', platform: 'youtube', value: 'mimnz', isLead: true },
      ],
    },
  });

  const saved = await ctx.app.inject({
    method: 'GET',
    url: `/_api/profiles/${profileId}`,
    ...withSession(ownerToken),
  });
  const byPlatform = Object.fromEntries(
    saved.json().entries.map((i: { platform: string; isLead: boolean }) => [i.platform, i.isLead]),
  );
  expect(byPlatform).toEqual({ whatsapp: true, instagram: false, youtube: true });
});

test('清单外的平台被拒，绕过后台直接调接口也塞不进大陆 app', async () => {
  const res = await ctx.app.inject({
    method: 'PUT',
    url: `/_api/profiles/${profileId}/entries`,
    ...withSession(ownerToken),
    payload: {
      entries: [{ kind: 'social', title: 'weixin', platform: 'weixin', value: 'mimnz' }],
    },
  });

  expect(res.statusCode).toBe(400);
  expect(res.json()).toMatchObject({ error: 'unknown_platform', platform: 'weixin' });
});

test('同一个平台不能启用两次', async () => {
  const res = await ctx.app.inject({
    method: 'PUT',
    url: `/_api/profiles/${profileId}/entries`,
    ...withSession(ownerToken),
    payload: {
      entries: [
        { kind: 'social', title: 'WhatsApp', platform: 'whatsapp', value: '+15550101001' },
        { kind: 'social', title: 'WhatsApp', platform: 'whatsapp', value: '+15550101002' },
      ],
    },
  });

  expect(res.statusCode).toBe(400);
  expect(res.json()).toMatchObject({ error: 'duplicate_platform' });
});

test('内置平台清单只含海外平台', async () => {
  const res = await ctx.app.inject({ method: 'GET', url: '/_api/social-platforms' });

  const ids = res.json().platforms.map((p: { id: string }) => p.id);
  expect(ids).toContain('whatsapp');
  expect(ids).toContain('messenger');
  expect(ids).toContain('sms');
  expect(ids).toContain('phone');
  for (const banned of ['weixin', 'wechat', 'qq', 'weibo', 'douyin', 'xiaohongshu']) {
    expect(ids).not.toContain(banned);
  }
});

test('归属管理员可以代改名下用户的内容', async () => {
  const res = await ctx.app.inject({
    method: 'PATCH',
    url: `/_api/profiles/${profileId}`,
    ...withSession(adminToken),
    payload: { bio: '运营统一控版' },
  });

  expect(res.statusCode).toBe(200);
  expect((await page()).body).toContain('运营统一控版');
});

test('非归属管理员改不动别人的用户', async () => {
  for (const call of [
    {
      method: 'PATCH' as const,
      url: `/_api/profiles/${profileId}`,
      payload: { bio: '我乱改的' },
    },
    {
      method: 'PUT' as const,
      url: `/_api/profiles/${profileId}/entries`,
      payload: {
        entries: [{ kind: 'link', title: '我塞的', url: 'https://evil.example.com' }],
      },
    },
    {
      method: 'PUT' as const,
      url: `/_api/profiles/${profileId}/entries`,
      payload: {
        entries: [{ kind: 'social', platform: 'whatsapp', value: '1', title: 'WhatsApp' }],
      },
    },
    { method: 'GET' as const, url: `/_api/profiles/${profileId}` },
  ]) {
    const res = await ctx.app.inject({ ...call, ...withSession(strangerToken) });
    expect(res.statusCode, `${call.method} ${call.url}`).toBe(403);
  }

  expect((await page()).body).not.toContain('我乱改的');
});

test('保存不换按钮 id，逐按钮的历史点击不被清零', async () => {
  const created = await ctx.app.inject({
    method: 'PUT',
    url: `/_api/profiles/${profileId}/entries`,
    ...withSession(ownerToken),
    payload: {
      entries: [
        { kind: 'link', title: '联系我', url: 'https://wa.me/1', isLead: true },
        { kind: 'link', title: '看内容', url: 'https://example.com/blog', isLead: false },
      ],
    },
  });
  const before = created.json().entries as { id: string; title: string }[];

  // 只改了个标题就再存一次 —— 这在编辑器里等同于改主题、改简介，任何一次保存
  const again = await ctx.app.inject({
    method: 'PUT',
    url: `/_api/profiles/${profileId}/entries`,
    ...withSession(ownerToken),
    payload: {
      entries: [
        {
          kind: 'link',
          id: before[0]!.id,
          title: '联系我（改过）',
          url: 'https://wa.me/1',
          isLead: true,
        },
        {
          kind: 'link',
          id: before[1]!.id,
          title: '看内容',
          url: 'https://example.com/blog',
          isLead: false,
        },
      ],
    },
  });
  const after = again.json().entries as { id: string; title: string }[];

  // id 保持不变，否则 clicks.target_id 全部成为孤儿，单按钮点击率归零
  expect(after.map((b) => b.id)).toEqual(before.map((b) => b.id));
  expect(after[0]!.title).toBe('联系我（改过）');
});

test('重排与增删之后，留下来的按钮仍然是原来那个 id', async () => {
  const created = await ctx.app.inject({
    method: 'PUT',
    url: `/_api/profiles/${profileId}/entries`,
    ...withSession(ownerToken),
    payload: {
      entries: [
        { kind: 'link', title: 'A', url: 'https://example.com/a' },
        { kind: 'link', title: 'B', url: 'https://example.com/b' },
      ],
    },
  });
  const [a, b] = created.json().entries as { id: string; title: string }[];

  // 交换顺序、删掉 A、加一个新的
  const again = await ctx.app.inject({
    method: 'PUT',
    url: `/_api/profiles/${profileId}/entries`,
    ...withSession(ownerToken),
    payload: {
      entries: [
        { kind: 'link', id: b!.id, title: 'B', url: 'https://example.com/b' },
        { kind: 'link', title: 'C', url: 'https://example.com/c' },
      ],
    },
  });
  const after = again.json().entries as { id: string; title: string; position: number }[];

  expect(after.map((x) => x.title)).toEqual(['B', 'C']);
  expect(after[0]!.id).toBe(b!.id);
  expect(after[0]!.position).toBe(0);
  // A 真的没了
  expect(after.map((x) => x.id)).not.toContain(a!.id);
});

test('别人的按钮 id 塞进来不会被劫持，只会新建一条属于自己的', async () => {
  const victim = await ctx.app.inject({
    method: 'PUT',
    url: `/_api/profiles/${profileId}/entries`,
    ...withSession(ownerToken),
    payload: {
      entries: [{ kind: 'link', title: '我的', url: 'https://example.com/mine' }],
    },
  });
  const mine = (victim.json().entries as { id: string }[])[0]!;

  // 另一个用户拿着别人的按钮 id 提交
  const other = await createLoginableUser(ctx.db, 'other-user-pass', {
    role: 'user',
    account: 'other-user',
    shortName: 'other-user',
  });
  const otherToken = (await login(ctx, 'other-user', 'other-user-pass')).token;

  const res = await ctx.app.inject({
    method: 'PUT',
    url: `/_api/profiles/${other.profileId}/entries`,
    ...withSession(otherToken),
    payload: {
      entries: [{ kind: 'link', id: mine.id, title: '抢来的', url: 'https://evil.example.com' }],
    },
  });
  expect(res.statusCode).toBe(200);

  // 我的按钮没被动
  const stillMine = await ctx.app.inject({
    method: 'GET',
    url: `/_api/profiles/${profileId}`,
    ...withSession(ownerToken),
  });
  const list = stillMine.json().entries as { kind: 'link'; id: string; title: string }[];
  expect(list).toHaveLength(1);
  expect(list[0]).toMatchObject({ id: mine.id, title: '我的' });
});

test('未登录改不了任何内容', async () => {
  const res = await ctx.app.inject({
    method: 'PUT',
    url: `/_api/profiles/${profileId}/entries`,
    payload: {
      entries: [],
    },
  });

  expect(res.statusCode).toBe(401);
});

test('三个页面级开关都能存下来', async () => {
  const patch = (body: Record<string, unknown>) =>
    ctx.app.inject({
      method: 'PATCH',
      url: `/_api/profiles/${profileId}`,
      ...withSession(ownerToken),
      payload: body,
    });

  const res = await patch({ solidBackground: true, iconPlate: false, bioTypewriter: true });
  expect(res.statusCode).toBe(200);
  expect(res.json().profile).toMatchObject({
    solidBackground: true,
    iconPlate: false,
    bioTypewriter: true,
  });

  // 重新读一遍：光看 PATCH 的返回体测不出「收了参数但没写库」
  const reread = await ctx.app.inject({
    method: 'GET',
    url: `/_api/profiles/${profileId}`,
    ...withSession(ownerToken),
  });
  expect(reread.json().profile).toMatchObject({
    solidBackground: true,
    iconPlate: false,
    bioTypewriter: true,
  });

  // 不传的字段不该被顺手清掉
  const partial = await patch({ displayName: '只改名字' });
  expect(partial.json().profile).toMatchObject({
    displayName: '只改名字',
    solidBackground: true,
    iconPlate: false,
    bioTypewriter: true,
  });
});

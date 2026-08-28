import { layoutEnum } from '@link-profile/shared/schema';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { createTestContext, type TestContext } from './helpers/context.js';
import { createLoginableUser } from './helpers/factories.js';
import { login, withSession } from './helpers/http.js';

let ctx: TestContext;
let token: string;
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
  const user = await createLoginableUser(ctx.db, 'user-pass', {
    role: 'user',
    account: 'mimnz',
    shortName: 'mimnz',
    displayName: 'mimnz',
    bio: '我是一个基督徒，来自美国',
  });
  userId = user.id;
  profileId = user.profileId!;
  token = (await login(ctx, 'mimnz', 'user-pass')).token;
});

const setLayout = (layout: string) =>
  ctx.app.inject({
    method: 'PATCH',
    url: `/_api/profiles/${profileId}`,
    ...withSession(token),
    payload: { layout },
  });

const page = () => ctx.app.inject({ method: 'GET', url: '/mimnz' });

/** 头部根节点的类名，布局的落点就在这里。 */
const HEADER_CLASS: Record<string, string> = {
  classic: 'hd hd-cls',
  hero: 'hd hd-hero',
  banner: 'hd hd-ban',
  cutout: 'hd hd-cut',
  shape: 'hd hd-shp',
};

test('新账号默认使用 Classic', async () => {
  const html = (await page()).body;

  expect(html).toContain('data-l="classic"');
  expect(html).toContain(HEADER_CLASS['classic']);
});

test('五种布局全部可用，切换后持久化并反映在公开页上', async () => {
  for (const layout of layoutEnum.enumValues) {
    const saved = await setLayout(layout);
    expect(saved.statusCode, layout).toBe(200);
    expect(saved.json().profile.layout, layout).toBe(layout);

    const html = (await page()).body;
    expect(html, layout).toContain(`data-l="${layout}"`);
    expect(html, layout).toContain(HEADER_CLASS[layout]!);
    // 显示名在每种布局里都渲染得出来
    expect(html, layout).toContain('mimnz');
  }
});

test('布局不决定配色：换布局不动主题', async () => {
  for (const layout of layoutEnum.enumValues) {
    await setLayout(layout);
    const html = (await page()).body;
    expect(html, layout).toContain('data-t="dawn"');
  }
});

test('缺少头图素材时该区域以主题渐变填充，不回落到其他布局', async () => {
  // Hero、Banner、Cutout 依赖头图，用户没传时最容易出问题
  for (const layout of ['hero', 'banner', 'cutout'] as const) {
    await setLayout(layout);
    const html = (await page()).body;

    // 仍然是这个布局本身，不是换成了别的
    expect(html, layout).toContain(HEADER_CLASS[layout]!);
    // 没有 img，空位交给 .av-empty 用主题渐变填充
    expect(html, layout).not.toMatch(/<img[^>]*>/);
    expect(html, layout).toContain('av-empty');
  }
});

test('不认识的布局值被拒', async () => {
  const res = await setLayout('kaleidoscope');

  expect(res.statusCode).toBe(400);
  expect((await page()).body).toContain('data-l="classic"');
});

test('布局组件来自 profile-ui，直出与预览读的是同一份样式', async () => {
  const html = (await page()).body;

  // 五种布局的规则都在同一份内联样式里，预览侧 import 的也是它
  const head = html.slice(0, html.indexOf('</head>'));
  for (const selector of ['.hd-cls', '.hd-hero', '.hd-ban', '.hd-cut', '.hd-shp']) {
    expect(head, selector).toContain(selector);
  }
});

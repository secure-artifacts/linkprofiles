import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { THEMES } from '@link-profile/profile-ui';
import { themeEnum } from '@link-profile/shared/schema';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { createTestContext, type TestContext } from './helpers/context.js';
import { createLoginableUser } from './helpers/factories.js';
import { login, withSession } from './helpers/http.js';
import { makePng, multipart } from './helpers/media-fixtures.js';

let ctx: TestContext;
let token: string;
let userId: string;
let profileId: string;
let uploads: string;

beforeAll(async () => {
  uploads = await mkdtemp(path.join(tmpdir(), 'lp-themes-'));
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
  const user = await createLoginableUser(ctx.db, 'user-pass', {
    role: 'user',
    account: 'mimnz',
    shortName: 'mimnz',
    displayName: 'mimnz',
  });
  userId = user.id;
  profileId = user.profileId!;
  token = (await login(ctx, 'mimnz', 'user-pass')).token;
});

const patch = (payload: Record<string, unknown>) =>
  ctx.app.inject({
    method: 'PATCH',
    url: `/_api/profiles/${profileId}`,
    ...withSession(token),
    payload,
  });

const page = () => ctx.app.inject({ method: 'GET', url: '/mimnz' });

/**
 * 只取根节点 `<div class="pp" …>` 那一个标签。
 * 内联样式表里本来就有 `.pp[data-bg-image]` 与 `--overlay` 这些串，
 * 在整篇 HTML 上做 contains 会误命中样式规则而不是元素本身。
 */
async function rootTag(): Promise<string> {
  const html = (await page()).body;
  const start = html.indexOf('<div class="pp"');
  return html.slice(start, html.indexOf('>', start) + 1);
}

async function uploadBackground() {
  const { payload, headers } = multipart(
    { slot: 'background' },
    { file: { filename: 'bg.png', contentType: 'image/png', data: await makePng(1600, 2400) } },
  );
  const res = await ctx.app.inject({
    method: 'POST',
    url: `/_api/profiles/${profileId}/media`,
    ...withSession(token),
    headers,
    payload,
  });
  expect(res.statusCode).toBe(201);
  return res.json().mediaId as string;
}

test('新账号默认使用 Dawn·晨', async () => {
  expect((await page()).body).toContain('data-t="dawn"');
});

test('六套主题全部可用，切换后持久化并反映在公开页上', async () => {
  for (const theme of themeEnum.enumValues) {
    const saved = await patch({ theme });
    expect(saved.statusCode, theme).toBe(200);
    expect(saved.json().profile.theme, theme).toBe(theme);
    expect((await page()).body, theme).toContain(`data-t="${theme}"`);
  }
});

test('主题只是一组 CSS 变量的取值，结构不变', async () => {
  const html = (await page()).body;
  const head = html.slice(0, html.indexOf('</head>'));

  for (const theme of themeEnum.enumValues) {
    if (theme === 'dawn') continue; // Dawn 的取值落在 .pp 上当默认
    expect(head, theme).toContain(`.pp[data-t=${theme}]`);
  }
  // 六套共用同一批变量名
  for (const token of ['--bg:', '--surface:', '--on-surface:', '--text:', '--muted:', '--r:']) {
    expect(head, token).toContain(token);
  }
});

test('圆角是主题的一部分而非全局常量', async () => {
  const html = (await page()).body;
  const head = html.slice(0, html.indexOf('</head>'));

  // Ember 的圆角是胶囊，Slate 的是 6px —— 两者都出现在同一份样式里
  expect(head).toContain('--r:999px');
  expect(head).toContain('--r:6px');
});

test('不认识的主题值被拒', async () => {
  const res = await patch({ theme: 'neon' });

  expect(res.statusCode).toBe(400);
  expect((await page()).body).toContain('data-t="dawn"');
});

test('上传背景图后覆盖主题渐变，但按钮色与文字色仍生效', async () => {
  await patch({ theme: 'harbor' });
  await uploadBackground();

  const root = await rootTag();

  // 背景图接管了背景
  expect(root).toContain('data-bg-image');
  expect(root).toMatch(/--bg-image:url\(/);
  // 主题没有被换掉，按钮色与文字色照旧由 harbor 提供
  expect(root).toContain('data-t="harbor"');
  const html = (await page()).body;
  const head = html.slice(0, html.indexOf('</head>'));
  expect(head).toContain(THEMES.harbor.surface.toLowerCase());
});

test('背景图上的遮罩默认四成，可调', async () => {
  await uploadBackground();

  expect(await rootTag()).toContain('--overlay:0.4');

  const saved = await patch({ backgroundOverlay: 0.65 });
  expect(saved.statusCode).toBe(200);
  expect(await rootTag()).toContain('--overlay:0.65');
});

test('遮罩暗度超出 0–1 被拒', async () => {
  for (const backgroundOverlay of [-0.1, 1.5]) {
    expect((await patch({ backgroundOverlay })).statusCode, String(backgroundOverlay)).toBe(400);
  }
});

test('清空背景图后回到主题渐变', async () => {
  await uploadBackground();
  expect(await rootTag()).toContain('data-bg-image');

  const cleared = await ctx.app.inject({
    method: 'DELETE',
    url: `/_api/profiles/${profileId}/media/background`,
    ...withSession(token),
  });
  expect(cleared.statusCode).toBe(204);

  const root = await rootTag();
  expect(root).not.toContain('data-bg-image');
  expect(root).toContain('data-t="dawn"');
});

test('背景图与布局互不干涉：任一布局上都能铺背景', async () => {
  await uploadBackground();

  for (const layout of ['classic', 'hero', 'banner', 'cutout', 'shape']) {
    await patch({ layout });
    const root = await rootTag();
    expect(root, layout).toContain('data-bg-image');
    expect(root, layout).toContain(`data-l="${layout}"`);
  }
});

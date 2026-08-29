import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { media } from '@link-profile/shared/schema';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { createTestContext, type TestContext } from './helpers/context.js';
import { createLoginableUser } from './helpers/factories.js';
import { login, withSession } from './helpers/http.js';
import { makeMp4, makePng, multipart } from './helpers/media-fixtures.js';

let ctx: TestContext;
let token: string;
let strangerToken: string;
let userId: string;
let profileId: string;
let uploads: string;

beforeAll(async () => {
  // 本测试文件用自己的上传目录，跑完整个删掉，不污染仓库
  uploads = await mkdtemp(path.join(tmpdir(), 'lp-uploads-'));
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
  await createLoginableUser(ctx.db, 'other-pass', {
    role: 'admin',
    account: 'stranger',
  });
  userId = user.id;
  profileId = user.profileId!;
  token = (await login(ctx, 'mimnz', 'user-pass')).token;
  strangerToken = (await login(ctx, 'stranger', 'other-pass')).token;
});

function upload(
  authToken: string,
  fields: Record<string, string>,
  files: Parameters<typeof multipart>[1],
) {
  const { payload, headers } = multipart(fields, files);
  return ctx.app.inject({
    method: 'POST',
    url: `/_api/profiles/${profileId}/media`,
    ...withSession(authToken),
    headers,
    payload,
  });
}

const imageFile = async (name = 'photo.png') => ({
  filename: name,
  contentType: 'image/png',
  data: await makePng(),
});

const page = () => ctx.app.inject({ method: 'GET', url: '/mimnz' });

test('头像上传后转成 AVIF 为主、WebP 兜底，并生成缩略图', async () => {
  const res = await upload(token, { slot: 'avatar' }, { file: await imageFile() });
  expect(res.statusCode).toBe(201);

  const [row] = await ctx.db.select().from(media).where(eq(media.id, res.json().mediaId));
  const formats = row!.variants.map((v) => `${v.format}${v.thumbnail ? ':thumb' : ''}`);
  expect(formats).toEqual(['avif', 'webp', 'webp:thumb']);

  // 三份文件都真的落了盘
  const files = await readdir(path.join(uploads, row!.directory));
  expect(files.sort()).toEqual(['image.avif', 'image.webp', 'thumb.webp']);
});

test('公开页以 picture 给出 AVIF，img 落在 WebP 那一档', async () => {
  await upload(token, { slot: 'avatar' }, { file: await imageFile() });

  const html = (await page()).body;
  expect(html).toContain('<picture>');
  expect(html).toContain('type="image/avif"');
  expect(html).toMatch(/<img[^>]+src="[^"]+image\.webp"/);
});

test('大图被压到限制内，不把八兆原图丢给访客', async () => {
  const res = await upload(token, { slot: 'avatar' }, { file: await imageFile() });

  const [row] = await ctx.db.select().from(media).where(eq(media.id, res.json().mediaId));
  // 头像位最长边 640
  expect(row!.width).toBeLessThanOrEqual(640);
  for (const variant of row!.variants) {
    expect(variant.bytes).toBeLessThan(400 * 1024);
  }
});

test('头像位标记为高优先级加载', async () => {
  await upload(token, { slot: 'avatar' }, { file: await imageFile() });

  const html = (await page()).body;
  expect(html).toMatch(/<link rel="preload" as="image"[^>]+fetchpriority="high"/);
  expect(html).toContain('fetchpriority="high"');
});

test('视频只校验不转码：落盘的就是原文件，目录里没有转码产物', async () => {
  const video = makeMp4(8000);
  const res = await upload(
    token,
    { slot: 'avatar' },
    {
      file: { filename: 'clip.mp4', contentType: 'video/mp4', data: video },
      poster: await imageFile('poster.png'),
    },
  );
  expect(res.statusCode).toBe(201);
  expect(res.json().durationMs).toBe(8000);

  const [row] = await ctx.db.select().from(media).where(eq(media.id, res.json().mediaId));
  const files = await readdir(path.join(uploads, row!.directory));
  expect(files).toEqual(['video.mp4']);
  expect(row!.variants).toHaveLength(1);
  expect(row!.variants[0]!.bytes).toBe(video.byteLength);
});

test('视频超出限制时说清楚是哪一项超了', async () => {
  const tooLong = await upload(
    token,
    { slot: 'avatar' },
    {
      file: { filename: 'long.mp4', contentType: 'video/mp4', data: makeMp4(21_400) },
      poster: await imageFile('poster.png'),
    },
  );
  expect(tooLong.statusCode).toBe(400);
  expect(tooLong.json()).toMatchObject({ error: 'video_duration' });
  expect(tooLong.json().message).toContain('21.4');

  const notMp4 = await upload(
    token,
    { slot: 'avatar' },
    {
      file: { filename: 'clip.mov', contentType: 'video/quicktime', data: makeMp4(3000) },
      poster: await imageFile('poster.png'),
    },
  );
  expect(notMp4.json()).toMatchObject({ error: 'video_format' });
  expect(notMp4.json().message).toContain('video/quicktime');
});

test('视频必须一并提交封面，抽帧失败时降级为手动上传', async () => {
  const res = await upload(
    token,
    { slot: 'avatar' },
    { file: { filename: 'clip.mp4', contentType: 'video/mp4', data: makeMp4(5000) } },
  );

  expect(res.statusCode).toBe(400);
  expect(res.json().error).toBe('missing_poster');
  expect(res.json().message).toContain('手动上传');
});

test('公开页先渲染封面，视频不自动开始下载，也就当不成 LCP 元素', async () => {
  await upload(
    token,
    { slot: 'avatar' },
    {
      file: { filename: 'clip.mp4', contentType: 'video/mp4', data: makeMp4(5000) },
      poster: await imageFile('poster.png'),
    },
  );

  const html = (await page()).body;

  // 封面图是被 preload 且标高优先级的那一个
  const preload = html.match(/<link rel="preload" as="image" href="([^"]+)" fetchpriority="high">/);
  expect(preload?.[1]).toMatch(/image\.webp$/);

  // 视频带封面、不预加载、也没有 autoplay 属性
  expect(html).toMatch(/<video[^>]+poster="[^"]+"/);
  expect(html).toMatch(/<video[^>]+preload="none"/);
  expect(html).not.toMatch(/<video[^>]+ autoplay/);
});

test('视频在页面上自动循环、静音、行内播放', async () => {
  await upload(
    token,
    { slot: 'avatar' },
    {
      file: { filename: 'clip.mp4', contentType: 'video/mp4', data: makeMp4(5000) },
      poster: await imageFile('poster.png'),
    },
  );

  const html = (await page()).body;
  const tag = html.slice(html.indexOf('<video'), html.indexOf('</video>'));
  expect(tag).toContain('muted');
  expect(tag).toContain('loop');
  // React 输出的是 playsInline，HTML 属性名大小写不敏感，浏览器照收
  expect(tag.toLowerCase()).toContain('playsinline');
  // 由内联的那一小段脚本在 canplay 之后才 play
  expect(html).toContain("addEventListener('canplay'");
});

test('头像位换回图片时，原来的视频封面被清掉', async () => {
  await upload(
    token,
    { slot: 'avatar' },
    {
      file: { filename: 'clip.mp4', contentType: 'video/mp4', data: makeMp4(5000) },
      poster: await imageFile('poster.png'),
    },
  );
  expect((await page()).body).toContain('<video');

  await upload(token, { slot: 'avatar' }, { file: await imageFile() });
  const html = (await page()).body;
  expect(html).not.toContain('<video');
  expect(html).toContain('<picture>');
});

test('背景图只收图片，不收视频', async () => {
  const res = await upload(
    token,
    { slot: 'background' },
    { file: { filename: 'clip.mp4', contentType: 'video/mp4', data: makeMp4(5000) } },
  );

  expect(res.statusCode).toBe(400);
  expect(res.json().error).toBe('video_not_allowed');
});

test('复制页面会复制一份独立媒体目录', async () => {
  const uploaded = await upload(token, { slot: 'avatar' }, { file: await imageFile() });
  expect(uploaded.statusCode).toBe(201);
  const [source] = await ctx.db.select().from(media).where(eq(media.id, uploaded.json().mediaId));

  const copied = await ctx.app.inject({
    method: 'POST',
    url: `/_api/profiles/${profileId}/duplicate`,
    ...withSession(token),
    payload: { shortName: 'mimnz-copy', displayName: 'mimnz 副本' },
  });
  expect(copied.statusCode).toBe(201);

  const [target] = await ctx.db
    .select()
    .from(media)
    .where(eq(media.profileId, copied.json().id as string));
  expect(target).toBeDefined();
  expect(target!.id).not.toBe(source!.id);
  expect(target!.directory).not.toBe(source!.directory);
  expect(await readdir(path.join(uploads, target!.directory))).toEqual(
    expect.arrayContaining(['image.avif', 'image.webp', 'thumb.webp']),
  );
  expect(
    target!.variants.every((variant) => variant.path.startsWith(`${target!.directory}/`)),
  ).toBe(true);
});

test('Banner 图与头像位独立上传、更换和清空', async () => {
  const firstAvatar = await upload(token, { slot: 'avatar' }, { file: await imageFile('a.png') });
  const banner = await upload(token, { slot: 'banner' }, { file: await imageFile('banner.png') });
  expect(banner.statusCode).toBe(201);
  expect(banner.json().mediaId).not.toBe(firstAvatar.json().mediaId);

  await ctx.app.inject({
    method: 'PATCH',
    url: `/_api/profiles/${profileId}`,
    ...withSession(token),
    payload: { layout: 'banner' },
  });

  let html = (await page()).body;
  expect(html).toContain(`/${banner.json().mediaId}/image.webp`);
  expect(html).toContain(`/${firstAvatar.json().mediaId}/image.webp`);

  const nextAvatar = await upload(token, { slot: 'avatar' }, { file: await imageFile('b.png') });
  html = (await page()).body;
  expect(html).toContain(`/${banner.json().mediaId}/image.webp`);
  expect(html).toContain(`/${nextAvatar.json().mediaId}/image.webp`);

  const cleared = await ctx.app.inject({
    method: 'DELETE',
    url: `/_api/profiles/${profileId}/media/banner`,
    ...withSession(token),
  });
  expect(cleared.statusCode).toBe(204);

  html = (await page()).body;
  expect(html).not.toContain(`/${banner.json().mediaId}/image.webp`);
  expect(html).toContain(`/${nextAvatar.json().mediaId}/image.webp`);
  expect(html).toContain('bn bn-empty');
});

test('Banner 图只收图片，不收视频', async () => {
  const res = await upload(
    token,
    { slot: 'banner' },
    { file: { filename: 'clip.mp4', contentType: 'video/mp4', data: makeMp4(5000) } },
  );

  expect(res.statusCode).toBe(400);
  expect(res.json().error).toBe('video_not_allowed');
});

test('非图片格式被拒，错误里说明支持哪些', async () => {
  const res = await upload(
    token,
    { slot: 'avatar' },
    { file: { filename: 'x.gif', contentType: 'image/gif', data: Buffer.from('GIF89a') } },
  );

  expect(res.statusCode).toBe(400);
  expect(res.json().message).toContain('image/gif');
});

test('清空头像后该区域回到主题渐变填充', async () => {
  await upload(token, { slot: 'avatar' }, { file: await imageFile() });
  expect((await page()).body).toContain('<picture>');

  const cleared = await ctx.app.inject({
    method: 'DELETE',
    url: `/_api/profiles/${profileId}/media/avatar`,
    ...withSession(token),
  });
  expect(cleared.statusCode).toBe(204);

  const html = (await page()).body;
  expect(html).not.toContain('<picture>');
  expect(html).toContain('av-empty');
});

test('别人上传不到我的位置', async () => {
  const res = await upload(strangerToken, { slot: 'avatar' }, { file: await imageFile() });

  expect(res.statusCode).toBe(403);
});

test('未登录上传不了', async () => {
  const { payload, headers } = multipart({ slot: 'avatar' }, { file: await imageFile() });
  const res = await ctx.app.inject({
    method: 'POST',
    url: `/_api/profiles/${profileId}/media`,
    headers,
    payload,
  });

  expect(res.statusCode).toBe(401);
});

test('上传的文件经静态路径可取回', async () => {
  const res = await upload(token, { slot: 'avatar' }, { file: await imageFile() });
  const [row] = await ctx.db.select().from(media).where(eq(media.id, res.json().mediaId));
  const webp = row!.variants.find((v) => v.format === 'webp' && !v.thumbnail)!;

  const fetched = await ctx.app.inject({
    method: 'GET',
    url: `/_static/uploads/${webp.path}`,
  });

  expect(fetched.statusCode).toBe(200);
  expect(fetched.headers['content-type']).toContain('image/webp');
});

import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { createTestContext, type TestContext } from './helpers/context.js';

/**
 * 后台 SPA 的挂载与回退。
 *
 * 这几条都踩过：回退处理器一旦逸出 `/_admin` 前缀就会吃掉公开页的 404；
 * 没有回退则深链刷新进不到前端路由；回退太宽则缺失的 js 拿到一份 HTML，
 * 浏览器报的是语法错误而不是 404。
 */

let ctx: TestContext;
let dist: string;

const INDEX_HTML = '<!doctype html><title>Link Profile 后台</title><div id="root"></div>';

beforeAll(async () => {
  dist = await mkdtemp(path.join(tmpdir(), 'lp-admin-dist-'));
  await writeFile(path.join(dist, 'index.html'), INDEX_HTML);
  await writeFile(path.join(dist, 'preview.html'), '<!doctype html><title>预览</title>');
  await mkdir(path.join(dist, 'assets'));
  await writeFile(path.join(dist, 'assets', 'main.js'), 'export const ok = 1;\n');

  process.env.ADMIN_DIST = dist;
  ctx = await createTestContext();
});

afterAll(async () => {
  await ctx.close();
  await rm(dist, { recursive: true, force: true });
  delete process.env.ADMIN_DIST;
});

const get = (url: string) => ctx.app.inject({ method: 'GET', url });

test('/_admin/ 返回后台首页', async () => {
  const res = await get('/_admin/');
  expect(res.statusCode).toBe(200);
  expect(res.body).toContain('id="root"');
});

test('/_admin 重定向到带斜杠的地址', async () => {
  const res = await get('/_admin');
  expect(res.statusCode).toBe(302);
  expect(res.headers.location).toBe('/_admin/');
});

test('真实文件直接命中，不走回退', async () => {
  expect((await get('/_admin/preview.html')).body).toContain('预览');
  expect((await get('/_admin/assets/main.js')).body).toContain('export const ok');
});

test('前端路由的深链回 index.html，刷新进得去', async () => {
  for (const url of [
    '/_admin/users',
    '/_admin/users/2b0b6d1e-0000-4000-8000-000000000000/profiles',
    '/_admin/profiles/2b0b6d1e-0000-4000-8000-000000000000',
    '/_admin/analytics',
  ]) {
    const res = await get(url);
    expect(res.statusCode, url).toBe(200);
    expect(res.body, url).toContain('id="root"');
  }
});

test('不存在的静态资源仍然是 404，不能回一份 HTML', async () => {
  // 回 HTML 的话浏览器会把 index.html 当 JS 解析，报的是语法错误而不是 404
  const res = await get('/_admin/assets/nope.js');
  expect(res.statusCode).toBe(404);
  expect(res.body).not.toContain('id="root"');
});

test('回退不外溢：公开页不存在的 short_name 仍然是 404 页面', async () => {
  const res = await get('/nope-not-a-real-page');
  expect(res.statusCode).toBe(404);
  expect(res.body).not.toContain('id="root"');
});

test('回退不外溢：接口的 404 不会变成后台首页', async () => {
  const res = await get('/_api/not-a-route');
  expect(res.statusCode).toBe(404);
  expect(res.body).not.toContain('id="root"');
});

test('构建产物不存在时给出可读的原因，而不是静默 404', async () => {
  // 最容易命中的时机是「服务恰好在 build 清空 dist 的那一刻启动」。
  // 检查只在启动时做一次，什么都不挂的话后台此后会一直 404，看着像路由配错。
  const empty = await mkdtemp(path.join(tmpdir(), 'lp-admin-empty-'));
  process.env.ADMIN_DIST = empty;
  const bare = await createTestContext();
  try {
    const res = await bare.app.inject({ method: 'GET', url: '/_admin/users' });
    expect(res.statusCode).toBe(503);
    expect(res.json().error).toBe('admin_not_built');

    // 这个降级分支同样不许外溢到公开页
    const publicPage = await bare.app.inject({ method: 'GET', url: '/nope-not-a-real-page' });
    expect(publicPage.statusCode).toBe(404);
  } finally {
    await bare.close();
    await rm(empty, { recursive: true, force: true });
    process.env.ADMIN_DIST = dist;
  }
});

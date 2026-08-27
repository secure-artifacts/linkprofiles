import { afterAll, beforeAll, expect, test } from 'vitest';
import { createUser } from './helpers/factories.js';
import { createTestContext, type TestContext } from './helpers/context.js';

let ctx: TestContext;

beforeAll(async () => {
  ctx = await createTestContext();
});

afterAll(async () => {
  await ctx.close();
});

test('访问已存在的 short_name，直出的 HTML 里有显示名与简介', async () => {
  await createUser(ctx.db, {
    shortName: 'mimnz',
    displayName: 'mimnz',
    bio: '我是一个基督徒，来自美国',
  });

  const res = await ctx.app.inject({ method: 'GET', url: '/mimnz' });

  expect(res.statusCode).toBe(200);
  expect(res.headers['content-type']).toContain('text/html');
  expect(res.body).toContain('<h1 class="pp-name">mimnz</h1>');
  expect(res.body).toContain('我是一个基督徒，来自美国');
});

test('页面不做 hydration：响应里没有 React runtime，也没有 hydration 标记', async () => {
  await createUser(ctx.db, { shortName: 'nohydrate', displayName: '无水合' });

  const res = await ctx.app.inject({ method: 'GET', url: '/nohydrate' });

  // 没有任何外链脚本，也没有 React 注水用的行内数据
  expect(res.body).not.toMatch(/<script[^>]+src=/i);
  expect(res.body).not.toContain('react');
  expect(res.body).not.toContain('__NEXT_DATA__');
  expect(res.body).not.toContain('self.__next');
  // renderToStaticMarkup 不产生 data-reactroot / <!--$--> 这类注水标记
  expect(res.body).not.toContain('data-reactroot');
  expect(res.body).not.toContain('<!--$-->');
});

test('不存在的 short_name 返回 404', async () => {
  const res = await ctx.app.inject({ method: 'GET', url: '/nobody-here' });

  expect(res.statusCode).toBe(404);
  expect(res.body).toContain('页面不存在');
});

test('short_name 大小写不敏感，不同大小写指向同一个页面', async () => {
  await createUser(ctx.db, { shortName: 'casetest', displayName: '大小写' });

  const lower = await ctx.app.inject({ method: 'GET', url: '/casetest' });
  const mixed = await ctx.app.inject({ method: 'GET', url: '/CaseTest' });
  const upper = await ctx.app.inject({ method: 'GET', url: '/CASETEST' });

  expect(lower.statusCode).toBe(200);
  expect(mixed.statusCode).toBe(200);
  expect(upper.statusCode).toBe(200);
  expect(mixed.body).toBe(lower.body);
  expect(upper.body).toBe(lower.body);
});

test('默认以 Classic 布局与 Dawn 主题渲染，缺少头像素材时用主题渐变填充', async () => {
  await createUser(ctx.db, { shortName: 'defaults', displayName: '默认' });

  const res = await ctx.app.inject({ method: 'GET', url: '/defaults' });

  expect(res.body).toContain('data-t="dawn"');
  expect(res.body).toContain('data-l="classic"');
  expect(res.body).toContain('class="hd hd-cls"');
  // 没有 <img>，头像位交给 .av-empty 用主题渐变填充
  expect(res.body).toContain('av av-empty');
  expect(res.body).not.toMatch(/<img[^>]*>/);
});

test('关键 CSS 内联进文档头', async () => {
  await createUser(ctx.db, { shortName: 'inlinecss', displayName: '内联' });

  const res = await ctx.app.inject({ method: 'GET', url: '/inlinecss' });

  const head = res.body.slice(0, res.body.indexOf('</head>'));
  expect(head).toContain('<style>');
  expect(head).toContain('.pp-lead');
  // 除了异步加载的字体（media="print" 换 all，及其 noscript 兜底），
  // head 里没有阻塞渲染的外链样式表
  const outsideNoscript = head.replaceAll(/<noscript>[\s\S]*?<\/noscript>/g, '');
  const blocking =
    outsideNoscript.match(/<link rel="stylesheet"(?![^>]*media="print")[^>]*>/g) ?? [];
  expect(blocking).toEqual([]);
});

test('系统路径不被个人页路由劫持', async () => {
  const res = await ctx.app.inject({ method: 'GET', url: '/_admin' });

  expect(res.statusCode).toBe(404);
});

test('管理员与超级管理员没有个人页', async () => {
  await createUser(ctx.db, { role: 'admin', shortName: 'someadmin', displayName: '管理员' });

  const res = await ctx.app.inject({ method: 'GET', url: '/someadmin' });

  expect(res.statusCode).toBe(404);
});

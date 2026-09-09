import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { createTestContext, type TestContext } from './helpers/context.js';
import { createLoginableUser } from './helpers/factories.js';
import { login, withSession } from './helpers/http.js';

let ctx: TestContext;
let userToken: string;
let profileId: string;
let shortName: string;

beforeAll(async () => {
  ctx = await createTestContext();
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.sql`truncate table users cascade`;
  const user = await createLoginableUser(ctx.db, 'user-pass', {
    account: 'page-lang',
    uiLanguage: 'fil',
    shortName: 'nieves',
    displayName: 'Nieves',
  });
  profileId = user.profileId!;
  shortName = user.shortName!;
  userToken = (await login(ctx, 'page-lang', 'user-pass')).token;
});

async function setPageLanguage(language: string) {
  const res = await ctx.app.inject({
    method: 'PATCH',
    url: `/_api/profiles/${profileId}`,
    payload: { pageLanguage: language },
    ...withSession(userToken),
  });
  expect(res.statusCode).toBe(200);
}

test('公开页按页面语言声明语言，并渲染对应的固定文案', async () => {
  await setPageLanguage('fil');
  const res = await ctx.app.inject({ method: 'GET', url: `/${shortName}` });

  expect(res.statusCode).toBe(200);
  expect(res.body).toContain('<html lang="fil">');
  expect(res.body).toContain('content="fil"');
});

test('同一个个人页对不同访客语言返回同一份语言声明', async () => {
  await setPageLanguage('fil');

  const zhVisitor = await ctx.app.inject({
    method: 'GET',
    url: `/${shortName}`,
    headers: { 'accept-language': 'zh-Hans' },
  });
  const enVisitor = await ctx.app.inject({
    method: 'GET',
    url: `/${shortName}`,
    headers: { 'accept-language': 'en-US,en;q=0.9' },
  });

  expect(zhVisitor.body).toContain('<html lang="fil">');
  expect(enVisitor.body).toContain('<html lang="fil">');
});

test('改页面语言只换固定文案，用户自己填的内容原样不动', async () => {
  await setPageLanguage('es');
  const res = await ctx.app.inject({ method: 'GET', url: `/${shortName}` });

  expect(res.body).toContain('<html lang="es">');
  expect(res.body).toContain('Nieves');
});

test('分享卡片的描述回落按页面语言渲染', async () => {
  await setPageLanguage('fil');
  const res = await ctx.app.inject({ method: 'GET', url: `/${shortName}` });

  // 简介留空时用回落描述，它是固定文案，跟着页面语言走
  expect(res.body).toContain('Mga contact at link ni Nieves');
});

test('地址不存在时的提示页固定英语', async () => {
  const res = await ctx.app.inject({
    method: 'GET',
    url: '/no-such-page',
    headers: { 'accept-language': 'zh-Hans,zh;q=0.9' },
  });

  expect(res.statusCode).toBe(404);
  expect(res.body).toContain('<html lang="en">');
  expect(res.body).toContain('Page not found');
});

test('新建个人页的页面语言跟所有者的界面语言', async () => {
  const [owner] = await ctx.sql`select id from users where account = 'page-lang'`;
  const res = await ctx.app.inject({
    method: 'POST',
    url: `/_api/users/${owner!['id']}/profiles`,
    payload: { shortName: 'nieves-two', displayName: 'Nieves 2' },
    ...withSession(userToken),
  });
  expect(res.statusCode).toBe(201);

  const [row] = await ctx.sql`select page_language from profiles where short_name = 'nieves-two'`;
  expect(row?.['page_language']).toBe('fil');
});

test('复制个人页时页面语言跟着源页走', async () => {
  await setPageLanguage('vi');
  const res = await ctx.app.inject({
    method: 'POST',
    url: `/_api/profiles/${profileId}/duplicate`,
    payload: { shortName: 'nieves-copy', displayName: 'Nieves copy' },
    ...withSession(userToken),
  });
  expect(res.statusCode).toBe(201);

  const [row] = await ctx.sql`select page_language from profiles where short_name = 'nieves-copy'`;
  expect(row?.['page_language']).toBe('vi');
});

test('白名单之外的页面语言被拒', async () => {
  const res = await ctx.app.inject({
    method: 'PATCH',
    url: `/_api/profiles/${profileId}`,
    payload: { pageLanguage: 'tl' },
    ...withSession(userToken),
  });
  expect(res.statusCode).toBe(400);
});

import { TYPEWRITER_STEP_MS } from '@link-profile/shared';
import { media, profiles } from '@link-profile/shared/schema';
import { eq } from 'drizzle-orm';
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
  await createUser(ctx.db, { shortName: 'realuser', displayName: '真用户' });

  // 没有挂任何东西的系统路径直接 404，不去查库
  const unmounted = await ctx.app.inject({ method: 'GET', url: '/_nothing-here' });
  expect(unmounted.statusCode).toBe(404);
  expect(unmounted.body).toContain('页面不存在');

  // 挂了后台的话 /_admin 是后台自己的响应，无论如何不会是一张个人页
  const admin = await ctx.app.inject({ method: 'GET', url: '/_admin' });
  expect(admin.body).not.toContain('class="pp"');
});

test('管理员与超级管理员没有个人页', async () => {
  await createUser(ctx.db, { role: 'admin', shortName: 'someadmin', displayName: '管理员' });

  const res = await ctx.app.inject({ method: 'GET', url: '/someadmin' });

  expect(res.statusCode).toBe(404);
});

test('桌面端有卡片断点，移动端形态不受影响', async () => {
  const res = await ctx.app.inject({ method: 'GET', url: '/mimnz' });

  // 断点本身
  expect(res.body).toContain('@media (min-width:768px)');
  // 卡片的三样：不被 flex 拉满、自己的圆角、自己的底色
  expect(res.body).toMatch(/@media \(min-width:768px\)\{[^}]*\.pp\{padding:56px 24px\}/);
  expect(res.body).toContain('border-radius:28px');

  // 卡片底色必须是主题渐变本身，不能是写死的白 ——
  // nocturne 那类深底浅字的主题，铺白会让文字直接看不见
  const desktop = res.body.slice(res.body.indexOf('@media (min-width:768px)'));
  expect(desktop.slice(0, 400)).toContain('background:var(--bg)');
});

test('简介打字机：开关关着时不带标记，开着才带', async () => {
  const off = await ctx.app.inject({ method: 'GET', url: '/mimnz' });
  // 只看那个 <p> 本身：脚本里有一句 '.pp-bio[data-tw]' 选择器，
  // 拿整篇 HTML 找 data-tw 会被它命中
  expect(off.body).toContain('<p class="pp-bio">');
  expect(off.body).not.toContain('<p class="pp-bio" data-tw');

  await ctx.db.update(profiles).set({ bioTypewriter: true }).where(eq(profiles.shortName, 'mimnz'));

  const on = await ctx.app.inject({ method: 'GET', url: '/mimnz' });
  expect(on.body).toContain('<p class="pp-bio" data-tw');
  // 全文始终在 DOM 里：没有 JS 时它就是一段普通简介，不是空节点
  expect(on.body).toContain('我是一个基督徒，来自美国');
});

test('打字机那段脚本尊重减少动效，且先钉住高度防跳动', async () => {
  const res = await ctx.app.inject({ method: 'GET', url: '/mimnz' });
  expect(res.body).toContain('prefers-reduced-motion: reduce');
  // 清空前先固定高度，否则底下整列条目会往上跳一帧
  expect(res.body).toContain('minHeight');
});

test('打字机拖不垮点击埋点：排在它之后，且单独 try 起来', async () => {
  const res = await ctx.app.inject({ method: 'GET', url: '/mimnz' });

  const clickListener = res.body.indexOf("addEventListener('click'");
  const typewriter = res.body.indexOf('.pp-bio[data-tw]');
  expect(clickListener).toBeGreaterThan(-1);
  expect(typewriter).toBeGreaterThan(-1);

  // 埋点是线索统计的唯一来源，装饰功能没有资格排在它前面、也不许让它挂掉
  expect(clickListener).toBeLessThan(typewriter);
  expect(res.body.slice(clickListener, typewriter)).toContain('try{');
  // 老 webview 可能没有 matchMedia，取值前要先探测
  expect(res.body).toContain('!window.matchMedia');
});

test('静音切换同样排在埋点之后，且单独 try 起来', async () => {
  const res = await ctx.app.inject({ method: 'GET', url: '/mimnz' });

  const clickListener = res.body.indexOf("addEventListener('click'");
  const mute = res.body.indexOf(".querySelector('.pp-mute')");
  expect(mute).toBeGreaterThan(-1);
  expect(clickListener).toBeLessThan(mute);
  expect(res.body.slice(clickListener, mute)).toContain('try{');
});

test('打字机速度取自 shared 那个唯一常量', async () => {
  const res = await ctx.app.inject({ method: 'GET', url: '/mimnz' });
  // 两份实现（内联脚本与后台预览）共用一个数字，插值没接上就会退回字面量
  expect(res.body).toContain(`setTimeout(tick,${TYPEWRITER_STEP_MS})`);
});

test('静音按钮只在头像位放了视频时才出现', async () => {
  // mimnz 没有视频头像：不该凭空多一个点了没用的按钮
  const withoutVideo = await ctx.app.inject({ method: 'GET', url: '/mimnz' });
  expect(withoutVideo.body).not.toContain('class="pp-mute"');

  const created = await createUser(ctx.db, { shortName: 'hasvideo', displayName: '视频头像' });
  const profileId = created.profileId!;
  const [videoRow] = await ctx.db
    .insert(media)
    .values({
      profileId,
      kind: 'video',
      directory: `${profileId}/vid`,
      durationMs: 8_000,
      variants: [
        {
          format: 'mp4',
          mimeType: 'video/mp4',
          path: `${profileId}/vid/video.mp4`,
          width: 720,
          height: 720,
          bytes: 1_024,
        },
      ],
    })
    .returning();
  const [posterRow] = await ctx.db
    .insert(media)
    .values({
      profileId,
      kind: 'image',
      directory: `${profileId}/poster`,
      variants: [
        {
          format: 'webp',
          mimeType: 'image/webp',
          path: `${profileId}/poster/image.webp`,
          width: 720,
          height: 720,
          bytes: 512,
        },
      ],
    })
    .returning();
  await ctx.db
    .update(profiles)
    .set({ avatarMediaId: videoRow!.id, avatarPosterId: posterRow!.id })
    .where(eq(profiles.id, profileId));

  const withVideo = await ctx.app.inject({ method: 'GET', url: '/hasvideo' });
  // 视频本身的渲染规则：默认静音、循环、行内播放，靠 data-autoplay 交给脚本延迟起播
  expect(withVideo.body).toContain('data-autoplay');
  expect(withVideo.body).toMatch(/<video[^>]*\bmuted\b/);
  expect(withVideo.body).toMatch(/<video[^>]*\bloop\b/);
  // 按钮出现，且默认停在「静音」那一态
  expect(withVideo.body).toContain('class="pp-mute"');
  expect(withVideo.body).toContain('aria-pressed="false"');
  // 两枚图标都得 SSR 出来 —— 公开页没有 JS 能在点击时换图标
  expect(withVideo.body).toContain('class="off"');
  expect(withVideo.body).toContain('class="on"');
});

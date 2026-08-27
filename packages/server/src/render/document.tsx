import { ProfilePage, profileCss, type ProfileView } from '@link-profile/profile-ui';
import { renderToStaticMarkup } from 'react-dom/server';
import { CLIENT_SCRIPT } from './client-script.js';

/**
 * 设计稿的展示字型。异步加载并带 swap，字体没到之前先用系统字体渲染，
 * 不阻塞首屏。
 */
const FONT_HREF =
  'https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,600;12..96,800&display=swap';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export interface RenderProfileOptions {
  profile: ProfileView;
}

/**
 * 服务端直出个人页。
 *
 * 用 `renderToStaticMarkup` 而不是 `renderToString`：后者会带上 hydration 用的
 * 标记，而公开页**不做 hydration** —— 浏览器不下载也不解析 React runtime，
 * 客户端只留一小段原生 JS 负责埋点。这是移动端 LCP 的硬约束，见 ADR-0004。
 */
export function renderProfileDocument({ profile }: RenderProfileOptions): string {
  const body = renderToStaticMarkup(<ProfilePage profile={profile} priority />);

  // LCP 元素是头像位那张图：放视频时就是它的封面图，不是视频本身。
  const lcpImage = profile.video?.poster ?? profile.avatar?.src ?? null;
  const preloads = [
    lcpImage
      ? `<link rel="preload" as="image" href="${escapeHtml(lcpImage)}" fetchpriority="high">`
      : '',
    // 背景图铺满整屏，同样值得早点开始下载，但优先级低于头像位。
    profile.background
      ? `<link rel="preload" as="image" href="${escapeHtml(profile.background.src)}">`
      : '',
  ].join('');

  return [
    '<!doctype html>',
    '<html lang="zh">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    `<title>${escapeHtml(profile.displayName)}</title>`,
    // 关键 CSS 内联进文档头，其余异步加载。
    `<style>${profileCss}</style>`,
    preloads,
    '<link rel="preconnect" href="https://fonts.googleapis.com">',
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
    `<link rel="stylesheet" href="${FONT_HREF}" media="print" onload="this.media='all'">`,
    `<noscript><link rel="stylesheet" href="${FONT_HREF}"></noscript>`,
    '</head>',
    '<body>',
    body,
    // 唯一的客户端脚本：内联、几百字节，不是 React runtime。
    `<script>${CLIENT_SCRIPT}</script>`,
    '</body>',
    '</html>',
  ]
    .filter(Boolean)
    .join('');
}

/**
 * 地址写错、或指向已注销用户的旧链接，都得到明确的 404，
 * 而不是空白页、报错页、或另一个陌生人的页面。
 */
export function renderNotFoundDocument(): string {
  return [
    '<!doctype html>',
    '<html lang="zh">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    '<title>页面不存在</title>',
    '<style>body{margin:0;min-height:100dvh;display:grid;place-items:center;background:#F6F7F8;',
    'color:#14161A;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif}',
    'main{text-align:center;padding:24px}h1{font-size:20px;margin:0 0 8px}',
    'p{margin:0;color:#5A616B;font-size:14px}</style>',
    '</head>',
    '<body><main><h1>页面不存在</h1><p>这个地址没有对应的个人页。</p></main></body>',
    '</html>',
  ].join('');
}

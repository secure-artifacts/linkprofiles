import { ProfilePage, profileCss, type ProfileView } from '@link-profile/profile-ui';
import { renderToStaticMarkup } from 'react-dom/server';
import { CLIENT_SCRIPT } from './client-script.js';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export interface RenderProfileOptions {
  profile: ProfileView;
  /** 页面自己的绝对地址。og 标签里的地址必须是绝对的，爬虫不解析相对路径。 */
  canonicalUrl: string;
  /** 分享卡片预览图的绝对地址 */
  previewImageUrl: string;
  /** 后台静态缩略图不需要跳转和埋点脚本。 */
  interactive?: boolean;
}

/**
 * 分享卡片与收录控制。
 *
 * `noindex` 与 og 标签**并行不冲突**：前者是给搜索引擎索引器看的，
 * 后者是给社媒爬虫抓预览用的，两者读的是不同的标签。个人页不该被
 * 搜索引擎收录，但转发到 WhatsApp 时必须能出卡片。
 */
function metaTags(profile: ProfileView, canonicalUrl: string, previewImageUrl: string): string {
  const title = profile.displayName || '个人页';
  const description = profile.bio || `${title} 的联系方式与链接`;

  return [
    // 阻止搜索引擎收录。社媒爬虫不读这条。
    '<meta name="robots" content="noindex, nofollow">',

    `<meta property="og:type" content="profile">`,
    `<meta property="og:title" content="${escapeHtml(title)}">`,
    `<meta property="og:description" content="${escapeHtml(description)}">`,
    `<meta property="og:url" content="${escapeHtml(canonicalUrl)}">`,
    `<meta property="og:image" content="${escapeHtml(previewImageUrl)}">`,

    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${escapeHtml(title)}">`,
    `<meta name="twitter:description" content="${escapeHtml(description)}">`,
    `<meta name="twitter:image" content="${escapeHtml(previewImageUrl)}">`,
  ].join('');
}

/**
 * 服务端直出个人页。
 *
 * 用 `renderToStaticMarkup` 而不是 `renderToString`：后者会带上 hydration 用的
 * 标记，而公开页**不做 hydration** —— 浏览器不下载也不解析 React runtime，
 * 客户端只留一小段原生 JS 负责埋点。这是移动端 LCP 的硬约束，见 ADR-0004。
 */
export function renderProfileDocument({
  profile,
  canonicalUrl,
  previewImageUrl,
  interactive = true,
}: RenderProfileOptions): string {
  const body = renderToStaticMarkup(<ProfilePage profile={profile} priority />);

  // Banner 的横幅占比最大；其他布局的 LCP 是头像位图片（视频时为首帧封面）。
  const lcpImage =
    profile.layout === 'banner'
      ? (profile.banner?.src ?? profile.video?.poster ?? profile.avatar?.src ?? null)
      : (profile.video?.poster ?? profile.avatar?.src ?? null);
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
    metaTags(profile, canonicalUrl, previewImageUrl),
    // 关键 CSS 内联进文档头，其余异步加载。
    `<style>${profileCss}</style>`,
    preloads,
    '</head>',
    '<body>',
    body,
    // 唯一的客户端脚本：内联、几百字节，不是 React runtime。
    interactive ? `<script>${CLIENT_SCRIPT}</script>` : '',
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

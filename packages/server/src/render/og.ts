import { THEMES, type Theme } from '@link-profile/profile-ui';
import sharp from 'sharp';

/**
 * 分享卡片的占位预览图。
 *
 * 用户没传头像也没传头图时，og:image 回落到一张与当前主题一致的渐变图 ——
 * 转发到 WhatsApp 时对方看到的仍然是一张成型的卡片，而不是一行光秃秃的地址。
 *
 * 输出 PNG 而不是 SVG：不少社媒爬虫不认 SVG 的 og:image。
 * 1200×630 是各平台通用的分享卡片比例。
 */
const WIDTH = 1200;
const HEIGHT = 630;

const cache = new Map<Theme, Buffer>();

export async function themePlaceholderPng(theme: Theme): Promise<Buffer> {
  const cached = cache.get(theme);
  if (cached) return cached;

  const tokens = THEMES[theme];
  const [from, mid, to] = tokens.gradient;

  // 168deg 的渐变在 1200×630 上按对角线近似
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="0.35" y2="1">
        <stop offset="0" stop-color="${from}"/>
        <stop offset="0.52" stop-color="${mid}"/>
        <stop offset="1" stop-color="${to}"/>
      </linearGradient>
    </defs>
    <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#g)"/>
  </svg>`;

  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  cache.set(theme, png);
  return png;
}

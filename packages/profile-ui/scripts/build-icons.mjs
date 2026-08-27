// 从 simple-icons（CC0）抽出清单里用到的品牌图形，生成一个小模块。
//
// 直接 import simple-icons 会把三千多个图标拖进产物；这里只取需要的十来个，
// 并保留各平台注册品牌色（商标归各自权利人所有）。
//
// 清单变了就重跑：pnpm --filter @link-profile/profile-ui build:icons
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as si from 'simple-icons';

const pkgDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(pkgDir, 'src/generated/icons.ts');

// key 为 SocialPlatformId，值为 simple-icons 的导出名。
const FROM_SIMPLE_ICONS = {
  whatsapp: 'siWhatsapp',
  messenger: 'siMessenger',
  telegram: 'siTelegram',
  signal: 'siSignal',
  instagram: 'siInstagram',
  facebook: 'siFacebook',
  youtube: 'siYoutube',
  tiktok: 'siTiktok',
  x: 'siX',
  threads: 'siThreads',
  snapchat: 'siSnapchat',
  pinterest: 'siPinterest',
};

// email 不是品牌，simple-icons 里没有；用设计稿里那枚描边信封。
const HAND_DRAWN = {
  email: {
    hex: '4A5058',
    body:
      '<path fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round" ' +
      'd="M3 6.5h18v11H3zM3 7l9 6 9-6"/>',
  },
};

const entries = [];
for (const [id, exportName] of Object.entries(FROM_SIMPLE_ICONS)) {
  const icon = si[exportName];
  if (!icon) throw new Error(`simple-icons 里没有 ${exportName}（${id}）`);
  entries.push([id, { hex: `#${icon.hex}`, body: `<path fill="#${icon.hex}" d="${icon.path}"/>` }]);
}
for (const [id, icon] of Object.entries(HAND_DRAWN)) {
  entries.push([id, { hex: `#${icon.hex}`, body: icon.body }]);
}

// 链接右端那枚指向箭头，不属于任何品牌。
const CHEVRON =
  '<path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" ' +
  'stroke-linejoin="round" d="m9 5 7 7-7 7"/>';

writeFileSync(
  out,
  [
    '// 由 scripts/build-icons.mjs 生成，请勿手改。',
    '// 品牌图形取自 Simple Icons（CC0），商标归各自权利人所有。',
    '',
    'export interface BrandIcon {',
    '  hex: string;',
    '  /** 24×24 viewBox 内的 SVG 内容 */',
    '  body: string;',
    '}',
    '',
    `export const BRAND_ICONS: Record<string, BrandIcon> = ${JSON.stringify(
      Object.fromEntries(entries),
      null,
      2,
    )};`,
    '',
    `export const CHEVRON_ICON = ${JSON.stringify(CHEVRON)};`,
    '',
  ].join('\n'),
);
console.log(`生成 ${entries.length} 枚品牌图形 -> src/generated/icons.ts`);

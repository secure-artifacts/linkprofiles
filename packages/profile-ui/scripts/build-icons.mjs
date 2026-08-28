// 从 simple-icons（CC0）抽出清单里用到的品牌图形，生成一个小模块。
//
// 直接 import simple-icons 会把三千多个图标拖进产物；这里只取需要的十来个，
// 并保留各平台注册品牌色（商标归各自权利人所有）。
//
// 清单变了就重跑：pnpm --filter @link-profile/profile-ui build:icons
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as si from 'simple-icons';

const require = createRequire(import.meta.url);

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

/**
 * LinkedIn 不在 simple-icons 里（上游因商标政策移除），改从
 * `@ant-design/icons-svg`（MIT）取。它的 viewBox 是 64 64 896 896 而不是
 * 0 0 24 24，所以生成的数据要带上各自的 viewBox。
 * 图形本身是单色的，这里补上 LinkedIn 的注册品牌色。
 */
const FROM_ANT_DESIGN = {
  linkedin: { module: '@ant-design/icons-svg/lib/asn/LinkedinFilled.js', hex: '0A66C2' },
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

const DEFAULT_VIEW_BOX = '0 0 24 24';

const entries = [];
for (const [id, exportName] of Object.entries(FROM_SIMPLE_ICONS)) {
  const icon = si[exportName];
  if (!icon) throw new Error(`simple-icons 里没有 ${exportName}（${id}）`);
  entries.push([
    id,
    {
      hex: `#${icon.hex}`,
      viewBox: DEFAULT_VIEW_BOX,
      body: `<path fill="#${icon.hex}" d="${icon.path}"/>`,
    },
  ]);
}

for (const [id, source] of Object.entries(FROM_ANT_DESIGN)) {
  const loaded = require(source.module);
  const definition = loaded.default ?? loaded;
  const svg = definition.icon;
  const paths = svg.children.filter((child) => child.tag === 'path');
  if (paths.length === 0) throw new Error(`${source.module} 里没有 path（${id}）`);

  entries.push([
    id,
    {
      hex: `#${source.hex}`,
      viewBox: svg.attrs.viewBox,
      body: paths.map((child) => `<path fill="#${source.hex}" d="${child.attrs.d}"/>`).join(''),
    },
  ]);
}

for (const [id, icon] of Object.entries(HAND_DRAWN)) {
  entries.push([id, { hex: `#${icon.hex}`, viewBox: DEFAULT_VIEW_BOX, body: icon.body }]);
}

// 链接右端那枚指向箭头，不属于任何品牌。
const CHEVRON =
  '<path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" ' +
  'stroke-linejoin="round" d="m9 5 7 7-7 7"/>';

// 没传头像时的占位剪影。不是品牌图形，与手绘的 email 图标一样属于自备素材。
// 颜色写死成中性灰而不是 currentColor：它要在六个主题、五种布局的底色上
// 都读得出来，跟着文字色走反而会在深色主题里糊成一片。
const AVATAR_PLACEHOLDER =
  '<circle cx="48" cy="48" r="48" fill="#C9CDD4"/>' +
  '<circle cx="48" cy="38.5" r="17" fill="#EDEFF2"/>' +
  '<path fill="#EDEFF2" d="M14.5 90.5a34 34 0 0 1 67 0z"/>';

// 视频头像右上角那个静音开关的两态。两枚共用同一个喇叭本体，只换右边那截，
// 这样切换时喇叭不会跳。用 currentColor：按钮自带深色底，颜色由按钮决定。
const SPEAKER_BODY =
  '<path fill="currentColor" d="M11 5 6 9H3a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h3l5 4z"/>';
const MUTED =
  SPEAKER_BODY +
  '<path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="m16 9 5 6M21 9l-5 6"/>';
const SOUND =
  SPEAKER_BODY +
  '<path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/>';

writeFileSync(
  out,
  [
    '// 由 scripts/build-icons.mjs 生成，请勿手改。',
    '// 品牌图形取自 Simple Icons（CC0）与 @ant-design/icons-svg（MIT），',
    '// 商标归各自权利人所有。',
    '',
    'export interface BrandIcon {',
    '  hex: string;',
    '  /** 各来源的 viewBox 不一定相同，渲染时按这个值给 */',
    '  viewBox: string;',
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
    `export const AVATAR_PLACEHOLDER_ICON = ${JSON.stringify(AVATAR_PLACEHOLDER)};`,
    '',
    `export const MUTED_ICON = ${JSON.stringify(MUTED)};`,
    '',
    `export const SOUND_ICON = ${JSON.stringify(SOUND)};`,
    '',
  ].join('\n'),
);
console.log(`生成 ${entries.length} 枚品牌图形 -> src/generated/icons.ts`);

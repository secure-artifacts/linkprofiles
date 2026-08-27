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
  ].join('\n'),
);
console.log(`生成 ${entries.length} 枚品牌图形 -> src/generated/icons.ts`);

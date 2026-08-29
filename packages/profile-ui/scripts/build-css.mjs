// 把主题令牌生成 CSS，再用 tailwind 编译，最后固化成一个 TS 模块。
//
// 公开页要求关键 CSS 内联进 <head>，而 server 产物由 tsup 打成单文件、
// 运行时没有可靠的包目录可以读文件；admin 侧的 iframe 预览也要拿到同一份样式。
// 因此编译结果以源码形式提交，两处都当普通模块 import，无需构建即可消费。
//
// 主题令牌的唯一来源是 src/themes.ts —— 这里从它生成 generated/themes.css，
// 对比度测试也读同一张表，CSS 与测试不会各说各话。
//
// 改了 styles.css 或 themes.ts 就重跑：
//   pnpm --filter @link-profile/profile-ui build:css
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { THEMES } from '../src/themes.ts';

const require = createRequire(import.meta.url);

const pkgDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const input = path.join(pkgDir, 'src/styles.css');
const themesCss = path.join(pkgDir, 'src/generated/themes.css');
const tmp = path.join(pkgDir, 'src/generated/profile.css');
const out = path.join(pkgDir, 'src/generated/css.ts');

mkdirSync(path.dirname(tmp), { recursive: true });

function tokenBlock(tokens) {
  const [from, mid, to] = tokens.gradient;
  return [
    `  --bg: linear-gradient(168deg, ${from} 0%, ${mid} 52%, ${to} 100%);`,
    `  --bgend: ${tokens.bgend};`,
    `  --surface: ${tokens.surface};`,
    `  --on-surface: ${tokens.onSurface};`,
    `  --text: ${tokens.text};`,
    `  --muted: ${tokens.muted};`,
    `  --r: ${tokens.radius};`,
  ].join('\n');
}

// 第一套（Dawn）落在 .pp 上当默认值，其余按 data-t 覆盖。
// 主题只是这组变量的取值，结构完全不变；圆角是主题的一部分。
const [defaultId, ...rest] = Object.keys(THEMES);
const css = [
  '/* 由 scripts/build-css.mjs 从 src/themes.ts 生成，请勿手改。 */',
  '@layer components {',
  `  .pp {\n${tokenBlock(THEMES[defaultId]).replace(/^/gm, '  ')}\n  }`,
  ...rest.map(
    (id) => `  .pp[data-t='${id}'] {\n${tokenBlock(THEMES[id]).replace(/^/gm, '  ')}\n  }`,
  ),
  '}',
  '',
].join('\n');
writeFileSync(themesCss, css);

// 直接用当前 Node 执行 CLI 入口，避开 Windows 无法从 execFileSync 运行 .cmd 的问题。
const tailwindCli = path.join(
  path.dirname(require.resolve('@tailwindcss/cli/package.json')),
  'dist/index.mjs',
);
execFileSync(process.execPath, [tailwindCli, '-i', input, '-o', tmp, '--minify'], {
  cwd: pkgDir,
  stdio: 'inherit',
});

const compiled = readFileSync(tmp, 'utf8').trim();
writeFileSync(
  out,
  `// 由 scripts/build-css.mjs 从 src/styles.css 生成，请勿手改。\n` +
    `export const profileCss = ${JSON.stringify(compiled)};\n`,
);
console.log(`profile.css -> src/generated/css.ts (${(compiled.length / 1024).toFixed(1)} KB)`);

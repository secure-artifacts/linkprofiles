// 把 tailwind 编译结果固化成一个 TS 模块。
//
// 公开页要求关键 CSS 内联进 <head>，而 server 产物由 tsup 打成单文件、
// 运行时没有可靠的包目录可以读文件；admin 侧的 iframe 预览也要拿到同一份样式。
// 因此编译结果以源码形式提交，两处都当普通模块 import，无需构建即可消费。
//
// 改了 styles.css 就重跑：pnpm --filter @link-profile/profile-ui build:css
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pkgDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const input = path.join(pkgDir, 'src/styles.css');
const tmp = path.join(pkgDir, 'src/generated/profile.css');
const out = path.join(pkgDir, 'src/generated/css.ts');

mkdirSync(path.dirname(tmp), { recursive: true });
execFileSync('pnpm', ['exec', 'tailwindcss', '-i', input, '-o', tmp, '--minify'], {
  cwd: pkgDir,
  stdio: 'inherit',
});

const css = readFileSync(tmp, 'utf8').trim();
writeFileSync(
  out,
  `// 由 scripts/build-css.mjs 从 src/styles.css 生成，请勿手改。\n` +
    `export const profileCss = ${JSON.stringify(css)};\n`,
);
console.log(`profile.css -> src/generated/css.ts (${(css.length / 1024).toFixed(1)} KB)`);

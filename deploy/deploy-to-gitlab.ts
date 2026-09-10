/**
 * 把部署产物推到内网 GitLab，由那边的 CI 部署到公司服务器。
 *
 * 为什么要这么一条链路：外包开发者进不了内网 GitLab，只能往 GitHub 提交，所以源码留在 GitHub；
 * 而要上服务器的东西得进内网。这个脚本在中间做转换 —— 构建、挑出真正要跑的文件、作为一个提交推过去。
 *
 * 地址与凭据全靠一个预先配好的名为 `gitlab` 的 remote，脚本本身不含任何秘密，
 * 外包开发者跑它会停在「没有 gitlab remote」那一步，正是想要的结果。
 *
 * 用法：pnpm deployToGitlab [--branch <名字>] [--yes] [--allow-unpushed] [--adopt] [--force] [--reseed]
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { builtinModules } from 'node:module';
import { createInterface } from 'node:readline/promises';
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
  mkdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  checkDependencies,
  commitMessage,
  externalImports,
  MANAGED_PATHS,
  MANIFEST_PATH,
  SEED_ONCE_PATHS,
  type DeployManifest,
} from './artifact.js';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const TEMPLATES = join(REPO, 'deploy', 'templates');
const REMOTE = 'gitlab';

const argv = process.argv.slice(2);
const flag = (name: string) => argv.includes(`--${name}`);
const option = (name: string) => {
  const at = argv.indexOf(`--${name}`);
  return at === -1 ? undefined : argv[at + 1];
};

function fail(message: string): never {
  console.error(`\n✗ ${message}\n`);
  process.exit(1);
}

function step(message: string) {
  console.log(`▸ ${message}`);
}

/** 跑一条命令并拿回标准输出。失败直接抛，调用方决定要不要兜。 */
function run(command: string, args: string[], cwd = REPO): string {
  return execFileSync(command, args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

/**
 * 跑一条命令，输出直通终端。用于构建这种要看进度的。
 *
 * **stdin 一律掐掉，CI 置真**：这些步骤没有一个该向人提问。放开 stdin 的话，
 * pnpm 的「要不要重装 node_modules」会卡在那儿等回车，vitest 也会挂着等交互指令，
 * 整条命令就此停住。唯一该问人的是推送前那次确认，它自己开 readline。
 */
function runLoud(command: string, args: string[], cwd = REPO): void {
  const result = spawnSync(command, args, {
    cwd,
    stdio: ['ignore', 'inherit', 'inherit'],
    env: { ...process.env, CI: 'true' },
  });
  if (result.status !== 0) fail(`${command} ${args.join(' ')} 失败`);
}

function tryRun(command: string, args: string[], cwd = REPO): string | null {
  try {
    return run(command, args, cwd);
  } catch {
    return null;
  }
}

// ---------- 前置检查 ----------

function checkRemote(): string {
  const url = tryRun('git', ['remote', 'get-url', REMOTE]);
  if (!url) {
    fail(
      `没有名为 ${REMOTE} 的 remote。先配上内网地址再来：\n\n` +
        `    git remote add ${REMOTE} git@your-gitlab:group/link-profile-deploy.git\n` +
        `    git ls-remote ${REMOTE}\n\n` +
        `完整步骤见 docs/deployment.md 第 9 节「一次性准备：绑定 gitlab remote」。\n` +
        `这一步只有内网人员做得了，外包开发者不需要也不应该有这个地址。`,
    );
  }
  const origin = tryRun('git', ['remote', 'get-url', 'origin']);
  if (url === origin)
    fail(`${REMOTE} 与 origin 指向同一个地址，产物会覆盖源码仓库。检查 remote 配置。`);
  if (/github\.com/i.test(url))
    fail(`${REMOTE} 指向 github.com（${url}），这是源码仓库的地方，不是产物仓库。`);
  return url;
}

function checkCleanTree(when: string) {
  const dirty = run('git', ['status', '--porcelain']);
  if (dirty) {
    fail(
      `${when}工作区不干净：\n\n${dirty}\n\n` +
        (when.startsWith('构建后')
          ? '构建重写了已提交的生成文件，说明仓库里那份是旧的。先提交它们，否则部署消息里的 sha 对不上真正打出来的东西。'
          : '产物要能对回一个确定的提交，先提交或还原。'),
    );
  }
}

function checkPushed() {
  tryRun('git', ['fetch', 'origin', '--quiet']);
  const branch = run('git', ['rev-parse', '--abbrev-ref', 'HEAD']);
  const upstream = tryRun('git', ['rev-parse', '--verify', `origin/${branch}`]);
  if (!upstream) {
    console.warn(`⚠ origin 上没有 ${branch} 分支，跳过「已推送」检查`);
    return;
  }
  const merged =
    tryRun('git', ['merge-base', '--is-ancestor', 'HEAD', `origin/${branch}`]) !== null;
  if (!merged && !flag('allow-unpushed')) {
    fail(
      `HEAD 还没推到 origin/${branch}。部署消息里会写这个 sha，别人拉不到就永远查不清线上是哪一版。\n` +
        `先 git push，或明确用 --allow-unpushed 跳过。`,
    );
  }
}

// ---------- 组装 ----------

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

function buildManifest(): DeployManifest {
  const pkg = readJson<{ version: string }>(join(REPO, 'package.json'));
  return {
    version: pkg.version,
    commit: run('git', ['rev-parse', 'HEAD']),
    describe: tryRun('git', ['describe', '--tags']),
    builtAt: new Date().toISOString(),
    builtBy: `${tryRun('git', ['config', 'user.name']) ?? 'unknown'} <${tryRun('git', ['config', 'user.email']) ?? ''}>`,
    node: process.version,
  };
}

/** 校验 bundle 引到的包都在 server 的依赖清单里，漏一个镜像就起不来。 */
function checkBundleDependencies() {
  const bundle = readdirSync(join(REPO, 'packages/server/dist'))
    .filter((name) => name.endsWith('.js'))
    .map((name) => readFileSync(join(REPO, 'packages/server/dist', name), 'utf8'))
    .join('\n');
  const pkg = readJson<{ dependencies: Record<string, string> }>(
    join(REPO, 'packages/server/package.json'),
  );
  const { missing, unused } = checkDependencies(
    externalImports(bundle, builtinModules),
    pkg.dependencies,
  );

  if (missing.length > 0) {
    fail(`打包产物引了这些包，但 packages/server/package.json 没声明：\n  ${missing.join('\n  ')}`);
  }
  if (unused.length > 0) {
    console.warn(`⚠ 声明了但产物没用到（白装，不致命）：${unused.join('、')}`);
  }
}

/** 不给 DATABASE_URL 跑一次，证明 bundle 能解析、顶层 import 全都解析得到。 */
function smokeTest() {
  const result = spawnSync(process.execPath, ['dist/index.js'], {
    cwd: join(REPO, 'packages/server'),
    encoding: 'utf8',
    env: { ...process.env, DATABASE_URL: '', NODE_ENV: 'production' },
    timeout: 30_000,
  });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  if (!output.includes('Environment validation failed')) {
    fail(`产物冒烟失败，bundle 可能有解析不了的 import：\n${output.slice(0, 800)}`);
  }
}

function copyArtifacts(work: string) {
  // 每个受管路径先删干净再写。后台资源文件名带内容哈希，合并式复制会让废弃资源越积越多。
  for (const path of MANAGED_PATHS) rmSync(join(work, path), { recursive: true, force: true });

  cpSync(join(REPO, 'packages/server/dist'), join(work, 'dist'), {
    recursive: true,
    // sourcemap 里嵌着完整 TypeScript 源码，带过去等于把源码推进内网仓库
    filter: (src) => !src.endsWith('.map'),
  });
  cpSync(join(REPO, 'packages/admin/dist'), join(work, 'public/_admin'), { recursive: true });
  cpSync(join(REPO, 'packages/server/assets/fonts'), join(work, 'fonts'), { recursive: true });

  // 只带 SQL：meta/ 是 drizzle-kit 生成迁移时用的快照，运行时读的只有 *.sql
  mkdirSync(join(work, 'drizzle'), { recursive: true });
  for (const name of readdirSync(join(REPO, 'drizzle')).filter((n) => n.endsWith('.sql'))) {
    cpSync(join(REPO, 'drizzle', name), join(work, 'drizzle', name));
  }

  // 依赖清单：锁的是整棵树，同一个提交任何时候构建出来都一样
  for (const name of ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml']) {
    cpSync(join(REPO, name), join(work, name));
  }
  for (const pkg of readdirSync(join(REPO, 'packages'))) {
    const manifest = join(REPO, 'packages', pkg, 'package.json');
    if (!existsSync(manifest)) continue;
    mkdirSync(join(work, 'packages', pkg), { recursive: true });
    cpSync(manifest, join(work, 'packages', pkg, 'package.json'));
  }

  cpSync(join(TEMPLATES, 'Dockerfile'), join(work, 'Dockerfile'));
  cpSync(join(TEMPLATES, 'dockerignore'), join(work, '.dockerignore'));
  cpSync(join(TEMPLATES, 'gitignore'), join(work, '.gitignore'));
  cpSync(join(TEMPLATES, 'README.md'), join(work, 'README.md'));
  cpSync(join(TEMPLATES, '运维部署手册.md'), join(work, '运维部署手册.md'));
  // 产物仓库的 .env.example 要讲 APP_IMAGE，与源仓库那份不是一回事
  cpSync(join(TEMPLATES, 'env.example'), join(work, '.env.example'));

  // 只写一次：流水线与 compose 是内网团队按现场改的，覆盖会把他们的活抹掉
  const seeds: Record<string, string> = {
    '.gitlab-ci.yml': 'gitlab-ci.skeleton.yml',
    'docker-compose.yml': 'docker-compose.yml',
  };
  for (const target of SEED_ONCE_PATHS) {
    if (existsSync(join(work, target))) continue;
    cpSync(join(TEMPLATES, seeds[target]!), join(work, target));
    step(`首次写入 ${target}（之后不再覆盖）`);
  }
}

async function confirm(question: string): Promise<boolean> {
  if (flag('yes')) return true;
  if (!process.stdin.isTTY) {
    fail('不是交互终端，无法确认。要在自动化里跑请加 --yes。');
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`${question} [y/N] `);
  rl.close();
  return answer.trim().toLowerCase() === 'y';
}

// ---------- 主流程 ----------

async function main() {
  const url = checkRemote();
  checkCleanTree('');
  checkPushed();

  step('装依赖');
  runLoud('pnpm', ['install', '--frozen-lockfile']);

  step('类型检查');
  // pnpm build 是 tsup + vite，两者都不做类型检查，只有三个包的 build 恰好是 tsc --noEmit。
  // 不单独跑这一步，server 与 admin 的类型错误会一路进产物。
  runLoud('pnpm', ['typecheck']);

  step('版本号一致性');
  runLoud('pnpm', ['exec', 'vitest', 'run', 'packages/admin/src/changelog/entries.test.ts']);

  step('构建');
  runLoud('pnpm', ['build']);

  checkCleanTree('构建后');
  checkBundleDependencies();
  step('产物冒烟');
  smokeTest();

  const manifest = buildManifest();
  const branch =
    option('branch') ??
    tryRun('git', ['ls-remote', '--symref', REMOTE, 'HEAD'])?.match(
      /^ref: refs\/heads\/(\S+)/m,
    )?.[1] ??
    'main';

  const work = mkdtempSync(join(tmpdir(), 'link-profile-deploy-'));
  try {
    const force = flag('force');
    step(`拉取 ${REMOTE}/${branch}`);
    run('git', ['init', '--quiet', '--initial-branch', branch], work);
    run('git', ['remote', 'add', REMOTE, url], work);
    const fetched = tryRun('git', ['fetch', '--depth', '1', REMOTE, branch], work) !== null;

    // 强制模式不继承远端历史：目标仓库里若原本是源码，继承过来之后
    // 那些不在受管清单里的文件（docs/、CONTEXT.md 之类）会一直留着，
    // 得到一个半源码半产物的仓库。要干净就得从孤儿提交重建。
    if (fetched && !force) {
      run('git', ['reset', '--hard', `${REMOTE}/${branch}`], work);
    } else if (!fetched) {
      step('远端还是空的，这是第一次部署');
    } else {
      step('强制模式：丢弃远端历史，以孤儿提交重建');
    }

    /** 强制模式下工作区是空的，远端的文件只能从 FETCH_HEAD 里翻。 */
    const remoteFile = (path: string): string | null =>
      force
        ? fetched
          ? tryRun('git', ['show', `FETCH_HEAD:${path}`], work)
          : null
        : existsSync(join(work, path))
          ? readFileSync(join(work, path), 'utf8')
          : null;

    const previousRaw = remoteFile(MANIFEST_PATH);
    if (fetched && previousRaw === null && !flag('adopt') && !force) {
      fail(
        `${REMOTE}/${branch} 上有内容但没有 ${MANIFEST_PATH}，不像是产物仓库。\n` +
          `确认地址没写错。确实要用这个仓库就加 --adopt。`,
      );
    }
    const previous = previousRaw ? (JSON.parse(previousRaw) as DeployManifest) : null;

    // 只写一次的文件要保住内网团队写好的那份，但**只在远端确实是产物仓库时**。
    // 强推一个还不是产物仓库的地方（比如旧的源码仓库），它那份 docker-compose.yml
    // 是源码时代的遗物而不是运维的成果 —— 保留它等于把一份跑不起来的配置交给运维。
    // --reseed 明确要求把只写一次的文件按模板重写。用于远端那份本来就是错的：
    // 比如它是从旧源码仓库带过来的，之后又被当成运维成果一路保留了下来。
    const preserved = new Map<string, string>();
    if (flag('reseed')) {
      step('按模板重写只写一次的文件');
    } else if (previous !== null || !force) {
      for (const path of SEED_ONCE_PATHS) {
        const content = remoteFile(path);
        if (content !== null) preserved.set(path, content);
      }
    } else {
      step('远端不是产物仓库，只写一次的文件按模板重写');
    }

    copyArtifacts(work);
    for (const [path, content] of preserved) writeFileSync(join(work, path), content);

    // 先只比产物。清单带打包时间，每次都不同，跟着一起比的话永远判不出「没有变化」。
    run('git', ['add', '-A'], work);
    const staged = run('git', ['diff', '--cached', '--name-only'], work)
      .split('\n')
      .filter(Boolean);
    if (staged.length === 0) {
      console.log('\n产物与远端一致，没有要推的东西。\n');
      return;
    }

    writeFileSync(join(work, MANIFEST_PATH), `${JSON.stringify(manifest, null, 2)}\n`);
    run('git', ['add', '-A'], work);

    // 新迁移意味着这一版上线后回不去，见 docs/deployment.md 第 7 节
    const migrations = run('git', ['diff', '--cached', '--name-only', '--', 'drizzle/'], work)
      .split('\n')
      .filter(Boolean);

    console.log('\n─────────── 即将推送 ───────────');
    if (force) {
      console.log('模式      强制：丢弃远端全部历史，这次提交成为新的根提交');
    }
    console.log(`目标      ${REMOTE}/${branch}  ${url}`);
    console.log(
      `版本      v${manifest.version}${manifest.describe ? `  (${manifest.describe})` : ''}`,
    );
    console.log(`源提交    ${manifest.commit.slice(0, 12)}`);
    if (previous)
      console.log(
        `远端现有  v${previous.version}  ${previous.commit.slice(0, 12)}  ${previous.builtAt}`,
      );
    console.log('\n改动：');
    console.log(run('git', ['diff', '--cached', '--stat'], work).split('\n').slice(-1)[0]);
    if (migrations.length > 0) {
      console.log(`\n⚠ 带 ${migrations.length} 个迁移文件改动：`);
      for (const file of migrations) console.log(`    ${file}`);
      console.log('  迁移是单向的，没有 down 脚本也没有自动备份。这一版上线后回不去。');
    }
    if (previous && previous.version !== manifest.version && previous.version > manifest.version) {
      console.log(`\n⚠ 远端版本（v${previous.version}）比本地新，这是在回滚。`);
    }
    if (previous && previous.version === manifest.version && previous.commit !== manifest.commit) {
      console.log(`\n⚠ 版本号与远端相同但源提交不同，是不是忘了升版本号。`);
    }
    console.log('────────────────────────────────\n');

    if (!(await confirm('推送并触发部署？'))) {
      console.log('已取消，什么都没推。');
      return;
    }

    run('git', ['commit', '--quiet', '-m', commitMessage(manifest)], work);
    step(`推送到 ${REMOTE}/${branch}`);
    const pushed = tryRun(
      'git',
      ['push', ...(force ? ['--force'] : []), REMOTE, `HEAD:${branch}`],
      work,
    );
    if (pushed === null) {
      // 别人先推了一版。产物是幂等的，重来一次即可，但要让人自己确认覆盖的是什么。
      fail(
        `推送被拒，远端有新提交（可能是同事刚部署过）。\n` +
          `重新跑一次这条命令即可 —— 它会先拉取远端最新状态再重放产物。`,
      );
    }
    console.log(`\n✓ 已推送 ${commitMessage(manifest)}\n  GitLab CI 接手部署。\n`);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

await main();

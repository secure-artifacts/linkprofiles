/**
 * 部署产物的纯逻辑：哪些文件归这个脚本管、bundle 到底依赖了什么、清单长什么样。
 *
 * 与 `deploy-to-gitlab.ts` 分开是为了能测：那边全是 git 与文件系统的副作用，这边一个都没有。
 */

/**
 * 脚本负责的路径。每次部署先删掉这些再重写，其余文件原样留着 ——
 * 内网团队会往产物仓库里加 k8s 清单、compose override、CI include，不该被脚本吃掉。
 */
export const MANAGED_PATHS = [
  'dist',
  'public',
  'fonts',
  'drizzle',
  'packages',
  'Dockerfile',
  '.dockerignore',
  '.gitignore',
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  '.env.example',
  'README.md',
] as const;

/**
 * 部署清单单独处理，不在受管路径里。
 *
 * 它带打包时间，每次都不一样。跟着产物一起写的话，「这次没有任何变化」就永远判不出来，
 * 每跑一次都会多一个内容相同的部署提交。所以先比产物，确有变化才写它。
 */
export const MANIFEST_PATH = 'deploy-manifest.json';

/**
 * 只在远端没有时才写的文件。
 *
 * 流水线是内网团队自己写的，compose 里的网段与端口也可能按现场调过，每次覆盖会把他们的活抹掉。
 */
export const SEED_ONCE_PATHS = ['.gitlab-ci.yml', 'docker-compose.yml'] as const;

export interface DeployManifest {
  version: string;
  /** 源仓库的完整 sha，出问题时凭它在 GitHub 上对回去 */
  commit: string;
  /** `git describe --tags` 的结果，没有 tag 时为 null */
  describe: string | null;
  builtAt: string;
  builtBy: string;
  node: string;
}

/**
 * 合法的 npm 包名。用它把 SQL 模板串里的东西挡在外面 ——
 * `select name from "${APPLIED_TABLE}"` 会被 from 那条正则误当成 import。
 */
const PACKAGE_NAME = /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;

/**
 * 从打包产物里抓出运行时真正 import 的包名。
 *
 * tsup 把 `@link-profile/*` 打进了 bundle，剩下的 import 都是外部依赖，必须出现在
 * `packages/server/package.json` 的 dependencies 里，否则镜像里装不到，起不来。
 * 靠正则而不是 AST：产物是 ESM，顶层 import 一定是静态字符串，正则够用且不引依赖。
 */
export function externalImports(bundle: string, builtins: readonly string[] = []): string[] {
  const found = new Set<string>();
  const builtinSet = new Set(builtins);
  const patterns = [
    /\bfrom\s*["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\bimport\s*["']([^"']+)["']/g,
    /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];

  for (const pattern of patterns) {
    for (const match of bundle.matchAll(pattern)) {
      const specifier = match[1]!;
      // 相对路径是 bundle 内部的分块，`node:` 是内置模块，都不需要安装
      if (specifier.startsWith('.') || specifier.startsWith('node:')) continue;
      const name = packageNameOf(specifier);
      // 不带 node: 前缀的内置模块（`fs`、`crypto`）同样不需要安装
      if (builtinSet.has(name)) continue;
      if (!PACKAGE_NAME.test(name)) continue;
      found.add(name);
    }
  }
  return [...found].sort();
}

/** `@scope/pkg/sub/path` → `@scope/pkg`；`pkg/sub` → `pkg`。 */
export function packageNameOf(specifier: string): string {
  const parts = specifier.split('/');
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]!;
}

export interface DependencyCheck {
  /** bundle 引了但 dependencies 里没有 —— 镜像装不到，起不来 */
  missing: string[];
  /** dependencies 里有但 bundle 没引 —— 白装，不致命 */
  unused: string[];
}

/**
 * 核对 server 的依赖清单是否覆盖了 bundle 真正要的东西。
 *
 * `@link-profile/*` 已经被打进 bundle，既不会出现在 import 里，也不需要核对。
 */
export function checkDependencies(
  imports: string[],
  dependencies: Record<string, string>,
): DependencyCheck {
  const declared = new Set(
    Object.keys(dependencies).filter((name) => !name.startsWith('@link-profile/')),
  );
  const used = new Set(imports.filter((name) => !name.startsWith('@link-profile/')));

  return {
    missing: [...used].filter((name) => !declared.has(name)).sort(),
    unused: [...declared].filter((name) => !used.has(name)).sort(),
  };
}

/** 产物仓库的提交消息。版本号与源 sha 都在里面，线上出事能一眼对回去。 */
export function commitMessage(manifest: DeployManifest): string {
  return `deploy: v${manifest.version} (github ${manifest.commit.slice(0, 7)})`;
}

/**
 * 从 Dockerfile 文本里抓出它声明的环境变量名。
 *
 * 用来断言产物仓库那份与仓库根那份声明了同一组 —— 两份文件迟早会分叉，而漏掉
 * `FONT_DIR` 的表现是字体路由第一次被请求时进程直接 ENOENT 退出。
 */
export function declaredEnv(dockerfile: string): string[] {
  const names = new Set<string>();
  for (const line of dockerfile.split('\n')) {
    const match = /^\s*ENV\s+(.*)$/.exec(line.replace(/\\$/, ''));
    if (!match) continue;
    for (const pair of match[1]!.matchAll(/([A-Z_][A-Z0-9_]*)=/g)) names.add(pair[1]!);
  }
  return [...names].sort();
}

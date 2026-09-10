import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  checkDependencies,
  commitMessage,
  declaredEnv,
  externalImports,
  packageNameOf,
  type DeployManifest,
} from './artifact.js';

const repoRoot = new URL('../', import.meta.url);
const read = (name: string) => readFileSync(new URL(name, repoRoot), 'utf8');

describe('externalImports', () => {
  it('挑出外部包，跳过内置模块与 bundle 内部的相对路径', () => {
    const bundle = [
      `import { readFileSync } from "node:fs";`,
      `import Fastify from "fastify";`,
      `import { x } from "./chunk-ABC.js";`,
      `const m = await import("sharp");`,
      `import "@fastify/cookie";`,
    ].join('\n');

    expect(externalImports(bundle)).toEqual(['@fastify/cookie', 'fastify', 'sharp']);
  });

  it('不带 node: 前缀的内置模块也要滤掉', () => {
    // 实跑时 bundle 里就有裸的 fs / crypto / path
    const bundle = `import { readFileSync } from "fs";\nimport { randomUUID } from "crypto";\nimport x from "zod";`;
    expect(externalImports(bundle, ['fs', 'crypto', 'path'])).toEqual(['zod']);
  });

  it('SQL 模板串里的 from 不算 import', () => {
    // `select name from "${APPLIED_TABLE}"` 会被 from 那条正则扫到
    const bundle = 'await sql.unsafe(`select name from "${APPLIED_TABLE}"`);';
    expect(externalImports(bundle)).toEqual([]);
  });

  it('子路径归到包名上', () => {
    expect(packageNameOf('@scope/pkg/sub/path')).toBe('@scope/pkg');
    expect(packageNameOf('pkg/sub')).toBe('pkg');
    expect(externalImports(`import x from "drizzle-orm/pg-core";`)).toEqual(['drizzle-orm']);
  });
});

describe('checkDependencies', () => {
  it('产物引了却没声明的包要报出来，镜像里装不到就起不来', () => {
    const result = checkDependencies(['fastify', 'postgres'], { fastify: '^5.0.0' });
    expect(result.missing).toEqual(['postgres']);
  });

  it('workspace 包已经被打进产物，两边都不参与核对', () => {
    const result = checkDependencies(['fastify'], {
      fastify: '^5.0.0',
      '@link-profile/shared': 'workspace:*',
    });
    expect(result.missing).toEqual([]);
    expect(result.unused).toEqual([]);
  });

  it('声明了没用到的只算浪费，单独列出来', () => {
    const result = checkDependencies(['fastify'], { fastify: '^5.0.0', isbot: '^5.0.0' });
    expect(result.missing).toEqual([]);
    expect(result.unused).toEqual(['isbot']);
  });
});

describe('declaredEnv', () => {
  it('两份 Dockerfile 声明同一组运行时环境变量', () => {
    // 迟早有人给一份加了变量忘了另一份，而漏掉 FONT_DIR 的表现是
    // 字体路由第一次被请求时进程直接 ENOENT 退出
    const source = declaredEnv(read('Dockerfile'));
    const artifact = declaredEnv(read('deploy/templates/Dockerfile'));
    expect(artifact).toEqual(source);
  });

  it('认得出单行多个赋值', () => {
    expect(declaredEnv('ENV A=1 B=2\nENV C=3\nRUN echo D=4')).toEqual(['A', 'B', 'C']);
  });
});

describe('commitMessage', () => {
  it('带上版本号与源仓库短 sha', () => {
    const manifest = {
      version: '1.1.0',
      commit: 'cf8fad1abcdef0123456789',
    } as DeployManifest;
    expect(commitMessage(manifest)).toBe('deploy: v1.1.0 (github cf8fad1)');
  });
});

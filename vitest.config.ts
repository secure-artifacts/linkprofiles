import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.ts', 'packages/*/src/**/*.test.ts'],
    // 每个测试文件一个独立 schema，因此文件之间可以并行。
    pool: 'forks',
    testTimeout: 20_000,
    hookTimeout: 30_000,
    env: {
      NODE_ENV: 'test',
      // inject() 的 socket 地址是 127.0.0.1，信任它才能让测试里的
      // X-Forwarded-For 被解析成来访 IP，与生产走反代时的路径一致。
      TRUST_PROXY: 'loopback',
      TEST_DATABASE_URL:
        process.env.TEST_DATABASE_URL ?? 'postgres://localhost:5432/link_profile_test',
    },
  },
});

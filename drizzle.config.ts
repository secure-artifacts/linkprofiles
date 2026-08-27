import { defineConfig } from 'drizzle-kit';

// 迁移产物放在仓库根的 drizzle/：schema 定义归 shared 包，
// 但迁移 SQL 是部署产物，由 server 在启动时执行、由测试底座灌进临时 schema。
export default defineConfig({
  dialect: 'postgresql',
  schema: './packages/shared/src/schema/index.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://localhost:5432/link_profile',
  },
  casing: 'snake_case',
});

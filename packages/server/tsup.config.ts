import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/db/migrate.ts'],
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  // 把 workspace 包打进产物，因为它们以 TypeScript 源码导出，不单独构建。
  noExternal: [/^@link-profile\//],
  clean: true,
  sourcemap: true,
});

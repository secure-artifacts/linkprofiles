import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// 后台挂在 /_admin 下，系统路径统一带 `_` 前缀，见 ADR-0003。
export default defineConfig({
  base: '/_admin/',
  plugins: [react()],
  build: {
    outDir: 'dist',
    // 预览是一个独立文档：iframe 隔开 tailwind preflight 与 antd reset，
    // 并提供真实的 375px 移动端视口，见 ADR-0002 / ADR-0004。
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        preview: resolve(import.meta.dirname, 'preview.html'),
      },
    },
  },
  server: {
    port: 5173,
    proxy: { '/_api': 'http://localhost:3000' },
  },
});

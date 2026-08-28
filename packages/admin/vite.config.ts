import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// 后台挂在 /_admin 下，系统路径统一带 `_` 前缀，见 ADR-0003。
export default defineConfig({
  base: '/_admin/',
  plugins: [react(), tailwindcss()],
  build: {
    outDir: 'dist',
    // 预览是一个独立文档：iframe 隔开公开页与后台各自的 tailwind 实例，
    // 并提供真实的 375px 移动端视口，见 ADR-0004 / ADR-0007。
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

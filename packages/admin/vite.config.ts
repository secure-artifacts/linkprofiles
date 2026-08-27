import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// 后台挂在 /_admin 下，系统路径统一带 `_` 前缀，见 ADR-0003。
export default defineConfig({
  base: '/_admin/',
  plugins: [react()],
  build: { outDir: 'dist' },
  server: {
    port: 5173,
    proxy: { '/_api': 'http://localhost:3000' },
  },
});

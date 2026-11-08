import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 开发期把 /api 与 /files 代理到 FastAPI 后端（默认 8001；8000 已被本机其它服务占用）。
// 可用 env HEALTH_API_BASE 覆盖，例如指向旧 http.server。
const BACKEND = process.env.HEALTH_API_BASE || 'http://127.0.0.1:8001';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: {
      '/api': { target: BACKEND, changeOrigin: true },
      '/files': { target: BACKEND, changeOrigin: true },
    },
  },
});

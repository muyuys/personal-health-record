import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 开发期把 /api 与 /files 代理到 FastAPI 后端（默认 8000）。
// 旧 http.server（8765/其它端口）在迁移期可另配 env 指向。
const BACKEND = process.env.HEALTH_API_BASE || 'http://127.0.0.1:8000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: BACKEND, changeOrigin: true },
      '/files': { target: BACKEND, changeOrigin: true },
    },
  },
});

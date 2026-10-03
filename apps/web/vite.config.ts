import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': { target: 'http://127.0.0.1:8787', changeOrigin: false } },
  },
  build: { target: 'es2022', sourcemap: true, chunkSizeWarningLimit: 300 },
  test: { name: 'web', environment: 'jsdom', include: ['test/**/*.test.{ts,tsx}'] },
});

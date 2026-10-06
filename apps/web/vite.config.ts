import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': { target: 'http://127.0.0.1:8787', changeOrigin: false } },
  },
  // Wave 7: no source maps in the shipped dist; heavy screens are split with
  // React.lazy, and React itself is its own long-cached chunk.
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 500,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [{ name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ }],
        },
      },
    },
  },
  test: { name: 'web', environment: 'jsdom', include: ['test/**/*.test.{ts,tsx}'] },
});

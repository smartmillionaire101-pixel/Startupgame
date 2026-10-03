import { defineConfig, devices } from '@playwright/test';

const PORT = 8799;

/**
 * End-to-end: the real server (fresh temp database, dev tools on, no network
 * feeds) serving the production build of the client, driven on a phone viewport.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    ...devices['Pixel 7'],
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'NODE_ENV=production npx vite build && npx tsx ../server/src/main.ts',
    url: `http://127.0.0.1:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      NODE_ENV: 'development',
      PORT: String(PORT),
      HOST: '127.0.0.1',
      DATABASE_PATH: `${process.env.TMPDIR ?? '/tmp'}/runway-e2e-${Date.now()}.db`,
      DEV_TOOLS: '1',
      FX_FEED_URL: '',
      WEB_DIST: './dist',
      SESSION_SECRET: 'e2e-secret-e2e-secret-e2e-secret-0001',
    },
  },
});

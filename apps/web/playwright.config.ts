import { defineConfig, devices } from '@playwright/test';

// E2E_PORT lets several checkouts run their suites side by side.
const PORT = Number(process.env.E2E_PORT ?? 8799);

/**
 * End-to-end: the real server (fresh temp database, dev tools on, no network
 * feeds) serving the production build of the client, driven on a phone viewport.
 *
 * E2E_BASE_URL points the same tests at a deployed site instead (a Netlify
 * deploy preview, which has its own world and dev tools). E2E_SUITE=live
 * runs only the smoke test that is safe for the live game.
 */
const REMOTE = process.env.E2E_BASE_URL;
export default defineConfig({
  testDir: './e2e',
  ...(process.env.E2E_SUITE === 'live' ? { testMatch: 'live.spec.ts' } : {}),
  timeout: 60_000,
  // A deployed site answers over the network from functions that may be starting cold.
  expect: { timeout: REMOTE ? 15_000 : 5_000 },
  retries: process.env.CI && !REMOTE ? 1 : 0,
  use: {
    baseURL: REMOTE ?? `http://127.0.0.1:${PORT}`,
    ...devices['Pixel 7'],
    trace: 'retain-on-failure',
    // Wave 9: WebGL (the 3D city) through software rendering in headless Chromium.
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
  },
  webServer: REMOTE
    ? undefined
    : {
        command: 'NODE_ENV=production npx vite build && npx tsx ../server/src/main.ts',
        url: `http://127.0.0.1:${PORT}/api/health`,
        reuseExistingServer: false,
        timeout: 120_000,
        env: {
          NODE_ENV: 'development',
          ADMIN_TOKEN: 'e2e-admin-password',
          PORT: String(PORT),
          HOST: '127.0.0.1',
          DATABASE_PATH: `${process.env.TMPDIR ?? '/tmp'}/runway-e2e-${Date.now()}.db`,
          DEV_TOOLS: '1',
          // Long game months so the real clock never settles in the middle of a spec
          // (specs advance months with the dev button instead).
          MONTH_MINUTES: '1440',
          // Every spec starts a new guest (and some ask for sign-in links) from one address.
          AUTH_RATE_LIMIT: '50',
          GUEST_RATE_LIMIT: '200',
          EMAIL_RATE_LIMIT: '200',
          FX_FEED_URL: '',
          WEB_DIST: './dist',
          SESSION_SECRET: 'e2e-secret-e2e-secret-e2e-secret-0001',
        },
      },
});

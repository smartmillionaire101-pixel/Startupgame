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
/**
 * E2E_WORLD (set by CI against a preview) gives each test worker its own fresh
 * world there: the `rw_world` cookie picks the preview's store, so runs and
 * parallel tests never meet each other's players, open games or month (the
 * preview's own world is shared by every run and has no scheduled clock).
 * Every browser context a test opens starts with the cookie.
 */
const WORLD =
  REMOTE && process.env.E2E_WORLD
    ? `${process.env.E2E_WORLD}-w${process.env.TEST_WORKER_INDEX ?? '0'}`.toLowerCase()
    : null;
export default defineConfig({
  testDir: './e2e',
  ...(process.env.E2E_SUITE === 'live' ? { testMatch: 'live.spec.ts' } : {}),
  timeout: 60_000,
  // A deployed site answers over the network from functions that may be starting cold.
  expect: { timeout: REMOTE ? 15_000 : 5_000 },
  // One retry in CI, locally and against a deploy preview alike. A retry starts the
  // test again as a brand-new player, so a real failure fails twice. The preview
  // runs on cold-starting functions under the whole suite's load, and the odd
  // request times out at Netlify's edge (504 "Inactivity Timeout") or a page load
  // is aborted; without a retry any one of those failed the deploy check.
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: REMOTE ?? `http://127.0.0.1:${PORT}`,
    ...devices['Pixel 7'],
    trace: 'retain-on-failure',
    ...(WORLD
      ? {
          storageState: {
            cookies: [
              {
                name: 'rw_world',
                value: WORLD,
                domain: new URL(REMOTE!).hostname,
                path: '/',
                expires: -1,
                httpOnly: false,
                secure: true,
                sameSite: 'Lax' as const,
              },
            ],
            origins: [],
          },
        }
      : {}),
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

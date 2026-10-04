import { test as base, type Page } from '@playwright/test';

/**
 * Shared fixture for all E2E tests.
 *
 * - Netlify adds a feedback toolbar (the "Netlify Drawer") to deploy
 *   previews. It floats over the bottom navigation and swallows clicks, and
 *   players on production never see it, so tests remove it.
 * - Every API error response is recorded; when a test fails, they are
 *   printed, so a failure against a deployed site shows the server's answer.
 */
/** Remove the Netlify Drawer from a page (also for extra pages a test opens itself). */
export async function withoutNetlifyDrawer(page: Page) {
  await page.route(/app\.netlify\.com/, (route) => route.abort());
  await page.addInitScript(() => {
    const strip = () =>
      document.querySelectorAll('[data-netlify-deploy-id]').forEach((el) => el.remove());
    new MutationObserver(strip).observe(document, { childList: true, subtree: true });
  });
}

export const test = base.extend({
  page: async ({ page }, use, testInfo) => {
    await withoutNetlifyDrawer(page);
    const errors: string[] = [];
    page.on('response', async (res) => {
      if (!res.url().includes('/api/') || res.status() < 400) return;
      const body = await res.text().catch(() => '');
      errors.push(
        `${res.status()} ${res.request().method()} ${new URL(res.url()).pathname} ${body.slice(0, 300)}`,
      );
    });
    await use(page);
    if (testInfo.status !== testInfo.expectedStatus && errors.length)
      console.log(`API errors during "${testInfo.title}":\n  ${errors.join('\n  ')}`);
  },
});

export { expect } from '@playwright/test';

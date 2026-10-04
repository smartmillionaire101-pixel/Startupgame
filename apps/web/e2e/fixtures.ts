import { test as base } from '@playwright/test';

/**
 * Netlify adds a feedback toolbar (the "Netlify Drawer") to deploy previews.
 * It floats over the bottom navigation and swallows clicks, and players on
 * production never see it, so tests remove it.
 */
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.route(/app\.netlify\.com/, (route) => route.abort());
    await page.addInitScript(() => {
      const strip = () =>
        document.querySelectorAll('[data-netlify-deploy-id]').forEach((el) => el.remove());
      new MutationObserver(strip).observe(document, { childList: true, subtree: true });
    });
    await use(page);
  },
});

export { expect } from '@playwright/test';

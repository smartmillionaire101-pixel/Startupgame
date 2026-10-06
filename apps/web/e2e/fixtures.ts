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
    // Wave 7: rides play as full-screen scenes (5–12 s). Specs about other
    // things travel the old way ("Always skip rides"); travel-scenes.spec.ts
    // turns the scenes back on.
    await page.addInitScript(() => {
      try {
        localStorage.setItem('runway.skipRides', '1');
      } catch {
        /* storage blocked: rides play */
      }
    });
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
export type { Page } from '@playwright/test';

/**
 * Random letters / digits for names and phone numbers. A deploy preview keeps
 * one world across runs, and the name checker refuses a name one edit away
 * from a taken one, so suffixes must be random rather than clock-based.
 */
const pick = (alphabet: string, n: number) =>
  Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => alphabet[b % alphabet.length]).join(
    '',
  );
export const letters = (n = 6) => pick('abcdefghijklmnopqrstuvwxyz', n);
export const digits = (n = 7) => pick('0123456789', n);

/** Start a game as a guest: tick the 18+ box, then Play now (English or French). */
export async function playAsGuest(page: Page, lang: 'en' | 'fr' = 'en') {
  await page.goto('/');
  // Wait for the guest session itself, not just the click: on a deployed site
  // the next request can otherwise go out before the session cookie exists.
  const signedIn = page.waitForResponse(
    (r) => r.url().endsWith('/api/auth/guest') && r.request().method() === 'POST',
  );
  if (lang === 'fr') {
    await page.getByLabel('Je confirme avoir 18 ans ou plus').check();
    await page.getByRole('button', { name: 'Jouer maintenant' }).click();
  } else {
    await page.getByLabel('I confirm I’m 18 or older').check();
    await page.getByRole('button', { name: 'Play now' }).click();
  }
  const res = await signedIn;
  if (!res.ok()) throw new Error(`Guest sign-in failed: ${res.status()} ${await res.text()}`);
}

/**
 * Tap a building on the map the way the map listens for taps. Somewhere far
 * opens the ride chooser (Wave 4): go by `mode` (walking, unless told).
 */
export async function tapPlace(page: Page, selector: string, mode = 'walk') {
  const el = page.locator(selector).first();
  await el.dispatchEvent('pointerdown', { pointerId: 1, clientX: 10, clientY: 10 });
  await el.dispatchEvent('pointerup', { pointerId: 1, clientX: 10, clientY: 10 });
  const chooser = page.getByRole('dialog', { name: 'How do you want to get there?' });
  const far = await chooser.waitFor({ timeout: 1500 }).then(
    () => true,
    () => false,
  );
  if (far) await chooser.locator(`[data-mode="${mode}"]`).click();
}

/**
 * Wave 5: going into a place opens a full-screen scene (the room, its people
 * and a tray of things to do). "More" shows the detailed cards; returns the scene.
 */
export async function more(page: Page) {
  const scene = page.locator('.place-scene');
  await scene.waitFor({ timeout: 10_000 });
  await scene.locator('.tray-more').click();
  return scene;
}

/** A random address on a reserved domain: never receives real mail. */
export const randomEmail = () => `e2e-${letters(10)}@example.com`;

/** A bottom-bar tab, matched exactly (alerts and other buttons can share its word). */
export const tab = (page: Page, name: string) =>
  page
    .getByRole('navigation', { name: 'Main' })
    // The name can carry a badge count ("Home 3").
    .getByRole('button', { name: new RegExp(`^${name}(\\s+\\d+)?$`) });

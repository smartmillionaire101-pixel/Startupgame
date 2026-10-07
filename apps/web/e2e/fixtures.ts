import { test as base, type Page } from '@playwright/test';
import { checkName } from '@runway/engine';

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
  // Wave 7: rides play as full-screen scenes (5–12 s). Specs about other
  // things travel the old way ("Always skip rides"); travel-scenes.spec.ts
  // turns the scenes back on. Every page (extra players too) comes through here.
  await page.addInitScript(() => {
    try {
      localStorage.setItem('runway.skipRides', '1');
      // Wave 9: specs about other things use the Lite (2D) map; map3d.spec.ts
      // turns the WebGL city back on (software WebGL is slow in CI).
      if (!localStorage.getItem('runway.mapQuality'))
        localStorage.setItem('runway.mapQuality', 'lite');
    } catch {
      /* storage blocked: rides play */
    }
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
/** Random letters the game's name filter accepts (a random run can spell a refused word). */
export function letters(n = 6): string {
  for (;;) {
    const s = pick('abcdefghijklmnopqrstuvwxyz', n);
    if (n < 3 || checkName(s, { taken: {}, kind: 'handle' }).ok) return s;
  }
}
export const digits = (n = 7) => pick('0123456789', n);

/** Create an unconfigured session for tests whose subject is gameplay, not signup. */
export async function playAsGuest(page: Page) {
  await page.goto('/');
  const response = await page.request.post('/api/auth/guest', {
    headers: { 'x-runway': '1' },
    data: { adult: true },
  });
  if (!response.ok()) throw new Error(`Guest session: ${response.status()}`);
  await page.reload();
}

/** Seed an established founder; onboarding itself has dedicated UI tests. */
export async function setupFounder(
  page: Page,
  input: {
    name: string;
    handle: string;
    company: string;
    idea: string;
    market?: RegExp;
    gender?: 'female' | 'male';
  },
) {
  const meta = await page.request.get('/api/meta').then((r) => r.json());
  const market = meta.markets.find((m: { name: string; country: string }) =>
    (input.market ?? /Lagos/).test(`${m.name}, ${m.country}`),
  );
  if (!market) throw new Error('Test market not found');
  await setupPlayer(page, {
    type: 'player.create',
    name: input.name,
    handle: input.handle,
    role: 'founder',
    backgroundId: 'f-engineer',
    market: market.id,
    gender: input.gender ?? 'female',
    company: {
      name: input.company,
      industry: 'fintech',
      revenueModel: 'subscription',
      idea: input.idea,
      incorporation: 'local',
    },
  });
}

export async function setupPlayer(page: Page, command: unknown) {
  const response = await page.request.post('/api/commands', {
    headers: { 'x-runway': '1' },
    data: { command },
  });
  if (!response.ok()) throw new Error(`Test setup: ${await response.text()}`);
  await page.reload();
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

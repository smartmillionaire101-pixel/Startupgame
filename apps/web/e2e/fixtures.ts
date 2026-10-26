import { expect, test as base, type Locator, type Page } from '@playwright/test';
import { checkName, OFFENSIVE_ROOTS } from '@runway/engine';

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
      // The landing page is for new visitors; landing.spec.ts sees it, other specs start at sign-up.
      if (!localStorage.getItem('runway.landingSeen'))
        localStorage.setItem('runway.landingSeen', '1');
      // Wave 9: specs about other things use the Lite (2D) map; map3d.spec.ts
      // turns the WebGL city back on (software WebGL is slow in CI).
      if (!localStorage.getItem('runway.mapQuality'))
        localStorage.setItem('runway.mapQuality', 'lite');
      // Founder Journey 4b: the month recap opens on its own when a month
      // starts; specs about other things skip it (recap.spec.ts turns it on).
      if (!localStorage.getItem('runway.skipRecap')) localStorage.setItem('runway.skipRecap', '1');
      // Phase 2: new players start in Simple mode (four tabs, big tiles).
      // Specs about other things play the normal game; simple-mode.spec.ts
      // turns it on. The map's one-time gesture hint is taken as seen too.
      if (!localStorage.getItem('runway.simple')) localStorage.setItem('runway.simple', '0');
      if (!localStorage.getItem('runway.gestureHint'))
        localStorage.setItem('runway.gestureHint', '1');
      // Phase 5: life events pop up as cards when a month settles; specs
      // about other things don't see them open by themselves (the events
      // still come, in the Decisions list). life-events.spec.ts turns it on.
      if (!localStorage.getItem('runway.lifeEventsPopup'))
        localStorage.setItem('runway.lifeEventsPopup', '0');
      // A new session starts at home, and landing opens Arrivals in the
      // airport; specs about other things start on the map and step out of
      // the airport (arrivals.spec.ts turns both on).
      if (!localStorage.getItem('runway.startAtHome'))
        localStorage.setItem('runway.startAtHome', '0');
      if (!localStorage.getItem('runway.arrivals')) localStorage.setItem('runway.arrivals', '0');
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
/**
 * Could these letters spell a refused word with the text around them? Specs
 * glue them to a word ("Floors " + "lutq…" is "floorslutq…" to the name
 * filter, which ignores spaces), so neither end may start or finish one.
 */
const joinsRefused = (s: string) =>
  OFFENSIVE_ROOTS.some((root) => {
    for (let k = 2; k < root.length; k++)
      if (s.startsWith(root.slice(root.length - k)) || s.endsWith(root.slice(0, k))) return true;
    return false;
  });
/** Random letters the game's name filter accepts (a random run can spell a refused word). */
export function letters(n = 6): string {
  for (;;) {
    const s = pick('abcdefghijklmnopqrstuvwxyz', n);
    if (n < 3 || (checkName(s, { taken: {}, kind: 'handle' }).ok && !joinsRefused(s))) return s;
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
  // The 3D map draws places as icon badges (data-badge), not data-place
  // labels: tap the badge, then Go on its card (named ones go at once).
  const id = /^\[data-place="([^"]+)"\]$/.exec(selector)?.[1];
  const badge = id ? page.locator(`[data-badge="${id}"]`).first() : null;
  // (After a reload the map may still be building: wait for either.)
  if (badge)
    await page.locator(`${selector}, [data-badge="${id}"]`).first().waitFor({ state: 'attached' });
  if (badge && (await page.locator(selector).count()) === 0 && (await badge.count()) > 0) {
    await badge.dispatchEvent('pointerdown', { pointerId: 1, clientX: 10, clientY: 10 });
    await badge.dispatchEvent('pointerup', { pointerId: 1, clientX: 10, clientY: 10 });
    const go = page.locator(`[data-badge-card="${id}"] [data-badge-go]`);
    if (
      await go.waitFor({ timeout: 1500 }).then(
        () => true,
        () => false,
      )
    )
      await go.dispatchEvent('click');
  } else {
    const el = page.locator(selector).first();
    await el.dispatchEvent('pointerdown', { pointerId: 1, clientX: 10, clientY: 10 });
    await el.dispatchEvent('pointerup', { pointerId: 1, clientX: 10, clientY: 10 });
  }
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

/** Home and social experiences (dates, games, sky views): Me → Home & friends. */
export async function openTogether(page: Page) {
  const sheet = page.getByRole('dialog', { name: 'Home and social experiences' });
  if (await sheet.isVisible()) return sheet;
  await tab(page, 'Me').click();
  await page.locator('[data-open-living]').click();
  await sheet.waitFor();
  return sheet;
}

/** Sign-up's careers, as their cards are named. */
const ROLE_NAME = { founder: 'Founder', investor: 'Investor', banker: 'Banker' } as const;
export type Role = keyof typeof ROLE_NAME;

/** Sign-up, step 1 "Pick your path": a career, then Continue. */
export async function pickPath(page: Page, role: Role = 'founder') {
  await page
    .getByRole('radiogroup', { name: 'Pick your path' })
    .getByRole('radio', { name: ROLE_NAME[role], exact: true })
    .check();
  await page.getByRole('button', { name: /^Continue/ }).click();
}

/** Sign-up, step 2 "Your look": sex (and an outfit colour), then Next. */
export async function pickLook(
  page: Page,
  { gender = 'Woman', outfit }: { gender?: 'Woman' | 'Man'; outfit?: string } = {},
) {
  await expect(page.getByRole('heading', { name: 'Your look' })).toBeVisible();
  await page
    .getByRole('radiogroup', { name: 'I am' })
    .getByRole('radio', { name: gender, exact: true })
    .check();
  if (outfit)
    await page
      .getByRole('radiogroup', { name: 'Outfit colour' })
      .getByRole('radio', { name: outfit, exact: true })
      .check();
  await page.getByRole('button', { name: /^Next/ }).click();
}

export interface AboutYou {
  name?: string;
  city?: string;
  username?: string;
  email?: string;
  /** A founder's background, by id (f-engineer, f-consultant …). */
  background?: string;
}

/** Sign-up, step 3 "About you": name, city, username, email (and background), 18+; not Play yet. */
export async function fillAboutYou(
  page: Page,
  { name = 'E2E Player', city = 'Lagos', username, email, background }: AboutYou = {},
) {
  await expect(page.getByRole('heading', { name: 'About you' })).toBeVisible();
  await page.getByLabel('Your name', { exact: true }).fill(name);
  await page
    .getByRole('radiogroup', { name: 'Your city' })
    .getByRole('radio', { name: city, exact: true })
    .check();
  await page.getByLabel('Username', { exact: true }).fill(username ?? `e2e_${letters(8)}`);
  await page.getByLabel('Email', { exact: true }).fill(email ?? randomEmail());
  if (background) await page.getByLabel('Before this you were').selectOption(background);
  await page.getByRole('checkbox', { name: 'I’m 18 or older' }).check();
}

/** Sign up through the three steps and press Play (from the first step, Pick your path). */
export async function signUp(
  page: Page,
  opts: AboutYou & { role?: Role; gender?: 'Woman' | 'Man'; outfit?: string } = {},
) {
  await pickPath(page, opts.role);
  await pickLook(page, opts);
  await fillAboutYou(page, opts);
  await page.getByRole('button', { name: /^Play/ }).click();
}

/** Click a button the coach card may cover: scrolled to the middle first. */
async function press(button: Locator) {
  await button.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await button.click();
}

/**
 * Founder setup, steps 2 and 3 on the Company screen (founder-setup.spec.ts
 * covers the journey in full): register a local company, then put `share`
 * of the founder's savings in as shares. The company is funded, not open.
 */
export async function registerAndFund(page: Page, share = 1 / 2) {
  const register = page.locator('[data-setup-register]');
  await register.locator('[data-type="local"]').click();
  await press(register.getByRole('button', { name: /^Register / }));
  const own = page.locator('[data-setup-own]');
  const slider = own.getByLabel('Your own money');
  // A value on the slider's steps (the browser snaps anything else).
  const step = Number(await slider.getAttribute('step'));
  const max = Number(await slider.getAttribute('max'));
  await slider.fill(String(Math.round((max * share) / step) * step));
  await press(own.getByRole('button', { name: /^Put / }));
  await expect(own.locator('[data-own-in]')).toBeVisible();
}

/**
 * The whole founder setup after the name is reserved, the quick way a player
 * would: register, own money, work from home. Ends on the done card, the
 * company open with its stage tracker.
 */
export async function finishSetup(page: Page, share = 1 / 2) {
  await expect(page.locator('[data-setup-register]')).toBeVisible();
  await registerAndFund(page, share);
  await page.getByRole('button', { name: 'Next: choose an office' }).first().click();
  await page.locator('[data-office="home"]').click();
  await press(page.getByRole('button', { name: 'Work from home for now' }));
  await expect(page.locator('[data-setup-done]')).toBeVisible();
}

type Box = { x: number; y: number; width: number; height: number };
const inBox = (p: { x: number; y: number }, b: Box, pad = 0) =>
  p.x > b.x - pad && p.x < b.x + b.width + pad && p.y > b.y - pad && p.y < b.y + b.height + pad;

/**
 * Golf: the controls at the edges leave the course clear (player feedback:
 * the tray and a centred swing button hid the ball and the aim). Reads where
 * the drawing put the ball, the aim's end and the flag (`data-golf-ball`…, as
 * fractions of the canvas) and checks no control sits on them, and that the
 * swing button and its meter keep out of the strip from the ball to the aim.
 */
export async function expectGolfControlsClear(page: Page, what = 'address') {
  const scene = page.locator('.golf-scene');
  const canvas = scene.locator('canvas[data-golf-ball]').first();
  await expect.poll(async () => canvas.getAttribute('data-golf-ball')).toMatch(/^\d/);
  const c = (await canvas.boundingBox())!;
  const spot = async (attr: string) => {
    const v = (await canvas.getAttribute(attr)) ?? '';
    if (!v) return null;
    const [fx, fy] = v.split(',').map(Number) as [number, number];
    return { x: c.x + fx * c.width, y: c.y + fy * c.height };
  };
  const ball = (await spot('data-golf-ball'))!;
  // No aim drawn (a putt in Lite): the aim runs from the ball up the middle.
  const end = (await spot('data-golf-aim-end')) ?? { x: c.x + c.width / 2, y: c.y + c.height / 2 };
  const flag = await spot('data-golf-flag');
  const boxes: [string, Box][] = [];
  for (const [name, sel] of [
    ['swing', '[data-action="golf-swing"]'],
    ['meter', '.golf-meter'],
    ['aim left', '[data-action="golf-left"]'],
    ['aim right', '[data-action="golf-right"]'],
    ['middle', '.golf-mid'],
    ['club', '.golf-club'],
  ] as const)
    for (const b of await scene.locator(sel).all()) {
      const box = await b.boundingBox();
      if (box && box.width > 0) boxes.push([name, box]);
    }
  expect(boxes.map(([n]) => n)).toEqual(expect.arrayContaining(['swing', 'meter', 'aim left']));
  const at = (p: { x: number; y: number }) => `${Math.round(p.x)},${Math.round(p.y)}`;
  for (const [name, b] of boxes) {
    expect(inBox(ball, b, 10), `${what}: the ${name} control covers the ball at ${at(ball)}`).toBe(
      false,
    );
    if (flag)
      expect(inBox(flag, b), `${what}: the ${name} control covers the flag at ${at(flag)}`).toBe(
        false,
      );
    // Along the aim line, ball to its end.
    for (let i = 0; i <= 20; i++) {
      const p = {
        x: ball.x + ((end.x - ball.x) * i) / 20,
        y: ball.y + ((end.y - ball.y) * i) / 20,
      };
      expect(inBox(p, b), `${what}: the ${name} control covers the aim line at ${at(p)}`).toBe(
        false,
      );
    }
  }
  // The swing button and its meter keep out of the whole strip between the ball and the aim.
  const zone = {
    x: Math.min(ball.x, end.x) - 16,
    y: Math.min(ball.y, end.y) - 16,
    width: Math.abs(end.x - ball.x) + 32,
    height: Math.abs(end.y - ball.y) + 32,
  };
  for (const [name, b] of boxes.filter(([n]) => n === 'swing' || n === 'meter')) {
    const overlaps =
      b.x < zone.x + zone.width &&
      b.x + b.width > zone.x &&
      b.y < zone.y + zone.height &&
      b.y + b.height > zone.y;
    expect(overlaps, `${what}: the ${name} overlaps the aim area ${JSON.stringify(zone)}`).toBe(
      false,
    );
  }
}

/**
 * The sales conversation (round two): open it from a deal card's "Sales
 * conversation" (or from an open sheet), sit down, lead with their need when
 * discovery revealed it, name the middle of their band, offer a paid pilot
 * and ask for the deal. Returns how it ended; the sheet is closed after.
 */
export async function salesConversation(
  page: Page,
  deal?: Locator,
): Promise<{ result: 'won' | 'lost'; score: number }> {
  if (deal) await deal.locator('button[data-action="talk"]').click();
  const sheet = page.getByRole('dialog', { name: /^Sales conversation/ });
  await expect(sheet).toBeVisible();
  const sit = sheet.locator('[data-talk-start]');
  if (await sit.isVisible()) await sit.click();
  await expect(sheet.locator('[data-turn="lead"]')).toBeVisible({ timeout: 15_000 });
  const need = await sheet.locator('[data-known-need]').getAttribute('data-known-need');
  const theirs = sheet.locator(`[data-lead="${need}"]`);
  await (
    need !== '?' && (await theirs.count()) ? theirs : sheet.locator('[data-lead]').first()
  ).click();
  await expect(sheet.locator('[data-reaction="lead"]')).toBeVisible({ timeout: 15_000 });
  await sheet.locator('[data-price="mid"]').click();
  await sheet.getByRole('button', { name: 'Name this price' }).click();
  await expect(sheet.locator('[data-reaction="price"]')).toBeVisible({ timeout: 15_000 });
  await expect(sheet.getByRole('meter', { name: 'Win chance now' })).toBeVisible();
  await sheet.locator('[data-terms="pilot"]').click();
  await expect(sheet.locator('[data-reaction="terms"]')).toBeVisible({ timeout: 15_000 });
  await sheet.locator('[data-talk-ask]').click();
  const done = sheet.locator('[data-talk-result]');
  await expect(done).toBeVisible({ timeout: 15_000 });
  const result = (await done.getAttribute('data-talk-result')) as 'won' | 'lost';
  const score = Number(await done.getAttribute('data-talk-score'));
  // Scored like a banker's call: a mark and a why for each turn.
  await expect(sheet.locator('[data-turn-mark]')).toHaveCount(3);
  await sheet.getByRole('button', { name: 'Close', exact: true }).first().click();
  await expect(sheet).toBeHidden();
  return { result, score };
}

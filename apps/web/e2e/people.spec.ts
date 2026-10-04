import { devices, type Page } from '@playwright/test';
import { expect, test, withoutNetlifyDrawer } from './fixtures';

/**
 * Wave 2: people in the city. AI characters and the person card always run;
 * the two-player presence and event checks need the server's presence API and
 * the engine's events, so they skip themselves where those aren't deployed.
 */

let n = 0;
async function signUpFounder(page: Page, name: string) {
  const stamp = `${Date.now()}${n++}`.slice(-8);
  await page.goto('/');
  await page.getByLabel('Mobile number').fill(`+23482${stamp}`);
  await page.getByLabel('Date of birth').fill('1992-04-18');
  await page.getByRole('button', { name: 'Send code' }).click();
  const code = (await page.getByText(/your code is \d{6}/i).textContent())!.match(/\d{6}/)![0];
  await page.getByLabel('6-digit code').fill(code);
  await page.getByRole('button', { name: 'Verify' }).click();
  await page.getByRole('button', { name: /Founder/ }).click();
  await page.getByRole('button', { name: /Ex-engineer/ }).click();
  await page.getByRole('button', { name: /Lagos, Nigeria/ }).click();
  await page.getByLabel('Your name').fill(name);
  await page.getByLabel('Handle').fill(`${name.split(' ')[0]!.toLowerCase()}_${stamp.slice(-6)}`);
  await expect(page.getByText('Available', { exact: true })).toBeVisible();
  await page.getByLabel('Your idea in one line').fill('Bookkeeping for market stalls');
  await page.getByLabel('Company name').fill(`${name.split(' ')[0]} Books ${stamp.slice(-4)}`);
  await expect(page.getByText(/Available in Lagos/)).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Start' }).click();
  await expect(page.getByRole('application', { name: /Map of Lagos/ })).toBeVisible();
}

/** Tap an SVG element the way the map listens for taps. */
async function tap(page: Page, selector: string) {
  const el = page.locator(selector).first();
  await el.dispatchEvent('pointerdown', { pointerId: 7, clientX: 5, clientY: 5 });
  await el.dispatchEvent('pointerup', { pointerId: 7, clientX: 5, clientY: 5 });
}

const presenceAvailable = (page: Page) =>
  page.evaluate(async () => {
    const r = await fetch('/api/presence', { headers: { 'x-runway': '1' } });
    return r.status === 200;
  });

const eventsAvailable = (page: Page) =>
  page.evaluate(async () => {
    const r = await fetch('/api/state', { headers: { 'x-runway': '1' } });
    const s = (await r.json()) as { view?: { market?: { events?: unknown } } };
    return Array.isArray(s.view?.market?.events);
  });

async function openPlace(page: Page, district: string) {
  await page.getByRole('button', { name: /Places/ }).click();
  await page
    .getByRole('dialog', { name: 'Places' })
    .locator('section', { has: page.getByRole('heading', { name: district }) })
    .getByRole('button')
    .first()
    .click();
}

test('AI characters stroll the city and open a person card when tapped', async ({ page }) => {
  await signUpFounder(page, 'Kemi Walker');

  // Ambient people: partners, founders, shoppers and candidates.
  const people = page.locator('[data-person^="ai:"]');
  await expect(people.first()).toBeAttached();
  expect(await people.count()).toBeGreaterThan(3);
  await expect(page.locator('[data-person^="ai:partner:"]').first()).toBeAttached();

  // Tap a fund partner: their card offers a visit and a pitch.
  await tap(page, '[data-person^="ai:partner:"]');
  const card = page.getByRole('dialog');
  await expect(card).toBeVisible();
  await expect(card.getByText(/Fund partner/)).toBeVisible();
  await expect(card.getByRole('button', { name: 'Visit their office' })).toBeVisible();
  await expect(card.getByRole('button', { name: 'Pitch' })).toBeEnabled();
  // Visiting walks you to the office and goes in.
  await card.getByRole('button', { name: 'Visit their office' }).click();
  await expect(page.getByRole('dialog').getByText('Thesis')).toBeVisible({ timeout: 8000 });
  await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click();

  // The same people as an accessible list.
  await page.getByRole('button', { name: /Who’s here/ }).click();
  const list = page.getByRole('list', { name: 'People around' });
  await expect(list.getByRole('button').first()).toBeVisible();
  await list
    .getByRole('button', { name: /Customer/ })
    .first()
    .click();
  await expect(page.getByRole('dialog').locator('.person-talk')).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click();

  // The Event Hall is open (or says it opens soon), with the host form.
  await openPlace(page, 'Event Hall');
  const hall = page.getByRole('dialog');
  await expect(hall.getByRole('heading', { name: 'Host an event' })).toBeVisible({
    timeout: 8000,
  });
  await expect(hall.getByRole('radio', { name: /Founder meetup/ })).toBeVisible();
  await hall.getByRole('button', { name: 'Close' }).click();

  // Me → People: contacts, and Settings: map visibility.
  await page.getByRole('button', { name: 'Me', exact: true }).click();
  await page.getByRole('tab', { name: 'People' }).click();
  await expect(page.getByRole('heading', { name: 'Contacts' })).toBeVisible();
  await page.getByRole('tab', { name: 'Settings' }).click();
  await expect(page.getByLabel('Show me on the map')).toBeVisible();
});

test('two players see each other, chat, and meet at an event', async ({ page: a, browser }) => {
  const { defaultBrowserType: _, ...phone } = devices['Pixel 7'];
  // Two sign-ups, presence polling and a month's settlement over the network.
  if (process.env.E2E_BASE_URL) test.slow();
  const b = await (
    await browser.newContext({ ...phone, baseURL: test.info().project.use.baseURL })
  ).newPage();
  await withoutNetlifyDrawer(b);
  await signUpFounder(a, 'Amaka Host');
  test.skip(!(await presenceAvailable(a)), 'Presence API not deployed here.');
  await signUpFounder(b, 'Bode Guest');

  // B sees A walking the city (polls every 5 s), taps them and starts a chat.
  const avatar = b.locator('.city-person-player', { hasText: 'Amaka' });
  await expect(avatar).toBeAttached({ timeout: 20_000 });
  await tap(b, '.city-person-player');
  const card = b.getByRole('dialog', { name: 'Amaka Host' });
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: 'Chat' }).click();
  const starters = b.getByRole('dialog', { name: 'Start with one tap' });
  await expect(starters).toBeVisible();
  await starters.locator('.choice').first().click();
  await expect(b.locator('.chat-log .bubble').first()).toBeVisible();
  await b.reload();

  test.skip(!(await eventsAvailable(a)), 'Engine events not deployed here.');

  // A hosts a free founder meetup this month at the Event Hall.
  await openPlace(a, 'Event Hall');
  const hall = a.getByRole('dialog');
  await expect(hall.getByRole('heading', { name: 'Host an event' })).toBeVisible({
    timeout: 8000,
  });
  await hall.getByRole('radio', { name: /Founder meetup/ }).click();
  await hall.getByLabel('Title').fill('Stall founders meetup');
  await hall.getByRole('radio', { name: 'This month' }).click();
  await hall.getByLabel(/Budget/).fill('0');
  await hall.getByRole('button', { name: 'Host it' }).click();
  await expect(hall.getByText('Stall founders meetup')).toBeVisible();
  await expect(hall.getByText('You host')).toBeVisible();

  // B RSVPs.
  await b.getByRole('application', { name: /Map of Lagos/ }).waitFor();
  await openPlace(b, 'Event Hall');
  const bHall = b.getByRole('dialog');
  await bHall.getByRole('button', { name: 'RSVP to Stall founders meetup' }).click();
  await expect(bHall.getByText('Going', { exact: true })).toBeVisible();

  // The month closes (dev tools): both see a recap.
  const settled = await a.evaluate(async () => {
    const r = await fetch('/api/dev/settle', {
      method: 'POST',
      headers: { 'x-runway': '1', 'content-type': 'application/json' },
      body: JSON.stringify({ market: 'lagos' }),
    });
    return r.status;
  });
  expect(settled).toBe(200);
  for (const p of [a, b]) {
    await p.reload();
    await p.getByRole('application', { name: /Map of Lagos/ }).waitFor();
    await openPlace(p, 'Event Hall');
    const past = p.getByRole('list', { name: 'Past events' });
    await expect(past.getByText('Stall founders meetup')).toBeVisible({ timeout: 8000 });
    await expect(past.getByText('Your recap')).toBeVisible();
  }
});

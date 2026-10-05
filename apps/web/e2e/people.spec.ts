import { devices, type Page } from '@playwright/test';
import {
  expect,
  letters,
  more,
  playAsGuest,
  tapPlace,
  test,
  withoutNetlifyDrawer,
} from './fixtures';

/**
 * Wave 2: people in the city, inside buildings since Wave 6. AI characters,
 * Who's here and the person card always run; the two-player presence and
 * event checks need the server's presence API and the engine's events, so
 * they skip themselves where those aren't deployed.
 */

async function signUpFounder(page: Page, name: string) {
  await playAsGuest(page);
  await page.getByRole('button', { name: /Founder/ }).click();
  await page.getByRole('button', { name: /Ex-engineer/ }).click();
  await page.getByRole('button', { name: /Lagos, Nigeria/ }).click();
  await page.getByRole('button', { name: 'Female', exact: true }).click();
  await page.getByLabel('Your name').fill(name);
  await page.getByLabel('Handle').fill(`${name.split(' ')[0]!.toLowerCase()}_${letters(6)}`);
  await expect(page.getByText('Available', { exact: true })).toBeVisible();
  await page.getByLabel('Your idea in one line').fill('Bookkeeping for market stalls');
  await page.getByLabel('Company name').fill(`${name.split(' ')[0]} Books ${letters(5)}`);
  await expect(page.getByText(/Available in Lagos/)).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Start' }).click();
  await expect(page.getByRole('application', { name: /Map of Lagos/ })).toBeVisible();
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

/** Open a place from the Places list by its kind (lists are grouped by each city's districts). */
async function openPlace(page: Page, kind: string) {
  await page.getByRole('button', { name: /Places/ }).click();
  await page
    .getByRole('dialog', { name: 'Places' })
    .locator(`[data-kind="${kind}"]`)
    .first()
    .click();
  await more(page);
}

test('AI characters are inside buildings: Who’s here, then their card', async ({ page }) => {
  await signUpFounder(page, 'Kemi Walker');

  // The street has a few anonymous passers-by, and nobody to tap.
  await expect(page.locator('[data-walker]').first()).toBeAttached();
  await expect(page.locator('[data-person]')).toHaveCount(0);

  // Who's around: the notable people, by the building they're in. A fund
  // partner spends the month somewhere in town (a hotel, a restaurant, their
  // office): going there opens that place.
  await page.getByRole('button', { name: /Who’s here/ }).click();
  const list = page.getByRole('list', { name: 'People around' });
  await list
    .getByRole('button', { name: /Fund partner/ })
    .first()
    .click();
  const scene = page.locator('.place-scene');
  await expect(scene).toBeVisible({ timeout: 10_000 });

  // Inside, Who's here lists the partner, with Chat and Save.
  await scene.getByRole('button', { name: /Who’s here/ }).click();
  const here = page.getByRole('dialog', { name: 'Who’s here' });
  const partner = here.locator('[data-person-here^="fund:"]').first();
  await expect(partner).toContainText(/Partner/i);
  await expect(partner.getByRole('button', { name: 'Chat' })).toBeVisible();
  await expect(partner.getByRole('button', { name: /Save/ })).toBeVisible();
  await here.getByRole('button', { name: 'Close' }).click();
  await scene.getByRole('button', { name: 'Close' }).first().click();

  // The Event Hall is open (or says it opens soon), with the host form.
  await openPlace(page, 'eventhall');
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
  // Two sign-ups, presence polling and a month's settlement: a long scenario.
  test.slow();
  const b = await (
    await browser.newContext({ ...phone, baseURL: test.info().project.use.baseURL })
  ).newPage();
  await withoutNetlifyDrawer(b);
  // Unique surnames per run: a deploy preview keeps earlier runs' players.
  const tag = letters(5);
  // The run’s tag goes in the first name, which is what people see first.
  const hostFirst = `Amaka${tag}`;
  const hostName = `${hostFirst} Host`;
  await signUpFounder(a, hostName);
  test.skip(!(await presenceAvailable(a)), 'Presence API not deployed here.');
  await signUpFounder(b, `Bode${tag} Guest`);

  // A goes into the Hub. B sees a player there (a count on the building,
  // polled every 5 s), goes in, finds A under Who's here and starts a chat.
  await a.getByRole('button', { name: /Places/ }).click();
  await a.getByRole('dialog', { name: 'Places' }).locator('[data-kind="hub"]').first().click();
  await expect(a.locator('.place-scene')).toBeVisible({ timeout: 10_000 });
  const badge = b.locator('[data-here="hub"]');
  await expect(badge).toBeAttached({ timeout: 20_000 });
  await tapPlace(b, '[data-here="hub"]');
  const hub = b.locator('.place-scene');
  await expect(hub).toBeVisible({ timeout: 10_000 });
  await hub.getByRole('button', { name: /Who’s here/ }).click();
  const host = b
    .getByRole('dialog', { name: 'Who’s here' })
    .locator('[data-kind="player"]', { hasText: hostName });
  await expect(host).toBeVisible({ timeout: 10_000 });
  await host.getByRole('button', { name: 'Chat' }).click();
  const bPhone = b.getByRole('dialog', { name: 'Phone' });
  await bPhone.locator('.choice').first().click();
  await expect(bPhone.locator('.bubble').first()).toBeVisible();
  await a.getByRole('button', { name: 'Close' }).first().click();
  await b.reload();

  test.skip(!(await eventsAvailable(a)), 'Engine events not deployed here.');

  // A hosts a free founder meetup this month at the Event Hall.
  await openPlace(a, 'eventhall');
  const hall = a.getByRole('dialog');
  await expect(hall.getByRole('heading', { name: 'Host an event' })).toBeVisible({
    timeout: 8000,
  });
  await hall.getByRole('radio', { name: /Founder meetup/ }).click();
  // Unique per run: a deploy preview keeps one world, with earlier runs' events in it.
  const title = `Stall founders ${letters(5)}`;
  await hall.getByLabel('Title').fill(title);
  await hall.getByRole('radio', { name: 'This month' }).click();
  await hall.getByLabel(/Budget/).fill('0');
  await hall.getByRole('button', { name: 'Host it' }).click();
  await expect(hall.getByText(title)).toBeVisible();
  await expect(hall.getByText('You host')).toBeVisible();

  // B RSVPs.
  await b.getByRole('application', { name: /Map of Lagos/ }).waitFor();
  await openPlace(b, 'eventhall');
  const bHall = b.getByRole('dialog');
  await bHall.getByRole('button', { name: `RSVP to ${title}` }).click();
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
    await openPlace(p, 'eventhall');
    const past = p.getByRole('list', { name: 'Past events' });
    await expect(past.getByText(title)).toBeVisible({ timeout: 8000 });
    await expect(past.getByText('Your recap')).toBeVisible();
  }
});

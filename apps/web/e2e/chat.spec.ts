import {
  devices,
  type Browser,
  type BrowserContext,
  type Locator,
  type Page,
} from '@playwright/test';
import { expect, letters, playAsGuest, test, withoutNetlifyDrawer } from './fixtures';

/**
 * Wave 13: a chat between two real players. No conversation starters (the
 * first message typed starts it), emoji, a voice note the other player plays,
 * money sent from the chat (a card on both sides, the receiver's balance up
 * by exactly the amount), and doing things together from the "+" menu: a
 * date, an invitation over, a tech event and a home given as a gift, each
 * answered from its card.
 *
 * Chromium fakes a microphone (a beep) and grants it. CHAT_SHOTS=<dir> saves
 * 390×844 screenshots.
 */

test.use({
  launchOptions: {
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
  },
  permissions: ['microphone'],
});

const SHOTS = process.env.CHAT_SHOTS;
const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
};

/** Both players live in Johannesburg, where a new founder can buy a small flat outright. */
async function player(page: Page, name: string) {
  await page.setViewportSize({ width: 390, height: 844 });
  await createPlayer(page, name);
  await page.reload();
  await expect(page.getByRole('button', { name: /^Phone/ })).toBeVisible({ timeout: 30_000 });
}

/** A Johannesburg founder made through the API. */
async function createPlayer(page: Page, name: string) {
  await playAsGuest(page);
  const handle = `ch_${letters(8)}`;
  const status = await page.evaluate(
    async ({ h, name }) => {
      const r = await fetch('/api/commands', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-runway': '1' },
        body: JSON.stringify({
          command: {
            type: 'player.create',
            handle: h,
            name,
            role: 'founder',
            backgroundId: 'f-engineer',
            market: 'johannesburg',
            gender: 'female',
            company: {
              name: `Chat ${h.slice(3)}`,
              industry: 'fintech',
              revenueModel: 'subscription',
              idea: 'Payments for market traders',
              incorporation: 'local',
            },
          },
        }),
      });
      return r.status;
    },
    { h: handle, name },
  );
  expect(status).toBe(200);
}

/**
 * A shared test world can run short of flats a new founder affords alone,
 * and one friend can only send so much a day: friends chip in, each up to
 * their daily limit, until `to` has `amount` more.
 */
async function chipIn(browser: Browser, payer: Page, to: string, amount: number) {
  let left = amount;
  for (let n = 0; left > 0 && n < 16; n++) {
    let page = payer;
    let ctx: BrowserContext | null = null;
    if (n > 0) {
      ctx = await browser.newContext({ baseURL: test.info().project.use.baseURL });
      page = await ctx.newPage();
      await withoutNetlifyDrawer(page);
      await createPlayer(page, `Friend${letters(4)} Mokoena`);
    }
    const send = Math.min(left, (await state(page)).sendMoney.left);
    const res = await command(page, { type: 'money.send', toPlayerId: to, amount: send });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    left -= send;
    await ctx?.close();
  }
  expect(left, 'friends chipped in enough').toBeLessThanOrEqual(0);
}

interface State {
  me: { id: string; properties: { id: string }[] };
  accounts: { local: { balance: number; currency: string } };
  sendMoney: { left: number };
  market: {
    properties: {
      listings: {
        id: string;
        canBuy: boolean;
        forSale: boolean;
        price: number;
        closingCosts: number;
      }[];
    };
  };
  living: { dates: { id: string; status: string }[] };
  visits?: { incoming: { id: string; status: string }[] };
  visiting?: { host: { id: string } } | null;
}
const state = (page: Page) =>
  page.evaluate(async () => {
    const s = await (await fetch('/api/state', { headers: { 'x-runway': '1' } })).json();
    return (s.view ?? s) as State;
  });
const command = (page: Page, cmd: unknown) =>
  page.evaluate(async (c) => {
    const r = await fetch('/api/commands', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-runway': '1' },
      body: JSON.stringify({ command: c }),
    });
    return { status: r.status, body: await r.json() };
  }, cmd);

/** Open Messages and the chat with a player (by name), through New message. */
async function openChat(page: Page, name: string) {
  const phone = page.getByRole('dialog', { name: 'Phone' });
  if (!(await phone.isVisible())) await page.getByRole('button', { name: /^Phone/ }).click();
  await expect(phone).toBeVisible();
  while (!(await phone.locator('[data-phone-app="home"]').isVisible()))
    await phone.getByRole('button', { name: 'Back' }).click();
  await phone.locator('[data-app="messages"]').click();
  await phone.getByRole('button', { name: 'New message' }).click();
  await phone.getByLabel('Search people').fill(name.split(' ')[0]!);
  await phone.locator('.phone-row', { hasText: name }).first().click();
  await expect(phone.locator('[data-player-thread]')).toBeVisible();
  return phone;
}

/** The newest card of a type in the open thread. */
const lastCard = (phone: Locator, type: string) => phone.locator(`[data-card="${type}"]`).last();

test('players chat with emoji and voice notes, pay, date, visit, go out and give a home', async ({
  page: a,
  browser,
}) => {
  test.slow();
  test.setTimeout(240_000);
  const { defaultBrowserType: _, ...phoneDevice } = devices['Pixel 7'];
  const ctxB = await browser.newContext({
    ...phoneDevice,
    baseURL: test.info().project.use.baseURL,
    permissions: ['microphone'],
  });
  const b = await ctxB.newPage();
  await withoutNetlifyDrawer(b);
  const tag = letters(4);
  const aName = `Amara${tag} Okafor`;
  const bName = `Bongani${tag} Dube`;
  await player(a, aName);
  await player(b, bName);
  const aId = (await state(a)).me.id;
  const bId = (await state(b)).me.id;
  await a.reload();
  await expect(a.getByRole('button', { name: /^Phone/ })).toBeVisible({ timeout: 30_000 });

  // ---- 1. No starters: an empty thread with a normal message box.
  const aPhone = await openChat(a, bName);
  await expect(aPhone.getByText('Start with one tap')).toHaveCount(0);
  await expect(aPhone.locator('.choice')).toHaveCount(0);
  await expect(aPhone.getByText('No messages yet. Say hello 👋')).toBeVisible();
  await shot(a, 'chat-empty');

  // ---- 2. Emoji: the picker inserts at the cursor; the first message starts the chat.
  const box = aPhone.getByLabel('Message', { exact: true });
  await box.fill('Hello  how are you?');
  await box.evaluate((el: HTMLInputElement) => el.setSelectionRange(6, 6));
  await aPhone.getByRole('button', { name: 'Emoji', exact: true }).click();
  const picker = aPhone.getByRole('dialog', { name: 'Emoji' });
  await expect(picker).toBeVisible();
  await picker.getByRole('button', { name: 'People' }).click();
  await picker.getByRole('button', { name: 'Insert 👋' }).click();
  await expect(box).toHaveValue('Hello 👋 how are you?');
  await picker.getByRole('button', { name: 'Hearts' }).click();
  await shot(a, 'chat-emoji-picker');
  await box.press('End');
  await picker.getByRole('button', { name: 'Insert 🔥' }).click();
  await expect(box).toHaveValue('Hello 👋 how are you?🔥');
  await aPhone.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(
    aPhone.locator('.bubble.mine', { hasText: 'Hello 👋 how are you?🔥' }),
  ).toBeVisible();

  // B sees it.
  const bPhone = await openChat(b, aName);
  await expect(bPhone.locator('.bubble:not(.mine)', { hasText: 'Hello 👋' })).toBeVisible({
    timeout: 15_000,
  });

  // ---- 3. A voice note from B, played by A.
  await bPhone.getByRole('button', { name: 'Record a voice note' }).click();
  const rec = bPhone.getByRole('group', { name: 'Recording a voice note' });
  await expect(rec).toBeVisible();
  await expect(rec.locator('[data-recording-ms]')).toContainText('0:02', { timeout: 6000 });
  await shot(b, 'chat-recording');
  await rec.getByRole('button', { name: 'Send voice note' }).click();
  await expect(bPhone.locator('.chat-voice-bubble.mine')).toBeVisible({ timeout: 10_000 });

  const note = aPhone.locator('.chat-voice-bubble:not(.mine)').last();
  await expect(note).toBeVisible({ timeout: 15_000 });
  await expect(note.locator('.chat-voice-time')).toHaveText(/0:0[2-4]/);
  await note.getByRole('button', { name: 'Play voice note' }).click();
  await expect(note.locator('[data-voice-state]')).toHaveAttribute(
    'data-voice-state',
    /playing|ended/,
  );
  await expect
    .poll(async () => Number(await note.getByRole('progressbar').getAttribute('aria-valuenow')), {
      timeout: 10_000,
    })
    .toBeGreaterThan(0);
  await shot(a, 'chat-voice-note');
  // The audio is A's and B's only: A can fetch it, a third player can't.
  const voiceSrc = await note.locator('[data-voice-src]').getAttribute('data-voice-src');
  expect(voiceSrc).toMatch(/^\/api\/chats\/.+\/voice\/vn_/);
  const mineFetch = await a.evaluate(async (u) => {
    const r = await fetch(u);
    return { status: r.status, type: r.headers.get('content-type'), size: (await r.blob()).size };
  }, voiceSrc!);
  expect(mineFetch.status).toBe(200);
  expect(mineFetch.type).toMatch(/^audio\//);
  expect(mineFetch.size).toBeGreaterThan(1000);

  // ---- 4. Money from the chat: a card on both sides; B's balance up by exactly the amount.
  const b0 = (await state(b)).accounts.local.balance;
  await aPhone.getByRole('button', { name: 'Do something together' }).click();
  await aPhone.getByRole('menuitem', { name: /Send money/ }).click();
  const flow = aPhone.locator('[data-send-step]');
  await expect(flow).toHaveAttribute('data-send-step', 'amount');
  await expect(flow).toContainText(bName);
  await flow.getByLabel('Amount', { exact: true }).fill('500');
  await flow.getByLabel('Note', { exact: true }).fill('Lunch 🍲');
  await flow.getByRole('button', { name: 'Continue' }).click();
  await flow.getByRole('button', { name: /^Send / }).click();
  await expect(flow.locator('[data-sent]')).toBeVisible({ timeout: 10_000 });
  const aPay = lastCard(aPhone, 'payment');
  await expect(aPay).toContainText(/You sent R\s?500/);
  await expect(aPay).toContainText('Lunch 🍲');
  await flow.getByRole('button', { name: 'Done' }).click();
  const bPay = lastCard(bPhone, 'payment');
  await expect(bPay).toContainText(/Amara\w* sent you R\s?500/, { timeout: 15_000 });
  await expect(bPay).toContainText('Lunch 🍲');
  expect((await state(b)).accounts.local.balance - b0).toBe(50_000);
  await shot(b, 'chat-payment-received');

  // ---- 5. Invite over: B accepts from the card and goes in.
  await aPhone.getByRole('button', { name: 'Do something together' }).click();
  await aPhone.getByRole('menuitem', { name: /Invite over/ }).click();
  await expect(lastCard(aPhone, 'visit')).toHaveAttribute('data-card-status', 'pending');
  const bVisit = lastCard(bPhone, 'visit');
  await expect(bVisit).toBeVisible({ timeout: 15_000 });
  await bVisit.getByRole('button', { name: 'Accept' }).click();
  const home = b.locator(`.home-scene[data-host-view="${aId}"]`);
  await expect(home).toBeVisible({ timeout: 10_000 });
  expect((await state(b)).visiting?.host.id).toBe(aId);
  await home.getByRole('button', { name: 'Say goodbye' }).click();
  await expect(home).toBeHidden();
  await expect(lastCard(aPhone, 'visit')).toHaveAttribute('data-card-status', 'accepted', {
    timeout: 15_000,
  });

  // ---- 6. A date on one of Johannesburg's sky views: B accepts from the card.
  await aPhone.getByRole('button', { name: 'Do something together' }).click();
  await aPhone.getByRole('menuitem', { name: /Plan a date/ }).click();
  const datePanel = aPhone.getByRole('region', { name: 'Plan a date' });
  await expect(datePanel.locator('[data-date-place]').first()).toBeVisible();
  await shot(a, 'chat-plan-date');
  await datePanel.getByRole('button', { name: 'Send the invitation' }).click();
  await expect(lastCard(aPhone, 'date')).toHaveAttribute('data-card-status', 'invited');
  const bPhone2 = await openChat(b, aName);
  const bDate = lastCard(bPhone2, 'date');
  await expect(bDate).toBeVisible({ timeout: 15_000 });
  await bDate.getByRole('button', { name: 'Accept date' }).click();
  await expect(b.getByRole('dialog', { name: 'Home and social experiences' })).toBeVisible({
    timeout: 10_000,
  });
  expect((await state(b)).living.dates.some((d) => d.status === 'together')).toBe(true);
  await shot(b, 'chat-date-together');
  await b.getByRole('button', { name: 'Close home experiences' }).click();
  await expect(lastCard(aPhone, 'date')).toHaveAttribute('data-card-status', 'together', {
    timeout: 15_000,
  });

  // ---- 7. A tech event together: both go from the card.
  await aPhone.getByRole('button', { name: 'Do something together' }).click();
  await aPhone.getByRole('menuitem', { name: /Tech event together/ }).click();
  const evPanel = aPhone.getByRole('region', { name: 'Tech event together' });
  await expect(evPanel.locator('[data-event-pick]').first()).toBeVisible();
  await evPanel.getByRole('button', { name: /^Invite / }).click();
  const aEvent = lastCard(aPhone, 'techevent');
  await expect(aEvent).toBeVisible();
  await aEvent.getByRole('button', { name: 'Go together' }).click();
  await expect(aEvent).toContainText('You went ✓');
  const bPhone3 = await openChat(b, aName);
  const bEvent = lastCard(bPhone3, 'techevent');
  await expect(bEvent).toBeVisible({ timeout: 15_000 });
  await bEvent.getByRole('button', { name: 'Go together' }).click();
  await expect(bEvent).toContainText('You went ✓');
  await expect(aEvent).toContainText(/Going: You, Bongani/, { timeout: 15_000 });

  // ---- 8. A home as a gift. A buys a small flat outright (setup), then gives it from the chat.
  let listings = (await state(a)).market.properties.listings;
  if (!listings.some((l) => l.canBuy)) {
    // Short of flats A affords alone: B (and more friends, if it takes
    // more than one day's limit) chip in the difference for the cheapest one.
    const cheapest = listings.filter((l) => l.forSale).sort((x, y) => x.price - y.price)[0]!;
    const cash = (await state(a)).accounts.local.balance;
    const gap = cheapest.price + cheapest.closingCosts - cash + 100_00;
    if (gap > 0) {
      test.setTimeout(test.info().timeout + 120_000);
      await chipIn(browser, b, aId, gap);
    }
    listings = (await state(a)).market.properties.listings;
  }
  const listing = listings.filter((l) => l.canBuy).sort((x, y) => x.price - y.price)[0];
  expect(listing, 'a home A can afford').toBeTruthy();
  expect((await command(a, { type: 'property.buy', propertyId: listing!.id })).status).toBe(200);
  // Back on the market whatever happens next: a run that stops half-way
  // mustn't keep the city's only flat a new founder can afford.
  let back = false;
  let aPhone2: Locator;
  try {
    await a.reload();
    aPhone2 = await openChat(a, bName);
    await aPhone2.getByRole('button', { name: 'Do something together' }).click();
    await aPhone2.getByRole('menuitem', { name: /Give a home/ }).click();
    const giftPanel = aPhone2.getByRole('region', { name: 'Give a home' });
    await giftPanel.locator(`[data-gift-pick="${listing!.id}"] input`).check();
    await shot(a, 'chat-give-home');
    await giftPanel.getByRole('button', { name: /^Give it to / }).click();
    await expect(lastCard(aPhone2, 'gift')).toHaveAttribute('data-card-status', 'pending');
    const bPhone4 = await openChat(b, aName);
    const bGift = lastCard(bPhone4, 'gift');
    await expect(bGift).toBeVisible({ timeout: 15_000 });
    await bGift.getByRole('button', { name: 'Accept the home' }).click();
    await expect(bGift).toHaveAttribute('data-card-status', 'accepted', { timeout: 10_000 });
    expect((await state(b)).me.properties.map((p) => p.id)).toContain(listing!.id);
    expect((await state(a)).me.properties.map((p) => p.id)).not.toContain(listing!.id);
    await expect(lastCard(aPhone2, 'gift')).toHaveAttribute('data-card-status', 'accepted', {
      timeout: 15_000,
    });
    await shot(b, 'chat-gift-accepted');
    // B sells it straight back to the market, so the city's stock of small flats stays
    // the same run after run (the deploy preview keeps one world across runs).
    expect((await command(b, { type: 'property.sell', propertyId: listing!.id })).status).toBe(200);
    back = true;
  } finally {
    if (!back)
      for (const owner of [a, b])
        await command(owner, { type: 'property.sell', propertyId: listing!.id }).catch(() => null);
  }
  await shot(a, 'chat-thread-a');

  // The composer fits one row on a 390 and a 360 phone: + · emoji · message · mic · Send.
  for (const width of [390, 360]) {
    await a.setViewportSize({ width, height: width === 360 ? 780 : 844 });
    const form = aPhone2.locator('.chat-composer form');
    await form.scrollIntoViewIfNeeded();
    const controls = [
      aPhone2.getByRole('button', { name: 'Do something together' }),
      aPhone2.getByRole('button', { name: 'Emoji', exact: true }),
      aPhone2.getByLabel('Message', { exact: true }),
      aPhone2.getByRole('button', { name: 'Record a voice note' }),
      aPhone2.getByRole('button', { name: 'Send', exact: true }),
    ];
    const frame = (await aPhone2.locator('.phone-frame').boundingBox())!;
    const boxes = await Promise.all(controls.map(async (c) => (await c.boundingBox())!));
    const mid = (b: { y: number; height: number }) => b.y + b.height / 2;
    for (const b of boxes) {
      expect(Math.abs(mid(b) - mid(boxes[0]!)), `one row at ${width}px`).toBeLessThan(6);
      expect(b.x).toBeGreaterThanOrEqual(frame.x);
      expect(b.x + b.width).toBeLessThanOrEqual(frame.x + frame.width);
      expect(b.y + b.height).toBeLessThanOrEqual(frame.y + frame.height);
    }
    for (let i = 1; i < boxes.length; i++)
      expect(boxes[i]!.x).toBeGreaterThanOrEqual(boxes[i - 1]!.x + boxes[i - 1]!.width - 1);
    await shot(a, `chat-composer-${width}`);
  }

  // Someone outside the chat can't play the voice note.
  const c = await (
    await browser.newContext({ ...phoneDevice, baseURL: test.info().project.use.baseURL })
  ).newPage();
  await withoutNetlifyDrawer(c);
  await player(c, `Chidi${tag} Eze`);
  expect(await c.evaluate(async (u) => (await fetch(u)).status, voiceSrc!)).toBe(404);
  expect(bId).not.toBe(aId);
});

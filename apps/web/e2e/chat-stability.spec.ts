import { type Locator, type Page } from '@playwright/test';
import { expect, letters, playAsGuest, test, withoutNetlifyDrawer } from './fixtures';

/**
 * A chat on a 390×844 phone stays put while you use it. Each check here was
 * a bug players saw as "the chat glitches / moves / hides":
 *
 * 1. The newest message isn't under the message box, and the box doesn't
 *    move up and down with how far you've scrolled.
 * 2. Scrolled up to read, a new message doesn't yank you to the bottom.
 * 3. A slow poll answering after your send doesn't make your message vanish
 *    (nor show twice): it's on screen from the moment you send.
 * 4. A toast doesn't sit on the newest messages or the message box.
 * 5. Going from one chat straight into another (a banner) shows the second
 *    chat, not the first one's messages, name and draft.
 * 6. With the on-screen keyboard up (a shorter visual viewport), the phone
 *    fits above it: head, newest message and message box all on screen.
 */

async function createPlayer(page: Page, name: string) {
  await page.setViewportSize({ width: 390, height: 844 });
  await playAsGuest(page);
  const h = `cs_${letters(8)}`;
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
              name: `Steady ${h.slice(3)}`,
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
    { h, name },
  );
  expect(status).toBe(200);
  await page.reload();
  await expect(page.getByRole('button', { name: /^Phone/ })).toBeVisible({ timeout: 30_000 });
  return (await page.evaluate(async () => {
    const s = await (await fetch('/api/state', { headers: { 'x-runway': '1' } })).json();
    return (s.view ?? s).me.id;
  })) as string;
}

const call = (page: Page, method: string, path: string, body?: unknown) =>
  page.evaluate(
    async ({ method, path, body }) => {
      const r = await fetch(path, {
        method,
        headers: { 'content-type': 'application/json', 'x-runway': '1' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return { status: r.status, body: await r.json().catch(() => null) };
    },
    { method, path, body },
  );

async function openChat(page: Page, name: string) {
  const phone = page.getByRole('dialog', { name: 'Phone' });
  if (!(await phone.isVisible())) await page.getByRole('button', { name: /^Phone/ }).click();
  while (!(await phone.locator('[data-phone-app="home"]').isVisible()))
    await phone.getByRole('button', { name: 'Back' }).click();
  await phone.locator('[data-app="messages"]').click();
  await phone.getByRole('button', { name: 'New message' }).click();
  await phone.getByLabel('Search people').fill(name.split(' ')[0]!);
  await phone.locator('.phone-row', { hasText: name }).first().click();
  await expect(phone.locator('[data-player-thread]')).toBeVisible();
  return phone;
}

/** The log's scroll position, or set it ('top' / 'bottom' / a number). */
const logScroll = (page: Page, to?: 'top' | 'bottom' | number) =>
  page.evaluate((to) => {
    const log = document.querySelector('.phone-log') as HTMLElement;
    if (to === 'top') log.scrollTop = 0;
    else if (to === 'bottom') log.scrollTop = log.scrollHeight;
    else if (typeof to === 'number') log.scrollTop = to;
    return log.scrollTop;
  }, to);

/** The newest message is on screen, and it's what you'd tap there (nothing covers it). */
const newestUncovered = (page: Page) =>
  page.evaluate(() => {
    const last = [...document.querySelectorAll('.phone-log-items > *')].pop() as HTMLElement;
    const r = last.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + 12, r.bottom - 6);
    return !!hit && last.contains(hit);
  });

const top = async (l: Locator) => (await l.boundingBox())!.y;

test('a chat stays put on a phone: scroll, sending, toasts, switching, keyboard', async ({
  page: a,
  browser,
}) => {
  test.slow();
  const tag = letters(4);
  const bName = `Bongani${tag} Dube`;
  const cName = `Chidi${tag} Eze`;
  const aId = await createPlayer(a, `Amara${tag} Okafor`);
  const newPlayer = async (name: string) => {
    const ctx = await browser.newContext({ baseURL: test.info().project.use.baseURL });
    const p = await ctx.newPage();
    await withoutNetlifyDrawer(p);
    await createPlayer(p, name);
    return p;
  };
  const b = await newPlayer(bName);
  await newPlayer(cName);

  // B starts a chat with A, with enough history to scroll.
  const start = await call(b, 'POST', '/api/chats', { playerId: aId, text: 'hi', starter: 'hi' });
  expect(start.status, JSON.stringify(start.body)).toBe(200);
  const chatId = start.body.chat.id as string;
  for (let i = 0; i < 20; i++) {
    const r = await call(i % 2 ? a : b, 'POST', `/api/chats/${chatId}/messages`, {
      text: `history line ${i} ${'more '.repeat(i % 5)}`,
    });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
  }
  await a.reload();
  await expect(a.getByRole('button', { name: /^Phone/ })).toBeVisible({ timeout: 30_000 });
  const phone = await openChat(a, bName);
  await expect(phone.locator('.bubble', { hasText: 'history line 19' })).toBeVisible();

  // ---- 1. The newest message is clear of the box; the box stays where it is.
  await expect.poll(() => newestUncovered(a)).toBe(true);
  const composer = phone.locator('.chat-composer');
  const atBottom = await top(composer);
  await logScroll(a, 'top');
  expect(await top(composer)).toBeCloseTo(atBottom, 0);
  await expect(phone.locator('.phone-thread-head')).toBeInViewport();

  // ---- 2. Reading further up: a new message arrives and you stay where you were.
  await logScroll(a, 120);
  await call(b, 'POST', `/api/chats/${chatId}/messages`, { text: 'arrives while reading' });
  await expect(phone.locator('.bubble', { hasText: 'arrives while reading' })).toHaveCount(1, {
    timeout: 10_000,
  });
  expect(await logScroll(a)).toBe(120);

  // ---- 3. Your message never vanishes, even when a slow poll lands after the send.
  await logScroll(a, 'bottom');
  const counts: number[] = [];
  await a.exposeFunction('chatCount', (n: number) => counts.push(n));
  await a.evaluate(() => {
    const log = document.querySelector('.phone-log')!;
    const count = () => log.querySelectorAll('.phone-log-items > .bubble').length;
    (window as unknown as { chatCount: (n: number) => void }).chatCount(count());
    new MutationObserver(() =>
      (window as unknown as { chatCount: (n: number) => void }).chatCount(count()),
    ).observe(log, { childList: true, subtree: true });
  });
  let held = false;
  await a.route(`**/api/chats/${chatId}/messages`, async (route) => {
    if (route.request().method() !== 'GET' || held) return route.continue();
    held = true;
    const res = await route.fetch();
    await new Promise((r) => setTimeout(r, 2500));
    await route.fulfill({ response: res });
  });
  await expect.poll(() => held, { timeout: 10_000 }).toBe(true);
  await phone.getByLabel('Message', { exact: true }).fill('sent during a slow poll');
  await phone.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(phone.locator('.bubble.mine', { hasText: 'sent during a slow poll' })).toHaveCount(
    1,
  );
  await a.waitForTimeout(3500);
  await a.unroute(`**/api/chats/${chatId}/messages`);
  await expect(phone.locator('.bubble.mine', { hasText: 'sent during a slow poll' })).toHaveCount(
    1,
  );
  await expect(phone.locator('[data-pending]')).toHaveCount(0);
  for (let i = 1; i < counts.length; i++)
    expect(counts[i], `bubble counts ${counts.join(',')}`).toBeGreaterThanOrEqual(counts[i - 1]!);
  expect(counts.at(-1)! - counts[0]!).toBe(1);
  await expect.poll(() => newestUncovered(a)).toBe(true);

  // ---- 4. A toast keeps off the newest message and the box.
  await phone.getByRole('button', { name: 'Do something together' }).click();
  await phone.getByRole('menuitem', { name: /Invite over/ }).click();
  const toast = a.locator('.toasts .toast').first();
  await expect(toast).toBeVisible();
  const tb = (await toast.boundingBox())!;
  const newest = (await phone.locator('.phone-log-items > *').last().boundingBox())!;
  expect(tb.y + tb.height, 'toast above the newest message').toBeLessThan(newest.y);
  expect(tb.y + tb.height, 'toast above the box').toBeLessThan(await top(composer));

  // ---- 5. From a new chat with C straight into B's (a banner): B's chat, B's name, no draft.
  const pc = await openChat(a, cName);
  await pc.getByLabel('Message', { exact: true }).fill('hello C');
  await pc.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(pc.locator('.bubble.mine', { hasText: 'hello C' })).toBeVisible();
  await pc.getByLabel('Message', { exact: true }).fill('a draft for C');
  await call(b, 'POST', `/api/chats/${chatId}/messages`, { text: 'ping from B' });
  const banner = a.locator('.phone-banner-slot button').first();
  await expect(banner).toBeVisible({ timeout: 20_000 });
  await banner.click();
  const thread = a.locator('[data-player-thread]');
  await expect(thread.locator('.phone-thread-head .item-title')).toHaveText(bName);
  await expect(thread.locator('.bubble', { hasText: 'ping from B' })).toBeVisible();
  await expect(thread.locator('.bubble', { hasText: 'hello C' })).toHaveCount(0);
  await expect(thread.getByLabel('Message', { exact: true })).toHaveValue('');

  // ---- 6. The keyboard: the visual viewport is 500px tall; the phone fits in it.
  await a.evaluate(() => {
    const vv = Object.assign(new EventTarget(), {
      width: 390,
      height: 500,
      offsetTop: 0,
      scale: 1,
    });
    Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true });
  });
  await a.getByRole('button', { name: 'Close phone' }).first().click();
  const p2 = await openChat(a, bName);
  await p2.getByLabel('Message', { exact: true }).focus();
  await expect
    .poll(async () => (await a.locator('.phone').boundingBox())?.height)
    .toBeLessThanOrEqual(500);
  const box = (await p2.locator('.chat-composer').boundingBox())!;
  expect(box.y + box.height).toBeLessThanOrEqual(500);
  expect(await top(p2.locator('.phone-thread-head'))).toBeGreaterThanOrEqual(0);
  await expect.poll(() => newestUncovered(a)).toBe(true);
});

import { type Page } from '@playwright/test';
import { expect, letters, playAsGuest, test, withoutNetlifyDrawer } from './fixtures';

/**
 * Chat where the server can't stream (Netlify: /api/events answers 204 and
 * every client polls). Two players in Lagos: B is reading Messages when A
 * writes and sees it within seconds; B opens A's chat before their list
 * knows it exists and still sees A's message. Then AI characters answer,
 * a programme too, and an answer whose request was cut off on the way back
 * still shows (the phone reads the thread again instead of dropping it).
 */

async function player(page: Page, name: string) {
  await withoutNetlifyDrawer(page);
  await page.route('**/api/events', (r) => r.fulfill({ status: 204 }));
  await page.setViewportSize({ width: 390, height: 844 });
  await playAsGuest(page);
  const handle = `sl_${letters(8)}`;
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
            market: 'lagos',
            gender: 'female',
            company: {
              name: `Poll ${h.slice(3)}`,
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
  await page.reload();
  await expect(page.getByRole('button', { name: /^Phone/ })).toBeVisible({ timeout: 30_000 });
  return page.evaluate(
    async () =>
      (await (await fetch('/api/state', { headers: { 'x-runway': '1' } })).json()).view.me
        .id as string,
  );
}

async function messages(page: Page) {
  const phone = page.getByRole('dialog', { name: 'Phone' });
  if (!(await phone.isVisible())) await page.getByRole('button', { name: /^Phone/ }).click();
  await expect(phone).toBeVisible();
  while (!(await phone.locator('[data-phone-app="home"]').isVisible()))
    await phone.getByRole('button', { name: 'Back' }).click();
  await phone.locator('[data-app="messages"]').click();
  await expect(phone.getByRole('button', { name: 'New message' })).toBeVisible();
  return phone;
}

const say = (page: Page, chatId: string | null, playerId: string, text: string) =>
  page.evaluate(
    async ({ chatId, playerId, text }) => {
      const r = await fetch(chatId ? `/api/chats/${chatId}/messages` : '/api/chats', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-runway': '1' },
        body: JSON.stringify(chatId ? { text } : { playerId, text }),
      });
      const j = await r.json();
      return { status: r.status, chatId: (j.chat?.id as string | undefined) ?? chatId };
    },
    { chatId, playerId, text },
  );

test('player messages arrive and AI characters answer without a live stream', async ({
  page: a,
  browser,
}) => {
  test.slow();
  const ctxB = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  const b = await ctxB.newPage();
  const tag = letters(4);
  const aName = `Ada${tag} Poll`;
  const bName = `Bola${tag} Poll`;
  const aId = await player(a, aName);
  const bId = await player(b, bName);
  await a.reload();
  await expect(a.getByRole('button', { name: /^Phone/ })).toBeVisible({ timeout: 30_000 });

  // ---- B opens A's chat (New message) before there is one: an empty thread.
  const bPhone = await messages(b);
  await bPhone.getByRole('button', { name: 'New message' }).click();
  await bPhone.getByLabel('Search people').fill(aName.split(' ')[0]!);
  await bPhone.locator('.phone-row', { hasText: aName }).first().click();
  await expect(bPhone.locator(`[data-player-thread="${aId}"]`)).toBeVisible();
  await expect(bPhone.getByText('No messages yet. Say hello 👋')).toBeVisible();

  // A writes first: it shows in B's open thread within seconds.
  const first = await say(a, null, bId, `Hello from Ada ${tag}`);
  expect(first.status).toBe(200);
  await expect(
    bPhone.locator('.bubble:not(.mine)', { hasText: `Hello from Ada ${tag}` }),
  ).toBeVisible({ timeout: 12_000 });

  // ---- B goes back to the list; A writes again: the list shows it, unread.
  await bPhone.getByRole('button', { name: 'Back' }).click();
  await say(a, first.chatId, bId, `Still there ${tag}?`);
  const row = bPhone.locator('.phone-row', { hasText: aName });
  await expect(row).toContainText(`Still there ${tag}?`, { timeout: 12_000 });
  await expect(row.locator('.phone-unread')).toBeVisible();

  // ---- An AI founder answers as you send.
  await bPhone.getByRole('button', { name: 'New message' }).click();
  await bPhone.locator('[data-group="founder"] .phone-row').first().click();
  const thread = bPhone.locator('.phone-thread[data-thread]');
  await expect(thread).toBeVisible();
  await bPhone.getByLabel('Message', { exact: true }).fill('How is business?');
  await bPhone.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(thread.locator('.bubble.mine', { hasText: 'How is business?' })).toBeVisible();
  await expect(thread.locator('.bubble:not(.mine):not(.phone-typing)')).toHaveCount(1, {
    timeout: 15_000,
  });

  // ---- A programme (accelerator) answers too: it used to be "not around any more".
  await bPhone.getByRole('button', { name: 'Back' }).click();
  await bPhone.getByRole('button', { name: 'New message' }).click();
  await bPhone.locator('[data-group="accelerator"] .phone-row').first().click();
  const acc = bPhone.locator('.phone-thread[data-thread^="acc:"]');
  await expect(acc).toBeVisible();
  await expect(bPhone.getByText('This person isn’t around any more.')).toHaveCount(0);

  // The answer's way back is cut off (the request reached the game; the
  // phone never hears back): the thread still shows both, read again.
  await b.route('**/api/ai-chat', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    await route.fetch();
    await route.abort('connectionreset');
  });
  await bPhone.getByLabel('Message', { exact: true }).fill('What do you look for?');
  await bPhone.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(acc.locator('.bubble.mine', { hasText: 'What do you look for?' })).toBeVisible();
  await expect(acc.locator('.bubble:not(.mine):not(.phone-typing)')).toHaveCount(1, {
    timeout: 15_000,
  });
  await expect(bPhone.getByLabel('Message', { exact: true })).toHaveValue('');
  await b.unroute('**/api/ai-chat');
  await ctxB.close();
});

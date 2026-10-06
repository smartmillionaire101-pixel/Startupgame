import { devices, type Page } from '@playwright/test';
import { expect, letters, playAsGuest, test, withoutNetlifyDrawer } from './fixtures';

/**
 * Wave 8 §C (docs/WAVE8-REAL-AND-SOCIAL.md): friends. Two players: A sends B
 * money and both balances change; A invites B over, B accepts and sees A's
 * home; A plans a hangout at a bar and B joins. And a player goes to a tech
 * event and comes away with contacts.
 *
 * SOCIAL_SHOTS=<dir> also saves 390×844 screenshots of the send-money flow,
 * the Events app, a tech event and a home visit.
 */

const SHOTS = process.env.SOCIAL_SHOTS;
const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
};

async function player(page: Page, name: string) {
  await page.setViewportSize({ width: 390, height: 844 });
  await playAsGuest(page);
  const handle = `so_${letters(8)}`;
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
              name: `Social ${h.slice(3)}`,
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
}

interface TechEvent {
  id: string;
  status: string;
  attended: boolean;
  venue: { placeId: string };
}
interface State {
  me: { id: string; contacts?: unknown[] };
  accounts: { local: { balance: number } };
  market: { techEvents?: TechEvent[]; businesses?: { id: string; kind: string; open?: boolean }[] };
  hangouts?: { id: string; members: { id: string }[] }[];
  visiting?: { host: { id: string } } | null;
}
const state = (page: Page) =>
  page.evaluate(async () => {
    const s = await (await fetch('/api/state', { headers: { 'x-runway': '1' } })).json();
    return (s.view ?? s) as State;
  });

async function openApp(page: Page, app: string) {
  const phone = page.getByRole('dialog', { name: 'Phone' });
  if (!(await phone.isVisible())) await page.getByRole('button', { name: /^Phone/ }).click();
  await expect(phone).toBeVisible();
  if (!(await phone.locator('[data-phone-app="home"]').isVisible()))
    await phone.getByRole('button', { name: 'Back' }).click();
  await phone.locator(`[data-app="${app}"]`).click();
  await expect(phone.locator(`[data-phone-app="${app}"]`)).toBeVisible();
  return phone;
}

const closePhone = async (page: Page) => {
  const phone = page.getByRole('dialog', { name: 'Phone' });
  if (await phone.isVisible())
    await phone.getByRole('button', { name: 'Close phone' }).first().click();
};

test('friends: send money, visit a home and hang out at a bar', async ({ page: a, browser }) => {
  test.slow();
  const { defaultBrowserType: _, ...phone } = devices['Pixel 7'];
  const b = await (
    await browser.newContext({ ...phone, baseURL: test.info().project.use.baseURL })
  ).newPage();
  await withoutNetlifyDrawer(b);
  const tag = letters(4);
  await player(a, `Ada${tag} Sender`);
  await player(b, `Bola${tag} Friend`);
  const sb0 = await state(b);
  const bId = sb0.me.id;
  const sa0 = await state(a);
  const aId = sa0.me.id;
  // A sees B as a player in town.
  await a.reload();
  await expect(a.getByRole('button', { name: /^Phone/ })).toBeVisible({ timeout: 30_000 });

  // ---- A sends B money from the wallet: pick, amount, note, confirm.
  let wallet = await openApp(a, 'bank');
  await wallet.locator('[data-send-money]').click();
  const flow = wallet.locator('[data-send-step]');
  await flow.locator(`[data-friend="${bId}"]`).click();
  await expect(flow).toHaveAttribute('data-send-step', 'amount');
  await flow.getByLabel('Amount', { exact: true }).fill('1000');
  await flow.getByLabel('Note', { exact: true }).fill('For lunch');
  await shot(a, 'send-money-amount');
  await flow.getByRole('button', { name: 'Continue' }).click();
  await expect(flow.locator('[data-confirm]')).toBeVisible();
  await shot(a, 'send-money-confirm');
  await flow.getByRole('button', { name: /^Send / }).click();
  await expect(flow.locator('[data-sent]')).toBeVisible({ timeout: 10_000 });
  await shot(a, 'send-money-sent');
  const sa1 = await state(a);
  const sb1 = await state(b);
  expect(sb1.accounts.local.balance - sb0.accounts.local.balance).toBe(100_000);
  // A paid the amount and a fee.
  expect(sa0.accounts.local.balance - sa1.accounts.local.balance).toBeGreaterThan(100_000);

  // ---- A invites B over (B is in A's contacts now); B accepts and sees A's home.
  wallet = await openApp(a, 'contacts');
  const contact = wallet.locator(`[data-contact="${bId}"]`);
  await contact.getByRole('button', { name: 'Invite over' }).click();
  await expect(a.getByText('Invitation sent.', { exact: false }).first()).toBeVisible();
  await closePhone(a);

  await b.reload();
  await expect(b.getByRole('button', { name: /^Phone/ })).toBeVisible({ timeout: 30_000 });
  const bPhone = await openApp(b, 'events');
  const invite = bPhone.locator('[data-visit-invite]').first();
  await expect(invite).toBeVisible({ timeout: 10_000 });
  await invite.getByRole('button', { name: 'Accept' }).click();
  const home = b.locator(`.home-scene[data-host-view="${aId}"]`);
  await expect(home).toBeVisible({ timeout: 10_000 });
  await expect(home.locator(`[data-guest="${aId}"]`)).toBeAttached();
  await expect(home.locator('[data-home-avatar]')).toBeAttached();
  await b.waitForTimeout(600);
  await shot(b, 'home-visit');
  expect((await state(b)).visiting?.host.id).toBe(aId);
  await home.getByRole('button', { name: 'Say goodbye' }).click();
  await expect(home).toBeHidden();

  // ---- A plans a hangout at a bar; B joins.
  const bar = (sa1.market.businesses ?? []).find(
    (x) => x.open !== false && /^(bar|pub|lounge-bar|lounge)$/.test(x.kind),
  );
  expect(bar).toBeTruthy();
  const aPhone = await openApp(a, 'contacts');
  await aPhone
    .locator(`[data-contact="${bId}"]`)
    .getByRole('button', { name: 'Plan a hangout' })
    .click();
  const plan = aPhone.getByRole('region', { name: 'Plan a hangout' });
  await plan.getByLabel('Where').selectOption(bar!.id);
  await plan.getByRole('button', { name: 'Now' }).click();
  await plan.getByRole('button', { name: 'Send the plan' }).click();
  await expect(a.getByText('Plans made.', { exact: false }).first()).toBeVisible();

  await b.reload();
  await expect(b.getByRole('button', { name: /^Phone/ })).toBeVisible({ timeout: 30_000 });
  const bEvents = await openApp(b, 'events');
  const h = bEvents.locator('[data-hangout]').first();
  await expect(h).toBeVisible({ timeout: 10_000 });
  await h.getByRole('button', { name: 'Join' }).click();
  await expect
    .poll(async () => ((await state(b)).hangouts ?? [])[0]?.members.map((m) => m.id) ?? [], {
      timeout: 10_000,
    })
    .toEqual(expect.arrayContaining([aId, bId]));
});

test('tech events: the Events app, go to the venue, attend and meet people', async ({ page }) => {
  await player(page, `Tess${letters(4)} Techie`);
  const s0 = await state(page);
  const on = (s0.market.techEvents ?? []).filter((e) => e.status === 'on' && !e.attended);
  expect(on.length).toBeGreaterThanOrEqual(3);
  // The Hub is always on the map; else any venue.
  const e = on.find((x) => x.venue.placeId === 'hub') ?? on[0]!;
  const contacts0 = (s0.me.contacts ?? []).length;

  const phone = await openApp(page, 'events');
  await expect(phone.locator('[data-tech-event]').first()).toBeVisible();
  await shot(page, 'events-app');
  await phone
    .locator(`[data-tech-event="${e.id}"]`)
    .getByRole('button', { name: 'Go to the venue' })
    .click();

  const scene = page.locator(`.tech-scene[data-tech-scene="${e.id}"]`);
  await expect(scene).toBeVisible({ timeout: 30_000 });
  await expect(scene).toHaveAttribute('data-phase', 'intro');
  await scene.locator('[data-attend]').click();
  await expect(scene).toHaveAttribute('data-phase', 'talk', { timeout: 10_000 });
  await expect(scene.locator('.tech-bubble')).toBeVisible();
  await page.waitForTimeout(400);
  await shot(page, 'tech-event-talk');
  await expect(scene).toHaveAttribute('data-phase', 'network', { timeout: 10_000 });
  await shot(page, 'tech-event-network');
  await scene.getByRole('button', { name: 'Skip ›' }).click();
  await expect(scene.locator('[data-result]')).toBeVisible();
  await shot(page, 'tech-event-result');
  const s1 = await state(page);
  expect((s1.me.contacts ?? []).length).toBeGreaterThan(contacts0);
  expect(s1.market.techEvents!.find((x) => x.id === e.id)!.attended).toBe(true);
  await scene.getByRole('button', { name: 'Leave the event' }).click();
  await expect(scene).toBeHidden();
});

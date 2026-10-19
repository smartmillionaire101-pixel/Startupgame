import { devices, type Page } from '@playwright/test';
import { expect, letters, playAsGuest, test, withoutNetlifyDrawer } from './fixtures';

/**
 * Holiday with friends (player feedback: "People can invite their friends on
 * holidays to these places on travel trips"). Two players: A books London
 * with a hotel and invites B, paying B's trip; B accepts; both land in
 * London at the same hotel, see "Holiday in London with …" on the map, do
 * one thing together and see the shared bonus.
 *
 * HOLIDAY_SHOTS=<dir> saves 390×844 screenshots of the picker, the
 * invitation, the accepted trip card and the map banner.
 */

const SHOTS = process.env.HOLIDAY_SHOTS;
const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
};

async function player(page: Page, name: string) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await playAsGuest(page);
  const handle = `ho_${letters(8)}`;
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
              name: `Holiday ${h.slice(3)}`,
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
  await home(page);
}

const home = async (page: Page) => {
  await page.reload();
  await expect(page.getByRole('button', { name: /^Phone/ })).toBeVisible({ timeout: 30_000 });
};

interface Holiday {
  id: string;
  myStatus: string;
  together: boolean;
  hotel: { tier: string; name: string } | null;
  guests: { id: string; status: string }[];
  rooms: Record<string, number>;
  done: { members: { id: string }[] }[];
}
interface State {
  me: {
    id: string;
    flightTicket: { to: string; hotel?: { tier: string }; sponsor?: { playerId: string } } | null;
    location: { market: string; hotel?: { name: string } } | null;
  };
  accounts: { local: { balance: number } };
  holidays?: Holiday[];
}
const state = (page: Page) =>
  page.evaluate(async () => {
    const s = await (await fetch('/api/state', { headers: { 'x-runway': '1' } })).json();
    return (s.view ?? s) as State;
  });

const command = (page: Page, cmd: unknown) =>
  page.evaluate(async (command) => {
    const r = await fetch('/api/commands', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-runway': '1' },
      body: JSON.stringify({ command }),
    });
    return { status: r.status, body: await r.json() };
  }, cmd);

async function openTravel(page: Page) {
  const phone = page.getByRole('dialog', { name: 'Phone' });
  if (!(await phone.isVisible())) await page.getByRole('button', { name: /^Phone/ }).click();
  await expect(phone).toBeVisible();
  if (!(await phone.locator('[data-phone-app="home"]').isVisible()))
    await phone.getByRole('button', { name: 'Back' }).first().click();
  await phone.locator('[data-app="travel"]').click();
  await expect(phone.locator('[data-phone-app="travel"]')).toBeVisible();
  return phone;
}

test('holiday with friends: invite, accept, the same hotel, something together', async ({
  page: a,
  browser,
}) => {
  test.slow();
  const { defaultBrowserType: _, ...pixel } = devices['Pixel 7'];
  const b = await (
    await browser.newContext({
      ...pixel,
      viewport: { width: 390, height: 844 },
      baseURL: test.info().project.use.baseURL,
    })
  ).newPage();
  await withoutNetlifyDrawer(b);
  const tag = letters(4);
  await player(a, `Ada${tag} Host`);
  await player(b, `Bola${tag} Guest`);
  const aId = (await state(a)).me.id;
  const bId = (await state(b)).me.id;
  await home(a);

  // ---- A books London with a hotel from the Travel app.
  let phone = await openTravel(a);
  const london = phone.locator('[data-flight="london"]');
  await london.getByRole('button', { name: 'Book a flight to London' }).click();
  const picker = london.locator('[data-hotel-picker]');
  await picker.locator('[data-hotel="budget"]').click();
  await picker.locator('[data-hotel-book]').click();
  await a
    .getByRole('dialog', { name: 'How do you want to get there?' })
    .locator('[data-mode="skip"]')
    .click({ timeout: 3000 })
    .catch(() => undefined);
  await expect.poll(async () => (await state(a)).me.flightTicket?.to).toBe('london');

  // ---- …and invites B, paying for B's flight and hotel.
  await home(a);
  phone = await openTravel(a);
  await phone
    .locator('[data-holiday-prompt]')
    .getByRole('button', { name: 'Invite friends' })
    .click();
  const invite = phone.locator('[data-holiday-picker]');
  await invite.locator(`[data-holiday-friend="${bId}"]`).click();
  await invite.locator('[data-holiday-hostpays] input').check();
  await shot(a, 'holiday-picker');
  await invite.getByRole('button', { name: 'Send the invitation' }).click();
  const trip = phone.locator('[data-holiday]');
  await expect(trip.locator(`[data-holiday-guest="${bId}"]`)).toHaveAttribute(
    'data-status',
    'pending',
  );

  // ---- B (maybe offline until now) sees the invitation: city, hotel, who pays.
  await home(b);
  const bBalance = (await state(b)).accounts.local.balance;
  let bPhone = await openTravel(b);
  const card = bPhone.locator('[data-holiday-invite]');
  await expect(card).toContainText('invited you to London');
  await expect(card).toContainText('Camden Guesthouse');
  await expect(card.locator('[data-holiday-cost]')).toContainText('pays your flight and hotel');
  await shot(b, 'holiday-invitation');
  await card.getByRole('button', { name: 'Accept', exact: true }).click();
  await expect.poll(async () => (await state(b)).me.flightTicket?.to).toBe('london');
  const sb = await state(b);
  expect(sb.me.flightTicket?.hotel?.tier).toBe('budget');
  expect(sb.me.flightTicket?.sponsor?.playerId).toBe(aId);
  // A paid: B's money is where it was.
  expect(sb.accounts.local.balance).toBe(bBalance);

  // ---- A's trip card shows B is coming.
  await home(a);
  phone = await openTravel(a);
  await expect(phone.locator(`[data-holiday-guest="${bId}"]`)).toHaveAttribute(
    'data-status',
    'accepted',
  );
  await shot(a, 'holiday-trip-accepted');

  // ---- Both fly; in London, at the same hotel, together.
  expect((await command(a, { type: 'travel.fly', to: 'london' })).status).toBe(200);
  expect((await command(b, { type: 'travel.fly', to: 'london' })).status).toBe(200);
  const [la, lb] = [await state(a), await state(b)];
  expect(la.me.location?.hotel?.name).toBe(lb.me.location?.hotel?.name);
  const h = la.holidays![0]!;
  expect(h.together).toBe(true);
  expect(Math.abs(h.rooms[bId]! - h.rooms[aId]!)).toBe(1);

  await home(a);
  const banner = a.locator('[data-holiday-with]');
  await expect(banner).toBeVisible({ timeout: 30_000 });
  await expect(banner).toContainText(`Holiday in London with Bola${tag}`);
  await a.waitForTimeout(800);
  await shot(a, 'holiday-map-banner');

  // ---- A plans something to do together; B joins: the shared bonus.
  phone = await openTravel(a);
  const thing = phone.locator('[data-holiday-thing]').first();
  const venueId = await thing.getAttribute('data-holiday-thing');
  await thing.getByRole('button', { name: 'Go together' }).click();
  await expect.poll(async () => ((await state(a)).holidays ?? [])[0]?.together).toBe(true);

  await home(b);
  bPhone = await openTravel(b);
  const join = bPhone.locator(`[data-holiday-thing="${venueId}"]`);
  await expect(join).toContainText('is going');
  await join.getByRole('button', { name: 'Join' }).click();
  await expect
    .poll(async () => ((await state(b)).holidays ?? [])[0]?.done.length ?? 0, { timeout: 10_000 })
    .toBe(1);
  const done = (await state(a)).holidays![0]!.done[0]!;
  expect(done.members.map((m) => m.id).sort()).toEqual([aId, bId].sort());

  await home(b);
  bPhone = await openTravel(b);
  await expect(bPhone.locator('[data-holiday-bonus]')).toBeVisible();
  await shot(b, 'holiday-together-bonus');
});

/**
 * Fly together, arrive together, with an AI friend: A and B both live in
 * Lagos, so B is booked on A's flight (same flight number, the next seat);
 * an AI friend from A's contacts answers at once in chat and comes along, on
 * the plane next to A, through arrivals, in the hotel car and out together.
 */
test('fly together with a friend and an AI friend: cabin, arrivals, the ride, an outing', async ({
  page: a,
  browser,
}) => {
  test.slow();
  await a.addInitScript(() => localStorage.setItem('runway.arrivals', '1'));
  const { defaultBrowserType: _, ...pixel } = devices['Pixel 7'];
  const b = await (
    await browser.newContext({
      ...pixel,
      viewport: { width: 390, height: 844 },
      baseURL: test.info().project.use.baseURL,
    })
  ).newPage();
  await withoutNetlifyDrawer(b);
  const tag = letters(4);
  await player(a, `Ada${tag} Host`);
  await player(b, `Bola${tag} Guest`);
  const bId = (await state(b)).me.id;

  // A meets some of the city's regulars and saves them as contacts (AI friends).
  const regulars = [11, 12, 13, 14, 15].map((n) => `npc:lagos:${n}`);
  // Saved twice: you've met, so a little warmer (likelier to be free).
  for (const id of [...regulars, ...regulars])
    expect((await command(a, { type: 'contact.save', personId: id, name: '' })).status).toBe(200);

  // ---- A books London (with the flight off the board) in the Travel app.
  await home(a);
  let phone = await openTravel(a);
  const london = phone.locator('[data-flight="london"]');
  await london.getByRole('button', { name: 'Book a flight to London' }).click();
  await london.locator('[data-hotel-picker] [data-hotel="budget"]').click();
  await london.locator('[data-hotel-picker] [data-hotel-book]').click();
  await a
    .getByRole('dialog', { name: 'How do you want to get there?' })
    .locator('[data-mode="skip"]')
    .click({ timeout: 3000 })
    .catch(() => undefined);
  await expect.poll(async () => (await state(a)).me.flightTicket?.to).toBe('london');
  const aTicket = (await state(a)).me.flightTicket as unknown as {
    flight?: { number?: string; airline?: string; time?: string };
  };
  expect(aTicket.flight?.number).toBeTruthy();

  // ---- B, also from Lagos, accepts: the same flight, the next seat.
  const inv = await command(a, { type: 'holiday.invite', inviteeIds: [bId], hostPays: false });
  expect(inv.status).toBe(200);
  const holidayId = inv.body.result.holidayId as string;
  const acc = await command(b, { type: 'holiday.accept', holidayId });
  expect(acc.status).toBe(200);
  expect(acc.body.result.sameFlight).toBe(true);
  const bTicket = (await state(b)).me.flightTicket as unknown as {
    flight?: { number?: string; airline?: string; time?: string };
    party?: { holidayId: string };
  };
  expect(bTicket.flight).toEqual(aTicket.flight);
  expect(bTicket.party?.holidayId).toBe(holidayId);

  // ---- A invites an AI friend from the picker, paying: they answer at once, in chat.
  await home(a);
  phone = await openTravel(a);
  const card = phone.locator(`[data-holiday="${holidayId}"]`);
  // The real game date, not "Month 0".
  await expect(card.locator('[data-holiday-date]')).toContainText(
    /This month · Year \d+, Month \d+/,
  );
  await shot(a, 'holiday-card-date');
  await card.getByRole('button', { name: 'Invite more friends' }).click();
  const picker = card.locator('[data-holiday-picker]');
  await expect(picker.locator('[data-holiday-ai]')).toHaveCount(regulars.length);
  await picker.locator(`[data-holiday-friend="${regulars[0]}"]`).click();
  await picker.locator('[data-holiday-hostpays] input').check();
  await picker.getByRole('button', { name: 'Send the invitation' }).click();
  await expect(
    card.locator(`[data-holiday-guest="${regulars[0]}"] [data-holiday-reply]`),
  ).toBeVisible();
  // Not everyone can make it: ask the next one until someone says yes.
  let friend = '';
  for (const id of regulars) {
    const h = ((await state(a)).holidays ?? []).find((x) => x.id === holidayId)!;
    const g = h.guests.find((x) => x.id === id);
    if (!g) {
      const r = await command(a, { type: 'holiday.invite', inviteeIds: [id], hostPays: true });
      expect(r.status).toBe(200);
      if (r.body.result.replies[0].answer === 'yes') friend = id;
    } else if (g.status === 'accepted') friend = id;
    if (friend) break;
  }
  expect(friend).not.toBe('');
  await home(a);
  phone = await openTravel(a);
  await expect(
    phone.locator(`[data-holiday-guest="${friend}"] [data-holiday-reply="yes"]`),
  ).toBeVisible();
  await phone.locator(`[data-holiday-guest="${friend}"]`).scrollIntoViewIfNeeded();
  await shot(a, 'holiday-ai-reply');
  // …and the same words in A's chat with them.
  const thread = await a.evaluate(async (id) => {
    const r = await fetch(`/api/ai-chat/${encodeURIComponent(id)}`, {
      headers: { 'x-runway': '1' },
    });
    return (await r.json()) as { messages: { mine: boolean; text: string }[] };
  }, friend);
  expect(thread.messages.at(-1)?.mine).toBe(false);
  expect(thread.messages.some((m) => m.mine && m.text.includes('Fancy a holiday in London'))).toBe(
    true,
  );

  // ---- The airport: the boarding pass says who you're flying with.
  await expect(phone.locator('[data-flying-with]')).toContainText('Flying with');
  await phone.getByRole('button', { name: 'Go to the airport' }).click();
  await a
    .getByRole('dialog', { name: 'How do you want to get there?' })
    .locator('[data-mode="skip"]')
    .click({ timeout: 3000 })
    .catch(() => undefined);
  const trip = a.getByRole('region', { name: 'Your trip' });
  await expect(trip).toBeVisible({ timeout: 20_000 });
  await trip.getByRole('button', { name: 'Check in for London' }).click();
  const pass = trip.locator('[data-boarding-pass]');
  await expect(pass.locator('[data-flying-with]')).toContainText(`Flying with Bola${tag}`);
  await shot(a, 'holiday-boarding-pass');
  await trip.getByRole('button', { name: 'Go through security' }).click();
  await trip.getByRole('button', { name: 'Go to the gate' }).click();

  // ---- The flight: the cabin, your friends in the seats next to you.
  // (2D: the moving cabin, a few seconds; 3D: the reduced-motion still, seated beside them.)
  if (!process.env.HOLIDAY_3D) await a.emulateMedia({ reducedMotion: 'no-preference' });
  // HOLIDAY_3D=1: the flight in 3D (WebGL, slow in software), for the 3D cabin's screenshot.
  if (process.env.HOLIDAY_3D)
    await a.evaluate((key) => {
      localStorage.setItem(key, '3d');
      localStorage.setItem('runway.flightPace', '4');
      window.dispatchEvent(new StorageEvent('storage', { key }));
    }, 'runway.mapQuality');
  await trip.getByRole('button', { name: 'Board for London' }).click();
  const flight = a.getByRole('dialog', { name: 'Flight to London' });
  await expect(flight).toBeVisible({ timeout: 30_000 });
  const cabin = flight.locator('[data-cabin]');
  await expect(cabin).toBeVisible({ timeout: process.env.HOLIDAY_3D ? 120_000 : 30_000 });
  await expect(cabin.locator('[data-companion]')).toHaveCount(2);
  await expect(cabin).toContainText(`Bola${tag} · `);
  await a.waitForTimeout(process.env.HOLIDAY_3D ? 2500 : 1500);
  await shot(a, process.env.HOLIDAY_3D ? 'holiday-cabin-3d' : 'holiday-cabin');
  await a.emulateMedia({ reducedMotion: 'reduce' });
  await flight
    .getByRole('button', { name: 'Skip' })
    .click({ force: true, timeout: 10_000 })
    .catch(() => undefined);
  await expect(flight).toBeHidden({ timeout: 60_000 });

  // ---- Arrivals: they come through with you; the driver's board has every name.
  const arrivals = a.locator('.airport-scene');
  await expect(arrivals.locator('[data-arrival]')).toBeVisible({ timeout: 20_000 });
  await expect(arrivals.locator(`[data-arrival-friend="${bId}"]`)).toBeAttached();
  await expect(arrivals.locator(`[data-arrival-friend="${friend}"]`)).toBeAttached();
  await expect(arrivals.locator('[data-arrival-party]')).toContainText(
    'came off the plane with you',
  );
  await shot(a, 'holiday-arrivals-passport');
  await arrivals.getByRole('button', { name: 'Skip' }).click();
  const board = arrivals.locator('.arr-your-sign');
  await expect(board).toContainText(`Ada${tag}, Bola${tag}`);
  await expect(board).toContainText('Camden Guesthouse');
  await shot(a, 'holiday-arrivals-board');
  await arrivals.locator('[data-arrival-go="home"]').click();
  const ride = a.locator('[data-transfer]');
  await expect(ride).toBeVisible();
  await expect(ride.locator('[data-transfer-with]')).toContainText(`with Bola${tag}`);
  await shot(a, 'holiday-ride');

  // ---- Out together: at a venue, the AI friend (and Bola, planned) next to A.
  await expect(arrivals).toBeHidden({ timeout: 20_000 });
  await home(a);
  phone = await openTravel(a);
  const thing = phone.locator('[data-holiday-thing]').first();
  await thing.getByRole('button', { name: 'Go together' }).click();
  await a
    .getByRole('dialog', { name: 'How do you want to get there?' })
    .locator('[data-mode="skip"]')
    .click({ timeout: 3000 })
    .catch(() => undefined);
  const venue = a.locator('.place-scene');
  await expect(venue.locator(`[data-venue-friend="${friend}"]`)).toBeAttached({ timeout: 30_000 });
  await expect(venue.locator('[data-venue-with]')).toContainText('On holiday with');
  await a.waitForTimeout(800);
  await shot(a, 'holiday-venue-together');
});

/**
 * Knocking next door, for real: A and B on holiday in London at the same
 * hotel, each in their room. A knocks on B's door; B is told and sees
 * "… is knocking" in their room, and opens the door; B walks over: both
 * see B in A's room. A says goodbye: the visit ends for both.
 */
test('hotel: knock on a friend’s door, they open up and come over, goodbye', async ({
  page: a,
  browser,
}) => {
  test.slow();
  const { defaultBrowserType: _, ...pixel } = devices['Pixel 7'];
  const b = await (
    await browser.newContext({
      ...pixel,
      viewport: { width: 390, height: 844 },
      baseURL: test.info().project.use.baseURL,
    })
  ).newPage();
  await withoutNetlifyDrawer(b);
  await b.emulateMedia({ reducedMotion: 'reduce' });
  const tag = letters(4);
  await player(a, `Ada${tag} Host`);
  await player(b, `Bola${tag} Guest`);
  const aId = (await state(a)).me.id;
  const bId = (await state(b)).me.id;
  expect((await command(a, { type: 'travel.book', to: 'london', hotel: 'budget' })).status).toBe(
    200,
  );
  const inv = await command(a, { type: 'holiday.invite', inviteeIds: [bId], hostPays: true });
  expect(inv.status).toBe(200);
  const holidayId = inv.body.result.holidayId as string;
  expect((await command(b, { type: 'holiday.accept', holidayId })).status).toBe(200);
  expect((await command(a, { type: 'travel.fly', to: 'london' })).status).toBe(200);
  expect((await command(b, { type: 'travel.fly', to: 'london' })).status).toBe(200);

  // Both open the app in their hotel room.
  const roomOf = async (page: Page) => {
    await page.addInitScript(() => {
      localStorage.removeItem('runway.lastSeen');
      localStorage.setItem('runway.startAtHome', '1');
      localStorage.setItem('runway.mapQuality', '3d');
    });
    await page.reload();
    const room = page.locator('.home-scene[data-hotel-room]');
    await expect(room).toBeVisible({ timeout: 60_000 });
    return room;
  };
  // As on a serverless host: no live stream, B polls (and polls fast in the hotel).
  await b.route('**/api/events', (r) => r.fulfill({ status: 204 }));
  const ra = await roomOf(a);
  const rb = await roomOf(b);

  // ---- A knocks on B's door: knocking, waiting for B.
  const knock = ra.locator(`[data-hotel-knock="${bId}"]`);
  await expect(knock).toContainText(`Knock on Bola${tag}’s door`);
  await knock.click();
  await expect(knock).toHaveAttribute('data-knocking', '');
  await expect(knock).toContainText('Knocking on');

  // ---- B is told, and sees the knock in their room.
  const prompt = rb.locator(`[data-hotel-knocked="${aId}"]`);
  await expect(prompt).toBeVisible({ timeout: 15_000 });
  await expect(prompt).toContainText(`Ada${tag} is knocking`);
  const inbox = (await (
    await b.request.get('/api/state', { headers: { 'x-runway': '1' } })
  ).json()) as { view?: { inbox?: { text: string }[] }; inbox?: { text: string }[] };
  const items = inbox.view?.inbox ?? inbox.inbox ?? [];
  expect(items.some((i) => i.text.includes('is knocking on your door'))).toBe(true);
  await b.waitForTimeout(600);
  await shot(b, 'knock-prompt');

  // ---- B opens the door: B is in A's room, on both screens.
  await prompt.getByRole('button', { name: 'Open the door' }).click();
  await expect(prompt).toBeHidden();
  await expect(rb.locator('[data-hotel-visit="guest"]')).toContainText(`In Ada${tag}’s room`);
  await expect(rb.locator(`[data-guest="${aId}"]`)).toHaveCount(1);
  await expect(ra.locator('[data-hotel-visit="host"]')).toContainText(`Bola${tag} is over`, {
    timeout: 15_000,
  });
  await expect(ra.locator(`[data-guest="${bId}"]`)).toHaveCount(1, { timeout: 15_000 });
  const visit = ((await state(a)).holidays ?? [])[0] as unknown as {
    visit: { host: { id: string }; guest: { id: string }; me: string } | null;
  };
  expect(visit.visit).toMatchObject({ host: { id: aId }, guest: { id: bId }, me: 'host' });
  await a.waitForTimeout(1500);
  await shot(a, 'knock-visit-host');
  await b.waitForTimeout(600);
  await shot(b, 'knock-visit-guest');

  // ---- A says goodbye: B goes back to their room, on both screens.
  await ra.locator('.home-hotel-head [data-action="hotel-goodbye"]').click();
  await expect(ra.locator(`[data-guest="${bId}"]`)).toHaveCount(0);
  await expect(ra.locator('[data-hotel-visit]')).toHaveCount(0);
  await expect(rb.locator(`[data-guest="${aId}"]`)).toHaveCount(0, { timeout: 15_000 });
  await expect(rb.locator('[data-hotel-visit]')).toHaveCount(0);
  expect((((await state(b)).holidays ?? [])[0] as unknown as { visit: unknown }).visit).toBeNull();
});

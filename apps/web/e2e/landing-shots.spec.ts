import type { Locator } from '@playwright/test';
import {
  expect,
  letters,
  playAsGuest,
  setupFounder,
  setupPlayer,
  tab,
  tapPlace,
  test,
  type Page,
} from './fixtures';

/**
 * The landing page's pictures (public/landing), taken from the game itself
 * (LANDING_ASSETS=<dir> only): a phone screen is a 420×909 JPEG (390×844 at
 * a 420/390 scale), a career card's picture a 420×315 slice of one.
 *
 * Spread over San Francisco, London, Cairo, Dubai and Johannesburg (product
 * owner: no Lagos on the landing page): the 3D city at golden hour (SF), a
 * club at midnight and its clip (London), the founder's company with its
 * first revenue (SF), founders pitching an investor at a tech event (Cairo),
 * a banker's offers from the shareholders (Johannesburg) and the Central
 * Bank's appointment door (Dubai), the Stock Exchange floor (Johannesburg),
 * bowling (Johannesburg), a skydive (Dubai), the first class lounge and
 * suite (Dubai to London), the mall (Cairo), the lifestyle picker (Dubai)
 * and the mansion turning round (Dubai).
 *
 * Every 3D view at full quality (runway.hq) with the CC0 people and cars,
 * at a chosen moment of the day (the browser's clock: the sky follows the
 * real sun). A phone screen is saved at 420×909; club-poster, club-frames
 * and mansion/ are saved at 420/390 of their size and scaled down after
 * (see the club and mansion tests).
 */
const DIR = process.env.LANDING_ASSETS;
test.use({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 420 / 390,
  launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
});
/** Software WebGL draws the real city slowly: every 3D step gets this long. */
const SLOW = 60_000;

/** A whole phone screen, without the toasts (or the slow-map notice) over it. */
async function phoneShot(page: Page, name: string) {
  await expect(page.locator('.toast')).toHaveCount(0, { timeout: 15_000 });
  await page
    .getByRole('button', { name: 'Keep 3D' })
    .click({ timeout: 1000 })
    .catch(() => undefined);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${DIR}/${name}.jpg`, type: 'jpeg', quality: 78 });
}

/** A career card's picture: a 4:3 slice of the screen from `top` down. */
async function cardShot(page: Page, name: string, top: number) {
  await expect(page.locator('.toast')).toHaveCount(0, { timeout: 15_000 });
  await page.waitForTimeout(400);
  await page.screenshot({
    path: `${DIR}/${name}.jpg`,
    type: 'jpeg',
    quality: 80,
    clip: { x: 0, y: top, width: 390, height: 292.5 },
  });
}

const command = (page: Page, cmd: unknown) =>
  page.evaluate(async (c) => {
    const r = await fetch('/api/commands', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-runway': '1' },
      body: JSON.stringify({ command: c }),
    });
    return { status: r.status, body: await r.json() };
  }, cmd);

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the shots read the view loosely
const view = (page: Page): Promise<any> =>
  page.request
    .get('/api/state')
    .then((r) => r.json())
    .then((s) => s.view);

/** A month on (the dev tools' settle), in `market`. */
const settle = (page: Page, market: string) =>
  page.request.post('/api/dev/settle', { headers: { 'x-runway': '1' }, data: { market } });

async function founder(page: Page, market: RegExp) {
  await playAsGuest(page);
  await setupFounder(page, {
    name: 'Zara Okafor',
    handle: `ld_${letters(8)}`,
    company: `Stallwise ${letters(4)}`,
    idea: 'Payments for market traders',
    market,
  });
  await expect(page.getByRole('button', { name: /^Phone/ })).toBeVisible({ timeout: 30_000 });
}

async function investor(page: Page, market: string) {
  await playAsGuest(page);
  await setupPlayer(page, {
    type: 'player.create',
    name: `Nour${letters(3)} Angel`,
    handle: `ld_${letters(8)}`,
    role: 'investor',
    backgroundId: 'i-banker',
    market,
    gender: 'female',
    investor: { sectors: ['fintech', 'saas'], stages: ['pre-seed', 'seed'], checkSize: 2000000 },
  });
  expect((await command(page, { type: 'investor.tutorial', action: 'skip' })).status).toBe(200);
  await page.reload();
  await expect(page.getByRole('button', { name: /^Phone/ })).toBeVisible({ timeout: 30_000 });
}

async function banker(page: Page, market: string) {
  await playAsGuest(page);
  await setupPlayer(page, {
    type: 'player.create',
    name: 'Thandi Banker',
    handle: `ld_${letters(8)}`,
    role: 'banker',
    backgroundId: 'b-commercial',
    market,
    gender: 'female',
    bank: { name: `Baobab Trust ${letters(4)}`, bankType: 'microfinance' },
  });
  await tab(page, 'Bank').click();
  const neg = page.locator('[data-banker="negotiate"]');
  await expect(neg).toBeVisible({ timeout: 15_000 });
  await neg.locator('[data-take="g2"]').click();
  await expect(neg.locator('[data-take="g2"]')).toBeChecked();
  await neg.locator('[data-take="g3"]').click();
  await expect(neg.locator('[data-take="g3"]')).toBeChecked();
  return neg;
}

async function goingOut(page: Page) {
  await page.getByRole('button', { name: /^Phone/ }).click();
  const phone = page.getByRole('dialog', { name: 'Phone' });
  await phone.locator('[data-app="goingout"]').click();
  const games = phone.locator('[data-going="games"]');
  await expect(games).toBeVisible({ timeout: 15_000 });
  return { phone, games };
}

/** Skip the ride there, if one is offered. */
async function arrive(page: Page, mode = 'cycle') {
  await page
    .getByRole('dialog', { name: 'How do you want to get there?' })
    .locator(`[data-mode="${mode}"]`)
    .click({ timeout: 3000 })
    .catch(() => undefined);
}

test.beforeEach(async ({ page }) => {
  test.skip(!DIR);
  // Full quality on software WebGL (antialiasing, shadows, the CC0 people as models).
  // The map stays in 3D (chosen, so a slow frame rate doesn't step it down to Lite).
  await page.addInitScript(() => {
    localStorage.setItem('runway.hq', '1');
    localStorage.setItem('runway.mapQuality', '3d');
  });
});

/**
 * The browser's date at `iso` (then running on): the 3D sky follows the real
 * sun at that moment, the crowds and the phone's clock its hour. Only Date is
 * moved (timers and animation frames run as they are: the skydive's loop stops
 * under a faked clock).
 */
const at = (page: Page, iso: string) =>
  page.addInitScript(
    (off) => {
      const Real = Date;
      class Shifted extends Real {
        constructor(...a: []) {
          if (a.length) super(...a);
          else super(Real.now() + off);
        }
        static override now() {
          return Real.now() + off;
        }
      }
      globalThis.Date = Shifted as DateConstructor;
    },
    new Date(iso).getTime() - Date.now(),
  );

/** "Keep 3D", if the slow-map notice is up (software WebGL is slow). */
const keep3d = (page: Page) =>
  page
    .getByRole('button', { name: 'Keep 3D' })
    .click({ timeout: 2000 })
    .catch(() => undefined);

/**
 * Go to a place from the map's Places list (on the 3D map a place off screen
 * has no badge to tap), skipping the ride there.
 */
async function viaPlaces(page: Page, name: RegExp) {
  await page
    .getByRole('group', { name: 'Map actions' })
    .getByRole('button', { name: 'Places' })
    .click();
  await page.getByRole('dialog', { name: 'Places' }).getByRole('button', { name }).first().click();
  await arrive(page);
}

type City3D = {
  rig: { x: number; y: number; dist: number; yaw: number; pitch: number };
  zoomAt(f: number): void;
  touch(ms?: number): void;
};

test('the city at golden hour (San Francisco)', async ({ page }) => {
  test.setTimeout(300_000);
  // Half an hour before sunset in San Francisco (16:22 local, 23 November).
  await at(page, '2026-11-24T00:22:00Z');
  await founder(page, /San Francisco/);
  await tab(page, 'City').click();
  const map = page.getByRole('application', { name: /Map of/ });
  await expect(map).toHaveAttribute('data-map3d', 'ready', { timeout: 3 * SLOW });
  // Software WebGL is slow: the notice suggesting Lite comes up once, after a while.
  await page
    .getByRole('button', { name: 'Keep 3D' })
    .click({ timeout: 45_000 })
    .catch(() => undefined);
  // Low over downtown, looking along the towers into the evening sky.
  await page.evaluate(
    ([d, p, y]) => {
      const s = (window as unknown as { __city3d: City3D }).__city3d;
      s.rig.pitch = p;
      s.rig.yaw = y;
      s.zoomAt(s.rig.dist / d);
      s.touch(2000);
    },
    [500, 0.3, 0.6] as const,
  );
  await page.waitForTimeout(12_000);
  await keep3d(page);
  await phoneShot(page, 'city');
});

test('founder: the company, a few months in (San Francisco)', async ({ page }) => {
  test.setTimeout(120_000);
  await founder(page, /San Francisco/);
  // Money in from savings, then three months: the first customers are paying.
  const v = await view(page);
  const mine = v.companies.find((c: { name: string }) => c.name.startsWith('Stallwise'));
  expect(
    (await command(page, { type: 'company.inject', companyId: mine.id, amount: 6_000_000 })).status,
  ).toBe(200);
  for (let i = 0; i < 3; i++) expect((await settle(page, 'san-francisco')).status()).toBe(200);
  await page.reload();
  await tab(page, 'Company').click();
  await expect(page.getByText('Monthly revenue')).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(1500);
  // The company and its stage: first customers in, revenue on the way.
  await cardShot(page, 'role-founder', 70);
});

test('investor: founders pitch at a tech event (Cairo)', async ({ page }) => {
  test.setTimeout(120_000);
  await investor(page, 'cairo');
  const phone = page.getByRole('dialog', { name: 'Phone' });
  await page.getByRole('button', { name: /^Phone/ }).click();
  await phone.locator('[data-app="events"]').click();
  const card = phone.locator('[data-tech-event]').first();
  await card.getByRole('button', { name: 'Attend' }).click();
  const pitch = card.locator('[data-pitch]').first();
  await expect(pitch).toBeVisible({ timeout: 10_000 });
  await pitch.evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await cardShot(page, 'role-investor', 0);
});

test('banker: the shareholders’ offers (Johannesburg)', async ({ page }) => {
  test.setTimeout(120_000);
  const neg = await banker(page, 'johannesburg');
  // The three offers side by side, under their heading.
  await neg.locator('.offer-table').evaluate((el) => {
    el.scrollIntoView({ block: 'start' });
    window.scrollBy(0, -110);
  });
  await cardShot(page, 'role-banker', 56);
});

test('the Central Bank, by appointment (Dubai)', async ({ page }) => {
  test.setTimeout(300_000);
  // Late afternoon in Dubai: the city behind the door in warm light.
  await at(page, '2026-11-24T13:00:00Z');
  const neg = await banker(page, 'dubai');
  await neg.locator('[data-sign]').click();
  await expect(page.locator('[data-banker="licence"]')).toBeVisible({ timeout: 15_000 });
  await tab(page, 'City').click();
  await expect(page.getByRole('application', { name: /Map of/ })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('application', { name: /Map of/ })).toHaveAttribute(
    'data-map3d',
    'ready',
    { timeout: 3 * SLOW },
  );
  await keep3d(page);
  await viaPlaces(page, /Central Bank/);
  const door = page.locator('.civic-door');
  await expect(door).toHaveAttribute('data-civic-closed', 'appointment', { timeout: 15_000 });
  await door.locator('[data-book-appointment]').click();
  await expect(door).toHaveAttribute('data-civic-closed', 'early', { timeout: 15_000 });
  await page.waitForTimeout(6000);
  await keep3d(page);
  await phoneShot(page, 'central-bank');
});

test('the Stock Exchange floor, for investors (Johannesburg)', async ({ page }) => {
  test.setTimeout(300_000);
  await at(page, '2026-11-24T09:00:00Z');
  await investor(page, 'johannesburg');
  await tab(page, 'City').click();
  await expect(page.getByRole('application', { name: /Map of/ })).toBeVisible({ timeout: 30_000 });
  await keep3d(page);
  await tapPlace(page, '[data-place="civic:johannesburg:stock-exchange"]');
  await expect(page.locator('.place-scene')).toBeVisible({ timeout: SLOW });
  await expect(page.locator('.place-scene .place-room')).toHaveClass(/is-3d/, { timeout: SLOW });
  await page.waitForTimeout(12_000);
  await phoneShot(page, 'exchange');
});

test('the lifestyle picker (Dubai)', async ({ page }) => {
  test.setTimeout(120_000);
  await founder(page, /Dubai/);
  await page.getByRole('button', { name: /^Phone/ }).click();
  const phone = page.getByRole('dialog', { name: 'Phone' });
  await phone.locator('[data-app="settings"]').click();
  await phone.locator('[data-open-lifestyle]').click();
  await expect(page.getByRole('dialog', { name: 'Lifestyle' })).toBeVisible();
  await phoneShot(page, 'lifestyle');
});

test('the mall’s concourse, in 3D (Cairo)', async ({ page }) => {
  test.setTimeout(420_000);
  await at(page, '2026-11-24T09:00:00Z');
  await founder(page, /Cairo/);
  await tab(page, 'City').click();
  await expect(page.getByRole('application', { name: /Map of/ })).toHaveAttribute(
    'data-map3d',
    'ready',
    { timeout: 3 * SLOW },
  );
  await keep3d(page);
  await viaPlaces(page, /Mall/);
  const scene = page.locator('.mall-scene');
  await expect(scene).toHaveAttribute('data-mall-mode', '3d', { timeout: SLOW });
  await expect
    .poll(
      () =>
        page.evaluate(() => (window as unknown as { __stage3d?: Stage3D }).__stage3d?.frames ?? 0),
      { timeout: 3 * SLOW },
    )
    .toBeGreaterThan(2);
  await page.waitForTimeout(15_000);
  await phoneShot(page, 'mall');
});

test('bowling at the alley: five down, the spare to come (Johannesburg)', async ({ page }) => {
  test.setTimeout(420_000);
  await at(page, '2026-11-24T18:00:00Z');
  await founder(page, /Johannesburg/);
  const { games } = await goingOut(page);
  await games.locator('[data-go="bowling"]').click();
  await arrive(page);
  const scene = page.locator('.place-scene');
  await expect(scene).toBeVisible({ timeout: 30_000 });
  await scene.locator('[data-action="fun:bowling"]').click();
  const dialog = page.getByRole('dialog', { name: 'Play together' });
  await dialog
    .getByLabel(/Stake per player/)
    .last()
    .fill('5');
  await dialog.getByRole('button', { name: 'Play vs AI' }).click();
  const lane = dialog.locator('.bowling-lane canvas');
  await expect(lane).toHaveAttribute('data-mine', '1', { timeout: SLOW });
  // A swipe up from the right of the lane, bowing out to hook back.
  await lane.scrollIntoViewIfNeeded();
  const box = (await lane.boundingBox())!;
  const from = { x: box.x + box.width * 0.66, y: box.y + box.height * 0.92 };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) {
    const q = i / 8;
    await page.mouse.move(
      from.x - box.width * 0.04 * q + Math.sin(Math.PI * q) * 18,
      from.y - box.height * 0.5 * q,
    );
    await page.waitForTimeout(12);
  }
  await page.mouse.up();
  await expect(lane).toHaveAttribute('data-rolling', '1', { timeout: 15_000 });
  // (Five down: the bowler steps up again, the ball in hand, for the spare.)
  await page.waitForTimeout(4200);
  await phoneShot(page, 'bowling');
});

test('a tandem skydive, under the canopy (Dubai)', async ({ page }) => {
  test.setTimeout(420_000);
  // Over the Palm at golden hour.
  await at(page, '2026-11-24T13:00:00Z');
  await founder(page, /Dubai/);
  // A skydive needs standard of living 3.
  expect((await command(page, { type: 'player.lifestyle', tier: 3 })).status).toBe(200);
  await page.reload();
  const { games } = await goingOut(page);
  await games.locator('[data-go="skydive"]').click();
  const book = page.getByRole('dialog', { name: 'Book a skydive' });
  await book.locator('[data-air-item="skydive-tandem"] [data-action="air-book"]').click();
  const air = page.locator('[data-air="skydive"]');
  await expect(air).toHaveAttribute('data-air-phase', 'door', { timeout: 4 * SLOW });
  await air.locator('[data-action="jump"]').click();
  await expect(air).toHaveAttribute('data-air-phase', 'freefall', { timeout: 15_000 });
  await air.locator('[data-action="arch"]').click();
  await expect
    .poll(async () => Number(await air.locator('[data-alt]').getAttribute('data-alt')), {
      timeout: 60_000,
      intervals: [200],
    })
    .toBeLessThan(1700);
  // (Redrawn every frame: dispatched rather than waiting for it to hold still.)
  await air.locator('[data-action="pull"]').dispatchEvent('click');
  await expect(air).toHaveAttribute('data-air-phase', 'canopy', { timeout: 10_000 });
  await page.waitForTimeout(800);
  await phoneShot(page, 'skydive');
});

test('first class from Dubai: the lounge, then the bed at turndown', async ({ page }) => {
  test.setTimeout(900_000);
  await page.addInitScript(() =>
    localStorage.setItem('runway.flightClock', '2026-06-15T11:00:00Z'),
  );
  await investor(page, 'dubai');
  await tab(page, 'City').click();
  await expect(page.getByRole('application', { name: /Map of Dubai/ })).toBeVisible({
    timeout: SLOW,
  });
  // Book first class to London (and back).
  await page.getByRole('button', { name: /^Phone/ }).click();
  const phone = page.getByRole('dialog', { name: 'Phone' });
  await phone.locator('[data-app="travel"]').click();
  const row = phone.locator('[data-flight="london"]');
  await row.getByRole('button', { name: 'Book a flight to London' }).click();
  const picker = row.locator('[data-trip-picker]');
  await picker.locator('[data-cabin-option="first"]').click();
  await picker.getByRole('button', { name: 'Choose Soho Townhouse' }).click();
  await picker.locator('[data-hotel-book]').click();
  await arrive(page, 'skip');
  const trip = page.getByRole('region', { name: 'Your trip' });
  await expect(trip).toBeVisible({ timeout: SLOW });
  // Check in, security: the lounge. A meal, champagne and a shower, until the flight is called.
  const skip = (where: Locator) =>
    where
      .getByRole('button', { name: 'Skip' })
      .click({ timeout: 3000 })
      .catch(() => undefined);
  await trip.getByRole('button', { name: 'Check in for London' }).click();
  await skip(trip);
  await trip.getByRole('button', { name: 'Go through security' }).click({ timeout: 15_000 });
  await skip(trip);
  const lounge = page.locator('.lounge-scene[data-lounge="first"]');
  await expect(lounge).toHaveAttribute('data-lounge-ready', 'yes', { timeout: 3 * SLOW });
  const panel = trip.locator('[data-lounge-panel="first"]');
  for (const act of ['dine', 'drink', 'shower']) {
    await panel.locator(`[data-lounge-act="${act}"]`).click();
    await expect(panel.locator(`[data-lounge-result="${act}"]`)).toBeVisible({ timeout: 30_000 });
  }
  await expect(lounge).toHaveAttribute('data-lounge-called', 'yes');
  await page.waitForTimeout(2500);
  await phoneShot(page, 'first-lounge');
  // The suite: on to the night, turndown into a bed.
  await panel.locator('[data-lounge-board]').click();
  await trip.getByRole('button', { name: 'Board for London' }).click();
  const flight = page.getByRole('dialog', { name: 'Flight to London' });
  await expect(flight).toHaveAttribute('data-flight-phase', 'cruise', { timeout: 3 * SLOW });
  const suite = flight.locator('.suite-flight[data-cabin="first"]');
  await expect(suite).toHaveAttribute('data-suite-ready', 'yes', { timeout: 3 * SLOW });
  await expect
    .poll(async () => (await view(page)).flights.inflight?.cabin ?? null, { timeout: SLOW })
    .toBe('first');
  await suite.locator('[data-suite-next]').click();
  await expect(suite).toHaveAttribute('data-suite-stage', 'meal');
  await suite.locator('[data-suite-next]').click();
  await expect(suite).toHaveAttribute('data-suite-stage', 'night');
  await suite.locator('[data-inflight-act="sleep"]').click();
  await expect(suite.locator('[data-inflight-result="sleep"]')).toBeVisible({ timeout: 30_000 });
  // Look down over the suite's walls onto the bed (a drag down on the cabin).
  const cabin = (await suite.locator('[data-suite-3d]').boundingBox())!;
  const mid = { x: cabin.x + cabin.width / 2, y: cabin.y + cabin.height * 0.35 };
  await page.mouse.move(mid.x, mid.y);
  await page.mouse.down();
  await page.mouse.move(mid.x, mid.y + 90, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(5000);
  await phoneShot(page, 'first-suite');
});

type Stage3D = {
  azimuth: number;
  elevation: number;
  zoom: number;
  maxFps: number;
  frames: number;
  updateCamera(): void;
};

/**
 * A club in London at midnight: the phone screen, then the clip's poster and
 * the clip itself (`club-poster.jpg`, and frames in club-frames/ for
 * club.mp4 and club.webm: 390×400 from the top of the room). The frames are
 * drawn on a paused clock 1/24 s apart, so the clip plays smoothly whatever
 * the software GPU's frame rate; the camera sways round the floor and back,
 * so it loops. The poster and frames are 420/390 of 390×400; then:
 *   convert club-poster.jpg -resize 390x400! -quality 74 club-poster.jpg
 *   ffmpeg -framerate 24 -i club-frames/%03d.png -vf scale=390:400:flags=lanczos
 *     -c:v libx264 -preset veryslow -crf 30 -pix_fmt yuv420p -movflags +faststart -an club.mp4
 *   ffmpeg -framerate 24 -i club-frames/%03d.png -vf scale=390:400:flags=lanczos
 *     -c:v libvpx-vp9 -b:v 0 -crf 50 -row-mt 1 -cpu-used 1 -pix_fmt yuv420p -an club.webm
 */
test('a London club at midnight, and its clip', async ({ page }) => {
  test.setTimeout(1_200_000);
  await page.clock.install({ time: new Date('2026-11-24T00:10:00Z') });
  await founder(page, /London/);
  await tab(page, 'City').click();
  const v = await view(page);
  const club = (v.market?.businesses ?? []).find(
    (b: { open?: boolean; kind: string }) => b.open !== false && /nightclub/.test(b.kind),
  );
  expect(club, 'a nightclub in London').toBeTruthy();
  const placeId = `biz:${club.id}`;
  await keep3d(page);
  await tapPlace(page, `[data-place="${placeId}"]`, 'cycle');
  const scene = page.locator(`.place-scene[data-scene="${placeId}"]`);
  await expect(scene).toBeVisible({ timeout: 3 * SLOW });
  const room = scene.locator('.place-room');
  await expect(room).toHaveClass(/is-3d/, { timeout: 3 * SLOW });
  await page.waitForTimeout(15_000);
  await keep3d(page);
  await phoneShot(page, 'club');
  // The clip is the room alone, 390×400: it fills the top of the screen for it.
  await page.addStyleTag({
    content: `.place-scene .place-room { position: fixed !important; left: 0 !important;
      top: 0 !important; width: 390px !important; height: 400px !important; z-index: 2147483647; }`,
  });
  // (Nothing over it: the game's own bars, fixed on top, are hidden.)
  await page.evaluate(() => {
    const room = document.querySelector('.place-scene .place-room')!;
    for (const el of document.querySelectorAll<HTMLElement>('body *')) {
      if (el.contains(room) || room.contains(el)) continue;
      if (getComputedStyle(el).position === 'fixed') el.style.visibility = 'hidden';
    }
  });
  await page.evaluate((z) => {
    const st = (window as unknown as { __stage3d: Stage3D }).__stage3d;
    st.zoom = z;
    st.updateCamera();
  }, 1.2);
  await page.waitForTimeout(5000);
  const clip = { x: 0, y: 0, width: 390, height: 400 };
  await page.screenshot({ path: `${DIR}/club-poster.jpg`, type: 'jpeg', quality: 80, clip });
  const a0 = await page.evaluate(() => {
    const st = (window as unknown as { __stage3d: Stage3D }).__stage3d;
    st.maxFps = 60;
    return st.azimuth;
  });
  await page.clock.pauseAt(new Date((await page.evaluate(() => Date.now())) + 1000));
  const FRAMES = 192;
  for (let i = 0; i < FRAMES; i++) {
    await page.evaluate(
      ([a, k]) => {
        const st = (window as unknown as { __stage3d: Stage3D }).__stage3d;
        st.azimuth = a + 0.2 * Math.sin(2 * Math.PI * k);
        st.updateCamera();
      },
      [a0, i / FRAMES] as const,
    );
    await page.clock.runFor(1000 / 24);
    await page.screenshot({ path: `${DIR}/club-frames/${String(i).padStart(3, '0')}.png`, clip });
  }
});

/**
 * The mansion turning round (mansion/00…29.jpg, 440×381): the 3D house,
 * its pool and its cars from 30 sides, 12° apart. Saved at 420/390 of the
 * size; then `convert NN.jpg -resize 440x381! -quality 62 NN.jpg` each.
 */
test('the mansion from every side', async ({ page }) => {
  test.setTimeout(900_000);
  await page.setViewportSize({ width: 440, height: 760 });
  // Early afternoon in Dubai: the pool and the lawn in sunshine.
  await at(page, '2026-11-24T10:30:00Z');
  await founder(page, /Dubai/);
  await tab(page, 'Today').click();
  const tools = page.locator('[data-home-preview]');
  await tools.scrollIntoViewIfNeeded();
  await tools.getByRole('button', { name: 'Wealth 3' }).click();
  await tools.locator('[data-preview-kind="mansion"]').click();
  const home = page.locator('.home-scene');
  await expect(home).toHaveAttribute('data-kind', 'mansion');
  await expect(home).toHaveClass(/is-3d/, { timeout: 3 * SLOW });
  await page.waitForTimeout(10_000);
  const box = (await home.locator('canvas').first().boundingBox())!;
  const top = box.y + Math.max(0, box.height - 381 / 2);
  const clip = { x: 0, y: top, width: 440, height: 381 };
  // The house alone: the floor buttons and the game's bars are hidden.
  await page.evaluate(() => {
    const c = document.querySelector('.home-scene canvas')!;
    for (const el of document.querySelectorAll<HTMLElement>('body *'))
      if (!el.contains(c)) el.style.visibility = 'hidden';
  });
  const a0 = await page.evaluate(
    ([el, z]) => {
      const st = (window as unknown as { __stage3d: Stage3D }).__stage3d;
      st.elevation = el;
      st.zoom = z;
      return st.azimuth;
    },
    [0.85, 0.7] as const,
  );
  const frames = () =>
    page.evaluate(() => (window as unknown as { __stage3d: Stage3D }).__stage3d.frames);
  for (let i = 0; i < 30; i++) {
    const before = await page.evaluate(
      ([a, k]) => {
        const st = (window as unknown as { __stage3d: Stage3D }).__stage3d;
        st.azimuth = a + (2 * Math.PI * k) / 30;
        st.updateCamera();
        return st.frames;
      },
      [a0, i] as const,
    );
    await expect.poll(frames, { timeout: SLOW }).toBeGreaterThan(before);
    await page.waitForTimeout(800);
    await page.screenshot({
      path: `${DIR}/mansion/${String(i).padStart(2, '0')}.jpg`,
      type: 'jpeg',
      quality: 70,
      clip,
    });
  }
});

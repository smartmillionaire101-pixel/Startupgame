import { expect, letters, playAsGuest, tab, test, type Page } from './fixtures';

/**
 * Wave 10 §C: buy a home (cash) and move in; a pitch competition
 * in San Francisco judged at the settlement; a locked activity says when it
 * unlocks; open a branch from the Company screen.
 */

async function command(page: Page, command: Record<string, unknown>) {
  return page.evaluate(async (c) => {
    const r = await fetch('/api/commands', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-runway': '1' },
      body: JSON.stringify({ command: c }),
    });
    return { status: r.status, body: await r.text() };
  }, command);
}

async function create(page: Page, role: 'founder' | 'investor', market: string) {
  await playAsGuest(page);
  const h = `w10_${letters(8)}`;
  const r = await command(
    page,
    role === 'founder'
      ? {
          type: 'player.create',
          handle: h,
          name: 'Ada Ten',
          role,
          backgroundId: 'f-engineer',
          market,
          gender: 'female',
          company: {
            name: `Ten ${h.slice(4)}`,
            industry: 'fintech',
            revenueModel: 'subscription',
            idea: 'Payments for market traders',
            incorporation: 'local',
          },
        }
      : {
          type: 'player.create',
          handle: h,
          name: 'Ike Ten',
          role,
          backgroundId: 'i-corporate',
          market,
          gender: 'male',
          investor: { sectors: ['fintech'], stages: ['pre-seed', 'seed'], checkSize: 2000000 },
        },
  );
  expect(r.status, r.body).toBe(200);
  await page.reload();
  await expect(page.getByRole('button', { name: /^Phone/ })).toBeVisible();
}

async function openApp(page: Page, app: string) {
  const phone = page.getByRole('dialog', { name: 'Phone' });
  if (!(await phone.isVisible())) await page.getByRole('button', { name: /^Phone/ }).click();
  await expect(phone).toBeVisible();
  await phone.locator(`[data-app="${app}"]`).click();
  return phone;
}

test('buy a home with cash and move in', async ({ page }) => {
  // Johannesburg: the city where a new investor can pay cash for the most homes.
  await create(page, 'investor', 'johannesburg');
  const phone = await openApp(page, 'homes');
  await expect(phone.getByText(/Homes in Johannesburg/)).toBeVisible();
  // A home you can pay for in cash, a studio if one is left. The deploy
  // preview keeps one world across runs and other specs buy homes, so ask
  // the game which ones you can afford rather than counting on the list.
  const id = await page.evaluate(async () => {
    const r = await fetch('/api/state', { headers: { 'x-runway': '1' } });
    const s = (await r.json()) as {
      view: {
        market: {
          properties?: {
            listings: {
              id: string;
              tier: string;
              forSale: boolean;
              canBuy: boolean;
            }[];
          };
        };
      };
    };
    const ok = (s.view.market.properties?.listings ?? []).filter((l) => l.forSale && l.canBuy);
    const studios = ok.filter((l) => l.tier === 'studio');
    // Any one of them, at random: specs running alongside may buy the cheapest.
    const pool = studios.length ? studios : ok;
    const pick = crypto.getRandomValues(new Uint32Array(1))[0]! % Math.max(1, pool.length);
    return pool[pick]?.id ?? null;
  });
  expect(id, 'a home this investor can buy with cash').not.toBeNull();
  try {
    const studio = phone.locator(`[data-listing="${id}"]`);
    await expect(studio).toBeVisible();
    await studio.click();
    const detail = phone.locator('[data-listing-detail]');
    await expect(detail.locator('[data-tour]')).toBeVisible();
    await expect(detail.locator('[data-monthly]')).toBeVisible();
    await detail.getByRole('button', { name: /^Buy for / }).click();
    await expect(detail.locator('[data-owned]')).toBeVisible();
    await phone.getByRole('button', { name: /Back to the listings/ }).click();
    await phone.getByRole('radio', { name: 'Portfolio' }).click();
    const home = phone.locator('[data-owned-home]').first();
    await expect(home).toBeVisible();
    await home.getByRole('button', { name: 'Move in' }).click();
    await expect(phone.locator('[data-owned-home][data-residence]')).toBeVisible();
    await expect(home.getByText('You live here')).toBeVisible();
    await expect(phone.locator('[data-net-worth]')).toBeVisible();
  } finally {
    // Back on the market, so the city's few homes a newcomer affords are
    // still there for the next run (the preview keeps one world).
    await command(page, { type: 'property.sell', propertyId: id! }).catch(() => null);
  }
});

test('a pitch competition in San Francisco: enter, settle, see the result', async ({ page }) => {
  await create(page, 'founder', 'san-francisco');
  const phone = await openApp(page, 'events');
  await phone.getByRole('radio', { name: /Competitions/ }).click();
  const card = phone.locator('[data-competition][data-status="open"]').first();
  await expect(card).toBeVisible();
  await expect(
    card.getByRole('list', { name: 'Judges' }).getByRole('listitem').first(),
  ).toBeVisible();
  await card.getByRole('button', { name: /^Enter with / }).click();
  await expect(card.locator('[data-entered]')).toBeVisible();
  const id = await card.getAttribute('data-competition');

  // The stage while it's open.
  await card.getByRole('button', { name: 'Watch it on stage' }).click();
  const scene = page.getByRole('dialog', { name: /Pitch|Cup|Showdown|Battle/ });
  await expect(scene).toHaveAttribute('data-phase', 'live');
  await scene.getByRole('button', { name: 'Close' }).click();

  // The month ends: judged.
  const r = await page.request.post('/api/dev/settle', {
    headers: { 'x-runway': '1' },
    data: { market: 'san-francisco' },
  });
  expect(r.status(), await r.text()).toBe(200);
  await page.reload();
  const phone2 = await openApp(page, 'events');
  await phone2.getByRole('radio', { name: /Competitions/ }).click();
  const judged = phone2.locator(`[data-competition="${id}"]`);
  await expect(judged).toHaveAttribute('data-status', 'judged');
  await expect(judged.getByRole('list', { name: 'Results' })).toBeVisible();
  await judged.getByRole('button', { name: 'Watch the results on stage' }).click();
  const stage = page.locator(`[data-competition="${id}"].comp-scene`);
  await expect(stage).toHaveAttribute('data-phase', 'reveal');
  await stage.getByRole('button', { name: /^Skip/ }).click();
  await expect(stage.locator('[data-result]')).toBeVisible();
  await expect(stage.locator('[data-my-rank]')).toBeVisible();
  await expect(stage.locator('[data-rank="1"]')).toBeVisible();
});

test('Going out: a locked activity says when it unlocks', async ({ page }) => {
  await create(page, 'founder', 'lagos');
  const phone = await openApp(page, 'goingout');
  await phone.getByRole('radio', { name: 'By lifestyle' }).click();
  await expect(phone.getByText(/Your standard of living: level 2/)).toBeVisible();
  const locked = phone.locator('[data-activity][data-locked]').first();
  await expect(locked).toBeVisible();
  await expect(locked.locator('[data-lock]')).toHaveText(
    /Unlocks at standard of living \d \(\w+\)/,
  );
  await expect(locked.getByRole('button', { name: /^Book/ })).toHaveCount(0);
  // Something you can do has Go and Book.
  const open = phone.locator('[data-activity]:not([data-locked])').first();
  await expect(open.getByRole('button', { name: /^Book / })).toBeVisible();
  await expect(open.getByRole('button', { name: /^Go to / })).toBeVisible();
});

test('open a branch from the Company screen', async ({ page }) => {
  await create(page, 'founder', 'lagos');
  // Put some savings into the company to pay for the fit-out.
  const s = await page.evaluate(async () => {
    const r = await (await fetch('/api/state', { headers: { 'x-runway': '1' } })).json();
    return (r.view ?? r) as { companies: { id: string }[] };
  });
  const r = await command(page, {
    type: 'company.inject',
    companyId: s.companies[0]!.id,
    amount: 600000000,
  });
  expect(r.status, r.body).toBe(200);
  await page.reload();
  await tab(page, 'Company').click();
  const card = page.locator('.expansion');
  await expect(card.getByText(/Head office:/)).toBeVisible();
  const hood = card.getByRole('radiogroup', { name: 'Neighbourhood' }).getByRole('radio');
  await hood.and(page.locator(':not([disabled])')).first().click();
  await card.getByRole('button', { name: /^Open in / }).click();
  await expect(card.locator('[data-branch]')).toHaveCount(1);
  await expect(card.getByRole('button', { name: /^Close the .* branch$/ })).toBeVisible();
});

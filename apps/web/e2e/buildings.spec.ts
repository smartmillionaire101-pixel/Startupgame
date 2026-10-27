import { expect, letters, playAsGuest, setupPlayer, tapPlace, test, type Page } from './fixtures';

/**
 * Something to do in every building (the feedback round): walk into places
 * where nothing used to happen and use what they offer now. The newsstand's
 * vendor sells a paper with a tip in it, the pharmacy sells medicine when
 * you're under the weather, a warehouse rents a goods company storage, a
 * cinema in the evening is full of people, and the Tax Office (by
 * appointment, a month on from the dev tools) checks your filings and
 * answers a tax question.
 * Johannesburg: the city specs advance a month in, away from Lagos.
 */
test.use({ viewport: { width: 390, height: 844 } });

type Biz = { id: string; kind: string; open?: boolean };

/** The open businesses of the city, as the view has them. */
const businesses = (page: Page) =>
  page.evaluate(async () => {
    const r = await fetch('/api/state', { headers: { 'x-runway': '1' } });
    const s = (await r.json()) as { view?: { market?: { businesses?: Biz[] } } };
    return (s.view?.market?.businesses ?? []).filter((b) => b.open !== false);
  });

async function founder(page: Page) {
  await playAsGuest(page);
  const meta = await page.request.get('/api/meta').then((r) => r.json());
  const jhb = meta.markets.find((m: { name: string }) => /Johannesburg/.test(m.name));
  const handle = `bd_${letters(8)}`;
  await setupPlayer(page, {
    type: 'player.create',
    name: 'Thandi Errands',
    handle,
    role: 'founder',
    backgroundId: 'f-engineer',
    market: jhb.id,
    gender: 'female',
    company: {
      name: `Crate ${letters(5)}`,
      // Goods: storage and shipping help it.
      industry: 'ecommerce',
      revenueModel: 'subscription',
      idea: 'Groceries delivered to spaza shops',
      incorporation: 'local',
    },
  });
  await expect(page.getByRole('application', { name: /Map of Johannesburg/ })).toBeVisible({
    timeout: 30_000,
  });
}

const scene = (page: Page) => page.locator('.place-scene');

async function enter(page: Page, placeId: string) {
  await tapPlace(page, `[data-place="${placeId}"]`, 'cycle');
  await expect(scene(page)).toBeVisible({ timeout: 15_000 });
}

async function leave(page: Page) {
  await scene(page).getByRole('button', { name: 'Close' }).first().click();
  await expect(scene(page)).toBeHidden();
}

test('buildings where something happens: newsstand, pharmacy, warehouse, cinema and the Tax Office', async ({
  page,
}) => {
  test.setTimeout(360_000);
  // The evening: the cinema's crowd is in.
  await page.addInitScript(() => localStorage.setItem('runway.mapHour', '20'));
  await founder(page);
  const all = await businesses(page);
  const of = (kind: string) => all.find((b) => b.kind === kind);

  // The newsstand: a vendor, and a paper with a tip in it (a lead for a founder).
  await enter(page, 'newsstand');
  await expect(scene(page).locator('[data-occupant]').first()).toBeAttached();
  const paper = scene(page).locator('[data-action="errand:paper"]');
  await expect(paper).toBeEnabled();
  await paper.click();
  await expect(
    page.getByText(
      /A tip in the paper: .+ is looking for a supplier|The business pages|A columnist/,
    ),
  ).toBeVisible();
  await expect(paper).toBeDisabled();
  await leave(page);

  // The pharmacy: medicine when you're under the weather (a new player is at 80 health).
  const pharmacy = of('pharmacy');
  expect(pharmacy).toBeTruthy();
  await enter(page, `biz:${pharmacy!.id}`);
  const medicine = scene(page).locator('[data-action="errand:medicine"]');
  await expect(medicine).toBeEnabled();
  await medicine.click();
  await expect(page.getByText('You took your medicine and feel better.')).toBeVisible();
  await leave(page);

  // A warehouse: storage for a goods company (the company pays).
  const store = of('warehouse') ?? of('cold-store');
  expect(store).toBeTruthy();
  await enter(page, `biz:${store!.id}`);
  const storage = scene(page).locator('[data-action="errand:storage"]');
  await expect(storage).toBeEnabled();
  await expect(storage).toContainText('from the company');
  await storage.click();
  await expect(page.getByText('Stock stored safely: fewer failed orders.')).toBeVisible();
  await leave(page);

  // The cinema in the evening: people to meet, not just the owner.
  const cinema = of('cinema');
  expect(cinema).toBeTruthy();
  await enter(page, `biz:${cinema!.id}`);
  await expect
    .poll(() => scene(page).locator('[data-occupant]').count(), { timeout: 10_000 })
    .toBeGreaterThanOrEqual(5);
  await scene(page)
    .getByRole('button', { name: /Who’s here/ })
    .click();
  const here = page.getByRole('dialog', { name: 'Who’s here' });
  await expect(here.locator('[data-person-here]').nth(3)).toBeVisible();
  await here.getByRole('button', { name: 'Close' }).click();
  await leave(page);

  // The Tax Office: book an appointment; a month on, go in.
  const tax = 'civic:johannesburg:tax-office';
  await tapPlace(page, `[data-place="${tax}"]`, 'cycle');
  const door = page.locator('.civic-door');
  await expect(door).toHaveAttribute('data-civic-closed', 'appointment', { timeout: 15_000 });
  await door.locator('[data-book-appointment]').click();
  await expect(page.getByText(/Appointment booked at Tax Office/)).toBeVisible();
  await door.getByRole('button', { name: 'Back to the street' }).click();
  const settled = await page.request.post('/api/dev/settle', {
    headers: { 'x-runway': '1' },
    data: { market: 'johannesburg' },
  });
  expect(settled.status()).toBe(200);
  await page.reload();
  await expect(page.getByRole('application', { name: /Map of Johannesburg/ })).toBeVisible({
    timeout: 30_000,
  });
  await enter(page, tax);
  const check = scene(page).locator('[data-action="civic:filing-check"]');
  await expect(check).toBeEnabled();
  await check.click();
  await expect(page.getByText(/isn’t registered for tax yet: register here first/)).toBeVisible();
  const clinic = scene(page).locator('[data-action="civic:tax-clinic"]');
  await clinic.click();
  await expect(
    page.getByText(/Do I pay|Can I pay|Is the cost|What happens if|Do I charge|Should a new hire/),
  ).toBeVisible();
  await expect(clinic).toBeDisabled();
});

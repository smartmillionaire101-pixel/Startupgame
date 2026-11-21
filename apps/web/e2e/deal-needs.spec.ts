import { expect, letters, playAsGuest, setupFounder, tab, test, type Page } from './fixtures';

/**
 * Round 4 player feedback, on a 390-wide phone:
 *
 *  1. The Company screen's stage card: "Do it now" for "Reach £22.9k revenue
 *     in a month" (stage 6/6, Series A) did nothing. It now opens the
 *     Customers section, scrolled into view, with the step's hint and the
 *     ways to grow revenue (Sales, price and marketing, the Market).
 *  2. "Open the Roadmap" on a deal lost on product fit, in the phone's Sales
 *     app, did nothing (the tab changed behind the phone). It now closes the
 *     phone and opens the Roadmap on the feature the customer needs.
 *  3. The deal card names what the customer needs the product to do, and
 *     what you have of it (DEAL_NEEDS_NOTE).
 *
 * ROUND4_SHOTS=<dir> saves phone-size screenshots of each.
 */
test.use({ viewport: { width: 390, height: 844 } });
const SHOTS = process.env.ROUND4_SHOTS;

type Json = Record<string, unknown>;
type Task = { id: string; done?: boolean; [k: string]: unknown };
type DealV = {
  id: string;
  name: string;
  stage: string;
  monthsLeft: number | null;
  lossReason: string | null;
  known: {
    need: string | null;
    budgetMin: number | null;
    budgetMax: number | null;
    wants: { id: string; name: string; have: boolean }[] | null;
  };
  loss: { missing: { id: string; name: string }[] } | null;
};

async function command(page: Page, command: Json) {
  const r = await page.request.post('/api/commands', {
    headers: { 'x-runway': '1' },
    data: { command },
  });
  return { ok: r.ok(), body: (await r.json().catch(() => ({}))) as Json };
}

async function deals(page: Page): Promise<DealV[]> {
  const s = await page.request
    .get('/api/state', { headers: { 'x-runway': '1' } })
    .then((r) => r.json());
  return (s.view.companies[0].sales?.deals ?? []) as DealV[];
}

/**
 * Work leads through the engine until one who buys on fit is lost because the
 * product doesn't do what they need (a new company has shipped nothing, so a
 * fit-buying customer who says no mostly says it for that). Leads that buy on
 * something else are dropped to make room.
 */
async function dealLostOnFit(page: Page, market: string): Promise<DealV> {
  const step = (dealId: string, action: string, extra: Json = {}) =>
    command(page, { type: 'sales.advance', dealId, action, ...extra });
  // Out of prospecting, hours or cash this month: clear the board, and a new month.
  const newMonth = async (board: DealV[]) => {
    for (const d of board.filter((x) => x.stage !== 'won'))
      await command(page, { type: 'sales.drop', dealId: d.id });
    const settled = await page.request.post('/api/dev/settle', {
      headers: { 'x-runway': '1' },
      data: { market },
    });
    expect(settled.status()).toBe(200);
  };
  // Online sellers buy on fit more than anything.
  const s = await page.request
    .get('/api/state', { headers: { 'x-runway': '1' } })
    .then((r) => r.json());
  const target = await command(page, {
    type: 'company.strategy',
    companyId: s.view.companies[0].id,
    targetSegments: ['fintech.online-sellers'],
  });
  expect(target.ok, JSON.stringify(target.body)).toBe(true);
  for (let round = 0; round < 60; round++) {
    const board = await deals(page);
    const lost = board.find(
      (d) => d.stage === 'lost' && d.lossReason === 'missing_feature' && d.loss?.missing.length,
    );
    if (lost) return lost;
    const open = board.find((d) => d.monthsLeft !== null && d.monthsLeft > 0);
    if (!open) {
      const found = await command(page, { type: 'sales.prospect' });
      if (!found.ok) await newMonth(board);
      continue;
    }
    if (open.stage === 'lead') await step(open.id, 'contact');
    if (open.stage === 'lead' || open.stage === 'contacted') await step(open.id, 'discover');
    const known = (await deals(page)).find((d) => d.id === open.id)!;
    if (!known.known.need) {
      await newMonth(await deals(page));
      continue;
    }
    if (known.known.need !== 'fit' || !known.known.wants?.length) {
      await command(page, { type: 'sales.drop', dealId: open.id });
      continue;
    }
    const mid = Math.round(((known.known.budgetMin ?? 0) + (known.known.budgetMax ?? 0)) / 2);
    await step(open.id, 'demo');
    await step(open.id, 'propose', { price: Math.max(1, mid) });
    const r = await step(open.id, 'close');
    const result = r.body.result as { won?: boolean; lossReason?: string } | undefined;
    if (!r.ok || result?.won || result?.lossReason !== 'missing_feature')
      await command(page, { type: 'sales.drop', dealId: open.id });
  }
  throw new Error('No deal was lost on product fit');
}

async function founder(page: Page, market: RegExp) {
  await playAsGuest(page);
  const handle = `dn_${letters(8)}`;
  await setupFounder(page, {
    name: 'Tom Needs',
    handle,
    company: `Needs ${handle.slice(3)}`,
    idea: 'Payments for market traders',
    market,
  });
  await expect(tab(page, 'Today')).toBeVisible();
}

async function openSalesApp(page: Page) {
  await page.getByRole('button', { name: /^Phone/ }).click();
  const phone = page.getByRole('dialog', { name: 'Phone' });
  await expect(phone).toBeVisible();
  await phone.locator('[data-app="sales"]').click();
  await expect(phone.locator('[data-phone-app="sales"]')).toBeVisible();
  return phone;
}

test('a deal lost on fit names what is missing, and "Open the Roadmap" in the phone opens it there', async ({
  page,
}) => {
  test.slow();
  await founder(page, /Freetown/);
  const lost = await dealLostOnFit(page, 'freetown');
  const missing = lost.loss!.missing[0]!;
  await page.reload();

  const phone = await openSalesApp(page);
  await phone.locator('[data-chip="lost"]').click();
  const card = phone.locator(`[data-deal="${lost.id}"]`);
  await expect(card).toBeVisible();
  // What they need the product to do, by name, and what you have of it.
  const need = card.locator('[data-known="need"]');
  await expect(need).toContainText(missing.name);
  await expect(need).toHaveAttribute('data-missing', new RegExp(missing.id));
  await expect(need).not.toContainText('A product that fits how they work');
  // The lost reason and what to do next name it too.
  await expect(card.locator('.sales-loss')).toContainText(`missing ${missing.name}`);
  await expect(card.locator('[data-loss-next]')).toContainText(`Build ${missing.name}`);
  await need.evaluate((e) => e.scrollIntoView({ block: 'start' }));
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/deal-card-specific-needs.png` });

  // Open the Roadmap: the phone closes, and the Roadmap opens on that feature.
  await card.getByRole('button', { name: 'Open the Roadmap' }).click();
  await expect(phone).toBeHidden();
  const wanted = page.locator(`[data-roadmap-wanted="${missing.id}"]`);
  await expect(wanted).toBeVisible();
  await expect(wanted).toBeInViewport();
  await expect(wanted).toContainText(`${lost.name} needs ${missing.name}`);
  await expect(page.getByRole('tab', { name: 'Roadmap' })).toHaveAttribute('aria-selected', 'true');
  await page.waitForTimeout(600);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/roadmap-from-lost-deal.png` });

  // Add it in one tap: it is on the roadmap, highlighted among the projects.
  await wanted.locator('[data-wanted-add]').click();
  await expect(wanted.locator('[data-wanted-status="building"]')).toBeVisible();
  await expect(
    page.locator(`.rm-project[data-feature="${missing.id}"][data-wanted]`),
  ).toBeVisible();
});

test('"Open the Roadmap" on the Company screen’s Sales tab scrolls to the feature they need', async ({
  page,
}) => {
  test.slow();
  await founder(page, /Freetown/);
  const lost = await dealLostOnFit(page, 'freetown');
  const missing = lost.loss!.missing[0]!;
  await page.reload();
  await tab(page, 'Company').click();
  await page.getByRole('tab', { name: 'Sales' }).click();
  const sales = page.locator('[data-sales]');
  await sales.locator('[data-chip="lost"]').click();
  const card = sales.locator(`[data-deal="${lost.id}"]`);
  await card.getByRole('button', { name: 'Open the Roadmap' }).click();
  const wanted = page.locator(`[data-roadmap-wanted="${missing.id}"]`);
  await expect(wanted).toBeInViewport();
  await expect(page.getByRole('tab', { name: 'Roadmap' })).toHaveAttribute('aria-selected', 'true');
});

/**
 * The player's stage card at Series A, as the server would send it: the
 * revenue step next, with its figures. (Getting a test company to Series A
 * takes a year of play; the stage card only reads `guide`.)
 */
async function atSeriesA(page: Page) {
  await page.route('**/api/state**', async (route) => {
    const headers = { ...route.request().headers() };
    delete headers['if-none-match'];
    const res = await route.fetch({ headers });
    const body = (await res.json().catch(() => null)) as {
      view?: {
        companies?: { guide: { stages: { id: string; status: string; tasks: Task[] }[] } }[];
      };
    } | null;
    const c = body?.view?.companies?.[0];
    if (c?.guide) {
      const stages = c.guide.stages.map((s, i) => ({
        ...s,
        status: i < 5 ? 'done' : 'current',
        tasks: s.tasks.map((x) => ({ ...x, done: i < 5 })),
      }));
      const a = stages[5]!;
      a.tasks = a.tasks.map((x) =>
        x.id === 'a.revenue' ? { ...x, done: false, have: 11_500_00, need: 22_900_00 } : x,
      );
      c.guide = {
        ...c.guide,
        stage: 'series-a',
        index: 5,
        complete: false,
        stages,
        next: a.tasks.find((x) => x.id === 'a.revenue'),
      } as typeof c.guide;
    }
    await route.fulfill({ response: res, json: body });
  });
}

test('"Do it now" for the revenue step opens where revenue moves, with a hint', async ({
  page,
}) => {
  await founder(page, /London/);
  await atSeriesA(page);
  await page.reload();
  await tab(page, 'Company').click();
  const stage = page.locator('[data-founder-stage]');
  await expect(stage).toHaveAttribute('data-founder-stage', 'series-a');
  const go = stage.locator('[data-next-task="a.revenue"]');
  await expect(go).toBeVisible();
  await expect(go).toContainText('Grow your revenue');

  await go.click();
  // The Customers section opens below, scrolled into view, with the step's hint on top.
  const hint = page.locator('[data-step-hint="a.revenue"]');
  await expect(hint).toBeVisible();
  await expect(hint).toBeInViewport();
  await expect(hint).toContainText(/Reach £[\d.,]+k? revenue in a month/);
  await expect(hint).toContainText(/£[\d.,]+k? more revenue a month closes this/);
  await expect(page.getByRole('tab', { name: 'Customers' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.locator('[data-customer-book]')).toBeVisible();
  await page.waitForTimeout(600);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/do-it-now-revenue.png` });

  // From the hint: Sales, or the price and marketing.
  await hint.locator('[data-hint-go="sales"]').click();
  await expect(page.getByRole('tab', { name: 'Sales' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('[data-sales]')).toBeVisible();
  await expect(hint).toBeVisible();
  await hint.locator('[data-hint-go="pricing"]').click();
  await expect(page.getByRole('tab', { name: 'Customers' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.locator('[data-company-focus="pricing"]')).toBeInViewport();
});

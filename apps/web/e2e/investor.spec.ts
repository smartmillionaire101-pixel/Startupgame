import { setupPlayer, openDeals } from './fixtures';
import { expect, letters, playAsGuest, tab, test } from './fixtures';

test('an investor screens an AI startup, does diligence and writes a first cheque', async ({
  page,
}) => {
  await playAsGuest(page);

  await setupPlayer(page, {
    type: 'player.create',
    name: 'Wanjiku E2E',
    handle: `wanjiku_${letters(6)}`,
    role: 'investor',
    backgroundId: 'i-exited',
    market: 'nairobi',
    gender: 'female',
    investor: { sectors: ['fintech'], stages: ['pre-seed', 'seed'], checkSize: 2000000 },
  });
  await tab(page, 'Today').click();

  // First day: three AI startup pitches in the focus area.
  await expect(page.getByText(/wants to pitch you/).first()).toBeVisible();
  await openDeals(page);
  await page.getByRole('button', { name: 'Open' }).first().click();
  // The first call is a decision: what you ask first (scored against their numbers).
  await page.getByRole('button', { name: 'How long does your money last?' }).click();
  await expect(page.getByText('Diligence · level 1')).toBeVisible();
  await expect(page.locator('.ig-scored [data-decision="first-call"]')).toBeVisible();
  // A cheque over a tenth of your money asks first: invest anyway.
  await page
    .getByRole('button', { name: 'Send term sheet (2h)' })
    .or(page.getByRole('button', { name: 'Invest anyway' }))
    .click();
  await expect(
    page.getByText(/Accepted. You’re in.|Term sheet sent.|They walked away./),
  ).toBeVisible();

  await tab(page, 'Portfolio').click();
  await expect(page.getByRole('heading', { name: 'Portfolio' })).toBeVisible();
  // Every section's name on one line (player screenshot: "As an LP" over three
  // lines); the row scrolls sideways instead, and the page never does.
  const sections = page.getByRole('radiogroup', { name: 'Portfolio sections' });
  const more = page.getByRole('button', { name: 'More sections' });
  if (await more.isVisible()) await more.click();
  const lines = await sections.getByRole('radio').evaluateAll((bs) =>
    bs.map((b) => {
      const r = document.createRange();
      r.selectNodeContents(b);
      return new Set([...r.getClientRects()].map((x) => Math.round(x.top))).size;
    }),
  );
  expect(Math.max(...lines)).toBeLessThanOrEqual(1);
  expect(
    await page.evaluate(() => document.scrollingElement!.scrollWidth - window.innerWidth),
  ).toBeLessThanOrEqual(0);
});

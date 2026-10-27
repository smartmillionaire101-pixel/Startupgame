import { expect, letters, playAsGuest, setupPlayer, tab, test, type Page } from './fixtures';

/**
 * Stock analysis (game feedback: "I am London based but stocks are from
 * other countries. Should be able to analyse the stocks and company before
 * investing."): a London investor opens the stock market on the phone, sees
 * the London Stock Exchange first with chips for the other cities, opens a
 * company's analysis (chart, numbers, price against the city, risk, news)
 * and buys shares from its Buy box.
 */

async function state(page: Page) {
  const r = await page.request.get('/api/state', { headers: { 'x-runway': '1' } });
  return (await r.json()).view;
}

test('a London investor sees London first, analyses a company and buys shares', async ({
  page,
}) => {
  test.slow();
  await playAsGuest(page);
  await setupPlayer(page, {
    type: 'player.quickStart',
    username: `ldn_${letters(5)}`,
    role: 'investor',
    name: `Lena${letters(4)}`,
    market: 'london',
  });
  await expect(tab(page, 'Today')).toBeVisible({ timeout: 30_000 });

  await page.getByRole('button', { name: /^Phone/ }).click();
  const phone = page.getByRole('dialog', { name: 'Phone' });
  await phone.locator('[data-app="capital"]').click();
  await expect(phone.getByRole('heading', { name: /Stock market/ })).toBeVisible();

  // London first: the chip is chosen, the exchange is named and tagged as yours.
  const chips = phone.getByRole('radiogroup', { name: 'Stock exchanges' });
  await expect(chips.getByRole('radio').first()).toContainText('London');
  await expect(chips.getByRole('radio', { name: /London/ })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  const head = phone.locator('[data-exchange="london"]');
  await expect(head).toContainText('London Stock Exchange');
  await expect(head).toContainText('Your city');
  const view = await state(page);
  const london = (view.capital.market as { market: string; companyId: string }[]).filter(
    (x) => x.market === 'london',
  );
  expect(view.capital.market[0].market).toBe('london');
  expect(london.length).toBeGreaterThan(0);
  const rows = phone.locator('[data-stock]');
  await expect(rows).toHaveCount(london.length);
  await expect(rows.first()).toHaveAttribute('data-stock', london[0]!.companyId);
  // The other cities are one tap away.
  await expect(phone.getByText('Other exchanges')).toBeVisible();

  // Analyse the first London company before buying.
  await rows.first().click();
  const analysis = phone.locator(`[data-analysis="${london[0]!.companyId}"]`);
  await expect(analysis).toBeVisible();
  for (const heading of ['What it does', 'Is the price fair?', 'Risk', 'Recent news'])
    await expect(analysis.getByRole('heading', { name: heading })).toBeVisible();
  await expect(analysis.getByText('Revenue', { exact: true })).toBeVisible();
  await expect(analysis.getByText('Company value')).toBeVisible();
  await expect(analysis.getByText('London average P/E')).toBeVisible();
  await expect(analysis.getByRole('meter', { name: 'Risk' })).toBeVisible();
  await expect(analysis.getByText('How much of your money is this?').first()).toBeVisible();
  await expect(analysis.getByText('10% guide', { exact: true })).toBeVisible();
  await expect(analysis.getByText('Most you can buy this month')).toBeVisible();

  // The Buy box: an amount, the share of your money, then buy.
  await analysis.getByLabel('Amount to invest').fill('5k');
  await expect(analysis.locator('[data-est-shares]')).not.toContainText('≈ 0 shares');
  await expect(analysis.getByText(/If .+ halves, you lose £2,500/)).toBeVisible();
  await analysis.getByRole('button', { name: /^Buy at £/ }).click();
  await expect(page.getByText(/Bought [\d,]+ shares\./)).toBeVisible();
  await expect(analysis.locator('[data-holding]')).toContainText('You hold');
  const after = await state(page);
  const held = (after.capital.market as { companyId: string; yourShares: number }[]).find(
    (x) => x.companyId === london[0]!.companyId,
  )!;
  expect(held.yourShares).toBeGreaterThan(0);

  // Back to the list; another city's exchange is one tap away.
  await analysis.getByRole('button', { name: /London Stock Exchange/ }).click();
  await chips.getByRole('radio', { name: /Lagos/ }).click();
  await expect(phone.locator('[data-exchange="lagos"]')).toContainText('Lagos Stock Exchange');
  await expect(phone.locator('[data-exchange="lagos"]')).not.toContainText('Your city');
});

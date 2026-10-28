/**
 * Play-test: in Accra a Lagos founder's naira balance showed with a cedi sign
 * ("GH₵3.8m" for ₦3.78m) at the mall, weighed against cedi prices; and the
 * return home already paid for read "₦383k · Book" at the departures desk.
 */
import { expect, letters, playAsGuest, setupFounder, tapPlace, test, type Page } from './fixtures';

test.use({ viewport: { width: 390, height: 844 } });

async function command(page: Page, command: unknown) {
  const r = await page.request.post('/api/commands', {
    headers: { 'x-runway': '1' },
    data: { command },
  });
  expect(r.ok(), await r.text()).toBeTruthy();
}

test('abroad: your naira at cedi prices, and the return you paid for', async ({ page }) => {
  test.setTimeout(180_000);
  await playAsGuest(page);
  await setupFounder(page, {
    name: 'Kofi Abroad',
    handle: `kofi_${letters(6)}`,
    company: `Kente ${letters(5)}`,
    idea: 'Payments for travellers',
  });
  await command(page, { type: 'travel.book', to: 'accra', returnCabin: 'economy' });
  await command(page, { type: 'travel.fly', to: 'accra' });
  await page.reload();
  await expect(page.getByRole('application', { name: /Map of Accra/ })).toBeVisible({
    timeout: 60_000,
  });

  // The Travel app: the way home is yours already.
  await page.getByRole('button', { name: /^Phone/ }).click();
  const phone = page.getByRole('dialog', { name: 'Phone' });
  await phone.locator('[data-app="travel"]').click();
  const home = phone.locator('[data-flight="lagos"]');
  await expect(home).toHaveAttribute('data-held-return', '');
  await expect(home).toContainText('Your return ticket · paid');
  await expect(home.getByRole('button', { name: /Book a flight to Lagos/ })).toHaveText(
    'Use ticket',
  );
  await page.keyboard.press('Escape');
  await page
    .getByRole('dialog', { name: 'Phone' })
    .getByRole('button', { name: 'Close' })
    .click({ timeout: 3000 })
    .catch(() => undefined);

  // The mall: your money in cedi (≈), with the naira alongside.
  await expect(page.locator('[data-place="mall"]').first()).toBeAttached({ timeout: 20_000 });
  await tapPlace(page, '[data-place="mall"]', 'cycle');
  const scene = page.locator('.mall-scene');
  await expect(scene).toBeVisible({ timeout: 20_000 });
  const pocket = scene.locator('.golf-pocket');
  await expect(pocket).toContainText('≈ GH₵');
  await expect(pocket).toContainText('₦');
  const naira = Number(await pocket.getAttribute('data-pocket'));
  const cedi = Number(await pocket.getAttribute('data-pocket-here'));
  expect(cedi).toBeGreaterThan(0);
  // A cedi is worth many naira: the balance here is far fewer cedi than naira.
  expect(cedi).toBeLessThan(naira / 10);
  // Buying converts as the header does: the cedi balance falls by the price.
  await scene.locator('[data-shop="fashion"]').click();
  await scene.locator('[data-colour="#db2777"]').click();
  await scene.locator('[data-buy="top-hoodie"]').click();
  const bought = scene.locator('[data-mall-bought="top-hoodie"]');
  await expect(bought).toBeVisible({ timeout: 10_000 });
  await expect
    .poll(async () => Number(await pocket.getAttribute('data-pocket')), { timeout: 8000 })
    .toBeLessThan(naira);
  await bought.locator('[data-action="mall-ok"]').click();
  await scene.getByRole('button', { name: 'Close' }).click();
  await expect(scene).toBeHidden();

  // The departures desk: the Lagos row is the ticket you hold, not "₦383k · Book".
  await tapPlace(page, '[data-place="airport"]', 'cycle');
  await page
    .getByRole('dialog', { name: 'How do you want to get there?' })
    .locator('[data-mode="skip"]')
    .click({ timeout: 5000 })
    .catch(() => undefined);
  const desk = page
    .getByRole('region', { name: 'Your trip' })
    .getByRole('list', { name: 'Where do you want to go?' });
  const lagos = desk.locator('[data-dest="lagos"]');
  await expect(lagos).toHaveAttribute('data-held-return', '', { timeout: 20_000 });
  await expect(lagos).toContainText('Your return ticket · paid');
  await expect(lagos.getByRole('button', { name: /Book a flight to Lagos/ })).toHaveText(
    'Use ticket',
  );
  await expect(desk.locator('[data-dest="london"]')).not.toHaveAttribute('data-held-return');
});

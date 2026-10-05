import { expect, letters, playAsGuest, tab, tapPlace, test, type Page } from './fixtures';

/**
 * Wave 6 §C1: people live inside buildings. The street has only anonymous
 * passers-by; a café's "Who's here" lists its owner (and whoever else is
 * in); Chat opens their thread in the phone and gets a reply; Save puts them
 * in the phone's Contacts.
 */

/** A Lagos founder, created through the API so the spec doesn't depend on onboarding screens. */
async function founder(page: Page) {
  await playAsGuest(page);
  const handle = `in_${letters(8)}`;
  const status = await page.evaluate(async (h) => {
    const r = await fetch('/api/commands', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-runway': '1' },
      body: JSON.stringify({
        command: {
          type: 'player.create',
          handle: h,
          name: 'Ines Inside',
          role: 'founder',
          backgroundId: 'f-engineer',
          market: 'lagos',
          gender: 'female',
          company: {
            name: `Indoor ${h.slice(3)}`,
            industry: 'fintech',
            revenueModel: 'subscription',
            idea: 'Payments for market traders',
            incorporation: 'local',
          },
        },
      }),
    });
    return r.status;
  }, handle);
  expect(status).toBe(200);
  await page.reload();
  await expect(page.getByRole('application', { name: /Map of Lagos/ })).toBeVisible();
}

/** An open café in town and its owner, as the view has them. */
const findCafe = (page: Page) =>
  page.evaluate(async () => {
    const r = await fetch('/api/state', { headers: { 'x-runway': '1' } });
    const s = (await r.json()) as {
      view?: {
        market?: {
          businesses?: {
            id: string;
            kind: string;
            open?: boolean;
            owner?: { name?: string };
            people?: { id: string; name: string; kind: string }[];
          }[];
        };
      };
    };
    const b = (s.view?.market?.businesses ?? []).find(
      (x) => x.open !== false && /caf|coffee/i.test(x.kind),
    );
    if (!b) return null;
    const owner = b.people?.find((p) => p.kind === 'owner');
    return {
      id: b.id,
      owner: owner?.name ?? b.owner?.name ?? '',
      // Wave 6 engine: people inside buildings, saving contacts.
      wave6: Array.isArray(b.people),
    };
  });

test('people live inside buildings: Who’s here, Chat, Save and Contacts', async ({ page }) => {
  await founder(page);

  // The street: a few passers-by for life, but nobody to tap.
  await expect(page.locator('[data-walker]').first()).toBeAttached();
  await expect(page.locator('[data-person]')).toHaveCount(0);
  await expect(page.locator('.city-crowd')).toHaveAttribute('pointer-events', 'none');

  const cafe = await findCafe(page);
  test.skip(!cafe, 'This build sends no cafés.');
  const { id, owner, wave6 } = cafe!;

  // Walk into the café: its scene shows who's here, the owner among them.
  await tapPlace(page, `[data-place="biz:${id}"]`, 'cycle');
  const scene = page.locator('.place-scene');
  await expect(scene).toBeVisible({ timeout: 10_000 });
  await scene.getByRole('button', { name: /Who’s here/ }).click();
  const here = page.getByRole('dialog', { name: 'Who’s here' });
  const row = here.locator(`[data-person-here="biz:${id}"]`);
  await expect(row).toBeVisible();
  await expect(row).toContainText(owner);
  await expect(row).toContainText('Owner');

  // Chat: the owner's thread opens in the phone and answers.
  await row.getByRole('button', { name: 'Chat' }).click();
  const phone = page.getByRole('dialog', { name: 'Phone' });
  await expect(phone.locator(`[data-thread="biz:${id}"]`)).toBeVisible({ timeout: 10_000 });
  await phone.locator('.phone-quick .chip').first().click();
  await expect(phone.locator('.bubble:not(.mine)').first()).toBeVisible({ timeout: 10_000 });
  await phone.getByRole('button', { name: 'Close phone' }).click();

  // Save needs the Wave 6 engine (`contact.save`); older builds stop here.
  test.skip(!wave6, 'This engine has no people inside buildings yet.');
  await scene.getByRole('button', { name: /Who’s here/ }).click();
  await here
    .locator(`[data-person-here="biz:${id}"]`)
    .getByRole('button', { name: 'Save' })
    .click();
  await expect(here.locator(`[data-person-here="biz:${id}"]`)).toContainText('Saved ✓');
  await here.getByRole('button', { name: 'Close' }).click();
  await scene.getByRole('button', { name: 'Close' }).first().click();
  await expect(scene).toBeHidden();

  // The phone's Contacts: the owner, with Chat and Remove.
  await tab(page, 'City').click();
  await page.getByRole('button', { name: /^Phone/ }).click();
  await phone.locator('[data-app="contacts"]').click();
  const contact = phone.locator(`[data-contact="biz:${id}"]`);
  await expect(contact).toContainText(owner);
  await contact.getByRole('button', { name: 'Chat' }).click();
  await expect(phone.locator(`[data-thread="biz:${id}"]`)).toBeVisible({ timeout: 10_000 });
  await phone.getByRole('button', { name: 'Back' }).click();
  await phone.getByRole('button', { name: 'Back' }).click();
  await phone.locator('[data-app="contacts"]').click();
  await contact.getByRole('button', { name: 'Remove' }).click();
  await contact.getByRole('button', { name: 'Tap again to remove' }).click();
  await expect(contact).toHaveCount(0);
});

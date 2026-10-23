import { expect, letters, playAsGuest, setupFounder, tapPlace, test, type Page } from './fixtures';

/**
 * City places: the city's big buildings are named places. Walk into one open
 * to everyone, get turned away from one that isn't for you (with the reason
 * and what opens it), then book a government appointment, come back at the
 * time (a month on, from the dev tools) and get something done there.
 * Accra: this spec settles a month, away from the cities other specs share.
 * Screenshots go to $PLACES_SHOTS when it is set.
 */
test.use({ viewport: { width: 390, height: 844 } });

const SHOTS = process.env.PLACES_SHOTS;
const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
};

const settle = (page: Page) =>
  page.evaluate(async () => {
    const r = await fetch('/api/dev/settle', {
      method: 'POST',
      headers: { 'x-runway': '1', 'content-type': 'application/json' },
      body: JSON.stringify({ market: 'accra' }),
    });
    return r.status;
  });

async function founder(page: Page) {
  await playAsGuest(page);
  await setupFounder(page, {
    name: 'Akosua Places',
    handle: `pl_${letters(8)}`,
    company: `Civic ${letters(5)}`,
    idea: 'Payments for market traders',
    market: /Accra/,
  });
  await expect(page.getByRole('application', { name: /Map of/ })).toBeVisible({ timeout: 30_000 });
}

/** The door of a place you can't go into: a sheet that says why. */
const door = (page: Page) => page.locator('.civic-door');

test('named buildings: walk in, get turned away by role, book a government appointment and attend', async ({
  page,
}) => {
  test.setTimeout(150_000);
  await founder(page);

  // The Chamber of Commerce: open to all, with something to do inside.
  const chamber = '[data-place="civic:accra:chamber"]';
  await expect(page.locator(chamber)).toBeAttached({ timeout: 20_000 });
  await tapPlace(page, chamber);
  const scene = page.locator('.place-scene');
  await expect(scene).toBeVisible({ timeout: 15_000 });
  await expect(scene.getByRole('heading', { name: 'Accra Chamber of Commerce' })).toBeVisible();
  const mixer = scene.locator('[data-action="civic:mixer"]');
  await expect(mixer).toBeEnabled();
  await shot(page, 'places-1-chamber');
  await mixer.click();
  await expect(page.getByText('A good mixer: you met people worth knowing.')).toBeVisible();
  await scene.getByRole('button', { name: 'Close' }).first().click();
  await expect(scene).toBeHidden();

  // The family office tower: not for a founder. The door says why, and what opens it.
  await tapPlace(page, '[data-place="civic:accra:family-office"]');
  await expect(door(page)).toBeVisible({ timeout: 15_000 });
  await expect(door(page)).toHaveAttribute('data-civic-closed', 'members');
  await expect(door(page).locator('[data-civic-why]')).toContainText('track record');
  await expect(door(page).locator('[data-civic-unlock]')).toContainText('investor career');
  await shot(page, 'places-2-refused');
  await door(page).getByRole('button', { name: 'Back to the street' }).click();
  await expect(door(page)).toBeHidden();

  // The Tax Office: by appointment. Request one; it comes back with a time.
  const tax = '[data-place="civic:accra:tax-office"]';
  await tapPlace(page, tax);
  await expect(door(page)).toHaveAttribute('data-civic-closed', 'appointment', {
    timeout: 15_000,
  });
  await door(page).locator('[data-book-appointment]').click();
  await expect(page.getByText(/Appointment booked at Tax Office: Day \d+/)).toBeVisible();
  // Not yet: the door now shows your appointment, later on the game clock.
  await expect(door(page)).toHaveAttribute('data-civic-closed', 'early');
  await expect(door(page).locator('[data-appointment="booked"]')).toContainText(
    /Your appointment: Day \d+/,
  );
  await shot(page, 'places-3-booked');
  await door(page).getByRole('button', { name: 'Back to the street' }).click();

  // The appointment lands in the inbox too.
  const state = await page.request.get('/api/state').then((r) => r.json());
  const inbox = (state.view?.inbox ?? []) as { text: string }[];
  expect(inbox.some((i) => /Appointment confirmed at Tax Office/.test(i.text))).toBe(true);

  // Later (a month on, from the dev tools): it's time. Go in and register for tax.
  expect(await settle(page)).toBe(200);
  await page.reload();
  await expect(page.getByRole('application', { name: /Map of/ })).toBeVisible({ timeout: 30_000 });
  await tapPlace(page, tax);
  await expect(scene).toBeVisible({ timeout: 15_000 });
  await expect(scene.getByRole('heading', { name: 'Tax Office' })).toBeVisible();
  const register = scene.locator('[data-action="civic:tax-registration"]');
  await expect(register).toBeEnabled();
  await register.click();
  await expect(page.getByText('Your company is registered for tax.')).toBeVisible();
  await shot(page, 'places-4-attended');
  await expect(register).toBeDisabled();
});

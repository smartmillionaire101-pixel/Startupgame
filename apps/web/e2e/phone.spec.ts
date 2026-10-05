import { expect, letters, playAsGuest, test, type Page } from './fixtures';

/**
 * Wave 5 §C: the phone. Chat with an AI character and get a reply from live
 * data; tap an alert and land on the screen it's about.
 */

/** A Lagos founder, created through the API so the spec doesn't depend on onboarding screens. */
async function founder(page: Page) {
  await playAsGuest(page);
  const handle = `ph_${letters(8)}`;
  const status = await page.evaluate(async (h) => {
    const r = await fetch('/api/commands', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-runway': '1' },
      body: JSON.stringify({
        command: {
          type: 'player.create',
          handle: h,
          name: 'Phoebe Phone',
          role: 'founder',
          backgroundId: 'f-engineer',
          market: 'lagos',
          gender: 'female',
          company: {
            name: `Ring ${h.slice(3)}`,
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
  await expect(page.getByRole('button', { name: /^Phone/ })).toBeVisible();
}

test('the phone: chat with an AI character, then follow an alert', async ({ page }) => {
  await founder(page);

  await page.getByRole('button', { name: /^Phone/ }).click();
  const phone = page.getByRole('dialog', { name: 'Phone' });
  await expect(phone).toBeVisible();
  await expect(phone.locator('[data-app]')).toHaveCount(6);

  // Messages → New message → a fund partner.
  await phone.locator('[data-app="messages"]').click();
  await phone.getByRole('button', { name: 'New message' }).click();
  await phone.locator('[data-group="partner"] [data-character]').first().click();
  await phone.getByRole('button', { name: 'What do you invest in?' }).click();
  // Their reply comes from the fund's real thesis and cheque sizes.
  await expect(phone.locator('.bubble:not(.mine)').first()).toContainText(/cheques of/, {
    timeout: 10_000,
  });
  await phone.getByRole('textbox', { name: 'Message' }).fill('Can we meet?');
  await phone.getByRole('button', { name: 'Send' }).click();
  await expect(phone.locator('.bubble:not(.mine)')).toHaveCount(2);

  // The thread shows in the list.
  await phone.getByRole('button', { name: 'Back' }).click();
  await expect(phone.getByRole('list', { name: 'Conversations' }).getByRole('button')).toHaveCount(
    1,
  );

  // Alerts: the reporter's welcome note opens the News tab.
  await phone.getByRole('button', { name: 'Back' }).click();
  await phone.locator('[data-app="alerts"]').click();
  await phone.locator('[data-alert="reporter"]').first().click();
  await expect(phone).toBeHidden();
  await expect(
    page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'News' }),
  ).toHaveAttribute('aria-current', 'page');
});

test('Home inbox items are tappable, and person cards chat with AI people', async ({ page }) => {
  await founder(page);
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('button', { name: 'Home' })
    .click();
  await page.locator('.inbox-item[data-alert="reporter"]').first().click();
  await expect(
    page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'News' }),
  ).toHaveAttribute('aria-current', 'page');

  // A fund partner in the city: Chat opens their thread in the phone.
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('button', { name: 'City' })
    .click();
  const partner = page.locator('[data-person^="ai:partner:"]').first();
  await expect(partner).toBeAttached();
  await partner.dispatchEvent('pointerdown', { pointerId: 3, clientX: 5, clientY: 5 });
  await partner.dispatchEvent('pointerup', { pointerId: 3, clientX: 5, clientY: 5 });
  await page.getByRole('dialog').getByRole('button', { name: 'Chat', exact: true }).click();
  const phone = page.getByRole('dialog', { name: 'Phone' });
  await expect(phone.locator('[data-thread^="fund:"]')).toBeVisible();
});

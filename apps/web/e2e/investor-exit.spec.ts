import { expect, letters, playAsGuest, setupPlayer, tab, test, type Page } from './fixtures';

/**
 * Player report: "I can't exit my position in the companies I invest in under
 * Capital." An investor backs a private AI company, opens the phone's Capital
 * app, finds the stake under Exit, picks how much to sell, confirms, and sees
 * the cash arrive and the realised gain or loss. EXIT_SHOTS=<dir> saves
 * screenshots.
 */

const SHOTS = process.env.EXIT_SHOTS;
const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
};

async function command(page: Page, cmd: unknown) {
  const r = await page.request.post('/api/commands', {
    headers: { 'x-runway': '1' },
    data: { command: cmd },
  });
  if (!r.ok()) throw new Error(`Command failed: ${await r.text()}`);
  return (await r.json()).result;
}

async function state(page: Page) {
  const r = await page.request.get('/api/state', { headers: { 'x-runway': '1' } });
  return (await r.json()).view;
}

interface Deal {
  companyId: string;
  name: string;
  instrument: 'priced' | 'safe';
  canInvest: boolean;
  maxCheck: number;
}

interface Stake {
  companyId: string;
  shares: number;
  safe: number;
  blocked: { code: string } | null;
}

test('an investor exits a private stake from Capital and sees the cash and the result', async ({
  page,
}) => {
  test.slow();
  const tag = letters(5);
  await playAsGuest(page);
  await setupPlayer(page, {
    type: 'player.quickStart',
    username: `exit_${tag}`,
    role: 'investor',
    name: `Ada${tag}`,
    market: 'lagos',
  });
  await expect(tab(page, 'Today')).toBeVisible({ timeout: 30_000 });

  // Back a young AI company (a SAFE: money in, shares at its next priced round).
  const deals = ((await state(page)).market.dealFlow as Deal[]).filter(
    (d) => d.instrument === 'safe' && d.canInvest,
  );
  expect(deals.length).toBeGreaterThan(0);
  let companyId = '';
  for (const d of deals) {
    const r = await command(page, {
      type: 'invest.quick',
      companyId: d.companyId,
      amount: Math.min(d.maxCheck, 2_000_000_00),
    });
    if (r.status === 'accepted') {
      companyId = d.companyId;
      break;
    }
  }
  expect(companyId).not.toBe('');
  const before = await state(page);
  const stake = (before.capital.stakes as Stake[]).find((s) => s.companyId === companyId)!;
  expect(stake.safe).toBeGreaterThan(0);
  expect(stake.blocked).toBeNull();
  const cashBefore = before.accounts.local.balance as number;

  // Capital opens on Exit: the stake is there with a real sell button.
  await page.reload();
  await page.getByRole('button', { name: /^Phone/ }).click();
  const phone = page.getByRole('dialog', { name: 'Phone' });
  await phone.locator('[data-app="capital"]').click();
  await expect(phone.locator('[data-phone-app="capital"]')).toBeVisible();
  await expect(phone.getByText('Your stakes in private companies')).toBeVisible();
  const row = phone.locator(`[data-stake="${companyId}"]`);
  await expect(row).toBeVisible();
  await expect(row.getByText('Into your personal account')).toBeVisible();
  await row.getByRole('radio', { name: '50%' }).click();
  await row.scrollIntoViewIfNeeded();
  await shot(page, 'exit-1-stake');

  // A clear confirm step, then the sale.
  await row.getByRole('button', { name: /^Sell 50% of my stake/ }).click();
  await expect(row.getByText(/This can’t be undone\./)).toBeVisible();
  await shot(page, 'exit-2-confirm');
  await row.getByRole('button', { name: 'Confirm sale' }).click();
  await expect(page.getByText(/^Sold .+ of .+: .+ is in your account\.$/)).toBeVisible();

  // The realised result is on screen; the cash is in the account; half the shares are left.
  const result = phone.locator('[data-exit-result]');
  await expect(result).toContainText('You sold');
  await expect(result).toContainText(/a (gain|loss) of/);
  await result.scrollIntoViewIfNeeded();
  await shot(page, 'exit-3-realised');
  const after = await state(page);
  expect(after.accounts.local.balance).toBeGreaterThan(cashBefore);
  expect(after.me.wealth.realised.proceeds).toBeGreaterThan(0);
  const left = (after.capital.stakes as Stake[]).find((s) => s.companyId === companyId)!;
  expect(left.safe).toBe(stake.safe - Math.floor(stake.safe / 2));
  await expect(phone.locator('[data-wealth="realised"]')).not.toContainText('₦0 received');
});

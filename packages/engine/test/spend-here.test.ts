import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { costIn } from '../src/ledger.js';
import { playerView } from '../src/views.js';
import type { World } from '../src/types.js';
import { addFounder, makeWorld, tryRun } from './helpers.js';

const F = 'u_founder';

/** A Lagos founder (a naira account) in Accra, with `balance` kobo. */
function inAccra(balance: number): World {
  return produce(addFounder(makeWorld(42, ['lagos', 'accra'])), (d) => {
    const p = d.players[F]!;
    p.location = { market: 'accra', since: 0 } as never;
    d.accounts[p.accounts.local]!.balance = balance;
  });
}

type SpendHere = { from: string; currency: string; rate: number } | null;
const spendHere = (w: World) => (playerView(w, F) as unknown as { spendHere: SpendHere }).spendHere;
const mallPrice = (w: World, id: string) =>
  (
    playerView(w, F)!.me as unknown as { mall: { items: { id: string; price: number }[] } }
  ).mall.items.find((i) => i.id === id)!.price;

describe('your money abroad (play-test: naira shown with a cedi sign)', () => {
  it('the view gives the rate a purchase here charges at; none at home', () => {
    const home = addFounder(makeWorld(42, ['lagos', 'accra']));
    expect(spendHere(home)).toBeNull();
    const w = inAccra(100_000_000);
    const s = spendHere(w)!;
    expect(s).toMatchObject({ from: 'NGN', currency: 'GHS' });
    // The rate a buyer's check uses: price ↔ cost, exactly as the ledger charges.
    for (const price of [1, 999, 12_345, 4_500_000])
      expect(Math.ceil(price / s.rate) + 1).toBe(costIn(w, price, 'GHS', 'NGN'));
  });

  it('the mall accepts a buy exactly when the converted balance covers it', () => {
    const probe = inAccra(0);
    const price = mallPrice(probe, 'local-plate');
    const need = costIn(probe, price, 'GHS', 'NGN');
    const rate = spendHere(probe)!.rate;
    // One kobo short: refused (and the converted balance says so); enough: bought.
    const short = inAccra(need - 1);
    expect(Math.floor((need - 2) * rate)).toBeLessThan(price);
    expect(tryRun(short, F, { type: 'mall.buy', itemId: 'local-plate' }).ok).toBe(false);
    const enough = inAccra(need);
    expect(Math.floor((need - 1) * rate)).toBeGreaterThanOrEqual(price);
    const r = tryRun(enough, F, { type: 'mall.buy', itemId: 'local-plate' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.world.accounts[r.world.players[F]!.accounts.local]!.balance).toBe(0);
  });
});

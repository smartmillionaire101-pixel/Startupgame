/**
 * Test helper for the bankers note: take a banker's forming bank through the
 * whole licence process (sign with every offer, the Central Bank interview at
 * its slot, the checklist with the best picks) and the review months.
 */
import { MONTH_MIN, gameMinute } from '../src/places.js';
import { playerView } from '../src/views.js';
import type { MarketId } from '../src/data/markets.js';
import type { Bank, World } from '../src/types.js';
import { DAY, T0, run, settle } from './helpers.js';

const MS_PER_MIN = DAY / MONTH_MIN;

const bankOwnedBy = (w: World, owner: string): Bank =>
  Object.values(w.banks).find((b) => b.ownerId === owner)!;

/** Sign, interview, file the checklist and settle until the regulator decides. */
export function licenseBank(w: World, owner: string, market: MarketId = 'lagos'): World {
  let b = bankOwnedBy(w, owner);
  if (b.status === 'forming') {
    w = run(w, owner, { type: 'bank.terms', bankId: b.id, chosen: ['g1', 'g2', 'g3'] }).world;
    w = run(w, owner, { type: 'bank.sign', bankId: b.id }).world;
  }
  b = bankOwnedBy(w, owner);
  const booked = run(w, owner, { type: 'place.book', placeId: `${market}:central-bank` });
  const slot = booked.result.appointment.at as number;
  const at = T0 + (slot + 10 - gameMinute(w.markets[market]!, T0)) * MS_PER_MIN;
  w = run(
    booked.world,
    owner,
    { type: 'bank.interview', bankId: b.id, answers: [1, 0, 2, 1] },
    at,
  ).world;
  const v = playerView(w, owner)!.banker!.bank!.licence!;
  w = run(w, owner, { type: 'bank.plan', bankId: b.id, ...v.suggestedPlan }).world;
  for (const role of ['ceo', 'cro', 'compliance', 'aml'] as const) {
    const pick = [...v.candidates[role].filter((c) => c.id !== 'self')].sort(
      (x, y) => y.quality - x.quality,
    )[0]!;
    w = run(w, owner, { type: 'bank.hire', bankId: b.id, role, candidateId: pick.id }).world;
  }
  w = run(w, owner, {
    type: 'bank.setup',
    bankId: b.id,
    system: 'premium',
    district: v.districts[0]!.id,
  }).world;
  return settle(w, market, 2, T0 + DAY);
}

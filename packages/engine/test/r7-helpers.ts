/** Round 7 test helpers: a London founder in any industry, and a sales conversation won. */
import { produce } from 'immer';
import type { Industry } from '../src/data/industries.js';
import { FEEDBACK_NOTE, GAMEPLAY_NOTE } from '../src/releases.js';
import type { World } from '../src/types.js';
import { companyOf, makeWorld, run } from './helpers.js';

export const F = 'u_founder';
const announce = (w: World, id: string) =>
  run(w, null, { type: 'system.announce', id, text: 'Update.' }).world;

/** A founder in London with a company in `industry` (feedback note, and the gameplay note when `on`). */
export function founder(industry: Industry, on = true, seed = 7, idea = 'Telehealth for families') {
  let w = makeWorld(seed, ['london']);
  w = announce(w, FEEDBACK_NOTE);
  if (on) w = announce(w, GAMEPLAY_NOTE);
  return run(w, F, {
    type: 'player.create',
    handle: 'h_obi',
    name: 'Obi Founder',
    role: 'founder',
    backgroundId: 'f-engineer',
    market: 'london',
    company: {
      name: 'Obi and Sidi',
      industry,
      revenueModel: 'subscription',
      idea,
      incorporation: 'local',
    },
  }).world;
}

const co = (w: World) => companyOf(w, F);

/** Talk a deal through with the best calls; the customer tuned to say yes. */
export function talkWin(w: World, id: string, tune = true) {
  if (co(w).deals!.find((d) => d.id === id)!.stage === 'lead')
    w = run(w, F, { type: 'sales.advance', dealId: id, action: 'contact' }).world;
  if (tune)
    w = produce(w, (x) => {
      const d = companyOf(x, F).deals!.find((y) => y.id === id)!;
      Object.assign(d.customer, { trust: 1, authority: 1, urgency: 1, current: 'nothing' });
    });
  const talk = (action: string, extra: Record<string, unknown> = {}) =>
    run(w, F, { type: 'sales.talk', dealId: id, action, ...extra } as never);
  w = talk('start').world;
  const d = co(w).deals!.find((y) => y.id === id)!;
  w = talk('lead', { option: d.customer.need }).world;
  w = talk('price', { option: 'mid', discountPct: 0 }).world;
  const best = d.talk!.termsOptions!.map((o) => ({
    o,
    p: talk('terms', { option: o }).result.chance,
  }));
  best.sort((a, b) => b.p - a.p);
  w = talk('terms', { option: best[0]!.o }).world;
  return talk('ask');
}

/**
 * Banker work (bankwork.ts, data/bankwork.ts): the advisory desk (a new
 * banker always finds mandates; a mandate is a few scored calls; a closed
 * deal pays a success fee through the ledger to the banker, or to their bank
 * once licensed; reputation and a track record follow), conversations at AI
 * banks and institutions (lessons, recruits, clients, an interbank credit
 * line, a supervisor, monthly caps), and the release switch.
 */
import { describe, expect, it } from 'vitest';
import { advisoryRecord, bankOf, mandateOffers } from '../src/bankwork.js';
import { bankerCredibility } from '../src/bankers.js';
import { bankFigures } from '../src/banks.js';
import { FIT, MANDATES, STEPS, type MandateKind } from '../src/data/bankwork.js';
import { BANKERS_NOTE, MORE_GAMES_NOTE, RELEASES, bankersOn } from '../src/releases.js';
import { playerView } from '../src/views.js';
import type { World } from '../src/types.js';
import { licenseBank } from './bank-licence.js';
import { DAY, T0, addFounder, makeWorld, moneyByCurrency, run, settle, tryRun } from './helpers.js';

const B = 'u_banker';
const announce = (w: World, id: string = BANKERS_NOTE) =>
  run(w, null, { type: 'system.announce', id, text: 'Bankers.' }).world;

const addBanker = (
  w: World,
  id = B,
  bankType: 'commercial' | 'microfinance' | 'venture-debt' | 'investment' = 'commercial',
) =>
  run(w, id, {
    type: 'player.create',
    handle: `h_${id}`.slice(0, 20),
    name: 'Bea Banker',
    role: 'banker',
    backgroundId: 'b-wealthy',
    market: 'lagos',
    bank: { name: `Trust Bank ${id.slice(-3)}`, bankType },
  }).world;

const bankerWorld = (seed = 11) => addBanker(announce(makeWorld(seed, ['lagos'])));
const me = (w: World, id = B) => w.players[id]!;
const view = (w: World, id = B) => playerView(w, id, { now: T0, monthMs: DAY })!;

/** The best call at each step for a mandate (what a careful banker would pick). */
function bestChoices(w: World, id: string, mandateId: string) {
  const md = me(w, id).bankwork!.active.find((x) => x.id === mandateId)!;
  const out: Record<string, string> = {};
  for (const step of MANDATES[md.kind].steps) {
    if (step === 'lender') {
      // The view lists the lenders; the best fit for a strong borrower is high-street etc.
      const v = view(w, id).bankWork!;
      const a = v.banker ? v.active.find((x) => x.id === mandateId)! : null;
      const opts = a!.steps.find((s) => s.id === 'lender')!.options;
      out[step] = opts[0]!.id;
      continue;
    }
    const table = FIT[step] ?? {};
    const fit = (o: string) => {
      const f = table[o] ?? {};
      if (step === 'buyers' && md.band === 'stretched') return f.stretched ?? 0;
      return (step === 'structure' || step === 'buyers' ? f[md.shape] : f[md.band]) ?? 0;
    };
    out[step] = [...STEPS[step].options].sort((a, b) => fit(b.id) - fit(a.id))[0]!.id;
  }
  return out;
}

/** The worst call at each step. */
function worstChoices(w: World, id: string, mandateId: string) {
  const md = me(w, id).bankwork!.active.find((x) => x.id === mandateId)!;
  const out: Record<string, string> = {};
  for (const step of MANDATES[md.kind].steps) {
    if (step === 'lender') {
      out[step] = md.lenders![md.lenders!.length - 1]!.id;
      continue;
    }
    const table = FIT[step] ?? {};
    const fit = (o: string) => {
      const f = table[o] ?? {};
      if (step === 'buyers' && md.band === 'stretched') return f.stretched ?? 0;
      return (step === 'structure' || step === 'buyers' ? f[md.shape] : f[md.band]) ?? 0;
    };
    out[step] = [...STEPS[step].options].sort((a, b) => fit(a.id) - fit(b.id))[0]!.id;
  }
  return out;
}

const take = (w: World, mandateId: string, id = B) =>
  run(w, id, { type: 'banker.mandate', action: 'take', mandateId });
const complete = (w: World, mandateId: string, choices: Record<string, string>, id = B) =>
  run(w, id, { type: 'banker.mandate', action: 'complete', mandateId, choices });

describe('banker work: the release switch', () => {
  it('logs the bankers note after more games, and old worlds play exactly as before', () => {
    expect(RELEASES.indexOf(BANKERS_NOTE)).toBe(RELEASES.indexOf(MORE_GAMES_NOTE) + 1);
    const old = addBanker(announce(makeWorld(11, ['lagos']), MORE_GAMES_NOTE));
    expect(bankersOn(old)).toBe(false);
    expect(view(old).bankWork).toBeNull();
    expect(mandateOffers(old, me(old))).toEqual([]);
    for (const cmd of [
      { type: 'banker.mandate', action: 'take', mandateId: 'md:0:k:0:debt' },
      { type: 'banker.talk', at: 'place:lagos:chamber', topic: 'owners' },
      { type: 'banker.line', action: 'draw', amount: 100 },
    ] as const) {
      const r = tryRun(old, B, cmd);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe('command.unknown');
    }
    // The Founders' Hub stays shut to bankers without the note.
    const hub = view(old).market.cityPlaces!.places.find((p) => p.role === 'tech-hub')!;
    expect(hub.open).toBe(false);
  });

  it('settling an old world with a banker is unchanged by the new code', () => {
    const a = settle(addBanker(announce(makeWorld(5, ['lagos']), MORE_GAMES_NOTE)), 'lagos', 2);
    const b = settle(addBanker(announce(makeWorld(5, ['lagos']), MORE_GAMES_NOTE)), 'lagos', 2);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.players[B]!.bankwork).toBeUndefined();
  });
});

describe('banker work: the advisory desk', () => {
  it('a new banker sees at least two mandates, one of them a debt raise', () => {
    for (const seed of [1, 2, 3, 11, 42]) {
      const w = bankerWorld(seed);
      const v = view(w).bankWork!;
      expect(v.banker).toBe(true);
      if (!v.banker) continue;
      expect(v.offers.length).toBeGreaterThanOrEqual(2);
      expect(v.offers.some((o) => o.kind === 'debt')).toBe(true);
      for (const o of v.offers) {
        expect(o.estFee).toBeGreaterThan(0);
        expect(o.client.name.length).toBeGreaterThan(2);
      }
      // Deterministic: the same world gives the same desk.
      expect(mandateOffers(w, me(w)).map((o) => o.id)).toEqual(v.offers.map((o) => o.id));
    }
  });

  it('completes a mandate: fee through the ledger to the banker, money conserved, record kept', () => {
    let w = bankerWorld();
    const offer = view(w).bankWork!;
    if (!offer.banker) throw new Error('not a banker');
    const o = offer.offers.find((x) => x.kind === 'debt')!;
    w = take(w, o.id).world;
    expect(me(w).bankwork!.active).toHaveLength(1);
    // Taken mandates leave the desk.
    expect(mandateOffers(w, me(w)).some((x) => x.id === o.id)).toBe(false);
    const before = moneyByCurrency(w);
    const cash = w.accounts[me(w).accounts.local]!.balance;
    const hours = me(w).hours.used;
    const stars = me(w).stars.value;
    const r = complete(w, o.id, bestChoices(w, B, o.id));
    w = r.world;
    expect(r.result.deal.closed).toBe(true);
    expect(r.result.deal.quality).toBeGreaterThanOrEqual(0.8);
    expect(r.result.deal.paidTo).toBe('personal');
    const fee = r.result.deal.fee as number;
    expect(fee).toBeGreaterThan(0);
    // Fee in, income tax out.
    const tax = Math.round(fee * w.markets.lagos!.data.tax.personalIncome);
    expect(w.accounts[me(w).accounts.local]!.balance - cash).toBe(fee - tax);
    expect(moneyByCurrency(w)).toEqual(before);
    expect(me(w).hours.used - hours).toBe(MANDATES.debt.hours);
    expect(me(w).stars.value).toBeGreaterThan(stars);
    const rec = advisoryRecord(w, me(w));
    expect(rec).toMatchObject({ deals: 1, lost: 0, fees: fee, byKind: { debt: 1 } });
    expect(rec.avgQuality).toBeGreaterThanOrEqual(0.8);
    expect(me(w).bankwork!.active).toHaveLength(0);
    // The desk still has work after the first deal.
    expect(mandateOffers(w, me(w)).length).toBeGreaterThanOrEqual(2);
  });

  it('a closed advisory deal raises how investors and the regulator see you', () => {
    let w = bankerWorld();
    const before = bankerCredibility(w, me(w));
    const v = view(w).bankWork!;
    if (!v.banker) throw new Error('not a banker');
    const o = v.offers.find((x) => x.kind === 'debt')!;
    w = take(w, o.id).world;
    w = complete(w, o.id, bestChoices(w, B, o.id)).world;
    expect(bankerCredibility(w, me(w))).toBeGreaterThan(before);
  });

  it('quality drives the fee and reputation: careless work loses the client', () => {
    let good = bankerWorld(3);
    let bad = bankerWorld(3);
    const v = view(good).bankWork!;
    if (!v.banker) throw new Error('not a banker');
    const o = v.offers[0]!;
    good = take(good, o.id).world;
    bad = take(bad, o.id).world;
    const s0 = me(bad).stars.value;
    const g = complete(good, o.id, bestChoices(good, B, o.id));
    const b = complete(bad, o.id, worstChoices(bad, B, o.id));
    expect(g.result.deal.quality).toBeGreaterThan(b.result.deal.quality);
    expect(b.result.deal.closed).toBe(false);
    expect(b.result.deal.fee).toBe(0);
    expect(me(b.world).stars.value).toBeLessThan(s0);
    expect(advisoryRecord(b.world, me(b.world))).toMatchObject({ deals: 0, lost: 1, fees: 0 });
    // Each pick says what the best call was, and why.
    const vb = view(b.world).bankWork!;
    if (!vb.banker) throw new Error('not a banker');
    expect(vb.history[0]!.picks.every((p) => p.bestLabel.length > 0)).toBe(true);
  });

  it('a higher quality closed deal pays a bigger fee than an adequate one', () => {
    const kinds: MandateKind[] = ['debt', 'bond', 'sale', 'ipo'];
    expect(kinds.every((k) => MANDATES[k].steps.length >= 3)).toBe(true);
    let a = bankerWorld(42);
    let b = bankerWorld(42);
    const v = view(a).bankWork!;
    if (!v.banker) throw new Error('not a banker');
    const o = v.offers.find((x) => x.kind !== 'debt') ?? v.offers[0]!;
    a = take(a, o.id).world;
    b = take(b, o.id).world;
    const best = bestChoices(a, B, o.id);
    const ra = complete(a, o.id, best);
    // One step a notch off the best: still closes, smaller fee.
    const md = me(b).bankwork!.active[0]!;
    const steps = MANDATES[md.kind].steps.filter(
      (s) => s !== 'lender' && s !== 'size' && s !== 'price',
    );
    const worst = worstChoices(b, B, o.id);
    const mixed = { ...best, [steps[0]!]: worst[steps[0]!]! };
    const rb = complete(b, o.id, mixed);
    expect(ra.result.deal.quality).toBeGreaterThan(rb.result.deal.quality);
    if (rb.result.deal.closed)
      expect(ra.result.deal.fee).toBeGreaterThanOrEqual(rb.result.deal.fee);
  });

  it('pays the fee to the banker’s bank once it is licensed', () => {
    let w = bankerWorld(7);
    w = licenseBank(w, B);
    const bank = bankOf(w, me(w))!;
    expect(bank.status).toBe('licensed');
    const v = view(w).bankWork!;
    if (!v.banker) throw new Error('not a banker');
    expect(v.feeTo).toBe('bank');
    const o = v.offers[0]!;
    w = take(w, o.id).world;
    const before = moneyByCurrency(w);
    const bankCash = w.accounts[bank.account]!.balance;
    const personal = w.accounts[me(w).accounts.local]!.balance;
    const r = complete(w, o.id, bestChoices(w, B, o.id));
    w = r.world;
    expect(r.result.deal.paidTo).toBe('bank');
    expect(w.accounts[bank.account]!.balance - bankCash).toBe(r.result.deal.fee);
    expect(w.accounts[me(w).accounts.local]!.balance).toBe(personal);
    expect(w.banks[bank.id]!.advised).toBe(1);
    expect(w.banks[bank.id]!.thisMonth.fees).toBe(r.result.deal.fee);
    expect(moneyByCurrency(w)).toEqual(before);
  });

  it('a founder asks for an adviser; the banker takes it and the company pays', () => {
    let w = addFounder(bankerWorld(9));
    const c = Object.values(w.companies).find((x) => x.founderIds.includes('u_founder'))!;
    w = run(w, 'u_founder', { type: 'banker.request', companyId: c.id, kind: 'sale' }).world;
    expect(w.inbox[B]!.some((i) => /looking for an adviser/.test(i.text))).toBe(true);
    const v = view(w).bankWork!;
    if (!v.banker) throw new Error('not a banker');
    const o = v.offers.find((x) => x.requested)!;
    expect(o.client.refId).toBe(c.id);
    w = take(w, o.id).world;
    expect(w.players.u_founder!.bankwork!.requests![0]!.status).toBe('taken');
    const before = moneyByCurrency(w);
    const r = complete(w, o.id, bestChoices(w, B, o.id));
    expect(moneyByCurrency(r.world)).toEqual(before);
    expect(r.world.players.u_founder!.bankwork!.requests![0]!.status).toBe('done');
    const fv = view(r.world, 'u_founder').bankWork!;
    expect(fv.banker).toBe(false);
    expect(fv.requests[0]!.banker).toBe('Bea Banker');
  });

  it('refuses a mandate not on the desk, and caps how many you hold', () => {
    let w = bankerWorld(4);
    expect(
      tryRun(w, B, { type: 'banker.mandate', action: 'take', mandateId: 'md:9:x:debt' }).ok,
    ).toBe(false);
    const v = view(w).bankWork!;
    if (!v.banker) throw new Error('not a banker');
    for (const o of v.offers.slice(0, 3)) w = take(w, o.id).world;
    const more = mandateOffers(w, me(w))[0];
    if (more)
      expect(tryRun(w, B, { type: 'banker.mandate', action: 'take', mandateId: more.id }).ok).toBe(
        false,
      );
    // Dropping frees a slot.
    w = run(w, B, {
      type: 'banker.mandate',
      action: 'drop',
      mandateId: me(w).bankwork!.active[0]!.id,
    }).world;
    expect(me(w).bankwork!.active).toHaveLength(2);
  });
});

describe('banker work: conversations at banks and institutions', () => {
  const lenderAt = (w: World) => `lender:${Object.keys(w.markets.lagos!.lenders)[0]}`;

  it('an AI bank’s people teach lessons, become contacts, and are capped per month', () => {
    let w = bankerWorld();
    const at = lenderAt(w);
    const finance = me(w).skills.finance;
    const r = run(w, B, { type: 'banker.talk', at, topic: 'ceo' });
    w = r.world;
    expect(r.result.lesson.learned).toBe(true);
    expect(r.result.lesson.text.length).toBeGreaterThan(20);
    expect(me(w).skills.finance).toBeGreaterThan(finance);
    expect(me(w).bankwork!.lessons).toHaveLength(1);
    expect(me(w).contacts!.some((c) => c.refId === `${at}:ceo`)).toBe(true);
    // Once a month per person.
    const again = tryRun(w, B, { type: 'banker.talk', at, topic: 'ceo' });
    expect(again.ok).toBe(false);
    w = run(w, B, { type: 'banker.talk', at, topic: 'risk' }).world;
    w = run(w, B, { type: 'banker.talk', at, topic: 'poach' }).world;
    expect(me(w).bankwork!.recruits).toHaveLength(1);
    expect(me(w).bankwork!.recruits[0]!.salary).toBeGreaterThan(0);
    // A new month, the same person again.
    w = settle(w, 'lagos', 1, T0 + DAY);
    expect(tryRun(w, B, { type: 'banker.talk', at, topic: 'ceo' }, T0 + 2 * DAY).ok).toBe(true);
  });

  it('caps conversations per month in all', () => {
    let w = bankerWorld(12);
    const ats = Object.keys(w.markets.lagos!.lenders).map((id) => `lender:${id}`);
    let ok = 0;
    for (const at of ats)
      for (const topic of ['ceo', 'treasurer', 'risk', 'poach'] as const) {
        const r = tryRun(w, B, { type: 'banker.talk', at, topic });
        if (r.ok) {
          w = r.world;
          ok++;
        }
      }
    expect(ok).toBeLessThanOrEqual(8);
    expect(me(w).bankwork!.talkMonth.n).toBe(ok);
  });

  it('the Central Bank supervisor explains the rules and checks your standing (by appointment)', () => {
    let w = bankerWorld();
    const at = 'place:lagos:central-bank';
    expect(tryRun(w, B, { type: 'banker.talk', at, topic: 'supervisor' }).ok).toBe(false);
    const booked = run(w, B, { type: 'place.book', placeId: 'lagos:central-bank' });
    w = booked.world;
    const later = T0 + DAY * 0.9;
    const r = run(w, B, { type: 'banker.talk', at, topic: 'supervisor' }, later);
    expect(r.result.rules.baseRateBps).toBe(w.markets.lagos!.data.baseRateBps);
    expect(r.result.rules.minCapital.length).toBe(4);
    expect(r.result.lesson).toBeTruthy();
    const s = run(r.world, B, { type: 'banker.talk', at, topic: 'standing' }, later);
    // A banker's bank waits in negotiation (bankers.ts) until signed.
    expect(s.result.standing.status).toBe('forming');
    expect(s.result.standing.notes.length).toBeGreaterThan(0);
  });

  it('owners at the Chamber become clients and leads; on licence they bank with you', () => {
    let w = bankerWorld(21);
    const r = run(w, B, { type: 'banker.talk', at: 'place:lagos:chamber', topic: 'owners' });
    w = r.world;
    expect(r.result.clients.length).toBe(2);
    const clients = me(w).bankwork!.clients;
    expect(clients).toHaveLength(2);
    expect(clients.every((c) => c.joined === undefined)).toBe(true);
    // The lead lands on the advisory desk.
    const lead = me(w).bankwork!.leads[0];
    if (lead)
      expect(mandateOffers(w, me(w)).some((o) => o.lead && o.client.key === lead.key)).toBe(true);
    // Founders at the Hub (bankers may go in under the note).
    const hub = view(w).market.cityPlaces!.places.find((p) => p.role === 'tech-hub')!;
    expect(hub.open).toBe(true);
    w = run(w, B, { type: 'banker.talk', at: 'place:lagos:tech-hub', topic: 'founders' }).world;
    expect(me(w).bankwork!.clients.length).toBe(4);
    const before = moneyByCurrency(w);
    w = licenseBank(w, B);
    const bank = bankOf(w, me(w))!;
    expect(bank.status).toBe('licensed');
    const joined = me(w).bankwork!.clients.filter((c) => c.joined !== undefined);
    expect(joined.length).toBeGreaterThan(0);
    for (const c of joined.filter((x) => x.wants === 'deposit')) {
      const acc =
        c.kind === 'business'
          ? w.markets.lagos!.businesses![c.refId]!.account
          : w.companies[c.refId]!.account;
      expect(w.accounts[acc]!.bankId).toBe(bank.id);
    }
    // Settlement moves money between accounts only.
    expect(Object.keys(moneyByCurrency(w))).toEqual(Object.keys(before));
  });

  it('the treasurer arranges an interbank line the bank draws when short, priced through the ledger', () => {
    let w = bankerWorld(7);
    const at = lenderAt(w);
    // Not before a licence.
    expect(tryRun(w, B, { type: 'banker.talk', at, topic: 'line' }).ok).toBe(false);
    w = licenseBank(w, B);
    const now = T0 + 3 * DAY;
    const r = run(w, B, { type: 'banker.talk', at, topic: 'line' }, now);
    w = r.world;
    const line = me(w).bankwork!.line!;
    expect(line.limit).toBeGreaterThan(0);
    const bank = bankOf(w, me(w))!;
    const eq0 = bankFigures(w, bank).equity;
    const total = moneyByCurrency(w);
    const cash0 = w.accounts[bank.account]!.balance;
    const amount = Math.floor(line.limit / 2);
    const d = run(w, B, { type: 'banker.line', action: 'draw', amount }, now);
    w = d.world;
    const interest = d.result.interest as number;
    expect(interest).toBeGreaterThan(0);
    expect(w.accounts[bank.account]!.balance - cash0).toBe(amount - interest);
    // Drawn money is owed: capital falls only by the interest.
    expect(bankFigures(w, w.banks[bank.id]!).equity).toBe(eq0 - interest);
    expect(bankFigures(w, w.banks[bank.id]!).interbank).toBe(amount);
    expect(moneyByCurrency(w)).toEqual(total);
    expect(tryRun(w, B, { type: 'banker.line', action: 'draw', amount: line.limit }, now).ok).toBe(
      false,
    );
    // Month end charges interest on what's drawn.
    const before = w.accounts[w.banks[bank.id]!.account]!.balance;
    w = settle(w, 'lagos', 1, now);
    expect(me(w).bankwork!.line!.paidMonth).toBe(w.markets.lagos!.month);
    expect(before).not.toBe(w.accounts[w.banks[bank.id]!.account]!.balance);
    const rp = run(w, B, { type: 'banker.line', action: 'repay', amount }, now + DAY);
    expect(rp.world.players[B]!.bankwork!.line!.outstanding).toBe(0);
  });

  it('the listing desk sets out what listing the bank takes', () => {
    const w = bankerWorld();
    const r = run(w, B, {
      type: 'banker.talk',
      at: 'place:lagos:stock-exchange',
      topic: 'listing',
    });
    expect(r.result.listing.checks.map((c: { id: string }) => c.id)).toEqual([
      'licensed',
      'capital',
      'stars',
    ]);
    const v = view(r.world).bankWork!;
    if (!v.banker) throw new Error('not a banker');
    expect(v.listing).not.toBeNull();
    expect(v.venues.some((x) => x.at === 'place:lagos:chamber')).toBe(true);
  });

  it('conversations are deterministic', () => {
    const a = run(bankerWorld(31), B, {
      type: 'banker.talk',
      at: 'place:lagos:chamber',
      topic: 'owners',
    });
    const b = run(bankerWorld(31), B, {
      type: 'banker.talk',
      at: 'place:lagos:chamber',
      topic: 'owners',
    });
    expect(JSON.stringify(a.world)).toBe(JSON.stringify(b.world));
  });
});

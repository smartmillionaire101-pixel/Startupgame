import { describe, it } from 'vitest';
import fc from 'fast-check';
import { dispatch } from '../src/dispatch.js';
import type { Command } from '../src/commands.js';
import {
  addFounder,
  addInvestor,
  companyOf,
  DAY,
  makeWorld,
  moneyByCurrency,
  negativeInternalAccounts,
  T0,
} from './helpers.js';

/**
 * Property: whatever sequence of (valid or invalid) player actions and
 * settlements happens, money is conserved per currency, no real account is
 * overdrawn, and stars stay within 0–5.
 */
describe('world invariants under random play', () => {
  it('holds for random command sequences', () => {
    let base = addFounder(makeWorld(5, ['lagos']));
    base = addInvestor(base, 'u_inv', 'lagos');
    const cid = companyOf(base, 'u_founder').id;
    const total = moneyByCurrency(base);

    const action = fc.oneof(
      fc.record({ k: fc.constant('settle' as const) }),
      fc.record({ k: fc.constant('build' as const), hours: fc.integer({ min: 10, max: 80 }) }),
      fc.record({
        k: fc.constant('market' as const),
        budget: fc.integer({ min: 0, max: 5_000_000_00 }),
      }),
      fc.record({
        k: fc.constant('price' as const),
        price: fc.integer({ min: 1, max: 50_000_00 }),
      }),
      fc.record({
        k: fc.constant('hire' as const),
        pick: fc.nat(30),
        mult: fc.double({ min: 0.5, max: 2, noNaN: true }),
      }),
      fc.record({
        k: fc.constant('salary' as const),
        salary: fc.integer({ min: 0, max: 2_000_000_00 }),
      }),
      fc.record({ k: fc.constant('gig' as const) }),
      fc.record({ k: fc.constant('lifestyle' as const), tier: fc.integer({ min: 1, max: 5 }) }),
      fc.record({ k: fc.constant('cut' as const) }),
      fc.record({ k: fc.constant('hibernate' as const), on: fc.boolean() }),
      fc.record({
        k: fc.constant('bridge' as const),
        amount: fc.integer({ min: 1_000_00, max: 5_000_000_00 }),
      }),
      fc.record({ k: fc.constant('fireSale' as const) }),
      fc.record({ k: fc.constant('acceptDeal' as const) }),
      fc.record({
        k: fc.constant('invest' as const),
        pick: fc.nat(10),
        amount: fc.integer({ min: 1_000_00, max: 10_000_000_00 }),
      }),
      // Named lenders (Wave 1): company and founder products, then accept what comes back.
      fc.record({
        k: fc.constant('borrow' as const),
        pick: fc.nat(20),
        amount: fc.integer({ min: 10_000_00, max: 50_000_000_00 }),
        months: fc.integer({ min: 3, max: 60 }),
        guarantee: fc.boolean(),
      }),
      fc.record({ k: fc.constant('accept' as const) }),
      // City events (Wave 2): hosting, RSVPs (and un-RSVPs) and cancelling.
      fc.record({
        k: fc.constant('host' as const),
        investor: fc.boolean(),
        kind: fc.constantFrom(
          'founder-meetup',
          'investor-breakfast',
          'demo-day',
          'customer-mixer',
          'talent-night',
        ),
        venue: fc.constantFrom('hall', 'hub', 'office'),
        budget: fc.integer({ min: 0, max: 200_000_000 }),
        ticket: fc.integer({ min: 0, max: 20_000_000 }),
        ahead: fc.integer({ min: 0, max: 2 }),
      }),
      fc.record({ k: fc.constant('rsvp' as const), investor: fc.boolean(), going: fc.boolean() }),
      fc.record({ k: fc.constant('cancel' as const), investor: fc.boolean() }),
      // AI angels (Wave 3): pitching one marks the company as raising, so angels send SAFE offers.
      fc.record({
        k: fc.constant('pitchAngel' as const),
        pick: fc.nat(10),
        ask: fc.integer({ min: 1_000_000_00, max: 50_000_000_00 }),
      }),
      // The city economy (Wave 3): pitching businesses, gigs, venue buys and meetings.
      fc.record({ k: fc.constant('bizPitch' as const), pick: fc.nat(40) }),
      fc.record({
        k: fc.constant('bizGig' as const),
        pick: fc.nat(40),
        gig: fc.nat(3),
        investor: fc.boolean(),
      }),
      fc.record({
        k: fc.constant('venue' as const),
        pick: fc.nat(40),
        item: fc.nat(3),
        with: fc.constantFrom('none', 'player', 'fund', 'angel'),
        investor: fc.boolean(),
      }),
      fc.record({
        k: fc.constant('venueHost' as const),
        pick: fc.nat(40),
        budget: fc.integer({ min: 0, max: 50_000_000 }),
      }),
    );

    fc.assert(
      fc.property(fc.array(action, { minLength: 1, maxLength: 25 }), (actions) => {
        let w = base;
        let day = 0;
        for (const a of actions) {
          let actor: string | null = 'u_founder';
          let cmd: Command;
          switch (a.k) {
            case 'settle': {
              actor = null;
              day++;
              const d = new Date(`${w.markets.lagos!.lastSettledDate}T00:00:00Z`);
              d.setUTCDate(d.getUTCDate() + 1);
              cmd = { type: 'market.settle', market: 'lagos', date: d.toISOString().slice(0, 10) };
              break;
            }
            case 'build':
              cmd = { type: 'company.build', companyId: cid, hours: a.hours };
              break;
            case 'market':
              cmd = { type: 'company.strategy', companyId: cid, marketingBudget: a.budget };
              break;
            case 'price':
              cmd = { type: 'company.strategy', companyId: cid, price: a.price };
              break;
            case 'salary':
              cmd = { type: 'company.strategy', companyId: cid, founderSalary: a.salary };
              break;
            case 'hire': {
              const cand = w.markets.lagos!.talent[a.pick % w.markets.lagos!.talent.length]!;
              cmd = {
                type: 'company.offer',
                companyId: cid,
                candidateId: cand.id,
                salary: Math.round(cand.ask * a.mult),
                equityBps: 0,
              };
              break;
            }
            case 'gig':
              actor = 'u_inv';
              cmd = { type: 'player.gig' };
              break;
            case 'lifestyle':
              cmd = { type: 'player.lifestyle', tier: a.tier };
              break;
            case 'cut':
              cmd = { type: 'company.cutCosts', companyId: cid };
              break;
            case 'hibernate':
              cmd = { type: 'company.hibernate', companyId: cid, on: a.on };
              break;
            case 'bridge':
              cmd = { type: 'company.bridge', companyId: cid, amount: a.amount };
              break;
            case 'fireSale':
              cmd = { type: 'company.fireSale', companyId: cid };
              break;
            case 'acceptDeal': {
              const d = Object.values(w.deals).find(
                (x) =>
                  x.status === 'open' && x.awaiting.kind === 'company' && x.awaiting.id === cid,
              );
              cmd = { type: 'deal.act', dealId: d?.id ?? 'none', action: 'accept' };
              break;
            }
            case 'invest': {
              actor = 'u_inv';
              const targets = Object.values(w.companies).filter(
                (c) => c.ai && c.status === 'active',
              );
              const t = targets[a.pick % targets.length]!;
              cmd = {
                type: 'invest.propose',
                companyId: t.id,
                instrument: 'safe',
                amount: a.amount,
                valuation: a.amount * 10,
                proRata: false,
                boardSeat: false,
                vetoOnSale: false,
              };
              break;
            }
            case 'borrow': {
              const products = Object.values(w.markets.lagos!.lenders).flatMap((l) =>
                l.products.map((p) => ({ lenderId: l.id, p })),
              );
              const { lenderId, p } = products[a.pick % products.length]!;
              cmd =
                p.borrower === 'founder'
                  ? {
                      type: 'player.loan',
                      lenderId,
                      productId: p.id,
                      amount: a.amount,
                      months: a.months,
                    }
                  : {
                      type: 'company.loan',
                      companyId: cid,
                      lenderId,
                      productId: p.id,
                      amount: a.amount,
                      months: a.months,
                      personalGuarantee: a.guarantee,
                    };
              break;
            }
            case 'accept': {
              const open = Object.values(w.deals).find(
                (d) =>
                  d.status === 'open' &&
                  ((d.awaiting.kind === 'company' && d.awaiting.id === cid) ||
                    (d.awaiting.kind === 'player' && d.awaiting.id === 'u_founder')),
              );
              cmd = open
                ? { type: 'deal.act', dealId: open.id, action: 'accept' }
                : { type: 'inbox.read' };
              break;
            }
            case 'host': {
              actor = a.investor ? 'u_inv' : 'u_founder';
              const seg = companyOf(w, 'u_founder').targetSegments[0];
              cmd = {
                type: 'event.host',
                kind: a.kind,
                title: 'Lagos Networking Night',
                venue: a.venue,
                month: w.markets.lagos!.month + a.ahead,
                budget: a.budget,
                ticket: a.ticket,
                ...(a.kind === 'customer-mixer' ? { segmentKey: seg } : {}),
              };
              break;
            }
            case 'rsvp': {
              actor = a.investor ? 'u_inv' : 'u_founder';
              const e = Object.values(w.events ?? {}).find(
                (x) => x.status === 'upcoming' && x.hostId !== actor,
              );
              cmd = { type: 'event.rsvp', eventId: e?.id ?? 'none', going: a.going };
              break;
            }
            case 'pitchAngel': {
              const angels = Object.values(w.funds).filter((f) => f.angelId);
              const f = angels[a.pick % angels.length]!;
              cmd = {
                type: 'pitch.start',
                companyId: cid,
                fundId: f.id,
                slides: ['product', 'traction'],
                ask: a.ask,
              };
              break;
            }
            case 'bizPitch': {
              const list = Object.values(w.markets.lagos!.businesses ?? {});
              const biz = list[a.pick % list.length]!;
              cmd = { type: 'business.pitch', companyId: cid, businessId: biz.id };
              break;
            }
            case 'bizGig': {
              actor = a.investor ? 'u_inv' : 'u_founder';
              const list = Object.values(w.markets.lagos!.businesses ?? {});
              const biz = list[a.pick % list.length]!;
              const gigs = ['shift', 'kitchen', 'socials', 'online', 'front', 'tech', 'repair'];
              cmd = { type: 'gig.take', businessId: biz.id, gigId: gigs[a.gig % gigs.length]! };
              break;
            }
            case 'venue': {
              actor = a.investor ? 'u_inv' : 'u_founder';
              const list = Object.values(w.markets.lagos!.businesses ?? {});
              const biz = list[a.pick % list.length]!;
              const items = ['lunch', 'dinner', 'coffee', 'plate', 'cut', 'drink'];
              const other = actor === 'u_inv' ? 'u_founder' : 'u_inv';
              const fund = Object.values(w.funds).find((f) => f.market === 'lagos' && f.ai);
              const angel = Object.values(w.players).find((p) => p.ai && p.angel);
              const withId =
                a.with === 'player'
                  ? other
                  : a.with === 'fund'
                    ? fund?.id
                    : a.with === 'angel'
                      ? angel?.id
                      : undefined;
              cmd = {
                type: 'venue.buy',
                businessId: biz.id,
                itemId: items[a.item % items.length]!,
                ...(withId ? { withId } : {}),
              };
              break;
            }
            case 'venueHost': {
              const list = Object.values(w.markets.lagos!.businesses ?? {});
              const biz = list[a.pick % list.length]!;
              cmd = {
                type: 'event.host',
                kind: 'founder-meetup',
                title: 'Lagos Founders Supper',
                venue: 'hall',
                budget: a.budget,
                businessId: biz.id,
              };
              break;
            }
            case 'cancel': {
              actor = a.investor ? 'u_inv' : 'u_founder';
              const e = Object.values(w.events ?? {}).find(
                (x) => x.status === 'upcoming' && x.hostId === actor,
              );
              cmd = { type: 'event.cancel', eventId: e?.id ?? 'none' };
              break;
            }
          }
          const r = dispatch(w, cmd, { actorId: actor, now: T0 + day * DAY });
          w = r.world;
        }
        const now = moneyByCurrency(w);
        for (const [cur, v] of Object.entries(total))
          if (now[cur] !== v) throw new Error(`${cur} not conserved: ${v} → ${now[cur]}`);
        if (negativeInternalAccounts(w).length) throw new Error('overdrawn account');
        for (const p of Object.values(w.players))
          if (p.stars.value < 0 || p.stars.value > 5) throw new Error('stars out of range');
        return true;
      }),
      { numRuns: 40 },
    );
  }, 120_000);
});

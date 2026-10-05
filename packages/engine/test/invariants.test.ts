import { describe, it } from 'vitest';
import fc from 'fast-check';
import { dispatch } from '../src/dispatch.js';
import { angelsAt } from '../src/programs.js';
import { peopleHere } from '../src/people.js';
import { ACCELERATORS, DEV_PARTNERS, LPS } from '../src/data/programs.js';
import type { Command } from '../src/commands.js';
import { CAR_MODEL_IDS, FURNITURE } from '../src/data/lifestyle-shop.js';
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
    // London too (Wave 4): flights, rides and city spending abroad cross currencies.
    let base = addFounder(makeWorld(5, ['lagos', 'london']));
    base = addInvestor(base, 'u_inv', 'lagos');
    const cid = companyOf(base, 'u_founder').id;
    const total = moneyByCurrency(base);

    const action = fc.oneof(
      fc.record({ k: fc.constant('settle' as const), london: fc.boolean(), away: fc.boolean() }),
      // Wave 4: one-way flights and bus or taxi rides in the city you're in.
      fc.record({
        k: fc.constant('fly' as const),
        investor: fc.boolean(),
        to: fc.constantFrom('lagos' as const, 'london' as const),
      }),
      fc.record({
        k: fc.constant('ride' as const),
        investor: fc.boolean(),
        mode: fc.constantFrom('bus' as const, 'taxi' as const, 'drive' as const),
        distance: fc.constantFrom('short' as const, 'medium' as const, 'long' as const),
      }),
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
      // Wave 5 B: accelerators, grants, LPs, one-tap investing, angels about town, broadcasts.
      fc.record({ k: fc.constant('accel' as const), pick: fc.nat(5), london: fc.boolean() }),
      fc.record({ k: fc.constant('grant' as const), pick: fc.nat(10) }),
      fc.record({ k: fc.constant('lp' as const), pick: fc.nat(5) }),
      fc.record({
        k: fc.constant('quick' as const),
        pick: fc.nat(20),
        amount: fc.integer({ min: 1_000_00, max: 20_000_000_00 }),
      }),
      fc.record({ k: fc.constant('angelHere' as const), pick: fc.nat(10), treat: fc.boolean() }),
      fc.record({
        k: fc.constant('broadcast' as const),
        investor: fc.boolean(),
        spend: fc.integer({ min: 1_00, max: 500_000_00 }),
      }),
      fc.record({
        k: fc.constant('venueHost' as const),
        pick: fc.nat(40),
        budget: fc.integer({ min: 0, max: 50_000_000 }),
      }),
    );

    // Wave 5: jobs paid from business tills, furniture and cars (sell-backs, running costs).
    const life = fc.oneof(
      fc.record({
        k: fc.constant('job' as const),
        pick: fc.nat(60),
        role: fc.nat(3),
        investor: fc.boolean(),
        quit: fc.boolean(),
      }),
      fc.record({
        k: fc.constant('furniture' as const),
        pick: fc.nat(FURNITURE.length - 1),
        investor: fc.boolean(),
      }),
      fc.record({
        k: fc.constant('car' as const),
        pick: fc.nat(CAR_MODEL_IDS.length),
        investor: fc.boolean(),
      }),
    );

    // Wave 6: things to do (meeting people), showrooms, saving contacts, the city growing.
    const alive = fc.oneof(
      fc.record({
        k: fc.constant('fun' as const),
        pick: fc.nat(80),
        item: fc.nat(6),
        investor: fc.boolean(),
        invite: fc.boolean(),
      }),
      fc.record({
        k: fc.constant('showroom' as const),
        pick: fc.nat(80),
        item: fc.nat(FURNITURE.length - 1),
        car: fc.boolean(),
        investor: fc.boolean(),
      }),
      fc.record({
        k: fc.constant('save' as const),
        pick: fc.nat(80),
        person: fc.nat(12),
        remove: fc.boolean(),
        investor: fc.boolean(),
      }),
      fc.record({ k: fc.constant('join' as const), london: fc.boolean() }),
    );

    fc.assert(
      fc.property(
        fc.array(fc.oneof(action, life, alive), { minLength: 1, maxLength: 25 }),
        (actions) => {
          let w = base;
          let day = 0;
          let joined = 0;
          // Local businesses where a player is right now (home, or abroad after a flight).
          const bizHere = (id: string) =>
            Object.values(w.markets[w.players[id]!.location?.market ?? 'lagos']!.businesses ?? {});
          for (const a of actions) {
            let actor: string | null = 'u_founder';
            let cmd: Command;
            switch (a.k) {
              case 'settle': {
                actor = null;
                day++;
                const market = a.london ? 'london' : 'lagos';
                cmd = {
                  type: 'market.settle',
                  market,
                  at: w.markets[market]!.settledAt! + DAY,
                  // A one-day month: away mode (auto-hibernation) kicks in after two idle days.
                  ...(a.away ? { monthMs: DAY } : {}),
                };
                break;
              }
              case 'fly':
                actor = a.investor ? 'u_inv' : 'u_founder';
                cmd = { type: 'travel.fly', to: a.to };
                break;
              case 'ride':
                actor = a.investor ? 'u_inv' : 'u_founder';
                cmd = { type: 'city.ride', mode: a.mode, distance: a.distance };
                break;
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
                const list = bizHere('u_founder');
                const biz = list[a.pick % list.length]!;
                cmd = { type: 'business.pitch', companyId: cid, businessId: biz.id };
                break;
              }
              case 'bizGig': {
                actor = a.investor ? 'u_inv' : 'u_founder';
                const list = bizHere(actor);
                const biz = list[a.pick % list.length]!;
                const gigs = ['shift', 'kitchen', 'socials', 'online', 'front', 'tech', 'repair'];
                cmd = { type: 'gig.take', businessId: biz.id, gigId: gigs[a.gig % gigs.length]! };
                break;
              }
              case 'venue': {
                actor = a.investor ? 'u_inv' : 'u_founder';
                const list = bizHere(actor);
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
              case 'job': {
                actor = a.investor ? 'u_inv' : 'u_founder';
                if (a.quit) {
                  cmd = { type: 'job.quit' };
                  break;
                }
                const list = bizHere(actor);
                const biz = list[a.pick % list.length]!;
                const roles = ['waiter', 'barista', 'cashier', 'driver', 'junior-dev', 'sales-rep'];
                cmd = { type: 'job.take', businessId: biz.id, role: roles[a.role % roles.length]! };
                break;
              }
              case 'furniture':
                actor = a.investor ? 'u_inv' : 'u_founder';
                cmd = { type: 'home.buy', itemId: FURNITURE[a.pick]!.id };
                break;
              case 'car':
                actor = a.investor ? 'u_inv' : 'u_founder';
                cmd =
                  a.pick === CAR_MODEL_IDS.length
                    ? { type: 'car.sell' }
                    : { type: 'car.buy', modelId: CAR_MODEL_IDS[a.pick]! };
                break;
              case 'fun': {
                actor = a.investor ? 'u_inv' : 'u_founder';
                const list = bizHere(actor);
                const biz = list[a.pick % list.length]!;
                const items = ['dance', 'vip', 'bottle', 'entry', 'ticket', 'five-a-side', 'pool'];
                cmd = {
                  type: 'venue.buy',
                  businessId: biz.id,
                  itemId: items[a.item % items.length]!,
                  ...(a.invite ? { withId: actor === 'u_inv' ? 'u_founder' : 'u_inv' } : {}),
                };
                break;
              }
              case 'showroom': {
                actor = a.investor ? 'u_inv' : 'u_founder';
                const list = bizHere(actor);
                const biz = list[a.pick % list.length]!;
                cmd = a.car
                  ? {
                      type: 'car.buy',
                      modelId: CAR_MODEL_IDS[a.item % CAR_MODEL_IDS.length]!,
                      businessId: biz.id,
                    }
                  : { type: 'home.buy', itemId: FURNITURE[a.item]!.id, businessId: biz.id };
                break;
              }
              case 'save': {
                actor = a.investor ? 'u_inv' : 'u_founder';
                const me = w.players[actor]!;
                if (a.remove && me.contacts?.length) {
                  cmd = { type: 'contact.remove', contactId: me.contacts[0]!.id };
                  break;
                }
                const market = me.location?.market ?? me.market;
                const list = bizHere(actor);
                const biz = list[a.pick % list.length]!;
                const people = peopleHere(w, w.markets[market]!)[biz.id] ?? [];
                const person = people[a.person % Math.max(1, people.length)];
                cmd = {
                  type: 'contact.save',
                  personId: person?.id ?? `npc:${market}:${a.person}`,
                  name: person?.name ?? 'A regular',
                };
                break;
              }
              case 'join': {
                // A newcomer: the city opens a business for them (growth), from genesis.
                joined++;
                actor = `u_new${joined}`;
                cmd = {
                  type: 'player.create',
                  handle: `h_new${joined}`,
                  name: 'New Player',
                  role: 'investor',
                  backgroundId: 'i-first',
                  market: a.london ? 'london' : 'lagos',
                  investor: { sectors: ['fintech'], stages: ['seed'], checkSize: 1_000_000_00 },
                };
                break;
              }
              case 'accel': {
                const list = ACCELERATORS[a.london ? 'london' : 'lagos'];
                cmd = {
                  type: 'accelerator.apply',
                  acceleratorId: list[a.pick % list.length]!.id,
                  companyId: cid,
                };
                break;
              }
              case 'grant': {
                const programs = DEV_PARTNERS.lagos.flatMap((p) =>
                  p.programs.map((pr) => ({ partnerId: p.id, programId: pr.id })),
                );
                cmd = {
                  type: 'grant.apply',
                  ...programs[a.pick % programs.length]!,
                  companyId: cid,
                };
                break;
              }
              case 'lp':
                actor = 'u_inv';
                cmd = { type: 'lp.pitch', lpId: LPS.lagos[a.pick % LPS.lagos.length]!.id };
                break;
              case 'quick': {
                actor = 'u_inv';
                const targets = Object.values(w.companies).filter((c) => c.status === 'active');
                const t = targets[a.pick % targets.length]!;
                cmd = { type: 'invest.quick', companyId: t.id, amount: a.amount };
                break;
              }
              case 'angelHere': {
                const market = w.players.u_founder!.location?.market ?? 'lagos';
                const spots = Object.entries(angelsAt(w, market));
                const spot = spots[a.pick % Math.max(1, spots.length)];
                cmd = spot
                  ? {
                      type: 'pitch.angel',
                      angelId: spot[1][0]!,
                      companyId: cid,
                      businessId: spot[0],
                      treat: a.treat,
                    }
                  : { type: 'inbox.read' };
                break;
              }
              case 'broadcast': {
                actor = a.investor ? 'u_inv' : 'u_founder';
                const e = Object.values(w.events ?? {}).find(
                  (x) => x.status === 'upcoming' && x.hostId === actor,
                );
                cmd = { type: 'event.broadcast', eventId: e?.id ?? 'none', spend: a.spend };
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
        },
      ),
      { numRuns: 40 },
    );
  }, 120_000);
});

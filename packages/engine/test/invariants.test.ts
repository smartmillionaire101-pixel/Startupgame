import { describe, it } from 'vitest';
import fc from 'fast-check';
import { dispatch } from '../src/dispatch.js';
import { angelsAt } from '../src/programs.js';
import { peopleHere } from '../src/people.js';
import { ACCELERATORS, DEV_PARTNERS, LPS } from '../src/data/programs.js';
import type { Command } from '../src/commands.js';
import { CAR_MODEL_IDS, FURNITURE } from '../src/data/lifestyle-shop.js';
import { HOME_ACT_IDS } from '../src/needs.js';
import { techEventsFor } from '../src/social.js';
import { marketProperties } from '../src/property.js';
import { CITY_DISTRICTS } from '../src/data/businesses.js';
import type { World } from '../src/types.js';
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
    // Wave 8: a London player, so money sent between friends crosses currencies.
    base = addInvestor(base, 'u_lon', 'london');
    // Wave 10: money to buy homes with (from the outside world, so the books still balance).
    base = structuredClone(base) as World;
    for (const [id, amount] of [
      ['u_inv', 3_000_000_000_00],
      ['u_lon', 8_000_000_00],
      ['u_founder', 400_000_000_00],
    ] as const) {
      const p = base.players[id]!;
      base.accounts[base.markets[p.market]!.ext.genesis]!.balance -= amount;
      base.accounts[p.accounts.local]!.balance += amount;
    }
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
      // Wave 12: tickets paid when booked, boarded without a second charge, cancelled for a refund.
      fc.record({
        k: fc.constant('ticket' as const),
        op: fc.constantFrom('book' as const, 'board' as const, 'cancel' as const, 'fly' as const),
        investor: fc.boolean(),
        to: fc.constantFrom('lagos' as const, 'london' as const),
        aheadH: fc.integer({ min: -2, max: 40 }),
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

    // Wave 7: life at home (acts with groceries, having people over) and food delivery.
    const home = fc.oneof(
      fc.record({
        k: fc.constant('homeAct' as const),
        act: fc.constantFrom(...HOME_ACT_IDS),
        investor: fc.boolean(),
      }),
      fc.record({
        k: fc.constant('invite' as const),
        who: fc.constantFrom('player', 'fund', 'npc', 'contact', 'away'),
        investor: fc.boolean(),
      }),
      fc.record({
        k: fc.constant('order' as const),
        pick: fc.nat(40),
        item: fc.nat(4),
        investor: fc.boolean(),
      }),
    );

    // Wave 8: friends: sending money (any city, with fee and daily limit), visits,
    // hangouts and tech events (tickets).
    const friends = fc.oneof(
      fc.record({
        k: fc.constant('send' as const),
        from: fc.constantFrom('u_founder', 'u_inv', 'u_lon'),
        to: fc.constantFrom('u_founder', 'u_inv', 'u_lon', 'ai'),
        amount: fc.integer({ min: -10, max: 300_000_00 }),
      }),
      fc.record({
        k: fc.constant('visit' as const),
        investor: fc.boolean(),
        step: fc.constantFrom('invite' as const, 'accept' as const, 'decline' as const),
      }),
      fc.record({
        k: fc.constant('hangout' as const),
        investor: fc.boolean(),
        pick: fc.nat(40),
        step: fc.constantFrom('plan' as const, 'join' as const, 'leave' as const),
      }),
      fc.record({
        k: fc.constant('tech' as const),
        who: fc.constantFrom('u_founder', 'u_inv', 'u_lon'),
        pick: fc.nat(6),
        next: fc.boolean(),
      }),
    );

    // Wave 10: homes (cash and mortgages, letting, selling, moving in), branches,
    // pitch competitions and lifestyle-gated activities.
    const living = fc.oneof(
      fc.record({
        k: fc.constant('propBuy' as const),
        who: fc.constantFrom('u_founder', 'u_inv', 'u_lon'),
        pick: fc.nat(40),
        mortgage: fc.boolean(),
        downPct: fc.integer({ min: 20, max: 90 }),
        months: fc.integer({ min: 60, max: 360 }),
      }),
      fc.record({
        k: fc.constant('propAct' as const),
        who: fc.constantFrom('u_founder', 'u_inv', 'u_lon'),
        act: fc.constantFrom(
          'property.sell' as const,
          'property.rent' as const,
          'property.unrent' as const,
          'property.moveIn' as const,
        ),
      }),
      fc.record({
        k: fc.constant('branch' as const),
        london: fc.boolean(),
        pick: fc.nat(10),
        close: fc.boolean(),
      }),
      fc.record({
        k: fc.constant('compete' as const),
        step: fc.constantFrom('enter' as const, 'judge' as const, 'score' as const),
        london: fc.boolean(),
        score: fc.integer({ min: 1, max: 10 }),
        pick: fc.nat(10),
      }),
      fc.record({
        k: fc.constant('luxe' as const),
        investor: fc.boolean(),
        item: fc.constantFrom('golf', 'polo', 'yacht-day', 'gala', 'jet-weekend', 'rooftop-party'),
        to: fc.constantFrom('lagos' as const, 'london' as const),
      }),
    );

    // Wave 12: games for stakes: set up (bar or home, AI or a friend), join, start,
    // play (quiz answers, pool shots, kicks and dives, darts), concede, finish, rematch.
    const games = fc.oneof(
      fc.record({
        k: fc.constant('gameNew' as const),
        who: fc.constantFrom('u_founder', 'u_inv', 'u_lon'),
        kind: fc.constantFrom(
          'quiz' as const,
          'pool' as const,
          'football' as const,
          'darts' as const,
        ),
        home: fc.boolean(),
        stake: fc.integer({ min: 0, max: 6_000 }),
        ai: fc.integer({ min: 0, max: 3 }),
        invite: fc.boolean(),
        custom: fc.boolean(),
      }),
      fc.record({
        k: fc.constant('gameStep' as const),
        who: fc.constantFrom('u_founder', 'u_inv', 'u_lon'),
        step: fc.constantFrom(
          'join' as const,
          'join' as const,
          'start' as const,
          'play' as const,
          'play' as const,
          'leave' as const,
          'finish' as const,
          'rematch' as const,
        ),
        x: fc.double({ min: -1, max: 1, noNaN: true }),
        y: fc.double({ min: 0, max: 1, noNaN: true }),
        n: fc.nat(3),
      }),
    );

    const gameMoves = new Set<string>();
    fc.assert(
      fc.property(
        fc.array(
          fc.oneof(action, life, alive, home, friends, living, { arbitrary: games, weight: 4 }),
          {
            minLength: 1,
            maxLength: 25,
          },
        ),
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
              case 'ticket':
                actor = a.investor ? 'u_inv' : 'u_founder';
                cmd =
                  a.op === 'book'
                    ? {
                        type: 'travel.book',
                        to: a.to,
                        departAt: Math.max(0, T0 + day * DAY + a.aheadH * 3_600_000),
                      }
                    : a.op === 'fly'
                      ? { type: 'travel.fly', to: a.to }
                      : { type: a.op === 'board' ? 'travel.board' : 'travel.cancel' };
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
              case 'homeAct':
                actor = a.investor ? 'u_inv' : 'u_founder';
                cmd = { type: 'home.act', act: a.act };
                break;
              case 'invite': {
                actor = a.investor ? 'u_inv' : 'u_founder';
                const me = w.players[actor]!;
                const fund = Object.values(w.funds).find((f) => f.market === 'lagos');
                const personId =
                  a.who === 'player'
                    ? actor === 'u_inv'
                      ? 'u_founder'
                      : 'u_inv'
                    : a.who === 'fund'
                      ? `fund:${fund?.id ?? 'none'}`
                      : a.who === 'npc'
                        ? 'npc:lagos:2'
                        : a.who === 'away'
                          ? 'npc:london:2'
                          : (me.contacts?.[0]?.refId ?? 'npc:lagos:5');
                cmd = { type: 'home.invite', personId };
                break;
              }
              case 'order': {
                actor = a.investor ? 'u_inv' : 'u_founder';
                const list = bizHere(actor);
                const biz = list[a.pick % list.length]!;
                const items = ['lunch', 'plate', 'coffee', 'drink', 'pool'];
                cmd = { type: 'food.order', businessId: biz.id, itemId: items[a.item]! };
                break;
              }
              case 'send': {
                actor = a.from;
                const ai = Object.values(w.players).find((p) => p.ai)!;
                cmd = {
                  type: 'money.send',
                  toPlayerId: a.to === 'ai' ? ai.id : a.to,
                  amount: a.amount,
                };
                break;
              }
              case 'visit': {
                actor = a.investor ? 'u_inv' : 'u_founder';
                const other = actor === 'u_inv' ? 'u_founder' : 'u_inv';
                const v = Object.values(w.visits ?? {}).find(
                  (x) => x.guestId === actor && x.status === 'pending',
                );
                cmd =
                  a.step === 'invite'
                    ? { type: 'visit.invite', toPlayerId: other }
                    : a.step === 'accept'
                      ? { type: 'visit.accept', inviteId: v?.id ?? 'none' }
                      : { type: 'visit.decline', inviteId: v?.id ?? 'none' };
                break;
              }
              case 'hangout': {
                actor = a.investor ? 'u_inv' : 'u_founder';
                const other = actor === 'u_inv' ? 'u_founder' : 'u_inv';
                const list = bizHere(actor);
                const h = Object.values(w.hangouts ?? {}).find((x) => x.status === 'open');
                cmd =
                  a.step === 'plan'
                    ? {
                        type: 'hangout.plan',
                        businessId: list[a.pick % list.length]!.id,
                        inviteeIds: [other],
                        when: 'now',
                      }
                    : a.step === 'join'
                      ? { type: 'hangout.join', hangoutId: h?.id ?? 'none' }
                      : { type: 'hangout.leave', hangoutId: h?.id ?? 'none' };
                break;
              }
              case 'tech': {
                actor = a.who;
                const market = w.players[actor]!.location?.market ?? w.players[actor]!.market;
                const m = w.markets[market]!;
                const list = techEventsFor(w, m, m.month + (a.next ? 1 : 0));
                cmd = { type: 'techevent.attend', eventId: list[a.pick % list.length]!.id };
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
              case 'propBuy': {
                actor = a.who;
                const here = w.players[actor]!.location?.market ?? w.players[actor]!.market;
                const list = marketProperties(w, here);
                cmd = {
                  type: 'property.buy',
                  propertyId: list[a.pick % list.length]!.id,
                  ...(a.mortgage ? { mortgage: { downPct: a.downPct, months: a.months } } : {}),
                };
                break;
              }
              case 'propAct': {
                actor = a.who;
                const mine = Object.values(w.properties ?? {}).find((x) => x.ownerId === actor);
                cmd = { type: a.act, propertyId: mine?.id ?? 'none' };
                break;
              }
              case 'branch': {
                const open = Object.values(w.branches ?? {}).find(
                  (b) => b.companyId === cid && b.status === 'open',
                );
                const market = a.london ? 'london' : 'lagos';
                const ds = CITY_DISTRICTS[market];
                cmd =
                  a.close && open
                    ? { type: 'company.branch.close', branchId: open.id }
                    : {
                        type: 'company.branch.open',
                        companyId: cid,
                        market,
                        district: ds[a.pick % ds.length]!,
                      };
                break;
              }
              case 'compete': {
                const market = a.london ? 'london' : 'lagos';
                const comp = Object.values(w.competitions ?? {}).find(
                  (c) => c.market === market && c.status === 'open',
                );
                const compId = comp?.id ?? 'none';
                if (a.step === 'enter') {
                  cmd = { type: 'competition.enter', competitionId: compId, companyId: cid };
                } else if (a.step === 'judge') {
                  actor = 'u_inv';
                  cmd = { type: 'competition.judge.join', competitionId: compId };
                } else {
                  actor = 'u_inv';
                  const e = comp?.entries[a.pick % Math.max(1, comp.entries.length)];
                  cmd = {
                    type: 'competition.score',
                    competitionId: compId,
                    entryId: e?.id ?? 'none',
                    score: a.score,
                  };
                }
                break;
              }
              case 'luxe': {
                actor = a.investor ? 'u_inv' : 'u_founder';
                const kinds: Record<string, string> = {
                  golf: 'golf-club',
                  polo: 'golf-club',
                  'yacht-day': 'marina',
                  gala: 'ballroom',
                  'jet-weekend': 'private-terminal',
                  'rooftop-party': 'lounge-bar',
                };
                const biz = bizHere(actor).find((b) => b.kind === kinds[a.item]);
                cmd = {
                  type: 'venue.buy',
                  businessId: biz?.id ?? 'none',
                  itemId: a.item,
                  ...(a.item === 'jet-weekend' ? { to: a.to } : {}),
                };
                break;
              }
              case 'gameNew': {
                actor = a.who;
                const me = w.players[actor]!;
                const bar = Object.values(
                  w.markets[me.location?.market ?? me.market]!.businesses ?? {},
                ).find((b) => b.kind === 'bar' || b.kind === 'pub');
                const others = ['u_founder', 'u_inv', 'u_lon'].filter((x) => x !== actor);
                cmd = {
                  type: 'game.create',
                  kind: a.kind,
                  where: a.home ? 'home' : 'venue',
                  ...(a.home ? {} : { businessId: bar?.id ?? 'none' }),
                  stake: a.stake,
                  ai: a.kind === 'quiz' ? a.ai : Math.min(1, a.ai),
                  ...(a.invite ? { invite: others } : {}),
                  ...(a.kind === 'quiz' && a.custom
                    ? {
                        quiz: {
                          custom: [1, 2, 3].map((n) => ({
                            q: `Question ${n}?`,
                            options: ['Yes', 'No', 'Maybe', 'Never'] as [
                              string,
                              string,
                              string,
                              string,
                            ],
                          })),
                        },
                      }
                    : {}),
                };
                break;
              }
              case 'gameStep': {
                actor = a.who;
                const mine = (x: NonNullable<World['games']>[string]) =>
                  x.hostId === actor || x.players.some((p) => p.id === actor);
                const list = Object.values(w.games ?? {}).reverse();
                let g = list.find(mine);
                if (a.step === 'join') {
                  g = list.find((x) => x.status === 'lobby' && !mine(x)) ?? g;
                } else if (a.step === 'play') {
                  // Whoever's move it is in the latest game on (so play mostly lands).
                  g = list.find((x) => x.status === 'playing');
                  const turn =
                    g?.pool?.turn ??
                    (g?.football
                      ? g.football.kicks.at(-1)?.[a.n % 2 ? 'keeper' : 'shooter']
                      : undefined) ??
                    g?.players.find((p) => !p.ai && !p.out)?.id;
                  if (turn && w.players[turn]) actor = turn;
                }
                const gameId = g?.id ?? 'none';
                if (a.step === 'play') {
                  const kick = g?.football?.kicks.at(-1);
                  const who = actor;
                  cmd = {
                    type: 'game.play',
                    gameId,
                    move:
                      g?.kind === 'quiz'
                        ? { k: 'answer', q: a.n, choice: a.n }
                        : g?.kind === 'pool'
                          ? { k: 'shot', dx: a.x, dy: -a.y - 0.1, power: Math.abs(a.x) }
                          : g?.kind === 'football'
                            ? kick?.keeper === who
                              ? { k: 'dive', x: a.x, y: a.y }
                              : { k: 'kick', x: a.x, y: a.y, power: a.y }
                            : { k: 'throw', x: a.x, y: a.y },
                  };
                } else cmd = { type: `game.${a.step}`, gameId };
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
            if (r.ok && cmd.type.startsWith('game.')) gameMoves.add(cmd.type);
            w = r.world;
          }
          const now = moneyByCurrency(w);
          for (const [cur, v] of Object.entries(total))
            if (now[cur] !== v) throw new Error(`${cur} not conserved: ${v} → ${now[cur]}`);
          if (negativeInternalAccounts(w).length) throw new Error('overdrawn account');
          // Wave 12: each city's games escrow holds exactly the pots of games still on.
          for (const mk of ['lagos', 'london'] as const) {
            const held = w.accounts[`acc:games:${mk}`]?.balance ?? 0;
            const pots = Object.values(w.games ?? {})
              .filter((g) => g.market === mk && (g.status === 'lobby' || g.status === 'playing'))
              .reduce((s, g) => s + g.pot, 0);
            if (held !== pots) throw new Error(`games escrow ${mk}: ${held} held, ${pots} in pots`);
          }
          for (const p of Object.values(w.players))
            if (p.stars.value < 0 || p.stars.value > 5) throw new Error('stars out of range');
          for (const p of Object.values(w.players))
            for (const v of Object.values(p.needs ?? {}))
              if (v < 0 || v > 100) throw new Error('need out of range');
          return true;
        },
      ),
      { numRuns: 40 },
    );
    // The games paths really ran (stakes in, pots out).
    for (const t of ['game.create'])
      if (!gameMoves.has(t)) throw new Error(`no successful ${t} in the random play`);
  }, 120_000);
});

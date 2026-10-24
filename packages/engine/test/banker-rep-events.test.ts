/**
 * Game feedback (FEEDBACK_NOTE): the banker's advisory reputation (a rating
 * from scored mandates that opens bigger clients, more mandates and more
 * held at once, and referrals after a deal scored 80+), and events by role
 * (banking and investor events beside the startup calendar, where a banker
 * meets clients). Worlds without the note play exactly as before.
 */
import { describe, expect, it } from 'vitest';
import { advisoryReputation, mandateOffers } from '../src/bankwork.js';
import { BANKWORK, FIT, MANDATES, REPUTATION, STEPS } from '../src/data/bankwork.js';
import { BANKERS_NOTE, FEEDBACK_NOTE } from '../src/releases.js';
import { BANKER_EVENT_KINDS, INVESTOR_EVENT_KINDS, techEventsFor } from '../src/social.js';
import { playerView } from '../src/views.js';
import type { AdvisoryDeal, World } from '../src/types.js';
import { DAY, T0, makeWorld, moneyByCurrency, run } from './helpers.js';

const B = 'u_banker';
const F = 'u_founder';
const announce = (w: World, id: string) =>
  run(w, null, { type: 'system.announce', id, text: 'Release.' }).world;

const addBanker = (w: World, id = B) =>
  run(w, id, {
    type: 'player.create',
    handle: `h_${id}`.slice(0, 20),
    name: 'Bea Banker',
    role: 'banker',
    backgroundId: 'b-wealthy',
    market: 'lagos',
    bank: { name: `Trust Bank ${id.slice(-3)}`, bankType: 'commercial' },
  }).world;

const addFounder = (w: World, id = F) =>
  run(w, id, {
    type: 'player.create',
    handle: `h_${id}`.slice(0, 20),
    name: 'Fola Founder',
    role: 'founder',
    backgroundId: 'f-engineer',
    market: 'lagos',
    company: {
      name: 'Fola Pay',
      industry: 'fintech',
      revenueModel: 'subscription',
      idea: 'Payments for traders',
      incorporation: 'local',
    },
  }).world;

/** A banker in a world with the feedback note (on), or only the bankers note (off). */
const world = (on: boolean, seed = 11) =>
  addBanker(announce(makeWorld(seed, ['lagos']), on ? FEEDBACK_NOTE : BANKERS_NOTE));
const me = (w: World, id = B) => w.players[id]!;
const view = (w: World, id = B) => playerView(w, id, { now: T0, monthMs: DAY })!;
const desk = (w: World) => {
  const v = view(w).bankWork!;
  if (!v.banker) throw new Error('not a banker');
  return v;
};

/** Give the banker a record of handed-in mandates at these qualities (newest first). */
function withRecord(frozen: World, qualities: number[]): World {
  const w = structuredClone(frozen);
  const p = me(w);
  const deal = (q: number, i: number): AdvisoryDeal => ({
    id: `md:0:k:${i}:debt`,
    kind: 'debt',
    // Handed in before this month, so this month's desk is open.
    month: -1,
    client: `Client ${i}`,
    clientKind: 'corporate',
    quality: q,
    closed: q >= BANKWORK.closeAt,
    dealValue: 1,
    fee: 0,
    paidTo: 'none',
    picks: [],
  });
  p.bankwork ??= {
    active: [],
    taken: [],
    record: { deals: 0, lost: 0, fees: 0, qualitySum: 0, byKind: {} },
    history: [],
    lessons: [],
    talks: [],
    talked: {},
    talkMonth: { month: -1, n: 0 },
    recruits: [],
    clients: [],
    leads: [],
  };
  p.bankwork.history = qualities.map(deal);
  return w;
}

/** The best call at each step (what a careful banker picks). */
function bestChoices(w: World, mandateId: string) {
  const md = me(w).bankwork!.active.find((x) => x.id === mandateId)!;
  const out: Record<string, string> = {};
  for (const step of MANDATES[md.kind].steps) {
    if (step === 'lender') {
      const a = desk(w).active.find((x) => x.id === mandateId)!;
      out[step] = a.steps.find((s) => s.id === 'lender')!.options[0]!.id;
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

describe('advisory reputation: the release switch', () => {
  it('without the note, scores change nothing: same desk, same limits, no referrals', () => {
    const plain = world(false);
    const scored = withRecord(world(false), [0.95, 0.95, 0.95, 0.9]);
    expect(mandateOffers(scored, me(scored)).map((o) => o.id)).toEqual(
      mandateOffers(plain, me(plain)).map((o) => o.id),
    );
    expect(advisoryReputation(scored, me(scored)).level).toBe(0);
    expect(desk(scored).caps.maxActive).toBe(BANKWORK.maxActive);
    expect(desk(scored).reputation).toBeNull();

    // A great deal brings no referral.
    let w = world(false);
    const o = mandateOffers(w, me(w)).find((x) => x.kind === 'debt')!;
    w = run(w, B, { type: 'banker.mandate', action: 'take', mandateId: o.id }).world;
    const r = run(w, B, {
      type: 'banker.mandate',
      action: 'complete',
      mandateId: o.id,
      choices: bestChoices(w, o.id),
    });
    expect(r.result.deal.quality).toBeGreaterThanOrEqual(REPUTATION.great);
    expect(r.result.referral).toBeNull();
    expect(me(r.world).bankwork!.leads).toEqual([]);
  });

  it('without the note, the events calendar is the startup one', () => {
    const w = world(false);
    const events = techEventsFor(w, w.markets.lagos!, w.markets.lagos!.month);
    expect(events.every((e) => e.audience === 'founder')).toBe(true);
  });
});

describe('advisory reputation: scores open more work', () => {
  it('a new banker has no rating, small clients only, and the usual limits', () => {
    const w = world(true);
    const rep = desk(w).reputation!;
    expect(rep.rating).toBeNull();
    expect(rep.level).toBe(0);
    expect(rep.toBig).toBe(REPUTATION.bigGreat);
    expect(rep.tiers.map((t) => t.open)).toEqual([true, false, false]);
    expect(desk(w).caps.maxActive).toBe(BANKWORK.maxActive);
    const offers = mandateOffers(w, me(w));
    expect(offers.length).toBeGreaterThanOrEqual(2);
    // Small first; the next size up only when small clients run short; never big.
    expect(offers.some((o) => o.tier === 'big')).toBe(false);
    expect(offers.some((o) => o.kind === 'debt')).toBe(true);
  });

  it('reads the record as a rating, and a good one opens mid-size, then big clients', () => {
    const base = world(true);
    const n0 = mandateOffers(base, me(base)).length;

    const mid = withRecord(world(true), [0.82, 0.78]);
    const r1 = advisoryReputation(mid, me(mid));
    expect(r1.rating).toBe(4.2);
    expect(r1.avgScore).toBe(80);
    expect(r1.great).toBe(1);
    expect(r1.level).toBe(1);
    expect(r1.toBig).toBe(2);
    expect(desk(mid).caps.maxActive).toBe(BANKWORK.maxActive + 1);
    expect(desk(mid).reputation!.tiers.map((t) => t.open)).toEqual([true, true, false]);
    expect(mandateOffers(mid, me(mid)).length).toBe(n0 + 1);

    const big = withRecord(world(true), [0.9, 0.85, 0.95]);
    const r2 = advisoryReputation(big, me(big));
    expect(r2.level).toBe(2);
    expect(r2.toBig).toBe(0);
    expect(desk(big).caps.maxActive).toBe(BANKWORK.maxActive + 2);
    expect(mandateOffers(big, me(big)).length).toBe(n0 + 2);

    // Poor scores keep the rating down and the doors shut.
    const poor = withRecord(world(true), [0.5, 0.6, 0.55]);
    const r3 = advisoryReputation(poor, me(poor));
    expect(r3.rating).toBeLessThan(REPUTATION.midStars);
    expect(r3.level).toBe(0);
  });

  it('lets a well-rated banker hold more mandates at once', () => {
    let w = withRecord(world(true), [0.9, 0.85, 0.95]);
    const offers = mandateOffers(w, me(w)).slice(0, BANKWORK.maxActive + 1);
    expect(offers.length).toBe(BANKWORK.maxActive + 1);
    for (const o of offers)
      w = run(w, B, { type: 'banker.mandate', action: 'take', mandateId: o.id }).world;
    expect(me(w).bankwork!.active).toHaveLength(BANKWORK.maxActive + 1);
  });
});

describe('advisory reputation: referrals', () => {
  it('a deal scored 80+ brings a named referral to the desk, deterministically', () => {
    const go = () => {
      let w = world(true);
      const o = mandateOffers(w, me(w)).find((x) => x.kind === 'debt')!;
      w = run(w, B, { type: 'banker.mandate', action: 'take', mandateId: o.id }).world;
      const before = moneyByCurrency(w);
      const r = run(w, B, {
        type: 'banker.mandate',
        action: 'complete',
        mandateId: o.id,
        choices: bestChoices(w, o.id),
      });
      expect(moneyByCurrency(r.world)).toEqual(before);
      return { o, r };
    };
    const { o, r } = go();
    expect(r.result.deal.quality).toBeGreaterThanOrEqual(REPUTATION.great);
    const ref = r.result.referral;
    expect(ref).not.toBeNull();
    expect(ref.from).toBe(o.client.name);
    expect(ref.client).not.toBe(o.client.name);
    const w = r.world;
    const offer = mandateOffers(w, me(w)).find((x) => x.referredBy === o.client.name)!;
    expect(offer.client.name).toBe(ref.client);
    expect(offer.lead).toBe(true);
    expect(
      (w.inbox[B] ?? []).some((n) =>
        n.text.startsWith(`${ref.client} heard about your work for ${o.client.name}`),
      ),
    ).toBe(true);
    expect(desk(w).reputation!.recent[0]!.score).toBeGreaterThanOrEqual(80);
    // The same world gives the same referral.
    expect(go().r.result.referral).toEqual(ref);
  });
});

describe('events by role', () => {
  it('adds banking and investor events without changing the startup calendar', () => {
    const off = world(false);
    const on = world(true);
    const m = on.markets.lagos!.month;
    const startup = techEventsFor(off, off.markets.lagos!, m);
    const all = techEventsFor(on, on.markets.lagos!, m);
    expect(all.filter((e) => e.audience === 'founder')).toEqual(startup);
    const banking = all.filter((e) => e.audience === 'banker');
    const investing = all.filter((e) => e.audience === 'investor');
    expect(banking.length).toBeGreaterThanOrEqual(3);
    expect(banking.length).toBeLessThanOrEqual(4);
    expect(investing.length).toBeGreaterThanOrEqual(2);
    expect(investing.length).toBeLessThanOrEqual(3);
    expect(banking.every((e) => (BANKER_EVENT_KINDS as readonly string[]).includes(e.kind))).toBe(
      true,
    );
    expect(
      investing.every((e) => (INVESTOR_EVENT_KINDS as readonly string[]).includes(e.kind)),
    ).toBe(true);
    // Unique ids; never at the founders' Hub; bankers speak at banking events.
    expect(new Set(all.map((e) => e.id)).size).toBe(all.length);
    expect([...banking, ...investing].every((e) => e.venue.kind !== 'hub')).toBe(true);
    expect(banking.every((e) => e.speakers.every((s) => s.role !== 'investor'))).toBe(true);
    // Deterministic, and in the view with who it's for.
    expect(techEventsFor(on, on.markets.lagos!, m)).toEqual(all);
    const rows = view(on).market.techEvents!;
    expect(rows.some((r) => r.audience === 'banker' && !!r.why)).toBe(true);
  });

  it('a banker at a banking event meets bankers and a client who wants an adviser', () => {
    let w = world(true);
    const m = w.markets.lagos!;
    const e = techEventsFor(w, m, m.month).find((x) => x.audience === 'banker')!;
    const contacts0 = me(w).contacts?.length ?? 0;
    const r = run(w, B, { type: 'techevent.attend', eventId: e.id });
    w = r.world;
    expect(r.result.lead).toBeTruthy();
    expect(r.result.message).toContain('wants an adviser');
    expect((me(w).contacts?.length ?? 0) - contacts0).toBeGreaterThanOrEqual(2);
    // The crowd fits the room: bankers, treasurers, owners.
    const crowd = (r.result.contacts as { kind: string; refId: string }[]).filter((c) =>
      c.refId.startsWith('crowd:'),
    );
    expect(crowd.length).toBeGreaterThanOrEqual(1);
    const offer = mandateOffers(w, me(w)).find((x) => x.metAt === e.title)!;
    expect(offer.client.name).toBe(r.result.lead.client);
  });

  it('anyone can go to any event; only bankers come away with an advisory lead', () => {
    let w = addFounder(world(true));
    const m = w.markets.lagos!;
    const e = techEventsFor(w, m, m.month).find((x) => x.audience === 'banker')!;
    const r = run(w, F, { type: 'techevent.attend', eventId: e.id });
    w = r.world;
    expect(r.result.lead).toBeUndefined();
    expect(w.players[F]!.bankwork?.leads ?? []).toEqual([]);
  });
});

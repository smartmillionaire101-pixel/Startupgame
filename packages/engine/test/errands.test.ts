/**
 * Something to do in every building (errands.ts, data/errands.ts, and the
 * civic places' `more` services in places.ts): food, clothes and medicine,
 * a workshop prototype, a course, a lawyer, waiting customers, the paper,
 * the stand-up; the High Court, the Tax Office, the Chamber's directory and
 * a doctor. Money moves through the ledger only, and worlds without the
 * feedback note play exactly as before.
 */
import { describe, expect, it } from 'vitest';
import { PLACE_SPECS } from '../src/data/places.js';
import { KIND_ERRANDS } from '../src/data/errands.js';
import { MONTH_MIN, gameMinute } from '../src/places.js';
import { FEEDBACK_NOTE, PLACES_NOTE } from '../src/releases.js';
import { playerView } from '../src/views.js';
import type { LocalBusiness, World } from '../src/types.js';
import {
  DAY,
  T0,
  addFounder,
  addInvestor,
  companyOf,
  makeWorld,
  moneyByCurrency,
  run,
  tryRun,
} from './helpers.js';

const F = 'u_founder';
const I = 'u_investor';
const announce = (w: World, id: string) =>
  run(w, null, { type: 'system.announce', id, text: 'Release.' }).world;
const fresh = () => addInvestor(addFounder(makeWorld(42, ['lagos', 'nairobi'])), I);
const feedbackWorld = () => announce(fresh(), FEEDBACK_NOTE);
const placesOnly = () => announce(fresh(), PLACES_NOTE);
const thaw = (w: World): World => structuredClone(w);
const MS_PER_MIN = DAY / MONTH_MIN;

/** The first open business of a kind in Lagos. */
function bizOf(w: World, kind: string): LocalBusiness {
  const b = Object.values(w.markets.lagos!.businesses ?? {})
    .filter((x) => x.kind === kind && x.closedMonth === undefined)
    .sort((a, z) => (a.id < z.id ? -1 : 1))[0];
  if (!b) throw new Error(`no ${kind} in Lagos`);
  return b;
}

/** A Lagos business of the kind, opened by hand when the roster has none. */
function withBiz(w: World, kind: string, like = 'grocer'): { w: World; b: LocalBusiness } {
  const t = thaw(w);
  const has = Object.values(t.markets.lagos!.businesses ?? {}).find(
    (x) => x.kind === kind && x.closedMonth === undefined,
  );
  if (has) return { w: t, b: has };
  const base = bizOf(t, like);
  const b = { ...structuredClone(base), id: `${base.id}-${kind}`, kind };
  t.markets.lagos!.businesses![b.id] = b;
  return { w: t, b };
}

describe('errands: before the feedback note', () => {
  it('refuses errand.do and lists no errands or new civic services', () => {
    const w = placesOnly();
    const r = tryRun(w, F, { type: 'errand.do', at: 'newsstand', errand: 'paper' });
    expect(!r.ok && r.error.code).toBe('command.unknown');
    const v = playerView(w, F, { now: T0, monthMs: DAY })!;
    expect(v.market.errands).toBeNull();
    const tax = v.market.cityPlaces!.places.find((p) => p.role === 'tax-office')!;
    expect(tax.services.map((s) => s.id)).toEqual(['tax-registration']);
    const mixer = run(w, F, { type: 'place.use', placeId: 'lagos:chamber', service: 'mixer' });
    expect(mixer.result.effects.network).toBeGreaterThan(0);
    const dir = tryRun(w, F, { type: 'place.use', placeId: 'lagos:chamber', service: 'directory' });
    expect(!dir.ok && dir.error.code).toBe('place.service');
  });

  it('plays an old world’s commands exactly as before (same world after the same commands)', () => {
    const cmds = (w: World) => {
      let x = run(w, F, { type: 'place.use', placeId: 'lagos:chamber', service: 'mixer' }).world;
      x = run(x, F, {
        type: 'place.use',
        placeId: 'lagos:university',
        service: 'evening-class',
      }).world;
      return x;
    };
    const a = cmds(placesOnly());
    const b = cmds(placesOnly());
    expect(a.players[F]).toEqual(b.players[F]);
    expect(a.players[F]!.errands).toBeUndefined();
  });
});

describe('errands: food, clothes and medicine', () => {
  it('buys food at the grocer: hunger filled, the grocer paid, money whole', () => {
    let w = thaw(feedbackWorld());
    w.players[F]!.needs = { hunger: 20, hygiene: 70, fun: 70, social: 70 };
    const g = bizOf(w, 'grocer');
    const money0 = moneyByCurrency(w);
    const till = w.accounts[g.account]!.balance;
    const r = run(w, F, { type: 'errand.do', at: `biz:${g.id}`, errand: 'groceries' });
    w = r.world;
    expect(w.players[F]!.needs!.hunger).toBe(60);
    expect(w.accounts[g.account]!.balance).toBe(till + r.result.fee);
    expect(r.result.fee).toBeGreaterThan(0);
    expect(moneyByCurrency(w)).toEqual(money0);
    // Full now: not again until you're hungry.
    const t = thaw(w);
    t.players[F]!.needs!.hunger = 100;
    const full = tryRun(t, F, { type: 'errand.do', at: `biz:${g.id}`, errand: 'groceries' });
    expect(!full.ok && full.error.message).toMatch(/not hungry/);
  });

  it('buys clothes at a stall: into the wardrobe and on you, once per colour', () => {
    const { w: w0, b } = withBiz(feedbackWorld(), 'fabric-stall');
    const r = run(w0, F, {
      type: 'errand.do',
      at: `biz:${b.id}`,
      errand: 'clothes',
      item: 'top-kaftan',
    });
    const p = r.world.players[F]!;
    expect(p.wardrobe?.some((x) => x.item === 'top-kaftan' && x.colour === '#7b1fa2')).toBe(true);
    expect(p.appearance?.topStyle).toBe('kaftan');
    const again = tryRun(r.world, F, {
      type: 'errand.do',
      at: `biz:${b.id}`,
      errand: 'clothes',
      item: 'top-kaftan',
    });
    expect(!again.ok && again.error.message).toMatch(/already have/);
    const wrong = tryRun(r.world, F, {
      type: 'errand.do',
      at: `biz:${b.id}`,
      errand: 'clothes',
      item: 'top-blazer',
    });
    expect(wrong.ok).toBe(false);
  });

  it('sells medicine only when you’re unwell', () => {
    const { w: w0, b } = withBiz(feedbackWorld(), 'pharmacy');
    const w = thaw(w0);
    w.players[F]!.health = 95;
    const well = tryRun(w, F, { type: 'errand.do', at: `biz:${b.id}`, errand: 'medicine' });
    expect(!well.ok && well.error.message).toMatch(/well/);
    w.players[F]!.health = 50;
    const r = run(w, F, { type: 'errand.do', at: `biz:${b.id}`, errand: 'medicine' });
    expect(r.world.players[F]!.health).toBeGreaterThan(50);
    // Once a day.
    const twice = tryRun(r.world, F, { type: 'errand.do', at: `biz:${b.id}`, errand: 'medicine' });
    expect(!twice.ok && twice.error.message).toMatch(/today/);
  });

  it('only offers a business’s own errands', () => {
    const w = feedbackWorld();
    const g = bizOf(w, 'grocer');
    const r = tryRun(w, F, { type: 'errand.do', at: `biz:${g.id}`, errand: 'medicine' });
    expect(!r.ok && r.error.code).toBe('errand.place');
    expect(KIND_ERRANDS.grocer).toContain('groceries');
  });
});

describe('errands: for a founder’s company', () => {
  it('builds a prototype at a workshop: build hours added, the company pays the workshop', () => {
    const { w: w0, b } = withBiz(feedbackWorld(), 'workshop');
    const money0 = moneyByCurrency(w0);
    const c0 = companyOf(w0, F);
    const r = run(w0, F, { type: 'errand.do', at: `biz:${b.id}`, errand: 'prototype' });
    const c1 = companyOf(r.world, F);
    expect(c1.buildHours).toBe(c0.buildHours + 12);
    expect(r.world.accounts[c1.account]!.balance).toBe(
      w0.accounts[c0.account]!.balance - r.result.fee,
    );
    expect(moneyByCurrency(r.world)).toEqual(money0);
    const twice = tryRun(r.world, F, { type: 'errand.do', at: `biz:${b.id}`, errand: 'prototype' });
    expect(!twice.ok && twice.error.message).toMatch(/this month/);
  });

  it('books a lawyer: the company’s papers filed, the fee paid to the firm', () => {
    const { w: w, b } = withBiz(feedbackWorld(), 'employer-law');
    // Cash for the papers, from the founder (company.inject).
    const w0 = run(w, F, {
      type: 'company.inject',
      companyId: companyOf(w, F).id,
      amount: w.markets.lagos!.data.costOfLiving * 100 * 2,
    }).world;
    const r = run(w0, F, { type: 'errand.do', at: `biz:${b.id}`, errand: 'lawyer' });
    expect(r.result.rule).toBeTruthy();
    const c = companyOf(r.world, F);
    expect(Object.values(c.compliance).filter(Boolean).length).toBeGreaterThan(
      Object.values(companyOf(w0, F).compliance).filter(Boolean).length,
    );
    expect(r.world.accounts[b.account]!.balance).toBe(
      w0.accounts[b.account]!.balance + r.result.fee,
    );
  });

  it('chats to waiting customers: customer discovery for a founder', () => {
    const { w: w0, b } = withBiz(feedbackWorld(), 'barber');
    const before = { ...companyOf(w0, F).product.discovery };
    const r = run(w0, F, { type: 'errand.do', at: `biz:${b.id}`, errand: 'chat' });
    expect(r.result.learned.discovery).toBeGreaterThan(0);
    const after = companyOf(r.world, F).product.discovery;
    expect(Object.keys(after).some((k) => (after[k] ?? 0) > (before[k] ?? 0))).toBe(true);
  });

  it('a paper gives a founder a sales lead, and the stand-up picks the day’s focus', () => {
    const w0 = feedbackWorld();
    const deals0 = (companyOf(w0, F).deals ?? []).length;
    const r = run(w0, F, { type: 'errand.do', at: 'newsstand', errand: 'paper' });
    expect(r.result.leads).toHaveLength(1);
    expect((companyOf(r.world, F).deals ?? []).length).toBe(deals0 + 1);
    const s = run(r.world, F, {
      type: 'errand.do',
      at: 'office',
      errand: 'standup',
      focus: 'build',
    });
    expect(companyOf(s.world, F).buildHours).toBeGreaterThan(companyOf(r.world, F).buildHours);
    const twice = tryRun(s.world, F, { type: 'errand.do', at: 'office', errand: 'standup' });
    expect(!twice.ok && twice.error.message).toMatch(/today/);
    // Tomorrow (yesterday's stand-up on the record), again.
    const t = thaw(s.world);
    t.players[F]!.errands!['lagos:standup']! -= 1;
    const again = run(t, F, { type: 'errand.do', at: 'office', errand: 'standup', focus: 'team' });
    expect(again.result.focus).toBe('team');
  });

  it('an investor’s paper brings a tip or a deal, never a lead', () => {
    const r = run(feedbackWorld(), I, { type: 'errand.do', at: 'newsstand', errand: 'paper' });
    expect(r.result.leads).toBeUndefined();
    expect(r.result.tip ?? r.result.pitches).toBeTruthy();
  });
});

describe('civic places: more to do (feedback note)', () => {
  /** Book an appointment and return the real time it starts. */
  const book = (w: World, id: string, actor = F) => {
    const b = run(w, actor, { type: 'place.book', placeId: id });
    const at = T0 + (b.result.appointment.at + 1 - gameMinute(w.markets.lagos!, T0)) * MS_PER_MIN;
    return { w: b.world, at };
  };

  it('lists the new services beside the old ones', () => {
    const v = playerView(feedbackWorld(), F, { now: T0, monthMs: DAY })!;
    const tax = v.market.cityPlaces!.places.find((p) => p.role === 'tax-office')!;
    expect(tax.services.map((s) => s.id)).toEqual([
      ...PLACE_SPECS['tax-office'].services,
      ...PLACE_SPECS['tax-office'].more!,
    ]);
    expect(v.market.errands!.errands.find((e) => e.id === 'paper')!.ok).toBe(true);
  });

  it('watches a case at the High Court, and the Tax Office checks your filings', () => {
    let { w, at } = book(feedbackWorld(), 'lagos:high-court');
    const c = run(
      w,
      F,
      { type: 'place.use', placeId: 'lagos:high-court', service: 'watch-case' },
      at,
    );
    expect(c.result.case.ruling).toBeTruthy();
    expect(c.result.case.lesson).toBeTruthy();
    w = c.world;
    ({ w, at } = book(w, 'lagos:tax-office'));
    const f = run(
      w,
      F,
      { type: 'place.use', placeId: 'lagos:tax-office', service: 'filing-check' },
      at,
    );
    expect(f.result.check.registered).toBe(false);
    const q = run(
      f.world,
      F,
      { type: 'place.use', placeId: 'lagos:tax-office', service: 'tax-clinic' },
      at,
    );
    expect(q.result.qa.q).toMatch(/\?$/);
  });

  it('the Chamber’s directory brings SME leads, and a doctor sees you when unwell', () => {
    const w0 = feedbackWorld();
    const r = run(w0, F, { type: 'place.use', placeId: 'lagos:chamber', service: 'directory' });
    expect(r.result.leads.length).toBeGreaterThan(0);
    const well = tryRun(r.world, F, {
      type: 'place.use',
      placeId: 'lagos:hospital',
      service: 'sick-care',
    });
    expect(!well.ok && well.error.message).toMatch(/well/);
    const sick = thaw(r.world);
    sick.players[F]!.health = 30;
    const money0 = moneyByCurrency(sick);
    const d = run(sick, F, { type: 'place.use', placeId: 'lagos:hospital', service: 'sick-care' });
    expect(d.world.players[F]!.health).toBe(50);
    expect(moneyByCurrency(d.world)).toEqual(money0);
  });
});

import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { isOpen, specOf } from '../src/economy.js';
import { fundScore } from '../src/fundraising.js';
import {
  LIFE_BARS,
  SPORT_KINDS,
  barEdge,
  barEffects,
  happinessOf,
  healthOf,
  rideCost,
  stressOf,
  walkCost,
} from '../src/lifebars.js';
import { computeHours } from '../src/personal.js';
import { LIFE_BARS_NOTE, RELEASES, exitsOn, journeyEventsOn, lifeBarsOn } from '../src/releases.js';
import { winChance } from '../src/sales.js';
import { playerView } from '../src/views.js';
import type { Command } from '../src/commands.js';
import type { Player, World } from '../src/types.js';
import { addFounder, companyOf, makeWorld, run, settle, tryRun } from './helpers.js';

const F = 'u_founder';
const edit = (w: World, f: (d: World) => void) => produce(w, f);
const announce = (w: World) =>
  run(w, null, { type: 'system.announce', id: LIFE_BARS_NOTE, text: 'Life bars.' }).world;
/** A founder created after the note (fresh defaults). */
const gated = () => addFounder(announce(makeWorld(42, ['lagos'])));
/** The same founder in a world that never logged the note. */
const plain = () => addFounder(makeWorld(42, ['lagos']));
const me = (w: World): Player => w.players[F]!;
const walk = (mode: 'walk' | 'cycle', minutes: number) =>
  ({ type: 'city.walk', mode, minutes }) as Command;
const open = (w: World) => Object.values(w.markets.lagos!.businesses ?? {}).filter(isOpen);

describe('life bars: the release switch', () => {
  it('is the newest note and turns the earlier switches on too', () => {
    expect(RELEASES.at(-1)).toBe(LIFE_BARS_NOTE);
    const w = { announcements: [LIFE_BARS_NOTE] } as unknown as World;
    expect(lifeBarsOn(w)).toBe(true);
    expect(exitsOn(w)).toBe(true);
    expect(journeyEventsOn(w)).toBe(true);
    expect(lifeBarsOn({ announcements: ['release-2026-10-16-exits'] } as unknown as World)).toBe(
      false,
    );
  });

  it('opens the stock market in a world that skipped the exits note', () => {
    const w = announce(makeWorld(42, ['lagos']));
    const listed = Object.values(w.companies).filter((c) => c.ipo?.status === 'listed');
    expect(listed.length).toBe(2);
  });
});

describe('life bars: state', () => {
  it('new humans start at health 80, stress 20; older players read 75 and 25', () => {
    const w = gated();
    expect(me(w).health).toBe(80);
    expect(me(w).stress).toBe(20);
    // Created before the note: nothing stored, the backfill is read.
    const old = announce(plain());
    expect(me(old).health).toBeUndefined();
    expect(healthOf(me(old))).toBe(LIFE_BARS.healthBackfill);
    expect(stressOf(me(old))).toBe(LIFE_BARS.stressBackfill);
    // AI players have no bars.
    expect(Object.values(w.players).filter((p) => p.ai && p.health !== undefined)).toHaveLength(0);
  });

  it('happiness is the average of fun and social', () => {
    const w = edit(gated(), (d) => {
      me(d).needs = { hunger: 10, hygiene: 10, fun: 61, social: 90 };
    });
    expect(happinessOf(me(w))).toBe(76);
  });
});

describe('life bars: walking and cycling (city.walk)', () => {
  it('costs hours and energy; long trips are exercise', () => {
    expect(walkCost('walk', 112)).toEqual({
      mode: 'walk',
      minutes: 112,
      hours: 1.87,
      energy: 8,
      health: 1,
    });
    expect(walkCost('cycle', 112)).toMatchObject({ hours: 0.93, energy: 6, health: 1 });
    expect(walkCost('walk', 10)).toMatchObject({ hours: 0.17, energy: 1, health: 0 });
    // Clamped to 1–240 minutes.
    expect(walkCost('walk', 999).minutes).toBe(240);
    expect(walkCost('walk', -5).minutes).toBe(1);

    const w = gated();
    const r = run(w, F, walk('walk', 112));
    expect(r.result).toMatchObject({ mode: 'walk', minutes: 112, hours: 1.87, energy: -8 });
    expect(r.result.health).toBe(1);
    expect(me(r.world).hours.used).toBeCloseTo(me(w).hours.used + 1.87, 6);
    expect(me(r.world).energy).toBe(me(w).energy - 8);
    expect(me(r.world).health).toBe(81);
    expect(r.result.bars).toEqual({ energy: 72, health: 81, happiness: 80, stress: 20 });
  });

  it('caps the health from walking each month', () => {
    let w = gated();
    for (let i = 0; i < 6; i++) w = run(w, F, walk('cycle', 40)).world;
    expect(me(w).health).toBe(80 + LIFE_BARS.walkHealthCap);
  });

  it('refuses when hours or energy are short, with a clear reason', () => {
    const short = edit(gated(), (d) => {
      me(d).hours.used = me(d).hours.available - 1;
    });
    const a = tryRun(short, F, walk('walk', 112));
    expect(a.ok).toBe(false);
    if (!a.ok) {
      expect(a.error.code).toBe('walk.hours');
      expect(a.error.message).toBe(
        'Not enough hours left this month to walk that far — take a bus or a taxi.',
      );
    }
    const tired = edit(gated(), (d) => {
      me(d).energy = 9;
    });
    const b = tryRun(tired, F, walk('walk', 20));
    expect(b.ok).toBe(false);
    if (!b.ok) {
      expect(b.error.code).toBe('walk.tired');
      expect(b.error.message).toBe('You’re too tired to walk that far — take a bus or a taxi.');
    }
  });

  it('is an unknown command before the release note', () => {
    const w = plain();
    const r = tryRun(w, F, walk('walk', 112));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('command.unknown');
    expect(r.world).toBe(w);
  });
});

describe('life bars: rides', () => {
  it('cost a little time (and a bus a little energy), returned in the result', () => {
    expect(rideCost('bus', 'medium')).toEqual({
      mode: 'bus',
      distance: 'medium',
      hours: 0.6,
      energy: 1,
    });
    const w = gated();
    const bus = run(w, F, { type: 'city.ride', mode: 'bus', distance: 'long' });
    expect(bus.result).toMatchObject({ hours: 0.9, energy: -1 });
    expect(me(bus.world).hours.used).toBeCloseTo(me(w).hours.used + 0.9, 6);
    expect(me(bus.world).energy).toBe(me(w).energy - 1);
    const taxi = run(w, F, { type: 'city.ride', mode: 'taxi', distance: 'short' });
    expect(taxi.result).toMatchObject({ hours: 0.15, energy: 0 });
    expect(me(taxi.world).energy).toBe(me(w).energy);
  });

  it('a ride is the rescue: with too few hours it uses what is left', () => {
    const w = edit(gated(), (d) => {
      me(d).hours.used = me(d).hours.available - 0.1;
    });
    const r = run(w, F, { type: 'city.ride', mode: 'bus', distance: 'long' });
    expect(r.result.hours).toBeCloseTo(0.1, 6);
    expect(me(r.world).hours.used).toBeCloseTo(me(r.world).hours.available, 6);
    const again = run(r.world, F, { type: 'city.ride', mode: 'taxi', distance: 'long' });
    expect(again.result.hours).toBe(0);
  });
});

describe('life bars: what you do moves them', () => {
  it('home acts: rest and fun ease stress, a workout and a meal help health, snacks hurt', () => {
    const w = edit(gated(), (d) => {
      me(d).stress = 50;
    });
    const act = (a: string) => run(w, F, { type: 'home.act', act: a } as Command);
    expect(me(act('sleep').world).stress).toBe(46);
    expect(me(act('nap').world).stress).toBe(49);
    expect(me(act('tv').world).stress).toBe(47);
    expect(me(act('read').world).stress).toBe(47);
    const workout = act('workout');
    expect(me(workout.world)).toMatchObject({ health: 84, stress: 48 });
    expect(workout.result.barChanges).toEqual({ health: 4, stress: -2 });
    expect(me(act('cook').world).health).toBe(81);
    expect(me(act('snack').world).health).toBe(79);
  });

  it('a sport venue helps health and stress; fun eases stress', () => {
    const w = edit(gated(), (d) => {
      me(d).stress = 50;
    });
    const gym = open(w).find((b) => SPORT_KINDS.includes(b.kind));
    expect(gym).toBeDefined();
    const session = specOf(gym!).venue!.items.find((x) => x.activity && !x.meeting)!;
    const r = run(w, F, { type: 'venue.buy', businessId: gym!.id, itemId: session.id });
    expect(r.result.barChanges).toEqual({ health: 4, stress: -2 });
    const fun = open(w)
      .filter((b) => !SPORT_KINDS.includes(b.kind))
      .flatMap((b) =>
        (specOf(b).venue?.items ?? [])
          .filter((x) => (x.fun ?? 0) >= 5 && !x.requiresTier && !x.travel && !x.meeting)
          .map((x) => ({ b, x })),
      )[0];
    expect(fun).toBeDefined();
    const night = run(w, F, { type: 'venue.buy', businessId: fun!.b.id, itemId: fun!.x.id });
    expect(night.result.barChanges.stress).toBe(-Math.round(fun!.x.fun! / 5));
  });

  it('seeing friends at home eases stress', () => {
    const w = edit(gated(), (d) => {
      me(d).stress = 50;
    });
    const r = run(w, F, { type: 'home.invite', personId: 'npc:lagos:1' });
    expect(me(r.world).stress).toBe(46);
  });

  it('work adds a little stress, at most 25 a month', () => {
    let w = edit(gated(), (d) => {
      me(d).hours.available = 1000;
    });
    const cid = companyOf(w, F).id;
    w = run(w, F, { type: 'company.build', companyId: cid, hours: 1 }).world;
    expect(me(w).stress).toBe(21);
    for (let i = 0; i < 30; i++)
      w = run(w, F, { type: 'company.build', companyId: cid, hours: 1 }).world;
    expect(me(w).stress).toBe(20 + LIFE_BARS.workStressCap);
    // A new month resets the counter.
    w = settle(w, 'lagos', 1);
    const s = me(w).stress!;
    w = run(w, F, { type: 'company.build', companyId: cid, hours: 1 }).world;
    expect(me(w).stress).toBe(s + 1);
  });
});

describe('life bars: month end', () => {
  it('overwork raises stress: 0.3 per hour over 140', () => {
    const base = gated();
    const rested = settle(base, 'lagos', 1);
    const worked = settle(
      edit(base, (d) => {
        me(d).hours.used = 200;
      }),
      'lagos',
      1,
    );
    expect(me(worked).stress! - me(rested).stress!).toBeCloseTo(0.3 * 60, 6);
  });

  it('health falls with neglect: hungry, dirty, stressed, burnt out', () => {
    const w = edit(gated(), (d) => {
      me(d).needs = { hunger: 0, hygiene: 0, fun: 80, social: 80 };
      me(d).stress = 95;
      me(d).energy = 5;
    });
    const after = me(settle(w, 'lagos', 1));
    expect(after.burnout).toBe(true);
    // −3 baseline, −8 hungry, −5 dirty, −6 stressed (still over 75), −5 burnout.
    expect(after.health).toBe(80 - 3 - 8 - 5 - 6 - 5);
  });

  it('unwell or stressed out costs hours next month, with a note', () => {
    // Crossing the lines sends a note (once, like burnout).
    const w = edit(gated(), (d) => {
      me(d).health = 26;
      me(d).stress = 84;
      me(d).hours.used = 200;
      me(d).needs = { hunger: 0, hygiene: 80, fun: 80, social: 80 };
    });
    const after = settle(w, 'lagos', 1);
    const p = me(after);
    expect(healthOf(p)).toBeLessThan(LIFE_BARS.unwellHealth);
    expect(stressOf(p)).toBeGreaterThan(LIFE_BARS.stressedOutStress);
    expect(p.hours.available).toBe(computeHours(p, true));
    expect(p.hours.available).toBeLessThan(computeHours(p, false) * 0.6);
    const notes = (after.inbox[F] ?? []).map((i) => i.text);
    expect(notes.some((t) => t.startsWith('You’re unwell.'))).toBe(true);
    expect(notes.some((t) => t.startsWith('You’re stressed out.'))).toBe(true);
  });
});

describe('life bars: odds', () => {
  it('barEdge reads tired, stressed, unwell, happy and feeling great', () => {
    const p = me(gated());
    expect(barEdge(p)).toBeCloseTo(0.04, 9); // energy 80, stress 20, happiness 80
    expect(barEdge({ ...p, energy: 20, stress: 80, health: 20 })).toBeCloseTo(-0.14 + 0.02, 9);
    expect(barEdge({ ...p, ai: true })).toBe(0);
  });

  it('changes the sales chance (within its clamps) only after the note', () => {
    const tire = (d: World) => {
      me(d).energy = 10;
      me(d).stress = 90;
      me(d).health = 10;
    };
    const chance = (w: World) => winChance(w, companyOf(w, F), companyOf(w, F).deals![0]!);
    const on = run(gated(), F, { type: 'sales.prospect' }).world;
    const lo = chance(edit(on, tire));
    expect(lo).toBeLessThan(chance(on));
    expect(lo).toBeGreaterThanOrEqual(0.05);
    // Before the note the same tired founder sells exactly as before.
    const off = run(plain(), F, { type: 'sales.prospect' }).world;
    expect(chance(edit(off, tire))).toBe(chance(off));
  });

  it('weighs on what a fund thinks of the pitch', () => {
    const w = gated();
    const fund = Object.values(w.funds).find((f) => f.market === 'lagos')!;
    const score = (x: World) => fundScore(x, fund, companyOf(x, F), ['problem']);
    const tired = edit(w, (d) => {
      me(d).energy = 10;
    });
    expect(score(tired)).toBeLessThan(score(w));
  });
});

describe('life bars: the view', () => {
  it('shows the bars and what they do, only after the note', () => {
    const v = playerView(gated(), F)!;
    expect(v.me.bars).toEqual({ energy: 80, health: 80, happiness: 80, stress: 20 });
    expect(v.me.barEffects!.map((e) => e.id)).toEqual(['happy', 'feeling-great']);
    const low = edit(gated(), (d) => {
      me(d).energy = 10;
      me(d).health = 10;
      me(d).stress = 90;
    });
    const fx = barEffects(me(low));
    expect(fx.map((e) => e.id)).toEqual(['tired', 'unwell', 'stressed-out', 'happy']);
    expect(fx.find((e) => e.id === 'tired')).toEqual({
      id: 'tired',
      text: 'Tired: sales and pitches are harder',
      tone: 'bad',
    });
    expect(playerView(plain(), F)!.me.bars).toBeUndefined();
    expect(playerView(plain(), F)!.me.barEffects).toBeUndefined();
  });
});

describe('life bars: worlds without the note play exactly as before', () => {
  it('rides, home acts, venues, work and settlement leave no bars and cost no extra time', () => {
    let w = plain();
    const hours0 = me(w).hours.used;
    const ride = run(w, F, { type: 'city.ride', mode: 'bus', distance: 'long' });
    expect(ride.result.hours).toBeUndefined();
    expect(me(ride.world).hours.used).toBe(hours0);
    w = ride.world;
    w = run(w, F, { type: 'home.act', act: 'workout' }).world;
    const sleep = run(w, F, { type: 'home.act', act: 'sleep' });
    expect(sleep.result.barChanges).toBeUndefined();
    w = sleep.world;
    const cid = companyOf(w, F).id;
    w = run(w, F, { type: 'company.build', companyId: cid, hours: 5 }).world;
    w = settle(w, 'lagos', 3);
    const p = me(w);
    expect(p.health).toBeUndefined();
    expect(p.stress).toBeUndefined();
    expect(p.workStress).toBeUndefined();
    expect(p.hours.available).toBe(computeHours(p));
    // The same log replays identically.
    let again = plain();
    again = run(again, F, { type: 'city.ride', mode: 'bus', distance: 'long' }).world;
    again = run(again, F, { type: 'home.act', act: 'workout' }).world;
    again = run(again, F, { type: 'home.act', act: 'sleep' }).world;
    again = run(again, F, { type: 'company.build', companyId: cid, hours: 5 }).world;
    again = settle(again, 'lagos', 3);
    expect(again).toEqual(w);
  });
});

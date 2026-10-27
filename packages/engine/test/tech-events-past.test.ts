/**
 * Play-test round 6, #42: on Day 23 the Events app listed this month's Day 8
 * to 22 events as on, and Attend on the Day 8 meetup charged the ticket and
 * said "You went". With the clock, the view marks events on a day already
 * gone as past, and with the feedback round they can't be attended.
 */
import { describe, expect, it } from 'vitest';
import { gameMinute, whenOf } from '../src/places.js';
import { FEEDBACK_NOTE, MORE_GAMES_NOTE } from '../src/releases.js';
import { techEventsFor } from '../src/social.js';
import { playerView } from '../src/views.js';
import type { World } from '../src/types.js';
import { T0, addFounder, makeWorld, run, tryRun } from './helpers.js';

const F = 'u_founder';
const announce = (w: World, id: string) =>
  run(w, null, { type: 'system.announce', id, text: 'New release.' }).world;
const world = (note: string) => addFounder(announce(makeWorld(5, ['lagos']), note));
const balance = (w: World) => w.accounts[w.players[F]!.accounts.local]!.balance;

describe('tech events this month', () => {
  // A legacy month is a real day, from midnight: most of the way through it, and its start.
  const start = T0 - 12 * 3_600_000;
  const late = start + 20 * 3_600_000;

  it('marks the days already gone as past, and keeps the rest on', () => {
    const w = world(FEEDBACK_NOTE);
    const m = w.markets.lagos!;
    const today = whenOf(gameMinute(m, late)).day;
    expect(today).toBeGreaterThan(20);
    const rows = playerView(w, F, { now: late, monthMs: 86_400_000 })!.market.techEvents!;
    const on = rows.filter((e) => e.status === 'on');
    expect(on.some((e) => e.past)).toBe(true);
    for (const e of on) expect(e.past).toBe(e.day < today);
    expect(rows.filter((e) => e.status === 'soon').every((e) => !e.past)).toBe(true);
    // At the start of the month nothing has gone yet.
    const first = playerView(w, F, { now: start, monthMs: 86_400_000 })!.market.techEvents!;
    expect(first.every((e) => !e.past)).toBe(true);
  });

  it('refuses a past event (feedback round), charging nothing; older worlds as before', () => {
    const w = world(FEEDBACK_NOTE);
    const m = w.markets.lagos!;
    const today = whenOf(gameMinute(m, late)).day;
    const gone = techEventsFor(w, m, m.month).find((e) => e.day < today && e.ticket > 0)!;
    const r = tryRun(w, F, { type: 'techevent.attend', eventId: gone.id }, late);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('techevent.over');
    expect(balance(r.world)).toBe(balance(w));
    const ahead = techEventsFor(w, m, m.month).find((e) => e.day >= today);
    if (ahead)
      expect(tryRun(w, F, { type: 'techevent.attend', eventId: ahead.id }, late).ok).toBe(true);
    const old = world(MORE_GAMES_NOTE);
    const om = old.markets.lagos!;
    const was = techEventsFor(old, om, om.month).find((e) => e.day < today)!;
    expect(tryRun(old, F, { type: 'techevent.attend', eventId: was.id }, late).ok).toBe(true);
  });
});

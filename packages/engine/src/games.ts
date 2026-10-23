/**
 * More games (data/games.ts; switched on by the more-games release note):
 *
 * - Each city's bowling alley, skydive centre and heliport open as local
 *   businesses (`ensureGameVenues`), at the note and then at each settlement,
 *   keyed so each opens once; they never close (like the professional
 *   employers).
 * - Bowling is a play room (play.ts, bowling.ts): solo, against AI or other
 *   players, each bowler paying the lane fee to the alley's till.
 * - `games.book`: a tandem or solo skydive, a helicopter tour or a private
 *   charter. The price (the venue item's, behind its lifestyle tier) goes to
 *   the venue's till; the jump or flight takes hours and energy and is fun
 *   and calming. The experience plays on the client (over the real 3D city).
 * - `games.land`: the skydive's landing, handed in once: the engine scores it
 *   (`skydiveScore`: the pull, the landing, the style) and keeps your best.
 *
 * Replay: worlds without the note never open the venues and refuse both
 * commands, so they replay exactly as before.
 */
import { AIR_ACTIVITIES, GAME_VENUES, SKYDIVE, gameVenueKey } from './data/games.js';
import type { GameVenueKind } from './data/games.js';
import type { MarketId } from './data/markets.js';
import {
  businessesOf,
  ensureBusinesses,
  isOpen,
  openBusiness,
  specOf,
  tierLock,
  venuePrice,
} from './economy.js';
import { ensure } from './errors.js';
import { getMarket, hoursLeft, locationOf } from './helpers.js';
import { newId } from './ids.js';
import { account, costIn, payExact } from './ledger.js';
import { bumpEnergy } from './lifebars.js';
import { clamp } from './math.js';
import { formatMoney } from './money.js';
import { bumpNeed, needsOf } from './needs.js';
import { moreGamesOn } from './releases.js';
import { deriveRng } from './rng.js';
import type { Id, LocalBusiness, MarketState, Player, PlayerGames, World } from './types.js';

/**
 * Open the city's game venues that aren't open yet (more-games worlds only).
 * Own RNG stream, keyed so each opens once.
 */
export function ensureGameVenues(world: World, marketId: MarketId, month: number) {
  if (!moreGamesOn(world)) return;
  const m = world.markets[marketId];
  if (!m) return;
  ensureBusinesses(world, marketId);
  const all = Object.values(businessesOf(m));
  const rng = deriveRng(world.seed, 'games', 'venues', marketId, month);
  for (const seed of GAME_VENUES[marketId] ?? []) {
    const key = gameVenueKey(seed.kind);
    if (all.some((b) => b.landmark === key && isOpen(b))) continue;
    const b = openBusiness(world, m, -1, rng, month, true, {
      name: seed.name,
      kind: seed.kind,
      district: seed.district,
      street: seed.street ?? null,
      owner: seed.owner,
    });
    if (b) {
      b.landmark = key;
      b.seed = -2;
    }
  }
}

/** The city's open venue of this kind (its game venue first), if any. */
export function gameVenueOf(m: MarketState, kind: GameVenueKind): LocalBusiness | null {
  const open = Object.values(businessesOf(m))
    .filter((b) => isOpen(b) && b.kind === kind)
    .sort(
      (a, z) =>
        Number(z.landmark === gameVenueKey(kind)) - Number(a.landmark === gameVenueKey(kind)) ||
        (a.id < z.id ? -1 : a.id > z.id ? 1 : 0),
    );
  return open[0] ?? null;
}

const recordOf = (p: Player): PlayerGames =>
  (p.games ??= { jumps: 0, flights: 0, bestJump: 0, booked: null });

/** Book a jump or a flight here and now: pay the venue, spend the hours, feel it. */
export function bookAir(world: World, me: Player, businessId: Id, itemId: string) {
  ensure(moreGamesOn(world), 'games.off', 'Unknown command.');
  const m = getMarket(world, locationOf(me));
  const b = m.businesses?.[businessId];
  ensure(b && isOpen(b), 'games.venue', 'That place isn’t open in this city.');
  const it = specOf(b).venue?.items.find((x) => x.id === itemId);
  const air = AIR_ACTIVITIES[itemId];
  ensure(it && air, 'games.item', `${b.name} doesn’t offer that.`);
  const locked = tierLock(me, it);
  ensure(!locked, 'venue.tier', locked ?? '');
  ensure(
    hoursLeft(me) >= air.hours,
    'games.hours',
    `${it.label} takes ${air.hours} ${air.hours === 1 ? 'hour' : 'hours'}; you don’t have them this month.`,
  );
  const price = venuePrice(world, m, b, it);
  const mine = account(world, me.accounts.local);
  ensure(
    mine.balance >= costIn(world, price, m.data.currency, mine.currency),
    'games.funds',
    `That costs ${formatMoney(price, m.data.currency)}; you don’t have it.`,
  );
  payExact(world, me.accounts.local, b.account, price, `${it.label} at ${b.name}`, m.month);
  me.hours.used += air.hours;
  const energy = Math.round(bumpEnergy(me, air.energy));
  const fun = bumpNeed(me, 'fun', air.fun);
  const social = bumpNeed(me, 'social', air.social);
  const rec = recordOf(me);
  if (air.kind === 'skydive') rec.jumps++;
  else rec.flights++;
  const id = newId(world, 'air');
  rec.booked = { id, item: itemId, businessId: b.id, month: m.month };
  return {
    bookingId: id,
    item: itemId,
    kind: air.kind,
    venue: { id: b.id, name: b.name },
    price,
    hours: air.hours,
    energy,
    effects: { fun, social },
    needs: needsOf(me),
    /** Stress the jump or the flight eases (applied with the life bars). */
    barsFx: { stress: air.stress },
    message: `${it.label} at ${b.name}: ${formatMoney(price, m.data.currency)}.`,
  };
}

/**
 * A jump's score from how it went: the pull (the canopy open in the best
 * band, less the lower or higher it was), the landing (closer to the
 * target's centre is better; a bullseye earns a bonus) and the style in
 * freefall (0–100, from the client's steadiness: shown, never trusted more
 * than its points).
 */
export function skydiveScore(j: { deployAt: number; miss: number; style: number }) {
  const [lo, hi] = SKYDIVE.deployBest;
  const d = j.deployAt;
  const pull =
    d < SKYDIVE.deployLow
      ? 0
      : d < lo
        ? SKYDIVE.pullPts * ((d - SKYDIVE.deployLow) / (lo - SKYDIVE.deployLow))
        : d > hi
          ? Math.max(0, SKYDIVE.pullPts - (d - hi) * 0.25)
          : SKYDIVE.pullPts;
  const miss = Math.max(0, j.miss);
  const land = SKYDIVE.landPts * Math.max(0, 1 - miss / SKYDIVE.landRange);
  const bull = miss <= SKYDIVE.bullseye ? SKYDIVE.bullseyePts : 0;
  const style = (clamp(j.style, 0, 100) / 100) * SKYDIVE.stylePts;
  const score = Math.round(pull + land + bull + style);
  return {
    score,
    pull: Math.round(pull),
    land: Math.round(land + bull),
    style: Math.round(style),
    grade: score >= 800 ? 'gold' : score >= SKYDIVE.great ? 'silver' : score >= 300 ? 'bronze' : '',
  } as const;
}

/** Hand in the jump you booked: the engine scores it once and keeps your best. */
export function landJump(
  world: World,
  me: Player,
  j: { bookingId: Id; deployAt: number; miss: number; style: number },
) {
  ensure(moreGamesOn(world), 'games.off', 'Unknown command.');
  const rec = me.games;
  const booked = rec?.booked;
  ensure(
    rec && booked && booked.id === j.bookingId,
    'games.booking',
    'There’s no jump booked to land.',
  );
  ensure(AIR_ACTIVITIES[booked.item]?.kind === 'skydive', 'games.booking', 'That was a flight.');
  const m = getMarket(world, locationOf(me));
  const s = skydiveScore(j);
  rec.booked = null;
  const prev = rec.bestJump;
  rec.bestJump = Math.max(prev, s.score);
  rec.lastJump = {
    score: s.score,
    miss: Math.round(j.miss * 10) / 10,
    deployAt: Math.round(j.deployAt),
    style: Math.round(clamp(j.style, 0, 100)),
    month: m.month,
  };
  const great = s.score >= SKYDIVE.great;
  const fun = great ? bumpNeed(me, 'fun', 4) : 0;
  return {
    ...s,
    best: rec.bestJump,
    record: s.score > prev,
    effects: { fun },
    barsFx: great ? { stress: -2 } : undefined,
    message: `Landed: ${s.score} points${great ? ' — a great jump' : ''}.`,
  };
}

/** A flight you booked is over (a helicopter ride, or a jump you didn't hand in). */
export function endFlight(me: Player, bookingId: Id) {
  const rec = me.games;
  ensure(rec?.booked?.id === bookingId, 'games.booking', 'There’s nothing booked to end.');
  rec.booked = null;
  return { ok: true };
}

/** The city's game venues, what they offer at your tier, and your record. */
export function gamesView(world: World, me: Player) {
  if (!moreGamesOn(world)) return null;
  const m = getMarket(world, locationOf(me));
  const venue = (kind: GameVenueKind) => {
    const b = gameVenueOf(m, kind);
    if (!b) return null;
    return {
      businessId: b.id,
      name: b.name,
      district: b.district,
      items: (specOf(b).venue?.items ?? [])
        .filter((it) => it.activity)
        .map((it) => ({
          id: it.id,
          label: it.label,
          price: venuePrice(world, m, b, it),
          requiresTier: it.requiresTier ?? 1,
          locked: tierLock(me, it) !== null,
          hours: AIR_ACTIVITIES[it.id]?.hours ?? 1,
        })),
    };
  };
  const rec = me.games;
  return {
    currency: m.data.currency,
    bowling: venue('bowling-alley'),
    skydive: venue('skydive-centre'),
    heli: venue('heliport'),
    skydiveRules: SKYDIVE,
    you: {
      bowling: rec?.bowling ?? null,
      jumps: rec?.jumps ?? 0,
      flights: rec?.flights ?? 0,
      bestJump: rec?.bestJump ?? 0,
      lastJump: rec?.lastJump ?? null,
      booked: rec?.booked ?? null,
    },
  };
}

export { recordOf as gamesRecordOf };

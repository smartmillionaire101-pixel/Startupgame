/**
 * "What to do now" (docs/WAVE5-FUN-LIFE-AND-CAPITAL.md §D): three simple
 * suggestions for this player right now, computed from the view, each one
 * tap away (a place id the City walks to: `biz:<id>`, `cap:<id>`, `hub`,
 * `eventhall`, `market`, `home`, `office`, `golf`, `mall`, `civic:<id>`,
 * `playerbank:<id>`, or `sky:<id>` for a sky view). Pure: the card and the
 * tests share it.
 *
 * Player feedback ("What to do is always clubbing; it should be a proper
 * experience and based on time of day"): what comes up follows the city's
 * local time of day (morning, day, evening, night), your role and your life
 * bars, and it varies: a `seed` turns the choice among equally good places,
 * and places you went to `recent`ly step back. Only places in the city.
 */
import { skyViewsIn, type PlayerView } from '@runway/engine';
import { activeCompany, angelsOf, businessesOf, type BusinessView } from './contract';
import {
  acceleratorsOf,
  angelsAtOf,
  devPartnersOf,
  jobsOf,
  lunchVenueOf,
  lunchVenues,
  myJobOf,
  venueItemsOf,
} from './life';
import { eventsOf } from './people';
import { pocketOf } from './pocket';
import { businessRoom, FUN_ROOMS, type RoomKind } from './rooms';
import { localHour } from './travel';

type SuggestionKind =
  | 'fun'
  | 'job'
  | 'gig'
  | 'eat'
  | 'angel'
  | 'accelerator'
  | 'grant'
  | 'sell'
  | 'event'
  | 'customers'
  | 'hub'
  // Time of day (player feedback): meals, a workout, work, leisure and sleep.
  | 'breakfast'
  | 'lunch'
  | 'dinner'
  | 'cook'
  | 'gym'
  | 'work'
  | 'mall'
  | 'golf'
  | 'cinema'
  | 'drinks'
  | 'spa'
  | 'sky'
  | 'sleep';

/** Untranslated parts: the card builds the sentence (so French gets a whole sentence). */
export interface Suggestion {
  kind: SuggestionKind;
  placeId: string;
  /** Who or what: a business, an angel, a programme… */
  name: string;
  /** Where, when it isn't the name (the café an angel is at). */
  where?: string;
  /**
   * A role or a dish. For `work`, what the work is: `office` (founders),
   * `bank` (your bank), `central-bank` (the licence), `deals` (investors).
   * For `golf` and `sky`, `calm` when it's suggested to bring stress down.
   */
  detail?: string;
  /** Minor units, when it matters (pay, price). */
  amount?: number;
  /** Fun: it's evening or night in the city. */
  night?: boolean;
}

/** The four parts of a city's day. */
export type DayPart = 'morning' | 'day' | 'evening' | 'night';
export const DAY_PARTS: readonly DayPart[] = ['morning', 'day', 'evening', 'night'];

/** Morning 6–10, day 10–17, evening 17–21, night 21–6 (local hours). */
export function dayPartOf(hour: number): DayPart {
  const h = ((hour % 24) + 24) % 24;
  if (h >= 6 && h < 10) return 'morning';
  if (h >= 10 && h < 17) return 'day';
  if (h >= 17 && h < 21) return 'evening';
  return 'night';
}

/** A typical hour in each part (the day strip's picks). */
export const PART_HOUR: Record<DayPart, number> = { morning: 8, day: 13, evening: 19, night: 22 };

export interface PickOptions {
  /** Turns the choice among equally good places (the card uses the hour, so it changes). */
  seed?: number;
  /** Place ids you went to lately: they step back so the same one doesn't come up every time. */
  recent?: readonly string[];
  /** Which place ids exist in the city (the map's); by default every city place does. */
  has?: (placeId: string) => boolean;
}

/** What every pick shares. */
interface Ctx {
  view: PlayerView;
  biz: BusinessView[];
  pocket: number;
  seed: number;
  recent: ReadonlySet<string>;
  has: (placeId: string) => boolean;
}

/**
 * One of `xs` (best first): the first you haven't been to lately among the
 * top three, turned by the seed; all recent, the seed picks among them.
 */
function vary<T>(c: Ctx, xs: T[], id: (x: T) => string): T | null {
  const fresh = xs.filter((x) => !c.recent.has(id(x)));
  const pool = (fresh.length ? fresh : xs).slice(0, 3);
  return pool.length ? pool[Math.abs(c.seed) % pool.length]! : null;
}

const roomOf = (b: BusinessView): RoomKind => businessRoom(b.kind, b.look.shape);

/**
 * A thing to do (Wave 6 §A2) at a fun place of one of `rooms` you can
 * afford, the most fun for the money first.
 */
function venueFor(
  c: Ctx,
  rooms: ReadonlySet<RoomKind>,
  night: boolean,
): { b: BusinessView; label: string; price: number } | null {
  const best = c.biz
    .filter((b) => rooms.has(roomOf(b)))
    .flatMap((b) => {
      const items = venueItemsOf(c.view, b.id).filter(
        (i) => i.activity && i.price > 0 && i.price <= c.pocket,
      );
      const top = items.sort(
        (x, y) => y.fun * 2 + y.meetChance * 10 - (x.fun * 2 + x.meetChance * 10),
      )[0];
      if (!top) return [];
      const room = roomOf(b);
      return [
        {
          b,
          label: top.label,
          price: top.price,
          score:
            (night && (room === 'club' || room === 'stage' || room === 'karaoke') ? 20 : 0) +
            top.fun * 2 +
            top.meetChance * 10,
        },
      ];
    })
    .sort((x, y) => y.score - x.score || x.price - y.price || (x.b.id < y.b.id ? -1 : 1));
  return vary(c, best, (x) => `biz:${x.b.id}`);
}

/** A night out: clubs, live music, karaoke, then the best of the rest. */
function funFor(c: Ctx, night: boolean, rooms: ReadonlySet<RoomKind> = FUN_ROOMS) {
  const v = venueFor(c, rooms, night);
  return v
    ? ({
        kind: 'fun',
        placeId: `biz:${v.b.id}`,
        name: v.b.name,
        detail: v.label,
        amount: v.price,
        night,
      } satisfies Suggestion)
    : null;
}

/** A place of one of `rooms` with something to do you can afford, as `kind`. */
function outing(c: Ctx, kind: 'cinema' | 'drinks' | 'spa' | 'gym', rooms: RoomKind[]) {
  const v = venueFor(c, new Set(rooms), false);
  return v
    ? ({
        kind,
        placeId: `biz:${v.b.id}`,
        name: v.b.name,
        detail: v.label,
        amount: v.price,
      } satisfies Suggestion)
    : null;
}

/** A meal you can afford: at a café for breakfast, a restaurant for lunch and dinner. */
function mealFor(c: Ctx, kind: 'breakfast' | 'lunch' | 'dinner' | 'eat'): Suggestion | null {
  const meals = c.biz
    .flatMap((b) => (b.venue?.items ?? []).map((i) => ({ b, i })))
    // Food and drink: not a thing to do (play-test: "Eat at … Wellness Spa — Massage").
    .filter((x) => (x.i.energy ?? 0) > 0 && !x.i.activity && x.i.price <= c.pocket);
  const want: RoomKind = kind === 'breakfast' ? 'cafe' : 'restaurant';
  const preferred = kind === 'eat' ? meals : meals.filter((x) => roomOf(x.b) === want);
  // Tired: the most filling. A meal out: the seed turns the place, cheaper first.
  const sorted = (preferred.length ? preferred : meals).sort((a, b) =>
    kind === 'eat'
      ? (b.i.energy ?? 0) - (a.i.energy ?? 0) || a.i.price - b.i.price
      : a.i.price - b.i.price || (a.b.id < b.b.id ? -1 : 1),
  );
  // One per place.
  const one = sorted.filter((x, k) => sorted.findIndex((y) => y.b.id === x.b.id) === k);
  const meal = kind === 'eat' ? (one[0] ?? null) : vary(c, one, (x) => `biz:${x.b.id}`);
  return meal
    ? {
        kind,
        placeId: `biz:${meal.b.id}`,
        name: meal.b.name,
        detail: meal.i.label,
        amount: meal.i.price,
      }
    : null;
}

/** The golf course or the mall (their map ids are their kinds), when the city has it. */
const leisurePlace = (c: Ctx, kind: 'mall' | 'golf', calm = false): Suggestion | null =>
  c.has(kind) ? { kind, placeId: kind, name: '', ...(calm ? { detail: 'calm' } : {}) } : null;

/** A sky view in this city (the sunset, or a walk up to clear your head). */
function skyFor(c: Ctx, calm = false): Suggestion | null {
  const views = skyViewsIn(c.view.here?.id ?? c.view.market.id);
  const v = vary(c, views, (x) => `sky:${x.id}`);
  return v
    ? { kind: 'sky', placeId: `sky:${v.id}`, name: v.name, ...(calm ? { detail: 'calm' } : {}) }
    : null;
}

/**
 * A banker's work as a place on the map: their own bank once it's licensed,
 * the Central Bank while the licence still needs the interview; else none
 * (negotiating with shareholders happens on the Bank tab).
 */
function bankerWork(c: Ctx): Suggestion | null {
  const banker = (
    c.view as {
      banker?: {
        centralBank: string;
        bank: { status: string; licence?: { missing: string[] } | null } | null;
      } | null;
    }
  ).banker;
  const own = c.view.bank;
  const listed = own && c.view.market.banks.find((b) => b.id === own.id);
  if (listed)
    return { kind: 'work', placeId: `playerbank:${listed.id}`, name: listed.name, detail: 'bank' };
  const lic = banker?.bank?.status === 'applying' ? banker.bank.licence : null;
  if (banker?.centralBank && lic?.missing.includes('interview'))
    return {
      kind: 'work',
      placeId: `civic:${banker.centralBank}`,
      name: '',
      detail: 'central-bank',
    };
  return null;
}

/** Your work in the day, by role: a founder's leads, a banker's bank, an investor's deal flow. */
function workFor(c: Ctx, part: DayPart): Suggestion[] {
  const { view, biz } = c;
  const out: Suggestion[] = [];
  const company = activeCompany(view);
  const role = view.me.role;
  if (role === 'banker') {
    const w = bankerWork(c);
    if (w) out.push(w);
  } else if (role === 'investor' && !company) {
    out.push({ kind: 'work', placeId: 'hub', name: '', detail: 'deals' });
  }
  if (!company) return out;
  if (part === 'morning' && c.has('office'))
    out.push({ kind: 'work', placeId: 'office', name: company.name, detail: 'office' });

  // An angel at a café.
  const at = angelsAtOf(view);
  let found: { angel: string; biz: string } | null = null;
  if (at) {
    for (const [bizId, xs] of Object.entries(at))
      if (xs[0] && biz.some((b) => b.id === bizId)) {
        found = { angel: xs[0].name, biz: bizId };
        break;
      }
  } else {
    const venues = lunchVenues(view);
    const a = angelsOf(view)[0];
    const v = a ? lunchVenueOf(a.id, venues) : null;
    if (a && v) found = { angel: a.name, biz: v };
  }
  if (found)
    out.push({
      kind: 'angel',
      placeId: `biz:${found.biz}`,
      name: found.angel,
      where: biz.find((b) => b.id === found.biz)?.name ?? '',
    });

  // An accelerator (or a grant) to apply to.
  const acc = acceleratorsOf(view).find((a) => !a.status && a.eligible);
  if (acc) out.push({ kind: 'accelerator', placeId: `cap:${acc.id}`, name: acc.name });
  const grant = devPartnersOf(view)
    .flatMap((p) => p.programs.filter((g) => g.eligible && !g.status).map((g) => ({ p, g })))
    .at(0);
  if (grant)
    out.push({
      kind: 'grant',
      placeId: `cap:${grant.p.id}`,
      name: grant.g.label,
      where: grant.p.name,
    });

  // A business that buys what you sell, with nobody supplying it yet.
  const lead = biz
    .filter((b) => b.you.canPitch && !b.you.customer)
    .map((b) => ({ b, want: b.buys.find((x) => x.sector === company.industry && !x.supplier) }))
    .filter((x) => x.want)
    .sort((a, b) => b.want!.monthlyBudget - a.want!.monthlyBudget)[0];
  if (lead)
    out.push({
      kind: 'sell',
      placeId: `biz:${lead.b.id}`,
      name: lead.b.name,
      amount: lead.want!.monthlyBudget,
    });
  out.push({ kind: 'customers', placeId: 'market', name: '' });
  return out;
}

/** An event to go to (the Event Hall's tech events). */
function eventFor(c: Ctx): Suggestion | null {
  const event = (eventsOf(c.view) ?? []).find(
    (e) => e.status === 'upcoming' && !e.youHost && !e.youGoing,
  );
  return event
    ? { kind: 'event', placeId: 'eventhall', name: event.title, where: event.dateLabel }
    : null;
}

/** What fits this part of the day, most fitting first (work first in the day). */
function partPicks(c: Ctx, part: DayPart): (Suggestion | null)[] {
  const broke = c.pocket < (c.view.market.costOfLiving || 1) * 0.5;
  const leisure = (xs: (Suggestion | null)[]) => (broke ? [] : xs);
  switch (part) {
    case 'morning':
      return [
        mealFor(c, 'breakfast'),
        ...workFor(c, part).slice(0, 1),
        outing(c, 'gym', ['gym']),
        c.has('home') ? { kind: 'cook', placeId: 'home', name: '' } : null,
      ];
    case 'day': {
      const work = workFor(c, part);
      return [
        ...work.slice(0, 2),
        mealFor(c, 'lunch'),
        ...leisure([leisurePlace(c, 'mall'), leisurePlace(c, 'golf')]),
        ...work.slice(2),
      ];
    }
    case 'evening':
      return [
        eventFor(c),
        ...leisure([
          mealFor(c, 'dinner'),
          outing(c, 'cinema', ['cinema']),
          outing(c, 'drinks', ['bar', 'lounge']),
        ]),
        skyFor(c),
      ];
    case 'night':
      return [
        ...leisure([
          funFor(c, true, new Set<RoomKind>(['club', 'stage', 'karaoke', 'bar', 'lounge'])),
        ]),
        c.has('home') ? { kind: 'sleep', placeId: 'home', name: '' } : null,
      ];
  }
}

/**
 * Up to `max` suggestions, most urgent first. `hour` is the local hour in
 * the city: the part of the day picks what fits (breakfast and the gym in the
 * morning, work and lunch in the day, dinner and events in the evening, a
 * night out or sleep at night); money, energy and stress come first.
 */
export function suggestionsFor(
  view: PlayerView,
  max = 3,
  hour = localHour(view.market.id),
  opts: PickOptions = {},
): Suggestion[] {
  return pick(view, max, hour, opts, true);
}

/** The picks; `urgent` puts money, energy and stress first. */
function pick(
  view: PlayerView,
  max: number,
  hour: number,
  opts: PickOptions,
  urgent: boolean,
): Suggestion[] {
  const out: Suggestion[] = [];
  const add = (s: Suggestion | null | undefined) => {
    if (s && out.length < max && !out.some((x) => x.placeId === s.placeId)) out.push(s);
  };
  // Abroad, what your money buys at this city's prices.
  const pocket = pocketOf(view).balance;
  const has = opts.has ?? (() => true);
  const c: Ctx = {
    view,
    // Only businesses the map has a door for: the golf club is the city's
    // golf course (its own place, `golf`; see cityInput), so a `biz:` id
    // for it would lead nowhere when tapped.
    biz: businessesOf(view).filter((b) => b.open && b.kind !== 'golf-club' && has(`biz:${b.id}`)),
    pocket,
    seed: opts.seed ?? 0,
    recent: new Set(opts.recent ?? []),
    has,
  };
  const col = view.market.costOfLiving || 1;
  const broke = pocket < col * 0.5;
  /** Under two months of living costs and no job: work comes up first. */
  const low = pocket < col * 2;
  const tired = urgent && view.me.energy < 45;
  const exhausted = view.me.energy < 25;
  const stressed = urgent && (view.me.bars?.stress ?? 0) >= 60;
  const part = dayPartOf(hour);
  const late = part === 'night';

  // 1. Low on money: a job (section A), else the best-paid shift.
  if (urgent && low && !myJobOf(view)) {
    const job = jobsOf(view).find((j) => c.biz.some((b) => b.id === j.businessId));
    if (job)
      add({
        kind: 'job',
        placeId: `biz:${job.businessId}`,
        name: job.businessName,
        detail: job.label,
        amount: job.monthlyPay,
      });
    else {
      const gig = c.biz
        .flatMap((b) => b.gigs.map((g) => ({ b, g })))
        .filter((x) => x.g.hours <= view.me.hours.left)
        .sort((a, b) => b.g.pay - a.g.pay)[0];
      if (gig)
        add({
          kind: 'gig',
          placeId: `biz:${gig.b.id}`,
          name: gig.b.name,
          detail: gig.g.label,
          amount: gig.g.pay,
        });
    }
  }

  // 2. Low on energy: sleep (first at night or when exhausted), and eat.
  const sleep = c.has('home') ? ({ kind: 'sleep', placeId: 'home', name: '' } as const) : null;
  if (tired && (late || exhausted)) add(sleep);
  if (tired) add(mealFor(c, 'eat'));

  // 3. Stressed: something calm (a spa, a round of golf, a walk up to a view).
  if (stressed) {
    const calm = [outing(c, 'spa', ['spa']), leisurePlace(c, 'golf', true), skyFor(c, true)].filter(
      (x): x is Suggestion => !!x,
    );
    add(vary(c, calm, (x) => x.placeId));
  }

  // 4. What fits this part of the day.
  for (const s of partPicks(c, part)) add(s || null);

  // 5. Always something: an event, the Hub, a night out you can afford, a shift.
  add(eventFor(c));
  if (!broke && !low) add(funFor(c, late || part === 'evening'));
  add({ kind: 'hub', placeId: 'hub', name: '' });
  if (!broke) {
    const gig = c.biz.flatMap((b) => b.gigs.map((g) => ({ b, g })))[0];
    if (gig)
      add({
        kind: 'gig',
        placeId: `biz:${gig.b.id}`,
        name: gig.b.name,
        detail: gig.g.label,
        amount: gig.g.pay,
      });
  }
  return out;
}

/**
 * The day at a glance (Today's strip): the top pick for each part of the
 * day, without the urgent ones (money, energy, stress), which the list shows.
 */
export function dayPlanFor(
  view: PlayerView,
  opts: PickOptions = {},
): Record<DayPart, Suggestion | null> {
  return Object.fromEntries(
    DAY_PARTS.map((p) => [p, pick(view, 1, PART_HOUR[p], opts, false)[0] ?? null]),
  ) as Record<DayPart, Suggestion | null>;
}

/**
 * "What to do now" (docs/WAVE5-FUN-LIFE-AND-CAPITAL.md §D): three simple
 * suggestions for this player right now, computed from the view, each one
 * tap away (a place id the City walks to: `biz:<id>`, `cap:<id>`, `hub`,
 * `eventhall`, `market`). Pure: the card and the tests share it.
 */
import type { PlayerView } from '@runway/engine';
import { activeCompany, angelsOf, businessesOf } from './contract';
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
import { businessRoom, FUN_ROOMS } from './rooms';
import { isNight, localHour } from './travel';

export type SuggestionKind =
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
  | 'hub';

/** Untranslated parts: the card builds the sentence (so French gets a whole sentence). */
export interface Suggestion {
  kind: SuggestionKind;
  placeId: string;
  /** Who or what: a business, an angel, a programme… */
  name: string;
  /** Where, when it isn't the name (the café an angel is at). */
  where?: string;
  /** A role or a dish. */
  detail?: string;
  /** Minor units, when it matters (pay, price). */
  amount?: number;
  /** Fun: it's evening or night in the city. */
  night?: boolean;
}

/**
 * The best night out you can afford: a thing to do (Wave 6 §A2) at a fun
 * place, clubs and live music first, then the most fun for the money.
 */
function funFor(view: PlayerView, pocket: number, night: boolean): Suggestion | null {
  const best = businessesOf(view)
    .filter((b) => b.open)
    .flatMap((b) => {
      const room = businessRoom(b.kind, b.look.shape);
      if (!FUN_ROOMS.has(room)) return [];
      return venueItemsOf(view, b.id)
        .filter((i) => i.activity && i.price > 0 && i.price <= pocket)
        .map((i) => ({
          b,
          i,
          score:
            (night && (room === 'club' || room === 'stage' || room === 'karaoke') ? 20 : 0) +
            i.fun * 2 +
            i.meetChance * 10,
        }));
    })
    .sort((x, y) => y.score - x.score || x.i.price - y.i.price || (x.b.id < y.b.id ? -1 : 1))[0];
  return best
    ? {
        kind: 'fun',
        placeId: `biz:${best.b.id}`,
        name: best.b.name,
        detail: best.i.label,
        amount: best.i.price,
        night,
      }
    : null;
}

/**
 * Up to `max` suggestions, most urgent first. `hour` is the local hour in
 * the city (evenings suggest going out).
 */
export function suggestionsFor(
  view: PlayerView,
  max = 3,
  hour = localHour(view.market.id),
): Suggestion[] {
  const out: Suggestion[] = [];
  const add = (s: Suggestion | null | undefined) => {
    if (s && out.length < max && !out.some((x) => x.placeId === s.placeId)) out.push(s);
  };
  const company = activeCompany(view);
  const pocket = view.accounts.local?.balance ?? 0;
  const col = view.market.costOfLiving || 1;
  const biz = businessesOf(view).filter((b) => b.open);
  const broke = pocket < col * 0.5;
  /** Under two months of living costs and no job: work comes up first. */
  const low = pocket < col * 2;
  const tired = view.me.energy < 45;
  const night = isNight(hour) || hour >= 18;

  // 1. Low on money: a job (section A), else the best-paid shift.
  if (low && !myJobOf(view)) {
    const job = jobsOf(view)[0];
    if (job)
      add({
        kind: 'job',
        placeId: `biz:${job.businessId}`,
        name: job.businessName,
        detail: job.label,
        amount: job.monthlyPay,
      });
    else {
      const gig = biz
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

  // 2. Low on energy: somewhere to eat you can afford.
  if (tired) {
    const meal = biz
      .flatMap((b) => (b.venue?.items ?? []).map((i) => ({ b, i })))
      .filter((x) => (x.i.energy ?? 0) > 0 && x.i.price <= pocket)
      .sort((a, b) => (b.i.energy ?? 0) - (a.i.energy ?? 0) || a.i.price - b.i.price)[0];
    if (meal)
      add({
        kind: 'eat',
        placeId: `biz:${meal.b.id}`,
        name: meal.b.name,
        detail: meal.i.label,
        amount: meal.i.price,
      });
  }

  // 3. Evening: a night out (money you spend lands in a real business's till).
  if (night && !broke) add(funFor(view, pocket, true));

  // 4. An angel at a café (founders).
  if (company) {
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
      add({
        kind: 'angel',
        placeId: `biz:${found.biz}`,
        name: found.angel,
        where: biz.find((b) => b.id === found.biz)?.name ?? '',
      });
  }

  // 5. An accelerator (or a grant) to apply to.
  if (company) {
    const acc = acceleratorsOf(view).find((a) => !a.status && a.eligible);
    if (acc) add({ kind: 'accelerator', placeId: `cap:${acc.id}`, name: acc.name });
    const grant = devPartnersOf(view)
      .flatMap((p) => p.programs.filter((g) => g.eligible && !g.status).map((g) => ({ p, g })))
      .at(0);
    if (grant)
      add({
        kind: 'grant',
        placeId: `cap:${grant.p.id}`,
        name: grant.g.label,
        where: grant.p.name,
      });
  }

  // 6. A business that buys what you sell, with nobody supplying it yet.
  if (company) {
    const lead = biz
      .filter((b) => b.you.canPitch && !b.you.customer)
      .map((b) => ({ b, want: b.buys.find((x) => x.sector === company.industry && !x.supplier) }))
      .filter((x) => x.want)
      .sort((a, b) => b.want!.monthlyBudget - a.want!.monthlyBudget)[0];
    if (lead)
      add({
        kind: 'sell',
        placeId: `biz:${lead.b.id}`,
        name: lead.b.name,
        amount: lead.want!.monthlyBudget,
      });
  }

  // 7. An event to go to.
  const event = (eventsOf(view) ?? []).find(
    (e) => e.status === 'upcoming' && !e.youHost && !e.youGoing,
  );
  if (event)
    add({ kind: 'event', placeId: 'eventhall', name: event.title, where: event.dateLabel });

  // Always something: talk to customers, have some fun, meet people at the Hub, take a shift.
  if (company) add({ kind: 'customers', placeId: 'market', name: '' });
  if (!low && !night) add(funFor(view, pocket, false));
  add({ kind: 'hub', placeId: 'hub', name: '' });
  if (!broke) {
    const gig = biz.flatMap((b) => b.gigs.map((g) => ({ b, g })))[0];
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

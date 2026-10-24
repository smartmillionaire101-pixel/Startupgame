/**
 * Something to do in every building (data/errands.ts), feedback-note worlds
 * only (`errand.do` is unknown before it, and the view has no errands).
 *
 * An errand is done in person, where you are (`locationOf`), at a business
 * (`biz:<id>`), at one of the city's spots (`newsstand`, `airport`,
 * `office`) or at a capital programme's office (`cap:<id>`). Each one uses a
 * system the game already has, so nothing runs beside it:
 *
 * - Food and medicine move the needs and life bars; clothes go into your
 *   wardrobe (wardrobe.ts) and on you.
 * - A prototype adds workshop hours to the company's build; a course or
 *   office hours add skill (up to the jobs' skill cap); storage and shipping
 *   lift a goods company's product quality a little.
 * - A lawyer files a company's papers (the compliance rule, its cost paid to
 *   the firm); chatting to waiting customers is customer discovery.
 * - A paper, the lounge, the stand-up and the cohort bring sales leads
 *   (sales.ts `eventLead`), deal flow (dealflow.ts) or contacts.
 *
 * Money moves only through the ledger: you or your company pay the business
 * (or, at a spot, the city's lifestyle or supplier account). Usage is
 * recorded per city and errand on that city's game clock (`Player.errands`).
 * Randomness comes from `deriveRng(seed, 'errands', …)`, so no other draw shifts.
 */
import { SKILLS, type Skill } from './data/characters.js';
import {
  CLOTHES,
  ERRAND_IDS,
  ERRAND_SPECS,
  ERRANDS,
  GOODS_INDUSTRIES,
  KIND_ERRANDS,
  PAPER_TIPS,
  SPOT_ERRANDS,
  STANDUP_FOCUS,
  type ErrandId,
  type Spot,
  type StandupFocus,
} from './data/errands.js';
import type { MarketId } from './data/markets.js';
import { mallItem } from './data/mall.js';
import { rulesFor } from './data/rules.js';
import { eventDealFlow } from './dealflow.js';
import { ensure } from './errors.js';
import { addContact } from './events.js';
import { businessesOf, isOpen } from './economy.js';
import { col, getMarket, locationOf, spendHours } from './helpers.js';
import { account, costIn, payExact, transfer } from './ledger.js';
import { wearing } from './leisure.js';
import { applyBars, barsApply, bumpEnergy, healthOf } from './lifebars.js';
import { clamp01 } from './math.js';
import { scale } from './money.js';
import { bumpNeed, needsOf } from './needs.js';
import { DAY_MIN, gameMinute } from './places.js';
import { acceleratorsOf, devPartnersOf, lpsOf } from './programs.js';
import { feedbackOn } from './releases.js';
import { deriveRng, type Rng } from './rng.js';
import { addEventDeal, eventLead, hasDealRoom } from './sales.js';
import type { Company, Fund, LocalBusiness, MarketState, Player, World } from './types.js';
import { addToWardrobe } from './wardrobe.js';
import { WORK } from './work.js';

// ---------------------------------------------------------------- Shared with places.ts

/** Your active companies (as a founder) in a city, oldest first. */
export function foundedIn(world: World, p: Player, market: MarketId): Company[] {
  return p.companyIds
    .map((id) => world.companies[id])
    .filter(
      (c): c is Company =>
        !!c && c.status === 'active' && c.market === market && c.founderIds.includes(p.id),
    );
}

/** Add skill points, up to the jobs' skill cap; returns what was added. */
export function addSkill(p: Player, s: Skill, by: number): number {
  const before = p.skills[s] ?? 0;
  if (before < WORK.skillCap) p.skills[s] = Math.min(WORK.skillCap, before + by);
  return Math.round(((p.skills[s] ?? 0) - before) * 100) / 100;
}

/** Your weakest skill (ties: the first in the list). */
export const weakestSkill = (p: Player): Skill =>
  [...SKILLS].sort((a, b) => (p.skills[a] ?? 0) - (p.skills[b] ?? 0))[0]!;

export const addNetwork = (p: Player, n: number): number => {
  const before = p.network;
  p.network = Math.min(100, p.network + n);
  return p.network - before;
};

/**
 * New sales leads for a company (the pipeline's own lead, at the lead
 * stage), as many as there's room for. `budgetX` scales what they'd spend.
 */
export function salesLeadsFor(
  world: World,
  c: Company,
  rng: Rng,
  n: number,
  budgetX = 1,
): { id: string; name: string }[] {
  const month = getMarket(world, c.market).month;
  const out: { id: string; name: string }[] = [];
  for (let i = 0; i < n && hasDealRoom(c); i++) {
    const who = eventLead(world, c, rng, budgetX);
    if (!who) break;
    const d = addEventDeal(c, who, { stage: 'lead', discountPct: 0, trust: 0.1, month, months: 3 });
    out.push({ id: d.id, name: d.customer.name });
  }
  return out;
}

/** The segment of a company's industry here it knows least about (customer discovery). */
export function learnFromCustomers(world: World, c: Company, share: number) {
  const m = getMarket(world, c.market);
  const segs = Object.values(m.segments)
    .filter((s) => s.industry === c.industry)
    .sort(
      (a, b) =>
        (c.product.discovery[a.key] ?? 0) - (c.product.discovery[b.key] ?? 0) ||
        (a.key < b.key ? -1 : 1),
    );
  const seg = segs[0];
  if (!seg) return null;
  const d = c.product.discovery[seg.key] ?? 0;
  c.product.discovery[seg.key] = clamp01(d + share * (1 - d));
  return {
    segment: seg.name,
    needs: seg.needsLabel,
    discovery: Math.round(c.product.discovery[seg.key]! * 100) / 100,
  };
}

/** AI investors to meet: VC partners (not angels), from other cities first when `visiting`. */
export function investorsToMeet(
  world: World,
  market: MarketId,
  opts: { angels: boolean; visiting: boolean },
): Fund[] {
  const live = (f: Fund) => {
    if (!f.ai || f.managerId) return false;
    if (!opts.angels) return !f.angelId;
    const a = f.angelId ? world.players[f.angelId] : undefined;
    return !!a && a.angel?.retiredMonth === undefined;
  };
  const all = Object.values(world.funds)
    .filter(live)
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  const away = all.filter((f) => f.market !== market);
  const here = all.filter((f) => f.market === market);
  return opts.visiting ? [...away, ...here] : here;
}

/** Meet `n` of these investors (a fund contact each); returns who. */
export function meetInvestors(
  world: World,
  p: Player,
  funds: Fund[],
  n: number,
  warmth: number,
  month: number,
  rng: Rng,
) {
  const met = rng.shuffle([...funds]).slice(0, n);
  for (const f of met) {
    const who = (f.angelId && world.players[f.angelId]?.name) || f.partner;
    addContact(p, { kind: 'fund', refId: f.id, name: `${who}, ${f.name}`, warmth }, month);
  }
  return met.map((f) => ({
    fundId: f.id,
    name: (f.angelId && world.players[f.angelId]?.name) || f.partner,
    org: f.name,
    city: getMarket(world, f.market).data.name,
  }));
}

// ---------------------------------------------------------------- Where you are

type At =
  | { kind: 'business'; b: LocalBusiness; errands: readonly ErrandId[] }
  | { kind: 'spot'; spot: Spot; ref?: string; capital?: 'accelerator' | 'devpartner' | 'lp' };

function whereAt(world: World, p: Player, at: string): { m: MarketState; place: At; name: string } {
  const here = locationOf(p);
  const m = getMarket(world, here);
  if (at.startsWith('biz:')) {
    const b = businessesOf(m)[at.slice(4)];
    ensure(b, 'errand.away', 'That place is in another city.');
    ensure(isOpen(b), 'business.closed', `${b.name} has closed.`);
    return {
      m,
      place: { kind: 'business', b, errands: KIND_ERRANDS[b.kind] ?? [] },
      name: b.name,
    };
  }
  if (at.startsWith('cap:')) {
    const ref = at.slice(4);
    const acc = acceleratorsOf(here).find((x) => x.id === ref);
    const dev = devPartnersOf(here).find((x) => x.id === ref);
    const lp = lpsOf(here).find((x) => x.id === ref);
    const found = acc ?? dev ?? lp;
    ensure(found, 'errand.away', 'That place is in another city.');
    return {
      m,
      place: {
        kind: 'spot',
        spot: 'capital',
        ref,
        capital: acc ? 'accelerator' : dev ? 'devpartner' : 'lp',
      },
      name: found.name,
    };
  }
  ensure(
    at === 'newsstand' || at === 'airport' || at === 'office',
    'errand.place',
    'Nothing to do there.',
  );
  return { m, place: { kind: 'spot', spot: at }, name: at };
}

const errandsAt = (place: At): readonly ErrandId[] =>
  place.kind === 'business'
    ? place.errands
    : SPOT_ERRANDS[place.spot].filter((e) => e !== 'rehearsal' || place.capital === 'accelerator');

// ---------------------------------------------------------------- Checks

const dayOf = (m: MarketState, now: number) => Math.floor(gameMinute(m, now) / DAY_MIN);
const usedKey = (m: MarketState, e: ErrandId) => `${m.id}:${e}`;

export interface ErrandArgs {
  /** Clothes: the mall item. */
  item?: string;
  /** The stand-up's focus. */
  focus?: StandupFocus;
}

interface Check {
  ok: boolean;
  reason: string | null;
  hours: number;
  fee: number;
  company: Company | null;
}

/** The fee an errand costs here (clothes: the item's price; the lawyer: the papers' cost). */
function feeOf(m: MarketState, e: ErrandId, item?: string, c?: Company | null): number {
  if (e === 'clothes') {
    const x = item ? mallItem(item) : undefined;
    return x ? scale(col(m), x.priceCol) : 0;
  }
  if (e === 'lawyer' && c) {
    const rule = papersRule(c);
    return rule ? scale(col(m), rule.costCol) : 0;
  }
  return scale(col(m), ERRAND_SPECS[e].feeCol);
}

/** The company papers a lawyer files: the first of these rules not yet done. */
function papersRule(c: Company) {
  const end = (id: string, ...s: string[]) => s.some((x) => id.endsWith(`.${x}`));
  return (
    rulesFor(c.market, c.industry).find(
      (r) =>
        end(r.id, 'founder-agreements', 'employment', 'data-protection') && !c.compliance[r.id],
    ) ?? null
  );
}

/** Whether an errand can be done now (no side effects), and why not. */
function errandCheck(
  world: World,
  p: Player,
  m: MarketState,
  e: ErrandId,
  now: number,
  args: ErrandArgs = {},
  kind?: string,
): Check {
  const spec = ERRAND_SPECS[e];
  const companies = foundedIn(world, p, m.id);
  const needsCompany = spec.paidBy === 'company' || e === 'standup';
  const company = needsCompany ? (companies[0] ?? null) : null;
  const out = (reason: string | null): Check => ({
    ok: !reason,
    reason,
    hours: spec.hours,
    fee: feeOf(m, e, args.item, company),
    company,
  });
  if (needsCompany && !company) return out('You need a company in this city.');
  const last = p.errands?.[usedKey(m, e)];
  const today = dayOf(m, now);
  if (spec.once === 'day' && last === today) return out('Done today. Come back tomorrow.');
  if (spec.once === 'month' && last !== undefined && Math.floor(last / 30) === m.month)
    return out('Done this month. Come back next month.');
  switch (e) {
    case 'groceries':
      if (needsOf(p).hunger >= ERRANDS.fullHunger) return out('You’re not hungry.');
      break;
    case 'clothes': {
      const list = CLOTHES[kind ?? ''] ?? [];
      const want = list.find((x) => x.item === args.item);
      if (args.item !== undefined && !want) return out('They don’t sell that here.');
      const owned = (x: { item: string; colour: string }) =>
        (p.wardrobe ?? []).some((w) => w.item === x.item && w.colour === x.colour);
      if (want ? owned(want) : list.length > 0 && list.every(owned))
        return out('You already have that.');
      break;
    }
    case 'medicine':
      if (healthOf(p) >= ERRANDS.unwell) return out('You’re well: nothing you need today.');
      break;
    case 'car-service':
      if (!p.car) return out('You don’t have a car.');
      break;
    case 'storage':
    case 'ship-stock':
      if (!GOODS_INDUSTRIES.includes(company!.industry))
        return out('For companies that ship goods.');
      break;
    case 'lawyer':
      if (!papersRule(company!)) return out('Your company’s papers are in order.');
      break;
    case 'standup':
      if (p.market !== m.id) return out('Your office is in your home city.');
      if (args.focus !== undefined && !STANDUP_FOCUS.includes(args.focus))
        return out('Pick a focus for the day.');
      break;
    case 'rehearsal':
      if (!companies.length) return out('For founders with a company.');
      break;
  }
  if (p.hours.available - p.hours.used < spec.hours)
    return out('Not enough hours left this month.');
  const r = out(null);
  if (r.fee) {
    const payer = spec.paidBy === 'company' ? company!.account : p.accounts.local;
    const purse = account(world, payer);
    if (purse.balance < costIn(world, r.fee, m.data.currency, purse.currency))
      return out(
        spec.paidBy === 'company' ? 'Your company can’t pay for that.' : 'Not enough money.',
      );
  }
  return r;
}

// ---------------------------------------------------------------- Doing it

/** Do an errand where you are (`errand.do`). */
export function doErrand(
  world: World,
  p: Player,
  at: string,
  e: ErrandId,
  args: ErrandArgs,
  now: number,
) {
  ensure(feedbackOn(world), 'command.unknown', 'Unknown command.');
  const { m, place, name } = whereAt(world, p, at);
  ensure(errandsAt(place).includes(e), 'errand.place', 'They don’t do that here.');
  const kind = place.kind === 'business' ? place.b.kind : undefined;
  if (e === 'clothes') ensure(args.item, 'errand.item', 'Pick something to buy.');
  const check = errandCheck(world, p, m, e, now, args, kind);
  ensure(check.ok, 'errand.not-now', check.reason ?? 'Not now.');
  const spec = ERRAND_SPECS[e];
  const month = m.month;
  if (check.hours) spendHours(p, check.hours, spec.label);
  const c = check.company;
  // Who's paid: the business, or (at a spot) the city's lifestyle or supplier account.
  const payee =
    place.kind === 'business' ? place.b.account : e === 'paper' ? m.ext.lifestyle : m.ext.suppliers;
  const memo = `${spec.label}: ${name}`;
  if (check.fee && e !== 'lawyer') {
    if (spec.paidBy === 'company') transfer(world, c!.account, payee, check.fee, memo, month);
    else payExact(world, p.accounts.local, payee, check.fee, memo, month);
  }
  (p.errands ??= {})[usedKey(m, e)] = dayOf(m, now);
  const rng = deriveRng(world.seed, 'errands', p.id, m.id, e, dayOf(m, now));
  const bars = barsApply(world, p);
  const fx: Record<string, number> = {};
  const out: Record<string, unknown> = {};

  switch (e) {
    case 'groceries':
      fx.hunger = bumpNeed(p, 'hunger', ERRANDS.groceries.hunger);
      fx.energy = Math.round(bumpEnergy(p, ERRANDS.groceries.energy));
      break;
    case 'clothes': {
      const want = CLOTHES[kind!]!.find((x) => x.item === args.item)!;
      const x = mallItem(want.item)!;
      addToWardrobe(p, x, getMarket(world, p.market).month, want.colour);
      p.appearance = wearing(p, x, want.colour, false);
      p.appearanceAt = now;
      fx.fun = bumpNeed(p, 'fun', ERRANDS.clothesFun);
      out.item = { id: x.id, label: x.label, colour: want.colour };
      break;
    }
    case 'medicine':
      if (bars) Object.assign(fx, applyBars(p, ERRANDS.medicine));
      break;
    case 'car-service':
      if (bars) Object.assign(fx, applyBars(p, { stress: ERRANDS.carStress }));
      break;
    case 'prototype':
      c!.buildHours += ERRANDS.prototypeBuild;
      fx.buildHours = ERRANDS.prototypeBuild;
      fx.product = addSkill(p, 'product', 1);
      break;
    case 'course': {
      const s = weakestSkill(p);
      fx[s] = addSkill(p, s, ERRANDS.skill);
      out.skill = s;
      break;
    }
    case 'storage':
    case 'ship-stock': {
      const before = c!.product.quality;
      c!.product.quality = clamp01(before + ERRANDS.fulfilment);
      fx.quality = Math.round((c!.product.quality - before) * 1000) / 1000;
      break;
    }
    case 'lawyer': {
      const rule = papersRule(c!)!;
      // The papers' cost goes to the firm, not the registry (`comply` would pay suppliers).
      transfer(world, c!.account, payee, check.fee, `${rule.title}: ${name}`, month);
      c!.compliance[rule.id] = true;
      out.rule = rule.title;
      break;
    }
    case 'meet-team': {
      const b = (place as Extract<At, { kind: 'business' }>).b;
      addContact(
        p,
        {
          kind: 'local',
          refId: `biz:${b.id}`,
          name: `${b.owner.name}, ${b.name}`,
          warmth: ERRANDS.warmth,
        },
        month,
      );
      fx.network = addNetwork(p, ERRANDS.network);
      out.met = { name: b.owner.name, org: b.name };
      break;
    }
    case 'chat': {
      const co = foundedIn(world, p, m.id)[0];
      const learned = co ? learnFromCustomers(world, co, ERRANDS.chatDiscovery) : null;
      if (learned) {
        fx.sales = addSkill(p, 'sales', 0.5);
        out.learned = { company: co!.name, ...learned };
      } else fx.social = bumpNeed(p, 'social', ERRANDS.chatSocial);
      break;
    }
    case 'test-drive':
      fx.fun = bumpNeed(p, 'fun', ERRANDS.testDrive.fun);
      if (bars) Object.assign(fx, applyBars(p, { stress: ERRANDS.testDrive.stress }));
      break;
    case 'paper': {
      const co = foundedIn(world, p, m.id)[0];
      const leads = co ? salesLeadsFor(world, co, rng, 1) : [];
      const flow =
        !leads.length && p.role === 'investor'
          ? eventDealFlow(
              world,
              p,
              {
                id: `paper:${m.id}:${dayOf(m, now)}`,
                title: 'The business pages',
                kind: 'hangout',
                where: 'hangout',
                market: m.id,
              },
              month,
            )
          : null;
      if (leads.length) out.leads = leads;
      else if (flow?.pitches.length) out.pitches = flow.pitches.length;
      else {
        out.tip = rng.pick(PAPER_TIPS);
        fx.investing = addSkill(p, 'investing', 0.5);
      }
      break;
    }
    case 'lounge': {
      const flow =
        p.role === 'investor'
          ? eventDealFlow(
              world,
              p,
              {
                id: `lounge:${m.id}:${dayOf(m, now)}`,
                title: 'The business lounge',
                kind: 'meetup',
                where: 'hosted',
                market: m.id,
              },
              month,
            )
          : null;
      if (flow) {
        out.pitches = flow.pitches.length;
        out.investors = flow.investors.length;
      } else
        out.met = meetInvestors(
          world,
          p,
          investorsToMeet(world, m.id, { angels: false, visiting: true }),
          1 + rng.int(0, 1),
          ERRANDS.investorWarmth,
          month,
          rng,
        );
      fx.network = addNetwork(p, ERRANDS.network);
      break;
    }
    case 'standup': {
      const focus = args.focus ?? 'build';
      out.focus = focus;
      if (focus === 'build') {
        const team = c!.staff.length + c!.founderIds.length;
        const h = Math.min(ERRANDS.standupBuildMax, ERRANDS.standupBuild * team);
        c!.buildHours += h;
        fx.buildHours = h;
      } else if (focus === 'sell') out.leads = salesLeadsFor(world, c!, rng, 1);
      else {
        if (bars) Object.assign(fx, applyBars(p, { stress: ERRANDS.standupStress }));
        fx.leadership = addSkill(p, 'leadership', 0.5);
      }
      break;
    }
    case 'office-hours': {
      const s: Skill = p.role === 'investor' ? 'investing' : 'product';
      fx[s] = addSkill(p, s, ERRANDS.skill);
      break;
    }
    case 'cohort': {
      const founders = Object.values(world.companies)
        .filter((x) => x.ai && x.status === 'active' && x.market === m.id)
        .sort((a, b) => (a.id < b.id ? -1 : 1));
      const met = rng.shuffle(founders).slice(0, 2);
      out.met = met.flatMap((x) => {
        const f = x.founderIds.map((id) => world.players[id]).find((q) => !!q);
        if (!f) return [];
        addContact(
          p,
          { kind: 'founder', refId: f.id, name: `${f.name}, ${x.name}`, warmth: ERRANDS.warmth },
          month,
        );
        return [{ name: f.name, org: x.name }];
      });
      fx.network = addNetwork(p, ERRANDS.network);
      break;
    }
    case 'rehearsal':
      fx.publicSpeaking = addSkill(p, 'publicSpeaking', ERRANDS.skill);
      fx.fundraising = addSkill(p, 'fundraising', 1);
      break;
  }
  return {
    errand: e,
    at,
    hours: check.hours,
    fee: check.fee,
    paidBy: spec.paidBy,
    effects: fx,
    ...out,
    message: `${spec.label} at ${name}.`,
  };
}

// ---------------------------------------------------------------- The view

/**
 * What every errand would do for you in this city now (`market.errands`):
 * its fee, hours and whether you can (and why not), plus each clothes stall's
 * rail. Null before the feedback note.
 */
export function errandsView(world: World, p: Player, m: MarketState, now: number) {
  if (!feedbackOn(world)) return null;
  const list = ERRAND_IDS.map((e) => {
    const c = errandCheck(world, p, m, e, now);
    return {
      id: e,
      label: ERRAND_SPECS[e].label,
      hours: c.hours,
      fee: c.fee,
      paidBy: ERRAND_SPECS[e].paidBy,
      ok: e === 'clothes' ? true : c.ok,
      reason: e === 'clothes' ? null : c.reason,
    };
  });
  return {
    errands: list,
    /** Business kind → errand ids. */
    byKind: KIND_ERRANDS,
    clothes: Object.fromEntries(
      Object.entries(CLOTHES).map(([kind, rail]) => [
        kind,
        rail.map((x) => {
          const it = mallItem(x.item)!;
          return {
            item: x.item,
            label: it.label,
            colour: x.colour,
            price: scale(col(m), it.priceCol),
            owned: (p.wardrobe ?? []).some((w) => w.item === x.item && w.colour === x.colour),
          };
        }),
      ]),
    ),
  };
}

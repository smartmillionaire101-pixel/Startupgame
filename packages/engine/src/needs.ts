/**
 * Wave 7: needs, mood and life at home.
 *
 * Four needs (hunger, hygiene, fun, social), 0–100, sit beside energy. They
 * fall at each personal settlement and recover through things you do: home
 * acts (`home.act`), having someone over (`home.invite`), food delivery
 * (`food.order`) and the existing venue activities. Mood is the average of
 * energy and the four needs; a low mood costs hours next month, a high one
 * adds a few.
 *
 * Money flows: groceries and snacks go to the city's lifestyle sink
 * (`ext.lifestyle`, where living costs go); a delivery is paid to the food
 * business (price plus a 15% delivery fee: it counts as their takings).
 * Deterministic: no RNG.
 */
import type { BusinessKindSpec, VenueItem } from './data/businesses.js';
import { ensure, fail } from './errors.js';
import { addContact } from './events.js';
import { adjustTrust, col, getMarket, getPlayer, locationOf, notify } from './helpers.js';
import { account, costIn, payExact } from './ledger.js';
import { clamp } from './math.js';
import { formatMoney, scale } from './money.js';
import { npcPerson, parseNpcId, chatIdOf } from './people.js';
import { getBusiness, isOpen, specOf } from './economy.js';
import type { ContactKind, Id, MarketState, Player, World } from './types.js';

export const NEED_KEYS = ['hunger', 'hygiene', 'fun', 'social'] as const;
export type NeedKey = (typeof NEED_KEYS)[number];
export type Needs = Record<NeedKey, number>;

/** New players start here; saves from before Wave 7 are backfilled with `NEEDS_BACKFILL`. */
export const NEEDS_START = 80;
export const NEEDS_BACKFILL = 70;
/** Monthly fall at each personal settlement. */
export const NEEDS_DECAY: Needs = { hunger: 35, hygiene: 30, fun: 25, social: 20 };
/** A need under this gets a notification when it drops there. */
export const NEED_LOW = 25;
/** Mood thresholds and their effect on next month's hours. */
export const MOOD_LOW = 30;
export const MOOD_HIGH = 75;
export const MOOD_LOW_HOURS = 0.9;
export const MOOD_HIGH_HOURS = 1.05;

export type HomeActId =
  | 'sleep'
  | 'nap'
  | 'shower'
  | 'toilet'
  | 'cook'
  | 'snack'
  | 'tv'
  | 'game'
  | 'read'
  | 'work'
  | 'workout';

interface HomeActSpec {
  /** Uses a (home) month. */
  cap: number;
  energy?: number;
  hunger?: number;
  hygiene?: number;
  fun?: number;
  /** Extra hours this month. */
  hours?: number;
  /** Cost in cost-of-living units, paid to `ext.lifestyle`. */
  costCol?: number;
  /** A furniture slot you must own. */
  needs?: string;
  label: string;
}

export const HOME_ACTS: Record<HomeActId, HomeActSpec> = {
  sleep: { cap: 3, energy: 25, label: 'You slept well' },
  nap: { cap: 6, energy: 8, label: 'A quick nap' },
  shower: { cap: 6, hygiene: 45, label: 'A long shower' },
  toilet: { cap: 10, hygiene: 10, label: 'Freshened up' },
  cook: { cap: 6, hunger: 45, costCol: 0.02, label: 'You cooked a proper meal' },
  snack: { cap: 10, hunger: 15, costCol: 0.005, label: 'A snack from the fridge' },
  tv: { cap: 6, fun: 15, label: 'You watched TV' },
  game: { cap: 4, fun: 25, needs: 'gaming', label: 'A gaming session' },
  read: { cap: 4, fun: 10, hours: 2, label: 'You read for a while' },
  work: { cap: 4, hours: 4, needs: 'desk', label: 'Four focused hours at your desk' },
  workout: { cap: 4, energy: -5, hygiene: -15, fun: 10, label: 'A home workout' },
};
export const HOME_ACT_IDS = Object.keys(HOME_ACTS) as HomeActId[];

/** With a TV in your home, watching it is more fun. */
const TV_FUN_WITH_SET = 25;

export const INVITE_CAP = 3;
export const INVITE_COST_COL = 0.03;
export const INVITE_SOCIAL = 30;
export const INVITE_FUN = 10;
export const INVITE_WARMTH = 0.1;

export const DELIVERY_FEE = 0.15;
export const DELIVERY_HUNGER = 35;
export const DELIVERY_LIST_LIMIT = 20;

// ---------------------------------------------------------------- Needs and mood

/** A player's needs (old saves read as the backfill value). */
export function needsOf(p: Player): Needs {
  const n = p.needs;
  return {
    hunger: n?.hunger ?? NEEDS_BACKFILL,
    hygiene: n?.hygiene ?? NEEDS_BACKFILL,
    fun: n?.fun ?? NEEDS_BACKFILL,
    social: n?.social ?? NEEDS_BACKFILL,
  };
}

/** Backfill an old save's needs before changing them. */
export function ensureNeeds(p: Player): Needs {
  if (!p.needs) p.needs = needsOf(p);
  return p.needs;
}

/** Change one need (clamped 0–100); returns the change actually applied. */
export function bumpNeed(p: Player, key: NeedKey, by: number): number {
  const n = ensureNeeds(p);
  const before = n[key];
  n[key] = clamp(Math.round(before + by), 0, 100);
  return n[key] - before;
}

/** 0–100: the average of energy and the four needs. */
export function moodOf(p: Player): number {
  const n = needsOf(p);
  return Math.round((p.energy + n.hunger + n.hygiene + n.fun + n.social) / 5);
}

/** Next month's hours multiplier from mood (players without needs, e.g. AI, are unaffected). */
export function moodHoursFactor(p: Player): number {
  if (!p.needs) return 1;
  const mood = moodOf(p);
  return mood < MOOD_LOW ? MOOD_LOW_HOURS : mood > MOOD_HIGH ? MOOD_HIGH_HOURS : 1;
}

const NEED_WORDS: Record<NeedKey, string> = {
  hunger: 'You’re hungry. Cook, order in or eat out.',
  hygiene: 'You need a shower.',
  fun: 'You need some fun. Watch TV, play or go out.',
  social: 'You’re lonely. Invite a friend over or meet someone.',
};

/** Month-end: needs fall; a need dropping under 25 sends a short note. */
export function decayNeeds(world: World, p: Player, month: number) {
  const n = ensureNeeds(p);
  for (const k of NEED_KEYS) {
    const before = n[k];
    n[k] = clamp(before - NEEDS_DECAY[k], 0, 100);
    if (before >= NEED_LOW && n[k] < NEED_LOW)
      notify(world, p.id, { month, kind: 'system', text: NEED_WORDS[k] });
  }
}

/** What a venue item does for your needs (Wave 7). Mutates; returns the changes applied. */
export function venueNeeds(
  p: Player,
  spec: BusinessKindSpec,
  it: VenueItem,
  meeting: boolean,
): Partial<Needs> {
  const out: Partial<Needs> = {};
  const add = (k: NeedKey, by: number) => {
    const d = bumpNeed(p, k, by);
    out[k] = (out[k] ?? 0) + d;
  };
  if (spec.category === 'food' && !it.activity) add('hunger', 30);
  if (it.fun || it.activity) add('fun', (it.fun ?? 0) * 4);
  if (meeting) add('social', 20);
  if (spec.kind.includes('gym')) {
    add('hygiene', -10);
    add('fun', 10);
  }
  return out;
}

// ---------------------------------------------------------------- Caps

/** Uses of an act (or 'invite') this home month. */
export function actUses(p: Player, act: string, month: number): number {
  const u = p.homeActs?.[act];
  return u && u.month === month ? u.n : 0;
}

function useAct(p: Player, act: string, month: number) {
  const n = actUses(p, act, month);
  (p.homeActs ??= {})[act] = { month, n: n + 1 };
}

function atHome(p: Player) {
  ensure(locationOf(p) === p.market, 'home.away', 'You’re away from home.');
}

const owns = (p: Player, slot: string) => (p.home?.items ?? []).some((x) => x.slot === slot);

/** Pay the city's lifestyle sink (groceries, snacks): exactly `amount` in the home currency. */
function payLiving(world: World, p: Player, m: MarketState, amount: number, memo: string) {
  const mine = account(world, p.accounts.local);
  ensure(
    mine.balance >= costIn(world, amount, m.data.currency, mine.currency),
    'home.funds',
    `That costs ${formatMoney(amount, m.data.currency)}; you don’t have it.`,
  );
  payExact(world, p.accounts.local, m.ext.lifestyle, amount, memo, m.month);
}

// ---------------------------------------------------------------- home.act

export function homeAct(world: World, me: Player, act: HomeActId) {
  const spec = HOME_ACTS[act];
  ensure(spec, 'home.act', 'You can’t do that at home.');
  atHome(me);
  const m = getMarket(world, me.market);
  const month = m.month;
  ensure(actUses(me, act, month) < spec.cap, 'home.cap', 'Done for this month.');
  if (spec.needs)
    ensure(
      owns(me, spec.needs),
      'home.needs',
      spec.needs === 'gaming' ? 'Get a console first.' : 'Get a desk first.',
    );
  const cost = spec.costCol ? scale(col(m), spec.costCol) : 0;
  if (cost) payLiving(world, me, m, cost, act === 'cook' ? 'Groceries' : 'Snacks');

  const effects: { energy?: number; hours?: number } & Partial<Needs> = {};
  if (spec.energy) {
    const before = me.energy;
    me.energy = clamp(me.energy + spec.energy, 0, 100);
    effects.energy = Math.round(me.energy - before);
  }
  if (spec.hunger) effects.hunger = bumpNeed(me, 'hunger', spec.hunger);
  if (spec.hygiene) effects.hygiene = bumpNeed(me, 'hygiene', spec.hygiene);
  const fun = act === 'tv' && owns(me, 'tv') ? TV_FUN_WITH_SET : spec.fun;
  if (fun) effects.fun = bumpNeed(me, 'fun', fun);
  let built = false;
  if (spec.hours) {
    // Work at your desk counts as building, like `company.build`, without spending your hours.
    const c =
      act === 'work'
        ? me.companyIds
            .map((id) => world.companies[id])
            .find((x) => x && x.status === 'active' && !x.hibernation)
        : undefined;
    if (c) {
      c.buildHours += spec.hours;
      c.lastDecisionMonth = month;
      me.skills.product = Math.min(100, me.skills.product + spec.hours / 40);
      built = true;
    } else me.hours.available += spec.hours;
    effects.hours = spec.hours;
  }
  ensureNeeds(me);
  useAct(me, act, month);
  const left = spec.cap - actUses(me, act, month);
  return {
    act,
    effects,
    cost,
    left,
    built,
    needs: needsOf(me),
    mood: moodOf(me),
    energy: Math.round(me.energy),
    message: `${spec.label}.${cost ? ` ${formatMoney(cost, m.data.currency)}.` : ''}${built ? ' It counts towards your product.' : ''}`,
  };
}

// ---------------------------------------------------------------- home.invite

interface HomeGuest {
  name: string;
  contact: { kind: ContactKind; refId: Id; name: string };
  player?: Player;
}

function resolveHomeGuest(world: World, me: Player, personId: string): HomeGuest {
  ensure(personId !== me.id, 'invite.self', 'Invite someone else.');
  const here = me.market;
  // 1. One of your contacts, by chat id or contact id.
  const c = (me.contacts ?? []).find((x) => chatIdOf(x) === personId || x.id === personId);
  if (c) {
    const q = c.kind === 'player' ? world.players[c.refId] : undefined;
    return {
      name: c.name.split(',')[0]!,
      contact: { kind: c.kind, refId: c.refId, name: c.name },
      ...(q && !q.ai ? { player: q } : {}),
    };
  }
  // 2. A player in your city.
  const p = world.players[personId];
  if (p) {
    ensure(locationOf(p) === here, 'invite.where', `${p.name} isn’t in your city.`);
    if (!p.ai)
      return { name: p.name, contact: { kind: 'player', refId: p.id, name: p.name }, player: p };
    const co = p.companyIds.map((id) => world.companies[id]).find((x) => x?.status === 'active');
    return {
      name: p.name,
      contact: { kind: 'founder', refId: p.id, name: co ? `${p.name}, ${co.name}` : p.name },
    };
  }
  // 3. A fund partner in your city.
  if (personId.startsWith('fund:') || world.funds[personId]) {
    const f = world.funds[personId.replace(/^fund:/, '')];
    ensure(f, 'invite.person', 'We can’t find that person.');
    ensure(f.market === here, 'invite.where', `${f.partner} isn’t in your city.`);
    return {
      name: f.partner,
      contact: { kind: 'fund', refId: f.id, name: `${f.partner}, ${f.name}` },
    };
  }
  // 4. A business owner in your city.
  if (personId.startsWith('biz:')) {
    let b;
    try {
      b = getBusiness(world, personId.slice('biz:'.length));
    } catch {
      return fail('invite.person', 'We can’t find that person.');
    }
    ensure(b.market === here, 'invite.where', `${b.owner.name} isn’t in your city.`);
    return {
      name: b.owner.name,
      contact: { kind: 'local', refId: personId, name: `${b.owner.name}, ${b.name}` },
    };
  }
  // 5. A regular in your city.
  const npc = parseNpcId(personId);
  ensure(npc, 'invite.person', 'We can’t find that person.');
  ensure(npc.market === here, 'invite.where', 'They aren’t in your city.');
  const known = npcPerson(npc.market, npc.n);
  return {
    name: known.name,
    contact: { kind: 'local', refId: personId, name: `${known.name}, ${known.role}` },
  };
}

export function homeInvite(world: World, me: Player, personId: string) {
  atHome(me);
  const m = getMarket(world, me.market);
  const month = m.month;
  ensure(actUses(me, 'invite', month) < INVITE_CAP, 'home.cap', 'Done for this month.');
  const guest = resolveHomeGuest(world, me, personId);
  const cost = scale(col(m), INVITE_COST_COL);
  payLiving(world, me, m, cost, `Snacks for ${guest.name}`);
  const social = bumpNeed(me, 'social', INVITE_SOCIAL);
  const fun = bumpNeed(me, 'fun', INVITE_FUN);
  addContact(me, { ...guest.contact, warmth: INVITE_WARMTH }, month);
  if (guest.player) {
    const q = getPlayer(world, guest.player.id);
    addContact(q, { kind: 'player', refId: me.id, name: me.name, warmth: INVITE_WARMTH }, month);
    adjustTrust(me, q.id, 0.03);
    adjustTrust(q, me.id, 0.03);
    notify(world, q.id, { month, kind: 'meeting', text: `${me.name} invited you over.` });
  }
  useAct(me, 'invite', month);
  return {
    guest: { personId, name: guest.name, kind: guest.contact.kind },
    effects: { social, fun },
    cost,
    left: INVITE_CAP - actUses(me, 'invite', month),
    needs: needsOf(me),
    mood: moodOf(me),
    message: `${guest.name} came over. ${formatMoney(cost, m.data.currency)} on snacks.`,
  };
}

// ---------------------------------------------------------------- food.order

const deliverable = (it: VenueItem) => !it.activity;

export function foodOrder(world: World, me: Player, businessId: Id, itemId: string) {
  const b = getBusiness(world, businessId);
  ensure(isOpen(b), 'business.closed', `${b.name} has closed.`);
  ensure(b.market === locationOf(me), 'business.market', `${b.name} is in another city.`);
  const spec = specOf(b);
  ensure(spec.category === 'food', 'food.business', `${b.name} doesn’t deliver food.`);
  const it = spec.venue?.items.find((x) => x.id === itemId);
  ensure(it, 'venue.item', `${b.name} doesn’t sell that.`);
  ensure(deliverable(it), 'food.item', `${it.label} isn’t something they can deliver.`);
  const m = getMarket(world, b.market);
  const price = scale(col(m), it.priceCol);
  const fee = Math.round(price * DELIVERY_FEE);
  const total = price + fee;
  const fmt = (v: number) => formatMoney(v, m.data.currency);
  const mine = account(world, me.accounts.local);
  ensure(
    mine.balance >= costIn(world, total, m.data.currency, mine.currency),
    'food.funds',
    `That costs ${fmt(total)}; you don’t have it.`,
  );
  payExact(
    world,
    me.accounts.local,
    b.account,
    total,
    `Delivery: ${it.label} from ${b.name}`,
    m.month,
  );
  const hunger = bumpNeed(me, 'hunger', DELIVERY_HUNGER);
  return {
    price,
    fee,
    total,
    effects: { hunger },
    etaMinutes: 20,
    needs: needsOf(me),
    mood: moodOf(me),
    message: `${it.label} from ${b.name} is on its way: ${fmt(total)} with delivery.`,
  };
}

// ---------------------------------------------------------------- Views

/** `market.delivery`: open food businesses that deliver, cheapest first (up to 20). */
export function deliveryView(m: MarketState) {
  return Object.values(m.businesses ?? {})
    .filter((b) => isOpen(b) && specOf(b).category === 'food')
    .map((b) => {
      const items = (specOf(b).venue?.items ?? [])
        .filter(deliverable)
        .map((it) => ({ id: it.id, label: it.label, price: scale(col(m), it.priceCol) }))
        .sort((a, z) => a.price - z.price || (a.id < z.id ? -1 : a.id > z.id ? 1 : 0));
      return { businessId: b.id, name: b.name, items };
    })
    .filter((x) => x.items.length > 0)
    .sort(
      (a, z) =>
        a.items[0]!.price - z.items[0]!.price ||
        (a.businessId < z.businessId ? -1 : a.businessId > z.businessId ? 1 : 0),
    )
    .slice(0, DELIVERY_LIST_LIMIT);
}

/** `me.homeActs`: uses this month and the cap, per act (and 'invite'). */
export function homeActsView(p: Player, month: number) {
  const out: Record<string, { used: number; cap: number; left: number }> = {};
  for (const id of HOME_ACT_IDS) {
    const used = actUses(p, id, month);
    out[id] = { used, cap: HOME_ACTS[id].cap, left: Math.max(0, HOME_ACTS[id].cap - used) };
  }
  const used = actUses(p, 'invite', month);
  out.invite = { used, cap: INVITE_CAP, left: Math.max(0, INVITE_CAP - used) };
  return out;
}

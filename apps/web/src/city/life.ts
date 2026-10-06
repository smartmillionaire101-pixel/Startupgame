/**
 * Wave 5 view adapters (docs/WAVE5-FUN-LIFE-AND-CAPITAL.md §A, §B), read
 * by the places you walk into (§D) and the "What to do now" card.
 *
 * Sections A and B add jobs, a home and a car, a shop, accelerators,
 * development partners, LPs and angels sitting in cafés to the view. Like
 * ./contract.ts these read the new fields when present and fall back when
 * they aren't (an older server, a saved world): a missing field simply hides
 * the action that needs it.
 *
 * The city-level lists live on the market you're in (`view.here` when away,
 * else `view.market`); the doc names them `view.here.*`, so both are read.
 */
import type { Command, PlayerView } from '@runway/engine';
import { businessesOf, hash, type BusinessView } from './contract';
import { hereOf } from './travel';

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, d = ''): string => (typeof v === 'string' ? v : d);
const num = (v: unknown, d = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const list = (v: unknown): Record<string, unknown>[] =>
  Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => isObj(x)) : [];

type View = PlayerView;

/** A field of the city you're in: `view.here.<key>`, else the market's. */
export function hereField(view: View, key: string): unknown {
  const here: unknown = (view as View & { here?: unknown }).here;
  if (isObj(here) && here[key] !== undefined) return here[key];
  const m = hereOf(view) as unknown as Record<string, unknown>;
  if (m[key] !== undefined) return m[key];
  return (view.market as unknown as Record<string, unknown>)[key];
}

/** Commands from sections A and B, typed loosely until the engine has them. */
export const looseCmd = (c: Record<string, unknown> & { type: string }) => c as unknown as Command;

// ---------------------------------------------------------------------------
// Who you are

export type Gender = 'female' | 'male';

export function genderOf(me: unknown): Gender | null {
  const g = isObj(me) ? me.gender : undefined;
  return g === 'female' || g === 'male' ? g : null;
}

// ---------------------------------------------------------------------------
// Jobs (§A)

export interface JobView {
  businessId: string;
  businessName: string;
  role: string;
  label: string;
  /** Minor units a month. */
  monthlyPay: number;
  hours: number;
}

function normJob(j: Record<string, unknown>): JobView | null {
  if (typeof j.businessId !== 'string' || typeof j.role !== 'string') return null;
  return {
    businessId: j.businessId,
    businessName: str(j.businessName, '—'),
    role: j.role,
    label: str(j.label, j.role),
    monthlyPay: num(j.monthlyPay),
    hours: num(j.hours, 40),
  };
}

/** Open jobs in the city you're in, best paid first; empty when the engine has none. */
export function jobsOf(view: View): JobView[] {
  return list(hereField(view, 'jobs'))
    .map(normJob)
    .filter((j): j is JobView => j !== null)
    .sort((a, b) => b.monthlyPay - a.monthlyPay || (a.businessId < b.businessId ? -1 : 1));
}

/** Your part-time job, if you have one. */
export function myJobOf(view: View): JobView | null {
  const j = (view.me as unknown as Record<string, unknown>).job;
  return isObj(j) ? normJob(j) : null;
}

// ---------------------------------------------------------------------------
// Home, car and the shop (§A)

export interface HomeItemView {
  slot: string;
  itemId: string;
  label: string;
  tier: number;
}

export interface HomeView {
  items: HomeItemView[];
  comfort: number;
}

/** What you've furnished your flat with, or null when the engine doesn't say. */
export function homeOf(view: View): HomeView | null {
  const h = (view.me as unknown as Record<string, unknown>).home;
  if (!isObj(h)) return null;
  return {
    items: list(h.items)
      .filter((i) => typeof i.slot === 'string')
      .map((i) => ({
        slot: i.slot as string,
        itemId: str(i.itemId, i.slot as string),
        label: str(i.label, i.slot as string),
        tier: Math.max(1, Math.min(3, num(i.tier, 1))),
      })),
    comfort: num(h.comfort),
  };
}

export interface CarView {
  modelId: string;
  label: string;
  monthlyCost: number;
}

export function carOf(view: View): CarView | null {
  const c = (view.me as unknown as Record<string, unknown>).car;
  if (!isObj(c) || typeof c.modelId !== 'string') return null;
  return { modelId: c.modelId, label: str(c.label, c.modelId), monthlyCost: num(c.monthlyCost) };
}

export interface ShopFurniture {
  id: string;
  slot: string;
  label: string;
  tier: number;
  price: number;
  /** Comfort points it adds (0 when the engine doesn't say). */
  comfort: number;
}

export interface ShopCar {
  id: string;
  label: string;
  kind: string;
  price: number;
  monthlyCost: number;
}

/** The furniture and car catalogue with prices; empty lists when the engine has no shop. */
export function shopOf(view: View): { furniture: ShopFurniture[]; cars: ShopCar[] } {
  const s = hereField(view, 'shop');
  if (!isObj(s)) return { furniture: [], cars: [] };
  return {
    furniture: list(s.furniture)
      .map((f) => ({
        id: str(f.itemId, str(f.id)),
        slot: str(f.slot, 'other'),
        label: str(f.label, str(f.itemId, str(f.id))),
        tier: Math.max(1, Math.min(3, num(f.tier, 1))),
        price: num(f.price),
        comfort: num(f.comfort),
      }))
      .filter((f) => f.id && f.price > 0),
    cars: list(s.cars)
      .map((c) => ({
        id: str(c.modelId, str(c.id)),
        label: str(c.label, str(c.modelId, str(c.id))),
        kind: str(c.kind, str(c.modelId, str(c.id))),
        price: num(c.price),
        monthlyCost: num(c.monthlyCost),
      }))
      .filter((c) => c.id && c.price > 0),
  };
}

/** Which business kinds sell furniture or cars (by kind, for engines without `sells`). */
export const sellsCars = (kind: string) => /car-|dealer|motor|showroom|auto/i.test(kind);
export const sellsFurniture = (kind: string) => /furnit|interior|homeware|decor/i.test(kind);
export const sellsAppliances = (kind: string) => /applian|electronic/i.test(kind);

/**
 * Every home slot, in the order the flat and the showrooms show them
 * (docs/WAVE6-ALIVE-CITY.md §A3): the Wave 5 nine, then the Wave 6 twelve.
 * Slots the engine adds later still show (after these).
 */
export const HOME_SLOTS = [
  'sofa',
  'bed',
  'desk',
  'tv',
  'plants',
  'art',
  'kitchen',
  'sound',
  'gaming',
  'fridge',
  'washer',
  'cooling',
  'power',
  'lights',
  'rug',
  'dining',
  'wardrobe',
  'books',
  'coffee',
  'wifi',
  'laptop',
] as const;

/** Furniture store slots; the rest are appliances and electronics (§A3 `SHOP_KINDS_FOR_SLOT`). */
const FURNITURE_STORE_SLOTS = new Set([
  'sofa',
  'bed',
  'desk',
  'plants',
  'art',
  'rug',
  'dining',
  'wardrobe',
  'books',
  'lights',
]);

/** Which kind of showroom sells a slot: 'furniture' or 'appliance'. */
export const storeForSlot = (slot: string): 'furniture' | 'appliance' =>
  FURNITURE_STORE_SLOTS.has(slot) ? 'furniture' : 'appliance';

/** What a business sells you for your home: furniture slots, cars, or nothing. */
export type Sells = { slots: string[] } | { cars: true } | null;

/** The raw business entry, for Wave 6 fields the shared normaliser doesn't keep. */
function rawBusiness(view: View, businessId: string): Record<string, unknown> | null {
  const xs = (view.market as unknown as { businesses?: unknown }).businesses;
  return Array.isArray(xs)
    ? ((xs.find((b) => isObj(b) && b.id === businessId) as Record<string, unknown>) ?? null)
    : null;
}

/**
 * `businesses[].sells` (§A3) when the engine sends it; otherwise guessed
 * from the kind (furniture store, appliance or electronics shop, car dealer).
 */
export function sellsOf(view: View, b: Pick<BusinessView, 'id' | 'kind'>): Sells {
  const raw = rawBusiness(view, b.id);
  if (raw && 'sells' in raw) {
    const s = raw.sells;
    if (isObj(s) && s.cars === true) return { cars: true };
    if (isObj(s) && Array.isArray(s.slots))
      return { slots: s.slots.filter((x): x is string => typeof x === 'string') };
    return null;
  }
  if (sellsCars(b.kind)) return { cars: true };
  const all = [...HOME_SLOTS];
  if (sellsFurniture(b.kind)) return { slots: all.filter((s) => storeForSlot(s) === 'furniture') };
  if (sellsAppliances(b.kind)) return { slots: all.filter((s) => storeForSlot(s) === 'appliance') };
  return null;
}

/** Whether a business sells this slot (or cars, with 'car'). */
export function sellsThing(view: View, b: Pick<BusinessView, 'id' | 'kind'>, what: string) {
  const s = sellsOf(view, b);
  if (!s) return false;
  if ('cars' in s) return what === 'car';
  // A furniture store from an older engine still sells the slots it always did.
  return s.slots.includes(what);
}

// ---------------------------------------------------------------------------
// Things to do (§A2)

export interface VenueItemView {
  id: string;
  label: string;
  price: number;
  energy?: number;
  meeting?: boolean;
  /** 0..10. */
  fun: number;
  /** 0..1: the chance you meet someone here. */
  meetChance: number;
  /** A thing to do (dance, watch a film), not just food. */
  activity: boolean;
}

/** Labels that are fun even from an engine without `activity` (Wave 5 clubs, cinemas…). */
const FUN_WORDS =
  /danc|film|movie|cinema|premiere|karaoke|sing|bowl|arcade|massage|spa |day pass|ticket|gig\b|open-mic|five-a-side|match|exhibition|opening|entry|vip|bottle|day bed|party|shisha|dj\b/i;

/** A business's venue items with the Wave 6 fun fields (absent → 0 / false). */
export function venueItemsOf(view: View, businessId: string): VenueItemView[] {
  const raw = rawBusiness(view, businessId);
  const venue = raw && isObj(raw.venue) ? raw.venue : null;
  return list(venue?.items)
    .filter((i) => typeof i.id === 'string')
    .map((i) => {
      const label = str(i.label, i.id as string);
      const fun = Math.max(0, Math.min(10, num(i.fun)));
      return {
        id: i.id as string,
        label,
        price: num(i.price),
        ...(typeof i.energy === 'number' ? { energy: i.energy } : {}),
        ...(i.meeting === true ? { meeting: true } : {}),
        fun,
        meetChance: Math.max(0, Math.min(1, num(i.meetChance))),
        activity:
          i.activity === true || (i.activity === undefined && (fun > 0 || FUN_WORDS.test(label))),
      };
    });
}

/** Someone you met doing something (`venueBuy` → `met`, §A2). */
export interface Met {
  name: string;
  kind: string;
  refId: string;
  /** "Nurse", "Founder, Kola Pay"; empty when the engine doesn't say. */
  role: string;
  /** The Who's here id (`fund:<id>`, `npc:…`, a player id) that `contact.save` takes. */
  personId: string;
}

export function metOf(result: unknown): Met | null {
  const m = isObj(result) ? result.met : null;
  if (!isObj(m) || typeof m.refId !== 'string' || !m.refId) return null;
  return {
    name: str(m.name, '—'),
    kind: str(m.kind, 'local'),
    refId: m.refId,
    role: str(m.role),
    // Older engines sent only refId; a fund's refId is its bare id.
    personId: str(m.personId) || (m.kind === 'fund' ? `fund:${m.refId}` : m.refId),
  };
}

/** The nearest of `xs` to a point (by straight line), or the first when positions are unknown. */
export function nearest<T>(
  xs: T[],
  at: (x: T) => { x: number; y: number } | undefined,
  from: { x: number; y: number } | undefined,
): T | undefined {
  if (!from) return xs[0];
  let best: T | undefined;
  let d = Infinity;
  for (const x of xs) {
    const p = at(x);
    const dd = p ? (p.x - from.x) ** 2 + (p.y - from.y) ** 2 : Number.MAX_VALUE;
    if (best === undefined || dd < d) {
      best = x;
      d = dd;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Capital (§B): accelerators, development partners, LPs, angels around town

/**
 * Your status with a programme. The engine sends `you` as one entry per
 * company you run (`{ companyId, status, reason }`); "eligible" and
 * "ineligible" mean you haven't applied yet.
 */
function youOf(raw: unknown, companyId: string | null) {
  const xs = Array.isArray(raw) ? raw.filter(isObj) : isObj(raw) ? [raw] : [];
  const mine = xs.find((x) => x.companyId === companyId) ?? xs[0] ?? {};
  const st = str(mine.status);
  return {
    status: st && st !== 'eligible' && st !== 'ineligible' && st !== 'open' ? st : null,
    eligible: st !== 'ineligible' && mine.eligible !== false && mine.canPitch !== false,
    reason: str(mine.reason) || null,
  };
}

const activeCompanyId = (view: View) =>
  (view.companies ?? []).find((c) => c.status === 'active')?.id ?? null;

export interface AcceleratorView {
  id: string;
  name: string;
  blurb: string;
  /** "applied", "accepted", "rejected", "alumni"; null when you haven't applied. */
  status: string | null;
  eligible: boolean;
  reason: string | null;
  /** Minor units offered on a SAFE. */
  cash: number;
  equityPct: number;
  demoDay: string;
}

export function acceleratorsOf(view: View): AcceleratorView[] {
  const cid = activeCompanyId(view);
  return list(hereField(view, 'accelerators'))
    .filter((a) => typeof a.id === 'string')
    .map((a) => {
      const you = youOf(a.you ?? (a.status !== undefined ? { status: a.status } : undefined), cid);
      const cohort = isObj(a.cohort) ? a.cohort : {};
      return {
        id: a.id as string,
        name: str(a.name, a.id as string),
        blurb: str(a.tagline, str(a.blurb, str(a.description))),
        ...you,
        cash: num(a.check, num(a.cash)),
        equityPct: typeof a.equityBps === 'number' ? a.equityBps / 100 : num(a.equityPct),
        demoDay: str(cohort.demoDayLabel),
      };
    });
}

export interface ProgramView {
  id: string;
  label: string;
  /** The most it gives, minor units. */
  amount: number;
  eligible: boolean;
  reason: string | null;
  status: string | null;
}

export interface DevPartnerView {
  id: string;
  name: string;
  blurb: string;
  programs: ProgramView[];
}

export function devPartnersOf(view: View): DevPartnerView[] {
  const cid = activeCompanyId(view);
  return list(hereField(view, 'devPartners'))
    .filter((p) => typeof p.id === 'string')
    .map((p) => ({
      id: p.id as string,
      name: str(p.name, p.id as string),
      blurb: str(p.kindLabel, str(p.blurb, str(p.description))),
      programs: list(p.programs)
        .filter((g) => typeof g.id === 'string')
        .map((g) => ({
          id: g.id as string,
          label: str(g.label, str(g.name, g.id as string)),
          amount: Array.isArray(g.amount) ? num(g.amount[1], num(g.amount[0])) : num(g.amount),
          ...youOf(g.you, cid),
        })),
    }));
}

export interface LpView {
  id: string;
  name: string;
  kind: string;
  kindLabel: string;
  pitch: string;
  status: string | null;
  canPitch: boolean;
  reason: string | null;
}

export function lpsOf(view: View): LpView[] {
  return list(hereField(view, 'lps'))
    .filter((l) => typeof l.id === 'string')
    .map((l) => ({
      id: l.id as string,
      name: str(l.name, l.id as string),
      kind: str(l.kind, 'lp'),
      kindLabel: str(l.kindLabel, str(l.kind)),
      pitch: str(l.pitch),
      status: (() => {
        const st = isObj(l.you) ? str(l.you.status) : '';
        return st && st !== 'open' && st !== 'no-fund' ? st : null;
      })(),
      canPitch: !isObj(l.you) || l.you.canPitch !== false,
      reason: (isObj(l.you) && str(l.you.reason)) || null,
    }));
}

/** AI angels active in the city you're in (`view.here.angels`), with their fund. */
export function cityAngelsOf(view: View): { id: string; name: string; fundId: string | null }[] {
  return list(hereField(view, 'angels'))
    .filter((a) => typeof a.id === 'string')
    .map((a) => ({
      id: a.id as string,
      name: str(a.name, '—'),
      fundId: typeof a.fundId === 'string' ? a.fundId : null,
    }));
}

export interface AngelHere {
  id: string;
  name: string;
}

/**
 * AI angels sitting in a business right now (`view.here.angelsAt`), keyed
 * by business id. Entries may be ids or `{ id | angelId, name }`.
 */
export function angelsAtOf(view: View): Record<string, AngelHere[]> | null {
  const raw = hereField(view, 'angelsAt');
  if (!isObj(raw)) return null;
  const out: Record<string, AngelHere[]> = {};
  for (const [biz, xs] of Object.entries(raw)) {
    const arr = Array.isArray(xs) ? xs : [xs];
    const people: AngelHere[] = [];
    for (const a of arr) {
      if (typeof a === 'string') people.push({ id: a, name: angelName(view, a) });
      else if (isObj(a)) {
        const id = str(a.id, str(a.angelId, str(a.playerId)));
        if (id) people.push({ id, name: str(a.name, angelName(view, id)) });
      }
    }
    if (people.length) out[biz] = people;
  }
  return out;
}

function angelName(view: View, id: string): string {
  const a = list(hereField(view, 'angels')).find((x) => x.id === id);
  if (a) return str(a.name, '—');
  const p = view.players?.find((x) => x.id === id);
  if (p) return p.name;
  for (const f of view.market.funds) {
    const a = (f as unknown as { angel?: unknown }).angel;
    if (isObj(a) && a.playerId === id) return str(a.name, f.partner);
  }
  return '—';
}

/**
 * The restaurants and cafés AI angels lunch at, in the same order the map's
 * crowd uses (./people.ts walks each angel to `venues[hash(id:lunch) % n]`).
 */
export function lunchVenues(view: View): BusinessView[] {
  return businessesOf(view)
    .filter((b) => b.open && (b.look.shape === 'restaurant' || b.look.shape === 'pub'))
    .sort((a, b) => (`biz:${a.id}` < `biz:${b.id}` ? -1 : 1));
}

export const lunchVenueOf = (angelId: string, venues: { id: string }[]) =>
  venues.length ? venues[hash(`${angelId}:lunch`) % venues.length]!.id : null;

// ---------------------------------------------------------------------------
// Events (§B): AI attendees

export function attendeesAiOf(event: unknown): { name: string; kind: string }[] {
  return list(isObj(event) ? event.attendeesAi : undefined).map((a) => ({
    name: str(a.name, '—'),
    kind: str(a.kind, 'founder'),
  }));
}

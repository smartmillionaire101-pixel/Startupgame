/**
 * The city's view contract (docs/WAVE1-CITY-AND-DEPTH.md §A, §B).
 *
 * The engine is gaining per-market lenders, fund offices, a capital profile,
 * a monthly story and a rescue plan. Until those fields reach the PlayerView
 * (and for saved worlds that predate them), this adapter reads them when
 * present and falls back to something sensible when absent, so the city
 * always renders and simply gets richer once the engine sends more.
 */
import type { Command, PlayerView } from '@runway/engine';
import type { CityInput } from './layout';

export type LenderKind =
  'high-street' | 'challenger' | 'government' | 'development' | 'microfinance' | 'fintech';

export type ProductKind =
  'startup-loan' | 'working-capital' | 'revenue-based' | 'asset-finance' | 'overdraft';

export type LenderMotif = 'columns' | 'glass' | 'kiosk' | 'tower' | 'shopfront';

export interface LenderLook {
  color: string;
  accent: string;
  motif: LenderMotif;
}

export interface LenderProductView {
  id: string;
  kind: ProductKind;
  label: string;
  borrower: 'founder' | 'company';
  pitch: string;
  termMonths: [number, number];
  guarantee: 'required' | 'optional' | 'none';
  rateBps: number;
  revenueShareBps?: number;
  amount: [number, number];
  you: { eligible: boolean; reason: string | null; maxMinor: number; companyId: string | null };
}

export interface LenderView {
  id: string;
  name: string;
  kind: LenderKind;
  appetite: 'tight' | 'normal' | 'loose';
  look: LenderLook;
  products: LenderProductView[];
  /** Client-side only: true when synthesised from `market.bankName` (no products yet). */
  fallback?: boolean;
}

export type OfficeStyle = 'loft' | 'tower' | 'garden' | 'shophouse' | 'glass';
export interface FundOffice {
  style: OfficeStyle;
  color: string;
  floor: number;
}

export interface CapitalView {
  vcDepth: number;
  angelDepth: number;
  schemes: { name: string; effect: string }[];
  sources: string[];
}

export type StoryPlace = 'bank' | 'investors' | 'market' | 'hub' | 'office' | 'home' | 'airport';

export interface StoryAction {
  label: string;
  why: string;
  place: StoryPlace;
  command?: Command;
}

export interface CompanyStory {
  month: number;
  headline: string;
  items: {
    tone: 'good' | 'bad' | 'neutral';
    text: string;
    cause: string;
    metric?: 'revenue' | 'customers' | 'cash' | 'burn' | 'morale' | 'stars' | 'product';
    delta?: number;
  }[];
  next: StoryAction[];
}

export interface RescueOption {
  id: string;
  label: string;
  effect: string;
  cost: string;
  place: StoryPlace;
  command?: Command;
}

export interface RescuePlan {
  level: 'watch' | 'danger' | 'critical';
  monthsLeft: number | null;
  deadline: string;
  options: RescueOption[];
}

type Market = PlayerView['market'];
type Fund = Market['funds'][number];
type CompanyV = PlayerView['companies'][number];

// ---------------------------------------------------------------------------
// Deterministic helpers (no Math.random: the city must look the same for
// every visit and every player in a market).

/** FNV-1a 32-bit hash. */
export function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Small seeded PRNG (mulberry32) for layout variation. */
export function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = a;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T>(xs: readonly T[], n: number): T => xs[n % xs.length]!;

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

// ---------------------------------------------------------------------------
// Lenders

const LENDER_COLORS = ['#1e3a8a', '#0f766e', '#7c2d12', '#4c1d95', '#155e75', '#9f1239'];
const LENDER_ACCENTS = ['#fbbf24', '#5eead4', '#fdba74', '#c4b5fd', '#67e8f9', '#fda4af'];
const MOTIFS: readonly LenderMotif[] = ['columns', 'glass', 'tower', 'shopfront', 'kiosk'];

/** A stable look for a lender the engine did not style. */
export function lookFor(id: string, kind?: LenderKind): LenderLook {
  const h = hash(id);
  const motif: LenderMotif =
    kind === 'high-street'
      ? 'columns'
      : kind === 'challenger'
        ? 'glass'
        : kind === 'microfinance'
          ? 'shopfront'
          : kind === 'fintech'
            ? 'kiosk'
            : kind === 'development' || kind === 'government'
              ? 'tower'
              : pick(MOTIFS, h >>> 3);
  return { color: pick(LENDER_COLORS, h), accent: pick(LENDER_ACCENTS, h), motif };
}

function normLender(raw: unknown): LenderView | null {
  if (!isObj(raw) || typeof raw.id !== 'string' || typeof raw.name !== 'string') return null;
  const kind = (typeof raw.kind === 'string' ? raw.kind : 'high-street') as LenderKind;
  const look = isObj(raw.look)
    ? ({ ...lookFor(raw.id, kind), ...raw.look } as LenderLook)
    : lookFor(raw.id, kind);
  const appetite =
    raw.appetite === 'tight' || raw.appetite === 'loose' || raw.appetite === 'normal'
      ? raw.appetite
      : typeof raw.appetite === 'number'
        ? raw.appetite < 0.85
          ? 'tight'
          : raw.appetite > 1.15
            ? 'loose'
            : 'normal'
        : 'normal';
  const products = Array.isArray(raw.products)
    ? (raw.products.filter(
        (p) => isObj(p) && typeof p.id === 'string' && Array.isArray(p.amount),
      ) as unknown as LenderProductView[])
    : [];
  return { id: raw.id, name: raw.name, kind, appetite, look, products };
}

/**
 * The market's lenders. Falls back to one high-street lender named after
 * `market.bankName` (the AI bank every market has today) with no products,
 * in which case the bank interior shows the existing loan form.
 */
export function lendersOf(view: Pick<PlayerView, 'market'>): LenderView[] {
  const raw = (view.market as Market & { lenders?: unknown }).lenders;
  const list = Array.isArray(raw)
    ? raw.map(normLender).filter((x): x is LenderView => x !== null)
    : [];
  if (list.length) return list;
  const id = `bank-${view.market.id}`;
  return [
    {
      id,
      name: view.market.bankName,
      kind: 'high-street',
      appetite: 'normal',
      look: lookFor(id, 'high-street'),
      products: [],
      fallback: true,
    },
  ];
}

// ---------------------------------------------------------------------------
// Fund offices

const OFFICE_STYLES: readonly OfficeStyle[] = ['loft', 'tower', 'garden', 'shophouse', 'glass'];
const OFFICE_COLORS = [
  '#b45309',
  '#0e7490',
  '#4d7c0f',
  '#be185d',
  '#475569',
  '#7c3aed',
  '#c2410c',
  '#0369a1',
];

/** The fund's office: from the engine when present, else derived from the id. */
export function officeOf(fund: Pick<Fund, 'id'>): FundOffice {
  const raw = (fund as { office?: unknown }).office;
  const h = hash(fund.id);
  const derived: FundOffice = {
    style: pick(OFFICE_STYLES, h),
    color: pick(OFFICE_COLORS, h >>> 4),
    floor: 1 + ((h >>> 9) % 6),
  };
  if (!isObj(raw)) return derived;
  return {
    style: OFFICE_STYLES.includes(raw.style as OfficeStyle)
      ? (raw.style as OfficeStyle)
      : derived.style,
    color: typeof raw.color === 'string' ? raw.color : derived.color,
    floor: typeof raw.floor === 'number' ? raw.floor : derived.floor,
  };
}

// ---------------------------------------------------------------------------
// Capital profile, story, rescue

export function capitalOf(view: Pick<PlayerView, 'market'>): CapitalView | null {
  const raw = (view.market as Market & { capital?: unknown }).capital;
  if (!isObj(raw)) return null;
  return {
    vcDepth: typeof raw.vcDepth === 'number' ? raw.vcDepth : 1,
    angelDepth: typeof raw.angelDepth === 'number' ? raw.angelDepth : 1,
    schemes: Array.isArray(raw.schemes) ? (raw.schemes as CapitalView['schemes']) : [],
    sources: Array.isArray(raw.sources) ? (raw.sources as string[]) : [],
  };
}

export function storyOf(c: CompanyV | undefined | null): CompanyStory | null {
  const raw = c ? (c as CompanyV & { story?: unknown }).story : null;
  if (!isObj(raw) || typeof raw.headline !== 'string') return null;
  return {
    month: typeof raw.month === 'number' ? raw.month : 0,
    headline: raw.headline,
    items: Array.isArray(raw.items) ? (raw.items as CompanyStory['items']) : [],
    next: Array.isArray(raw.next) ? (raw.next as StoryAction[]) : [],
  };
}

export function rescueOf(c: CompanyV | undefined | null): RescuePlan | null {
  const raw = c ? (c as CompanyV & { rescue?: unknown }).rescue : null;
  if (!isObj(raw)) return null;
  const level =
    raw.level === 'watch' || raw.level === 'danger' || raw.level === 'critical'
      ? raw.level
      : 'watch';
  return {
    level,
    monthsLeft: typeof raw.monthsLeft === 'number' ? raw.monthsLeft : null,
    deadline: typeof raw.deadline === 'string' ? raw.deadline : '',
    options: Array.isArray(raw.options) ? (raw.options as RescueOption[]) : [],
  };
}

/** The founder's active company, if any. */
export const activeCompany = (view: Pick<PlayerView, 'companies'>) =>
  view.companies.find((c) => c.status === 'active') ?? null;

/** Everything the layout needs from the view, with fallbacks applied. */
export function cityInput(view: PlayerView): CityInput {
  const c = activeCompany(view);
  return {
    marketId: view.market.id,
    lenders: lendersOf(view).map((l) => ({ id: l.id, name: l.name, look: l.look })),
    playerBanks: view.market.banks.map((b) => ({ id: b.id, name: b.name })),
    funds: view.market.funds.map((f) => ({ id: f.id, name: f.name, office: officeOf(f) })),
    segments: view.market.segments.map((s) => ({
      key: s.key,
      name: s.name,
      industry: s.industry,
    })),
    industry: c?.industry ?? null,
    office: c ? { headcount: c.teamSize, siren: rescueOf(c) !== null } : null,
    homeTier: view.me.lifestyle.tier,
    // Wave 2: the Event Hall opens once the engine sends events.
    eventsOpen: Array.isArray((view.market as Market & { events?: unknown }).events),
    // Wave 3: local businesses, each in the district its seed names.
    businesses: businessesOf(view)
      .filter((b) => b.open)
      .map((b) => ({
        id: b.id,
        name: b.name,
        kind: b.kind,
        category: b.category,
        district: b.district,
        shape: b.look.shape,
        color: b.look.color,
        awning: b.look.awning,
      })),
  };
}

// ---------------------------------------------------------------------------
// Local businesses (Wave 3 §B views). Read when the engine sends them; a
// world without `market.businesses` simply has no businesses on the map.

export type BusinessCategory =
  'food' | 'retail' | 'services' | 'trades' | 'health' | 'education' | 'logistics' | 'hospitality';

export const BUSINESS_CATEGORIES: readonly BusinessCategory[] = [
  'food',
  'retail',
  'services',
  'trades',
  'health',
  'education',
  'logistics',
  'hospitality',
];

export type BusinessShape =
  | 'shopfront'
  | 'stall'
  | 'kiosk'
  | 'restaurant'
  | 'pub'
  | 'warehouse'
  | 'clinic'
  | 'school'
  | 'hotel';

const SHAPES: readonly BusinessShape[] = [
  'shopfront',
  'stall',
  'kiosk',
  'restaurant',
  'pub',
  'warehouse',
  'clinic',
  'school',
  'hotel',
];

/** Colour per category: map labels, Places list dots and the filter chips. */
export const CATEGORY_COLOR: Record<BusinessCategory, string> = {
  food: '#ea580c',
  retail: '#db2777',
  services: '#7c3aed',
  trades: '#78716c',
  health: '#dc2626',
  education: '#2563eb',
  logistics: '#0f766e',
  hospitality: '#ca8a04',
};

export interface BusinessItemView {
  id: string;
  label: string;
  /** Minor units. */
  price: number;
  energy?: number;
  meeting?: boolean;
}

export interface BusinessGigView {
  id: string;
  label: string;
  hours: number;
  /** Minor units. */
  pay: number;
  skillMatch: boolean;
}

export interface BusinessBuyView {
  sector: string;
  label: string;
  /** Minor units a month, approximate. */
  monthlyBudget: number;
  supplier: { companyId: string; name: string; you: boolean } | null;
}

export interface BusinessView {
  id: string;
  name: string;
  kind: string;
  kindLabel: string;
  category: BusinessCategory;
  district: string;
  owner: { name: string };
  look: { shape: BusinessShape; awning: string | null; color: string };
  open: boolean;
  venue: { items: BusinessItemView[] } | null;
  gigs: BusinessGigView[];
  buys: BusinessBuyView[];
  you: { customer: boolean; canPitch: boolean; reason: string | null };
}

const strOf = (v: unknown, d = ''): string => (typeof v === 'string' ? v : d);
const numOf = (v: unknown, d = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);

/** A café is drawn as a café even though its look is a restaurant's. */
export const isCafe = (kind: string) => /caf|coffee|bakery|tea|juice|roaster/i.test(kind);

function normBusiness(raw: unknown): BusinessView | null {
  if (!isObj(raw) || typeof raw.id !== 'string' || typeof raw.name !== 'string') return null;
  const look = isObj(raw.look) ? raw.look : {};
  const category = (
    BUSINESS_CATEGORIES.includes(raw.category as BusinessCategory) ? raw.category : 'retail'
  ) as BusinessCategory;
  const shape = (
    SHAPES.includes(look.shape as BusinessShape) ? look.shape : 'shopfront'
  ) as BusinessShape;
  const items = isObj(raw.venue) && Array.isArray(raw.venue.items) ? raw.venue.items : null;
  const you = isObj(raw.you) ? raw.you : {};
  return {
    id: raw.id,
    name: raw.name,
    kind: strOf(raw.kind, 'shop'),
    kindLabel: strOf(raw.kindLabel, strOf(raw.kind, 'Shop')),
    category,
    district: strOf(raw.district),
    owner: { name: strOf(isObj(raw.owner) ? raw.owner.name : undefined, '—') },
    look: {
      shape,
      awning: typeof look.awning === 'string' ? look.awning : null,
      color: strOf(look.color, CATEGORY_COLOR[category]),
    },
    open: raw.open !== false,
    venue: items
      ? {
          items: items
            .filter((i): i is Record<string, unknown> => isObj(i) && typeof i.id === 'string')
            .map((i) => ({
              id: i.id as string,
              label: strOf(i.label, i.id as string),
              price: numOf(i.price),
              ...(typeof i.energy === 'number' ? { energy: i.energy } : {}),
              ...(i.meeting === true ? { meeting: true } : {}),
            })),
        }
      : null,
    gigs: (Array.isArray(raw.gigs) ? raw.gigs : [])
      .filter((g): g is Record<string, unknown> => isObj(g) && typeof g.id === 'string')
      .map((g) => ({
        id: g.id as string,
        label: strOf(g.label, g.id as string),
        hours: numOf(g.hours),
        pay: numOf(g.pay),
        skillMatch: g.skillMatch === true,
      })),
    buys: (Array.isArray(raw.buys) ? raw.buys : [])
      .filter((b): b is Record<string, unknown> => isObj(b) && typeof b.sector === 'string')
      .map((b) => {
        const s = isObj(b.supplier) ? b.supplier : null;
        return {
          sector: b.sector as string,
          label: strOf(b.label, b.sector as string),
          monthlyBudget: numOf(b.monthlyBudget),
          supplier:
            s && typeof s.companyId === 'string'
              ? { companyId: s.companyId, name: strOf(s.name, '—'), you: s.you === true }
              : null,
        };
      }),
    you: {
      customer: you.customer === true,
      canPitch: you.canPitch !== false,
      reason: typeof you.reason === 'string' ? you.reason : null,
    },
  };
}

/** The market's local businesses; empty when the engine doesn't send them yet. */
export function businessesOf(view: Pick<PlayerView, 'market'>): BusinessView[] {
  const raw = (view.market as Market & { businesses?: unknown }).businesses;
  if (!Array.isArray(raw)) return [];
  return raw.map(normBusiness).filter((b): b is BusinessView => b !== null);
}

/** Whether this build's engine sends businesses at all. */
export const hasBusinesses = (view: Pick<PlayerView, 'market'>) =>
  Array.isArray((view.market as Market & { businesses?: unknown }).businesses);

export interface AngelRef {
  id: string;
  name: string;
  fundId: string | null;
}

/** AI angel investors: from angel funds (`fund.angel`), else AI investor players. */
export function angelsOf(view: Pick<PlayerView, 'market' | 'players'>): AngelRef[] {
  const out = new Map<string, AngelRef>();
  for (const f of view.market.funds) {
    const a = (f as Fund & { angel?: unknown }).angel;
    if (f.market !== view.market.id || !isObj(a) || typeof a.playerId !== 'string') continue;
    out.set(a.playerId, { id: a.playerId, name: strOf(a.name, f.partner), fundId: f.id });
  }
  for (const p of (view.players ?? []) as (PlayerView['players'][number] & {
    ai?: unknown;
    angel?: unknown;
  })[]) {
    if (p.role !== 'investor' || p.ai !== true || out.has(p.id)) continue;
    const fundId = isObj(p.angel) && typeof p.angel.fundId === 'string' ? p.angel.fundId : null;
    out.set(p.id, { id: p.id, name: p.name, fundId });
  }
  return [...out.values()].sort((a, b) => (a.id < b.id ? -1 : 1));
}

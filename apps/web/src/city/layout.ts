/**
 * Deterministic city layout (docs/WAVE1-CITY-AND-DEPTH.md §C, Wave 3 §C).
 *
 * The city is a square grid of blocks separated by streets. A market with a
 * city plan (./plans) is laid out from it: named districts where the plan
 * puts them, water along a coast or a river across the city with bridges,
 * hills, its own street pattern and landmarks. The important places (banks,
 * funds, the Hub and your office, the Market, home, the Event Hall, the
 * airport) go into the districts that host them, and local businesses into
 * the district their seed names. A market without a plan gets the original
 * generator: districts along a spiral out from downtown.
 *
 * Everything is seeded by the market id: the same market always looks the
 * same. Coordinates: "grid" units (tiles) on the ground plane; streets run
 * along x = k·B and y = k·B. `project` maps grid → screen pixels (2:1
 * isometric). Some street segments can be closed (crossing a river without a
 * bridge, or an organic city's merged blocks): `cuts` lists them, and
 * walking (findPath) never uses them.
 */
import {
  hash,
  isCafe,
  seeded,
  type BusinessCategory,
  type BusinessShape,
  type FundOffice,
  type LenderLook,
} from './contract';
import { flavourOf, type Flavour, type LandmarkKind, type VehicleSpec } from './flavour';
import { planOf, type CityPlan, type DistrictKind, type Host, type Side } from './plans';
import type { GeoWorld } from './geoLayout';
import type { SpriteKind } from './geo';

/**
 * Tiles from one street to the next. Wave 4 made blocks bigger (4 → 5) and
 * streets wider, so buildings stand apart with room to breathe.
 */
export const B = 5;
/** Half a street's width (street line to kerb), in tiles. */
export const SW = 0.62;
/** Half the width of a tile and half its height, in screen px. */
export const TW = 32;
export const TH = 16;
/** Land drawn around the street grid, in tiles. */
export const MARGIN = 6;
/** How far a beach's sea starts from the last street (tiles). */
export const BEACH_W = 3.4;

export interface Pt {
  x: number;
  y: number;
}

export const project = (x: number, y: number): Pt => ({ x: (x - y) * TW, y: (x + y) * TH });
export const unproject = (sx: number, sy: number): Pt => ({
  x: (sx / TW + sy / TH) / 2,
  y: (sy / TH - sx / TW) / 2,
});

/** What a block is used for (drives its ground tint). */
export type DistrictId =
  | 'downtown'
  | 'residential'
  | 'landmark'
  | 'finance'
  | 'investors'
  | 'market'
  | 'events'
  | 'airport'
  | 'park'
  | 'houses'
  | 'shops';

export type PlaceKind =
  | 'lender'
  | 'playerbank'
  | 'fund'
  | 'stall'
  | 'hub'
  | 'office'
  | 'home'
  | 'airport'
  | 'newsstand'
  | 'eventhall'
  | 'business'
  /** Wave 5: an accelerator, a development partner or an LP's office. */
  | 'capital';

export type Motif =
  | 'columns'
  | 'glass'
  | 'kiosk'
  | 'tower'
  | 'shopfront'
  | 'loft'
  | 'garden'
  | 'shophouse'
  | 'stall'
  | 'hub'
  | 'office'
  | 'home'
  | 'terminal'
  | 'newsstand'
  | 'hall'
  | 'b-shop'
  | 'b-stall'
  | 'b-kiosk'
  | 'b-restaurant'
  | 'b-cafe'
  | 'b-pub'
  | 'b-warehouse'
  | 'b-clinic'
  | 'b-school'
  | 'b-hotel';

export interface Place {
  id: string;
  kind: PlaceKind;
  /** Proper name for lenders, funds, stalls, businesses; empty for generic places. */
  name: string;
  district: DistrictId;
  /** The plan district it stands in (planned cities only). */
  area?: string;
  /** A business's category (colour-coded). */
  category?: BusinessCategory;
  /** Footprint on the ground (grid units). */
  x: number;
  y: number;
  w: number;
  d: number;
  /** Height in px. */
  h: number;
  motif: Motif;
  color: string;
  accent: string;
  /** Where the avatar stands to go in: a point on a street. */
  door: Pt;
  /** Which visible face the door is drawn on, if any. */
  doorFace: 'left' | 'right' | null;
  ref?: string;
  /** Lifestyle tier for the home, headcount for the office. */
  level?: number;
  siren?: boolean;
  soon?: boolean;
  dim?: boolean;
}

export interface Decor {
  kind:
    | 'tree'
    | 'house'
    | 'fountain'
    | 'bench'
    | 'landmark'
    | 'runway'
    | 'lamp'
    | 'hill'
    | 'bridge'
    | 'station'
    /** Wave 6: an empty building plot (no dead buildings: new businesses open here). */
    | 'lot';
  x: number;
  y: number;
  w?: number;
  d?: number;
  h?: number;
  color?: string;
  roof?: string;
  size?: number;
  /** Landmark art (planned cities); else the flavour's landmark. */
  landmark?: LandmarkKind;
  /** Landmark, bridge or station name. */
  name?: string;
  /** Bridge: its two ends, and its style. */
  from?: Pt;
  to?: Pt;
  style?: Bridge['style'];
  /** Wave 8: a real map's hand-drawn landmark (geoSprites.tsx). */
  sprite?: SpriteKind;
}

export interface Vehicle {
  spec: VehicleSpec;
  /** Grid start and end, along one street. */
  from: Pt;
  to: Pt;
  axis: 'x' | 'y';
  dur: number;
  delay: number;
  /** Wave 8: the road's real line on a real map (tiles), instead of from → to. */
  path?: Pt[];
}

export interface Block {
  i: number;
  j: number;
  district: DistrictId;
  /** The plan district (planned cities only). */
  area?: string;
}

export interface StreetName {
  name: string;
  axis: 'x' | 'y';
  /** The street line: x = k·B for axis 'y', y = k·B for axis 'x'. */
  k: number;
  /** Which segment along the street carries the name (default: the middle). */
  seg?: number;
}

/** A named district of a planned city. */
export interface Area {
  id: string;
  name: string;
  kind: DistrictKind;
  at: Pt;
}

/** A body of water, as a rectangle in grid units. */
export interface Water {
  name: string;
  kind: 'edge' | 'river';
  side: Side;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface Bridge {
  name: string;
  from: Pt;
  to: Pt;
  style: 'suspension' | 'bascule' | 'beam' | 'arch';
  color: string;
  /** A street you can walk (over a river), or scenery (off over the coast). */
  walk: boolean;
}

export interface Boat {
  kind: 'ferry' | 'abra';
  from: Pt;
  to: Pt;
  dur: number;
  delay: number;
}

export interface CityLayout {
  marketId: string;
  flavour: Flavour;
  /** Blocks per side. */
  size: number;
  /** Street-grid extent in tiles (size · B). */
  extent: number;
  blocks: Block[];
  places: Place[];
  decor: Decor[];
  vehicles: Vehicle[];
  streets: StreetName[];
  districts: { id: DistrictId; at: Pt }[];
  /** Named districts, in plan order (empty without a plan). */
  areas: Area[];
  waters: Water[];
  bridges: Bridge[];
  /** Closed street segments, as segKey()s. */
  cuts: string[];
  boats: Boat[];
  /** Intersections with a roundabout. */
  roundabouts: Pt[];
  transit: string[];
  /** Screen-space bounds (px) of everything drawn. */
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  /** Where the avatar starts: your office's door (or downtown). */
  start: Pt;
  /** Wave 5: the city's real market name (planned cities). */
  marketName?: string;
  /** Wave 5: a beach along a coast: wider sand, umbrellas, its name. */
  beach?: { side: Side; name: string };
  /**
   * Wave 8: the real city (OpenStreetMap): its walk graph and map data. Grid
   * fields (size, extent, blocks, streets, cuts) are empty then.
   */
  geo?: GeoWorld;
}

/** Metres in a tile of the generated city (the travel maths counts in these). */
export const TILE_METRES = 50;

/** A path's length in travel tiles (about 50 m each), whatever the map's scale. */
export const travelTiles = (layout: { geo?: GeoWorld }, len: number) =>
  layout.geo ? (len * layout.geo.tileM) / TILE_METRES : len;

export interface BizInput {
  id: string;
  name: string;
  kind: string;
  category: BusinessCategory;
  district: string;
  shape: BusinessShape;
  color: string;
  awning: string | null;
}

export interface CityInput {
  marketId: string;
  lenders: { id: string; name: string; look: LenderLook }[];
  playerBanks: { id: string; name: string }[];
  funds: { id: string; name: string; office: FundOffice }[];
  segments: { key: string; name: string; industry: string }[];
  /** Your company's industry: its stalls are lit, the rest dimmed. */
  industry: string | null;
  office: { headcount: number; siren: boolean } | null;
  homeTier: number;
  /** Wave 2: hosted events are available (otherwise the hall is "opening soon"). */
  eventsOpen?: boolean;
  /** Wave 3: open local businesses. */
  businesses?: BizInput[];
  /** Wave 5: accelerators (near the Hub), development partners and LPs (with the investors). */
  capital?: CapitalInput[];
}

export type CapitalKind = 'accelerator' | 'devpartner' | 'lp';
export interface CapitalInput {
  id: string;
  name: string;
  kind: CapitalKind;
}

const CAPITAL_LOOK: Record<CapitalKind, { motif: Motif; color: string; accent: string }> = {
  accelerator: { motif: 'loft', color: '#7e22ce', accent: '#f0abfc' },
  devpartner: { motif: 'garden', color: '#0e7490', accent: '#a5f3fc' },
  lp: { motif: 'tower', color: '#334155', accent: '#fde68a' },
};

const LENDER_H: Record<string, number> = {
  columns: 46,
  glass: 72,
  tower: 96,
  shopfront: 30,
  kiosk: 22,
};
const OFFICE_H: Record<string, number> = {
  loft: 48,
  tower: 92,
  garden: 28,
  shophouse: 40,
  glass: 62,
};

/** Footprints per business shape (tiles; height in px). */
const BIZ_SIZE: Record<BusinessShape, { w: number; d: number; h: number }> = {
  shopfront: { w: 1.1, d: 1.0, h: 26 },
  stall: { w: 0.8, d: 0.8, h: 15 },
  kiosk: { w: 0.7, d: 0.7, h: 17 },
  restaurant: { w: 1.2, d: 0.9, h: 24 },
  pub: { w: 1.1, d: 1.05, h: 30 },
  warehouse: { w: 1.35, d: 1.2, h: 24 },
  clinic: { w: 1.2, d: 1.1, h: 30 },
  school: { w: 1.35, d: 1.15, h: 32 },
  hotel: { w: 1.3, d: 1.25, h: 66 },
};

/** Canonical key of the street segment between two adjacent intersections. */
export const segKey = (i: number, j: number, i2: number, j2: number) =>
  i < i2 || (i === i2 && j < j2) ? `${i},${j}|${i2},${j2}` : `${i2},${j2}|${i},${j}`;

/** Cells of an n×n grid in spiral order from the centre. */
export function spiral(n: number, turn: 1 | -1, heading: number): [number, number][] {
  const dirs: [number, number][] = [
    [1, 0],
    [0, 1],
    [-1, 0],
    [0, -1],
  ];
  const out: [number, number][] = [];
  let x = Math.floor((n - 1) / 2);
  let y = Math.floor((n - 1) / 2);
  let d = heading % 4;
  let len = 1;
  out.push([x, y]);
  while (out.length < n * n) {
    for (let rep = 0; rep < 2; rep++) {
      const [dx, dy] = dirs[d]!;
      for (let s = 0; s < len; s++) {
        x += dx;
        y += dy;
        if (x >= 0 && y >= 0 && x < n && y < n) out.push([x, y]);
      }
      d = (d + (turn === 1 ? 1 : 3)) % 4;
    }
    len++;
    if (len > 4 * n) break;
  }
  return out;
}

/** The four corner lots of a block: x0/y0 in tiles and which streets they touch. */
const LOT_SIZE = 1.35;
const LOT = [SW + 0.2, B - SW - 0.2 - LOT_SIZE];
/** Front lots first, so the most important buildings face the viewer. */
const LOT_ORDER: [0 | 1, 0 | 1][] = [
  [1, 1],
  [0, 1],
  [1, 0],
  [0, 0],
];

export type Lot = { x: number; y: number; a: 0 | 1; b: 0 | 1 };
export function lot(i: number, j: number, a: 0 | 1, b: 0 | 1): Lot {
  return { x: i * B + LOT[a]!, y: j * B + LOT[b]!, a, b };
}

/** Door for a footprint at a corner lot: prefer the visible faces (south, then east). */
function doorFor(
  i: number,
  j: number,
  a: 0 | 1,
  b: 0 | 1,
  x: number,
  y: number,
  w: number,
  d: number,
): { door: Pt; doorFace: Place['doorFace'] } {
  if (b === 1) return { door: { x: x + w / 2, y: (j + 1) * B }, doorFace: 'left' };
  if (a === 1) return { door: { x: (i + 1) * B, y: y + d / 2 }, doorFace: 'right' };
  return { door: { x: x + w / 2, y: j * B }, doorFace: null };
}

// ---------------------------------------------------------------------------
// Building helpers, shared by both generators

export interface Ctx {
  input: CityInput;
  flavour: Flavour;
  rnd: () => number;
  places: Place[];
  decor: Decor[];
}

const pickColor = (ctx: Ctx, xs: string[]) => xs[Math.floor(ctx.rnd() * xs.length)]!;
export type Cell = { i: number; j: number };

/** Your office, the Hub, the newsstand and a fountain, on one block. */
export function putDowntown(ctx: Ctx, { i, j }: Cell, area?: string) {
  const { input, places, decor } = ctx;
  const head = input.office?.headcount ?? 0;
  const w = head < 3 ? 1.05 : head < 8 ? 1.2 : LOT_SIZE;
  const l = lot(i, j, 1, 1);
  const x = l.x + (LOT_SIZE - w);
  const y = l.y + (LOT_SIZE - w);
  places.push({
    id: 'office',
    kind: 'office',
    name: '',
    district: 'downtown',
    area,
    x,
    y,
    w,
    d: w,
    h: input.office ? 30 + Math.min(70, head * 7) : 34,
    motif: 'office',
    color: '#0f766e',
    accent: '#5eead4',
    ...doorFor(i, j, 1, 1, x, y, w, w),
    level: head,
    siren: input.office?.siren ?? false,
  });
  const lh = lot(i, j, 0, 1);
  places.push({
    id: 'hub',
    kind: 'hub',
    name: '',
    district: 'downtown',
    area,
    x: lh.x,
    y: lh.y + 0.1,
    w: LOT_SIZE,
    d: 1.2,
    h: 30,
    motif: 'hub',
    color: '#f59e0b',
    accent: '#fde68a',
    ...doorFor(i, j, 0, 1, lh.x, lh.y + 0.1, LOT_SIZE, 1.2),
  });
  const ln = lot(i, j, 1, 0);
  places.push({
    id: 'newsstand',
    kind: 'newsstand',
    name: '',
    district: 'downtown',
    area,
    x: ln.x + 0.65,
    y: ln.y + 0.45,
    w: 0.6,
    d: 0.5,
    h: 16,
    motif: 'newsstand',
    color: '#1d4ed8',
    accent: '#fef08a',
    ...doorFor(i, j, 1, 0, ln.x + 0.65, ln.y + 0.45, 0.6, 0.5),
  });
  const lt = lot(i, j, 0, 0);
  decor.push({ kind: 'fountain', x: lt.x + 0.7, y: lt.y + 0.7, size: 0.6 });
  decor.push({ kind: 'bench', x: lt.x + 0.2, y: lt.y + 1.15 });
}

/** Your home, plus the neighbours' gardens (every building on the map opens). */
export function putHome(ctx: Ctx, { i, j }: Cell, area?: string) {
  const { input, flavour, places, decor } = ctx;
  const tier = Math.max(1, Math.min(5, input.homeTier));
  const l = lot(i, j, 1, 1);
  const w = tier >= 4 ? LOT_SIZE : 1.05;
  const x = l.x + (LOT_SIZE - w);
  const y = l.y + (LOT_SIZE - w);
  places.push({
    id: 'home',
    kind: 'home',
    name: '',
    district: 'residential',
    area,
    x,
    y,
    w,
    d: w,
    h: tier === 1 ? 50 : tier === 2 ? 24 : tier === 3 ? 30 : tier === 4 ? 34 : 28,
    motif: 'home',
    color: pickColor(ctx, flavour.walls),
    accent: pickColor(ctx, flavour.roofs),
    ...doorFor(i, j, 1, 1, x, y, w, w),
    level: tier,
  });
  for (const [a, b] of [
    [0, 1],
    [1, 0],
    [0, 0],
  ] as [0 | 1, 0 | 1][]) {
    const lh = lot(i, j, a, b);
    // Keep the RNG draws of the old houses, so the rest of the city stays put.
    ctx.rnd();
    pickColor(ctx, flavour.walls);
    pickColor(ctx, flavour.roofs);
    decor.push({ kind: 'tree', x: lh.x + 0.45 + a * 0.5, y: lh.y + 0.45 + b * 0.5, size: 0.9 });
  }
}

export function putEventHall(ctx: Ctx, { i, j }: Cell, area?: string) {
  const x = i * B + (B - 2.8) / 2;
  const y = (j + 1) * B - SW - 0.25 - 2.2;
  ctx.places.push({
    id: 'eventhall',
    kind: 'eventhall',
    name: '',
    district: 'events',
    area,
    x,
    y,
    w: 2.8,
    d: 2.2,
    h: 40,
    motif: 'hall',
    color: '#e2e8f0',
    accent: '#8b5cf6',
    door: { x: x + 1.4, y: (j + 1) * B },
    doorFace: 'left',
    soon: !ctx.input.eventsOpen,
  });
}

export function putAirport(ctx: Ctx, { i, j }: Cell, area?: string) {
  const x = i * B + SW + 0.2;
  const y = (j + 1) * B - SW - 0.2 - 1.35;
  ctx.places.push({
    id: 'airport',
    kind: 'airport',
    name: '',
    district: 'airport',
    area,
    x,
    y,
    w: 2.9,
    d: 1.35,
    h: 28,
    motif: 'terminal',
    color: '#f1f5f9',
    accent: '#0ea5e9',
    door: { x: x + 1.45, y: (j + 1) * B },
    doorFace: 'left',
  });
  ctx.decor.push({
    kind: 'runway',
    x: i * B + SW + 0.1,
    y: j * B + SW + 0.15,
    w: B - 2 * SW - 0.2,
    d: 1.3,
  });
}

const AWNINGS = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#a855f7', '#ec4899', '#14b8a6'];

const STALL_GAP = 1.2;
const STALL0 = (B - 2 * STALL_GAP - 0.76) / 2;

/** A plaza of stalls, nine per block, one per customer segment. */
export function putStalls(ctx: Ctx, blocks: Cell[], area?: string) {
  const { input, places, decor } = ctx;
  let n = 0;
  for (const blk of blocks) {
    for (let k = 0; k < 9; k++) {
      const seg = input.segments[n];
      const ci = k % 3;
      const cj = Math.floor(k / 3);
      const x = blk.i * B + STALL0 + ci * STALL_GAP;
      const y = blk.j * B + STALL0 + cj * STALL_GAP;
      if (!seg) {
        if (k % 2 === 0) decor.push({ kind: 'tree', x: x + 0.35, y: y + 0.35, size: 0.7 });
        continue;
      }
      n++;
      // Nearest street: whichever edge of the block is closest.
      const cx = x + 0.38;
      const cy = y + 0.38;
      const opts = [
        {
          door: { x: cx, y: (blk.j + 1) * B },
          dist: (blk.j + 1) * B - cy,
          face: 'left' as const,
        },
        {
          door: { x: (blk.i + 1) * B, y: cy },
          dist: (blk.i + 1) * B - cx,
          face: 'right' as const,
        },
        { door: { x: cx, y: blk.j * B }, dist: cy - blk.j * B, face: null },
        { door: { x: blk.i * B, y: cy }, dist: cx - blk.i * B, face: null },
      ].sort((p, q) => p.dist - q.dist)[0]!;
      places.push({
        id: `stall:${seg.key}`,
        kind: 'stall',
        ref: seg.key,
        name: seg.name,
        district: 'market',
        area,
        x,
        y,
        w: 0.76,
        d: 0.76,
        h: 16,
        motif: 'stall',
        color: '#fff7ed',
        accent: AWNINGS[hash(seg.key) % AWNINGS.length]!,
        door: opts.door,
        doorFace: opts.face,
        dim: input.industry !== null && seg.industry !== input.industry,
      });
    }
  }
}

export type LotItem =
  | { kind: 'lender' | 'playerbank'; id: string; name: string; look: LenderLook }
  | { kind: 'fund'; id: string; name: string; office: FundOffice }
  | { kind: 'capital'; cap: CapitalInput }
  | { kind: 'business'; biz: BizInput };

export function financeItems(input: CityInput): LotItem[] {
  return [
    ...input.lenders.map((l) => ({
      kind: 'lender' as const,
      id: l.id,
      name: l.name,
      look: l.look,
    })),
    ...input.playerBanks.map((b) => ({
      kind: 'playerbank' as const,
      id: b.id,
      name: b.name,
      look: { color: '#334155', accent: '#a5f3fc', motif: 'shopfront' as const },
    })),
  ];
}

/** One building on a corner lot: a bank, a fund's office or a local business. */
export function putLotItem(ctx: Ctx, it: LotItem, l: Lot, blk: Cell, area?: string) {
  if (it.kind === 'lender' || it.kind === 'playerbank') {
    const motif = it.look.motif;
    const w = motif === 'kiosk' ? 0.8 : motif === 'shopfront' ? 1.15 : LOT_SIZE;
    const x = l.x + (LOT_SIZE - w) * (l.a ? 1 : 0);
    const y = l.y + (LOT_SIZE - w) * (l.b ? 1 : 0);
    ctx.places.push({
      id: `${it.kind}:${it.id}`,
      kind: it.kind,
      ref: it.id,
      name: it.name,
      district: 'finance',
      area,
      x,
      y,
      w,
      d: w,
      h: LENDER_H[motif] ?? 46,
      motif,
      color: it.look.color,
      accent: it.look.accent,
      ...doorFor(blk.i, blk.j, l.a, l.b, x, y, w, w),
    });
    return;
  }
  if (it.kind === 'fund') {
    const style = it.office.style;
    const w = style === 'shophouse' ? 0.95 : style === 'tower' ? 1.15 : LOT_SIZE;
    const x = l.x + (LOT_SIZE - w) * (l.a ? 1 : 0);
    const y = l.y + (LOT_SIZE - w) * (l.b ? 1 : 0);
    ctx.places.push({
      id: `fund:${it.id}`,
      kind: 'fund',
      ref: it.id,
      name: it.name,
      district: 'investors',
      area,
      x,
      y,
      w,
      d: w,
      h: (OFFICE_H[style] ?? 48) + Math.min(5, it.office.floor) * 3,
      motif: style,
      color: it.office.color,
      accent: '#fef3c7',
      ...doorFor(blk.i, blk.j, l.a, l.b, x, y, w, w),
      level: it.office.floor,
    });
    return;
  }
  if (it.kind === 'capital') {
    const look = CAPITAL_LOOK[it.cap.kind] ?? CAPITAL_LOOK.lp;
    const w = LOT_SIZE;
    const x = l.x + (LOT_SIZE - w) * (l.a ? 1 : 0);
    const y = l.y + (LOT_SIZE - w) * (l.b ? 1 : 0);
    ctx.places.push({
      id: `cap:${it.cap.id}`,
      kind: 'capital',
      ref: it.cap.id,
      name: it.cap.name,
      district: 'investors',
      area,
      x,
      y,
      w,
      d: w,
      h: OFFICE_H[look.motif] ?? 48,
      motif: look.motif,
      color: look.color,
      accent: look.accent,
      ...doorFor(blk.i, blk.j, l.a, l.b, x, y, w, w),
      level: 2,
    });
    return;
  }
  const b = (it as Extract<LotItem, { kind: 'business' }>).biz;
  const sz = BIZ_SIZE[b.shape] ?? BIZ_SIZE.shopfront;
  const cafe = b.shape === 'restaurant' && isCafe(b.kind);
  // Restaurants and cafés step back from the street to make room for tables.
  const terrace = b.shape === 'restaurant' ? 0.36 : 0;
  const w = sz.w;
  const d = sz.d;
  let x = l.x + (LOT_SIZE - w) * (l.a ? 1 : 0);
  let y = l.y + (LOT_SIZE - d) * (l.b ? 1 : 0);
  if (l.b) y -= terrace;
  else if (l.a) x -= terrace;
  const motif = (cafe ? 'b-cafe' : b.shape === 'shopfront' ? 'b-shop' : `b-${b.shape}`) as Motif;
  ctx.places.push({
    id: `biz:${b.id}`,
    kind: 'business',
    ref: b.id,
    name: b.name,
    district: 'shops',
    area,
    category: b.category,
    x,
    y,
    w,
    d,
    h: cafe ? 20 : sz.h,
    motif,
    color: b.color,
    accent: b.awning ?? AWNINGS[hash(b.id) % AWNINGS.length]!,
    ...doorFor(blk.i, blk.j, l.a, l.b, x, y, w, d),
  });
}

type FillStyle = 'park' | 'houses' | 'towers' | 'warehouses' | 'low' | 'plaza';

/** A block with nothing important on it, styled for its district. */
function putFiller(ctx: Ctx, { i, j }: Cell, style: FillStyle) {
  const { flavour, rnd, decor } = ctx;
  if (style === 'park' || style === 'plaza') {
    const trees = style === 'plaza' ? 3 : 5 + Math.floor(rnd() * 4);
    for (let k = 0; k < trees; k++)
      decor.push({
        kind: 'tree',
        x: i * B + SW + 0.25 + rnd() * (B - 2 * SW - 0.5),
        y: j * B + SW + 0.25 + rnd() * (B - 2 * SW - 0.5),
        size: 0.7 + rnd() * 0.5,
      });
    if (style === 'plaza' || rnd() < 0.5)
      decor.push({ kind: 'fountain', x: i * B + B / 2, y: j * B + B / 2, size: 0.5 });
    return;
  }
  for (const [a, b] of [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
  ] as [0 | 1, 0 | 1][]) {
    const l = lot(i, j, a, b);
    // Wave 4: a good share of lots stay open (a tree, or just grass).
    if (rnd() < (style === 'warehouses' ? 0.2 : style === 'towers' ? 0.3 : 0.4)) {
      if (rnd() < 0.65) decor.push({ kind: 'tree', x: l.x + 0.7, y: l.y + 0.7, size: 1 });
      continue;
    }
    // Wave 6: no decorative buildings you can't go into. What used to be a
    // filler house is an empty plot, where the city's new businesses open.
    // (The same RNG draws as before, so every other building stays put.)
    rnd();
    const color =
      style === 'warehouses'
        ? pickColor(ctx, ['#a8a29e', '#94a3b8', '#d6d3d1'])
        : pickColor(ctx, flavour.walls);
    if (style !== 'warehouses') pickColor(ctx, flavour.roofs);
    decor.push({ kind: 'lot', x: l.x + 0.1, y: l.y + 0.1, w: 1.1, d: 1.1, color });
  }
}

/** Fill the corner lots of some blocks with items, in order; spare lots get trees. */
function fillLots(
  ctx: Ctx,
  blocks: Cell[],
  items: LotItem[],
  area: string | undefined,
  spare: (l: Lot) => void,
) {
  let n = 0;
  for (const blk of blocks)
    for (const [a, b] of LOT_ORDER) {
      const l = lot(blk.i, blk.j, a, b);
      if (n >= items.length) spare(l);
      else putLotItem(ctx, items[n++]!, l, blk, area);
    }
}

const roleOf = (it: LotItem): DistrictId =>
  it.kind === 'fund' ? 'investors' : it.kind === 'business' ? 'shops' : 'finance';

// ---------------------------------------------------------------------------
// The original generator (markets without a plan)

function buildGeneric(input: CityInput): CityLayout {
  const flavour = flavourOf(input.marketId);
  const seed = hash(`city:${input.marketId}`);
  const rnd = seeded(seed);
  const ctx: Ctx = { input, flavour, rnd, places: [], decor: [] };

  const fin = financeItems(input);
  const biz = [...(input.businesses ?? [])].sort((a, b) => (a.id < b.id ? -1 : 1));
  const nF = Math.max(1, Math.ceil(fin.length / 4));
  const capital = [...(input.capital ?? [])].sort((a, b) => (a.id < b.id ? -1 : 1));
  const nI = Math.max(1, Math.ceil((input.funds.length + capital.length) / 4));
  const nM = Math.max(1, Math.ceil(input.segments.length / 9));
  const nS = Math.ceil(biz.length / 4);
  const core = 3 + nF + nI + nM + nS + 2;
  const size = Math.max(4, Math.ceil(Math.sqrt(core + 3)));

  // District order along the spiral. The three capital districts swap order per market.
  const trio: DistrictId[][] = [
    ['finance', 'investors', 'market'],
    ['market', 'finance', 'investors'],
    ['investors', 'market', 'finance'],
    ['finance', 'market', 'investors'],
  ];
  const counts: Record<string, number> = { finance: nF, investors: nI, market: nM };
  const order: DistrictId[] = ['downtown', 'residential', 'landmark'];
  for (const dist of trio[seed % trio.length]!)
    for (let k = 0; k < counts[dist]!; k++) order.push(dist);
  order.push('events', 'airport');
  for (let k = 0; k < nS; k++) order.push('shops');

  const cells = spiral(size, (seed >>> 3) % 2 ? 1 : -1, (seed >>> 5) % 4);
  const blocks: Block[] = cells.map(([i, j], n) => ({
    i,
    j,
    district: order[n] ?? (rnd() < 0.45 ? 'park' : 'houses'),
  }));
  const of = (dist: DistrictId) => blocks.filter((b) => b.district === dist);
  const tree = (l: Lot) => ctx.decor.push({ kind: 'tree', x: l.x + 0.7, y: l.y + 0.7, size: 1 });

  putDowntown(ctx, of('downtown')[0]!);
  putHome(ctx, of('residential')[0]!);
  for (const blk of of('landmark')) {
    ctx.decor.push({ kind: 'landmark', x: blk.i * B + B / 2, y: blk.j * B + B / 2 });
    for (let k = 0; k < 4; k++)
      ctx.decor.push({
        kind: 'tree',
        x: blk.i * B + 0.8 + (k % 2) * (B - 1.6),
        y: blk.j * B + 0.8 + Math.floor(k / 2) * (B - 1.6),
        size: 0.9,
      });
  }
  fillLots(ctx, of('finance'), fin, undefined, tree);
  fillLots(
    ctx,
    of('investors'),
    [
      ...input.funds.map((f) => ({ kind: 'fund' as const, ...f })),
      ...capital.map((c) => ({ kind: 'capital' as const, cap: c })),
    ],
    undefined,
    tree,
  );
  putStalls(ctx, of('market'));
  for (const blk of of('events').slice(0, 1)) putEventHall(ctx, blk);
  for (const blk of of('airport').slice(0, 1)) putAirport(ctx, blk);
  fillLots(
    ctx,
    of('shops'),
    biz.map((b) => ({ kind: 'business', biz: b })),
    undefined,
    tree,
  );
  for (const blk of [...of('park'), ...of('houses')])
    putFiller(ctx, blk, blk.district === 'park' ? 'park' : 'houses');

  const districts: CityLayout['districts'] = [];
  for (const id of [
    'downtown',
    'finance',
    'investors',
    'market',
    'residential',
    'airport',
    'events',
  ] as DistrictId[]) {
    const bs = of(id);
    if (!bs.length) continue;
    const cx = bs.reduce((s, b) => s + b.i * B + B / 2, 0) / bs.length;
    const cy = bs.reduce((s, b) => s + b.j * B + B / 2, 0) / bs.length;
    districts.push({ id, at: { x: cx, y: cy } });
  }

  return finish(ctx, {
    size,
    blocks,
    districts,
    areas: [],
    waters: [],
    bridges: [],
    cuts: new Set(),
    roundabouts: [],
    transit: [],
    boats: [],
  });
}

/** Lamps, street names, traffic, bounds: the same for both generators. */
function finish(
  ctx: Ctx,
  parts: Pick<
    CityLayout,
    | 'size'
    | 'blocks'
    | 'districts'
    | 'areas'
    | 'waters'
    | 'bridges'
    | 'roundabouts'
    | 'transit'
    | 'boats'
  > & { cuts: Set<string> },
): CityLayout {
  const { input, flavour, rnd, places, decor } = ctx;
  const { size, cuts } = parts;
  const extent = size * B;
  const isBlock = new Set(parts.blocks.map((b) => `${b.i},${b.j}`));

  // Street lamps along the main avenues, for night-time glow and rhythm.
  for (let k = 1; k < size; k++)
    for (let s = 0; s < size; s++)
      if ((k + s) % 2 === 0 && isBlock.has(`${k},${s}`))
        decor.push({ kind: 'lamp', x: k * B + SW + 0.08, y: s * B + B / 2 });

  // A segment along street k (axis 'x': y = k·B; axis 'y': x = k·B).
  const segOpen = (axis: 'x' | 'y', k: number, s: number) =>
    axis === 'x' ? !cuts.has(segKey(s, k, s + 1, k)) : !cuts.has(segKey(k, s, k, s + 1));
  const streetOpen = (axis: 'x' | 'y', k: number) => {
    for (let s = 0; s < size; s++) if (!segOpen(axis, k, s)) return false;
    return true;
  };

  // ---- Street names (seeded shuffle of the market's list), on an open segment.
  const names = [...flavour.streets];
  for (let k = names.length - 1; k > 0; k--) {
    const r = Math.floor(rnd() * (k + 1));
    [names[k], names[r]] = [names[r]!, names[k]!];
  }
  const mid = Math.floor(size / 2);
  const segFor = (axis: 'x' | 'y', k: number) => {
    for (let o = 0; o < size; o++)
      for (const s of [mid - o, mid + o]) if (s >= 0 && s < size && segOpen(axis, k, s)) return s;
    return mid;
  };
  const streets: StreetName[] = [];
  for (let k = 1; k < size; k++) {
    streets.push({ name: names[(2 * k) % names.length]!, axis: 'y', k, seg: segFor('y', k) });
    streets.push({ name: names[(2 * k + 1) % names.length]!, axis: 'x', k, seg: segFor('x', k) });
  }
  // Wave 5: names show only zoomed in, so repeat them along each street (every
  // third open segment) for one to be in view wherever you are.
  for (const st of [...streets])
    for (let s2 = (st.seg ?? mid) % 3; s2 < size; s2 += 3)
      if (s2 !== st.seg && segOpen(st.axis, st.k, s2)) streets.push({ ...st, seg: s2 });

  // ---- Traffic: each vehicle drives one open stretch of street end to end, in its lane.
  const lines: { axis: 'x' | 'y'; k: number; s0: number; s1: number }[] = [];
  for (let k = 1; k < size; k++)
    for (const axis of ['y', 'x'] as const) {
      if (streetOpen(axis, k)) {
        lines.push({ axis, k, s0: 0, s1: size });
        continue;
      }
      // The longest open run along a street with closed segments.
      let best = { s0: 0, s1: 0 };
      let s0 = 0;
      for (let s = 0; s <= size; s++)
        if (s === size || !segOpen(axis, k, s)) {
          if (s - s0 > best.s1 - best.s0) best = { s0, s1: s };
          s0 = s + 1;
        }
      if (best.s1 - best.s0 >= 2) lines.push({ axis, k, ...best });
    }
  const vehicles: Vehicle[] = [];
  const nVeh = 4 + size;
  for (let n = 0; n < nVeh && lines.length; n++) {
    const spec = flavour.vehicles[n % flavour.vehicles.length]!;
    const want: 'x' | 'y' = n % 2 ? 'x' : 'y';
    const pool = lines.filter((l) => l.axis === want);
    const pick = (pool.length ? pool : lines)[Math.floor(rnd() * (pool.length || lines.length))]!;
    const axis = pick.axis;
    const forward = rnd() < 0.5;
    const lane = forward ? 0.24 : -0.24;
    const a = pick.s0 === 0 ? -0.6 : pick.s0 * B + 0.6;
    const b = pick.s1 === size ? extent + 0.6 : pick.s1 * B - 0.6;
    const line = pick.k * B + lane;
    const from = axis === 'x' ? { x: forward ? a : b, y: line } : { x: line, y: forward ? a : b };
    const to = axis === 'x' ? { x: forward ? b : a, y: line } : { x: line, y: forward ? b : a };
    vehicles.push({ spec, from, to, axis, dur: 16 + rnd() * 14, delay: -rnd() * 30 });
  }

  // The camera's bounds (Wave 7): tight around the streets, with a strip of
  // the coast or hills beyond, so zooming out shows the city, not empty sea.
  const m = 2.5;
  const left = project(-m, extent + m);
  const right = project(extent + m, -m);
  const top = project(-m, -m);
  const bottom = project(extent + m, extent + m);
  const bounds = { minX: left.x, maxX: right.x, minY: top.y - 90, maxY: bottom.y };

  const office = places.find((p) => p.kind === 'office')!;
  return {
    marketId: input.marketId,
    flavour,
    size,
    extent,
    blocks: parts.blocks,
    places,
    decor,
    vehicles,
    streets,
    districts: parts.districts,
    areas: parts.areas,
    waters: parts.waters,
    bridges: parts.bridges,
    cuts: [...cuts].sort(),
    boats: parts.boats,
    roundabouts: parts.roundabouts,
    transit: parts.transit,
    bounds,
    start: office.door,
  };
}

// ---------------------------------------------------------------------------
// Planned cities

/** Kinds of district a host falls back to when the plan names none. */
export const HOST_FALLBACK: Record<Host, DistrictKind[]> = {
  finance: ['finance', 'downtown'],
  investors: ['finance', 'tech', 'downtown'],
  market: ['market', 'downtown', 'nightlife'],
  hub: ['tech', 'campus', 'downtown'],
  home: ['residential'],
  eventhall: ['downtown', 'waterfront', 'nightlife'],
  airport: ['airport', 'industrial'],
};
export const CATEGORY_FALLBACK: Record<BusinessCategory, DistrictKind[]> = {
  food: ['nightlife', 'market', 'downtown'],
  retail: ['market', 'downtown'],
  services: ['residential', 'market'],
  trades: ['industrial', 'market'],
  health: ['residential', 'downtown'],
  education: ['campus', 'residential'],
  logistics: ['industrial', 'airport'],
  hospitality: ['waterfront', 'downtown', 'nightlife'],
};
const FILL_FOR: Record<DistrictKind, FillStyle> = {
  downtown: 'towers',
  finance: 'towers',
  tech: 'houses',
  market: 'low',
  residential: 'houses',
  nightlife: 'low',
  industrial: 'warehouses',
  waterfront: 'plaza',
  park: 'park',
  airport: 'park',
  campus: 'park',
};

/** The grid a plan was drawn on (it grows when a world needs more blocks). */
export function planSize(plan: CityPlan): number {
  let n = 5;
  for (const d of plan.districts) n = Math.max(n, d.at[0] + d.size[0], d.at[1] + d.size[1]);
  for (const l of plan.landmarks) n = Math.max(n, l.at[0] + 1, l.at[1] + 1);
  for (const h of plan.hills ?? []) n = Math.max(n, h.at[0] + 1, h.at[1] + 1);
  if (plan.water?.river !== undefined) n = Math.max(n, plan.water.river + 2);
  return n;
}

/**
 * Wave 4: open a plan up. Inserts the plan's open lanes (`plan.open`) and
 * shifts every block coordinate (districts, landmarks, hills, the river) and
 * every street line (bridges) to match. `belt` says whether a block lies on
 * an open lane, which stays a park or plaza where it can.
 */
export function spreadPlan(plan: CityPlan): {
  plan: CityPlan;
  belt: (i: number, j: number) => boolean;
} {
  const cols = [...(plan.open?.cols ?? [])].sort((a, b) => a - b);
  const rows = [...(plan.open?.rows ?? [])].sort((a, b) => a - b);
  if (!cols.length && !rows.length) return { plan, belt: () => false };
  const sx = (i: number) => i + cols.filter((c) => c <= i).length;
  const sy = (j: number) => j + rows.filter((r) => r <= j).length;
  const laneX = new Set(cols.map((c) => sx(c) - 1));
  const laneY = new Set(rows.map((r) => sy(r) - 1));
  const w = plan.water;
  const riverAlongX = w ? w.side === 'north' || w.side === 'south' : true;
  const river = w?.river;
  // A street line k is the near edge of block k, except just past the river,
  // where it is the far bank: the bridges must still land on both banks.
  const lineX = (k: number) =>
    river !== undefined && !riverAlongX && k - 1 === river ? sx(k - 1) + 1 : sx(k);
  const lineY = (k: number) =>
    river !== undefined && riverAlongX && k - 1 === river ? sy(k - 1) + 1 : sy(k);
  const at = (p: [number, number]): [number, number] => [sx(p[0]), sy(p[1])];
  return {
    plan: {
      ...plan,
      open: undefined,
      districts: plan.districts.map((d) => {
        const [x0, y0] = at(d.at);
        const x1 = sx(d.at[0] + d.size[0] - 1) + 1;
        const y1 = sy(d.at[1] + d.size[1] - 1) + 1;
        return { ...d, at: [x0, y0], size: [x1 - x0, y1 - y0] };
      }),
      water: w && {
        ...w,
        ...(river !== undefined ? { river: riverAlongX ? sy(river) : sx(river) } : {}),
      },
      hills: plan.hills?.map((h) => ({ ...h, at: at(h.at) })),
      landmarks: plan.landmarks.map((l) => ({ ...l, at: at(l.at) })),
      bridges: plan.bridges?.map((b) => ({
        ...b,
        from: [lineX(b.from[0]), lineY(b.from[1])],
        to: [lineX(b.to[0]), lineY(b.to[1])],
      })),
    },
    belt: (i, j) => laneX.has(i) || laneY.has(j),
  };
}

function buildPlanned(input: CityInput, raw: CityPlan): CityLayout {
  const { plan, belt } = spreadPlan(raw);
  const base = planSize(plan);
  for (let size = base; size < base + 8; size++) {
    const out = tryPlanned(input, plan, size, belt);
    if (out) return out;
  }
  return buildGeneric(input);
}

function tryPlanned(
  input: CityInput,
  plan: CityPlan,
  size: number,
  belt: (i: number, j: number) => boolean,
): CityLayout | null {
  const base = flavourOf(input.marketId);
  const flavour: Flavour = {
    ...base,
    streets: plan.streetNames.length ? plan.streetNames : base.streets,
  };
  const rnd = seeded(hash(`city:${input.marketId}`));
  const ctx: Ctx = { input, flavour, rnd, places: [], decor: [] };
  const E = size * B;
  const ck = (i: number, j: number) => `${i},${j}`;
  const inGrid = (i: number, j: number) => i >= 0 && j >= 0 && i < size && j < size;

  // ---- Water: a river across the city replaces a row (or column) of blocks.
  const water = plan.water;
  const river = water?.river;
  const riverAlongX = water ? water.side === 'north' || water.side === 'south' : true;
  const isRiver = (i: number, j: number) =>
    river !== undefined && (riverAlongX ? j === river : i === river);

  // ---- Claims: landmarks first, then each district's rectangle.
  const owner = new Map<string, string>();
  const landmarks: { i: number; j: number; kind: LandmarkKind; name: string }[] = [];
  for (const lm of plan.landmarks) {
    const [i, j] = lm.at;
    if (!inGrid(i, j) || isRiver(i, j) || owner.has(ck(i, j))) continue;
    owner.set(ck(i, j), `landmark:${landmarks.length}`);
    landmarks.push({ i, j, kind: lm.kind, name: lm.name });
  }
  const D = plan.districts.map((d) => ({
    d,
    cells: [] as Cell[],
    cx: d.at[0] + d.size[0] / 2 - 0.5,
    cy: d.at[1] + d.size[1] / 2 - 0.5,
  }));
  for (const x of D) {
    for (let j = x.d.at[1]; j < x.d.at[1] + x.d.size[1]; j++)
      for (let i = x.d.at[0]; i < x.d.at[0] + x.d.size[0]; i++) {
        if (!inGrid(i, j) || isRiver(i, j) || owner.has(ck(i, j))) continue;
        owner.set(ck(i, j), x.d.id);
        x.cells.push({ i, j });
      }
    // Front blocks first, so the important buildings face the viewer; open
    // lanes last, so they stay open unless the district needs them.
    x.cells.sort(
      (a, b) =>
        Number(belt(a.i, a.j)) - Number(belt(b.i, b.j)) || b.i + b.j - (a.i + a.j) || b.i - a.i,
    );
  }

  // ---- Who hosts what (with fallbacks, so every important place exists).
  const byKind = (kinds: DistrictKind[]) => {
    for (const k of kinds) {
      const n = D.findIndex((x) => x.d.kind === k);
      if (n >= 0) return n;
    }
    return -1;
  };
  const hostOf = new Map<Host, number>();
  D.forEach((x, n) => {
    for (const h of x.d.hosts ?? []) if (!hostOf.has(h)) hostOf.set(h, n);
  });
  for (const h of Object.keys(HOST_FALLBACK) as Host[])
    if (!hostOf.has(h)) {
      const n = byKind(HOST_FALLBACK[h]);
      hostOf.set(h, n >= 0 ? n : 0);
    }
  const idx = new Map(D.map((x, n) => [x.d.id, n]));
  const bizIn = D.map(() => [] as BizInput[]);
  for (const b of [...(input.businesses ?? [])].sort((a, c) => (a.id < c.id ? -1 : 1))) {
    let n = idx.get(b.district);
    if (n === undefined) {
      n = byKind(CATEGORY_FALLBACK[b.category] ?? []);
      if (n < 0) n = hostOf.get('market') ?? 0;
    }
    bizIn[n]!.push(b);
  }
  const hosts = (n: number) =>
    (Object.keys(HOST_FALLBACK) as Host[]).filter((h) => hostOf.get(h) === n);
  const fin = financeItems(input);
  const marketBlocks = Math.ceil(input.segments.length / 9);
  const capital = [...(input.capital ?? [])].sort((a, b) => (a.id < b.id ? -1 : 1));
  const lotItemsOf = (n: number): LotItem[] => [
    ...(hosts(n).includes('finance') ? fin : []),
    ...(hosts(n).includes('investors')
      ? input.funds.map((f) => ({ kind: 'fund' as const, ...f }))
      : []),
    // Accelerators sit by the Hub; partners and LPs with the investors.
    ...(hosts(n).includes('hub')
      ? capital
          .filter((c) => c.kind === 'accelerator')
          .map((c) => ({ kind: 'capital' as const, cap: c }))
      : []),
    ...(hosts(n).includes('investors')
      ? capital
          .filter((c) => c.kind !== 'accelerator')
          .map((c) => ({ kind: 'capital' as const, cap: c }))
      : []),
    ...bizIn[n]!.map((b) => ({ kind: 'business' as const, biz: b })),
  ];
  const blockHosts = (n: number) =>
    hosts(n).filter((h) => h === 'hub' || h === 'home' || h === 'eventhall' || h === 'airport');
  const need = (n: number) =>
    blockHosts(n).length +
    (hosts(n).includes('market') ? marketBlocks : 0) +
    Math.ceil(lotItemsOf(n).length / 4);

  // ---- Grow districts that need more blocks into free neighbours.
  for (let n = 0; n < D.length; n++) {
    const x = D[n]!;
    while (x.cells.length < need(n)) {
      const free: (Cell & { dist: number; adj: boolean; rank: number })[] = [];
      const mine = new Set(x.cells.map((c) => ck(c.i, c.j)));
      for (let j = 0; j < size; j++)
        for (let i = 0; i < size; i++) {
          if (owner.has(ck(i, j)) || isRiver(i, j)) continue;
          const adj = [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ].some(([di, dj]) => mine.has(ck(i + di!, j + dj!)));
          free.push({
            i,
            j,
            adj,
            dist: Math.abs(i - x.cx) + Math.abs(j - x.cy),
            // Neighbours first, then open lanes last: the green belts stay green.
            rank: (adj ? 0 : 2) + (belt(i, j) ? 1 : 0),
          });
        }
      if (!free.length) return null;
      free.sort((a, b) => a.rank - b.rank || a.dist - b.dist || a.j - b.j || a.i - b.i);
      const c = free[0]!;
      owner.set(ck(c.i, c.j), x.d.id);
      x.cells.push({ i: c.i, j: c.j });
    }
  }

  // ---- Place everything.
  const blocks: Block[] = [];
  const hills = new Map((plan.hills ?? []).map((h) => [ck(h.at[0], h.at[1]), h.height]));
  const filler = (c: Cell, style: FillStyle, area?: string) => {
    const hill = hills.get(ck(c.i, c.j));
    if (hill) {
      blocks.push({ ...c, district: 'park', area });
      ctx.decor.push({
        kind: 'hill',
        x: c.i * B + B / 2,
        y: c.j * B + B / 2,
        h: hill,
        color: pickColor(ctx, flavour.walls),
        roof: pickColor(ctx, flavour.roofs),
      });
      return;
    }
    blocks.push({
      ...c,
      district: style === 'park' || style === 'plaza' ? 'park' : 'houses',
      area,
    });
    putFiller(ctx, c, style);
  };
  const tree = (l: Lot) => ctx.decor.push({ kind: 'tree', x: l.x + 0.7, y: l.y + 0.7, size: 1 });

  D.forEach((x, n) => {
    const area = x.d.id;
    const cells = [...x.cells];
    let c = 0;
    const take = () => cells[c++]!;
    for (const h of blockHosts(n)) {
      const cell = take();
      if (h === 'hub') {
        blocks.push({ ...cell, district: 'downtown', area });
        putDowntown(ctx, cell, area);
      } else if (h === 'home') {
        blocks.push({ ...cell, district: 'residential', area });
        putHome(ctx, cell, area);
      } else if (h === 'eventhall') {
        blocks.push({ ...cell, district: 'events', area });
        putEventHall(ctx, cell, area);
      } else {
        blocks.push({ ...cell, district: 'airport', area });
        putAirport(ctx, cell, area);
      }
    }
    if (hosts(n).includes('market')) {
      const mb = Array.from({ length: marketBlocks }, take);
      for (const cell of mb) blocks.push({ ...cell, district: 'market', area });
      putStalls(ctx, mb, area);
    }
    const items = lotItemsOf(n);
    const lotBlocks = Array.from({ length: Math.ceil(items.length / 4) }, take);
    lotBlocks.forEach((cell, k) => blocks.push({ ...cell, district: roleOf(items[k * 4]!), area }));
    fillLots(ctx, lotBlocks, items, area, tree);
    while (c < cells.length) {
      const cell = take();
      filler(cell, belt(cell.i, cell.j) ? 'park' : FILL_FOR[x.d.kind], area);
    }
  });
  for (const lm of landmarks) {
    blocks.push({ i: lm.i, j: lm.j, district: 'landmark' });
    ctx.decor.push({
      kind: 'landmark',
      x: lm.i * B + B / 2,
      y: lm.j * B + B / 2,
      landmark: lm.kind,
      name: lm.name,
    });
    for (let k = 0; k < 4; k++)
      ctx.decor.push({
        kind: 'tree',
        x: lm.i * B + 0.8 + (k % 2) * (B - 1.6),
        y: lm.j * B + 0.8 + Math.floor(k / 2) * (B - 1.6),
        size: 0.8,
      });
  }
  for (let j = 0; j < size; j++)
    for (let i = 0; i < size; i++)
      if (!owner.has(ck(i, j)) && !isRiver(i, j))
        filler(
          { i, j },
          belt(i, j) ? ((i + j) % 3 === 0 ? 'plaza' : 'park') : rnd() < 0.55 ? 'park' : 'houses',
        );
  blocks.sort((a, b) => a.j - b.j || a.i - b.i);

  // ---- Water and bridges.
  const m = MARGIN;
  const waters: Water[] = [];
  // A beach pushes the sea back to make room for the sand.
  const off = (side: Side) => (plan.beach?.side === side ? BEACH_W : 1.8);
  const edge = (side: Side, name: string): Water =>
    side === 'south'
      ? { name, kind: 'edge', side, x0: -m, y0: E + off(side), x1: E + m, y1: E + m }
      : side === 'north'
        ? { name, kind: 'edge', side, x0: -m, y0: -m, x1: E + m, y1: -off(side) }
        : side === 'east'
          ? { name, kind: 'edge', side, x0: E + off(side), y0: -m, x1: E + m, y1: E + m }
          : { name, kind: 'edge', side, x0: -m, y0: -m, x1: -off(side), y1: E + m };
  if (water) {
    if (river !== undefined)
      waters.push(
        riverAlongX
          ? {
              name: water.name,
              kind: 'river',
              side: water.side,
              x0: -m,
              y0: river * B + SW + 0.1,
              x1: E + m,
              y1: (river + 1) * B - SW - 0.1,
            }
          : {
              name: water.name,
              kind: 'river',
              side: water.side,
              x0: river * B + SW + 0.1,
              y0: -m,
              x1: (river + 1) * B - SW - 0.1,
              y1: E + m,
            },
      );
    else waters.push(edge(water.side, water.name));
    for (const s of water.also ?? [])
      if (!waters.some((w) => w.kind === 'edge' && w.side === s)) waters.push(edge(s, water.name));
  }

  const clampOut = (v: number) => Math.max(-m + 0.6, Math.min(E + m - 0.6, v));
  const bridges: Bridge[] = [];
  for (const br of plan.bridges ?? []) {
    const [i1, j1] = br.from;
    const [i2, j2] = br.to;
    const walk =
      river !== undefined &&
      (riverAlongX
        ? i1 === i2 && Math.min(j1, j2) === river && Math.max(j1, j2) === river + 1
        : j1 === j2 && Math.min(i1, i2) === river && Math.max(i1, i2) === river + 1) &&
      i1 >= 0 &&
      i1 <= size &&
      j1 >= 0 &&
      j1 <= size;
    bridges.push({
      name: br.name,
      from: { x: i1 * B, y: j1 * B },
      to: walk ? { x: i2 * B, y: j2 * B } : { x: clampOut(i2 * B), y: clampOut(j2 * B) },
      style: br.style ?? 'beam',
      color: br.color ?? '#a8a29e',
      walk,
    });
  }
  // A river always has at least one way across.
  if (river !== undefined && !bridges.some((b) => b.walk)) {
    const k = Math.floor(size / 2);
    bridges.push({
      name: '',
      from: riverAlongX ? { x: k * B, y: river * B } : { x: river * B, y: k * B },
      to: riverAlongX ? { x: k * B, y: (river + 1) * B } : { x: (river + 1) * B, y: k * B },
      style: 'beam',
      color: '#a8a29e',
      walk: true,
    });
  }

  // ---- Closed street segments: across the river except on bridges.
  const cuts = new Set<string>();
  if (river !== undefined)
    for (let k = 0; k <= size; k++) {
      const bridged = bridges.some(
        (b) => b.walk && (riverAlongX ? b.from.x === k * B : b.from.y === k * B),
      );
      if (bridged) continue;
      cuts.add(riverAlongX ? segKey(k, river, k, river + 1) : segKey(river, k, river + 1, k));
    }

  // ---- Organic and mixed cities merge some blocks: close a few inner segments.
  const share = plan.streets === 'organic' ? 0.16 : plan.streets === 'mixed' ? 0.07 : 0;
  if (share > 0) {
    const doorSegs = new Set<string>();
    for (const p of ctx.places) {
      const e = ends(p.door);
      if (e.length === 2) doorSegs.add(segKey(e[0]![0], e[0]![1], e[1]![0], e[1]![1]));
    }
    const bridgeNodes = new Set(
      bridges
        .filter((b) => b.walk)
        .flatMap((b) => [ck(b.from.x / B, b.from.y / B), ck(b.to.x / B, b.to.y / B)]),
    );
    const embank = (i: number, j: number, i2: number, j2: number) =>
      river !== undefined &&
      (riverAlongX
        ? j === j2 && (j === river || j === river + 1)
        : i === i2 && (i === river || i === river + 1));
    const cand: [number, number, number, number][] = [];
    for (let j = 1; j < size; j++) for (let i = 0; i < size; i++) cand.push([i, j, i + 1, j]);
    for (let i = 1; i < size; i++) for (let j = 0; j < size; j++) cand.push([i, j, i, j + 1]);
    const pool = cand.filter(
      ([i, j, i2, j2]) =>
        !cuts.has(segKey(i, j, i2, j2)) &&
        !doorSegs.has(segKey(i, j, i2, j2)) &&
        !embank(i, j, i2, j2) &&
        !bridgeNodes.has(ck(i, j)) &&
        !bridgeNodes.has(ck(i2, j2)),
    );
    for (let k = pool.length - 1; k > 0; k--) {
      const r = Math.floor(rnd() * (k + 1));
      [pool[k], pool[r]] = [pool[r]!, pool[k]!];
    }
    const target = Math.round(cand.length * share);
    let made = 0;
    for (const [i, j, i2, j2] of pool) {
      if (made >= target) break;
      const key = segKey(i, j, i2, j2);
      cuts.add(key);
      if (
        degree(size, cuts, i, j) < 2 ||
        degree(size, cuts, i2, j2) < 2 ||
        !connected(size, cuts)
      ) {
        cuts.delete(key);
        continue;
      }
      made++;
      // A tree where the street used to be.
      ctx.decor.push({
        kind: 'tree',
        x: ((i + i2) / 2) * B,
        y: ((j + j2) / 2) * B,
        size: 0.9,
      });
    }
  }

  // ---- Roundabouts (radial cities), stations and boats.
  const roundabouts: Pt[] = [];
  if (plan.streets === 'radial') {
    const c = Math.floor(size / 2);
    for (const [i, j] of [
      [c, c],
      [c - 2, c - 1],
      [c + 2, c + 1],
      [c - 1, c + 2],
    ] as [number, number][])
      if (i > 0 && j > 0 && i < size && j < size) roundabouts.push({ x: i * B, y: j * B });
  }
  const station = plan.transit.includes('tube')
    ? 'tube'
    : plan.transit.includes('metro')
      ? 'metro'
      : plan.transit.includes('cable-car')
        ? 'cable-car'
        : null;
  if (station) {
    const homes = blocks.filter((b) => b.district !== 'park' && b.district !== 'airport');
    for (let k = 0; k < 3 && homes.length; k++) {
      const b = homes[Math.floor(rnd() * homes.length)]!;
      ctx.decor.push({
        kind: 'station',
        x: b.i * B + B / 2,
        y: (b.j + 1) * B - SW - 0.4,
        name: station,
      });
    }
  }
  const boats: Boat[] = [];
  const boatKind = plan.transit.includes('abra')
    ? 'abra'
    : plan.transit.includes('ferry')
      ? 'ferry'
      : null;
  if (boatKind)
    for (const w of waters) {
      const n = w.kind === 'river' ? 3 : 2;
      for (let k = 0; k < n; k++) {
        const along = w.kind === 'river' ? riverAlongX : w.side === 'north' || w.side === 'south';
        const forward = k % 2 === 0;
        const across = along
          ? w.y0 + (w.y1 - w.y0) * (0.35 + 0.3 * (k % 2))
          : w.x0 + (w.x1 - w.x0) * (0.35 + 0.3 * (k % 2));
        const a = along ? w.x0 + 0.5 : w.y0 + 0.5;
        const b = along ? w.x1 - 0.5 : w.y1 - 0.5;
        const from = along ? { x: forward ? a : b, y: across } : { x: across, y: forward ? a : b };
        const to = along ? { x: forward ? b : a, y: across } : { x: across, y: forward ? b : a };
        boats.push({ kind: boatKind, from, to, dur: 40 + rnd() * 25, delay: -rnd() * 60 });
      }
    }

  // ---- Bridge superstructures are drawn among the buildings.
  for (const br of bridges)
    if (br.style !== 'beam')
      ctx.decor.push({
        kind: 'bridge',
        x: (br.from.x + br.to.x) / 2,
        y: (br.from.y + br.to.y) / 2,
        from: br.from,
        to: br.to,
        style: br.style,
        color: br.color,
        name: br.name,
      });

  const areas: Area[] = D.map((x) => {
    const cs = x.cells.length ? x.cells : [{ i: x.d.at[0], j: x.d.at[1] }];
    return {
      id: x.d.id,
      name: x.d.name,
      kind: x.d.kind,
      at: {
        x: cs.reduce((s, c) => s + c.i * B + B / 2, 0) / cs.length,
        y: cs.reduce((s, c) => s + c.j * B + B / 2, 0) / cs.length,
      },
    };
  });

  const out = finish(ctx, {
    size,
    blocks,
    districts: [],
    areas,
    waters,
    bridges,
    cuts,
    roundabouts,
    transit: [...plan.transit],
    boats,
  });
  if (plan.marketName) out.marketName = plan.marketName;
  if (plan.beach && waters.some((w) => w.kind === 'edge' && w.side === plan.beach!.side))
    out.beach = { ...plan.beach };
  return out;
}

/** How many open streets meet at an intersection. */
function degree(size: number, cuts: Set<string>, i: number, j: number) {
  let n = 0;
  for (const [di, dj] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as [number, number][]) {
    const a = i + di;
    const b = j + dj;
    if (a < 0 || b < 0 || a > size || b > size) continue;
    if (!cuts.has(segKey(i, j, a, b))) n++;
  }
  return n;
}

/** Whether every intersection can still reach every other. */
function connected(size: number, cuts: Set<string>) {
  const n = size + 1;
  const seen = new Uint8Array(n * n);
  const stack = [0];
  seen[0] = 1;
  let count = 1;
  while (stack.length) {
    const v = stack.pop()!;
    const i = v % n;
    const j = (v - i) / n;
    for (const [di, dj] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as [number, number][]) {
      const a = i + di;
      const b = j + dj;
      if (a < 0 || b < 0 || a >= n || b >= n || seen[b * n + a]) continue;
      if (cuts.has(segKey(i, j, a, b))) continue;
      seen[b * n + a] = 1;
      count++;
      stack.push(b * n + a);
    }
  }
  return count === n * n;
}

export function buildLayout(input: CityInput): CityLayout {
  const plan = planOf(input.marketId);
  return plan ? buildPlanned(input, plan) : buildGeneric(input);
}

// ---------------------------------------------------------------------------
// Street graph and walking

const EPS = 1e-6;
const dist = (a: Pt, b: Pt) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const cutSet = (layout: { cuts?: string[] }) => new Set(layout.cuts ?? []);

const onLine = (v: number) => Math.abs(v / B - Math.round(v / B)) < EPS;

/** Grid nodes (intersections) at the ends of the street segment holding p. */
function ends(p: Pt): [number, number][] {
  const vx = onLine(p.x);
  const vy = onLine(p.y);
  if (vx && vy) return [[Math.round(p.x / B), Math.round(p.y / B)]];
  if (vx) {
    const i = Math.round(p.x / B);
    return [
      [i, Math.floor(p.y / B)],
      [i, Math.ceil(p.y / B)],
    ];
  }
  const j = Math.round(p.y / B);
  return [
    [Math.floor(p.x / B), j],
    [Math.ceil(p.x / B), j],
  ];
}

/** Whether a street point lies on a closed segment. */
function onCut(p: Pt, cuts: Set<string>) {
  const e = ends(p);
  return e.length === 2 && cuts.has(segKey(e[0]![0], e[0]![1], e[1]![0], e[1]![1]));
}

/** The closest point on any open street to a ground point. */
export function nearestStreetPoint(
  layout: Pick<CityLayout, 'extent' | 'size'> & { cuts?: string[]; geo?: GeoWorld },
  p: Pt,
): Pt {
  if (layout.geo) return layout.geo.graph.nearestTile(p);
  const cuts = cutSet(layout);
  const clamp = (v: number) => Math.max(0, Math.min(layout.extent, v));
  let best: Pt = { x: 0, y: 0 };
  let bestD = Infinity;
  for (let k = 0; k <= layout.size; k++) {
    const line = k * B;
    for (const c0 of [
      { x: line, y: clamp(p.y) },
      { x: clamp(p.x), y: line },
    ]) {
      let c = c0;
      if (cuts.size && onCut(c, cuts)) {
        // Step to the nearer end of the closed segment.
        const [a, b] = ends(c).map(([i, j]) => ({ x: i * B, y: j * B }));
        c = Math.hypot(a!.x - p.x, a!.y - p.y) <= Math.hypot(b!.x - p.x, b!.y - p.y) ? a! : b!;
      }
      const d = Math.hypot(c.x - p.x, c.y - p.y);
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
  }
  return best;
}

/** Whether a straight walk along one street line between two points is open. */
function straightOpen(from: Pt, to: Pt, cuts: Set<string>) {
  if (!cuts.size) return true;
  if (Math.abs(from.x - to.x) < EPS && onLine(from.x)) {
    const i = Math.round(from.x / B);
    const lo = Math.min(from.y, to.y);
    const hi = Math.max(from.y, to.y);
    for (let j = Math.floor(lo / B); j < Math.ceil(hi / B); j++)
      if (cuts.has(segKey(i, j, i, j + 1))) return false;
    return true;
  }
  const j = Math.round(from.y / B);
  const lo = Math.min(from.x, to.x);
  const hi = Math.max(from.x, to.x);
  for (let i = Math.floor(lo / B); i < Math.ceil(hi / B); i++)
    if (cuts.has(segKey(i, j, i + 1, j))) return false;
  return true;
}

/**
 * Shortest walk along the open streets from one street point to another, as
 * a polyline in grid coordinates. Turns cost a little, so routes are tidy.
 */
export function findPath(
  layout: Pick<CityLayout, 'size'> & { cuts?: string[]; geo?: GeoWorld },
  from: Pt,
  to: Pt,
): Pt[] {
  if (layout.geo) return layout.geo.graph.pathTiles(from, to);
  const cuts = cutSet(layout);
  const n = layout.size + 1;
  const sameX = onLine(from.x) && onLine(to.x) && Math.abs(from.x - to.x) < EPS;
  const sameY = onLine(from.y) && onLine(to.y) && Math.abs(from.y - to.y) < EPS;
  if ((sameX || sameY) && straightOpen(from, to, cuts)) return [from, to];

  const TURN = 0.35;
  // State: node index × heading (0..3, or 4 = start).
  const key = (i: number, j: number, h: number) => (j * n + i) * 5 + h;
  const cost = new Map<number, number>();
  const prev = new Map<number, number>();
  const open: { k: number; c: number }[] = [];
  const push = (k: number, c: number, from?: number) => {
    if (c >= (cost.get(k) ?? Infinity)) return;
    cost.set(k, c);
    if (from !== undefined) prev.set(k, from);
    else prev.delete(k);
    open.push({ k, c });
  };
  for (const [i, j] of ends(from)) push(key(i, j, 4), dist(from, { x: i * B, y: j * B }));
  const goals = ends(to);
  const DIRS: [number, number][] = [
    [1, 0],
    [0, 1],
    [-1, 0],
    [0, -1],
  ];
  let bestGoal = -1;
  let bestCost = Infinity;
  while (open.length) {
    open.sort((a, b) => a.c - b.c);
    const { k, c } = open.shift()!;
    if (c > (cost.get(k) ?? Infinity)) continue;
    const h = k % 5;
    const node = (k - h) / 5;
    const i = node % n;
    const j = (node - i) / n;
    for (const [gi, gj] of goals)
      if (gi === i && gj === j) {
        const total = c + dist({ x: i * B, y: j * B }, to);
        if (total < bestCost) {
          bestCost = total;
          bestGoal = k;
        }
      }
    if (c >= bestCost) continue;
    DIRS.forEach(([dx, dy], nh) => {
      const ni = i + dx;
      const nj = j + dy;
      if (ni < 0 || nj < 0 || ni >= n || nj >= n) return;
      if (cuts.size && cuts.has(segKey(i, j, ni, nj))) return;
      push(key(ni, nj, nh), c + B + (h !== 4 && h !== nh ? TURN : 0), k);
    });
  }
  const pts: Pt[] = [to];
  for (let k: number | undefined = bestGoal; k !== undefined && k >= 0; k = prev.get(k)) {
    const node = (k - (k % 5)) / 5;
    pts.push({ x: (node % n) * B, y: Math.floor(node / n) * B });
  }
  pts.push(from);
  pts.reverse();
  return simplify(pts);
}

/** Drop duplicate and collinear points. */
export function simplify(pts: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (last && dist(last, p) < EPS) continue;
    const prev = out[out.length - 2];
    if (
      prev &&
      last &&
      ((Math.abs(prev.x - last.x) < EPS && Math.abs(last.x - p.x) < EPS) ||
        (Math.abs(prev.y - last.y) < EPS && Math.abs(last.y - p.y) < EPS))
    )
      out[out.length - 1] = p;
    else out.push(p);
  }
  return out;
}

export const pathLength = (pts: Pt[]) =>
  pts.reduce((s, p, i) => (i ? s + Math.hypot(p.x - pts[i - 1]!.x, p.y - pts[i - 1]!.y) : 0), 0);

/** The point a fraction `t` (0–1) of the way along a polyline, with its heading. */
export function pointAlong(pts: Pt[], t: number): { p: Pt; dx: number; dy: number } {
  const total = pathLength(pts);
  let left = Math.max(0, Math.min(1, t)) * total;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const seg = Math.hypot(b.x - a.x, b.y - a.y);
    if (left <= seg || i === pts.length - 1) {
      const f = seg ? Math.min(1, left / seg) : 1;
      return {
        p: { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f },
        dx: b.x - a.x,
        dy: b.y - a.y,
      };
    }
    left -= seg;
  }
  const last = pts[pts.length - 1] ?? { x: 0, y: 0 };
  return { p: last, dx: 0, dy: 0 };
}

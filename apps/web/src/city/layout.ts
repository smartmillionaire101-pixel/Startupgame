/**
 * Deterministic city layout (docs/WAVE1-CITY-AND-DEPTH.md §C).
 *
 * The city is a square grid of blocks separated by streets. Districts are
 * laid along a spiral out from downtown (your office), so each district is
 * contiguous and the airport ends up on the outskirts. Everything is seeded
 * by the market id: the same market always looks the same.
 *
 * Coordinates: "grid" units (tiles) on the ground plane; streets run along
 * x = k·B and y = k·B. `project` maps grid → screen pixels (2:1 isometric).
 */
import { hash, seeded, type FundOffice, type LenderLook } from './contract';
import { flavourOf, type Flavour, type VehicleSpec } from './flavour';

/** Tiles from one street to the next. */
export const B = 4;
/** Half the width of a tile and half its height, in screen px. */
export const TW = 32;
export const TH = 16;

export interface Pt {
  x: number;
  y: number;
}

export const project = (x: number, y: number): Pt => ({ x: (x - y) * TW, y: (x + y) * TH });
export const unproject = (sx: number, sy: number): Pt => ({
  x: (sx / TW + sy / TH) / 2,
  y: (sy / TH - sx / TW) / 2,
});

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
  | 'houses';

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
  | 'eventhall';

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
  | 'hall';

export interface Place {
  id: string;
  kind: PlaceKind;
  /** Proper name for lenders, funds, stalls; empty for generic places (labelled at render). */
  name: string;
  district: DistrictId;
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
  kind: 'tree' | 'house' | 'fountain' | 'bench' | 'landmark' | 'runway' | 'lamp';
  x: number;
  y: number;
  w?: number;
  d?: number;
  h?: number;
  color?: string;
  roof?: string;
  size?: number;
}

export interface Vehicle {
  spec: VehicleSpec;
  /** Grid start and end, along one street. */
  from: Pt;
  to: Pt;
  axis: 'x' | 'y';
  dur: number;
  delay: number;
}

export interface Block {
  i: number;
  j: number;
  district: DistrictId;
}

export interface StreetName {
  name: string;
  axis: 'x' | 'y';
  /** The street line: x = k·B for axis 'y', y = k·B for axis 'x'. */
  k: number;
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
  /** Screen-space bounds (px) of everything drawn. */
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  /** Where the avatar starts: your office's door (or downtown). */
  start: Pt;
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
}

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
const LOT = [0.55, 2.1];
const LOT_SIZE = 1.35;

function lot(i: number, j: number, a: 0 | 1, b: 0 | 1) {
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

export function buildLayout(input: CityInput): CityLayout {
  const flavour = flavourOf(input.marketId);
  const seed = hash(`city:${input.marketId}`);
  const rnd = seeded(seed);

  const nF = Math.max(1, Math.ceil((input.lenders.length + input.playerBanks.length) / 4));
  const nI = Math.max(1, Math.ceil(input.funds.length / 4));
  const nM = Math.max(1, Math.ceil(input.segments.length / 9));
  const core = 3 + nF + nI + nM + 2;
  const size = Math.max(4, Math.ceil(Math.sqrt(core + 3)));
  const extent = size * B;

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

  const cells = spiral(size, (seed >>> 3) % 2 ? 1 : -1, (seed >>> 5) % 4);
  const blocks: Block[] = cells.map(([i, j], n) => ({
    i,
    j,
    district: order[n] ?? (rnd() < 0.45 ? 'park' : 'houses'),
  }));

  const places: Place[] = [];
  const decor: Decor[] = [];
  const pickColor = (xs: string[]) => xs[Math.floor(rnd() * xs.length)]!;

  const of = (dist: DistrictId) => blocks.filter((b) => b.district === dist);

  /** Fill the corner lots of a district's blocks with items, in order. */
  function fillLots<T>(
    dist: DistrictId,
    items: T[],
    make: (item: T, l: ReturnType<typeof lot>, blk: Block) => void,
  ) {
    let n = 0;
    for (const blk of of(dist)) {
      // Front lots first so the most important buildings face the viewer.
      for (const [a, b] of [
        [1, 1],
        [0, 1],
        [1, 0],
        [0, 0],
      ] as [0 | 1, 0 | 1][]) {
        if (n >= items.length) {
          // Spare lot: a tree or a small building, for a fuller street.
          const l = lot(blk.i, blk.j, a, b);
          decor.push({ kind: 'tree', x: l.x + 0.7, y: l.y + 0.7, size: 1 });
          continue;
        }
        make(items[n++]!, lot(blk.i, blk.j, a, b), blk);
      }
    }
  }

  // ---- Downtown: your office, the hub, the newsstand and a café-side tree.
  const dt = of('downtown')[0]!;
  {
    const head = input.office?.headcount ?? 0;
    const w = head < 3 ? 1.05 : head < 8 ? 1.2 : LOT_SIZE;
    const l = lot(dt.i, dt.j, 1, 1);
    const x = l.x + (LOT_SIZE - w);
    const y = l.y + (LOT_SIZE - w);
    places.push({
      id: 'office',
      kind: 'office',
      name: '',
      district: 'downtown',
      x,
      y,
      w,
      d: w,
      h: input.office ? 30 + Math.min(70, head * 7) : 34,
      motif: 'office',
      color: '#0f766e',
      accent: '#5eead4',
      ...doorFor(dt.i, dt.j, 1, 1, x, y, w, w),
      level: head,
      siren: input.office?.siren ?? false,
    });
    const lh = lot(dt.i, dt.j, 0, 1);
    places.push({
      id: 'hub',
      kind: 'hub',
      name: '',
      district: 'downtown',
      x: lh.x,
      y: lh.y + 0.1,
      w: LOT_SIZE,
      d: 1.2,
      h: 30,
      motif: 'hub',
      color: '#f59e0b',
      accent: '#fde68a',
      ...doorFor(dt.i, dt.j, 0, 1, lh.x, lh.y + 0.1, LOT_SIZE, 1.2),
    });
    const ln = lot(dt.i, dt.j, 1, 0);
    places.push({
      id: 'newsstand',
      kind: 'newsstand',
      name: '',
      district: 'downtown',
      x: ln.x + 0.65,
      y: ln.y + 0.45,
      w: 0.6,
      d: 0.5,
      h: 16,
      motif: 'newsstand',
      color: '#1d4ed8',
      accent: '#fef08a',
      ...doorFor(dt.i, dt.j, 1, 0, ln.x + 0.65, ln.y + 0.45, 0.6, 0.5),
    });
    const lt = lot(dt.i, dt.j, 0, 0);
    decor.push({ kind: 'fountain', x: lt.x + 0.7, y: lt.y + 0.7, size: 0.6 });
    decor.push({ kind: 'bench', x: lt.x + 0.2, y: lt.y + 1.15 });
  }

  // ---- Residential: home, plus neighbours' houses.
  const rs = of('residential')[0]!;
  {
    const tier = Math.max(1, Math.min(5, input.homeTier));
    const l = lot(rs.i, rs.j, 1, 1);
    const w = tier >= 4 ? LOT_SIZE : 1.05;
    const x = l.x + (LOT_SIZE - w);
    const y = l.y + (LOT_SIZE - w);
    places.push({
      id: 'home',
      kind: 'home',
      name: '',
      district: 'residential',
      x,
      y,
      w,
      d: w,
      h: tier === 1 ? 50 : tier === 2 ? 24 : tier === 3 ? 30 : tier === 4 ? 34 : 28,
      motif: 'home',
      color: pickColor(flavour.walls),
      accent: pickColor(flavour.roofs),
      ...doorFor(rs.i, rs.j, 1, 1, x, y, w, w),
      level: tier,
    });
    for (const [a, b] of [
      [0, 1],
      [1, 0],
      [0, 0],
    ] as [0 | 1, 0 | 1][]) {
      const lh = lot(rs.i, rs.j, a, b);
      decor.push({
        kind: 'house',
        x: lh.x + 0.15,
        y: lh.y + 0.15,
        w: 1,
        d: 1,
        h: 18 + Math.floor(rnd() * 14),
        color: pickColor(flavour.walls),
        roof: pickColor(flavour.roofs),
      });
    }
  }

  // ---- Landmark (no interior; local flavour).
  for (const blk of of('landmark')) {
    decor.push({ kind: 'landmark', x: blk.i * B + B / 2, y: blk.j * B + B / 2 });
    for (let k = 0; k < 4; k++)
      decor.push({
        kind: 'tree',
        x: blk.i * B + 0.8 + (k % 2) * 2.4,
        y: blk.j * B + 0.8 + Math.floor(k / 2) * 2.4,
        size: 0.9,
      });
  }

  // ---- Finance Row: one building per lender, then player banks.
  const financeItems = [
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
  fillLots('finance', financeItems, (it, l, blk) => {
    const motif = it.look.motif;
    const w = motif === 'kiosk' ? 0.8 : motif === 'shopfront' ? 1.15 : LOT_SIZE;
    const x = l.x + (LOT_SIZE - w) * (l.a ? 1 : 0);
    const y = l.y + (LOT_SIZE - w) * (l.b ? 1 : 0);
    places.push({
      id: `${it.kind}:${it.id}`,
      kind: it.kind,
      ref: it.id,
      name: it.name,
      district: 'finance',
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
  });

  // ---- Investor Quarter: one office per fund.
  fillLots('investors', input.funds, (f, l, blk) => {
    const style = f.office.style;
    const w = style === 'shophouse' ? 0.95 : style === 'tower' ? 1.15 : LOT_SIZE;
    const x = l.x + (LOT_SIZE - w) * (l.a ? 1 : 0);
    const y = l.y + (LOT_SIZE - w) * (l.b ? 1 : 0);
    places.push({
      id: `fund:${f.id}`,
      kind: 'fund',
      ref: f.id,
      name: f.name,
      district: 'investors',
      x,
      y,
      w,
      d: w,
      h: (OFFICE_H[style] ?? 48) + Math.min(5, f.office.floor) * 3,
      motif: style,
      color: f.office.color,
      accent: '#fef3c7',
      ...doorFor(blk.i, blk.j, l.a, l.b, x, y, w, w),
      level: f.office.floor,
    });
  });

  // ---- The Market: a plaza of stalls, one per customer segment.
  {
    const awnings = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#a855f7', '#ec4899', '#14b8a6'];
    let n = 0;
    for (const blk of of('market')) {
      for (let k = 0; k < 9; k++) {
        const seg = input.segments[n];
        const ci = k % 3;
        const cj = Math.floor(k / 3);
        const x = blk.i * B + 0.62 + ci * 1.0;
        const y = blk.j * B + 0.62 + cj * 1.0;
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
          x,
          y,
          w: 0.76,
          d: 0.76,
          h: 16,
          motif: 'stall',
          color: '#fff7ed',
          accent: awnings[hash(seg.key) % awnings.length]!,
          door: opts.door,
          doorFace: opts.face,
          dim: input.industry !== null && seg.industry !== input.industry,
        });
      }
    }
  }

  // ---- Event Hall (Wave 2) and the Airport.
  for (const blk of of('events').slice(0, 1)) {
    const x = blk.i * B + 0.6;
    const y = blk.j * B + 0.9;
    places.push({
      id: 'eventhall',
      kind: 'eventhall',
      name: '',
      district: 'events',
      x,
      y,
      w: 2.8,
      d: 2.2,
      h: 40,
      motif: 'hall',
      color: '#e2e8f0',
      accent: '#8b5cf6',
      door: { x: x + 1.4, y: (blk.j + 1) * B },
      doorFace: 'left',
      soon: true,
    });
  }
  for (const blk of of('airport').slice(0, 1)) {
    const x = blk.i * B + 0.55;
    const y = blk.j * B + 2.1;
    places.push({
      id: 'airport',
      kind: 'airport',
      name: '',
      district: 'airport',
      x,
      y,
      w: 2.9,
      d: 1.35,
      h: 28,
      motif: 'terminal',
      color: '#f1f5f9',
      accent: '#0ea5e9',
      door: { x: x + 1.45, y: (blk.j + 1) * B },
      doorFace: 'left',
    });
    decor.push({ kind: 'runway', x: blk.i * B + 0.5, y: blk.j * B + 0.45, w: 3, d: 1.3 });
  }

  // ---- Fillers: parks and neighbourhood houses.
  for (const blk of [...of('park'), ...of('houses')]) {
    if (blk.district === 'park') {
      const trees = 5 + Math.floor(rnd() * 4);
      for (let k = 0; k < trees; k++)
        decor.push({
          kind: 'tree',
          x: blk.i * B + 0.6 + rnd() * 2.8,
          y: blk.j * B + 0.6 + rnd() * 2.8,
          size: 0.7 + rnd() * 0.5,
        });
      if (rnd() < 0.5)
        decor.push({ kind: 'fountain', x: blk.i * B + B / 2, y: blk.j * B + B / 2, size: 0.5 });
    } else {
      for (const [a, b] of [
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 1],
      ] as [0 | 1, 0 | 1][]) {
        const l = lot(blk.i, blk.j, a, b);
        if (rnd() < 0.2) {
          decor.push({ kind: 'tree', x: l.x + 0.7, y: l.y + 0.7, size: 1 });
          continue;
        }
        decor.push({
          kind: 'house',
          x: l.x + 0.1,
          y: l.y + 0.1,
          w: 1.1,
          d: 1.1,
          h: 16 + Math.floor(rnd() * 40),
          color: pickColor(flavour.walls),
          roof: pickColor(flavour.roofs),
        });
      }
    }
  }

  // ---- Street lamps along the main avenues, for night-time glow and rhythm.
  for (let k = 1; k < size; k++)
    for (let s = 0; s < size; s++)
      if ((k + s) % 2 === 0) decor.push({ kind: 'lamp', x: k * B + 0.38, y: s * B + B / 2 });

  // ---- Street names (seeded shuffle of the market's list).
  const names = [...flavour.streets];
  for (let k = names.length - 1; k > 0; k--) {
    const r = Math.floor(rnd() * (k + 1));
    [names[k], names[r]] = [names[r]!, names[k]!];
  }
  const streets: StreetName[] = [];
  for (let k = 1; k < size; k++) {
    streets.push({ name: names[(2 * k) % names.length]!, axis: 'y', k });
    streets.push({ name: names[(2 * k + 1) % names.length]!, axis: 'x', k });
  }

  // ---- Traffic: each vehicle drives one street end to end, in its lane.
  const vehicles: Vehicle[] = [];
  const nVeh = 4 + size;
  for (let n = 0; n < nVeh; n++) {
    const spec = flavour.vehicles[n % flavour.vehicles.length]!;
    const axis: 'x' | 'y' = n % 2 ? 'x' : 'y';
    const k = 1 + Math.floor(rnd() * (size - 1));
    const forward = rnd() < 0.5;
    const lane = forward ? 0.16 : -0.16;
    const a = -0.6;
    const b = extent + 0.6;
    const line = k * B + lane;
    const from = axis === 'x' ? { x: forward ? a : b, y: line } : { x: line, y: forward ? a : b };
    const to = axis === 'x' ? { x: forward ? b : a, y: line } : { x: line, y: forward ? b : a };
    vehicles.push({ spec, from, to, axis, dur: 16 + rnd() * 14, delay: -rnd() * 30 });
  }

  // ---- District labels, at the centre of each district's blocks.
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

  const margin = 6;
  const left = project(-margin, extent + margin);
  const right = project(extent + margin, -margin);
  const top = project(-margin, -margin);
  const bottom = project(extent + margin, extent + margin);
  const bounds = { minX: left.x, maxX: right.x, minY: top.y - 140, maxY: bottom.y };

  const office = places.find((p) => p.kind === 'office')!;
  return {
    marketId: input.marketId,
    flavour,
    size,
    extent,
    blocks,
    places,
    decor,
    vehicles,
    streets,
    districts,
    bounds,
    start: office.door,
  };
}

// ---------------------------------------------------------------------------
// Street graph and walking

const EPS = 1e-6;
const dist = (a: Pt, b: Pt) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

/** The closest point on any street to a ground point. */
export function nearestStreetPoint(layout: Pick<CityLayout, 'extent' | 'size'>, p: Pt): Pt {
  const clamp = (v: number) => Math.max(0, Math.min(layout.extent, v));
  let best: Pt = { x: 0, y: 0 };
  let bestD = Infinity;
  for (let k = 0; k <= layout.size; k++) {
    const line = k * B;
    for (const c of [
      { x: line, y: clamp(p.y) },
      { x: clamp(p.x), y: line },
    ]) {
      const d = Math.hypot(c.x - p.x, c.y - p.y);
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
  }
  return best;
}

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

/**
 * Shortest walk along the streets from one street point to another, as a
 * polyline in grid coordinates. Turns cost a little, so routes are tidy.
 */
export function findPath(layout: Pick<CityLayout, 'size'>, from: Pt, to: Pt): Pt[] {
  const n = layout.size + 1;
  const sameX = onLine(from.x) && onLine(to.x) && Math.abs(from.x - to.x) < EPS;
  const sameY = onLine(from.y) && onLine(to.y) && Math.abs(from.y - to.y) < EPS;
  if (sameX || sameY) return [from, to];

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

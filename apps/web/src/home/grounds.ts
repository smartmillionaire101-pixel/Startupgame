/**
 * Wave 12: the grounds round your home, sized by the kind of home and how
 * rich you are (docs/WAVE11-SOCIAL-EXPERIENCES.md, "The home grows with
 * wealth"). Pure data in tile units (a tile is a metre; the house covers 0..w × 0..h, the street is towards +y), drawn by
 * the 3D home (../interiors3d/house.ts) and the Lite home (./HomeScene.tsx).
 *
 * - A flat (a room, a studio, an apartment) sits in a small garden with a
 *   parking strip in front.
 * - A townhouse or a rented house gets a garden on the side, a gated drive
 *   with open bays and a hedge round the plot.
 * - A villa adds a pool terrace with loungers and a parasol, and a steel
 *   carport for SUVs; a mansion a bigger pool and a formal garden with a
 *   fountain behind the house. Richer owners get bigger pools and gardens.
 * - A penthouse is a roof terrace with a hot tub, the city's towers round it
 *   and the residents' car deck alongside.
 *
 * Every car you own has a bay of its own: an SUV under the carport, a
 * supercar in a glass showroom, an electric car at a charger, the rest in
 * open bays on the drive.
 */
import type { HotelTier } from '../city/travel';
import type { HomeAct, HomePlan } from './layout';
import type { HotelDoor, HotelWindow } from './hotel';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type BayKind = 'open' | 'charger' | 'carport' | 'showroom' | 'deck';

export interface Bay extends Rect {
  kind: BayKind;
  /** The car parked here (a model id), or none. */
  car: string | null;
  /** Index of that car in the garage list. */
  index: number;
  /** The car's facing: 0 = nose towards the street (+y), π/2 = towards +x. */
  rot: number;
}

export interface Lounger {
  x: number;
  y: number;
  /** Facing (radians, 0 = +y). */
  rot: number;
}

export type GroundStyle = 'garden' | 'estate' | 'roof' | 'hotel';

export interface Grounds {
  style: GroundStyle;
  /** The round lawn (or roof) under everything: centre and radius. */
  lawn: { x: number; y: number; r: number };
  pool: (Rect & { hot: boolean }) | null;
  /** Paving round the pool, or the penthouse terrace. */
  terrace: Rect | null;
  loungers: Lounger[];
  parasol: { x: number; y: number } | null;
  /** The asphalt drive in front (bays painted on it). */
  drive: Rect | null;
  bays: Bay[];
  /** One carport roof over these bays (x range), or none. */
  carport: Rect | null;
  hedges: Rect[];
  gate: { x: number; y: number; w: number } | null;
  /** The street in front: centre line y and x range. */
  street: { y: number; x0: number; x1: number };
  /** The paved path from the gate (or the street) to the front door. */
  path: Rect;
  trees: { x: number; y: number; s: number; palm: boolean }[];
  /** Potted plants outside (by the door, on the terrace, by the gate). */
  pots: { x: number; y: number }[];
  /** A formal garden: a fountain and flower beds. */
  fountain: { x: number; y: number } | null;
  beds: Rect[];
  /** Where the delivery van stops (nose towards +x). */
  van: { x: number; y: number };
  /** What the camera frames: the house, the terrace, the drive and the bays. */
  focus: Rect;
  /** A penthouse: the rail at the terrace's edge where you watch the skyline. */
  view?: Rect | null;
  /** A hotel room: the hotel (its name on the tower, its tier's finish) and the floor you're on. */
  hotel?: {
    tier: HotelTier;
    name: string;
    floor: number;
    /** Your room's number, the neighbours' doors (friends' named), the window wall's windows. */
    room?: number;
    doors?: HotelDoor[];
    windows?: HotelWindow[];
  } | null;
}

/** Which garage a car model gets. */
export function bayKindOf(model: string): BayKind {
  if (model === 'city-suv') return 'carport';
  if (model === 'luxury') return 'showroom';
  if (model === 'electric') return 'charger';
  return 'open';
}

const HOUSES = new Set(['townhouse', 'house', 'villa', 'mansion']);

/** A small deterministic jitter (no Math.random). */
const rnd = (n: number) => (((Math.sin(n * 12.9898) * 43758.5453) % 1) + 1) % 1;

export function groundsFor(plan: HomePlan, cars: readonly string[]): Grounds {
  const W = plan.w;
  const H = plan.h;
  const wealth = plan.wealth;
  const doorX = plan.door.x + 0.5;
  const list = cars.slice(0, 8);
  if (plan.kind === 'penthouse') return roof(plan, list);
  const house = HOUSES.has(plan.kind);
  const pools = plan.kind === 'villa' || plan.kind === 'mansion';
  const big = plan.kind === 'mansion' ? 1 : 0;
  const formal = house && (big === 1 || wealth >= 3);

  // ---- Behind the house: the pool terrace (left) and a formal garden (right).
  let pool: Grounds['pool'] = null;
  let terrace: Rect | null = null;
  const loungers: Lounger[] = [];
  let parasol: Grounds['parasol'] = null;
  const trees: Grounds['trees'] = [];
  const pots: Grounds['pots'] = [];
  const beds: Rect[] = [];
  let fountain: Grounds['fountain'] = null;
  let back = house ? 3 : 1.4;
  if (pools) {
    const pw = 5.6 + wealth * 0.7 + big * 2;
    const pd = 3.4 + wealth * 0.3 + big * 0.8;
    back = pd + 4.2;
    terrace = { x: -0.4, y: -back, w: pw + 2.8, h: back - 0.5 };
    pool = { x: 0.8, y: -back + 2.6, w: pw, h: pd, hot: false };
    // Loungers behind the pool, a parasol at the end of the row.
    const n = 2 + big + (wealth >= 2 ? 1 : 0);
    for (let i = 0; i < n; i++) loungers.push({ x: 1.4 + i * 1.1, y: -back + 1.25, rot: 0 });
    parasol = { x: 1.4 + n * 1.1 + 0.5, y: -back + 1.2 };
    pots.push(
      { x: terrace.x + terrace.w - 0.5, y: -back + 0.6 },
      { x: terrace.x + terrace.w - 0.5, y: -1.2 },
    );
  } else if (house) {
    beds.push({ x: 0.6, y: -back + 0.6, w: Math.min(W - 1.2, 6), h: 1.2 });
  }
  if (formal) {
    const gx0 = (terrace ? terrace.x + terrace.w : 0) + 1.2;
    const gx1 = W - 0.6;
    if (gx1 - gx0 > 5) {
      fountain = { x: (gx0 + gx1) / 2, y: -back / 2 - 0.2 };
      beds.push(
        { x: gx0, y: -back + 0.8, w: (gx1 - gx0) / 2 - 1.6, h: 1.1 },
        { x: (gx0 + gx1) / 2 + 1.6, y: -back + 0.8, w: (gx1 - gx0) / 2 - 1.6, h: 1.1 },
      );
    }
  }

  // ---- The drive in front: open bays on the left, the special garages on the right.
  const fy = H + 1.0;
  const depth = 5.4;
  const bays: Bay[] = [];
  const indexed = list.map((model, index) => ({ model, index, kind: bayKindOf(model) }));
  const open = indexed.filter((c) => c.kind === 'open' || c.kind === 'charger');
  const ports = indexed.filter((c) => c.kind === 'carport');
  const shows = indexed.filter((c) => c.kind === 'showroom');
  const bayW = 2.8;
  const nOpen = Math.max(house ? 2 : 1, open.length);
  // Houses park left of the front path; a flat's bays sit right of its door.
  const x0 = house
    ? Math.min(-1.6, doorX - 1.4 - nOpen * bayW)
    : Math.max(doorX + 1.6, W - nOpen * bayW - 0.8);
  for (let i = 0; i < nOpen; i++) {
    const c = open[i];
    bays.push({
      x: x0 + 0.4 + i * bayW,
      y: fy + 0.3,
      w: bayW - 0.2,
      h: depth - 0.6,
      kind: c?.kind ?? 'open',
      car: c?.model ?? null,
      index: c?.index ?? -1,
      rot: 0,
    });
  }
  const openEnd = x0 + 0.8 + nOpen * bayW;
  let gx = Math.max(openEnd + 0.6, doorX + 1.8);
  let carport: Rect | null = null;
  const nPorts = Math.max(pools ? 2 : 0, ports.length);
  if (nPorts) {
    const cw = 3.1;
    carport = { x: gx, y: fy, w: nPorts * cw + 0.2, h: depth + 0.2 };
    for (let i = 0; i < nPorts; i++)
      bays.push({
        x: gx + 0.2 + i * cw,
        y: fy + 0.3,
        w: cw - 0.2,
        h: depth - 0.6,
        kind: 'carport',
        car: ports[i]?.model ?? null,
        index: ports[i]?.index ?? -1,
        rot: 0,
      });
    gx += carport.w + 0.5;
  }
  for (const s of shows) {
    bays.push({
      x: gx,
      y: fy + 0.2,
      w: 3.4,
      h: depth - 0.4,
      kind: 'showroom',
      car: s.model,
      index: s.index,
      rot: 0,
    });
    gx += 3.8;
  }
  const driveX1 = house ? Math.max(openEnd, Math.min(gx - 0.2, openEnd)) : openEnd;
  const drive: Rect = { x: x0, y: fy - 0.2, w: driveX1 - x0, h: depth + 2.4 };

  // ---- The plot: hedges round it, the gate in front of the drive.
  const plotX0 = Math.min(x0, terrace?.x ?? 0, 0) - 1.0;
  const plotX1 = Math.max(W + 1.0, gx + 0.4);
  const plotY0 = -back - 0.9;
  const plotY1 = drive.y + drive.h + 0.4;
  const hedges: Rect[] = [];
  let gate: Grounds['gate'] = null;
  if (house) {
    const gw = Math.min(6.4, Math.max(4.4, nOpen * bayW * 0.7));
    gate = { x: x0 + 0.4 + (nOpen * bayW) / 2, y: plotY1, w: gw };
    const t = 0.7;
    hedges.push({ x: plotX0, y: plotY0, w: t, h: plotY1 - plotY0 });
    hedges.push({ x: plotX1 - t, y: plotY0, w: t, h: plotY1 - plotY0 });
    hedges.push({ x: plotX0, y: plotY0, w: plotX1 - plotX0, h: t });
    const gl = gate.x - gate.w / 2 - 0.4;
    const gr = gate.x + gate.w / 2 + 0.4;
    if (gl > plotX0) hedges.push({ x: plotX0, y: plotY1 - t / 2, w: gl - plotX0, h: t });
    if (plotX1 > gr) hedges.push({ x: gr, y: plotY1 - t / 2, w: plotX1 - gr, h: t });
    // A low hedge along the house front, either side of the path.
    if (doorX - 1.0 > 0.4) hedges.push({ x: 0.2, y: H + 0.3, w: doorX - 1.2, h: 0.45 });
    const hx = carport ? carport.x : gx;
    if (hx - 0.4 > doorX + 1.2)
      hedges.push({ x: doorX + 1.0, y: H + 0.3, w: hx - 0.4 - (doorX + 1.0), h: 0.45 });
    for (const [x, y, s, p] of [
      [plotX0 - 1.4, plotY0 + 1.5, 1, true],
      [plotX0 - 1.6, (plotY0 + plotY1) / 2, 1.1, false],
      [plotX0 - 1.3, plotY1 - 2, 0.9, true],
      [plotX1 + 1.4, plotY0 + 1.2, 1.05, false],
      [plotX1 + 1.5, (plotY0 + plotY1) / 2, 0.95, true],
      [plotX1 + 1.3, plotY1 - 1.5, 1, false],
    ] as const)
      trees.push({ x, y, s, palm: p });
    if (pools) trees.push({ x: plotX0 + 1.2, y: plotY0 + 1.4, s: 0.8, palm: true });
    pots.push({ x: gate.x - gate.w / 2 - 1.1, y: plotY1 - 0.9 });
    pots.push({ x: gate.x + gate.w / 2 + 1.1, y: plotY1 - 0.9 });
  } else {
    // A flat: a small garden with shrubs and a couple of trees.
    for (let i = 0; i < 4; i++)
      trees.push({
        x: i < 2 ? -2.2 : W + 2.2,
        y: 1 + (i % 2) * (H - 2),
        s: 0.8 + rnd(i) * 0.3,
        palm: false,
      });
  }
  pots.push({ x: doorX - 1.0, y: H + 0.55 }, { x: doorX + 1.0, y: H + 0.55 });
  const streetY = plotY1 + 2.6;
  const path: Rect = { x: doorX - 0.6, y: H, w: 1.2, h: Math.max(0.8, fy - H + 0.2) };

  const fx0 = Math.min(0, terrace?.x ?? 0, drive.x);
  const fy0 = Math.min(0, terrace?.y ?? 0, -back);
  const fx1 = Math.max(W, drive.x + drive.w, carport ? carport.x + carport.w : 0, gx - 0.4);
  const fy1 = drive.y + drive.h;
  const focus: Rect = { x: fx0, y: fy0, w: fx1 - fx0, h: fy1 - fy0 };
  const cx = (plotX0 + plotX1) / 2;
  const cy = (plotY0 + streetY) / 2;
  const r = Math.hypot(plotX1 - plotX0, streetY + 3 - plotY0) / 2 + 2;
  return {
    style: house ? 'estate' : 'garden',
    lawn: { x: cx, y: cy, r },
    pool,
    terrace,
    loungers,
    parasol,
    drive,
    bays,
    carport,
    hedges,
    gate,
    street: { y: streetY, x0: cx - r - 4, x1: cx + r + 4 },
    path,
    trees,
    pots,
    fountain,
    beds,
    van: { x: (gate?.x ?? doorX) + 0.4, y: streetY - 0.6 },
    focus,
  };
}

/** A penthouse: the roof terrace with a hot tub, and the residents' car deck. */
function roof(plan: HomePlan, cars: readonly string[]): Grounds {
  const W = plan.w;
  const H = plan.h;
  const rich = plan.wealth >= 2;
  const terrace: Rect = { x: 0, y: H + 0.3, w: W, h: rich ? 4.6 : 3.6 };
  const pool = { x: W - (rich ? 5 : 4), y: H + 0.9, w: rich ? 4 : 3, h: 2.4, hot: true };
  const loungers: Lounger[] = [0, 1, 2].slice(0, rich ? 3 : 2).map((i) => ({
    x: 2.6 + i * 1.15,
    y: H + 1.6,
    rot: 0,
  }));
  const n = Math.max(2, cars.length);
  const dx = W + 1.6;
  const bays: Bay[] = [];
  for (let i = 0; i < n; i++) {
    const c = cars[i];
    bays.push({
      x: dx,
      y: 0.4 + i * 3,
      w: 5.2,
      h: 2.8,
      kind: 'deck',
      car: c ?? null,
      index: c ? i : -1,
      rot: Math.PI / 2,
    });
  }
  const drive: Rect = { x: dx - 0.5, y: 0, w: 6.2, h: Math.max(H, n * 3 + 0.8) };
  const focus: Rect = { x: 0, y: 0, w: dx + 5.8, h: Math.max(terrace.y + terrace.h, drive.h) };
  const r = Math.hypot(focus.w, focus.h) / 2 + 2;
  return {
    style: 'roof',
    lawn: { x: focus.w / 2, y: focus.h / 2, r },
    pool,
    terrace,
    loungers,
    parasol: { x: 2.0, y: H + 3.0 },
    drive,
    bays,
    carport: null,
    hedges: [],
    gate: null,
    street: { y: focus.h + 6, x0: -20, x1: focus.w + 20 },
    path: { x: plan.door.x, y: H, w: 1, h: 0.3 },
    trees: [],
    pots: [
      { x: 0.6, y: H + 0.8 },
      { x: 0.6, y: terrace.y + terrace.h - 0.6 },
      { x: W - 0.6, y: terrace.y + terrace.h - 0.6 },
    ],
    fountain: null,
    beds: [],
    van: { x: dx + 2.6, y: drive.y + drive.h + 1.5 },
    focus,
    // At the front of the terrace, past the loungers: the whole city ahead.
    view: { x: 3.4, y: terrace.y + terrace.h - 1.1, w: 3.2, h: 1 },
  };
}

/** Something outside you can tap: the pool, a lounger, the hot tub, a car. */
export interface OutdoorThing {
  id: string;
  label: string;
  model: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Facing (radians, 0 = +y). */
  rot: number;
  verbs: (
    | { act: HomeAct; label: string }
    | { id: 'car'; label: string; model: string }
    | { id: 'skyline' | 'party'; label: string }
  )[];
  /** Index into your garage (cars). */
  car?: number;
}

/** The things outside you can use (labels in English; the scene translates them). */
export function outdoorThings(g: Grounds): OutdoorThing[] {
  const out: OutdoorThing[] = [];
  if (g.pool)
    out.push({
      id: 'pool-water',
      label: g.pool.hot ? 'Hot tub' : 'Pool',
      model: g.pool.hot ? 'hot-tub' : 'pool-water',
      x: g.pool.x,
      y: g.pool.y,
      w: g.pool.w,
      h: g.pool.h,
      rot: 0,
      verbs: g.pool.hot
        ? [{ act: 'nap', label: 'Relax in the hot tub' }]
        : [
            { act: 'workout', label: 'Swim' },
            { act: 'nap', label: 'Float' },
          ],
    });
  g.loungers.forEach((l, i) =>
    out.push({
      id: `lounger-${i + 1}`,
      label: 'Sun lounger',
      model: 'lounger',
      x: l.x - 0.4,
      y: l.y - 0.95,
      w: 0.8,
      h: 1.9,
      rot: l.rot,
      verbs: [{ act: 'nap', label: 'Sunbathe' }],
    }),
  );
  if (g.view)
    out.push({
      id: 'skyline',
      label: 'Balcony',
      model: 'skyline-rail',
      ...g.view,
      rot: 0,
      verbs: [
        { id: 'skyline', label: 'Watch the skyline' },
        { id: 'party', label: 'Host a party' },
      ],
    });
  for (const b of g.bays)
    if (b.car)
      out.push({
        id: `car-${b.index + 1}`,
        label: 'Car',
        model: `car:${b.car}`,
        x: b.x,
        y: b.y,
        w: b.w,
        h: b.h,
        rot: b.rot,
        car: b.index,
        verbs: [{ id: 'car', label: 'Drive out', model: b.car }],
      });
  return out;
}

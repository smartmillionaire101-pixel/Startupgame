/**
 * Shops, each its own trade: a grocer's (produce crates, gondolas, fridges),
 * a corner shop, market and souk stalls, a fabric stall, a boutique, a bike
 * shop, a laundry, a tailor's, a print shop, a phone-repair counter, a
 * mobile-money kiosk, a marina chandlery, a ballroom, the newsstand
 * (magazine racks, papers), an electronics store, the furniture and car
 * showrooms and the market. Stock is instanced bits in the trade's colours.
 */
import * as THREE from 'three';
import { BACK } from '../roomGeom';
import { tone } from '../kit';
import { Dresser, jitter } from './core';
import {
  beamSeats,
  bike,
  bolts,
  chandelier,
  clothesRail,
  counter,
  desk,
  drinksFridge,
  gondola,
  magazineRack,
  mannequin,
  mirror,
  packs,
  paperStand,
  pendants,
  plantsAlong,
  poster,
  posterMat,
  printer,
  rug,
  sewingTable,
  shelving,
  sideChair,
  sofa,
  wallTv,
  washer,
  windows,
} from './props';
import type { DressCtx, Family, Look } from './types';

const GROCERY = [
  '#dc2626',
  '#f59e0b',
  '#16a34a',
  '#2563eb',
  '#f8fafc',
  '#7c2d12',
  '#db2777',
  '#0891b2',
  '#facc15',
  '#4d7c0f',
];
const CLOTH = [
  '#b91c1c',
  '#1d4ed8',
  '#047857',
  '#a16207',
  '#7c3aed',
  '#db2777',
  '#0f172a',
  '#ea580c',
  '#0e7490',
  '#facc15',
];

type Shop =
  | 'grocer'
  | 'corner'
  | 'stall'
  | 'souk'
  | 'fabric'
  | 'boutique'
  | 'bike'
  | 'laundry'
  | 'tailor'
  | 'print'
  | 'phone'
  | 'money'
  | 'marina'
  | 'ballroom'
  | 'campus'
  | 'news'
  | 'general';

function shopOf(v: string): Shop {
  if (v === 'newsstand') return 'news';
  if (/grocer|supermarket/.test(v)) return 'grocer';
  if (/corner/.test(v)) return 'corner';
  if (/souk/.test(v)) return 'souk';
  if (/fabric/.test(v)) return 'fabric';
  if (/market|stall/.test(v)) return 'stall';
  if (/boutique|fashion|clothes/.test(v)) return 'boutique';
  if (/bike|cycle/.test(v)) return 'bike';
  if (/laundr/.test(v)) return 'laundry';
  if (/tailor/.test(v)) return 'tailor';
  if (/print/.test(v)) return 'print';
  if (/phone/.test(v)) return 'phone';
  if (/money|pos-|agent/.test(v)) return 'money';
  if (/marina|boat/.test(v)) return 'marina';
  if (/ballroom/.test(v)) return 'ballroom';
  if (/campus/.test(v)) return 'campus';
  return 'general';
}

const LOOKS: Record<Shop, Look> = {
  grocer: { floor: 'tile', wall: '#f5f5f4' },
  corner: { floor: 'checker', floorTint: '#e7e5e4', wall: '#fef3c7' },
  stall: { floor: 'stone', wall: '#d6c7a8' },
  souk: { floor: 'stone', wall: '#c9a978' },
  fabric: { floor: 'tile', wall: '#fde9d9' },
  boutique: { floor: 'oak', wall: '#f5efe8' },
  bike: { floor: 'concrete', wall: '#e2e8f0' },
  laundry: { floor: 'tile', wall: '#e0f2fe' },
  tailor: { floor: 'parquet', wall: '#f3e8d8' },
  print: { floor: 'concrete', wall: '#f1f5f9' },
  phone: { floor: 'tile', wall: '#e0e7ff' },
  money: { floor: 'tile', wall: '#fef9c3' },
  marina: { floor: 'oak', wall: '#e0f2fe' },
  ballroom: { floor: 'parquet', wall: '#f3e8d0' },
  campus: { floor: 'oak', wall: '#eef2ff' },
  news: { floor: 'checker', floorTint: '#efe6d6', wall: '#f5f5f4' },
  general: { floor: 'tile', wall: '#f5f5f4' },
};

/** The till: a counter in front of whoever serves (at sx, sz), facing the shop. */
function till(
  d: Dresser,
  sx: number,
  sz: number,
  w: number,
  o: Parameters<typeof counter>[5] = {},
) {
  counter(d, sx, sz + 0.62, 0, w, o);
  d.claim(Dresser.rect(sx, sz + 0.3, w + 0.2, 1.4));
}

/** Tall shop shelving along the back wall from x0 to x1, stocked. */
function backShelves(
  d: Dresser,
  x0: number,
  x1: number,
  palette: readonly string[],
  o: {
    h?: number;
    kind?: Parameters<typeof packs>[5] extends infer T ? T : never;
    header?: string;
    frame?: string;
  } = {},
) {
  const n = Math.max(1, Math.round((x1 - x0) / 1.9));
  const w = (x1 - x0) / n;
  for (let i = 0; i < n; i++) {
    const x = x0 + w * (i + 0.5);
    shelving(
      d,
      x,
      BACK + 0.26,
      0,
      w - 0.04,
      o.h ?? 2.1,
      0.48,
      5,
      { frame: o.frame, header: i === 0 ? o.header : undefined },
      packs(d, x, BACK + 0.26, 0, palette, { ...(o.kind as object) }),
    );
  }
  d.claim({ x0, z0: BACK, x1, z1: BACK + 0.55 });
}

/** A crate of produce, tipped forward. */
function produceCrate(d: Dresser, x: number, z: number, colour: string, r = 0.045) {
  d.box(0.55, 0.22, 0.42, '#a77b4f', x, 0.55, z, { rx: 0.25 });
  d.box(0.08, 0.55, 0.08, '#7c5a3c', x - 0.22, 0, z + 0.12);
  d.box(0.08, 0.55, 0.08, '#7c5a3c', x + 0.22, 0, z + 0.12);
  d.box(0.08, 0.7, 0.08, '#7c5a3c', x - 0.22, 0, z - 0.14);
  d.box(0.08, 0.7, 0.08, '#7c5a3c', x + 0.22, 0, z - 0.14);
  for (let i = 0; i < 18; i++) {
    const lx = -0.2 + (i % 6) * 0.08;
    const lz = -0.12 + Math.floor(i / 6) * 0.1;
    d.ball(
      r * (0.9 + d.rng() * 0.25),
      jitter(d, colour, 0.06),
      x + lx,
      0.74 + 0.03 - lz * 0.25,
      z + lz,
    );
  }
}

/** A trestle table piled with goods (a stall). */
function stallTable(
  d: Dresser,
  x: number,
  z: number,
  w: number,
  fill: (x0: number, x1: number, y: number, z: number) => void,
  awning?: string,
) {
  d.box(w, 0.04, 0.8, '#a77b4f', x, 0.75, z);
  for (const s of [-1, 1])
    for (const t of [-1, 1])
      d.box(0.05, 0.75, 0.05, '#6b4a33', x + s * (w / 2 - 0.08), 0, z + t * 0.32);
  d.box(w, 0.6, 0.02, '#f5f5f4', x, 0.12, z + 0.4);
  fill(x - w / 2 + 0.06, x + w / 2 - 0.06, 0.79, z);
  if (awning) {
    for (const s of [-1, 1]) d.box(0.04, 2.3, 0.04, '#57534e', x + s * (w / 2), 0, z - 0.45);
    for (let i = 0; i < 6; i++)
      d.box(
        w / 6,
        0.02,
        1.1,
        i % 2 ? awning : '#f8fafc',
        x - w / 2 + (w / 6) * (i + 0.5),
        2.3,
        z - 0.1,
        { rx: 0.18 },
      );
  }
  d.claim(Dresser.rect(x, z, w + 0.1, 0.9));
}

function produce(d: Dresser, palette: readonly string[]) {
  return (x0: number, x1: number, y: number, z: number) => {
    let x = x0 + 0.12;
    while (x < x1 - 0.1) {
      const c = d.pick(palette);
      for (let i = 0; i < 7; i++)
        d.ball(
          0.045 + d.rng() * 0.02,
          jitter(d, c, 0.06),
          x + (i % 3) * 0.08 - 0.08,
          y + 0.05 + Math.floor(i / 3) * 0.07,
          z - 0.15 + (i % 2) * 0.12,
        );
      d.cyl(0.17, 0.13, 0.08, '#a16207', x, y, z + 0.18);
      x += 0.35;
    }
  };
}

function general(c: DressCtx, d: Dresser, t: Shop) {
  const L = d.flip ? 1 : -1;
  const pal = t === 'corner' ? GROCERY : t === 'grocer' ? GROCERY : d.shuffle(GROCERY).slice(0, 6);
  till(d, 2.67, -1.2, 2.4, {
    body: t === 'corner' ? '#b45309' : tone(c.tint, -0.1),
    top: '#2b2f36',
  });
  // Behind the till: cigarettes, airtime and sweets.
  shelving(
    d,
    2.67,
    BACK + 0.22,
    0,
    2.4,
    1.9,
    0.36,
    5,
    { frame: '#a8a29e' },
    packs(d, 2.67, BACK + 0.22, 0, pal, { tall: [0.08, 0.16], wide: [0.05, 0.09] }),
  );
  d.claim({ x0: 1.4, z0: BACK, x1: 3.95, z1: BACK + 0.45 });
  poster(d, 2.67, 2.2, 1.6, 0.4, c.sign ?? 'OPEN', tone(c.tint, -0.15));
  // Fridges in the corner.
  drinksFridge(d, 4.75, BACK + 0.36, 0, 1.2);
  if (t !== 'corner') drinksFridge(d, 5.65, -1.9, -Math.PI / 2, 1.2);
  d.claim({ x0: 4.1, z0: BACK, x1: 6, z1: -1.2 });
  // The aisles.
  backShelves(d, -5.9, 1.25, pal, {
    kind: { kind: 'mixed' },
    header: t === 'grocer' ? 'GROCERIES' : undefined,
  });
  const gx = L < 0 ? -2.6 : -2.2;
  if (d.fits(gx, -1.45, 3.4, 1.0)) gondola(d, gx, -1.45, 0, 2.8, pal, { kind: 'mixed' });
  if (t === 'grocer') {
    for (const [x, col] of [
      [-5.2, '#f97316'],
      [-4.55, '#dc2626'],
      [-3.9, '#65a30d'],
      [-3.25, '#facc15'],
    ] as const)
      if (d.fits(x, 0.3, 0.6, 0.6)) produceCrate(d, x, 0.3, col);
  } else {
    // Crates of soft drinks and a stack of rice by the door.
    for (let i = 0; i < 3; i++)
      if (d.fits(-5.3 + i * 0.55, 0.4, 0.5, 0.4))
        for (let k = 0; k < 3; k++)
          d.bit(
            0.45,
            0.25,
            0.35,
            d.pick(['#dc2626', '#facc15', '#16a34a']),
            -5.3 + i * 0.55,
            k * 0.25,
            0.4,
          );
  }
  if (d.fits(5.2, 1.0, 1.0, 0.7))
    for (let k = 0; k < 4; k++)
      d.bit(0.85, 0.16, 0.5, k % 2 ? '#f5f5f4' : '#e7e5e4', 5.2, k * 0.16, 1.0, {
        plain: true,
        ry: (d.rng() - 0.5) * 0.15,
      });
  poster(
    d,
    -1.0,
    2.25,
    1.2,
    0.35,
    t === 'grocer' ? 'FRESH DAILY' : 'AIRTIME HERE',
    t === 'grocer' ? '#15803d' : '#ca8a04',
  );
}

function news(_c: DressCtx, d: Dresser) {
  till(d, 2.67, -1.2, 2.2, { body: '#1e3a8a', top: '#2b2f36' });
  shelving(
    d,
    2.67,
    BACK + 0.22,
    0,
    2.3,
    1.8,
    0.36,
    5,
    { frame: '#a8a29e' },
    packs(d, 2.67, BACK + 0.22, 0, GROCERY, { tall: [0.08, 0.15], wide: [0.05, 0.09] }),
  );
  d.claim({ x0: 1.4, z0: BACK, x1: 3.95, z1: BACK + 0.45 });
  // A wall of magazines and a rack in the middle, the day's papers out front.
  magazineRack(d, -4.4, BACK + 0.3, 0, 2.6, 6);
  magazineRack(d, -1.5, BACK + 0.3, 0, 2.6, 6);
  d.claim({ x0: -5.8, z0: BACK, x1: -0.15, z1: BACK + 0.6 });
  if (d.fits(-3.0, -1.2, 2.2, 0.6)) magazineRack(d, -3.0, -1.2, 0, 2.0, 4, '#1e3a8a');
  for (const [x, z] of [
    [-1.0, 0.0],
    [-4.3, 0.2],
    [1.0, 0.6],
  ] as const)
    if (d.fits(x, z, 0.8, 0.6)) paperStand(d, x, z, (d.rng() - 0.5) * 0.4);
  drinksFridge(d, 4.85, BACK + 0.36, 0, 1.0);
  d.claim({ x0: 4.3, z0: BACK, x1: 5.4, z1: BACK + 0.7 });
  poster(d, -3, 2.3, 2.4, 0.45, 'NEWS · MAGAZINES · SNACKS', '#991b1b');
  poster(d, 5.4, 1.15, 0.6, 0.8, 'HEADLINES', '#111827');
}

function stall(c: DressCtx, d: Dresser, t: Shop) {
  const souk = t === 'souk';
  const pal = souk
    ? ['#b45309', '#dc2626', '#ca8a04', '#7c2d12', '#15803d', '#ea580c']
    : ['#f97316', '#dc2626', '#65a30d', '#facc15', '#7c3aed', '#16a34a'];
  stallTable(
    d,
    2.67,
    -0.6,
    2.6,
    souk ? spices(d) : produce(d, pal),
    souk ? '#b91c1c' : tone(c.tint, 0),
  );
  stallTable(d, -3.2, -2.2, 3.4, souk ? spices(d) : produce(d, pal), souk ? '#1d4ed8' : '#16a34a');
  // Sacks of grain, baskets and a scale.
  for (let i = 0; i < 5; i++) {
    const x = -5.3 + i * 0.6;
    if (!d.fits(x, 0.2, 0.5, 0.5)) continue;
    d.cyl(0.22, 0.25, 0.55, souk ? '#d6b98c' : '#e7d8b8', x, 0, 0.2, { seg: 10 });
    d.cyl(0.2, 0.2, 0.02, d.pick(pal), x, 0.55, 0.2);
  }
  d.box(0.3, 0.08, 0.25, '#9ca3af', 3.4, 0.79, -0.6);
  if (souk) {
    for (const x of [-4, -1.5, 1.5, 4]) {
      d.cyl(0.005, 0.005, 0.6, '#3f3f46', x, 2.4, 0.5);
      d.cyl(0.1, 0.13, 0.25, '#d4af37', x, 2.15, 0.5, {
        emissive: '#f59e0b',
        emissiveIntensity: 0.4,
        metal: 0.6,
        rough: 0.4,
      });
    }
    rug(d, -0.6, -2.7, 2.2, 1.0, '#7f1d1d');
    d.box(2.2, 1.4, 0.02, '#7f1d1d', 0.6, 0.9, BACK + 0.02);
  } else
    pendants(
      d,
      [
        [-3, -1.6],
        [2.7, -0.3],
      ],
      'globe',
    );
}

function spices(d: Dresser) {
  return (x0: number, x1: number, y: number, z: number) => {
    let x = x0 + 0.15;
    while (x < x1 - 0.1) {
      d.cyl(0.13, 0.13, 0.12, '#a16207', x, y, z);
      d.cyl(
        0.0,
        0.12,
        0.14,
        d.pick(['#b45309', '#dc2626', '#ca8a04', '#7c2d12', '#15803d', '#ea580c', '#fef3c7']),
        x,
        y + 0.12,
        z,
      );
      x += 0.3;
    }
  };
}

function fabric(_c: DressCtx, d: Dresser) {
  till(d, 2.67, -1.2, 2.0, { body: '#7c5a3c', top: '#e7d8b8', till: false });
  // A wall of bolts, upright, and shelves of folded lengths.
  shelving(
    d,
    -3.9,
    BACK + 0.26,
    0,
    3.6,
    2.2,
    0.48,
    6,
    { frame: '#7c5a3c', shelf: '#a77b4f', back: '#e7d8b8' },
    packs(d, -3.9, BACK + 0.26, 0, CLOTH, { kind: 'folded', wide: [0.16, 0.2] }),
  );
  d.claim({ x0: -5.8, z0: BACK, x1: -2.0, z1: BACK + 0.55 });
  bolts(d, 0.2, BACK + 0.3, 0, 12, CLOTH);
  bolts(d, 4.6, BACK + 0.3, 0, 8, CLOTH);
  d.claim({ x0: -1.0, z0: BACK, x1: 1.4, z1: BACK + 0.5 });
  // The measuring table piled with lengths, a mannequin in the shop's best.
  if (d.fits(-2.6, -1.3, 2.4, 1.0)) {
    d.box(2.2, 0.05, 0.9, '#a77b4f', -2.6, 0.8, -1.3);
    for (const s of [-1, 1]) d.box(0.08, 0.8, 0.8, '#7c5a3c', -2.6 + s * 1.0, 0, -1.3);
    bolts(d, -2.9, -1.3, 0.08, 6, CLOTH, true);
    d.box(1.0, 0.004, 0.03, '#facc15', -1.9, 0.85, -1.0);
  }
  for (const [x, z] of [
    [-4.6, 0.6],
    [5.2, 0.8],
  ] as const)
    if (d.fits(x, z, 0.5, 0.5)) mannequin(d, x, z, d.pick(CLOTH));
  pendants(
    d,
    [
      [-2.6, -1.3],
      [2.7, -0.6],
    ],
    'cone',
    '#a16207',
  );
}

function boutique(c: DressCtx, d: Dresser) {
  till(d, 2.67, -1.2, 1.8, { body: '#f5f5f4', top: '#d6b98c' });
  const pal = d.shuffle(CLOTH).slice(0, 5).concat(['#f5f5f4', '#1f2937']);
  // Rails along the back, folded shelves, mannequins in the window.
  for (const x of [-4.6, -2.6]) clothesRail(d, x, BACK + 0.45, 0, 1.6, pal);
  shelving(
    d,
    -0.4,
    BACK + 0.24,
    0,
    1.6,
    2.0,
    0.42,
    5,
    { frame: '#d6b98c', shelf: '#e7d8b8', back: '#f5efe8' },
    packs(d, -0.4, BACK + 0.24, 0, pal, { kind: 'folded', wide: [0.17, 0.2] }),
  );
  d.claim({ x0: -5.6, z0: BACK, x1: 0.5, z1: BACK + 0.7 });
  if (d.fits(-3.2, -1.1, 1.7, 0.6)) clothesRail(d, -3.2, -1.1, 0, 1.5, pal);
  if (d.fits(-0.6, -1.0, 1.3, 0.7)) {
    d.box(1.2, 0.85, 0.6, '#e7d8b8', -0.6, 0, -1.0, { round: 0.02 });
    packs(d, -0.6, -1.0, 0, pal, { kind: 'folded', wide: [0.17, 0.2] })(
      -0.55,
      0.55,
      0.85,
      0.3,
      -0.25,
      0.5,
    );
  }
  for (const [x, z] of [
    [-5.2, 1.5],
    [-4.5, 2.3],
    [5.4, 1.6],
  ] as const)
    if (d.fits(x, z, 0.5, 0.5)) mannequin(d, x, z, d.pick(pal), (d.rng() - 0.5) * 0.8);
  mirror(d, 4.6, BACK + 0.05, 0, 0.7, 1.8);
  d.claim({ x0: 4.1, z0: BACK, x1: 5.1, z1: BACK + 0.3 });
  // A bench of shoes.
  if (d.fits(5.3, -1.3, 0.5, 1.4)) {
    d.box(0.45, 0.4, 1.3, '#d6b98c', 5.3, 0, -1.3);
    for (let i = 0; i < 4; i++)
      d.bit(
        0.12,
        0.09,
        0.26,
        d.pick(['#1f2937', '#7c2d12', '#f5f5f4', '#be123c']),
        5.3,
        0.4,
        -1.8 + i * 0.32,
        { ry: 0.3, plain: true },
      );
  }
  rug(d, -0.8, 1.4, 2.6, 1.6, '#d6b98c');
  pendants(
    d,
    [
      [-3, -0.5],
      [0, -0.5],
      [2.7, -0.6],
    ],
    'globe',
  );
  plantsAlong(d, [5.6], 2.6, [3]);
  poster(d, -2.6, 2.2, 2.0, 0.4, c.sign ?? 'NEW IN', '#111827');
}

function bikeShop(_c: DressCtx, d: Dresser) {
  till(d, 2.67, -1.2, 2.0, { body: '#334155', top: '#1f2937' });
  const cols = ['#dc2626', '#1d4ed8', '#16a34a', '#f59e0b', '#0f172a', '#e5e7eb'];
  // Bikes hung on the back wall, and a row on the floor.
  for (let i = 0; i < 4; i++) bike(d, -5.0 + i * 1.25, BACK + 0.12, 0, d.pick(cols), 1.0);
  d.box(5.0, 0.04, 0.06, '#52525b', -3.1, 1.95, BACK + 0.05);
  for (let i = 0; i < 4; i++) {
    const x = -4.8 + i * 1.3;
    if (d.fits(x, -1.4, 1.2, 0.5)) bike(d, x, -1.4, 0.15, d.pick(cols));
  }
  d.claim({ x0: -5.8, z0: BACK, x1: 0.1, z1: BACK + 0.4 });
  // Tyres on pegs, helmets, a workstand.
  for (let i = 0; i < 5; i++)
    d.kit.torus(
      0.3,
      0.035,
      '#111',
      0.8 + (i % 3) * 0.2,
      1.7 + Math.floor(i / 3) * 0.1,
      BACK + 0.05 + i * 0.015,
      {},
    );
  shelving(d, 4.8, BACK + 0.24, 0, 1.6, 1.8, 0.42, 4, {}, (x0, x1, y, _r, lz) => {
    for (let x = x0 + 0.1; x < x1; x += 0.24)
      d.ball(0.1, d.pick(cols), 4.8 + x, y + 0.08, BACK + 0.24 + lz, 0.75);
  });
  if (d.fits(-4.6, 1.0, 1.4, 0.6)) {
    d.box(0.06, 1.1, 0.06, '#3f3f46', -4.6, 0, 1.0);
    d.box(0.6, 0.04, 0.4, '#3f3f46', -4.6, 0, 1.0);
    bike(d, -4.6, 1.0, 0, d.pick(cols), 0.45);
  }
  poster(d, -2.0, 2.3, 1.8, 0.4, 'SALES · REPAIRS', '#b91c1c');
}

function laundry(_c: DressCtx, d: Dresser) {
  till(d, 2.67, -1.2, 2.2, { body: '#0ea5e9', top: '#f1f5f9', till: true });
  // A row of washers with driers stacked on them.
  for (let i = 0; i < 7; i++) {
    const x = -5.5 + i * 0.66;
    washer(d, x, BACK + 0.36, 0);
    washer(d, x, BACK + 0.36, 0, 0.86);
  }
  d.claim({ x0: -5.9, z0: BACK, x1: -0.9, z1: BACK + 0.75 });
  // The folding table, baskets, bags of washing and shirts in plastic.
  if (d.fits(-2.6, -1.2, 2.4, 0.9)) {
    d.box(2.2, 0.05, 0.8, '#f1f5f9', -2.6, 0.85, -1.2);
    for (const s of [-1, 1]) d.box(0.06, 0.85, 0.7, '#94a3b8', -2.6 + s * 1.0, 0, -1.2);
    packs(d, -2.6, -1.2, 0, ['#f8fafc', '#bfdbfe', '#fecaca', '#d9f99d', '#1f2937'], {
      kind: 'folded',
      wide: [0.18, 0.2],
    })(-1.0, 1.0, 0.9, 0.3, -0.35, 0.7);
  }
  for (const [x, z] of [
    [-5.2, 0.4],
    [-4.5, 0.6],
    [5.3, 0.9],
  ] as const) {
    if (!d.fits(x, z, 0.5, 0.5)) continue;
    d.cyl(0.22, 0.2, 0.45, d.pick(['#2563eb', '#dc2626', '#16a34a']), x, 0, z, { seg: 12 });
    d.ball(0.2, '#f1f5f9', x, 0.45, z, 0.5);
  }
  if (d.fits(0.4, BACK + 0.5, 1.6, 0.6))
    clothesRail(d, 0.4, BACK + 0.5, 0, 1.6, ['#f1f5f9', '#e0f2fe', '#f8fafc', '#cbd5e1']);
  poster(d, -3.3, 2.3, 2.4, 0.4, 'WASH · DRY · IRON', '#0369a1');
  // Waiting chairs and a drinks machine by the door, an ironing board.
  if (d.fits(3.6, 1.0, 1.7, 0.6)) beamSeats(d, 3.6, 1.0, Math.PI, 3, '#0ea5e9');
  if (d.fits(5.4, -0.6, 0.8, 0.8)) drinksFridge(d, 5.4, -0.6, -Math.PI / 2, 0.8, '#1d4ed8');
  if (d.fits(-4.6, 2.3, 1.4, 0.5)) {
    d.box(1.3, 0.03, 0.35, '#e0f2fe', -4.6, 0.85, 2.3);
    d.box(0.04, 0.85, 0.3, '#94a3b8', -4.3, 0, 2.3, { rz: 0.4 });
    d.box(0.04, 0.85, 0.3, '#94a3b8', -4.9, 0, 2.3, { rz: -0.4 });
    d.box(0.22, 0.1, 0.12, '#f8fafc', -4.2, 0.88, 2.3);
  }
}

function tailor(_c: DressCtx, d: Dresser) {
  till(d, 2.67, -1.2, 2.0, { body: '#7c5a3c', top: '#e7d8b8', till: false });
  bolts(d, -4.6, BACK + 0.3, 0, 9, CLOTH);
  clothesRail(d, -1.8, BACK + 0.45, 0, 1.8, CLOTH);
  d.claim({ x0: -5.8, z0: BACK, x1: -0.8, z1: BACK + 0.7 });
  for (const [x, z, ry] of [
    [-4.0, -1.5, 0],
    [-1.8, -1.5, 0],
    [0.8, -2.2, 0],
  ] as const)
    if (d.fits(x, z, 1.1, 1.0)) {
      sewingTable(d, x, z, ry, d.pick(CLOTH));
      sideChair(d, x, z + 0.55, Math.PI, 'plastic');
    }
  for (const [x, z] of [
    [-5.2, 0.8],
    [5.3, 1.2],
    [4.9, -2.2],
  ] as const)
    if (d.fits(x, z, 0.5, 0.5)) mannequin(d, x, z, d.pick(CLOTH));
  mirror(d, 1.2, BACK + 0.05, 0, 0.7, 1.8);
  poster(d, -2.4, 2.3, 2.0, 0.4, 'BESPOKE · ALTERATIONS', '#7c2d12');
  pendants(
    d,
    [
      [-4, -1.5],
      [-1.8, -1.5],
    ],
    'cone',
    '#334155',
  );
}

function printShop(_c: DressCtx, d: Dresser) {
  till(d, 2.67, -1.2, 2.4, { body: '#1f2937', top: '#e5e7eb' });
  // Big printers along the back, a copier, paper reams, rolls and samples on the wall.
  for (const [x, w] of [
    [-4.6, 2.2],
    [-2.1, 2.2],
  ] as const) {
    d.box(w, 0.95, 0.75, '#e5e7eb', x, 0.2, BACK + 0.42, { round: 0.03 });
    d.box(w, 0.2, 0.05, '#1f2937', x, 0.85, BACK + 0.8);
    for (const s of [-1, 1])
      d.box(0.08, 0.2, 0.6, '#475569', x + s * (w / 2 - 0.1), 0, BACK + 0.42);
    d.box(w - 0.3, 0.005, 0.5, d.pick(['#fde68a', '#bfdbfe', '#fecaca']), x, 0.7, BACK + 1.0, {
      rx: 0.4,
    });
  }
  d.claim({ x0: -5.8, z0: BACK, x1: -0.9, z1: BACK + 1.1 });
  if (d.fits(0.2, -2.6, 0.7, 0.6)) printer(d, 0.2, -2.6, 0);
  for (let i = 0; i < 4; i++)
    if (d.fits(-5.3 + i * 0.45, 0.6, 0.4, 0.3))
      for (let k = 0; k < 6; k++)
        d.bit(0.3, 0.06, 0.22, k % 2 ? '#f8fafc' : '#e2e8f0', -5.3 + i * 0.45, k * 0.06, 0.6, {
          plain: true,
        });
  for (let i = 0; i < 3; i++) {
    poster(
      d,
      4.0 + i * 0.7,
      1.3,
      0.55,
      0.75,
      ['FLYERS', 'BANNERS', 'CARDS'][i]!,
      ['#dc2626', '#2563eb', '#16a34a'][i]!,
    );
  }
  if (d.fits(-2.6, -0.9, 1.8, 0.8)) {
    d.box(1.6, 0.05, 0.7, '#e5e7eb', -2.6, 0.85, -0.9);
    for (const s of [-1, 1]) d.box(0.06, 0.85, 0.6, '#64748b', -2.6 + s * 0.75, 0, -0.9);
    d.box(0.8, 0.12, 0.4, '#9ca3af', -2.9, 0.9, -0.9);
    d.bit(0.4, 0.04, 0.3, '#fde68a', -2.2, 0.9, -0.9, { plain: true });
  }
  poster(d, -3.3, 2.3, 2.4, 0.4, 'PRINT · COPY · BIND', '#111827');
  // A rack of samples and a wide-format roll by the counter.
  if (d.fits(4.6, 1.0, 1.4, 0.5)) magazineRack(d, 4.6, 1.0, Math.PI, 1.2, 3, '#1f2937');
  if (d.fits(0.4, -1.0, 1.8, 0.5)) {
    d.can(0.08, 1.6, '#f8fafc', -0.4, 0.75, -1.0, { rz: Math.PI / 2 });
    for (const s of [-0.5, 1.2]) d.box(0.06, 0.8, 0.4, '#475569', s, 0, -1.0);
  }
}

function phone(_c: DressCtx, d: Dresser) {
  // A glass counter of phones, a wall of cases and chargers, the repair bench.
  counter(d, 2.67, -0.58, 0, 2.4, { glass: true, body: '#1f2937', till: false });
  for (let i = 0; i < 9; i++)
    d.bit(
      0.08,
      0.008,
      0.16,
      d.pick(['#111827', '#e5e7eb', '#1e3a8a', '#a16207']),
      1.7 + i * 0.22,
      0.56,
      -0.55,
      { plain: true },
    );
  d.claim(Dresser.rect(2.67, -0.9, 2.6, 1.4));
  shelving(
    d,
    -3.4,
    BACK + 0.2,
    0,
    4.4,
    2.2,
    0.3,
    7,
    { frame: '#94a3b8', back: '#e0e7ff' },
    packs(
      d,
      -3.4,
      BACK + 0.2,
      0,
      ['#111827', '#f8fafc', '#2563eb', '#db2777', '#16a34a', '#f59e0b'],
      { tall: [0.12, 0.2], wide: [0.08, 0.1] },
    ),
  );
  d.claim({ x0: -5.7, z0: BACK, x1: -1.1, z1: BACK + 0.4 });
  if (d.fits(4.7, BACK + 0.45, 2.0, 0.8)) {
    d.box(1.8, 0.04, 0.7, '#e5e7eb', 4.7, 0.85, BACK + 0.45);
    for (const s of [-1, 1]) d.box(0.05, 0.85, 0.6, '#475569', 4.7 + s * 0.85, 0, BACK + 0.45);
    d.box(0.25, 0.1, 0.18, '#475569', 4.3, 0.89, BACK + 0.45);
    d.cyl(0.01, 0.01, 0.45, '#111827', 5.1, 0.89, BACK + 0.3);
    d.cyl(0.08, 0.1, 0.08, '#111827', 5.0, 1.32, BACK + 0.45, {
      rx: 0.8,
      emissive: '#fef3c7',
      emissiveIntensity: 0.6,
    });
    for (let i = 0; i < 3; i++)
      d.bit(0.08, 0.008, 0.16, '#111827', 4.5 + i * 0.15, 0.89, BACK + 0.6, { plain: true });
    sideChair(d, 4.7, BACK + 1.05, Math.PI, 'plastic');
  }
  wallTv(d, 0.2, 1.3, 1.2);
  poster(d, -3.4, 2.4, 2.6, 0.4, 'SCREENS FIXED WHILE YOU WAIT', '#4338ca');
  // A stand of accessories in the middle and a bench to wait on.
  if (d.fits(-2.4, -1.0, 2.6, 1.0))
    gondola(d, -2.4, -1.0, 0, 2.0, ['#111827', '#f8fafc', '#2563eb', '#db2777', '#16a34a'], {
      h: 1.3,
    });
  if (d.fits(4.4, 1.2, 1.7, 0.6)) beamSeats(d, 4.4, 1.2, Math.PI, 3, '#4338ca');
}

function money(_c: DressCtx, d: Dresser) {
  // A kiosk counter in the brand's yellow, a safe, a bench to wait on, posters.
  till(d, 2.67, -1.2, 2.2, { body: '#facc15', top: '#1f2937', front: 'POS · TRANSFER' });
  d.box(0.6, 0.8, 0.55, '#3f3f46', 4.3, 0, -2.4, { ...{ metal: 0.5, rough: 0.4 } });
  d.cyl(0.08, 0.08, 0.04, '#d4d4d8', 4.3, 0.45, -2.11, { rx: Math.PI / 2 });
  for (const [x, text, col] of [
    [-4.6, 'AIRTIME', '#16a34a'],
    [-3.0, 'BILLS', '#1d4ed8'],
    [-1.4, 'CASH OUT', '#dc2626'],
    [0.2, 'TRANSFERS', '#ca8a04'],
  ] as const)
    poster(d, x, 1.1, 1.3, 0.9, text, col);
  for (const [x, z] of [
    [-4.0, -1.8],
    [-1.6, -1.8],
  ] as const)
    if (d.fits(x, z, 1.8, 0.6)) {
      d.box(1.6, 0.06, 0.4, '#7c5a3c', x, 0.42, z);
      for (const s of [-1, 1]) d.box(0.06, 0.42, 0.35, '#3f3f46', x + s * 0.7, 0, z);
    }
  // A big umbrella's colours over the till and a phone-charging stand.
  for (let i = 0; i < 6; i++)
    d.box(
      2.6 / 6,
      0.02,
      1.0,
      i % 2 ? '#facc15' : '#16a34a',
      1.37 + (2.6 / 6) * (i + 0.5),
      2.4,
      -1.2,
      { rx: -0.15 },
    );
  if (d.fits(-4.8, 0.8, 0.6, 0.5)) {
    d.box(0.5, 1.2, 0.4, '#1f2937', -4.8, 0, 0.8);
    for (let i = 0; i < 6; i++)
      d.bit(
        0.07,
        0.13,
        0.01,
        '#111827',
        -4.95 + (i % 3) * 0.15,
        0.85 + Math.floor(i / 3) * 0.18,
        1.01,
        { plain: true },
      );
  }
  plantsAlong(d, [5.5], 0.6, [2]);
  if (d.fits(3.3, 1.2, 1.7, 0.6)) beamSeats(d, 3.3, 1.2, Math.PI, 3, '#16a34a');
  if (d.fits(-2.6, 0.4, 0.4, 0.4)) {
    d.box(0.32, 0.95, 0.32, '#e5e7eb', -2.6, 0, 0.4, { round: 0.02 });
    d.can(0.14, 0.42, '#7dd3fc', -2.6, 0.95, 0.4);
  }
}

function marina(c: DressCtx, d: Dresser) {
  till(d, 2.67, -1.2, 2.4, { body: '#1e3a8a', top: '#f1f5f9' });
  windows(d, -5.6, 0.8, { night: c.night, view: 'trees', sill: 0.7 });
  d.claim({ x0: -5.8, z0: BACK, x1: 1.0, z1: BACK + 0.3 });
  // Ropes coiled, life rings, buoys, oars, a model yacht.
  for (let i = 0; i < 4; i++)
    if (d.fits(-5.0 + i * 0.7, -2.4, 0.6, 0.6))
      for (let k = 0; k < 4; k++)
        d.kit.torus(
          0.22 - k * 0.03,
          0.03,
          d.pick(['#f5f5f4', '#1d4ed8', '#ca8a04']),
          -5.0 + i * 0.7,
          0.03 + k * 0.05,
          -2.4,
          { rx: Math.PI / 2 },
        );
  for (const x of [1.6, 3.0, 4.4]) d.kit.torus(0.3, 0.07, '#ea580c', x, 1.9, BACK + 0.08, {});
  for (let i = 0; i < 5; i++)
    d.ball(
      0.18,
      d.pick(['#ea580c', '#f8fafc', '#facc15']),
      5.2 + (i % 2) * 0.3,
      0.18 + Math.floor(i / 2) * 0.3,
      -1.6 + (i % 3) * 0.2,
    );
  if (d.fits(-2.4, -0.9, 1.4, 0.7)) {
    d.box(1.2, 0.8, 0.6, '#f1f5f9', -2.4, 0, -0.9);
    d.box(0.8, 0.12, 0.22, '#f8fafc', -2.4, 0.86, -0.9, { round: 0.05 });
    d.cyl(0.01, 0.01, 0.8, '#94a3b8', -2.4, 0.95, -0.9);
    d.box(0.02, 0.6, 0.45, '#f8fafc', -2.33, 1.05, -0.9, { ry: Math.PI / 2 });
  }
  for (let i = 0; i < 3; i++)
    d.box(0.06, 2.0, 0.12, '#a16207', 5.5 + i * 0.12, 0, BACK + 0.1, { rz: 0.08 });
  poster(d, 3.2, 2.35, 2.0, 0.35, 'CHANDLERY', '#1e3a8a');
  // Life jackets on a rail and a dinghy on trestles.
  if (d.fits(-4.6, 1.0, 1.6, 0.6))
    clothesRail(d, -4.6, 1.0, 0, 1.4, ['#ea580c', '#f97316', '#facc15']);
  if (d.fits(4.4, 1.0, 2.2, 1.0)) {
    for (const s of [-0.7, 0.7]) d.box(0.08, 0.5, 0.8, '#7c5a3c', 4.4 + s, 0, 1.0);
    d.kit.sphere(0.5, '#f8fafc', 4.4, 0.75, 1.0, { sx: 2.2, sy: 0.45 });
    d.box(1.9, 0.05, 0.12, '#1e3a8a', 4.4, 0.9, 1.0);
  }
}

function ballroom(_c: DressCtx, d: Dresser) {
  chandelier(d, -2.5, -0.5, 1.2);
  chandelier(d, 2.0, -0.5, 1.2);
  // Round tables in white with gold chairs, a dance floor, a reception desk.
  for (const [x, z] of [
    [-4.2, -1.8],
    [-1.4, -2.2],
    [-4.0, 0.6],
    [1.4, -2.4],
  ] as const) {
    if (!d.fits(x, z, 1.9, 1.9)) continue;
    d.cyl(0.65, 0.68, 0.74, '#f8fafc', x, 0, z, { seg: 20 });
    d.cyl(0.08, 0.05, 0.3, '#d4af37', x, 0.74, z, { metal: 0.7, rough: 0.3 });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const cx = x + Math.sin(a) * 0.95;
      const cz = z + Math.cos(a) * 0.95;
      if (d.free(Dresser.rect(cx, cz, 0.45, 0.45), { margin: 0.15, furniture: false }))
        sideChair(d, cx, cz, a + Math.PI, 'fancy', '#d4af37');
    }
  }
  d.kit.add(new THREE.PlaneGeometry(3.4, 2.2), posterMat(' ', '#1f1f1f'), 0.9, 0.006, 1.0, {
    rx: -Math.PI / 2,
    noShadow: true,
  });
  till(d, 2.67, -1.2, 2.0, { body: '#f8fafc', top: '#d4af37', till: false });
  d.box(4.0, 2.2, 0.02, '#e7d8b8', -3.0, 0.4, BACK + 0.015);
  plantsAlong(d, [5.6, -5.6], 2.6, [3, 3]);
}

function electronics(_c: DressCtx, d: Dresser) {
  // A wall of TVs, laptops on a table, phones under glass, white goods.
  for (let i = 0; i < 4; i++) wallTv(d, -4.6 + i * 1.5, 1.25, 1.3 - (i % 2) * 0.2);
  d.box(6.2, 0.6, 0.45, '#1f2937', -2.4, 0, BACK + 0.25);
  for (let i = 0; i < 4; i++)
    d.bit(0.4, 0.08, 0.3, '#111827', -4.6 + i * 1.5, 0.6, BACK + 0.25, { plain: true });
  d.claim({ x0: -5.6, z0: BACK, x1: 0.8, z1: BACK + 0.5 });
  till(d, 3.67, -1.2, 2.0, { body: '#0f172a', top: '#e5e7eb' });
  if (d.fits(-2.8, -1.4, 2.6, 0.9)) {
    d.box(2.4, 0.85, 0.8, '#f8fafc', -2.8, 0, -1.4);
    for (let i = 0; i < 4; i++) {
      const x = -3.7 + i * 0.6;
      d.box(0.34, 0.015, 0.24, '#9aa1a9', x, 0.85, -1.35, { metal: 0.6, rough: 0.35 });
      d.box(0.34, 0.22, 0.012, '#9aa1a9', x, 0.86, -1.47, { rx: -0.25, metal: 0.6, rough: 0.35 });
      d.screenAt(0.3, 0.18, x, 0.97, -1.455);
    }
  }
  for (const [x, z] of [
    [5.3, -0.4],
    [5.3, 0.4],
  ] as const)
    if (d.fits(x, z, 0.7, 0.7)) washer(d, x, z, -Math.PI / 2);
  if (d.fits(5.3, -1.3, 0.7, 0.7))
    d.glb('Kitchen_Fridge', 5.3, -1.3, { w: 0.68, d: 0.68, h: 1.85, ry: -Math.PI / 2 });
  poster(d, -2.4, 2.35, 3.0, 0.4, 'TVs · LAPTOPS · PHONES', '#1d4ed8');
}

function campus(c: DressCtx, d: Dresser) {
  windows(d, -5.6, 1.0, { night: c.night });
  d.claim({ x0: -5.8, z0: BACK, x1: 1.2, z1: BACK + 0.3 });
  till(d, 2.67, -1.2, 2.2, {
    body: tone(c.tint, -0.1),
    top: '#f1f1ef',
    till: false,
    front: 'RECEPTION',
  });
  for (const z of [-2.2, -0.9])
    for (const x of [-4.6, -3.2, -1.8, -0.4]) {
      const r = Dresser.rect(x, z + 0.25, 1.35, 1.3);
      if (!d.free(r)) continue;
      d.claim(r);
      desk(d, x, z, 0, { style: 'white', screens: 2 });
    }
  poster(d, 4.5, 1.6, 1.6, 0.4, 'CAMPUS', c.tint);
}

const FAMILY_FURNITURE = (_c: DressCtx, d: Dresser) => {
  // The furniture showroom: room sets with price tags.
  rug(d, -1.0, 1.0, 3.0, 2.0, '#b45309');
  sofa(d, -1.0, 1.9, Math.PI, 2.0, d.pick(['#8a6e57', '#6f7a86', '#a3a3a3']), 'sofa');
  // Price tags.
  for (const [x, z] of [
    [-4.6, -0.5],
    [2.0, -2.6],
    [4.8, 0.2],
  ] as const)
    d.box(0.18, 0.12, 0.01, '#facc15', x, 0.9, z);
  plantsAlong(d, [5.6, -5.6], 2.6, [3, 3]);
  pendants(
    d,
    [
      [-3.5, -1.5],
      [0, -1.5],
      [3.5, -1.5],
    ],
    'globe',
  );
  poster(d, 3.5, 2.35, 2.0, 0.35, 'SALE −20%', '#dc2626');
};

export const shops: Family = {
  look: (c) => {
    if (c.kind !== 'shop') return null;
    return LOOKS[shopOf(c.variant)];
  },
  dress: (c, d) => {
    if (c.kind === 'appliance') return electronics(c, d);
    if (c.kind === 'furniture') return FAMILY_FURNITURE(c, d);
    const t = shopOf(c.variant);
    switch (t) {
      case 'news':
        return news(c, d);
      case 'stall':
      case 'souk':
        return stall(c, d, t);
      case 'fabric':
        return fabric(c, d);
      case 'boutique':
        return boutique(c, d);
      case 'bike':
        return bikeShop(c, d);
      case 'laundry':
        return laundry(c, d);
      case 'tailor':
        return tailor(c, d);
      case 'print':
        return printShop(c, d);
      case 'phone':
        return phone(c, d);
      case 'money':
        return money(c, d);
      case 'marina':
        return marina(c, d);
      case 'ballroom':
        return ballroom(c, d);
      case 'campus':
        return campus(c, d);
      default:
        return general(c, d, t);
    }
  },
};

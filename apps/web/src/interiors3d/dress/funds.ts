/**
 * Money rooms with a door you knock on: a fund (reception, a glass boardroom,
 * the art, a lounge, the table you pitch at), the stock exchange (the ticker
 * wall and trading desks), a family office (panelled, books, a chandelier),
 * an accelerator (the demo screen, workshop tables, beanbags, banners) and a
 * development partner or investment agency (flags, the city's model, maps).
 */
import * as THREE from 'three';
import { BACK, RW } from '../roomGeom';
import { tone } from '../kit';
import { Dresser, jitter } from './core';
import {
  armchair,
  art,
  banner,
  beanbag,
  boardTable,
  bookcase,
  chairRows,
  chandelier,
  coffeeTable,
  desk,
  flag,
  floorLamp,
  glassWall,
  lectern,
  magazineRack,
  plantsAlong,
  poster,
  reception,
  rug,
  sideChair,
  sofa,
  stickyWall,
  wainscot,
  wallTv,
  windows,
} from './props';
import { deskFacing } from './offices';
import type { DressCtx, Family, Look, SeatCall } from './types';

type Fund = 'fund' | 'exchange' | 'family' | 'bank-inv' | 'accel' | 'dev' | 'ipa';

function fundOf(c: DressCtx): Fund {
  const v = c.variant;
  if (c.kind === 'accelerator') return 'accel';
  if (c.kind === 'devpartner') return v === 'ipa' ? 'ipa' : 'dev';
  if (v === 'stock-exchange') return 'exchange';
  if (v === 'family-office') return 'family';
  if (v === 'employer-investment') return 'bank-inv';
  return 'fund';
}

const WALLS = ['#3f4a3c', '#27364a', '#4a3f3a', '#e7e1d7', '#2f3b3a'];

function look(c: DressCtx, d: Dresser): Look {
  const t = fundOf(c);
  if (t === 'accel') return { floor: 'concrete', wall: '#f1f5f9' };
  if (t === 'dev' || t === 'ipa')
    return { floor: d.tier === 3 ? 'marble' : 'carpet', floorTint: '#5b6b7f', wall: '#e5e9ee' };
  if (t === 'exchange') return { floor: 'marble', wall: '#1f2a3a' };
  if (t === 'family') return { floor: 'parquet-dark', wall: '#e9dfcc' };
  const wall = d.pick(WALLS);
  return {
    floor: d.tier === 1 ? 'carpet' : d.tier === 2 ? 'parquet-dark' : 'marble',
    floorTint: '#4b5563',
    wall,
  };
}

/** A glass boardroom in a back corner. */
function boardroom(
  d: Dresser,
  x0: number,
  x1: number,
  zf: number,
  chairs: 'office' | 'fancy',
  top: string,
  frame = '#2b2f36',
) {
  const lo = Math.min(x0, x1);
  const hi = Math.max(x0, x1);
  const inner = Math.abs(lo) < Math.abs(hi) ? lo : hi;
  let gap: [number, number] = inner === lo ? [0.25, 1.15] : [hi - lo - 1.15, hi - lo - 0.25];
  for (const [px, pz] of d.people)
    if (px > lo && px < hi && Math.abs(pz - zf) < 0.4) gap = [px - lo - 0.5, px - lo + 0.5];
  glassWall(d, lo, zf, hi, zf, { gap, frame });
  glassWall(d, inner, BACK, inner, zf, { frame });
  const cx = (lo + hi) / 2;
  const cz = (BACK + zf) / 2 + 0.05;
  boardTable(d, cx, cz, Math.min(2.8, hi - lo - 1.3), 1.0, {
    top,
    chairs,
    ends: true,
    skip: (x, z) => !d.free(Dresser.rect(x, z, 0.5, 0.5), { margin: 0.15, furniture: false }),
  });
  wallTv(d, cx, 1.25, 1.4);
  d.claim({ x0: lo, z0: BACK, x1: hi, z1: zf + 0.1 });
}

function fund(c: DressCtx, d: Dresser, t: Fund) {
  const L = d.flip ? 1 : -1;
  const wood = t === 'family' ? '#5a3b26' : '#3b2a20';
  if (t === 'family') wainscot(d, 1.1, '#6b4a33');
  // The boardroom in one back corner.
  boardroom(
    d,
    L < 0 ? -RW / 2 + 0.05 : 1.7,
    L < 0 ? -1.7 : RW / 2 - 0.05,
    -1.15,
    t === 'bank-inv' ? 'office' : 'fancy',
    wood,
    t === 'family' ? '#3b2a20' : '#2b2f36',
  );
  // Reception in the other.
  const rx = L < 0 ? 3.7 : -3.7;
  if (t !== 'family') {
    reception(d, rx, -2.35, 2.4, {
      body: d.tier === 3 ? '#e7e1d7' : '#f1f1ef',
      top: wood,
      logo: c.sign,
      logoColour: tone(c.tint, -0.15),
    });
    officeChair(d, rx, -2.95);
    d.claim(Dresser.rect(rx, -2.6, 2.6, 1.4));
  }
  // The art wall between (and the exchange's ticker).
  if (t === 'exchange') {
    for (let i = 0; i < 3; i++) wallTv(d, -1.9 + i * 1.95, 1.05, 1.85);
    d.box(6.2, 0.22, 0.04, '#0b0f17', 0, 0.75, BACK + 0.03, {
      emissive: '#22c55e',
      emissiveIntensity: 0.15,
    });
    poster(
      d,
      0,
      0.77,
      5.8,
      0.18,
      'NGX ▲ 2.4%  DANGCEM ▲ 1.2%  MTNN ▼ 0.4%  GTCO ▲ 3.1%  ZENITH ▲ 0.8%',
      '#0b0f17',
      '#4ade80',
    );
  } else {
    const ax = L < 0 ? 0.3 : -0.3;
    art(
      d,
      ax - 0.75,
      1.15,
      1.1,
      0.8,
      Math.floor(d.rng() * 40),
      t === 'family' ? '#b08d57' : '#1f1f1f',
    );
    art(
      d,
      ax + 0.75,
      1.15,
      0.7,
      0.8,
      Math.floor(d.rng() * 40),
      t === 'family' ? '#b08d57' : '#1f1f1f',
    );
    // A low console with a sculpture.
    d.box(1.8, 0.75, 0.4, wood, ax, 0, BACK + 0.22, { round: 0.01 });
    d.kit.sphere(0.14, '#d4af37', ax - 0.4, 0.92, BACK + 0.22, { metal: 0.8, rough: 0.3 });
    d.cyl(0.05, 0.08, 0.3, '#1f2937', ax + 0.4, 0.75, BACK + 0.22);
    d.claim({ x0: ax - 1.0, z0: BACK, x1: ax + 1.0, z1: BACK + 0.5 });
  }
  if (t === 'family') {
    bookcase(d, rx - 1.0, BACK + 0.2, 0, 1.1, 2.2, '#4a3426');
    bookcase(d, rx + 0.15, BACK + 0.2, 0, 1.1, 2.2, '#4a3426');
    d.claim({ x0: rx - 1.6, z0: BACK, x1: rx + 0.75, z1: BACK + 0.5 });
    chandelier(d, -0.1, 0.8, 1.1);
  }
  if (t === 'bank-inv' || t === 'exchange') {
    for (const z of [-0.65, 1.15])
      for (const x of [-4.7, -3.3, 2.1, 3.5, 4.9]) {
        const r = Dresser.rect(x, z + 0.25, 1.35, 1.3);
        if (!d.free(r)) continue;
        d.claim(r);
        desk(d, x, z, 0, { style: 'white', screens: 2 });
      }
  }
  // The lounge round the one who's relaxing (or the front corner).
  const lx = L < 0 ? -4.4 : 4.4;
  rug(
    d,
    -3.6,
    1.6,
    3.0,
    2.0,
    t === 'family' ? '#7f1d1d' : d.pick(['#57534e', '#1e3a8a', '#7c2d12']),
  );
  if (d.fits(-4.6, 2.75, 2.0, 0.8))
    sofa(d, -4.6, 2.75, Math.PI, 1.9, d.pick(['#6f7a86', '#8a6e57', '#2b2b30']), 'sofa');
  plantsAlong(d, [lx < 0 ? -5.6 : 5.6, 5.6, -5.6], 0.2, [3, 3, 2]);
  if (d.fits(5.5, 2.6, 0.5, 0.5)) floorLamp(d, 5.5, 2.6);
  if (t === 'fund' && d.fits(d.mx(5.4), -0.6, 0.9, 0.5))
    magazineRack(d, d.mx(5.4), -0.6, (-Math.PI / 2) * L * -1, 0.8, 3);
}

function accel(c: DressCtx, d: Dresser) {
  const px = -2.33;
  // The demo screen behind the presenter, a lectern and a low riser.
  wallTv(d, px, 0.95, 2.4);
  if (d.fits(px - 1.35, -2.2, 0.6, 0.5, 0, { stations: false }))
    lectern(d, px - 1.35, -2.2, 0, c.tint);
  d.claim({ x0: px - 1.7, z0: BACK, x1: px + 1.3, z1: -1.2 });
  chairRows(d, px + 0.2, -0.55, 2, 5, { kind: 'plastic', colour: c.tint, gap: 0.62, rowGap: 0.75 });
  // The demo-day banners and a sticky wall.
  banner(d, -5.4, -2.6, 'DEMO DAY', c.tint, { h: 1.9, w: 0.75 });
  banner(d, 0.2, -2.9, (c.sign ?? 'COHORT').split(' ').slice(0, 2).join(' '), tone(c.tint, -0.15), {
    h: 1.9,
    w: 0.75,
  });
  stickyWall(d, 2.6, 2.4, 1.3);
  windows(d, 4.0, 5.9, { night: c.night });
  d.claim({ x0: 1.2, z0: BACK, x1: 5.9, z1: BACK + 0.4 });
  for (const [x, z, col] of [
    [5.3, -1.5, '#f97316'],
    [4.6, -2.3, '#22c55e'],
    [5.5, 0.3, c.tint],
  ] as const)
    if (d.fits(x, z, 0.8, 0.8)) beanbag(d, x, z, col);
  plantsAlong(d, [-5.6, 5.6], 2.6, [3, 2]);
}

function dev(c: DressCtx, d: Dresser, t: Fund) {
  const L = d.flip ? 1 : -1;
  // A row of flags and the logo; reception on one side.
  const fx = L < 0 ? -4.8 : 3.2;
  const palettes = [
    ['#15803d', '#ffffff', '#15803d'],
    ['#1d4ed8', '#ffffff', '#dc2626'],
    ['#facc15', '#16a34a', '#dc2626'],
    [c.tint, '#ffffff', c.tint],
  ];
  for (let i = 0; i < 4; i++) flag(d, fx + i * 0.55, BACK + 0.35, palettes[i]!);
  d.claim({ x0: fx - 0.3, z0: BACK, x1: fx + 2.1, z1: BACK + 0.7 });
  const rx = L < 0 ? 3.9 : -3.9;
  reception(d, rx, -2.35, 2.3, {
    body: '#f1f1ef',
    top: '#334155',
    logo: c.sign,
    logoColour: tone(c.tint, -0.15),
  });
  d.claim(Dresser.rect(rx, -2.6, 2.5, 1.4));
  // The map, or the city's model under glass.
  poster(
    d,
    L < 0 ? -0.6 : 0.6,
    1.0,
    2.2,
    1.2,
    t === 'ipa' ? 'INVEST HERE' : 'OUR PROJECTS',
    '#0c4a6e',
  );
  const mx = L < 0 ? 1.6 : -1.6;
  if (d.fits(mx, -2.3, 1.8, 1.2)) {
    d.box(1.6, 0.85, 1.0, '#f1f1ef', mx, 0, -2.3);
    d.box(1.5, 0.02, 0.9, '#86efac', mx, 0.85, -2.3);
    for (let i = 0; i < 18; i++) {
      const h = 0.05 + d.rng() * (i % 5 === 0 ? 0.35 : 0.15);
      d.bit(
        0.1 + d.rng() * 0.08,
        h,
        0.1 + d.rng() * 0.08,
        jitter(d, '#e5e7eb', 0.06),
        mx - 0.6 + (i % 6) * 0.24,
        0.87,
        -2.6 + Math.floor(i / 6) * 0.3,
        { plain: true },
      );
    }
    d.kit.add(new THREE.BoxGeometry(1.52, 0.45, 0.92), d.glass, mx, 0.87, -2.3, { noShadow: true });
  }
  if (d.fits(L < 0 ? 5.4 : -5.4, -0.6, 0.9, 0.5))
    magazineRack(
      d,
      L < 0 ? 5.4 : -5.4,
      -0.6,
      L < 0 ? -Math.PI / 2 : Math.PI / 2,
      0.8,
      3,
      '#334155',
    );
  for (const [x, z] of [
    [-4.6, 2.6],
    [4.9, 2.6],
  ] as const)
    if (d.fits(d.mx(x), z, 1.9, 0.9)) sofa(d, d.mx(x), z, Math.PI, 1.8, '#475569', 'couch');
  plantsAlong(d, [-5.6, 5.6], 0.6, [3, 3]);
}

function officeChair(d: Dresser, x: number, z: number) {
  sideChair(d, x, z, 0, 'chair', '#1f2937');
}

export const funds: Family = {
  look,
  seat: (c, d, s: SeatCall) => {
    const t = fundOf(c);
    if (s.pair) {
      // The table you pitch at: a rectangle with the two at its ends (and chairs along it).
      const w = Math.max(0.9, s.bx - s.ax - 0.75);
      const mx = (s.ax + s.bx) / 2;
      const top = t === 'accel' ? '#f1f1ef' : t === 'family' ? '#5a3b26' : '#3b2a20';
      d.box(w, 0.05, 0.95, top, mx, 0.7, s.z, { round: 0.02, rough: 0.3 });
      for (const sx of [-1, 1]) d.box(0.08, 0.7, 0.6, '#27272a', mx + sx * (w / 2 - 0.2), 0, s.z);
      const kind = t === 'accel' ? 'plastic' : 'fancy';
      sideChair(d, s.ax, s.z, Math.PI / 2, kind, t === 'accel' ? c.tint : undefined);
      sideChair(d, s.bx, s.z, -Math.PI / 2, kind, t === 'accel' ? c.tint : undefined);
      if (t === 'accel') {
        for (const sx of [-0.25, 0.25]) {
          d.box(0.32, 0.015, 0.22, '#9aa1a9', mx + sx, 0.75, s.z + (sx > 0 ? 0.15 : -0.15), {
            ry: sx > 0 ? -Math.PI / 2 : Math.PI / 2,
          });
        }
      } else {
        d.bit(0.22, 0.01, 0.3, '#f8fafc', mx - 0.2, 0.75, s.z, { plain: true, ry: 0.2 });
        d.bit(0.22, 0.01, 0.3, '#f8fafc', mx + 0.2, 0.75, s.z, { plain: true, ry: -0.3 });
        d.can(0.04, 0.12, '#dbeafe', mx, 0.75, s.z - 0.25);
      }
      d.claim(Dresser.rect(mx, s.z, s.bx - s.ax + 0.6, 1.2));
      return true;
    }
    if (t === 'accel' || t === 'exchange' || t === 'bank-inv') {
      deskFacing(d, s.x, s.z, s.dir > 0 ? Math.PI / 2 : -Math.PI / 2, {
        style: 'white',
        screens: t === 'accel' ? 'laptop' : 2,
      });
      return true;
    }
    // A lounge chair, with a low table beside.
    const ry = s.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    armchair(
      d,
      s.x,
      s.z,
      ry,
      t === 'family' ? '#7c2d12' : d.pick(['#8a6e57', '#c58b3d', '#5b6b7a']),
    );
    if (d.fits(s.x, s.z - 0.85, 0.6, 0.6)) coffeeTable(d, s.x, s.z - 0.85, 0.55, 0.55);
    d.claim(Dresser.rect(s.x, s.z, 1.0, 1.0));
    return true;
  },
  dress: (c, d) => {
    const t = fundOf(c);
    if (t === 'accel') accel(c, d);
    else if (t === 'dev' || t === 'ipa') dev(c, d, t);
    else fund(c, d, t);
  },
};

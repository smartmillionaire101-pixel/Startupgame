/**
 * Halls and hotels: the event hall (a stage with a lectern, the screen, a
 * lighting truss, speakers, rows of chairs, banners, cocktail tables and a
 * registration desk; the chamber's panelled version), a hotel's lobby (the
 * front desk, lifts, a chandelier, sofas, a luggage trolley), the members'
 * club (books, a fireplace, leather) and the bars of hotels, guesthouses,
 * event venues and co-living houses.
 */
import * as THREE from 'three';
import { BACK } from '../roomGeom';
import { mat, tone } from '../kit';
import { Dresser } from './core';
import {
  armchair,
  art,
  banner,
  bookcase,
  ceilingFan,
  chairRows,
  chandelier,
  clock,
  coffeeTable,
  column,
  flag,
  floorLamp,
  lectern,
  packs,
  pendants,
  plantsAlong,
  reception,
  rug,
  shelving,
  sideChair,
  sofa,
  speaker,
  stagePlatform,
  truss,
  wainscot,
  wallTv,
  windows,
} from './props';
import type { DressCtx, Family, Look, SeatCall } from './types';

type Hall =
  'event' | 'chamber' | 'lobby' | 'club' | 'hotelbar' | 'guesthouse' | 'venue' | 'coliving';

function hallOf(c: DressCtx): Hall {
  const v = c.variant;
  if (c.kind === 'eventhall') return v === 'chamber' ? 'chamber' : 'event';
  if (c.kind === 'lounge') return v === 'members-club' ? 'club' : 'lobby';
  if (/guesthouse/.test(v)) return 'guesthouse';
  if (/event-venue/.test(v)) return 'venue';
  if (/co-living/.test(v)) return 'coliving';
  return 'hotelbar';
}

const STAGE_H = 0.45;

function look(c: DressCtx, d: Dresser): Look {
  const t = hallOf(c);
  switch (t) {
    case 'event':
      return {
        floor: 'carpet',
        floorTint: d.pick(['#3b3f63', '#4a2c3a', '#2f4858']),
        wall: d.pick(['#23263a', '#2b2235', '#1f2f3a']),
      };
    case 'chamber':
      return { floor: 'carpet', floorTint: '#5b2a2a', wall: '#e9dfc8' };
    case 'lobby':
      return d.tier === 1
        ? { floor: 'tile', wall: '#e9dcc7' }
        : { floor: 'marble', wall: d.tier === 3 ? '#d9cbb2' : '#e9e2d6' };
    case 'club':
      return { floor: 'parquet-dark', wall: '#2e3b2f' };
    case 'guesthouse':
      return { floor: 'tile', wall: '#f3e3c3' };
    case 'venue':
      return { floor: 'parquet', wall: '#e7e1f0' };
    case 'coliving':
      return { floor: 'oak', wall: '#f1ede6' };
    default:
      return { floor: 'parquet-dark', wall: '#5a3e2b' };
  }
}

/** Where the venue's name goes (the screen takes the middle of the hall's back wall). */
function signAt(c: DressCtx): { x: number; y: number } | null {
  const t = hallOf(c);
  if (t === 'event' || t === 'chamber') return { x: 1.7, y: 2.5 };
  if (t === 'lobby') return { x: -2.9, y: 2.45 };
  return null;
}

function eventHall(c: DressCtx, d: Dresser, chamber: boolean) {
  if (chamber) wainscot(d, 1.2, '#6b4a33');
  // The stage, the screen over it, the lectern, the truss and speakers.
  stagePlatform(
    d,
    0,
    BACK + 0.9,
    6.4,
    1.8,
    STAGE_H,
    chamber ? '#4a3426' : '#15171f',
    chamber ? '#6b4a33' : '#2a2a30',
  );
  if (chamber) {
    d.cyl(0.5, 0.5, 0.05, '#d4af37', -1.6, 1.6, BACK + 0.03, {
      rx: Math.PI / 2,
      metal: 0.7,
      rough: 0.3,
    });
    d.cyl(0.38, 0.38, 0.06, tone(c.tint, -0.1), -1.6, 1.6, BACK + 0.04, { rx: Math.PI / 2 });
    for (const x of [-2.4, 2.4]) flag(d, x, BACK + 0.4, [c.tint, '#ffffff', c.tint]);
    // (Flags stand on the stage.)
  } else {
    d.box(3.2, 1.6, 0.05, '#0b0d12', -1.6, 0.5, BACK + 0.03);
    d.screenAt(3.0, 1.45, -1.6, 0.6 + 0.725, BACK + 0.06);
    truss(d, 0, -1.55, 6.8, 2.85, 6);
  }
  lectern(d, 2.0, BACK + 0.85, STAGE_H, c.tint);
  for (const x of [-3.7, 3.7]) speaker(d, x, -1.7, x < 0 ? 0.25 : -0.25);
  // Rows of chairs facing the stage, where people aren't standing.
  chairRows(d, 0, -0.95, 2, 12, {
    kind: chamber ? 'fancy' : 'plastic',
    colour: chamber ? '#7f1d1d' : undefined,
    gap: 0.58,
    aisle: 1.0,
    rowGap: 0.72,
  });
  // Banners: pull-ups by the stage, and hung down the side walls.
  const label = (c.sign ?? 'EVENT').split(' ').slice(0, 3).join(' ');
  banner(d, -5.3, -2.7, label, c.tint, { h: 2.0, w: 0.8 });
  banner(d, 5.3, -2.7, 'WELCOME', tone(c.tint, -0.15), { h: 2.0, w: 0.8 });
  if (!chamber) {
    for (const x of [-4.4, 4.4])
      banner(d, x, BACK + 0.06, label, tone(c.tint, 0.05), { hung: true, h: 1.6, w: 0.7 });
    // Uplights washing the back wall.
    for (let i = 0; i < 6; i++) {
      const x = -5.5 + i * 2.2;
      d.cyl(0.07, 0.08, 0.14, '#111', x, 0, BACK + 0.12);
      d.kit.add(
        new THREE.PlaneGeometry(0.6, 1.6),
        mat('#ffffff', { emissive: c.tint, emissiveIntensity: 0.6, opacity: 0.35 }),
        x,
        0.85,
        BACK + 0.04,
        { noShadow: true },
      );
    }
  }
  // Cocktail tables among those standing.
  for (const [x, z] of [
    [-4.6, 1.6],
    [-1.2, 2.6],
    [3.0, 2.2],
    [4.7, 0.5],
    [-3.0, 0.8],
    [1.4, 0.9],
  ] as const) {
    if (!d.fits(x, z, 0.75, 0.75)) continue;
    d.cyl(0.32, 0.36, 1.08, '#f8fafc', x, 0, z, { seg: 18 });
    d.kit.torus(0.33, 0.02, tone(c.tint, 0), x, 1.0, z, { rx: Math.PI / 2 });
    d.can(0.035, 0.1, '#fde68a', x + 0.1, 1.08, z);
  }
  // Registration by the door.
  if (d.fits(5.3, 1.5, 0.8, 1.6)) {
    d.box(0.7, 0.75, 1.5, '#f8fafc', 5.3, 0, 1.5);
    d.box(0.72, 0.03, 1.52, tone(c.tint, -0.1), 5.3, 0.75, 1.5);
    for (let i = 0; i < 8; i++)
      d.bit(
        0.08,
        0.005,
        0.11,
        '#f8fafc',
        5.25 + (i % 2) * 0.12,
        0.78,
        1.0 + Math.floor(i / 2) * 0.22,
        { plain: true },
      );
  }
  if (chamber) {
    art(d, -4.8, 1.3, 0.7, 0.9, 7, '#b08d57');
    art(d, 4.8, 1.3, 0.7, 0.9, 13, '#b08d57');
  }
}

function lobby(_c: DressCtx, d: Dresser) {
  const wood = d.tier === 3 ? '#4a3426' : '#7c5a3c';
  // The front desk behind the receptionist, the key wall and the name.
  reception(d, 4.0, -0.88, 2.8, { body: wood, top: '#e7e1d7', logo: undefined });
  d.box(0.08, 0.08, 0.08, '#d4af37', 3.3, 1.09, -0.95, { metal: 0.8, rough: 0.3 });
  d.box(3.6, 2.2, 0.06, tone(wood, 0.05), 4.0, 0.05, BACK + 0.04);
  for (let i = 0; i < 12; i++)
    d.box(
      0.16,
      0.2,
      0.02,
      '#d4af37',
      2.75 + (i % 6) * 0.5,
      0.9 + Math.floor(i / 6) * 0.35,
      BACK + 0.08,
      { metal: 0.7, rough: 0.35 },
    );
  d.claim({ x0: 2.3, z0: BACK, x1: 5.9, z1: -0.5 });
  // Lifts.
  for (const x of [-1.4, 0.4]) {
    d.box(1.3, 2.35, 0.06, '#b8bec6', x, 0, BACK + 0.03, { metal: 0.6, rough: 0.3 });
    d.box(0.56, 2.1, 0.03, '#d6dbe0', x - 0.29, 0, BACK + 0.07, { metal: 0.8, rough: 0.2 });
    d.box(0.56, 2.1, 0.03, '#d6dbe0', x + 0.29, 0, BACK + 0.07, { metal: 0.8, rough: 0.2 });
    d.box(0.3, 0.1, 0.02, '#111', x, 2.45, BACK + 0.05, {
      emissive: '#f59e0b',
      emissiveIntensity: 0.6,
    });
  }
  d.claim({ x0: -2.1, z0: BACK, x1: 1.1, z1: BACK + 0.6 });
  // Columns, the chandelier, art and plants.
  for (const x of [-2.6, 1.6])
    if (d.fits(x, -1.7, 0.6, 0.6)) column(d, x, -1.7, d.tier === 3 ? '#e7e1d7' : '#f5f0e6');
  chandelier(d, -0.6, 0.6, d.tier === 3 ? 1.3 : 1.0);
  art(d, -4.2, 1.2, 1.4, 1.0, 9, '#b08d57');
  rug(d, -1.4, 1.1, 5.2, 2.4, d.tier === 3 ? '#7f1d1d' : '#1e3a8a');
  plantsAlong(d, [-5.5, -2.9, 2.0, 5.5], BACK + 0.45, [3, 2, 2, 3]);
  // The luggage trolley by the door.
  if (d.fits(5.4, 1.4, 0.8, 1.1)) {
    d.box(0.7, 0.05, 1.0, '#d4af37', 5.4, 0.2, 1.4, { metal: 0.8, rough: 0.3 });
    for (const s of [-1, 1])
      d.cyl(0.02, 0.02, 1.6, '#d4af37', 5.4, 0.2, 1.4 + s * 0.45, { metal: 0.8, rough: 0.3 });
    d.box(0.04, 0.04, 0.95, '#d4af37', 5.4, 1.8, 1.4, { metal: 0.8 });
    d.bit(0.5, 0.65, 0.3, '#1f2937', 5.4, 0.25, 1.2);
    d.bit(0.4, 0.45, 0.25, '#7f1d1d', 5.4, 0.25, 1.65);
    d.bit(0.35, 0.25, 0.22, '#a16207', 5.4, 0.9, 1.25);
  }
  floorLamp(d, -5.6, 2.6);
}

function membersClub(_c: DressCtx, d: Dresser) {
  wainscot(d, 1.3, '#4a3426');
  // The fireplace in the middle of the back wall, books either side.
  d.box(2.0, 1.25, 0.4, '#e7e1d7', 0, 0, BACK + 0.2);
  d.box(1.1, 0.75, 0.05, '#1c1917', 0, 0.12, BACK + 0.4);
  d.kit.add(
    new THREE.PlaneGeometry(0.8, 0.4),
    mat('#f97316', { emissive: '#f97316', emissiveIntensity: 1.2 }),
    0,
    0.35,
    BACK + 0.43,
    { noShadow: true },
  );
  d.box(2.3, 0.07, 0.5, '#d6cfc0', 0, 1.25, BACK + 0.25);
  art(d, 0, 1.55, 1.0, 0.75, 17, '#b08d57');
  for (const x of [-2.0, -3.15, 2.0]) bookcase(d, x, BACK + 0.2, 0, 1.1, 2.4, '#3b2a20');
  d.claim({ x0: -3.8, z0: BACK, x1: 2.6, z1: BACK + 0.6 });
  // A small bar for the steward.
  shelving(
    d,
    4.2,
    BACK + 0.2,
    0,
    2.6,
    2.0,
    0.3,
    4,
    { frame: '#3b2a20', shelf: '#4a3426', back: '#2a1d14' },
    packs(d, 4.2, BACK + 0.2, 0, ['#7c2d12', '#14532d', '#ca8a04', '#e7e5e4'], {
      kind: 'bottle',
      tall: [0.26, 0.32],
      wide: [0.08, 0.09],
    }),
  );
  d.box(2.8, 1.0, 0.6, '#3b2a20', 4.2, 0, -0.95);
  d.box(2.9, 0.05, 0.68, '#7c5a3c', 4.2, 1.0, -0.95, { rough: 0.3 });
  d.claim({ x0: 2.8, z0: BACK, x1: 5.9, z1: -0.6 });
  rug(d, -1.6, 1.1, 5.4, 2.6, '#7f1d1d');
  floorLamp(d, -5.5, 0.2);
  floorLamp(d, -5.5, 2.6);
  plantsAlong(d, [5.6], 2.4, [3]);
}

function hotelBar(c: DressCtx, d: Dresser, t: Hall) {
  // The back bar behind whoever serves (at x -1, by the back wall).
  const glow = t === 'hotelbar';
  shelving(
    d,
    -1.0,
    BACK + 0.2,
    0,
    3.4,
    2.1,
    0.3,
    4,
    { frame: '#3b2a20', shelf: glow ? '#d4af37' : '#7c5a3c', back: glow ? '#1c1917' : '#6b4a33' },
    packs(
      d,
      -1.0,
      BACK + 0.2,
      0,
      ['#7c2d12', '#14532d', '#ca8a04', '#e7e5e4', '#1e3a8a', '#b91c1c'],
      { kind: 'bottle', tall: [0.24, 0.34], wide: [0.08, 0.1] },
    ),
  );
  d.box(3.6, 0.85, 0.5, '#3b2a20', -1.0, 0, -2.6);
  d.box(3.7, 0.05, 0.56, '#7c5a3c', -1.0, 0.85, -2.6);
  d.claim({ x0: -2.9, z0: BACK, x1: 0.9, z1: -2.3 });
  if (t === 'hotelbar') {
    reception(d, 4.0, -2.2, 2.4, {
      body: '#4a3426',
      top: '#e7e1d7',
      logo: c.sign,
      logoColour: '#1c1917',
    });
    d.claim(Dresser.rect(4.0, -2.4, 2.6, 1.4));
    windows(d, -5.8, -3.2, { night: c.night, frame: '#3b2a20' });
    for (const [x, z] of [
      [3.0, 1.9],
      [4.6, 1.2],
    ] as const)
      if (d.fits(x, z, 0.9, 0.9)) armchair(d, x, z, -0.6, '#7c2d12');
    pendants(
      d,
      [
        [-2.4, -0.2],
        [-1.0, -0.2],
        [0.4, -0.2],
      ],
      'globe',
    );
    plantsAlong(d, [-5.5, 5.6], 2.5, [3, 3]);
    chandelier(d, 3.6, 0.3, 0.9);
  } else if (t === 'guesthouse') {
    wallTv(d, 3.6, 1.2, 1.2);
    if (d.fits(3.6, 1.6, 2.1, 1.0)) sofa(d, 3.6, 1.8, Math.PI, 2.0, '#a16207', 'couch');
    for (let i = 0; i < 8; i++)
      d.box(
        0.05,
        0.08,
        0.02,
        '#d4af37',
        -5.2 + (i % 4) * 0.2,
        1.4 + Math.floor(i / 4) * 0.25,
        BACK + 0.04,
      );
    d.box(1.0, 0.7, 0.03, '#7c5a3c', -4.9, 1.2, BACK + 0.02);
    ceilingFan(d, -1.5, 0.6);
    ceilingFan(d, 3.0, 0.6);
    clock(d, 1.6, 2.2);
    plantsAlong(d, [-5.6, 5.6], 0.0, [3, 2]);
  } else if (t === 'venue') {
    for (const [x, z] of [
      [3.6, -1.8],
      [-4.6, 1.8],
      [4.4, 1.0],
    ] as const) {
      if (!d.fits(x, z, 1.8, 1.8)) continue;
      d.cyl(0.6, 0.62, 0.74, '#f8fafc', x, 0, z, { seg: 18 });
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        if (
          d.free(Dresser.rect(x + Math.sin(a) * 0.9, z + Math.cos(a) * 0.9, 0.45, 0.45), {
            margin: 0.15,
            furniture: false,
          })
        )
          sideChair(
            d,
            x + Math.sin(a) * 0.9,
            z + Math.cos(a) * 0.9,
            a + Math.PI,
            'fancy',
            tone(c.tint, 0.1),
          );
      }
    }
    banner(d, 5.4, -2.7, 'EVENTS', c.tint, { h: 1.9, w: 0.75 });
    for (let i = 0; i < 5; i++)
      for (let k = 0; k < 4; k++)
        d.bit(0.45, 0.04, 0.45, '#9ca3af', -5.3, 0.45 + k * 0.08 + i * 0, -1.8 + i * 0.0, {
          plain: true,
        });
    pendants(
      d,
      [
        [-2.4, -0.4],
        [2.0, -0.4],
      ],
      'globe',
    );
  } else {
    // A co-living house: a big table, sofas, a notice board, bikes.
    if (d.fits(3.6, -2.0, 2.6, 1.6)) {
      d.box(2.4, 0.05, 1.0, '#a87b4f', 3.6, 0.74, -2.0);
      for (const s of [-1, 1]) d.box(0.08, 0.74, 0.8, '#27272a', 3.6 + s * 1.0, 0, -2.0);
      for (const s of [-1, 1])
        for (const k of [-0.6, 0, 0.6])
          sideChair(d, 3.6 + k, -2.0 + s * 0.75, s > 0 ? Math.PI : 0, 'chair');
    }
    if (d.fits(-4.4, 2.0, 2.2, 1.0)) sofa(d, -4.4, 2.2, Math.PI, 2.0, '#4b5563', 'L');
    d.box(1.4, 0.9, 0.03, '#c69c6d', -4.6, 1.2, BACK + 0.02);
    for (let i = 0; i < 9; i++)
      d.bit(
        0.14,
        0.14,
        0.005,
        ['#fde047', '#f9a8d4', '#86efac'][i % 3]!,
        -5.1 + (i % 3) * 0.4,
        1.35 + Math.floor(i / 3) * 0.25,
        BACK + 0.04,
        { plain: true },
      );
    plantsAlong(d, [5.6, 1.8, -5.6], BACK + 0.4, [3, 2, 2]);
  }
}

export const halls: Family = {
  look,
  signAt,
  seat: (c, d, s: SeatCall) => {
    const t = hallOf(c);
    if (t !== 'lobby' && t !== 'club') return false;
    const colour = t === 'club' ? '#5a2a17' : d.tier === 3 ? '#e7e1d7' : '#8a6e57';
    if (s.pair) {
      armchair(d, s.ax, s.z, Math.PI / 2, colour);
      armchair(d, s.bx, s.z, -Math.PI / 2, colour);
      coffeeTable(
        d,
        (s.ax + s.bx) / 2,
        s.z,
        0.8,
        0.55,
        Math.PI / 2,
        t === 'club' ? '#3b2a20' : '#2b2f36',
      );
      d.claim(Dresser.rect((s.ax + s.bx) / 2, s.z, s.bx - s.ax + 0.9, 1.0));
      return true;
    }
    armchair(d, s.x, s.z, Math.PI, colour);
    return true;
  },
  dress: (c, d) => {
    const t = hallOf(c);
    if (t === 'event' || t === 'chamber') eventHall(c, d, t === 'chamber');
    else if (t === 'lobby') lobby(c, d);
    else if (t === 'club') membersClub(c, d);
    else hotelBar(c, d, t);
  },
  lift: (c) => {
    const t = hallOf(c);
    if (t !== 'event' && t !== 'chamber') return undefined;
    const m = new Map<number, number>();
    c.slots.forEach((s, i) => {
      if (s.act === 'presenting' && s.y < 150) m.set(i, STAGE_H);
    });
    return m;
  },
};

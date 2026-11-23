/**
 * Services: clinics (a pharmacy's shelves and counter, a doctor's surgery,
 * the dentist's chair, a hospital ward), banks (teller windows behind glass,
 * the queue, ATMs; the central bank's vault; the tax office's tickets),
 * gyms (machines and racks; a studio's mirrors and mats; a climbing wall),
 * salons and barbers, and schools (a classroom, a bootcamp, a lecture room).
 */
import * as THREE from 'three';
import { BACK, WALL_H } from '../roomGeom';
import { mat } from '../kit';
import { Dresser } from './core';
import {
  beamSeats,
  bookcase,
  ceilingFan,
  clock,
  column,
  counter,
  desk,
  drinksFridge,
  flag,
  glassWall,
  gondola,
  lectern,
  wainscot,
  packs,
  plantsAlong,
  poster,
  queuePosts,
  reception,
  shelving,
  sideChair,
  sofa,
  speaker,
  wallTv,
  waterCooler,
  whiteboard,
  windows,
} from './props';
import type { DressCtx, Family, Look, SeatCall } from './types';

const PHARMA = [
  '#f8fafc',
  '#e0f2fe',
  '#dcfce7',
  '#fee2e2',
  '#2563eb',
  '#16a34a',
  '#f1f5f9',
  '#fde68a',
];

type Svc =
  | 'pharmacy'
  | 'clinic'
  | 'dentist'
  | 'hospital'
  | 'bank'
  | 'central'
  | 'tax'
  | 'embassy'
  | 'gym'
  | 'studio'
  | 'climb'
  | 'salon'
  | 'barber'
  | 'school'
  | 'bootcamp'
  | 'lecture';

function svcOf(c: DressCtx): Svc {
  const v = c.variant;
  switch (c.kind) {
    case 'clinic':
      return /pharm/.test(v)
        ? 'pharmacy'
        : /dent/.test(v)
          ? 'dentist'
          : /hospital/.test(v)
            ? 'hospital'
            : 'clinic';
    case 'bank':
      return v === 'central-bank'
        ? 'central'
        : v === 'tax-office'
          ? 'tax'
          : v === 'embassy'
            ? 'embassy'
            : 'bank';
    case 'gym':
      return /studio|yoga|pilates/.test(v) ? 'studio' : /climb/.test(v) ? 'climb' : 'gym';
    case 'salon':
      return /barb|kinyozi/.test(v) ? 'barber' : 'salon';
    default:
      return /bootcamp/.test(v) ? 'bootcamp' : /university/.test(v) ? 'lecture' : 'school';
  }
}

const LOOKS: Record<Svc, (d: Dresser) => Look> = {
  pharmacy: () => ({ floor: 'tile', wall: '#f0fdf4' }),
  clinic: () => ({ floor: 'tile', wall: '#e0f2f1' }),
  dentist: () => ({ floor: 'tile', wall: '#eff6ff' }),
  hospital: () => ({ floor: 'tile', wall: '#ecfeff' }),
  bank: (d) => ({
    floor: d.tier === 1 ? 'tile' : 'marble',
    wall: d.pick(['#e7e5e4', '#e2e8f0', '#ede9e3']),
  }),
  central: () => ({ floor: 'marble', wall: '#e7dfcf' }),
  tax: () => ({ floor: 'tile', wall: '#e8eef0' }),
  embassy: () => ({ floor: 'marble', wall: '#ece6da' }),
  gym: () => ({ floor: 'concrete', floorTint: '#2b2f36', wall: '#2f3a48' }),
  studio: () => ({ floor: 'oak', wall: '#f3ede6' }),
  climb: () => ({ floor: 'concrete', wall: '#cbd5e1' }),
  salon: () => ({ floor: 'checker', floorTint: '#f5efe6', wall: '#f3d9e0' }),
  barber: () => ({ floor: 'checker', floorTint: '#d4d4d4', wall: '#1f2937' }),
  school: () => ({ floor: 'parquet', wall: '#fef3c7' }),
  bootcamp: () => ({ floor: 'concrete', wall: '#e0e7ff' }),
  lecture: () => ({ floor: 'carpet', floorTint: '#5b4a3a', wall: '#ede4d3' }),
};

// ---------------------------------------------------------------------------
// Clinics

function clinic(c: DressCtx, d: Dresser, t: Svc) {
  const sx = -2.33;
  if (t === 'pharmacy') {
    counter(d, sx, -0.58, 0, 2.8, { body: '#f8fafc', top: '#16a34a' });
    d.claim(Dresser.rect(sx, -0.9, 3.0, 1.4));
    shelving(
      d,
      -3.4,
      BACK + 0.24,
      0,
      4.6,
      2.2,
      0.38,
      6,
      { frame: '#e5e7eb', back: '#f0fdf4' },
      packs(d, -3.4, BACK + 0.24, 0, PHARMA, { tall: [0.08, 0.18], wide: [0.06, 0.12] }),
    );
    d.claim({ x0: -5.75, z0: BACK, x1: -1.05, z1: BACK + 0.5 });
    // The green cross.
    d.box(0.5, 0.16, 0.04, '#16a34a', sx, 2.45, BACK + 0.04, {
      emissive: '#22c55e',
      emissiveIntensity: 0.5,
    });
    d.box(0.16, 0.5, 0.04, '#16a34a', sx, 2.28, BACK + 0.04, {
      emissive: '#22c55e',
      emissiveIntensity: 0.5,
    });
    if (d.fits(2.6, -1.9, 3.3, 1.0))
      gondola(d, 2.6, -1.9, 0, 2.6, PHARMA.concat(['#db2777', '#f59e0b']), { h: 1.35 });
    drinksFridge(d, 5.2, BACK + 0.36, 0, 0.9, '#f8fafc');
    d.claim({ x0: 4.7, z0: BACK, x1: 5.7, z1: BACK + 0.7 });
    poster(d, 0.6, 1.3, 0.8, 1.0, 'HEALTH', '#0e7490');
  } else {
    reception(d, sx, -0.62, 2.6, {
      body: '#f8fafc',
      top: '#0f766e',
      logo: t === 'hospital' ? 'NURSES' : 'RECEPTION',
      logoColour: '#0f766e',
    });
    d.claim(Dresser.rect(sx, -0.9, 2.8, 1.4));
    filingWall(d, -4.6);
    // The room at the back: a couch, a dental chair or two beds behind glass.
    glassWall(d, 0.4, -1.6, 5.95, -1.6, { gap: [0.3, 1.2], h: 2.3, frame: '#94a3b8' });
    glassWall(d, 0.4, BACK, 0.4, -1.6, { h: 2.3, frame: '#94a3b8' });
    d.claim({ x0: 0.4, z0: BACK, x1: 5.95, z1: -1.5 });
    if (t === 'dentist') dentalChair(d, 3.2, -2.5);
    else if (t === 'hospital') {
      for (const x of [2.2, 4.6]) bed(d, x, -2.45, c.tint);
    } else {
      bed(d, 2.6, -2.45, '#e0f2fe');
      d.box(0.8, 0.9, 0.5, '#f8fafc', 4.6, 0, BACK + 0.3);
      d.box(0.5, 0.06, 0.4, '#e5e7eb', 4.6, 0.9, BACK + 0.3);
      d.cyl(0.02, 0.02, 0.3, CHROME, 4.6, 0.96, BACK + 0.2);
    }
    for (const x of [1.0, 5.5]) d.box(0.04, 2.0, 0.6, '#7dd3fc', x, 0.2, -2.3, { opacity: 0.85 });
    poster(d, -0.4, 1.3, 0.7, 0.9, t === 'dentist' ? 'SMILE' : 'WASH HANDS', '#0e7490');
    if (d.fits(-0.2, -2.6, 0.4, 0.4)) waterCooler(d, -0.2, -2.6);
  }
  wallTv(d, -4.5, 1.6, 1.0);
  plantsAlong(d, [-5.6, 5.6], 2.5, [3, 2]);
  clock(d, -0.9, 2.3);
}

const CHROME = '#c7ccd1';

function filingWall(d: Dresser, x: number) {
  shelving(d, x, BACK + 0.24, 0, 2.2, 2.0, 0.4, 5, { frame: '#cbd5e1' }, (x0, x1, y, _room, lz) => {
    for (let t = x0; t < x1 - 0.05; t += 0.07)
      d.bit(
        0.05,
        0.28,
        0.3,
        d.pick(['#93c5fd', '#fde68a', '#fca5a5', '#86efac', '#e5e7eb']),
        x + t,
        y,
        BACK + 0.24 + lz,
        { plain: true },
      );
  });
  d.claim({ x0: x - 1.15, z0: BACK, x1: x + 1.15, z1: BACK + 0.5 });
}

function bed(d: Dresser, x: number, z: number, blanket: string) {
  d.box(0.95, 0.5, 2.0, '#e5e7eb', x, 0.15, z, { ry: Math.PI / 2, round: 0.03 });
  for (const s of [-1, 1]) d.box(0.04, 0.15, 0.04, '#94a3b8', x + s * 0.9, 0, z + 0.4);
  d.box(1.6, 0.06, 0.92, blanket, x + 0.15, 0.65, z, { round: 0.02 });
  d.box(0.35, 0.12, 0.6, '#f8fafc', x - 0.78, 0.65, z, { round: 0.04 });
  d.box(0.05, 0.8, 0.95, '#cbd5e1', x - 1.0, 0.15, z);
  // A drip stand and a monitor.
  d.cyl(0.015, 0.015, 1.8, CHROME, x - 1.3, 0, z - 0.45);
  d.box(0.12, 0.2, 0.04, '#bae6fd', x - 1.3, 1.6, z - 0.45, { opacity: 0.8 });
  d.box(0.4, 0.3, 0.06, '#1f2937', x - 1.3, 1.1, z + 0.2);
  d.screenAt(0.34, 0.24, x - 1.3, 1.25, z + 0.235);
}

function dentalChair(d: Dresser, x: number, z: number) {
  d.cyl(0.25, 0.3, 0.4, '#e5e7eb', x, 0, z);
  d.box(0.6, 0.12, 1.0, '#0ea5e9', x, 0.5, z + 0.1, { round: 0.05 });
  d.box(0.55, 0.7, 0.12, '#0ea5e9', x, 0.55, z - 0.45, { rx: -0.35, round: 0.05 });
  d.box(0.5, 0.1, 0.5, '#0ea5e9', x, 0.4, z + 0.75, { rx: 0.5, round: 0.04 });
  d.cyl(0.02, 0.02, 1.6, CHROME, x + 0.6, 0, z - 0.3);
  d.box(0.9, 0.03, 0.03, CHROME, x + 0.2, 1.6, z - 0.3);
  d.cyl(0.12, 0.09, 0.1, '#f8fafc', x - 0.2, 1.52, z - 0.3, {
    emissive: '#fef9c3',
    emissiveIntensity: 0.6,
  });
  d.box(0.6, 0.85, 0.45, '#f8fafc', x + 1.6, 0, BACK + 0.25);
  d.box(0.6, 0.4, 0.02, '#e0f2fe', x - 1.4, 1.3, BACK + 0.03, {
    emissive: '#e0f2fe',
    emissiveIntensity: 0.5,
  });
}

// ---------------------------------------------------------------------------
// Banks

function bank(c: DressCtx, d: Dresser, t: Svc) {
  const wood = t === 'central' ? '#4a3426' : '#334155';
  // The teller line: a counter with a window each, glass above, numbers over.
  const xs = t === 'tax' ? [-3.0, -1.0, 1.0, 3.0] : [-3.6, -2.0, 2.0, 3.6];
  d.box(8.6, 1.05, 0.6, wood, 0, 0, -0.85, { round: 0.01 });
  d.box(8.7, 0.05, 0.75, t === 'central' ? '#e7dfcf' : '#e5e7eb', 0, 1.05, -0.82);
  glassWall(d, -4.3, -0.98, 4.3, -0.98, { h: 1.25, frame: '#475569' });
  for (const x of xs) {
    d.box(0.5, 0.18, 0.06, '#111827', x, 2.45, -0.98);
    d.kit.add(
      new THREE.PlaneGeometry(0.4, 0.12),
      mat('#ffffff', { emissive: '#22c55e', emissiveIntensity: 0.9 }),
      x,
      2.54,
      -0.94,
      { noShadow: true },
    );
    d.box(0.42, 0.28, 0.03, '#1f2937', x + 0.25, 1.1, -1.05, { ry: Math.PI });
  }
  d.claim({ x0: -4.4, z0: -1.25, x1: 4.4, z1: -0.5 });
  // The back office behind: desks, filing, the safe or the vault.
  for (const x of [-3.0, 3.0])
    if (d.fits(x, -2.5, 1.4, 1.0)) desk(d, x, -2.6, 0, { style: 'white', screens: 1, chair: true });
  if (t === 'central') {
    d.cyl(1.05, 1.05, 0.2, '#9ca3af', 0, 1.25, BACK + 0.1, {
      rx: Math.PI / 2,
      metal: 0.8,
      rough: 0.3,
      seg: 32,
    });
    d.cyl(0.9, 0.9, 0.12, '#cbd5e1', 0, 1.25, BACK + 0.2, {
      rx: Math.PI / 2,
      metal: 0.8,
      rough: 0.25,
      seg: 32,
    });
    for (let i = 0; i < 6; i++)
      d.box(0.7, 0.05, 0.05, '#6b7280', Math.cos(i) * 0.35, 1.25 + Math.sin(i) * 0.35, BACK + 0.3, {
        rz: i,
        metal: 0.8,
      });
    for (const x of [-5.0, 5.0]) column(d, x, -2.4, '#e7dfcf');
    for (const x of [-1.6, 1.6]) flag(d, x, BACK + 0.4, [c.tint, '#ffffff', c.tint]);
    d.claim({ x0: -1.9, z0: BACK, x1: 1.9, z1: BACK + 0.6 });
  } else if (t === 'embassy') {
    d.cyl(0.45, 0.45, 0.05, '#d4af37', 0, 1.8, BACK + 0.03, {
      rx: Math.PI / 2,
      metal: 0.7,
      rough: 0.3,
    });
    for (const [x, s] of [
      [-1.2, ['#1d4ed8', '#ffffff', '#dc2626']],
      [1.2, [c.tint, '#ffffff', c.tint]],
    ] as const)
      flag(d, x, BACK + 0.4, s);
    poster(d, -4.4, 1.3, 1.4, 0.8, 'VISAS', '#1e3a8a');
  } else {
    d.box(0.9, 1.4, 0.7, '#6b7280', 0, 0, BACK + 0.36, { metal: 0.6, rough: 0.35 });
    d.cyl(0.12, 0.12, 0.04, '#d1d5db', 0.15, 0.8, BACK + 0.72, { rx: Math.PI / 2, metal: 0.8 });
    filingWall(d, -4.9);
    wallTv(d, 4.6, 1.5, 1.2);
  }
  // The queue down the middle and ATMs or a ticket machine by the wall.
  queuePosts(
    d,
    [
      [-0.7, -0.2],
      [-0.7, 1.4],
      [-0.7, 2.6],
    ],
    t === 'central' ? '#7f1d1d' : '#1d4ed8',
  );
  queuePosts(
    d,
    [
      [0.7, -0.2],
      [0.7, 1.4],
      [0.7, 2.6],
    ],
    t === 'central' ? '#7f1d1d' : '#1d4ed8',
  );
  if (t === 'tax') {
    if (d.fits(-5.3, 0.4, 0.5, 0.5)) {
      d.box(0.4, 1.3, 0.35, '#e5e7eb', -5.3, 0, 0.4, { round: 0.03 });
      d.screenAt(0.3, 0.22, -5.3, 1.05, 0.58);
    }
    poster(d, 0, 2.15, 2.4, 0.4, 'NOW SERVING  A-042', '#111827', '#f87171');
    for (const [x, z] of [
      [-4.0, 2.6],
      [3.2, 2.7],
    ] as const)
      if (d.fits(x, z, 2.2, 0.6)) beamSeats(d, x, z, Math.PI, 4, '#0f766e');
  } else {
    for (const z of [0.2, 1.0]) {
      if (!d.fits(-5.55, z, 0.6, 0.7)) continue;
      d.box(0.5, 1.6, 0.55, '#334155', -5.55, 0, z, { round: 0.02 });
      d.box(0.36, 0.3, 0.02, '#111827', -5.28, 1.15, z, { ry: Math.PI / 2 });
      d.screenAt(0.3, 0.24, -5.26, 1.3, z, Math.PI / 2);
      d.box(0.1, 0.25, 0.4, '#1f2937', -5.25, 0.95, z, { ry: Math.PI / 2 });
    }
    if (d.fits(5.4, 1.6, 1.0, 1.8)) sofa(d, 5.4, 1.6, -Math.PI / 2, 1.8, '#475569', 'couch');
  }
  poster(
    d,
    t === 'central' ? -3.4 : 3.4,
    1.85,
    1.6,
    0.35,
    t === 'tax' ? 'PAY YOUR TAXES' : 'RATES TODAY',
    t === 'central' ? '#7f1d1d' : '#1d4ed8',
  );
  plantsAlong(d, [-5.6, 5.6], 2.6, [3, 3]);
}

// ---------------------------------------------------------------------------
// Gyms

function treadmill(d: Dresser, x: number, z: number) {
  d.box(0.75, 0.18, 1.7, '#1f2937', x, 0, z, { round: 0.03 });
  d.box(0.6, 0.02, 1.4, '#111', x, 0.18, z + 0.1);
  for (const s of [-1, 1])
    d.box(0.05, 1.1, 0.06, '#374151', x + s * 0.34, 0.15, z - 0.75, { rx: -0.15 });
  d.box(0.75, 0.25, 0.18, '#374151', x, 1.2, z - 0.85, { rx: 0.5 });
  d.screenAt(0.3, 0.14, x, 1.32, z - 0.75, 0);
}

function spinBike(d: Dresser, x: number, z: number) {
  d.box(0.12, 0.05, 0.9, '#1f2937', x, 0, z);
  d.box(0.08, 0.9, 0.08, '#dc2626', x, 0, z + 0.2, { rx: 0.3 });
  d.box(0.08, 0.8, 0.08, '#dc2626', x, 0, z - 0.25, { rx: -0.2 });
  d.cyl(0.25, 0.25, 0.06, '#9ca3af', x, 0.35, z - 0.3, { rz: Math.PI / 2, metal: 0.6 });
  d.box(0.25, 0.06, 0.3, '#111', x, 0.92, z + 0.3);
  d.box(0.45, 0.04, 0.05, '#111', x, 1.05, z - 0.3);
}

function rack(d: Dresser, x: number, z: number) {
  // Dumbbells on a two-tier rack.
  d.box(1.8, 0.05, 0.5, '#111', x, 0.45, z, { rx: 0.2 });
  d.box(1.8, 0.05, 0.4, '#111', x, 0.8, z - 0.05, { rx: 0.2 });
  for (const s of [-1, 1]) d.box(0.06, 0.85, 0.5, '#374151', x + s * 0.88, 0, z);
  for (let i = 0; i < 8; i++) {
    const r = 0.06 + (i % 4) * 0.012;
    for (const tier of [0, 1]) {
      const y = tier ? 0.88 : 0.53;
      const zz = z + (tier ? -0.05 : 0.02);
      d.can(r, 0.06, '#27272a', x - 0.75 + i * 0.21, y + r, zz - 0.1, { rx: Math.PI / 2 });
      d.can(r, 0.06, '#27272a', x - 0.75 + i * 0.21, y + r, zz + 0.12, { rx: Math.PI / 2 });
    }
  }
}

function gym(c: DressCtx, d: Dresser, t: Svc) {
  if (t === 'gym') {
    // A mirror wall, a row of treadmills and bikes, racks, a squat rack.
    d.kit.add(
      new THREE.PlaneGeometry(6.0, 1.9),
      mat('#cfe0ea', { metal: 0.85, rough: 0.06 }),
      -1.0,
      1.25,
      BACK + 0.02,
      { noShadow: true },
    );
    for (let i = 0; i < 4; i++) treadmill(d, -5.3 + i * 0.9, BACK + 1.0);
    for (let i = 0; i < 3; i++)
      if (d.fits(-1.6 + i * 0.7, BACK + 0.7, 0.4, 1.0)) spinBike(d, -1.6 + i * 0.7, BACK + 0.7);
    d.claim({ x0: -5.8, z0: BACK, x1: -2.0, z1: BACK + 1.9 });
    if (d.fits(1.6, BACK + 0.4, 2.0, 0.6)) rack(d, 1.6, BACK + 0.4);
    if (d.fits(-4.4, 0.0, 1.4, 1.4, 0, { stations: false })) {
      for (const s of [-1, 1])
        for (const k of [-1, 1]) d.box(0.08, 2.2, 0.08, '#111', -4.4 + s * 0.6, 0, k * 0.55);
      d.box(1.4, 0.08, 0.08, '#111', -4.4, 2.2, -0.55);
      d.box(1.4, 0.08, 0.08, '#111', -4.4, 2.2, 0.55);
      d.cyl(0.015, 0.015, 1.9, CHROME, -5.35, 1.3, 0, { rz: -Math.PI / 2, metal: 0.8 });
      for (const s of [-1, 1])
        d.can(0.22, 0.05, '#1f2937', -4.4 + s * 0.85, 1.3 - 0.22, 0, { rz: Math.PI / 2 });
    }
    reception(d, 4.3, -0.9, 2.4, {
      body: '#111827',
      top: c.tint,
      logo: c.sign,
      logoColour: c.tint,
    });
    d.claim(Dresser.rect(4.3, -1.1, 2.6, 1.4));
    if (d.fits(5.4, -2.6, 0.4, 0.4)) waterCooler(d, 5.4, -2.6);
    for (let i = 0; i < 6; i++)
      if (d.fits(5.4, 0.6 + i * 0.0, 0.5, 0.5))
        d.ball(
          0.16,
          d.pick(['#dc2626', '#16a34a', '#1d4ed8']),
          5.4 - (i % 3) * 0.3,
          0.16,
          0.6 + Math.floor(i / 3) * 0.3,
        );
    poster(d, 3.5, 1.8, 1.6, 0.4, 'NO PAIN NO GAIN', c.tint);
  } else if (t === 'studio') {
    d.kit.add(
      new THREE.PlaneGeometry(8.0, 2.0),
      mat('#d8e6ee', { metal: 0.85, rough: 0.06 }),
      -1.5,
      1.15,
      BACK + 0.02,
      { noShadow: true },
    );
    d.cyl(0.025, 0.025, 8.0, '#a87b4f', -5.5, 1.0, BACK + 0.2, { rz: -Math.PI / 2 });
    for (let i = 0; i < 5; i++) d.box(0.03, 1.0, 0.03, CHROME, -5.4 + i * 2.0, 0, BACK + 0.16);
    const mats = ['#7c3aed', '#0ea5e9', '#f472b6', '#22c55e', '#f59e0b'];
    for (const [x, z] of [
      [-3.4, 0.9],
      [-0.9, 1.3],
      [1.6, 0.4],
      [3.8, 1.4],
      [-4.6, 2.4],
    ] as const)
      if (d.fits(x, z, 0.7, 1.8, 0, { stations: false, margin: 0.05 }))
        d.bit(0.62, 0.01, 1.75, d.pick(mats), x, 0, z, { plain: true });
    for (let i = 0; i < 6; i++)
      d.can(
        0.07,
        0.62,
        d.pick(mats),
        4.6 + (i % 3) * 0.17,
        0,
        BACK + 0.25 + Math.floor(i / 3) * 0.17,
      );
    for (let i = 0; i < 3; i++) d.ball(0.32, d.pick(mats), 5.4, 0.32, -1.6 + i * 0.68);
    speaker(d, 2.6, BACK + 0.3, 0, false);
    plantsAlong(d, [-5.6, 5.6], 2.6, [3, 3]);
  } else {
    // The climbing wall: tilted panels studded with holds; crash mats below.
    const cols = ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7', '#f8fafc', '#111827'];
    const panels: [number, number, number][] = [
      [-4.5, 2.4, 0.15],
      [-2.0, 2.6, -0.1],
      [0.6, 2.4, 0.25],
      [3.2, 2.6, 0],
    ];
    for (const [x, w, tilt] of panels) {
      d.box(w, WALL_H - 0.1, 0.12, d.pick(['#e2e8f0', '#cbd5e1', '#94a3b8']), x, 0, BACK + 0.25, {
        rx: tilt,
      });
      for (let i = 0; i < 26; i++) {
        const hx = x - w / 2 + 0.15 + d.rng() * (w - 0.3);
        const hy = 0.3 + d.rng() * 2.5;
        const off = Math.sin(tilt) * hy;
        d.ball(0.05 + d.rng() * 0.04, d.pick(cols), hx, hy, BACK + 0.33 + off, 0.7);
      }
    }
    d.box(11.0, 0.3, 1.5, '#1e3a8a', -0.5, 0, BACK + 1.2, { round: 0.05 });
    d.claim({ x0: -6, z0: BACK, x1: 5, z1: BACK + 1.95 });
    for (const [x, z] of [
      [-4.0, 2.6],
      [4.6, 2.6],
    ] as const)
      if (d.fits(x, z, 1.7, 0.6)) beamSeats(d, x, z, Math.PI, 3, '#475569');
    reception(d, 5.2, -0.6, 1.4, { body: '#1e3a8a', top: '#f8fafc', ry: -Math.PI / 2 });
  }
}

// ---------------------------------------------------------------------------
// Salons

function salon(_c: DressCtx, d: Dresser, t: Svc) {
  const barber = t === 'barber';
  // Wash basins at the back, a product shelf, dryers, a waiting sofa, the till.
  for (let i = 0; i < 3; i++) {
    const x = -5.5 + i * 0.75;
    d.box(0.7, 0.75, 0.45, barber ? '#111827' : '#f8fafc', x, 0, BACK + 0.25);
    d.cyl(0.25, 0.18, 0.18, barber ? '#e5e7eb' : '#111827', x, 0.75, BACK + 0.28);
    d.box(0.55, 0.45, 0.8, barber ? '#7f1d1d' : '#111827', x, 0.0, BACK + 0.9, { round: 0.05 });
    d.box(0.55, 0.55, 0.12, barber ? '#7f1d1d' : '#111827', x, 0.45, BACK + 0.62, {
      rx: -0.5,
      round: 0.04,
    });
  }
  d.claim({ x0: -5.9, z0: BACK, x1: -3.6, z1: BACK + 1.4 });
  const pal = barber
    ? ['#111827', '#1d4ed8', '#e5e7eb', '#b91c1c']
    : ['#f472b6', '#a855f7', '#f8fafc', '#fde68a', '#14b8a6'];
  shelving(
    d,
    0.0,
    BACK + 0.22,
    0,
    2.0,
    2.0,
    0.34,
    5,
    { frame: barber ? '#3f3f46' : '#f5d0e0', back: barber ? '#27272a' : '#fdf2f8' },
    packs(d, 0, BACK + 0.22, 0, pal, { kind: 'bottle', tall: [0.16, 0.24], wide: [0.06, 0.08] }),
  );
  d.claim({ x0: -1.0, z0: BACK, x1: 1.0, z1: BACK + 0.4 });
  if (!barber) {
    for (const x of [-1.4, 1.4]) {
      if (!d.fits(x, -1.5, 0.7, 0.8)) continue;
      d.box(0.6, 0.45, 0.6, '#f472b6', x, 0, -1.5, { round: 0.05 });
      d.box(0.6, 0.5, 0.1, '#f472b6', x, 0.45, -1.78, { round: 0.04 });
      d.cyl(0.02, 0.02, 1.1, CHROME, x, 0.45, -1.9);
      d.kit.sphere(0.3, '#f8fafc', x, 1.4, -1.65, { sy: 0.8 });
    }
  } else {
    // The pole and a TV for the football.
    d.cyl(0.08, 0.08, 0.9, '#f8fafc', 1.6, 1.3, BACK + 0.1);
    for (let i = 0; i < 4; i++)
      d.box(0.17, 0.08, 0.02, i % 2 ? '#1d4ed8' : '#dc2626', 1.6, 1.4 + i * 0.2, BACK + 0.18, {
        rz: 0.5,
      });
    wallTv(d, 4.6, 1.6, 1.2);
  }
  counter(d, 4.8, -1.8, -Math.PI / 2, 1.6, {
    body: barber ? '#111827' : '#fbcfe8',
    top: '#f8fafc',
  });
  d.claim(Dresser.rect(4.8, -1.8, 1.0, 1.8));
  if (d.fits(-4.4, 2.6, 2.0, 0.9))
    sofa(d, -4.4, 2.6, Math.PI, 1.8, barber ? '#27272a' : '#f9a8d4', 'couch');
  if (barber) poster(d, -1.75, 1.3, 0.55, 0.75, 'FADES', '#b91c1c');
  else
    for (let i = 0; i < 3; i++)
      poster(d, 3.8 + i * 0.7, 1.3, 0.55, 0.75, ['BRAIDS', 'WEAVES', 'NAILS'][i]!, '#be185d');
  plantsAlong(d, [5.6, -5.6], 2.6, [2, 3]);
}

// ---------------------------------------------------------------------------
// Schools

function school(c: DressCtx, d: Dresser, t: Svc) {
  const tx = -3.67;
  if (t === 'lecture') {
    d.box(3.4, 1.9, 0.04, '#f8fafc', tx + 0.5, 0.9, BACK + 0.03);
    d.screenAt(3.2, 1.75, tx + 0.5, 1.85, BACK + 0.06);
    lectern(d, tx - 1.4, -1.9, 0, c.tint, 0.4);
    wainscot(d, 0.9, '#7c5a3c');
  } else {
    // A board behind the teacher, their desk, the alphabet or a map.
    if (t === 'bootcamp') wallTv(d, tx, 1.0, 2.2);
    else {
      d.box(3.0, 1.3, 0.04, '#1f3b2c', tx, 0.9, BACK + 0.03);
      d.box(3.1, 0.06, 0.1, '#7c5a3c', tx, 0.86, BACK + 0.06);
      for (let i = 0; i < 4; i++)
        d.box(
          0.8 - i * 0.12,
          0.02,
          0.005,
          '#e5e7eb',
          tx - 0.8 + i * 0.1,
          1.85 - i * 0.2,
          BACK + 0.055,
        );
    }
    if (d.fits(tx + 1.8, -2.4, 1.3, 0.8))
      desk(d, tx + 1.8, -2.4, 0, {
        style: 'wood',
        screens: t === 'bootcamp' ? 'laptop' : 0,
        chair: false,
      });
  }
  d.claim({ x0: tx - 1.8, z0: BACK, x1: tx + 1.8, z1: -1.6 });
  // Shelves of books, a globe, windows, posters.
  if (t !== 'bootcamp') {
    bookcase(d, 1.2, BACK + 0.2, 0, 1.2, 1.6, '#a16207');
    d.claim({ x0: 0.5, z0: BACK, x1: 1.9, z1: BACK + 0.45 });
    d.cyl(0.08, 0.1, 0.06, '#7c5a3c', 1.2, 1.6, BACK + 0.2);
    d.ball(0.18, '#3b82f6', 1.2, 1.86, BACK + 0.2);
  } else {
    for (const [x, z, col] of [
      [5.0, -1.6, '#6366f1'],
      [5.3, -0.6, '#f97316'],
    ] as const)
      if (d.fits(x, z, 0.8, 0.8)) d.kit.sphere(0.38, col, x, 0.24, z, { sy: 0.62 });
    whiteboard(d, 1.6, 1.8, 1.1);
  }
  windows(d, 2.4, 5.8, { night: c.night, view: t === 'school' ? 'trees' : 'city' });
  d.claim({ x0: 2.2, z0: BACK, x1: 5.9, z1: BACK + 0.3 });
  // Spare desks for the rest of the class.
  for (const z of [-0.25, 1.55])
    for (const x of [-0.67, 0.67, 2.0, 3.33, 4.67, -2.0]) {
      const r = Dresser.rect(x, z + 0.3, 1.0, 1.25);
      if (!d.free(r) || d.rng() > 0.85) continue;
      d.claim(r);
      studentDesk(d, x, z, t);
    }
  if (t === 'school') {
    poster(d, -0.3, 1.4, 0.8, 0.6, 'A B C', '#dc2626');
    ceilingFan(d, -1.5, 0.5);
    ceilingFan(d, 2.5, 0.5);
  } else poster(d, -0.3, 1.5, 0.9, 0.5, t === 'bootcamp' ? 'SHIP IT' : 'LECTURE 4', c.tint);
  plantsAlong(d, [5.6, -5.6], 2.6, [2, 2]);
}

function studentDesk(d: Dresser, x: number, z: number, t: Svc) {
  desk(d, x, z, 0, {
    style: t === 'school' ? 'wood' : 'white',
    w: 0.95,
    screens: t === 'bootcamp' ? 'laptop' : 0,
    chair: false,
  });
  if (t !== 'bootcamp') {
    d.bit(0.24, 0.02, 0.3, d.pick(['#fde68a', '#bfdbfe', '#fecaca']), x + 0.1, 0.74, z + 0.05, {
      plain: true,
      ry: 0.2,
    });
  }
  sideChair(
    d,
    x,
    z + 0.55,
    Math.PI,
    t === 'school' ? 'chair' : 'plastic',
    t === 'school' ? '#a16207' : undefined,
  );
}

export const services: Family = {
  look: (c, d) => LOOKS[svcOf(c)](d),
  seat: (c, d, s: SeatCall) => {
    const t = svcOf(c);
    if (s.pair) return false;
    if (c.kind === 'school' && s.style === 'desk') {
      studentDesk(d, s.x, s.z - 0.55, t);
      d.claim(Dresser.rect(s.x, s.z - 0.25, 1.0, 1.25));
      return true;
    }
    if ((c.kind === 'clinic' || c.kind === 'bank') && s.style === 'row') {
      sideChair(
        d,
        s.x,
        s.z,
        Math.PI,
        'plastic',
        t === 'hospital' ? '#0f766e' : c.kind === 'bank' ? '#334155' : '#0e7490',
      );
      d.claim(Dresser.rect(s.x, s.z, 0.6, 0.6));
      return true;
    }
    return false;
  },
  dress: (c, d) => {
    const t = svcOf(c);
    switch (c.kind) {
      case 'clinic':
        return clinic(c, d, t);
      case 'bank':
        return bank(c, d, t);
      case 'gym':
        return gym(c, d, t);
      case 'salon':
        return salon(c, d, t);
      default:
        return school(c, d, t);
    }
  },
};

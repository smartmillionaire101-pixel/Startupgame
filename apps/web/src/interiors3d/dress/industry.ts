/**
 * Places that make, fix, store and move things: a mechanic's bay (the car on
 * the lift, the tool chest, tyres, drums), a trades workshop (benches, a saw,
 * timber), a builders' merchant (cement, rebar, timber, roofing), a courier
 * depot (a conveyor, roll cages, shelves of parcels), a warehouse (pallet
 * racks, a forklift, floor lines), a transport depot, a cold store, and the
 * air businesses' lounges (a private terminal, the skydive centre, the
 * heliport).
 */
import * as THREE from 'three';
import { BACK, RW, WALL_H } from '../roomGeom';
import { buildModel } from '../furniture';
import { mat, tone } from '../kit';
import { Dresser, jitter } from './core';
import {
  armchair,
  at,
  clothesRail,
  coffeeTable,
  counter,
  forklift,
  pallet,
  palletRack,
  packs,
  plantsAlong,
  poster,
  reception,
  rug,
  shelving,
  sofa,
  wallTv,
  windows,
} from './props';
import type { DressCtx, Family, Look } from './types';

type Ind =
  | 'mechanic'
  | 'trades'
  | 'merchant'
  | 'courier'
  | 'warehouse'
  | 'transport'
  | 'cold'
  | 'terminal'
  | 'skydive'
  | 'heliport';

function indOf(v: string): Ind {
  if (/mechanic|garage/.test(v)) return 'mechanic';
  if (/builders|merchant|hardware/.test(v)) return 'merchant';
  if (/courier/.test(v)) return 'courier';
  if (/warehouse/.test(v)) return 'warehouse';
  if (/transport|depot/.test(v)) return 'transport';
  if (/cold/.test(v)) return 'cold';
  if (/terminal/.test(v)) return 'terminal';
  if (/skydive/.test(v)) return 'skydive';
  if (/heli/.test(v)) return 'heliport';
  return 'trades';
}

const LOOKS: Record<Ind, Look> = {
  mechanic: { floor: 'concrete', floorTint: '#6b7280', wall: '#9aa5b1' },
  trades: { floor: 'concrete', wall: '#b8a98f' },
  merchant: { floor: 'concrete', wall: '#c9c1b1' },
  courier: { floor: 'concrete', wall: '#d6dbe0' },
  warehouse: { floor: 'concrete', wall: '#a8b3bf' },
  transport: { floor: 'concrete', floorTint: '#57534e', wall: '#a8a29e' },
  cold: { floor: 'tile', wall: '#eef6fb' },
  terminal: { floor: 'carpet', floorTint: '#3f4a5a', wall: '#e5e7eb' },
  skydive: { floor: 'concrete', wall: '#e0f2fe' },
  heliport: { floor: 'marble', wall: '#e2e8f0' },
};

/** A roller door on the back wall. */
function rollerDoor(d: Dresser, x: number, w = 3.2, h = 2.6) {
  d.box(w + 0.2, 0.2, 0.15, '#4b5563', x, h, BACK + 0.08);
  for (let i = 0; i < Math.floor(h / 0.12); i++)
    d.box(w, 0.1, 0.03, i % 2 ? '#9ca3af' : '#a8b0b8', x, i * 0.12, BACK + 0.03, {
      metal: 0.5,
      rough: 0.5,
    });
  for (const s of [-1, 1]) d.box(0.08, h, 0.1, '#4b5563', x + s * (w / 2 + 0.04), 0, BACK + 0.05);
  // Hazard stripes on the floor.
  for (let i = 0; i < 8; i++)
    d.box(
      w / 8,
      0.004,
      0.25,
      i % 2 ? '#111' : '#facc15',
      x - w / 2 + (w / 8) * (i + 0.5),
      0.003,
      BACK + 0.4,
      { noShadow: true },
    );
}

/** Painted lines on the floor (aisles, bays). */
function floorLine(d: Dresser, x0: number, z0: number, x1: number, z1: number, colour = '#facc15') {
  const len = Math.hypot(x1 - x0, z1 - z0);
  d.box(len, 0.004, 0.08, colour, (x0 + x1) / 2, 0.003, (z0 + z1) / 2, {
    ry: -Math.atan2(z1 - z0, x1 - x0),
    noShadow: true,
  });
}

/** An industrial lamp hung over (x, z). */
function bayLamp(d: Dresser, x: number, z: number) {
  d.cyl(0.006, 0.006, 0.6, '#111', x, WALL_H - 0.6, z);
  d.cyl(0.08, 0.32, 0.25, '#374151', x, WALL_H - 0.85, z, { metal: 0.5 });
  d.kit.add(
    new THREE.CircleGeometry(0.26, 16),
    mat('#fff7e0', { emissive: '#fff1c4', emissiveIntensity: 1.1 }),
    x,
    WALL_H - 0.86,
    z,
    { rx: Math.PI / 2, noShadow: true },
  );
}

/** A pegboard of tools on the back wall. */
function toolWall(d: Dresser, x: number, w = 2.2) {
  d.box(w, 1.1, 0.03, '#c69c6d', x, 1.0, BACK + 0.02);
  for (let i = 0; i < Math.floor(w / 0.16); i++) {
    const tx = x - w / 2 + 0.12 + i * 0.16;
    const kind = i % 4;
    if (kind === 0) d.box(0.03, 0.3, 0.02, '#6b7280', tx, 1.6, BACK + 0.05, { rz: 0.1 });
    else if (kind === 1) d.box(0.12, 0.05, 0.02, '#dc2626', tx, 1.75, BACK + 0.05);
    else if (kind === 2) d.box(0.03, 0.25, 0.02, '#1d4ed8', tx, 1.25, BACK + 0.05);
    else d.cyl(0.05, 0.05, 0.02, '#9ca3af', tx, 1.35, BACK + 0.05, { rx: Math.PI / 2 });
  }
}

/** A workbench with a vice, things on it, and a light over it. */
function workbench(d: Dresser, x: number, z: number, w = 2.2, ry = 0) {
  d.box(w, 0.07, 0.7, '#8a6544', x, 0.85, z, { ry });
  for (const s of [-1, 1]) {
    const [lx, lz] = at(x, z, ry, s * (w / 2 - 0.08), 0);
    d.box(0.08, 0.85, 0.6, '#3f3f46', lx, 0, lz, { ry });
  }
  const [sx, sz] = at(x, z, ry, 0, 0);
  d.box(w - 0.1, 0.03, 0.6, '#52525b', sx, 0.25, sz, { ry });
  const [vx2, vz2] = at(x, z, ry, -w / 2 + 0.25, 0.25);
  d.box(0.18, 0.14, 0.2, '#1d4ed8', vx2, 0.92, vz2, { ry });
  for (let i = 0; i < 4; i++) {
    const [px, pz] = at(x, z, ry, -0.3 + i * 0.3, -0.1);
    d.bit(
      0.12 + d.rng() * 0.15,
      0.05 + d.rng() * 0.1,
      0.1,
      d.pick(['#6b7280', '#ca8a04', '#dc2626', '#1f2937']),
      px,
      0.92,
      pz,
      { ry, plain: true },
    );
  }
}

/** The red rolling tool chest. */
function toolChest(d: Dresser, x: number, z: number, ry = 0) {
  d.box(0.75, 1.05, 0.5, '#b91c1c', x, 0.08, z, { ry, round: 0.02 });
  for (let i = 0; i < 6; i++) {
    const [hx, hz] = at(x, z, ry, 0, 0.255);
    d.box(0.6, 0.02, 0.02, '#e5e7eb', hx, 0.22 + i * 0.15, hz, { ry, metal: 0.7 });
  }
}

/** A stack of tyres. */
function tyres(d: Dresser, x: number, z: number, n = 4) {
  for (let i = 0; i < n; i++)
    d.kit.torus(0.3, 0.1, '#18181b', x, 0.1 + i * 0.2, z, { rx: Math.PI / 2, seg: 16 });
}

/** Oil drums. */
function drums(d: Dresser, x: number, z: number, cols: readonly string[]) {
  cols.forEach((c, i) => {
    d.cyl(0.29, 0.29, 0.88, c, x + (i % 2) * 0.62, 0, z + Math.floor(i / 2) * 0.62, {
      seg: 16,
      metal: 0.4,
      rough: 0.5,
    });
    d.kit.torus(
      0.29,
      0.015,
      tone(c, -0.15),
      x + (i % 2) * 0.62,
      0.3,
      z + Math.floor(i / 2) * 0.62,
      { rx: Math.PI / 2 },
    );
  });
}

function mechanic(_c: DressCtx, d: Dresser) {
  rollerDoor(d, 1.6, 3.4, 2.6);
  toolWall(d, -3.6, 2.6);
  workbench(d, -3.6, BACK + 0.45, 2.4);
  d.claim({ x0: -5.0, z0: BACK, x1: 3.4, z1: BACK + 0.85 });
  // The car up on the lift.
  const m = buildModel('car:hatchback', {
    w: 2,
    d: 4.5,
    tier: 1,
    tint: d.pick(['#64748b', '#b91c1c', '#1d4ed8', '#f8fafc']),
  });
  m.group.position.set(2.4, 0.95, -1.0);
  m.group.rotation.y = Math.PI / 2;
  d.root.add(m.group);
  for (const s of [-1, 1]) {
    d.box(0.25, 2.4, 0.25, '#1d4ed8', 2.4 + s * 1.9, 0, -2.2);
    d.box(1.6, 0.08, 0.15, '#f59e0b', 2.4 + s * 1.0, 0.86, -0.2);
    d.box(1.6, 0.08, 0.15, '#f59e0b', 2.4 + s * 1.0, 0.86, -1.8);
  }
  d.claim({ x0: 0.0, z0: -2.4, x1: 4.6, z1: 0.2 });
  if (d.fits(-5.3, -1.2, 0.8, 0.6)) toolChest(d, -5.3, -1.2, Math.PI / 2);
  if (d.fits(5.4, -1.8, 0.6, 1.2)) tyres(d, 5.4, -1.6, 5);
  if (d.fits(5.4, -0.6, 0.6, 0.6)) tyres(d, 5.4, -0.6, 3);
  if (d.fits(-4.8, 0.6, 1.3, 1.3)) drums(d, -5.1, 0.3, ['#1d4ed8', '#b91c1c', '#15803d']);
  for (const [x, z] of [
    [-1.0, -0.8],
    [0.8, 1.3],
    [-3.0, 0.6],
  ] as const)
    d.kit.add(
      new THREE.CircleGeometry(0.35 + d.rng() * 0.3, 14),
      mat('#1f2937', { opacity: 0.35 }),
      x,
      0.004,
      z,
      { rx: -Math.PI / 2, noShadow: true },
    );
  bayLamp(d, 2.4, -1.0);
  bayLamp(d, -3.0, -1.4);
  poster(d, -1.2, 2.2, 1.6, 0.4, 'SERVICE · TYRES', '#b91c1c');
}

function trades(_c: DressCtx, d: Dresser) {
  toolWall(d, -3.0, 3.2);
  workbench(d, -3.0, BACK + 0.45, 3.0);
  d.claim({ x0: -4.6, z0: BACK, x1: -1.4, z1: BACK + 0.85 });
  // A table saw, timber racked on the wall, offcuts, a welding corner.
  if (d.fits(1.8, -1.6, 1.6, 1.2)) {
    d.box(1.2, 0.85, 0.9, '#4b5563', 1.8, 0, -1.6);
    d.box(1.5, 0.04, 1.1, '#9ca3af', 1.8, 0.85, -1.6, { metal: 0.6 });
    d.cyl(0.18, 0.18, 0.01, '#d1d5db', 1.8, 0.86, -1.6, { rx: Math.PI / 2, metal: 0.9 });
    d.bit(1.4, 0.04, 0.25, '#d6b98c', 1.6, 0.89, -1.35, { plain: true });
  }
  for (let i = 0; i < 4; i++) d.box(0.04, 0.4, 0.5, '#3f3f46', 2.0 + i * 1.1, 0.6, BACK + 0.26);
  for (let l = 0; l < 3; l++)
    for (let k = 0; k < 5; k++)
      d.bit(
        3.6,
        0.06,
        0.1,
        jitter(d, '#d6b98c', 0.06),
        3.6,
        1.0 + l * 0.45,
        BACK + 0.08 + k * 0.1,
        { plain: true },
      );
  d.claim({ x0: 1.6, z0: BACK, x1: 5.9, z1: BACK + 0.6 });
  if (d.fits(-5.2, 0.4, 1.2, 1.0))
    for (let k = 0; k < 6; k++)
      d.bit(1.0, 0.04, 0.8, '#d6b98c', -5.2, k * 0.04, 0.4, {
        plain: true,
        ry: (d.rng() - 0.5) * 0.1,
      });
  if (d.fits(5.3, 0.2, 0.8, 0.8)) {
    d.box(0.5, 0.8, 0.4, '#1d4ed8', 5.3, 0, 0.2);
    d.cyl(0.12, 0.12, 1.2, '#15803d', 5.3, 0, 0.75);
  }
  bayLamp(d, -3.0, -1.6);
  bayLamp(d, 1.8, -1.6);
  poster(d, -0.4, 2.2, 1.5, 0.35, 'SAFETY FIRST', '#ca8a04');
}

function merchant(_c: DressCtx, d: Dresser) {
  rollerDoor(d, 3.6, 3.0, 2.5);
  // Paint and fixings on shelves, cement on pallets, rebar and roofing sheets.
  shelving(
    d,
    -3.6,
    BACK + 0.26,
    0,
    3.6,
    2.2,
    0.48,
    4,
    { frame: '#1d4ed8', shelf: '#f59e0b' },
    (x0, x1, y, _r, lz) => {
      for (let x = x0 + 0.08; x < x1 - 0.06; x += 0.2)
        d.can(
          0.085,
          0.2,
          d.pick(['#f8fafc', '#dc2626', '#16a34a', '#1d4ed8', '#facc15']),
          -3.6 + x,
          y,
          BACK + 0.26 + lz,
        );
    },
  );
  d.claim({ x0: -5.5, z0: BACK, x1: 1.9, z1: BACK + 0.6 });
  for (const [x, z] of [
    [-4.6, -1.3],
    [-3.3, -1.3],
    [0.4, -2.2],
  ] as const)
    if (d.fits(x, z, 1.2, 1.0)) pallet(d, x, z, 0, ['#9ca3af', '#a8a29e', '#78716c'], 4, true);
  if (d.fits(1.6, -0.9, 3.2, 0.7)) {
    for (let i = 0; i < 18; i++)
      d.can(
        0.012,
        3.0,
        '#7c2d12',
        0.1 + (i % 6) * 0.03,
        0.1 + Math.floor(i / 6) * 0.03,
        -0.9 + (i % 6) * 0.03,
        { rz: Math.PI / 2 },
      );
    for (const s of [0.4, 2.6]) d.box(0.1, 0.1, 0.6, '#57534e', s, 0, -0.9);
  }
  if (d.fits(-5.0, 0.6, 1.6, 1.0))
    for (let k = 0; k < 8; k++)
      d.box(1.5, 0.02, 0.9, k % 2 ? '#9ca3af' : '#b8bec6', -5.0, 0.1 + k * 0.03, 0.6, {
        metal: 0.5,
      });
  counter(d, 5.0, -1.6, -Math.PI / 2, 1.6, { body: '#57534e', top: '#f59e0b' });
  d.claim(Dresser.rect(5.0, -1.6, 1.0, 1.8));
  bayLamp(d, -3.5, -1.0);
  bayLamp(d, 1.6, -1.0);
  poster(d, -3.6, 2.6, 2.2, 0.35, 'BUILDING MATERIALS', '#1d4ed8');
}

function courier(_c: DressCtx, d: Dresser) {
  rollerDoor(d, 4.2, 2.8, 2.5);
  const browns = ['#c69c6d', '#b48a5c', '#d8b48a', '#a77b4f'];
  // Shelves of parcels, the conveyor with its load, roll cages, a scooter.
  shelving(
    d,
    -3.8,
    BACK + 0.3,
    0,
    4.2,
    2.3,
    0.56,
    4,
    { frame: '#475569', shelf: '#94a3b8' },
    packs(d, -3.8, BACK + 0.3, 0, browns, { tall: [0.18, 0.4], wide: [0.25, 0.45], fill: 0.85 }),
  );
  d.claim({ x0: -5.9, z0: BACK, x1: -1.7, z1: BACK + 0.65 });
  if (d.fits(0.8, -1.5, 4.8, 0.9)) {
    d.box(4.6, 0.12, 0.7, '#374151', 0.8, 0.75, -1.5);
    d.box(4.6, 0.02, 0.6, '#111', 0.8, 0.87, -1.5);
    for (let i = 0; i < 6; i++) d.box(0.06, 0.75, 0.6, '#6b7280', -1.3 + i * 0.84, 0, -1.5);
    for (let i = 0; i < 7; i++)
      d.bit(
        0.3 + d.rng() * 0.2,
        0.2 + d.rng() * 0.2,
        0.3 + d.rng() * 0.15,
        d.pick(browns),
        -1.1 + i * 0.62,
        0.89,
        -1.5,
        { ry: (d.rng() - 0.5) * 0.4 },
      );
    d.box(0.5, 0.6, 0.3, '#1f2937', 3.3, 0.9, -1.85);
    d.screenAt(0.4, 0.3, 3.3, 1.25, -1.69);
  }
  for (const [x, z] of [
    [-5.2, 0.6],
    [-4.4, 0.6],
    [5.3, -0.6],
  ] as const) {
    if (!d.fits(x, z, 0.75, 0.75)) continue;
    for (const s of [-1, 1])
      d.box(0.7, 1.6, 0.02, '#9ca3af', x, 0.1, z + s * 0.35, { opacity: 0.6 });
    d.box(0.02, 1.6, 0.7, '#9ca3af', x - 0.35, 0.1, z);
    for (let k = 0; k < 6; k++)
      d.bit(
        0.3,
        0.25,
        0.3,
        d.pick(browns),
        x - 0.15 + (k % 2) * 0.3,
        0.12 + Math.floor(k / 2) * 0.26,
        z,
        { ry: d.rng() * 0.3 },
      );
  }
  floorLine(d, -5.9, -0.6, 5.9, -0.6);
  bayLamp(d, -3.8, -1.2);
  bayLamp(d, 0.8, -1.2);
  poster(d, -3.8, 2.75, 2.4, 0.3, 'SORTING', '#ea580c');
}

function warehouse(_c: DressCtx, d: Dresser) {
  rollerDoor(d, 4.4, 2.6, 2.6);
  palletRack(d, -2.6, BACK + 0.55, 0, 5.6, 3, 2.8);
  d.claim({ x0: -5.5, z0: BACK, x1: 0.3, z1: BACK + 1.1 });
  if (d.fits(-4.4, -1.0, 1.2, 1.0)) pallet(d, -4.4, -1.0, 0, ['#c69c6d', '#b48a5c'], 3);
  if (d.fits(0.8, -1.2, 1.2, 1.0)) {
    pallet(d, 0.8, -1.2, 0.2, ['#e2e8f0'], 3);
    d.box(1.1, 0.88, 0.9, '#f1f5f9', 0.8, 0.13, -1.2, { opacity: 0.4, ry: 0.2 });
  }
  if (d.fits(2.6, -1.4, 1.2, 2.4)) forklift(d, 2.6, -1.4, Math.PI * 0.85);
  floorLine(d, -5.9, -1.95, 3.2, -1.95);
  floorLine(d, -5.9, 0.25, 5.9, 0.25);
  for (const x of [-2, 2]) floorLine(d, x, 0.25, x, 2.8, '#f8fafc');
  bayLamp(d, -3.0, -0.9);
  bayLamp(d, 2.0, -0.9);
}

function transport(_c: DressCtx, d: Dresser) {
  rollerDoor(d, 2.4, 4.4, 2.7);
  const van = buildModel('car:city-suv', {
    w: 2,
    d: 4.5,
    tier: 1,
    tint: d.pick(['#f8fafc', '#facc15', '#1d4ed8']),
  });
  van.group.position.set(2.3, 0, -1.3);
  van.group.rotation.y = Math.PI / 2 + 0.08;
  d.root.add(van.group);
  d.claim({ x0: -0.1, z0: -2.6, x1: 4.7, z1: 0.0 });
  // The dispatch desk and the timetable board, drums and tyres.
  d.box(2.0, 1.2, 0.03, '#111827', -3.6, 1.0, BACK + 0.02);
  for (let i = 0; i < 6; i++)
    d.box(1.6, 0.04, 0.01, i % 2 ? '#facc15' : '#f8fafc', -3.6, 1.95 - i * 0.16, BACK + 0.04, {
      emissive: '#fde68a',
      emissiveIntensity: 0.3,
    });
  if (d.fits(-3.6, -2.3, 1.5, 1.1)) {
    d.box(1.4, 0.04, 0.7, '#a8a29e', -3.6, 0.74, -2.4);
    for (const s of [-1, 1]) d.box(0.06, 0.74, 0.6, '#3f3f46', -3.6 + s * 0.65, 0, -2.4);
    d.box(0.5, 0.32, 0.03, '#111', -3.6, 0.82, -2.6);
  }
  if (d.fits(-5.3, 0.4, 1.3, 1.3)) drums(d, -5.5, 0.1, ['#dc2626', '#dc2626', '#1d4ed8']);
  if (d.fits(5.4, 1.0, 0.6, 0.6)) tyres(d, 5.4, 1.0, 4);
  floorLine(d, -0.2, -2.8, -0.2, 0.2);
  floorLine(d, 4.9, -2.8, 4.9, 0.2);
  bayLamp(d, 2.3, -1.3);
  poster(d, -3.6, 2.4, 2.0, 0.3, 'DEPARTURES', '#111827', '#facc15');
}

function cold(_c: DressCtx, d: Dresser) {
  // Insulated panels, the cold-room door with its strip curtain, freezers, crates.
  for (let i = 0; i < 12; i++) d.box(0.02, WALL_H, 0.02, '#cbd5e1', -RW / 2 + i, 0, BACK + 0.02);
  d.box(2.2, 2.4, 0.08, '#e2e8f0', 3.2, 0, BACK + 0.05, { metal: 0.4, rough: 0.4 });
  for (let i = 0; i < 9; i++)
    d.box(0.2, 2.3, 0.01, '#bfdbfe', 2.3 + i * 0.22, 0.05, BACK + 0.12, { opacity: 0.55 });
  d.claim({ x0: 2.0, z0: BACK, x1: 4.4, z1: BACK + 0.5 });
  for (let i = 0; i < 3; i++) {
    const x = -4.8 + i * 1.4;
    d.box(1.3, 0.85, 0.7, '#f8fafc', x, 0, BACK + 0.4, { round: 0.03 });
    d.kit.add(new THREE.BoxGeometry(1.2, 0.02, 0.6), d.glass, x, 0.86, BACK + 0.4, {
      noShadow: true,
    });
    for (let k = 0; k < 6; k++)
      d.bit(
        0.3,
        0.06,
        0.2,
        d.pick(['#fca5a5', '#fde68a', '#bae6fd']),
        x - 0.4 + (k % 3) * 0.4,
        0.78,
        BACK + 0.3 + Math.floor(k / 3) * 0.2,
        { plain: true },
      );
  }
  d.claim({ x0: -5.6, z0: BACK, x1: -1.2, z1: BACK + 0.8 });
  for (const [x, z] of [
    [-3.6, -1.4],
    [0.4, -2.1],
    [5.0, -1.5],
  ] as const) {
    if (!d.fits(x, z, 1.2, 1.0)) continue;
    d.box(1.1, 0.13, 0.9, '#2563eb', x, 0, z);
    for (let t = 0; t < 3; t++)
      for (let k = 0; k < 2; k++)
        d.bit(
          0.5,
          0.25,
          0.4,
          d.pick(['#1d4ed8', '#f8fafc', '#16a34a']),
          x - 0.27 + k * 0.54,
          0.13 + t * 0.26,
          z,
          { plain: true },
        );
  }
  floorLine(d, -5.9, -0.2, 5.9, -0.2, '#38bdf8');
  poster(d, -0.4, 2.3, 1.8, 0.35, '−18 °C', '#0369a1');
}

function lounge(c: DressCtx, d: Dresser, t: Ind) {
  windows(d, -5.8, 1.2, { night: c.night, view: 'apron', sill: 0.5, top: 2.7, frame: '#475569' });
  d.claim({ x0: -5.9, z0: BACK, x1: 1.4, z1: BACK + 0.3 });
  reception(d, 3.6, -2.3, 2.6, {
    body: t === 'skydive' ? '#0ea5e9' : '#1f2937',
    top: '#e5e7eb',
    logo: c.sign,
    logoColour: t === 'skydive' ? '#0369a1' : '#111827',
  });
  d.claim(Dresser.rect(3.6, -2.5, 2.8, 1.4));
  if (t === 'skydive') {
    // Packing mats with canopies, jumpsuits on a rail, helmets.
    for (const [x, z] of [
      [-3.8, -1.6],
      [-1.0, -1.8],
    ] as const) {
      if (!d.fits(x, z, 2.4, 1.1)) continue;
      d.bit(2.2, 0.02, 1.0, '#334155', x, 0, z, { plain: true });
      for (let k = 0; k < 7; k++)
        d.bit(
          1.8,
          0.03,
          0.12,
          ['#dc2626', '#f8fafc', '#facc15', '#1d4ed8'][k % 4]!,
          x,
          0.02 + k * 0.008,
          z - 0.35 + k * 0.11,
          { plain: true, ry: (d.rng() - 0.5) * 0.1 },
        );
    }
    clothesRail(d, -4.6, 1.0, 0, 1.6, ['#dc2626', '#1d4ed8', '#facc15', '#111827']);
    shelving(d, 5.2, -0.6, -Math.PI / 2, 1.6, 1.4, 0.4, 3, {}, (x0, x1, y, _r, lz) => {
      for (let x = x0 + 0.1; x < x1; x += 0.24) {
        const [px, pz] = at(5.2, -0.6, -Math.PI / 2, x, lz);
        d.ball(0.11, d.pick(['#111827', '#f8fafc', '#dc2626']), px, y + 0.1, pz, 0.8);
      }
    });
    wallTv(d, 4.6, 1.9, 1.0);
  } else {
    rug(d, -2.4, 1.0, 5.0, 2.6, '#334155');
    for (const [x, z, ry] of [
      [-4.2, 0.2, 0.4],
      [-1.0, 0.0, -0.3],
      [1.4, 1.2, -0.8],
    ] as const)
      if (d.fits(x, z, 0.95, 0.95)) armchair(d, x, z, ry, t === 'terminal' ? '#e7e1d7' : '#475569');
    if (d.fits(-2.6, 0.4, 0.9, 0.6)) coffeeTable(d, -2.6, 0.4, 0.9, 0.55, 0, '#1f2937');
    if (d.fits(-4.4, 2.5, 2.0, 0.9))
      sofa(d, -4.4, 2.6, Math.PI, 1.9, t === 'terminal' ? '#8a6e57' : '#334155', 'sofa');
    if (t === 'heliport')
      for (let i = 0; i < 4; i++) d.ball(0.13, '#f8fafc', 5.0 + i * 0.25, 1.15, BACK + 0.25, 0.85);
    poster(
      d,
      0.3,
      2.45,
      1.6,
      0.3,
      t === 'terminal' ? 'DEPARTURES' : 'HELIPAD',
      '#111827',
      '#facc15',
    );
  }
  plantsAlong(d, [5.6, 1.9], 2.5, [3, 2]);
}

export const industry: Family = {
  look: (c) => LOOKS[indOf(c.variant)],
  dress: (c, d) => {
    const t = indOf(c.variant);
    if (t === 'mechanic') mechanic(c, d);
    else if (t === 'merchant') merchant(c, d);
    else if (t === 'courier') courier(c, d);
    else if (t === 'warehouse') warehouse(c, d);
    else if (t === 'transport') transport(c, d);
    else if (t === 'cold') cold(c, d);
    else if (t === 'terminal' || t === 'skydive' || t === 'heliport') lounge(c, d, t);
    else trades(c, d);
  },
};

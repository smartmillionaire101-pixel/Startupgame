/**
 * The hotel's own furniture (../home/hotel.ts `HOTEL_MODELS` and the plans'
 * decor): what makes a budget room, a business room and a suite feel like
 * three price steps. A budget room's open wardrobe niche and its desk; a
 * business room's walk-in shower, vanity, ergonomic chair, tea tray and TV
 * console; a suite's TV wall, marble coffee table, dining table for four
 * under a pendant, bar with a wine fridge (no cooker), freestanding tub,
 * rain shower, double basins, walk-in wardrobe, art, lamps and plants.
 *
 * Each model is built in its own frame like ./furniture.ts: the footprint
 * w × d centred on the origin, the back at z = −d/2, facing +z, the floor at
 * y = 0. Low poly; the kit merges each into a few meshes.
 */
import * as THREE from 'three';
import { BUILDERS as FURNITURE, type Builder, type Model } from './furniture';
import { Kit, RUG_Y, mat, paintingTexture, rugTexture, screenTexture, tone } from './kit';

const metal = { metal: 0.6, rough: 0.35 };
const brass = { metal: 0.75, rough: 0.3 };
const glass = { opacity: 0.32, rough: 0.05, noShadow: true };
const CHROME = '#d9dde3';
const BRASS = '#c9a35a';
const WALNUT = '#5a3a24';
const OAK = '#b98b5b';
const MARBLE = '#f1ece4';
const VEIN = '#d8d0c4';
const LINEN = '#efe7da';
const INK = '#1d1d22';
const WHITE = '#f8f6f1';

/** A warm lamp the room lights by (Home3D lights the brightest few). */
const lamp = (m: Model, x: number, y: number, z: number, intensity = 2.2, distance = 4.5) =>
  m.lamps.push({ pos: new THREE.Vector3(x, y, z), color: '#ffcf8a', intensity, distance });

/** A glowing lampshade. */
const shade = (k: Kit, r0: number, r1: number, h: number, x: number, y: number, z: number) =>
  k.cyl(r0, r1, h, '#fff1d6', x, y, z, {
    emissive: '#ffd38a',
    emissiveIntensity: 0.9,
    rough: 0.9,
    seg: 14,
  });

/** A TV screen that flickers while you watch. */
function screen(k: Kit, m: Model, w: number, h: number, x: number, y: number, z: number) {
  const sm = mat('#ffffff', {
    own: true,
    map: screenTexture('film'),
    emissive: '#ffffff',
    emissiveIntensity: 0,
    rough: 0.25,
  });
  sm.emissiveMap = sm.map;
  sm.color.set('#20242c');
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), sm);
  mesh.position.set(x, y, z);
  k.keep(mesh);
  m.screens.push(sm);
  m.parts.screen = mesh;
}

/** A vase of flowers (or a bowl of green). */
const flowers = (k: Kit, x: number, y: number, z: number, s = 1) => {
  k.cyl(0.06 * s, 0.05 * s, 0.22 * s, '#e7e5e4', x, y, z, { rough: 0.3, seg: 10 });
  for (let i = 0; i < 5; i++)
    k.sphere(
      0.06 * s,
      ['#f9a8d4', '#fde68a', '#ffffff', '#fca5a5', '#f9a8d4'][i]!,
      x + Math.cos(i * 1.3) * 0.07 * s,
      y + 0.27 * s + (i % 2) * 0.05 * s,
      z + Math.sin(i * 1.3) * 0.07 * s,
      { seg: 6 },
    );
  k.sphere(0.1 * s, '#4d8a40', x, y + 0.24 * s, z, { seg: 7, sy: 0.6 });
};

/** A stack of books. */
const books = (k: Kit, x: number, y: number, z: number) => {
  ['#1e3a5f', '#b45309', '#e7e5e4'].forEach((c, i) =>
    k.box(0.26 - i * 0.03, 0.04, 0.19, c, x, y + i * 0.04, z, { rough: 0.8 }),
  );
};

/** A chair (seat, back, four legs), facing +z, at (x, z). */
function chair(k: Kit, x: number, z: number, ry: number, c: string, legs = WALNUT) {
  const g = new Kit();
  g.box(0.44, 0.08, 0.44, c, 0, 0.42, 0, { round: 0.03 });
  g.box(0.44, 0.48, 0.07, c, 0, 0.48, -0.2, { round: 0.03 });
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) g.box(0.04, 0.42, 0.04, legs, sx * 0.18, 0, sz * 0.18);
  const grp = g.build();
  grp.position.set(x, 0, z);
  grp.rotation.y = ry;
  k.keep(grp);
}

// ---------------------------------------------------------------- Bedroom

const hotelNightstand: Builder = (k, o, m) => {
  const lux = o.tier >= 3;
  const z = -o.d / 2 + 0.26;
  k.box(0.5, 0.52, 0.42, lux ? WALNUT : OAK, 0, 0, z, { round: 0.02 });
  k.box(0.52, 0.03, 0.44, lux ? MARBLE : tone(OAK, 0.1), 0, 0.52, z, { rough: 0.3 });
  k.box(0.18, 0.02, 0.01, BRASS, 0, 0.36, z + 0.21, brass);
  // A bedside lamp.
  k.cyl(0.06, 0.08, 0.04, lux ? BRASS : '#e5e7eb', 0.06, 0.55, z - 0.04, lux ? brass : {});
  k.cyl(0.012, 0.012, 0.28, lux ? BRASS : '#9ca3af', 0.06, 0.58, z - 0.04, brass);
  shade(k, 0.1, 0.14, 0.2, 0.06, 0.82, z - 0.04);
  lamp(m, 0.06, 0.9, z, lux ? 1.8 : 1.4, 3.2);
};

const bedBench: Builder = (k, o) => {
  const w = Math.min(o.w - 0.3, 1.5);
  const c = o.tier >= 3 ? '#7a5c4a' : '#3f5872';
  k.box(w, 0.12, 0.42, c, 0, 0.32, -0.15, { round: 0.05, rough: 0.6 });
  for (const sx of [-1, 1])
    k.box(0.04, 0.32, 0.36, o.tier >= 3 ? BRASS : WALNUT, (sx * (w - 0.1)) / 2, 0, -0.15, metal);
};

/** A suite's bed: the king bed, a tall upholstered headboard panel, a throw and cushions. */
const suiteBed: Builder = (k, o, m) => {
  FURNITURE.bed!(k, { ...o, tier: 3 }, m);
  const z0 = -o.d / 2 + 0.03;
  k.box(o.w + 1.9, 1.5, 0.06, '#8a6d55', 0, 0, z0 - 0.02, { round: 0.02, rough: 0.8 });
  for (let i = 0; i < 7; i++)
    k.box(
      0.02,
      1.5,
      0.02,
      tone('#8a6d55', -0.2),
      -o.w / 2 - 0.9 + (i + 0.5) * ((o.w + 1.8) / 7),
      0,
      z0 + 0.02,
    );
  k.box(1.95, 0.05, 0.5, '#6b3f2a', 0, 0.54, z0 + 2.0 - 0.3, { round: 0.02 });
  for (const [x, c] of [
    [-0.45, '#c2a27c'],
    [0.45, '#c2a27c'],
    [0, '#6b3f2a'],
  ] as const)
    k.box(0.4, 0.3, 0.12, c, x, 0.56, z0 + 0.5, { round: 0.05, rx: -0.2 });
};

// ---------------------------------------------------------------- Living

const sideTable: Builder = (k, _o, m) => {
  k.cyl(0.24, 0.24, 0.03, MARBLE, 0, 0.52, 0, { rough: 0.25, seg: 20 });
  k.cyl(0.03, 0.03, 0.52, BRASS, 0, 0, 0, brass);
  k.cyl(0.16, 0.18, 0.02, BRASS, 0, 0, 0, brass);
  k.cyl(0.05, 0.07, 0.25, '#1f2937', 0.05, 0.55, -0.04, { rough: 0.4 });
  shade(k, 0.1, 0.15, 0.18, 0.05, 0.8, -0.04);
  lamp(m, 0.05, 0.9, 0, 1.6, 3.5);
};

const floorLamp: Builder = (k, o, m) => {
  const lux = o.tier >= 3;
  k.cyl(0.16, 0.18, 0.03, lux ? BRASS : INK, 0, 0, 0, brass);
  k.cyl(0.014, 0.014, 1.45, lux ? BRASS : INK, 0, 0.03, 0, brass);
  shade(k, 0.17, 0.24, 0.32, 0, 1.4, 0);
  lamp(m, 0, 1.4, 0, 2.6, 5);
};

const tallPlant: Builder = (k, o) => {
  k.cyl(0.2, 0.16, 0.42, o.tier >= 3 ? '#e7e2d8' : '#57534e', 0, 0, 0, { rough: 0.5, seg: 14 });
  k.cyl(0.02, 0.025, 0.9, '#6b4f2a', 0, 0.4, 0, { seg: 6 });
  const leaf = ['#2f6b3a', '#3f8a4a', '#4d9a52'];
  for (let i = 0; i < 9; i++) {
    const a = i * 2.4;
    const y = 0.75 + (i % 3) * 0.28;
    k.sphere(0.2, leaf[i % 3]!, Math.cos(a) * 0.18, y, Math.sin(a) * 0.18, {
      sx: 1.3,
      sy: 0.55,
      sz: 0.8,
      ry: a,
      seg: 7,
    });
  }
};

const hotelArt: Builder = (k, o) => {
  // Hung at eye height on the wall behind (z = −d/2).
  const w = Math.min(o.w * 0.62, 1.4);
  const h = o.w > 1.5 ? 0.7 : 0.62;
  const z = -o.d / 2 + 0.03;
  const y = o.w > 1.5 ? 1.55 : 1.25;
  k.box(w + 0.08, h + 0.08, 0.04, o.tier >= 3 ? BRASS : '#2a2a2e', 0, y, z, brass);
  k.add(
    new THREE.PlaneGeometry(w, h),
    mat('#ffffff', { map: paintingTexture(o.seed ?? 3), rough: 0.8 }),
    0,
    y + h / 2 + 0.04,
    z + 0.025,
    { noShadow: true },
  );
};

const hotelTv: Builder = (k, o, m) => {
  // A low console against the wall, the TV on it.
  const w = Math.min(o.w - 0.2, o.tier >= 2 ? 1.6 : 1.1);
  const z = -o.d / 2 + 0.24;
  k.box(w, 0.48, 0.42, o.tier >= 2 ? WALNUT : OAK, 0, 0.08, z, { round: 0.02 });
  for (const sx of [-1, 1]) k.box(0.04, 0.08, 0.3, INK, (sx * (w - 0.2)) / 2, 0, z);
  const tw = o.tier >= 2 ? 1.25 : 0.85;
  const th = tw * 0.58;
  k.box(tw + 0.04, th + 0.04, 0.05, INK, 0, 0.62, z - 0.08, { rough: 0.3 });
  k.box(0.3, 0.06, 0.18, INK, 0, 0.56, z - 0.06);
  screen(k, m, tw, th, 0, 0.64 + th / 2, z - 0.05);
};

const teaTray: Builder = (k, o) => {
  const z = -o.d / 2 + 0.24;
  k.box(0.8, 0.82, 0.42, WALNUT, 0, 0, z, { round: 0.02 });
  k.box(0.82, 0.03, 0.44, MARBLE, 0, 0.82, z, { rough: 0.25 });
  // A glowing minibar door, a kettle, cups, a capsule machine.
  k.box(0.36, 0.5, 0.02, '#2a2d33', -0.18, 0.12, z + 0.21, { rough: 0.3 });
  k.box(0.5, 0.02, 0.3, '#6b4f3a', 0.04, 0.85, z, { round: 0.01 });
  k.cyl(0.07, 0.08, 0.18, CHROME, -0.22, 0.85, z, metal);
  k.box(0.14, 0.24, 0.2, INK, 0.25, 0.85, z - 0.04, { round: 0.02 });
  for (const sx of [-0.04, 0.08]) k.cyl(0.035, 0.03, 0.06, WHITE, sx, 0.87, z + 0.06, { seg: 10 });
};

const hotelDesk: Builder = (k, o) => {
  // The desk along the wall (x across the footprint), a chair at it.
  const w = Math.min(o.w - 0.1, 1.4);
  const biz = o.tier >= 2;
  const z = -o.d / 2 + 0.3;
  k.box(w, 0.04, 0.56, biz ? WALNUT : OAK, 0, 0.72, z, { round: 0.01 });
  for (const sx of [-1, 1]) k.box(0.04, 0.72, 0.5, biz ? INK : OAK, (sx * (w - 0.06)) / 2, 0, z);
  k.box(0.36, 0.04, 0.24, '#d6d3d1', -0.2, 0.76, z - 0.04);
  books(k, w / 2 - 0.22, 0.76, z - 0.08);
  // A desk lamp.
  k.cyl(0.06, 0.07, 0.02, INK, w / 2 - 0.2, 0.76, z - 0.15, metal);
  k.cyl(0.01, 0.01, 0.34, INK, w / 2 - 0.2, 0.78, z - 0.15, metal);
  k.cyl(0.04, 0.08, 0.1, '#fff1d6', w / 2 - 0.2, 1.08, z - 0.08, {
    emissive: '#ffd38a',
    emissiveIntensity: 0.8,
  });
  const cz = z + 0.48;
  if (biz) {
    // An ergonomic chair: a five-star base, a mesh back, arms.
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      k.box(0.03, 0.03, 0.28, INK, Math.sin(a) * 0.13, 0.04, cz + Math.cos(a) * 0.13, { ry: a });
    }
    k.cyl(0.025, 0.025, 0.36, CHROME, 0, 0.06, cz, metal);
    k.box(0.48, 0.08, 0.46, '#2b2f36', 0, 0.42, cz, { round: 0.03 });
    k.box(0.46, 0.56, 0.05, '#3a3f47', 0, 0.56, cz + 0.24, { round: 0.04, rx: 0.12 });
    k.box(0.32, 0.12, 0.04, '#2b2f36', 0, 0.62, cz + 0.22, { round: 0.02 });
    for (const sx of [-1, 1]) k.box(0.05, 0.03, 0.28, INK, sx * 0.25, 0.64, cz, metal);
  } else chair(k, 0, cz, Math.PI, '#9a6a3f', OAK);
};

const writingDesk: Builder = (k, o, m) => {
  const z = -o.d / 2 + 0.28;
  k.box(0.9, 0.04, 0.5, WALNUT, 0, 0.74, z, { round: 0.01 });
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) k.box(0.03, 0.74, 0.03, BRASS, sx * 0.42, 0, z + sz * 0.22, brass);
  k.box(0.32, 0.02, 0.22, '#e7e2d8', -0.15, 0.78, z);
  k.cyl(0.05, 0.06, 0.3, BRASS, 0.3, 0.78, z - 0.1, brass);
  shade(k, 0.08, 0.12, 0.14, 0.3, 1.06, z - 0.1);
  lamp(m, 0.3, 1.1, z, 1.2, 3);
  chair(k, 0, z + 0.45, Math.PI, '#7a5c4a');
};

const hotelTvWall: Builder = (k, o, m) => {
  // A walnut panelled wall with a big TV and a long low console.
  const w = o.w - 0.1;
  const z = -o.d / 2;
  k.box(w, 2.4, 0.08, WALNUT, 0, 0, z + 0.05, { rough: 0.6 });
  for (let i = 1; i < 6; i++)
    k.box(0.015, 2.4, 0.02, tone(WALNUT, -0.25), -w / 2 + (i * w) / 6, 0, z + 0.1);
  k.box(w - 0.2, 0.4, 0.42, '#2a211b', 0, 0.12, z + 0.3, { round: 0.02 });
  k.box(w - 0.2, 0.02, 0.43, BRASS, 0, 0.52, z + 0.3, brass);
  const tw = Math.min(1.8, w - 0.5);
  const th = tw * 0.56;
  k.box(tw + 0.04, th + 0.04, 0.04, INK, 0, 0.9, z + 0.11);
  screen(k, m, tw, th, 0, 0.92 + th / 2, z + 0.135);
  // A soundbar, a strip of light under the console.
  k.box(tw * 0.6, 0.06, 0.08, INK, 0, 0.56, z + 0.2);
  k.box(w - 0.3, 0.02, 0.02, '#ffd38a', 0, 0.1, z + 0.5, {
    emissive: '#ffd38a',
    emissiveIntensity: 1,
    noShadow: true,
  });
  flowers(k, -w / 2 + 0.35, 0.54, z + 0.3, 0.9);
};

const hotelCoffeeTable: Builder = (k, o, m) => {
  const w = Math.min(o.w - 0.4, 1.4);
  const d = Math.min(o.d - 0.3, 0.7);
  k.box(w, 0.05, d, MARBLE, 0, 0.36, 0, { round: 0.03, rough: 0.2 });
  k.box(w - 0.4, 0.02, 0.02, VEIN, 0, 0.412, -0.1, { noShadow: true });
  k.box(w * 0.7, 0.36, d * 0.55, '#2a211b', 0, 0, 0, { round: 0.02 });
  books(k, -w * 0.28, 0.41, 0);
  flowers(k, w * 0.25, 0.41, 0, 0.8);
  m.top = 0.41;
};

const suiteRug: Builder = (k, o) => {
  const tex = rugTexture(o.tier >= 3 ? 3 : 2, o.tier >= 3 ? '#8b6f5a' : '#56677c');
  k.add(
    new THREE.PlaneGeometry(o.w - 0.1, o.d - 0.1),
    mat('#ffffff', { map: tex, rough: 1 }),
    0,
    RUG_Y,
    0,
    { rx: -Math.PI / 2, noShadow: true },
  );
};

const roundRug: Builder = (k, o) => {
  k.cyl(Math.min(o.w, o.d) / 2 - 0.1, Math.min(o.w, o.d) / 2 - 0.1, 0.012, '#7d2e3a', 0, 0, 0, {
    seg: 32,
    noShadow: true,
    rough: 1,
  });
  k.cyl(Math.min(o.w, o.d) / 2 - 0.3, Math.min(o.w, o.d) / 2 - 0.3, 0.014, '#c9a24a', 0, 0, 0, {
    seg: 32,
    noShadow: true,
    rough: 1,
  });
  k.cyl(Math.min(o.w, o.d) / 2 - 0.36, Math.min(o.w, o.d) / 2 - 0.36, 0.016, '#7d2e3a', 0, 0, 0, {
    seg: 32,
    noShadow: true,
    rough: 1,
  });
};

const hotelDining: Builder = (k, o, m) => {
  // A table for four, a pendant over it.
  const w = Math.min(o.w - 0.6, 1.4);
  const d = Math.min(o.d - 0.9, 0.9);
  k.box(w, 0.05, d, WALNUT, 0, 0.72, 0, { round: 0.02, rough: 0.4 });
  for (const sx of [-1, 1]) k.box(0.06, 0.72, d - 0.2, '#2a211b', (sx * (w - 0.3)) / 2, 0, 0);
  for (const sx of [-1, 1])
    for (const sz of [-1, 1])
      chair(k, sx * w * 0.24, sz * (d / 2 + 0.28), sz > 0 ? Math.PI : 0, LINEN);
  // Place settings and a candle.
  for (const sx of [-1, 1])
    for (const sz of [-1, 1])
      k.cyl(0.11, 0.11, 0.01, WHITE, sx * w * 0.24, 0.77, sz * (d / 2 - 0.16), { seg: 14 });
  k.cyl(0.03, 0.03, 0.14, '#fff7e0', 0, 0.77, 0, { emissive: '#ffd38a', emissiveIntensity: 0.6 });
  k.cyl(0.004, 0.004, 0.75, INK, 0, 1.75, 0);
  k.cyl(0.12, 0.3, 0.22, BRASS, 0, 1.55, 0, { ...brass, seg: 18 });
  k.cyl(0.24, 0.24, 0.01, '#fff1d6', 0, 1.55, 0, {
    emissive: '#ffd38a',
    emissiveIntensity: 1.2,
    seg: 18,
  });
  lamp(m, 0, 1.45, 0, 2.4, 4.5);
};

const suiteBar: Builder = (k, o) => {
  // The bar on the wall: a cabinet, a wine fridge, bottles and glasses on a
  // mirrored shelf, an espresso machine. No cooker.
  const w = Math.min(o.w - 0.1, 1.8);
  const z = -o.d / 2 + 0.3;
  k.box(w, 0.9, 0.55, '#2a211b', 0, 0, z, { round: 0.02 });
  k.box(w + 0.04, 0.04, 0.58, MARBLE, 0, 0.9, z, { rough: 0.2 });
  k.box(0.5, 0.74, 0.02, '#1b1f27', -w / 2 + 0.32, 0.08, z + 0.28, { rough: 0.15 });
  k.box(0.44, 0.66, 0.01, '#f59e0b', -w / 2 + 0.32, 0.12, z + 0.29, {
    emissive: '#f59e0b',
    emissiveIntensity: 0.25,
    opacity: 0.5,
    noShadow: true,
  });
  k.box(w, 1.1, 0.04, '#9fb4c0', 0, 1.15, -o.d / 2 + 0.03, { metal: 0.6, rough: 0.08 });
  k.box(w - 0.1, 0.03, 0.22, BRASS, 0, 1.55, -o.d / 2 + 0.14, brass);
  for (let i = 0; i < 6; i++)
    k.cyl(
      0.035,
      0.04,
      0.26,
      ['#14532d', '#7c2d12', '#1e3a8a', '#a16207'][i % 4]!,
      -w / 2 + 0.2 + i * ((w - 0.4) / 5),
      1.58,
      -o.d / 2 + 0.14,
      { rough: 0.2, seg: 8 },
    );
  for (let i = 0; i < 4; i++)
    k.cyl(0.03, 0.02, 0.1, '#e0f2fe', -0.1 + i * 0.1, 0.94, z + 0.08, { ...glass, seg: 8 });
  k.box(0.26, 0.32, 0.28, CHROME, w / 2 - 0.25, 0.94, z - 0.04, metal);
};

const sideboard: Builder = (k, o, m) => {
  const w = Math.min(o.w - 0.15, 1.7);
  const z = -o.d / 2 + 0.25;
  k.box(w, 0.66, 0.44, WALNUT, 0, 0.1, z, { round: 0.02 });
  for (const sx of [-1, 1]) k.box(0.03, 0.1, 0.36, BRASS, (sx * (w - 0.1)) / 2, 0, z, brass);
  for (let i = 1; i < 3; i++)
    k.box(0.01, 0.6, 0.01, '#2a211b', -w / 2 + (i * w) / 3, 0.12, z + 0.22);
  k.box(w + 0.02, 0.03, 0.46, MARBLE, 0, 0.76, z, { rough: 0.25 });
  if (w > 1.2) {
    k.cyl(0.08, 0.1, 0.36, '#e7e2d8', -w / 2 + 0.3, 0.79, z, { seg: 12 });
    shade(k, 0.14, 0.2, 0.22, -w / 2 + 0.3, 1.15, z);
    lamp(m, -w / 2 + 0.3, 1.3, z, 1.6, 3.5);
    flowers(k, w / 2 - 0.3, 0.79, z);
  } else flowers(k, 0, 0.79, z, 0.9);
};

const foyerConsole: Builder = (k, o, m) => {
  const w = Math.min(o.w - 0.2, 1.5);
  const z = -o.d / 2 + 0.2;
  k.box(w, 0.04, 0.34, WALNUT, 0, 0.82, z, { round: 0.01 });
  for (const sx of [-1, 1]) k.box(0.04, 0.82, 0.3, BRASS, (sx * (w - 0.06)) / 2, 0, z, brass);
  flowers(k, -w / 4, 0.86, z, 1.3);
  k.box(0.18, 0.05, 0.14, BRASS, w / 4, 0.86, z, brass);
  // A round mirror over it.
  k.cyl(0.38, 0.38, 0.03, BRASS, 0, 1.55, -o.d / 2 + 0.02, { rx: Math.PI / 2, ...brass, seg: 24 });
  k.cyl(0.34, 0.34, 0.03, '#cfe3ea', 0, 1.55, -o.d / 2 + 0.035, {
    rx: Math.PI / 2,
    metal: 0.6,
    rough: 0.05,
    seg: 24,
  });
  lamp(m, 0, 1.6, z + 0.3, 1.4, 3);
};

const dressMirror: Builder = (k, o) => {
  const z = -o.d / 2 + 0.06;
  k.box(0.62, 1.8, 0.05, BRASS, 0, 0.05, z, brass);
  k.box(0.54, 1.72, 0.02, '#cfe3ea', 0, 0.09, z + 0.03, { metal: 0.6, rough: 0.05 });
  k.box(0.5, 0.36, 0.4, '#c2a27c', 0, 0, z + 0.45, { round: 0.06 });
};

const wardrobeNiche: Builder = (k, o) => {
  // A budget room's open niche: a rail, a few hangers, a shelf, a luggage rack.
  const w = Math.min(o.w - 0.1, 1.6);
  const z = -o.d / 2 + 0.3;
  k.box(w, 0.03, 0.5, '#d6cfc4', 0, 1.7, z);
  k.cyl(0.015, 0.015, w - 0.1, CHROME, 0, 1.6, z, { rz: Math.PI / 2, ...metal });
  for (let i = 0; i < 4; i++)
    k.box(
      0.05,
      0.6,
      0.4,
      ['#64748b', '#e5e7eb', '#1e3a5f', '#d6cfc4'][i]!,
      -w / 2 + 0.25 + i * 0.22,
      0.98,
      z,
      {
        round: 0.02,
      },
    );
  k.box(w - 0.1, 0.04, 0.45, OAK, 0, 0.42, z);
  for (const sx of [-1, 1]) k.box(0.03, 0.42, 0.4, CHROME, (sx * (w - 0.2)) / 2, 0, z, metal);
};

const walkInWardrobe: Builder = (k, o) => {
  // Open walnut shelving down the wall: hanging suits and dresses, shelves of
  // folded things, drawers, a strip of light.
  const w = o.w - 0.1;
  const z = -o.d / 2 + 0.3;
  k.box(w, 2.3, 0.04, '#3b2618', 0, 0, -o.d / 2 + 0.03);
  for (let i = 0; i <= 3; i++) k.box(0.04, 2.3, 0.55, WALNUT, -w / 2 + (i * w) / 3, 0, z);
  k.box(w, 0.04, 0.55, WALNUT, 0, 2.26, z);
  const col = ['#1f2937', '#e7e2d8', '#7a5c4a', '#334155', '#f1ece4', '#8b2c3a'];
  for (let s = 0; s < 3; s++) {
    const cx = -w / 2 + (s + 0.5) * (w / 3);
    if (s === 1) {
      for (let y = 0; y < 4; y++) {
        k.box(w / 3 - 0.08, 0.03, 0.5, WALNUT, cx, 0.4 + y * 0.45, z);
        k.box(w / 3 - 0.3, 0.12, 0.32, col[(y + 2) % 6]!, cx, 0.43 + y * 0.45, z, { round: 0.03 });
      }
      continue;
    }
    k.cyl(0.012, 0.012, w / 3 - 0.1, BRASS, cx, 1.95, z, { rz: Math.PI / 2, ...brass });
    for (let i = 0; i < 5; i++)
      k.box(
        0.05,
        s === 0 ? 1.0 : 1.3,
        0.42,
        col[(i + s) % 6]!,
        cx - w / 6 + 0.16 + i * ((w / 3 - 0.3) / 4),
        s === 0 ? 0.9 : 0.6,
        z,
        { round: 0.02 },
      );
    k.box(w / 3 - 0.08, 0.4, 0.5, WALNUT, cx, 0, z);
  }
  k.box(w, 0.02, 0.02, '#ffd38a', 0, 2.2, z + 0.26, {
    emissive: '#ffd38a',
    emissiveIntensity: 1.2,
    noShadow: true,
  });
};

// ---------------------------------------------------------------- Bathrooms

const walkInShower: Builder = (k, o, m) => {
  // Across the back of the bathroom: a tiled tray, a glass screen, a rain head.
  const w = o.w - 0.06;
  const d = Math.min(o.d - 0.06, 0.95);
  const z = -o.d / 2 + d / 2;
  k.box(w, 0.04, d, '#9aa5ae', 0, 0, z, { rough: 0.5 });
  k.box(0.03, 0.02, d - 0.1, '#6b7280', 0, 0.04, z);
  k.box(w * 0.55, 1.95, 0.02, '#bfe3f0', w * 0.2, 0.04, z + d / 2, glass);
  k.box(w * 0.55, 0.03, 0.03, CHROME, w * 0.2, 1.99, z + d / 2, metal);
  k.cyl(0.015, 0.015, 2.0, CHROME, -w / 2 + 0.3, 0.04, -o.d / 2 + 0.06, metal);
  k.box(0.02, 0.02, 0.3, CHROME, -w / 2 + 0.3, 2.04, -o.d / 2 + 0.2, metal);
  k.cyl(0.14, 0.14, 0.02, CHROME, -w / 2 + 0.3, 2.0, -o.d / 2 + 0.35, metal);
  m.parts.head = new THREE.Object3D();
  m.parts.head.position.set(-w / 2 + 0.3, 2.0, -o.d / 2 + 0.35);
  k.keep(m.parts.head);
};

const rainShower: Builder = (k, o, m) => {
  // A walk-in rain shower in marble: a long tray, two glass panels, a big
  // square rain head from the ceiling, a niche with bottles.
  const d = o.d - 0.06;
  k.box(o.w - 0.06, 0.05, d, '#e3ddd3', 0, 0, 0, { rough: 0.3 });
  k.box(0.6, 0.012, 0.06, '#8b8f96', 0, 0.05, 0, metal);
  // Glass on the open side, half way.
  const gw = (o.w - 0.06) * 0.6;
  k.box(gw, 2.0, 0.02, '#bfe3f0', (o.w - gw) / 2 - 0.03, 0.05, o.d / 2 - 0.04, glass);
  k.box(gw, 0.03, 0.03, BRASS, (o.w - gw) / 2 - 0.03, 2.05, o.d / 2 - 0.04, brass);
  k.box(0.6, 0.03, 0.6, BRASS, 0, 2.2, 0, brass);
  k.box(0.03, 0.4, 0.03, BRASS, 0, 2.2, 0, brass);
  k.box(0.5, 0.25, 0.06, '#d8d0c4', 0, 1.1, -o.d / 2 + 0.04);
  for (const sx of [-0.12, 0, 0.12])
    k.cyl(0.03, 0.03, 0.16, '#f8f6f1', sx, 1.12, -o.d / 2 + 0.06, { seg: 8 });
  m.parts.head = new THREE.Object3D();
  m.parts.head.position.set(0, 2.2, 0);
  k.keep(m.parts.head);
};

const hotelVanity: Builder = (k, o) => {
  // A vanity unit along the wall (x across), a basin on it, a wide mirror.
  const w = Math.min(o.w - 0.1, 1.5);
  const z = -o.d / 2 + 0.26;
  k.box(w, 0.5, 0.48, WALNUT, 0, 0.3, z, { round: 0.02 });
  k.box(w + 0.02, 0.04, 0.5, MARBLE, 0, 0.8, z, { rough: 0.2 });
  k.cyl(0.18, 0.15, 0.12, WHITE, 0, 0.84, z + 0.02, { rough: 0.2, seg: 18 });
  k.cyl(0.012, 0.012, 0.2, CHROME, 0, 0.84, z - 0.17, metal);
  k.box(0.02, 0.02, 0.1, CHROME, 0, 1.03, z - 0.13, metal);
  k.box(w, 0.8, 0.03, '#cfe3ea', 0, 1.1, -o.d / 2 + 0.02, { metal: 0.6, rough: 0.05 });
  k.box(w, 0.04, 0.05, '#fff1d6', 0, 1.92, -o.d / 2 + 0.05, {
    emissive: '#ffd38a',
    emissiveIntensity: 1,
    noShadow: true,
  });
};

const doubleVanity: Builder = (k, o) => {
  // Two basins on a long marble counter, a brass-framed mirror over each.
  const w = o.w - 0.12;
  const z = -o.d / 2 + 0.28;
  k.box(w, 0.48, 0.52, WALNUT, 0, 0.32, z, { round: 0.02 });
  k.box(w + 0.04, 0.06, 0.56, MARBLE, 0, 0.8, z, { rough: 0.15 });
  for (const sx of [-1, 1]) {
    const x = (sx * w) / 4;
    k.cyl(0.19, 0.17, 0.13, WHITE, x, 0.86, z + 0.02, { rough: 0.15, seg: 20 });
    k.cyl(0.012, 0.012, 0.24, BRASS, x, 0.86, z - 0.2, brass);
    k.box(0.02, 0.02, 0.12, BRASS, x, 1.08, z - 0.15, brass);
    k.box(w / 2 - 0.2, 0.92, 0.04, BRASS, x, 1.12, -o.d / 2 + 0.02, brass);
    k.box(w / 2 - 0.28, 0.84, 0.02, '#cfe3ea', x, 1.16, -o.d / 2 + 0.05, {
      metal: 0.6,
      rough: 0.05,
    });
    k.cyl(0.04, 0.05, 0.22, '#fff1d6', x + w / 4 - 0.05, 1.5, -o.d / 2 + 0.08, {
      emissive: '#ffd38a',
      emissiveIntensity: 1,
    });
  }
  flowers(k, 0, 0.86, z - 0.08, 0.7);
};

const freestandingTub: Builder = (k, o, m) => {
  // An oval freestanding tub on the marble, a floor-standing brass tap, a stool with towels.
  const w = Math.min(o.w - 0.2, 1.75);
  const d = Math.min(o.d - 0.12, 0.85);
  const oval = (geo: THREE.BufferGeometry, c: string, y: number, o2: object) => {
    geo.scale(w, 1, d);
    k.add(geo, mat(c, o2), 0, y, 0, {});
  };
  const body = new THREE.CylinderGeometry(0.5, 0.4, 0.6, 28);
  body.translate(0, 0.3, 0);
  oval(body, WHITE, 0, { rough: 0.15 });
  const rim = new THREE.TorusGeometry(0.47, 0.035, 6, 28);
  rim.rotateX(Math.PI / 2);
  oval(rim, WHITE, 0.6, { rough: 0.15 });
  const water = new THREE.CircleGeometry(0.46, 28);
  water.rotateX(-Math.PI / 2);
  oval(water, '#9fd3e3', 0.55, { rough: 0.05, emissive: '#38bdf8', emissiveIntensity: 0.12 });
  k.cyl(0.02, 0.02, 0.95, BRASS, w / 2 + 0.06, 0, 0, brass);
  k.box(0.03, 0.03, 0.22, BRASS, w / 2 + 0.06, 0.93, -0.1, brass);
  k.box(0.36, 0.42, 0.32, '#c2a27c', -w / 2 - 0.05, 0, d / 2 + 0.05, { round: 0.04 });
  k.box(0.3, 0.1, 0.24, WHITE, -w / 2 - 0.05, 0.42, d / 2 + 0.05, { round: 0.03 });
  m.seats.push(new THREE.Vector3(0, 0.3, 0));
};

const towelRack: Builder = (k, o) => {
  const z = -o.d / 2 + 0.2;
  for (const sx of [-1, 1]) k.cyl(0.015, 0.015, 1.5, BRASS, sx * 0.3, 0, z, brass);
  for (let i = 0; i < 4; i++)
    k.cyl(0.012, 0.012, 0.62, BRASS, 0, 0.4 + i * 0.3, z, { rz: Math.PI / 2, ...brass });
  k.box(0.5, 0.6, 0.04, WHITE, 0, 0.75, z, { round: 0.02 });
  k.box(0.5, 0.4, 0.04, '#d6cfc4', 0, 0.3, z + 0.04, { round: 0.02 });
};

const suiteArmchair: Builder = (k, o, m) =>
  FURNITURE.armchair!(k, { ...o, tint: o.tier >= 3 ? '#a8846a' : '#4a6a8a' }, m);

/** The hotel's models (../home/hotel.ts), by id. */
export const HOTEL_BUILDERS: Record<string, Builder> = {
  'hotel-nightstand': hotelNightstand,
  'bed-bench': bedBench,
  'suite-bed': suiteBed,
  'side-table': sideTable,
  'floor-lamp': floorLamp,
  'tall-plant': tallPlant,
  'hotel-art': hotelArt,
  'hotel-tv': hotelTv,
  'tea-tray': teaTray,
  'hotel-desk': hotelDesk,
  'writing-desk': writingDesk,
  'hotel-tv-wall': hotelTvWall,
  'hotel-coffee-table': hotelCoffeeTable,
  'suite-rug': suiteRug,
  'round-rug': roundRug,
  'hotel-dining': hotelDining,
  'suite-bar': suiteBar,
  sideboard,
  'foyer-console': foyerConsole,
  'dress-mirror': dressMirror,
  'wardrobe-niche': wardrobeNiche,
  'walk-in-wardrobe': walkInWardrobe,
  'walk-in-shower': walkInShower,
  'rain-shower': rainShower,
  'hotel-vanity': hotelVanity,
  'double-vanity': doubleVanity,
  'freestanding-tub': freestandingTub,
  'towel-rack': towelRack,
  'suite-armchair': suiteArmchair,
};

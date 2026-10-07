/**
 * Wave 9 §C: the furniture library. Low-poly models built in code from
 * primitives, each sized to a footprint (w along x, d along z, metres) with
 * its front facing +z. Every model is merged per material by `Kit`; parts
 * that move (a screen, a door, a pan) stay separate and are returned by name.
 */
import * as THREE from 'three';
import { Kit, mat, paintingTexture, rugTexture, screenTexture, contactShadow, tone } from './kit';

export interface ModelOpts {
  w: number;
  d: number;
  /** Quality tier 1–3 (basic, good, luxury). */
  tier: number;
  /** An accent colour (a venue's brand, a car's paint). */
  tint?: string;
  seed?: number;
}

export interface Lamp {
  pos: THREE.Vector3;
  color: string;
  intensity: number;
  distance: number;
}

export interface Model {
  group: THREE.Group;
  parts: Record<string, THREE.Object3D>;
  lamps: Lamp[];
  /** Screens that flicker while watched. */
  screens: THREE.MeshStandardMaterial[];
  /** Where a person sits on it (local), facing +z. */
  seats: THREE.Vector3[];
  /** Height of the top surface (a table, a counter), for props. */
  top?: number;
}

export type Builder = (k: Kit, o: ModelOpts, m: Model) => void;

// ---------------------------------------------------------------------------
// Palette

export const WOOD = '#9a6a3f';
export const WOOD_DARK = '#5b3a22';
export const WOOD_LIGHT = '#c99a66';
export const WHITE = '#f4f1ea';
export const STEEL = '#b8bec6';
export const BLACK = '#1d1d22';
export const CHROME = '#d9dde3';
export const GLASS = '#bfe3f0';

const metal = { metal: 0.6, rough: 0.35 };
const shiny = { rough: 0.3 };

function screen(k: Kit, m: Model, w: number, h: number, x: number, y: number, z: number, kind: Parameters<typeof screenTexture>[0] = 'film', ry = 0) {
  const sm = mat('#ffffff', {
    own: true,
    map: screenTexture(kind),
    emissive: '#ffffff',
    emissiveIntensity: 0.0,
    rough: 0.25,
  });
  sm.emissiveMap = sm.map;
  sm.color.set('#20242c');
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), sm);
  mesh.position.set(x, y, z);
  mesh.rotation.y = ry;
  k.keep(mesh);
  m.screens.push(sm);
  m.parts.screen = mesh;
  return mesh;
}

// ---------------------------------------------------------------------------
// Bedroom

const bed: Builder = (k, o, m) => {
  const bw = Math.min(o.w - 0.15, o.tier === 1 ? 1.3 : o.tier === 2 ? 1.6 : 1.85);
  const bl = Math.min(o.d - 0.2, 2.1);
  const z0 = -o.d / 2 + 0.08;
  const zc = z0 + bl / 2;
  const frame = o.tier === 3 ? WOOD_DARK : o.tier === 2 ? WOOD : '#8b8f96';
  const duvet = o.tier === 3 ? '#e9e2d0' : o.tier === 2 ? '#4f6db8' : '#8aa2b8';
  if (o.tier === 1) {
    for (const sx of [-1, 1])
      for (const sz of [0, 1]) k.cyl(0.025, 0.025, 0.28, frame, (sx * (bw - 0.06)) / 2, 0, z0 + 0.05 + sz * (bl - 0.1), { ...metal });
    k.box(bw, 0.05, bl, frame, 0, 0.26, zc, metal);
  } else {
    k.box(bw + 0.1, 0.3, bl + 0.06, frame, 0, 0, zc, { round: 0.03 });
  }
  // mattress, duvet, pillows
  k.box(bw - 0.04, 0.2, bl - 0.06, WHITE, 0, 0.3, zc, { round: 0.06 });
  k.box(bw + 0.02, 0.12, bl * 0.66, duvet, 0, 0.42, zc + bl * 0.17, { round: 0.05 });
  if (o.tier >= 2) k.box(bw + 0.03, 0.04, 0.32, tone(duvet, -0.15), 0, 0.5, zc + bl * 0.38, { round: 0.02 });
  const pillows = bw > 1.4 ? 2 : 1;
  for (let i = 0; i < pillows; i++) {
    const px = pillows === 1 ? 0 : (i - 0.5) * (bw * 0.48);
    k.box(pillows === 1 ? bw * 0.7 : bw * 0.42, 0.12, 0.34, '#ffffff', px, 0.48, z0 + 0.3, { round: 0.06 });
  }
  // headboard
  const hb = o.tier === 3 ? 1.25 : o.tier === 2 ? 0.95 : 0.7;
  k.box(bw + 0.14, hb, 0.08, o.tier === 1 ? frame : o.tier === 3 ? '#3b3f4a' : WOOD_DARK, 0, 0, z0 - 0.02, {
    round: o.tier === 3 ? 0.04 : 0.01,
    ...(o.tier === 1 ? metal : {}),
  });
  if (o.tier === 3) for (let i = -2; i <= 2; i++) k.box(0.02, hb - 0.3, 0.02, '#c9a86a', (i * bw) / 5, 0.25, z0 + 0.03, metal);
  m.seats.push(new THREE.Vector3(0, 0.5, zc));
};

const mat_: Builder = (k, o) => {
  const bw = Math.min(o.w - 0.2, 1.1);
  const bl = Math.min(o.d - 0.3, 2);
  const zc = -o.d / 2 + 0.15 + bl / 2;
  k.box(bw, 0.12, bl, '#b9a98e', 0, 0, zc, { round: 0.05 });
  k.box(bw * 0.95, 0.06, bl * 0.6, '#c45a3c', 0, 0.12, zc + bl * 0.18, { round: 0.03 });
  k.box(bw * 0.6, 0.1, 0.3, WHITE, 0, 0.12, zc - bl * 0.38, { round: 0.05 });
};

const wardrobe: Builder = (k, o) => {
  const w = Math.min(o.w - 0.1, o.tier === 3 ? 1.9 : 1.6);
  const d = 0.58;
  const z = -o.d / 2 + d / 2 + 0.04;
  if (o.tier === 1) {
    // a clothes rail
    for (const sx of [-1, 1]) k.cyl(0.02, 0.02, 1.6, STEEL, (sx * w) / 2, 0, z, metal);
    k.cyl(0.018, 0.018, w, STEEL, 0, 1.58, z, { ...metal, rz: Math.PI / 2 });
    k.box(w, 0.04, 0.4, STEEL, 0, 0.05, z, metal);
    const cols = ['#ef4444', '#3b82f6', '#f59e0b', '#10b981', '#e5e7eb', '#8b5cf6'];
    for (let i = 0; i < 6; i++) {
      const x = -w / 2 + 0.15 + (i * (w - 0.3)) / 5;
      k.box(0.06, 0.7 + (i % 3) * 0.1, 0.42, cols[i]!, x, 0.85 - (i % 3) * 0.1, z, { round: 0.02 });
    }
    return;
  }
  const c = o.tier === 3 ? '#e8e2d6' : WOOD;
  k.box(w, 2.0, d, c, 0, 0, z, { round: 0.02 });
  const doors = o.tier === 3 ? 3 : 2;
  for (let i = 0; i < doors; i++) {
    const dw = w / doors;
    const x = -w / 2 + dw * (i + 0.5);
    k.box(dw - 0.03, 1.86, 0.02, o.tier === 3 && i === 1 ? '#cfe3ea' : tone(c, -0.04), x, 0.08, z + d / 2, o.tier === 3 && i === 1 ? { rough: 0.05, metal: 0.4 } : {});
    k.cyl(0.012, 0.012, 0.3, '#c9a86a', x + (i < doors / 2 ? dw / 2 - 0.08 : -dw / 2 + 0.08), 0.85, z + d / 2 + 0.03, metal);
  }
};

const desk: Builder = (k, o, m) => {
  const w = Math.min(o.w - 0.1, 1.5);
  const d = 0.65;
  const z = -o.d / 2 + d / 2 + 0.05;
  const top = o.tier === 3 ? 1.0 : 0.74;
  const c = o.tier === 1 ? '#d9d4c7' : o.tier === 2 ? WOOD : '#ece9e2';
  k.box(w, 0.04, d, c, 0, top - 0.04, z, { round: 0.01 });
  if (o.tier === 1) {
    for (const sx of [-1, 1]) k.box(0.03, top - 0.04, d * 0.8, STEEL, (sx * (w - 0.1)) / 2, 0, z, metal);
  } else if (o.tier === 2) {
    k.box(0.45, top - 0.04, d - 0.04, tone(c, -0.05), w / 2 - 0.25, 0, z);
    k.box(0.04, top - 0.04, d - 0.04, c, -w / 2 + 0.04, 0, z);
  } else {
    for (const sx of [-1, 1]) k.box(0.06, top - 0.04, 0.06, BLACK, (sx * (w - 0.2)) / 2, 0, z, metal);
    for (const sx of [-1, 1]) k.box(0.08, 0.03, d - 0.06, BLACK, (sx * (w - 0.2)) / 2, 0, z, metal);
    k.box(0.5, 0.32, 0.03, BLACK, 0, top + 0.08, z - d / 2 + 0.08);
    screen(k, m, 0.46, 0.28, 0, top + 0.26, z - d / 2 + 0.1, 'slide');
    k.box(0.04, 0.12, 0.04, BLACK, 0, top, z - d / 2 + 0.06);
  }
  // chair
  chairAt(k, 0, z + d / 2 + 0.28, Math.PI, o.tier === 3 ? 'ergo' : o.tier === 2 ? 'wood' : 'fold');
  m.top = top;
  m.seats.push(new THREE.Vector3(0, 0.46, z + d / 2 + 0.28));
};

/** A chair at (x, z) facing `ry` (0 = facing +z). */
export function chairAt(k: Kit, x: number, z: number, ry: number, style: 'wood' | 'fold' | 'ergo' | 'dining' | 'stool' | 'bar' | 'plastic' = 'wood', color?: string) {
  const s = Math.sin(ry);
  const c = Math.cos(ry);
  const at = (lx: number, lz: number): [number, number] => [x + lx * c + lz * s, z - lx * s + lz * c];
  const seatH = style === 'bar' ? 0.72 : style === 'stool' ? 0.46 : 0.45;
  const col = color ?? (style === 'fold' ? '#6b7280' : style === 'ergo' ? BLACK : style === 'plastic' ? '#e5e7eb' : WOOD);
  if (style === 'stool' || style === 'bar') {
    const [cx, cz] = at(0, 0);
    k.cyl(0.19, 0.19, 0.05, color ?? '#7c2d12', cx, seatH, cz, { round: 0.02 } as never);
    k.cyl(0.025, 0.025, seatH, CHROME, cx, 0, cz, metal);
    k.cyl(0.16, 0.18, 0.02, CHROME, cx, 0, cz, metal);
    if (style === 'bar') k.torus(0.13, 0.012, CHROME, cx, 0.28, cz, { ...metal, rx: Math.PI / 2 });
    return;
  }
  if (style === 'ergo') {
    const [cx, cz] = at(0, 0);
    k.cyl(0.25, 0.25, 0.04, BLACK, cx, 0.06, cz, metal);
    k.cyl(0.03, 0.03, 0.4, CHROME, cx, 0.06, cz, metal);
    k.box(0.48, 0.08, 0.46, col, cx, seatH - 0.04, cz, { round: 0.03, ry });
    const [bx, bz] = at(0, -0.22);
    k.box(0.46, 0.62, 0.06, col, bx, seatH + 0.08, bz, { round: 0.03, ry });
    return;
  }
  const [cx, cz] = at(0, 0);
  k.box(0.44, 0.05, 0.42, col, cx, seatH - 0.05, cz, { round: 0.015, ry });
  for (const lx of [-0.18, 0.18])
    for (const lz of [-0.17, 0.17]) {
      const [px, pz] = at(lx, lz);
      k.box(0.035, seatH - 0.05, 0.035, style === 'fold' ? STEEL : tone(col, -0.08), px, 0, pz, { ry });
    }
  const [bx, bz] = at(0, -0.2);
  k.box(0.44, style === 'dining' ? 0.5 : 0.42, 0.04, col, bx, seatH, bz, { round: 0.015, ry });
}

const laptop: Builder = (k, o, m) => {
  const y = o.tier === 3 ? 0.001 : 0.001;
  const c = o.tier === 3 ? '#cbd5e1' : o.tier === 2 ? '#9ca3af' : '#4b5563';
  k.box(0.34, 0.015, 0.24, c, 0, y, 0.02, metal);
  const lid = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.22, 0.012), mat(c, metal));
  base.position.set(0, 0.11, 0);
  base.castShadow = true;
  lid.add(base);
  lid.position.set(0, y + 0.015, -0.1);
  lid.rotation.x = -0.25;
  k.keep(lid);
  const sc = screen(k, m, 0.31, 0.19, 0, 0, 0, 'slide');
  lid.add(sc);
  sc.position.set(0, 0.11, 0.008);
};

// ---------------------------------------------------------------------------
// Living room

const SOFA_COLORS = ['#8a6e57', '#6f7a86', '#2b2b30'];

const sofa: Builder = (k, o, m) => {
  const w = Math.min(o.w - 0.1, 2.6);
  const d = 0.9;
  const z = 0;
  const c = o.tint ?? SOFA_COLORS[o.tier - 1]!;
  const leather = o.tier === 3 ? { rough: 0.4 } : {};
  k.box(w, 0.3, d, tone(c, -0.08), 0, 0.08, z, { round: 0.06, ...leather });
  // feet
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.cyl(0.03, 0.025, 0.08, o.tier === 3 ? CHROME : WOOD_DARK, (sx * (w - 0.15)) / 2, 0, (sz * (d - 0.15)) / 2, o.tier === 3 ? metal : {});
  const seats = Math.max(2, Math.min(3, Math.round(w / 0.8)));
  const sw = (w - 0.36) / seats;
  for (let i = 0; i < seats; i++) {
    const x = -w / 2 + 0.18 + sw * (i + 0.5);
    k.box(sw - 0.03, 0.14, d - 0.25, c, x, 0.38, z + 0.08, { round: 0.06, ...leather });
    k.box(sw - 0.05, 0.42, 0.2, c, x, 0.42, z - d / 2 + 0.16, { round: 0.08, rx: -0.12, ...leather });
    m.seats.push(new THREE.Vector3(x, 0.5, z + 0.1));
  }
  k.box(w, 0.5, 0.16, tone(c, -0.05), 0, 0.08, z - d / 2 + 0.08, { round: 0.06, ...leather });
  for (const sx of [-1, 1]) k.box(0.18, 0.52, d, tone(c, -0.03), (sx * (w - 0.18)) / 2, 0.08, z, { round: 0.07, ...leather });
  if (o.tier >= 2) {
    k.box(0.36, 0.3, 0.12, o.tier === 3 ? '#c9a86a' : '#e8b04b', -w / 2 + 0.42, 0.48, z - d / 2 + 0.3, { round: 0.06, rx: -0.2, rz: 0.2 });
    k.box(0.36, 0.3, 0.12, o.tier === 3 ? '#e5e7eb' : '#5aa9a0', w / 2 - 0.42, 0.48, z - d / 2 + 0.3, { round: 0.06, rx: -0.2, rz: -0.2 });
  }
};

const cushions: Builder = (k, _o, m) => {
  const n = 3;
  for (let i = 0; i < n; i++) {
    const x = (i - 1) * 0.75;
    k.box(0.6, 0.16, 0.6, ['#c2410c', '#0f766e', '#a16207'][i]!, x, 0, 0, { round: 0.07 });
    m.seats.push(new THREE.Vector3(x, 0.2, 0));
  }
};

const armchair: Builder = (k, o, m) => {
  const c = o.tint ?? '#c58b3d';
  k.box(0.8, 0.28, 0.8, tone(c, -0.08), 0, 0.08, 0, { round: 0.06 });
  k.box(0.56, 0.14, 0.6, c, 0, 0.36, 0.06, { round: 0.06 });
  k.box(0.8, 0.5, 0.16, c, 0, 0.36, -0.32, { round: 0.07 });
  for (const sx of [-1, 1]) k.box(0.14, 0.36, 0.8, c, sx * 0.33, 0.3, 0, { round: 0.06 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.cyl(0.025, 0.02, 0.08, WOOD_DARK, sx * 0.32, 0, sz * 0.32);
  m.seats.push(new THREE.Vector3(0, 0.5, 0.06));
};

const coffeeTable: Builder = (k, o, m) => {
  const w = Math.min(o.w - 0.2, 1.1);
  const d = Math.min(o.d - 0.2, 0.6);
  if (o.tier === 3) {
    k.box(w, 0.04, d, GLASS, 0, 0.38, 0, { opacity: 0.45, rough: 0.05, noShadow: true });
    k.box(w * 0.7, 0.36, d * 0.6, '#d6d3cd', 0, 0, 0);
  } else {
    k.box(w, 0.06, d, o.tier === 2 ? WOOD_LIGHT : WOOD, 0, 0.34, 0, { round: 0.02 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(0.05, 0.34, 0.05, WOOD_DARK, (sx * (w - 0.12)) / 2, 0, (sz * (d - 0.12)) / 2);
  }
  k.cyl(0.07, 0.06, 0.08, '#e2e8f0', w * 0.22, 0.4, 0, { rough: 0.3 });
  k.box(0.22, 0.03, 0.16, '#dc2626', -w * 0.2, 0.4, 0.04);
  m.top = 0.4;
};

const tv: Builder = (k, o, m) => {
  const w = Math.min(o.w - 0.1, o.tier === 1 ? 0.9 : o.tier === 2 ? 1.45 : 1.9);
  const z = -o.d / 2 + 0.3;
  const standW = Math.min(o.w - 0.05, w + 0.3);
  // media console
  k.box(standW, 0.42, 0.42, o.tier === 1 ? '#6b4f3a' : o.tier === 2 ? WOOD_LIGHT : '#2a2a2e', 0, 0, z, { round: 0.02 });
  if (o.tier >= 2) for (let i = 0; i < 3; i++) k.box(standW / 3 - 0.04, 0.3, 0.01, tone(o.tier === 2 ? WOOD_LIGHT : '#2a2a2e', -0.06), -standW / 3 + (i * standW) / 3, 0.06, z + 0.21);
  const h = w * 0.58;
  const y0 = 0.5;
  k.box(0.12, 0.08, 0.04, BLACK, 0, 0.42, z, metal);
  k.box(0.04, 0.12, 0.04, BLACK, 0, 0.44, z);
  k.box(w + 0.04, h + 0.04, 0.05, BLACK, 0, y0, z - 0.02, { rough: 0.3 });
  screen(k, m, w, h, 0, y0 + 0.02 + h / 2, z + 0.008, 'film');
  if (o.tier === 3) {
    k.box(w * 0.7, 0.07, 0.09, BLACK, 0, 0.43, z + 0.12, { rough: 0.4 });
    for (const sx of [-1, 1]) {
      k.box(0.22, 1.05, 0.24, '#202024', sx * (standW / 2 + 0.05), 0, z, { round: 0.02 });
      k.cyl(0.07, 0.07, 0.01, '#3f3f46', sx * (standW / 2 + 0.05), 0.75, z + 0.12, { rx: Math.PI / 2 });
    }
  }
};

const sound: Builder = (k, o) => {
  if (o.tier === 1) {
    k.box(0.38, 0.38, 0.38, WOOD, 0, 0, 0);
    k.box(0.22, 0.12, 0.1, '#0ea5e9', 0, 0.38, 0, { round: 0.04 });
    return;
  }
  const xs = o.tier === 2 ? [-0.24, 0.24] : [-0.25, 0.25];
  for (const x of xs) {
    if (o.tier === 3) {
      k.cyl(0.03, 0.12, 0.7, BLACK, x, 0, 0, metal);
      k.box(0.24, 0.36, 0.26, '#f5f5f4', x, 0.7, 0, { round: 0.02 });
      k.cyl(0.07, 0.07, 0.02, '#1f2937', x, 0.82, 0.13, { rx: Math.PI / 2 });
    } else {
      k.box(0.26, 1.0, 0.3, '#3f2a1c', x, 0, 0, { round: 0.02 });
      k.cyl(0.08, 0.08, 0.02, '#111', x, 0.68, 0.15, { rx: Math.PI / 2 });
      k.cyl(0.05, 0.05, 0.02, '#111', x, 0.86, 0.15, { rx: Math.PI / 2 });
      k.cyl(0.09, 0.09, 0.02, '#111', x, 0.32, 0.15, { rx: Math.PI / 2 });
    }
  }
};

const gaming: Builder = (k, o, m) => {
  if (o.tier === 1) {
    k.box(0.36, 0.08, 0.26, BLACK, 0, 0, -0.2, { round: 0.02 });
    k.sphere(0.32, '#dc2626', 0, 0.2, 0.15, { sx: 1, sy: 0.6, sz: 1 });
    m.seats.push(new THREE.Vector3(0, 0.3, 0.15));
    return;
  }
  if (o.tier === 2) {
    k.box(0.2, 0.36, 0.3, '#f8fafc', -0.3, 0, -0.25, { round: 0.02 });
    // big gaming chair
    k.box(0.55, 0.12, 0.5, '#111827', 0.05, 0.42, 0.15, { round: 0.04 });
    k.box(0.55, 0.85, 0.12, '#111827', 0.05, 0.5, -0.12, { round: 0.05 });
    k.box(0.5, 0.06, 0.1, '#ef4444', 0.05, 1.1, -0.12, { round: 0.02 });
    k.cyl(0.24, 0.24, 0.04, BLACK, 0.05, 0.04, 0.15, metal);
    k.cyl(0.03, 0.03, 0.4, CHROME, 0.05, 0.04, 0.15, metal);
    m.seats.push(new THREE.Vector3(0.05, 0.5, 0.15));
    return;
  }
  // a gaming PC rig: desk, two screens, RGB tower
  k.box(0.95, 0.04, 0.6, BLACK, 0, 0.72, -0.1, { round: 0.01 });
  for (const sx of [-1, 1]) k.box(0.04, 0.72, 0.5, BLACK, sx * 0.44, 0, -0.1, metal);
  k.box(0.22, 0.46, 0.44, '#18181b', 0.32, 0.76, -0.12, { round: 0.02 });
  k.box(0.01, 0.38, 0.34, '#a855f7', 0.21, 0.8, -0.12, { emissive: '#a855f7', emissiveIntensity: 1.2, noShadow: true });
  k.box(0.6, 0.36, 0.03, BLACK, -0.1, 0.84, -0.36);
  screen(k, m, 0.56, 0.32, -0.1, 1.04, -0.34, 'game');
  chairAt(k, -0.05, 0.3, Math.PI, 'ergo', '#111827');
  m.seats.push(new THREE.Vector3(-0.05, 0.46, 0.3));
};

const books: Builder = (k, o) => {
  const w = Math.min(o.w - 0.1, o.tier === 3 ? o.w - 0.05 : 0.9);
  const h = o.tier === 1 ? 0.9 : o.tier === 2 ? 1.85 : 2.1;
  const d = 0.34;
  const z = -o.d / 2 + d / 2 + 0.03;
  const c = o.tier === 3 ? WOOD_DARK : WOOD;
  k.box(w, h, 0.03, tone(c, -0.08), 0, 0, z - d / 2 + 0.015);
  for (const sx of [-1, 1]) k.box(0.03, h, d, c, (sx * (w - 0.03)) / 2, 0, z);
  const shelves = Math.max(2, Math.round(h / 0.38));
  const cols = ['#b91c1c', '#1d4ed8', '#047857', '#a16207', '#7c3aed', '#e5e7eb', '#0f172a', '#c2410c'];
  let n = 0;
  for (let i = 0; i <= shelves; i++) {
    const y = (i * (h - 0.03)) / shelves;
    k.box(w, 0.03, d, c, 0, y, z);
    if (i === shelves) break;
    let x = -w / 2 + 0.05;
    while (x < w / 2 - 0.08) {
      const bw = 0.03 + ((n * 7) % 5) * 0.008;
      const bh = 0.2 + ((n * 13) % 7) * 0.015;
      if ((n * 11) % 9 !== 0) k.box(bw, bh, d - 0.08, cols[n % cols.length]!, x + bw / 2, y + 0.03, z + 0.02);
      x += bw + 0.004;
      n++;
    }
  }
};

const plants: Builder = (k, o) => {
  const potC = o.tier === 3 ? '#f1ede6' : o.tier === 2 ? '#c2703d' : '#b45309';
  const leaf = ['#3f7d3a', '#2f6b34', '#5a9a46'];
  const pot = (x: number, z: number, s: number, tall: boolean) => {
    k.cyl(0.16 * s, 0.12 * s, 0.3 * s, potC, x, 0, z, { rough: 0.6 });
    k.cyl(0.15 * s, 0.15 * s, 0.02, '#3b2a1a', x, 0.29 * s, z);
    if (tall) {
      k.cyl(0.015, 0.02, 0.9 * s, '#5b4636', x, 0.3 * s, z);
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        k.sphere(0.16 * s, leaf[i % 3]!, x + Math.cos(a) * 0.14 * s, 0.75 * s + (i % 3) * 0.16 * s, z + Math.sin(a) * 0.14 * s, { sx: 1.4, sy: 0.5, sz: 0.8, ry: a, seg: 8 });
      }
      k.sphere(0.18 * s, leaf[0]!, x, 1.18 * s, z, { seg: 8, sy: 0.8 });
    } else {
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        k.sphere(0.12 * s, leaf[i % 3]!, x + Math.cos(a) * 0.07 * s, 0.4 * s, z + Math.sin(a) * 0.07 * s, { sx: 0.7, sy: 1.5, sz: 0.5, ry: a, seg: 8 });
      }
    }
  };
  if (o.tier === 1) {
    pot(-0.18, -0.1, 0.8, false);
    pot(0.15, 0.12, 0.7, false);
  } else if (o.tier === 2) {
    pot(0, 0, 1.25, true);
    pot(0.3, 0.28, 0.7, false);
  } else {
    k.box(0.5, 0.5, 0.5, potC, 0, 0, 0, { round: 0.04, rough: 0.5 });
    k.cyl(0.015, 0.02, 1.0, '#5b4636', 0, 0.5, 0);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      k.sphere(0.2, leaf[i % 3]!, Math.cos(a) * 0.18, 1.05 + (i % 3) * 0.18, Math.sin(a) * 0.18, { sx: 1.5, sy: 0.45, sz: 0.8, ry: a, seg: 8 });
    }
  }
};

const art: Builder = (k, o) => {
  // Hung on the wall behind (z = -d/2), centred at eye height.
  const z = -o.d / 2 + 0.03;
  const n = o.tier === 1 ? 2 : 1;
  for (let i = 0; i < n; i++) {
    const w = o.tier === 3 ? 1.1 : o.tier === 2 ? 0.7 : 0.45;
    const h = o.tier === 3 ? 0.8 : o.tier === 2 ? 0.55 : 0.6;
    const x = n === 1 ? 0 : (i - 0.5) * 0.6;
    const y = 1.45;
    k.box(w + 0.08, h + 0.08, 0.04, o.tier === 3 ? '#b8892e' : o.tier === 2 ? BLACK : '#f8fafc', x, y - h / 2 - 0.04, z, o.tier === 3 ? metal : {});
    k.plane(w, h, '#ffffff', x, y, z + 0.022, { map: paintingTexture((o.seed ?? 1) * 7 + i + o.tier * 3) });
  }
};

const rug: Builder = (k, o) => {
  const w = o.w - 0.1;
  const d = o.d - 0.1;
  const col = ['#c8a165', '#4f6f9a', '#8b1e1e'][o.tier - 1]!;
  const geo = new THREE.PlaneGeometry(w, d);
  const mesh = new THREE.Mesh(geo, mat('#ffffff', { map: rugTexture(o.tier, col) }));
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.012 + (o.tier - 1) * 0.004;
  mesh.receiveShadow = true;
  k.keep(mesh);
};

const dining: Builder = (k, o, m) => {
  const w = Math.min(o.w - 0.6, o.tier === 1 ? 0.9 : 1.4);
  const d = Math.min(o.d - 0.7, o.tier === 1 ? 0.75 : 0.9);
  const round = o.tier === 1;
  const c = o.tier === 3 ? WOOD_DARK : o.tier === 2 ? WOOD_LIGHT : '#d4b48c';
  if (round) {
    k.cyl(w / 2, w / 2, 0.04, c, 0, 0.72, 0);
    k.cyl(0.05, 0.05, 0.72, WOOD_DARK, 0, 0, 0);
    k.cyl(0.25, 0.25, 0.03, WOOD_DARK, 0, 0, 0);
  } else {
    k.box(w, 0.05, d, c, 0, 0.71, 0, { round: 0.015 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(0.06, 0.71, 0.06, tone(c, -0.1), (sx * (w - 0.12)) / 2, 0, (sz * (d - 0.12)) / 2);
  }
  // chairs
  const style = o.tier === 1 ? 'stool' : 'dining';
  const chairs: [number, number, number][] = [
    [0, d / 2 + 0.3, Math.PI],
    [0, -d / 2 - 0.3, 0],
  ];
  if (o.tier >= 2) {
    chairs.length = 0;
    for (const sx of [-0.33, 0.33]) {
      chairs.push([sx * w, d / 2 + 0.3, Math.PI]);
      chairs.push([sx * w, -d / 2 - 0.3, 0]);
    }
  }
  if (o.tier === 1) chairs.push([w / 2 + 0.3, 0, -Math.PI / 2]);
  for (const [x, z, ry] of chairs) chairAt(k, x, z, ry, style, o.tier === 3 ? '#4b2e1c' : undefined);
  // table setting
  k.cyl(0.11, 0.09, 0.02, WHITE, -w * 0.2, 0.76, 0.1, shiny);
  k.cyl(0.11, 0.09, 0.02, WHITE, w * 0.2, 0.76, -0.1, shiny);
  k.cyl(0.05, 0.04, 0.2, '#16a34a', 0, 0.76, 0, { opacity: 0.8 });
  m.top = 0.76;
};

const lights: Builder = (k, o, m) => {
  const shadeC = o.tier === 3 ? '#f5f3ff' : o.tier === 2 ? '#fde7c0' : '#fff7d6';
  const glow = o.tier === 3 ? '#c4b5fd' : '#ffd79a';
  if (o.tier === 1) {
    // a bare bulb on a stand
    k.cyl(0.12, 0.14, 0.03, BLACK, 0, 0, 0, metal);
    k.cyl(0.012, 0.012, 1.45, BLACK, 0, 0.03, 0, metal);
    k.sphere(0.07, shadeC, 0, 1.52, 0, { emissive: '#fff2c4', emissiveIntensity: 1.6 });
    m.lamps.push({ pos: new THREE.Vector3(0, 1.5, 0), color: '#ffe0a8', intensity: 2.2, distance: 4.2 });
    return;
  }
  k.cyl(0.14, 0.16, 0.03, o.tier === 3 ? CHROME : '#a16207', 0, 0, 0, metal);
  k.cyl(0.014, 0.014, 1.35, o.tier === 3 ? CHROME : '#a16207', 0, 0.03, 0, metal);
  k.cyl(0.14, 0.22, 0.3, shadeC, 0, 1.3, 0, { emissive: glow, emissiveIntensity: 0.9, rough: 0.9 });
  m.lamps.push({ pos: new THREE.Vector3(0, 1.3, 0), color: o.tier === 3 ? '#e9d5ff' : '#ffcf8a', intensity: 2.6, distance: 4.8 });
};

// ---------------------------------------------------------------------------
// Kitchen and appliances

const kitchen: Builder = (k, o, m) => {
  // Counter run along the back (z = -d/2), length w.
  const w = o.w - 0.04;
  const dd = 0.62;
  const z = -o.d / 2 + dd / 2 + 0.02;
  if (o.tier === 1) {
    k.box(Math.min(w, 1.0), 0.78, 0.55, '#c8a978', 0, 0, z, {});
    k.box(0.5, 0.06, 0.35, '#3f3f46', -0.15, 0.78, z, metal);
    k.cyl(0.09, 0.09, 0.01, '#ef4444', -0.15, 0.84, z, { emissive: '#ef4444', emissiveIntensity: 0.3 });
    const pan = new THREE.Group();
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.1, 0.06, 16), mat('#27272a', metal));
    p.position.y = 0.03;
    p.castShadow = true;
    pan.add(p);
    pan.position.set(-0.15, 0.85, z);
    k.keep(pan);
    m.parts.pan = pan;
    k.cyl(0.1, 0.1, 0.18, STEEL, 0.25, 0.78, z, metal);
    m.top = 0.84;
    return;
  }
  const body = o.tier === 3 ? '#e9e5dd' : '#f3efe7';
  const top = o.tier === 3 ? '#2b2b2f' : '#b9b2a6';
  k.box(w, 0.82, dd, body, 0, 0.06, z, {});
  k.box(w, 0.06, dd, '#2b2b2f', 0, 0, z + 0.02);
  k.box(w + 0.02, 0.05, dd + 0.03, top, 0, 0.88, z, o.tier === 3 ? { rough: 0.2 } : {});
  // doors
  const n = Math.max(2, Math.round(w / 0.5));
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + (w / n) * (i + 0.5);
    k.box(w / n - 0.03, 0.7, 0.02, tone(body, -0.03), x, 0.12, z + dd / 2);
    k.box(0.12, 0.015, 0.02, CHROME, x, 0.74, z + dd / 2 + 0.02, metal);
  }
  // hob
  k.box(0.56, 0.015, 0.5, BLACK, -w / 2 + 0.4, 0.93, z, { rough: 0.15 });
  for (const [hx, hz] of [[-0.12, -0.11], [0.12, -0.11], [-0.12, 0.11], [0.12, 0.11]] as const)
    k.torus(0.07, 0.008, '#52525b', -w / 2 + 0.4 + hx, 0.948, z + hz, { rx: Math.PI / 2 });
  const pan = new THREE.Group();
  const p = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.11, 0.07, 18), mat('#27272a', metal));
  p.position.y = 0.035;
  p.castShadow = true;
  pan.add(p);
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.02, 0.03), mat('#18181b'));
  handle.position.set(0.22, 0.06, 0);
  pan.add(handle);
  pan.position.set(-w / 2 + 0.28, 0.95, z + 0.11);
  k.keep(pan);
  m.parts.pan = pan;
  // sink
  k.box(0.46, 0.02, 0.4, CHROME, w / 2 - 0.4, 0.93, z, metal);
  k.box(0.4, 0.015, 0.34, '#8f969e', w / 2 - 0.4, 0.935, z, metal);
  k.cyl(0.015, 0.015, 0.28, CHROME, w / 2 - 0.4, 0.93, z - 0.18, metal);
  k.box(0.02, 0.02, 0.14, CHROME, w / 2 - 0.4, 1.19, z - 0.12, metal);
  // upper cabinets (tier 3: with a hood)
  k.box(w, 0.6, 0.34, body, 0, 1.5, -o.d / 2 + 0.19);
  for (let i = 0; i < n; i++) k.box(w / n - 0.03, 0.56, 0.02, tone(body, -0.03), -w / 2 + (w / n) * (i + 0.5), 1.52, -o.d / 2 + 0.37);
  if (o.tier === 3) {
    k.box(0.6, 0.12, 0.45, CHROME, -w / 2 + 0.4, 1.38, -o.d / 2 + 0.26, metal);
    k.box(0.04, 0.04, 0.6, '#c9a86a', 0, 0.92, z + 0.1, metal);
    k.cyl(0.08, 0.1, 0.14, '#16a34a', w / 2 - 0.15, 0.93, z - 0.1);
  }
  // a kettle and a fruit bowl
  k.cyl(0.07, 0.09, 0.2, o.tier === 3 ? '#b91c1c' : '#e5e7eb', 0, 0.93, z - 0.1, shiny);
  k.cyl(0.12, 0.08, 0.06, WOOD_LIGHT, 0.25, 0.93, z + 0.05);
  for (let i = 0; i < 3; i++) k.sphere(0.04, ['#f59e0b', '#ef4444', '#84cc16'][i]!, 0.22 + i * 0.03, 1.01, z + 0.03 + (i % 2) * 0.03);
  m.top = 0.93;
};

const kitchenette: Builder = (k, o, m) => kitchen(k, { ...o, tier: 1 }, m);

const fridge: Builder = (k, o) => {
  const w = o.tier === 3 ? Math.min(o.w - 0.04, 0.95) : o.tier === 2 ? 0.66 : 0.55;
  const h = o.tier === 1 ? 0.88 : 1.85;
  const dd = 0.66;
  const z = -o.d / 2 + dd / 2 + 0.03;
  const c = o.tier === 3 ? '#c9ccd1' : '#f1f3f5';
  k.box(w, h, dd, c, 0, 0, z, { round: 0.03, ...(o.tier === 3 ? metal : shiny) });
  if (o.tier === 3) {
    k.box(0.01, h - 0.08, 0.01, '#6b7280', 0, 0.04, z + dd / 2);
    for (const sx of [-1, 1]) k.box(0.02, 0.5, 0.03, CHROME, sx * 0.05, h * 0.45, z + dd / 2 + 0.02, metal);
    k.box(0.18, 0.26, 0.01, '#1f2937', -0.2, h * 0.55, z + dd / 2 + 0.005);
  } else {
    if (o.tier === 2) k.box(w - 0.02, 0.01, 0.01, '#9ca3af', 0, h * 0.62, z + dd / 2);
    k.box(0.02, o.tier === 2 ? 0.4 : 0.25, 0.03, CHROME, w / 2 - 0.07, h * (o.tier === 2 ? 0.68 : 0.55), z + dd / 2 + 0.02, metal);
  }
};

const washer: Builder = (k, o) => {
  const z = -o.d / 2 + 0.33;
  k.box(0.6, 0.85, 0.6, '#f4f4f5', 0, 0, z, { round: 0.03, ...shiny });
  if (o.tier === 1) {
    k.cyl(0.2, 0.2, 0.02, '#cbd5e1', -0.12, 0.85, z, metal);
    k.cyl(0.12, 0.12, 0.02, '#cbd5e1', 0.17, 0.85, z, metal);
    return;
  }
  k.cyl(0.21, 0.21, 0.03, '#9ca3af', 0, 0.38, z + 0.3, { ...metal, rx: Math.PI / 2 });
  k.cyl(0.16, 0.16, 0.035, '#93c5fd', 0, 0.38, z + 0.3, { rx: Math.PI / 2, opacity: 0.7, rough: 0.1 });
  k.box(0.5, 0.1, 0.01, '#e5e7eb', 0, 0.72, z + 0.3);
  k.cyl(0.03, 0.03, 0.02, '#111827', 0.18, 0.77, z + 0.3, { rx: Math.PI / 2 });
  if (o.tier === 3) k.box(0.6, 0.85, 0.6, '#f4f4f5', 0, 0.85, z, { round: 0.03, ...shiny });
};

const cooling: Builder = (k, o, m) => {
  const z = -o.d / 2;
  if (o.tier === 1) {
    // a standing fan
    k.cyl(0.18, 0.2, 0.03, '#e5e7eb', 0, 0, z + 0.35);
    k.cyl(0.015, 0.015, 1.1, '#e5e7eb', 0, 0.03, z + 0.35);
    const head = new THREE.Group();
    const cage = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.012, 6, 20), mat('#e5e7eb'));
    head.add(cage);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.06, 10), mat('#cbd5e1'));
    hub.rotation.x = Math.PI / 2;
    head.add(hub);
    const blades = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.17, 0.01), mat('#7dd3fc', { opacity: 0.8 }));
      b.position.y = 0.09;
      const piv = new THREE.Group();
      piv.rotation.z = (i * Math.PI * 2) / 3;
      piv.add(b);
      blades.add(piv);
    }
    head.add(blades);
    head.position.set(0, 1.18, z + 0.4);
    k.keep(head);
    m.parts.fan = blades;
    return;
  }
  // a split AC high on the wall
  const w = o.tier === 3 ? 0.95 : 0.85;
  k.box(w, 0.28, 0.22, '#f8fafc', 0, 1.95, z + 0.12, { round: 0.05, ...shiny });
  k.box(w - 0.1, 0.03, 0.02, '#cbd5e1', 0, 1.98, z + 0.235);
  if (o.tier === 3) k.box(0.06, 0.02, 0.01, '#22c55e', w / 2 - 0.1, 2.12, z + 0.235, { emissive: '#22c55e' });
};

const power: Builder = (k, o) => {
  if (o.tier === 1) {
    k.box(0.6, 0.42, 0.42, '#eab308', 0, 0.08, 0, { round: 0.03 });
    k.box(0.64, 0.04, 0.46, BLACK, 0, 0.5, 0, metal);
    for (const sx of [-1, 1]) k.cyl(0.07, 0.07, 0.05, BLACK, sx * 0.24, 0.08, 0.22, { rx: Math.PI / 2 });
    k.cyl(0.03, 0.03, 0.16, '#52525b', 0.2, 0.5, -0.1, metal);
    return;
  }
  if (o.tier === 2) {
    k.box(0.42, 0.55, 0.22, '#e5e7eb', 0, 0.6, -o.d / 2 + 0.13, { round: 0.02 });
    k.box(0.16, 0.06, 0.01, '#0ea5e9', 0, 0.98, -o.d / 2 + 0.245, { emissive: '#0ea5e9', emissiveIntensity: 0.6 });
    for (let i = 0; i < 2; i++) k.box(0.22, 0.3, 0.3, '#1f2937', (i - 0.5) * 0.26, 0, -o.d / 2 + 0.2, { round: 0.02 });
    return;
  }
  k.box(0.6, 1.0, 0.16, '#f8fafc', 0, 0.2, -o.d / 2 + 0.1, { round: 0.04, ...shiny });
  k.box(0.04, 0.6, 0.01, '#22c55e', 0, 0.4, -o.d / 2 + 0.185, { emissive: '#22c55e', emissiveIntensity: 0.8 });
};

const coffee: Builder = (k, o) => {
  // a little cart with the machine on it
  k.box(0.5, 0.78, 0.45, o.tier === 3 ? WOOD_DARK : WOOD_LIGHT, 0, 0, 0, { round: 0.02 });
  if (o.tier === 1) {
    k.cyl(0.08, 0.1, 0.22, '#e5e7eb', -0.1, 0.78, 0, shiny);
    k.cyl(0.07, 0.07, 0.2, '#1f2937', 0.12, 0.78, 0, { opacity: 0.85, rough: 0.1 });
    return;
  }
  k.box(0.3, 0.34, 0.3, o.tier === 3 ? CHROME : '#27272a', 0, 0.78, -0.03, { round: 0.03, ...metal });
  k.box(0.14, 0.03, 0.08, BLACK, 0, 0.92, 0.14);
  k.cyl(0.035, 0.03, 0.07, WHITE, 0, 0.78, 0.15);
  if (o.tier === 3) {
    k.cyl(0.07, 0.05, 0.14, '#3f2a1c', 0.12, 1.12, -0.05, { opacity: 0.85 });
    for (let i = 0; i < 3; i++) k.cyl(0.035, 0.03, 0.07, WHITE, -0.2 + i * 0.08, 0.78, 0.17);
  }
};

const wifi: Builder = (k, o) => {
  k.box(0.4, 0.55, 0.35, WOOD_LIGHT, 0, 0, 0, { round: 0.02 });
  if (o.tier === 1) {
    k.box(0.1, 0.02, 0.07, '#1f2937', 0, 0.55, 0, { round: 0.01 });
    k.sphere(0.01, '#22c55e', 0.03, 0.575, 0.03, { emissive: '#22c55e' });
    return;
  }
  k.box(0.24, 0.04, 0.16, o.tier === 3 ? '#f8fafc' : BLACK, 0, 0.55, 0, { round: 0.015 });
  for (const sx of [-1, 1]) k.cyl(0.008, 0.008, 0.18, BLACK, sx * 0.09, 0.59, -0.06, { rz: sx * 0.2 });
  for (let i = 0; i < 4; i++) k.sphere(0.008, '#22c55e', -0.06 + i * 0.04, 0.6, 0.08, { emissive: '#22c55e' });
  if (o.tier === 3) k.cyl(0.07, 0.07, 0.12, '#f8fafc', 0.12, 0.55, 0.08, { round: 0.03 } as never);
};

// ---------------------------------------------------------------------------
// Bathroom

const toilet: Builder = (k, o, m) => {
  const z = -o.d / 2 + 0.22;
  k.box(0.4, 0.38, 0.18, WHITE, 0, 0.4, z - 0.02, { round: 0.04, ...shiny });
  k.cyl(0.17, 0.12, 0.38, WHITE, 0, 0, z + 0.25, { ...shiny, seg: 18 });
  k.cyl(0.19, 0.19, 0.04, WHITE, 0, 0.38, z + 0.27, { ...shiny, seg: 18 });
  k.box(0.1, 0.02, 0.04, CHROME, 0.1, 0.78, z - 0.02, metal);
  m.seats.push(new THREE.Vector3(0, 0.42, z + 0.27));
};

const sink: Builder = (k, o) => {
  const z = -o.d / 2 + 0.25;
  k.box(0.55, 0.78, 0.42, WOOD_LIGHT, 0, 0, z, { round: 0.02 });
  k.box(0.6, 0.06, 0.46, WHITE, 0, 0.78, z, { round: 0.02, ...shiny });
  k.cyl(0.16, 0.12, 0.06, '#e2e8f0', 0, 0.8, z + 0.02, shiny);
  k.cyl(0.012, 0.012, 0.16, CHROME, 0, 0.84, z - 0.15, metal);
  k.box(0.02, 0.02, 0.09, CHROME, 0, 0.99, z - 0.12, metal);
  // mirror
  k.box(0.5, 0.7, 0.03, '#d4d4d8', 0, 1.15, -o.d / 2 + 0.02, metal);
  k.plane(0.44, 0.64, '#cfe8f2', 0, 1.5, -o.d / 2 + 0.04, { metal: 0.6, rough: 0.05 });
};

const shower: Builder = (k, o, m) => {
  const s = Math.min(o.w, o.d) - 0.08;
  k.box(s, 0.06, s, '#e5e7eb', 0, 0, 0, { round: 0.02 });
  k.cyl(0.04, 0.04, 0.005, '#9ca3af', 0, 0.06, 0);
  // glass on the two open sides
  k.box(s, 1.95, 0.02, GLASS, 0, 0.06, s / 2, { opacity: 0.28, rough: 0.05, noShadow: true });
  k.box(0.02, 1.95, s, GLASS, -s / 2, 0.06, 0, { opacity: 0.28, rough: 0.05, noShadow: true });
  k.box(s, 0.03, 0.03, CHROME, 0, 2.0, s / 2, metal);
  k.box(0.03, 0.03, s, CHROME, -s / 2, 2.0, 0, metal);
  // head
  k.cyl(0.015, 0.015, 0.4, CHROME, s / 2 - 0.08, 1.7, -s / 2 + 0.1, metal);
  k.box(0.02, 0.02, 0.3, CHROME, s / 2 - 0.08, 2.08, -s / 2 + 0.22, metal);
  k.cyl(0.09, 0.07, 0.03, CHROME, s / 2 - 0.08, 2.03, -s / 2 + 0.36, metal);
  m.parts.head = new THREE.Object3D();
  m.parts.head.position.set(s / 2 - 0.08, 2.0, -s / 2 + 0.36);
  k.keep(m.parts.head);
};

const bathtub: Builder = (k, o) => {
  const w = Math.min(o.w - 0.1, 1.7);
  const d = Math.min(o.d - 0.1, 0.8);
  k.box(w, 0.55, d, WHITE, 0, 0, 0, { round: 0.12, ...shiny });
  k.box(w - 0.16, 0.05, d - 0.16, '#a5d8e6', 0, 0.48, 0, { round: 0.04, rough: 0.05, opacity: 0.9 });
  k.cyl(0.015, 0.015, 0.2, CHROME, -w / 2 + 0.1, 0.55, 0, metal);
  k.box(0.12, 0.02, 0.02, CHROME, -w / 2 + 0.16, 0.74, 0, metal);
};

const sharedBath: Builder = (k, o) => {
  // A door in the back wall with a sign.
  const z = -o.d / 2 + 0.03;
  k.box(0.85, 2.05, 0.05, WOOD, 0, 0, z, { round: 0.01 });
  k.sphere(0.035, '#c9a86a', 0.3, 1.0, z + 0.05, metal);
  k.box(0.26, 0.14, 0.01, '#0ea5e9', 0, 1.6, z + 0.03);
};

const door: Builder = (k, o) => {
  const w = Math.min(o.w, 1) - 0.1;
  k.box(w, 0.02, 0.6, '#7c5c3b', 0, 0, -0.1, {});
  k.box(w * 0.9, 0.025, 0.4, '#b45309', 0, 0, -0.15);
};

// ---------------------------------------------------------------------------
// Decor for bigger homes and venues

const piano: Builder = (k, _o, m) => {
  k.box(1.45, 0.12, 1.4, BLACK, 0, 0.62, -0.05, { round: 0.1, rough: 0.15 });
  k.box(1.45, 0.2, 0.32, BLACK, 0, 0.62, 0.55, { rough: 0.15 });
  k.box(1.3, 0.04, 0.16, WHITE, 0, 0.82, 0.62, {});
  for (let i = 0; i < 16; i++) k.box(0.03, 0.025, 0.09, BLACK, -0.6 + i * 0.08, 0.86, 0.6);
  for (const [x, z] of [[-0.6, 0.55], [0.6, 0.55], [0, -0.6]] as const) k.cyl(0.05, 0.04, 0.62, BLACK, x, 0, z, { rough: 0.2 });
  // lid propped open
  k.box(1.3, 0.03, 1.2, BLACK, 0.12, 1.08, -0.15, { rz: 0.5, rough: 0.15 });
  k.box(0.7, 0.06, 0.35, BLACK, 0, 0.45, 0.95, { round: 0.03 });
  for (const sx of [-1, 1]) k.box(0.05, 0.45, 0.3, BLACK, sx * 0.3, 0, 0.95);
  m.seats.push(new THREE.Vector3(0, 0.5, 0.95));
};

const poolTable: Builder = (k) => {
  k.box(2.1, 0.12, 1.15, WOOD_DARK, 0, 0.66, 0, { round: 0.04 });
  k.box(1.9, 0.02, 0.95, '#166534', 0, 0.78, 0, { rough: 0.95 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(0.12, 0.66, 0.12, WOOD_DARK, sx * 0.88, 0, sz * 0.43);
  const cols = ['#facc15', '#2563eb', '#dc2626', '#7c3aed', '#f97316', '#111827', '#ffffff'];
  for (let i = 0; i < 7; i++) k.sphere(0.03, cols[i]!, -0.3 + (i % 3) * 0.06 + Math.floor(i / 3) * 0.05, 0.83, -0.08 + (i % 3) * 0.07, shiny);
  k.cyl(0.008, 0.012, 1.3, WOOD_LIGHT, 0.2, 0.82, 0.25, { rz: Math.PI / 2 - 0.04, ry: 0.3 });
};

const garageCar = (paint: string, kind: string): Builder => (k, _o, m) => {
  carModel(k, paint, kind, m);
};

/** A car, about 4 m long along z, front at +z. */
export function carModel(k: Kit, paint: string, kind: string, m?: Model) {
  if (kind === 'motorbike') {
    k.torus(0.3, 0.07, BLACK, 0, 0.32, 0.65, { ry: Math.PI / 2 });
    k.torus(0.3, 0.07, BLACK, 0, 0.32, -0.65, { ry: Math.PI / 2 });
    k.box(0.22, 0.32, 1.1, paint, 0, 0.45, 0, { round: 0.08, rough: 0.3 });
    k.box(0.28, 0.1, 0.55, BLACK, 0, 0.78, -0.2, { round: 0.04 });
    k.cyl(0.02, 0.02, 0.7, CHROME, 0, 0.62, 0.6, { ...metal, rz: Math.PI / 2 });
    k.cyl(0.02, 0.02, 0.5, CHROME, 0, 0.35, 0.55, { ...metal, rx: 0.4 });
    if (m) m.seats.push(new THREE.Vector3(0, 0.85, -0.15));
    return;
  }
  const L = kind === 'luxury' ? 4.6 : kind === 'city-suv' ? 4.4 : kind === 'hatchback' ? 3.7 : 4.2;
  const W = kind === 'city-suv' || kind === 'luxury' ? 1.85 : 1.7;
  const bodyH = kind === 'city-suv' ? 0.75 : 0.55;
  const clear = kind === 'city-suv' ? 0.3 : 0.2;
  const paintM = { rough: 0.25, metal: 0.35 };
  k.box(W, bodyH, L, paint, 0, clear, 0, { round: 0.14, ...paintM });
  const cabinL = kind === 'hatchback' ? L * 0.55 : kind === 'luxury' ? L * 0.45 : L * 0.5;
  const cabinZ = kind === 'hatchback' ? -L * 0.12 : -L * 0.05;
  const cabinH = kind === 'city-suv' ? 0.62 : 0.5;
  k.box(W - 0.14, cabinH, cabinL, '#1e293b', 0, clear + bodyH - 0.04, cabinZ, { round: 0.12, rough: 0.1, metal: 0.5 });
  k.box(W - 0.1, 0.06, cabinL - 0.2, paint, 0, clear + bodyH + cabinH - 0.08, cabinZ, { round: 0.03, ...paintM });
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      k.cyl(0.33, 0.33, 0.24, BLACK, (sx * (W - 0.16)) / 2, 0.33, sz * L * 0.32, { rz: Math.PI / 2, seg: 18 });
      k.cyl(0.18, 0.18, 0.25, CHROME, (sx * (W - 0.16)) / 2, 0.33, sz * L * 0.32, { rz: Math.PI / 2, ...metal, seg: 12 });
    }
  for (const sx of [-1, 1]) {
    k.box(0.32, 0.12, 0.04, '#fef9c3', sx * (W / 2 - 0.3), clear + bodyH - 0.2, L / 2 - 0.02, { emissive: '#fef3c7', emissiveIntensity: 0.6 });
    k.box(0.32, 0.1, 0.04, '#dc2626', sx * (W / 2 - 0.3), clear + bodyH - 0.18, -L / 2 + 0.02, { emissive: '#b91c1c', emissiveIntensity: 0.4 });
  }
  k.box(W * 0.5, 0.14, 0.04, '#111827', 0, clear + 0.12, L / 2 + 0.005);
  if (kind === 'electric') k.box(0.4, 0.02, 0.02, '#38bdf8', 0, clear + bodyH - 0.08, L / 2 + 0.01, { emissive: '#38bdf8' });
  if (kind === 'ride-hail-sedan') k.box(0.4, 0.12, 0.2, '#facc15', 0, clear + bodyH + cabinH - 0.02, cabinZ, { round: 0.03 });
  if (m) m.seats.push(new THREE.Vector3(-0.38, clear + 0.35, cabinZ + 0.1));
}

const CAR_PAINT: Record<string, string> = {
  motorbike: '#dc2626',
  hatchback: '#2563eb',
  'ride-hail-sedan': '#e5e7eb',
  'city-suv': '#1f2937',
  electric: '#f8fafc',
  luxury: '#7f1d1d',
};
export const carPaint = (id: string) => CAR_PAINT[id] ?? '#64748b';

// ---------------------------------------------------------------------------
// Venue pieces

const treadmill: Builder = (k, _o, m) => {
  k.box(0.75, 0.16, 1.7, '#27272a', 0, 0, 0, { round: 0.03 });
  k.box(0.6, 0.02, 1.5, '#111111', 0, 0.16, 0.05, { rough: 0.95 });
  for (const sx of [-1, 1]) k.box(0.05, 1.15, 0.05, '#3f3f46', sx * 0.33, 0.16, -0.75, metal);
  k.box(0.72, 0.28, 0.12, '#3f3f46', 0, 1.2, -0.75, { round: 0.03, rx: 0.4 });
  k.box(0.4, 0.15, 0.01, '#0ea5e9', 0, 1.32, -0.68, { rx: 0.4, emissive: '#0ea5e9', emissiveIntensity: 0.8 });
  for (const sx of [-1, 1]) k.box(0.04, 0.04, 0.5, '#52525b', sx * 0.33, 1.0, -0.5, metal);
  m.seats.push(new THREE.Vector3(0, 0.18, 0.1));
};

const weightRack: Builder = (k, o) => {
  const w = Math.min(o.w - 0.1, 1.6);
  k.box(w, 0.06, 0.4, '#27272a', 0, 0, 0, metal);
  for (const sx of [-1, 1]) k.box(0.06, 0.8, 0.06, '#27272a', (sx * w) / 2, 0, 0, metal);
  for (const y of [0.35, 0.7]) {
    k.box(w, 0.04, 0.06, '#27272a', 0, y, 0, metal);
    for (let i = 0; i < 5; i++) {
      const x = -w / 2 + 0.15 + (i * (w - 0.3)) / 4;
      k.cyl(0.04 + i * 0.006, 0.04 + i * 0.006, 0.08, '#18181b', x - 0.1, y + 0.08, 0, { rz: Math.PI / 2 });
      k.cyl(0.04 + i * 0.006, 0.04 + i * 0.006, 0.08, '#18181b', x + 0.1, y + 0.08, 0, { rz: Math.PI / 2 });
      k.cyl(0.012, 0.012, 0.22, CHROME, x, y + 0.08, 0, { rz: Math.PI / 2, ...metal });
    }
  }
};

const bench: Builder = (k) => {
  k.box(0.32, 0.08, 1.2, '#111827', 0, 0.42, 0, { round: 0.03 });
  for (const sz of [-1, 1]) k.box(0.06, 0.42, 0.3, '#3f3f46', 0, 0, sz * 0.45, metal);
  for (const sx of [-1, 1]) k.box(0.06, 1.2, 0.06, '#3f3f46', sx * 0.6, 0, -0.55, metal);
  k.cyl(0.015, 0.015, 1.6, CHROME, 0, 1.1, -0.55, { rz: Math.PI / 2, ...metal });
  for (const sx of [-1, 1]) k.cyl(0.2, 0.2, 0.06, '#18181b', sx * 0.72, 1.1, -0.55, { rz: Math.PI / 2 });
};

const salonStation: Builder = (k, o, m) => {
  // A chair facing a mirror on the back wall (z = -d/2).
  const z = 0.15;
  const c = o.tint ?? '#7f1d1d';
  k.cyl(0.25, 0.3, 0.06, CHROME, 0, 0, z, metal);
  k.cyl(0.05, 0.05, 0.36, CHROME, 0, 0.06, z, metal);
  k.box(0.56, 0.14, 0.52, c, 0, 0.42, z, { round: 0.05, rough: 0.35 });
  k.box(0.56, 0.62, 0.12, c, 0, 0.5, z - 0.26, { round: 0.05, rough: 0.35 });
  k.box(0.26, 0.12, 0.1, c, 0, 1.1, z - 0.28, { round: 0.04 });
  for (const sx of [-1, 1]) k.box(0.08, 0.06, 0.44, BLACK, sx * 0.31, 0.68, z, { round: 0.02 });
  k.box(0.4, 0.04, 0.2, CHROME, 0, 0.12, z + 0.4, { ...metal, rx: -0.4 });
  // mirror and shelf
  const mz = -o.d / 2 + 0.03;
  k.box(0.9, 2.0, 0.06, '#e7d9c4', 0, 0, mz, { round: 0.02 });
  k.plane(0.8, 1.05, '#d7ecf3', 0, 1.42, mz + 0.045, { metal: 0.7, rough: 0.04 });
  k.box(0.9, 0.04, 0.24, '#e7d9c4', 0, 0.8, mz + 0.12);
  for (let i = 0; i < 4; i++) k.cyl(0.03, 0.03, 0.12 + (i % 2) * 0.05, ['#0ea5e9', '#f472b6', '#facc15', '#22c55e'][i]!, -0.3 + i * 0.18, 0.84, mz + 0.12, shiny);
  k.sphere(0.1, '#fef9c3', -0.5, 1.6, mz + 0.06, { emissive: '#fff7d6', emissiveIntensity: 1.2 });
  k.sphere(0.1, '#fef9c3', 0.5, 1.6, mz + 0.06, { emissive: '#fff7d6', emissiveIntensity: 1.2 });
  m.seats.push(new THREE.Vector3(0, 0.55, z));
};

const barCounter: Builder = (k, o, m) => {
  // Counter running along x, bar stools in front (+z), shelves of bottles behind (-z).
  const w = o.w - 0.2;
  const c = o.tint ?? '#5b3a22';
  k.box(w, 1.05, 0.6, c, 0, 0, 0, { round: 0.03 });
  k.box(w + 0.12, 0.06, 0.75, '#1c1917', 0, 1.05, 0.04, { rough: 0.2 });
  k.box(w, 0.04, 0.04, '#fbbf24', 0, 0.1, 0.31, { emissive: '#f59e0b', emissiveIntensity: 1.2, noShadow: true });
  const back = -o.d / 2 + 0.2;
  k.box(w, 0.9, 0.3, '#3f2a1c', 0, 0, back);
  for (const y of [1.3, 1.7]) {
    k.box(w, 0.04, 0.25, '#3f2a1c', 0, y, back - 0.03);
    for (let i = 0; i < Math.floor(w / 0.16); i++)
      k.cyl(0.035, 0.035, 0.22 + (i % 3) * 0.04, ['#15803d', '#b45309', '#e5e7eb', '#7c2d12', '#0e7490'][i % 5]!, -w / 2 + 0.1 + i * 0.16, y + 0.04, back - 0.03, { opacity: 0.85, rough: 0.1 });
  }
  k.plane(w, 0.9, '#3a2a20', 0, 1.6, -o.d / 2 + 0.02, { emissive: '#7c2d12', emissiveIntensity: 0.25 });
  const stools = Math.max(2, Math.floor(w / 0.75));
  for (let i = 0; i < stools; i++) {
    const x = -w / 2 + (w / stools) * (i + 0.5);
    chairAt(k, x, 0.7, Math.PI, 'bar', '#9f1239');
    m.seats.push(new THREE.Vector3(x, 0.78, 0.7));
  }
  m.top = 1.11;
};

const djBooth: Builder = (k, o, m) => {
  k.box(1.8, 1.0, 0.7, '#111827', 0, 0, 0, { round: 0.04 });
  k.box(1.8, 0.04, 0.04, o.tint ?? '#a855f7', 0, 0.98, 0.35, { emissive: o.tint ?? '#a855f7', emissiveIntensity: 1.5, noShadow: true });
  k.box(1.7, 0.08, 0.6, '#27272a', 0, 1.0, 0, {});
  for (const sx of [-1, 1]) {
    const deck = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.02, 20), mat('#0a0a0a', { rough: 0.3 }));
    deck.position.set(sx * 0.48, 1.09, 0);
    k.keep(deck);
    m.parts[sx < 0 ? 'deckL' : 'deckR'] = deck;
    k.sphere(0.02, '#e5e7eb', sx * 0.48, 1.1, 0, metal);
  }
  k.box(0.4, 0.04, 0.3, '#3f3f46', 0, 1.08, 0, {});
  for (let i = 0; i < 6; i++) k.sphere(0.012, ['#22c55e', '#facc15', '#ef4444'][i % 3]!, -0.15 + i * 0.06, 1.12, 0.08, { emissive: ['#22c55e', '#facc15', '#ef4444'][i % 3] });
  for (const sx of [-1, 1]) {
    k.box(0.55, 1.4, 0.5, '#18181b', sx * 1.3, 0, 0, { round: 0.02 });
    k.cyl(0.18, 0.18, 0.02, '#3f3f46', sx * 1.3, 0.85, 0.255, { rx: Math.PI / 2 });
    k.cyl(0.09, 0.09, 0.02, '#3f3f46', sx * 1.3, 1.2, 0.255, { rx: Math.PI / 2 });
    k.cyl(0.18, 0.18, 0.02, '#3f3f46', sx * 1.3, 0.35, 0.255, { rx: Math.PI / 2 });
  }
};

const cinemaSeat: Builder = (k, o, m) => {
  const n = Math.max(1, Math.round(o.w / 0.62));
  const sw = o.w / n;
  const c = o.tint ?? '#991b1b';
  for (let i = 0; i < n; i++) {
    const x = -o.w / 2 + sw * (i + 0.5);
    k.box(sw - 0.1, 0.16, 0.55, c, x, 0.32, 0.03, { round: 0.05 });
    k.box(sw - 0.1, 0.72, 0.16, c, x, 0.32, -0.26, { round: 0.06 });
    m.seats.push(new THREE.Vector3(x, 0.48, 0.05));
  }
  for (let i = 0; i <= n; i++) k.box(0.08, 0.62, 0.62, '#27272a', -o.w / 2 + sw * i, 0, 0, { round: 0.02 });
};

const restaurantTable: Builder = (k, o, m) => {
  const round = (o.seed ?? 0) % 2 === 0;
  const cloth = o.tint ?? '#f8fafc';
  if (round) {
    k.cyl(0.48, 0.48, 0.05, cloth, 0, 0.72, 0, { seg: 24 });
    k.cyl(0.5, 0.5, 0.22, cloth, 0, 0.53, 0, { seg: 24 });
    k.cyl(0.05, 0.05, 0.53, WOOD_DARK, 0, 0, 0);
  } else {
    k.box(1.1, 0.05, 0.75, cloth, 0, 0.72, 0, { round: 0.01 });
    k.box(1.12, 0.2, 0.77, cloth, 0, 0.54, 0);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(0.05, 0.54, 0.05, WOOD_DARK, sx * 0.48, 0, sz * 0.3);
  }
  k.cyl(0.04, 0.035, 0.14, '#fde68a', 0, 0.77, 0, { emissive: '#f59e0b', emissiveIntensity: 0.6 });
  for (const sx of [-1, 1]) {
    k.cyl(0.13, 0.11, 0.02, WHITE, sx * 0.3, 0.77, 0, shiny);
    k.cyl(0.03, 0.025, 0.12, '#e0f2fe', sx * 0.3, 0.77, -0.18, { opacity: 0.5, rough: 0.05 });
  }
  m.top = 0.77;
};

const officeDesk: Builder = (k, o, m) => {
  const w = Math.min(o.w - 0.1, 1.4);
  k.box(w, 0.04, 0.7, '#e7e5e4', 0, 0.72, 0, { round: 0.01 });
  for (const sx of [-1, 1]) k.box(0.04, 0.72, 0.6, '#71717a', (sx * (w - 0.06)) / 2, 0, 0, metal);
  k.box(0.5, 0.3, 0.03, BLACK, 0, 0.84, -0.25);
  screen(k, m, 0.46, 0.26, 0, 1.0, -0.233, 'slide');
  k.box(0.04, 0.1, 0.04, BLACK, 0, 0.76, -0.26);
  k.box(0.36, 0.015, 0.12, '#d4d4d8', 0, 0.76, 0.05);
  k.cyl(0.04, 0.035, 0.1, '#f97316', w / 2 - 0.15, 0.76, -0.1);
  chairAt(k, 0, 0.55, Math.PI, 'ergo');
  m.seats.push(new THREE.Vector3(0, 0.46, 0.55));
  m.top = 0.76;
};

const meetingTable: Builder = (k, o, m) => {
  const w = Math.min(o.w - 1.0, 2.6);
  k.box(w, 0.06, 1.1, o.tint ?? WOOD_DARK, 0, 0.72, 0, { round: 0.04, rough: 0.3 });
  k.box(w * 0.5, 0.72, 0.4, '#3f3f46', 0, 0, 0);
  const n = Math.max(2, Math.floor(w / 0.8));
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + (w / n) * (i + 0.5);
    chairAt(k, x, 0.85, Math.PI, 'ergo');
    chairAt(k, x, -0.85, 0, 'ergo');
    m.seats.push(new THREE.Vector3(x, 0.46, 0.85));
    k.box(0.3, 0.01, 0.22, '#e5e7eb', x, 0.78, 0.25);
  }
  m.top = 0.78;
};

const bankCounter: Builder = (k, o) => {
  const w = o.w - 0.2;
  k.box(w, 1.1, 0.7, '#d6d3d1', 0, 0, 0, { round: 0.02 });
  k.box(w + 0.1, 0.05, 0.8, '#57534e', 0, 1.1, 0, { rough: 0.2 });
  k.box(w, 0.7, 0.02, GLASS, 0, 1.15, 0, { opacity: 0.3, rough: 0.05, noShadow: true });
  const n = Math.max(2, Math.floor(w / 1.4));
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + (w / n) * (i + 0.5);
    k.box(0.4, 0.28, 0.03, BLACK, x, 1.16, -0.2, { rx: 0.15 });
    k.box(0.16, 0.08, 0.01, '#0ea5e9', x, 1.9, 0.02, { emissive: '#0ea5e9' });
  }
  k.box(w, 0.06, 0.03, o.tint ?? '#1d4ed8', 0, 0.8, 0.36, {});
};

const shelfUnit: Builder = (k, o) => {
  const w = o.w - 0.1;
  const h = 1.8;
  k.box(w, h, 0.03, '#d6d3d1', 0, 0, -0.2);
  for (let i = 0; i < 4; i++) {
    const y = 0.1 + i * 0.45;
    k.box(w, 0.03, 0.42, '#e7e5e4', 0, y, 0);
    for (let j = 0; j < Math.floor(w / 0.2); j++)
      k.box(0.14, 0.18 + ((i + j) % 3) * 0.05, 0.25, ['#ef4444', '#3b82f6', '#f59e0b', '#22c55e', '#a855f7', '#f8fafc'][(i * 3 + j) % 6]!, -w / 2 + 0.12 + j * 0.2, y + 0.03, 0, { round: 0.01 });
  }
};

const counter: Builder = (k, o, m) => {
  const w = o.w - 0.1;
  k.box(w, 0.98, 0.6, o.tint ?? '#e7e5e4', 0, 0, 0, { round: 0.02 });
  k.box(w + 0.06, 0.05, 0.66, '#44403c', 0, 0.98, 0, { rough: 0.2 });
  k.box(0.32, 0.24, 0.24, BLACK, w / 2 - 0.3, 1.03, 0, { round: 0.02 });
  k.box(0.28, 0.18, 0.01, '#22c55e', w / 2 - 0.3, 1.06, 0.125, { emissive: '#16a34a', emissiveIntensity: 0.4 });
  m.top = 1.03;
};

const espresso: Builder = (k) => {
  k.box(0.6, 0.45, 0.45, CHROME, 0, 0, 0, { round: 0.04, ...metal });
  k.box(0.5, 0.06, 0.08, BLACK, 0, 0.2, 0.25);
  for (const sx of [-1, 1]) k.cyl(0.03, 0.03, 0.08, BLACK, sx * 0.13, 0.12, 0.22);
};

const screenWall: Builder = (k, o, m) => {
  const w = o.w - 0.4;
  const h = Math.min(w * 0.45, 2.2);
  k.box(w + 0.16, h + 0.16, 0.06, '#0a0a0a', 0, 0.7, -o.d / 2 + 0.05);
  screen(k, m, w, h, 0, 0.78 + h / 2, -o.d / 2 + 0.085, 'film');
};

const stagePlatform: Builder = (k, o, m) => {
  k.box(o.w, 0.45, o.d, '#27272a', 0, 0, 0, { round: 0.02 });
  k.box(o.w, 0.03, 0.04, o.tint ?? '#f59e0b', 0, 0.42, o.d / 2, { emissive: o.tint ?? '#f59e0b', emissiveIntensity: 1.2, noShadow: true });
  // lectern
  k.box(0.5, 1.05, 0.4, WOOD_DARK, o.w * 0.28, 0.45, 0, { round: 0.02 });
  k.box(0.56, 0.04, 0.46, WOOD, o.w * 0.28, 1.5, 0, { rx: -0.2 });
  k.cyl(0.006, 0.006, 0.3, BLACK, o.w * 0.28 - 0.1, 1.52, 0.1, { rx: 0.5 });
  m.top = 0.45;
};

const arcadeMachine: Builder = (k, o, m) => {
  const c = o.tint ?? '#7c3aed';
  k.box(0.7, 1.75, 0.7, c, 0, 0, 0, { round: 0.03 });
  k.box(0.72, 0.18, 0.3, BLACK, 0, 1.0, 0.38, { rx: -0.35 });
  k.box(0.6, 0.14, 0.02, '#fde047', 0, 1.68, 0.36, { emissive: '#facc15', emissiveIntensity: 1 });
  k.box(0.6, 0.5, 0.03, BLACK, 0, 1.15, 0.34, { rx: -0.15 });
  screen(k, m, 0.52, 0.42, 0, 1.38, 0.37, 'game', 0);
  if (m.parts.screen) m.parts.screen.rotation.x = -0.15;
  k.cyl(0.02, 0.02, 0.08, BLACK, -0.12, 1.08, 0.45);
  k.sphere(0.035, '#ef4444', -0.12, 1.17, 0.45);
  for (let i = 0; i < 3; i++) k.cyl(0.03, 0.03, 0.02, ['#22d3ee', '#f472b6', '#facc15'][i]!, 0.05 + i * 0.08, 1.07, 0.46, { rx: -0.35 });
};

const massageTable: Builder = (k, _o, m) => {
  k.box(0.75, 0.12, 1.9, '#f5f5f4', 0, 0.62, 0, { round: 0.05 });
  k.box(0.7, 0.06, 1.85, '#a8a29e', 0, 0.68, 0, { round: 0.03 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(0.05, 0.62, 0.05, WOOD_LIGHT, sx * 0.3, 0, sz * 0.8);
  k.box(0.5, 0.08, 0.3, WHITE, 0, 0.74, -0.7, { round: 0.04 });
  for (let i = 0; i < 3; i++) k.cyl(0.03, 0.03, 0.08, '#fef3c7', 0.55, 0.0, -0.4 + i * 0.1, { emissive: '#f59e0b', emissiveIntensity: 1.2 });
  m.seats.push(new THREE.Vector3(0, 0.8, 0));
};

const lounger: Builder = (k, o, m) => {
  k.box(0.7, 0.3, 1.9, '#f8fafc', 0, 0.08, 0.1, { round: 0.06 });
  k.box(0.7, 0.7, 0.15, '#f8fafc', 0, 0.3, -0.85, { round: 0.06, rx: -0.6 });
  k.box(0.66, 0.08, 1.7, o.tint ?? '#0ea5e9', 0, 0.38, 0.15, { round: 0.04 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(0.05, 0.1, 0.05, WOOD_LIGHT, sx * 0.3, 0, sz * 0.8 + 0.1);
  m.seats.push(new THREE.Vector3(0, 0.55, 0.2));
};

const parasol: Builder = (k, o) => {
  k.cyl(0.02, 0.02, 2.2, WOOD_LIGHT, 0, 0, 0);
  k.cyl(0.0, 1.1, 0.45, o.tint ?? '#f97316', 0, 1.9, 0, { seg: 10, side: THREE.DoubleSide });
};

const goal: Builder = (k, o) => {
  const w = Math.min(o.w, 3);
  for (const sx of [-1, 1]) k.cyl(0.05, 0.05, 1.6, WHITE, (sx * w) / 2, 0, 0);
  k.cyl(0.05, 0.05, w, WHITE, 0, 1.6, 0, { rz: Math.PI / 2 });
  k.box(w, 1.6, 0.02, '#e5e7eb', 0, 0, -0.6, { opacity: 0.35, noShadow: true });
  k.box(0.02, 1.6, 0.6, '#e5e7eb', -w / 2, 0, -0.3, { opacity: 0.35, noShadow: true });
  k.box(0.02, 1.6, 0.6, '#e5e7eb', w / 2, 0, -0.3, { opacity: 0.35, noShadow: true });
};

const easel: Builder = (k, o) => {
  // A painting on a white plinth wall section.
  k.box(1.1, 0.06, 0.06, WHITE, 0, 0.2, 0);
  k.box(1.3, 1.0, 0.06, '#b8892e', 0, 1.0, -0.02, metal);
  k.plane(1.2, 0.9, '#ffffff', 0, 1.5, 0.015, { map: paintingTexture(o.seed ?? 3) });
};

const workbench: Builder = (k, o) => {
  const w = o.w - 0.2;
  k.box(w, 0.06, 0.7, WOOD, 0, 0.86, 0, {});
  for (const sx of [-1, 1]) k.box(0.06, 0.86, 0.6, '#3f3f46', (sx * (w - 0.1)) / 2, 0, 0, metal);
  k.box(w, 1.0, 0.04, '#52525b', 0, 0.92, -0.33);
  for (let i = 0; i < 6; i++) k.box(0.04, 0.25, 0.02, ['#ef4444', '#facc15', '#3b82f6'][i % 3]!, -w / 2 + 0.2 + i * 0.22, 1.4, -0.3);
  k.box(0.3, 0.2, 0.2, '#dc2626', w / 4, 0.92, 0, { round: 0.02 });
};

const reception: Builder = (k, o, m) => {
  const w = Math.min(o.w - 0.2, 2.4);
  k.box(w, 1.05, 0.55, o.tint ?? '#f5f5f4', 0, 0, 0, { round: 0.06 });
  k.box(w + 0.1, 0.05, 0.7, '#a8a29e', 0, 1.05, 0.05, { rough: 0.25 });
  k.box(0.5, 0.32, 0.03, BLACK, -w / 4, 1.1, -0.15, { rx: 0.1 });
  k.cyl(0.05, 0.06, 0.12, '#10b981', w / 3, 1.1, 0);
  m.top = 1.1;
};

const checkin: Builder = (k, o) => {
  const w = o.w - 0.2;
  k.box(w, 1.0, 0.6, '#cbd5e1', 0, 0, 0, { round: 0.02 });
  k.box(w, 0.04, 0.65, '#475569', 0, 1.0, 0);
  k.box(w, 0.3, 0.04, '#1d4ed8', 0, 2.1, -0.3, { emissive: '#1d4ed8', emissiveIntensity: 0.3 });
  for (let i = 0; i < 3; i++) k.box(0.5, 0.4, 0.4, '#334155', -w / 3 + (i * w) / 3, 0, 0.7, { round: 0.03 });
};

const crate: Builder = (k, o) => {
  // A market stall: a table of produce under an awning.
  const w = o.w - 0.2;
  const c = o.tint ?? '#16a34a';
  k.box(w, 0.8, 0.7, WOOD, 0, 0, 0, {});
  for (let i = 0; i < Math.floor(w / 0.2); i++)
    k.sphere(0.07, ['#ef4444', '#f59e0b', '#84cc16', '#a855f7'][i % 4]!, -w / 2 + 0.12 + i * 0.2, 0.86, (i % 2) * 0.15 - 0.07, { seg: 8 });
  for (const sx of [-1, 1]) k.cyl(0.03, 0.03, 2.1, WOOD_DARK, (sx * w) / 2, 0, -0.3);
  k.box(w + 0.2, 0.05, 1.0, c, 0, 2.05, 0.05, { rx: 0.25 });
};

const displayCase: Builder = (k, o, m) => {
  k.box(o.w - 0.2, 0.9, 0.6, '#f8fafc', 0, 0, 0, { round: 0.02 });
  k.box(o.w - 0.2, 0.35, 0.6, GLASS, 0, 0.9, 0, { opacity: 0.3, rough: 0.05, noShadow: true });
  const n = Math.max(1, Math.floor((o.w - 0.4) / 0.35));
  for (let i = 0; i < n; i++) k.box(0.18, 0.12, 0.18, ['#ef4444', '#3b82f6', '#f59e0b', '#a855f7'][i % 4]!, -(o.w - 0.6) / 2 + i * 0.35, 0.92, 0, { round: 0.02 });
  m.top = 0.92;
};

const hotelBed: Builder = (k, o, m) => bed(k, { ...o, tier: 3 }, m);

const sunbed = lounger;

const spaPool: Builder = (k, o) => {
  k.box(o.w, 0.3, o.d, '#e7e5e4', 0, 0, 0, { round: 0.05 });
  k.box(o.w - 0.3, 0.02, o.d - 0.3, '#38bdf8', 0, 0.28, 0, { rough: 0.05, opacity: 0.85, emissive: '#0ea5e9', emissiveIntensity: 0.15 });
};

const microphone: Builder = (k) => {
  k.cyl(0.12, 0.14, 0.02, BLACK, 0, 0, 0, metal);
  k.cyl(0.01, 0.01, 1.35, BLACK, 0, 0.02, 0, metal);
  k.sphere(0.04, '#3f3f46', 0, 1.4, 0.03, metal);
};

// ---------------------------------------------------------------------------
// The table

export const BUILDERS: Record<string, Builder> = {
  bed,
  mat: mat_,
  wardrobe,
  desk,
  laptop,
  sofa,
  cushions,
  armchair,
  'coffee-table': coffeeTable,
  tv,
  sound,
  gaming,
  books,
  plants,
  art,
  rug,
  dining,
  lights,
  kitchen,
  kitchenette,
  fridge,
  washer,
  cooling,
  power,
  coffee,
  wifi,
  toilet,
  sink,
  shower,
  bathtub,
  'shared-bath': sharedBath,
  door,
  piano,
  'pool-table': poolTable,
  treadmill,
  'weight-rack': weightRack,
  bench,
  'salon-station': salonStation,
  'bar-counter': barCounter,
  'dj-booth': djBooth,
  'cinema-seats': cinemaSeat,
  'restaurant-table': restaurantTable,
  'office-desk': officeDesk,
  'meeting-table': meetingTable,
  'bank-counter': bankCounter,
  shelves: shelfUnit,
  counter,
  espresso,
  'screen-wall': screenWall,
  stage: stagePlatform,
  arcade: arcadeMachine,
  'massage-table': massageTable,
  lounger,
  sunbed,
  parasol,
  goal,
  easel,
  workbench,
  reception,
  checkin,
  stall: crate,
  'display-case': displayCase,
  'hotel-bed': hotelBed,
  'spa-pool': spaPool,
  mic: microphone,
  car: garageCar('#64748b', 'hatchback'),
};

/** A plain crate: the fallback for anything we don't know. */
const fallback: Builder = (k, o) => {
  const w = Math.min(o.w - 0.2, 0.8);
  const d = Math.min(o.d - 0.2, 0.6);
  k.box(w, 0.6, d, WOOD_LIGHT, 0, 0, 0, { round: 0.03 });
  k.box(w + 0.02, 0.04, d + 0.02, WOOD, 0, 0.6, 0);
};

/** Build a model by id (a car id builds that car). */
export function buildModel(id: string, o: ModelOpts): Model {
  const k = new Kit();
  const m: Model = { group: new THREE.Group(), parts: {}, lamps: [], screens: [], seats: [] };
  const carKind = id.startsWith('car:') ? id.slice(4) : null;
  if (carKind) carModel(k, o.tint ?? carPaint(carKind), carKind, m);
  else (BUILDERS[id] ?? fallback)(k, o, m);
  m.group = k.build();
  // A soft contact shadow under floor-standing things.
  if (!['art', 'rug', 'cooling', 'shared-bath', 'door', 'laptop', 'mic'].includes(id)) {
    const sw = carKind ? 2.2 : Math.max(0.5, o.w * 0.95);
    const sd = carKind ? 4.8 : Math.max(0.5, o.d * 0.95);
    const s = contactShadow(sw, sd, carKind ? 0.6 : 0.42);
    m.group.add(s);
  }
  m.group.userData.modelId = id;
  return m;
}

export const hasBuilder = (id: string) => id in BUILDERS || id.startsWith('car:');

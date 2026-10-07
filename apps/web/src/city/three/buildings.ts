/**
 * Wave 9 §B: buildings. Three sources, one look (materials.ts):
 *
 * - OpenStreetMap outlines from the city file, extruded to their real
 *   heights and merged per chunk; tall ones get setbacks and a crown.
 * - Full-density tiles (public/geo/<city>/), when present (tiles.ts).
 * - Everywhere else: plausible infill, made deterministically along the
 *   real streets' grain — rows of lots with heights and styles by zone (the
 *   city's low-rise, its mid-rise, its downtown towers). Lots near the camera
 *   are made on demand per chunk (instanced boxes and pitched-roof houses);
 *   tall ones are made city-wide once, so the skyline shows from anywhere.
 */
import * as THREE from 'three';
import type { GeoData } from '../geo';
import type { CityLook } from './cities';
import { COVER, type GroundMask } from './mask';
import { rgbBytes, type SharedUniforms, facadeMaterial } from './materials';
import type { RoadIndex } from './roads';

// ---------------------------------------------------------------------------
// Deterministic hashing (no Math.random anywhere in the city).

export function h3(a: number, b: number, c = 0): number {
  let h = Math.imul((a | 0) ^ 0x9e3779b9, 0x85ebca6b);
  h ^= Math.imul((b | 0) + 0x632be5ab, 0xc2b2ae35);
  h ^= Math.imul((c | 0) + 0x27d4eb2f, 0x165667b1);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}
const pick = <T>(arr: T[], r: number): T => arr[Math.min(arr.length - 1, Math.floor(r * arr.length))]!;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const byteCache = new Map<string, [number, number, number]>();
export function bytes(hex: string) {
  let b = byteCache.get(hex);
  if (!b) byteCache.set(hex, (b = rgbBytes(hex)));
  return b;
}

// ---------------------------------------------------------------------------
// Boxes (instanced)

export interface BoxB {
  /** Centre on the ground (metres, x east, y south). */
  x: number;
  y: number;
  w: number;
  d: number;
  h: number;
  /** Base height. */
  y0: number;
  /** Direction of the box's width axis (radians, in the x/y plane). */
  rot: number;
  style: number;
  wall: [number, number, number];
  roof: [number, number, number];
  seed: number;
  /** Window rows continue from this height (upper tiers of a tower). */
  vOff: number;
  /** 0 flat, 1 pitched (a house). */
  roofType: 0 | 1;
}

/** A unit box (x, z in ±0.5, y 0–1) without a floor; aPart 0 walls, 1 roof. */
function unitBox(): THREE.BufferGeometry {
  const P: number[] = [];
  const N: number[] = [];
  const A: number[] = [];
  const quad = (a: number[], b: number[], c: number[], d: number[], n: number[], part: number) => {
    P.push(...a, ...b, ...c, ...a, ...c, ...d);
    for (let i = 0; i < 6; i++) {
      N.push(...n);
      A.push(part);
    }
  };
  const h = 0.5;
  quad([-h, 0, h], [h, 0, h], [h, 1, h], [-h, 1, h], [0, 0, 1], 0);
  quad([h, 0, -h], [-h, 0, -h], [-h, 1, -h], [h, 1, -h], [0, 0, -1], 0);
  quad([h, 0, h], [h, 0, -h], [h, 1, -h], [h, 1, h], [1, 0, 0], 0);
  quad([-h, 0, -h], [-h, 0, h], [-h, 1, h], [-h, 1, -h], [-1, 0, 0], 0);
  quad([-h, 1, h], [h, 1, h], [h, 1, -h], [-h, 1, -h], [0, 1, 0], 1);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('aPart', new THREE.Float32BufferAttribute(A, 1));
  return g;
}

/** A house: walls to 1, a gabled roof (ridge along x) to 1 + R, with eaves. */
function unitHouse(R = 0.42): THREE.BufferGeometry {
  const P: number[] = [];
  const A: number[] = [];
  const tri = (a: number[], b: number[], c: number[], part: number) => {
    P.push(...a, ...b, ...c);
    A.push(part, part, part);
  };
  const quad = (a: number[], b: number[], c: number[], d: number[], part: number) => {
    tri(a, b, c, part);
    tri(a, c, d, part);
  };
  const h = 0.5;
  const e = 0.56;
  quad([-h, 0, h], [h, 0, h], [h, 1, h], [-h, 1, h], 0);
  quad([h, 0, -h], [-h, 0, -h], [-h, 1, -h], [h, 1, -h], 0);
  quad([h, 0, h], [h, 0, -h], [h, 1, -h], [h, 1, h], 0);
  quad([-h, 0, -h], [-h, 0, h], [-h, 1, h], [-h, 1, -h], 0);
  // Gable ends.
  tri([h, 1, h], [h, 1, -h], [h, 1 + R, 0], 3);
  tri([-h, 1, -h], [-h, 1, h], [-h, 1 + R, 0], 3);
  // Slopes, overhanging.
  quad([-e, 1 - 0.06, e], [e, 1 - 0.06, e], [e, 1 + R, 0], [-e, 1 + R, 0], 2);
  quad([e, 1 - 0.06, -e], [-e, 1 - 0.06, -e], [-e, 1 + R, 0], [e, 1 + R, 0], 2);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('aPart', new THREE.Float32BufferAttribute(A, 1));
  g.computeVertexNormals();
  return g;
}

let BOX: THREE.BufferGeometry | null = null;
let HOUSE: THREE.BufferGeometry | null = null;

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

/** Instanced meshes for a list of boxes (boxes, then houses). */
export function boxMeshes(list: BoxB[], mat: THREE.Material): THREE.InstancedMesh[] {
  BOX ??= unitBox();
  HOUSE ??= unitHouse();
  const out: THREE.InstancedMesh[] = [];
  for (const kind of [0, 1] as const) {
    const items = list.filter((b) => b.roofType === kind);
    if (!items.length) continue;
    const mesh = new THREE.InstancedMesh(kind ? HOUSE : BOX, mat, items.length);
    const col = new Uint8Array(items.length * 3);
    const roof = new Uint8Array(items.length * 3);
    const sty = new Uint8Array(items.length * 3);
    items.forEach((b, i) => {
      _q.setFromAxisAngle(_up, -b.rot);
      _p.set(b.x, b.y0, b.y);
      _s.set(b.w, b.h, b.d);
      _m.compose(_p, _q, _s);
      mesh.setMatrixAt(i, _m);
      col.set(b.wall, i * 3);
      roof.set(b.roof, i * 3);
      sty[i * 3] = b.style;
      sty[i * 3 + 1] = Math.floor(b.seed * 255);
      sty[i * 3 + 2] = Math.min(255, Math.max(0, Math.round(b.vOff)));
    });
    mesh.geometry = mesh.geometry.clone();
    mesh.geometry.setAttribute('iColor', new THREE.InstancedBufferAttribute(col, 3, true));
    mesh.geometry.setAttribute('iRoof', new THREE.InstancedBufferAttribute(roof, 3, true));
    mesh.geometry.setAttribute('iStyle', new THREE.InstancedBufferAttribute(sty, 3, true));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.computeBoundingBox();
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    out.push(mesh);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Merged extrusions (outlines)

class Writer {
  pos: number[] = [];
  col: number[] = [];
  fac: number[] = [];
  hl: number[] = [];
  vert(x: number, y: number, z: number, c: [number, number, number], u: number, v: number, st: number, seed: number, hl: number) {
    this.pos.push(x, y, z);
    this.col.push(c[0], c[1], c[2]);
    this.fac.push(u, v, st, seed);
    this.hl.push(hl);
  }
  geometry(): THREE.BufferGeometry | null {
    if (!this.pos.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('aCol', new THREE.BufferAttribute(new Uint8Array(this.col), 3, true));
    g.setAttribute('aFac', new THREE.Float32BufferAttribute(this.fac, 4));
    g.setAttribute('aHl', new THREE.BufferAttribute(new Uint8Array(this.hl), 1, true));
    g.computeBoundingSphere();
    return g;
  }
}

export interface Footprint {
  /** Outline (metres, x east, y south), not closed. */
  p: number[];
  base: number;
  top: number;
  vOff: number;
  style: number;
  wall: [number, number, number];
  roof: [number, number, number];
  seed: number;
  hl?: number;
  /** No roof cap (a crown sits on it). */
  open?: boolean;
}

/** Signed area in the file's frame (x east, y south). */
function signedArea(p: number[]) {
  let a = 0;
  const n = p.length / 2;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    a += p[2 * i]! * p[2 * j + 1]! - p[2 * j]! * p[2 * i + 1]!;
  }
  return a / 2;
}

/** A clean outline: no closing duplicate, walls facing out. */
export function cleanOutline(src: ArrayLike<number>): number[] | null {
  const p: number[] = [];
  for (let i = 0; i + 1 < src.length; i += 2) {
    const x = src[i]!;
    const y = src[i + 1]!;
    const n = p.length;
    if (n >= 2 && Math.abs(p[n - 2]! - x) < 0.05 && Math.abs(p[n - 1]! - y) < 0.05) continue;
    p.push(x, y);
  }
  if (p.length >= 4 && Math.abs(p[0]! - p[p.length - 2]!) < 0.05 && Math.abs(p[1]! - p[p.length - 1]!) < 0.05)
    p.length -= 2;
  if (p.length < 6) return null;
  if (signedArea(p) > 0) {
    // Reverse to the winding the walls need.
    const r: number[] = [];
    for (let i = p.length - 2; i >= 0; i -= 2) r.push(p[i]!, p[i + 1]!);
    return r;
  }
  return p;
}

function extrude(w: Writer, f: Footprint) {
  const p = f.p;
  const n = p.length / 2;
  let u = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const ax = p[2 * i]!;
    const ay = p[2 * i + 1]!;
    const bx = p[2 * j]!;
    const by = p[2 * j + 1]!;
    const L = Math.hypot(bx - ax, by - ay);
    const v0 = f.vOff;
    const v1 = f.vOff + (f.top - f.base);
    const hl = f.hl ?? 0;
    // a0 b0 b1 / a0 b1 a1
    w.vert(ax, f.base, ay, f.wall, u, v0, f.style, f.seed, hl);
    w.vert(bx, f.base, by, f.wall, u + L, v0, f.style, f.seed, hl);
    w.vert(bx, f.top, by, f.wall, u + L, v1, f.style, f.seed, hl);
    w.vert(ax, f.base, ay, f.wall, u, v0, f.style, f.seed, hl);
    w.vert(bx, f.top, by, f.wall, u + L, v1, f.style, f.seed, hl);
    w.vert(ax, f.top, ay, f.wall, u, v1, f.style, f.seed, hl);
    u += L;
  }
  if (f.open) return;
  const contour: THREE.Vector2[] = [];
  for (let i = 0; i < n; i++) contour.push(new THREE.Vector2(p[2 * i]!, p[2 * i + 1]!));
  const tris = THREE.ShapeUtils.triangulateShape(contour, []);
  for (const t of tris) {
    let [a, b, c] = t as [number, number, number];
    const ax = p[2 * a]!;
    const az = p[2 * a + 1]!;
    const cy = (p[2 * b + 1]! - az) * (p[2 * c]! - ax) - (p[2 * b]! - ax) * (p[2 * c + 1]! - az);
    if (cy < 0) [b, c] = [c, b];
    for (const k of [a, b, c])
      w.vert(p[2 * k]!, f.top, p[2 * k + 1]!, f.roof, p[2 * k]!, p[2 * k + 1]!, 8, f.seed, f.hl ?? 0);
  }
}

export function mergedMesh(list: Footprint[], mat: THREE.Material): THREE.Mesh | null {
  const w = new Writer();
  for (const f of list) extrude(w, f);
  const g = w.geometry();
  if (!g) return null;
  const m = new THREE.Mesh(g, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function centroid(p: number[]) {
  let x = 0;
  let y = 0;
  const n = p.length / 2;
  for (let i = 0; i < n; i++) {
    x += p[2 * i]!;
    y += p[2 * i + 1]!;
  }
  return { x: x / n, y: y / n };
}

function inPoly(p: number[], x: number, y: number) {
  let inside = false;
  const n = p.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = p[2 * i]!;
    const yi = p[2 * i + 1]!;
    const xj = p[2 * j]!;
    const yj = p[2 * j + 1]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi || 1e-9) + xi) inside = !inside;
  }
  return inside;
}

const scaled = (p: number[], c: { x: number; y: number }, k: number) =>
  p.map((v, i) => (i % 2 ? c.y + (v - c.y) * k : c.x + (v - c.x) * k));

// ---------------------------------------------------------------------------
// Styles

const BRICK_SHARE: Record<string, number> = {
  london: 0.75,
  cairo: 0.3,
  johannesburg: 0.25,
  'san-francisco': 0.05,
};

/** Walls and roof of a building of `style`, from the city's palette. */
function paint(look: CityLook, style: number, r: number, pitched: boolean) {
  const wall =
    style === 1
      ? pick(look.brick, r)
      : style === 2 || style === 4
        ? pick(look.stone, r)
        : style === 3
          ? pick(look.glass, r)
          : pick(look.walls, r);
  const roof = pitched ? pick(look.pitchedRoofs, (r * 7.3) % 1) : pick(look.flatRoofs, (r * 5.1) % 1);
  return { wall: bytes(wall), roof: bytes(roof) };
}

/** A tower's tiers (setbacks) and crown, as boxes. */
function towerBoxes(out: BoxB[], b: BoxB, look: CityLook, r: number) {
  const H = b.h;
  if (H < 70) {
    out.push(b);
    return;
  }
  const t1 = H * lerp(0.5, 0.7, r);
  const t2 = H * lerp(0.78, 0.9, (r * 3.7) % 1);
  const k1 = lerp(0.78, 0.9, (r * 5.3) % 1);
  const k2 = k1 * lerp(0.75, 0.9, (r * 9.1) % 1);
  out.push({ ...b, h: t1 });
  out.push({ ...b, y0: t1, h: t2 - t1, w: b.w * k1, d: b.d * k1, vOff: t1 });
  out.push({ ...b, y0: t2, h: H - t2, w: b.w * k2, d: b.d * k2, vOff: t2 });
  // Crown: a lantern, a plant room, or a spire.
  const crown = (r * 13.1) % 1;
  if (crown < 0.4)
    out.push({ ...b, style: 7, y0: H, h: 6, w: b.w * k2 * 0.6, d: b.d * k2 * 0.6, vOff: 0, wall: bytes(pick(look.stone, r)) });
  else if (crown < 0.7)
    out.push({ ...b, style: 10, y0: H, h: 4, w: b.w * k2 * 0.45, d: b.d * k2 * 0.5, vOff: 0, roof: bytes('#8f949a') });
  else
    out.push({ ...b, style: 10, y0: H, h: 22, w: 1.2, d: 1.2, vOff: 0, roof: bytes('#9aa0a6') });
}

/** Rooftop plant on a flat roof. */
function units(out: BoxB[], b: BoxB) {
  if (b.roofType || b.w * b.d < 140 || b.style === 3) return;
  const n = b.w * b.d > 600 ? 2 : 1;
  for (let k = 0; k < n; k++) {
    const r = h3(Math.round(b.x * 10), Math.round(b.y * 10), 7 + k);
    const uw = Math.min(b.w * 0.35, 2 + r * 4);
    const ud = Math.min(b.d * 0.35, 2 + ((r * 7.7) % 1) * 3);
    const ou = (r - 0.5) * (b.w - uw) * 0.6;
    const ov = (((r * 3.3) % 1) - 0.5) * (b.d - ud) * 0.6;
    const c = Math.cos(b.rot);
    const s = Math.sin(b.rot);
    out.push({
      ...b,
      x: b.x + ou * c - ov * s,
      y: b.y + ou * s + ov * c,
      w: uw,
      d: ud,
      y0: b.y0 + b.h,
      h: 1.4 + r * 1.8,
      style: 10,
      roof: bytes(r < 0.5 ? '#a3a7ab' : '#c4c6c8'),
      vOff: 0,
      roofType: 0,
    });
  }
}

// ---------------------------------------------------------------------------
// OpenStreetMap outlines (the city file's core)

export function osmFootprints(
  data: GeoData,
  look: CityLook,
  clear: { e: number; s: number; r: number }[],
  marketId: string,
): { polys: Footprint[]; boxes: BoxB[] } {
  const polys: Footprint[] = [];
  const boxes: BoxB[] = [];
  const brick = BRICK_SHARE[marketId] ?? 0.05;
  (data.buildings ?? []).forEach((b, i) => {
    const p = cleanOutline(b.p);
    if (!p) return;
    const c = centroid(p);
    if (clear.some((k) => Math.hypot(k.e - c.x, k.s - c.y) < k.r + 6)) return;
    const r = h3(i, 991);
    const area = Math.abs(signedArea(p));
    const levels =
      b.h ??
      (area < 120
        ? 1 + Math.floor(r * 2)
        : area < 500
          ? Math.round(lerp(look.floors.res[0], look.floors.res[1] + 1, r))
          : Math.round(lerp(look.floors.res[1], look.floors.urban[1], r)));
    const H = Math.max(3, levels * 3.25 + 0.8);
    const style =
      H >= 60
        ? pick([3, 3, 4, 2, 3], r)
        : H >= 22
          ? pick([2, 4, 0, 3, 2, 1], r)
          : r < brick
            ? 1
            : levels <= 2 && area < 200
              ? 6
              : 0;
    const { wall, roof } = paint(look, style, (r * 17.3) % 1, false);
    const base: Footprint = { p, base: 0, top: H, vOff: 0, style, wall, roof, seed: r };
    if (H >= 70 && area < 6000) {
      // Setbacks: the shaft narrows twice; a crown on top.
      const t1 = H * lerp(0.55, 0.7, r);
      const t2 = H * lerp(0.8, 0.9, (r * 3.1) % 1);
      const k1 = lerp(0.8, 0.9, (r * 5.7) % 1);
      const k2 = k1 * 0.82;
      polys.push({ ...base, top: t1 });
      polys.push({ ...base, p: scaled(p, c, k1), base: t1, top: t2, vOff: t1 });
      polys.push({ ...base, p: scaled(p, c, k2), base: t2, top: H, vOff: t2 });
      const crown = (r * 13.1) % 1;
      if (crown < 0.5)
        polys.push({ ...base, p: scaled(p, c, k2 * 0.55), base: H, top: H + 7, style: 7, vOff: 0 });
      else
        boxes.push({
          x: c.x,
          y: c.y,
          w: 1.4,
          d: 1.4,
          h: 18,
          y0: H,
          rot: 0,
          style: 10,
          wall,
          roof: bytes('#9aa0a6'),
          seed: r,
          vOff: 0,
          roofType: 0,
        });
    } else {
      polys.push(base);
      // Plant on the roof, where it fits inside the outline.
      if (H < 70 && area > 150 && style !== 3) {
        const uw = 2 + r * 3;
        const ox = ((r * 7.1) % 1) * 4 - 2;
        const oy = ((r * 3.9) % 1) * 4 - 2;
        const x = c.x + ox;
        const y = c.y + oy;
        if (
          inPoly(p, x - uw, y - uw) &&
          inPoly(p, x + uw, y - uw) &&
          inPoly(p, x + uw, y + uw) &&
          inPoly(p, x - uw, y + uw)
        )
          boxes.push({
            x,
            y,
            w: uw,
            d: uw * 0.8,
            h: 1.5 + r * 1.5,
            y0: H,
            rot: 0,
            style: 10,
            wall,
            roof: bytes('#b4b7ba'),
            seed: r,
            vOff: 0,
            roofType: 0,
          });
      }
    }
  });
  return { polys, boxes };
}

// ---------------------------------------------------------------------------
// Infill: the rest of the city, lot by lot.

export interface Centre {
  x: number;
  y: number;
  r: number;
  w: number;
}

export const CHUNK = 600;
const CELL = 150;

type Zone = 0 | 1 | 2;

export class LotMaker {
  constructor(
    private mask: GroundMask,
    private roads: RoadIndex,
    private look: CityLook,
    private centres: Centre[],
    private marketId: string,
    private bounds: [number, number, number, number],
  ) {}

  /** Built-up land beyond the mapped streets, strongest near the centre. */
  sprawlAt(x: number, y: number) {
    const c = this.centres[0];
    if (!c || !this.look.sprawl) return 0;
    const [x0, y0, x1, y1] = this.bounds;
    const span = Math.max(x1 - x0, y1 - y0);
    const d = Math.hypot(x - c.x, y - c.y);
    return this.look.sprawl * Math.max(0, Math.min(1, 1.25 - d / (0.42 * span)));
  }

  zoneAt(x: number, y: number): { zone: Zone; I: number } {
    let I = 0;
    for (const c of this.centres) {
      const d = Math.hypot(x - c.x, y - c.y);
      I = Math.max(I, c.w * (1 - d / c.r));
    }
    I += 0.3 * (this.mask.urbanAt(x, y) - 0.35);
    if (this.look.towersOnMotorway) {
      const m = this.roads.nearest(x, y, 260, 1);
      if (m) I = Math.max(I, 0.7 - m.d / 900);
    }
    return { zone: I > 0.62 ? 2 : I > 0.32 ? 1 : 0, I };
  }

  /** Lots in one chunk: low ones and tall ones (≥ 24 m). */
  chunk(ci: number, cj: number, merge = 4): { low: BoxB[]; tall: BoxB[]; far: BoxB[] } {
    const low: BoxB[] = [];
    const tall: BoxB[] = [];
    /** Far away: runs of `merge` neighbouring low lots as one box (one row of a block). */
    const far: BoxB[] = [];
    let run: BoxB[] = [];
    const flush = (lw: number, gap: number) => {
      for (let i = 0; i < run.length; i += merge) {
        const g = run.slice(i, i + merge);
        const a = g[0]!;
        let x = 0;
        let y = 0;
        let h = 0;
        for (const b of g) {
          x += b.x;
          y += b.y;
          h += b.h;
        }
        far.push({
          ...a,
          x: x / g.length,
          y: y / g.length,
          w: lw * g.length - gap,
          d: a.d,
          h: h / g.length,
          rot: runRot,
        });
      }
      run = [];
    };
    let runRot = 0;
    const L = this.look;
    const mask = this.mask;
    const brick = BRICK_SHARE[this.marketId] ?? 0.05;
    const per = CHUNK / CELL;
    for (let a = 0; a < per; a++)
      for (let b = 0; b < per; b++) {
        const x0 = ci * CHUNK + a * CELL;
        const y0 = cj * CHUNK + b * CELL;
        const cx = x0 + CELL / 2;
        const cy = y0 + CELL / 2;
        const u0 = mask.urbanAt(cx, cy) + this.sprawlAt(cx, cy);
        if (u0 < 0.07) continue;
        const cov = mask.coverAt(cx, cy);
        if (cov === COVER.water && mask.coverAt(x0, y0) === COVER.water) continue;
        const road = this.roads.nearest(cx, cy, 300) ?? this.roads.nearest(cx, cy, 800);
        if (!road) continue;
        // The street grain, to the nearest 3°, folded into a quarter turn.
        const q = Math.PI / 2;
        let th = ((road.angle % q) + q) % q;
        th = Math.round(th / (Math.PI / 60)) * (Math.PI / 60);
        const { zone } = this.zoneAt(cx, cy);
        const lotW =
          zone === 2 ? 30 : zone === 1 ? lerp(L.lotW[1], 20, 0.5) : lerp(L.lotW[0], L.lotW[1], 0.5);
        const lotD = zone === 2 ? 32 : zone === 1 ? Math.max(L.lotD[0], 16) : lerp(L.lotD[0], L.lotD[1], 0.5);
        const gap = zone === 2 ? 5 : zone === 1 ? Math.max(0.5, L.gap[0]) : lerp(L.gap[0], L.gap[1], 0.5);
        const street = zone === 2 ? 16 : 12;
        const Pv = 2 * lotD + street;
        const Pu = zone === 2 ? 100 : 120;
        const c = Math.cos(th);
        const s = Math.sin(th);
        // The cell's corners in the street frame.
        let umin = Infinity;
        let umax = -Infinity;
        let vmin = Infinity;
        let vmax = -Infinity;
        for (const [px, py] of [
          [x0, y0],
          [x0 + CELL, y0],
          [x0, y0 + CELL],
          [x0 + CELL, y0 + CELL],
        ] as const) {
          const u = px * c + py * s;
          const v = -px * s + py * c;
          umin = Math.min(umin, u);
          umax = Math.max(umax, u);
          vmin = Math.min(vmin, v);
          vmax = Math.max(vmax, v);
        }
        const nPer = Math.max(1, Math.floor((Pu - street) / lotW));
        const lw = (Pu - street) / nPer;
        for (let bv = Math.floor(vmin / Pv); bv <= Math.ceil(vmax / Pv); bv++)
          for (let side = 0; side < 2; side++) {
            const vc = bv * Pv + street / 2 + lotD * (side + 0.5);
            for (let bu = Math.floor(umin / Pu); bu <= Math.ceil(umax / Pu); bu++) {
              runRot = th;
              for (let k = 0; k < nPer; k++) {
                const uc = bu * Pu + street / 2 + (k + 0.5) * lw;
                const x = uc * c - vc * s;
                const y = uc * s + vc * c;
                if (x < x0 || x >= x0 + CELL || y < y0 || y >= y0 + CELL) {
                  flush(lw, gap);
                  continue;
                }
                const r = h3(Math.round(x * 4), Math.round(y * 4), 77);
                const w = lw - gap;
                const d = lotD * (zone === 0 ? 0.88 : 0.92);
                if (r > (zone === 0 ? 0.95 : 0.97) || !this.free(x, y, w, d, c, s)) {
                  flush(lw, gap);
                  continue;
                }
                const b = this.lot(low, tall, { x, y, w, d, rot: th, zone, r, brick });
                if (b && b.h < 24) run.push({ ...b, w, d, rot: th });
                else flush(lw, gap);
              }
              flush(lw, gap);
            }
          }
      }
    return { low, tall, far };
  }

  private free(x: number, y: number, w: number, d: number, c: number, s: number) {
    const m = this.mask;
    const ok = (px: number, py: number) =>
      m.coverAt(px, py) === COVER.land && !m.roadAt(px, py) && !m.builtAt(px, py);
    if (!ok(x, y)) return false;
    const hw = w * 0.45;
    const hd = d * 0.45;
    for (const [a, b] of [
      [hw, hd],
      [-hw, hd],
      [hw, -hd],
      [-hw, -hd],
    ] as const)
      if (!ok(x + a * c - b * s, y + a * s + b * c)) return false;
    return true;
  }

  private lot(
    low: BoxB[],
    tall: BoxB[],
    o: { x: number; y: number; w: number; d: number; rot: number; zone: Zone; r: number; brick: number },
  ) {
    const L = this.look;
    const { r, zone } = o;
    const r2 = (r * 7.31) % 1;
    const r3 = (r * 13.7) % 1;
    let floors: number;
    let style: number;
    let pitched = false;
    let w = o.w;
    let d = o.d;
    if (zone === 0) {
      floors = Math.round(lerp(L.floors.res[0], L.floors.res[1], r2 * r2 + 0.15));
      pitched = r3 < L.pitched;
      style = r < o.brick ? 1 : pitched ? 6 : 0;
      if (style === 6 && floors > 2) style = 0;
    } else if (zone === 1) {
      floors = Math.round(lerp(L.floors.urban[0], L.floors.urban[1], r2));
      pitched = floors <= 3 && r3 < L.pitched * 0.5;
      style = r < o.brick ? 1 : r3 < 0.22 ? 2 : 0;
    } else {
      const tower = r3 < L.towers;
      if (tower) {
        floors = Math.round(lerp(L.floors.down[1] * 0.7, L.towerMax, r2 * r2));
        style = pick([3, 3, 4, 2], r);
        w *= 1.05;
        d *= 1.05;
      } else {
        floors = Math.round(lerp(L.floors.down[0], L.floors.down[1], r2 * r2));
        style = pick([2, 4, 0, 1, 2], r);
      }
    }
    floors = Math.max(1, floors);
    const h = floors * (style === 3 ? 3.7 : 3.25) + (pitched ? 0 : 0.8);
    const { wall, roof } = paint(L, style, (r * 23.1) % 1, pitched);
    const b: BoxB = {
      x: o.x,
      y: o.y,
      w,
      d,
      h,
      y0: 0,
      rot: o.rot,
      style,
      wall,
      roof,
      seed: r,
      vOff: 0,
      roofType: pitched ? 1 : 0,
    };
    if (pitched) {
      // The ridge runs along the longer side.
      if (d > w) b.rot += Math.PI / 2;
      if (d > w) [b.w, b.d] = [d, w];
    }
    const into = h >= 24 ? tall : low;
    if (h >= 70) towerBoxes(into, b, L, r);
    else into.push(b);
    if (!pitched) units(into, b);
    return b;
  }
}

// ---------------------------------------------------------------------------
// Materials, shared by every building mesh.

export function buildingMaterials(shared: SharedUniforms) {
  return { merged: facadeMaterial(shared, false), instanced: facadeMaterial(shared, true) };
}

export { centroid, inPoly };

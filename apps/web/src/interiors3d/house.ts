/**
 * Wave 9 §C: a home's 3D shell, built from its floor plan (../home/layout.ts):
 * a round grass plot, a slab, a floor per room (parquet, tile, marble…),
 * exterior walls that cut away when they face the camera, lower interior
 * walls with door gaps, windows, soft darkening along every wall, a front
 * door and path, and for a house (tier 4–5) a garage with your car.
 *
 * World units: one tile is one metre; tile (x, y) covers x..x+1 on X and
 * y..y+1 on Z, the floor at Y = 0.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { HomePlan, RoomId, Spot } from '../home/layout';
import { FLOOR_SCALE, Kit, edgeTexture, floorTexture, mat, type FloorKind } from './kit';
import { buildModel, carPaint, type Model } from './furniture';

export const WALL_H = 2.3;
export const INNER_H = 1.15;
export const CUT_H = 0.32;
const THICK = 0.14;
const WALL_GREEN = '#3f7a52';
const WALL_CAP = '#eef2ea';
const WALL_INNER = '#7fa585';

export interface WallSide {
  /** Outward normal on the floor plane. */
  n: THREE.Vector2;
  slabs: THREE.Mesh[];
  caps: THREE.Mesh[];
  extras: THREE.Group;
  cut: boolean;
}

export interface House {
  root: THREE.Group;
  sides: WallSide[];
  /** Where the camera looks by default, and how much fits. */
  centre: THREE.Vector3;
  span: number;
  /** The corners the camera keeps in view. */
  fitPoints: THREE.Vector3[];
  garage: { car: THREE.Group | null } | null;
}

function floorKind(id: RoomId, tier: number): FloorKind {
  switch (id) {
    case 'kitchen':
      return 'tile';
    case 'bathroom':
      return 'bath';
    case 'study':
      return 'carpet';
    case 'bedroom':
      return tier === 1 ? 'carpet' : tier >= 3 ? 'parquet-dark' : 'parquet';
    default:
      return tier >= 4 ? 'marble' : 'parquet';
  }
}

function floorMesh(kind: FloorKind, x: number, z: number, w: number, d: number, tint?: string) {
  const tex = floorTexture(kind, tint).clone();
  tex.needsUpdate = true;
  const s = FLOOR_SCALE[kind];
  tex.repeat.set(w / s, d / s);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat('#ffffff', { map: tex, rough: kind === 'marble' ? 0.35 : 0.8, own: true }));
  m.rotation.x = -Math.PI / 2;
  m.position.set(x + w / 2, 0.002, z + d / 2);
  m.receiveShadow = true;
  return m;
}

/** A soft dark band on the floor along a wall (baked ambient occlusion). */
function edgeStrips(segs: { x0: number; z0: number; x1: number; z1: number; nx: number; nz: number }[]) {
  const geos: THREE.BufferGeometry[] = [];
  const W = 0.55;
  for (const s of segs) {
    const len = Math.hypot(s.x1 - s.x0, s.z1 - s.z0);
    const g = new THREE.PlaneGeometry(len, W);
    // v = 1 at the wall (texture top is dark), 0 away from it.
    g.rotateX(-Math.PI / 2);
    // After the rotation the dark edge (v = 1) is at -z: turn +z to the normal.
    g.rotateY(Math.atan2(s.nx, s.nz));
    const mx = (s.x0 + s.x1) / 2 + (s.nx * W) / 2;
    const mz = (s.z0 + s.z1) / 2 + (s.nz * W) / 2;
    g.translate(mx, 0.006, mz);
    geos.push(g);
  }
  if (!geos.length) return null;
  const geo = mergeGeometries(geos, false)!;
  const m = new THREE.Mesh(
    geo,
    new THREE.MeshBasicMaterial({ map: edgeTexture(), transparent: true, depthWrite: false, opacity: 0.9 }),
  );
  m.renderOrder = 1;
  return m;
}

function slab(len: number, along: 'x' | 'z', color: string): THREE.Mesh {
  const geo = new THREE.BoxGeometry(along === 'x' ? len : THICK, 1, along === 'x' ? THICK : len);
  geo.translate(0, 0.5, 0);
  const m = new THREE.Mesh(geo, mat(color, { rough: 0.85 }));
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function cap(len: number, along: 'x' | 'z'): THREE.Mesh {
  const geo = new THREE.BoxGeometry((along === 'x' ? len : THICK) + 0.02, 0.05, (along === 'x' ? THICK : len) + 0.02);
  const m = new THREE.Mesh(geo, mat(WALL_CAP, { rough: 0.6 }));
  m.castShadow = false;
  return m;
}

/** A window set into a wall run (centred at c along the run). */
function windowOn(along: 'x' | 'z', c: number, fixed: number, night: boolean): THREE.Group {
  const k = new Kit();
  const w = 1.1;
  const h = 1.0;
  const y = 1.0;
  const pane = night ? '#1e3a8a' : '#bfe6f5';
  const opts = { emissive: night ? '#f8d77a' : '#9fd7ee', emissiveIntensity: night ? 0.15 : 0.35, rough: 0.1 };
  if (along === 'x') {
    k.box(w + 0.12, h + 0.12, THICK + 0.04, '#f8fafc', c, y - 0.06, fixed);
    k.box(w, h, THICK + 0.06, pane, c, y, fixed, opts);
    k.box(0.04, h, THICK + 0.08, '#f8fafc', c, y, fixed);
  } else {
    k.box(THICK + 0.04, h + 0.12, w + 0.12, '#f8fafc', fixed, y - 0.06, c);
    k.box(THICK + 0.06, h, w, pane, fixed, y, c, opts);
    k.box(THICK + 0.08, h, 0.04, '#f8fafc', fixed, y, c);
  }
  return k.build();
}

/** Merge unit wall segments on one line into runs. */
function runs(cells: number[]): [number, number][] {
  const s = [...new Set(cells)].sort((a, b) => a - b);
  const out: [number, number][] = [];
  for (const c of s) {
    const last = out[out.length - 1];
    if (last && last[1] === c) last[1] = c + 1;
    else out.push([c, c + 1]);
  }
  return out;
}

export interface HouseOpts {
  tier: number;
  night: boolean;
  /** Your car's model id, or null. */
  car: string | null;
}

export function buildHouse(plan: HomePlan, o: HouseOpts): House {
  const root = new THREE.Group();
  const W = plan.w;
  const H = plan.h;
  const garage = o.tier >= 4;
  const GW = 4.4;
  const totalW = W + (garage ? GW + 0.3 : 0);
  const centre = new THREE.Vector3(totalW / 2, 0, H / 2 + 0.6);

  // ---- Ground: a dark backdrop, a round lawn, the slab.
  const R = Math.max(totalW, H) * 0.78 + 2.4;
  const lawnTex = floorTexture('grass').clone();
  lawnTex.needsUpdate = true;
  lawnTex.repeat.set((R * 2) / 6, (R * 2) / 6);
  const lawn = new THREE.Mesh(new THREE.CircleGeometry(R, 64), mat('#ffffff', { map: lawnTex, rough: 1, own: true }));
  lawn.rotation.x = -Math.PI / 2;
  lawn.position.set(centre.x, -0.16, centre.z);
  lawn.receiveShadow = true;
  root.add(lawn);
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(R, R * 1.01, 0.5, 64, 1, true), mat('#3d4f2c', { rough: 1, side: THREE.DoubleSide }));
  rim.position.set(centre.x, -0.41, centre.z);
  root.add(rim);
  const k = new Kit();
  k.box(W + 0.36, 0.16, H + 0.36, '#d8d2c4', W / 2, -0.16, H / 2, { rough: 0.9 });
  // Front path to the edge of the lawn.
  const dx = plan.door.x + 0.5;
  k.box(1.1, 0.03, R - H / 2 + 0.6, '#c9bfae', dx, -0.155, H + (R - H / 2) / 2 - 0.2, { rough: 0.95 });
  for (let i = 0; i < 4; i++) k.box(0.9, 0.04, 0.5, '#b9ad98', dx, -0.15, H + 0.8 + i * 0.9, { round: 0.04 });
  // Bushes and trees around the plot.
  const rnd = (n: number) => ((Math.sin(n * 12.9898) * 43758.5453) % 1 + 1) % 1;
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + 0.2;
    const r = R - 0.9 - rnd(i) * 0.6;
    const x = centre.x + Math.cos(a) * r;
    const z = centre.z + Math.sin(a) * r;
    if (Math.abs(x - dx) < 1.2 && z > H) continue;
    if (x > -0.6 && x < totalW + 0.6 && z > -0.6 && z < H + 0.6) continue;
    if (i % 3 === 0) {
      k.cyl(0.08, 0.1, 0.9, '#6b4a2f', x, -0.16, z);
      k.sphere(0.65, i % 2 ? '#3f6f35' : '#4d7f3c', x, 1.15, z, { seg: 9, sy: 0.9 });
      k.sphere(0.45, '#5a8f45', x + 0.2, 1.5, z - 0.1, { seg: 8 });
    } else k.sphere(0.4 + rnd(i + 3) * 0.2, i % 2 ? '#4b7d3a' : '#3a6a30', x, 0.05, z, { seg: 8, sy: 0.7 });
  }
  root.add(k.build());

  // ---- Floors.
  for (const r of plan.rooms) root.add(floorMesh(floorKind(r.id, o.tier), r.x, r.y, r.w, r.h));

  // ---- Walls.
  const sides: WallSide[] = [];
  const side = (n: THREE.Vector2) => {
    const s: WallSide = { n, slabs: [], caps: [], extras: new THREE.Group(), cut: false };
    root.add(s.extras);
    sides.push(s);
    return s;
  };
  const back = side(new THREE.Vector2(0, -1));
  const front = side(new THREE.Vector2(0, 1));
  const left = side(new THREE.Vector2(-1, 0));
  const right = side(new THREE.Vector2(1, 0));
  const addRun = (s: WallSide, along: 'x' | 'z', a: number, b: number, fixed: number, color: string) => {
    const len = b - a + (along === 'x' ? THICK : 0);
    const m = slab(len, along, color);
    const c = cap(len, along);
    if (along === 'x') {
      m.position.set((a + b) / 2, 0, fixed);
      c.position.set((a + b) / 2, 0, fixed);
    } else {
      m.position.set(fixed, 0, (a + b) / 2);
      c.position.set(fixed, 0, (a + b) / 2);
    }
    m.scale.y = WALL_H;
    c.position.y = WALL_H;
    s.slabs.push(m);
    s.caps.push(c);
    root.add(m, c);
  };
  const o2 = THICK / 2;
  addRun(back, 'x', -o2, W + o2, -o2, WALL_GREEN);
  addRun(left, 'z', -THICK, H + THICK, -o2, WALL_GREEN);
  addRun(right, 'z', -THICK, H + THICK, W + o2, WALL_GREEN);
  addRun(front, 'x', -o2, plan.door.x, H + o2, WALL_GREEN);
  addRun(front, 'x', plan.door.x + 1, W + o2, H + o2, WALL_GREEN);
  // Inner faces: a warm plaster lining on the back and side walls.
  const lining = (s: WallSide, along: 'x' | 'z', a: number, b: number, fixed: number) => {
    const geo = new THREE.BoxGeometry(along === 'x' ? b - a : 0.02, 1, along === 'x' ? 0.02 : b - a);
    geo.translate(0, 0.5, 0);
    const m = new THREE.Mesh(geo, mat(WALL_INNER, { rough: 0.9 }));
    m.receiveShadow = true;
    if (along === 'x') m.position.set((a + b) / 2, 0, fixed);
    else m.position.set(fixed, 0, (a + b) / 2);
    m.scale.y = WALL_H;
    s.slabs.push(m);
    root.add(m);
  };
  lining(back, 'x', 0, W, 0.012);
  lining(left, 'z', 0, H, 0.012);
  lining(right, 'z', 0, H, W - 0.012);
  // Windows: on the back wall per room, and on the side walls.
  for (const r of plan.rooms) {
    if (r.y === 0 && r.w >= 3) back.extras.add(windowOn('x', r.x + r.w / 2 + (r.id === 'bedroom' && r.w > 4 ? 0.8 : 0), -o2, o.night));
    if (r.x === 0 && r.h >= 3) left.extras.add(windowOn('z', r.y + r.h / 2, -o2, o.night));
    if (r.x + r.w === W && r.h >= 3 && !(garage && r.y + r.h > H - 5)) right.extras.add(windowOn('z', r.y + r.h / 2, W + o2, o.night));
  }
  // The front door: a frame and an open leaf.
  {
    const d = new Kit();
    const x0 = plan.door.x;
    d.box(0.1, 2.15, THICK + 0.06, '#f8fafc', x0 + 0.05, 0, H + o2);
    d.box(0.1, 2.15, THICK + 0.06, '#f8fafc', x0 + 0.95, 0, H + o2);
    d.box(1.0, 0.12, THICK + 0.06, '#f8fafc', x0 + 0.5, 2.1, H + o2);
    d.box(0.06, 2.05, 0.86, '#7c4a24', x0 + 0.1, 0, H - 0.43 + o2, { round: 0.01 });
    d.box(0.9, 0.02, 0.6, '#8b5a2b', x0 + 0.5, 0, H + 0.45);
    front.extras.add(d.build());
  }

  // Interior walls from the plan.
  const hLines = new Map<number, number[]>();
  const vLines = new Map<number, number[]>();
  for (const s of plan.walls) {
    if (s.dir === 'h') hLines.set(s.y, [...(hLines.get(s.y) ?? []), s.x]);
    else vLines.set(s.x, [...(vLines.get(s.x) ?? []), s.y]);
  }
  const inner = new Kit();
  const edgeSegs: { x0: number; z0: number; x1: number; z1: number; nx: number; nz: number }[] = [
    { x0: 0, z0: 0, x1: W, z1: 0, nx: 0, nz: 1 },
    { x0: 0, z0: 0, x1: 0, z1: H, nx: 1, nz: 0 },
    { x0: W, z0: 0, x1: W, z1: H, nx: -1, nz: 0 },
    { x0: 0, z0: H, x1: W, z1: H, nx: 0, nz: -1 },
  ];
  for (const [y, xs] of hLines)
    for (const [a, b] of runs(xs)) {
      inner.box(b - a + THICK, INNER_H, THICK, WALL_GREEN, (a + b) / 2, 0, y, { rough: 0.85 });
      inner.box(b - a + THICK + 0.02, 0.05, THICK + 0.02, WALL_CAP, (a + b) / 2, INNER_H, y);
      edgeSegs.push({ x0: a, z0: y, x1: b, z1: y, nx: 0, nz: 1 }, { x0: a, z0: y, x1: b, z1: y, nx: 0, nz: -1 });
    }
  for (const [x, ys] of vLines)
    for (const [a, b] of runs(ys)) {
      inner.box(THICK, INNER_H, b - a + THICK, WALL_GREEN, x, 0, (a + b) / 2, { rough: 0.85 });
      inner.box(THICK + 0.02, 0.05, b - a + THICK + 0.02, WALL_CAP, x, INNER_H, (a + b) / 2);
      edgeSegs.push({ x0: x, z0: a, x1: x, z1: b, nx: 1, nz: 0 }, { x0: x, z0: a, x1: x, z1: b, nx: -1, nz: 0 });
    }
  // Skirting along the outer walls.
  inner.box(W, 0.08, 0.025, '#f5f1e8', W / 2, 0, 0.03);
  inner.box(0.025, 0.08, H, '#f5f1e8', 0.03, 0, H / 2);
  inner.box(0.025, 0.08, H, '#f5f1e8', W - 0.03, 0, H / 2);
  root.add(inner.build());
  const edges = edgeStrips(edgeSegs);
  if (edges) root.add(edges);

  // ---- Garage (a house) or a driveway.
  let garageOut: House['garage'] = null;
  if (garage) {
    const gx = W + 0.3;
    const gz = H - 6;
    root.add(floorMesh('concrete', gx, gz, GW, 6));
    const g = new Kit();
    g.box(GW + 0.3, 0.14, 6.3, '#d8d2c4', gx + GW / 2, -0.15, gz + 3);
    g.box(GW, 0.03, 2.4, '#9a9a96', gx + GW / 2, -0.155, H + 1.2);
    // Low walls and posts, an open front like a carport.
    g.box(GW + THICK, 1.0, THICK, WALL_GREEN, gx + GW / 2, 0, gz, { rough: 0.85 });
    g.box(THICK, 1.0, 6, WALL_GREEN, gx + GW, 0, gz + 3, { rough: 0.85 });
    for (const [px, pz] of [[gx + 0.1, H - 0.05], [gx + GW - 0.05, H - 0.05], [gx + GW - 0.05, gz + 0.1]] as const)
      g.box(0.16, 2.4, 0.16, '#2f6b45', px, 0, pz);
    g.box(GW + 0.3, 0.1, 0.18, '#2f6b45', gx + GW / 2, 2.4, H - 0.05);
    g.box(0.18, 0.1, 6.1, '#2f6b45', gx + GW, 2.4, gz + 3);
    g.box(0.18, 0.1, 6.1, '#2f6b45', gx + 0.05, 2.4, gz + 3);
    // tools and a bike
    g.box(1.2, 0.9, 0.4, '#475569', gx + GW - 0.8, 0, gz + 0.35, { round: 0.02 });
    g.torus(0.28, 0.03, '#111827', gx + 0.5, 0.3, gz + 0.8, { ry: Math.PI / 2 });
    g.torus(0.28, 0.03, '#111827', gx + 0.5, 0.3, gz + 1.8, { ry: Math.PI / 2 });
    g.box(0.04, 0.04, 1.0, '#dc2626', gx + 0.5, 0.55, gz + 1.3);
    root.add(g.build());
    let car: THREE.Group | null = null;
    if (o.car) {
      const m: Model = buildModel(`car:${o.car}`, { w: 2, d: 4.5, tier: 1, tint: carPaint(o.car) });
      car = m.group;
      car.position.set(gx + GW / 2 + 0.4, 0, gz + 3.2);
      root.add(car);
    }
    garageOut = { car };
  } else if (o.car) {
    // Parked on a driveway in front.
    const gx = Math.min(W - 1.4, plan.door.x + 3.2);
    const g = new Kit();
    g.box(2.6, 0.03, 5, '#a8a29e', gx, -0.155, H + 2.7, { rough: 0.95 });
    root.add(g.build());
    const m = buildModel(`car:${o.car}`, { w: 2, d: 4.5, tier: 1, tint: carPaint(o.car) });
    m.group.position.set(gx, -0.14, H + 2.8);
    m.group.rotation.y = Math.PI;
    root.add(m.group);
  }

  const span = Math.max(totalW, H) * 1.18 + 2;
  const fitPoints: THREE.Vector3[] = [];
  for (const x of [-0.3, totalW + 0.2])
    for (const z of [-0.6, H + (garage || o.car ? 2.2 : 1.2)])
      for (const y of [0, WALL_H]) fitPoints.push(new THREE.Vector3(x, y, z));
  return { root, sides, centre, span, fitPoints, garage: garageOut };
}

/** Cut away the outer walls that face the camera (azimuth, radians). */
export function cutWalls(h: House, azimuth: number) {
  const d = new THREE.Vector2(Math.sin(azimuth), Math.cos(azimuth));
  for (const s of h.sides) {
    const cut = s.n.dot(d) > 0.15;
    if (cut === s.cut && s.slabs[0]!.userData.done) continue;
    s.cut = cut;
    const hgt = cut ? CUT_H : WALL_H;
    for (const m of s.slabs) {
      m.scale.y = hgt;
      m.userData.done = true;
    }
    for (const c of s.caps) c.position.y = hgt;
    s.extras.visible = !cut;
  }
}

/** Which outer wall a wall-mounted spot hangs on (by where it is). */
export function wallOf(plan: HomePlan, s: Spot): 'back' | 'left' | 'right' | 'front' {
  if (s.y === 0) return 'back';
  if (s.x === 0) return 'left';
  if (s.x + s.w === plan.w) return 'right';
  return 'front';
}

/**
 * Wave 9 §C, Wave 12: a home's 3D shell and grounds, built from its floor
 * plan (../home/layout.ts) and its grounds (../home/grounds.ts).
 *
 * The house: a floor per room (warm tiles, light oak, bathroom tiles), tall
 * green outer walls with white caps that cut away when they face the
 * camera, lower inner walls with door gaps, dark-framed windows, wall
 * sconces, soft darkening along every wall and a front door.
 *
 * Round it, on a round lawn under a light sky: a pool terrace (villa,
 * mansion), a formal garden with a fountain (mansion, the very rich), a
 * gated drive with a bay for every car (a steel carport, a glass showroom,
 * chargers), hedges, palms, potted plants and the street; a penthouse sits
 * on a roof terrace with a hot tub and the city's towers round it.
 *
 * World units: one tile is one metre; tile (x, y) covers x..x+1 on X and
 * y..y+1 on Z, the floor at Y = 0, the lawn just below.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { HomePlan, RoomId, Spot } from '../home/layout';
import { key } from '../home/layout';
import type { Grounds } from '../home/grounds';
import { FLOOR_SCALE, Kit, edgeTexture, floorTexture, mat, type FloorKind } from './kit';
import { buildModel } from './furniture';
import {
  buildEstateModel,
  carport,
  gate,
  hedge,
  palm,
  potPlant,
  showroomGarage,
  tree,
} from './estate-models';

export const WALL_H = 2.6;
export const INNER_H = 1.25;
export const CUT_H = 0.34;
const THICK = 0.16;
const WALL_GREEN = '#1d8a65';
const WALL_INNER = '#23946e';
const WALL_CAP = '#f4f1ea';
/** The lawn's top (the house slab and floors sit a little above it). */
export const GROUND_Y = -0.14;

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
  /** Where the delivery van stops, and the street it drives along. */
  van: { x: number; z: number; street: number };
  /** Half-size of the sun's shadow box. */
  shadow: number;
  /** Sconce lights (switched on at dusk and night). */
  lamps: THREE.PointLight[];
}

function floorKind(id: RoomId, tier: number): FloorKind {
  switch (id) {
    case 'kitchen':
    case 'living':
    case 'dining':
      return tier >= 5 ? 'marble' : 'cream';
    case 'bathroom':
      return 'bath';
    case 'study':
      return 'parquet-dark';
    case 'cinema':
      return 'carpet';
    case 'gym':
      return 'concrete';
    case 'bedroom':
    case 'guest':
      return 'oak';
  }
}

/** Warm tints over the floor textures (cream tiles, honey oak). */
const FLOOR_TINT: Partial<Record<FloorKind, string>> = {
  marble: '#fbf4ea',
  bath: '#f2f6f8',
  carpet: '#8c6f73',
  concrete: '#e2dfd9',
};

function floorMesh(kind: FloorKind, x: number, z: number, w: number, d: number, y = 0.002) {
  const tex = floorTexture(kind).clone();
  tex.needsUpdate = true;
  const s = FLOOR_SCALE[kind];
  tex.repeat.set(w / s, d / s);
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, d),
    mat(FLOOR_TINT[kind] ?? '#ffffff', {
      map: tex,
      rough: kind === 'marble' || kind === 'cream' ? 0.3 : kind === 'bath' ? 0.35 : 0.75,
      own: true,
    }),
  );
  m.rotation.x = -Math.PI / 2;
  m.position.set(x + w / 2, y, z + d / 2);
  m.receiveShadow = true;
  return m;
}

/** A soft dark band on the floor along a wall (baked ambient occlusion). */
function edgeStrips(
  segs: { x0: number; z0: number; x1: number; z1: number; nx: number; nz: number }[],
) {
  const geos: THREE.BufferGeometry[] = [];
  const W = 0.55;
  for (const s of segs) {
    const len = Math.hypot(s.x1 - s.x0, s.z1 - s.z0);
    const g = new THREE.PlaneGeometry(len, W);
    g.rotateX(-Math.PI / 2);
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
    new THREE.MeshBasicMaterial({
      map: edgeTexture(),
      transparent: true,
      depthWrite: false,
      opacity: 0.8,
    }),
  );
  m.renderOrder = 1;
  return m;
}

// ---------------------------------------------------------------------------
// Textures for the grounds (cached: one each).

const texCache = new Map<string, THREE.CanvasTexture>();
function canvasTex(id: string, size: number, draw: (g: CanvasRenderingContext2D) => void) {
  let t = texCache.get(id);
  if (!t) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    draw(c.getContext('2d')!);
    t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    texCache.set(id, t);
  }
  const out = t.clone();
  out.needsUpdate = true;
  return out;
}

/** A bright mown lawn (stripes and blades). */
const lawnTexture = () =>
  canvasTex('lawn', 256, (g) => {
    for (let i = 0; i < 8; i++) {
      g.fillStyle = i % 2 ? '#7cc35a' : '#72b951';
      g.fillRect(0, i * 32, 256, 32);
    }
    for (let i = 0; i < 2200; i++) {
      const a = 0.05 + (i % 5) * 0.025;
      g.fillStyle = i % 3 ? `rgba(40,95,30,${a})` : `rgba(200,240,160,${a})`;
      g.fillRect((i * 37) % 256, (i * 91) % 256, 1 + (i % 2), 3);
    }
  });

/** Asphalt, a little speckled. */
const asphaltTexture = () =>
  canvasTex('asphalt', 128, (g) => {
    g.fillStyle = '#56595e';
    g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 500; i++) {
      g.fillStyle = `rgba(255,255,255,${0.025 + (i % 5) * 0.012})`;
      g.fillRect((i * 37) % 128, (i * 71) % 128, 2, 2);
    }
  });

/** Pool water with soft caustics. */
const waterTexture = () =>
  canvasTex('water', 256, (g) => {
    const grd = g.createLinearGradient(0, 0, 256, 256);
    grd.addColorStop(0, '#36bdf0');
    grd.addColorStop(1, '#1890d6');
    g.fillStyle = grd;
    g.fillRect(0, 0, 256, 256);
    g.strokeStyle = 'rgba(255,255,255,0.16)';
    g.lineWidth = 2;
    for (let i = 0; i < 44; i++) {
      g.beginPath();
      g.ellipse(
        (i * 97) % 256,
        (i * 53) % 256,
        16 + (i % 5) * 4,
        8 + (i % 3) * 3,
        (i % 7) * 0.4,
        0,
        Math.PI * 2,
      );
      g.stroke();
    }
  });

function flat(
  tex: THREE.Texture,
  x: number,
  z: number,
  w: number,
  d: number,
  y: number,
  rough = 0.95,
  color = '#ffffff',
) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, d),
    mat(color, { map: tex, rough, own: true }),
  );
  m.rotation.x = -Math.PI / 2;
  m.position.set(x + w / 2, y, z + d / 2);
  m.receiveShadow = true;
  return m;
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
  /** Dusk or night: the sconces are lit. */
  lit?: boolean;
  grounds: Grounds;
}

export function buildHouse(plan: HomePlan, o: HouseOpts): House {
  const root = new THREE.Group();
  const W = plan.w;
  const H = plan.h;
  const g = o.grounds;
  const roof = g.style === 'roof';
  const k = new Kit();

  // ---- The ground: a round lawn on the sky (or a roof slab over the city).
  if (!roof) {
    const lt = lawnTexture();
    lt.repeat.set((g.lawn.r * 2) / 5, (g.lawn.r * 2) / 5);
    const lawn = new THREE.Mesh(
      new THREE.CircleGeometry(g.lawn.r, 72),
      mat('#ffffff', { map: lt, rough: 1, own: true }),
    );
    lawn.rotation.x = -Math.PI / 2;
    lawn.position.set(g.lawn.x, GROUND_Y - 0.02, g.lawn.y);
    lawn.receiveShadow = true;
    root.add(lawn);
    const rim = new THREE.Mesh(
      new THREE.CylinderGeometry(g.lawn.r, g.lawn.r * 0.985, 0.9, 72, 1, true),
      mat('#6b5236', { rough: 1, side: THREE.DoubleSide }),
    );
    rim.position.set(g.lawn.x, GROUND_Y - 0.47, g.lawn.y);
    root.add(rim);
    // The street, a kerb and a pavement.
    const s = g.street;
    const x0 = Math.max(s.x0, g.lawn.x - g.lawn.r);
    const x1 = Math.min(s.x1, g.lawn.x + g.lawn.r);
    const sw = 2 * Math.sqrt(Math.max(0, g.lawn.r ** 2 - (s.y - g.lawn.y) ** 2));
    if (sw > 4) {
      const sx0 = Math.max(x0, g.lawn.x - sw / 2 + 0.3);
      const sx1 = Math.min(x1, g.lawn.x + sw / 2 - 0.3);
      const at = asphaltTexture();
      at.repeat.set((sx1 - sx0) / 4, 1);
      root.add(flat(at, sx0, s.y - 2.2, sx1 - sx0, 4.4, GROUND_Y + 0.005));
      for (let x = sx0 + 1; x < sx1 - 1; x += 3)
        k.box(1.4, 0.012, 0.12, '#f5f5f4', x + 0.7, GROUND_Y + 0.006, s.y, { noShadow: true });
      k.box(sx1 - sx0, 0.1, 0.35, '#d6d3d1', (sx0 + sx1) / 2, GROUND_Y, s.y - 2.35);
    }
  } else {
    const r = g.lawn.r;
    k.box(r * 2.2, 0.6, r * 1.9, '#cbd5e1', g.lawn.x, GROUND_Y - 0.62, g.lawn.y, { rough: 0.9 });
    const rt = floorTexture('stone').clone();
    rt.needsUpdate = true;
    rt.repeat.set(r / 1.5, r / 1.5);
    root.add(flat(rt, g.lawn.x - r * 1.1, g.lawn.y - r * 0.95, r * 2.2, r * 1.9, GROUND_Y - 0.01));
    // A glass parapet round the roof.
    for (const [w, d, x, z] of [
      [r * 2.2, 0.06, g.lawn.x, g.lawn.y + r * 0.95],
      [0.06, r * 1.9, g.lawn.x + r * 1.1, g.lawn.y],
    ] as const) {
      k.box(w, 1.0, d, '#bfe3f0', x, GROUND_Y, z, { opacity: 0.3, noShadow: true, rough: 0.1 });
      k.box(w + 0.02, 0.05, d + 0.04, '#d9dde3', x, GROUND_Y + 1.0, z, { metal: 0.6, rough: 0.3 });
    }
    // The city's towers round it, windows lit.
    const rnd = (n: number) => (((Math.sin(n * 91.7) * 47453.5) % 1) + 1) % 1;
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2;
      const rr = r * 1.55 + rnd(i) * 9;
      const x = g.lawn.x + Math.cos(a) * rr;
      const z = g.lawn.y + Math.sin(a) * rr * 0.9;
      const h = 8 + rnd(i + 7) * 20;
      const w = 3.5 + rnd(i + 3) * 4;
      k.box(w, h, w, i % 3 ? '#8aa0b8' : '#a9b8c9', x, -h - 2, z, { rough: 0.5, metal: 0.2 });
      k.box(w + 0.04, h * 0.9, w + 0.04, '#fde68a', x, -h - 1.6, z, {
        opacity: o.night ? 0.22 : 0.1,
        emissive: '#fde68a',
        emissiveIntensity: o.night ? 0.7 : 0.1,
        noShadow: true,
      });
    }
  }

  // ---- Terrace, pool, drive, path.
  if (g.terrace) {
    const st = floorTexture('stone').clone();
    st.needsUpdate = true;
    st.repeat.set(g.terrace.w / 2.5, g.terrace.h / 2.5);
    root.add(
      flat(
        st,
        g.terrace.x,
        g.terrace.y,
        g.terrace.w,
        g.terrace.h,
        GROUND_Y + 0.03,
        0.85,
        '#efe4d2',
      ),
    );
  }
  if (g.pool) {
    const p = g.pool;
    const cw = 0.32;
    const top = p.hot ? GROUND_Y + 0.6 : GROUND_Y + 0.08;
    const cx = p.x + p.w / 2;
    const cz = p.y + p.h / 2;
    if (p.hot) {
      k.box(p.w + cw * 2, 0.55, p.h + cw * 2, '#e7e2da', cx, GROUND_Y, cz, { round: 0.06 });
    } else {
      k.box(p.w + cw * 2, 0.1, cw, '#f8f7f4', cx, GROUND_Y, p.y - cw / 2, { rough: 0.5 });
      k.box(p.w + cw * 2, 0.1, cw, '#f8f7f4', cx, GROUND_Y, p.y + p.h + cw / 2, { rough: 0.5 });
      k.box(cw, 0.1, p.h, '#f8f7f4', p.x - cw / 2, GROUND_Y, cz, { rough: 0.5 });
      k.box(cw, 0.1, p.h, '#f8f7f4', p.x + p.w + cw / 2, GROUND_Y, cz, { rough: 0.5 });
      // The basin under the water, pale blue tiles.
      k.box(p.w, 1.2, p.h, '#8bd8f5', cx, GROUND_Y - 1.25, cz, { rough: 0.3 });
      for (let i = 0; i < 3; i++)
        k.box(
          0.9,
          0.06,
          0.3,
          '#f8fafc',
          p.x + p.w - 0.55,
          top - 0.4 - i * 0.25,
          p.y + 0.3 + i * 0.3,
        );
      for (const sx of [-1, 1])
        k.cyl(0.025, 0.025, 1.1, '#d9dde3', p.x + 0.6 + sx * 0.25, top - 0.7, p.y + 0.06, {
          metal: 0.7,
          rough: 0.3,
        });
    }
    const wt = waterTexture();
    wt.repeat.set(p.w / 3, p.h / 3);
    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(p.w, p.h),
      mat('#ffffff', {
        map: wt,
        rough: 0.06,
        metal: 0.1,
        emissive: '#0e7fc0',
        emissiveIntensity: 0.2,
        own: true,
      }),
    );
    water.rotation.x = -Math.PI / 2;
    water.position.set(cx, top - 0.04, cz);
    water.receiveShadow = true;
    water.userData.water = true;
    root.add(water);
  }
  if (g.parasol) {
    const m = buildModel('parasol', { w: 1.6, d: 1.6, tier: 2, tint: '#f4efe4' });
    m.group.position.set(g.parasol.x, GROUND_Y + 0.03, g.parasol.y);
    m.group.scale.setScalar(1.25);
    root.add(m.group);
  }
  if (g.drive) {
    const d = g.drive;
    const at = asphaltTexture();
    at.repeat.set(d.w / 4, d.h / 4);
    root.add(flat(at, d.x, d.y, d.w, d.h, GROUND_Y + 0.015, roof ? 0.9 : 0.95));
  }
  {
    const p = g.path;
    const n = Math.max(1, Math.round(p.h / 0.7));
    for (let i = 0; i < n; i++)
      k.box(p.w, 0.04, 0.55, '#d8cfbf', p.x + p.w / 2, GROUND_Y, p.y + 0.2 + i * 0.7, {
        round: 0.03,
        rough: 0.9,
      });
  }
  // Bays: lines for open ones, a charger, the carport and the showrooms.
  for (const b of g.bays) {
    const cx = b.x + b.w / 2;
    const cz = b.y + b.h / 2;
    if (b.kind === 'open' || b.kind === 'charger') {
      for (const x of [b.x, b.x + b.w])
        k.box(0.08, 0.012, b.h, '#f5f5f4', x, GROUND_Y + 0.02, cz, { noShadow: true });
      if (b.kind === 'charger') {
        k.box(0.36, 1.3, 0.26, '#123f39', b.x + b.w - 0.3, GROUND_Y, b.y + 0.25, { round: 0.04 });
        k.box(0.22, 0.28, 0.03, '#8df3bc', b.x + b.w - 0.3, GROUND_Y + 0.9, b.y + 0.39, {
          emissive: '#8df3bc',
          emissiveIntensity: 0.6,
        });
      }
    } else if (b.kind === 'deck') {
      k.box(b.w, 0.012, 0.08, '#f5f5f4', cx, GROUND_Y + 0.02, b.y, { noShadow: true });
    } else if (b.kind === 'showroom') {
      const s = showroomGarage(b.w, b.h);
      s.position.set(cx, GROUND_Y + 0.01, cz);
      root.add(s);
    }
  }
  if (g.carport) {
    const c = g.carport;
    const s = carport(c.w, c.h);
    s.position.set(c.x + c.w / 2, GROUND_Y + 0.012, c.y + c.h / 2);
    root.add(s);
  }
  for (const h of g.hedges) {
    const m = hedge(h.w, h.h, h.h < 0.6 ? 0.6 : 0.95);
    m.position.set(h.x + h.w / 2, GROUND_Y, h.y + h.h / 2);
    root.add(m);
  }
  if (g.gate) {
    const m = gate(g.gate.w);
    m.position.set(g.gate.x, GROUND_Y, g.gate.y);
    root.add(m);
  }
  for (const t of g.trees) {
    const m = t.palm ? palm(t.s) : tree(t.s);
    m.position.set(t.x, GROUND_Y, t.y);
    root.add(m);
  }
  for (const p of g.pots) {
    const m = potPlant();
    m.position.set(p.x, GROUND_Y, p.y);
    root.add(m);
  }
  if (g.fountain) {
    const f = g.fountain;
    k.cyl(1.2, 1.25, 0.42, '#e7e5e4', f.x, GROUND_Y, f.y, { seg: 28 });
    k.cyl(1.05, 1.05, 0.02, '#38bdf8', f.x, GROUND_Y + 0.38, f.y, {
      seg: 28,
      emissive: '#0ea5e9',
      emissiveIntensity: 0.25,
      rough: 0.1,
    });
    k.cyl(0.14, 0.18, 1.0, '#e7e5e4', f.x, GROUND_Y + 0.2, f.y, { seg: 12 });
    k.cyl(0.5, 0.18, 0.14, '#e7e5e4', f.x, GROUND_Y + 1.15, f.y, { seg: 18 });
    k.sphere(0.13, '#bae6fd', f.x, GROUND_Y + 1.42, f.y, { seg: 8, opacity: 0.8 });
    k.box(0.9, 0.03, Math.abs(f.y) * 2 - 1.2, '#d6cbb5', f.x, GROUND_Y + 0.005, f.y, {
      rough: 0.95,
    });
  }
  for (const b of g.beds) {
    k.box(b.w, 0.18, b.h, '#6b4a2f', b.x + b.w / 2, GROUND_Y, b.y + b.h / 2, { rough: 1 });
    const n = Math.max(3, Math.round((b.w * b.h) / 0.45));
    for (let i = 0; i < n; i++)
      k.sphere(
        0.15,
        ['#f472b6', '#facc15', '#f87171', '#c084fc', '#4ade80'][i % 5]!,
        b.x + 0.3 + ((i * 0.73) % Math.max(0.4, b.w - 0.6)),
        GROUND_Y + 0.26,
        b.y + 0.3 + ((i * 0.41) % Math.max(0.4, b.h - 0.6)),
        { seg: 7 },
      );
  }

  // ---- The house: slab, floors, walls.
  k.box(W + 0.5, Math.abs(GROUND_Y) + 0.0, H + 0.5, '#e8e1d3', W / 2, GROUND_Y, H / 2, {
    rough: 0.9,
  });
  for (const r of plan.rooms) root.add(floorMesh(floorKind(r.id, o.tier), r.x, r.y, r.w, r.h));

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
  const o2 = THICK / 2;
  const addRun = (s: WallSide, along: 'x' | 'z', a: number, b: number, fixed: number) => {
    const len = b - a;
    const geo = new THREE.BoxGeometry(along === 'x' ? len : THICK, 1, along === 'x' ? THICK : len);
    geo.translate(0, 0.5, 0);
    const m = new THREE.Mesh(geo, mat(WALL_GREEN, { rough: 0.85 }));
    m.castShadow = true;
    m.receiveShadow = true;
    const c = new THREE.Mesh(
      new THREE.BoxGeometry(
        (along === 'x' ? len : THICK) + 0.03,
        0.06,
        (along === 'x' ? THICK : len) + 0.03,
      ),
      mat(WALL_CAP, { rough: 0.6 }),
    );
    if (along === 'x') {
      m.position.set((a + b) / 2, 0, fixed);
      c.position.set((a + b) / 2, WALL_H, fixed);
    } else {
      m.position.set(fixed, 0, (a + b) / 2);
      c.position.set(fixed, WALL_H, (a + b) / 2);
    }
    m.scale.y = WALL_H;
    s.slabs.push(m);
    s.caps.push(c);
    root.add(m, c);
  };
  addRun(back, 'x', -THICK, W + THICK, -o2);
  addRun(left, 'z', -o2, H + o2, -o2);
  addRun(right, 'z', -o2, H + o2, W + o2);
  addRun(front, 'x', -THICK, plan.door.x, H + o2);
  addRun(front, 'x', plan.door.x + 1, W + THICK, H + o2);
  // A skirting board along the outer walls inside.
  k.box(W, 0.08, 0.025, '#f5f1e8', W / 2, 0, 0.012);
  k.box(0.025, 0.08, H, '#f5f1e8', 0.012, 0, H / 2);
  k.box(0.025, 0.08, H, '#f5f1e8', W - 0.012, 0, H / 2);

  // Windows: big dark-framed panes on the back wall, louvred ones on the sides.
  const win = (along: 'x' | 'z', c: number, fixed: number, w: number) => {
    const wk = new Kit();
    const h = 1.35;
    const y = 0.85;
    const glass = {
      emissive: o.night ? '#ffcf7a' : '#7fbfe0',
      emissiveIntensity: o.night ? 0.45 : 0.22,
      rough: 0.08,
    };
    const bars = Math.max(2, Math.round(w / 0.45));
    if (along === 'x') {
      wk.box(w + 0.12, h + 0.12, THICK + 0.04, '#25272c', c, y - 0.06, fixed, {
        metal: 0.4,
        rough: 0.4,
      });
      wk.box(w, h, THICK + 0.06, '#9fc8dd', c, y, fixed, glass);
      for (let i = 1; i < bars; i++)
        wk.box(0.03, h, THICK + 0.08, '#25272c', c - w / 2 + (i * w) / bars, y, fixed);
    } else {
      wk.box(THICK + 0.04, h + 0.12, w + 0.12, '#25272c', fixed, y - 0.06, c, {
        metal: 0.4,
        rough: 0.4,
      });
      wk.box(THICK + 0.05, h, w, '#2f3238', fixed, y, c);
      for (let i = 0; i < 8; i++)
        wk.box(THICK + 0.07, 0.07, w - 0.06, '#4a4f57', fixed, y + 0.1 + i * 0.16, c);
    }
    return wk.build();
  };
  // Sconces: one per room on the back wall, and along the side walls.
  const sconces: { x: number; z: number; ry: number; s: WallSide }[] = [];
  for (const r of plan.rooms) {
    if (r.y === 0) {
      if (r.w >= 3 && r.id !== 'bathroom')
        back.extras.add(win('x', r.x + r.w * 0.62, -o2, Math.min(1.6, r.w * 0.35)));
      sconces.push({ x: r.x + r.w * (r.w >= 3 ? 0.25 : 0.5), z: o2 + 0.02, ry: 0, s: back });
    }
    if (r.x === 0) {
      if (r.h >= 3) left.extras.add(win('z', r.y + r.h * 0.6, -o2, Math.min(1.8, r.h * 0.4)));
      if (r.h >= 4) sconces.push({ x: o2 + 0.02, z: r.y + r.h * 0.25, ry: Math.PI / 2, s: left });
    }
    if (r.x + r.w === W) {
      if (r.h >= 3) right.extras.add(win('z', r.y + r.h * 0.55, W + o2, Math.min(2.0, r.h * 0.4)));
      if (r.h >= 4)
        sconces.push({ x: W - o2 - 0.02, z: r.y + r.h * 0.25, ry: -Math.PI / 2, s: right });
    }
  }
  const lamps: THREE.PointLight[] = [];
  for (const s of sconces) {
    const m = buildEstateModel('sconce', { w: 0.2, d: 0.2, tier: 2 });
    m.group.position.set(s.x, 1.85, s.z);
    m.group.rotation.y = s.ry;
    s.s.extras.add(m.group);
  }
  // Sconce light: a few warm lamps (more at night), the rest just glow.
  for (const s of sconces.filter((_, i) => i % 2 === 0).slice(0, o.lit ? 4 : 0)) {
    const pl = new THREE.PointLight('#ffd89a', 2.4, 5.5, 1.8);
    pl.position.set(s.x + Math.sin(s.ry) * 0.5, 1.9, s.z + Math.cos(s.ry) * 0.5);
    lamps.push(pl);
    root.add(pl);
  }
  // The front door: a frame and an open leaf, a doormat.
  {
    const d = new Kit();
    const x0 = plan.door.x;
    d.box(0.1, 2.25, THICK + 0.06, '#f4f1ea', x0 + 0.05, 0, H + o2);
    d.box(0.1, 2.25, THICK + 0.06, '#f4f1ea', x0 + 0.95, 0, H + o2);
    d.box(1.0, 0.12, THICK + 0.06, '#f4f1ea', x0 + 0.5, 2.2, H + o2);
    d.box(0.06, 2.12, 0.86, '#f1ede4', x0 + 0.1, 0, H - 0.43 + o2, { round: 0.01 });
    front.extras.add(d.build());
    k.box(0.9, 0.02, 0.55, '#8b5a2b', x0 + 0.5, GROUND_Y + 0.12, H + 0.45);
  }

  // Inner walls from the plan.
  const hLines = new Map<number, number[]>();
  const vLines = new Map<number, number[]>();
  for (const s of plan.walls) {
    if (s.dir === 'h') hLines.set(s.y, [...(hLines.get(s.y) ?? []), s.x]);
    else vLines.set(s.x, [...(vLines.get(s.x) ?? []), s.y]);
  }
  const edgeSegs: { x0: number; z0: number; x1: number; z1: number; nx: number; nz: number }[] = [
    { x0: 0, z0: 0, x1: W, z1: 0, nx: 0, nz: 1 },
    { x0: 0, z0: 0, x1: 0, z1: H, nx: 1, nz: 0 },
    { x0: W, z0: 0, x1: W, z1: H, nx: -1, nz: 0 },
    { x0: 0, z0: H, x1: W, z1: H, nx: 0, nz: -1 },
  ];
  for (const [y, xs] of hLines)
    for (const [a, b] of runs(xs)) {
      k.box(b - a + THICK, INNER_H, THICK, WALL_INNER, (a + b) / 2, 0, y, { rough: 0.85 });
      k.box(b - a + THICK + 0.03, 0.05, THICK + 0.03, WALL_CAP, (a + b) / 2, INNER_H, y);
      edgeSegs.push(
        { x0: a, z0: y, x1: b, z1: y, nx: 0, nz: 1 },
        { x0: a, z0: y, x1: b, z1: y, nx: 0, nz: -1 },
      );
    }
  for (const [x, ys] of vLines)
    for (const [a, b] of runs(ys)) {
      k.box(THICK, INNER_H, b - a + THICK, WALL_INNER, x, 0, (a + b) / 2, { rough: 0.85 });
      k.box(THICK + 0.03, 0.05, b - a + THICK + 0.03, WALL_CAP, x, INNER_H, (a + b) / 2);
      edgeSegs.push(
        { x0: x, z0: a, x1: x, z1: b, nx: 1, nz: 0 },
        { x0: x, z0: a, x1: x, z1: b, nx: -1, nz: 0 },
      );
    }
  const edges = edgeStrips(edgeSegs);
  if (edges) root.add(edges);

  // Potted plants in free room corners (the reference's green, lived-in rooms).
  {
    const taken = new Set<string>();
    const mark = (s: Spot) => {
      for (let x = s.x - 1; x <= s.x + s.w; x++)
        for (let y = s.y - 1; y <= s.y + s.h; y++) taken.add(key(x, y));
      taken.add(key(s.interact.x, s.interact.y));
    };
    for (const s of Object.values(plan.slots)) mark(s);
    for (const s of Object.values(plan.fixtures)) if (s) mark(s);
    for (const d of plan.decor) mark(d.spot);
    for (const s of plan.walls) {
      taken.add(key(s.x, s.y));
      taken.add(s.dir === 'h' ? key(s.x, s.y - 1) : key(s.x - 1, s.y));
    }
    taken.add(key(plan.door.x, plan.door.y));
    let n = 0;
    for (const r of plan.rooms) {
      if (r.id === 'bathroom' || r.w < 3 || r.h < 3) continue;
      for (const [x, y] of [
        [r.x, r.y],
        [r.x + r.w - 1, r.y],
        [r.x, r.y + r.h - 1],
        [r.x + r.w - 1, r.y + r.h - 1],
      ] as const) {
        if (taken.has(key(x, y)) || n > 12) continue;
        taken.add(key(x, y));
        const p = potPlant();
        p.scale.setScalar(0.8);
        p.position.set(x + 0.5, 0, y + 0.5);
        root.add(p);
        n++;
        break;
      }
    }
  }
  root.add(k.build());

  // ---- The camera: the house, the terrace, the drive and the bays.
  // Framed like the reference: the house fills the width, the pool behind it
  // and the drive in front; the grounds' far sides run off the edges.
  const f = g.focus;
  const fx0 = Math.max(f.x, -1.2);
  const fx1 = Math.min(f.x + f.w, W + 1.2);
  const centre = new THREE.Vector3((fx0 + fx1) / 2, 0, f.y + f.h / 2);
  const fitPoints: THREE.Vector3[] = [];
  for (const x of [fx0, fx1])
    for (const z of [f.y + 0.4, f.y + f.h - 0.6])
      for (const y of [0, WALL_H * 0.5]) fitPoints.push(new THREE.Vector3(x, y, z));
  return {
    root,
    sides,
    centre,
    span: Math.max(f.w, f.h) * 1.1 + 2,
    fitPoints,
    van: { x: g.van.x, z: g.van.y, street: g.street.y },
    shadow: Math.max(f.w, f.h) * 0.75 + 4,
    lamps,
  };
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

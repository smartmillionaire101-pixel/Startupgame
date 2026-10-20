/**
 * Wave 9 §C, Wave 12: a home's 3D shell and grounds, built from its floor
 * plan (../home/layout.ts) and its grounds (../home/grounds.ts).
 *
 * The house: a floor per room (warm tiles, light oak, bathroom tiles), tall
 * green outer walls with white caps that cut away when they face the
 * camera, lower inner walls with door gaps, dark-framed windows, wall
 * sconces, soft darkening along every wall and a front door.
 *
 * Round it, on its plot in a street of neighbours (./surroundings.ts): a pool terrace (villa,
 * mansion), a formal garden with a fountain (mansion, the very rich), a
 * gated drive with a bay for every car (a steel carport, a glass showroom,
 * chargers), hedges, palms, potted plants and the street; a penthouse sits
 * on a roof terrace with a hot tub and the city's towers round it; a hotel
 * room is one room on a floor partway up its tower (./hotel-tower.ts).
 *
 * World units: one tile is one metre; tile (x, y) covers x..x+1 on X and
 * y..y+1 on Z, the floor at Y = 0, the lawn just below.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { HomePlan, RoomId, Spot } from '../home/layout';
import type { HotelTier } from '../city/travel';
import { bathDoors, key, wallEdges } from '../home/layout';
import type { Grounds } from '../home/grounds';
import {
  FLOOR_SCALE,
  Kit,
  disposeTree,
  edgeTexture,
  floorTexture,
  mat,
  type FloorKind,
} from './kit';
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
import {
  asphaltTexture,
  canvasTex,
  cityBelow,
  neighbourhood,
  type Occluder,
  type Surroundings,
} from './surroundings';
import { hotelTower, type TowerSide } from './hotel-tower';

export const WALL_H = 2.6;
export const INNER_H = 1.25;
export const CUT_H = 0.34;
const THICK = 0.16;
const WALL_GREEN = '#1d8a65';
const WALL_INNER = '#23946e';
const WALL_CAP = '#f4f1ea';
/** The lawn's top (the house slab and floors sit a little above it). */
export const GROUND_Y = -0.14;
/** Floor to floor, upstairs. */
export const STOREY = 3;

export interface WallSide {
  /** Outward normal on the floor plane. */
  n: THREE.Vector2;
  slabs: THREE.Object3D[];
  caps: THREE.Object3D[];
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
  /** How far below this floor the grounds are (0 on the ground floor). */
  drop: number;
  /** The neighbours' buildings (and the city's towers) that hide while they'd block the view. */
  occluders: Occluder[];
  /** How far the world round the home reaches (metres). */
  reach: number;
  /** How far Look around zooms out (1: not at all; a hotel room shows its tower). */
  lookZoom: number;
  /** The world round the home, once it's attached. */
  world: Surroundings | null;
  /** Its world was kept from the last time (attaching it costs nothing). */
  kept: boolean;
  /** Build (or take from the last time) the world round the home and put it in. */
  attach(): void;
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
    case 'landing':
      return 'oak';
    case 'hall':
      return 'marble';
    case 'office':
      return 'parquet-dark';
    case 'balcony':
    case 'terrace':
      return 'stone';
  }
}

/** Warm tints over the floor textures (cream tiles, honey oak). */
const FLOOR_TINT: Partial<Record<FloorKind, string>> = {
  marble: '#fbf4ea',
  bath: '#b9e3ef',
  carpet: '#8c6f73',
  concrete: '#e2dfd9',
};

/**
 * A hotel room's floors and walls by tier: a budget room's laminate and
 * sage walls, a business room's carpet and slate, a suite's walnut, marble
 * and warm taupe walls.
 */
const HOTEL_FLOORS: Record<HotelTier, Partial<Record<RoomId, [FloorKind, string?]>>> = {
  budget: { bedroom: ['oak', '#efe2cf'], hall: ['tile', '#e5e1da'], bathroom: ['bath'] },
  business: {
    bedroom: ['parquet', '#f1e4d4'],
    hall: ['parquet', '#f3e6d6'],
    bathroom: ['tile', '#d8d4cc'],
  },
  luxury: {
    living: ['parquet-dark', '#f2dcc4'],
    bedroom: ['parquet-dark', '#f2dcc4'],
    hall: ['marble', '#f6efe4'],
    guest: ['oak', '#e8d2b8'],
    bathroom: ['marble', '#e0d5c5'],
  },
};
const HOTEL_WALLS: Record<HotelTier, { outer: string; inner: string; cap: string; drape: string }> =
  {
    budget: { outer: '#6f948a', inner: '#7da197', cap: WALL_CAP, drape: '#9fb3c8' },
    business: { outer: '#4b6279', inner: '#587089', cap: '#f1efe9', drape: '#c9c2b4' },
    luxury: { outer: '#7a5d48', inner: '#8b6d56', cap: '#efe3cc', drape: '#b9935f' },
  };

function floorMesh(
  kind: FloorKind,
  x: number,
  z: number,
  w: number,
  d: number,
  y = 0.002,
  tint?: string,
) {
  const tex = floorTexture(kind).clone();
  tex.needsUpdate = true;
  const s = FLOOR_SCALE[kind];
  tex.repeat.set(w / s, d / s);
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, d),
    mat(tint ?? FLOOR_TINT[kind] ?? '#ffffff', {
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
  /** Leave the world round the home (the street, the city, the hotel's tower) for `attach`. */
  later?: boolean;
}

export function buildHouse(plan: HomePlan, o: HouseOpts): House {
  const root = new THREE.Group();
  const W = plan.w;
  const H = plan.h;
  const g = o.grounds;
  const roof = g.style === 'roof';
  // A hotel room: a floor of the hotel's tower round it (the roof is for penthouses).
  const hotel = g.style === 'hotel' && g.hotel ? g.hotel : null;
  const k = new Kit();
  // Upstairs: the grounds are a storey (or two) below.
  const level = plan.level ?? 0;
  const drop = level * STOREY;
  const yard = new THREE.Group();
  yard.position.y = -drop;
  root.add(yard);
  const gk = new Kit();

  // ---- The ground: your plot in its street among the neighbours, out to
  // the haze (or a roof over the city, the building under you down to the street).
  // Built by `world` below: at once, or later (`o.later`) so the room draws first.
  let slab: { x: number; z: number; w: number; d: number } | null = null;
  if (roof) {
    // The roof: just round your terrace and the car deck, the building's edge in sight.
    const f = g.focus;
    const sl = { x: f.x - 2.2, z: f.y - 2.2, w: f.w + 4.4, d: f.h + 4.4 };
    slab = sl;
    const sx = sl.x + sl.w / 2;
    const sz = sl.z + sl.d / 2;
    gk.box(sl.w, 0.6, sl.d, '#cbd5e1', sx, GROUND_Y - 0.62, sz, { rough: 0.9 });
    const rt = floorTexture('stone').clone();
    rt.needsUpdate = true;
    rt.repeat.set(sl.w / 3, sl.d / 3);
    yard.add(flat(rt, sl.x, sl.z, sl.w, sl.d, GROUND_Y - 0.01));
    // A glass parapet all round the roof.
    for (const [w, d, x, z] of [
      [sl.w, 0.06, sx, sl.z + sl.d],
      [sl.w, 0.06, sx, sl.z],
      [0.06, sl.d, sl.x + sl.w, sz],
      [0.06, sl.d, sl.x, sz],
    ] as const) {
      gk.box(w, 1.0, d, '#bfe3f0', x, GROUND_Y, z, { opacity: 0.3, noShadow: true, rough: 0.1 });
      gk.box(w + 0.02, 0.05, d + 0.04, '#d9dde3', x, GROUND_Y + 1.0, z, { metal: 0.6, rough: 0.3 });
    }
    // A glass railing round the terrace: the balcony you look out from.
    if (g.terrace) {
      const t = g.terrace;
      railing(gk, 'x', t.x, t.x + t.w, t.y + t.h);
      railing(gk, 'z', t.y, t.y + t.h, t.x);
      railing(gk, 'z', t.y, t.y + t.h, t.x + t.w);
    }
  }
  /** The world round the home (kept between opens: the same home opens at once). */
  const spec = ((): { key: string; make: () => World } => {
    if (hotel) {
      const ho = {
        night: o.night,
        groundY: GROUND_Y,
        W,
        H,
        doorX: plan.door.x,
        tier: hotel.tier,
        name: hotel.name,
        floor: hotel.floor,
        room: hotel.room,
        doors: hotel.doors,
      };
      return { key: `hotel:${JSON.stringify(ho)}`, make: () => hotelTower(ho) };
    }
    if (!roof) {
      const no = { night: o.night, groundY: GROUND_Y, W, H };
      return {
        key: `street:${JSON.stringify([g, no])}`,
        make: () => ({ ...neighbourhood(g, no), sides: [] }),
      };
    }
    // The city round it and far below: lower blocks round yours, towers rising past it.
    const co = { night: o.night, groundY: GROUND_Y, slab: slab! };
    return { key: `roof:${JSON.stringify(co)}`, make: () => ({ ...cityBelow(co), sides: [] }) };
  })();
  const world = () => kept(spec.key, spec.make);

  // ---- Terrace, pool, drive, path.
  if (g.terrace) {
    const st = floorTexture('stone').clone();
    st.needsUpdate = true;
    st.repeat.set(g.terrace.w / 2.5, g.terrace.h / 2.5);
    yard.add(
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
      gk.box(p.w + cw * 2, 0.55, p.h + cw * 2, '#e7e2da', cx, GROUND_Y, cz, { round: 0.06 });
    } else {
      gk.box(p.w + cw * 2, 0.1, cw, '#f8f7f4', cx, GROUND_Y, p.y - cw / 2, { rough: 0.5 });
      gk.box(p.w + cw * 2, 0.1, cw, '#f8f7f4', cx, GROUND_Y, p.y + p.h + cw / 2, { rough: 0.5 });
      gk.box(cw, 0.1, p.h, '#f8f7f4', p.x - cw / 2, GROUND_Y, cz, { rough: 0.5 });
      gk.box(cw, 0.1, p.h, '#f8f7f4', p.x + p.w + cw / 2, GROUND_Y, cz, { rough: 0.5 });
      // The basin under the water, pale blue tiles.
      gk.box(p.w, 1.2, p.h, '#8bd8f5', cx, GROUND_Y - 1.25, cz, { rough: 0.3 });
      for (let i = 0; i < 3; i++)
        gk.box(
          0.9,
          0.06,
          0.3,
          '#f8fafc',
          p.x + p.w - 0.55,
          top - 0.4 - i * 0.25,
          p.y + 0.3 + i * 0.3,
        );
      for (const sx of [-1, 1])
        gk.cyl(0.025, 0.025, 1.1, '#d9dde3', p.x + 0.6 + sx * 0.25, top - 0.7, p.y + 0.06, {
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
    yard.add(water);
  }
  if (g.parasol) {
    const m = buildModel('parasol', { w: 1.6, d: 1.6, tier: 2, tint: '#f4efe4' });
    m.group.position.set(g.parasol.x, GROUND_Y + 0.03, g.parasol.y);
    m.group.scale.setScalar(1.25);
    yard.add(m.group);
  }
  if (g.drive) {
    const d = g.drive;
    const at = asphaltTexture();
    at.repeat.set(d.w / 4, d.h / 4);
    yard.add(flat(at, d.x, d.y, d.w, d.h, GROUND_Y + 0.015, roof ? 0.9 : 0.95));
  }
  if (!hotel) {
    const p = g.path;
    const n = Math.max(1, Math.round(p.h / 0.7));
    for (let i = 0; i < n; i++)
      gk.box(p.w, 0.04, 0.55, '#d8cfbf', p.x + p.w / 2, GROUND_Y, p.y + 0.2 + i * 0.7, {
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
        gk.box(0.08, 0.012, b.h, '#f5f5f4', x, GROUND_Y + 0.02, cz, { noShadow: true });
      if (b.kind === 'charger') {
        gk.box(0.36, 1.3, 0.26, '#123f39', b.x + b.w - 0.3, GROUND_Y, b.y + 0.25, { round: 0.04 });
        gk.box(0.22, 0.28, 0.03, '#8df3bc', b.x + b.w - 0.3, GROUND_Y + 0.9, b.y + 0.39, {
          emissive: '#8df3bc',
          emissiveIntensity: 0.6,
        });
      }
    } else if (b.kind === 'deck') {
      gk.box(b.w, 0.012, 0.08, '#f5f5f4', cx, GROUND_Y + 0.02, b.y, { noShadow: true });
    } else if (b.kind === 'showroom') {
      const s = showroomGarage(b.w, b.h);
      s.position.set(cx, GROUND_Y + 0.01, cz);
      yard.add(s);
    }
  }
  if (g.carport) {
    const c = g.carport;
    const s = carport(c.w, c.h);
    s.position.set(c.x + c.w / 2, GROUND_Y + 0.012, c.y + c.h / 2);
    yard.add(s);
  }
  for (const h of g.hedges) {
    const m = hedge(h.w, h.h, h.h < 0.6 ? 0.6 : 0.95);
    m.position.set(h.x + h.w / 2, GROUND_Y, h.y + h.h / 2);
    yard.add(m);
  }
  if (g.gate) {
    const m = gate(g.gate.w);
    m.position.set(g.gate.x, GROUND_Y, g.gate.y);
    yard.add(m);
  }
  for (const t of g.trees) {
    const m = t.palm ? palm(t.s) : tree(t.s);
    m.position.set(t.x, GROUND_Y, t.y);
    yard.add(m);
  }
  for (const p of g.pots) {
    const m = potPlant();
    m.position.set(p.x, GROUND_Y, p.y);
    yard.add(m);
  }
  if (g.fountain) {
    const f = g.fountain;
    gk.cyl(1.2, 1.25, 0.42, '#e7e5e4', f.x, GROUND_Y, f.y, { seg: 28 });
    gk.cyl(1.05, 1.05, 0.02, '#38bdf8', f.x, GROUND_Y + 0.38, f.y, {
      seg: 28,
      emissive: '#0ea5e9',
      emissiveIntensity: 0.25,
      rough: 0.1,
    });
    gk.cyl(0.14, 0.18, 1.0, '#e7e5e4', f.x, GROUND_Y + 0.2, f.y, { seg: 12 });
    gk.cyl(0.5, 0.18, 0.14, '#e7e5e4', f.x, GROUND_Y + 1.15, f.y, { seg: 18 });
    gk.sphere(0.13, '#bae6fd', f.x, GROUND_Y + 1.42, f.y, { seg: 8, opacity: 0.8 });
    gk.box(0.9, 0.03, Math.abs(f.y) * 2 - 1.2, '#d6cbb5', f.x, GROUND_Y + 0.005, f.y, {
      rough: 0.95,
    });
  }
  for (const b of g.beds) {
    gk.box(b.w, 0.18, b.h, '#6b4a2f', b.x + b.w / 2, GROUND_Y, b.y + b.h / 2, { rough: 1 });
    const n = Math.max(3, Math.round((b.w * b.h) / 0.45));
    for (let i = 0; i < n; i++)
      gk.sphere(
        0.15,
        ['#f472b6', '#facc15', '#f87171', '#c084fc', '#4ade80'][i % 5]!,
        b.x + 0.3 + ((i * 0.73) % Math.max(0.4, b.w - 0.6)),
        GROUND_Y + 0.26,
        b.y + 0.3 + ((i * 0.41) % Math.max(0.4, b.h - 0.6)),
        { seg: 7 },
      );
  }

  yard.add(gk.build());

  // ---- The house: slab, floors, walls.
  k.box(W + 0.5, Math.abs(GROUND_Y) + 0.0, H + 0.5, '#e8e1d3', W / 2, GROUND_Y, H / 2, {
    rough: 0.9,
  });
  if (drop) storeys(k, W, H, drop, o.night);
  const pal = hotel
    ? HOTEL_WALLS[hotel.tier]
    : { outer: WALL_GREEN, inner: WALL_INNER, cap: WALL_CAP, drape: '' };
  for (const r of plan.rooms) {
    const hf = hotel ? HOTEL_FLOORS[hotel.tier][r.id] : undefined;
    root.add(floorMesh(hf?.[0] ?? floorKind(r.id, o.tier), r.x, r.y, r.w, r.h, 0.002, hf?.[1]));
  }

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
    const m = new THREE.Mesh(geo, mat(pal.outer, { rough: 0.85 }));
    m.castShadow = true;
    m.receiveShadow = true;
    const c = new THREE.Mesh(
      new THREE.BoxGeometry(
        (along === 'x' ? len : THICK) + 0.03,
        0.06,
        (along === 'x' ? THICK : len) + 0.03,
      ),
      mat(pal.cap, { rough: 0.6 }),
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
  // The outer walls, a glass railing where a room is outdoors (a balcony, the
  // roof terrace) and the front door's gap on the ground floor.
  const open = (x: number, y: number) =>
    plan.rooms.find((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h)?.open === true;
  const outer = (
    s: WallSide,
    along: 'x' | 'z',
    n: number,
    at: (i: number) => [number, number],
    fixed: number,
    gap = -1,
  ) => {
    let i = 0;
    while (i < n) {
      if (i === gap) {
        i++;
        continue;
      }
      const glass = open(...at(i));
      let j = i + 1;
      while (j < n && j !== gap && open(...at(j)) === glass) j++;
      const a = i === 0 ? -THICK : i;
      const b = j === n ? n + THICK : j;
      if (glass) railing(k, along, a, b, fixed);
      else addRun(s, along, a, b, fixed);
      i = j;
    }
  };
  outer(back, 'x', W, (i) => [i, 0], -o2);
  outer(left, 'z', H, (i) => [0, i], -o2);
  outer(right, 'z', H, (i) => [W - 1, i], W + o2);
  outer(front, 'x', W, (i) => [i, H - 1], H + o2, level === 0 ? plan.door.x : -1);
  // A skirting board along the outer walls inside.
  k.box(W, 0.08, 0.025, '#f5f1e8', W / 2, 0, 0.012);
  k.box(0.025, 0.08, H, '#f5f1e8', 0.012, 0, H / 2);
  k.box(0.025, 0.08, H, '#f5f1e8', W - 0.012, 0, H / 2);

  // Windows: big dark-framed panes on the back wall, louvred ones on the sides.
  const win = (along: 'x' | 'z', c: number, fixed: number, w: number, tall = false) => {
    const wk = new Kit();
    const h = tall ? 2.2 : 1.35;
    const y = tall ? 0.14 : 0.85;
    const glass = {
      emissive: o.night ? '#ffcf7a' : '#7fbfe0',
      emissiveIntensity: o.night ? 0.45 : 0.22,
      rough: 0.08,
    };
    const bars = Math.max(2, Math.round(w / (tall ? 1.15 : 0.45)));
    if (along === 'x') {
      wk.box(w + 0.12, h + 0.12, THICK + 0.04, '#25272c', c, y - 0.06, fixed, {
        metal: 0.4,
        rough: 0.4,
      });
      wk.box(w, h, THICK + 0.06, '#9fc8dd', c, y, fixed, glass);
      for (let i = 1; i < bars; i++)
        wk.box(0.03, h, THICK + 0.08, '#25272c', c - w / 2 + (i * w) / bars, y, fixed);
      // A hotel's curtains, drawn back either side of the window (inside).
      if (pal.drape)
        for (const sx of [-1, 1])
          wk.box(
            0.32,
            2.3,
            0.08,
            pal.drape,
            c + sx * (w / 2 + 0.12),
            0.05,
            fixed + THICK / 2 + 0.06,
            {
              round: 0.03,
              rough: 0.95,
            },
          );
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
    if (r.open) continue;
    if (r.y === 0) {
      if (r.w >= 3 && r.id !== 'bathroom' && !hotel?.windows)
        back.extras.add(win('x', r.x + r.w * 0.62, -o2, Math.min(1.6, r.w * 0.35)));
      sconces.push({ x: r.x + r.w * (r.w >= 3 ? 0.25 : 0.5), z: o2 + 0.02, ry: 0, s: back });
    }
    // (A hotel room's side walls are the neighbours': no windows in them.)
    if (r.x === 0) {
      if (r.h >= 3 && !hotel)
        left.extras.add(win('z', r.y + r.h * 0.6, -o2, Math.min(1.8, r.h * 0.4)));
      if (r.h >= 4) sconces.push({ x: o2 + 0.02, z: r.y + r.h * 0.25, ry: Math.PI / 2, s: left });
    }
    if (r.x + r.w === W) {
      if (r.h >= 3 && !hotel)
        right.extras.add(win('z', r.y + r.h * 0.55, W + o2, Math.min(2.0, r.h * 0.4)));
      if (r.h >= 4)
        sconces.push({ x: W - o2 - 0.02, z: r.y + r.h * 0.25, ry: -Math.PI / 2, s: right });
    }
  }
  // A hotel's windows where its plan puts them (a suite's glass wall onto the balcony).
  for (const w of hotel?.windows ?? []) back.extras.add(win('x', w.c, -o2, w.w, w.tall));
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
  if (level === 0) {
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
      k.box(b - a + THICK, INNER_H, THICK, pal.inner, (a + b) / 2, 0, y, { rough: 0.85 });
      k.box(b - a + THICK + 0.03, 0.05, THICK + 0.03, pal.cap, (a + b) / 2, INNER_H, y);
      edgeSegs.push(
        { x0: a, z0: y, x1: b, z1: y, nx: 0, nz: 1 },
        { x0: a, z0: y, x1: b, z1: y, nx: 0, nz: -1 },
      );
    }
  for (const [x, ys] of vLines)
    for (const [a, b] of runs(ys)) {
      k.box(THICK, INNER_H, b - a + THICK, pal.inner, x, 0, (a + b) / 2, { rough: 0.85 });
      k.box(THICK + 0.03, 0.05, b - a + THICK + 0.03, pal.cap, x, INNER_H, (a + b) / 2);
      edgeSegs.push(
        { x0: x, z0: a, x1: x, z1: b, nx: 1, nz: 0 },
        { x0: x, z0: a, x1: x, z1: b, nx: -1, nz: 0 },
      );
    }
  const edges = edgeStrips(edgeSegs);
  if (edges) root.add(edges);
  bathrooms(plan, root, sides, hotel?.tier === 'luxury' ? 'marble' : 'bath');

  // Potted plants in free room corners (the reference's green, lived-in rooms);
  // a hotel puts its own where it wants them.
  if (!hotel) {
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
      if (r.id === 'bathroom' || r.open || r.w < 3 || r.h < 3) continue;
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
  const house: House = {
    root,
    sides,
    centre,
    span: Math.max(f.w, f.h) * 1.1 + 2,
    fitPoints,
    van: { x: g.van.x, z: g.van.y, street: g.street.y },
    shadow: Math.max(f.w, f.h) * 0.75 + 4,
    lamps,
    drop,
    occluders: [],
    reach: 0,
    lookZoom: hotel ? 0.42 : 1,
    world: null,
    kept: !!WORLDS.get(spec.key) && !WORLDS.get(spec.key)!.group.parent,
    attach() {
      if (house.world) return;
      const w = world();
      house.world = w;
      for (const oc of w.occluders) if (oc.hidden) oc.set(false);
      yard.add(w.group);
      // The hotel's corridor, the neighbours' rooms and the floors above cut away like the room's walls.
      for (const t of w.sides) {
        t.walls.userData.done = false;
        sides.push({ n: t.n, slabs: [t.walls], caps: [t.caps], extras: t.extras, cut: false });
        root.add(t.walls, t.caps, t.extras);
      }
      house.occluders = w.occluders;
      house.reach = w.reach;
    },
  };
  if (!o.later) house.attach();
  return house;
}

/** The world round a home: the street, the city below, or the hotel's tower. */
type World = Surroundings & { sides: TowerSide[] };
const parts = (w: World) => [w.group, ...w.sides.flatMap((t) => [t.walls, t.caps, t.extras])];

/**
 * The worlds round the last few homes opened, kept (marked `userData.keep`,
 * so disposing a house leaves them): opening the same home again, or going
 * back to it, doesn't build its street or tower again.
 */
const WORLDS = new Map<string, World>();
const KEEP_WORLDS = 4;
function kept(key: string, make: () => World): World {
  const hit = WORLDS.get(key);
  if (hit && !hit.group.parent) {
    WORLDS.delete(key);
    WORLDS.set(key, hit);
    return hit;
  }
  // In use already (two views of one home): a fresh one, not kept.
  if (hit) return make();
  const w = make();
  for (const p of parts(w)) p.userData.keep = true;
  WORLDS.set(key, w);
  // Let go of the oldest that nothing shows.
  for (const [k, v] of WORLDS) {
    if (WORLDS.size <= KEEP_WORLDS) break;
    if (v.group.parent) continue;
    WORLDS.delete(k);
    for (const p of parts(v)) {
      p.userData.keep = false;
      disposeTree(p);
    }
  }
  return w;
}

/** Upstairs: the storeys below, a green block with a white band and windows, down to the lawn. */
function storeys(k: Kit, W: number, H: number, drop: number, night: boolean) {
  k.box(W + 0.3, drop, H + 0.3, WALL_GREEN, W / 2, GROUND_Y - drop + 0.14, H / 2, { rough: 0.85 });
  const glass = {
    emissive: night ? '#ffcf7a' : '#7fbfe0',
    emissiveIntensity: night ? 0.5 : 0.2,
    rough: 0.1,
  };
  for (let s = 0; s * STOREY < drop - 0.1; s++) {
    const y = -drop + s * STOREY;
    // The floor line.
    k.box(W + 0.36, 0.14, H + 0.36, WALL_CAP, W / 2, y + STOREY - 0.14, H / 2, { rough: 0.6 });
    for (let x = 1.2; x < W - 1; x += 2.6) {
      k.box(1.3, 1.4, 0.06, '#25272c', x + 0.65, y + 0.9, H + 0.17, { metal: 0.4, rough: 0.4 });
      k.box(1.15, 1.25, 0.08, '#9fc8dd', x + 0.65, y + 0.97, H + 0.17, glass);
    }
    for (let z = 1.2; z < H - 1; z += 2.6)
      for (const x of [-0.17, W + 0.17]) {
        k.box(0.06, 1.4, 1.3, '#25272c', x, y + 0.9, z + 0.65, { metal: 0.4, rough: 0.4 });
        k.box(0.08, 1.25, 1.15, '#9fc8dd', x, y + 0.97, z + 0.65, glass);
      }
  }
}

/** A glass railing with a steel top rail, along x or z from a to b at `fixed`. */
function railing(k: Kit, along: 'x' | 'z', a: number, b: number, fixed: number) {
  const len = b - a;
  const c = (a + b) / 2;
  const [x, z] = along === 'x' ? [c, fixed] : [fixed, c];
  const [w, d] = along === 'x' ? [len, 0.04] : [0.04, len];
  k.box(w, 1.0, d, '#bfe3f0', x, 0, z, { opacity: 0.3, rough: 0.05, noShadow: true });
  k.box(w + 0.02, 0.05, d + 0.04, '#d9dde3', x, 1.0, z, { metal: 0.6, rough: 0.3 });
  for (let t = a; t <= b + 0.01; t += 1.5) {
    const [px, pz] = along === 'x' ? [Math.min(t, b), fixed] : [fixed, Math.min(t, b)];
    k.box(0.05, 1.0, 0.05, '#d9dde3', px, 0, pz, { metal: 0.6, rough: 0.3 });
  }
}

/**
 * Bathrooms read as bathrooms: white tiles up the walls round them (on the
 * outer walls' inside too, cut away with them) and a door, ajar, with a sign.
 */
function bathrooms(
  plan: HomePlan,
  root: THREE.Group,
  sides: WallSide[],
  tiles: FloorKind = 'bath',
) {
  const walls = wallEdges(plan);
  const [back, front, left, right] = sides as [WallSide, WallSide, WallSide, WallSide];
  const panel = (
    along: 'x' | 'z',
    a: number,
    b: number,
    fixed: number,
    h: number,
    into: THREE.Group,
  ) => {
    const len = b - a;
    const tex = floorTexture(tiles).clone();
    tex.needsUpdate = true;
    const ts = tiles === 'bath' ? 0.6 : 2;
    tex.repeat.set(len / ts, h / ts);
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(len, h),
      mat(tiles === 'bath' ? '#d4f1f8' : '#f3eee6', { map: tex, rough: 0.25, own: true }),
    );
    m.position.set(along === 'x' ? (a + b) / 2 : fixed, h / 2, along === 'x' ? fixed : (a + b) / 2);
    m.receiveShadow = true;
    into.add(m);
    return m;
  };
  const hasWall = (ax: number, ay: number, bx: number, by: number) =>
    walls.has(`${key(ax, ay)}|${key(bx, by)}`);
  const OUT_H = 1.9;
  const IN_H = INNER_H - 0.02;
  const inset = THICK / 2 + 0.012;
  for (const r of plan.rooms) {
    if (r.id !== 'bathroom') continue;
    // Each side: runs of tiles where a wall stands (an outer wall, or an inner one).
    const edge = (
      n: number,
      at: (i: number) => { wall: boolean; outer: boolean },
      put: (a: number, b: number, outer: boolean) => void,
    ) => {
      let i = 0;
      while (i < n) {
        const e = at(i);
        let j = i + 1;
        while (j < n && at(j).wall === e.wall && at(j).outer === e.outer) j++;
        if (e.wall) put(i, j, e.outer);
        i = j;
      }
    };
    // Top edge (faces +z).
    edge(
      r.w,
      (i) => ({
        wall: r.y === 0 || hasWall(r.x + i, r.y - 1, r.x + i, r.y),
        outer: r.y === 0,
      }),
      (a, b, outer) => {
        const p = panel(
          'x',
          r.x + a,
          r.x + b,
          r.y + inset,
          outer ? OUT_H : IN_H,
          outer ? back.extras : root,
        );
        p.rotation.y = 0;
      },
    );
    // Bottom edge (faces -z).
    edge(
      r.w,
      (i) => ({
        wall: r.y + r.h === plan.h || hasWall(r.x + i, r.y + r.h - 1, r.x + i, r.y + r.h),
        outer: r.y + r.h === plan.h,
      }),
      (a, b, outer) => {
        const p = panel(
          'x',
          r.x + a,
          r.x + b,
          r.y + r.h - inset,
          outer ? OUT_H : IN_H,
          outer ? front.extras : root,
        );
        p.rotation.y = Math.PI;
      },
    );
    // Left edge (faces +x).
    edge(
      r.h,
      (i) => ({
        wall: r.x === 0 || hasWall(r.x - 1, r.y + i, r.x, r.y + i),
        outer: r.x === 0,
      }),
      (a, b, outer) => {
        const p = panel(
          'z',
          r.y + a,
          r.y + b,
          r.x + inset,
          outer ? OUT_H : IN_H,
          outer ? left.extras : root,
        );
        p.rotation.y = Math.PI / 2;
      },
    );
    // Right edge (faces -x).
    edge(
      r.h,
      (i) => ({
        wall: r.x + r.w === plan.w || hasWall(r.x + r.w - 1, r.y + i, r.x + r.w, r.y + i),
        outer: r.x + r.w === plan.w,
      }),
      (a, b, outer) => {
        const p = panel(
          'z',
          r.y + a,
          r.y + b,
          r.x + r.w - inset,
          outer ? OUT_H : IN_H,
          outer ? right.extras : root,
        );
        p.rotation.y = -Math.PI / 2;
      },
    );
  }
  // The doors: a white frame, the leaf swung open into the bathroom, a sign.
  for (const d of bathDoors(plan)) {
    const g = new Kit();
    const hgt = INNER_H + 0.35;
    // Built along x at z = 0, hinge at x = 0, then turned for a 'v' doorway.
    g.box(0.07, hgt, THICK + 0.04, '#f4f1ea', 0.035, 0, 0);
    g.box(0.07, hgt, THICK + 0.04, '#f4f1ea', 0.965, 0, 0);
    g.box(1.0, 0.08, THICK + 0.04, '#f4f1ea', 0.5, hgt - 0.08, 0);
    const leaf = new Kit();
    leaf.box(0.86, hgt - 0.12, 0.045, '#fbfaf7', 0.43, 0.02, 0, { round: 0.01 });
    leaf.sphere(0.03, '#c9a86a', 0.78, 0.95, 0.04, { metal: 0.7, rough: 0.3 });
    leaf.sphere(0.03, '#c9a86a', 0.78, 0.95, -0.04, { metal: 0.7, rough: 0.3 });
    // A blue sign with a little white figure.
    for (const s of [-1, 1]) {
      leaf.box(0.2, 0.2, 0.012, '#0ea5e9', 0.43, hgt - 0.5, s * 0.03, { round: 0.02 });
      leaf.sphere(0.022, '#ffffff', 0.43, hgt - 0.36, s * 0.04);
      leaf.box(0.05, 0.09, 0.008, '#ffffff', 0.43, hgt - 0.47, s * 0.04);
    }
    const lg = leaf.build();
    lg.position.set(0.07, 0, 0);
    // Swung 70° into the bathroom.
    lg.rotation.y = -d.inside * 1.22;
    const frame = g.build();
    frame.add(lg);
    if (d.dir === 'h') frame.position.set(d.x, 0, d.y);
    else {
      frame.rotation.y = -Math.PI / 2;
      frame.position.set(d.x, 0, d.y);
      lg.rotation.y = d.inside * 1.22;
    }
    root.add(frame);
  }
}

/** Cut away the outer walls that face the camera (azimuth, radians). */
export function cutWalls(h: House, azimuth: number) {
  const d = new THREE.Vector2(Math.sin(azimuth), Math.cos(azimuth));
  for (const s of h.sides) {
    const cut = s.n.dot(d) > 0.15;
    if (cut === s.cut && (!s.slabs.length || s.slabs[0]!.userData.done)) continue;
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

/**
 * Dressing a venue (../venues.ts): the furnishing toolkit every kind of room
 * is furnished with. A `Dresser` is one room's builder:
 *
 * - `glb` places a CC0 furniture model (public/models/props/furniture.glb,
 *   Quaternius, ../furnitureModels.ts). Every copy of a model shares its
 *   geometry, and at `finish` the copies become one InstancedMesh per model
 *   part, so twelve office chairs are a few draw calls.
 * - `kit` collects the cheap props drawn in code (counters, shelves, glass
 *   walls, screens), merged into one mesh per material (../kit.ts).
 * - `bits` are small things by the hundred (stock on shelves, books,
 *   magazines, parcels, bottles): two instanced meshes, a box and a
 *   cylinder, each instance in its own colour.
 *
 * The room's triangles are counted against a cap (a phone draws it at
 * 30 fps): past it, `glb` says no and the caller draws less. The layout is
 * the place's own: a seeded random (`rng`) picks and mirrors what goes
 * where, and `free` keeps furniture off the spots people stand and sit on,
 * the door and the stations acts are played at.
 */
import * as THREE from 'three';
import { propFit, propsNow, type Fit } from '../../three-kit/props';
import { Kit, mat, screenTexture, type PartOpts } from '../kit';

/** The most triangles a room's furniture may have (people and the shell are on top). */
export const TRI_CAP = 110_000;

/** A small seeded random (mulberry32) from a string. */
export function seeded(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Rect {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

/** Where acts are played (../acts3d.ts stations, ../../city/acts/scripts.tsx): kept clear. */
const STATIONS: [number, number][] = [
  [-0.33, 1.7],
  [0.2, 1.7],
  [-1, 1.7],
  [-0.07, 1.8],
  [-0.13, 1.5],
  [1.87, -0.4],
  [-2.27, 1.7],
  [-3.27, 1.5],
  [2.4, 0.45],
];

interface Inst {
  geo: THREE.BufferGeometry;
  mat: THREE.Material;
  shadow: boolean;
  m: THREE.Matrix4[];
}

const v3 = new THREE.Vector3();
const q4 = new THREE.Quaternion();
const eu = new THREE.Euler();
const one = new THREE.Vector3(1, 1, 1);

/** The textures the bits wear (a pack's label, a book's spine, a magazine cover), cached. */
const TEX = new Map<string, THREE.CanvasTexture>();
export function canvasTex(
  key: string,
  w: number,
  h: number,
  draw: (g: CanvasRenderingContext2D) => void,
  repeat = false,
): THREE.CanvasTexture {
  const hit = TEX.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  TEX.set(key, t);
  return t;
}

/** A pack's print: a pale band, a darker lid and a logo, tinted by the instance's colour. */
function packTexture() {
  return canvasTex('dress:pack', 64, 64, (g) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, 64, 64);
    g.fillStyle = '#c9c9c9';
    g.fillRect(0, 0, 64, 9);
    g.fillStyle = '#f2f2f2';
    g.fillRect(0, 26, 64, 18);
    g.fillStyle = '#8a8a8a';
    g.fillRect(10, 30, 26, 4);
    g.fillRect(10, 37, 16, 3);
    g.fillStyle = '#b0b0b0';
    g.beginPath();
    g.arc(48, 35, 6, 0, Math.PI * 2);
    g.fill();
  });
}

/** A can or bottle's label band. */
function canTexture() {
  return canvasTex('dress:can', 64, 64, (g) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, 64, 64);
    g.fillStyle = '#e8e8e8';
    g.fillRect(0, 20, 64, 26);
    g.fillStyle = '#9a9a9a';
    g.fillRect(0, 30, 64, 5);
    g.fillStyle = '#d0d0d0';
    g.fillRect(0, 0, 64, 6);
  });
}

export class Dresser {
  readonly kit = new Kit();
  readonly rng: () => number;
  /** Mirror the layout (left ↔ right) for this place: chosen by its seed. */
  readonly flip: boolean;
  tris = 0;
  /** The venue's name board on the back wall (x centre), which wall things keep below. */
  signX: number | null = null;
  private inst = new Map<string, Inst>();
  private boxes: { m: THREE.Matrix4; c: THREE.Color; tex: 'pack' | 'plain' }[] = [];
  private cyls: { m: THREE.Matrix4; c: THREE.Color }[] = [];
  private balls: { m: THREE.Matrix4; c: THREE.Color }[] = [];
  private taken: Rect[] = [];
  /** The room's screens' shared material (Venue3D pulses it). */
  readonly screen: THREE.MeshStandardMaterial;
  readonly screens: THREE.MeshStandardMaterial[] = [];
  /** Glass (walls, cases, fridge doors): one material, drawn last. */
  readonly glass = mat('#cfe8f3', { opacity: 0.22, rough: 0.05, metal: 0.1 });

  constructor(
    readonly root: THREE.Group,
    readonly seed: string,
    readonly tier: 1 | 2 | 3,
    /** Spots for people's feet (metres), kept clear. */
    readonly people: [number, number][],
  ) {
    this.rng = seeded(seed);
    this.flip = this.rng() < 0.5;
    this.screen = mat('#ffffff', {
      own: true,
      map: screenTexture('slide'),
      emissive: '#ffffff',
      emissiveIntensity: 0.6,
      rough: 0.25,
    });
    this.screen.emissiveMap = this.screen.map;
    this.screens.push(this.screen);
  }

  /** A random pick. */
  pick<T>(xs: readonly T[]): T {
    return xs[Math.floor(this.rng() * xs.length)]!;
  }
  /** A random number in [a, b). */
  range(a: number, b: number) {
    return a + this.rng() * (b - a);
  }
  /** Shuffled copy. */
  shuffle<T>(xs: readonly T[]): T[] {
    const a = [...xs];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [a[i], a[j]] = [a[j]!, a[i]!];
    }
    return a;
  }

  /**
   * Whether a footprint is clear: of people's spots (with room to stand), the
   * door, the act stations (when `stations`) and what's been put down already.
   */
  free(r: Rect, o: { margin?: number; stations?: boolean; furniture?: boolean } = {}): boolean {
    const m = o.margin ?? 0.32;
    const hit = (x: number, z: number, mm: number) =>
      x > r.x0 - mm && x < r.x1 + mm && z > r.z0 - mm && z < r.z1 + mm;
    for (const [x, z] of this.people) if (hit(x, z, m)) return false;
    if (hit(4.2, 2.6, 0.5)) return false;
    if (o.stations !== false) for (const [x, z] of STATIONS) if (hit(x, z, 0.45)) return false;
    if (o.furniture !== false)
      for (const t of this.taken)
        if (r.x0 < t.x1 && r.x1 > t.x0 && r.z0 < t.z1 && r.z1 > t.z0) return false;
    return true;
  }
  /** Mark a footprint as used. */
  claim(r: Rect) {
    this.taken.push(r);
  }
  /** A footprint around a centre. */
  static rect(x: number, z: number, w: number, d: number, ry = 0): Rect {
    const turned = Math.abs(Math.sin(ry)) > 0.7;
    const hw = (turned ? d : w) / 2;
    const hd = (turned ? w : d) / 2;
    return { x0: x - hw, z0: z - hd, x1: x + hw, z1: z + hd };
  }
  /** Place it if it's clear (and claim it). */
  fits(x: number, z: number, w: number, d: number, ry = 0, o?: Parameters<Dresser['free']>[1]) {
    const r = Dresser.rect(x, z, w, d, ry);
    if (!this.free(r, o)) return false;
    this.claim(r);
    return true;
  }

  /** The highest a wall thing spanning x0..x1 may reach without covering the name board. */
  wallTop(x0: number, x1: number, top: number) {
    if (this.signX === null) return top;
    return x1 > this.signX - 1.9 && x0 < this.signX + 1.9 ? Math.min(top, 2.05) : top;
  }

  /** x, mirrored for this place when the layout is flipped. */
  mx(x: number) {
    return this.flip ? -x : x;
  }

  /**
   * A CC0 model at (x, y, z), turned ry, fitted to `fit` (../../three-kit/props.ts).
   * False when the models haven't arrived or the room is full (draw something cheaper).
   */
  glb(name: string, x: number, z: number, fit: Fit & { y?: number; ry?: number }): boolean {
    if (!propsNow('furniture')) return false;
    const { ry = 0, y = 0, ...f } = fit;
    const g = propFit('furniture', name, { ...f, ry: 0 });
    if (!g) return false;
    let cost = 0;
    g.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        const geo = m.geometry;
        cost += (geo.index ? geo.index.count : geo.attributes.position!.count) / 3;
      }
    });
    if (this.tris + cost > TRI_CAP) return false;
    this.tris += cost;
    g.position.set(x, y, z);
    g.rotation.y = ry;
    g.updateMatrixWorld(true);
    g.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const mt = m.material as THREE.Material;
      const key = `${m.geometry.uuid}|${mt.uuid}`;
      let it = this.inst.get(key);
      if (!it) {
        it = { geo: m.geometry, mat: mt, shadow: fit.castShadow ?? true, m: [] };
        this.inst.set(key, it);
      }
      it.m.push(m.matrixWorld.clone());
    });
    return true;
  }

  /** Whether the CC0 models are here. */
  get models() {
    return !!propsNow('furniture');
  }

  /**
   * A small box (stock, a book, a parcel) w × h × d, its bottom at y, turned
   * ry (and tipped rx/rz), in its own colour; `plain` drops the pack print.
   */
  bit(
    w: number,
    h: number,
    d: number,
    color: string | THREE.Color,
    x: number,
    y: number,
    z: number,
    o: { ry?: number; rx?: number; rz?: number; plain?: boolean } = {},
  ) {
    eu.set(o.rx ?? 0, o.ry ?? 0, o.rz ?? 0);
    q4.setFromEuler(eu);
    // The box's centre: its bottom at y (before tipping).
    const m = new THREE.Matrix4().compose(v3.set(x, y + h / 2, z), q4, one.clone().set(w, h, d));
    this.boxes.push({ m, c: new THREE.Color(color), tex: o.plain ? 'plain' : 'pack' });
    this.tris += 12;
  }

  /** A small cylinder (a can, a bottle, a roll of cloth): r, h, bottom at y. */
  can(
    r: number,
    h: number,
    color: string | THREE.Color,
    x: number,
    y: number,
    z: number,
    o: { rx?: number; rz?: number } = {},
  ) {
    eu.set(o.rx ?? 0, 0, o.rz ?? 0);
    q4.setFromEuler(eu);
    const c = new THREE.Vector3(0, h / 2, 0).applyQuaternion(q4);
    const m = new THREE.Matrix4().compose(
      v3.set(x + c.x, y + c.y, z + c.z),
      q4,
      one.clone().set(r, h, r),
    );
    this.cyls.push({ m, c: new THREE.Color(color) });
    this.tris += 20;
  }

  /** A small ball (fruit, a hard hat, a ball of wool): radius r, centred at y, squashed by sy. */
  ball(r: number, color: string | THREE.Color, x: number, y: number, z: number, sy = 1) {
    const m = new THREE.Matrix4().compose(
      v3.set(x, y, z),
      q4.identity(),
      one.clone().set(r, r * sy, r),
    );
    this.balls.push({ m, c: new THREE.Color(color) });
    this.tris += 48;
  }

  /** Shorthands into the merged kit. */
  box(w: number, h: number, d: number, c: string, x: number, y: number, z: number, o?: PartOpts) {
    this.kit.box(w, h, d, c, x, y, z, o);
  }
  cyl(rt: number, rb: number, h: number, c: string, x: number, y: number, z: number, o?: PartOpts) {
    this.kit.cyl(rt, rb, h, c, x, y, z, o);
  }

  /** A flat screen (its picture the room's pulsing slide) facing +z turned ry. */
  screenAt(w: number, h: number, x: number, y: number, z: number, ry = 0) {
    const g = new THREE.PlaneGeometry(w, h);
    this.kit.add(g, this.screen, x, y, z, { ry, noShadow: true });
  }

  /** Build everything into the room. */
  finish() {
    this.root.add(this.kit.build());
    for (const it of this.inst.values()) {
      if (it.m.length === 1) {
        const mesh = new THREE.Mesh(it.geo, it.mat);
        mesh.matrixAutoUpdate = false;
        mesh.matrix.copy(it.m[0]!);
        mesh.castShadow = it.shadow;
        mesh.receiveShadow = true;
        this.root.add(mesh);
        continue;
      }
      const im = new THREE.InstancedMesh(it.geo, it.mat, it.m.length);
      it.m.forEach((m, i) => im.setMatrixAt(i, m));
      im.castShadow = it.shadow;
      im.receiveShadow = true;
      im.computeBoundingSphere();
      this.root.add(im);
    }
    this.inst.clear();
    const packs = this.boxes.filter((b) => b.tex === 'pack');
    const plain = this.boxes.filter((b) => b.tex === 'plain');
    const many = (
      geo: THREE.BufferGeometry,
      material: THREE.Material,
      list: { m: THREE.Matrix4; c: THREE.Color }[],
    ) => {
      if (!list.length) return;
      const im = new THREE.InstancedMesh(geo, material, list.length);
      list.forEach((b, i) => {
        im.setMatrixAt(i, b.m);
        im.setColorAt(i, b.c);
      });
      im.castShadow = list.length < 400;
      im.receiveShadow = true;
      im.computeBoundingSphere();
      this.root.add(im);
    };
    many(new THREE.BoxGeometry(1, 1, 1), mat('#ffffff', { map: packTexture(), rough: 0.6 }), packs);
    many(new THREE.BoxGeometry(1, 1, 1), mat('#ffffff', { rough: 0.7 }), plain);
    many(
      new THREE.CylinderGeometry(1, 1, 1, 10),
      mat('#ffffff', { map: canTexture(), rough: 0.4, metal: 0.1 }),
      this.cyls,
    );
    many(new THREE.SphereGeometry(1, 8, 6), mat('#ffffff', { rough: 0.55 }), this.balls);
    this.boxes = [];
    this.cyls = [];
    this.balls = [];
  }
}

/** A colour from a palette, a little lighter or darker at random. */
export function jitter(d: Dresser, hex: string, amt = 0.08): THREE.Color {
  const c = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  c.setHSL(hsl.h, hsl.s, Math.max(0, Math.min(1, hsl.l + (d.rng() - 0.5) * 2 * amt)));
  return c;
}

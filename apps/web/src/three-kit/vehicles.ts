/**
 * The CC0 cars (Quaternius "Cars", public/models/vehicles/cars.glb, see
 * public/models/LICENSES.md), baked from FBX to one GLB: each model is a
 * node (NormalCar1, NormalCar2, SUV, SportsCar, SportsCar2, Taxi, Cop) with
 * a Body and its wheels (WheelFL, WheelFR, WheelsBack), metres, Y up, the
 * front towards +Z, standing on y = 0. The body colour is the `Paint`
 * material.
 *
 * - `carModel(id, paint)`: one car to drive or park (its own paint, wheels
 *   that spin with `spinWheels`).
 * - `ModelFleet`: traffic drawn instanced, one draw call a model (the parts
 *   merged, vertex-coloured, the instance colour on the paint only). It
 *   stands in for the low-poly instanced boxes (same calls) and swaps them
 *   for the models once they've arrived.
 *
 * Like the people (./humans/kit.ts) nothing waits on the download: until it
 * arrives, or if it fails, the game's own low-poly cars are drawn.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { humansEnabled, emitKitReady } from './humans/kit';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { propsNow } from './props';
import { bakeSeated, seatedUnavailable, seatHeight, type Seat, type SeatLook } from './seated';

export type CarModel =
  'NormalCar1' | 'NormalCar2' | 'SUV' | 'SportsCar' | 'SportsCar2' | 'Taxi' | 'Cop';

/** The game's car models (CAR_MODEL_IDS) as the kit's. */
export const CAR_FOR_MODEL: Record<string, CarModel> = {
  hatchback: 'NormalCar2',
  'ride-hail-sedan': 'NormalCar1',
  'city-suv': 'SUV',
  electric: 'SportsCar2',
  luxury: 'SportsCar',
};
/** Everyday traffic (a taxi is the Taxi). */
export const TRAFFIC_MODELS: readonly CarModel[] = [
  'NormalCar1',
  'NormalCar2',
  'SUV',
  'SportsCar2',
  'NormalCar1',
  'SportsCar',
];

interface CarKit {
  models: Map<string, THREE.Group>;
  merged: Map<string, { geometry: THREE.BufferGeometry; length: number }>;
}
let kit: CarKit | null = null;
let loading: Promise<CarKit | null> | null = null;
let failed = false;

const base = (): string => {
  try {
    return (import.meta.env?.BASE_URL as string | undefined) ?? '/';
  } catch {
    return '/';
  }
};

/** The cars, if they've arrived (and starts fetching them if not). */
export function carsNow(): CarKit | null {
  if (kit) return kit;
  if (!failed && !loading && humansEnabled()) void loadCars();
  return null;
}

export function loadCars(): Promise<CarKit | null> {
  const loader = new GLTFLoader();
  loading ??= Promise.all([
    loader.loadAsync(`${base()}models/vehicles/cars.glb`),
    // The traffic's lighter copy (about 900 triangles a car); the full cars if it fails.
    loader.loadAsync(`${base()}models/vehicles/cars-lod.glb`).catch(() => null),
  ])
    .then(([g, lod]) => {
      const models = new Map<string, THREE.Group>();
      const merged = new Map<string, { geometry: THREE.BufferGeometry; length: number }>();
      const root = g.scene.getObjectByName('Cars') ?? g.scene;
      const lodRoot = lod ? (lod.scene.getObjectByName('Cars') ?? lod.scene) : null;
      for (const car of [...root.children]) {
        car.position.set(0, 0, 0);
        car.updateMatrixWorld(true);
        car.traverse((o) => {
          const m = o as THREE.Mesh;
          if (m.isMesh) {
            m.geometry.userData.shared = true;
            const mt = m.material as THREE.MeshStandardMaterial;
            mt.userData.shared = true;
          }
        });
        models.set(car.name, car as THREE.Group);
        const light = lodRoot?.getObjectByName(car.name);
        if (light) {
          light.position.set(0, 0, 0);
          light.updateMatrixWorld(true);
        }
        merged.set(car.name, mergeCar(light ?? car));
      }
      kit = { models, merged };
      emitKitReady();
      return kit;
    })
    .catch(() => {
      failed = true;
      return null;
    });
  return loading;
}

/** A car's parts as one geometry: the material's colour per vertex, `paint` 1 on the body colour. */
export function mergeCar(car: THREE.Object3D) {
  const parts: THREE.BufferGeometry[] = [];
  const inv = car.matrixWorld.clone().invert();
  const v = new THREE.Vector3();
  car.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const src = m.geometry;
    const mt = m.material as THREE.MeshStandardMaterial;
    const g = new THREE.BufferGeometry();
    const pos = src.getAttribute('position');
    const nor = src.getAttribute('normal');
    const n = pos.count;
    const p = new Float32Array(n * 3);
    const nn = new Float32Array(n * 3);
    const c = new Float32Array(n * 3);
    const paint = new Float32Array(n);
    const mw = new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld);
    const nm = new THREE.Matrix3().getNormalMatrix(mw);
    // The body colour takes the instance's colour; Paint2 (a bus's lower half) a shade darker.
    const isPaint = mt.name === 'Paint' || mt.name === 'Paint2';
    const col = isPaint
      ? new THREE.Color(1, 1, 1).multiplyScalar(mt.name === 'Paint2' ? 0.78 : 1)
      : mt.color;
    for (let i = 0; i < n; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(mw);
      p.set([v.x, v.y, v.z], i * 3);
      if (nor) {
        v.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize();
        nn.set([v.x, v.y, v.z], i * 3);
      }
      c.set([col.r, col.g, col.b], i * 3);
      paint[i] = isPaint ? 1 : 0;
    }
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nn, 3));
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    g.setAttribute('paint', new THREE.BufferAttribute(paint, 1));
    const idx = src.getIndex();
    g.setIndex(idx ? Array.from(idx.array as ArrayLike<number>) : [...Array(n).keys()]);
    // The light copy has no normals: flat-shaded, as the cars are.
    if (nor) parts.push(g);
    else {
      const flat = g.toNonIndexed();
      flat.computeVertexNormals();
      flat.setIndex([...Array(flat.getAttribute('position').count).keys()]);
      parts.push(flat);
    }
  });
  const geometry = mergeGeometries(parts, false)!;
  geometry.computeBoundingBox();
  const b = geometry.boundingBox!;
  geometry.userData.shared = true;
  return { geometry, length: b.max.z - b.min.z };
}

/** The traffic material: vertex colours, the instance's colour on the paint only. */
function fleetMaterial() {
  const m = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.45,
    metalness: 0.25,
  });
  m.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float paint;')
      .replace(
        '#include <color_vertex>',
        `#ifdef USE_COLOR
  vColor = vec3(1.0) * color.xyz;
#endif
#ifdef USE_INSTANCING_COLOR
  vColor.xyz = mix(vColor.xyz, vColor.xyz * instanceColor.xyz, paint);
#endif`,
      );
  };
  m.customProgramCacheKey = () => 'fleet-paint';
  return m;
}

/** One car, painted (null until the cars have arrived). Front +Z, `length` metres long. */
export function carModel(model: CarModel, paint: string, length?: number): THREE.Group | null {
  const k = carsNow();
  const src = k?.models.get(model);
  if (!src) return null;
  const g = src.clone(true);
  const paintMat = new THREE.MeshStandardMaterial({
    color: paint,
    roughness: 0.32,
    metalness: 0.35,
  });
  const wheels: THREE.Object3D[] = [];
  g.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.castShadow = true;
      if ((m.material as THREE.Material).name === 'Paint') m.material = paintMat;
    }
  });
  // Each wheel on a pivot at its centre (spun by spinWheels).
  for (const w of [...g.children]) {
    if (!/^Wheel/.test(w.name)) continue;
    const box = new THREE.Box3().setFromObject(w);
    const c = box.getCenter(new THREE.Vector3());
    const pivot = new THREE.Group();
    pivot.name = `${w.name}Pivot`;
    pivot.position.copy(c);
    g.add(pivot);
    pivot.attach(w);
    wheels.push(pivot);
    pivot.userData.radius = Math.max(0.2, (box.max.y - box.min.y) / 2);
  }
  g.userData.wheels = wheels;
  g.userData.paint = paintMat;
  if (length) {
    const len = k!.merged.get(model)!.length;
    g.scale.setScalar(length / len);
  }
  return g;
}

/** The bus to ride in, painted, stretched to width × height × length (front +Z); null until it arrives. */
export function busModel(paint: string, w: number, h: number, len: number): THREE.Group | null {
  const src = propsNow('transport')?.models.get('Bus');
  if (!src) return null;
  const g = new THREE.Group();
  const inner = src.group.clone(true);
  inner.scale.set(w / src.size.x, h / src.size.y, len / src.size.z);
  const top = new THREE.MeshStandardMaterial({ color: paint, roughness: 0.4, metalness: 0.2 });
  const low = new THREE.MeshStandardMaterial({
    color: new THREE.Color(paint).multiplyScalar(0.78),
    roughness: 0.45,
    metalness: 0.2,
  });
  inner.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.castShadow = true;
    const n = (m.material as THREE.Material).name;
    if (n === 'Paint') m.material = top;
    else if (n === 'Paint2') m.material = low;
  });
  g.add(inner);
  return g;
}

/** Roll a car's wheels for `metres` travelled. */
export function spinWheels(car: THREE.Object3D, metres: number) {
  const wheels = car.userData.wheels as THREE.Object3D[] | undefined;
  if (!wheels) return;
  const s = car.scale.x || 1;
  for (const w of wheels) w.rotation.x += metres / ((w.userData.radius as number) * s);
}

/** Anything drawn instanced the way the traffic is (the low-poly boxes, or a ModelFleet). */
export interface Instanced {
  setMatrixAt(i: number, m: THREE.Matrix4): void;
  getMatrixAt(i: number, m: THREE.Matrix4): void;
  setColorAt(i: number, c: THREE.Color): void;
  instanceMatrix: { needsUpdate: boolean };
}

/**
 * Traffic: `count` cars, car i drawn as model `modelOf(i)`. Before the cars
 * arrive it draws the low-poly boxes it was given (front +X, as they are);
 * after, one InstancedMesh a model, each as long as the boxes.
 */
export class ModelFleet implements Instanced {
  readonly group = new THREE.Group();
  private mats: Float32Array;
  private cols: Float32Array;
  private meshes: THREE.InstancedMesh[] | null = null;
  private slot: Int32Array;
  private owner: Int32Array;
  private dirty = false;
  constructor(
    readonly count: number,
    private boxes: THREE.InstancedMesh[],
    private modelOf: (i: number) => FleetModel,
    private opts: {
      length: number;
      castShadow: boolean;
      /** Stretch to width, height and length (a bus) instead of a uniform scale to `length`. */
      dims?: [number, number, number];
      /** A model's own size, where the fleet mixes models of different sizes (a minibus among buses). */
      sizes?: Partial<Record<FleetModel, { length: number; dims?: [number, number, number] }>>;
    },
  ) {
    this.mats = new Float32Array(Math.max(1, count) * 16);
    this.cols = new Float32Array(Math.max(1, count) * 3).fill(1);
    this.slot = new Int32Array(Math.max(1, count));
    this.owner = new Int32Array(Math.max(1, count));
    for (const b of boxes) this.group.add(b);
  }
  setMatrixAt(i: number, m: THREE.Matrix4) {
    m.toArray(this.mats, i * 16);
    if (this.meshes) this.meshes[this.owner[i]!]!.setMatrixAt(this.slot[i]!, m);
    else for (const b of this.boxes) b.setMatrixAt(i, m);
  }
  getMatrixAt(i: number, m: THREE.Matrix4) {
    m.fromArray(this.mats, i * 16);
  }
  setColorAt(i: number, c: THREE.Color) {
    c.toArray(this.cols, i * 3);
    if (this.meshes) this.meshes[this.owner[i]!]!.setColorAt(this.slot[i]!, c);
    else this.boxes[0]?.setColorAt(i, c);
  }
  readonly instanceMatrix = {
    set needsUpdate(v: boolean) {
      void v;
    },
    get needsUpdate() {
      return false;
    },
  };
  /** After the frame's matrices are set: upload them (and take the models once they're here). */
  flush() {
    if (!this.meshes) this.upgrade();
    for (const m of this.meshes ?? this.boxes) m.instanceMatrix.needsUpdate = true;
    if (this.dirty) {
      for (const m of this.meshes ?? []) if (m.instanceColor) m.instanceColor.needsUpdate = true;
      this.dirty = false;
    }
  }
  private upgrade() {
    if (this.count === 0) return;
    const names = [...new Set(Array.from({ length: this.count }, (_, i) => this.modelOf(i)))];
    const srcs = names.map(mergedOf);
    if (srcs.some((x) => !x)) return;
    const counts = names.map(() => 0);
    for (let i = 0; i < this.count; i++) {
      const o = names.indexOf(this.modelOf(i));
      this.owner[i] = o;
      this.slot[i] = counts[o]!++;
    }
    const mat = fleetMaterial();
    const meshes = names.map((n, j) => {
      const src = srcs[j]!;
      // As long as the boxes, turned to face +X like them.
      const g = src.geometry.clone();
      g.userData.shared = false;
      g.computeBoundingBox();
      const b = g.boundingBox!;
      const own = this.opts.sizes?.[n];
      const dims = own ? own.dims : this.opts.dims;
      if (dims)
        g.scale(dims[0] / (b.max.x - b.min.x), dims[1] / (b.max.y - b.min.y), dims[2] / src.length);
      else {
        const s = (own?.length ?? this.opts.length) / src.length;
        g.scale(s, s, s);
      }
      g.rotateY(Math.PI / 2);
      const m = new THREE.InstancedMesh(g, mat, Math.max(1, counts[j]!));
      m.count = counts[j]!;
      m.frustumCulled = false;
      m.castShadow = this.opts.castShadow;
      m.name = `fleet:${n}`;
      return m;
    });
    const _m = new THREE.Matrix4();
    const _c = new THREE.Color();
    for (let i = 0; i < this.count; i++) {
      const m = meshes[this.owner[i]!]!;
      m.setMatrixAt(this.slot[i]!, _m.fromArray(this.mats, i * 16));
      m.setColorAt(this.slot[i]!, _c.fromArray(this.cols, i * 3));
    }
    for (const b of this.boxes) b.removeFromParent();
    for (const m of meshes) this.group.add(m);
    this.meshes = meshes;
    this.dirty = true;
  }
}

/**
 * What a fleet can draw: a car from the kit, the bus (Public Transport), or
 * one built in code: an okada (with its rider, or a passenger too), a keke
 * (its driver at the bars) or a danfo-style minibus.
 */
export type FleetModel = CarModel | 'Bus' | 'Moto' | 'MotoPax' | 'Keke' | 'Danfo';

const extraMerged = new Map<string, { geometry: THREE.BufferGeometry; length: number }>();

/** A fleet model's merged geometry (null until its file, or its riders, have arrived). */
export function mergedOf(
  name: FleetModel,
): { geometry: THREE.BufferGeometry; length: number } | null {
  const hit = extraMerged.get(name);
  if (hit) return hit;
  let m: { geometry: THREE.BufferGeometry; length: number } | null = null;
  if (name === 'Danfo') {
    coarse = true;
    m = finish(danfoParts(new Parts(null)), 4.7);
    coarse = false;
  } else if (name === 'Moto' || name === 'MotoPax' || name === 'Keke') m = withRiders(name);
  else if (name === 'Bus') {
    const bus = propsNow('transport')?.models.get('Bus');
    if (bus) m = mergeCar(bus.group);
  } else return carsNow()?.merged.get(name) ?? null;
  if (m) extraMerged.set(name, m);
  return m;
}

/**
 * The code-built vehicles (no riders), drawn before the riders arrive (and
 * for good without them): front +X like the fleet's boxes, one draw call.
 */
export function codeFleetMesh(name: 'Moto' | 'Keke' | 'Danfo', count: number) {
  const p = new Parts(null);
  coarse = true;
  if (name === 'Moto') motoParts(p);
  else if (name === 'Keke') kekeParts(p, KEKE_CANOPY);
  else danfoParts(p);
  coarse = false;
  const geo = p.merged().rotateY(Math.PI / 2);
  const m = new THREE.InstancedMesh(geo, fleetMaterial(), Math.max(1, count));
  m.count = count;
  return m;
}

// ---------------------------------------------------------------------------
// Vehicles built in code: parts (boxes, rounded boxes, cylinders, tori),
// each coloured per vertex, `paint` marking the body colour.

type Colour = string | 'paint' | 'accent';

/** The parts of a vehicle, by tag: 'body', 'glass', or a wheel ('wheel:<n>') or crank to turn. */
class Parts {
  private list: { tag: string; geo: THREE.BufferGeometry }[] = [];
  /** Where each turning part's centre is (its pivot). */
  readonly pivots = new Map<string, THREE.Vector3>();
  /** paint/accent: colours baked in (a model to ride), or null (a fleet: paint marked, accent kept). */
  constructor(
    private paint: string | null,
    private accent = '#111827',
  ) {}
  add(
    g: THREE.BufferGeometry,
    colour: Colour,
    x: number,
    y: number,
    z: number,
    r?: [number, number, number],
    tag = 'body',
  ) {
    const geo = g.index ? g.toNonIndexed() : g;
    if (r) geo.rotateX(r[0]).rotateY(r[1]).rotateZ(r[2]);
    geo.translate(x, y, z);
    if (geo.getAttribute('uv')) geo.deleteAttribute('uv');
    const n = geo.getAttribute('position').count;
    const painted = colour === 'paint';
    const c = new THREE.Color(
      painted ? (this.paint ?? '#ffffff') : colour === 'accent' ? this.accent : colour,
    );
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute(
      'paint',
      new THREE.BufferAttribute(new Float32Array(n).fill(painted && !this.paint ? 1 : 0), 1),
    );
    geo.setIndex([...Array(n).keys()]);
    this.list.push({ tag, geo });
    return this;
  }
  /** A turning part around its own centre (x, y, z): a wheel, a crank. */
  turning(tag: string, x: number, y: number, z: number) {
    this.pivots.set(tag, new THREE.Vector3(x, y, z));
  }
  /** Add a geometry already in place (a baked rider). */
  raw(geo: THREE.BufferGeometry, tag = 'body') {
    this.list.push({ tag, geo });
  }
  merged(tags?: (t: string) => boolean) {
    const gs = this.list.filter((p) => !tags || tags(p.tag)).map((p) => p.geo);
    const g = mergeGeometries(gs, false)!;
    g.userData.shared = true;
    return g;
  }
  tags() {
    return [...new Set(this.list.map((p) => p.tag))];
  }
}

const finish = (p: Parts, length: number) => ({ geometry: p.merged(), length });

/**
 * Traffic is drawn many times over (a phone, or a software GPU, draws every
 * triangle of every okada): it's built coarser than the vehicle you ride.
 */
let coarse = false;
const rbox = (w: number, h: number, d: number, r = 0.06) =>
  coarse
    ? new THREE.BoxGeometry(w, h, d)
    : new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3));
const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const cyl = (r0: number, r1: number, h: number, seg = 12) =>
  new THREE.CylinderGeometry(r0, r1, h, coarse ? Math.max(5, Math.round(seg / 2)) : seg);
const SIDE: [number, number, number] = [0, 0, Math.PI / 2];
const ALONG: [number, number, number] = [Math.PI / 2, 0, 0];

/** A tube from a to b (radius r). */
function tube(p: Parts, a: number[], b: number[], r: number, colour: Colour, tag = 'body') {
  const A = new THREE.Vector3(a[0], a[1], a[2]);
  const B = new THREE.Vector3(b[0], b[1], b[2]);
  const len = A.distanceTo(B);
  const g = cyl(r, r, len, 8);
  const q = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    B.clone().sub(A).normalize(),
  );
  g.applyQuaternion(q);
  const m = A.add(B).multiplyScalar(0.5);
  p.add(g, colour, m.x, m.y, m.z, undefined, tag);
}

/**
 * A wheel turning on X at (x, y, z): tyre, rim and hub (and spokes, thin
 * ones, for a bicycle's or a motorbike's), as the turning part `tag`.
 */
function wheel(
  p: Parts,
  tag: string,
  x: number,
  y: number,
  z: number,
  r: number,
  o: { tyre?: number; width?: number; spokes?: number; hub?: string; rim?: string } = {},
) {
  const t = o.tyre ?? r * 0.22;
  const w = o.width ?? t * 1.6;
  p.turning(tag, x, y, z);
  const YZ: [number, number, number] = [0, Math.PI / 2, 0];
  const tyre = new THREE.TorusGeometry(r - t, t, coarse ? 4 : 6, coarse ? 12 : 20).scale(
    1,
    1,
    w / (2 * t),
  );
  p.add(tyre, '#151515', x, y, z, YZ, tag);
  const rimR = r - t * 1.7;
  p.add(
    new THREE.TorusGeometry(rimR, t * 0.35, coarse ? 3 : 4, coarse ? 10 : 18),
    o.rim ?? '#9ca3af',
    x,
    y,
    z,
    YZ,
    tag,
  );
  p.add(cyl(r * 0.18, r * 0.18, w * 1.1, 10), o.hub ?? '#6b7280', x, y, z, SIDE, tag);
  const n = coarse ? Math.min(4, o.spokes ?? 0) : (o.spokes ?? 0);
  if (n)
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI;
      p.add(box(0.008, rimR * 2, 0.008), '#c0c4c9', x, y, z, [a, 0, 0], tag);
    }
  else p.add(cyl(rimR * 0.92, rimR * 0.92, w * 0.5, 14), o.hub ?? '#4b5563', x, y, z, SIDE, tag);
}

/** An okada (a 125 cc commuter bike, front +Z, about 2 m): the tank and side panels take the paint. */
function motoParts(p: Parts) {
  wheel(p, 'wheel:0', 0, 0.3, 0.68, 0.3, { spokes: 10, tyre: 0.055, width: 0.1 });
  wheel(p, 'wheel:1', 0, 0.3, -0.66, 0.3, { spokes: 10, tyre: 0.06, width: 0.12 });
  // The fork and the headlamp.
  for (const sx of [-0.075, 0.075]) tube(p, [sx, 0.3, 0.68], [sx, 0.98, 0.5], 0.022, '#c7cbd1');
  p.add(new THREE.TorusGeometry(0.33, 0.035, 4, 10, Math.PI * 0.55), 'paint', 0, 0.3, 0.68, [
    0,
    Math.PI / 2,
    Math.PI * 0.3,
  ]);
  p.add(cyl(0.085, 0.07, 0.12, 12), '#202226', 0, 0.98, 0.58, ALONG);
  p.add(cyl(0.07, 0.07, 0.02, 12), '#fff3c4', 0, 0.98, 0.645, ALONG);
  p.add(rbox(0.22, 0.16, 0.12, 0.04), 'paint', 0, 1.05, 0.5);
  // The bars, grips and mirrors.
  tube(p, [-0.36, 1.08, 0.46], [0.36, 1.08, 0.46], 0.016, '#c7cbd1');
  for (const sx of [-1, 1]) {
    p.add(cyl(0.024, 0.024, 0.12, 8), '#111111', sx * 0.36, 1.08, 0.46, SIDE);
    tube(p, [sx * 0.24, 1.08, 0.46], [sx * 0.28, 1.3, 0.44], 0.008, '#111111');
    p.add(cyl(0.05, 0.05, 0.015, 10), '#1f2937', sx * 0.28, 1.31, 0.44, ALONG);
  }
  // Frame, tank, seat, side panels, engine and exhaust.
  tube(p, [0, 0.98, 0.48], [0, 0.48, 0.12], 0.035, '#1f2328');
  tube(p, [0, 0.9, 0.42], [0, 0.82, -0.62], 0.03, '#1f2328');
  p.add(rbox(0.3, 0.2, 0.46, 0.08), 'paint', 0, 0.88, 0.22, [0.1, 0, 0]);
  p.add(rbox(0.29, 0.1, 0.72, 0.045), '#141414', 0, 0.9, -0.27);
  p.add(rbox(0.28, 0.2, 0.34, 0.04), 'paint', 0, 0.72, -0.2);
  p.add(rbox(0.24, 0.28, 0.3, 0.05), '#6b7078', 0, 0.45, 0.06);
  for (let i = 0; i < 4; i++) p.add(box(0.26, 0.012, 0.14), '#9aa0a8', 0, 0.62 + i * 0.03, 0.14);
  tube(p, [0.14, 0.38, 0.2], [0.15, 0.36, -0.15], 0.03, '#b8bcc2');
  tube(p, [0.15, 0.36, -0.15], [0.16, 0.48, -0.72], 0.042, '#c9cdd2');
  // The back: mudguard, rack, tail lamp, the chain guard and the pegs.
  p.add(rbox(0.16, 0.05, 0.42, 0.02), '#151515', 0, 0.72, -0.72, [-0.25, 0, 0]);
  p.add(box(0.3, 0.025, 0.32), '#c7cbd1', 0, 0.86, -0.72);
  p.add(box(0.14, 0.06, 0.04), '#ef4444', 0, 0.8, -0.92);
  p.add(box(0.03, 0.08, 0.62), '#2a2d33', -0.11, 0.36, -0.33);
  for (const sx of [-1, 1])
    p.add(cyl(0.015, 0.015, 0.14, 6), '#111111', sx * 0.17, 0.38, -0.05, SIDE);
  return p;
}

/** A keke's canopy: black, as most are. */
const KEKE_CANOPY = '#1a1d21';

/** A keke (a Bajaj-style tricycle taxi, front +Z, 2.7 m): the body takes the paint, the stripe the accent. */
function kekeParts(p: Parts, canopy: string) {
  wheel(p, 'wheel:0', 0, 0.24, 1.02, 0.24, { tyre: 0.06 });
  wheel(p, 'wheel:1', 0.6, 0.24, -0.8, 0.24, { tyre: 0.06 });
  wheel(p, 'wheel:2', -0.6, 0.24, -0.8, 0.24, { tyre: 0.06 });
  // The nose: a rounded cowl over the front wheel, its lamp, the windscreen.
  p.add(rbox(0.78, 0.72, 0.62, 0.16), 'paint', 0, 0.76, 0.98);
  p.add(rbox(0.82, 0.08, 0.66, 0.03), 'accent', 0, 0.62, 0.98);
  p.add(cyl(0.085, 0.085, 0.05, 14), '#fff3c4', 0, 0.86, 1.3, ALONG);
  p.add(cyl(0.1, 0.1, 0.03, 14), '#c7cbd1', 0, 0.86, 1.285, ALONG);
  p.add(box(0.06, 0.04, 0.03), '#f59e0b', 0.3, 0.98, 1.29);
  p.add(box(0.06, 0.04, 0.03), '#f59e0b', -0.3, 0.98, 1.29);
  p.add(box(1.06, 0.62, 0.025), '#9fb4c4', 0, 1.42, 1.12, [-0.22, 0, 0], 'glass');
  p.add(box(1.12, 0.05, 0.05), canopy, 0, 1.12, 1.18);
  // Floor, the body round the back seat (its stripe), the bumper.
  p.add(box(1.2, 0.1, 2.0), '#2a2d33', 0, 0.36, -0.15);
  p.add(rbox(1.32, 0.6, 1.2, 0.08), 'paint', 0, 0.7, -0.72);
  p.add(rbox(1.34, 0.09, 1.22, 0.03), 'accent', 0, 0.84, -0.72);
  p.add(rbox(1.3, 0.34, 0.7, 0.06), 'paint', 0, 0.55, 0.32);
  p.add(box(1.36, 0.08, 0.08), '#2a2d33', 0, 0.42, -1.33);
  for (const sx of [-0.5, 0.5]) p.add(box(0.12, 0.08, 0.03), '#ef4444', sx, 0.78, -1.33);
  // Seats: the driver's in front, the bench behind with its back.
  p.add(rbox(0.46, 0.12, 0.4, 0.04), '#2b2b2b', 0, 0.8, 0.24);
  p.add(rbox(1.1, 0.14, 0.5, 0.05), '#3b2f2a', 0, 0.98, -0.62);
  p.add(rbox(1.1, 0.5, 0.1, 0.04), '#3b2f2a', 0, 1.25, -0.95);
  // The bars in front of the driver.
  tube(p, [-0.3, 1.12, 0.66], [0.3, 1.12, 0.66], 0.016, '#c7cbd1');
  tube(p, [0, 1.12, 0.66], [0, 0.95, 0.8], 0.025, '#2a2d33');
  // The canopy: a roof on four posts, closed at the back.
  p.add(rbox(1.42, 0.07, 2.25, 0.03), canopy, 0, 1.92, -0.1);
  p.add(rbox(1.38, 0.86, 0.04, 0.02), canopy, 0, 1.47, -1.2);
  for (const sx of [0.66, -0.66]) {
    tube(p, [sx, 1.12, 1.15], [sx * 1.02, 1.9, 1.0], 0.022, canopy);
    tube(p, [sx, 0.95, -1.15], [sx * 1.02, 1.9, -1.15], 0.022, canopy);
  }
  // Mirrors.
  for (const sx of [-1, 1]) {
    tube(p, [sx * 0.5, 1.15, 1.08], [sx * 0.62, 1.3, 1.08], 0.01, '#111111');
    p.add(cyl(0.05, 0.05, 0.015, 10), '#1f2937', sx * 0.62, 1.31, 1.08, ALONG);
  }
  return p;
}

/**
 * A danfo-style minibus (a boxy van, front +Z, 4.7 m): the body takes the
 * paint, with the black stripes Lagos's danfos wear, the windows in tag 'glass'.
 */
function danfoParts(p: Parts) {
  const L = 4.6;
  const W = 1.9;
  wheel(p, 'wheel:0', 0.82, 0.34, 1.5, 0.34, { tyre: 0.09 });
  wheel(p, 'wheel:1', -0.82, 0.34, 1.5, 0.34, { tyre: 0.09 });
  wheel(p, 'wheel:2', 0.82, 0.34, -1.45, 0.34, { tyre: 0.09 });
  wheel(p, 'wheel:3', -0.82, 0.34, -1.45, 0.34, { tyre: 0.09 });
  // The body: the lower half, the window band above, a rounded roof.
  p.add(rbox(W, 0.98, L, 0.12), 'paint', 0, 0.86, 0);
  p.add(rbox(W - 0.06, 0.7, L - 0.12, 0.14), 'paint', 0, 1.66, -0.02);
  p.add(rbox(W - 0.2, 0.08, L - 0.6, 0.04), 'paint', 0, 2.04, -0.1);
  // Side windows (glass), the pillars between them.
  for (const sx of [-1, 1]) {
    p.add(box(0.02, 0.5, 3.3), '#1e2a33', sx * (W / 2 - 0.02), 1.66, -0.35, undefined, 'glass');
    for (const z of [-1.95, -1.15, -0.35, 0.45, 1.25])
      p.add(box(0.03, 0.52, 0.09), 'paint', sx * (W / 2 - 0.015), 1.66, z);
    // The stripes: one under the windows, one low down.
    p.add(box(0.012, 0.08, L - 0.1), '#111111', sx * (W / 2 + 0.003), 1.33, 0);
    p.add(box(0.012, 0.08, L - 0.1), '#111111', sx * (W / 2 + 0.003), 0.72, 0);
  }
  // The open sliding door on the kerb side (the conductor's), and its step.
  p.add(box(0.03, 1.3, 0.95), '#121417', -W / 2 - 0.004, 1.2, 0.6);
  p.add(box(0.2, 0.05, 0.9), '#2a2d33', -W / 2 + 0.06, 0.4, 0.6);
  // Front: windscreen, the flat face with its round lamps, grille and bumper.
  p.add(box(W - 0.22, 0.62, 0.03), '#1e2a33', 0, 1.66, L / 2 - 0.05, [-0.12, 0, 0], 'glass');
  p.add(box(W - 0.3, 0.06, 0.05), '#111111', 0, 0.98, L / 2 + 0.01);
  for (const sx of [-1, 1]) {
    p.add(cyl(0.11, 0.11, 0.05, 14), '#fff3c4', sx * 0.66, 0.9, L / 2 + 0.01, ALONG);
    p.add(cyl(0.13, 0.13, 0.03, 14), '#c7cbd1', sx * 0.66, 0.9, L / 2 - 0.005, ALONG);
    p.add(box(0.1, 0.06, 0.03), '#f59e0b', sx * 0.66, 0.74, L / 2 + 0.01);
    p.add(box(0.1, 0.25, 0.05), '#111111', sx * 1.0, 1.55, 1.95);
    p.add(box(0.06, 0.2, 0.03), '#ef4444', sx * 0.78, 0.92, -L / 2 - 0.005);
  }
  p.add(rbox(W + 0.04, 0.16, 0.14, 0.04), '#1b1d21', 0, 0.48, L / 2 + 0.04);
  p.add(rbox(W + 0.04, 0.16, 0.14, 0.04), '#1b1d21', 0, 0.48, -L / 2 - 0.04);
  // Back: the rear window and a plate.
  p.add(box(W - 0.4, 0.46, 0.03), '#1e2a33', 0, 1.68, -L / 2 + 0.03, undefined, 'glass');
  p.add(box(0.5, 0.14, 0.02), '#f5f5f4', 0, 0.72, -L / 2 - 0.01);
  // A roof rack (loads ride on top).
  for (const z of [-1.3, 0.1]) p.add(box(W - 0.3, 0.04, 0.05), '#2a2d33', 0, 2.12, z);
  for (const sx of [-1, 1]) p.add(box(0.04, 0.05, 1.5), '#2a2d33', sx * (W / 2 - 0.16), 2.13, -0.6);
  return p;
}

/** A bicycle (front +Z, 1.75 m), its frame in the paint; the cranks turn (tag 'crank'). */
function bikeParts(p: Parts) {
  const r = 0.34;
  wheel(p, 'wheel:0', 0, r, 0.54, r, { tyre: 0.025, width: 0.04, spokes: 12, hub: '#9ca3af' });
  wheel(p, 'wheel:1', 0, r, -0.5, r, { tyre: 0.025, width: 0.04, spokes: 12, hub: '#9ca3af' });
  const bb = [0, 0.3, -0.02];
  const seat = [0, 0.86, -0.18];
  const head = [0, 0.88, 0.42];
  const headLow = [0, 0.74, 0.46];
  tube(p, bb, seat, 0.017, 'paint');
  tube(p, seat, head, 0.016, 'paint');
  tube(p, bb, headLow, 0.019, 'paint');
  tube(p, head, headLow, 0.02, 'paint');
  for (const sx of [-0.05, 0.05]) {
    tube(p, [sx, bb[1]!, bb[2]!], [sx, r, -0.5], 0.01, 'paint');
    tube(p, [sx * 0.6, seat[1]!, seat[2]!], [sx, r, -0.5], 0.009, 'paint');
    tube(p, [sx * 0.5, headLow[1]!, headLow[2]!], [sx, r, 0.54], 0.011, '#c7cbd1');
  }
  tube(p, seat, [0, 0.98, -0.2], 0.012, '#c7cbd1');
  p.add(rbox(0.13, 0.05, 0.26, 0.02), '#151515', 0, 1.0, -0.2);
  tube(p, head, [0, 1.02, 0.4], 0.014, '#c7cbd1');
  tube(p, [-0.26, 1.02, 0.36], [0.26, 1.02, 0.36], 0.012, '#c7cbd1');
  for (const sx of [-1, 1])
    p.add(cyl(0.018, 0.018, 0.09, 8), '#111111', sx * 0.26, 1.02, 0.36, SIDE);
  // Mudguard and a lamp.
  p.add(new THREE.TorusGeometry(r + 0.03, 0.012, 3, 10, Math.PI * 0.5), '#2a2d33', 0, r, -0.5, [
    0,
    Math.PI / 2,
    Math.PI * 0.45,
  ]);
  p.add(cyl(0.03, 0.025, 0.05, 8), '#fff3c4', 0, 0.93, 0.47, ALONG);
  // The chainring and cranks (turning), the pedals on them.
  p.turning('crank', bb[0]!, bb[1]!, bb[2]!);
  p.add(cyl(0.09, 0.09, 0.01, 16), '#9ca3af', 0.06, bb[1]!, bb[2]!, SIDE, 'crank');
  for (const s of [-1, 1]) {
    p.add(
      box(0.015, 0.17, 0.025),
      '#9ca3af',
      s * 0.08,
      bb[1]! + s * 0.085,
      bb[2]!,
      undefined,
      'crank',
    );
    p.add(
      box(0.09, 0.02, 0.06),
      '#111111',
      s * 0.12,
      bb[1]! + s * 0.17,
      bb[2]!,
      undefined,
      'crank',
    );
  }
  tube(p, [0.06, 0.3, -0.02], [0.06, r, -0.5], 0.006, '#4b5563');
  return p;
}

/** The riders, seated where each model's seats are. */
const RIDER_LOOKS: SeatLook[] = [
  {
    skin: '#7a4b2a',
    hair: '#1a1410',
    hairStyle: 'buzz',
    top: '#ffffff',
    bottom: '#2b2f36',
    gender: 'male',
  },
  {
    skin: '#5a3620',
    hair: '#120d0a',
    hairStyle: 'short',
    top: '#ffffff',
    bottom: '#1f2937',
    gender: 'male',
  },
];
const PAX_LOOK: SeatLook = {
  skin: '#8a5a3a',
  hair: '#1a1410',
  hairStyle: 'long',
  top: '#be185d',
  bottom: '#1f2937',
  gender: 'female',
  topStyle: 'blouse',
};
const KEKE_DRIVER: SeatLook = {
  skin: '#6b4226',
  hair: '#120d0a',
  hairStyle: 'short',
  top: '#0f766e',
  bottom: '#374151',
  gender: 'male',
};

const at = (x: number, y: number, z: number) => new THREE.Matrix4().makeTranslation(x, y, z);

/** Where each seat is on each model (its hip joints), and the pose it takes. */
export const SEATS = {
  moto: { seat: 'moto' as Seat, at: [0, 0.94, -0.2] as const },
  pillion: { seat: 'pillion' as Seat, at: [0, 0.98, -0.55] as const },
  keke: { seat: 'keke' as Seat, at: [0, 0.92, 0.22] as const },
  kekeBack: { seat: 'sit' as Seat, at: [0, 1.06, -0.62] as const },
  bike: { seat: 'pedal' as Seat, at: [0, 1.06, -0.24] as const },
};
/** A seat's frame: the person's root (their hips `seatHeight` above it). */
export const seatAt = (s: { seat: Seat; at: readonly [number, number, number] }) =>
  at(s.at[0], s.at[1] - seatHeight(s.seat), s.at[2]);

/**
 * Each baked person, once: one at a time, a few frames apart (posing and
 * copying a person takes a moment; a phone's frame, or a tap, shouldn't wait
 * for all of them at once).
 */
const baked = new Map<string, THREE.BufferGeometry>();
let lastBake = -Infinity;
const BAKE_GAP_MS = 400;
function bakeOnce(key: string, make: () => THREE.BufferGeometry | null) {
  const hit = baked.get(key);
  if (hit) return hit;
  const now = performance.now();
  if (now - lastBake < BAKE_GAP_MS) return null;
  const g = make();
  if (g) {
    lastBake = now;
    baked.set(key, g);
  }
  return g;
}

/** An okada or a keke with its people baked in (null while they're on their way). */
function withRiders(name: 'Moto' | 'MotoPax' | 'Keke') {
  const vehicle = () => {
    const p = new Parts(null);
    coarse = true;
    if (name === 'Keke') kekeParts(p, KEKE_CANOPY);
    else motoParts(p);
    coarse = false;
    return p;
  };
  const length = name === 'Keke' ? 2.7 : 2;
  // People off (or never coming): the vehicle alone.
  if (seatedUnavailable('men') || seatedUnavailable('women')) return finish(vehicle(), length);
  const rider =
    name === 'Keke'
      ? bakeOnce('keke-driver', () => bakeSeated(KEKE_DRIVER, SEATS.keke.seat, seatAt(SEATS.keke)))
      : bakeOnce(`moto-rider-${name}`, () =>
          bakeSeated(
            RIDER_LOOKS[name === 'MotoPax' ? 1 : 0]!,
            SEATS.moto.seat,
            seatAt(SEATS.moto),
            { paintTop: true, helmet: name === 'Moto' ? '#1f2937' : undefined },
          ),
        );
  const pax =
    name === 'MotoPax'
      ? bakeOnce('moto-pillion', () =>
          bakeSeated(PAX_LOOK, SEATS.pillion.seat, seatAt(SEATS.pillion)),
        )
      : name === 'Keke'
        ? bakeOnce('keke-pax', () =>
            bakeSeated(PAX_LOOK, 'sit', seatAt(SEATS.kekeBack).multiply(at(0.3, 0, 0))),
          )
        : undefined;
  if (!rider || pax === null) return null;
  const p = vehicle();
  p.raw(rider);
  if (pax) p.raw(pax);
  return finish(p, length);
}

// ---------------------------------------------------------------------------
// The code-built vehicles to ride: a group, its wheels (and a bicycle's
// cranks) on pivots that turn as it goes.

export type RideKind = 'moto' | 'keke' | 'danfo' | 'bike';

const rideMats = new Map<string, THREE.Material>();
function rideMaterial(kind: 'body' | 'glass') {
  let m = rideMats.get(kind);
  if (!m) {
    m =
      kind === 'glass'
        ? new THREE.MeshStandardMaterial({
            vertexColors: true,
            roughness: 0.08,
            metalness: 0.4,
            transparent: true,
            opacity: 0.38,
            depthWrite: false,
          })
        : new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.2 });
    m.userData.shared = true;
    rideMats.set(kind, m);
  }
  return m;
}

/**
 * A code-built vehicle to ride (front +Z, its real size): painted, with
 * see-through glass (the people inside show), its wheels in
 * `userData.wheels` (turned by spinWheels) and a bicycle's cranks in
 * `userData.crank`. `disposeRide` lets its geometries go.
 */
export function rideModel(kind: RideKind, paint: string, accent = '#111827'): THREE.Group {
  const p = new Parts(paint, accent);
  if (kind === 'moto') motoParts(p);
  else if (kind === 'keke') kekeParts(p, KEKE_CANOPY);
  else if (kind === 'danfo') danfoParts(p);
  else bikeParts(p);
  const g = new THREE.Group();
  const wheels: THREE.Object3D[] = [];
  for (const tag of p.tags()) {
    const geo = p.merged((t) => t === tag);
    geo.userData.shared = false;
    const mesh = new THREE.Mesh(geo, rideMaterial(tag === 'glass' ? 'glass' : 'body'));
    mesh.castShadow = tag !== 'glass';
    const c = p.pivots.get(tag);
    if (c) {
      geo.translate(-c.x, -c.y, -c.z);
      const pivot = new THREE.Group();
      pivot.position.copy(c);
      pivot.add(mesh);
      pivot.userData.radius = tag === 'crank' ? 0.5 : c.y;
      g.add(pivot);
      if (tag === 'crank') g.userData.crank = pivot;
      else wheels.push(pivot);
    } else {
      if (tag === 'glass') mesh.renderOrder = 2;
      g.add(mesh);
    }
  }
  g.userData.wheels = wheels;
  return g;
}

/** Let go of a ride model's own geometries (the materials are shared). */
export function disposeRide(g: THREE.Object3D) {
  g.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && !m.geometry.userData.shared) m.geometry.dispose();
  });
  g.removeFromParent();
}

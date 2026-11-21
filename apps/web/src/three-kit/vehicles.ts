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
import { propsNow } from './props';

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
      const dims = this.opts.dims;
      if (dims)
        g.scale(dims[0] / (b.max.x - b.min.x), dims[1] / (b.max.y - b.min.y), dims[2] / src.length);
      else {
        const s = this.opts.length / src.length;
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

/** What a fleet can draw: a car from the kit, the bus (Public Transport), a motorbike or a keke. */
export type FleetModel = CarModel | 'Bus' | 'Moto' | 'Keke';

const extraMerged = new Map<string, { geometry: THREE.BufferGeometry; length: number }>();

/** A fleet model's merged geometry (null until its file has arrived). */
export function mergedOf(
  name: FleetModel,
): { geometry: THREE.BufferGeometry; length: number } | null {
  const hit = extraMerged.get(name);
  if (hit) return hit;
  if (name === 'Moto' || name === 'Keke') {
    const m = name === 'Moto' ? motoGeometry() : kekeGeometry();
    extraMerged.set(name, m);
    return m;
  }
  if (name === 'Bus') {
    const bus = propsNow('transport')?.models.get('Bus');
    if (!bus) return null;
    const m = mergeCar(bus.group);
    extraMerged.set(name, m);
    return m;
  }
  return carsNow()?.merged.get(name) ?? null;
}

/** A procedural part for the hand-built vehicles: a coloured, optionally painted, box or cylinder. */
function part(
  g: THREE.BufferGeometry,
  colour: string,
  paint: boolean,
  x: number,
  y: number,
  z: number,
  r?: [number, number, number],
) {
  const geo = g.index ? g.toNonIndexed() : g;
  if (r) geo.rotateX(r[0]).rotateY(r[1]).rotateZ(r[2]);
  geo.translate(x, y, z);
  geo.deleteAttribute('uv');
  const n = geo.getAttribute('position').count;
  const c = new THREE.Color(paint ? '#ffffff' : colour);
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('paint', new THREE.BufferAttribute(new Float32Array(n).fill(paint ? 1 : 0), 1));
  geo.setIndex([...Array(n).keys()]);
  return geo;
}
const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const cyl = (r0: number, r1: number, h: number, seg = 12) =>
  new THREE.CylinderGeometry(r0, r1, h, seg);
const wheel = (r: number, t: number) => new THREE.CylinderGeometry(r, r, t, 16);
const SIDE: [number, number, number] = [0, 0, Math.PI / 2];

/** A motorbike and its rider (front +Z, 2 m long): the rider's shirt takes the colour. */
function motoGeometry() {
  const parts = [
    part(wheel(0.32, 0.12), '#141414', false, 0, 0.32, 0.68, SIDE),
    part(wheel(0.32, 0.12), '#141414', false, 0, 0.32, -0.68, SIDE),
    part(wheel(0.17, 0.13), '#9ca3af', false, 0, 0.32, 0.68, SIDE),
    part(wheel(0.17, 0.13), '#9ca3af', false, 0, 0.32, -0.68, SIDE),
    part(box(0.2, 0.26, 1.05), '#1f2937', false, 0, 0.55, 0),
    part(box(0.32, 0.24, 0.46), '#b91c1c', false, 0, 0.78, 0.22),
    part(box(0.3, 0.1, 0.62), '#111111', false, 0, 0.82, -0.28),
    part(cyl(0.025, 0.025, 0.6), '#d1d5db', false, 0, 0.72, 0.62, [0.45, 0, 0]),
    part(box(0.72, 0.04, 0.04), '#d1d5db', false, 0, 1.03, 0.52),
    part(new THREE.SphereGeometry(0.08, 10, 8), '#fde68a', false, 0, 0.85, 0.78),
    part(box(0.36, 0.1, 0.3), '#374151', false, 0, 0.62, -0.62),
    // The rider: legs astride, the shirt (painted), arms to the bars, a helmet.
    part(box(0.14, 0.45, 0.16), '#1f2937', false, 0.16, 0.72, -0.12, [0.5, 0, 0]),
    part(box(0.14, 0.45, 0.16), '#1f2937', false, -0.16, 0.72, -0.12, [0.5, 0, 0]),
    part(box(0.4, 0.55, 0.26), '#ffffff', true, 0, 1.18, -0.18, [-0.25, 0, 0]),
    part(box(0.1, 0.42, 0.1), '#ffffff', true, 0.24, 1.12, 0.12, [-1.1, 0, 0]),
    part(box(0.1, 0.42, 0.1), '#ffffff', true, -0.24, 1.12, 0.12, [-1.1, 0, 0]),
    part(new THREE.SphereGeometry(0.15, 12, 10), '#2b2b2b', false, 0, 1.6, -0.12),
    part(box(0.2, 0.08, 0.04), '#0f172a', false, 0, 1.6, 0.02),
  ];
  const geometry = mergeGeometries(parts, false)!;
  geometry.userData.shared = true;
  return { geometry, length: 2.0 };
}

/** A keke (tricycle taxi, front +Z, 2.7 m long): the body takes the colour; a black canopy. */
function kekeGeometry() {
  const parts = [
    part(wheel(0.25, 0.14), '#141414', false, 0, 0.25, 1.05, SIDE),
    part(wheel(0.25, 0.14), '#141414', false, 0.6, 0.25, -0.8, SIDE),
    part(wheel(0.25, 0.14), '#141414', false, -0.6, 0.25, -0.8, SIDE),
    part(box(1.3, 0.55, 1.9), '#ffffff', true, 0, 0.62, -0.25),
    part(box(0.75, 0.75, 0.55), '#ffffff', true, 0, 0.72, 0.92),
    part(box(1.0, 0.55, 0.04), '#1f2937', false, 0, 1.35, 0.95, [-0.2, 0, 0]),
    part(box(1.42, 0.08, 2.15), '#111111', false, 0, 1.92, -0.12),
    part(box(1.42, 0.85, 0.06), '#111111', false, 0, 1.45, -1.18),
    part(box(0.05, 1.0, 0.05), '#111111', false, 0.66, 1.4, 0.9),
    part(box(0.05, 1.0, 0.05), '#111111', false, -0.66, 1.4, 0.9),
    part(box(0.05, 1.0, 0.05), '#111111', false, 0.66, 1.4, -1.1),
    part(box(0.05, 1.0, 0.05), '#111111', false, -0.66, 1.4, -1.1),
    part(box(1.1, 0.3, 0.6), '#3f3f46', false, 0, 1.02, -0.6),
    part(box(0.5, 0.03, 0.03), '#d1d5db', false, 0, 1.2, 0.72),
    part(new THREE.SphereGeometry(0.07, 10, 8), '#fde68a', false, 0, 0.9, 1.2),
    part(box(1.32, 0.06, 0.06), '#374151', false, 0, 0.38, -1.2),
  ];
  const geometry = mergeGeometries(parts, false)!;
  geometry.userData.shared = true;
  return { geometry, length: 2.7 };
}

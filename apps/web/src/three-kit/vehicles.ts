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
  loading ??= new GLTFLoader()
    .loadAsync(`${base()}models/vehicles/cars.glb`)
    .then((g) => {
      const models = new Map<string, THREE.Group>();
      const merged = new Map<string, { geometry: THREE.BufferGeometry; length: number }>();
      const root = g.scene.getObjectByName('Cars') ?? g.scene;
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
        merged.set(car.name, mergeCar(car));
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
function mergeCar(car: THREE.Object3D) {
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
    const isPaint = mt.name === 'Paint';
    const col = isPaint ? new THREE.Color(1, 1, 1) : mt.color;
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
    parts.push(g);
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
    private modelOf: (i: number) => CarModel,
    private opts: { length: number; castShadow: boolean },
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
    const k = carsNow();
    if (!k || this.count === 0) return;
    const names = [...new Set(Array.from({ length: this.count }, (_, i) => this.modelOf(i)))];
    const counts = names.map(() => 0);
    for (let i = 0; i < this.count; i++) {
      const o = names.indexOf(this.modelOf(i));
      this.owner[i] = o;
      this.slot[i] = counts[o]!++;
    }
    const mat = fleetMaterial();
    const meshes = names.map((n, j) => {
      const src = k.merged.get(n)!;
      // As long as the boxes, turned to face +X like them.
      const g = src.geometry.clone();
      g.userData.shared = false;
      const s = this.opts.length / src.length;
      g.scale(s, s, s).rotateY(Math.PI / 2);
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

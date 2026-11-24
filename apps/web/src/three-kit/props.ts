/**
 * CC0 props baked from Quaternius packs (public/models/props/*.glb, see
 * public/models/LICENSES.md): each GLB is a `Props` node of named models
 * (metres, Y up, the front towards +Z, centred, standing on y = 0). One
 * shared loader and cache per file; nothing waits on the download (callers
 * keep their own low-poly shapes until it arrives, and for good if it fails).
 *
 * `propFit` clones a model into a footprint: fitted to width × depth
 * (uniformly, or to a set height), turned, recoloured by material name.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { emitKitReady, humansEnabled } from './humans/kit';

export type PropFile = 'furniture' | 'transport';

interface PropSet {
  models: Map<string, { group: THREE.Object3D; size: THREE.Vector3 }>;
}
const sets = new Map<PropFile, PropSet>();
const loads = new Map<PropFile, Promise<PropSet | null>>();
const failed = new Set<PropFile>();

const base = (): string => {
  try {
    return (import.meta.env?.BASE_URL as string | undefined) ?? '/';
  } catch {
    return '/';
  }
};

/** The props if they've arrived (and starts fetching them if not). */
export function propsNow(file: PropFile): PropSet | null {
  const s = sets.get(file);
  if (s) return s;
  if (!failed.has(file) && humansEnabled()) void loadProps(file);
  return null;
}

export function loadProps(file: PropFile): Promise<PropSet | null> {
  let p = loads.get(file);
  if (!p) {
    p = new GLTFLoader()
      .loadAsync(`${base()}models/props/${file}.glb`)
      .then((g) => {
        const models = new Map<string, { group: THREE.Object3D; size: THREE.Vector3 }>();
        const root = g.scene.getObjectByName('Props') ?? g.scene;
        for (const m of [...root.children]) {
          m.position.set(0, 0, 0);
          m.updateMatrixWorld(true);
          m.traverse((o) => {
            const mesh = o as THREE.Mesh;
            if (!mesh.isMesh) return;
            mesh.geometry.userData.shared = true;
            (mesh.material as THREE.Material).userData.shared = true;
          });
          const size = new THREE.Box3().setFromObject(m).getSize(new THREE.Vector3());
          models.set(m.name, { group: m, size });
        }
        const set = { models };
        sets.set(file, set);
        emitKitReady();
        return set;
      })
      .catch(() => {
        failed.add(file);
        return null;
      });
    loads.set(file, p);
  }
  return p;
}

export interface Fit {
  /** Footprint to fit in (metres, along x and z after turning). */
  w: number;
  d: number;
  /** A set height instead (the footprint then only caps it). */
  h?: number;
  /** Stretch the height to exactly this (the footprint fit sets x and z). */
  hTo?: number;
  /** Turn about y (radians). */
  ry?: number;
  /** Material name → colour. */
  colours?: Record<string, string>;
  castShadow?: boolean;
}

const MATS = new Map<string, THREE.MeshStandardMaterial>();
function recolour(src: THREE.MeshStandardMaterial, hex: string) {
  const k = `${src.name}|${hex}|${src.roughness}`;
  let m = MATS.get(k);
  if (!m) {
    m = src.clone();
    m.color.set(hex);
    m.userData.shared = true;
    MATS.set(k, m);
  }
  return m;
}

/** A model fitted to a footprint (null until the props have arrived or if it's unknown). */
export function propFit(file: PropFile, name: string, fit: Fit): THREE.Group | null {
  const src = propsNow(file)?.models.get(name);
  if (!src) return null;
  const ry = fit.ry ?? 0;
  const turned = Math.abs(Math.sin(ry)) > 0.7;
  const W = turned ? src.size.z : src.size.x;
  const D = turned ? src.size.x : src.size.z;
  let s = Math.min(fit.w / W, fit.d / D);
  if (fit.h) s = Math.min(fit.h / src.size.y, s * 1.6);
  const g = new THREE.Group();
  const inner = src.group.clone(true);
  inner.rotation.y = ry;
  inner.scale.set(s, fit.hTo ? fit.hTo / src.size.y : s, s);
  g.add(inner);
  inner.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.castShadow = fit.castShadow ?? true;
    m.receiveShadow = true;
    const mt = m.material as THREE.MeshStandardMaterial;
    const c = fit.colours?.[mt.name];
    if (c) m.material = recolour(mt, c);
  });
  g.userData.size = new THREE.Vector3(W * s, fit.hTo ?? src.size.y * s, D * s);
  return g;
}

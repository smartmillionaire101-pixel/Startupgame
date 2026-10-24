/**
 * Catalogue pictures rendered from the game's own 3D models (the home's
 * furniture, the cars, walls and dividers): one small offscreen renderer,
 * a three-quarter view in soft studio light, each picture kept as a data
 * URL for the session. Loaded lazily (three.js only when a picture is due).
 */
import * as THREE from 'three';
import { buildModel } from '../interiors3d/furniture';
import { buildDivider, refinish, upholstered, type DividerKind } from '../interiors3d/dividers';
import { planFor } from '../home/layout';

export interface ThumbSpec {
  /** 'furniture' (slot), 'car' (model), 'wall' (kind). */
  kind: 'furniture' | 'car' | 'wall';
  id: string;
  tier?: number;
  /** A wall's length (metres). */
  len?: number;
  /** A finish or paint. */
  swatch?: string | null;
}

const SIZE = 192;
let gl: {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
} | null = null;
let broken = false;
const cache = new Map<string, string>();

function setup() {
  if (gl || broken) return gl;
  try {
    const canvas = document.createElement('canvas');
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
    });
    renderer.setSize(SIZE, SIZE, false);
    renderer.setPixelRatio(1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight('#ffffff', '#b9a98f', 1.6));
    const sun = new THREE.DirectionalLight('#fff4e0', 2.2);
    sun.position.set(3, 6, 4);
    scene.add(sun);
    const fill = new THREE.DirectionalLight('#dbe8ff', 0.7);
    fill.position.set(-4, 3, -2);
    scene.add(fill);
    const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 100);
    gl = { renderer, scene, camera };
  } catch {
    broken = true;
  }
  return gl;
}

const keyOf = (s: ThumbSpec) => `${s.kind}:${s.id}:${s.tier ?? 1}:${s.len ?? 0}:${s.swatch ?? ''}`;

function model(s: ThumbSpec): THREE.Object3D {
  if (s.kind === 'wall') {
    const g = buildDivider(s.id as DividerKind, s.len ?? 2, s.swatch ?? '#f1ede4');
    g.position.x = -(s.len ?? 2) / 2;
    const holder = new THREE.Group();
    holder.add(g);
    return holder;
  }
  if (s.kind === 'car')
    return buildModel(`car:${s.id}`, {
      w: 2,
      d: 4.5,
      tier: 1,
      ...(s.swatch ? { tint: s.swatch } : {}),
    }).group;
  const spot = planFor(5).slots[s.id] ?? planFor(3).slots[s.id];
  const w = spot && !spot.wall ? spot.w : 1;
  const d = spot && !spot.wall ? spot.h : 1;
  const fabric = !!s.swatch && upholstered(s.id);
  const m = buildModel(s.id, { w, d, tier: s.tier ?? 1, ...(fabric ? { tint: s.swatch! } : {}) });
  if (s.swatch && !fabric) refinish(m.group, s.swatch);
  return m.group;
}

/** A picture of the thing (a PNG data URL), or null when WebGL isn't there. */
export function renderThumb(s: ThumbSpec): string | null {
  const k = keyOf(s);
  const hit = cache.get(k);
  if (hit) return hit;
  const g = setup();
  if (!g) return null;
  const obj = model(s);
  obj.rotation.y = -0.6;
  g.scene.add(obj);
  const box = new THREE.Box3().setFromObject(obj);
  const centre = box.getCenter(new THREE.Vector3());
  const r = Math.max(0.3, box.getSize(new THREE.Vector3()).length() / 2);
  const dist = r / Math.sin((g.camera.fov * Math.PI) / 360);
  g.camera.position.set(centre.x + dist * 0.15, centre.y + dist * 0.5, centre.z + dist * 0.86);
  g.camera.lookAt(centre);
  g.renderer.setClearColor(0x000000, 0);
  g.renderer.render(g.scene, g.camera);
  const url = g.renderer.domElement.toDataURL('image/png');
  g.scene.remove(obj);
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) m.geometry.dispose();
  });
  cache.set(k, url);
  return url;
}

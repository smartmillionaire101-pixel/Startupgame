/**
 * Background people for the airport and the cabin, drawn cheaply: each one
 * is a CC0 person (../../three-kit/humans, the kit's far copy) put in a pose
 * (sitting, standing in a queue, waiting at the belt) by the game's own
 * `pose`, then baked once into a still mesh (the skinning worked out on the
 * CPU, every part's colour written into its vertices). A crowd is then one
 * instanced draw call per baked person, however many of them stand about:
 * a cabin of eighty passengers is a dozen draw calls, not four hundred
 * skinned meshes.
 *
 * Each instance gets its own top colour (the vertices of the top carry a
 * `paint` weight, as the traffic's paint does), so a dozen baked people make
 * a crowd that doesn't look cloned. If the kit can't load, the low-poly
 * person is baked instead: the crowd is still there.
 *
 * Luggage too: suitcases, cabin bags and duffels, instanced, coloured each.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { AvatarLook } from '../art';
import { makeCharacter, pose, type Character, type PoseId } from '../../interiors3d/character';
import { humansEnabled, loadKit } from '../../three-kit/humans/kit';

export interface BakeSpec {
  look: AvatarLook;
  pose: PoseId;
  /** Seat height (sitting). */
  seat?: number;
  /** The moment of the pose (a stride's phase, a hand half raised). */
  t?: number;
  /** Leave out what's below this height (legs hidden behind a seat back). */
  dropBelow?: number;
}

const _v = new THREE.Vector3();
const _c = new THREE.Color();

/** Whether `o` and every parent up to `top` are visible. */
function shown(o: THREE.Object3D, top: THREE.Object3D) {
  for (let p: THREE.Object3D | null = o; p && p !== top; p = p.parent) if (!p.visible) return false;
  return true;
}

/** One posed person as a still, vertex-coloured geometry (feet at 0, facing +z). */
function bakeOne(c: Character, spec: BakeSpec): THREE.BufferGeometry | null {
  const top = new THREE.Color(spec.look.top);
  const parts: THREE.BufferGeometry[] = [];
  c.root.updateMatrixWorld(true);
  c.root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || o === c.shadow || o.userData.contactShadow || !shown(o, c.root)) return;
    const mt = (Array.isArray(m.material) ? m.material[0] : m.material) as
      THREE.MeshStandardMaterial | undefined;
    if (!mt || mt.transparent) return;
    const src = m.geometry;
    const pos = src.getAttribute('position');
    if (!pos) return;
    const n = pos.count;
    const skinned = (m as THREE.SkinnedMesh).isSkinnedMesh ? (m as THREE.SkinnedMesh) : null;
    const p = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const paint = new Float32Array(n);
    const base = mt.color ?? _c.set('#888888');
    const isTop =
      Math.abs(base.r - top.r) + Math.abs(base.g - top.g) + Math.abs(base.b - top.b) < 0.02;
    for (let i = 0; i < n; i++) {
      if (skinned) skinned.getVertexPosition(i, _v);
      else _v.fromBufferAttribute(pos, i);
      _v.applyMatrix4(m.matrixWorld);
      p[i * 3] = _v.x;
      p[i * 3 + 1] = _v.y;
      p[i * 3 + 2] = _v.z;
      if (isTop) {
        col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = 1;
        paint[i] = 1;
      } else {
        col[i * 3] = base.r;
        col[i * 3 + 1] = base.g;
        col[i * 3 + 2] = base.b;
      }
    }
    let index: number[] = src.getIndex()
      ? Array.from(src.getIndex()!.array as ArrayLike<number>)
      : [...Array(n).keys()];
    if (spec.dropBelow !== undefined) {
      const lim = spec.dropBelow;
      const kept: number[] = [];
      for (let i = 0; i < index.length; i += 3) {
        const a = index[i]!;
        const b = index[i + 1]!;
        const d = index[i + 2]!;
        if (p[a * 3 + 1]! < lim && p[b * 3 + 1]! < lim && p[d * 3 + 1]! < lim) continue;
        kept.push(a, b, d);
      }
      index = kept;
    }
    if (!index.length) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('paint', new THREE.BufferAttribute(paint, 1));
    g.setIndex(index);
    parts.push(g);
  });
  if (!parts.length) return null;
  const merged = mergeGeometries(parts, false);
  for (const g of parts) g.dispose();
  if (!merged) return null;
  merged.computeVertexNormals();
  merged.computeBoundingSphere();
  return merged;
}

/** Baked people are kept (the airport opened again bakes nothing). */
const BAKED = new Map<string, THREE.BufferGeometry | null>();

/**
 * Bake people (waits for the kit, or bakes the low-poly person if it
 * can't come). Returns one geometry per spec (null where nothing came out);
 * the geometries are shared (cached): never dispose of them.
 */
export async function bakePeople(
  specs: BakeSpec[],
  { far = true, cancelled }: { far?: boolean; cancelled?: () => boolean } = {},
): Promise<(THREE.BufferGeometry | null)[]> {
  const enabled = humansEnabled();
  if (enabled) {
    const kits = new Set(specs.map((s) => (s.look.gender === 'female' ? 'women' : 'men')));
    await Promise.all([...kits].map((k) => loadKit(k, far)));
  }
  const out: (THREE.BufferGeometry | null)[] = [];
  let made = 0;
  for (const [n, spec] of specs.entries()) {
    if (cancelled?.()) return out;
    const key = `${far ? 1 : 0}|${enabled ? 1 : 0}|${JSON.stringify(spec)}`;
    if (BAKED.has(key)) {
      out.push(BAKED.get(key)!);
      continue;
    }
    const c = makeCharacter(spec.look, `baked:${n}`, { far });
    pose(c, spec.pose, spec.t ?? 0, { seat: spec.seat, phase: n * 0.37 });
    // (The model follows the pose as the person's matrices are worked out.)
    c.root.updateMatrixWorld(true);
    pose(c, spec.pose, spec.t ?? 0, { seat: spec.seat, phase: n * 0.37 });
    const g = bakeOne(c, spec);
    if (g) g.userData.shared = true;
    BAKED.set(key, g);
    out.push(g);
    c.root.removeFromParent();
    // Let the page breathe between people on a slow phone.
    if (++made % 4 === 0) await new Promise((r) => setTimeout(r, 0));
  }
  return out;
}

/** Vertex colours, the instance's colour on the `paint` vertices only. */
export function crowdMaterial(rough = 0.82): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: rough, metalness: 0 });
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
  m.customProgramCacheKey = () => 'crowd-paint';
  return m;
}

export interface Placed {
  /** Which baked geometry. */
  v: number;
  x: number;
  y?: number;
  z: number;
  /** Facing (radians about y; 0 = +z). */
  ry?: number;
  /** The top's colour (the baked one's otherwise). */
  top?: string;
  s?: number;
}

/** People (or luggage) as instanced meshes: one draw call per geometry. */
export class Instanced {
  readonly group = new THREE.Group();
  readonly count: number;
  private material: THREE.MeshStandardMaterial;

  constructor(
    geos: (THREE.BufferGeometry | null)[],
    placed: Placed[],
    o: { shadow?: boolean; defaults?: string[]; rough?: number } = {},
  ) {
    this.material = crowdMaterial(o.rough);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const col = new THREE.Color();
    let count = 0;
    geos.forEach((g, v) => {
      if (!g) return;
      const mine = placed.filter((p) => p.v === v);
      if (!mine.length) return;
      const im = new THREE.InstancedMesh(g, this.material, mine.length);
      mine.forEach((p, k) => {
        q.setFromAxisAngle(up, p.ry ?? 0);
        const s = p.s ?? 1;
        m4.compose(new THREE.Vector3(p.x, p.y ?? 0, p.z), q, new THREE.Vector3(s, s, s));
        im.setMatrixAt(k, m4);
        im.setColorAt(k, col.set(p.top ?? o.defaults?.[v] ?? '#ffffff'));
      });
      im.castShadow = !!o.shadow;
      im.receiveShadow = false;
      im.computeBoundingSphere();
      this.group.add(im);
      count += mine.length;
    });
    this.count = count;
  }

  dispose(keepGeometry = false) {
    this.group.removeFromParent();
    this.group.traverse((o) => {
      const im = o as THREE.InstancedMesh;
      if (!im.isInstancedMesh) return;
      if (!keepGeometry && !im.geometry.userData.shared) im.geometry.dispose();
      im.dispose();
    });
    this.material.dispose();
  }
}

// ---------------------------------------------------------------------------
// Luggage

export type BagKind = 'case' | 'cabin' | 'duffel' | 'pack';
export const BAG_KINDS: BagKind[] = ['case', 'cabin', 'duffel', 'pack'];

/** A geometry with every vertex of one colour (paint 1: the instance's colour). */
function tinted(g: THREE.BufferGeometry, color: string | null, m?: THREE.Matrix4) {
  const x = g.index ? g.toNonIndexed() : g;
  if (m) x.applyMatrix4(m);
  x.deleteAttribute('uv');
  const n = x.getAttribute('position').count;
  const c = new Float32Array(n * 3);
  const p = new Float32Array(n);
  _c.set(color ?? '#ffffff');
  for (let i = 0; i < n; i++) {
    c[i * 3] = _c.r;
    c[i * 3 + 1] = _c.g;
    c[i * 3 + 2] = _c.b;
    p[i] = color ? 0 : 1;
  }
  x.setAttribute('color', new THREE.BufferAttribute(c, 3));
  x.setAttribute('paint', new THREE.BufferAttribute(p, 1));
  return x;
}
const T = (x: number, y: number, z: number, rx = 0, rz = 0) =>
  new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, 0, rz)),
    new THREE.Vector3(1, 1, 1),
  );

const BAGS = new Map<BagKind, THREE.BufferGeometry>();
/** A bag standing on the floor (front +z), shared by every view. */
export function bagGeometry(kind: BagKind): THREE.BufferGeometry {
  const hit = BAGS.get(kind);
  if (hit) return hit;
  const dark = '#1f2937';
  const parts: THREE.BufferGeometry[] = [];
  if (kind === 'case' || kind === 'cabin') {
    const h = kind === 'case' ? 0.68 : 0.52;
    const w = kind === 'case' ? 0.46 : 0.36;
    const d = kind === 'case' ? 0.27 : 0.22;
    parts.push(tinted(new RoundedBoxGeometry(w, h, d, 2, 0.04), null, T(0, h / 2 + 0.05, 0)));
    // Ribs down the shell.
    for (const sx of [-0.3, 0, 0.3])
      parts.push(
        tinted(
          new THREE.BoxGeometry(0.02, h * 0.85, 0.01),
          '#0f172a',
          T(sx * w, h / 2 + 0.05, d / 2),
        ),
      );
    // The telescopic handle and its grip, the wheels.
    for (const sx of [-1, 1])
      parts.push(
        tinted(
          new THREE.CylinderGeometry(0.008, 0.008, 0.32, 5),
          '#9ca3af',
          T(sx * w * 0.3, h + 0.2, -d * 0.3),
        ),
      );
    parts.push(tinted(new THREE.BoxGeometry(w * 0.7, 0.03, 0.03), dark, T(0, h + 0.36, -d * 0.3)));
    for (const sx of [-1, 1])
      for (const sz of [-1, 1])
        parts.push(
          tinted(
            new THREE.CylinderGeometry(0.025, 0.025, 0.025, 8),
            dark,
            T(sx * (w / 2 - 0.04), 0.025, sz * (d / 2 - 0.04), 0, Math.PI / 2),
          ),
        );
  } else if (kind === 'duffel') {
    parts.push(
      tinted(new THREE.CapsuleGeometry(0.15, 0.36, 3, 10), null, T(0, 0.15, 0, 0, Math.PI / 2)),
    );
    parts.push(tinted(new THREE.TorusGeometry(0.12, 0.012, 4, 12, Math.PI), dark, T(0, 0.27, 0)));
  } else {
    parts.push(tinted(new RoundedBoxGeometry(0.32, 0.44, 0.2, 2, 0.06), null, T(0, 0.22, 0)));
    parts.push(tinted(new RoundedBoxGeometry(0.24, 0.18, 0.06, 2, 0.03), dark, T(0, 0.16, 0.11)));
  }
  const g = mergeGeometries(parts, false)!;
  for (const p of parts) p.dispose();
  g.computeVertexNormals();
  g.userData.shared = true;
  BAGS.set(kind, g);
  return g;
}

export interface BagAt {
  kind: BagKind;
  x: number;
  y?: number;
  z: number;
  ry?: number;
  color: string;
}

/** Bags, instanced (one draw call per kind). */
export function bags(list: BagAt[], shadow = true): Instanced {
  return new Instanced(
    BAG_KINDS.map((k) => bagGeometry(k)),
    list.map((b) => ({
      v: BAG_KINDS.indexOf(b.kind),
      x: b.x,
      y: b.y,
      z: b.z,
      ry: b.ry,
      top: b.color,
    })),
    { shadow, rough: 0.45 },
  );
}

export const BAG_COLOURS = [
  '#0ea5e9',
  '#ef4444',
  '#8b5cf6',
  '#10b981',
  '#f97316',
  '#1e293b',
  '#eab308',
  '#ec4899',
  '#64748b',
  '#0f766e',
];

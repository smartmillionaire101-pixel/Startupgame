/**
 * The CC0 people (Quaternius "Ultimate Modular Men/Women", public/models/
 * people/*.glb; see public/models/LICENSES.md): one shared loader and cache
 * per kit, and `Human`, one person cloned from it (SkeletonUtils.clone: the
 * geometry is shared by everyone, each has its own skeleton and mixer).
 *
 * A kit is one skeleton with every outfit's head, top, legs and shoes as
 * separate skinned meshes; a person keeps the four their look wears
 * (./outfit.ts) and recolours them. The kit's clips (Idle, Walk, Run, Wave,
 * Interact…) play through an AnimationMixer and crossfade; anything else
 * (sitting, dancing, lying…) is posed by `aim`, which turns bones to world
 * rotations given by the caller (../../interiors3d/character.ts retargets
 * its own jointed person onto the skeleton that way).
 *
 * Nothing here blocks: `loadKit` starts the download (lazily, the first time
 * a person is drawn) and `kitNow` answers only once it has arrived. Until
 * then, and for good if it fails, callers keep drawing their own low-poly
 * person.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { hairMaterial, type Kit, type Outfit } from './outfit';
import {
  faceGrow,
  headPoints,
  measureHead,
  scalpGrow,
  shellGeometry,
  shellMaterial,
  type HeadFit,
  type HeadFrame,
} from './face';

/** How tall a person stands (metres), as the game's own people are. */
export const PERSON_HEIGHT = 1.75;

export interface KitData {
  kit: Kit;
  scene: THREE.Group;
  clips: Map<string, THREE.AnimationClip>;
  /** Kit units to metres. */
  scale: number;
  /** Each bone in the reference pose (Idle's first frame): local and kit-space transforms. */
  refLocal: Map<string, { p: THREE.Vector3; q: THREE.Quaternion }>;
  refWorld: Map<string, THREE.Matrix4>;
  /** Each head's skull in its Head bone's space: centre and half width (kit units). */
  skull: Map<string, { c: THREE.Vector3; r: number }>;
  /** Each head's frame (bone space → the person's head frame) and its features there (./face.ts). */
  frames: Map<string, HeadFrame>;
  fit: Map<string, HeadFit>;
}

const base = (): string => {
  try {
    return (import.meta.env?.BASE_URL as string | undefined) ?? '/';
  } catch {
    return '/';
  }
};
/** A kit file: the full people, or their far copy (`-lod`, about a third of the triangles). */
type KitFile = Kit | `${Kit}-lod`;
const loads = new Map<KitFile, Promise<KitData | null>>();
const ready = new Map<KitFile, KitData>();
const failed = new Set<KitFile>();
const listeners = new Set<() => void>();

/** Called whenever a kit arrives (views redraw so their people change). */
export function onKitReady(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Tell the views a model has arrived (the people here, the cars in ../vehicles.ts). */
export function emitKitReady() {
  for (const l of [...listeners]) l();
}

/** People from the kit at all: not where WebGL can't run (tests, jsdom) or when turned off. */
export function humansEnabled(): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false;
  if (typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent)) return false;
  try {
    if (localStorage.getItem('runway.models') === 'off') return false;
  } catch {
    /* storage blocked: on */
  }
  return true;
}

/** The kit if it has arrived (and starts fetching it if not). */
export function kitNow(kit: Kit, far = false): KitData | null {
  const file: KitFile = far ? `${kit}-lod` : kit;
  const k = ready.get(file);
  if (k) return k;
  if (!failed.has(file) && humansEnabled()) void loadKit(kit, far);
  // The far copy failed: the full one will do.
  return far && failed.has(file) ? kitNow(kit) : null;
}

export function loadKit(kit: Kit, far = false): Promise<KitData | null> {
  const file: KitFile = far ? `${kit}-lod` : kit;
  let p = loads.get(file);
  if (!p) {
    p = new GLTFLoader()
      .loadAsync(`${base()}models/people/${file}.glb`)
      .then((g) => {
        const data = prepare(kit, g.scene, g.animations);
        ready.set(file, data);
        emitKitReady();
        return data;
      })
      .catch(() => {
        failed.add(file);
        return null;
      });
    loads.set(file, p);
  }
  return p;
}

function prepare(kit: Kit, scene: THREE.Group, animations: THREE.AnimationClip[]): KitData {
  const clips = new Map(animations.map((a) => [a.name, a]));
  scene.traverse((o) => {
    const g = (o as THREE.Mesh).geometry;
    if (!g) return;
    g.userData.shared = true;
    // The far copy has no normals (dropped to simplify it): smooth ones.
    if (!g.getAttribute('normal')) g.computeVertexNormals();
  });
  // The reference pose: Idle's first frame (the rest pose is a T-ish pose).
  const mixer = new THREE.AnimationMixer(scene);
  const idle = clips.get('Idle');
  if (idle) mixer.clipAction(idle).play();
  mixer.update(0);
  scene.updateMatrixWorld(true);
  const refLocal = new Map<string, { p: THREE.Vector3; q: THREE.Quaternion }>();
  const refWorld = new Map<string, THREE.Matrix4>();
  let headBone: THREE.Bone | null = null;
  scene.traverse((o) => {
    if ((o as THREE.Bone).isBone) {
      refLocal.set(o.name, { p: o.position.clone(), q: o.quaternion.clone() });
      refWorld.set(o.name, o.matrixWorld.clone());
      if (o.name === 'Head') headBone = o as THREE.Bone;
    }
  });
  mixer.stopAllAction();
  mixer.uncacheRoot(scene);
  const box = new THREE.Box3().setFromObject(scene);
  const scale = PERSON_HEIGHT / Math.max(0.5, box.max.y - box.min.y);
  // Each head's skull (its skin) and eyes, for hats, glasses and our own hair to sit on.
  const skull = new Map<string, { c: THREE.Vector3; r: number }>();
  const inv = headBone
    ? (headBone as THREE.Bone).matrixWorld.clone().invert()
    : new THREE.Matrix4();
  const v = new THREE.Vector3();
  const boxes = new Map<string, THREE.Box3>();
  scene.traverse((o) => {
    const m = o as THREE.SkinnedMesh;
    if (!m.isSkinnedMesh) return;
    const node = nodeOf(m);
    const mat = (m.material as THREE.Material).name;
    if (!node.endsWith('_Head') || (mat !== 'Skin' && mat !== 'Eye' && mat !== 'Brown')) return;
    const key = `${node}/${mat === 'Skin' ? 'skin' : 'eye'}`;
    const b = boxes.get(key) ?? new THREE.Box3();
    const n = m.geometry.attributes.position!.count;
    for (let i = 0; i < n; i++) {
      m.getVertexPosition(i, v);
      v.applyMatrix4(m.matrixWorld).applyMatrix4(inv);
      // The cranium only (above the jaw); the eyes are small.
      if (mat !== 'Skin' || v.y > 0.02) b.expandByPoint(v);
    }
    boxes.set(key, b);
  });
  for (const [key, b] of boxes) {
    if (!key.endsWith('/skin')) continue;
    const node = key.slice(0, -5);
    const c = b.getCenter(new THREE.Vector3());
    const r = (b.max.x - b.min.x) / 2;
    // Eye level as the game's own head has it (0.015 of 0.14 above the skull's middle).
    const eye = boxes.get(`${node}/eye`);
    if (eye && !eye.isEmpty()) c.y = eye.getCenter(v).y - (0.015 / 0.142) * r;
    skull.set(node, { c, r });
  }
  // Each head measured in the person's head frame: hats, glasses and hair are made to fit it.
  const frames = new Map<string, HeadFrame>();
  const fit = new Map<string, HeadFit>();
  const q = new THREE.Quaternion();
  refWorld.get('Head')?.decompose(new THREE.Vector3(), q, new THREE.Vector3());
  for (const [node, sk] of skull) frames.set(node, { c: sk.c, k: sk.r / 0.142, q });
  const parts = new Map<
    string,
    { skin: Float32Array[]; eyes: Float32Array[]; brows: Float32Array[] }
  >();
  scene.traverse((o) => {
    const m = o as THREE.SkinnedMesh;
    if (!m.isSkinnedMesh) return;
    const node = nodeOf(m);
    const frame = frames.get(node);
    const head = m.skeleton.bones.findIndex((b) => b.name === 'Head');
    if (!frame || head < 0) return;
    const mat = (m.material as THREE.Material).name;
    const kind = SKIN_MATS.has(mat)
      ? 'skin'
      : mat === 'Eye' || mat === 'Brown'
        ? 'eyes'
        : mat === 'Eyebrows' || mat === 'Hair_Brown'
          ? 'brows'
          : null;
    if (!kind) return;
    const p = parts.get(node) ?? { skin: [], eyes: [], brows: [] };
    p[kind].push(headPoints(m, head, frame));
    parts.set(node, p);
  });
  for (const [node, p] of parts)
    if (p.skin.length) fit.set(node, measureHead(p.skin, p.eyes, p.brows));
  return { kit, scene, clips, scale, refLocal, refWorld, skull, frames, fit };
}

/** A head's skin (Casual2's jaw is a darker skin of its own). */
const SKIN_MATS = new Set(['Skin', 'Skin_Darker']);

/** Hair grown on the heads (./face.ts), made once per kit, head, skin part and style. */
const SHELLS = new WeakMap<KitData, Map<string, THREE.BufferGeometry | null>>();
function shell(kit: KitData, node: string, m: THREE.SkinnedMesh, what: string) {
  let byKit = SHELLS.get(kit);
  if (!byKit) SHELLS.set(kit, (byKit = new Map()));
  const key = `${node}|${(m.material as THREE.Material).name}|${what}`;
  if (byKit.has(key)) return byKit.get(key)!;
  const frame = kit.frames.get(node);
  const fit = kit.fit.get(node);
  const head = m.skeleton.bones.findIndex((b) => b.name === 'Head');
  let g: THREE.BufferGeometry | null = null;
  if (frame && fit && head >= 0) {
    const grow =
      what === 'scalp' ? scalpGrow(fit) : faceGrow(fit, what as Parameters<typeof faceGrow>[1]);
    g = shellGeometry(m, head, frame, grow);
  }
  byKit.set(key, g);
  return g;
}

/** The kit node (Suit_Body…) a skinned mesh belongs to. */
function nodeOf(o: THREE.Object3D): string {
  // A part with several materials is a group of meshes (one per material).
  return o.parent && !(o.parent as THREE.Bone).isBone && o.parent.name !== 'CharacterArmature'
    ? o.parent.name
    : o.name;
}

/** Materials shared by everyone wearing the same colour in the same kit material. */
const MATS = new Map<string, THREE.MeshStandardMaterial>();
function material(src: THREE.MeshStandardMaterial, colour: string | undefined) {
  const key = `${src.name}|${colour ?? 'kit'}`;
  let m = MATS.get(key);
  if (!m) {
    m = src.clone();
    if (colour) m.color.set(colour);
    m.roughness = src.name === 'Eye' ? 0.35 : 0.78;
    m.metalness = src.name === 'Gold' || src.name === 'Earrings' ? 0.6 : 0;
    m.userData.shared = true;
    MATS.set(key, m);
  }
  return m;
}

const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _s = new THREE.Vector3();
const _m = new THREE.Matrix4();

/** Bones aimed by `aim`, parents before children. */
export const AIMED = [
  'Hips',
  'Torso',
  'Head',
  'UpperLegL',
  'LowerLegL',
  'UpperLegR',
  'LowerLegR',
  'UpperArmL',
  'LowerArmL',
  'WristL',
  'UpperArmR',
  'LowerArmR',
  'WristR',
] as const;
export type AimedBone = (typeof AIMED)[number];

/** One person from a kit, wearing an outfit. */
export class Human {
  /** Add this to the person's root (feet at y = 0, facing +z). */
  readonly object = new THREE.Group();
  readonly bones = new Map<string, THREE.Bone>();
  readonly meshes: THREE.SkinnedMesh[] = [];
  readonly mixer: THREE.AnimationMixer;
  private actions = new Map<string, THREE.AnimationAction>();
  private current: THREE.AnimationAction | null = null;
  readonly kit: KitData;
  readonly outfit: Outfit;

  constructor(kit: KitData, outfit: Outfit, id = '') {
    this.kit = kit;
    this.outfit = outfit;
    const model = cloneSkinned(kit.scene) as THREE.Group;
    this.object.add(model);
    this.object.scale.setScalar(kit.scale);
    this.object.name = 'human';
    const keep = new Set([outfit.head, outfit.body, outfit.legs, outfit.feet]);
    const drop: THREE.Object3D[] = [];
    const hair = hairMaterial(outfit.kit, outfit.head);
    model.traverse((o) => {
      if ((o as THREE.Bone).isBone) {
        this.bones.set(o.name, o as THREE.Bone);
        return;
      }
      const m = o as THREE.SkinnedMesh;
      if (!m.isSkinnedMesh) return;
      const node = nodeOf(m);
      if (!keep.has(node)) {
        drop.push(m);
        return;
      }
      const src = m.material as THREE.MeshStandardMaterial;
      m.material = material(src, outfit.colours[`${node}/${src.name}`]);
      if (node === outfit.head && src.name === hair && !outfit.modelHair) m.visible = false;
      m.castShadow = true;
      m.receiveShadow = false;
      // Generous bounds (in the mesh's own, quantized, space): a dancing or lying person stays drawn.
      m.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 3);
      m.userData.character = id;
      this.meshes.push(m);
    });
    for (const d of drop) d.removeFromParent();
    // Hair grown on the head: facial hair, close-cropped hair under a hat (./face.ts).
    const grown: [string, string, 'hair' | 'stubble'][] = [];
    // (A moustache is shaped over the lip instead: ../../interiors3d/characterHead.ts.)
    if (outfit.facialHair && outfit.facialHair.style !== 'moustache')
      grown.push([
        outfit.facialHair.style,
        outfit.facialHair.colour,
        outfit.facialHair.style === 'stubble' ? 'stubble' : 'hair',
      ]);
    if (outfit.scalp) grown.push(['scalp', outfit.scalp, 'hair']);
    for (const src of [...this.meshes]) {
      if (nodeOf(src) !== outfit.head || !SKIN_MATS.has((src.material as THREE.Material).name))
        continue;
      for (const [what, colour, kind] of grown) {
        const g = shell(kit, outfit.head, src, what);
        if (!g) continue;
        const m = new THREE.SkinnedMesh(g, shellMaterial(colour, kind));
        m.name = `${outfit.head}_${what}`;
        m.position.copy(src.position);
        m.quaternion.copy(src.quaternion);
        m.scale.copy(src.scale);
        m.bind(src.skeleton, src.bindMatrix);
        m.castShadow = kind === 'hair';
        m.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 3);
        m.userData.character = id;
        src.parent?.add(m);
        this.meshes.push(m);
      }
    }
    // Empty part groups go too.
    for (const c of [...(model.getObjectByName('CharacterArmature')?.children ?? [])])
      if (!(c as THREE.Bone).isBone && c.children.length === 0 && !(c as THREE.Mesh).isMesh)
        c.removeFromParent();
    this.mixer = new THREE.AnimationMixer(model);
  }

  has(clip: string) {
    return this.kit.clips.has(clip);
  }

  /** Crossfade to a clip (looping), at a speed. */
  play(clip: string, fade = 0.25, timeScale = 1, offset = 0) {
    let a = this.actions.get(clip);
    if (!a) {
      const c = this.kit.clips.get(clip);
      if (!c) return;
      a = this.mixer.clipAction(c);
      this.actions.set(clip, a);
    }
    a.timeScale = timeScale;
    if (a === this.current) return;
    a.reset();
    a.time = offset % a.getClip().duration;
    a.play();
    if (this.current && fade > 0) this.current.crossFadeTo(a, fade, false);
    else if (this.current) this.current.stop();
    this.current = a;
  }

  /** Blend two looping clips by weight (0: a only, 1: b only), e.g. idle and walk. */
  blend(a: string, b: string, w: number, timeScaleB = 1, offset = 0) {
    const get = (n: string) => {
      let x = this.actions.get(n);
      if (!x) {
        const c = this.kit.clips.get(n);
        if (!c) return null;
        x = this.mixer.clipAction(c);
        x.time = offset * c.duration;
        this.actions.set(n, x);
      }
      if (!x.isRunning()) x.play();
      return x;
    };
    const A = get(a);
    const B = get(b);
    if (!A || !B) return;
    A.setEffectiveWeight(1 - w);
    B.setEffectiveWeight(w);
    B.timeScale = timeScaleB;
    this.current = null;
  }

  update(dt: number) {
    this.mixer.update(dt);
  }

  /**
   * Turn bones to world rotations (blended by `w` with the clip's pose),
   * place the body (its `Body` bone) at a world point, and carry each foot
   * with its shin. Call after the object's world matrices are current.
   */
  aim(targets: ReadonlyMap<AimedBone, THREE.Quaternion>, body: THREE.Vector3 | null, w: number) {
    const B = this.bones;
    if (body) {
      const b = B.get('Body');
      if (b?.parent) {
        b.parent.updateWorldMatrix(true, false);
        _m.copy(b.parent.matrixWorld).invert();
        _v.copy(body).applyMatrix4(_m);
        b.position.lerp(_v, w);
        b.updateMatrixWorld();
      }
    }
    for (const name of AIMED) {
      const t = targets.get(name);
      const bone = B.get(name);
      if (!t || !bone || !bone.parent) continue;
      bone.parent.updateWorldMatrix(true, false);
      bone.parent.matrixWorld.decompose(_v, _q, _s);
      _q2.copy(_q).invert().multiply(t);
      bone.quaternion.slerp(_q2, w);
    }
    // Feet hang from the root in this rig (IK targets): carry them with the shins.
    for (const side of ['L', 'R'] as const) {
      const foot = B.get(`Foot${side}`);
      const shin = B.get(`LowerLeg${side}`);
      const off = this.footOffset(side);
      if (!foot || !shin || !foot.parent || !off) continue;
      shin.updateWorldMatrix(true, false);
      foot.parent.updateWorldMatrix(true, false);
      _m.copy(foot.parent.matrixWorld).invert().multiply(shin.matrixWorld).multiply(off);
      _m.decompose(_v2, _q, _s);
      foot.position.lerp(_v2, w);
      foot.quaternion.slerp(_q, w);
    }
    this.object.updateMatrixWorld(true);
  }

  private feet: Partial<Record<'L' | 'R', THREE.Matrix4>> = {};
  private footOffset(side: 'L' | 'R') {
    let m = this.feet[side];
    if (!m) {
      const shin = this.kit.refWorld.get(`LowerLeg${side}`);
      const foot = this.kit.refWorld.get(`Foot${side}`);
      if (!shin || !foot) return null;
      m = shin.clone().invert().multiply(foot);
      this.feet[side] = m;
    }
    return m;
  }

  dispose() {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.mixer.getRoot());
    this.object.removeFromParent();
  }
}

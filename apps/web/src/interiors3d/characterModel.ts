/**
 * The CC0 person (../three-kit/humans) inside a jointed `Character`
 * (./character.ts). Every view keeps posing the low-poly person exactly as
 * before (`pose`, or turning its joints itself: golf swings, a penalty kick);
 * just before each frame is drawn, the model follows:
 *
 * - a pose the kit has a clip for (idle, walk, run, wave, kick), posed by
 *   `pose` and left alone since, plays that clip (crossfaded, desynced by the
 *   pose's phase);
 * - anything else (sitting, lying, dancing, eating, a view's own joint
 *   angles) is retargeted: each model bone turns as its joint has turned
 *   from standing (world rotations, so the rigs' different bone layouts
 *   don't matter), the hips go where the joint's hips are, the feet stay on
 *   the shins.
 *
 * The low-poly body is then hidden, and its joints are moved onto the model's
 * bones (their world matrices), so whatever hangs on them still sits right:
 * hair the kit hasn't got (an afro, locs, a gele), glasses, a cap, a
 * necklace, a bag, a mic or a glass in the hand. Until the kit has arrived,
 * or if it fails, the low-poly person is simply drawn as before.
 */
import * as THREE from 'three';
import { Human, kitNow, AIMED, type AimedBone } from '../three-kit/humans/kit';
import { outfitFor } from '../three-kit/humans/outfit';
import { softwareGl } from '../three-kit/quality';
import type { Character, PoseId } from './character';

type JointKey =
  | 'hips'
  | 'torso'
  | 'head'
  | 'thighL'
  | 'shinL'
  | 'thighR'
  | 'shinR'
  | 'armL'
  | 'foreL'
  | 'handL'
  | 'armR'
  | 'foreR'
  | 'handR';

/** Joint → bone, in AIMED order (parents first). */
const MAP: readonly (readonly [JointKey, AimedBone])[] = [
  ['hips', 'Hips'],
  ['torso', 'Torso'],
  ['head', 'Head'],
  ['thighL', 'UpperLegL'],
  ['shinL', 'LowerLegL'],
  ['thighR', 'UpperLegR'],
  ['shinR', 'LowerLegR'],
  ['armL', 'UpperArmL'],
  ['foreL', 'LowerArmL'],
  ['handL', 'WristL'],
  ['armR', 'UpperArmR'],
  ['foreR', 'LowerArmR'],
  ['handR', 'WristR'],
];
const LIMB = new Set<JointKey>([
  'thighL',
  'shinL',
  'thighR',
  'shinR',
  'armL',
  'foreL',
  'handL',
  'armR',
  'foreR',
  'handR',
]);

/** Poses the kit has a clip for, and how fast it plays. */
const CLIP: Partial<Record<PoseId, [string, number]>> = {
  idle: ['Idle', 1],
  stand: ['Idle', 1],
  walk: ['Walk', 1.25],
  run: ['Run', 1],
  wave: ['Wave', 1],
  kick: ['Kick_Right', 0.9],
};
const FADE = 0.25;

interface State {
  human: Human | null;
  pose: PoseId;
  phase: number;
  /** `pose` ran since the last frame. */
  posed: boolean;
  /** The joints as `pose` left them (to tell a view's own angles). */
  snap: Float32Array;
  w: number;
  last: number;
  clip: string;
  /** Joint rest pose (character space), taken once. */
  rest: Map<JointKey, THREE.Matrix4> | null;
  offsets: Map<JointKey, THREE.Matrix4> | null;
}

const STATE = new WeakMap<Character, State>();
const SNAP_N = MAP.length * 4 + 3;

const _m2 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const targets = new Map<AimedBone, THREE.Quaternion>(AIMED.map((b) => [b, new THREE.Quaternion()]));

const joint = (c: Character, k: JointKey) => c[k] as THREE.Group;

function snapshot(c: Character, out: Float32Array) {
  let i = 0;
  for (const [k] of MAP) {
    const q = joint(c, k).quaternion;
    out[i++] = q.x;
    out[i++] = q.y;
    out[i++] = q.z;
    out[i++] = q.w;
  }
  out[i++] = c.body.position.x;
  out[i++] = c.body.position.y;
  out[i++] = c.body.position.z;
}
function changed(c: Character, a: Float32Array) {
  let i = 0;
  for (const [k] of MAP) {
    const q = joint(c, k).quaternion;
    if (
      Math.abs(a[i]! - q.x) > 1e-4 ||
      Math.abs(a[i + 1]! - q.y) > 1e-4 ||
      Math.abs(a[i + 2]! - q.z) > 1e-4 ||
      Math.abs(a[i + 3]! - q.w) > 1e-4
    )
      return true;
    i += 4;
  }
  const p = c.body.position;
  return Math.abs(a[i]! - p.x) + Math.abs(a[i + 1]! - p.y) + Math.abs(a[i + 2]! - p.z) > 1e-4;
}

/** `pose` calls this after posing (which pose, its phase). */
export function posedModel(c: Character, p: PoseId, phase: number) {
  const st = STATE.get(c);
  if (!st) return;
  st.pose = p;
  st.phase = phase;
  st.posed = true;
  snapshot(c, st.snap);
}

/** The look changed (a haircut): the model is chosen again. */
export function refreshModel(c: Character) {
  const st = STATE.get(c);
  if (!st?.human) return;
  st.human.dispose();
  st.human = null;
  st.offsets = null;
}

/** Whether the model is drawn for this person (it may still be on its way). */
export const hasModel = (c: Character) => !!STATE.get(c)?.human;

/**
 * Give a person the CC0 model (lazily: drawn once the kit has arrived).
 * `restPose` puts the low-poly person standing at rest (to measure it).
 */
export function attachModel(c: Character, restPose: (c: Character) => void) {
  const st: State = {
    human: null,
    pose: 'idle',
    phase: 0,
    posed: false,
    snap: new Float32Array(SNAP_N),
    w: 1,
    last: 0,
    clip: 'Idle',
    rest: null,
    offsets: null,
  };
  STATE.set(c, st);
  const root = c.root;
  const update = root.updateMatrixWorld.bind(root);
  root.updateMatrixWorld = (force?: boolean) => {
    update(force);
    try {
      sync(c, st, restPose);
    } catch {
      // A model that can't follow: back to the low-poly person for good.
      if (st.human) {
        st.human.dispose();
        st.human = null;
      }
      STATE.delete(c);
      show(c, true, true);
    }
  };
}

/** Show or hide the low-poly body (and its hair when the model wears its own). */
function show(c: Character, body: boolean, hair: boolean) {
  c.body.traverse((o) => {
    if (o.userData.procBody) o.visible = body;
    else if (o.userData.hairPiece) o.visible = hair;
    else if (o.userData.modelOnly) o.visible = !body;
  });
}

function measureRest(c: Character, restPose: (c: Character) => void) {
  // Put the joints at rest, measure, then put them back as they were.
  const saved = new Float32Array(SNAP_N);
  snapshot(c, saved);
  const eul = MAP.map(([k]) => joint(c, k).rotation.clone());
  const bodyRot = c.body.rotation.clone();
  restPose(c);
  c.root.updateWorldMatrix(false, true);
  const inv = _m2.copy(c.root.matrixWorld).invert();
  const rest = new Map<JointKey, THREE.Matrix4>();
  for (const [k] of MAP) rest.set(k, inv.clone().multiply(joint(c, k).matrixWorld));
  MAP.forEach(([k], i) => joint(c, k).rotation.copy(eul[i]!));
  c.body.rotation.copy(bodyRot);
  c.body.position.set(saved[SNAP_N - 3]!, saved[SNAP_N - 2]!, saved[SNAP_N - 1]!);
  c.root.updateWorldMatrix(false, true);
  return rest;
}

function build(c: Character, st: State, restPose: (c: Character) => void) {
  const outfit = outfitFor(c.look);
  // On a software GPU (a phone that has no GPU worth the name): the far copy for everyone.
  const kit = kitNow(outfit.kit, softwareGl());
  if (!kit) return false;
  if (!st.rest) {
    // (Measuring poses the person: keep what `pose` said this frame.)
    const { pose, phase, posed } = st;
    const snap = st.snap.slice();
    const shadow = c.shadow.visible;
    st.rest = measureRest(c, restPose);
    Object.assign(st, { pose, phase, posed });
    st.snap.set(snap);
    c.shadow.visible = shadow;
  }
  const h = new Human(kit, outfit, c.id);
  c.root.add(h.object);
  st.human = h;
  // Each joint's place on its bone: as it was at rest, relative to the bone at rest.
  const s = kit.scale;
  const offsets = new Map<JointKey, THREE.Matrix4>();
  const S = new THREE.Matrix4().makeScale(s, s, s);
  for (const [k, bone] of MAP) {
    const ref = S.clone().multiply(kit.refWorld.get(bone)!);
    const rest = st.rest.get(k)!;
    let off: THREE.Matrix4;
    if (k === 'head') {
      // The low-poly skull (0.14 m across, 0.2 m above the neck) onto the model's.
      const sk = kit.skull.get(outfit.head) ?? { c: new THREE.Vector3(0, 0.1, 0), r: 0.1 };
      ref.decompose(_v, _q, _s);
      rest.decompose(_v, _q2, _s);
      const k2 = sk.r / 0.142;
      off = new THREE.Matrix4()
        .makeTranslation(sk.c.x, sk.c.y, sk.c.z)
        .multiply(new THREE.Matrix4().makeRotationFromQuaternion(_q.clone().invert().multiply(_q2)))
        .multiply(new THREE.Matrix4().makeScale(k2, k2, k2))
        .multiply(new THREE.Matrix4().makeTranslation(0, -0.2, 0));
    } else if (LIMB.has(k)) {
      // Limbs: at the joint itself, turned as at rest (the rigs' limbs differ in length).
      ref.decompose(_v, _q, _s);
      rest.decompose(_v, _q2, _s);
      off = new THREE.Matrix4()
        .makeRotationFromQuaternion(_q.clone().invert().multiply(_q2))
        .premultiply(new THREE.Matrix4().makeScale(1 / s, 1 / s, 1 / s));
      if (k === 'handL' || k === 'handR') off.setPosition(0, 0.05, 0);
    } else off = ref.clone().invert().multiply(rest);
    offsets.set(k, off);
  }
  st.offsets = offsets;
  show(c, false, !h.outfit.modelHair);
  h.object.updateMatrixWorld(true);
  return true;
}

function sync(c: Character, st: State, restPose: (c: Character) => void) {
  if (!st.human && !build(c, st, restPose)) return;
  const h = st.human!;
  const now = performance.now();
  const gap = st.last ? (now - st.last) / 1000 : 1;
  st.last = now;
  const dt = Math.min(0.1, gap);
  const fresh = st.posed && !changed(c, st.snap);
  st.posed = false;
  const clip = fresh ? CLIP[st.pose] : undefined;
  const want = clip ? 0 : 1;
  // A first frame, or one long after the last: no fade.
  if (gap > 0.5) st.w = want;
  else st.w += Math.sign(want - st.w) * Math.min(Math.abs(want - st.w), dt / FADE);
  if (st.w < 1) {
    if (clip) {
      h.play(clip[0], gap > 0.5 ? 0 : FADE, clip[1], st.phase * 0.7);
      st.clip = clip[0];
    } else h.play(st.clip, 0);
    h.update(gap > 0.5 ? 0 : dt);
  }
  h.object.updateMatrixWorld(true);
  if (st.w > 0) {
    for (const [k, bone] of MAP) {
      const j = joint(c, k);
      j.matrixWorld.decompose(_v, _q, _s);
      // How far the joint has turned from rest, applied to the bone's rest.
      const rest = st.rest!.get(k)!;
      rest.decompose(_v, _q2, _s);
      const t = targets.get(bone)!;
      t.copy(_q).multiply(_q2.invert());
      h.kit.refWorld.get(bone)!.decompose(_v, _q2, _s);
      t.multiply(_q2);
    }
    // The hips: where the joint's hips are, as the model's stood at rest.
    const hipsRest = st.rest!.get('hips')!;
    const bodyRef = h.kit.refWorld.get('Body');
    let body: THREE.Vector3 | null = null;
    if (bodyRef) {
      _s.setFromMatrixPosition(bodyRef).multiplyScalar(h.kit.scale);
      _v.setFromMatrixPosition(hipsRest);
      _s.sub(_v);
      body = new THREE.Vector3().setFromMatrixPosition(c.hips.matrixWorld);
      // (The offset is in the person's own space: turn it with them.)
      body.add(_s.applyQuaternion(c.root.getWorldQuaternion(_q)));
    }
    h.aim(targets, body, st.w);
  }
  // The low-poly joints onto the model's bones: what hangs on them follows the model.
  const offs = st.offsets!;
  for (const [k, bone] of MAP) {
    const b = h.bones.get(bone);
    if (!b) continue;
    const j = joint(c, k);
    j.matrixWorld.multiplyMatrices(b.matrixWorld, offs.get(k)!);
    for (const ch of j.children) if (!isJoint(c, ch)) ch.updateMatrixWorld(true);
  }
}

function isJoint(c: Character, o: THREE.Object3D) {
  for (const [k] of MAP) if (joint(c, k) === o) return true;
  return false;
}

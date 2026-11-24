/**
 * The CC0 people (./humans) sitting down: at a wheel, astride a motorbike,
 * pedalling a bicycle, on a bus seat, riding pillion. The kit has no seated
 * clips, so the pose is aimed bone by bone (`Human.aim`): each limb turned
 * from how it hangs standing (world rotations about the person's own axes,
 * so the rig's bone layout doesn't matter) and the hips put on the seat.
 *
 * - `SeatedPerson`: one live person (the player on a bike, a taxi driver,
 *   bus passengers), posed every frame (pedalling, a bump in the road).
 *   The far copy of the kit (a third of the triangles): they are seen from
 *   a chase camera, not close up. Until the kit arrives nothing is drawn; if
 *   the people are off (or never come), a low-poly person sits there instead.
 * - `bakeSeated`: one posed person as a plain geometry (vertex colours, the
 *   top marked as paint), merged into instanced traffic (an okada's rider,
 *   a keke's driver): one draw call for the whole fleet.
 *
 * Front +Z, up +Y; the person's left is +X. Metres.
 */
import * as THREE from 'three';
import { Human, kitNow, loadKit, humansEnabled, type AimedBone, type KitData } from './humans/kit';
import { outfitFor, type Kit, type OutfitLook } from './humans/outfit';

export type Seat = 'drive' | 'sit' | 'moto' | 'pedal' | 'pillion' | 'keke';

interface PoseDef {
  /** The hip joints' height and how far forward they sit. */
  seat: number;
  z: number;
  /** Lean forward (radians, + forward). */
  torso: number;
  /** Thighs and shins (+ back, − forward; 0 hangs down), and how far the knees part. */
  thigh: number;
  shin: number;
  knees: number;
  /** Upper arms and forearms (− forward), and how far the arms reach out to the side. */
  arm: number;
  fore: number;
  out: number;
}

/** Each seat's pose, as a person 1.75 m tall sits in it. */
const POSES: Record<Seat, PoseDef> = {
  // At a car's wheel: thighs level, shins down to the pedals, hands on the wheel.
  drive: {
    seat: 0.55,
    z: 0,
    torso: -0.12,
    thigh: -1.45,
    shin: -0.35,
    knees: 0.06,
    arm: -0.85,
    fore: -1.25,
    out: 0.12,
  },
  // A passenger: hands in the lap.
  sit: {
    seat: 0.5,
    z: 0,
    torso: -0.06,
    thigh: -1.5,
    shin: -0.1,
    knees: 0.05,
    arm: -0.3,
    fore: -1.05,
    out: 0.05,
  },
  // Astride a motorbike: knees out round the tank, feet back on the pegs, arms to the bars.
  moto: {
    seat: 0.8,
    z: 0,
    torso: 0.2,
    thigh: -1.05,
    shin: 0.45,
    knees: 0.22,
    arm: -0.95,
    fore: -1.05,
    out: 0.32,
  },
  // A keke's driver: upright, arms to the handlebar in front.
  keke: {
    seat: 0.72,
    z: 0,
    torso: 0.05,
    thigh: -1.35,
    shin: 0.05,
    knees: 0.12,
    arm: -0.9,
    fore: -1.15,
    out: 0.25,
  },
  // On a bicycle: leaning over the bars; the legs turn the pedals (phase).
  pedal: {
    seat: 0.95,
    z: 0,
    torso: 0.55,
    thigh: -0.95,
    shin: -0.15,
    knees: 0.04,
    arm: -1.15,
    fore: -0.55,
    out: 0.12,
  },
  // Behind the rider, holding on.
  pillion: {
    seat: 0.86,
    z: 0,
    torso: 0.12,
    thigh: -1.0,
    shin: 0.4,
    knees: 0.3,
    arm: -0.7,
    fore: -0.9,
    out: 0.22,
  },
};

const X = new THREE.Vector3(1, 0, 0);
const Z = new THREE.Vector3(0, 0, 1);
const _qa = new THREE.Quaternion();
const _qb = new THREE.Quaternion();
const _qr = new THREE.Quaternion();
const _ref = new THREE.Quaternion();
const _d = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const _m = new THREE.Matrix4();

/** Rotation about X (forward/back) after one about Z (out to the side). */
function delta(fwd: number, side: number, out: THREE.Quaternion) {
  _qa.setFromAxisAngle(X, fwd);
  _qb.setFromAxisAngle(Z, side);
  return out.copy(_qa).multiply(_qb);
}

/** How far the Body bone sits above the hip joints, per kit (metres). */
const bodyLift = new WeakMap<KitData, number>();
function liftOf(kit: KitData) {
  let l = bodyLift.get(kit);
  if (l === undefined) {
    const y = (n: string) => _v.setFromMatrixPosition(kit.refWorld.get(n) ?? _m.identity()).y;
    const hip = (y('UpperLegL') + y('UpperLegR')) / 2;
    l = (y('Body') - hip) * kit.scale;
    bodyLift.set(kit, l);
  }
  return l;
}

const targets = new Map<AimedBone, THREE.Quaternion>();
const T = (b: AimedBone) => {
  let q = targets.get(b);
  if (!q) targets.set(b, (q = new THREE.Quaternion()));
  return q;
};

/**
 * Pose a Human seated. `root` is the person's own frame (front +Z), the
 * Human's object a child of it at the origin. `phase` turns the pedals.
 */
function aimSeated(h: Human, root: THREE.Object3D, seat: Seat, phase: number, sway = 0) {
  const p = POSES[seat];
  root.updateWorldMatrix(true, false);
  root.matrixWorld.decompose(_v, _qr, _s);
  const set = (bone: AimedBone, fwd: number, side: number) => {
    const ref = h.kit.refWorld.get(bone);
    if (!ref) return;
    ref.decompose(_v, _ref, _s);
    delta(fwd, side, _d);
    T(bone).copy(_qr).multiply(_d).multiply(_ref);
  };
  const lean = p.torso + sway;
  set('Hips', 0, 0);
  set('Torso', lean, 0);
  set('Head', -lean * 0.7, 0);
  let tl = p.thigh;
  let tr = p.thigh;
  let sl = p.shin;
  let sr = p.shin;
  if (seat === 'pedal') {
    // The cranks go round: each knee rises and falls, the shin swinging under it.
    tl += Math.sin(phase) * 0.32;
    tr += Math.sin(phase + Math.PI) * 0.32;
    sl += Math.cos(phase) * 0.3;
    sr += Math.cos(phase + Math.PI) * 0.3;
  }
  set('UpperLegL', tl, p.knees);
  set('UpperLegR', tr, -p.knees);
  set('LowerLegL', sl, p.knees * 0.3);
  set('LowerLegR', sr, -p.knees * 0.3);
  set('UpperArmL', p.arm, p.out);
  set('UpperArmR', p.arm, -p.out);
  set('LowerArmL', p.fore, p.out * 0.4);
  set('LowerArmR', p.fore, -p.out * 0.4);
  set('WristL', p.fore, 0);
  set('WristR', p.fore, 0);
  const body = new THREE.Vector3(0, p.seat + liftOf(h.kit), p.z).applyMatrix4(root.matrixWorld);
  h.aim(targets, body, 1);
}

/** What `bakeSeated` and a low-poly stand-in wear: a look the outfits understand. */
export type SeatLook = OutfitLook;

/** A low-poly seated person (the people are off, or never arrived). */
function standIn(look: SeatLook, seat: Seat): THREE.Group {
  const p = POSES[seat];
  const g = new THREE.Group();
  const m = (c: string) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8 });
  const top = m(look.top);
  const bottom = m(look.bottom);
  const skin = m(look.skin);
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
    const o = new THREE.Mesh(geo, mat);
    o.position.set(x, y, z);
    o.castShadow = true;
    g.add(o);
    return o;
  };
  const hip = p.seat;
  const torso = add(new THREE.BoxGeometry(0.4, 0.6, 0.24).translate(0, 0.3, 0), top, 0, hip, 0);
  torso.rotation.x = p.torso;
  add(new THREE.SphereGeometry(0.13, 10, 8), skin, 0, hip + 0.78, Math.sin(p.torso) * 0.7);
  for (const sx of [-0.1, 0.1]) {
    const th = add(
      new THREE.BoxGeometry(0.15, 0.15, 0.45).translate(0, 0, 0.22),
      bottom,
      sx,
      hip,
      0,
    );
    th.rotation.y = 0;
    add(new THREE.BoxGeometry(0.14, 0.45, 0.15).translate(0, -0.22, 0), bottom, sx, hip, 0.44);
    const arm = add(
      new THREE.BoxGeometry(0.1, 0.1, 0.5).translate(0, 0, 0.25),
      top,
      sx * 2.6,
      hip + 0.52,
      Math.sin(p.torso) * 0.5,
    );
    arm.rotation.x = 0.4;
  }
  return g;
}

/**
 * One person sitting, drawn by the CC0 kit (far copy). Add `root` where the
 * seat is (its hip joints `POSES[seat].seat` above the root); call `update`
 * every frame it's seen.
 */
export class SeatedPerson {
  readonly root = new THREE.Group();
  private human: Human | null = null;
  private stand: THREE.Group | null = null;
  private outfitKit: Kit;
  private waiting = true;
  constructor(
    private look: SeatLook,
    private seat: Seat,
  ) {
    const outfit = outfitFor(look, { ownHair: false });
    this.outfitKit = outfit.kit;
    if (!humansEnabled()) this.useStandIn();
    else
      void loadKit(outfit.kit, true).then((k) => {
        if (!k && !this.human) this.useStandIn();
      });
  }

  private useStandIn() {
    if (this.stand || this.human) return;
    this.waiting = false;
    this.stand = standIn(this.look, this.seat);
    this.root.add(this.stand);
  }

  /** Whether the person is drawn (the CC0 model, or the stand-in). */
  get drawn() {
    return !!this.human || !!this.stand;
  }

  /** Pose for this frame: `phase` turns a bicycle's pedals, `sway` leans with a bump. */
  update(dt: number, phase = 0, sway = 0) {
    if (!this.human && this.waiting) {
      const kit = kitNow(this.outfitKit, true);
      if (kit) {
        const outfit = outfitFor(this.look, { ownHair: false });
        const h = new Human(kit, outfit);
        for (const m of h.meshes) {
          m.castShadow = false;
          m.frustumCulled = false;
        }
        h.play('Idle', 0, 1, (this.look.skin.charCodeAt(1) % 10) / 10);
        this.root.add(h.object);
        this.human = h;
        this.waiting = false;
      }
    }
    const h = this.human;
    if (!h) return;
    h.update(dt);
    h.object.updateMatrixWorld(true);
    aimSeated(h, this.root, this.seat, phase, sway);
  }

  dispose() {
    this.human?.dispose();
    this.human = null;
    this.stand?.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.geometry.dispose();
        (m.material as THREE.Material).dispose();
      }
    });
    this.root.removeFromParent();
  }
}

/** The kit node (Suit_Body…) a skinned mesh belongs to (as ./humans/kit.ts names it). */
function nodeOf(o: THREE.Object3D): string {
  return o.parent && !(o.parent as THREE.Bone).isBone && o.parent.name !== 'CharacterArmature'
    ? o.parent.name
    : o.name;
}

/** Whether the people's far copy can't come (off, or failed): traffic seats its own riders. */
export function seatedUnavailable(kit: Kit): boolean {
  if (!humansEnabled()) return true;
  return seatFailed.has(kit);
}
const seatFailed = new Set<Kit>();

/**
 * One person seated, as a plain geometry (position, normal, colour, and
 * `paint` 1 on their top so a fleet's instance colour dresses them), placed
 * by `at` (the seat's frame in the vehicle's space). Null until the kit's
 * far copy has arrived. A helmet on request (an okada rider's).
 */
export function bakeSeated(
  look: SeatLook,
  seat: Seat,
  at: THREE.Matrix4,
  o: { helmet?: string; paintTop?: boolean } = {},
): THREE.BufferGeometry | null {
  const outfit = outfitFor(look, { ownHair: false });
  const kit = kitNow(outfit.kit, true);
  if (!kit) {
    void loadKit(outfit.kit, true).then((k) => {
      if (!k) seatFailed.add(outfit.kit);
    });
    return null;
  }
  const h = new Human(kit, outfit);
  const root = new THREE.Group();
  root.add(h.object);
  h.play('Idle', 0);
  h.update(0);
  root.updateMatrixWorld(true);
  aimSeated(h, root, seat, 0);
  root.updateMatrixWorld(true);
  const parts: THREE.BufferGeometry[] = [];
  const v = new THREE.Vector3();
  for (const m of h.meshes) {
    if (!m.visible) continue;
    const src = m.geometry;
    const pos = src.getAttribute('position');
    const n = pos.count;
    const p = new Float32Array(n * 3);
    const c = new Float32Array(n * 3);
    const paint = new Float32Array(n);
    const mt = m.material as THREE.MeshStandardMaterial;
    const top = o.paintTop && nodeOf(m) === outfit.body && mt.name !== 'Skin';
    const col = top ? new THREE.Color(1, 1, 1) : mt.color;
    const mw = new THREE.Matrix4().multiplyMatrices(at, m.matrixWorld);
    for (let i = 0; i < n; i++) {
      m.getVertexPosition(i, v);
      v.applyMatrix4(mw);
      p.set([v.x, v.y, v.z], i * 3);
      c.set([col.r, col.g, col.b], i * 3);
      paint[i] = top ? 1 : 0;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    g.setAttribute('paint', new THREE.BufferAttribute(paint, 1));
    const idx = src.getIndex();
    g.setIndex(idx ? Array.from(idx.array as ArrayLike<number>) : [...Array(n).keys()]);
    g.computeVertexNormals();
    parts.push(g);
  }
  if (o.helmet) {
    const head = h.bones.get('Head');
    const sk = kit.skull.get(outfit.head);
    if (head && sk) {
      const centre = sk.c.clone().applyMatrix4(head.matrixWorld).applyMatrix4(at);
      const r = sk.r * kit.scale * 1.45;
      const g = new THREE.SphereGeometry(r, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.62);
      g.translate(centre.x, centre.y - r * 0.12, centre.z - r * 0.08);
      const n = g.getAttribute('position').count;
      const hc = new THREE.Color(o.helmet);
      const c = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) c.set([hc.r, hc.g, hc.b], i * 3);
      g.setAttribute('color', new THREE.BufferAttribute(c, 3));
      g.setAttribute('paint', new THREE.BufferAttribute(new Float32Array(n), 1));
      g.deleteAttribute('uv');
      parts.push(g);
    }
  }
  h.dispose();
  if (!parts.length) return null;
  // Same attributes everywhere (the helmet's sphere has uvs dropped above).
  for (const g of parts) {
    for (const k of Object.keys(g.attributes))
      if (!['position', 'normal', 'color', 'paint'].includes(k)) g.deleteAttribute(k);
  }
  const merged = new THREE.BufferGeometry();
  const all = parts.map((g) => (g.index ? g.toNonIndexed() : g));
  let count = 0;
  for (const g of all) count += g.getAttribute('position').count;
  for (const [name, size] of [
    ['position', 3],
    ['normal', 3],
    ['color', 3],
    ['paint', 1],
  ] as const) {
    const arr = new Float32Array(count * size);
    let off = 0;
    for (const g of all) {
      const a = g.getAttribute(name);
      for (let i = 0; i < a.count; i++)
        for (let k = 0; k < size; k++) arr[(off + i) * size + k] = a.getComponent(i, k);
      off += a.count;
    }
    merged.setAttribute(name, new THREE.BufferAttribute(arr, size));
  }
  merged.setIndex([...Array(count).keys()]);
  return merged;
}

/** A seated person's hip-joint height for a seat (to put them on it). */
export const seatHeight = (seat: Seat) => POSES[seat].seat;

/**
 * The flight's camera and the aircraft you are in, Inside or Outside
 * (./AirFlight.tsx steps the flight; this places the camera and the models).
 *
 * - Helicopter. Outside: a chase camera behind and above the helicopter
 *   (it banks into turns, its rotors turn). Inside: from the back of the
 *   cabin, over the seats, the pilot and the instrument panel, through the
 *   bubble.
 * - Skydive. Outside: the jump plane with you in its open door, then a chase
 *   camera on you in freefall (the box position, or tracking), under the
 *   canopy and on the ground. Inside: the door's frame, then first person
 *   (your sleeves and gloves, the wrist altimeter, the goggles), the canopy
 *   overhead.
 *
 * The models are drawn in a second pass over the city (`draw`, after the
 * city's own frame) with a near plane of centimetres, so a cabin a metre
 * from your eye isn't cut away and the city's depth buffer keeps its range.
 * They are placed relative to the camera (no wobble from big coordinates).
 */
import * as THREE from 'three';
import type { AvatarLook } from '../../city/art';
import { disposeTree } from '../../interiors3d/kit';
import { screenBoxOf } from '../../three-kit/screen-box';
import type { Character } from '../../interiors3d/character';
import {
  boxPose,
  canopy,
  canopyPose,
  cockpit,
  doorPose,
  flarePose,
  freefallArms,
  helicopter,
  jumpPlane,
  jumper,
  landPose,
  suitColours,
  type Craft,
} from './craft';
import { toTarget, type Heli, type Jump } from './flight';

export type AirCamMode = 'inside' | 'outside';

const CAM_KEY = 'runway.airCam';

/** Your last choice, Inside or Outside (Outside the first time: you see what you're in). */
export function savedCamMode(player: string): AirCamMode {
  try {
    return localStorage.getItem(`${CAM_KEY}.${player}`) === 'inside' ? 'inside' : 'outside';
  } catch {
    return 'outside';
  }
}

export function saveCamMode(player: string, mode: AirCamMode) {
  try {
    localStorage.setItem(`${CAM_KEY}.${player}`, mode);
  } catch {
    // Private mode or storage off: the choice lasts this flight.
  }
}

/** The flight's camera as the rig sets it: where, which way, how wide. */
export interface CamPose {
  readonly pos: THREE.Vector3;
  yaw: number;
  pitch: number;
  fov: number;
}

/** What the rig shows (for tests): which model, or none. */
export type Shown = '' | 'heli' | 'cockpit' | 'plane' | 'jumper' | 'canopy' | 'arms';

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _d = new THREE.Vector3();
const _e = new THREE.Vector3();
const _f = new THREE.Vector3();
const _g = new THREE.Vector3();
const _h = new THREE.Vector3();
const ZERO = new THREE.Vector3();
const ease = (u: number) => u * u * (3 - 2 * u);

/** Where the Outside camera looks from (the craft's frame: x right, y up, +z behind). */
const CLIMB_DIR = new THREE.Vector3(-0.62, 0.34, 0.71);
const DOOR_DIR = new THREE.Vector3(-0.88, 0.24, 0.42);
const CANOPY_DIR = new THREE.Vector3(0.3, 0.42, 1);
/** You under the canopy, in your frame (feet at 0): its span, its top, you. */
const CANOPY_BOX = new THREE.Box3(
  new THREE.Vector3(-4.1, -0.1, -1.6),
  new THREE.Vector3(4.1, 7.4, 1.6),
);

/**
 * How far from `centre` (along `dir`, from it towards the camera) a camera
 * with this vertical `fov` (degrees) and `aspect` must stand to see all of
 * `box` (the craft's frame, heading `h`, placed at the origin) inside
 * `margin` of the screen's half-width and half-height.
 */
export function fitDistance(
  box: THREE.Box3,
  h: number,
  dir: THREE.Vector3,
  centre: THREE.Vector3,
  fov: number,
  aspect: number,
  margin = 0.85,
) {
  const tanV = Math.tan(((fov / 2) * Math.PI) / 180) * margin;
  const tanH = Math.tan(((fov / 2) * Math.PI) / 180) * aspect * margin;
  // The camera's frame: it looks along −dir; right and up across the screen.
  const f = _fwd.copy(dir).negate();
  const r = _right.crossVectors(f, UP);
  if (r.lengthSq() < 1e-6) r.set(1, 0, 0);
  r.normalize();
  const u = _up.crossVectors(r, f).normalize();
  let need = 1;
  const p = new THREE.Vector3();
  for (let i = 0; i < 8; i++) {
    toWorld(
      p,
      ZERO,
      h,
      i & 1 ? box.max.x : box.min.x,
      i & 2 ? box.max.y : box.min.y,
      i & 4 ? box.max.z : box.min.z,
    ).sub(centre);
    const z = p.dot(f);
    need = Math.max(need, Math.abs(p.dot(r)) / tanH - z, Math.abs(p.dot(u)) / tanV - z);
  }
  return need;
}
/**
 * The camera fitted at `dist` along `dir` from `centre` sees the box's
 * middle off the screen's (perspective draws its near end lower and bigger):
 * the shift (world) that pans the camera so the box sits centred across and
 * `lift` (−1 … 1) above the middle up the screen.
 */
export function centring(
  box: THREE.Box3,
  h: number,
  dir: THREE.Vector3,
  centre: THREE.Vector3,
  dist: number,
  fov: number,
  aspect: number,
  lift = 0,
  out = new THREE.Vector3(),
) {
  const tanV = Math.tan(((fov / 2) * Math.PI) / 180);
  const tanH = tanV * aspect;
  const f = _fwd.copy(dir).negate();
  const r = _right.crossVectors(f, UP);
  if (r.lengthSq() < 1e-6) r.set(1, 0, 0);
  r.normalize();
  const u = _up.crossVectors(r, f).normalize();
  let l = Infinity;
  let rt = -Infinity;
  let b = Infinity;
  let t = -Infinity;
  const p = new THREE.Vector3();
  for (let i = 0; i < 8; i++) {
    toWorld(
      p,
      ZERO,
      h,
      i & 1 ? box.max.x : box.min.x,
      i & 2 ? box.max.y : box.min.y,
      i & 4 ? box.max.z : box.min.z,
    ).sub(centre);
    const depth = Math.max(0.1, dist + p.dot(f));
    const x = p.dot(r) / (depth * tanH);
    const y = p.dot(u) / (depth * tanV);
    l = Math.min(l, x);
    rt = Math.max(rt, x);
    b = Math.min(b, y);
    t = Math.max(t, y);
  }
  const mx = (l + rt) / 2;
  const my = (b + t) / 2 - lift;
  return out
    .copy(r)
    .multiplyScalar(mx * dist * tanH)
    .addScaledVector(u, my * dist * tanV);
}
const UP = new THREE.Vector3(0, 1, 0);
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();

/** Point the camera from `from` at `to`. */
function aim(cam: CamPose, from: THREE.Vector3, to: THREE.Vector3) {
  cam.pos.copy(from);
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  cam.yaw = Math.atan2(dx, -dz);
  cam.pitch = Math.atan2(to.y - from.y, Math.hypot(dx, dz));
}

/**
 * How far to raise a chase camera at `from`, looking at `at`, so it and its
 * line of sight back to the craft stay `gap` m above whatever stands under
 * them (`top`: world y of the ground or roof at a point).
 */
export function chaseLift(
  at: { x: number; y: number; z: number },
  from: { x: number; y: number; z: number },
  top: (x: number, z: number) => number,
  gap = 2,
) {
  let lift = 0;
  for (const t of [0.4, 0.7, 1]) {
    const y = at.y + (from.y - at.y) * t;
    const need = top(at.x + (from.x - at.x) * t, at.z + (from.z - at.z) * t) + gap - y;
    // Raised by `need / t` at the camera, the line is raised by `need` here.
    lift = Math.max(lift, need / t);
  }
  return lift;
}

/** A point in a craft's frame (heading `h`, nose towards −z) out in the world. */
function toWorld(
  out: THREE.Vector3,
  at: THREE.Vector3,
  h: number,
  x: number,
  y: number,
  z: number,
) {
  const c = Math.cos(h);
  const s = Math.sin(h);
  // Turning by −h about y takes the nose (−z) to the heading (sin h, −cos h).
  return out.set(at.x + x * c - z * s, at.y + y, at.z + x * s + z * c);
}

export class AirRig {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(60, 1, 0.05, 800);
  shown: Shown = '';
  /** Frames drawn (tests wait for one after a change). */
  frames = 0;
  private crafts: Craft[] = [];
  private heli?: Craft;
  private cabin?: Craft;
  private plane?: Craft & { door: THREE.Vector3 };
  private you?: Character;
  /** The jumper's frame: turned to the heading, then rolled by the body. */
  private holder = new THREE.Group();
  private chute?: THREE.Group;
  private arms?: Craft & { setAlt: (m: number) => void };
  private bank = 0;
  private lastHeading: number | null = null;
  private pose = '';
  /** The screen's shape (width / height): the shots are fitted to it. */
  aspect =
    typeof window !== 'undefined' && window.innerHeight
      ? window.innerWidth / window.innerHeight
      : 1;
  private phase = '';
  private phaseAt = 0;
  private lastNow: number | null = null;
  private lastMode: AirCamMode | '' = '';
  private camSet = false;
  private readonly camFrom = new THREE.Vector3();
  private readonly camTo = new THREE.Vector3();
  /** The jump plane's extent in its own frame (with you in the door). */
  private planeBox = new THREE.Box3();
  /** The helicopter's extent in its own frame (rotor and tail). */
  private heliBox = new THREE.Box3();

  constructor(
    kind: 'skydive' | 'heli',
    look: AvatarLook,
    private readonly o: { reduced: boolean; night: boolean },
  ) {
    const hemi = new THREE.HemisphereLight(
      o.night ? '#94a3b8' : '#e0f2fe',
      '#6b7280',
      o.night ? 1.0 : 1.6,
    );
    const sun = new THREE.DirectionalLight(o.night ? '#a5b4fc' : '#fff7e6', o.night ? 0.6 : 2.2);
    sun.position.set(0.5, 1, 0.3);
    this.scene.add(hemi, sun, this.camera);
    const add = <T extends Craft>(c: T) => {
      c.group.visible = false;
      this.scene.add(c.group);
      this.crafts.push(c);
      return c;
    };
    if (kind === 'heli') {
      this.heli = add(helicopter({ reduced: o.reduced }));
      this.heliBox.setFromObject(this.heli.group);
      this.cabin = add(cockpit({ reduced: o.reduced }));
    } else {
      this.plane = add(jumpPlane({ reduced: o.reduced }));
      this.you = jumper(look);
      // You sit in the door from the start: the plane's extent counts your legs out in the wind.
      this.seatInDoor();
      this.planeBox.setFromObject(this.plane.group);
      this.holder.add(this.you.root);
      this.holder.visible = false;
      this.scene.add(this.holder);
      this.chute = canopy();
      this.chute.visible = false;
      this.holder.add(this.chute);
      this.arms = freefallArms(suitColours(look).suit);
      this.arms.group.visible = false;
      this.camera.add(this.arms.group);
      this.crafts.push(this.arms);
    }
  }

  private show(which: Shown) {
    this.shown = which;
    if (this.heli) this.heli.group.visible = which === 'heli';
    if (this.cabin) this.cabin.group.visible = which === 'cockpit';
    if (this.plane) this.plane.group.visible = which === 'plane';
    if (this.arms) this.arms.group.visible = which === 'arms';
    this.holder.visible = which === 'jumper' || which === 'canopy';
    if (this.chute) this.chute.visible = which === 'canopy';
  }

  /** You, sitting on the jump door's sill. */
  private seatInDoor() {
    const plane = this.plane!;
    const you = this.you!;
    plane.group.add(you.root);
    doorPose(you);
    you.root.position.set(plane.door.x - 0.12, plane.door.y - 0.79, plane.door.z + 0.05);
    this.pose = 'door';
  }

  /** Turn what turns (rotors, props). */
  private turn(c: Craft | undefined, dt: number) {
    if (!c?.group.visible) return;
    for (const s of c.spin) s.part.rotation[s.axis] += s.rate * dt;
  }

  /** Put a craft at `at` (world) on heading `h`, relative to the camera. */
  private put(g: THREE.Object3D, cam: CamPose, at: THREE.Vector3, h: number, pitch = 0, roll = 0) {
    g.position.copy(at).sub(cam.pos);
    g.rotation.set(pitch, -h, roll, 'YXZ');
  }

  /**
   * The helicopter: `y` is the height of its skids. Places the camera
   * (Inside or Outside) and the model. `top` (world y of the highest thing
   * standing at a point, the ground or a roof): the Outside camera keeps
   * above it, never inside a building (low over the city, on the pad).
   */
  placeHeli(
    h: Heli,
    y: number,
    mode: AirCamMode,
    cam: CamPose,
    dt: number,
    top?: (x: number, z: number) => number,
  ) {
    // Bank into turns, from how fast the heading changes (smoothed).
    const d =
      this.lastHeading === null
        ? 0
        : Math.atan2(
            Math.sin(h.heading - this.lastHeading),
            Math.cos(h.heading - this.lastHeading),
          );
    this.lastHeading = h.heading;
    const rate = dt > 0 ? d / dt : 0;
    const want = Math.max(-0.35, Math.min(0.35, rate * 0.7));
    this.bank += (want - this.bank) * Math.min(1, dt * 3);
    const at = _a.set(h.x, y, h.z);
    const flying = h.alt > 2;
    if (mode === 'outside') {
      // Behind, above and a little to the left. A tall phone sees less across: the
      // camera is fitted to the whole helicopter, rotor and tail, looking at its middle.
      let from: THREE.Vector3;
      let to: THREE.Vector3;
      if (this.aspect < 1) {
        const d = toWorld(_d, ZERO, h.heading, -4.5, 6.5, 17).normalize();
        const mid = this.heliBox.getCenter(_e);
        const centre = toWorld(_f, ZERO, h.heading, mid.x, mid.y, mid.z);
        const dist = fitDistance(this.heliBox, h.heading, d, centre, 58, this.aspect, 0.78);
        from = _b.copy(at).add(centre).addScaledVector(d, dist);
        to = _c.copy(at).add(centre);
      } else {
        from = toWorld(_b, at, h.heading, -4.5, 6.5, 17);
        to = toWorld(_c, at, h.heading, 0, flying ? -2.5 : 0.5, -2);
      }
      if (top) from.y += chaseLift(at, from, top);
      aim(cam, from, to);
      cam.fov = 58;
      this.show('heli');
      this.put(
        this.heli!.group,
        cam,
        at,
        h.heading,
        flying ? -0.05 * (h.speed / 75) : 0,
        this.bank,
      );
      this.turn(this.heli, dt);
    } else {
      // In the back of the cabin, over the seats: the pilot on the right, the panel, the city.
      toWorld(cam.pos, at, h.heading, -0.15, 2.25, 1.6);
      cam.yaw = h.heading + 0.12;
      cam.pitch = h.alt < 40 ? -0.2 : -0.33;
      cam.fov = 76;
      this.show('cockpit');
      this.put(this.cabin!.group, cam, at, h.heading);
      this.turn(this.cabin, dt);
    }
  }

  /**
   * The skydive: `base` is the ground at the target. Places the camera
   * (Inside or Outside) and you, the plane or the canopy. `track`: you're
   * tracking (arms back). Inside, the page draws the door's frame, the
   * goggles or the canopy overhead (./AirFlight.tsx).
   *
   * The camera is placed first and the models against it (placed before it,
   * a fast climb or fall left them one frame's travel behind: on a slow
   * phone the plane slid out of the picture and only its wheels showed).
   * Outside, the shots are fitted to the screen (`fit`: the whole plane, the
   * whole canopy, on a tall phone too), and between phases the camera glides
   * (no cut from freefall to the canopy) unless motion is reduced.
   */
  placeJump(
    j: Jump,
    base: number,
    mode: AirCamMode,
    cam: CamPose,
    dt: number,
    now: number,
    o: { track: boolean; turn: number },
  ) {
    const tt = toTarget(j);
    const at = _a.set(j.x, base + j.alt, j.z);
    const still = this.o.reduced;
    if (j.phase !== this.phase) {
      this.phaseAt = now;
      this.phase = j.phase;
    }
    // The camera glides in real time (a slowed or sped-up jump glides the same).
    const wall =
      this.lastNow === null ? 0 : Math.min(0.5, Math.max(0, (now - this.lastNow) / 1000));
    this.lastNow = now;
    // Seconds since this phase began (on screen).
    const since = Math.max(0, (now - this.phaseAt) / 1000);
    if (mode === 'inside') {
      this.lastMode = mode;
      // First person, as you'd see it: the door, the ground, the canopy overhead.
      cam.pos.set(j.x, base + j.alt + 1.7, j.z);
      if (j.phase === 'climb' || j.phase === 'door') {
        cam.yaw = tt.bearing + 0.9;
        cam.pitch = -0.42;
        cam.fov = 62;
        this.show('');
      } else if (j.phase === 'freefall') {
        cam.yaw = j.heading;
        cam.pitch = -1.12 + (still ? 0 : Math.sin(now / 900) * 0.02) + j.body * 0.08;
        cam.fov = 66;
        this.show('arms');
        this.arms!.setAlt(j.alt);
      } else if (j.phase === 'canopy') {
        cam.yaw = j.heading;
        cam.pitch = -0.5 + Math.min(0.3, Math.max(0, (200 - j.alt) / 600));
        cam.fov = 64;
        this.show('');
      } else {
        cam.yaw = tt.bearing;
        cam.pitch = -0.08;
        cam.fov = 60;
        this.show('');
      }
      return;
    }
    const cut = this.lastMode !== mode || still;
    this.lastMode = mode;
    const tall = this.aspect < 1;
    const fov = tall ? 62 : 52;
    const you = this.you!;
    if (j.phase === 'climb' || j.phase === 'door') {
      // The plane, broadside: you sit in the door on its left, facing where you'd look out.
      const heading = tt.bearing + 0.9 + Math.PI / 2;
      const plane = this.plane!;
      // Climbing: from behind and above on the door's side; at the door, more from the side.
      const dir = j.phase === 'climb' ? CLIMB_DIR : DOOR_DIR;
      this.glide(heading, this.planeBox, dir, fov, cut || this.shown !== 'plane', wall, 1.6, 0.92);
      this.aimFrom(cam, at);
      cam.fov = fov;
      this.show('plane');
      this.put(plane.group, cam, at, heading, 0.03, still ? 0 : Math.sin(now / 1300) * 0.02);
      if (you.root.parent !== plane.group || this.pose !== 'door') this.seatInDoor();
      this.turn(plane, dt);
      return;
    }
    if (you.root.parent !== this.holder) {
      this.holder.add(you.root);
      this.pose = '';
    }
    const fx = Math.sin(j.heading);
    const fz = -Math.cos(j.heading);
    const chute = this.chute!;
    if (j.phase === 'freefall') {
      const p = o.track ? 'track' : 'box';
      if (this.pose !== p) {
        boxPose(you, o.track);
        // The body's middle at the jumper's point (it lies along +z from the feet).
        you.root.position.set(0, 0, -0.85);
        this.pose = p;
      }
      // Chasing you from behind and above; a tall phone stands back a little more.
      const k = tall ? 1.45 : 1;
      this.want(
        _b.set(-fx * 3.4 * k, 2.6 * k, -fz * 3.4 * k),
        _c.set(fx * 0.8, -1.2, fz * 0.8),
        cut || this.shown === 'plane',
        wall,
        2.2,
      );
      this.aimFrom(cam, at);
      cam.fov = fov;
      this.show('jumper');
      const wobble = still ? 0 : Math.sin(now / 420) * 0.04;
      this.holder.position.copy(at).sub(cam.pos);
      this.holder.rotation.set(0, Math.PI - j.heading, j.body * 0.45 + wobble, 'YXZ');
      return;
    }
    // Under the canopy (it opens over a second: you swing upright under it), then on the ground.
    const flaring = j.phase === 'canopy' && j.flared && j.alt < 25;
    const p = j.phase === 'canopy' ? (flaring ? 'flare' : `canopy${Math.sign(o.turn)}`) : 'landed';
    if (this.pose !== p) {
      if (p === 'flare') flarePose(you);
      else canopyPose(you, j.phase === 'canopy' ? o.turn : 0);
      you.root.position.set(0, 0, 0);
      this.pose = p;
    }
    const heading = j.heading;
    if (j.phase === 'canopy') {
      const open = still ? 1 : ease(Math.min(1, since / 1.1));
      chute.scale.set(0.25 + 0.75 * open, 0.15 + 0.85 * open, 0.4 + 0.6 * open);
      chute.rotation.set(0, 0, 0);
      chute.position.set(0, 0, 0);
      // From lying in the box position to hanging upright in the harness.
      const up = still ? 1 : ease(Math.min(1, since / 0.8));
      you.root.rotation.x = (Math.PI / 2) * (1 - up);
      you.root.position.set(0, 0.9 * (1 - up), -0.85 * (1 - up));
      // From behind and above, the whole canopy and you under it.
      this.glide(heading, CANOPY_BOX, CANOPY_DIR, fov, cut, wall, 3, 0.88);
    } else {
      // Landed: a few running steps as the canopy settles behind you, then you stand.
      const run = still ? 1 : Math.min(1, since / 1.3);
      if (run < 1) {
        landPose(you, now / 1000, run);
        this.pose = '';
      } else if (this.pose !== 'stood') {
        landPose(you, 0, 1);
        this.pose = 'stood';
      }
      const fall = still ? 1 : ease(Math.min(1, since / 1.6));
      chute.scale.set(1, Math.max(0.05, 1 - fall * 0.9), 1);
      chute.rotation.set(fall * 1.35, 0, 0);
      chute.position.set(0, 0, 0);
      // In front and to the side, looking back at you (your face, the suit),
      // you in the upper part of a tall screen (the result card is below).
      const ahead = still ? 2.4 : 2.4 * ease(run);
      you.root.position.set(0, 0, ahead);
      this.want(
        toWorld(_b, ZERO, heading, 2.4, 1.6, -ahead - 4.6).sub(ZERO),
        toWorld(_c, ZERO, heading, 0, tall ? 0.15 : 0.65, -ahead).sub(ZERO),
        cut || this.shown === 'canopy',
        wall,
        2,
      );
    }
    this.aimFrom(cam, at);
    cam.fov = fov;
    this.show(j.phase === 'canopy' ? 'canopy' : 'jumper');
    // The collapsing canopy stays in view a moment after touchdown.
    chute.visible = j.phase === 'canopy' || (!still && since < 1.8);
    this.holder.position.copy(at).sub(cam.pos);
    this.holder.rotation.set(
      0,
      Math.PI - heading,
      j.phase === 'canopy' ? -o.turn * 0.15 : 0,
      'YXZ',
    );
  }

  /** The camera's offsets from the jumper (`from`, `to`): set, or eased towards. */
  private want(from: THREE.Vector3, to: THREE.Vector3, cut: boolean, dt: number, k: number) {
    if (cut || !this.camSet) {
      this.camFrom.copy(from);
      this.camTo.copy(to);
      this.camSet = true;
      return;
    }
    const e = 1 - Math.exp(-Math.max(0, dt) * k);
    this.camFrom.lerp(from, e);
    this.camTo.lerp(to, e);
  }

  /**
   * Fit a shot: looking along `dir` (the craft's frame, heading `h`) at the
   * middle of `box`, from as near as keeps the whole box on screen at this
   * `fov` and the screen's shape (with a margin round it).
   */
  private glide(
    h: number,
    box: THREE.Box3,
    dir: THREE.Vector3,
    fov: number,
    cut: boolean,
    dt: number,
    k: number,
    margin: number,
  ) {
    const d = toWorld(_d, ZERO, h, dir.x, dir.y, dir.z).normalize();
    const mid = box.getCenter(_e);
    const centre = toWorld(_f, ZERO, h, mid.x, mid.y, mid.z);
    let dist = fitDistance(box, h, d, centre, fov, this.aspect, margin);
    // Centred on screen, a little above the middle (the controls are at the bottom).
    // (Half steps: the near end moves faster on screen than the middle, so a whole
    // step overshoots.)
    for (let i = 0; i < 6; i++) {
      centre.addScaledVector(centring(box, h, d, centre, dist, fov, this.aspect, 0.1, _g), 0.5);
      dist = fitDistance(box, h, d, centre, fov, this.aspect, margin);
    }
    this.want(_b.copy(centre).addScaledVector(d, dist), _c.copy(centre), cut, dt, k);
  }

  private aimFrom(cam: CamPose, at: THREE.Vector3) {
    aim(cam, _g.copy(at).add(this.camFrom), _h.copy(at).add(this.camTo));
  }

  /**
   * Where what's shown lands on the screen (tests): its box's corners
   * projected through a camera posed like `cam`, as −1 … 1 across and up
   * (left, right, bottom, top), or null with nothing shown.
   */
  screenBox(cam: CamPose, aspect = this.aspect) {
    const obj =
      this.shown === 'plane'
        ? this.plane?.group
        : this.shown === 'jumper'
          ? this.you?.root
          : this.shown === 'canopy'
            ? this.holder
            : this.shown === 'heli'
              ? this.heli?.group
              : null;
    if (!obj) return null;
    const c = new THREE.PerspectiveCamera(cam.fov, aspect, 0.05, 2000);
    const cp = Math.cos(cam.pitch);
    c.position.set(0, 0, 0);
    c.lookAt(Math.sin(cam.yaw) * cp, Math.sin(cam.pitch), -Math.cos(cam.yaw) * cp);
    return screenBoxOf(obj, c);
  }

  /** Draw the models over the city's frame (call after it renders). */
  draw(renderer: THREE.WebGLRenderer, main: THREE.PerspectiveCamera) {
    if (!this.shown) return;
    const c = this.camera;
    c.quaternion.copy(main.quaternion);
    c.fov = main.fov;
    c.aspect = main.aspect;
    this.aspect = main.aspect;
    c.updateProjectionMatrix();
    c.updateMatrixWorld();
    const auto = renderer.autoClear;
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(this.scene, c);
    renderer.autoClear = auto;
    this.frames++;
  }

  /**
   * Compile every model's shaders now, off the main thread where the GPU
   * can (not on the first frame each one shows: a stall on a slow phone).
   */
  warm(renderer: THREE.WebGLRenderer) {
    const was = this.scene.children.map((c) => c.visible);
    const parts = [this.arms?.group, this.chute].filter((x): x is THREE.Group => !!x);
    const partsWas = parts.map((p) => p.visible);
    for (const c of this.scene.children) c.visible = true;
    for (const p of parts) p.visible = true;
    const done = renderer.compileAsync(this.scene, this.camera).catch(() => undefined);
    this.scene.children.forEach((c, i) => (c.visible = was[i]!));
    parts.forEach((p, i) => (p.visible = partsWas[i]!));
    return done;
  }

  dispose() {
    for (const c of this.crafts) for (const t of c.textures) t.dispose();
    disposeTree(this.scene);
    this.scene.clear();
  }
}

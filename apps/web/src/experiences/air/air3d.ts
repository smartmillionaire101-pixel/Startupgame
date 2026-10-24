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
import type { Character } from '../../interiors3d/character';
import {
  boxPose,
  canopy,
  canopyPose,
  cockpit,
  doorPose,
  freefallArms,
  helicopter,
  jumpPlane,
  jumper,
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

/** Point the camera from `from` at `to`. */
function aim(cam: CamPose, from: THREE.Vector3, to: THREE.Vector3) {
  cam.pos.copy(from);
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  cam.yaw = Math.atan2(dx, -dz);
  cam.pitch = Math.atan2(to.y - from.y, Math.hypot(dx, dz));
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
      this.cabin = add(cockpit({ reduced: o.reduced }));
    } else {
      this.plane = add(jumpPlane({ reduced: o.reduced }));
      this.you = jumper(look);
      this.holder.add(this.you.root);
      this.holder.visible = false;
      this.scene.add(this.holder);
      this.chute = canopy();
      this.chute.visible = false;
      this.holder.add(this.chute);
      this.arms = freefallArms();
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
   * (Inside or Outside) and the model.
   */
  placeHeli(h: Heli, y: number, mode: AirCamMode, cam: CamPose, dt: number) {
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
      // Behind, above and a little to the left, looking down past the cabin.
      const from = toWorld(_b, at, h.heading, -4.5, 6.5, 17);
      const to = toWorld(_c, at, h.heading, 0, flying ? -2.5 : 0.5, -2);
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
    if (mode === 'inside') {
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
    const you = this.you!;
    if (j.phase === 'climb' || j.phase === 'door') {
      // The plane, broadside: you sit in the door on its left, facing where you'd look out.
      const heading = tt.bearing + 0.9 + Math.PI / 2;
      const plane = this.plane!;
      this.show('plane');
      this.put(plane.group, cam, at, heading, 0.03, still ? 0 : Math.sin(now / 1300) * 0.02);
      if (you.root.parent !== plane.group) {
        plane.group.add(you.root);
        this.pose = '';
      }
      if (this.pose !== 'door') {
        doorPose(you);
        you.root.position.set(plane.door.x - 0.12, plane.door.y - 0.79, plane.door.z + 0.05);
        this.pose = 'door';
      }
      aim(cam, toWorld(_b, at, heading, -7.2, 2.6, 7.5), toWorld(_c, at, heading, -0.8, -0.6, 0.8));
      cam.fov = 58;
      this.turn(plane, dt);
      return;
    }
    if (you.root.parent !== this.holder) {
      this.holder.add(you.root);
      this.pose = '';
    }
    const fx = Math.sin(j.heading);
    const fz = -Math.cos(j.heading);
    if (j.phase === 'freefall') {
      const p = o.track ? 'track' : 'box';
      if (this.pose !== p) {
        boxPose(you, o.track);
        // The body's middle at the jumper's point (it lies along +z from the feet).
        you.root.position.set(0, 0, -0.85);
        this.pose = p;
      }
      this.show('jumper');
      const wobble = still ? 0 : Math.sin(now / 420) * 0.04;
      this.holder.position.copy(at).sub(cam.pos);
      this.holder.rotation.set(0, Math.PI - j.heading, j.body * 0.45 + wobble, 'YXZ');
      aim(
        cam,
        _b.set(at.x - fx * 3.4, at.y + 2.6, at.z - fz * 3.4),
        _c.set(at.x + fx * 0.8, at.y - 1.2, at.z + fz * 0.8),
      );
      cam.fov = 62;
      return;
    }
    // Under the canopy, then on the ground.
    const p = j.phase === 'canopy' ? `canopy${Math.sign(o.turn)}` : 'landed';
    if (this.pose !== p) {
      canopyPose(you, j.phase === 'canopy' ? o.turn : 0);
      if (j.phase !== 'canopy') {
        you.armL.rotation.set(0, 0, 0.1);
        you.armR.rotation.set(0, 0, -0.1);
      }
      you.root.position.set(0, 0, 0);
      this.pose = p;
    }
    this.show(j.phase === 'canopy' ? 'canopy' : 'jumper');
    this.holder.position.copy(at).sub(cam.pos);
    this.holder.rotation.set(
      0,
      Math.PI - j.heading,
      j.phase === 'canopy' ? -o.turn * 0.15 : 0,
      'YXZ',
    );
    if (j.phase === 'canopy')
      aim(
        cam,
        _b.set(at.x - fx * 11, at.y + 5.5, at.z - fz * 11),
        _c.set(at.x + fx * 3, at.y + 2.2, at.z + fz * 3),
      );
    else aim(cam, _b.set(at.x - fx * 5, at.y + 2.2, at.z - fz * 5), _c.set(at.x, at.y + 1, at.z));
    cam.fov = 60;
  }

  /** Draw the models over the city's frame (call after it renders). */
  draw(renderer: THREE.WebGLRenderer, main: THREE.PerspectiveCamera) {
    if (!this.shown) return;
    const c = this.camera;
    c.quaternion.copy(main.quaternion);
    c.fov = main.fov;
    c.aspect = main.aspect;
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

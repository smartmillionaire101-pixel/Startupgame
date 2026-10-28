/**
 * Round 7e: you in the table games, on the current avatar model
 * (../interiors3d/character.ts), drawn in a see-through WebGL layer over
 * the 2D canvas of the game (it never takes a tap: the swipe, the dive
 * buttons and the cue stay the game's own).
 *
 * - The penalty shootout: the kicker in a football kit in your outfit's
 *   colours (the shirt your top's, the shorts and socks your trousers'),
 *   ready a couple of steps back and to the left of the ball, then the
 *   run-up, the plant beside the ball, the strike and the follow-through.
 *   Seen through the shootout's own camera (./shootout-view.ts), so the
 *   kicker stands on the same pitch as the 2D ball and the goal.
 * - 8-ball pool, top down: whoever is at the table leans over it along the
 *   cue, the bridge hand on the cloth behind the cue ball, the cue hand
 *   back at the hip (it draws back with the pull), standing at the rail
 *   and leaning less when the cue ball is close to it, always inside the
 *   picture.
 *
 * Loaded on demand (three.js only when a game is played in 3D).
 */
import * as THREE from 'three';
import { FOOTBALL_R, SPOT } from '@runway/engine';
import type { AvatarLook } from '../city/art';
import { makeCharacter, pose, type Character } from '../interiors3d/character';
import { disposeTree } from '../interiors3d/kit';
import { screenBoxOf, type ScreenBox } from '../three-kit/screen-box';
import { KICKER_Z, KICK_RUN, type Camera as PitchCamera } from './shootout-view';

/** How bright a colour is (0 … 1). */
function luma(hex: string) {
  const c = new THREE.Color(hex);
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
}

/** A see-through WebGL layer with a little light, the people built once each. */
class Layer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  protected people = new Map<string, Character>();
  protected who: Character | null = null;

  constructor(
    readonly canvas: HTMLCanvasElement,
    soft: boolean,
  ) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: !soft,
      premultipliedAlpha: true,
    });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, soft ? 1 : 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    const hemi = new THREE.HemisphereLight('#f8fafc', '#475569', 1.7);
    const key = new THREE.DirectionalLight('#fff7e6', 2.0);
    key.position.set(-0.6, 1.4, 0.8);
    const rim = new THREE.DirectionalLight('#c7d2fe', 0.6);
    rim.position.set(0.8, 0.6, -1);
    this.scene.add(hemi, key, rim);
  }

  resize(w: number, h: number) {
    this.renderer.setSize(Math.max(1, Math.round(w)), Math.max(1, Math.round(h)), false);
  }

  protected person(id: string, build: () => Character) {
    let c = this.people.get(id);
    if (!c) {
      c = build();
      c.shadow.visible = false;
      this.scene.add(c.root);
      this.people.set(id, c);
    }
    for (const p of this.people.values()) p.root.visible = p === c;
    this.who = c;
    return c;
  }

  hide() {
    if (this.who) this.who.root.visible = false;
    this.who = null;
  }

  dispose() {
    for (const p of this.people.values()) disposeTree(p.root);
    this.people.clear();
    this.renderer.dispose();
  }
}

// ---------------------------------------------------------------- The shootout

/** Where the kicker waits: two steps back and to the left of the ball (metres, pitch frame). */
export const KICKER_READY = { x: -0.78, z: KICKER_Z };
/** Where the standing foot is planted, beside the ball. */
const KICKER_PLANT = { x: -0.3, z: SPOT + 0.14 };
/** The run-up (s, real time) and when the boot meets the ball after it. */
export const RUN_UP = 0.5;
export const CONTACT = KICK_RUN.contact - RUN_UP;

/**
 * You in a football kit in your outfit's colours: the shirt in your top's,
 * shorts and socks in your trousers' (or white shorts, when the two are too
 * alike to tell apart), boots.
 */
export function footballer(look: AvatarLook, id: string): Character {
  const near = Math.abs(luma(look.top) - luma(look.bottom)) < 0.12;
  const shorts = near ? (luma(look.top) < 0.5 ? '#f8fafc' : '#1e293b') : look.bottom;
  const c = makeCharacter(
    {
      skin: look.skin,
      hair: look.hair,
      hairStyle: look.hairStyle,
      gender: look.gender,
      ...(look.face ? { face: look.face } : {}),
      ...(look.facialHair ? { facialHair: look.facialHair } : {}),
      top: look.top,
      bottom: shorts,
      topStyle: 'tee',
      accessory: 'none',
      trousers: true,
      shoes: 'trainers',
    },
    id,
  );
  // Shorts to the knee: the shins in skin, with socks to just under it.
  const skin = new THREE.MeshStandardMaterial({ color: look.skin, roughness: 0.7 });
  const sock = new THREE.MeshStandardMaterial({ color: near ? look.top : shorts, roughness: 0.9 });
  for (const shin of [c.shinL, c.shinR]) {
    const limb = shin.children.find((o) => (o as THREE.Mesh).isMesh && o.position.y < 0) as
      THREE.Mesh | undefined;
    if (!limb) continue;
    limb.material = skin;
    const s = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.058, 0.22, 10), sock);
    s.position.y = -0.27;
    shin.add(s);
  }
  return c;
}

const lerp = (a: number, b: number, u: number) => a + (b - a) * Math.max(0, Math.min(1, u));
const ease = (u: number) => {
  const q = Math.max(0, Math.min(1, u));
  return q * q * (3 - 2 * q);
};

/**
 * The kicker `T` seconds into the kick (below 0: ready, eyes on the goal):
 * the run-up in a curve to the ball, the plant, the strike (contact at
 * RUN_UP + CONTACT) and the follow-through, arms out for balance.
 */
export function kickerPose(c: Character, T: number) {
  const aim = (from: { x: number; z: number }, to: { x: number; z: number }) =>
    Math.atan2(to.x - from.x, to.z - from.z);
  const goal = { x: 0, z: 0 };
  if (T < 0) {
    pose(c, 'stand', 0);
    // Arms loose at the sides, weight on the back foot, looking at the goal.
    c.armL.rotation.set(0.05, 0, 0.22);
    c.armR.rotation.set(0.05, 0, -0.22);
    c.foreL.rotation.set(-0.35, 0, 0);
    c.foreR.rotation.set(-0.35, 0, 0);
    c.thighR.rotation.x = 0.18;
    c.shinR.rotation.x = 0.12;
    c.root.position.set(KICKER_READY.x, 0, KICKER_READY.z);
    c.root.rotation.set(0, aim(KICKER_READY, { x: -0.15, z: 0 }), 0);
    c.shadow.visible = false;
    return;
  }
  if (T < RUN_UP) {
    // The run-up: quick steps on a curve to the plant beside the ball.
    const u = T / RUN_UP;
    const e = ease(u);
    pose(c, 'run', T * 1.25);
    c.torso.rotation.x = 0.22;
    const x = lerp(KICKER_READY.x, KICKER_PLANT.x, e) - Math.sin(e * Math.PI) * 0.12;
    const z = lerp(KICKER_READY.z, KICKER_PLANT.z, e);
    c.root.position.set(x, 0, z);
    c.root.rotation.set(0, aim({ x, z }, goal) * 0.55 + aim(KICKER_READY, KICKER_PLANT) * 0.45, 0);
    c.shadow.visible = false;
    return;
  }
  // The strike: the left foot planted, the right leg swinging through the ball.
  const s = T - RUN_UP;
  const swing = ease(s / (CONTACT + 0.12));
  const after = ease((s - CONTACT) / 0.5);
  pose(c, 'stand', 0);
  c.root.position.set(KICKER_PLANT.x, 0, KICKER_PLANT.z);
  c.root.rotation.set(0, aim(KICKER_PLANT, goal) - 0.1, 0);
  c.body.position.y = -0.05 + after * 0.03;
  c.torso.rotation.x = lerp(0.12, -0.12, swing);
  c.torso.rotation.y = lerp(0.25, -0.2, swing);
  c.thighL.rotation.x = -0.25;
  c.shinL.rotation.x = 0.35;
  // Back-lift, then through the ball and up in the follow-through.
  c.thighR.rotation.x = lerp(0.95, -1.25, swing);
  c.shinR.rotation.x = s < CONTACT ? lerp(1.4, 0.2, swing) : lerp(0.2, 0.45, after);
  // Arms out for balance, the left one high.
  c.armL.rotation.set(-0.3, 0, lerp(0.9, 1.25, swing));
  c.armR.rotation.set(0.2, 0, lerp(-0.4, -0.95, swing));
  c.foreL.rotation.set(-0.3, 0, 0);
  c.foreR.rotation.set(-0.3, 0, 0);
  c.head.rotation.x = lerp(0.45, 0.1, after);
  c.shadow.visible = false;
}

/** The kicker over the shootout's canvas, through its camera (./shootout-view.ts). */
export class PitchLayer extends Layer {
  readonly camera = new THREE.PerspectiveCamera();
  private cam: PitchCamera | null = null;
  /** Seconds into the kick shown last (below 0: ready). */
  private T = -1;

  constructor(canvas: HTMLCanvasElement, soft: boolean) {
    super(canvas, soft);
    // A pitch-coloured floor light from below the stands, so the kit reads at night.
    const fill = new THREE.PointLight('#fef9c3', 1.2, 0, 0);
    fill.position.set(0, 6, SPOT + 6);
    this.scene.add(fill);
  }

  /** Match the 2D camera: eye height and distance, focal length, horizon. */
  setCamera(c: PitchCamera) {
    this.cam = c;
    this.resize(c.width, c.height);
    const near = 0.1;
    const k = near / c.f;
    this.camera.position.set(0, c.eyeY, c.eyeZ);
    this.camera.rotation.set(0, 0, 0);
    this.camera.near = near;
    this.camera.far = 200;
    this.camera.projectionMatrix.makePerspective(
      (-c.width / 2) * k,
      (c.width / 2) * k,
      c.horizon * k,
      -(c.height - c.horizon) * k,
      near,
      200,
    );
    this.camera.projectionMatrixInverse.copy(this.camera.projectionMatrix).invert();
    this.camera.updateMatrixWorld(true);
  }

  setKicker(id: string, look: AvatarLook) {
    this.person(id, () => footballer(look, id));
  }

  /** The kicker at `T` seconds into the kick (below 0: ready), drawn. */
  show(T: number) {
    this.T = T;
    if (this.who) kickerPose(this.who, T);
    this.render();
  }

  render() {
    if (!this.cam) return;
    try {
      this.renderer.render(this.scene, this.camera);
    } catch {
      // A lost context: the game plays on in 2D.
    }
  }

  /** Where the kicker is on screen (−1 … 1 each way), for the tests. */
  onScreen(): {
    kicker: ScreenBox | null;
    T: number;
    ball: { x: number; y: number };
    goalLine: number;
  } {
    const ball = new THREE.Vector3(0, FOOTBALL_R, SPOT).project(this.camera);
    const line = new THREE.Vector3(0, 0, 0).project(this.camera);
    return {
      kicker: this.who?.root.visible ? screenBoxOf(this.who.root, this.camera) : null,
      T: this.T,
      ball: { x: ball.x, y: ball.y },
      goalLine: line.y,
    };
  }
}

// ---------------------------------------------------------------- Pool

/**
 * Leaning over the table for a shot, along the cue (the root at the hips,
 * facing the shot): `lean` 0 (close to the rail: upright, the bridge hand
 * near) … 1 (stretched along the cue), `back` how far the cue hand has
 * drawn the cue back (metres, the pull; below 0 the follow-through).
 */
export function cuePose(c: Character, lean: number, back = 0) {
  pose(c, 'stand', 0);
  const p = 0.35 + 0.85 * lean;
  c.torso.rotation.x = p;
  c.head.rotation.x = -p * 0.75;
  // The bridge arm (left) forward and down to the cloth.
  // Turned in so the bridge sits on the cue's line (it runs under the chin, to the right).
  c.armL.rotation.set(-(0.75 + 0.55 * lean) - p, 0, -0.5 - 0.25 * (1 - lean));
  c.foreL.rotation.set(-0.35 * (1 - lean), 0, 0);
  // The cue arm (right): the elbow up and back, the forearm hanging, swinging with the pull.
  const swing = Math.asin(Math.max(-0.9, Math.min(0.9, back / 0.3)));
  c.armR.rotation.set(0.7 - p, 0, 0.12);
  c.foreR.rotation.set(-0.7 + swing, 0, 0);
  // Feet apart, the right one back.
  c.thighL.rotation.set(-0.1, 0, 0.1);
  c.thighR.rotation.set(0.28, 0, -0.12);
  c.shadow.visible = false;
}

/** From the hips to the bridge hand along the floor (m), at this lean. */
export const bridgeReach = (lean: number) => 0.38 + 0.62 * lean;

/** One pool player at the table, from above. */
export interface PoolStance {
  id: string;
  look: AvatarLook;
  /** The cue ball and the shot's direction on screen (overlay px, a unit vector). */
  at: { x: number; y: number };
  dir: [number, number];
  /** Cue tip behind the ball (px, as the 2D cue draws it, the pull included) and the pull (px). */
  tip: number;
  pull: number;
  /** The outer edge of the table on the overlay (px). */
  table: { x0: number; y0: number; x1: number; y1: number };
}

/** The player over the pool table, from straight above (the overlay's px are the table's). */
export class TableLayer extends Layer {
  readonly camera = new THREE.OrthographicCamera(0, 1, 0, -1, 0.1, 20);
  private w = 1;
  private h = 1;
  /** Px per metre (the table's scale). */
  private ppm = 100;

  constructor(canvas: HTMLCanvasElement, soft: boolean) {
    super(canvas, soft);
    this.camera.position.set(0, 10, 0);
    this.camera.up.set(0, 0, -1);
    this.camera.lookAt(0, 0, 0);
  }

  /** The overlay's size (CSS px) and the table's scale (CSS px per cm). */
  setSize(w: number, h: number, pxPerCm: number) {
    this.w = w;
    this.h = h;
    this.ppm = pxPerCm * 100;
    this.resize(w, h);
    // World x, z in metres = overlay px / ppm (z down the screen).
    this.camera.left = 0;
    this.camera.right = w / this.ppm;
    this.camera.top = 0;
    this.camera.bottom = -h / this.ppm;
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld(true);
  }

  /**
   * Stand them at the table for this shot: behind the cue ball along the
   * cue, leaning as far as the room behind it allows (the hips no further
   * out than just past the rail), slid in along the cue until all of them
   * is in the picture.
   */
  stand(s: PoolStance) {
    const c = this.person(s.id, () => {
      const look: AvatarLook = { ...s.look };
      delete look.bag;
      if (look.shoes === 'heels') look.shoes = 'courts';
      return makeCharacter(look, s.id);
    });
    const m = this.ppm;
    const [dx, dy] = s.dir;
    // Room behind the ball along the cue to the table's outer edge (px).
    const room = (() => {
      let best = Infinity;
      const { x0, y0, x1, y1 } = s.table;
      if (dx > 1e-6) best = Math.min(best, (s.at.x - x0) / dx);
      if (dx < -1e-6) best = Math.min(best, (s.at.x - x1) / dx);
      if (dy > 1e-6) best = Math.min(best, (s.at.y - y0) / dy);
      if (dy < -1e-6) best = Math.min(best, (s.at.y - y1) / dy);
      return Math.max(0, best) / m;
    })();
    const tip = (s.tip - s.pull) / m;
    // The bridge hand ~20 cm behind the cue's tip; the hips behind it by the reach.
    const want = tip + 0.2 + bridgeReach(1);
    let hips = Math.min(want, Math.max(tip + 0.2 + bridgeReach(0), room + 0.02));
    const ry = Math.atan2(dx, dy);
    // The cue runs under the chin on the right: the body a little to its left.
    const lx = Math.cos(ry),
      lz = -Math.sin(ry);
    const put = (d: number) => {
      const lean = Math.max(0, Math.min(1, (d - tip - 0.2 - bridgeReach(0)) / 0.62));
      cuePose(c, lean, s.pull / m);
      c.root.rotation.set(0, ry, 0);
      c.root.position.set(s.at.x / m - dx * d + lx * 0.13, 0, s.at.y / m - dy * d + lz * 0.13);
    };
    put(hips);
    // Inside the picture: in along the cue (a step at a time) if a foot or an elbow is out.
    for (let i = 0; i < 24; i++) {
      const b = screenBoxOf(c.root, this.camera);
      if (!b || (b.l > -0.995 && b.r < 0.995 && b.b > -0.995 && b.t < 0.995)) break;
      hips = Math.max(0.15, hips - 0.03);
      put(hips);
    }
  }

  render() {
    try {
      this.renderer.render(this.scene, this.camera);
    } catch {
      // A lost context: the game plays on in 2D.
    }
  }

  /** Where the player is on the overlay (−1 … 1 each way), for the tests. */
  onScreen(): { player: ScreenBox | null; size: { w: number; h: number } } {
    return {
      player: this.who?.root.visible ? screenBoxOf(this.who.root, this.camera) : null,
      size: { w: this.w, h: this.h },
    };
  }
}

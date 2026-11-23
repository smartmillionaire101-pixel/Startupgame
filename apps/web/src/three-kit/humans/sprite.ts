/**
 * People drawn into pictures: the game's own 3D person (the CC0 Quaternius
 * model, ../../interiors3d/character.ts `makeCharacter`, posed by `pose`)
 * rendered once by the shared offscreen renderer (../offscreen.ts), the way
 * the catalogue's thumbnails are drawn from the furniture models.
 *
 * - A full figure ('body'): an orthographic camera framing exactly
 *   `FRAME` (./spriteCache.ts) around the feet, so the picture lands where
 *   the 2D `AvatarFigure` stood, feet on the same spot.
 * - A portrait: head and shoulders, front three-quarter, framed on the
 *   model's own skull.
 *
 * Lit like the game's rooms (warm sky, a sun) with a soft front fill that
 * turns with the camera, so faces read at any angle and size. Returns null
 * (the caller keeps its 2D fallback) when WebGL or the models aren't there.
 * Imported lazily: the bookkeeping is ./spriteCache.ts, the React side
 * ../../city/PersonSprite.tsx and ../../avatar/PersonPortrait.tsx.
 */
import * as THREE from 'three';
import { makeCharacter, pose as posePerson } from '../../interiors3d/character';
import { hasModel, refreshModel } from '../../interiors3d/characterModel';
import { disposeTree } from '../../interiors3d/kit';
import { softwareGl } from '../quality';
import { offscreenRenderer, snapshot } from '../offscreen';
import { humansEnabled, loadKit } from './kit';
import { outfitFor } from './outfit';
import {
  FRAME,
  SEATED,
  UNITS_PER_M,
  type Rendered,
  type SpriteAngle,
  type SpritePose,
  type SpriteSpec,
} from './spriteCache';

/** The camera's turn round the person (radians, 0 = in front) and how high it looks from. */
const VIEW: Record<SpriteAngle, { az: number; el: number }> = {
  front: { az: 0, el: 0.1 },
  'three-quarter': { az: 0.62, el: 0.12 },
  side: { az: Math.PI / 2, el: 0.08 },
  back: { az: Math.PI, el: 0.1 },
  top: { az: 0.35, el: 0.85 },
};

/**
 * The moment of each pose that reads best as a still (seconds into `pose`,
 * at phase 0): a wave with the hand up, a stride mid-step, a fork at the mouth.
 */
const MOMENT: Partial<Record<SpritePose, number>> = {
  eat: 0.6,
  drink: 1.1,
  dance: 0.2,
  clap: 0.1,
  squat: 0.5,
  lift: 0.5,
  chat: 0.4,
  sing: 0.4,
};

/**
 * Poses the model plays a clip for (../../interiors3d/characterModel.ts):
 * the clip and how far through it (0..1) the still is taken.
 */
const CLIP: Partial<Record<SpritePose, [string, number]>> = {
  idle: ['Idle', 0],
  stand: ['Idle', 0],
  walk: ['Walk', 0.12],
  run: ['Run', 0.2],
  wave: ['Wave', 0.35],
  kick: ['Kick_Right', 0.4],
};
/** characterModel plays a clip from `phase × 0.7` seconds. */
const CLIP_PHASE_S = 0.7;

/** A portrait's height (metres) and how far above the head bone its middle is. */
const PORTRAIT_SPAN = 0.54;
const PORTRAIT_LIFT = 0.035;

interface Rig {
  scene: THREE.Scene;
  key: THREE.DirectionalLight;
  fill: THREE.DirectionalLight;
  rim: THREE.DirectionalLight;
  ortho: THREE.OrthographicCamera;
  persp: THREE.PerspectiveCamera;
}
let rig: Rig | null = null;

function makeRig(): Rig {
  const scene = new THREE.Scene();
  // The rooms' light (../../interiors3d/stage.ts): a warm sky over a dark floor, a sun…
  scene.add(new THREE.HemisphereLight('#fff4e0', '#5a4a3a', 1.5));
  scene.add(new THREE.AmbientLight('#ffffff', 0.3));
  const key = new THREE.DirectionalLight('#fff1d6', 2.1);
  // …a soft fill from the camera's side (faces read), and a cool rim to lift the edges.
  const fill = new THREE.DirectionalLight('#eef3ff', 0.75);
  const rim = new THREE.DirectionalLight('#cfe0ff', 1.0);
  for (const l of [key, fill, rim]) {
    scene.add(l);
    scene.add(l.target);
  }
  const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.05, 20);
  const persp = new THREE.PerspectiveCamera(20, 1, 0.05, 20);
  scene.add(ortho, persp);
  return { scene, key, fill, rim, ortho, persp };
}

/** Lights placed round the camera's direction (azimuth `az`), aimed at `at`. */
function light(
  r: Rig,
  az: number,
  at: THREE.Vector3,
  o: { keySide?: number; keyUp?: number; fillUp?: number; fill?: number } = {},
) {
  const keySide = o.keySide ?? -0.75;
  const around = (a: number, up: number, d: number) =>
    new THREE.Vector3(Math.sin(a) * d, up, Math.cos(a) * d).add(at);
  // The key from above, to one side of the camera; the fill from the other; the rim behind.
  r.key.position.copy(around(az + keySide, o.keyUp ?? 3.2, 3));
  r.fill.position.copy(around(az - keySide * 0.7, o.fillUp ?? 1.2, 3));
  r.fill.intensity = o.fill ?? 0.75;
  r.rim.position.copy(around(az + Math.PI + 0.6, 2.4, 3));
  for (const l of [r.key, r.fill, r.rim]) {
    l.target.position.copy(at);
    l.target.updateMatrixWorld();
  }
}

/** Waits until the model a look wears has arrived (null if it can't). */
async function kitFor(spec: SpriteSpec) {
  const outfit = outfitFor(spec.look);
  // The same copy the person will be built from (../../interiors3d/characterModel.ts).
  const far = softwareGl();
  const kit = await loadKit(outfit.kit, far);
  return kit ? { far, kit } : null;
}

/** Draw one picture; null when it can't be drawn with the CC0 model. */
export async function renderSprite(spec: SpriteSpec): Promise<Rendered | null> {
  if (!humansEnabled()) return null;
  const k = await kitFor(spec);
  if (!k || !offscreenRenderer()) return null;
  rig ??= makeRig();
  const r = rig;
  const c = makeCharacter(spec.look, 'sprite');
  try {
    const clip = CLIP[spec.pose];
    const dur = clip ? k.kit.clips.get(clip[0])?.duration : undefined;
    if (clip && dur) {
      // A clip's moment, by the pose's phase (the model takes its time from it).
      const at = (((clip[1] + spec.phase) % 1) * dur) / CLIP_PHASE_S;
      posePerson(c, spec.pose, 0, { phase: at, seat: 0.45 });
    } else {
      posePerson(c, spec.pose, (MOMENT[spec.pose] ?? 0) + spec.phase * 2, { seat: 0.45 });
    }
    c.shadow.visible = false;
    // From high above the toes would come below the frame: the person a step back.
    c.root.position.set(0, 0, spec.kind === 'body' && spec.angle === 'top' ? -0.12 : 0);
    r.scene.add(c.root);
    r.scene.updateMatrixWorld(true);
    // The model follows the jointed person when matrices update: is it drawn?
    if (!hasModel(c)) return null;
    const view = VIEW[spec.angle];
    const dir = new THREE.Vector3(
      Math.sin(view.az) * Math.cos(view.el),
      Math.sin(view.el),
      Math.cos(view.az) * Math.cos(view.el),
    );
    let camera: THREE.Camera;
    let w: number;
    const h = spec.px;
    let exposure = 1.1;
    if (spec.kind === 'body') {
      // Exactly FRAME (AvatarFigure units) round the feet at the origin.
      const o = r.ortho;
      const m = 1 / UNITS_PER_M;
      o.left = FRAME.x * m;
      o.right = (FRAME.x + FRAME.w) * m;
      o.top = -FRAME.y * m;
      o.bottom = -(FRAME.y + FRAME.h) * m;
      o.position.copy(dir).multiplyScalar(6);
      o.up.set(0, 1, 0);
      o.lookAt(0, 0, 0);
      o.updateProjectionMatrix();
      o.updateMatrixWorld();
      camera = o;
      w = Math.round((h * FRAME.w) / FRAME.h);
      light(r, view.az, new THREE.Vector3(0, SEATED.has(spec.pose) ? 0.7 : 0.95, 0));
    } else {
      // Head and shoulders, framed on the model's head bone (the base of the skull):
      // the same metric frame for everyone (both kits stand 1.75 m).
      let headBone: THREE.Object3D | undefined;
      c.root.traverse((o) => {
        if (!headBone && (o as THREE.Bone).isBone && o.name === 'Head') headBone = o;
      });
      const skull = headBone
        ? headBone.getWorldPosition(new THREE.Vector3())
        : c.head.localToWorld(new THREE.Vector3(0, 0.05, 0));
      const span = PORTRAIT_SPAN;
      const p = r.persp;
      p.aspect = 1;
      const az = 0.38;
      const pdir = new THREE.Vector3(Math.sin(az), 0.06, Math.cos(az)).normalize();
      const dist = span / 2 / Math.tan((p.fov * Math.PI) / 360);
      const target = skull.clone().add(new THREE.Vector3(0, PORTRAIT_LIFT, 0));
      p.position.copy(target).addScaledVector(pdir, dist);
      p.up.set(0, 1, 0);
      p.lookAt(target);
      p.updateProjectionMatrix();
      p.updateMatrixWorld();
      camera = p;
      w = h;
      exposure = 1.2;
      // (Broad light: the key on the side the face is turned to.)
      // (Lower and softer than for a figure: no deep shadow under the brow, dark skin reads.)
      light(r, az, skull, { keySide: 0.55, keyUp: 1.7, fillUp: 0.15, fill: 1.25 });
    }
    // (Matrices are current: the render mustn't move the model on again.)
    r.scene.matrixWorldAutoUpdate = false;
    const url = snapshot(r.scene, camera, w, h, { type: 'image/webp', quality: 0.92, exposure });
    r.scene.matrixWorldAutoUpdate = true;
    return url ? { url, persist: !k.far } : null;
  } finally {
    r.scene.remove(c.root);
    // Each person's skeleton has its own bone texture on the GPU.
    c.root.traverse((o) => (o as THREE.SkinnedMesh).skeleton?.dispose());
    refreshModel(c);
    disposeTree(c.root);
  }
}

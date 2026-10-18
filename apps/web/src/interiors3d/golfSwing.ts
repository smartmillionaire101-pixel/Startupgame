/**
 * Golf: the player's own 3D figure (./character.ts) swinging a club.
 *
 * `swing` runs from −1 (the top of the backswing) through 0 (address, and
 * impact on the way through) to 1 (the finish). Joint angles are keyframed
 * (address, half-way back, the top, impact, half-way through, the finish) and
 * blended, so a held power meter winds the backswing up and the release
 * whips through. The club is held in both hands: its grip follows the hands
 * and its shaft swings through keyframed directions in the figure's frame.
 * Putting is a short pendulum from a narrower, bent-over stance.
 *
 * The figure's frame: it faces +z, the target is on its left (+x).
 */
import * as THREE from 'three';
import type { Character } from './character';
import { mat } from './kit';

interface Key {
  s: number;
  bodyY: number;
  hipsY: number;
  torsoX: number;
  torsoY: number;
  torsoZ: number;
  headX: number;
  headY: number;
  armLX: number;
  armLZ: number;
  armRX: number;
  armRZ: number;
  foreLX: number;
  foreRX: number;
  thighLX: number;
  thighRX: number;
  shinLX: number;
  shinRX: number;
  /** The shaft's direction in the figure's frame (from the hands to the head). */
  club: [number, number, number];
}

const ADDRESS: Key = {
  s: 0,
  bodyY: -0.05,
  hipsY: 0,
  torsoX: 0.42,
  torsoY: 0,
  torsoZ: 0,
  headX: 0.2,
  headY: 0,
  armLX: -0.42,
  armLZ: -0.22,
  armRX: -0.38,
  armRZ: 0.3,
  foreLX: 0,
  foreRX: -0.2,
  thighLX: -0.22,
  thighRX: -0.22,
  shinLX: 0.3,
  shinRX: 0.3,
  club: [0.12, -0.78, 0.6],
};

const KEYS: Key[] = [
  // The top: shoulders turned well past 90°, hands high, the shaft over the head towards the target.
  {
    ...ADDRESS,
    s: -1,
    bodyY: -0.04,
    hipsY: -0.55,
    torsoX: 0.3,
    torsoY: -1.05,
    torsoZ: 0.12,
    headX: 0.28,
    headY: 1.05,
    armLX: -2.05,
    armLZ: -0.85,
    armRX: -1.85,
    armRZ: -0.2,
    foreLX: -0.05,
    foreRX: -1.55,
    thighLX: -0.32,
    thighRX: -0.18,
    shinLX: 0.42,
    shinRX: 0.26,
    club: [0.85, -0.1, -0.52],
  },
  // Half-way back: the club parallel to the ground, wrists hinging.
  {
    ...ADDRESS,
    s: -0.5,
    hipsY: -0.25,
    torsoY: -0.6,
    torsoX: 0.38,
    headY: 0.6,
    armLX: -1.05,
    armLZ: -0.55,
    armRX: -0.95,
    armRZ: 0.05,
    foreRX: -0.75,
    club: [-0.4, 0.75, 0.52],
  },
  ADDRESS,
  // Impact is address with the hips cleared towards the target (s just past 0).
  {
    ...ADDRESS,
    s: 0.12,
    hipsY: 0.45,
    torsoY: 0.22,
    torsoX: 0.4,
    headY: -0.18,
    armLZ: -0.12,
    armRZ: 0.36,
    thighRX: -0.05,
    shinRX: 0.4,
    club: [0.55, -0.62, 0.55],
  },
  // Half-way through: arms extended down the line, the club pointing at the sky.
  {
    ...ADDRESS,
    s: 0.5,
    hipsY: 0.85,
    torsoX: 0.25,
    torsoY: 0.95,
    torsoZ: -0.1,
    headX: 0.05,
    headY: -0.65,
    armLX: -1.25,
    armLZ: 0.25,
    armRX: -1.35,
    armRZ: 0.45,
    foreLX: -0.6,
    foreRX: -0.1,
    thighLX: -0.05,
    thighRX: 0.2,
    shinLX: 0.08,
    shinRX: 0.55,
    club: [0.35, 0.85, 0.2],
  },
  // The finish: belly to the target, hands over the left shoulder, right heel up.
  {
    ...ADDRESS,
    s: 1,
    bodyY: 0,
    hipsY: 1.2,
    torsoX: 0.02,
    torsoY: 1.35,
    torsoZ: -0.18,
    headX: -0.05,
    headY: -0.35,
    armLX: -2.35,
    armLZ: 0.85,
    armRX: -2.15,
    armRZ: 0.35,
    foreLX: -1.45,
    foreRX: -0.85,
    thighLX: 0.02,
    thighRX: 0.16,
    shinLX: 0.02,
    shinRX: 0.5,
    club: [-0.65, -0.25, -0.72],
  },
];
KEYS.sort((a, b) => a.s - b.s);

const PUTT_ADDRESS: Key = {
  ...ADDRESS,
  bodyY: -0.03,
  torsoX: 0.62,
  headX: 0.35,
  armLX: -0.5,
  armLZ: -0.3,
  armRX: -0.48,
  armRZ: 0.34,
  foreLX: -0.35,
  foreRX: -0.4,
  thighLX: -0.12,
  thighRX: -0.12,
  shinLX: 0.18,
  shinRX: 0.18,
  club: [0, -0.92, 0.38],
};

const smooth = (u: number) => u * u * (3 - 2 * u);

function blend(a: Key, b: Key, u: number): Key {
  const k = smooth(Math.max(0, Math.min(1, u)));
  const out = { ...a } as Key;
  for (const key of Object.keys(a) as (keyof Key)[]) {
    if (key === 'club' || key === 's') continue;
    (out[key] as number) = (a[key] as number) + ((b[key] as number) - (a[key] as number)) * k;
  }
  out.club = [0, 1, 2].map((i) => a.club[i]! + (b.club[i]! - a.club[i]!) * k) as Key['club'];
  return out;
}

function keyAt(s: number): Key {
  if (s <= KEYS[0]!.s) return KEYS[0]!;
  for (let i = 0; i + 1 < KEYS.length; i++) {
    const a = KEYS[i]!;
    const b = KEYS[i + 1]!;
    if (s <= b.s) return blend(a, b, (s - a.s) / (b.s - a.s));
  }
  return KEYS[KEYS.length - 1]!;
}

function puttKey(s: number): Key {
  // A pendulum: shoulders rock, the putter head swings low back and through.
  const k = { ...PUTT_ADDRESS };
  const a = Math.max(-1, Math.min(1, s)) * 0.38;
  k.torsoZ = -a * 0.35;
  k.armLZ = PUTT_ADDRESS.armLZ - a * 0.55;
  k.armRZ = PUTT_ADDRESS.armRZ - a * 0.55;
  k.club = [Math.sin(a) * 0.9 * -1 + 0, -0.92, 0.38];
  k.club = [-Math.sin(a * 1.4) * 0.9, -Math.cos(a * 1.4) * 0.92, 0.38];
  return k;
}

export interface GolfClub3D {
  root: THREE.Group;
  /** Length grip to head, metres. */
  length: number;
}

/** A club: grip, shaft and head (a driver, an iron or a putter). */
export function makeClub(kind: 'driver' | 'iron' | 'putter'): GolfClub3D {
  const root = new THREE.Group();
  const length = kind === 'driver' ? 1.08 : kind === 'putter' ? 0.86 : 0.95;
  const grip = new THREE.Mesh(
    new THREE.CylinderGeometry(0.016, 0.014, 0.26, 8),
    mat('#111827', { rough: 0.9 }),
  );
  grip.position.y = -0.13;
  const shaft = new THREE.Mesh(
    new THREE.CylinderGeometry(0.008, 0.006, length - 0.26, 6),
    mat('#d1d5db', { metal: 0.9, rough: 0.25 }),
  );
  shaft.position.y = -0.26 - (length - 0.26) / 2;
  const headMat = mat(kind === 'driver' ? '#1f2937' : '#cbd5e1', { metal: 0.8, rough: 0.3 });
  const head = new THREE.Mesh(
    kind === 'driver'
      ? new THREE.SphereGeometry(0.06, 12, 8)
      : kind === 'putter'
        ? new THREE.BoxGeometry(0.12, 0.03, 0.04)
        : new THREE.BoxGeometry(0.09, 0.05, 0.018),
    headMat,
  );
  if (kind === 'driver') head.scale.set(1.2, 0.6, 0.9);
  head.position.set(kind === 'putter' ? 0.03 : 0.035, -length + 0.02, 0.01);
  for (const m of [grip, shaft, head]) {
    m.castShadow = true;
    root.add(m);
  }
  return { root, length };
}

const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const DOWN = new THREE.Vector3(0, -1, 0);

/**
 * Pose a golfer. `swing` −1…1 (see above); `putting` for the putting stroke.
 * `club` is a child of `c.root` and is placed in the hands.
 */
export function golfPose(c: Character, swing: number, putting: boolean, club: GolfClub3D, t = 0) {
  const k = putting ? puttKey(swing) : keyAt(swing);
  const breathe = Math.sin(t * 2) * 0.008;
  c.body.position.set(0, k.bodyY, 0);
  c.body.rotation.set(0, 0, 0);
  c.hips.rotation.set(0, k.hipsY * 0.5, 0);
  c.torso.rotation.set(k.torsoX + breathe, k.torsoY - k.hipsY * 0.5 + k.hipsY * 0.5, k.torsoZ);
  // The torso sits on the hips: the hips' turn carries it, the torso adds its own.
  c.torso.rotation.y = k.torsoY - k.hipsY * 0.5;
  c.head.rotation.set(k.headX, k.headY * 0.85, 0);
  c.armL.rotation.set(k.armLX, 0, k.armLZ);
  c.armR.rotation.set(k.armRX, 0, k.armRZ);
  c.foreL.rotation.set(k.foreLX, 0, 0);
  c.foreR.rotation.set(k.foreRX, 0, 0);
  c.thighL.rotation.set(k.thighLX, 0, 0);
  c.thighR.rotation.set(k.thighRX, 0, 0);
  c.shinL.rotation.set(k.shinLX, 0, 0);
  c.shinR.rotation.set(k.shinRX, 0, 0);
  c.shadow.visible = true;
  // The club: grip between the hands, the shaft along the keyframed direction.
  c.root.updateMatrixWorld(true);
  c.handL.getWorldPosition(tmpA);
  c.handR.getWorldPosition(tmpB);
  tmpA.lerp(tmpB, 0.5);
  c.root.worldToLocal(tmpA);
  club.root.position.copy(tmpA);
  const dir = new THREE.Vector3(...k.club).normalize();
  // The club's local −y runs grip to head.
  club.root.quaternion.setFromUnitVectors(DOWN, dir);
}

/** Pose an onlooker leaning on a club (an AI playing partner). */
export function partnerPose(c: Character, club: GolfClub3D, t: number, act: 'stand' | 'clap') {
  c.body.position.set(0, 0, 0);
  c.hips.rotation.set(0, 0, 0);
  c.torso.rotation.set(Math.sin(t * 2) * 0.01, 0, 0);
  c.head.rotation.set(0, Math.sin(t * 0.5) * 0.15, 0);
  c.thighL.rotation.set(0, 0, 0);
  c.thighR.rotation.set(0, 0, 0);
  c.shinL.rotation.set(0, 0, 0);
  c.shinR.rotation.set(0, 0, 0);
  c.foreL.rotation.set(0, 0, 0);
  c.foreR.rotation.set(0, 0, 0);
  if (act === 'clap') {
    const u = (Math.sin(t * 14) + 1) / 2;
    c.armL.rotation.set(-1.0, 0, 0.3 + u * 0.25);
    c.armR.rotation.set(-1.0, 0, -0.3 - u * 0.25);
    c.foreL.rotation.x = c.foreR.rotation.x = -0.7;
    club.root.visible = false;
    return;
  }
  club.root.visible = true;
  c.armL.rotation.set(0.05, 0, 0.1);
  c.armR.rotation.set(-0.25, 0, -0.18);
  c.root.updateMatrixWorld(true);
  c.handR.getWorldPosition(tmpA);
  c.root.worldToLocal(tmpA);
  club.root.position.copy(tmpA);
  club.root.quaternion.setFromUnitVectors(DOWN, new THREE.Vector3(-0.15, -1, 0.2).normalize());
}

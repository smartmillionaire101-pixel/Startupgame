/**
 * What a person wears on the CC0 model's head (./characterModel.ts), made to
 * fit that head (its measured `HeadFit`, ../three-kit/humans/face.ts): a cap
 * whose brim sits on the forehead, a beanie with its cuff above the brows, a
 * headwrap, a gele (a tall pleated fan of cloth over a wrapped band, the face
 * clear), glasses on the nose with their arms to the ears, studs on the
 * lobes, our own hair where the kit has none (an afro, twists, a bun, braids
 * and locs, long hair under a hat), and lips (the kit's faces have no mouth).
 *
 * All in the person's head frame (the low-poly skull's: centred on it, 0.142
 * its half width, y up, z forward), as one group hung on the head joint. The
 * low-poly person's own versions (./character.ts) stay for when the model
 * isn't drawn. Facial hair and close-cropped hair are grown on the head's own
 * skin instead (../three-kit/humans/face.ts).
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { shade, type AvatarLook } from '../city/art';
import { mat } from './kit';
import type { HeadFit } from '../three-kit/humans/face';
import { SILVER } from '../avatar/worn';
import { mix } from '../three-kit/humans/outfit';

/** Geometry made once per head and part (everyone with that head shares it). */
const GEO = new Map<string, THREE.BufferGeometry>();
function geo(key: string, make: () => THREE.BufferGeometry) {
  let g = GEO.get(key);
  if (!g) {
    g = make();
    g.userData.shared = true;
    GEO.set(key, g);
  }
  return g;
}
const fitKey = (f: HeadFit) =>
  [f.crown, f.half, f.front, f.back, f.brow, f.eye.y, f.eye.z, f.mouth.y]
    .map((x) => x.toFixed(3))
    .join(',');

/**
 * A dome over the head: round the head (u: 0 in front, π behind) its rim is
 * at `rim(u)` with radii `rx`, `rz` about z = `cz`; it rises to `top`.
 * `bulge` pushes the upper part outward (a slouch, a wrap's fullness).
 */
function domeGeometry(
  rx: number,
  rz: number,
  cz: number,
  top: number,
  rim: (u: number) => number,
  bulge = 0,
  U = 28,
  V = 9,
) {
  const pos: number[] = [];
  const ix: number[] = [];
  for (let j = 0; j <= V; j++) {
    const v = j / V;
    const s = Math.sin((v * Math.PI) / 2);
    const c = Math.cos((v * Math.PI) / 2);
    const b = 1 + bulge * Math.sin(v * Math.PI);
    for (let i = 0; i <= U; i++) {
      const u = (i / U) * Math.PI * 2;
      const r = rim(u);
      pos.push(rx * Math.sin(u) * s * b, r + (top - r) * c, cz + rz * Math.cos(u) * s * b);
    }
  }
  for (let j = 0; j < V; j++)
    for (let i = 0; i < U; i++) {
      const a = j * (U + 1) + i;
      const d = a + U + 1;
      ix.push(a, d, a + 1, a + 1, d, d + 1);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(ix);
  g.computeVertexNormals();
  return g;
}

/** A band round the head along a rim (a beanie's cuff, a wrap's folds): `h` tall, open. */
function bandGeometry(
  rx: number,
  rz: number,
  cz: number,
  rim: (u: number) => number,
  h: number,
  span = Math.PI,
  U = 28,
) {
  const pos: number[] = [];
  const ix: number[] = [];
  for (let i = 0; i <= U; i++) {
    const u = -span + (i / U) * span * 2;
    const y = rim(u);
    const x = Math.sin(u);
    const z = Math.cos(u);
    // A rounded band: out at its middle, in at its edges.
    for (const [dy, k] of [
      [0, 0.97],
      [h * 0.5, 1.02],
      [h, 0.97],
    ] as const)
      pos.push(rx * k * x, y + dy, cz + rz * k * z);
  }
  for (let i = 0; i < U; i++)
    for (let j = 0; j < 2; j++) {
      const a = i * 3 + j;
      const b = a + 3;
      ix.push(a, b, a + 1, a + 1, b, b + 1);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(ix);
  g.computeVertexNormals();
  return g;
}

/** A rim that is `front` high in front and `back` behind, easing between. */
const rimFn =
  (front: number, back: number, sharp = 1) =>
  (u: number) => {
    const t = Math.pow((1 + Math.cos(u)) / 2, sharp);
    return back + (front - back) * t;
  };

/**
 * A gele's fan: pleated cloth standing up from the crown in a crescent,
 * wider than the head, its pleats folded back and forth.
 */
function geleFanGeometry(width: number, height: number) {
  const pos: number[] = [];
  const ix: number[] = [];
  const N = 18;
  const spread = 1.35;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const a = (t - 0.5) * 2 * spread;
    // Folds: every other line forward, every other back.
    const fold = (i % 2 ? 1 : -1) * 0.018;
    // Taller in the middle, the wings lower and wider (the 2D gele's crescent).
    const outer = height * (0.78 + 0.22 * Math.cos(a * 1.1));
    const inner = 0.03;
    const dirX = Math.sin(a) * (width / height);
    const dirY = Math.cos(a);
    pos.push(dirX * inner, dirY * inner, 0);
    pos.push(dirX * (outer * 0.55), dirY * (outer * 0.55), fold * 0.6);
    pos.push(dirX * outer, dirY * outer, fold);
  }
  for (let i = 0; i < N; i++)
    for (let j = 0; j < 2; j++) {
      const a = i * 3 + j;
      const b = a + 3;
      ix.push(a, b, a + 1, a + 1, b, b + 1);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(ix);
  const flat = g.toNonIndexed();
  flat.computeVertexNormals();
  return flat;
}

/** An afro: a lumpy sphere (deterministic bumps), pulled back clear of the face. */
export function afroGeometry(): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(0.2, 22, 16);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n =
      Math.sin(v.x * 41 + v.y * 13) * Math.sin(v.z * 37 - v.y * 29) * Math.cos(v.x * 23 + v.z * 17);
    v.multiplyScalar(1 + n * 0.07);
    // The face: below the brow and in front, the hair is pushed back to the hairline.
    if (v.z > 0.06 && v.y < 0.06) v.z = 0.06 + (v.z - 0.06) * 0.25;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

/** Twists: tapered cones over the crown and sides, along the head's normal, clear of the face. */
export function twistsGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const up = new THREE.Vector3(0, 1, 0);
  const q = new THREE.Quaternion();
  for (let i = 0; i < 70; i++) {
    // A spiral over the upper head.
    const y = 1 - ((i + 0.5) / 70) * 1.15;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const a = i * 2.39996;
    const n = new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
    if (n.y < -0.1 || (n.z > 0.45 && n.y < 0.55)) continue;
    const len = 0.035 + ((i * 7) % 5) * 0.007;
    const c = new THREE.CapsuleGeometry(0.021, len, 2, 6);
    c.translate(0, len / 2, 0);
    // Droop: tilt towards down at the back and sides.
    const dir = n
      .clone()
      .add(new THREE.Vector3(0, -0.6, 0))
      .normalize();
    q.setFromUnitVectors(up, dir);
    c.applyQuaternion(q);
    c.translate(n.x * 0.14, n.y * 0.15 + 0.005, n.z * 0.145 - 0.005);
    parts.push(c.toNonIndexed());
  }
  const g = mergeGeometries(parts, false)!;
  g.computeVertexNormals();
  return g;
}

/** Strands hanging round the back and sides of the head (braids, locs), as one mesh. */
function strandsGeometry(f: HeadFit, n: number, len: number, r: number) {
  const parts: THREE.BufferGeometry[] = [];
  const cz = (f.front + f.back) / 2;
  const rz = (f.front - f.back) / 2;
  const down = new THREE.Vector3(0, -1, 0);
  const q = new THREE.Quaternion();
  for (let row = 0; row < 2; row++)
    for (let i = 0; i < n; i++) {
      // From beside the temples round the back (u: 0 in front).
      const u = Math.PI * 0.42 + ((i + row * 0.5) / (n - 0.5)) * Math.PI * 1.16;
      const x = Math.sin(u) * (f.half + 0.004);
      const z = cz + Math.cos(u) * (rz + 0.004);
      const y = f.eye.y + 0.11 - row * 0.035;
      const l = len * (0.85 + 0.15 * Math.sin(i * 2.3 + row));
      const s = new THREE.CylinderGeometry(r, r * 0.75, l, 6, 3);
      s.translate(0, -l / 2, 0);
      // Out a little from the head, then down.
      const dir = new THREE.Vector3(Math.sin(u) * 0.1, -1, Math.cos(u) * 0.08 - 0.05).normalize();
      q.setFromUnitVectors(down, dir);
      s.applyQuaternion(q);
      s.translate(x, y, z);
      parts.push(s.toNonIndexed());
    }
  const g = mergeGeometries(parts, false)!;
  g.computeVertexNormals();
  return g;
}

/** Long hair falling behind and beside the head below a hat: an open, tapering curtain. */
function curtainGeometry(f: HeadFit, len: number) {
  const cz = (f.front + f.back) / 2;
  const rz = (f.front - f.back) / 2;
  const pos: number[] = [];
  const ix: number[] = [];
  const U = 16;
  const V = 4;
  for (let j = 0; j <= V; j++) {
    const v = j / V;
    const y = f.eye.y + 0.06 - v * len;
    const k = 1.08 + 0.12 * v;
    for (let i = 0; i <= U; i++) {
      const u = Math.PI * 0.38 + (i / U) * Math.PI * 1.24;
      // A ragged hem.
      const hem = j === V ? 0.02 * Math.sin(i * 2.7) : 0;
      pos.push(Math.sin(u) * f.half * k, y + hem, cz + Math.cos(u) * rz * k);
    }
  }
  for (let j = 0; j < V; j++)
    for (let i = 0; i < U; i++) {
      const a = j * (U + 1) + i;
      const d = a + U + 1;
      ix.push(a, d, a + 1, a + 1, d, d + 1);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(ix);
  g.computeVertexNormals();
  return g;
}

export interface ModelHeadOpts {
  /** Our own hair is drawn (the kit head's is hidden). */
  ownHair: boolean;
  /** Facial hair's colour (a moustache is shaped here; beards are grown on the skin). */
  facialColour?: string;
}

/** A moustache: a thick, tapering bar over the lip, following the face round, its ends drooping. */
function moustacheGeometry(f: HeadFit) {
  const top = f.mouth.y + (f.nose.y - f.mouth.y) * 0.42;
  const parts: THREE.BufferGeometry[] = [];
  const N = 9;
  for (let i = 0; i < N; i++) {
    const t = (i / (N - 1)) * 2 - 1;
    const x = t * 0.046;
    const r = 0.0105 * (1 - 0.45 * t * t);
    const s = new THREE.SphereGeometry(1, 7, 5);
    s.scale(0.011, r, r * 0.9);
    s.translate(x, top - 0.012 * t * t * t * t, f.mouth.z + 0.003 - 0.32 * x * x * 10);
    parts.push(s.toNonIndexed());
  }
  const g = mergeGeometries(parts, false)!;
  g.computeVertexNormals();
  return g;
}

/** The fitted head parts for a look, in the head frame. */
export function buildModelHead(look: AvatarLook, f: HeadFit, o: ModelHeadOpts): THREE.Group {
  const g = new THREE.Group();
  g.name = 'model-head';
  const key = fitKey(f);
  const cz = (f.front + f.back) / 2;
  const rz = (f.front - f.back) / 2;
  const add = (geom: THREE.BufferGeometry, m: THREE.Material, shadow = true) => {
    const mesh = new THREE.Mesh(geom, m);
    mesh.castShadow = shadow;
    mesh.userData.modelOnly = true;
    g.add(mesh);
    return mesh;
  };
  const headwear = look.headwear ?? (look.accessory === 'cap' ? 'cap' : 'none');
  const covered = headwear === 'headwrap' || headwear === 'gele';
  const hatted = headwear === 'cap' || headwear === 'beanie';
  const hm = mat(look.hair, { rough: 0.95 });

  // Lips: the kit's faces have none (a mouth reads at any size).
  const lips = add(
    geo('lips', () => {
      const s = new THREE.SphereGeometry(1, 12, 6);
      s.scale(0.033, 0.01, 0.013);
      return s;
    }),
    mat(lipColour(look.skin), { rough: 0.55 }),
    false,
  );
  lips.position.set(0, f.mouth.y, f.mouth.z - 0.006);
  lips.rotation.x = -0.12;
  if (look.facialHair === 'moustache' && o.facialColour)
    add(
      geo(`moustache:${key}`, () => moustacheGeometry(f)),
      mat(o.facialColour, { rough: 0.95 }),
    );

  // Our own hair, where the kit's is hidden.
  if (o.ownHair && !covered) {
    switch (look.hairStyle) {
      case 'afro':
        if (!hatted) {
          const a = add(geo('afro2', afroGeometry), hm);
          // Over this head's crown, back from its forehead.
          a.position.set(0, f.crown - 0.045, cz - 0.075);
          a.scale.set((f.half + 0.07) / 0.2, 0.94, (rz + 0.06) / 0.2);
        }
        break;
      case 'twists':
        if (!hatted) {
          const t = add(geo('twists2', twistsGeometry), hm);
          t.position.set(0, 0, cz);
          t.scale.set((f.half + 0.004) / 0.14, (f.crown + 0.004) / 0.155, (rz + 0.004) / 0.145);
        }
        break;
      case 'bun':
        if (!hatted) {
          const b = add(
            geo('bun', () => new THREE.SphereGeometry(0.07, 10, 8)),
            hm,
          );
          b.position.set(0, f.crown - 0.005, f.back * 0.45);
        }
        break;
      case 'braids':
      case 'locs': {
        const locs = look.hairStyle === 'locs';
        add(
          geo(`strands:${locs}:${key}`, () =>
            locs ? strandsGeometry(f, 11, 0.36, 0.019) : strandsGeometry(f, 13, 0.3, 0.013),
          ),
          hm,
        );
        break;
      }
      case 'long':
        if (hatted)
          add(
            geo(`curtain:${key}`, () => curtainGeometry(f, 0.3)),
            mat(look.hair, { rough: 0.95, side: THREE.DoubleSide }),
          );
        break;
    }
  }

  // Headwear, in the top's colour (a matching gele and buba).
  const wm = mat(look.top, { rough: 0.85 });
  if (headwear === 'cap') {
    const capM = mat(shade(look.top, -0.08), { rough: 0.75 });
    // The crown of the cap over the skull; the band just above the brows, lower behind.
    const front = f.brow + 0.04;
    add(
      geo(`cap:${key}`, () =>
        domeGeometry(
          f.half + 0.016,
          rz + 0.016,
          cz,
          f.crown + 0.018,
          rimFn(front, f.eye.y + 0.005),
        ),
      ),
      capM,
    );
    // The peak: forward from the forehead, curved and tipped a little down.
    const peak = add(
      geo(`peak:${key}`, () => {
        const c = new THREE.CylinderGeometry(1, 1, 0.014, 18, 2, false, -Math.PI / 2, Math.PI);
        c.scale(f.half * 0.85, 1, 0.16);
        // Curved: the sides lower than the middle, the tip lower than the band.
        const p = c.getAttribute('position') as THREE.BufferAttribute;
        for (let i = 0; i < p.count; i++) {
          const x = p.getX(i) / (f.half * 0.85);
          const z = p.getZ(i) / 0.16;
          p.setY(i, p.getY(i) - 0.03 * x * x - 0.012 * z * z);
        }
        c.computeVertexNormals();
        return c;
      }),
      mat(shade(look.top, -0.25), { rough: 0.7 }),
    );
    peak.position.set(0, front + 0.006, cz + rz * 0.78);
    peak.rotation.x = 0.3;
    const button = add(
      geo('cap-button', () => new THREE.SphereGeometry(0.014, 8, 6)),
      mat(shade(look.top, -0.25), { rough: 0.7 }),
      false,
    );
    button.position.set(0, f.crown + 0.03, cz);
  } else if (headwear === 'beanie') {
    const front = f.brow + 0.035;
    const rim = rimFn(front, f.eye.y - 0.02);
    add(
      geo(`beanie:${key}`, () =>
        domeGeometry(f.half + 0.018, rz + 0.018, cz - 0.01, f.crown + 0.035, rim, 0.06),
      ),
      wm,
    );
    // The turned-up cuff.
    add(
      geo(`beanie-cuff:${key}`, () =>
        bandGeometry(f.half + 0.03, rz + 0.03, cz - 0.005, rim, 0.05),
      ),
      mat(shade(look.top, -0.15), { rough: 0.95, side: THREE.DoubleSide }),
    );
  } else if (headwear === 'headwrap' || headwear === 'gele') {
    const gele = headwear === 'gele';
    // Wrapped round from above the brows to the nape, full over the crown.
    const front = f.brow + (gele ? 0.03 : 0.035);
    const rim = rimFn(front, f.mouth.y + 0.02, 0.8);
    add(
      geo(`wrap:${key}`, () =>
        domeGeometry(
          f.half + 0.025,
          rz + 0.025,
          cz - 0.01,
          f.crown + (gele ? 0.055 : 0.07),
          rim,
          0.12,
        ),
      ),
      wm,
    );
    // The fold across the forehead.
    add(
      geo(`wrap-fold:${key}`, () =>
        bandGeometry(f.half + 0.03, rz + 0.03, cz - 0.01, rim, 0.034, Math.PI * 0.55),
      ),
      mat(shade(look.top, gele ? 0.1 : -0.12), { rough: 0.85, side: THREE.DoubleSide }),
    );
    if (gele) {
      // The fan: pleats standing up from the crown, leaning back, wider than the head.
      const fanM = mat(shade(look.top, 0.06), { rough: 0.8, side: THREE.DoubleSide });
      const fan = add(
        geo('gele-fan', () => geleFanGeometry(0.29, 0.2)),
        fanM,
      );
      fan.position.set(0, f.crown - 0.015, cz - 0.02);
      fan.rotation.x = -0.42;
      // A second, smaller fan behind it (the cloth's other end), a shade darker.
      const back = add(
        geo('gele-fan', () => geleFanGeometry(0.29, 0.2)),
        mat(shade(look.top, -0.1), { rough: 0.8, side: THREE.DoubleSide }),
      );
      back.position.set(0, f.crown - 0.03, cz - 0.07);
      back.rotation.x = -0.75;
      back.scale.setScalar(0.85);
    } else {
      // Tied at the front, over the hairline: two ends folded into a knot.
      for (const sx of [-1, 1]) {
        const knot = add(
          geo('knot', () => new THREE.SphereGeometry(0.04, 10, 8)),
          mat(shade(look.top, -0.1), { rough: 0.85 }),
        );
        knot.position.set(sx * 0.03, f.brow + 0.1, f.front + 0.0);
        knot.scale.set(1.15, 0.75, 0.8);
        knot.rotation.z = sx * 0.5;
      }
    }
  }

  // Glasses: on the nose, in front of the eyes, arms back to the ears.
  const glasses = look.glasses ?? (look.accessory === 'glasses' ? 'round' : 'none');
  if (glasses !== 'none') {
    const gm = mat(glasses === 'shades' ? '#0b1120' : '#111827', { rough: 0.65 });
    const z = Math.max(f.eye.z, f.browZ - 0.004) + 0.014;
    const r = Math.max(0.03, f.eye.h * 0.85);
    for (const sx of [-1, 1]) {
      const lens =
        glasses === 'round'
          ? add(
              geo('m-lens-round', () => new THREE.TorusGeometry(0.031, 0.0055, 5, 16)),
              gm,
              false,
            )
          : glasses === 'shades'
            ? add(
                geo('m-lens-shade', () => new THREE.BoxGeometry(0.068, 0.042, 0.008)),
                gm,
                false,
              )
            : add(
                geo('m-lens-square', () => {
                  // A frame: four bars round a clear lens.
                  const parts = [
                    new THREE.BoxGeometry(0.068, 0.008, 0.008).translate(0, 0.022, 0),
                    new THREE.BoxGeometry(0.068, 0.008, 0.008).translate(0, -0.022, 0),
                    new THREE.BoxGeometry(0.008, 0.044, 0.008).translate(-0.03, 0, 0),
                    new THREE.BoxGeometry(0.008, 0.044, 0.008).translate(0.03, 0, 0),
                  ];
                  return mergeGeometries(parts)!;
                }),
                gm,
                false,
              );
      lens.position.set(sx * f.eye.x, f.eye.y + 0.002, z);
      lens.scale.setScalar(r / 0.031);
      // Turned with the face round the head.
      lens.rotation.y = sx * 0.12;
      const arm = add(
        geo('m-glasses-arm', () => new THREE.BoxGeometry(0.006, 0.006, 1)),
        gm,
        false,
      );
      const x0 = f.eye.x + r * 0.95;
      const len = z - f.ear.z;
      arm.scale.z = len;
      arm.position.set(sx * Math.min(f.half + 0.008, x0 + 0.02), f.eye.y + 0.008, z - len / 2);
      arm.rotation.y = sx * -Math.atan2(f.half + 0.008 - x0, len);
    }
    const bridge = add(
      geo('m-bridge', () => new THREE.BoxGeometry(1, 0.006, 0.006)),
      gm,
      false,
    );
    bridge.scale.x = Math.max(0.01, 2 * (f.eye.x - r) + 0.006);
    bridge.position.set(0, f.eye.y + 0.008, z + 0.002);
  }

  // Studs on the lobes.
  if (look.earrings === 'studs')
    for (const sx of [-1, 1]) {
      const e = add(
        geo('m-stud', () => new THREE.SphereGeometry(0.009, 8, 6)),
        mat(SILVER, { rough: 0.2, metal: 0.6 }),
        false,
      );
      e.position.set(sx * f.ear.x * 0.98, f.ear.y, f.ear.z);
    }
  return g;
}

/** Lips: the skin, deeper and a little red (rosier on light skin, deeper on dark). */
function lipColour(skin: string): string {
  const c = new THREE.Color().setStyle(skin, THREE.SRGBColorSpace);
  const l = c.r * 0.2126 + c.g * 0.7152 + c.b * 0.0722;
  return l > 0.3 ? mix(skin, '#b04a52', 0.45) : mix(skin, '#8a3c3c', 0.3);
}

/**
 * The kit heads measured, and hair grown on them: where each head's eyes,
 * brows, nose, mouth, chin and crown are (`HeadFit`, so hats, glasses and a
 * gele are made to fit that head), and "shells" cut from the head's own skin
 * and lifted off it, so facial hair and close-cropped hair follow the jaw and
 * the skull exactly (the kit has no beards, and only one haircut per head):
 *
 * - a beard over the cheeks, jaw and chin with the lips left bare, a
 *   moustache, a goatee (moustache and chin), each thicker where hair grows
 *   fuller (the chin) and thinning to nothing at its edges, every facet a
 *   shade lighter or darker than the next (hair, not a mask);
 * - stubble: a skin-thin shell in a darker skin tone (a shadow, not hair);
 * - a scalp: close-cropped hair over the crown, down to the hairline (a buzz
 *   cut, what shows under a cap, the base under twists, a bun or locs).
 *
 * Everything is in the person's head frame (`HeadFrame`): the low-poly
 * person's skull frame (../../interiors3d/character.ts), centred on the
 * skull, 0.142 its half width, y up and z forward, so a head part made for
 * one head is the same size on every other. Shells are skinned meshes on the
 * person's own skeleton: they move with the head whatever it does.
 */
import * as THREE from 'three';

/** Facial hair the look can have (`AvatarLook.facialHair`). */
export type FaceHair = 'beard' | 'stubble' | 'moustache' | 'goatee';

/** Kit head (bone space) → head frame: `q · (b − c) / k`. */
export interface HeadFrame {
  c: THREE.Vector3;
  k: number;
  q: THREE.Quaternion;
}

/** Where a kit head's features are, in the head frame. */
export interface HeadFit {
  /** The top of the skull. */
  crown: number;
  /** The skull's half width, and how far forward (the forehead) and back it reaches. */
  half: number;
  front: number;
  back: number;
  /** Each eye's middle (x: either side), its front, and its height. */
  eye: { x: number; y: number; z: number; h: number };
  /** The top of the brows, and the brow ridge's front. */
  brow: number;
  browZ: number;
  /** The tip of the nose. */
  nose: { y: number; z: number };
  /** The middle of the mouth, on the face's surface. */
  mouth: { y: number; z: number };
  /** The bottom of the chin. */
  chin: number;
  /** An earlobe (x: either side). */
  ear: { x: number; y: number; z: number };
}

/** The head-frame position of each vertex of a skinned mesh, in its bind pose. */
export function headPoints(mesh: THREE.SkinnedMesh, head: number, frame: HeadFrame): Float32Array {
  const M = new THREE.Matrix4().multiplyMatrices(
    mesh.skeleton.boneInverses[head]!,
    mesh.bindMatrix,
  );
  const p = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
  const out = new Float32Array(p.count * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).applyMatrix4(M).sub(frame.c).applyQuaternion(frame.q);
    v.divideScalar(frame.k);
    out[i * 3] = v.x;
    out[i * 3 + 1] = v.y;
    out[i * 3 + 2] = v.z;
  }
  return out;
}

type Pts = Float32Array;
const each = (p: Pts, f: (x: number, y: number, z: number) => void) => {
  for (let i = 0; i < p.length; i += 3) f(p[i]!, p[i + 1]!, p[i + 2]!);
};

/** Measure a head from its skin, eyes and brows (head-frame points). */
export function measureHead(skin: Pts[], eyes: Pts[], brows: Pts[]): HeadFit {
  let crown = -1;
  let half = 0;
  const all = (f: (x: number, y: number, z: number) => void) => skin.forEach((p) => each(p, f));
  all((_x, y) => (crown = Math.max(crown, y)));
  // The eyes: their box (either side folded onto +x).
  let ex0 = 1,
    ex1 = 0,
    ey0 = 1,
    ey1 = -1,
    ez = -1;
  for (const p of eyes)
    each(p, (x, y, z) => {
      const ax = Math.abs(x);
      ex0 = Math.min(ex0, ax);
      ex1 = Math.max(ex1, ax);
      ey0 = Math.min(ey0, y);
      ey1 = Math.max(ey1, y);
      ez = Math.max(ez, z);
    });
  if (ez < 0) {
    ex0 = 0.04;
    ex1 = 0.076;
    ey0 = -0.01;
    ey1 = 0.024;
    ez = 0.135;
  }
  const eye = { x: (ex0 + ex1) / 2, y: (ey0 + ey1) / 2, z: ez, h: ey1 - ey0 };
  let brow = -1;
  for (const p of brows) each(p, (_x, y) => (brow = Math.max(brow, y)));
  if (brow < eye.y) brow = ey1 + 0.015;
  let front = 0,
    back = 0,
    browZ = 0,
    nose = { y: eye.y - 0.08, z: 0 };
  all((x, y, z) => {
    if (y > eye.y - 0.05) half = Math.max(half, Math.abs(x));
    if (y > eye.y + 0.03 && y < eye.y + 0.11 && Math.abs(x) < 0.06) front = Math.max(front, z);
    if (y > eye.y) back = Math.min(back, z);
    if (Math.abs(y - brow) < 0.02 && Math.abs(x) < 0.08) browZ = Math.max(browZ, z);
    if (y < eye.y - 0.02 && Math.abs(x) < 0.03 && z > nose.z) nose = { y, z };
  });
  // The chin: the lowest point of the jaw's front (the neck is further back).
  let chin = nose.y - 0.06;
  all((x, y, z) => {
    if (Math.abs(x) < 0.05 && z > nose.z - 0.06 && y < chin) chin = y;
  });
  // An earlobe: the widest point beside the jaw, below the eyes.
  const ear = { x: half - 0.012, y: eye.y - 0.05, z: (front + back) / 2 + 0.01 };
  let ew = 0;
  all((x, y, z) => {
    if (y < eye.y - 0.03 && y > eye.y - 0.09 && Math.abs(x) > ew) {
      ew = Math.abs(x);
      ear.x = ew;
      ear.y = y;
      ear.z = z;
    }
  });
  const my = nose.y + 0.42 * (chin - nose.y);
  let mz = 0;
  all((x, y, z) => {
    if (Math.abs(x) < 0.025 && Math.abs(y - my) < 0.015) mz = Math.max(mz, z);
  });
  return {
    crown,
    half,
    front,
    back,
    eye,
    brow,
    browZ: browZ || front,
    nose,
    mouth: { y: my, z: mz || nose.z - 0.03 },
    chin,
    ear,
  };
}

const clamp01 = (u: number) => Math.max(0, Math.min(1, u));
const lerp = (a: number, b: number, u: number) => a + (b - a) * clamp01(u);

/**
 * How thick hair grows at a point of the head (head frame), or < 0 where it
 * doesn't. `lift` is the direction it is lifted along, from a point inside.
 */
interface Grow {
  t: (x: number, y: number, z: number) => number;
  from: THREE.Vector3;
  /** Each facet a little lighter or darker (hair); 0: flat (stubble). */
  vary: number;
}

/** Where facial hair grows, by style. */
export function faceGrow(f: HeadFit, style: FaceHair): Grow {
  const lipH = Math.max(0.009, (f.chin - f.nose.y) * -0.12);
  const lipW = 0.042;
  const lip = (x: number, y: number, z: number) =>
    Math.abs(x) < lipW && Math.abs(y - f.mouth.y) < lipH && z > f.mouth.z - 0.05;
  // Above the lip, below the nose.
  const stache = (x: number, y: number, z: number) =>
    Math.abs(x) < lipW + 0.008 &&
    y < f.nose.y - 0.006 &&
    y > f.mouth.y + lipH * 0.35 - (Math.abs(x) > lipW - 0.006 ? lipH * 1.4 : 0) &&
    z > f.mouth.z - 0.028;
  // The chin, under the lip.
  const chinPatch = (x: number, y: number, z: number) =>
    Math.abs(x) < 0.05 && y < f.mouth.y - lipH * 0.8 && y > f.chin - 0.035 && z > f.nose.z - 0.1;
  // A full beard: up the cheeks to under the cheekbone, sideburns to the ears, under the jaw.
  const top = (x: number, z: number) => {
    const ax = Math.abs(x);
    let t = lerp(f.nose.y - 0.008, f.eye.y - 0.045, (ax - 0.035) / 0.075);
    if (z < f.eye.z - 0.06 && ax > f.half - 0.05) t = Math.max(t, f.eye.y - 0.005);
    return t;
  };
  const full = (x: number, y: number, z: number) =>
    y < top(x, z) && z > f.ear.z - 0.05 && y > f.chin - 0.07 && !(z < 0.02 && y < f.chin - 0.02);
  const from = new THREE.Vector3(0, (f.nose.y + f.chin) / 2 + 0.03, f.ear.z - 0.02);
  switch (style) {
    case 'stubble':
      return { t: (x, y, z) => (full(x, y, z) && !lip(x, y, z) ? 0.0035 : -1), from, vary: 0 };
    case 'moustache':
      return { t: (x, y, z) => (stache(x, y, z) ? 0.011 : -1), from, vary: 0.1 };
    case 'goatee':
      return {
        t: (x, y, z) =>
          lip(x, y, z) ? -1 : stache(x, y, z) ? 0.011 : chinPatch(x, y, z) ? 0.016 : -1,
        from,
        vary: 0.1,
      };
    case 'beard':
      return {
        t: (x, y, z) => {
          if (lip(x, y, z) || !full(x, y, z)) return -1;
          // Fuller on the chin, thinning to the edge of the cheeks.
          const edge = clamp01((top(x, z) - y) / 0.035);
          const chinny = clamp01((f.mouth.y - y) / 0.05) * clamp01(1 - Math.abs(x) / 0.09);
          return (0.008 + 0.011 * chinny) * (0.3 + 0.7 * edge);
        },
        from,
        vary: 0.12,
      };
  }
}

/** Where close-cropped hair grows: the crown, down to the hairline (forehead, ears, nape). */
export function scalpGrow(f: HeadFit, thick = 0.011): Grow {
  const cz = (f.front + f.back) / 2;
  const line = (x: number, z: number) => {
    // Round the head from the front (0) to the back (1).
    const a = Math.abs(Math.atan2(x, z - cz)) / Math.PI;
    const front = f.brow + 0.045;
    const side = f.eye.y + 0.04;
    const nape = f.mouth.y + 0.01;
    return a < 0.2
      ? front
      : a < 0.42
        ? lerp(front, side, (a - 0.2) / 0.22)
        : lerp(side, nape, (a - 0.6) / 0.3);
  };
  return {
    t: (x, y, z) => {
      const l = line(x, z);
      return y > l ? thick * (0.35 + 0.65 * clamp01((y - l) / 0.03)) : -1;
    },
    from: new THREE.Vector3(0, f.eye.y - 0.02, cz),
    vary: 0.08,
  };
}

/** A tiny repeatable hash (a facet's shade). */
const hash = (n: number) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

/**
 * A shell over part of a skinned mesh: its triangles where hair grows, each
 * corner lifted off the skin by the hair's thickness there, skinned as the
 * skin is. Null if nothing grows on it.
 */
export function shellGeometry(
  mesh: THREE.SkinnedMesh,
  head: number,
  frame: HeadFrame,
  grow: Grow,
): THREE.BufferGeometry | null {
  const g = mesh.geometry;
  const pts = headPoints(mesh, head, frame);
  const M = new THREE.Matrix4().multiplyMatrices(
    mesh.skeleton.boneInverses[head]!,
    mesh.bindMatrix,
  );
  const Mi = M.clone().invert();
  const qi = frame.q.clone().invert();
  const si = g.getAttribute('skinIndex') as THREE.BufferAttribute;
  const sw = g.getAttribute('skinWeight') as THREE.BufferAttribute;
  const n = g.index ? g.index.count : pts.length / 3;
  const at = (i: number) => (g.index ? g.index.getX(i) : i);
  const pos: number[] = [];
  const idx: number[] = [];
  const wts: number[] = [];
  const col: number[] = [];
  const v = new THREE.Vector3();
  const d = new THREE.Vector3();
  for (let t = 0; t + 2 < n; t += 3) {
    const a = at(t),
      b = at(t + 1),
      c = at(t + 2);
    const cx = (pts[a * 3]! + pts[b * 3]! + pts[c * 3]!) / 3;
    const cy = (pts[a * 3 + 1]! + pts[b * 3 + 1]! + pts[c * 3 + 1]!) / 3;
    const czz = (pts[a * 3 + 2]! + pts[b * 3 + 2]! + pts[c * 3 + 2]!) / 3;
    if (grow.t(cx, cy, czz) < 0) continue;
    const shade = 1 + (hash(t) - 0.5) * 2 * grow.vary;
    for (const i of [a, b, c]) {
      v.set(pts[i * 3]!, pts[i * 3 + 1]!, pts[i * 3 + 2]!);
      const th = Math.max(0.0015, grow.t(v.x, v.y, v.z));
      d.copy(v).sub(grow.from).normalize();
      v.addScaledVector(d, th).multiplyScalar(frame.k).applyQuaternion(qi).add(frame.c);
      v.applyMatrix4(Mi);
      pos.push(v.x, v.y, v.z);
      idx.push(si.getX(i), si.getY(i), si.getZ(i), si.getW(i));
      wts.push(sw.getX(i), sw.getY(i), sw.getZ(i), sw.getW(i));
      col.push(shade, shade, shade);
    }
  }
  if (!pos.length) return null;
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(idx, 4));
  out.setAttribute('skinWeight', new THREE.Float32BufferAttribute(wts, 4));
  out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  out.computeVertexNormals();
  out.userData.shared = true;
  return out;
}

/** Hair's material: matte, faceted, each facet its own shade (shared per colour). */
const HAIR_MATS = new Map<string, THREE.MeshStandardMaterial>();
export function shellMaterial(
  colour: string,
  kind: 'hair' | 'stubble',
): THREE.MeshStandardMaterial {
  const key = `${kind}|${colour}`;
  let m = HAIR_MATS.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color: colour,
      roughness: kind === 'hair' ? 0.95 : 0.8,
      metalness: 0,
      flatShading: true,
      vertexColors: true,
    });
    if (kind === 'stubble') {
      // Over the skin it lies on (barely off it): always drawn on top.
      m.polygonOffset = true;
      m.polygonOffsetFactor = -2;
      m.polygonOffsetUnits = -2;
    }
    m.userData.shared = true;
    HAIR_MATS.set(key, m);
  }
  return m;
}

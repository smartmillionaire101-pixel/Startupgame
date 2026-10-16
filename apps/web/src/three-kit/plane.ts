/**
 * A plane in 3D, built from proper shapes rather than boxes: a lathed
 * fuselage (rounded nose, the tail cone sweeping up), swept wings extruded
 * from their planform, a fin and tailplane, the engines (under the wings of
 * an airliner, on the rear fuselage of a business jet), cabin and cockpit
 * windows, the livery on the fin, engines and a cheatline, and short landing
 * gear (a nose leg, the mains just behind the wing) that folds away.
 *
 * Nose along +x, wheels on y = 0, `length` long. Parts that share a
 * material are merged, so a plane is a handful of draw calls.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export type Plane3DKind = 'airliner' | 'bizjet';

export interface Plane3D {
  root: THREE.Group;
  /** The landing gear: 1 down, 0 folded away. */
  setGear: (u: number) => void;
}

interface Spec {
  /** Fuselage radius, as a share of the length. */
  r: number;
  /** Height of the fuselage's centre line over the ground, gear down. */
  ride: number;
  span: number;
  wingX: number;
  rootChord: number;
  tipChord: number;
  sweep: number;
  wingY: number;
  windows: number;
}

const SPECS: Record<Plane3DKind, Spec> = {
  airliner: {
    r: 0.052,
    ride: 0.13,
    span: 0.92,
    wingX: 0.08,
    rootChord: 0.2,
    tipChord: 0.06,
    sweep: 0.22,
    wingY: -0.03,
    windows: 22,
  },
  bizjet: {
    r: 0.06,
    ride: 0.09,
    span: 0.8,
    wingX: 0.0,
    rootChord: 0.17,
    tipChord: 0.06,
    sweep: 0.15,
    wingY: -0.035,
    windows: 6,
  },
};

/** The fuselage profile: radius (share of r) along the length, tail (-0.5) to nose (+0.5). */
const PROFILE: Record<Plane3DKind, [number, number][]> = {
  airliner: [
    [-0.5, 0.12],
    [-0.46, 0.4],
    [-0.38, 0.72],
    [-0.28, 0.95],
    [-0.2, 1],
    [0.34, 1],
    [0.4, 0.94],
    [0.45, 0.78],
    [0.48, 0.55],
    [0.495, 0.3],
    [0.5, 0],
  ],
  bizjet: [
    [-0.5, 0.1],
    [-0.44, 0.42],
    [-0.34, 0.8],
    [-0.24, 1],
    [0.18, 1],
    [0.28, 0.9],
    [0.38, 0.66],
    [0.46, 0.34],
    [0.5, 0],
  ],
};

function material(color: string, o: { rough?: number; metal?: number } = {}) {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(color),
    roughness: o.rough ?? 0.45,
    metalness: o.metal ?? 0.1,
  });
}

/** A flat outline (x, z pairs) extruded `t` thick, lying flat (y up). */
function slab(pts: [number, number][], t: number): THREE.BufferGeometry {
  const s = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
  const g = new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: false });
  g.rotateX(-Math.PI / 2);
  g.translate(0, -t / 2, 0);
  return g;
}

/** An upright outline (x, y pairs) extruded `t` thick across the centre line. */
function fin(pts: [number, number][], t: number): THREE.BufferGeometry {
  const s = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: false });
  g.translate(0, 0, -t / 2);
  return g;
}

/** A nacelle: a short tube along x, open at the front (the intake dark). */
function nacelle(len: number, r: number): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r * 0.92, r, len, 16, 1, false);
  g.rotateZ(Math.PI / 2);
  return g;
}

export function makePlane3D({
  kind = 'airliner',
  livery = '#0f766e',
  length = 1,
}: {
  kind?: Plane3DKind;
  livery?: string;
  length?: number;
}): Plane3D {
  const S = SPECS[kind];
  const R = S.r;
  const jet = kind === 'bizjet';
  const parts: Record<'skin' | 'metal' | 'livery' | 'dark' | 'belly', THREE.BufferGeometry[]> = {
    skin: [],
    metal: [],
    livery: [],
    dark: [],
    belly: [],
  };

  // Fuselage: the profile lathed round, laid along x; the tail cone swept up
  // so its top runs on straight, the nose dipping a touch.
  const prof = PROFILE[kind].map(([x, k]) => new THREE.Vector2(Math.max(0.0005, k * R), x));
  const body = new THREE.LatheGeometry(prof, 28);
  body.rotateZ(-Math.PI / 2);
  const pos = body.attributes.position!;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const rr = Math.hypot(y, z);
    if (x < -0.2) pos.setY(i, y + (R - rr) * 0.9);
    else if (x > 0.3) pos.setY(i, y - (R - rr) * 0.25);
  }
  body.computeVertexNormals();
  parts.skin.push(body);
  // Over the straight part of the cabin: a darker belly, and a cheatline in
  // the livery under the windows on each side.
  const [c0, c1] = jet ? [-0.24, 0.18] : [-0.2, 0.34];
  const sleeve = (r: number, from: number, len: number) => {
    const g = new THREE.CylinderGeometry(r, r, c1 - c0, 28, 1, true, from, len);
    g.rotateZ(Math.PI / 2);
    g.translate((c0 + c1) / 2, 0, 0);
    return g;
  };
  parts.belly.push(sleeve(R * 1.004, Math.PI * 1.14, Math.PI * 0.72));
  parts.livery.push(sleeve(R * 1.008, -0.2, 0.12), sleeve(R * 1.008, Math.PI + 0.08, 0.12));

  // Cabin windows, both sides, and the cockpit.
  const win = jet
    ? new THREE.SphereGeometry(0.011, 8, 6)
    : new THREE.BoxGeometry(0.012, 0.016, 0.004);
  if (jet) win.scale(0.8, 1.1, 0.3);
  const n = S.windows;
  const first = jet ? -0.14 : -0.18;
  const step = jet ? 0.055 : 0.024;
  for (let i = 0; i < n; i++)
    for (const side of [-1, 1]) {
      const g = win.clone();
      g.translate(first + i * step, R * 0.32, side * R * 0.95);
      parts.dark.push(g);
    }
  win.dispose();
  for (const side of [-1, 1]) {
    const c = new THREE.BoxGeometry(0.035, 0.016, 0.004);
    c.rotateZ(-0.35);
    c.rotateY(side * 0.5);
    c.translate(jet ? 0.39 : 0.43, R * 0.42, side * R * 0.62);
    parts.dark.push(c);
  }

  // Wings: swept, the root a little ahead of the middle, a little dihedral, winglets.
  const rc = S.rootChord;
  const tc = S.tipChord;
  const half = S.span / 2;
  for (const side of [-1, 1]) {
    const w = slab(
      [
        [S.wingX + rc / 2, 0],
        [S.wingX + rc / 2 - S.sweep, side * half],
        [S.wingX + rc / 2 - S.sweep - tc, side * half],
        [S.wingX - rc / 2, 0],
      ],
      0.012,
    );
    w.rotateX(-0.07 * side);
    w.translate(0, S.wingY, 0);
    parts.metal.push(w);
    const tip = fin(
      [
        [0, 0],
        [-tc * 0.6, 0.06],
        [-tc * 1.0, 0.06],
        [-tc, 0],
      ],
      0.006,
    );
    tip.translate(S.wingX + rc / 2 - S.sweep, S.wingY + half * 0.07, side * half);
    parts.livery.push(tip);
  }

  // Tail: the fin in the livery, the tailplane low (airliner) or on top (T-tail).
  const finH = jet ? 0.19 : 0.2;
  parts.livery.push(
    fin(
      [
        [-0.3, R * 0.6],
        [-0.43, finH],
        [-0.49, finH],
        [-0.5, R * 0.8],
      ],
      0.012,
    ),
  );
  const tp = (y: number, sp: number) => {
    for (const side of [-1, 1]) {
      const g = slab(
        [
          [jet ? -0.42 : -0.39, 0],
          [-0.47, side * sp],
          [-0.5, side * sp],
          [-0.47, 0],
        ],
        0.008,
      );
      g.translate(jet ? -0.01 : 0, y, 0);
      parts.metal.push(g);
    }
  };
  if (jet) tp(finH - 0.004, 0.13);
  else tp(R * 0.3, 0.17);

  // Engines.
  if (jet)
    for (const side of [-1, 1]) {
      const e = nacelle(0.13, 0.026);
      e.translate(-0.31, R * 0.55, side * (R + 0.04));
      parts.livery.push(e);
      const lip = new THREE.CircleGeometry(0.022, 16);
      lip.rotateY(Math.PI / 2);
      lip.translate(-0.244, R * 0.55, side * (R + 0.04));
      parts.dark.push(lip);
      const py = new THREE.BoxGeometry(0.05, 0.008, 0.04);
      py.translate(-0.32, R * 0.55, side * (R + 0.015));
      parts.metal.push(py);
    }
  else
    for (const side of [-1, 1]) {
      const z = side * half * 0.36;
      const x = S.wingX + rc / 2 - S.sweep * 0.36 + 0.03;
      const e = nacelle(0.14, 0.034);
      e.translate(x, S.wingY - 0.045, z);
      parts.skin.push(e);
      const lip = new THREE.CylinderGeometry(0.0345, 0.0345, 0.03, 16, 1, true);
      lip.rotateZ(Math.PI / 2);
      lip.translate(x + 0.06, S.wingY - 0.045, z);
      parts.livery.push(lip);
      const fan = new THREE.CircleGeometry(0.031, 16);
      fan.rotateY(Math.PI / 2);
      fan.translate(x + 0.071, S.wingY - 0.045, z);
      parts.dark.push(fan);
      const py = new THREE.BoxGeometry(0.08, 0.03, 0.008);
      py.translate(x - 0.02, S.wingY - 0.018, z);
      parts.metal.push(py);
    }

  const mats = {
    skin: material('#f8fafc'),
    belly: material('#dbe2ea'),
    metal: material('#c4ccd6', { metal: 0.35, rough: 0.4 }),
    livery: material(livery, { rough: 0.5 }),
    dark: material('#1e293b', { rough: 0.2 }),
  };
  const plane = new THREE.Group();
  for (const k of Object.keys(parts) as (keyof typeof parts)[]) {
    if (!parts[k].length) continue;
    const g = mergeGeometries(
      parts[k]
        .map((x) => (x.index ? x.toNonIndexed() : x))
        .map((x) => {
          x.deleteAttribute('uv');
          return x;
        }),
      false,
    )!;
    for (const x of parts[k]) x.dispose();
    const m = new THREE.Mesh(g, mats[k]);
    m.castShadow = true;
    m.userData.ownMaterial = true;
    plane.add(m);
  }

  // Landing gear: struts and wheels, folding up into the belly.
  const gear = new THREE.Group();
  const strut = material('#94a3b8', { metal: 0.5 });
  const tyre = material('#1f2937', { rough: 0.9, metal: 0 });
  const legs: THREE.BufferGeometry[] = [];
  const wheels: THREE.BufferGeometry[] = [];
  const wheelR = jet ? 0.016 : 0.02;
  const leg = (x: number, z: number, pair: boolean) => {
    const top = -R * 0.8;
    const bottom = -S.ride + wheelR;
    const s = new THREE.CylinderGeometry(0.004, 0.004, top - bottom, 6);
    s.translate(x, (top + bottom) / 2, z);
    legs.push(s);
    for (const dz of pair ? [-0.012, 0.012] : [0]) {
      const w = new THREE.CylinderGeometry(wheelR, wheelR, 0.01, 14);
      w.rotateX(Math.PI / 2);
      w.translate(x, bottom, z + dz);
      wheels.push(w);
    }
  };
  leg(jet ? 0.32 : 0.36, 0, !jet);
  const mainX = S.wingX - rc * 0.55;
  for (const side of [-1, 1]) leg(mainX, side * (jet ? 0.05 : 0.07), !jet);
  const legMesh = new THREE.Mesh(mergeGeometries(legs, false)!, strut);
  const wheelMesh = new THREE.Mesh(mergeGeometries(wheels, false)!, tyre);
  for (const x of [...legs, ...wheels]) x.dispose();
  legMesh.castShadow = wheelMesh.castShadow = true;
  legMesh.userData.ownMaterial = wheelMesh.userData.ownMaterial = true;
  gear.add(legMesh, wheelMesh);
  plane.add(gear);

  // Wheels on the ground at y = 0.
  plane.position.y = S.ride;
  const root = new THREE.Group();
  root.add(plane);
  root.scale.setScalar(length);
  return {
    root,
    // Folding: the legs shrink up into the fuselage, then they're gone.
    setGear(u) {
      const k = Math.max(0, Math.min(1, u));
      gear.visible = k > 0.02;
      gear.scale.y = Math.max(0.02, k);
    },
  };
}

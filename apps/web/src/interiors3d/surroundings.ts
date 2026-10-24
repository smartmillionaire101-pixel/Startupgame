/**
 * Player feedback: "When I spin the house around I am floating in the sky;
 * this needs to feel realistic." What lies round your home, so that turning
 * round it (Turn, Look around) shows a place, not an island in the sky:
 *
 * - A house or a flat: the ground runs out to the haze on every side, the
 *   street in front carries on past your gate with pavements and street
 *   trees, cross streets cut through, and the neighbours' houses (or blocks
 *   of flats) stand on their own plots along it, behind you and across the
 *   road, with hedges, drives and trees in their gardens.
 * - A penthouse or a hotel room on a roof: the building under you goes all
 *   the way down to the street, where the city's blocks, roads and trees lie
 *   far below, with lower buildings round yours and towers rising past it.
 *
 * It's cheap on a phone: the static parts are merged into a few meshes (one
 * per material), the buildings are instanced (one body and one roof mesh for
 * all of them), all low poly. Buildings between the camera and your home
 * hide while they would block the view (like the house's own walls), so the
 * home stays in sight from every side. World units as in ./house.ts.
 */
import * as THREE from 'three';
import type { Grounds } from '../home/grounds';
import { Kit, mat } from './kit';

// ---------------------------------------------------------------------------
// Textures (cached: one each).

const texCache = new Map<string, THREE.CanvasTexture>();
export function canvasTex(id: string, size: number, draw: (g: CanvasRenderingContext2D) => void) {
  let t = texCache.get(id);
  if (!t) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    draw(c.getContext('2d')!);
    t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    texCache.set(id, t);
  }
  const out = t.clone();
  out.needsUpdate = true;
  return out;
}

/** A tower's face: rows of windows (sky-blue glass by day, warm and lit at night). */
export const towerTexture = (night: boolean) =>
  canvasTex(`tower:${night ? 1 : 0}`, 64, (g) => {
    g.fillStyle = night ? '#1f2937' : '#e5e7eb';
    g.fillRect(0, 0, 64, 64);
    for (let y = 0; y < 4; y++)
      for (let x = 0; x < 4; x++) {
        const lit = (x * 7 + y * 5) % 3 !== 0;
        g.fillStyle = night ? (lit ? '#ffe2a0' : '#111827') : '#9fc8dd';
        g.fillRect(x * 16 + 3, y * 16 + 3, 10, 9);
      }
  });

/** A bright mown lawn (stripes and blades). */
const lawnTexture = () =>
  canvasTex('lawn', 256, (g) => {
    for (let i = 0; i < 8; i++) {
      g.fillStyle = i % 2 ? '#7cc35a' : '#72b951';
      g.fillRect(0, i * 32, 256, 32);
    }
    for (let i = 0; i < 2200; i++) {
      const a = 0.05 + (i % 5) * 0.025;
      g.fillStyle = i % 3 ? `rgba(40,95,30,${a})` : `rgba(200,240,160,${a})`;
      g.fillRect((i * 37) % 256, (i * 91) % 256, 1 + (i % 2), 3);
    }
  });

/** Rough grass for the land round the plots (no mowing stripes). */
const meadowTexture = () =>
  canvasTex('meadow', 256, (g) => {
    g.fillStyle = '#6aa94c';
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 3200; i++) {
      const a = 0.06 + (i % 7) * 0.02;
      g.fillStyle = i % 3 ? `rgba(38,84,28,${a})` : `rgba(190,226,140,${a})`;
      const s = 2 + (i % 4) * 2;
      g.fillRect((i * 53) % 256, (i * 97 + (i >> 3)) % 256, s, s);
    }
  });

/** Asphalt, a little speckled. */
export const asphaltTexture = () =>
  canvasTex('asphalt', 128, (g) => {
    g.fillStyle = '#56595e';
    g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 500; i++) {
      g.fillStyle = `rgba(255,255,255,${0.025 + (i % 5) * 0.012})`;
      g.fillRect((i * 37) % 128, (i * 71) % 128, 2, 2);
    }
  });

/** Paving slabs in the city below a roof. */
const pavingTexture = () =>
  canvasTex('paving', 128, (g) => {
    g.fillStyle = '#c9c4ba';
    g.fillRect(0, 0, 128, 128);
    g.strokeStyle = 'rgba(90,80,70,0.25)';
    g.lineWidth = 2;
    for (let i = 0; i <= 128; i += 32) {
      g.beginPath();
      g.moveTo(i, 0);
      g.lineTo(i, 128);
      g.moveTo(0, i);
      g.lineTo(128, i);
      g.stroke();
    }
  });

/**
 * A building's face, `cols` × `rows` windows over the whole face (the
 * instanced boxes stretch it over each wall). White walls: the instance
 * colour paints them.
 */
const facadeTexture = (cols: number, rows: number, night: boolean, door: boolean) =>
  canvasTex(`facade:${cols}:${rows}:${night ? 1 : 0}:${door ? 1 : 0}`, 128, (g) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, 128, 128);
    const cw = 128 / cols;
    const rh = 128 / rows;
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++) {
        const lit = (x * 7 + y * 3) % 4 !== 0;
        const isDoor = door && y === rows - 1 && x === Math.floor(cols / 2);
        g.fillStyle = isDoor ? '#5b4636' : night ? (lit ? '#ffd88a' : '#1e2633') : '#7fa6bd';
        if (isDoor) g.fillRect(x * cw + cw * 0.3, y * rh + rh * 0.3, cw * 0.4, rh * 0.7);
        else g.fillRect(x * cw + cw * 0.22, y * rh + rh * 0.24, cw * 0.56, rh * 0.5);
        // A white sill under each window.
        if (!isDoor) {
          g.fillStyle = 'rgba(0,0,0,0.12)';
          g.fillRect(x * cw + cw * 0.18, y * rh + rh * 0.74, cw * 0.64, rh * 0.05);
        }
      }
  });

// ---------------------------------------------------------------------------
// Buildings that can hide while they'd block the view.

export interface Occluder {
  /** Footprint centre, top (yard space) and half-diagonal. */
  x: number;
  z: number;
  top: number;
  r: number;
  hidden: boolean;
  set(hide: boolean): void;
}

export interface Surroundings {
  group: THREE.Group;
  occluders: Occluder[];
  /** How far the world reaches from the home (metres): the fog fades it out before then. */
  reach: number;
}

/** A unit gable roof: ridge along x, base 1 × 1 at y = 0, apex at y = 1. */
function gableGeometry() {
  const p = [
    // Slopes (front +z, back -z).
    [-0.5, 0, 0.5, 0.5, 0, 0.5, 0.5, 1, 0, -0.5, 0, 0.5, 0.5, 1, 0, -0.5, 1, 0],
    [0.5, 0, -0.5, -0.5, 0, -0.5, -0.5, 1, 0, 0.5, 0, -0.5, -0.5, 1, 0, 0.5, 1, 0],
    // Gables.
    [0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 1, 0],
    [-0.5, 0, -0.5, -0.5, 0, 0.5, -0.5, 1, 0],
  ].flat();
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  geo.computeVertexNormals();
  return geo;
}

interface Block {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  /** The ground it stands on (yard space). */
  y0: number;
  /** Rotation about y (0: the front faces +z). */
  ry: number;
  wall: string;
  /** A pitched roof's height (0: flat). */
  roof: number;
  roofColor: string;
}

/**
 * The buildings, instanced by facade (one body mesh per kind of face, one
 * roof mesh), each an occluder.
 */
function buildBlocks(
  group: THREE.Group,
  occluders: Occluder[],
  blocks: Block[],
  face: (b: Block) => { cols: number; rows: number; door: boolean },
  night: boolean,
  shadowNear: (b: Block) => boolean,
) {
  const kinds = new Map<string, Block[]>();
  for (const b of blocks) {
    const f = face(b);
    const k = `${f.cols}:${f.rows}:${f.door ? 1 : 0}`;
    const list = kinds.get(k) ?? [];
    list.push(b);
    kinds.set(k, list);
  }
  const roofs = blocks.filter((b) => b.roof > 0);
  const roofMesh = roofs.length
    ? new THREE.InstancedMesh(gableGeometry(), mat('#ffffff', { rough: 0.85 }), roofs.length)
    : null;
  if (roofMesh) {
    roofMesh.castShadow = true;
    roofMesh.receiveShadow = true;
    group.add(roofMesh);
  }
  const top = mat('#ffffff', { rough: 0.9 });
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  const color = new THREE.Color();
  let ri = 0;
  for (const [k, list] of kinds) {
    const [cols, rows, door] = k.split(':').map(Number) as [number, number, number];
    const tex = facadeTexture(cols, rows, night, door === 1);
    const side = new THREE.MeshStandardMaterial({
      map: tex,
      roughness: 0.85,
      ...(night
        ? { emissive: new THREE.Color('#ffd27a'), emissiveMap: tex, emissiveIntensity: 0.55 }
        : {}),
    });
    // The roof and the underside are plain (no windows on top).
    const box = new THREE.BoxGeometry(1, 1, 1);
    box.translate(0, 0.5, 0);
    const mesh = new THREE.InstancedMesh(box, [side, side, top, top, side, side], list.length);
    mesh.castShadow = list.some(shadowNear);
    mesh.receiveShadow = true;
    list.forEach((b, i) => {
      q.setFromAxisAngle(up, b.ry);
      const m = new THREE.Matrix4().compose(
        new THREE.Vector3(b.x, b.y0, b.z),
        q,
        new THREE.Vector3(b.w, b.h, b.d),
      );
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, color.set(b.wall));
      let rm: THREE.Matrix4 | null = null;
      let rj = -1;
      if (roofMesh && b.roof > 0) {
        rj = ri++;
        rm = new THREE.Matrix4().compose(
          new THREE.Vector3(b.x, b.y0 + b.h, b.z),
          q,
          new THREE.Vector3(b.w + 0.5, b.roof, b.d + 0.6),
        );
        roofMesh.setMatrixAt(rj, rm);
        roofMesh.setColorAt(rj, color.set(b.roofColor));
      }
      const occ: Occluder = {
        x: b.x,
        z: b.z,
        top: b.y0 + b.h + b.roof,
        r: Math.hypot(b.w, b.d) / 2,
        hidden: false,
        set(hide) {
          if (hide === occ.hidden) return;
          occ.hidden = hide;
          mesh.setMatrixAt(i, hide ? zero : m);
          mesh.instanceMatrix.needsUpdate = true;
          if (roofMesh && rm) {
            roofMesh.setMatrixAt(rj, hide ? zero : rm);
            roofMesh.instanceMatrix.needsUpdate = true;
          }
        },
      };
      occluders.push(occ);
    });
    mesh.computeBoundingSphere();
    group.add(mesh);
  }
  roofMesh?.computeBoundingSphere();
}

/** A small deterministic jitter (no Math.random). */
const rnd = (n: number) => (((Math.sin(n * 91.7 + 3.1) * 47453.5) % 1) + 1) % 1;

const WALLS = ['#f4efe6', '#efe4d0', '#e9d6bf', '#f7f3ec', '#dfe5e8', '#f0dcc8', '#e6e0d4'];
const ROOFS = ['#9a4a32', '#7d3f2c', '#5b6066', '#4b4f56', '#a85a3c', '#6b4a3a'];
const FLATS = ['#e8e2d6', '#d9d3c7', '#efe9df', '#cfd6dc', '#e4d4c0'];
const CITY = ['#e2e8f0', '#d6dee8', '#ece5d8', '#c9d7e6', '#f1f5f9', '#d8d2c6', '#bfc9d4'];

/** A low-poly tree (merged into the kit): a trunk and one or two leafy blobs. */
function kitTree(k: Kit, x: number, y: number, z: number, s: number, seed: number) {
  const greens = ['#3f7a36', '#4d8a40', '#356b2e', '#5a9447'];
  const shade = greens[Math.floor(rnd(seed) * greens.length)]!;
  k.cyl(0.12 * s, 0.16 * s, 1.5 * s, '#6b4a2f', x, y, z, { seg: 5 });
  k.add(new THREE.IcosahedronGeometry(1.15 * s, 0), mat(shade, { rough: 1 }), x, y + 2.3 * s, z, {
    ry: seed,
  });
  if (rnd(seed + 1) > 0.5)
    k.add(
      new THREE.IcosahedronGeometry(0.75 * s, 0),
      mat(greens[(Math.floor(rnd(seed) * 4) + 1) % 4]!, { rough: 1 }),
      x + 0.45 * s,
      y + 3.0 * s,
      z - 0.2 * s,
      { ry: seed * 2 },
    );
}

/** A parked car (merged): a body and a cabin, nose along x. */
function kitCar(k: Kit, x: number, y: number, z: number, color: string, ry: number) {
  const c = Math.cos(ry);
  const s = Math.sin(ry);
  const at = (dx: number) => [x + dx * c, z - dx * s] as const;
  const [bx, bz] = at(0);
  k.box(4.1, 0.7, 1.75, color, bx, y + 0.25, bz, { ry, round: 0.12 });
  const [cx, cz] = at(-0.2);
  k.box(2.2, 0.55, 1.55, '#2a3440', cx, y + 0.95, cz, { ry, round: 0.1 });
}

const CAR_COLORS = ['#e5e7eb', '#1f2937', '#b91c1c', '#1d4ed8', '#9ca3af', '#f8fafc', '#0f766e'];

// ---------------------------------------------------------------------------
// A house or a flat: the neighbourhood round the plot.

export function neighbourhood(
  g: Grounds,
  o: { night: boolean; groundY: number; W: number; H: number },
): Surroundings {
  const group = new THREE.Group();
  const occluders: Occluder[] = [];
  const Y = o.groundY;
  const estate = g.style === 'estate';
  // The plot: inside the hedges (a house), or round the flat's garden.
  let px0: number;
  let px1: number;
  let pz0: number;
  if (g.hedges.length) {
    px0 = Math.min(...g.hedges.map((h) => h.x));
    px1 = Math.max(...g.hedges.map((h) => h.x + h.w));
    pz0 = Math.min(...g.hedges.map((h) => h.y));
  } else {
    px0 = Math.min(g.focus.x, -3.6) - 0.6;
    px1 = Math.max(g.focus.x + g.focus.w, o.W + 3.6) + 0.6;
    pz0 = Math.min(g.focus.y, 0) - 2.6;
  }
  const sy = g.street.y;
  const ROAD = 2.2;
  const PAVE = 2.2;
  const pz1 = sy - ROAD - 0.4;
  const cx = (px0 + px1) / 2;
  const plotW = px1 - px0;
  const plotD = pz1 - pz0;
  const REACH = 170;
  const near = new Kit();
  const far = new Kit();
  const kitOf = (x: number, z: number) =>
    Math.hypot(x - cx, z - (pz0 + pz1) / 2) < Math.max(plotW, plotD) * 0.7 + 14 ? near : far;

  // ---- The land: rough grass to the haze, your plot's mown lawn on it.
  const mt = meadowTexture();
  mt.repeat.set((REACH * 2) / 9, (REACH * 2) / 9);
  const land = new THREE.Mesh(
    new THREE.PlaneGeometry(REACH * 2, REACH * 2),
    mat('#ffffff', { map: mt, rough: 1, own: true }),
  );
  land.rotation.x = -Math.PI / 2;
  land.position.set(cx, Y - 0.03, sy);
  land.receiveShadow = true;
  group.add(land);
  const lt = lawnTexture();
  lt.repeat.set(plotW / 5, plotD / 5);
  const lawn = new THREE.Mesh(
    new THREE.PlaneGeometry(plotW, plotD),
    mat('#ffffff', { map: lt, rough: 1, own: true }),
  );
  lawn.rotation.x = -Math.PI / 2;
  lawn.position.set(cx, Y - 0.02, (pz0 + pz1) / 2);
  lawn.receiveShadow = true;
  group.add(lawn);

  // ---- Streets: yours in front, parallel ones every block, cross streets.
  const lotW = estate ? Math.max(17, Math.min(30, plotW * 0.75)) : 16;
  const rowD = estate ? Math.max(20, Math.min(34, plotD)) : 18;
  const period = 2 * rowD + 2 * ROAD + 2 * PAVE;
  // Your street's block runs your plot's depth (and a row of back gardens); the rest are regular.
  const behind = pz0 - rowD - ROAD - PAVE;
  const streetsZ: number[] = [];
  for (let k = 3; k >= 1; k--) streetsZ.push(behind - (k - 1) * period);
  for (let k = 0; k <= 3; k++) streetsZ.push(sy + k * period);
  const crossGap = 3 * lotW;
  const crossX: number[] = [];
  for (let k = 0; k < 6; k++) {
    crossX.push(px0 - 2 - crossGap - ROAD - k * (crossGap + 2 * ROAD + 2 * PAVE));
    crossX.push(px1 + 2 + crossGap + ROAD + k * (crossGap + 2 * ROAD + 2 * PAVE));
  }
  const road = (x0: number, z0: number, w: number, d: number) => {
    const at = asphaltTexture();
    at.repeat.set(w / 4, d / 4);
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, d),
      mat('#ffffff', { map: at, rough: 0.95, own: true }),
    );
    m.rotation.x = -Math.PI / 2;
    m.position.set(x0 + w / 2, Y + 0.005, z0 + d / 2);
    m.receiveShadow = true;
    group.add(m);
  };
  const X0 = cx - REACH;
  const X1 = cx + REACH;
  const Z0 = sy - REACH;
  const Z1 = sy + REACH;
  for (const z of streetsZ) {
    road(X0, z - ROAD, X1 - X0, ROAD * 2);
    // Kerbed pavements both sides, dashes down the middle.
    for (const s of [-1, 1]) {
      const pz = z + s * (ROAD + PAVE / 2);
      const own = z === sy && s === -1;
      // Your side of your street: a narrow strip to your gate.
      const pw = own ? 0.4 : PAVE;
      const pzz = own ? z - ROAD - 0.2 : pz;
      far.box(X1 - X0, 0.12, pw, '#cfcac1', cx, Y - 0.03, pzz, { rough: 0.95, noShadow: true });
    }
    for (let x = X0 + 1; x < X1 - 1; x += 3)
      if (!crossX.some((c) => Math.abs(c - x) < ROAD + 1))
        far.box(1.4, 0.012, 0.12, '#f5f5f4', x + 0.7, Y + 0.006, z, { noShadow: true });
  }
  for (const x of crossX) {
    road(x - ROAD, Z0, ROAD * 2, Z1 - Z0);
    for (const s of [-1, 1])
      far.box(PAVE, 0.12, Z1 - Z0, '#cfcac1', x + s * (ROAD + PAVE / 2), Y - 0.035, sy, {
        rough: 0.95,
        noShadow: true,
      });
  }
  const onPlot = (x: number, z: number, hw: number, hd: number) =>
    x + hw > px0 - 1 && x - hw < px1 + 1 && z + hd > pz0 - 1 && z - hd < pz1 + 1;

  // Street trees along the pavements and cars parked at the kerb.
  let seed = 1;
  for (const z of streetsZ)
    for (const s of [-1, 1]) {
      if (z === sy && s === -1) continue;
      const tz = z + s * (ROAD + PAVE - 0.5);
      for (let x = X0 + 4; x < X1 - 4; x += 11) {
        seed++;
        if (crossX.some((c) => Math.abs(c - x) < ROAD + PAVE + 1.5)) continue;
        if (Math.hypot(x - cx, tz - sy) > REACH * 0.8) continue;
        kitTree(kitOf(x, tz), x, Y, tz, 0.9 + rnd(seed) * 0.35, seed);
        if (rnd(seed + 7) > 0.72 && Math.abs(x - (g.van.x + 4)) > 12)
          kitCar(
            kitOf(x, tz),
            x + 5.2,
            Y,
            z + s * (ROAD - 1.1),
            CAR_COLORS[Math.floor(rnd(seed + 3) * CAR_COLORS.length)]!,
            0,
          );
      }
    }

  // ---- The neighbours: a plot each along every street, both sides.
  const blocks: Block[] = [];
  const rows: { z0: number; z1: number; face: 1 | -1 }[] = [];
  for (let i = 0; i + 1 < streetsZ.length; i++) {
    const z = streetsZ[i]!;
    const next = streetsZ[i + 1]!;
    // Each block: a row facing the street before it, a row facing the next.
    const a = z + ROAD + PAVE;
    const b = next - ROAD - PAVE;
    const mid = next === sy ? pz0 - 0.5 : (a + b) / 2;
    rows.push({ z0: a, z1: mid, face: -1 }, { z0: mid, z1: b, face: 1 });
  }
  // The lots line up with your plot: one straight across from you (as wide), then lotW each.
  const lots: { x: number; w: number }[] = [{ x: cx, w: plotW + 2 }];
  for (let k = 0; k < 14; k++)
    for (const sgn of [-1, 1])
      lots.push({ x: cx + sgn * (plotW / 2 + 1 + lotW * (k + 0.5)), w: lotW });
  let n = 0;
  for (const r of rows) {
    const d = r.z1 - r.z0;
    for (const lot of lots) {
      n++;
      const lx = lot.x;
      const lotW = lot.w;
      if (crossX.some((c) => Math.abs(lx - c) < ROAD + PAVE + lotW / 2 - 1)) continue;
      if (onPlot(lx, (r.z0 + r.z1) / 2, lotW / 2 - 0.5, d / 2 - 0.5)) continue;
      const dist = Math.hypot(lx - cx, (r.z0 + r.z1) / 2 - sy);
      if (dist > REACH * 0.85) continue;
      const front = r.face === 1 ? r.z1 : r.z0;
      const hw = Math.min(estate ? lotW * (0.28 + rnd(n) * 0.1) : lotW * 0.36, 9);
      const hd = estate ? Math.min(d * 0.32, 5 + rnd(n + 1) * 1.5) : Math.min(d * 0.36, 6.5);
      const setback = estate ? 4.5 + rnd(n + 2) * 2 : 3;
      const hz = front - r.face * (setback + hd);
      const storeys = estate ? (rnd(n + 3) > 0.45 ? 2 : 1) : 3 + Math.floor(rnd(n + 3) * 2);
      const hx = lx + (rnd(n + 4) - 0.5) * (lotW - hw * 2 - 3);
      blocks.push({
        x: hx,
        z: hz,
        w: hw * 2,
        d: hd * 2,
        h: storeys * 3 + 0.3,
        y0: Y,
        ry: 0,
        wall: (estate ? WALLS : FLATS)[Math.floor(rnd(n + 5) * 7) % (estate ? 7 : 5)]!,
        roof: estate ? 1.8 + rnd(n + 6) * 0.8 : 0,
        roofColor: ROOFS[Math.floor(rnd(n + 7) * ROOFS.length)]!,
      });
      const k = kitOf(lx, hz);
      // A drive to the street and a hedge along the front.
      const dx = hx + (hx > lx ? -hw - 1.8 : hw + 1.8);
      const dz0 = Math.min(front, hz + r.face * hd);
      const dz1 = Math.max(front, hz + r.face * hd);
      k.box(2.8, 0.03, dz1 - dz0, '#b9b2a6', dx, Y - 0.01, (dz0 + dz1) / 2, {
        rough: 0.95,
        noShadow: true,
      });
      if (rnd(n + 8) > 0.45)
        kitCar(k, dx, Y, front - r.face * 3, CAR_COLORS[Math.floor(rnd(n + 9) * 7)]!, Math.PI / 2);
      const fz = front - r.face * 0.4;
      const l0 = lx - lotW / 2 + 0.3;
      const l1 = dx - 1.6;
      const r0 = dx + 1.6;
      const r1 = lx + lotW / 2 - 0.3;
      if (l1 > l0) k.box(l1 - l0, 0.8, 0.55, '#2f6b2f', (l0 + l1) / 2, Y, fz, { rough: 1 });
      if (r1 > r0) k.box(r1 - r0, 0.8, 0.55, '#2f6b2f', (r0 + r1) / 2, Y, fz, { rough: 1 });
      // Trees in the back garden.
      const bz = r.face === 1 ? r.z0 + 2.5 : r.z1 - 2.5;
      for (let t = 0; t < (estate ? 2 : 1); t++) {
        const tx = lx + (rnd(n * 3 + t) - 0.5) * (lotW - 4);
        kitTree(k, tx, Y, bz + (rnd(n + t) - 0.5) * 2, 0.9 + rnd(n * 5 + t) * 0.5, n * 7 + t);
      }
    }
  }
  buildBlocks(
    group,
    occluders,
    blocks,
    (b) => ({ cols: estate ? 3 : 4, rows: Math.round(b.h / 3), door: false }),
    o.night,
    (b) => Math.hypot(b.x - cx, b.z - sy) < 40,
  );
  group.add(near.build());
  const farGroup = far.build();
  farGroup.traverse((m) => ((m as THREE.Mesh).castShadow = false));
  group.add(farGroup);
  return { group, occluders, reach: REACH };
}

// ---------------------------------------------------------------------------
// A roof (a penthouse, a hotel): the building under you, the city below.

/** How far below the roof the street is (metres). */
const ROOF_HEIGHT = 42;

export function cityBelow(o: {
  night: boolean;
  groundY: number;
  slab: { x: number; z: number; w: number; d: number };
  /** How far below `groundY` the street is (default: a penthouse's roof). */
  height?: number;
  /** Draw the building under the slab (default; a hotel's tower draws its own). */
  body?: boolean;
}): Surroundings {
  const group = new THREE.Group();
  const occluders: Occluder[] = [];
  const s = o.slab;
  const slabBottom = o.groundY - 0.62;
  const HGT = o.height ?? ROOF_HEIGHT;
  const street = o.groundY - HGT;
  const REACH = 220;
  const cx = s.x + s.w / 2;
  const cz = s.z + s.d / 2;

  // ---- The building you're on, down to the street: floors of windows, a cornice.
  if (o.body !== false) {
    const hgt = slabBottom - street;
    const tex = towerTexture(o.night);
    tex.repeat.set(Math.max(1, Math.round(s.w / 2.4)), Math.round(hgt / 3));
    const m = new THREE.MeshStandardMaterial({
      color: '#e9edf2',
      map: tex,
      roughness: 0.5,
      metalness: 0.2,
      ...(o.night
        ? { emissive: new THREE.Color('#ffd27a'), emissiveMap: tex, emissiveIntensity: 0.7 }
        : {}),
    });
    const body = new THREE.Mesh(new THREE.BoxGeometry(s.w - 0.6, hgt, s.d - 0.6), m);
    body.position.set(cx, street + hgt / 2, cz);
    body.receiveShadow = true;
    group.add(body);
  }

  // ---- The street level: paving to the haze, roads in a grid round the blocks.
  const pt = pavingTexture();
  pt.repeat.set((REACH * 2) / 6, (REACH * 2) / 6);
  const land = new THREE.Mesh(
    new THREE.PlaneGeometry(REACH * 2, REACH * 2),
    mat('#ffffff', { map: pt, rough: 1, own: true }),
  );
  land.rotation.x = -Math.PI / 2;
  land.position.set(cx, street, cz);
  group.add(land);
  const k = new Kit();
  const ROAD = 4.5;
  const BLOCK = Math.max(36, Math.max(s.w, s.d) + 12);
  const P = BLOCK + ROAD * 2;
  const lines: number[] = [];
  for (let i = -4; i < 4; i++) lines.push(i * P + P / 2);
  const at = asphaltTexture();
  at.repeat.set((REACH * 2) / 6, 1.5);
  const roadMat = mat('#ffffff', { map: at, rough: 0.95, own: true });
  for (const l of lines) {
    k.add(new THREE.PlaneGeometry(REACH * 2, ROAD * 2), roadMat, cx, street + 0.02, cz + l, {
      rx: -Math.PI / 2,
      noShadow: true,
    });
    k.add(new THREE.PlaneGeometry(ROAD * 2, REACH * 2), roadMat, cx + l, street + 0.025, cz, {
      rx: -Math.PI / 2,
      noShadow: true,
    });
    for (let t = -REACH; t < REACH; t += 5) {
      k.box(2, 0.02, 0.18, '#f5f5f4', cx + t, street + 0.03, cz + l, { noShadow: true });
      k.box(0.18, 0.02, 2, '#f5f5f4', cx + l, street + 0.03, cz + t, { noShadow: true });
    }
  }

  // ---- The blocks: lower buildings round yours, towers rising past your roof.
  const blocks: Block[] = [];
  let n = 0;
  for (let i = -3; i <= 3; i++)
    for (let j = -3; j <= 3; j++) {
      // Block (i, j) lies between the roads either side; yours, (0, 0), holds your building.
      const ox = cx + i * P;
      const oz = cz + j * P;
      const dist = Math.hypot(ox - cx, oz - cz);
      if (dist > REACH * 0.85) continue;
      const mine = i === 0 && j === 0;
      // A park now and then: lawn and trees.
      if (!mine && rnd(i * 13 + j * 7) > 0.86) {
        k.box(BLOCK, 0.1, BLOCK, '#6aa94c', ox, street, oz, { rough: 1, noShadow: true });
        for (let t = 0; t < 9; t++)
          kitTree(
            k,
            ox + (rnd(t + i * 3) - 0.5) * (BLOCK - 6),
            street + 0.1,
            oz + (rnd(t * 5 + j) - 0.5) * (BLOCK - 6),
            1.4,
            t + i * 11 + j,
          );
        continue;
      }
      // Two by two buildings on a block (yours shares its block with three).
      for (let a = 0; a < 2; a++)
        for (let b = 0; b < 2; b++) {
          n++;
          const qx = ox + (a - 0.5) * (BLOCK / 2);
          const qz = oz + (b - 0.5) * (BLOCK / 2);
          const w = BLOCK / 2 - 3 - rnd(n + 4) * 5;
          const d = BLOCK / 2 - 3 - rnd(n + 5) * 5;
          if (
            mine &&
            Math.abs(qx - cx) < (s.w + w) / 2 + 1 &&
            Math.abs(qz - cz) < (s.d + d) / 2 + 1
          )
            continue;
          const tall = rnd(n * 3 + 1) > (dist < P * 1.6 ? 0.55 : 0.7);
          const top = tall ? HGT + 6 + rnd(n) * 40 : 10 + rnd(n + 2) * (HGT - 16);
          blocks.push({
            x: qx,
            z: qz,
            w,
            d,
            h: top,
            y0: street,
            ry: 0,
            wall: CITY[Math.floor(rnd(n + 6) * CITY.length)]!,
            roof: 0,
            roofColor: '#ffffff',
          });
          // Rooftop plant on the lower ones.
          if (!tall)
            k.box(w * 0.3, 1.4, d * 0.25, '#cbd5e1', qx, street + top, qz, { noShadow: true });
        }
    }
  buildBlocks(
    group,
    occluders,
    blocks,
    (b) => ({
      cols: Math.max(3, Math.round(b.w / 3)),
      rows: Math.max(3, Math.min(16, Math.round(b.h / 3.2))),
      door: false,
    }),
    o.night,
    () => false,
  );
  // Street trees along the pavements near you.
  for (const l of lines.slice(2, 6))
    for (let t = -P * 2; t < P * 2; t += 9)
      kitTree(k, cx + t, street, cz + l + ROAD + 1, 1.3, Math.round(t + l));
  const built = k.build();
  built.traverse((m) => ((m as THREE.Mesh).castShadow = false));
  group.add(built);
  return { group, occluders, reach: REACH };
}

// ---------------------------------------------------------------------------

const v = new THREE.Vector3();

/**
 * Hide the buildings standing between the camera and your home (they'd
 * block it), show the rest. `fit` are the home's corners in world space;
 * `yOff` lifts the occluders from yard space into the world (upstairs).
 * Returns whether anything changed.
 */
export function cullOccluders(
  occ: readonly Occluder[],
  cam: THREE.Camera,
  fit: readonly THREE.Vector3[],
  yOff: number,
): boolean {
  if (!occ.length || !fit.length) return false;
  const inv = cam.matrixWorldInverse;
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let zc = 0;
  for (const p of fit) {
    v.copy(p).applyMatrix4(inv);
    x0 = Math.min(x0, v.x);
    x1 = Math.max(x1, v.x);
    y0 = Math.min(y0, v.y);
    zc += v.z / fit.length;
  }
  let changed = false;
  for (const o of occ) {
    v.set(o.x, o.top + yOff, o.z).applyMatrix4(inv);
    // In front of the home, reaching up over it on screen, and across it.
    const hide = v.z > zc + 2 && v.y + o.r * 0.8 > y0 - 1 && v.x + o.r > x0 && v.x - o.r < x1;
    if (hide !== o.hidden) {
      o.set(hide);
      changed = true;
    }
  }
  return changed;
}

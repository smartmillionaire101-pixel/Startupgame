/**
 * Phase 6b: the plane's cabin in 3D, at real size, for the walk to your seat.
 *
 * A narrow-body airliner: the cabin's cross-section swept along its length
 * (sidewalls following the fuselage's curve, the overhead bins with their
 * seams and latches, the service units under them, a ceiling with LED
 * coves: warm white by day, blue mood light at night), rounded windows on
 * both walls with the sky in them and daylight glowing round them (a few
 * shades half down), carpet with a darker aisle runner and floor-path
 * lights, 3+3 economy rows (headrest covers, the grey shell of each seat back
 * with its tray table and screen), a divider with its curtain drawn back and
 * 2+2 business up front, and the front bulkhead: the lavatory, the galley,
 * the exit sign. Passengers are the backs of heads over the headrests.
 *
 * Your own jet (the top of the lifestyle ladder) is a different room: a
 * narrower, lower cabin with no bins, cream leather club chairs facing over
 * walnut tables, a divan, big oval windows and gold light in the coves.
 *
 * Phones: the shell is one mesh, each kind of seat two instanced meshes (the
 * fabric and the hard parts), every repeated part instanced; four lights,
 * no shadows. Seats and people come from the route's seed.
 *
 * The camera (`pose`): in at the back at eye height, up the aisle to your
 * row, into your window seat; the trolley comes down the aisle with your
 * meal; then you turn to the window, and the flight goes outside.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { fnv, seeded } from '../travel';
import type { AvatarLook } from '../art';
import { makeCharacter, pose, type Character } from '../../interiors3d/character';
import type { CabinClass } from '../acts/Cabin';
import {
  bulkheadTexture,
  carpetTexture,
  glowTexture,
  paneTexture,
  screenTexture,
  trolleyTexture,
} from './textures';

const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const seg = (k: number, a: number, b: number) => clamp((k - a) / (b - a));
const ease = (x: number) => x * x * (3 - 2 * x);
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const DEG = Math.PI / 180;

type SeatKind = 'economy' | 'business' | 'club';

interface SeatAt {
  x: number;
  z: number;
  kind: SeatKind;
  /** Faces the back of the plane (club chairs across a table). */
  aft?: boolean;
  label: string;
  row: number;
}

interface Layout {
  jet: boolean;
  /** The fuselage's inside: radius and the height of its centre over the floor. */
  Ri: number;
  yc: number;
  front: number;
  rear: number;
  seats: SeatAt[];
  windowY: number;
  windowW: number;
  windowH: number;
  windowZ: number[];
  dividerZ: number | null;
  colors: {
    wall: string;
    dado: string;
    bin: string;
    psu: string;
    ceiling: string;
    carpet: string;
    runner: string;
    economy: string;
    business: string;
    club: string;
    trim: string;
  };
}

const LETTERS = 'ABCDEFGHJK';

/** Where every seat is, for a class: your section, and the rows round it. */
function layoutOf(cls: CabinClass): Layout {
  if (cls === 'private') {
    const seats: SeatAt[] = [];
    // Two club fours (chairs facing over a table), then a pair aft.
    for (const [z, aft, row] of [
      [-4.55, true, 1],
      [-3.15, false, 2],
      [-0.95, true, 3],
      [0.45, false, 4],
    ] as const)
      for (const side of [-1, 1])
        seats.push({
          x: side * 0.66,
          z,
          kind: 'club',
          aft,
          row,
          label: `${row}${side < 0 ? 'A' : 'B'}`,
        });
    return {
      jet: true,
      Ri: 1.3,
      yc: 0.55,
      front: -6.0,
      rear: 2.6,
      seats,
      windowY: 0.98,
      windowW: 0.3,
      windowH: 0.42,
      windowZ: [-5.2, -4.0, -3.0, -1.9, -0.8, 0.3, 1.3],
      dividerZ: null,
      colors: {
        wall: '#efe7d8',
        dado: '#6b4528',
        bin: '#f3ece0',
        psu: '#e8dfcf',
        ceiling: '#f8f4ec',
        carpet: '#cbbca2',
        runner: '#bfae90',
        economy: '#e9dcc3',
        business: '#e9dcc3',
        club: '#eadcc2',
        trim: '#c9a227',
      },
    };
  }
  const seats: SeatAt[] = [];
  // Business 2+2 up front, rows 1–3.
  for (let r = 0; r < 3; r++)
    for (const side of [-1, 1])
      for (let j = 0; j < 2; j++) {
        const x = side * (0.34 + 0.31 + j * 0.62);
        const col = side < 0 ? 1 - j : 2 + j;
        seats.push({
          x,
          z: -11.0 + r * 1.0,
          kind: 'business',
          row: r + 1,
          label: `${r + 1}${LETTERS[col]}`,
        });
      }
  // Economy 3+3, rows 10–24.
  for (let r = 0; r < 15; r++)
    for (const side of [-1, 1])
      for (let j = 0; j < 3; j++) {
        const x = side * (0.27 + 0.23 + j * 0.46);
        const col = side < 0 ? 2 - j : 3 + j;
        seats.push({
          x,
          z: -7.6 + r * 0.79,
          kind: 'economy',
          row: 10 + r,
          label: `${10 + r}${LETTERS[col]}`,
        });
      }
  const windowZ: number[] = [];
  for (let z = -11.25; z < 4.2; z += 0.79) if (Math.abs(z + 8.25) > 0.3) windowZ.push(z);
  const eco = cls === 'economy';
  return {
    jet: false,
    Ri: 1.86,
    yc: 0.62,
    front: -11.75,
    rear: 6.2,
    seats,
    windowY: 1.04,
    windowW: 0.24,
    windowH: 0.34,
    windowZ,
    dividerZ: -8.25,
    colors: {
      wall: '#ecebe6',
      dado: '#c9c7c0',
      bin: '#f4f3ef',
      psu: '#d7d8d6',
      ceiling: '#f7f7f4',
      carpet: eco ? '#3b4a63' : '#3f3a4a',
      runner: eco ? '#2b3850' : '#332d3d',
      economy: cls === 'premium' ? '#3a4556' : '#1f3d7a',
      business: cls === 'premium' ? '#334155' : '#2b2f3a',
      club: '#e7d8b8',
      trim: '#38bdf8',
    },
  };
}

/** The point on the fuselage wall at a height, on the right (x > 0). */
const wallX = (L: Layout, y: number) => Math.sqrt(Math.max(0, L.Ri ** 2 - (y - L.yc) ** 2));

/** The cross-section from the floor up, the right half, with a colour per stretch. */
function profileOf(L: Layout): { x: number; y: number; c: string }[] {
  const c = L.colors;
  const p: { x: number; y: number; c: string }[] = [];
  const wall = (y0: number, y1: number, col: string, steps: number, inset = 0) => {
    for (let i = 0; i <= steps; i++) {
      const y = lerp(y0, y1, i / steps);
      p.push({ x: wallX(L, y) - inset, y, c: col });
    }
  };
  if (L.jet) {
    wall(0, 0.5, c.dado, 2, 0.02);
    wall(0.5, 1.38, c.wall, 6);
    const ex = wallX(L, 1.38);
    p.push({ x: ex - 0.14, y: 1.4, c: c.bin });
    p.push({ x: ex - 0.14, y: 1.46, c: c.trim });
    for (let i = 0; i <= 6; i++) {
      const a = lerp(Math.asin((1.46 - L.yc) / (L.Ri - 0.12)), Math.PI / 2, i / 6);
      p.push({
        x: Math.cos(a) * (L.Ri - 0.12),
        y: L.yc + Math.sin(a) * (L.Ri - 0.12),
        c: c.ceiling,
      });
    }
    return p;
  }
  wall(0, 0.5, c.dado, 2, 0.03);
  wall(0.5, 1.5, c.wall, 8);
  // Under the bins: the service units over the seats.
  p.push({ x: wallX(L, 1.5) - 0.04, y: 1.53, c: c.psu });
  p.push({ x: 1.03, y: 1.57, c: c.psu });
  // The bin doors, bowed out a little.
  p.push({ x: 1.03, y: 1.57, c: c.bin });
  p.push({ x: 1.0, y: 1.8, c: c.bin });
  p.push({ x: 0.9, y: 2.02, c: c.bin });
  // The ceiling: the coves, then the crown.
  p.push({ x: 0.9, y: 2.02, c: c.ceiling });
  p.push({ x: 0.62, y: 2.15, c: c.ceiling });
  p.push({ x: 0.32, y: 2.23, c: c.ceiling });
  p.push({ x: 0, y: 2.25, c: c.ceiling });
  return p;
}

/** The shell: the profile, mirrored, swept from the front of the cabin to the back. */
function shellGeometry(L: Layout): THREE.BufferGeometry {
  const half = profileOf(L);
  const full = [...half.map((q) => ({ ...q, x: -q.x })), ...half.slice().reverse()];
  const pos: number[] = [];
  const col: number[] = [];
  const cc = new THREE.Color();
  for (let i = 0; i + 1 < full.length; i++) {
    const a = full[i]!;
    const b = full[i + 1]!;
    if (a.x === b.x && a.y === b.y) continue;
    cc.set(b.c);
    const quad = [
      [a.x, a.y, L.front],
      [b.x, b.y, L.front],
      [b.x, b.y, L.rear],
      [a.x, a.y, L.front],
      [b.x, b.y, L.rear],
      [a.x, a.y, L.rear],
    ];
    for (const v of quad) {
      pos.push(v[0]!, v[1]!, v[2]!);
      col.push(cc.r, cc.g, cc.b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

/** The cabin's cross-section as a flat shape (the bulkheads), uv across it. */
function bulkheadGeometry(L: Layout): THREE.BufferGeometry {
  const half = profileOf(L);
  const ring = [
    ...half.map((q) => new THREE.Vector2(-q.x, q.y)).reverse(),
    ...half.map((q) => new THREE.Vector2(q.x, q.y)),
  ].filter((v, i, a) => i === 0 || v.distanceTo(a[i - 1]!) > 1e-4);
  const shape = new THREE.Shape(ring);
  const g = new THREE.ShapeGeometry(shape);
  const p = g.getAttribute('position');
  const uv = g.getAttribute('uv');
  const w = wallX(L, L.yc) * 2;
  const top = L.jet ? L.yc + L.Ri - 0.12 : 2.25;
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / w + 0.5, p.getY(i) / top);
  return g;
}

/** A piece of a seat, its colour (hard parts) or none (fabric, coloured by the material). */
function piece(g: THREE.BufferGeometry, m: THREE.Matrix4, color?: string) {
  const x = g.index ? g.toNonIndexed() : g;
  x.applyMatrix4(m);
  if (x.getAttribute('uv')) x.deleteAttribute('uv');
  if (color) {
    const c = new THREE.Color(color);
    const n = x.getAttribute('position').count;
    const a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
    x.setAttribute('color', new THREE.BufferAttribute(a, 3));
  }
  if (x !== g) g.dispose();
  return x;
}

const M = (x: number, y: number, z: number, rx = 0) =>
  new THREE.Matrix4().makeRotationX(rx).setPosition(x, y, z);
const RB = (w: number, h: number, d: number, r = 0.03) => new RoundedBoxGeometry(w, h, d, 2, r);

/**
 * One seat, facing −z, centred on its cushion: the fabric (cushion, back,
 * headrest), the hard parts (headrest cover, the back's shell, tray table,
 * pocket, armrests, legs) and the screen in the back.
 */
function seatGeometry(kind: SeatKind, cover: string) {
  const fabric: THREE.BufferGeometry[] = [];
  const hard: THREE.BufferGeometry[] = [];
  const shell = '#c9ccd1';
  const metal = '#55595f';
  const S =
    kind === 'economy'
      ? { w: 0.46, pan: 0.44, back: 0.5, head: 0.15, arm: 0.05, armH: 0.62, tilt: 11 }
      : kind === 'business'
        ? { w: 0.62, pan: 0.46, back: 0.6, head: 0.2, arm: 0.1, armH: 0.64, tilt: 13 }
        : { w: 0.66, pan: 0.42, back: 0.52, head: 0.18, arm: 0.14, armH: 0.66, tilt: 9 };
  const w = S.w - S.arm - 0.02;
  fabric.push(piece(RB(w, 0.12, 0.48, 0.04), M(0, S.pan, 0)));
  // The back pivots on its foot, tilted back.
  const tilt = S.tilt * DEG;
  const foot = new THREE.Matrix4().makeTranslation(0, S.pan + 0.04, 0.24);
  const rot = new THREE.Matrix4().makeRotationX(tilt);
  const at = (x: number, y: number, z: number) =>
    foot
      .clone()
      .multiply(rot)
      .multiply(new THREE.Matrix4().makeTranslation(x, y, z));
  fabric.push(piece(RB(w, S.back, 0.11, 0.04), at(0, S.back / 2, 0)));
  fabric.push(piece(RB(w * 0.72, S.head, 0.12, 0.05), at(0, S.back + S.head / 2 - 0.02, 0.005)));
  hard.push(
    piece(
      new THREE.BoxGeometry(w * 0.74, S.head * 0.78, 0.01),
      at(0, S.back + S.head / 2, 0.07),
      cover,
    ),
  );
  if (kind !== 'club') {
    hard.push(
      piece(RB(w + 0.01, S.back - 0.04, 0.03, 0.012), at(0, S.back / 2 - 0.01, 0.07), shell),
    );
    hard.push(
      piece(new THREE.BoxGeometry(w * 0.8, 0.27, 0.012), at(0, S.back * 0.38, 0.088), '#a3a8b0'),
    );
    hard.push(piece(new THREE.BoxGeometry(w * 0.76, 0.12, 0.02), at(0, 0.08, 0.088), '#8e939b'));
  }
  // Armrests (wide and padded in the front cabins), legs or a pedestal.
  for (const sx of [-1, 1]) {
    const x = sx * (S.w / 2 - S.arm / 2);
    if (kind === 'club') {
      fabric.push(piece(RB(S.arm, S.armH - 0.2, 0.62, 0.05), M(x, 0.2 + (S.armH - 0.2) / 2, 0.02)));
    } else {
      hard.push(
        piece(
          RB(S.arm, 0.05, 0.44, 0.015),
          M(x, S.armH, 0.02),
          kind === 'business' ? '#3b3f48' : '#3a3f47',
        ),
      );
      hard.push(
        piece(
          new THREE.BoxGeometry(0.03, S.armH - S.pan, 0.06),
          M(x, (S.armH + S.pan) / 2, 0.2),
          '#3a3f47',
        ),
      );
      hard.push(
        piece(
          new THREE.BoxGeometry(0.035, S.pan - 0.06, 0.04),
          M(sx * (w / 2 - 0.05), (S.pan - 0.06) / 2, -0.12),
          metal,
        ),
      );
    }
  }
  if (kind === 'club')
    hard.push(piece(new THREE.CylinderGeometry(0.16, 0.22, 0.38, 14), M(0, 0.19, 0), '#8a7a5c'));
  else hard.push(piece(new THREE.BoxGeometry(w * 0.9, 0.035, 0.035), M(0, 0.1, -0.12), metal));
  const screen =
    kind === 'club'
      ? null
      : (() => {
          const g = new THREE.PlaneGeometry(
            kind === 'business' ? 0.3 : 0.2,
            kind === 'business' ? 0.18 : 0.125,
          );
          g.applyMatrix4(at(0, S.back * 0.74, 0.089));
          return g;
        })();
  return {
    fabric: mergeGeometries(fabric, false)!,
    hard: mergeGeometries(hard, false)!,
    screen,
    eye: S.pan + 0.74,
    head: S.pan + 0.7,
  };
}

export interface CabinOpts {
  cls: CabinClass;
  seed: string;
  /** Holiday with friends: your seat on the host's flight ("14A"), when you share it. */
  seat?: string;
  /** …and the friends beside you: seated next to you, window side first. */
  companions?: { look: AvatarLook; seat: string }[];
  /** The sky outside (the cruise's), for the window panes and the light. */
  zenith: string;
  horizon: string;
  night: boolean;
}

/** The person pushing the trolley: a simple figure in the airline's uniform. */
function crewFigure(skin: string, hair: string, uniform: string, scarf: string) {
  const g = new THREE.Group();
  const mat = (c: string) => new THREE.MeshLambertMaterial({ color: c });
  const add = (geo: THREE.BufferGeometry, c: string, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(geo, mat(c));
    m.position.set(x, y, z);
    g.add(m);
    return m;
  };
  add(new THREE.CylinderGeometry(0.16, 0.24, 0.62, 12), uniform, 0, 0.5, 0);
  for (const sx of [-0.08, 0.08])
    add(new THREE.CylinderGeometry(0.045, 0.04, 0.3, 8), '#e9c9a8', sx, 0.06, 0).scale.set(1, 1, 1);
  add(new THREE.CylinderGeometry(0.17, 0.16, 0.5, 12), uniform, 0, 1.08, 0);
  add(new THREE.CylinderGeometry(0.1, 0.16, 0.06, 12), scarf, 0, 1.36, 0.02);
  add(new THREE.SphereGeometry(0.11, 14, 10), skin, 0, 1.52, 0);
  add(
    new THREE.SphereGeometry(0.115, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55),
    hair,
    0,
    1.53,
    -0.01,
  );
  add(new THREE.SphereGeometry(0.06, 10, 8), hair, 0, 1.6, -0.1);
  // Arms forward, to the trolley.
  for (const sx of [-0.19, 0.19]) {
    const a = add(new THREE.CylinderGeometry(0.045, 0.04, 0.5, 8), uniform, sx, 1.1, 0.16);
    a.rotation.x = 1.1;
  }
  return g;
}

export class CabinWorld {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(80, 1, 0.05, 60);
  readonly layout: Layout;
  readonly you: SeatAt;
  /** Where the trolley is now: 'galley', 'coming', 'here' or 'gone'. */
  trolleyAt = 'galley';
  meal = 0;
  belt = true;
  private trolley = new THREE.Group();
  private crew: THREE.Group;
  private mealGroup = new THREE.Group();
  private laptop = new THREE.Group();
  private youWindow: THREE.Vector3;
  private eye: number;
  private beltMat: THREE.MeshBasicMaterial;
  private cove: THREE.MeshBasicMaterial;
  private amb: THREE.AmbientLight;
  private hemi: THREE.HemisphereLight;
  private sunL: THREE.DirectionalLight;
  private night: boolean;
  private sleeping = false;
  private youTag = new THREE.Vector3();
  /** Holiday companions in the seats next to yours, and where their tags go. */
  readonly companions: { c: Character; tag: THREE.Vector3; seat: string; at: SeatAt }[] = [];
  private seatH = 0.5;

  constructor(o: CabinOpts) {
    const L = (this.layout = layoutOf(o.cls));
    this.night = o.night;
    const s = this.scene;
    const c = L.colors;
    s.background = new THREE.Color(c.wall);
    const rnd = seeded(fnv(`${o.seed}:cabin`));

    // Light: soft from everywhere, daylight from the windows' side.
    this.amb = new THREE.AmbientLight('#ffffff', 1.25);
    this.hemi = new THREE.HemisphereLight('#fffaf0', '#b9b2a6', 1.0);
    this.sunL = new THREE.DirectionalLight(o.night ? '#7b8cc4' : '#fff6e6', o.night ? 0.25 : 1.0);
    this.sunL.position.set(-3, 2.5, 1);
    s.add(this.amb, this.hemi, this.sunL);

    // The shell, the floor and its runner, the bulkheads.
    const shell = new THREE.Mesh(
      shellGeometry(L),
      new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }),
    );
    s.add(shell);
    const floorW = wallX(L, 0) * 2;
    const len = L.rear - L.front;
    const carpet = carpetTexture(c.carpet, L.jet ? '#b39c74' : '#55688a');
    carpet.repeat.set(floorW / 1.2, len / 1.2);
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(floorW, len).rotateX(-Math.PI / 2),
      new THREE.MeshLambertMaterial({ map: carpet }),
    );
    floor.position.set(0, 0, (L.front + L.rear) / 2);
    s.add(floor);
    const runnerT = carpetTexture(c.runner, L.jet ? '#a58c62' : '#4a5c80');
    runnerT.repeat.set(0.6 / 1.2, len / 1.2);
    const runner = new THREE.Mesh(
      new THREE.PlaneGeometry(L.jet ? 0.7 : 0.52, len).rotateX(-Math.PI / 2),
      new THREE.MeshLambertMaterial({ map: runnerT }),
    );
    runner.position.set(0, 0.003, (L.front + L.rear) / 2);
    s.add(runner);
    const bh = bulkheadGeometry(L);
    const front = new THREE.Mesh(
      bh,
      new THREE.MeshLambertMaterial({ map: bulkheadTexture(c.bin, c.trim, L.jet) }),
    );
    front.position.z = L.front;
    const back = new THREE.Mesh(
      bh.clone(),
      new THREE.MeshLambertMaterial({ color: c.wall, side: THREE.DoubleSide }),
    );
    back.position.z = L.rear;
    s.add(front, back);

    // The ceiling's light: LED coves, warm by day, blue at night.
    this.cove = new THREE.MeshBasicMaterial({
      color: o.night ? '#7c6cf0' : '#fff3d6',
      toneMapped: false,
    });
    const coveG: THREE.BufferGeometry[] = [];
    for (const sx of [-1, 1]) {
      const g = new THREE.BoxGeometry(0.05, 0.012, len - 0.4);
      g.translate(sx * (L.jet ? 0.84 : 0.64), L.jet ? 1.47 : 2.14, (L.front + L.rear) / 2);
      coveG.push(g);
    }
    if (!L.jet)
      for (let z = L.front + 0.8; z < L.rear - 0.5; z += 1.58) {
        const g = new THREE.BoxGeometry(0.34, 0.006, 0.9);
        g.translate(0, 2.245, z);
        coveG.push(g);
      }
    s.add(new THREE.Mesh(mergeGeometries(coveG, false)!, this.cove));

    // Windows: the bezel, the sky in the pane, a few shades half down, a glow round each.
    const bez = new THREE.Shape();
    const rr = (sh: THREE.Shape | THREE.Path, w: number, h: number, r: number) => {
      sh.moveTo(-w / 2 + r, -h / 2);
      sh.lineTo(w / 2 - r, -h / 2);
      sh.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
      sh.lineTo(w / 2, h / 2 - r);
      sh.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
      sh.lineTo(-w / 2 + r, h / 2);
      sh.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
      sh.lineTo(-w / 2, -h / 2 + r);
      sh.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
    };
    const W = L.windowW;
    const H = L.windowH;
    rr(bez, W + 0.12, H + 0.15, (W + 0.12) * 0.45);
    const hole = new THREE.Path();
    rr(hole, W, H, W * 0.45);
    bez.holes.push(hole);
    const paneShape = new THREE.Shape();
    rr(paneShape, W, H, W * 0.45);
    const paneG = new THREE.ShapeGeometry(paneShape, 6);
    {
      const p = paneG.getAttribute('position');
      const uv = paneG.getAttribute('uv');
      for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / W + 0.5, p.getY(i) / H + 0.5);
    }
    const shadeG = new THREE.PlaneGeometry(W, H).translate(0, -H / 2, 0);
    const glowG = new THREE.PlaneGeometry(W * 4, H * 2.6);
    const n = L.windowZ.length * 2;
    const mk = (g: THREE.BufferGeometry, m: THREE.Material) => {
      const im = new THREE.InstancedMesh(g, m, n);
      im.frustumCulled = false;
      s.add(im);
      return im;
    };
    const bezel = mk(
      new THREE.ShapeGeometry(bez, 6),
      new THREE.MeshLambertMaterial({ color: L.jet ? '#f6efe2' : '#dcdcd7' }),
    );
    const pane = mk(
      paneG,
      new THREE.MeshBasicMaterial({
        map: paneTexture(o.zenith, o.horizon, o.night),
        toneMapped: false,
      }),
    );
    const shade = mk(
      shadeG,
      new THREE.MeshLambertMaterial({ color: L.jet ? '#e9dfcc' : '#e6e3da' }),
    );
    const glow = mk(
      glowG,
      new THREE.MeshBasicMaterial({
        map: glowTexture(),
        color: o.night ? '#3b4a7a' : '#dbeafe',
        transparent: true,
        opacity: o.night ? 0.25 : 0.55,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    const y = L.windowY;
    const wx = wallX(L, y);
    const tiltA = Math.atan2(y - L.yc, wx);
    let i = 0;
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    for (const z of L.windowZ)
      for (const side of [-1, 1]) {
        // Face into the cabin, leaning with the wall.
        q.setFromEuler(new THREE.Euler(0, (-side * Math.PI) / 2, 0, 'YXZ'));
        const lean = new THREE.Quaternion().setFromAxisAngle(
          new THREE.Vector3(0, 0, 1),
          side * tiltA,
        );
        const qq = lean.multiply(q);
        const at = (d: number) => new THREE.Vector3(side * (wx - d), y, z);
        m4.compose(at(0.008), qq, new THREE.Vector3(1, 1, 1));
        bezel.setMatrixAt(i, m4);
        m4.compose(at(0.004), qq, new THREE.Vector3(1, 1, 1));
        pane.setMatrixAt(i, m4);
        const down = rnd() < 0.3 ? 0.3 + rnd() * 0.5 : 0.001;
        m4.compose(
          at(0.006).add(new THREE.Vector3(0, H / 2, 0)),
          qq,
          new THREE.Vector3(1, down, 1),
        );
        shade.setMatrixAt(i, m4);
        m4.compose(at(0.02), qq, new THREE.Vector3(1, 1, 1));
        glow.setMatrixAt(i, m4);
        i++;
      }

    // Bins: a seam every two rows, a latch on each door; the service units over the seats.
    if (!L.jet) {
      const segG = mergeGeometries([
        new THREE.BoxGeometry(0.012, 0.44, 0.008).translate(0, 1.79, 0),
        new THREE.BoxGeometry(0.02, 0.03, 0.14).translate(0.004, 1.62, 0.79),
      ])!;
      const segs = Math.floor((L.rear - L.front) / 1.58);
      const bins = new THREE.InstancedMesh(
        segG,
        new THREE.MeshLambertMaterial({ color: '#9ea3a8' }),
        segs * 2,
      );
      const psuG = mergeGeometries([
        new THREE.BoxGeometry(0.03, 0.01, 0.3).translate(-0.12, 1.545, 0),
        new THREE.BoxGeometry(0.03, 0.01, 0.3).translate(0.12, 1.545, 0),
      ])!;
      this.beltMat = new THREE.MeshBasicMaterial({ color: '#fbbf24', toneMapped: false });
      const rows = L.seats.filter((x) => x.x < 0 && x.label.endsWith('C') === false).length;
      const psu = new THREE.InstancedMesh(psuG, this.beltMat, rows * 2 + 8);
      let bi = 0;
      let pi = 0;
      for (let k = 0; k < segs; k++) {
        const z = L.front + 0.4 + k * 1.58;
        for (const side of [-1, 1]) {
          m4.makeRotationY(side < 0 ? Math.PI : 0);
          m4.setPosition(side * 1.01, 0, z);
          bins.setMatrixAt(bi++, m4);
        }
      }
      const rowsZ = [...new Set(L.seats.map((x) => x.z))];
      for (const z of rowsZ)
        for (const side of [-1, 1]) {
          if (pi >= psu.count) break;
          m4.makeTranslation(side * 1.32, 0, z - 0.05);
          psu.setMatrixAt(pi++, m4);
        }
      psu.count = pi;
      bins.frustumCulled = psu.frustumCulled = false;
      s.add(bins, psu);
      // Floor-path lights by the seats.
      const dots: THREE.BufferGeometry[] = [];
      for (let z = L.front + 0.5; z < L.rear - 0.3; z += 0.79)
        for (const sx of [-1, 1])
          dots.push(new THREE.BoxGeometry(0.02, 0.01, 0.08).translate(sx * 0.27, 0.005, z));
      s.add(
        new THREE.Mesh(
          mergeGeometries(dots, false)!,
          new THREE.MeshBasicMaterial({
            color: o.night ? '#fda4af' : '#fde68a',
            toneMapped: false,
          }),
        ),
      );
    } else {
      this.beltMat = new THREE.MeshBasicMaterial({ color: '#fbbf24' });
    }

    // The divider and its curtain, drawn back to the walls.
    if (L.dividerZ !== null) {
      const z = L.dividerZ;
      const panel = new THREE.MeshLambertMaterial({ color: c.bin, side: THREE.DoubleSide });
      const cloth = new THREE.MeshLambertMaterial({
        color: o.cls === 'economy' ? '#1e3a8a' : '#4c1d95',
        side: THREE.DoubleSide,
      });
      for (const sx of [-1, 1]) {
        const w = wallX(L, 0.8) - 0.52;
        const p = new THREE.Mesh(new THREE.BoxGeometry(w, 1.55, 0.05), panel);
        p.position.set(sx * (0.52 + w / 2), 0.775, z);
        s.add(p);
        // The bunched curtain: a strip with folds.
        const g = new THREE.PlaneGeometry(0.26, 2.0, 12, 1);
        const pp = g.getAttribute('position');
        for (let k = 0; k < pp.count; k++) pp.setZ(k, Math.sin(pp.getX(k) * 70) * 0.03);
        g.computeVertexNormals();
        const cm = new THREE.Mesh(g, cloth);
        cm.position.set(sx * 0.43, 1.02, z + 0.04);
        s.add(cm);
      }
      const rail = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.03, 0.03), panel);
      rail.position.set(0, 2.03, z);
      s.add(rail);
    }

    // The seats and who sits in them.
    const party = o.companions ?? [];
    const yourIdx = this.pickYours(o.cls, o.seed, o.seat, party.length);
    this.you = L.seats[yourIdx]!;
    // Friends on holiday: your row, window side first (you step in last), then across the aisle.
    const row = L.seats.filter((x) => x.z === this.you.z && x !== this.you);
    const mySide = row
      .filter((x) => Math.sign(x.x) === Math.sign(this.you.x))
      .sort((a, b) => Math.abs(b.x) - Math.abs(a.x));
    const across = row
      .filter((x) => Math.sign(x.x) !== Math.sign(this.you.x))
      .sort((a, b) => Math.abs(a.x) - Math.abs(b.x));
    const partySeats = [...mySide, ...across].slice(0, party.length);
    const kinds: SeatKind[] = ['economy', 'business', 'club'];
    const cover = L.jet ? '#f6f0e4' : '#e9eef5';
    const scr = screenTexture();
    let eye = 1.16;
    let headY = 1.2;
    for (const kind of kinds) {
      const list = L.seats.filter((x) => x.kind === kind);
      if (!list.length) continue;
      const g = seatGeometry(kind, cover);
      if (L.seats[yourIdx]!.kind === kind) {
        eye = g.eye;
        headY = g.head;
      }
      const fab = new THREE.InstancedMesh(
        g.fabric,
        new THREE.MeshLambertMaterial({
          color: kind === 'economy' ? c.economy : kind === 'business' ? c.business : c.club,
        }),
        list.length,
      );
      const hard = new THREE.InstancedMesh(
        g.hard,
        new THREE.MeshLambertMaterial({ vertexColors: true }),
        list.length,
      );
      const screens = g.screen
        ? new THREE.InstancedMesh(
            g.screen,
            new THREE.MeshBasicMaterial({ map: scr, toneMapped: false }),
            list.length,
          )
        : null;
      list.forEach((st, k) => {
        m4.makeRotationY(st.aft ? Math.PI : 0);
        m4.setPosition(st.x, 0, st.z);
        fab.setMatrixAt(k, m4);
        hard.setMatrixAt(k, m4);
        screens?.setMatrixAt(k, m4);
      });
      for (const im of [fab, hard, screens])
        if (im) {
          im.frustumCulled = false;
          s.add(im);
        }
    }
    this.eye = eye;
    // Heads over the headrests (busts in your jet, across the table).
    // Nobody between you and the aisle: you step in past empty seats.
    const yours = L.seats[yourIdx]!;
    const between = (st: SeatAt) =>
      st.z === yours.z &&
      Math.sign(st.x) === Math.sign(yours.x) &&
      Math.abs(st.x) < Math.abs(yours.x);
    const people = L.seats.filter(
      (st, k) =>
        k !== yourIdx &&
        !between(st) &&
        !partySeats.includes(st) &&
        (L.jet ? rnd() < 0.3 : rnd() < 0.82),
    );
    const hairs = [
      '#1c1917',
      '#292524',
      '#3f2a1d',
      '#0c0a09',
      '#57534e',
      '#a16207',
      '#d6d3d1',
      '#7c2d12',
    ];
    const skins = ['#8d5524', '#c68642', '#e0ac69', '#f1c27d', '#5c3a1e', '#3d2314'];
    const headG = new THREE.SphereGeometry(0.105, 14, 10);
    const heads = new THREE.InstancedMesh(
      headG,
      new THREE.MeshLambertMaterial(),
      people.length * 2,
    );
    const busts = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.14, 0.2, 0.5, 10),
      new THREE.MeshLambertMaterial(),
      people.length,
    );
    const col = new THREE.Color();
    let hi = 0;
    people.forEach((p, k) => {
      const dir = p.aft ? -1 : 1;
      const jx = (rnd() - 0.5) * 0.05;
      const big = rnd() < 0.2 ? 1.22 : 1;
      const skin = skins[Math.floor(rnd() * skins.length)]!;
      const hair = rnd() < 0.1 ? skin : hairs[Math.floor(rnd() * hairs.length)]!;
      // The face (skin), the hair over the back and top of it.
      m4.compose(
        new THREE.Vector3(p.x + jx, headY + 0.02, p.z + dir * 0.13),
        new THREE.Quaternion(),
        new THREE.Vector3(0.92, 1.05, 0.95),
      );
      heads.setMatrixAt(hi, m4);
      heads.setColorAt(hi++, col.set(skin));
      m4.compose(
        new THREE.Vector3(p.x + jx, headY + 0.045 + (big - 1) * 0.05, p.z + dir * 0.155),
        new THREE.Quaternion(),
        new THREE.Vector3(big, big, big),
      );
      heads.setMatrixAt(hi, m4);
      heads.setColorAt(hi++, col.set(hair));
      m4.compose(
        new THREE.Vector3(p.x + jx, headY - 0.33, p.z + dir * 0.12),
        new THREE.Quaternion(),
        new THREE.Vector3(1, 1, 0.7),
      );
      busts.setMatrixAt(k, m4);
      busts.setColorAt(
        k,
        col.set(
          ['#0f766e', '#be123c', '#1d4ed8', '#f59e0b', '#f8fafc', '#334155'][
            Math.floor(rnd() * 6)
          ]!,
        ),
      );
    });
    heads.count = hi;
    heads.frustumCulled = busts.frustumCulled = false;
    s.add(heads, busts);

    // Your jet: walnut tables between the club chairs, a divan, a credenza.
    if (L.jet) {
      const wood = new THREE.MeshLambertMaterial({ color: '#7a4a26' });
      const leather = new THREE.MeshLambertMaterial({ color: c.club });
      for (const z of [-3.85, -0.25])
        for (const sx of [-1, 1]) {
          const t = new THREE.Mesh(RB(0.62, 0.04, 0.7, 0.015), wood);
          t.position.set(sx * 0.62, 0.7, z);
          const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.12, 0.68, 10), wood);
          leg.position.set(sx * 0.62, 0.34, z);
          s.add(t, leg);
        }
      const divan = new THREE.Mesh(RB(0.55, 0.42, 1.6, 0.06), leather);
      divan.position.set(0.82, 0.21, 1.9);
      const divanBack = new THREE.Mesh(RB(0.16, 0.5, 1.6, 0.05), leather);
      divanBack.position.set(1.04, 0.6, 1.9);
      const cred = new THREE.Mesh(RB(0.45, 0.62, 1.2, 0.02), wood);
      cred.position.set(-0.9, 0.31, 1.9);
      const flowers = new THREE.Mesh(
        new THREE.SphereGeometry(0.12, 10, 8),
        new THREE.MeshLambertMaterial({ color: '#f472b6' }),
      );
      flowers.position.set(-0.9, 0.78, 1.9);
      s.add(divan, divanBack, cred, flowers);
    }

    // The trolley (or, in your jet, a tray carried to you) and the crew member.
    if (!L.jet) {
      const side = new THREE.MeshLambertMaterial({ map: trolleyTexture() });
      const top = new THREE.MeshLambertMaterial({ color: '#aeb4bc' });
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.0, 0.8), [
        side,
        side,
        top,
        top,
        top,
        top,
      ]);
      body.position.y = 0.53;
      this.trolley.add(body);
      const items: THREE.BufferGeometry[] = [];
      const ic = ['#16a34a', '#f97316', '#f8fafc', '#dc2626', '#0ea5e9', '#facc15'];
      for (let k = 0; k < 6; k++)
        items.push(
          piece(
            new THREE.CylinderGeometry(0.03, 0.03, k % 2 ? 0.2 : 0.12, 10),
            M(-0.07 + (k % 2) * 0.14, 1.03 + (k % 2 ? 0.1 : 0.06), -0.26 + Math.floor(k / 2) * 0.2),
            ic[k]!,
          ),
        );
      this.trolley.add(
        new THREE.Mesh(
          mergeGeometries(items, false)!,
          new THREE.MeshLambertMaterial({ vertexColors: true }),
        ),
      );
      for (const sx of [-0.11, 0.11])
        for (const sz of [-0.32, 0.32]) {
          const w = new THREE.Mesh(
            new THREE.CylinderGeometry(0.03, 0.03, 0.02, 10).rotateZ(Math.PI / 2),
            new THREE.MeshLambertMaterial({ color: '#1f2937' }),
          );
          w.position.set(sx, 0.03, sz);
          this.trolley.add(w);
        }
    } else {
      const tray = new THREE.Mesh(
        RB(0.4, 0.03, 0.3, 0.01),
        new THREE.MeshLambertMaterial({ color: '#d4af37' }),
      );
      tray.position.set(0, 1.08, 0.38);
      this.trolley.add(tray);
    }
    s.add(this.trolley);
    this.crew = crewFigure(
      '#8d5524',
      '#1c1917',
      L.jet ? '#1e3a8a' : '#1e293b',
      L.jet ? '#c9a227' : '#dc2626',
    );
    s.add(this.crew);

    // Your meal (and your laptop) on the tray table in front of you.
    const tt = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 0.015, 0.27),
      new THREE.MeshLambertMaterial({ color: '#9ca3af' }),
    );
    this.mealGroup.add(tt);
    const tray = new THREE.Mesh(
      new THREE.BoxGeometry(0.34, 0.012, 0.22),
      new THREE.MeshLambertMaterial({ color: '#475569' }),
    );
    tray.position.y = 0.012;
    const plate = new THREE.Mesh(
      new THREE.CylinderGeometry(0.075, 0.07, 0.015, 18),
      new THREE.MeshLambertMaterial({ color: '#f8fafc' }),
    );
    plate.position.set(-0.06, 0.025, 0.01);
    const food = new THREE.Mesh(
      new THREE.SphereGeometry(0.05, 12, 8).scale(1, 0.4, 1),
      new THREE.MeshLambertMaterial({ color: '#ea580c' }),
    );
    food.position.set(-0.06, 0.04, 0.01);
    const cup = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.025, 0.08, 12),
      new THREE.MeshLambertMaterial({ color: '#f8fafc' }),
    );
    cup.position.set(0.1, 0.06, -0.05);
    const roll = new THREE.Mesh(
      new THREE.SphereGeometry(0.035, 10, 8).scale(1.3, 0.8, 1),
      new THREE.MeshLambertMaterial({ color: '#d6a35c' }),
    );
    roll.position.set(0.09, 0.035, 0.06);
    this.mealGroup.add(tray, plate, food, cup, roll);
    const lb = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 0.015, 0.21),
      new THREE.MeshLambertMaterial({ color: '#334155' }),
    );
    const ls = new THREE.Mesh(
      new THREE.PlaneGeometry(0.28, 0.18),
      new THREE.MeshBasicMaterial({ color: '#a5f3fc', toneMapped: false }),
    );
    ls.position.set(0, 0.1, -0.1);
    ls.rotation.x = -0.25;
    const lback = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 0.2, 0.008),
      new THREE.MeshLambertMaterial({ color: '#334155' }),
    );
    lback.position.set(0, 0.1, -0.106);
    lback.rotation.x = -0.25;
    this.laptop.add(lb, ls, lback);
    this.laptop.visible = false;
    s.add(this.mealGroup, this.laptop);
    const y0 = this.you;
    const dir = y0.aft ? 1 : -1;
    const tz = y0.z + dir * (L.jet ? 0.62 : 0.43);
    this.mealGroup.position.set(y0.x, L.jet ? 0.74 : 0.72, tz);
    this.laptop.position.set(y0.x + 0.04, L.jet ? 0.74 : 0.735, tz + (L.jet ? 0.1 : 0));
    this.mealGroup.visible = false;
    // Your window: the one nearest your row.
    const wz = L.windowZ.reduce((a, b) => (Math.abs(b - y0.z) < Math.abs(a - y0.z) ? b : a));
    this.youWindow = new THREE.Vector3(-wallX(L, L.windowY), L.windowY, wz);
    this.youTag.set(y0.x, headY + 0.35, y0.z);
    // Your companions, seated (whole figures: they turn to talk to you).
    this.seatH = headY - 0.66;
    partySeats.forEach((at, k) => {
      const c = makeCharacter(party[k]!.look, `party:${k}`);
      c.root.position.set(at.x, 0, at.z + (at.aft ? -0.04 : 0.04));
      // Facing forward, turned a little towards you (on your left: towards the aisle).
      const toYou = Math.sign(this.you.x - at.x) * 0.8;
      c.root.rotation.y = at.aft ? 0 : Math.PI - toYou;
      pose(c, 'sit', 0, { seat: this.seatH, phase: k });
      s.add(c.root);
      this.companions.push({
        c,
        at,
        seat: party[k]!.seat,
        tag: new THREE.Vector3(at.x, headY + 0.2, at.z - 0.1),
      });
    });
  }

  /** Where each companion's tag goes on screen (CSS px), or null when it's out of view. */
  companionTags(w: number, h: number): ({ x: number; y: number } | null)[] {
    return this.companions.map(({ tag }) => {
      const v = tag.clone().project(this.camera);
      if (v.z > 1 || Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1) return null;
      return { x: ((v.x + 1) / 2) * w, y: ((1 - v.y) / 2) * h };
    });
  }

  /**
   * Your seat: a window seat on the left, in the section your ticket is for
   * (on a holiday flight, your ticket's row; with friends beside you, you
   * sit nearer the aisle and they take the window).
   */
  private pickYours(cls: CabinClass, seed: string, seat?: string, friends = 0) {
    const L = this.layout;
    const h = fnv(`${seed}:yours`);
    if (cls === 'private') return L.seats.findIndex((s) => s.label === (friends ? '2B' : '2A'));
    const want = cls === 'economy' ? 'economy' : 'business';
    const left = L.seats
      .filter((s) => s.kind === want && s.x < 0)
      .sort((a, b) => a.row - b.row || a.x - b.x);
    const rowNos = [...new Set(left.map((s) => s.row))];
    const asked = seat ? Number(seat.replace(/\D+$/, '')) : NaN;
    const rowNo = rowNos.includes(asked)
      ? asked
      : want === 'economy'
        ? rowNos[4 + (h % 6)]!
        : rowNos[1 + (h % 2)]!;
    const inRow = left.filter((s) => s.row === rowNo);
    const pick = inRow[Math.min(friends, inRow.length - 1)]!;
    return L.seats.indexOf(pick);
  }

  get seatLabel() {
    return this.you.label;
  }

  setMood(m: 'awake' | 'sleep' | 'work') {
    this.sleeping = m === 'sleep';
    this.laptop.visible = m === 'work';
    this.cove.color.set(this.sleeping ? '#3730a3' : this.night ? '#7c6cf0' : '#fff3d6');
    this.amb.intensity = this.sleeping ? 0.4 : 1.25;
    this.hemi.intensity = this.sleeping ? 0.4 : 1.0;
  }

  /** Where your seat's tag goes on screen (CSS px), or null when it's behind you. */
  tagAt(w: number, h: number): { x: number; y: number } | null {
    const v = this.youTag.clone().project(this.camera);
    if (v.z > 1 || Math.abs(v.x) > 1.2 || Math.abs(v.y) > 1.2) return null;
    return { x: ((v.x + 1) / 2) * w, y: ((1 - v.y) / 2) * h };
  }

  /** The camera, the trolley and the meal at k (0–1) through the cabin and t seconds in. */
  pose(k: number, t: number, aspect: number) {
    const L = this.layout;
    const cam = this.camera;
    const y = this.you;
    const vf = (2 * Math.atan(Math.tan(28 * DEG) / aspect)) / DEG;
    cam.fov = clamp(vf, 60, 92);
    cam.aspect = aspect;
    const stand = L.jet ? 1.55 : 1.62;
    const z0 = Math.min(y.z + (L.jet ? 4 : 6.4), L.rear - 1.2);
    const aisle = 0;
    // 1. Up the aisle to your row (a gentle step in it).
    const walk = ease(seg(k, 0, 0.36));
    const step = Math.sin(walk * 22) * 0.018 * (1 - seg(k, 0.33, 0.36));
    const zA = lerp(z0, y.z + 0.05, walk);
    const pA = new THREE.Vector3(aisle, stand + step, zA);
    const lA = new THREE.Vector3(aisle + Math.sin(t * 0.7) * 0.15, stand - 0.45, zA - 5);
    // 2. Into your seat, looking up the aisle (for the trolley).
    const sit = ease(seg(k, 0.36, 0.5));
    const dir = y.aft ? 1 : -1;
    const pS = new THREE.Vector3(y.x + 0.05, this.eye + 0.06, y.z - dir * 0.05);
    // (With friends beside you, a little towards them: they're in the corner of your eye.)
    const lS = new THREE.Vector3(
      L.jet ? 0.4 : this.companions.length ? 0.1 : 0.8,
      this.eye - 0.12,
      y.z + dir * 4,
    );
    // 3. Turn to the window and lean to it.
    const turn = ease(seg(k, 0.8, 1));
    const w = this.youWindow;
    const pW = new THREE.Vector3(w.x + 0.42, w.y + 0.04, w.z + 0.06);
    const lW = new THREE.Vector3(w.x - 1, w.y - 0.02, w.z + 0.02);
    // Across at standing height first, then down into the seat.
    const across = ease(seg(k, 0.36, 0.45));
    const down = ease(seg(k, 0.42, 0.5));
    const p = new THREE.Vector3(
      lerp(pA.x, pS.x, across),
      lerp(pA.y, pS.y, down),
      lerp(pA.z, pS.z, across),
    ).lerp(pW, turn);
    // With friends in your row: as you reach it, a look down at them in their seats.
    const glance = this.companions.length ? ease(seg(k, 0.2, 0.33)) : 0;
    if (glance) lA.lerp(new THREE.Vector3(y.x - 0.2, this.eye - 0.25, y.z + 0.1), glance * 0.9);
    const l = lA.clone().lerp(lS, sit);
    // Seated, a turn to your friends beside you (the reduced-motion still, at 0.64, too).
    const f0 = this.companions[0]?.at;
    if (f0) {
      const chat = ease(seg(k, 0.55, 0.61)) * (1 - ease(seg(k, 0.7, 0.76)));
      l.lerp(new THREE.Vector3(f0.x - 1.2, this.eye - 0.2, f0.z - dir * 0.25), chat);
      // …leaning out towards the aisle and forward, so you see their faces.
      p.x += 0.5 * chat * Math.sign(y.x - f0.x || 1);
      p.y += 0.12 * chat;
      p.z += dir * 0.5 * chat;
    }
    l.lerp(lW, turn);
    cam.position.copy(p);
    cam.lookAt(l);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld(true);

    // The trolley waits in the galley, comes down to your row, serves, moves on.
    const stop = y.z + dir * 0.9;
    // From the galley in front, or (in the front rows) from behind you.
    let from = Math.max(L.front + 0.6, stop - 4);
    if (stop - from < 1.5) from = stop + 3;
    const go = Math.sign(stop - from) || 1;
    const come = ease(seg(k, 0.48, 0.62));
    const on = ease(seg(k, 0.72, 0.98));
    const tz = k < 0.72 ? lerp(from, stop, come) : lerp(stop, stop + go * 1.8, on);
    const lane = L.jet ? 0.12 : 0;
    this.trolley.position.set(lane, 0, tz);
    this.trolley.rotation.y = go > 0 ? 0 : Math.PI;
    // The crew walks behind it (in your jet, carrying the tray).
    this.crew.position.set(lane, 0, L.jet ? tz : tz - go * 0.62);
    this.crew.rotation.y = go > 0 ? 0 : Math.PI;
    // A small sway as it rolls.
    this.crew.position.y = Math.abs(Math.sin(t * 5)) * 0.015 * (come > 0 && come < 1 ? 1 : 0);
    this.trolleyAt = k < 0.48 ? 'galley' : come < 1 ? 'coming' : k < 0.72 ? 'here' : 'gone';
    this.meal = ease(seg(k, 0.6, 0.66));
    this.mealGroup.visible = this.meal > 0.01;
    this.mealGroup.scale.setScalar(0.6 + 0.4 * this.meal);
    // The seatbelt sign: on while boarding and again before the descent.
    this.belt = k < 0.3 || k > 0.92;
    this.beltMat.color.set(this.belt ? '#fbbf24' : '#3f3f46');
  }

  dispose() {
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
      for (const x of mats) {
        const map = (x as THREE.MeshBasicMaterial).map;
        map?.dispose();
        x.dispose();
      }
    });
  }
}

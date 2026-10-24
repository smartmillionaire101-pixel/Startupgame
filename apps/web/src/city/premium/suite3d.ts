/**
 * The business and first class cabins in 3D (player feedback: "Interior
 * should look more like a plane. Look outside the plane. When going to the
 * bar/shower we can walk through the wall. Cannot see outside the plane"),
 * seen from inside, through a perspective eye:
 *
 * - The cabin is a widebody's: the curved fuselage (its walls following
 *   the tube, a darker dado low down), rows of rounded windows on both
 *   sides, overhead bins with their seams and the reading-light rail, the
 *   ceiling with its light strips and downlights (warm by day, a dim mood
 *   light at night), the carpet with its aisle runners, the bulkheads.
 * - Business: lie-flat pods, 1-2-1, each with its shell, a privacy screen
 *   on the aisle, a console and lamp, the ottoman and a screen; some made
 *   up as beds; the galley's curtains and the cabin sign forward.
 * - First: a suite each side of the aisle, cream walls capped in walnut,
 *   a sliding door at the aft end of each, the armchair that turns into a
 *   bed (the crew make it up), the ottoman with the kit and pyjamas, a
 *   wide screen, the table laid for each course with champagne on ice, a
 *   lamp on the window console. Forward, the bulkhead: a framed doorway
 *   into the bar (the bartender, the back bar, stools) and the shower
 *   spa's own door beside it (its light green when it's free).
 * - The windows show outside (./outside): the sky of the hour, the clouds,
 *   and the ground when you're low, climbing after take-off and descending
 *   for the arrival (./cabinplan `outsideAt`).
 * - You walk where people walk (./cabinplan `walkPath`): out of your seat,
 *   through your suite's door, along the aisle, through the doorway; the
 *   crew walk the aisle from the galley to your door.
 * - Outside (the "Inside | Outside" chips): the plane in the sky, in the
 *   airline's colours, over the same clouds and ground; you orbit it.
 *
 * Phones: everything that doesn't move is merged by material (`Kit`), the
 * windows are two instanced meshes, the panes share one small canvas, and
 * there are no shadows; a handful of lights.
 *
 * `set` says what's happening (the flight's moment, your act, the course
 * on the table, the doors); `update` animates; `orbit` and `zoom` move the
 * eye round you (or round the plane, outside).
 */
import * as THREE from 'three';
import type { AvatarLook } from '../art';
import { makeCharacter, pose, type Character, type PoseId } from '../../interiors3d/character';
import { buildModel } from '../../interiors3d/furniture';
import { Particles, fx } from '../../interiors3d/fx';
import { Kit, disposeTree, mat, screenTexture, signTexture } from '../../interiors3d/kit';
import type { Stage } from '../../interiors3d/stage';
import { makePlane3D } from '../../three-kit/plane';
import {
  FLOOR_HALF,
  FUSELAGE,
  SUITE_DOOR,
  SUITE_H,
  SUITE_SEAT,
  SUITE_X,
  cabinPlan,
  outsideAt,
  placeFor,
  walkPath,
  wallX,
  type CabinPlan,
  type OutsidePhase,
  type PlaceId,
} from './cabinplan';
import { OutsideView, type SkyColours } from './outside';
import type { FlightStage, InflightActId } from './premium';

export interface SuiteState {
  stage: FlightStage;
  /** What you're doing now (null: sitting back). */
  act: InflightActId | null;
  /** Courses served so far (0: the table isn't laid). */
  course: number;
  /** The plate on the table: its colours. */
  plate: [string, string] | null;
  doors: 'open' | 'closed';
  /** Where the eye is: in the cabin, or outside looking at the plane. */
  view: 'inside' | 'outside';
}

export interface SuiteOpts {
  cabin: 'business' | 'first';
  me: AvatarLook;
  crew: AvatarLook;
  others: AvatarLook[];
  /** The sky outside at each moment of the flight (the hour over the route). */
  skies: Record<FlightStage, SkyColours>;
  /** The airline's colour (the plane, outside). */
  livery?: string;
}

/** What the page shows about the scene (its data attributes). */
export interface SuiteStatus {
  /** Where you are: in your seat, on your way, at the bar or in the spa. */
  at: 'seat' | 'walking' | 'bar' | 'spa';
  outside: OutsidePhase;
  windows: number;
}

const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const ease = (x: number) => x * x * (3 - 2 * x);
/** Ease a value towards a target at `rate` per second. */
const approach = (v: number, to: number, dt: number, rate = 1.6) =>
  v + clamp(to - v, -rate * dt, rate * dt);
/** Turn an angle towards another the short way round. */
const turn = (a: number, b: number, k: number) => {
  const d = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + d * clamp(k);
};

const { r: R, cy: CY } = FUSELAGE;
const CEIL = 2.42;
/** Walking pace (metres a second). */
const PACE = 1.15;

const C = {
  wall: '#ece7de',
  dado: '#d8d0c2',
  trim: '#d9d2c5',
  bin: '#f3efe8',
  seam: '#cfc7b8',
  ceiling: '#f6f3ee',
  // First.
  leather: '#e8dcc6',
  walnut: '#5b3a24',
  panel: '#efe9df',
  gold: '#c8a25a',
  door: '#e6dccb',
  // Business.
  shell: '#e9e3d8',
  wood: '#7a5135',
  seat: '#2f4f4b',
  screen: '#cfc6b6',
};

/** A rounded rectangle centred on the origin (a window, its reveal). */
function roundRect(w: number, h: number, r: number): THREE.Shape {
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

/**
 * A wall across the cabin from xa to xb, between heights y0 and y1, its
 * outer edges following the fuselage's curve (a bulkhead fills the tube).
 */
function bulkheadPiece(xa: number, xb: number, y0: number, y1: number, depth = 0.08) {
  const s = new THREE.Shape();
  const n = 10;
  const left: [number, number][] = [];
  const right: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const y = y0 + ((y1 - y0) * i) / n;
    const w = wallX(y) - 0.005;
    left.push([Math.max(xa, -w), y]);
    right.push([Math.min(xb, w), y]);
  }
  s.moveTo(left[0]![0], left[0]![1]);
  for (const [x, y] of right) s.lineTo(x, y);
  for (const [x, y] of left.reverse()) s.lineTo(x, y);
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false });
  g.translate(0, 0, -depth / 2);
  return g;
}

/** Your seat: a base, a cushion, a back that reclines flat, a leg rest that rises. */
function makeSeat(leather: string, base: string, w: number) {
  const group = new THREE.Group();
  const cushion = mat(leather, { rough: 0.6 });
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number) => {
    const o = new THREE.Mesh(geo, m);
    o.position.set(x, y, z);
    return o;
  };
  group.add(add(new THREE.BoxGeometry(w + 0.06, 0.36, 0.7), mat(base, { rough: 0.5 }), 0, 0.18, 0));
  group.add(add(new THREE.BoxGeometry(w, 0.12, 0.66), cushion, 0, 0.42, 0));
  for (const sx of [-1, 1])
    group.add(add(new THREE.BoxGeometry(0.1, 0.22, 0.66), cushion, sx * (w / 2 + 0.03), 0.52, 0));
  const back = new THREE.Group();
  back.position.set(0, 0.46, 0.33);
  back.add(add(new THREE.BoxGeometry(w, 0.8, 0.14), cushion, 0, 0.4, 0));
  back.add(add(new THREE.BoxGeometry(w * 0.6, 0.14, 0.12), mat('#f8fafc'), 0, 0.74, -0.05));
  group.add(back);
  const leg = new THREE.Group();
  leg.position.set(0, 0.46, -0.33);
  leg.add(add(new THREE.BoxGeometry(w - 0.04, 0.1, 0.5), cushion, 0, -0.02, -0.25));
  group.add(leg);
  return { group, back, leg };
}

/** The made-up bed: a mattress over the flat seat, a duvet, pillows. */
function makeBed(w: number, duvet: string) {
  const bed = new THREE.Group();
  const box = (bw: number, h: number, d: number, c: string, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(bw, h, d), mat(c, { rough: 0.92 }));
    m.position.set(x, y, z);
    bed.add(m);
  };
  box(w, 0.08, 1.95, '#f8fafc', 0, 0.52, -0.25);
  box(w + 0.04, 0.07, 1.25, duvet, 0, 0.58, -0.55);
  box(w + 0.04, 0.05, 0.22, '#f8fafc', 0, 0.6, 0.1);
  for (const sx of [-0.15, 0.15]) box(0.28, 0.1, 0.24, '#ffffff', sx * (w / 0.7), 0.62, 0.48);
  bed.visible = false;
  return bed;
}

/**
 * Someone walking the plan: always along the route `walkPath` gives, from
 * the last place they passed (a change of mind mid-walk goes back to it
 * first: they're on a clear leg from it), so never through a wall.
 */
class Walker {
  readonly pos: THREE.Vector3;
  heading = Math.PI;
  goal: PlaceId;
  private last: PlaceId;
  private route: PlaceId[] = [];

  constructor(
    private plan: CabinPlan,
    at: PlaceId,
  ) {
    const p = plan.places[at]!;
    this.pos = new THREE.Vector3(p.x, 0, p.z);
    this.goal = at;
    this.last = at;
  }

  /** Set off for a place. */
  to(dest: PlaceId) {
    if (dest === this.goal) return;
    this.goal = dest;
    this.route = walkPath(this.plan, this.last, dest) ?? [];
  }

  /** Walk on (metres a second); true while still on the way. */
  step(dt: number, pace: number): boolean {
    let left = dt * pace;
    while (left > 0 && this.route.length) {
      const id = this.route[0]!;
      const next = this.plan.places[id]!;
      const dx = next.x - this.pos.x;
      const dz = next.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.001) this.heading = turn(this.heading, Math.atan2(dx, dz), clamp(dt * 8));
      if (d <= left) {
        this.pos.set(next.x, 0, next.z);
        left -= d;
        this.route.shift();
        this.last = id;
      } else {
        this.pos.x += (dx / d) * left;
        this.pos.z += (dz / d) * left;
        left = 0;
      }
    }
    return this.route.length > 0;
  }
}

export class SuiteWorld {
  readonly root = new THREE.Group();
  readonly eye: THREE.PerspectiveCamera;
  private plan: CabinPlan;
  private me: Character;
  private crew: Character;
  private others: Character[] = [];
  private particles = new Particles();
  private st: SuiteState = {
    stage: 'boarding',
    act: null,
    course: 0,
    plate: null,
    doors: 'open',
    view: 'inside',
  };
  /** 0 upright … 1 a flat bed. */
  private recline = 0;
  /** 0 your door open … 1 closed. */
  private shut = 0;
  /** 0 the spa's door shut … 1 slid open. */
  private spaOpen = 0;
  /** 0 table folded … 1 laid. */
  private table = 0;
  private back: THREE.Group;
  private leg: THREE.Group;
  private bed: THREE.Group;
  private door?: THREE.Mesh;
  private spaDoor?: THREE.Mesh;
  private vacant?: THREE.MeshStandardMaterial;
  private tableTop: THREE.Group;
  private plate: THREE.Mesh;
  private food: THREE.Mesh;
  private kit: THREE.Group;
  private laptop: THREE.Group;
  private screen: THREE.MeshStandardMaterial;
  private film: THREE.Texture;
  private map: THREE.Texture;
  private mood: THREE.PointLight;
  private lamp: THREE.PointLight;
  private ceilLight: THREE.MeshStandardMaterial;
  private strip: THREE.MeshStandardMaterial;
  private outside: OutsideView;
  private windows = 0;
  private sky: OutsideView | null = null;
  private plane: THREE.Group | null = null;
  private seatAt: THREE.Vector3;
  /** Your suite's door, shut: its place along the plane. */
  private doorZ = 0;
  private bartender: Character | null = null;

  /** Your walk (to the bar, the spa, back to your seat) and the crew's. */
  private you: Walker;
  private crewWalk: Walker;
  private outsideShown = false;

  // The eye: round you (yaw from +z, pitch up, distance), plus what your drags add.
  private cam = { yaw: 0.9, pitch: 0.55, dist: 2.5 };
  private user = { yaw: 0, pitch: 0, zoom: 1 };
  private focusAt = new THREE.Vector3();
  private orbitOut = { yaw: 0.7, pitch: 0.18, zoom: 1 };

  private t0 = -1;
  private stageT = 0;
  private status: SuiteStatus | null = null;
  /** The page hears where you are and what the windows show. */
  onStatus: ((s: SuiteStatus) => void) | null = null;

  constructor(
    private stage: Stage,
    private o: SuiteOpts,
  ) {
    const first = o.cabin === 'first';
    this.plan = cabinPlan(o.cabin);
    stage.scene.add(this.root);
    stage.scene.background = new THREE.Color('#1a1a1a');
    // Light comes from the ceiling, not a sun: no shadows (phones).
    stage.sun.castShadow = false;
    stage.sun.position.set(-6, 4, -2);
    stage.sun.target.position.set(0, 0, 0);
    stage.hemi.color.set('#fffaf0');
    stage.hemi.groundColor.set('#6b5b4b');
    this.eye = new THREE.PerspectiveCamera(70, 1, 0.05, 60);
    stage.eye = this.eye;

    this.outside = new OutsideView(first ? 2 : 1);
    const sky0 = o.skies.boarding;
    const out0 = outsideAt('boarding', 0);
    this.outside.set(sky0, out0.altitude, out0.pitch);
    this.ceilLight = mat(C.ceiling, {
      rough: 0.9,
      emissive: '#f3ece0',
      emissiveIntensity: 0.55,
      own: true,
    });
    this.strip = mat('#fff4dc', { emissive: '#ffe6b3', emissiveIntensity: 2.2, own: true });

    const k = new Kit();
    this.buildShell(k);
    if (first) this.buildFirst(k);
    else this.buildBusiness(k);
    this.root.add(k.build());

    // Your seat, your screen, the table, the kit, the laptop.
    const seatPt = this.plan.places.seat!;
    const leather = first ? C.leather : C.seat;
    const seat = makeSeat(leather, first ? C.walnut : C.shell, first ? 0.7 : 0.54);
    this.seatAt = new THREE.Vector3(seatPt.x, 0, seatPt.z);
    seat.group.position.copy(this.seatAt);
    this.root.add(seat.group);
    this.back = seat.back;
    this.leg = seat.leg;
    this.bed = makeBed(first ? 0.7 : 0.54, first ? '#1e3a8a' : '#64748b');
    this.bed.position.copy(this.seatAt);
    this.root.add(this.bed);
    this.film = screenTexture('film');
    this.map = screenTexture('slide');
    this.screen = mat('#ffffff', {
      map: this.map,
      emissive: '#ffffff',
      emissiveIntensity: 0.55,
      own: true,
    });
    const mineFront = first
      ? this.plan.suites.find((s) => s.mine)!.zf
      : this.plan.pods.find((p) => p.mine)!.z - 1.0;
    const sw = first ? 0.82 : 0.5;
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(sw, sw * 0.57), this.screen);
    screen.position.set(seatPt.x, first ? 1.05 : 0.92, mineFront + 0.06);
    this.root.add(screen);

    this.kit = new THREE.Group();
    const bag = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.08, 0.12),
      mat(first ? '#0f766e' : '#1e3a8a', { rough: 0.5 }),
    );
    bag.position.set(0.12, 0.04, 0);
    this.kit.add(bag);
    if (first) {
      const pj = new THREE.Mesh(
        new THREE.BoxGeometry(0.3, 0.06, 0.24),
        mat('#1e293b', { rough: 0.95 }),
      );
      pj.position.set(-0.17, 0.03, 0);
      this.kit.add(pj);
    }
    this.kit.position.set(seatPt.x, first ? 0.42 : 0.42, mineFront + (first ? 0.6 : 0.18));
    this.root.add(this.kit);

    this.tableTop = new THREE.Group();
    const cloth = new THREE.Mesh(
      new THREE.BoxGeometry(first ? 0.6 : 0.5, 0.03, 0.42),
      mat('#f5efe4', { rough: 0.35 }),
    );
    this.tableTop.add(cloth);
    this.plate = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.1, 0.02, 24),
      mat('#ffffff', { rough: 0.15, own: true }),
    );
    this.plate.position.set(0, 0.025, 0.04);
    this.tableTop.add(this.plate);
    this.food = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 14, 10),
      mat('#7c2d12', { rough: 0.7, own: true }),
    );
    this.food.scale.set(1, 0.45, 1);
    this.food.position.set(0, 0.05, 0.04);
    this.tableTop.add(this.food);
    for (const sx of [-1, 1]) {
      const cutlery = new THREE.Mesh(
        new THREE.BoxGeometry(0.015, 0.006, 0.18),
        mat('#d1d5db', { rough: 0.2, metal: 0.9 }),
      );
      cutlery.position.set(sx * 0.17, 0.02, 0.04);
      this.tableTop.add(cutlery);
    }
    const flute = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.012, 0.16, 10),
      mat(first ? '#fde68a' : '#7f1d1d', { opacity: 0.75, rough: 0.05 }),
    );
    flute.position.set(0.21, 0.09, -0.13);
    this.tableTop.add(flute);
    this.tableTop.position.set(seatPt.x, 0.72, seatPt.z - 0.62);
    this.tableTop.visible = false;
    this.root.add(this.tableTop);

    this.laptop = new THREE.Group();
    this.laptop.add(
      new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.015, 0.2), mat('#9ca3af', { metal: 0.6 })),
    );
    const ls = new THREE.Mesh(
      new THREE.PlaneGeometry(0.3, 0.2),
      mat('#ffffff', { map: screenTexture('slide'), emissive: '#ffffff', emissiveIntensity: 0.6 }),
    );
    ls.position.set(0, 0.1, -0.1);
    ls.rotation.x = -0.25;
    this.laptop.add(ls);
    this.laptop.position.set(seatPt.x, 0.75, seatPt.z - 0.58);
    this.laptop.visible = false;
    this.root.add(this.laptop);

    // Lights: the cabin's own glow (hemisphere), your reading lamp, the night's mood light.
    this.lamp = new THREE.PointLight('#ffd9a0', first ? 3 : 2, 3.2, 1.6);
    this.lamp.position.set(seatPt.x + (first ? -0.6 : 0.3), 1.2, seatPt.z + 0.3);
    this.root.add(this.lamp);
    this.mood = new THREE.PointLight('#6366f1', 0, 7, 1.5);
    this.mood.position.set(seatPt.x + 1, 2.1, seatPt.z);
    this.root.add(this.mood);

    // The people.
    this.you = new Walker(this.plan, 'seat');
    this.crewWalk = new Walker(this.plan, 'galley');
    this.me = makeCharacter(o.me, 'me');
    this.root.add(this.me.root);
    this.crew = makeCharacter(o.crew, 'crew');
    this.root.add(this.crew.root);
    o.others.slice(0, 2).forEach((look, n) => {
      const c = makeCharacter(look, `pax:${n}`);
      this.root.add(c.root);
      this.others.push(c);
    });
    if (first) {
      this.bartender = makeCharacter(o.crew, 'bartender');
      this.bartender.root.position.set(-0.35, 0, this.plan.bulkhead - 2.65);
      this.root.add(this.bartender.root);
    }
    this.root.add(this.particles.group);
    this.focusAt.copy(this.you.pos).setY(0.9);
    this.cam = this.seatView();
  }

  // -------------------------------------------------------------------------
  // Building

  /** The tube: walls, dado, floor, runners, ceiling and its lights, bins, windows, the ends. */
  private buildShell(k: Kit) {
    const p = this.plan;
    const first = p.kind === 'first';
    const len = p.z0 - p.z1;
    const zc = (p.z0 + p.z1) / 2;
    const side = THREE.BackSide;
    const shell = new THREE.CylinderGeometry(R, R, len, 48, 1, true);
    k.add(shell, mat(C.wall, { rough: 0.85, side }), 0, CY, zc, {
      rx: Math.PI / 2,
      noShadow: true,
    });
    // The dado: the lower sidewall panel, darker (θ round the tube from the bottom).
    const th0 = Math.acos(CY / R);
    const th1 = Math.acos((CY - 0.62) / R);
    for (const start of [th0, Math.PI * 2 - th1]) {
      const g = new THREE.CylinderGeometry(R - 0.02, R - 0.02, len, 8, 1, true, start, th1 - th0);
      k.add(g, mat(C.dado, { rough: 0.9, side }), 0, CY, zc, { rx: Math.PI / 2, noShadow: true });
    }
    const carpet = first ? '#2c2420' : '#27384a';
    k.add(new THREE.PlaneGeometry(2 * FLOOR_HALF, len), mat(carpet, { rough: 1 }), 0, 0, zc, {
      rx: -Math.PI / 2,
      noShadow: true,
    });
    for (const x of p.aisles)
      k.add(
        new THREE.PlaneGeometry(p.aisleHalf * 2, len),
        mat(first ? '#5a4636' : '#4a3b30', { rough: 1 }),
        x,
        0.004,
        zc,
        { rx: -Math.PI / 2, noShadow: true },
      );
    // The ceiling, its light strips and downlights.
    k.add(new THREE.PlaneGeometry(2 * wallX(CEIL), len), this.ceilLight, 0, CEIL, zc, {
      rx: Math.PI / 2,
      noShadow: true,
    });
    for (const sx of [-1, 1])
      k.add(new THREE.BoxGeometry(0.06, 0.02, len), this.strip, sx * 1.27, 2.39, zc, {});
    for (let z = p.z0 - 1; z > p.z1; z -= 1.6)
      for (const sx of [-0.55, 0.55])
        k.add(new THREE.CircleGeometry(0.045, 12), this.strip, sx, CEIL - 0.005, z, {
          rx: Math.PI / 2,
          noShadow: true,
        });
    // The ends of the tube.
    for (const z of [p.z0, p.z1])
      k.add(new THREE.CircleGeometry(R, 40), mat('#e2dacb', { side: THREE.DoubleSide }), 0, CY, z, {
        noShadow: true,
      });
    // Overhead bins along each side (first: to the bulkhead; the bar and spa have none).
    const binTo = first ? p.bulkhead : p.z1;
    const binLen = p.z0 - binTo;
    for (const sx of [-1, 1]) {
      const s = new THREE.Shape();
      const X = (x: number) => -sx * x;
      s.moveTo(X(0), 0);
      s.lineTo(X(0.62), 0.02);
      s.quadraticCurveTo(X(0.78), 0.2, X(0.7), 0.5);
      s.lineTo(X(0.12), 0.62);
      s.lineTo(X(0), 0.55);
      const geo = new THREE.ExtrudeGeometry(s, {
        depth: binLen,
        bevelEnabled: false,
        curveSegments: 6,
      });
      k.add(geo, mat(C.bin, { rough: 0.55 }), sx * (wallX(2.0) - 0.02), 1.82, binTo, {
        noShadow: true,
      });
      for (let z = p.z0 - 0.2; z > binTo; z -= 1.6)
        k.box(0.66, 0.5, 0.012, C.seam, sx * (wallX(2.0) - 0.36), 1.82, z, { noShadow: true });
      k.box(0.05, 0.02, binLen, '#ffffff', sx * (wallX(1.8) - 0.62), 1.79, (p.z0 + binTo) / 2, {
        emissive: '#fff1d0',
        emissiveIntensity: 1.4,
        noShadow: true,
      });
    }
    if (!first) {
      k.box(1.3, 0.34, binLen, C.bin, 0, 2.03, (p.z0 + binTo) / 2, { round: 0.12, rough: 0.55 });
      for (let z = p.z0 - 0.2; z > binTo; z -= 1.6) k.box(1.32, 0.3, 0.012, C.seam, 0, 2.05, z);
    }
    this.buildWindows(k);
  }

  /** Rows of windows on both walls, every one a pane of the same view outside. */
  private buildWindows(k: Kit) {
    const p = this.plan;
    const y = 1.38;
    const zs: number[] = [];
    for (let z = p.z0 - 0.55; z > p.z1 + 0.3; z -= 0.92) zs.push(z);
    const paneShape = roundRect(0.28, 0.42, 0.12);
    const revealShape = roundRect(0.44, 0.6, 0.19);
    revealShape.holes.push(roundRect(0.28, 0.42, 0.12));
    const paneMat = new THREE.MeshBasicMaterial({ map: this.outside.texture });
    const trim = mat(C.trim, { rough: 0.7 });
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const one = new THREE.Vector3(1, 1, 1);
    for (const sx of [-1, 1]) {
      const geo = new THREE.ShapeGeometry(paneShape);
      const uv = geo.attributes.uv!;
      const pos = geo.attributes.position!;
      // The right wall's panes are mirrored: the view slides aft on both sides.
      for (let i = 0; i < uv.count; i++)
        uv.setXY(i, (sx < 0 ? 1 : -1) * (pos.getX(i) / 0.28) + 0.5, pos.getY(i) / 0.42 + 0.5);
      const panes = new THREE.InstancedMesh(geo, paneMat, zs.length);
      q.setFromEuler(new THREE.Euler(0, (-sx * Math.PI) / 2, 0));
      zs.forEach((z, i) => {
        m.compose(new THREE.Vector3(sx * (wallX(y) - 0.04), y, z), q, one);
        panes.setMatrixAt(i, m);
        // The reveal round it, and a shade half down on some.
        const rot = { ry: (-sx * Math.PI) / 2, noShadow: true };
        k.add(new THREE.ShapeGeometry(revealShape), trim, sx * (wallX(y) - 0.045), y, z, rot);
        if ((i * 7 + (sx > 0 ? 3 : 0)) % 5 === 0)
          k.add(
            new THREE.PlaneGeometry(0.28, 0.17),
            mat('#f5f1ea', { rough: 0.9 }),
            sx * (wallX(y) - 0.046),
            y + 0.12,
            z,
            rot,
          );
      });
      panes.instanceMatrix.needsUpdate = true;
      panes.frustumCulled = false;
      this.root.add(panes);
      this.windows += zs.length;
    }
  }

  /** First: suites both sides, the bulkhead with the doorway and the spa door, the bar and the spa. */
  private buildFirst(k: Kit) {
    const p = this.plan;
    const bz = p.bulkhead;
    for (const s of p.suites) {
      const xi = s.side * SUITE_X.inner;
      const xo = s.side * SUITE_X.outer;
      const w = Math.abs(xo - xi);
      const mid = (xi + xo) / 2;
      const len = s.zb - s.zf;
      const zc = (s.zf + s.zb) / 2;
      for (const z of [s.zf, s.zb]) {
        k.box(w, SUITE_H, 0.07, C.panel, mid, 0, z, { round: 0.02, rough: 0.6 });
        k.box(w, 0.04, 0.1, C.walnut, mid, SUITE_H, z, { rough: 0.4 });
      }
      k.box(0.07, SUITE_H, len - SUITE_DOOR, C.panel, xi, 0, s.zf + (len - SUITE_DOOR) / 2, {
        round: 0.02,
        rough: 0.6,
      });
      k.box(0.1, 0.04, len, C.walnut, xi, SUITE_H, zc, { rough: 0.4 });
      k.box(
        0.02,
        0.05,
        len - SUITE_DOOR,
        C.walnut,
        xi - s.side * 0.04,
        1.02,
        s.zf + (len - SUITE_DOOR) / 2,
      );
      // The door: yours slides (built below); the others' are mostly shut.
      const dz = s.zb - SUITE_DOOR / 2;
      if (s.mine) {
        this.door = new THREE.Mesh(
          new THREE.BoxGeometry(0.05, SUITE_H - 0.05, SUITE_DOOR),
          mat(C.door, { rough: 0.5 }),
        );
        this.doorZ = dz;
        this.door.position.set(xi + s.side * 0.06, (SUITE_H - 0.05) / 2, dz);
        const handle = new THREE.Mesh(
          new THREE.BoxGeometry(0.02, 0.5, 0.03),
          mat(C.gold, { rough: 0.3, metal: 0.8 }),
        );
        handle.position.set(-s.side * 0.035, 0.05, SUITE_DOOR / 2 - 0.08);
        this.door.add(handle);
        this.root.add(this.door);
      } else {
        const open = s.id === '3K' ? 0.7 : s.id === '1A' ? 0.4 : 0;
        k.box(
          0.05,
          SUITE_H - 0.05,
          SUITE_DOOR,
          C.door,
          xi + s.side * 0.06,
          0,
          dz - open * SUITE_DOOR,
          {
            rough: 0.5,
          },
        );
      }
      // The suite's number on the aisle side.
      const num = signTexture(s.id, '#5b3a24', '#f5e6c4');
      k.add(
        new THREE.PlaneGeometry(0.22, 0.1),
        mat('#ffffff', { map: num }),
        xi - s.side * 0.045,
        1.3,
        s.zf + 0.35,
        { ry: (-s.side * Math.PI) / 2, noShadow: true },
      );
      // The armchair (yours is built to move), the ottoman, the screen, the console and its lamp.
      const seatX = s.side * SUITE_SEAT.x;
      if (!s.mine) {
        k.box(0.78, 0.22, 0.75, C.leather, seatX, 0.31, s.zb - 0.75, { round: 0.08 });
        k.box(0.78, 0.95, 0.18, C.leather, seatX, 0.5, s.zb - 0.3, { round: 0.08, rx: -0.15 });
        for (const ax of [-1, 1])
          k.box(0.12, 0.2, 0.7, C.leather, seatX + ax * 0.45, 0.52, s.zb - 0.72, { round: 0.05 });
        k.box(0.3, 0.16, 0.12, '#f8fafc', seatX, 1.38, s.zb - 0.27, { round: 0.05 });
      }
      k.box(0.75, 0.42, 0.55, C.leather, seatX, 0, s.zf + 0.6, { round: 0.06 });
      if (!s.mine)
        k.add(
          new THREE.PlaneGeometry(0.82, 0.47),
          mat('#ffffff', {
            map: screenTexture('film'),
            emissive: '#ffffff',
            emissiveIntensity: 0.6,
          }),
          seatX,
          1.05,
          s.zf + 0.056,
          { noShadow: true },
        );
      k.box(0.86, 0.51, 0.02, '#0b0f17', seatX, 0.795, s.zf + 0.04);
      const cx = s.side * 2.42;
      k.box(0.32, 0.68, len - 0.3, C.walnut, cx, 0, zc, { round: 0.03, rough: 0.4 });
      k.box(0.34, 0.03, len - 0.3, '#f5efe4', cx, 0.68, zc, { rough: 0.3 });
      k.cyl(0.07, 0.1, 0.14, '#fff7e6', cx, 0.92, s.zb - 0.45, {
        emissive: '#ffd59a',
        emissiveIntensity: 1.6,
        noShadow: true,
      });
      k.cyl(0.01, 0.01, 0.25, C.gold, cx, 0.7, s.zb - 0.45, { metal: 0.8, rough: 0.3 });
      if (s.mine || s.id === '3K') {
        k.cyl(0.07, 0.06, 0.15, '#d1d5db', cx, 0.71, s.zf + 0.6, { metal: 0.9, rough: 0.2 });
        k.cyl(0.03, 0.035, 0.26, '#14532d', cx, 0.77, s.zf + 0.6, { rough: 0.2 });
      }
    }
    // The forward bulkhead: the bar's doorway, the spa's door, signs over them.
    const [d0, d1] = p.doorway!;
    const [s0, s1] = p.spaDoor!;
    const bh = mat('#e8e0d2', { rough: 0.6 });
    k.add(bulkheadPiece(-3, d0, 0, CEIL), bh, 0, 0, bz, {});
    k.add(bulkheadPiece(d1, s0, 0, CEIL), bh, 0, 0, bz, {});
    k.add(bulkheadPiece(s1, 3, 0, CEIL), bh, 0, 0, bz, {});
    k.add(bulkheadPiece(d0, d1, 2.0, CEIL), bh, 0, 0, bz, {});
    k.add(bulkheadPiece(s0, s1, 1.97, CEIL), bh, 0, 0, bz, {});
    for (const x of [d0 - 0.02, d1 + 0.02])
      k.box(0.08, 2.0, 0.16, C.walnut, x, 0, bz, { rough: 0.4 });
    k.box(d1 - d0 + 0.12, 0.08, 0.16, C.walnut, 0, 1.98, bz, { rough: 0.4 });
    const signAt = (text: string, x: number, w: number) =>
      k.add(
        new THREE.PlaneGeometry(w, 0.14),
        mat('#ffffff', { map: signTexture(text, '#1c1814', '#f5e6c4') }),
        x,
        2.2,
        bz + 0.05,
        { noShadow: true },
      );
    signAt('THE BAR', 0, 0.62);
    signAt('SHOWER SPA', (s0 + s1) / 2, 0.72);
    this.spaDoor = new THREE.Mesh(
      new THREE.BoxGeometry(s1 - s0, 1.95, 0.05),
      mat('#d9cdb6', { rough: 0.4 }),
    );
    this.spaDoor.position.set((s0 + s1) / 2, 0.975, bz - 0.07);
    this.root.add(this.spaDoor);
    this.vacant = mat('#22c55e', { emissive: '#22c55e', emissiveIntensity: 2.5, own: true });
    const light = new THREE.Mesh(new THREE.CircleGeometry(0.03, 12), this.vacant);
    light.position.set((s0 + s1) / 2, 2.05, bz + 0.05);
    this.root.add(light);
    // The rooms behind: the bar and the spa, a wall between, the nose bulkhead.
    const back = p.roomBack!;
    k.box(0.08, CEIL, bz - back, '#e8e0d2', p.split!, 0, (bz + back) / 2, { rough: 0.6 });
    k.add(bulkheadPiece(-3, 3, 0, CEIL), mat('#3b2a1e', { rough: 0.7 }), 0, 0, back + 0.04, {});
    k.add(
      new THREE.PlaneGeometry(FLOOR_HALF + p.split!, bz - back),
      mat('#4a3426', { rough: 0.6 }),
      (p.split! - FLOOR_HALF) / 2,
      0.006,
      (bz + back) / 2,
      {
        rx: -Math.PI / 2,
        noShadow: true,
      },
    );
    k.add(
      new THREE.PlaneGeometry(FLOOR_HALF - p.split!, bz - back),
      mat('#e7e5e4', { rough: 0.25 }),
      (p.split! + FLOOR_HALF) / 2,
      0.006,
      (bz + back) / 2,
      {
        rx: -Math.PI / 2,
        noShadow: true,
      },
    );
    // The bar: the counter, the back bar with lit shelves and bottles, stools.
    const cz = bz - 1.95;
    k.box(2.0, 1.03, 0.55, C.walnut, -0.35, 0, cz, { round: 0.05, rough: 0.4 });
    k.box(2.1, 0.05, 0.62, '#f5efe4', -0.35, 1.03, cz, { rough: 0.25 });
    k.box(2.6, 1.45, 0.12, '#3b2a1e', -0.95, 0.9, back + 0.12, {});
    for (const y of [1.33, 1.71])
      k.box(2.3, 0.03, 0.2, '#ffffff', -0.95, y, back + 0.25, {
        emissive: '#ffcc80',
        emissiveIntensity: 1.6,
        noShadow: true,
      });
    const bottle = ['#14532d', '#7c2d12', '#fbbf24', '#e5e7eb', '#1e3a8a'];
    for (let i = 0; i < 14; i++)
      k.cyl(0.035, 0.04, 0.26, bottle[i % 5]!, -2.0 + i * 0.15, i % 2 ? 1.36 : 1.74, back + 0.25, {
        rough: 0.15,
        seg: 8,
      });
    for (const x of [-1.1, -0.2]) {
      k.cyl(0.03, 0.03, 0.72, C.gold, x, 0, cz + 0.62, { metal: 0.8, rough: 0.3 });
      k.cyl(0.17, 0.15, 0.08, '#1f2937', x, 0.72, cz + 0.62, {});
    }
    const barLight = new THREE.PointLight('#ffc27a', 6, 4.5, 1.5);
    barLight.position.set(-0.6, 2.0, bz - 1.2);
    this.root.add(barLight);
    // The spa: the shower, a vanity and its mirror.
    const sh = buildModel('shower', { w: 1.0, d: 1.0, tier: 3 });
    sh.group.position.set(1.85, 0, bz - 2.3);
    this.root.add(sh.group);
    k.box(0.5, 0.85, 0.45, '#f5efe4', p.split! + 0.32, 0, bz - 2.4, { round: 0.03 });
    k.add(
      new THREE.PlaneGeometry(0.5, 0.6),
      mat('#cbd5e1', { rough: 0.05, metal: 0.6 }),
      p.split! + 0.05,
      1.4,
      bz - 2.4,
      {
        ry: Math.PI / 2,
        noShadow: true,
      },
    );
    // The aft end: a curtain to business.
    k.add(bulkheadPiece(-3, 3, 0, CEIL), mat('#2b4c5e', { rough: 0.95 }), 0, 0, 5.92, {});
  }

  /** Business: 1-2-1 lie-flat pods, the forward bulkhead with the galley's curtains. */
  private buildBusiness(k: Kit) {
    const p = this.plan;
    p.pods.forEach((pod, n) => {
      const m = pod.mirror;
      const at = (x: number) => pod.x + x;
      k.box(0.82, 1.12, 0.08, C.shell, pod.x, 0, pod.z + 0.95, { round: 0.03, rough: 0.55 });
      k.box(0.06, 1.12, 1.95, C.shell, at(m * 0.42), 0, pod.z, { round: 0.03, rough: 0.55 });
      k.box(0.05, 0.42, 1.0, C.screen, at(-m * 0.42), 0.79, pod.z - 0.2, {
        round: 0.02,
        rough: 0.5,
      });
      k.box(0.02, 0.02, 1.95, C.wood, at(m * 0.42), 1.12, pod.z, {});
      k.box(0.28, 0.72, 1.0, C.shell, at(m * 0.25), 0, pod.z - 0.2, { round: 0.03 });
      k.box(0.28, 0.03, 1.0, C.wood, at(m * 0.25), 0.72, pod.z - 0.2, {});
      k.cyl(0.03, 0.05, 0.12, '#ffffff', at(m * 0.25), 0.75, pod.z + 0.1, {
        emissive: '#ffd9a0',
        emissiveIntensity: 2,
        noShadow: true,
      });
      k.box(0.5, 0.42, 0.45, C.shell, at(-m * 0.08), 0, pod.z - 0.82, { round: 0.04 });
      k.box(0.82, 1.12, 0.06, C.shell, pod.x, 0, pod.z - 1.0, { round: 0.03 });
      k.box(0.54, 0.34, 0.02, '#111827', at(-m * 0.08), 0.75, pod.z - 0.975, {});
      if (!pod.mine) {
        k.add(
          new THREE.PlaneGeometry(0.5, 0.3),
          mat('#ffffff', {
            map: screenTexture(n % 3 ? 'slide' : 'film'),
            emissive: '#ffffff',
            emissiveIntensity: 0.6,
          }),
          at(-m * 0.08),
          0.92,
          pod.z - 0.962,
          { noShadow: true },
        );
        const sx = at(-m * 0.08);
        if (n % 7 === 3) {
          // Made up as a bed.
          k.box(0.56, 0.12, 1.95, C.seat, sx, 0.41, pod.z, { round: 0.05 });
          k.box(0.55, 0.06, 1.3, '#f8fafc', sx, 0.53, pod.z - 0.3, { round: 0.04 });
          k.box(0.42, 0.1, 0.3, '#ffffff', sx, 0.55, pod.z + 0.72, { round: 0.05 });
        } else {
          k.box(0.56, 0.14, 0.7, C.seat, sx, 0.38, pod.z + 0.25, { round: 0.06 });
          k.box(0.56, 0.8, 0.14, C.seat, sx, 0.48, pod.z + 0.68, { round: 0.06, rx: -0.18 });
          k.box(0.4, 0.2, 0.1, '#d9d2c5', sx, 1.17, pod.z + 0.76, { round: 0.05 });
        }
      }
    });
    // The forward bulkhead: the galley's curtains either side, the sign in the middle.
    const bz = p.bulkhead;
    const bh = mat('#e2dacb', { rough: 0.7 });
    k.add(bulkheadPiece(-3, -1.75, 0, CEIL), bh, 0, 0, bz, {});
    k.add(bulkheadPiece(-0.88, 0.88, 0, CEIL), bh, 0, 0, bz, {});
    k.add(bulkheadPiece(1.75, 3, 0, CEIL), bh, 0, 0, bz, {});
    for (const sx of [-1, 1]) {
      k.add(bulkheadPiece(0.88, 1.75, 2.05, CEIL), bh, 0, 0, bz, {});
      const cur = new THREE.PlaneGeometry(0.87, 2.05, 12, 1);
      const pos = cur.attributes.position!;
      for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin(pos.getX(i) * 30) * 0.03);
      cur.computeVertexNormals();
      k.add(
        cur,
        mat('#2b4c5e', { rough: 0.95, side: THREE.DoubleSide }),
        sx * 1.31,
        1.025,
        bz - 0.02,
        {
          noShadow: true,
        },
      );
    }
    k.add(bulkheadPiece(-1.75, -0.88, 2.05, CEIL), bh, 0, 0, bz, {});
    k.add(
      new THREE.PlaneGeometry(0.9, 0.22),
      mat('#ffffff', { map: signTexture('BUSINESS', '#0f172a', '#e2e8f0') }),
      0,
      1.95,
      bz + 0.05,
      { noShadow: true },
    );
    // The aft end: a curtain to economy.
    k.add(bulkheadPiece(-3, 3, 0, CEIL), mat('#2b4c5e', { rough: 0.95 }), 0, 0, p.z0 - 0.08, {});
  }

  // -------------------------------------------------------------------------
  // The page's side

  set(s: SuiteState) {
    if (s.stage !== this.st.stage) this.stageT = 0;
    // A new act: the eye goes back to its place for it.
    if (s.act !== this.st.act) this.user = { yaw: 0, pitch: 0, zoom: this.user.zoom };
    this.st = s;
    if (s.plate) {
      (this.plate.material as THREE.MeshStandardMaterial).color.set(s.plate[0]);
      (this.food.material as THREE.MeshStandardMaterial).color.set(s.plate[1]);
    }
  }

  /** A drag: turn the eye round you (or round the plane). */
  orbit(dx: number, dy: number) {
    if (this.st.view === 'outside') {
      this.orbitOut.yaw -= dx * 0.008;
      this.orbitOut.pitch = clamp(this.orbitOut.pitch + dy * 0.005, -0.3, 1.0);
      return;
    }
    this.user.yaw = clamp(this.user.yaw - dx * 0.006, -1.6, 1.6);
    this.user.pitch = clamp(this.user.pitch + dy * 0.004, -0.35, 0.5);
  }

  /** A pinch or the wheel: closer or further. */
  zoom(f: number) {
    if (this.st.view === 'outside') this.orbitOut.zoom = clamp(this.orbitOut.zoom / f, 0.55, 1.8);
    else this.user.zoom = clamp(this.user.zoom / f, 0.5, 1.5);
  }

  /** The eye's place at your seat (looking into your suite or pod from the aisle). */
  private seatView() {
    return this.plan.kind === 'first'
      ? { yaw: 0.87, pitch: 0.6, dist: 2.5 }
      : { yaw: 0.75, pitch: 0.5, dist: 2.2 };
  }

  // -------------------------------------------------------------------------
  // Each frame

  /** A frame: true while something moves (always: the crew, the clouds, you breathing). */
  update(t: number, frameDt: number): boolean {
    // Walks and the view outside run on the clock, not the frame rate (a slow
    // phone sees you arrive on time, in fewer steps).
    const dt = this.t0 < 0 ? frameDt : clamp(t - this.t0, 0, 0.5);
    this.t0 = t;
    this.stageT += dt;
    const s = this.st;
    const first = this.o.cabin === 'first';
    const sleeping =
      s.act === 'sleep' || (s.stage === 'night' && s.act !== 'work' && s.act !== 'watch');

    // Outside the windows.
    const out = outsideAt(s.stage, this.stageT);
    const sky = this.o.skies[s.stage];
    this.outside.set(sky, out.altitude, out.pitch);
    this.outside.scroll(dt, out.altitude);

    // You: walk to where your act is (the bar, the spa) or back to your seat.
    const you = this.you;
    you.to(placeFor(s.act, this.o.cabin));
    const walking = you.step(dt, PACE);
    const atSeat = !walking && you.goal === 'seat';

    this.recline = approach(
      this.recline,
      atSeat && sleeping ? 1 : atSeat && s.act === 'watch' ? 0.35 : 0,
      dt,
      2.5,
    );
    // Your door shuts when asked, but opens for you to pass.
    const passing = walking || you.goal !== 'seat';
    this.shut = approach(this.shut, first && s.doors === 'closed' && !passing ? 1 : 0, dt, 3);
    const laid = s.course > 0 && !sleeping && atSeat;
    this.table = approach(this.table, laid || (s.act === 'work' && atSeat) ? 1 : 0, dt, 4);
    const r = ease(this.recline);
    this.back.rotation.x = 0.18 + r * (Math.PI / 2 - 0.18);
    this.leg.rotation.x = -0.9 + r * 0.9;
    this.bed.visible = this.recline > 0.6;
    if (this.door) this.door.position.z = this.doorZ - (1 - ease(this.shut)) * (SUITE_DOOR - 0.06);
    // The spa's door slides open as you come to it, and its light goes red while you're in.
    if (this.spaDoor && this.plan.spaDoor) {
      const near = you.goal === 'spa' || (you.pos.z < this.plan.bulkhead + 1.2 && you.pos.x > 0.8);
      this.spaOpen = approach(this.spaOpen, near ? 1 : 0, dt, 2);
      const [s0, s1] = this.plan.spaDoor;
      this.spaDoor.position.x = (s0 + s1) / 2 + ease(this.spaOpen) * (s1 - s0 - 0.04);
      const busy = you.goal === 'spa' && !walking ? '#ef4444' : '#22c55e';
      this.vacant?.color.set(busy);
      this.vacant?.emissive.set(busy);
    }
    this.tableTop.visible = this.table > 0.05 && laid;
    this.tableTop.scale.setScalar(Math.max(0.05, this.table));
    this.laptop.visible = s.act === 'work' && this.table > 0.5;
    this.kit.visible = s.stage === 'boarding' && s.act === null;
    this.screen.map = s.act === 'watch' ? this.film : this.map;
    this.screen.emissiveIntensity = s.act === 'watch' ? 1.1 : 0.55;
    // Night: the cabin dims to its mood light.
    const night = s.stage === 'night' || sleeping;
    this.mood.intensity = approach(this.mood.intensity, night ? 3 : 0, dt, 4);
    this.lamp.intensity = approach(this.lamp.intensity, night ? 0.6 : first ? 3 : 2, dt, 4);
    this.stage.hemi.intensity = approach(this.stage.hemi.intensity, night ? 0.5 : 1.45, dt, 1.2);
    this.stage.sun.intensity = approach(this.stage.sun.intensity, night ? 0.15 : 0.9, dt, 1.6);
    this.ceilLight.emissiveIntensity = approach(
      this.ceilLight.emissiveIntensity,
      night ? 0.08 : 0.55,
      dt,
      1,
    );
    this.strip.emissiveIntensity = approach(this.strip.emissiveIntensity, night ? 0.5 : 2.2, dt, 3);
    this.strip.emissive.set(night ? '#818cf8' : '#ffe6b3');

    // How you look: walking, at the bar, in the spa, asleep, or in your seat.
    this.me.root.position.copy(you.pos);
    if (walking) {
      this.me.root.rotation.y = you.heading;
      pose(this.me, 'walk', t);
    } else if (you.goal === 'bar') {
      this.me.root.rotation.y = Math.PI;
      pose(this.me, 'drink', t);
    } else if (you.goal === 'spa') {
      this.me.root.rotation.y = Math.PI * 0.9;
      pose(this.me, 'idle', t);
      fx.steam(this.particles, new THREE.Vector3(1.85, 1.9, this.plan.bulkhead - 2.3), dt, 14);
    } else if (this.bed.visible) {
      // Head on the pillows (aft), feet towards the ottoman.
      this.me.root.position.set(this.seatAt.x, 0, this.seatAt.z - 0.25);
      this.me.root.rotation.y = Math.PI;
      pose(this.me, 'lie', t, { seat: 0.52 });
      fx.zz(this.particles, new THREE.Vector3(this.seatAt.x, 1.0, this.seatAt.z - 0.1), dt);
    } else {
      this.me.root.rotation.y = Math.PI;
      const p: PoseId = s.act === 'work' ? 'type' : laid ? 'eat' : 'sit';
      pose(this.me, p, t, { seat: 0.46 });
    }

    this.updateCrew(t, dt, sleeping);
    this.updateOthers(t);
    this.particles.update(dt);
    this.updateEye(t, dt, walking);

    const at: SuiteStatus['at'] = walking
      ? 'walking'
      : you.goal === 'bar'
        ? 'bar'
        : you.goal === 'spa'
          ? 'spa'
          : 'seat';
    const st = this.status;
    if (!st || st.at !== at || st.outside !== out.phase) {
      this.status = { at, outside: out.phase, windows: this.windows };
      this.onStatus?.(this.status);
    }
    return true;
  }

  /** The crew: at your door while serving (the welcome, a course, the turndown), else in the galley. */
  private updateCrew(t: number, dt: number, sleeping: boolean) {
    const s = this.st;
    const serving =
      (s.stage === 'boarding' && s.act === null) ||
      (s.act === 'dine' && s.course > 0) ||
      (sleeping && this.recline < 0.99);
    const w = this.crewWalk;
    w.to(serving ? 'serve' : 'galley');
    const c = this.crew.root;
    const moving = w.step(dt, 1.0);
    c.position.copy(w.pos);
    if (moving) {
      c.rotation.y = w.heading;
      pose(this.crew, 'walk', t);
    } else {
      // Facing your seat when serving; down the aisle in the galley.
      c.rotation.y = serving
        ? Math.atan2(this.seatAt.x - c.position.x, this.seatAt.z - c.position.z)
        : this.plan.kind === 'first'
          ? Math.PI / 2
          : 0;
      pose(this.crew, serving ? 'present' : 'idle', t);
    }
  }

  /** The other passengers (one at the bar in first) and the bartender. */
  private updateOthers(t: number) {
    const p = this.plan;
    this.others.forEach((c, n) => {
      if (p.kind === 'first') {
        if (n === 0) {
          // Across the aisle, in 2K.
          const s = p.suites.find((x) => x.id === '2K')!;
          c.root.position.set(SUITE_SEAT.x, 0, s.zb - SUITE_SEAT.back + 0.1);
          c.root.rotation.y = Math.PI;
          pose(c, 'drink', t, { seat: 0.46, phase: 1 });
        } else {
          // At the bar's far end (the eye looks along it from the near end).
          c.root.position.set(0.4, 0, p.bulkhead - 1.3);
          c.root.rotation.y = -Math.PI * 0.8;
          pose(c, 'chat', t, { phase: 2 });
        }
      } else {
        const pod = p.pods[n === 0 ? 5 : 14]!;
        c.root.position.set(pod.x - pod.mirror * 0.08, 0, pod.z + 0.3);
        c.root.rotation.y = Math.PI;
        pose(c, n === 0 ? 'type' : 'read', t, { seat: 0.46, phase: n });
      }
    });
    if (this.bartender) {
      this.bartender.root.rotation.y = 0;
      pose(this.bartender, this.you.goal === 'bar' ? 'stir' : 'idle', t);
    }
  }

  /** The eye: round you inside the cabin (kept inside its walls), or round the plane outside. */
  private updateEye(t: number, dt: number, walking: boolean) {
    const e = this.eye;
    const a = this.stage.w / Math.max(1, this.stage.h);
    const fov = a < 0.8 ? 74 : 60;
    if (e.fov !== fov) {
      e.fov = fov;
      e.updateProjectionMatrix();
    }
    const outside = this.st.view === 'outside';
    if (outside !== this.outsideShown) {
      this.outsideShown = outside;
      this.root.visible = !outside;
      if (this.plane) this.plane.visible = outside;
      if (!outside) this.stage.scene.background = new THREE.Color('#1a1a1a');
    }
    if (outside) {
      this.showOutside(t, dt);
      return;
    }
    const you = this.you;
    // Where to look from: behind you as you walk, over your shoulder at the
    // bar or in the spa, from the aisle at your seat.
    const want = walking
      ? { yaw: you.heading + Math.PI, pitch: 0.42, dist: 2.2 }
      : you.goal === 'bar'
        ? { yaw: -1.15, pitch: 0.4, dist: 1.9 }
        : you.goal === 'spa'
          ? { yaw: -0.6, pitch: 0.85, dist: 2.0 }
          : this.seatView();
    const k = clamp(dt * 2.2);
    this.cam.yaw = turn(this.cam.yaw, want.yaw, k);
    this.cam.pitch += (want.pitch - this.cam.pitch) * k;
    this.cam.dist += (want.dist - this.cam.dist) * k;
    const focus = new THREE.Vector3(you.pos.x, this.bed.visible ? 0.6 : 0.9, you.pos.z);
    if (this.bed.visible) focus.z -= 0.3;
    this.focusAt.lerp(focus, clamp(dt * 4));
    const yaw = this.cam.yaw + this.user.yaw;
    const pitch = clamp(this.cam.pitch + this.user.pitch, 0.05, 1.2);
    const dist = this.cam.dist * this.user.zoom;
    const pos = new THREE.Vector3(
      this.focusAt.x + Math.sin(yaw) * Math.cos(pitch) * dist,
      this.focusAt.y + Math.sin(pitch) * dist,
      this.focusAt.z + Math.cos(yaw) * Math.cos(pitch) * dist,
    );
    this.keepInside(pos);
    e.position.copy(pos);
    e.lookAt(this.focusAt);
    e.updateMatrixWorld();
  }

  /** The eye stays in the room you're in: never through the fuselage or a bulkhead. */
  private keepInside(pos: THREE.Vector3) {
    const p = this.plan;
    const f = this.focusAt;
    if (p.kind === 'first' && f.z < p.bulkhead) {
      // The bar or the spa.
      const bar = f.x < p.split!;
      const x0 = bar ? -FLOOR_HALF + 0.3 : p.split! + 0.15;
      const x1 = bar ? p.split! - 0.15 : FLOOR_HALF - 0.3;
      pos.x = clamp(pos.x, x0, x1);
      pos.z = clamp(pos.z, p.roomBack! + 0.25, p.bulkhead - 0.15);
      pos.y = clamp(pos.y, 1.0, CEIL - 0.25);
    } else {
      // Above the suites' and pods' walls, under the bins' line, within the tube.
      pos.y = clamp(pos.y, p.kind === 'first' ? SUITE_H + 0.12 : 1.3, CEIL - 0.18);
      const half = wallX(pos.y) - 0.45;
      pos.x = clamp(pos.x, -half, half);
      pos.z = clamp(pos.z, p.bulkhead + 0.25, p.z0 - 0.3);
    }
  }

  /** Outside: the plane over the clouds (or the ground, low), in the airline's colours. */
  private showOutside(t: number, dt: number) {
    if (!this.plane) {
      const plane = makePlane3D({
        kind: 'airliner',
        livery: this.o.livery ?? '#0f766e',
        length: 14,
      });
      this.plane = new THREE.Group();
      this.plane.add(plane.root);
      plane.setGear(0);
      plane.root.position.y = -1;
      this.stage.scene.add(this.plane);
      this.sky = new OutsideView(7, 3);
    }
    const out = outsideAt(this.st.stage, this.stageT);
    const sky = this.o.skies[this.st.stage];
    this.sky!.set(sky, out.altitude, 0);
    this.sky!.scroll(dt * 0.4, out.altitude);
    this.stage.scene.background = this.sky!.texture;
    // Flying (nose to +x), climbing or descending, a gentle roll.
    this.plane.rotation.set(Math.sin(t * 0.4) * 0.04, 0, out.pitch);
    this.plane.position.y = Math.sin(t * 0.7) * 0.15;
    const o = this.orbitOut;
    const d = 22 * o.zoom;
    this.eye.position.set(
      Math.sin(o.yaw) * Math.cos(o.pitch) * d,
      Math.sin(o.pitch) * d,
      Math.cos(o.yaw) * Math.cos(o.pitch) * d,
    );
    this.eye.lookAt(0, 0, 0);
    this.eye.updateMatrixWorld();
  }

  dispose() {
    this.stage.scene.remove(this.root);
    disposeTree(this.root);
    if (this.plane) {
      this.stage.scene.remove(this.plane);
      disposeTree(this.plane);
    }
    this.stage.eye = null;
    this.outside.dispose();
    this.sky?.dispose();
    this.ceilLight.dispose();
    this.strip.dispose();
  }
}

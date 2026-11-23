/**
 * The airport terminal in 3D: one long hall, a glass wall all along it onto
 * the apron (planes at their stands, one taxiing out, the runway, the tower,
 * the sky of the hour), and the steps of a trip laid out along it, each a
 * zone the camera glides to as you walk on:
 *
 * - Departures: the ticket desk and the check-in island (agents in the
 *   airline's uniform under their signs, the back panel in its colours,
 *   scales and belts, a queue between the stanchions); security (the X-ray
 *   tunnel with its rollers and trays, the walk-through arch whose light
 *   turns green, officers); the gate (rows of seats, the gate desk and its
 *   screen, your plane nose-in at the jet bridge).
 * - Arrivals: passport control (booths with officers, e-gates, the queue),
 *   baggage reclaim (the carousel turning with everyone's bags, the belt's
 *   screen), and the arrivals hall (drivers at the barrier holding name
 *   boards, yours with your name; a café, a SIM kiosk, the way out to the
 *   taxi rank, the kerb with its taxis through the glass).
 *
 * People: you and your companions in your own looks, the staff (CC0 people
 * in uniform, posed each frame); background travellers baked once and drawn
 * instanced (./crowd.ts), and a few walking through pulling their bags (the
 * kit's far copy, its own walk). Only the zone in view (and the one you're
 * walking from) is in the scene, so its people are the only ones posed.
 *
 * The camera is a perspective eye, inside the hall at head height above the
 * crowd, looking into the zone towards the glass.
 */
import * as THREE from 'three';
import { makePlane3D } from '../../three-kit/plane';
import { carModel, loadCars, type CarModel } from '../../three-kit/vehicles';
import { makeCharacter as makeWalker, type Character as Walker } from '../../three-kit/character';
import { makeCharacter, pose, type Character, type PoseId } from '../../interiors3d/character';
import { FLOOR_SCALE, Kit, disposeTree, floorTexture, mat } from '../../interiors3d/kit';
import type { Stage } from '../../interiors3d/stage';
import type { AvatarLook } from '../art';
import { fnv, seeded } from '../travel';
import {
  BAG_COLOURS,
  BAG_KINDS,
  Instanced,
  bagGeometry,
  bags,
  bakePeople,
  crowdMaterial,
  type BagAt,
  type BagKind,
  type BakeSpec,
  type Placed,
} from './crowd';
import { travellerLook, uniformLook } from './looks';

export type Zone =
  'ticket' | 'checkin' | 'security' | 'gate' | 'board' | 'passport' | 'baggage' | 'hall';
type Area = 'desk' | 'security' | 'gate' | 'passport' | 'baggage' | 'hall';
const AREA: Record<Zone, Area> = {
  ticket: 'desk',
  checkin: 'desk',
  security: 'security',
  gate: 'gate',
  board: 'gate',
  passport: 'passport',
  baggage: 'baggage',
  hall: 'hall',
};

const X0 = -10;
const X1 = 46;
const GLASS = -5;
const FRONT = 9;
const CEIL = 5.6;
const APRON = -3.2;
/** Your own jet's door (x, height over the apron, z): its airstairs come down from it. */
const JET_DOOR = { x: 40.9, y: 1.25, z: GLASS - 12.75 };

export interface Friend {
  id: string;
  first: string;
  look: AvatarLook;
}

export interface TerminalOpts {
  mode: 'departures' | 'arrivals';
  night: boolean;
  seed: string;
  /** This city (the travellers' faces). */
  city: string;
  me: AvatarLook;
  /** Friends with you (holiday). */
  party: Friend[];
  /** Friends waiting at the barrier (arrivals). */
  waiting?: Friend[];
  /** Your flight's livery, airline, destination, gate, plane. */
  livery: string;
  liveries: string[];
  airline: string;
  toName: string;
  gate: string;
  time?: string;
  flight?: string;
  kind: 'airliner' | 'bizjet';
  /** Arrivals: the belt, the flight's line on its screen, the name boards. */
  belt?: number;
  beltLine?: string;
  sign?: { hotel: string; name: string } | null;
  boards?: string[];
  /** The departures screen's rows (time, flight, city, gate, status). */
  fids?: string[][];
  /** Taxis' paint in this city. */
  taxi?: string;
}

interface Spot {
  x: number;
  z: number;
  ry: number;
  pose: PoseId;
  seat?: number;
}

interface Person {
  c: Character;
  spot: Spot;
  n: number;
  /** Holding up a board, or waving. */
  hold?: boolean;
}

interface Stroller {
  w: Walker;
  bag: THREE.Object3D;
  z: number;
  speed: number;
  x0: number;
  span: number;
  phase: number;
}

/** A canvas texture (sRGB, mipmapped), drawn by `draw` on a w × h canvas. */
function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  draw(g);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

/** Text fitted into a box (shrinks the font to fit the width). */
function fitText(
  g: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxW: number,
  size: number,
  weight = 800,
) {
  let s = size;
  g.font = `${weight} ${s}px ${FONT}`;
  while (s > 8 && g.measureText(text).width > maxW) {
    s -= 2;
    g.font = `${weight} ${s}px ${FONT}`;
  }
  g.fillText(text, x, y);
}

export class TerminalWorld {
  readonly root = new THREE.Group();
  private o: TerminalOpts;
  private tex: THREE.Texture[] = [];
  private areas = new Map<Area, THREE.Group>();
  private people = new Map<Area, Person[]>();
  private strollers = new Map<Area, Stroller[]>();
  private crowds: Instanced[] = [];
  private me: Character;
  private youTag!: THREE.Sprite;
  private youRing!: THREE.Mesh;
  private party: Character[] = [];
  private tags: THREE.Sprite[] = [];
  private zone: Zone;
  private from: Area | null = null;
  private moveAt = -1;
  private playing = false;
  private playAt = -1;
  private eye = new THREE.PerspectiveCamera(55, 1, 0.1, 400);
  private camFrom = { p: new THREE.Vector3(), l: new THREE.Vector3() };
  private camAt = { p: new THREE.Vector3(), l: new THREE.Vector3() };
  private camT = 1;
  private camStart = -1;
  private aspect = 1;
  private taxiPlane: THREE.Group | null = null;
  private myBag: THREE.Group;
  private tray: THREE.Group | null = null;
  private archLamp: THREE.MeshStandardMaterial | null = null;
  private belt: { im: THREE.InstancedMesh[]; at: { k: number; kind: number; n: number }[] } | null =
    null;
  private walkerLooks: AvatarLook[] = [];
  private disposed = false;
  private carGroup = new THREE.Group();
  /** People in the scene now (tests). */
  peopleCount = 0;
  /** The baked crowd has been added. */
  crowdReady = false;
  onChange: (() => void) | null = null;

  constructor(
    private stage: Stage,
    o: TerminalOpts,
    zone: Zone,
  ) {
    this.o = o;
    this.zone = zone;
    stage.scene.add(this.root);
    stage.eye = this.eye;
    this.lights();
    this.shell();
    this.outside();
    if (o.mode === 'departures') {
      this.deskArea();
      this.securityArea();
      this.gateArea();
    } else {
      this.passportArea();
      this.baggageArea();
      this.hallArea();
    }
    // You (and your friends), with your bag.
    this.me = makeCharacter(o.me, 'me');
    this.root.add(this.me.root);
    // You stand out: "You" over your head, a soft ring at your feet.
    this.youTag = this.nameTag('You', 'rgba(15,118,110,0.92)', '#ffffff');
    this.youTag.scale.set(0.62, 0.2, 1);
    this.me.root.add(this.youTag);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.34, 0.43, 40).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({
        color: '#2dd4bf',
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
      }),
    );
    ring.position.y = 0.014;
    ring.renderOrder = 2;
    this.youRing = ring;
    this.me.root.add(ring);
    o.party.slice(0, 3).forEach((f, k) => {
      const c = makeCharacter(f.look, f.id);
      this.root.add(c.root);
      this.party.push(c);
      const tag = this.nameTag(f.first);
      this.tags.push(tag);
      c.root.add(tag);
      void k;
    });
    this.myBag = new THREE.Group();
    const bag = new THREE.Mesh(bagGeometry('case'), crowdMaterial(0.4));
    bag.castShadow = true;
    // (One instance's worth: the paint's colour through the material.)
    (bag.material as THREE.MeshStandardMaterial).color.set('#f59e0b');
    this.myBag.add(bag);
    const ribbon = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 0.04, 0.02),
      mat('#facc15', { rough: 0.5 }),
    );
    ribbon.position.set(0, 0.76, -0.08);
    this.myBag.add(ribbon);
    this.root.add(this.myBag);
    this.attach(AREA[zone]);
    this.placeYou(zone, 0, true);
    this.setCamera(zone, true);
    void this.bakeCrowds();
  }

  // ------------------------------------------------------------------ light

  private lights() {
    const s = this.stage;
    const night = this.o.night;
    s.scene.background = new THREE.Color(night ? '#0b1026' : '#a9d3ee');
    s.hemi.color.set(night ? '#c7d2fe' : '#fffaf0');
    s.hemi.groundColor.set(night ? '#1e1b4b' : '#cbbfa8');
    s.hemi.intensity = night ? 0.9 : 1.25;
    s.ambient.intensity = night ? 0.45 : 0.3;
    s.sun.color.set(night ? '#a5b4fc' : '#fff1d6');
    s.sun.intensity = night ? 0.35 : 2.2;
    const sc = s.sun.shadow.camera;
    sc.left = sc.bottom = -9;
    sc.right = sc.top = 9;
    sc.far = 90;
    sc.updateProjectionMatrix();
    s.scene.fog = new THREE.Fog(night ? '#0b1026' : '#cfe5f3', 60, 230);
  }

  /** The sun follows the zone in view, so its shadows fall where you look. */
  private aimSun(x: number) {
    const s = this.stage;
    s.sun.target.position.set(x, 0, -1);
    s.sun.position.set(x - 9, 16, -16);
    s.sun.target.updateMatrixWorld();
  }

  // ------------------------------------------------------------------ the hall

  private shell() {
    const o = this.o;
    const len = X1 - X0;
    const cx = (X0 + X1) / 2;
    const ft = floorTexture('cream').clone();
    ft.needsUpdate = true;
    ft.repeat.set(len / FLOOR_SCALE.cream, (FRONT - GLASS) / FLOOR_SCALE.cream);
    this.tex.push(ft);
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(len, FRONT - GLASS),
      mat('#ffffff', { map: ft, rough: 0.32, own: true }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(cx, 0, (FRONT + GLASS) / 2);
    floor.receiveShadow = true;
    this.root.add(floor);

    const k = new Kit();
    // The ceiling: panels, light strips across it, and a dark recess at the glass.
    k.box(len, 0.1, FRONT - GLASS, o.night ? '#cbd5e1' : '#eef1f4', cx, CEIL, (FRONT + GLASS) / 2, {
      noShadow: true,
    });
    k.box(len, 0.5, 0.6, '#94a3b8', cx, CEIL - 0.5, GLASS + 0.3, { noShadow: true });
    // The glass wall's frame: mullions, a transom, the sill.
    const metal = { rough: 0.35, metal: 0.6 };
    for (let x = X0; x <= X1 + 0.01; x += 3)
      k.box(0.09, CEIL - 0.5, 0.14, '#475569', x, 0, GLASS, { ...metal });
    k.box(len, 0.08, 0.16, '#475569', cx, 2.9, GLASS, { ...metal, noShadow: true });
    k.box(len, 0.2, 0.3, '#334155', cx, 0, GLASS, { ...metal });
    // Columns along the glass, and the end walls.
    for (const x of [9, 27])
      k.cyl(0.36, 0.36, CEIL, '#f1f5f9', x, 0, GLASS + 1.0, { seg: 20, rough: 0.4 });
    for (const x of [X0, X1]) k.box(0.3, CEIL, FRONT - GLASS, '#e2e8f0', x, 0, (FRONT + GLASS) / 2);
    this.root.add(k.build());
    // Light strips (glowing, no shadow), drawn on their own.
    const lk = new Kit();
    const glow = {
      emissive: o.night ? '#fff7e0' : '#ffffff',
      emissiveIntensity: o.night ? 1.6 : 1.1,
    };
    for (const z of [-2.6, 0.4, 3.4, 6.4])
      lk.box(len - 1, 0.04, 0.22, '#ffffff', cx, CEIL - 0.04, z, { ...glow, noShadow: true });
    const strips = lk.build();
    strips.traverse((x) => ((x as THREE.Mesh).castShadow = false));
    this.root.add(strips);
    // The glass itself.
    const glass = new THREE.Mesh(
      new THREE.PlaneGeometry(len, CEIL - 0.5),
      mat('#cfe8f6', { opacity: 0.1, rough: 0.05, own: true }),
    );
    glass.position.set(cx, (CEIL - 0.5) / 2, GLASS);
    this.root.add(glass);
    // Warm pools of light at night.
    if (o.night)
      for (const x of [-2, 18, 36]) {
        const l = new THREE.PointLight('#ffe7c2', 9, 16, 1.6);
        l.position.set(x, CEIL - 0.6, 0);
        this.root.add(l);
      }
  }

  // ------------------------------------------------------------------ outside

  private outside() {
    const o = this.o;
    const night = o.night;
    const rnd = seeded(fnv(`${o.seed}:apron`));
    // The sky: a tall gradient far off.
    const sky = canvasTexture(4, 256, (g) => {
      const gr = g.createLinearGradient(0, 0, 0, 256);
      if (night) {
        gr.addColorStop(0, '#050816');
        gr.addColorStop(0.6, '#1e1b4b');
        gr.addColorStop(1, '#3730a3');
      } else {
        gr.addColorStop(0, '#4aa3df');
        gr.addColorStop(0.65, '#a9d3ee');
        gr.addColorStop(1, '#e8f3fa');
      }
      g.fillStyle = gr;
      g.fillRect(0, 0, 4, 256);
    });
    this.tex.push(sky);
    const skyM = new THREE.Mesh(
      new THREE.PlaneGeometry(700, 160),
      new THREE.MeshBasicMaterial({ map: sky, fog: false }),
    );
    skyM.position.set(18, 50, -230);
    this.root.add(skyM);
    // Arrivals: the hall's end is landside (the kerb); the rest looks onto the apron.
    const landside = o.mode === 'arrivals' ? 27 : X1 + 60;
    const apronW = landside - (X0 - 60);
    const ct = floorTexture('concrete').clone();
    ct.needsUpdate = true;
    ct.repeat.set(apronW / 8, 30);
    this.tex.push(ct);
    const apron = new THREE.Mesh(
      new THREE.PlaneGeometry(apronW, 240),
      mat(night ? '#6b7280' : '#c4c8cc', { map: ct, rough: 0.92, own: true }),
    );
    apron.rotation.x = -Math.PI / 2;
    apron.position.set((X0 - 60 + landside) / 2, APRON, GLASS - 120);
    apron.receiveShadow = true;
    this.root.add(apron);
    const k = new Kit();
    // Grass beyond, the taxiway's line, the runway with its markings.
    k.box(apronW, 0.02, 120, night ? '#14301f' : '#7fa36b', (X0 - 60 + landside) / 2, APRON, -170, {
      noShadow: true,
    });
    const lineM = {
      emissive: night ? '#facc15' : undefined,
      emissiveIntensity: 0.6,
      noShadow: true,
    };
    for (let x = X0 - 58; x < landside - 2; x += 5)
      k.box(3, 0.02, 0.22, '#facc15', x, APRON + 0.01, -48, lineM);
    k.box(apronW, 0.02, 16, '#3f4249', (X0 - 60 + landside) / 2, APRON + 0.005, -82, {
      noShadow: true,
    });
    for (let x = X0 - 58; x < landside - 2; x += 14)
      k.box(7, 0.02, 0.4, '#f8fafc', x, APRON + 0.02, -82, { noShadow: true });
    // Stand markings: a yellow lead-in line at each stand.
    for (const x of [0, 18, 37.2])
      if (x < landside) k.box(0.2, 0.02, 30, '#facc15', x, APRON + 0.01, GLASS - 18, lineM);
    // The far side: hangars, the control tower, a terminal across the field.
    const far = night ? '#1f2440' : '#9aa4b2';
    for (let n = 0; n < 5; n++) {
      const x = -40 + n * 26 + rnd() * 6;
      if (x > landside) continue;
      k.box(18, 9 + rnd() * 4, 14, far, x, APRON, -120 - rnd() * 10, { noShadow: true });
    }
    if (landside > 10) {
      k.cyl(1.6, 2.2, 26, night ? '#2a2f4d' : '#cbd2da', -6, APRON, -105, { noShadow: true });
      k.cyl(4.2, 3.0, 4, night ? '#111827' : '#334155', -6, APRON + 26, -105, { noShadow: true });
    }
    // Ground vehicles parked by the stands: a tug and its carts, a catering truck.
    for (const [x, z, c] of [
      [-6, -12, '#f59e0b'],
      [9, -13, '#e2e8f0'],
      [26.5, -12, '#f59e0b'],
    ] as const) {
      if (x > landside - 2) continue;
      k.box(2.2, 1.3, 1.3, c, x, APRON, z, { round: 0.15 });
      k.box(1.0, 0.8, 1.2, '#1f2937', x + 1.2, APRON + 0.4, z, { round: 0.1 });
      for (let j = 1; j <= 2; j++) k.box(1.8, 1.0, 1.2, '#64748b', x - j * 2.3, APRON, z);
    }
    this.root.add(k.build());
    // Apron lights at night: masts with their glow.
    if (night) {
      const glowT = canvasTexture(64, 64, (g) => {
        const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
        r.addColorStop(0, 'rgba(255,240,200,1)');
        r.addColorStop(1, 'rgba(255,240,200,0)');
        g.fillStyle = r;
        g.fillRect(0, 0, 64, 64);
      });
      this.tex.push(glowT);
      const pts: number[] = [];
      for (let x = X0 - 40; x < landside; x += 22) pts.push(x, APRON + 18, -36);
      for (let x = X0 - 58; x < landside - 2; x += 10)
        pts.push(x, APRON + 0.3, -74, x, APRON + 0.3, -90);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      this.root.add(
        new THREE.Points(
          g,
          new THREE.PointsMaterial({
            map: glowT,
            size: 2.4,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            color: '#ffe8a8',
          }),
        ),
      );
    }
    // Planes: at the stands (nose-in, jet bridges to them) and one taxiing out.
    const L = 37;
    const liv = (n: number) => o.liveries[n % Math.max(1, o.liveries.length)] ?? '#0f766e';
    const stands: [number, string][] =
      o.mode === 'departures'
        ? [
            [0, liv(1)],
            [18, liv(2)],
          ]
        : [
            [0, o.livery],
            [18, liv(1)],
          ];
    for (const [x, livery] of stands) if (x < landside - 8) this.standPlane(x, livery, L);
    if (o.mode === 'departures') {
      if (o.kind === 'bizjet') {
        const jet = makePlane3D({ kind: 'bizjet', livery: o.livery, length: 20 });
        jet.root.position.set(46.9, APRON, GLASS - 14);
        jet.root.rotation.y = Math.PI;
        this.root.add(jet.root);
        // Its airstairs down from the door, a red carpet out to them.
        const k = new Kit();
        const { x, y, z } = JET_DOOR;
        const n = 8;
        for (let i = 0; i < n; i++)
          k.box(0.9, 0.06, 0.32, '#e5e7eb', x, APRON + (y * (n - 1 - i)) / n, z + 0.3 + i * 0.3, {
            metal: 0.4,
            rough: 0.4,
          });
        for (const sx of [-1, 1])
          k.box(0.05, 0.05, 2.7, '#9ca3af', x + sx * 0.45, APRON + y * 0.5 + 0.8, z + 1.35, {
            rx: Math.atan2(y, 2.5),
            metal: 0.6,
          });
        k.box(1.1, 0.02, 8, '#b91c1c', x, APRON + 0.01, z + 6.6, { noShadow: true });
        this.root.add(k.build());
      } else this.standPlane(37.2, o.livery, L, true);
    }
    const taxi = makePlane3D({ kind: 'airliner', livery: liv(3), length: 40 });
    this.taxiPlane = taxi.root;
    taxi.root.position.set(0, APRON, -48);
    this.root.add(taxi.root);
    if (o.mode === 'arrivals') this.kerb();
  }

  /** A plane nose-in at a stand, the jet bridge out to its front door. */
  private standPlane(x: number, livery: string, L: number, yours = false) {
    const p = makePlane3D({ kind: 'airliner', livery, length: L });
    p.root.rotation.y = -Math.PI / 2;
    const noseZ = GLASS - 7;
    p.root.position.set(x, APRON, noseZ - L / 2);
    p.root.traverse((m) => ((m as THREE.Mesh).castShadow = false));
    this.root.add(p.root);
    // The jet bridge: from the wall to the door on the plane's left (+x) side.
    const r = 0.052 * L;
    const doorX = x + r + 0.15;
    const doorZ = noseZ - 4.2;
    const doorY = APRON + 0.13 * L - r * 0.45;
    const fromX = x + 4.4;
    const fromZ = GLASS - 0.3;
    const dx = doorX + 1.3 - fromX;
    const dz = doorZ - fromZ;
    const len = Math.hypot(dx, dz);
    const k = new Kit();
    // A tunnel along its own z: walls with a window strip, a roof.
    const grey = '#d6dadf';
    k.box(2.4, 0.2, len, '#9aa1aa', 0, -0.2, -len / 2);
    for (const sx of [-1, 1]) {
      k.box(0.1, 1.0, len, grey, sx * 1.15, 0, -len / 2);
      k.box(0.08, 0.7, len, '#1e3a5f', sx * 1.15, 1.0, -len / 2, { rough: 0.15, metal: 0.4 });
      k.box(0.1, 0.8, len, grey, sx * 1.15, 1.7, -len / 2);
    }
    k.box(2.4, 0.16, len, '#bfc5cc', 0, 2.5, -len / 2);
    // The cab at the door, and the legs to its wheels.
    k.box(2.8, 2.8, 2.2, '#c3c8cf', 0, -0.2, -len - 0.6, { round: 0.06 });
    k.box(0.3, Math.max(0.5, -APRON + doorY - 0.2), 0.3, '#4b5563', 0, APRON - doorY, -len * 0.7);
    k.box(1.6, 0.5, 0.5, '#1f2937', 0, APRON - doorY, -len * 0.7);
    const bridge = k.build();
    bridge.position.set(fromX, 0, fromZ);
    bridge.rotation.order = 'YXZ';
    bridge.rotation.y = Math.atan2(-dx, -dz);
    bridge.rotation.x = Math.atan2(doorY, len) * 0.9;
    bridge.traverse((m) => ((m as THREE.Mesh).castShadow = false));
    this.root.add(bridge);
    if (yours) this.bridgeDoor = new THREE.Vector3(fromX, 0, fromZ);
  }
  private bridgeDoor = new THREE.Vector3(41.6, 0, GLASS);

  /** Arrivals: the kerb outside the hall's landside end: taxis, a canopy, the car park. */
  private kerb() {
    const o = this.o;
    const k = new Kit();
    const x0 = 27;
    const w = X1 + 40 - x0;
    const cx = x0 + w / 2;
    // A wing of the building between the apron and the kerb.
    k.box(4, CEIL - APRON + 1, 70, '#cfd6de', x0 + 1.5, APRON, GLASS - 35);
    k.box(w, 0.12, 4, '#d1d5db', cx, -0.12, GLASS - 2.2);
    k.box(w, 0.04, 12, '#3f4249', cx, -0.16, GLASS - 10, { noShadow: true });
    for (let x = x0 + 4; x < X1 + 38; x += 4.5)
      k.box(2.2, 0.01, 0.14, '#f8fafc', x, -0.12, GLASS - 10, { noShadow: true });
    k.box(w, 0.06, 0.25, '#facc15', cx, -0.12, GLASS - 4.2, { noShadow: true });
    // The canopy over the pavement on slim columns.
    k.box(w, 0.3, 5.5, '#e5e7eb', cx, 3.6, GLASS - 2.8);
    for (let x = x0 + 5; x < X1 + 38; x += 8) k.cyl(0.12, 0.12, 3.6, '#94a3b8', x, 0, GLASS - 5);
    // The car park and the city beyond.
    k.box(w, 9, 18, '#9ca3af', cx, -0.16, GLASS - 34);
    for (let j = 0; j < 3; j++)
      k.box(w, 0.25, 0.2, '#6b7280', cx, 2.6 + j * 3, GLASS - 24.9, { noShadow: true });
    for (let n = 0; n < 7; n++) {
      const h = 18 + ((n * 37) % 22);
      k.box(9, h, 9, o.night ? '#1f2440' : '#b6bec9', x0 + 4 + n * 10, -0.16, GLASS - 62, {
        noShadow: true,
      });
    }
    // A taxi-rank sign on a post.
    k.box(0.1, 2.4, 0.1, '#334155', 33, -0.12, GLASS - 4.6);
    this.root.add(k.build());
    const rank = new THREE.Mesh(
      new THREE.PlaneGeometry(1.4, 0.45),
      this.signMat('TAXIS', '#facc15', '#111827'),
    );
    rank.position.set(33, 2.5, GLASS - 4.55);
    this.root.add(rank);
    // Taxis at the rank (the CC0 cars, once they've arrived).
    this.root.add(this.carGroup);
    const put = () => {
      if (this.disposed) return;
      const cars: [CarModel, string, number, number][] = [
        ['Taxi', o.taxi ?? '#facc15', 32, GLASS - 7.2],
        ['Taxi', o.taxi ?? '#facc15', 37.4, GLASS - 7.2],
        ['Taxi', o.taxi ?? '#facc15', 42.8, GLASS - 7.2],
        ['NormalCar1', '#1e293b', 35, GLASS - 11.6],
        ['SUV', '#f8fafc', 44, GLASS - 12.4],
      ];
      for (const [m, paint, x, z] of cars) {
        const car = carModel(m, paint, 4.6);
        if (!car) continue;
        car.position.set(x, -0.16, z);
        car.rotation.y = z < GLASS - 10 ? -Math.PI / 2 : Math.PI / 2;
        this.carGroup.add(car);
      }
      this.stage.invalidate();
    };
    void loadCars().then(put);
  }

  // ------------------------------------------------------------------ helpers

  private signMat(text: string, bg: string, fg: string, w = 512, h = 160) {
    const t = canvasTexture(w, h, (g) => {
      g.fillStyle = bg;
      g.fillRect(0, 0, w, h);
      g.fillStyle = fg;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      fitText(g, text, w / 2, h / 2 + 4, w - 30, Math.round(h * 0.55));
    });
    this.tex.push(t);
    return new THREE.MeshStandardMaterial({
      map: t,
      emissive: '#ffffff',
      emissiveMap: t,
      emissiveIntensity: 0.55,
      roughness: 0.4,
    });
  }

  /** A sign hanging from the ceiling on two rods: white on navy. */
  private hangingSign(
    group: THREE.Group,
    text: string,
    x: number,
    z: number,
    w: number,
    o: { bg?: string; fg?: string; y?: number; icon?: string } = {},
  ) {
    const y = o.y ?? 3.3;
    const h = 0.42;
    const label = o.icon ? `${o.icon}  ${text}` : text;
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.08), [
      mat('#0f172a'),
      mat('#0f172a'),
      mat('#0f172a'),
      mat('#0f172a'),
      this.signMat(label, o.bg ?? '#1e3a8a', o.fg ?? '#f8fafc', 768, Math.round((768 * h) / w)),
      mat('#0f172a'),
    ]);
    m.position.set(x, y, z);
    group.add(m);
    const k = new Kit();
    for (const sx of [-1, 1])
      k.box(0.025, CEIL - y - h / 2, 0.025, '#64748b', x + sx * (w / 2 - 0.2), y + h / 2, z);
    group.add(k.build());
  }

  /** A floating name over a friend's head. */
  private nameTag(name: string, bg = 'rgba(15,23,42,0.86)', fg = '#facc15') {
    const t = canvasTexture(256, 80, (g) => {
      g.fillStyle = bg;
      const r = 30;
      g.beginPath();
      g.roundRect(4, 8, 248, 64, r);
      g.fill();
      g.fillStyle = fg;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      fitText(g, name, 128, 42, 220, 40);
    });
    this.tex.push(t);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false }));
    s.scale.set(0.62, 0.2, 1);
    s.position.y = 2.08;
    s.renderOrder = 5;
    return s;
  }

  private staff(area: Area, look: AvatarLook, spot: Spot, id: string, hold = false) {
    const c = makeCharacter(look, id);
    this.group(area).add(c.root);
    const list = this.people.get(area) ?? [];
    list.push({ c, spot, n: list.length, hold });
    this.people.set(area, list);
    return c;
  }

  private group(area: Area) {
    let g = this.areas.get(area);
    if (!g) {
      g = new THREE.Group();
      g.name = area;
      this.areas.set(area, g);
    }
    return g;
  }

  /** People walking through an area pulling their bags. */
  private strollersIn(area: Area, n: number, x0: number, span: number, zs: number[]) {
    const g = this.group(area);
    const rnd = seeded(fnv(`${this.o.seed}:${area}:walk`));
    const list: Stroller[] = [];
    for (let i = 0; i < n; i++) {
      const look = travellerLook(`${this.o.seed}:${area}:w${i}`, this.o.city);
      this.walkerLooks.push(look);
      const w = makeWalker(look);
      g.add(w.root);
      const kind: BagKind = (['case', 'cabin', 'pack', 'case'] as const)[i % 4]!;
      const bag = new THREE.Mesh(bagGeometry(kind), crowdMaterial(0.45));
      (bag.material as THREE.MeshStandardMaterial).color.set(
        BAG_COLOURS[(i * 3) % BAG_COLOURS.length]!,
      );
      bag.castShadow = true;
      if (kind === 'pack') {
        bag.position.set(0, 1.0, -0.2);
        w.root.add(bag);
      } else {
        bag.rotation.x = -0.35;
        g.add(bag);
      }
      list.push({
        w,
        bag,
        z: zs[i % zs.length]!,
        speed: (i % 2 ? -1 : 1) * (1.1 + rnd() * 0.4),
        x0,
        span,
        phase: rnd() * span,
      });
    }
    this.strollers.set(area, list);
  }

  // ------------------------------------------------------------------ departures

  private deskArea() {
    const o = this.o;
    const g = this.group('desk');
    const k = new Kit();
    const liv = o.livery;
    const wood = '#e7e2d6';
    // The ticket desk (left), then the check-in island under the airline's panel.
    const desk = (x: number, z: number, w: number) => {
      k.box(w, 1.02, 0.7, wood, x, 0, z, { round: 0.03 });
      k.box(w + 0.06, 0.05, 0.78, '#f8fafc', x, 1.02, z, { rough: 0.3 });
      k.box(w, 0.12, 0.02, liv, x, 0.82, z + 0.36, { emissive: liv, emissiveIntensity: 0.25 });
      // A monitor on its arm, facing the agent.
      k.box(0.46, 0.3, 0.04, '#111827', x - w * 0.2, 1.22, z - 0.1, { ry: 0.2 });
      k.cyl(0.02, 0.02, 0.15, '#374151', x - w * 0.2, 1.07, z - 0.08);
    };
    desk(-6.6, -2.2, 2.2);
    const counters = [-2.6, 0.6, 3.8];
    for (const x of counters) {
      desk(x, -2.2, 1.5);
      // The scale beside it, the belt taking bags away behind.
      k.box(0.8, 0.32, 0.75, '#6b7280', x + 1.18, 0, -2.2, { round: 0.02 });
      k.box(0.72, 0.03, 0.66, '#cbd5e1', x + 1.18, 0.32, -2.2, { metal: 0.6, rough: 0.3 });
      k.box(0.8, 0.5, 1.6, '#475569', x + 1.18, 0, -3.35);
      k.box(0.7, 0.04, 1.6, '#111827', x + 1.18, 0.5, -3.35);
    }
    // The island's back panel (the airline's colour), and the ticket desk's.
    k.box(11.2, 2.5, 0.25, '#1f2937', 1.6, 0, -4.25);
    k.box(3.2, 2.5, 0.25, '#1f2937', -6.6, 0, -3.4);
    // Queue: stanchions with their belts in front of the island.
    const posts: [number, number][] = [];
    for (let x = -3.4; x <= 5.4; x += 1.1) posts.push([x, -0.6], [x, 0.7]);
    for (const [x, z] of posts) {
      k.cyl(0.035, 0.035, 0.95, '#cbd5e1', x, 0, z, { metal: 0.8, rough: 0.25 });
      k.cyl(0.16, 0.18, 0.04, '#64748b', x, 0, z, { metal: 0.6 });
    }
    for (const z of [-0.6, 0.7]) k.box(8.8, 0.05, 0.015, '#1d4ed8', 1.0, 0.86, z);
    // Planters and a bench at the side.
    for (const [x, z] of [
      [-9.0, 1.4],
      [7.6, -3.6],
    ] as const) {
      k.cyl(0.42, 0.34, 0.6, '#57534e', x, 0, z);
      k.sphere(0.55, '#3f7d3a', x, 0.95, z, { sy: 0.8 });
      k.sphere(0.4, '#4d9145', x + 0.2, 1.3, z - 0.1);
    }
    g.add(k.build());
    // The panels' faces: the airline's name in its colour.
    const panel = (w: number, x: number, z: number, text: string, sub: string) => {
      const t = canvasTexture(1024, Math.round((1024 * 2.3) / w), (c) => {
        const W = c.canvas.width;
        const H = c.canvas.height;
        const gr = c.createLinearGradient(0, 0, W, 0);
        gr.addColorStop(0, liv);
        gr.addColorStop(1, new THREE.Color(liv).multiplyScalar(0.55).getStyle());
        c.fillStyle = gr;
        c.fillRect(0, 0, W, H);
        c.fillStyle = 'rgba(255,255,255,0.12)';
        for (let i = 0; i < 6; i++) c.fillRect(W * 0.62 + i * 40, 0, 14, H);
        c.fillStyle = '#ffffff';
        c.textAlign = 'left';
        c.textBaseline = 'middle';
        fitText(c, text, 40, H * 0.3, W * 0.6, Math.round(H * 0.2), 900);
        c.fillStyle = 'rgba(255,255,255,0.8)';
        fitText(c, sub, 40, H * 0.52, W * 0.6, Math.round(H * 0.09), 700);
      });
      this.tex.push(t);
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(w - 0.1, 2.3),
        new THREE.MeshStandardMaterial({
          map: t,
          emissive: '#ffffff',
          emissiveMap: t,
          emissiveIntensity: 0.35,
          roughness: 0.5,
        }),
      );
      m.position.set(x, 1.3, z);
      g.add(m);
    };
    panel(11.2, 1.6, -4.11, o.airline || 'Check-in', `Check-in · ${o.toName}`);
    panel(3.2, -6.6, -3.26, 'Tickets', o.airline || '');
    // Over each counter: its number and where it's checking in for.
    counters.forEach((x, n) => {
      const s = new THREE.Mesh(
        new THREE.PlaneGeometry(1.4, 0.36),
        this.signMat(
          n === 1 ? `${n + 1}  ${o.toName}` : `${n + 1}  ${n ? 'Bag drop' : 'Check-in'}`,
          '#0b1220',
          '#fde68a',
        ),
      );
      s.position.set(x, 2.15, -2.75);
      g.add(s);
    });
    this.hangingSign(g, 'Tickets', -6.6, -1.6, 1.8, { bg: '#0b1220', fg: '#fde68a', y: 3.0 });
    // The departures screen on its stand.
    if (o.fids?.length) {
      const rows = o.fids.slice(0, 7);
      const t = canvasTexture(1024, 640, (c) => {
        c.fillStyle = '#05070d';
        c.fillRect(0, 0, 1024, 640);
        c.fillStyle = '#1e3a8a';
        c.fillRect(0, 0, 1024, 84);
        c.fillStyle = '#f8fafc';
        c.textBaseline = 'middle';
        c.font = `900 46px ${FONT}`;
        c.fillText('Departures', 28, 44);
        rows.forEach((r, i) => {
          const y = 128 + i * 74;
          c.fillStyle = i % 2 ? '#0b1020' : '#0e1529';
          c.fillRect(0, y - 37, 1024, 74);
          c.fillStyle = '#fde68a';
          c.font = `700 40px ui-monospace, Menlo, monospace`;
          c.fillText(r[0] ?? '', 24, y);
          c.fillStyle = '#e2e8f0';
          c.fillText(r[1] ?? '', 170, y);
          c.font = `800 40px ${FONT}`;
          fitText(c, r[2] ?? '', 380, y, 360, 40);
          c.fillStyle = '#fde68a';
          c.fillText(r[3] ?? '', 760, y);
          const st = r[4] ?? '';
          c.fillStyle = /board/i.test(st) ? '#4ade80' : /delay/i.test(st) ? '#f87171' : '#cbd5e1';
          fitText(c, st, 850, y, 160, 34, 700);
        });
      });
      this.tex.push(t);
      const scr = new THREE.Mesh(
        new THREE.PlaneGeometry(1.9, 1.19),
        new THREE.MeshBasicMaterial({ map: t, toneMapped: false }),
      );
      scr.position.set(6.4, 2.25, -1.0);
      scr.rotation.y = -0.45;
      g.add(scr);
      const sk = new Kit();
      sk.box(2.02, 1.3, 0.08, '#111827', 0, -0.65, -0.05);
      sk.box(0.12, 1.6, 0.12, '#374151', 0, -2.25, -0.06);
      sk.box(0.7, 0.04, 0.5, '#374151', 0, -2.25, -0.06);
      const stand = sk.build();
      stand.position.copy(scr.position);
      stand.rotation.y = scr.rotation.y;
      g.add(stand);
    }
    // The agents behind their desks, in the airline's colour.
    const agentLook = (n: number) => uniformLook(`${o.seed}:agent${n}`, 'agent', liv);
    this.staff('desk', agentLook(9), { x: -6.6, z: -2.85, ry: 0, pose: 'idle' }, 'agent:t');
    counters.forEach((x, n) =>
      this.staff(
        'desk',
        agentLook(n),
        { x, z: -2.85, ry: 0, pose: n === 1 ? 'chat' : 'idle' },
        `agent:${n}`,
      ),
    );
    this.strollersIn('desk', 2, -9, 18, [1.9]);
  }

  private securityArea() {
    const g = this.group('security');
    const o = this.o;
    const k = new Kit();
    // Frosted partitions either side.
    for (const x of [11.2, 24.8])
      k.box(0.08, 2.4, 6.5, '#e0f2fe', x, 0, -1.6, { opacity: 0.45, rough: 0.2, noShadow: true });
    const lane = (z: number) => {
      // Rollers in, the X-ray tunnel, rollers out.
      k.box(2.8, 0.08, 0.7, '#9ca3af', 14.9, 0.72, z, { metal: 0.6, rough: 0.35 });
      for (let x = 13.6; x <= 16.2; x += 0.18)
        k.cyl(0.03, 0.03, 0.66, '#d1d5db', x, 0.8, z, {
          rx: Math.PI / 2,
          seg: 8,
          metal: 0.7,
          rough: 0.3,
        });
      for (const sx of [13.6, 16.2]) k.box(0.06, 0.72, 0.6, '#4b5563', sx, 0, z);
      k.box(2.0, 1.55, 1.1, '#cbd5e1', 17.3, 0, z, { round: 0.08 });
      k.box(2.02, 0.2, 1.12, '#1e3a8a', 17.3, 1.0, z);
      k.box(0.02, 0.6, 0.66, '#0b0f17', 16.29, 0.72, z, { noShadow: true });
      k.box(0.02, 0.6, 0.66, '#0b0f17', 18.31, 0.72, z, { noShadow: true });
      k.box(3.2, 0.08, 0.7, '#9ca3af', 19.9, 0.72, z, { metal: 0.6, rough: 0.35 });
      for (let x = 18.4; x <= 21.4; x += 0.18)
        k.cyl(0.03, 0.03, 0.66, '#d1d5db', x, 0.8, z, {
          rx: Math.PI / 2,
          seg: 8,
          metal: 0.7,
          rough: 0.3,
        });
      k.box(0.06, 0.72, 0.6, '#4b5563', 21.4, 0, z);
      // The operator's screen.
      k.box(0.6, 0.06, 0.5, '#374151', 17.3, 1.1, z + 0.85);
      k.box(0.5, 0.36, 0.04, '#111827', 17.3, 1.16, z + 0.98, { rx: -0.3 });
      // The walk-through arch beside it.
      const ax = 18.9;
      const az = z + 1.45;
      for (const sz of [-0.5, 0.5])
        k.box(0.14, 2.1, 0.5, '#e5e7eb', ax, 0, az + sz, { round: 0.03 });
      k.box(0.3, 0.28, 1.2, '#cbd5e1', ax, 2.1, az, { round: 0.04 });
    };
    lane(-2.75);
    lane(-4.6 + 0.3);
    // Trays stacked at the start, grey tubs on the rollers.
    for (let j = 0; j < 6; j++) k.box(0.62, 0.1, 0.42, '#6b7280', 13.0, 0.72 + j * 0.1, -1.7);
    k.box(0.7, 0.72, 0.5, '#9ca3af', 13.0, 0, -1.7);
    for (const x of [14.2, 15.4, 20.4]) k.box(0.62, 0.1, 0.42, '#6b7280', x, 0.88, -2.75);
    g.add(k.build());
    // The arch's lamp: red, then green as you pass.
    this.archLamp = mat('#ef4444', { emissive: '#ef4444', emissiveIntensity: 1.2, own: true });
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 8), this.archLamp);
    lamp.position.set(18.9, 2.42, -1.3);
    g.add(lamp);
    // Your tray, with your bag in it, rides through the tunnel.
    this.tray = new THREE.Group();
    const tub = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.1, 0.42), mat('#6b7280'));
    tub.position.y = 0.05;
    const bag = new THREE.Mesh(bagGeometry('cabin'), crowdMaterial(0.4));
    (bag.material as THREE.MeshStandardMaterial).color.set('#f59e0b');
    bag.rotation.z = Math.PI / 2;
    bag.scale.setScalar(0.7);
    bag.position.set(0.25, 0.22, 0);
    this.tray.add(tub, bag);
    this.tray.position.set(14.0, 0.88, -2.75);
    g.add(this.tray);
    this.hangingSign(g, 'Security', 18, -0.4, 2.4);
    const officer = (n: number) => uniformLook(`${o.seed}:sec${n}`, 'security');
    this.staff('security', officer(0), { x: 19.9, z: -2.0, ry: -1.9, pose: 'idle' }, 'sec:0');
    this.staff('security', officer(1), { x: 17.3, z: -1.55, ry: Math.PI, pose: 'idle' }, 'sec:1');
    this.staff('security', officer(2), { x: 19.6, z: -2.4, ry: -1.6, pose: 'chat' }, 'sec:2');
    this.strollersIn('security', 1, 12, 12, [1.0]);
  }

  private gateArea() {
    const g = this.group('gate');
    const o = this.o;
    const k = new Kit();
    // Rows of beam seating facing into the hall.
    const seat = (x: number, z: number, n: number) => {
      const w = 0.58;
      k.box(n * w + 0.1, 0.05, 0.08, '#9ca3af', x, 0.3, z - 0.05, { metal: 0.7, rough: 0.3 });
      for (const sx of [-1, 1]) {
        k.box(0.06, 0.3, 0.5, '#6b7280', x + (sx * (n * w)) / 2, 0, z, { metal: 0.6 });
        k.box(0.5, 0.03, 0.5, '#6b7280', x + (sx * (n * w)) / 2, 0, z, { metal: 0.6 });
      }
      for (let i = 0; i < n; i++) {
        const sx = x - (n * w) / 2 + w / 2 + i * w;
        k.box(0.52, 0.08, 0.48, '#1e293b', sx, 0.38, z + 0.02, { round: 0.03, rough: 0.5 });
        k.box(0.52, 0.5, 0.07, '#1e293b', sx, 0.48, z - 0.24, {
          round: 0.03,
          rough: 0.5,
          rx: -0.12,
        });
        if (i < n - 1) k.box(0.04, 0.2, 0.36, '#9ca3af', sx + w / 2, 0.5, z, { metal: 0.7 });
      }
    };
    for (const z of [-3.1, -0.7]) for (const x of [29.6, 32.2, 34.8]) seat(x, z, 4);
    // The gate desk and its screen.
    k.box(1.8, 1.05, 0.7, '#e7e2d6', 39.6, 0, -3.0, { round: 0.03 });
    k.box(1.86, 0.05, 0.78, '#f8fafc', 39.6, 1.05, -3.0);
    k.box(0.1, 2.1, 0.1, '#374151', 38.4, 0, -3.5);
    // The door to the bridge, framed, in the glass.
    const dx = this.bridgeDoor.x;
    for (const sx of [-1, 1]) k.box(0.15, 2.5, 0.3, '#334155', dx + sx * 0.75, 0, GLASS + 0.05);
    k.box(1.65, 0.5, 0.3, '#334155', dx, 2.5, GLASS + 0.05);
    // A rope line to the door.
    for (const x of [39.0, 40.2, 41.4])
      k.cyl(0.035, 0.035, 0.95, '#cbd5e1', x, 0, -1.6, { metal: 0.8, rough: 0.25 });
    k.box(2.4, 0.05, 0.015, '#b91c1c', 40.2, 0.86, -1.6);
    // A vending machine, a plant.
    k.box(0.9, 1.9, 0.75, '#dc2626', 45.3, 0, -3.8, { round: 0.04 });
    k.box(0.6, 1.0, 0.02, '#fecaca', 45.2, 0.75, -3.42, {
      emissive: '#fde68a',
      emissiveIntensity: 0.3,
    });
    k.cyl(0.4, 0.32, 0.6, '#57534e', 27.9, 0, -4.0);
    k.sphere(0.55, '#3f7d3a', 27.9, 0.95, -4.0, { sy: 0.85 });
    g.add(k.build());
    const gateTxt = new THREE.Mesh(
      new THREE.PlaneGeometry(1.5, 0.75),
      (() => {
        const t = canvasTexture(512, 256, (c) => {
          c.fillStyle = '#05070d';
          c.fillRect(0, 0, 512, 256);
          c.fillStyle = '#1e3a8a';
          c.fillRect(0, 0, 512, 70);
          c.fillStyle = '#f8fafc';
          c.textBaseline = 'middle';
          c.font = `900 50px ${FONT}`;
          c.fillText(`Gate ${o.gate}`, 22, 37);
          c.fillStyle = '#fde68a';
          fitText(c, o.toName, 22, 120, 460, 64, 900);
          c.fillStyle = '#e2e8f0';
          c.font = `700 40px ${FONT}`;
          c.fillText(`${o.flight ?? ''}  ${o.time ?? ''}`, 22, 196);
          c.fillStyle = '#4ade80';
          c.textAlign = 'right';
          c.fillText('Boarding', 494, 196);
        });
        this.tex.push(t);
        return new THREE.MeshBasicMaterial({ map: t, toneMapped: false });
      })(),
    );
    gateTxt.position.set(38.4, 2.4, -3.42);
    g.add(gateTxt);
    const doorSign = new THREE.Mesh(
      new THREE.PlaneGeometry(1.2, 0.36),
      this.signMat(o.gate, '#0b1220', '#fde68a'),
    );
    doorSign.position.set(dx, 2.75, GLASS + 0.22);
    g.add(doorSign);
    this.staff(
      'gate',
      uniformLook(`${o.seed}:gate`, 'agent', o.livery),
      { x: 39.6, z: -3.62, ry: 0, pose: 'idle' },
      'gate:agent',
    );
    this.staff(
      'gate',
      uniformLook(`${o.seed}:crew`, 'crew', o.livery),
      { x: 40.5, z: -4.55, ry: 0.5, pose: 'idle' },
      'gate:crew',
    );
    this.strollersIn('gate', 2, 28, 18, [-4.55]);
  }

  // ------------------------------------------------------------------ arrivals

  private passportArea() {
    const g = this.group('passport');
    const o = this.o;
    const k = new Kit();
    const booths = [-3, 0, 3];
    for (const x of booths) {
      k.box(1.5, 1.1, 0.8, '#cbd5e1', x, 0, -2.2, { round: 0.03 });
      k.box(1.56, 0.05, 0.86, '#64748b', x, 1.1, -2.2);
      k.box(1.5, 0.75, 0.04, '#dbeafe', x, 1.15, -2.0, {
        opacity: 0.35,
        rough: 0.05,
        noShadow: true,
      });
      k.box(0.1, 2.3, 1.6, '#94a3b8', x + 0.8, 0, -2.7);
      k.box(0.06, 2.4, 0.06, '#334155', x - 0.6, 0, -1.75);
    }
    // E-gates.
    for (const x of [5.6, 6.8, 8.0]) {
      k.box(0.3, 1.0, 1.4, '#e5e7eb', x, 0, -2.2, { round: 0.04 });
      k.box(0.22, 0.14, 0.3, '#0f172a', x, 1.0, -1.7);
      k.box(0.02, 0.7, 0.5, '#bae6fd', x + 0.6, 0.3, -2.2, { opacity: 0.5, noShadow: true });
    }
    // The queue's maze.
    for (let x = -8.4; x <= -1.6; x += 1.1)
      for (const z of [-0.5, 0.7, 1.9]) {
        k.cyl(0.035, 0.035, 0.95, '#cbd5e1', x, 0, z, { metal: 0.8, rough: 0.25 });
        k.cyl(0.16, 0.18, 0.04, '#64748b', x, 0, z, { metal: 0.6 });
      }
    for (const z of [-0.5, 0.7, 1.9]) k.box(6.8, 0.05, 0.015, '#1d4ed8', -5.0, 0.86, z);
    g.add(k.build());
    // The booths' numbers and lamps.
    booths.forEach((x, n) => {
      const s = new THREE.Mesh(
        new THREE.PlaneGeometry(0.42, 0.42),
        this.signMat(String(n + 1), '#1e3a8a', '#ffffff', 128, 128),
      );
      s.position.set(x - 0.6, 2.25, -1.71);
      g.add(s);
      const l = new THREE.Mesh(
        new THREE.SphereGeometry(0.06, 10, 8),
        mat(n === 2 ? '#ef4444' : '#22c55e', {
          emissive: n === 2 ? '#ef4444' : '#22c55e',
          emissiveIntensity: 1.4,
        }),
      );
      l.position.set(x - 0.6, 2.55, -1.71);
      g.add(l);
    });
    this.hangingSign(g, 'Passport control', 0, -0.6, 3.2);
    this.hangingSign(g, 'e-Passport gates', 6.8, -0.9, 2.4, { y: 3.0 });
    booths.forEach((x, n) =>
      this.staff(
        'passport',
        uniformLook(`${o.city}:officer${n}`, 'officer'),
        { x, z: -2.85, ry: 0, pose: n === 1 ? 'read' : 'type', seat: 0.62 },
        `officer:${n}`,
      ),
    );
  }

  private baggageArea() {
    const g = this.group('baggage');
    const o = this.o;
    const cx = 18;
    const cz = -1.9;
    const half = 2.4;
    const R = 1.3;
    const stadium = (r: number) => {
      const s = new THREE.Shape();
      s.moveTo(-half, -r);
      s.lineTo(half, -r);
      s.absarc(half, 0, r, -Math.PI / 2, Math.PI / 2, false);
      s.lineTo(-half, r);
      s.absarc(-half, 0, r, Math.PI / 2, (Math.PI * 3) / 2, false);
      return s;
    };
    const ext = (sh: THREE.Shape, h: number) => {
      const e = new THREE.ExtrudeGeometry(sh, { depth: h, bevelEnabled: false, curveSegments: 18 });
      e.rotateX(-Math.PI / 2);
      return e;
    };
    const skirt = new THREE.Mesh(ext(stadium(R), 0.4), mat('#3f3f46', { rough: 0.5, metal: 0.5 }));
    const ring = stadium(R);
    ring.holes.push(stadium(R - 0.62));
    const beltM = mat('#18181b', { rough: 0.85 });
    const belt = new THREE.Mesh(ext(ring, 0.02), beltM);
    belt.position.y = 0.4;
    const island = new THREE.Mesh(
      ext(stadium(R - 0.66), 0.62),
      mat('#a1a1aa', { rough: 0.3, metal: 0.8 }),
    );
    const lip = new THREE.Mesh(
      ext(stadium(R + 0.04), 0.06),
      mat('#d4d4d8', { rough: 0.3, metal: 0.8 }),
    );
    lip.position.y = 0.36;
    for (const m of [skirt, belt, island, lip]) {
      m.position.x = cx;
      m.position.z = cz;
      m.receiveShadow = true;
      m.castShadow = m !== belt;
      g.add(m);
    }
    // The chute from the wall, the belt's screen on its post.
    const k = new Kit();
    k.box(1.0, 0.08, 1.6, '#71717a', cx - 1.6, 0.95, cz - 0.15, {
      rx: 0.5,
      metal: 0.6,
      rough: 0.35,
    });
    k.box(1.4, 1.5, 0.6, '#52525b', cx - 1.6, 0.6, cz - 0.95, { round: 0.04 });
    k.box(1.1, 0.7, 0.04, '#111827', cx - 1.6, 0.66, cz - 0.64, { noShadow: true });
    k.box(0.1, 2.4, 0.1, '#334155', cx + 2.6, 0, -3.6);
    // Trolleys waiting.
    for (const [x, z, ry] of [
      [14.0, 0.6, 0.4],
      [21.6, 0.9, -0.3],
      [13.2, -3.6, 1.2],
    ] as const) {
      const tk = new Kit();
      tk.box(0.55, 0.04, 0.9, '#9ca3af', 0, 0.28, 0, { metal: 0.8, rough: 0.3 });
      tk.box(0.55, 0.5, 0.03, '#9ca3af', 0, 0.3, -0.44, { metal: 0.8, rough: 0.3 });
      tk.box(0.55, 0.03, 0.03, '#374151', 0, 1.0, -0.5);
      for (const sx of [-1, 1]) {
        tk.box(0.03, 0.75, 0.03, '#9ca3af', sx * 0.27, 0.28, -0.48, { metal: 0.8 });
        for (const sz of [-1, 1])
          tk.cyl(0.06, 0.06, 0.04, '#111827', sx * 0.22, 0.04, sz * 0.36, { rz: Math.PI / 2 });
      }
      const tr = tk.build();
      tr.position.set(x, 0, z);
      tr.rotation.y = ry;
      g.add(tr);
    }
    g.add(k.build());
    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(1.3, 0.62),
      (() => {
        const t = canvasTexture(512, 244, (c) => {
          c.fillStyle = '#05070d';
          c.fillRect(0, 0, 512, 244);
          c.fillStyle = '#fbbf24';
          c.textBaseline = 'middle';
          c.font = `900 64px ${FONT}`;
          c.fillText(`Belt ${o.belt ?? 3}`, 22, 60);
          c.fillStyle = '#fde68a';
          fitText(c, o.beltLine ?? '', 22, 150, 470, 44, 800);
          c.fillStyle = '#4ade80';
          c.font = `700 34px ${FONT}`;
          c.fillText('Bags arriving', 22, 210);
        });
        this.tex.push(t);
        return new THREE.MeshBasicMaterial({ map: t, toneMapped: false });
      })(),
    );
    screen.position.set(cx + 2.6, 2.55, -3.53);
    g.add(screen);
    this.hangingSign(g, 'Baggage reclaim', 16.2, 0.2, 2.8);
    // Everyone's bags on the belt (moved round each frame).
    const rnd = seeded(fnv(`${o.seed}:belt`));
    const at: { k: number; kind: number; n: number }[] = [];
    const per = BAG_KINDS.map(() => 0);
    for (let i = 0; i < 13; i++) {
      const kind = rnd() < 0.55 ? 0 : rnd() < 0.5 ? 1 : 2;
      at.push({ k: i / 13 + rnd() * 0.02, kind, n: per[kind]!++ });
    }
    const ims = BAG_KINDS.map((kind, v) => {
      const im = new THREE.InstancedMesh(
        bagGeometry(kind),
        crowdMaterial(0.45),
        Math.max(1, per[v]!),
      );
      im.count = per[v]!;
      im.castShadow = true;
      im.frustumCulled = false;
      const col = new THREE.Color();
      for (let j = 0; j < per[v]!; j++)
        im.setColorAt(j, col.set(BAG_COLOURS[(j * 3 + v) % BAG_COLOURS.length]!));
      g.add(im);
      return im;
    });
    this.belt = { im: ims, at };
    this.beltGeo = { cx, cz, half, r: R - 0.31 };
    this.strollersIn('baggage', 1, 11, 14, [-4.0]);
  }
  private beltGeo = { cx: 18, cz: -1.9, half: 2.4, r: 1 };

  /** A point on the belt's centre line, k (0–1) round it; and its heading. */
  private beltAt(k: number): { x: number; z: number; ry: number } {
    const { cx, cz, half, r } = this.beltGeo;
    const straight = half * 2;
    const arc = Math.PI * r;
    const total = 2 * straight + 2 * arc;
    let d = (((k % 1) + 1) % 1) * total;
    // Front straight (towards +x), right arc, back straight, left arc.
    if (d < straight) return { x: cx - half + d, z: cz + r, ry: Math.PI / 2 };
    d -= straight;
    if (d < arc) {
      const a = d / r;
      return { x: cx + half + Math.sin(a) * r, z: cz + Math.cos(a) * r, ry: Math.PI / 2 + a };
    }
    d -= arc;
    if (d < straight) return { x: cx + half - d, z: cz - r, ry: -Math.PI / 2 };
    d -= straight;
    const a = d / r;
    return { x: cx - half - Math.sin(a) * r, z: cz - Math.cos(a) * r, ry: -Math.PI / 2 + a };
  }

  private hallArea() {
    const g = this.group('hall');
    const o = this.o;
    const k = new Kit();
    // The barrier.
    for (let x = 33.4; x <= 40.6; x += 1.2)
      k.cyl(0.035, 0.035, 1.0, '#d1d5db', x, 0, -2.3, { metal: 0.8, rough: 0.25 });
    k.cyl(0.03, 0.03, 7.2, '#e5e7eb', 37.0, 1.0, -2.3, { rz: Math.PI / 2, metal: 0.8, rough: 0.2 });
    // The café (left): a counter, the machine, stools.
    k.box(2.6, 1.05, 0.8, '#7c2d12', 31.0, 0, -3.2, { round: 0.03 });
    k.box(2.66, 0.05, 0.86, '#e7e5e4', 31.0, 1.05, -3.2);
    k.box(0.5, 0.5, 0.45, '#9ca3af', 30.4, 1.1, -3.3, { metal: 0.7, rough: 0.3 });
    k.box(2.8, 2.6, 0.2, '#3f2a1d', 31.0, 0, -4.4);
    for (const x of [30.2, 31.0, 31.8]) {
      k.cyl(0.18, 0.18, 0.05, '#1c1917', x, 0.72, -2.4);
      k.cyl(0.03, 0.03, 0.72, '#a8a29e', x, 0, -2.4, { metal: 0.7 });
    }
    // The SIM kiosk (right).
    k.box(1.6, 1.05, 0.7, '#6d28d9', 42.6, 0, -3.3, { round: 0.04 });
    k.box(1.66, 0.05, 0.76, '#ede9fe', 42.6, 1.05, -3.3);
    k.box(1.8, 2.3, 0.15, '#4c1d95', 42.6, 0, -4.1);
    // The doors you came out of ('Nothing to declare'), and the way out to the taxis.
    for (const sx of [-1, 1])
      k.box(0.2, 2.6, 0.3, '#334155', 28.6 + sx * 1.2, 0, -1.2, { ry: Math.PI / 2 });
    k.box(0.3, 0.4, 2.6, '#16a34a', 28.6, 2.6, -1.2);
    k.box(0.06, 2.4, 2.2, '#e0f2fe', 28.6, 0, -1.2, { opacity: 0.4, noShadow: true });
    g.add(k.build());
    const cafe = new THREE.Mesh(
      new THREE.PlaneGeometry(1.8, 0.5),
      this.signMat('Café', '#3f2a1d', '#fde68a'),
    );
    cafe.position.set(31.0, 2.3, -4.29);
    g.add(cafe);
    const sim = new THREE.Mesh(
      new THREE.PlaneGeometry(1.5, 0.45),
      this.signMat('SIM cards', '#4c1d95', '#faf5ff'),
    );
    sim.position.set(42.6, 1.9, -4.02);
    g.add(sim);
    const ntd = new THREE.Mesh(
      new THREE.PlaneGeometry(2.4, 0.34),
      this.signMat('Nothing to declare', '#16a34a', '#f0fdf4'),
    );
    ntd.position.set(28.76, 2.8, -1.2);
    ntd.rotation.y = Math.PI / 2;
    g.add(ntd);
    this.hangingSign(g, 'Taxis · Rides', 42.6, -0.4, 2.4, { bg: '#facc15', fg: '#111827' });
    // Drivers at the barrier holding up name boards; yours with your name.
    const xs = [34.0, 35.5, 37.0, 38.5];
    const boards = o.boards ?? [];
    xs.forEach((x, n) => {
      const mine = n === 2 && !!o.sign;
      const c = this.staff(
        'hall',
        uniformLook(`${o.city}:driver${n}`, 'driver'),
        { x, z: -3.0, ry: 0, pose: 'idle' },
        `driver:${n}`,
        true,
      );
      const w = mine ? 1.15 : 0.72;
      const h = mine ? 0.58 : 0.38;
      const t = canvasTexture(512, Math.round((512 * h) / w), (cx) => {
        const W = cx.canvas.width;
        const H = cx.canvas.height;
        cx.fillStyle = '#ffffff';
        cx.fillRect(0, 0, W, H);
        cx.strokeStyle = mine ? '#0f766e' : '#cbd5e1';
        cx.lineWidth = mine ? 14 : 6;
        cx.strokeRect(7, 7, W - 14, H - 14);
        cx.textAlign = 'center';
        cx.textBaseline = 'middle';
        if (mine && o.sign) {
          cx.fillStyle = '#334155';
          fitText(cx, o.sign.hotel, W / 2, H * 0.3, W - 50, Math.round(H * 0.2), 700);
          cx.fillStyle = '#0f766e';
          fitText(cx, o.sign.name, W / 2, H * 0.66, W - 50, Math.round(H * 0.34), 900);
        } else {
          cx.fillStyle = '#111827';
          fitText(cx, boards[n] ?? 'Welcome', W / 2, H / 2 + 2, W - 40, Math.round(H * 0.42), 800);
        }
      });
      this.tex.push(t);
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.01), [
        mat('#e5e7eb'),
        mat('#e5e7eb'),
        mat('#e5e7eb'),
        mat('#e5e7eb'),
        new THREE.MeshStandardMaterial({ map: t, roughness: 0.6 }),
        mat('#e5e7eb'),
      ]);
      b.position.set(0, 1.28, 0.36);
      b.rotation.x = -0.12;
      b.castShadow = true;
      c.root.add(b);
    });
    this.staff(
      'hall',
      uniformLook(`${o.city}:barista`, 'barista'),
      { x: 31.2, z: -3.85, ry: 0, pose: 'stir' },
      'barista',
    );
    this.staff(
      'hall',
      uniformLook(`${o.city}:sim`, 'clerk'),
      { x: 42.6, z: -3.85, ry: 0, pose: 'idle' },
      'sim',
    );
    // Friends who got here first, waiting by your driver.
    (o.waiting ?? []).slice(0, 3).forEach((f, n) => {
      const c = this.staff(
        'hall',
        f.look,
        { x: 36.2 - n * 0.75, z: -1.75, ry: 0.3, pose: 'wave' },
        f.id,
      );
      c.root.add(this.nameTag(f.first));
    });
    this.strollersIn('hall', 1, 28, 18, [-0.2]);
  }

  // ------------------------------------------------------------------ crowds

  private async bakeCrowds() {
    const o = this.o;
    const rnd = seeded(fnv(`${o.seed}:crowd`));
    const looks = Array.from({ length: 10 }, (_, n) => travellerLook(`${o.seed}:c${n}`, o.city));
    const stand: BakeSpec[] = looks.map((look, n) => ({
      look,
      pose: n % 3 ? 'idle' : 'browse',
      t: n * 0.7,
    }));
    const standTops = looks.map((l) => l.top);
    const sitTops = looks.slice(0, 8).map((l) => l.top);
    const sit: BakeSpec[] = looks.slice(0, 8).map((look, n) => ({
      look,
      pose: (['sit', 'read', 'sit', 'type'] as const)[n % 4]!,
      seat: 0.44,
      t: n,
    }));
    const geos = await bakePeople([...stand, ...sit], { cancelled: () => this.disposed });
    if (this.disposed || geos.length < stand.length + sit.length) return;
    const standG = geos.slice(0, stand.length);
    const sitG = geos.slice(stand.length);
    const add = (
      area: Area,
      gs: (THREE.BufferGeometry | null)[],
      placed: Placed[],
      bagList: BagAt[] = [],
    ) => {
      const crowd = new Instanced(gs, placed, {
        shadow: true,
        defaults: gs === sitG ? sitTops : standTops,
      });
      this.crowds.push(crowd);
      this.group(area).add(crowd.group);
      this.crowdIn.set(area, (this.crowdIn.get(area) ?? 0) + crowd.count);
      if (bagList.length) {
        const b = bags(bagList);
        this.crowds.push(b);
        this.group(area).add(b.group);
      }
      return crowd.count;
    };
    const top = () =>
      rnd() < 0.5
        ? undefined
        : ['#0ea5e9', '#f97316', '#16a34a', '#be123c', '#f8fafc', '#7c3aed', '#334155', '#eab308'][
            Math.floor(rnd() * 8)
          ];
    const queue = (xs: number[], z: number, ry = Math.PI): [Placed[], BagAt[]] => {
      const p: Placed[] = [];
      const b: BagAt[] = [];
      xs.forEach((x, i) => {
        const jx = (rnd() - 0.5) * 0.25;
        p.push({
          v: Math.floor(rnd() * standG.length),
          x: x + jx,
          z: z + (rnd() - 0.5) * 0.2,
          ry: ry + (rnd() - 0.5) * 0.6,
          top: top(),
        });
        if (rnd() < 0.75)
          b.push({
            kind: rnd() < 0.6 ? 'case' : 'cabin',
            x: x + jx + 0.38,
            z: z + 0.05,
            ry: ry + 0.3,
            color: BAG_COLOURS[Math.floor(rnd() * BAG_COLOURS.length)]!,
          });
        void i;
      });
      return [p, b];
    };
    if (o.mode === 'departures') {
      const [p1, b1] = queue([-2.9, -1.8, 2.3, 3.4, 4.6], 0.05);
      const [p1b, b1b] = queue([-3.6], 1.2);
      add('desk', standG, [...p1, ...p1b], [...b1, ...b1b]);
      const [p2, b2] = queue([12.6, 13.6, 14.5], -1.0, Math.PI / 2);
      add(
        'security',
        standG,
        [
          ...p2,
          { v: 3, x: 18.9, z: -3.15, ry: Math.PI / 2 },
          { v: 6, x: 21.0, z: -3.6, ry: Math.PI },
        ],
        b2,
      );
      // The gate: people in the seats, a bag at their feet; two at the glass.
      const seats: Placed[] = [];
      const gb: BagAt[] = [];
      const mineX = 33.6;
      for (const z of [-3.1, -0.7])
        for (const x0 of [29.6, 32.2, 34.8])
          for (let i = 0; i < 4; i++) {
            const x = x0 - 1.16 + 0.29 + i * 0.58;
            if (z === -0.7 && Math.abs(x - mineX) < 1.4) continue;
            if (rnd() < 0.42) continue;
            seats.push({ v: Math.floor(rnd() * sitG.length), x, z: z + 0.06, ry: 0, top: top() });
            if (rnd() < 0.5)
              gb.push({
                kind: rnd() < 0.5 ? 'cabin' : 'pack',
                x: x + 0.05,
                z: z + 0.55,
                ry: 0.2,
                color: BAG_COLOURS[Math.floor(rnd() * BAG_COLOURS.length)]!,
              });
          }
      add('gate', sitG, seats, gb);
      add('gate', standG, [
        { v: 1, x: 30.4, z: -4.3, ry: Math.PI, top: top() },
        { v: 5, x: 31.1, z: -4.4, ry: Math.PI + 0.3, top: top() },
        { v: 8, x: 43.0, z: 1.2, ry: -2.0, top: top() },
      ]);
    } else {
      const [p1, b1] = queue([-7.6, -6.5, -5.2, -4.1, -2.9], 0.1);
      const [p1b, b1b] = queue([-7.0, -5.7, -4.6], 1.3, 0);
      add(
        'passport',
        standG,
        [
          ...p1,
          ...p1b,
          { v: 2, x: 3.0, z: -1.35, ry: Math.PI },
          { v: 7, x: -3.0, z: -1.35, ry: Math.PI },
        ],
        [...b1, ...b1b],
      );
      // Round the carousel, waiting.
      const round: Placed[] = [];
      for (const [x, z] of [
        [14.6, -0.9],
        [15.6, 0.0],
        [16.9, 0.3],
        [20.4, 0.3],
        [21.6, -0.2],
        [22.4, -1.2],
        [14.4, -3.0],
        [21.9, -3.1],
      ] as const) {
        const ry = Math.atan2(18 - x, -1.9 - z);
        round.push({ v: Math.floor(rnd() * standG.length), x, z, ry, top: top() });
      }
      add('baggage', standG, round);
      add('hall', standG, [
        { v: 4, x: 30.4, z: -2.0, ry: Math.PI, top: top() },
        { v: 9, x: 31.8, z: -1.9, ry: Math.PI - 0.4, top: top() },
        { v: 2, x: 33.0, z: -3.1, ry: 0.3 },
        { v: 6, x: 39.6, z: -3.0, ry: -0.2, top: top() },
        { v: 0, x: 42.4, z: -2.4, ry: Math.PI, top: top() },
      ]);
    }
    this.crowdReady = true;
    this.countPeople();
    this.onChange?.();
    this.stage.invalidate();
  }

  private countPeople() {
    const area = AREA[this.zone];
    this.peopleCount =
      1 +
      this.party.length +
      (this.people.get(area)?.length ?? 0) +
      (this.strollers.get(area)?.length ?? 0) +
      (this.crowdIn.get(area) ?? 0);
  }
  private crowdIn = new Map<Area, number>();

  // ------------------------------------------------------------------ zones

  private attach(area: Area) {
    for (const [a, g] of this.areas) {
      const on = a === area || a === this.from;
      if (on && !g.parent) this.root.add(g);
      if (!on && g.parent) g.removeFromParent();
    }
  }

  /** Where you are (and how) in each zone. */
  private spotOf(zone: Zone, playing: boolean): Spot {
    switch (zone) {
      case 'ticket':
        return { x: -6.6, z: -1.3, ry: Math.PI, pose: 'idle' };
      case 'checkin':
        return { x: 0.6, z: -1.3, ry: Math.PI, pose: 'idle' };
      case 'security':
        return playing
          ? { x: 20.9, z: -1.3, ry: Math.PI / 2, pose: 'idle' }
          : { x: 16.6, z: -1.3, ry: Math.PI / 2, pose: 'idle' };
      case 'gate':
        return { x: 33.61, z: -0.62, ry: 0, pose: 'read', seat: 0.44 };
      case 'board':
        return { x: this.bridgeDoor.x, z: GLASS + 1.2, ry: Math.PI, pose: 'walk' };
      case 'passport':
        return { x: 0, z: -1.3, ry: Math.PI, pose: 'idle' };
      case 'baggage':
        return { x: 18.6, z: -0.05, ry: Math.PI, pose: 'idle' };
      case 'hall':
        return { x: 37.75, z: -1.45, ry: -2.64, pose: 'idle' };
    }
  }

  private camOf(zone: Zone): { p: THREE.Vector3; l: THREE.Vector3 } {
    const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
    switch (zone) {
      case 'ticket':
        return { p: V(-3.9, 2.0, 2.7), l: V(-6.2, 1.1, -2.0) };
      case 'checkin':
        return { p: V(2.7, 1.95, 2.3), l: V(0.6, 1.1, -2.2) };
      case 'security':
        return { p: V(19.3, 2.0, 2.5), l: V(17.4, 1.05, -1.8) };
      case 'gate':
        return { p: V(36.3, 1.9, 2.7), l: V(34.4, 0.95, -1.6) };
      case 'board':
        // Your own jet: over the gate door, down through the glass to its airstairs.
        if (this.o.kind === 'bizjet') return { p: V(43.4, 2.9, 0.6), l: V(40.8, -1.2, -11.5) };
        return { p: V(38.8, 1.95, 1.5), l: V(41.3, 1.2, -4.2) };
      case 'passport':
        return { p: V(1.9, 1.95, 2.4), l: V(-0.2, 1.1, -2.1) };
      case 'baggage':
        return { p: V(20.7, 2.4, 3.1), l: V(18.4, 0.7, -1.4) };
      case 'hall':
        return { p: V(35.5, 1.95, 2.5), l: V(37.2, 1.3, -2.6) };
    }
  }

  private setCamera(zone: Zone, jump = false) {
    const c = this.camOf(zone);
    if (jump) {
      this.camFrom.p.copy(c.p);
      this.camFrom.l.copy(c.l);
      this.camT = 1;
    } else {
      this.camFrom.p.copy(this.eye.position);
      this.camFrom.l.copy(this.camLook);
      this.camT = 0;
      this.camStart = -1;
    }
    this.camAt = c;
    this.aimSun(c.l.x);
    this.applyCamera(jump ? 1 : 0);
  }
  private camLook = new THREE.Vector3();

  private applyCamera(k: number) {
    const e = k * k * (3 - 2 * k);
    this.eye.position.lerpVectors(this.camFrom.p, this.camAt.p, e);
    this.camLook.lerpVectors(this.camFrom.l, this.camAt.l, e);
    this.eye.lookAt(this.camLook);
    const hfov = this.aspect > 1.2 ? 72 : 58;
    const v = (2 * Math.atan(Math.tan((hfov * Math.PI) / 360) / this.aspect) * 180) / Math.PI;
    this.eye.fov = Math.max(36, Math.min(66, v));
    this.eye.aspect = this.aspect;
    this.eye.updateProjectionMatrix();
    this.stage.eyeMoved();
  }

  setAspect(a: number) {
    this.aspect = Math.max(0.3, a);
    this.applyCamera(Math.min(1, this.camT));
  }

  /** Walk on to a zone (or start its moment: `playing`). */
  setZone(zone: Zone, playing: boolean, t: number) {
    if (zone === this.zone && playing === this.playing) return;
    const moved = zone !== this.zone;
    if (playing && !this.playing) this.playAt = t;
    this.playing = playing;
    if (!moved) return;
    const before = AREA[this.zone];
    this.zone = zone;
    if (AREA[zone] !== before) {
      this.from = before;
      this.attach(AREA[zone]);
      this.moveAt = t;
      this.setCamera(zone);
      this.placeYou(zone, t, false);
    } else {
      this.moveAt = t;
      this.setCamera(zone);
      this.placeYou(zone, t, false);
    }
    this.countPeople();
    this.onChange?.();
  }

  private walkFrom = new THREE.Vector3();
  private placeYou(zone: Zone, _t: number, jump: boolean) {
    const s = this.spotOf(zone, false);
    if (jump) {
      this.walkFrom.set(s.x, 0, s.z);
      this.moveAt = -1;
    } else {
      // You walk in from the side of the hall nearest where you were.
      const cur = this.me.root.position;
      const near = Math.abs(cur.x - s.x) < 6;
      this.walkFrom.set(near ? cur.x : s.x - 3.2, 0, near ? cur.z : s.z + 2.6);
    }
  }

  // ------------------------------------------------------------------ frames

  private put(c: Character, s: Spot, t: number, phase = 0) {
    c.root.position.set(s.x, 0, s.z);
    c.root.rotation.y = s.ry;
    pose(c, s.pose, t, { seat: s.seat, phase });
  }

  /** A frame: returns true while something moves. */
  update(t: number): boolean {
    // The camera glides between zones.
    if (this.camT < 1) {
      if (this.camStart < 0) this.camStart = t;
      this.camT = Math.min(1, (t - this.camStart) / 1.8);
      this.applyCamera(this.camT);
      if (this.camT >= 1 && this.from) {
        this.from = null;
        this.attach(AREA[this.zone]);
      }
    }
    // You: walking in to your spot, then there (or the zone's moment).
    const zone = this.zone;
    let s = this.spotOf(zone, false);
    const walkDur = 2.0;
    const since = this.moveAt >= 0 ? t - this.moveAt : 99;
    const playK = this.playing && this.playAt >= 0 ? t - this.playAt : -1;
    let walking = false;
    let pos = new THREE.Vector3(s.x, 0, s.z);
    let face = s.ry;
    if (since < walkDur) {
      const k = Math.min(1, since / walkDur);
      const e = k * k * (3 - 2 * k);
      pos = this.walkFrom.clone().lerp(new THREE.Vector3(s.x, 0, s.z), e);
      const d = new THREE.Vector3(s.x - this.walkFrom.x, 0, s.z - this.walkFrom.z);
      if (d.lengthSq() > 1e-3) face = Math.atan2(d.x, d.z);
      walking = k < 1;
    } else if (playK >= 0 && zone === 'security') {
      const end = this.spotOf('security', true);
      const k = Math.min(1, playK / 2.4);
      pos.set(s.x + (end.x - s.x) * k, 0, s.z);
      walking = k < 1;
      face = Math.PI / 2;
      if (k >= 1) s = end;
    } else if (playK >= 0 && zone === 'board' && this.o.kind === 'bizjet') {
      // Your own jet: out of the door, then across the apron and up its airstairs.
      const k1 = Math.max(0, Math.min(1, (playK - 2.4) / 1.6));
      const k2 = Math.max(0, Math.min(1, (playK - 4.0) / 3.2));
      const { x, y, z } = JET_DOOR;
      if (k2 <= 0) {
        pos.set(s.x, 0, s.z - k1 * 3.0);
        walking = k1 < 1;
        face = Math.PI;
      } else {
        // The carpet to the foot of the stairs, then up them.
        const foot = new THREE.Vector3(x, APRON, z + 2.7);
        const start = new THREE.Vector3(x, APRON, z + 9);
        const top = new THREE.Vector3(x, APRON + y, z + 0.25);
        const p = k2 < 0.6 ? start.lerp(foot, k2 / 0.6) : foot.lerp(top, (k2 - 0.6) / 0.4);
        pos.copy(p);
        walking = k2 < 1;
        face = Math.PI;
      }
    } else if (playK >= 0 && zone === 'board') {
      // Up to the door and out along the bridge.
      // (A moment at the door first: you walk in, show your pass, then go.)
      const k = Math.max(0, Math.min(1, (playK - 2.4) / 3.0));
      pos.set(s.x, 0, s.z - k * 3.6);
      walking = k < 1;
      face = Math.PI;
    } else if (zone === 'board') {
      walking = false;
      s = { ...s, pose: 'idle' };
    }
    if (walking) {
      this.me.root.position.copy(pos);
      this.me.root.position.y = pos.y;
      this.me.root.rotation.y = face;
      pose(this.me, 'walk', t);
    } else {
      this.put(this.me, { ...s, x: pos.x, z: pos.z }, t);
    }
    this.me.root.visible =
      !(zone === 'board' && pos.z < GLASS - 0.8 && pos.y > -0.5) &&
      !(zone === 'board' && pos.y < -0.5 && playK > 7.1);
    const sat = zone === 'gate' && !walking;
    this.youTag.position.y = sat ? 1.5 : 2.02;
    this.youRing.visible = !sat;
    // Your friends a step behind (sitting beside you at the gate).
    this.party.forEach((c, n) => {
      const off = [
        [-0.75, 0.45],
        [0.75, 0.5],
        [-1.5, 0.9],
      ][n]!;
      const seated = zone === 'gate' && !walking;
      const fx = seated
        ? s.x + (n % 2 ? 0.58 : -0.58) * (1 + Math.floor(n / 2))
        : pos.x + Math.cos(face) * off[0]! + Math.sin(face) * off[1]! * -1;
      const fz = seated ? s.z : pos.z - Math.sin(face) * off[0]! * -1 + Math.cos(face) * -off[1]!;
      const hall = zone === 'hall' && !walking;
      c.root.position.set(hall ? s.x + 0.8 * (n + 1) : fx, 0, hall ? s.z + 0.3 * n : fz);
      const tag = this.tags[n];
      if (tag) tag.position.y = seated ? 1.62 : 2.05 + (n % 2) * 0.16;
      c.root.rotation.y = face;
      c.root.visible = this.me.root.visible;
      if (walking) pose(c, 'walk', t, { phase: n + 1 });
      else pose(c, seated ? 'sit' : 'idle', t, { seat: s.seat, phase: n + 1 });
    });
    // Your bag: beside you (on the scale and away at check-in; in the tray at security).
    const bagSide = new THREE.Vector3(Math.cos(face) * 0.42, 0, -Math.sin(face) * 0.42);
    let bagPos = pos.clone().add(bagSide);
    let bagVisible =
      zone !== 'security' && zone !== 'board' && zone !== 'gate' && zone !== 'passport';
    if (zone === 'checkin' && playK >= 0 && since >= walkDur) {
      const k = Math.min(1, playK / 1.6);
      const scale = new THREE.Vector3(1.78, 0.34, -2.2);
      const away = new THREE.Vector3(1.78, 0.52, -4.1);
      bagPos =
        k < 0.4
          ? bagPos.lerp(scale, k / 0.4)
          : k < 0.65
            ? scale
            : scale.clone().lerp(away, (k - 0.65) / 0.35);
      if (k >= 1) bagVisible = false;
    }
    if (zone === 'baggage') bagVisible = false;
    if (this.o.mode === 'arrivals' && zone === 'hall') bagVisible = true;
    if (this.o.mode === 'departures' && (zone === 'security' || zone === 'gate'))
      bagVisible = false;
    this.myBag.visible = bagVisible;
    this.myBag.position.copy(bagPos);
    this.myBag.rotation.y = face;
    // Security: the tray through the tunnel, the arch's lamp green as you pass.
    if (this.tray) {
      const k =
        zone === 'security' && playK >= 0 ? Math.min(1, playK / 2.6) : zone === 'security' ? 0 : 1;
      this.tray.position.x = 14.0 + k * 6.6;
      this.tray.visible = this.o.mode === 'departures';
      const passed = zone === 'security' && playK >= 0.9;
      this.archLamp?.color.set(passed ? '#22c55e' : '#ef4444');
      this.archLamp?.emissive.set(passed ? '#22c55e' : '#ef4444');
    }
    // The staff and the friends waiting, at their places.
    for (const [area, list] of this.people) {
      if (!this.group(area).parent) continue;
      for (const p of list) {
        this.put(p.c, p.spot, t, p.n);
        if (p.hold) {
          // Arms up: holding a board in front of them.
          p.c.armL.rotation.set(-1.15, 0, 0.32);
          p.c.armR.rotation.set(-1.15, 0, -0.32);
          p.c.foreL.rotation.set(-0.75, 0, 0);
          p.c.foreR.rotation.set(-0.75, 0, 0);
        }
      }
    }
    // Walkers crossing the hall, pulling their bags.
    for (const [area, list] of this.strollers) {
      if (!this.group(area).parent) continue;
      for (const w of list) {
        const d = (((w.phase + t * w.speed) % w.span) + w.span) % w.span;
        const x = w.x0 + d;
        const dir = Math.sign(w.speed);
        w.w.root.position.set(x, 0, w.z);
        w.w.root.rotation.y = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
        w.w.pose(1, t * 7 + w.phase);
        if (w.bag.parent !== w.w.root) {
          w.bag.position.set(x - dir * 0.55, 0, w.z + 0.18);
          w.bag.rotation.y = w.w.root.rotation.y;
        }
      }
    }
    // The carousel turns.
    if (this.belt && this.group('baggage').parent) {
      const m4 = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const up = new THREE.Vector3(0, 1, 0);
      for (const b of this.belt.at) {
        const p = this.beltAt(b.k + t * 0.035);
        q.setFromAxisAngle(up, p.ry + (b.kind === 2 ? 0 : Math.PI / 2));
        const lie = b.kind === 2 ? 0.42 : 0.42;
        const tilt = new THREE.Quaternion().setFromAxisAngle(
          new THREE.Vector3(1, 0, 0),
          b.kind === 2 ? 0 : -Math.PI / 2,
        );
        m4.compose(
          new THREE.Vector3(p.x, lie + (b.kind === 2 ? 0 : 0.14), p.z),
          b.kind === 2 ? q : q.clone().multiply(tilt),
          new THREE.Vector3(1, 1, 1),
        );
        this.belt.im[b.kind]!.setMatrixAt(b.n, m4);
      }
      for (const im of this.belt.im) im.instanceMatrix.needsUpdate = true;
      // Yours comes round to you.
      if (zone === 'baggage') {
        const k = Math.min(0.97, 0.62 + (since < 99 ? since : 0) * 0.03);
        const p = this.beltAt(k);
        this.myBag.visible = true;
        this.myBag.position.set(p.x, 0.56, p.z);
        this.myBag.rotation.set(-Math.PI / 2, 0, 0);
      }
    }
    if (zone !== 'baggage') this.myBag.rotation.x = 0;
    // The taxiing plane rolls along the taxiway, again and again.
    if (this.taxiPlane) {
      const span = 140;
      const x = ((t * 6) % span) - 50;
      this.taxiPlane.position.x = x;
    }
    return true;
  }

  /** Points of interest for tests: people in view. */
  get people3d() {
    return this.peopleCount;
  }

  dispose() {
    this.disposed = true;
    for (const c of this.crowds) c.dispose(true);
    for (const list of this.strollers.values()) for (const w of list) w.w.dispose();
    for (const g of this.areas.values()) if (!g.parent) this.root.add(g);
    this.stage.scene.remove(this.root);
    disposeTree(this.root);
    for (const t of this.tex) t.dispose();
    if (this.stage.eye === this.eye) this.stage.eye = null;
  }
}

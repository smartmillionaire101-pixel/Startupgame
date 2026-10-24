/**
 * The first class suite (and the business seat) in 3D, cut away and seen
 * from above the aisle:
 *
 * - First: your own suite, walnut and cream leather, sliding doors to the
 *   aisle that close; a wide armchair that turns into a fully flat bed (the
 *   crew make it up: mattress, duvet, pillows); a wide personal screen; the
 *   amenity kit and pyjamas waiting on the ottoman; a dining table that
 *   unfolds for courses served on real crockery, with champagne on ice;
 *   windows onto the sky of the hour (the flight's own sky: ../flight3d);
 *   forward, the onboard bar; aft, the shower spa.
 * - Business: a lie-flat seat in a pod with a privacy screen, no doors; three
 *   courses on china; no bar or spa.
 *
 * `set` says what's happening (the flight's moment, your act, the course
 * on the table, the doors); `update` animates (you walk to the bar or the
 * spa, the seat reclines into a bed, the crew come to your door).
 */
import * as THREE from 'three';
import type { AvatarLook } from '../art';
import { makeCharacter, pose, type Character, type PoseId } from '../../interiors3d/character';
import { buildModel } from '../../interiors3d/furniture';
import { Particles, fx } from '../../interiors3d/fx';
import { disposeTree, mat, screenTexture, signTexture } from '../../interiors3d/kit';
import type { Stage } from '../../interiors3d/stage';
import { paneTexture } from '../flight3d/textures';
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
}

export interface SuiteOpts {
  cabin: 'business' | 'first';
  me: AvatarLook;
  crew: AvatarLook;
  others: AvatarLook[];
  zenith: string;
  horizon: string;
  night: boolean;
}

const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const ease = (x: number) => x * x * (3 - 2 * x);
/** Ease a value towards a target at `rate` per second. */
const approach = (v: number, to: number, dt: number, rate = 1.6) =>
  v + clamp(to - v, -rate * dt, rate * dt);

/** The suite: x across the plane (window at −x, aisle at +x), z along it (nose at −z). */
const SUITE = { x0: -1.25, x1: 1.15, z0: -1.15, z1: 1.15 };
const SEAT = new THREE.Vector3(-0.3, 0, 0.35);
const BAR_AT = new THREE.Vector3(0.4, 0, -3.6);
const SPA_AT = new THREE.Vector3(-0.2, 0, 3.7);

export class SuiteWorld {
  readonly root = new THREE.Group();
  private me: Character;
  private crew: Character;
  private others: Character[] = [];
  private particles = new Particles();
  private st: SuiteState = { stage: 'boarding', act: null, course: 0, plate: null, doors: 'open' };
  /** 0 upright … 1 a flat bed. */
  private recline = 0;
  /** 0 doors open … 1 closed. */
  private shut = 0;
  /** 0 table folded … 1 laid. */
  private table = 0;
  private where = SEAT.clone();
  private back: THREE.Group;
  private leg: THREE.Group;
  private bed: THREE.Group;
  private doorL?: THREE.Mesh;
  private doorR?: THREE.Mesh;
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
  private tex: THREE.Texture[] = [];

  constructor(
    private stage: Stage,
    private o: SuiteOpts,
  ) {
    const first = o.cabin === 'first';
    const wood = first ? '#5b3a22' : '#334155';
    const leather = first ? '#e9dcc3' : '#475569';
    const trim = first ? '#c9a227' : '#38bdf8';
    stage.scene.add(this.root);
    stage.scene.background = new THREE.Color(o.night ? '#05070f' : '#111827');

    // The cabin floor (a long strip: the bar forward, the spa aft) and the aisle runner.
    const carpet = new THREE.Mesh(
      new THREE.PlaneGeometry(4.6, 10),
      mat(first ? '#3a2e26' : '#2b3850', { rough: 0.95 }),
    );
    carpet.rotation.x = -Math.PI / 2;
    carpet.position.set(0.3, 0, 0);
    carpet.receiveShadow = true;
    this.root.add(carpet);
    const runner = new THREE.Mesh(
      new THREE.PlaneGeometry(0.9, 10),
      mat(first ? '#2a211b' : '#1f2a3d', { rough: 0.95 }),
    );
    runner.rotation.x = -Math.PI / 2;
    runner.position.set(1.7, 0.004, 0);
    this.root.add(runner);

    // The fuselage wall (window side) with three windows onto the sky.
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 2.1, 10),
      mat(first ? '#f5efe6' : '#e2e8f0', { rough: 0.8 }),
    );
    wall.position.set(-1.4, 1.05, 0);
    wall.receiveShadow = true;
    this.root.add(wall);
    const pane = paneTexture(o.zenith, o.horizon, o.night);
    this.tex.push(pane);
    for (const z of [-0.7, 0.05, 0.8, -3.4, 3.3]) {
      const win = new THREE.Mesh(
        new THREE.PlaneGeometry(0.34, 0.46),
        new THREE.MeshBasicMaterial({ map: pane }),
      );
      win.position.set(-1.32, 1.25, z);
      win.rotation.y = Math.PI / 2;
      this.root.add(win);
      const frame = new THREE.Mesh(
        new THREE.TorusGeometry(0.22, 0.03, 6, 20),
        mat('#cbd5e1', { rough: 0.4 }),
      );
      frame.scale.set(0.85, 1.15, 1);
      frame.position.set(-1.32, 1.25, z);
      frame.rotation.y = Math.PI / 2;
      this.root.add(frame);
    }

    // The suite's walls: the bulkhead ahead with the screen, the partition behind,
    // and (first) the aisle wall with its sliding doors.
    const panel = mat(wood, { rough: 0.55 });
    const front = new THREE.Mesh(new THREE.BoxGeometry(SUITE.x1 - SUITE.x0, 1.45, 0.08), panel);
    front.position.set((SUITE.x0 + SUITE.x1) / 2, 0.725, SUITE.z0);
    front.castShadow = true;
    this.root.add(front);
    const rear = new THREE.Mesh(
      new THREE.BoxGeometry(SUITE.x1 - SUITE.x0, first ? 1.45 : 1.1, 0.08),
      panel,
    );
    rear.position.set((SUITE.x0 + SUITE.x1) / 2, first ? 0.725 : 0.55, SUITE.z1);
    rear.castShadow = true;
    this.root.add(rear);
    const gold = mat(trim, { rough: 0.3, metal: 0.7 });
    for (const z of [SUITE.z0, SUITE.z1]) {
      const cap = new THREE.Mesh(new THREE.BoxGeometry(SUITE.x1 - SUITE.x0, 0.03, 0.1), gold);
      cap.position.set((SUITE.x0 + SUITE.x1) / 2, z === SUITE.z0 || first ? 1.46 : 1.11, z);
      this.root.add(cap);
    }
    if (first) {
      // The sliding doors: two panels on a track along the aisle.
      const doorMat = mat(wood, { rough: 0.45 });
      this.doorL = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.35, 1.1), doorMat);
      this.doorR = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.35, 1.1), doorMat);
      for (const d of [this.doorL, this.doorR]) {
        d.castShadow = true;
        d.position.set(SUITE.x1, 0.68, 0);
        this.root.add(d);
      }
      const track = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.04, 2.4), gold);
      track.position.set(SUITE.x1, 1.37, 0);
      this.root.add(track);
      // The suite number.
      const num = new THREE.Mesh(
        new THREE.PlaneGeometry(0.34, 0.12),
        mat('#ffffff', { map: signTexture('1A', '#0f0a07', '#fcd34d'), own: true }),
      );
      num.position.set(SUITE.x1 + 0.05, 1.2, -1.0);
      num.rotation.y = Math.PI / 2;
      this.root.add(num);
    } else {
      // Business: a privacy screen, no doors.
      const scr = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.9, 1.6), panel);
      scr.position.set(SUITE.x1, 0.45, 0.2);
      this.root.add(scr);
    }

    // The wide screen on the bulkhead.
    this.film = screenTexture('film');
    this.map = screenTexture('slide');
    this.screen = mat('#ffffff', {
      map: this.map,
      emissive: '#ffffff',
      emissiveIntensity: 0.55,
      own: true,
    });
    const sw = first ? 1.0 : 0.62;
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(sw, sw * 0.56), this.screen);
    screen.position.set(-0.3, 1.0, SUITE.z0 + 0.05);
    this.root.add(screen);
    const bezel = new THREE.Mesh(
      new THREE.BoxGeometry(sw + 0.05, sw * 0.56 + 0.05, 0.02),
      mat('#0f172a', { rough: 0.3 }),
    );
    bezel.position.set(-0.3, 1.0, SUITE.z0 + 0.04);
    this.root.add(bezel);

    // The side console (the aisle side): a lamp, a vase in first.
    const console = new THREE.Mesh(
      new THREE.BoxGeometry(0.42, 0.62, 1.5),
      mat(wood, { rough: 0.5 }),
    );
    console.position.set(0.82, 0.31, 0.1);
    console.castShadow = true;
    this.root.add(console);
    const consoleTop = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.03, 1.52), gold);
    consoleTop.position.set(0.82, 0.63, 0.1);
    this.root.add(consoleTop);
    if (first) {
      const vase = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.05, 0.18, 12),
        mat('#f8fafc', { rough: 0.2 }),
      );
      vase.position.set(0.82, 0.73, -0.45);
      this.root.add(vase);
      const rose = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), mat('#be123c'));
      rose.position.set(0.82, 0.86, -0.45);
      this.root.add(rose);
    }
    this.lamp = new THREE.PointLight('#ffd9a0', first ? 4 : 2.5, 3.5, 1.6);
    this.lamp.position.set(0.8, 1.1, 0.5);
    this.root.add(this.lamp);
    this.mood = new THREE.PointLight('#6366f1', 0, 6, 1.5);
    this.mood.position.set(0.2, 1.9, 0);
    this.root.add(this.mood);

    // The seat: a base, a seat cushion, a back that reclines flat, a leg rest that rises.
    const seatGroup = new THREE.Group();
    seatGroup.position.copy(SEAT);
    this.root.add(seatGroup);
    const cushion = mat(leather, { rough: 0.6 });
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.36, 0.7), mat(wood, { rough: 0.5 }));
    base.position.set(0, 0.18, 0);
    seatGroup.add(base);
    const pad = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.12, 0.66), cushion);
    pad.position.set(0, 0.42, 0);
    pad.castShadow = true;
    seatGroup.add(pad);
    for (const sx of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.22, 0.66), cushion);
      arm.position.set(sx * 0.36, 0.52, 0);
      seatGroup.add(arm);
    }
    this.back = new THREE.Group();
    this.back.position.set(0, 0.46, 0.33);
    const backPad = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.8, 0.14), cushion);
    backPad.position.set(0, 0.4, 0);
    backPad.castShadow = true;
    this.back.add(backPad);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.14, 0.12), cushion);
    head.position.set(0, 0.74, -0.05);
    this.back.add(head);
    seatGroup.add(this.back);
    this.leg = new THREE.Group();
    this.leg.position.set(0, 0.46, -0.33);
    const legPad = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.1, 0.5), cushion);
    legPad.position.set(0, -0.02, -0.25);
    this.leg.add(legPad);
    seatGroup.add(this.leg);
    // The ottoman at the foot (first): the bed runs out to it.
    const ottoman = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.46, 0.4), cushion);
    ottoman.position.set(-0.3, 0.23, -0.82);
    ottoman.castShadow = true;
    this.root.add(ottoman);

    // The bed, made up by the crew: a mattress over the flat seat, a duvet, pillows.
    this.bed = new THREE.Group();
    const mattress = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.08, 1.95),
      mat('#f8fafc', { rough: 0.9 }),
    );
    mattress.position.set(0, 0.52, -0.25);
    this.bed.add(mattress);
    const duvet = new THREE.Mesh(
      new THREE.BoxGeometry(0.74, 0.07, 1.25),
      mat(first ? '#1e3a8a' : '#64748b', { rough: 0.95 }),
    );
    duvet.position.set(0, 0.58, -0.55);
    this.bed.add(duvet);
    const fold = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.05, 0.22), mat('#f8fafc'));
    fold.position.set(0, 0.6, 0.1);
    this.bed.add(fold);
    for (const sx of [-0.15, 0.15]) {
      const pillow = new THREE.Mesh(
        new THREE.BoxGeometry(0.3, 0.1, 0.24),
        mat('#ffffff', { rough: 0.95 }),
      );
      pillow.position.set(sx, 0.62, 0.48);
      this.bed.add(pillow);
    }
    this.bed.position.set(SEAT.x, 0, SEAT.z);
    this.bed.visible = false;
    this.root.add(this.bed);

    // The amenity kit and pyjamas on the ottoman (first), the kit on the console (business).
    this.kit = new THREE.Group();
    const bag = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.08, 0.12),
      mat(first ? '#7c2d12' : '#1e3a8a', { rough: 0.5 }),
    );
    bag.position.set(0.12, 0.04, 0);
    this.kit.add(bag);
    if (first) {
      const pj = new THREE.Mesh(
        new THREE.BoxGeometry(0.3, 0.06, 0.24),
        mat('#cbd5e1', { rough: 0.95 }),
      );
      pj.position.set(-0.14, 0.03, 0);
      this.kit.add(pj);
      const pj2 = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.05, 0.22), mat('#94a3b8'));
      pj2.position.set(-0.14, 0.085, 0);
      this.kit.add(pj2);
      this.kit.position.set(-0.3, 0.46, -0.82);
    } else this.kit.position.set(0.82, 0.65, 0.5);
    this.root.add(this.kit);

    // The dining table: unfolds from the console, laid with a white cloth.
    this.tableTop = new THREE.Group();
    const cloth = new THREE.Mesh(
      new THREE.BoxGeometry(0.66, 0.03, 0.5),
      mat('#f8fafc', { rough: 0.85 }),
    );
    cloth.position.set(0, 0, 0);
    this.tableTop.add(cloth);
    this.plate = new THREE.Mesh(
      new THREE.CylinderGeometry(0.13, 0.11, 0.02, 24),
      mat('#ffffff', { rough: 0.15, own: true }),
    );
    this.plate.position.set(0, 0.025, 0.05);
    this.tableTop.add(this.plate);
    this.food = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 14, 10),
      mat('#7c2d12', { rough: 0.7, own: true }),
    );
    this.food.scale.set(1, 0.45, 1);
    this.food.position.set(0, 0.05, 0.05);
    this.tableTop.add(this.food);
    for (const sx of [-1, 1]) {
      const cutlery = new THREE.Mesh(
        new THREE.BoxGeometry(0.015, 0.006, 0.18),
        mat('#d1d5db', { rough: 0.2, metal: 0.9 }),
      );
      cutlery.position.set(sx * 0.18, 0.02, 0.05);
      this.tableTop.add(cutlery);
    }
    const flute = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.012, 0.18, 10),
      mat(first ? '#fde68a' : '#7f1d1d', { opacity: 0.8, rough: 0.05 }),
    );
    flute.position.set(0.24, 0.1, -0.15);
    this.tableTop.add(flute);
    if (first) {
      const bucket = new THREE.Mesh(
        new THREE.CylinderGeometry(0.07, 0.06, 0.14, 14),
        mat('#d1d5db', { rough: 0.2, metal: 0.8 }),
      );
      bucket.position.set(-0.24, 0.08, -0.15);
      this.tableTop.add(bucket);
      const bottle = new THREE.Mesh(
        new THREE.CylinderGeometry(0.03, 0.035, 0.26, 10),
        mat('#14532d', { rough: 0.3 }),
      );
      bottle.position.set(-0.24, 0.2, -0.15);
      this.tableTop.add(bottle);
    }
    this.tableTop.position.set(-0.3, 0.72, -0.25);
    this.tableTop.visible = false;
    this.root.add(this.tableTop);

    // A laptop (work).
    this.laptop = new THREE.Group();
    const lb = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 0.015, 0.2),
      mat('#9ca3af', { metal: 0.6 }),
    );
    this.laptop.add(lb);
    const ls = new THREE.Mesh(
      new THREE.PlaneGeometry(0.3, 0.2),
      mat('#ffffff', { map: screenTexture('slide'), emissive: '#ffffff', emissiveIntensity: 0.6 }),
    );
    ls.position.set(0, 0.1, -0.1);
    ls.rotation.x = -0.25;
    this.laptop.add(ls);
    this.laptop.position.set(-0.3, 0.75, -0.2);
    this.laptop.visible = false;
    this.root.add(this.laptop);

    // The suites ahead and behind (their partitions), so it reads as a cabin.
    for (const z of [SUITE.z0 - 1.25, SUITE.z1 + 1.25]) {
      const p = new THREE.Mesh(
        new THREE.BoxGeometry(SUITE.x1 - SUITE.x0, first ? 1.45 : 1.1, 0.08),
        panel,
      );
      p.position.set((SUITE.x0 + SUITE.x1) / 2, first ? 0.725 : 0.55, z);
      this.root.add(p);
    }

    // Forward: the onboard bar (first, long haul); aft: the shower spa.
    if (first) {
      const bar = buildModel('bar-counter', { w: 1.8, d: 1.0, tier: 3, tint: wood });
      bar.group.position.set(0.3, 0, -4.4);
      this.root.add(bar.group);
      const barSign = new THREE.Mesh(
        new THREE.PlaneGeometry(1.2, 0.2),
        mat('#ffffff', { map: signTexture('ONBOARD BAR', '#0f0a07', '#fcd34d'), own: true }),
      );
      barSign.position.set(0.3, 1.85, -4.85);
      this.root.add(barSign);
      const spaFloor = new THREE.Mesh(
        new THREE.PlaneGeometry(2.2, 1.6),
        mat('#e7e5e4', { rough: 0.25 }),
      );
      spaFloor.rotation.x = -Math.PI / 2;
      spaFloor.position.set(-0.2, 0.006, 3.9);
      this.root.add(spaFloor);
      const sh = buildModel('shower', { w: 1.0, d: 1.0, tier: 3 });
      sh.group.position.set(-0.6, 0, 4.1);
      this.root.add(sh.group);
      const spaSign = new THREE.Mesh(
        new THREE.PlaneGeometry(1.0, 0.2),
        mat('#ffffff', { map: signTexture('SHOWER SPA', '#0f0a07', '#fcd34d'), own: true }),
      );
      spaSign.position.set(0.5, 1.6, 3.1);
      this.root.add(spaSign);
    }

    // The people.
    this.me = makeCharacter(o.me, 'me');
    this.root.add(this.me.root);
    this.crew = makeCharacter(o.crew, 'crew');
    this.root.add(this.crew.root);
    o.others.slice(0, 2).forEach((look, n) => {
      const c = makeCharacter(look, `pax:${n}`);
      this.root.add(c.root);
      this.others.push(c);
    });
    this.root.add(this.particles.group);
  }

  /** Points the camera keeps in view (the suite and the aisle). */
  fitPoints(): THREE.Vector3[] {
    return [
      new THREE.Vector3(-1.45, 1.6, -1.3),
      new THREE.Vector3(2.0, 0, -1.3),
      new THREE.Vector3(-1.45, 1.6, 1.3),
      new THREE.Vector3(2.0, 0, 1.3),
    ];
  }

  set(s: SuiteState) {
    this.st = s;
    if (s.plate) {
      (this.plate.material as THREE.MeshStandardMaterial).color.set(s.plate[0]);
      (this.food.material as THREE.MeshStandardMaterial).color.set(s.plate[1]);
    }
  }

  /** Where the camera should look (you, wherever you are). */
  focus(): THREE.Vector3 {
    return this.where.clone().setY(0.6);
  }

  /** A frame: true while something moves (always: the crew, the clouds, you breathing). */
  update(t: number, dt: number): boolean {
    const s = this.st;
    const first = this.o.cabin === 'first';
    const sleeping =
      s.act === 'sleep' || (s.stage === 'night' && s.act !== 'work' && s.act !== 'watch');
    this.recline = approach(this.recline, sleeping ? 1 : s.act === 'watch' ? 0.35 : 0, dt, 2.5);
    this.shut = approach(this.shut, first && s.doors === 'closed' ? 1 : 0, dt, 3);
    const laid = s.course > 0 && !sleeping && s.act !== 'bar' && s.act !== 'spa';
    this.table = approach(this.table, laid || s.act === 'work' ? 1 : 0, dt, 4);

    // The seat reclines into a bed; the crew's bedding appears once it's flat.
    const r = ease(this.recline);
    this.back.rotation.x = 0.18 + r * (Math.PI / 2 - 0.18);
    this.leg.rotation.x = -0.9 + r * 0.9;
    this.bed.visible = this.recline > 0.6;
    if (this.doorL && this.doorR) {
      const k = ease(this.shut);
      this.doorL.position.z = -1.1 + k * 0.55;
      this.doorR.position.z = 1.1 - k * 0.55;
    }
    this.tableTop.visible = this.table > 0.05 && laid;
    this.tableTop.scale.setScalar(Math.max(0.05, this.table));
    this.laptop.visible = s.act === 'work' && this.table > 0.5;
    this.kit.visible = s.stage === 'boarding' && s.act === null;
    this.screen.map = s.act === 'watch' ? this.film : this.map;
    this.screen.emissiveIntensity = s.act === 'watch' ? 1.1 : 0.55;
    this.screen.needsUpdate = true;
    // Night: the cabin dims to mood light.
    const night = s.stage === 'night' || sleeping;
    this.mood.intensity = approach(this.mood.intensity, night ? 3 : 0, dt, 4);
    this.lamp.intensity = approach(this.lamp.intensity, night ? 0.6 : first ? 4 : 2.5, dt, 4);
    this.stage.hemi.intensity = approach(this.stage.hemi.intensity, night ? 0.45 : 1.35, dt, 1.2);
    this.stage.sun.intensity = approach(this.stage.sun.intensity, night ? 0.3 : 1.9, dt, 1.6);

    // You: in your seat (eating, watching, working, asleep), or at the bar, or in the spa.
    const goal =
      s.act === 'bar' ? BAR_AT.clone().setZ(BAR_AT.z + 0.1) : s.act === 'spa' ? SPA_AT : SEAT;
    const d = goal.clone().sub(this.where);
    const step = Math.min(d.length(), dt * 1.4);
    const walking = d.length() > 0.02;
    if (walking) this.where.add(d.normalize().multiplyScalar(step));
    this.me.root.position.copy(this.where);
    if (walking) {
      this.me.root.rotation.y = Math.atan2(goal.x - this.where.x, goal.z - this.where.z);
      pose(this.me, 'walk', t);
    } else if (s.act === 'bar') {
      this.me.root.rotation.y = Math.PI;
      pose(this.me, 'chat', t);
    } else if (s.act === 'spa') {
      this.me.root.rotation.y = 0;
      pose(this.me, 'idle', t);
      fx.steam(this.particles, new THREE.Vector3(-0.6, 1.9, 4.1), dt, 14);
    } else if (this.bed.visible) {
      // Head on the pillows (aft), feet towards the ottoman.
      this.me.root.position.set(SEAT.x, 0, SEAT.z - 0.25);
      this.me.root.rotation.y = Math.PI;
      pose(this.me, 'lie', t, { seat: 0.52 });
      fx.zz(this.particles, new THREE.Vector3(SEAT.x, 1.0, SEAT.z - 0.1), dt);
    } else {
      this.me.root.rotation.y = Math.PI;
      const p: PoseId =
        s.act === 'work' ? 'type' : laid ? 'eat' : s.act === 'watch' ? 'sit' : 'sit';
      pose(this.me, p, t, { seat: 0.46 });
    }

    // The crew: at your door while serving (a course, the turndown, the welcome), else in the galley.
    const serving =
      (s.stage === 'boarding' && s.act === null) ||
      (s.act === 'dine' && s.course > 0) ||
      (sleeping && this.recline < 0.99);
    const crewGoal = serving
      ? new THREE.Vector3(SUITE.x1 + 0.45, 0, -0.1)
      : new THREE.Vector3(1.7, 0, -3.2);
    const cd = crewGoal.clone().sub(this.crew.root.position);
    if (cd.length() > 0.03) {
      this.crew.root.position.add(
        cd
          .clone()
          .normalize()
          .multiplyScalar(Math.min(cd.length(), dt * 1.2)),
      );
      this.crew.root.rotation.y = Math.atan2(cd.x, cd.z);
      pose(this.crew, 'walk', t);
    } else {
      this.crew.root.rotation.y = serving ? -Math.PI / 2 : 0;
      pose(this.crew, serving ? 'present' : 'idle', t);
    }
    // Two other passengers at the bar.
    this.others.forEach((c, n) => {
      c.root.position.set(-0.3 + n * 1.2, 0, -3.5);
      c.root.rotation.y = n ? -2.6 : 2.6;
      pose(c, 'chat', t, { phase: n + 1 });
    });
    this.particles.update(dt);
    return true;
  }

  dispose() {
    this.stage.scene.remove(this.root);
    disposeTree(this.root);
    for (const t of this.tex) t.dispose();
  }
}

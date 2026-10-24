/**
 * The business and first class lounge in 3D: one room, cut away at the
 * front, seen from above. Runway-view windows along the back (the apron a
 * floor below, a plane at the stand, the sky of the hour), the bar on the
 * left with its bartender, à la carte tables on the right laid with white
 * cloths, armchairs round low tables in the middle, the quiet room with its
 * daybeds behind a screen, the shower suites in frosted glass, and the host
 * at the desk by the door. Other travellers sit, eat, drink and chat; you go
 * where you choose (`setActivity`), walking there.
 *
 * First class is walnut, leather and gold; business is slate and teal.
 */
import * as THREE from 'three';
import { makePlane3D } from '../../three-kit/plane';
import type { AvatarLook } from '../art';
import { makeCharacter, pose, type Character, type PoseId } from '../../interiors3d/character';
import { buildModel } from '../../interiors3d/furniture';
import { Particles, fx } from '../../interiors3d/fx';
import { FLOOR_SCALE, disposeTree, floorTexture, mat, signTexture } from '../../interiors3d/kit';
import type { Stage } from '../../interiors3d/stage';

export type LoungeSpot = 'wait' | 'dine' | 'drink' | 'shower' | 'rest' | 'mingle' | 'board';

export const ROOM = { w: 13, d: 8 };
const BACK = -ROOM.d / 2;

interface Spot {
  at: THREE.Vector3;
  /** Facing (radians about y; 0 = +z). */
  ry: number;
  pose: PoseId;
  seat?: number;
}

/** Where you go for each act. */
const SPOTS: Record<LoungeSpot, Spot> = {
  wait: { at: new THREE.Vector3(0.95, 0, 0.35), ry: -Math.PI / 2, pose: 'read', seat: 0.5 },
  dine: { at: new THREE.Vector3(3.6, 0, -1.75), ry: Math.PI, pose: 'eat', seat: 0.48 },
  drink: { at: new THREE.Vector3(-4.6, 0, -1.75), ry: Math.PI, pose: 'drink', seat: 0.78 },
  shower: { at: new THREE.Vector3(4.9, 0, 2.55), ry: 0, pose: 'idle' },
  rest: { at: new THREE.Vector3(-5.0, 0, 1.55), ry: 0, pose: 'lie', seat: 0.42 },
  mingle: { at: new THREE.Vector3(1.55, 0, 2.0), ry: -2.4, pose: 'chat' },
  board: { at: new THREE.Vector3(0, 0, 5.6), ry: 0, pose: 'walk' },
};

/** Where the other travellers are (made-up ones first, then players). */
const CROWD: Spot[] = [
  { at: new THREE.Vector3(-0.95, 0, 0.35), ry: Math.PI / 2, pose: 'read', seat: 0.5 },
  { at: new THREE.Vector3(5.2, 0, -1.75), ry: Math.PI, pose: 'eat', seat: 0.48 },
  { at: new THREE.Vector3(-3.7, 0, -1.75), ry: Math.PI, pose: 'drink', seat: 0.78 },
  { at: new THREE.Vector3(2.3, 0, 1.45), ry: 0.8, pose: 'chat' },
  { at: new THREE.Vector3(-3.8, 0, 1.55), ry: 0, pose: 'lie', seat: 0.42 },
  { at: new THREE.Vector3(0, 0, -0.65), ry: 0, pose: 'type', seat: 0.5 },
  { at: new THREE.Vector3(2.6, 0, 2.45), ry: -1.2, pose: 'chat' },
  { at: new THREE.Vector3(5.2, 0, -0.1), ry: Math.PI, pose: 'eat', seat: 0.48 },
];

export interface LoungeOpts {
  cabin: 'business' | 'first';
  night: boolean;
  livery: string;
  me: AvatarLook;
  crowd: AvatarLook[];
  host: AvatarLook;
  bartender: AvatarLook;
  waiter: AvatarLook;
}

const PALETTE = {
  first: {
    wall: '#2a1d15',
    trim: '#c9a227',
    chair: '#8b5a2b',
    bar: '#5b3a22',
    floor: 'parquet-dark' as const,
    rug: '#3b2a20',
    sign: 'FIRST CLASS LOUNGE',
    signBg: '#0f0a07',
    signFg: '#fcd34d',
  },
  business: {
    wall: '#273241',
    trim: '#2dd4bf',
    chair: '#475569',
    bar: '#334155',
    floor: 'carpet' as const,
    rug: '#1e293b',
    sign: 'BUSINESS LOUNGE',
    signBg: '#0f172a',
    signFg: '#93c5fd',
  },
};

/** A tall canvas gradient for the sky behind the glass. */
function skyTexture(night: boolean): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 0, 128);
  if (night) {
    grad.addColorStop(0, '#0b1026');
    grad.addColorStop(1, '#3730a3');
  } else {
    grad.addColorStop(0, '#38bdf8');
    grad.addColorStop(1, '#e0f2fe');
  }
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class LoungeWorld {
  readonly root = new THREE.Group();
  private me: Character;
  private people: { c: Character; spot: Spot; n: number }[] = [];
  private staff: { c: Character; spot: Spot }[] = [];
  private waiter: Character;
  private particles = new Particles();
  private target: LoungeSpot = 'wait';
  private from = SPOTS.wait.at.clone();
  private moveAt = -1;
  private tex: THREE.Texture[] = [];
  private boardSign: THREE.Mesh;

  constructor(
    private stage: Stage,
    o: LoungeOpts,
  ) {
    const P = PALETTE[o.cabin];
    const first = o.cabin === 'first';
    stage.scene.add(this.root);
    stage.scene.background = new THREE.Color(o.night ? '#0b1026' : '#9cc9e6');

    // The floor and the walls (no front wall: the room is cut away for the camera).
    const ft = floorTexture(P.floor).clone();
    ft.needsUpdate = true;
    ft.repeat.set(ROOM.w / FLOOR_SCALE[P.floor], ROOM.d / FLOOR_SCALE[P.floor]);
    this.tex.push(ft);
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(ROOM.w, ROOM.d),
      mat('#ffffff', { map: ft, rough: 0.55, own: true }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.root.add(floor);
    const rug = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 3), mat(P.rug, { rough: 0.95 }));
    rug.rotation.x = -Math.PI / 2;
    rug.position.set(0, 0.008, 0.2);
    rug.receiveShadow = true;
    this.root.add(rug);
    const wallMat = mat(P.wall, { rough: 0.7 });
    for (const sx of [-1, 1]) {
      const w = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3.2, ROOM.d), wallMat);
      w.position.set((sx * ROOM.w) / 2, 1.6, 0);
      w.receiveShadow = true;
      this.root.add(w);
    }
    // The glass wall onto the apron: a sill, mullions, a header with the lounge's name.
    const sill = new THREE.Mesh(new THREE.BoxGeometry(ROOM.w, 0.45, 0.25), wallMat);
    sill.position.set(0, 0.225, BACK);
    this.root.add(sill);
    const glass = new THREE.Mesh(
      new THREE.PlaneGeometry(ROOM.w, 2.6),
      mat('#bfe3f5', { opacity: 0.12, rough: 0.05, own: true }),
    );
    glass.position.set(0, 1.75, BACK);
    this.root.add(glass);
    const trim = mat(P.trim, { rough: 0.3, metal: 0.6 });
    for (let k = 0; k <= 8; k++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.7, 0.08), trim);
      m.position.set(-ROOM.w / 2 + (k * ROOM.w) / 8, 1.8, BACK);
      this.root.add(m);
    }
    const header = new THREE.Mesh(new THREE.BoxGeometry(ROOM.w, 0.3, 0.2), wallMat);
    header.position.set(0, 3.15, BACK);
    this.root.add(header);
    const signTex = signTexture(P.sign, P.signBg, P.signFg);
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(2.6, 0.32),
      mat('#ffffff', { map: signTex, emissive: '#ffffff', emissiveIntensity: 0.35, own: true }),
    );
    sign.position.set(0, 3.15, BACK + 0.11);
    this.root.add(sign);

    // Outside: the sky, the apron a floor below, the runway and a plane at the stand.
    const skyT = skyTexture(o.night);
    this.tex.push(skyT);
    const sky = new THREE.Mesh(
      new THREE.PlaneGeometry(90, 30),
      new THREE.MeshBasicMaterial({ map: skyT, fog: false }),
    );
    sky.position.set(0, 6, BACK - 34);
    this.root.add(sky);
    const apron = new THREE.Mesh(
      new THREE.PlaneGeometry(90, 32),
      mat(o.night ? '#1f2937' : '#9ca3af', { rough: 0.9 }),
    );
    apron.rotation.x = -Math.PI / 2;
    apron.position.set(0, -3, BACK - 16);
    this.root.add(apron);
    const runway = new THREE.Mesh(
      new THREE.PlaneGeometry(90, 3.2),
      mat(o.night ? '#111827' : '#374151', { rough: 0.9 }),
    );
    runway.rotation.x = -Math.PI / 2;
    runway.position.set(0, -2.98, BACK - 22);
    this.root.add(runway);
    for (let k = -10; k <= 10; k++) {
      const dash = new THREE.Mesh(
        new THREE.PlaneGeometry(1.6, 0.18),
        mat('#f8fafc', {
          rough: 0.6,
          ...(o.night ? { emissive: '#fde68a', emissiveIntensity: 0.8 } : {}),
        }),
      );
      dash.rotation.x = -Math.PI / 2;
      dash.position.set(k * 4, -2.96, BACK - 22);
      this.root.add(dash);
    }
    const plane = makePlane3D({ kind: 'airliner', livery: o.livery, length: 16 });
    plane.root.position.set(-1.5, -3, BACK - 10);
    plane.root.rotation.y = Math.PI * 0.08;
    this.root.add(plane.root);

    // The bar (left), with stools, and the bartender behind it.
    const bar = buildModel('bar-counter', { w: 3.4, d: 1.4, tier: 3, tint: P.bar });
    bar.group.position.set(-4.2, 0, -2.6);
    this.root.add(bar.group);
    // Champagne on ice (first) or a coffee machine (business) on the counter.
    const top = new THREE.Group();
    const bucket = new THREE.Mesh(
      new THREE.CylinderGeometry(0.11, 0.09, 0.22, 14),
      mat('#d1d5db', { rough: 0.2, metal: 0.8 }),
    );
    bucket.position.set(0, 0.11, 0);
    top.add(bucket);
    const bottle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.04, 0.32, 10),
      mat(first ? '#14532d' : '#7c2d12', { rough: 0.3 }),
    );
    bottle.position.set(0, 0.28, 0);
    top.add(bottle);
    for (const x of [0.25, 0.38, 0.51]) {
      const flute = new THREE.Mesh(
        new THREE.CylinderGeometry(0.025, 0.012, 0.16, 8),
        mat(first ? '#fde68a' : '#fca5a5', { opacity: 0.75, rough: 0.1 }),
      );
      flute.position.set(x, 0.08, 0.05);
      top.add(flute);
    }
    top.position.set(-4.9, 1.11, -2.55);
    this.root.add(top);

    // À la carte (right): tables laid with white cloths, two chairs each.
    for (const [x, z, seed] of [
      [4.4, -1.75, 1],
      [4.4, -0.1, 3],
    ] as const) {
      const tb = buildModel('restaurant-table', { w: 1.2, d: 0.9, tier: 3, seed, tint: '#f8fafc' });
      tb.group.position.set(x, 0, z - 0.75);
      tb.group.rotation.y = Math.PI / 2;
      this.root.add(tb.group);
      for (const sx of [-1, 1]) {
        const ch = buildModel('armchair', { w: 0.7, d: 0.7, tier: 3, tint: P.chair });
        ch.group.scale.setScalar(0.85);
        ch.group.position.set(x + sx * 0.8, 0, z - 0.75);
        ch.group.rotation.y = sx > 0 ? -Math.PI / 2 : Math.PI / 2;
        this.root.add(ch.group);
      }
    }

    // Armchairs round low tables (the middle).
    for (const [x, z, ry] of [
      [-0.95, 0.35, Math.PI / 2],
      [0.95, 0.35, -Math.PI / 2],
      [0, -0.65, 0],
      [0, 1.35, Math.PI],
    ] as const) {
      const ch = buildModel('armchair', { w: 0.9, d: 0.9, tier: 3, tint: P.chair });
      ch.group.position.set(x, 0, z);
      ch.group.rotation.y = ry;
      this.root.add(ch.group);
    }
    const table = buildModel('coffee-table', { w: 1.1, d: 0.9, tier: 3 });
    table.group.position.set(0, 0, 0.35);
    this.root.add(table.group);

    // The quiet room (left front): daybeds behind a slatted screen.
    for (const x of [-5.0, -3.8]) {
      const bed = buildModel('lounger', {
        w: 0.8,
        d: 2,
        tier: 3,
        tint: first ? '#e9dcc3' : '#cbd5e1',
      });
      bed.group.position.set(x, 0, 2.1);
      bed.group.rotation.y = Math.PI;
      this.root.add(bed.group);
    }
    const screen = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 1.8, 2.6),
      mat(P.bar, { rough: 0.6 }),
    );
    screen.position.set(-2.9, 0.9, 2.5);
    screen.castShadow = true;
    this.root.add(screen);
    const quiet = new THREE.Mesh(
      new THREE.PlaneGeometry(1.4, 0.24),
      mat('#ffffff', {
        map: signTexture('QUIET ROOM', P.signBg, P.signFg),
        emissive: '#ffffff',
        emissiveIntensity: 0.3,
        own: true,
      }),
    );
    quiet.position.set(-2.85, 1.65, 2.5);
    quiet.rotation.y = Math.PI / 2;
    this.root.add(quiet);

    // The shower suites (right front): frosted glass, a rain shower inside.
    const sh = buildModel('shower', { w: 1.2, d: 1.2, tier: 3 });
    sh.group.position.set(4.9, 0, 2.35);
    this.root.add(sh.group);
    const frost = mat('#e0f2fe', { opacity: 0.38, rough: 0.2, own: true });
    for (const [w, d, x, z] of [
      [2.2, 0.06, 4.9, 1.45],
      [0.06, 2.2, 3.8, 2.55],
    ] as const) {
      const pane = new THREE.Mesh(new THREE.BoxGeometry(w, 2.2, d), frost);
      pane.position.set(x, 1.1, z);
      this.root.add(pane);
    }
    const showerSign = new THREE.Mesh(
      new THREE.PlaneGeometry(1.4, 0.24),
      mat('#ffffff', {
        map: signTexture('SHOWER SUITES', P.signBg, P.signFg),
        emissive: '#ffffff',
        emissiveIntensity: 0.3,
        own: true,
      }),
    );
    showerSign.position.set(4.9, 2.35, 1.41);
    this.root.add(showerSign);

    // The host's desk by the door (front middle), with a departures screen.
    const desk = buildModel('reception', { w: 2, d: 0.8, tier: 3, tint: P.bar });
    desk.group.position.set(-1.2, 0, 3.3);
    this.root.add(desk.group);
    this.boardSign = new THREE.Mesh(
      new THREE.PlaneGeometry(1.5, 0.5),
      mat('#ffffff', {
        map: signTexture('DEPARTURES', '#050505', '#fbbf24'),
        emissive: '#ffffff',
        emissiveIntensity: 0.5,
        own: true,
      }),
    );
    this.boardSign.position.set(ROOM.w / 2 - 0.11, 2.1, -1);
    this.boardSign.rotation.y = -Math.PI / 2;
    this.root.add(this.boardSign);
    for (const [x, z] of [
      [-6.1, -3.5],
      [6.1, -3.5],
      [-2.4, 3.6],
      [2.9, 0.8],
    ] as const) {
      const pl = buildModel('plants', { w: 0.6, d: 0.6, tier: 3 });
      pl.group.position.set(x, 0, z);
      this.root.add(pl.group);
    }
    // Warm lamps.
    for (const [x, z] of [
      [-4, -1.5],
      [0, 0.4],
      [4.2, -1],
    ] as const) {
      const l = new THREE.PointLight(first ? '#ffd9a0' : '#e0f2fe', first ? 6 : 4, 7, 1.6);
      l.position.set(x, 2.6, z);
      this.root.add(l);
    }

    // The people: you, the travellers, the host, the bartender and a waiter.
    this.me = makeCharacter(o.me, 'me');
    this.root.add(this.me.root);
    o.crowd.slice(0, CROWD.length).forEach((look, n) => {
      const c = makeCharacter(look, `lounge:${n}`);
      this.root.add(c.root);
      this.people.push({ c, spot: CROWD[n]!, n });
    });
    const host = makeCharacter(o.host, 'host');
    this.root.add(host.root);
    this.staff.push({
      c: host,
      spot: { at: new THREE.Vector3(-1.2, 0, 2.75), ry: 0, pose: 'idle' },
    });
    const bartender = makeCharacter(o.bartender, 'bartender');
    this.root.add(bartender.root);
    this.staff.push({
      c: bartender,
      spot: { at: new THREE.Vector3(-4.4, 0, -3.25), ry: 0, pose: 'stir' },
    });
    this.waiter = makeCharacter(o.waiter, 'waiter');
    this.root.add(this.waiter.root);
    this.root.add(this.particles.group);
    this.place(this.me, SPOTS.wait, 0);
  }

  /** Points the camera keeps in view. */
  fitPoints(): THREE.Vector3[] {
    return [-1, 1].flatMap((sx) =>
      [BACK, ROOM.d / 2].map((z) => new THREE.Vector3((sx * ROOM.w) / 2, z === BACK ? 3 : 0, z)),
    );
  }

  private place(c: Character, s: Spot, t: number) {
    c.root.position.copy(s.at);
    c.root.rotation.y = s.ry;
    pose(c, s.pose, t, { seat: s.seat });
  }

  /** Go and do something (you walk there). */
  setActivity(spot: LoungeSpot, t: number) {
    if (spot === this.target) return;
    this.from = this.me.root.position.clone();
    this.target = spot;
    this.moveAt = t;
  }

  /** Light the departures screen when the flight is called. */
  setCalled(called: boolean) {
    const m = this.boardSign.material as THREE.MeshStandardMaterial;
    m.emissiveIntensity = called ? 1.4 : 0.5;
    m.color.set(called ? '#fde68a' : '#ffffff');
  }

  /** A frame: returns true while something moves. */
  update(t: number, dt: number): boolean {
    const s = SPOTS[this.target];
    const walk = this.moveAt >= 0 ? Math.min(1, (t - this.moveAt) / 1.6) : 1;
    if (walk < 1) {
      const p = this.from.clone().lerp(s.at, walk);
      this.me.root.position.copy(p);
      const dir = s.at.clone().sub(this.from);
      if (dir.lengthSq() > 1e-4) this.me.root.rotation.y = Math.atan2(dir.x, dir.z);
      pose(this.me, 'walk', t);
    } else {
      this.moveAt = -1;
      this.place(this.me, s, t);
    }
    // In the shower: steam over the glass; on a daybed: Zs.
    if (this.target === 'shower' && walk >= 1)
      fx.steam(this.particles, new THREE.Vector3(4.9, 2.0, 2.35), dt, 14);
    if (this.target === 'rest' && walk >= 1)
      fx.zz(this.particles, new THREE.Vector3(-5.0, 1.0, 1.4), dt);
    this.me.root.visible = !(this.target === 'board' && walk >= 1);
    for (const p of this.people) this.place(p.c, p.spot, t + p.n * 0.7);
    for (const s2 of this.staff) this.place(s2.c, s2.spot, t);
    // The waiter goes between the bar and the tables.
    const k = (Math.sin(t * 0.35) + 1) / 2;
    const wp = new THREE.Vector3(-2.6, 0, -1.2).lerp(new THREE.Vector3(2.8, 0, -1.0), k);
    this.waiter.root.position.copy(wp);
    this.waiter.root.rotation.y = Math.cos(t * 0.35) > 0 ? Math.PI / 2 : -Math.PI / 2;
    pose(this.waiter, 'walk', t);
    this.particles.update(dt);
    return true;
  }

  dispose() {
    this.stage.scene.remove(this.root);
    disposeTree(this.root);
    for (const t of this.tex) t.dispose();
  }
}

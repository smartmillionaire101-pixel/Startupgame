/**
 * Wave 9 §B: who moves in the 3D city — your avatar (and the vehicle you
 * ride), the passers-by on the pavements, and traffic on the real roads
 * (instanced cars, taxis and buses, on the right or the left as the city
 * drives, up onto the bridges).
 */
import * as THREE from 'three';
import { makeCharacter, type Character } from '../../three-kit/character';
import { avatarLook, type AvatarLook } from '../art';
import type { VehicleSpec } from '../flavour';
import type { CityLayout, Pt } from '../layout';
import { personAt, type Walker } from '../people';
import { geoMetres } from '../geoLayout';
import { h3 } from './buildings';
import type { RoadIndex } from './roads';
import type { Tier } from './scene';

const LEFT_HAND = new Set(['london', 'nairobi', 'johannesburg']);

/** Taxis and buses by city (real colours). */
const FLEET: Record<string, { taxi: string; bus: string; double?: boolean }> = {
  'san-francisco': { taxi: '#f2c230', bus: '#c9302c' },
  london: { taxi: '#141414', bus: '#c8102e', double: true },
  lagos: { taxi: '#f2c230', bus: '#f2c230' },
  nairobi: { taxi: '#f5f5f4', bus: '#7c3aed' },
  accra: { taxi: '#f2c230', bus: '#f2c230' },
  freetown: { taxi: '#f2c230', bus: '#e9e4d8' },
  kigali: { taxi: '#2563eb', bus: '#1d4ed8' },
  johannesburg: { taxi: '#f5f5f4', bus: '#e8a33a' },
  cairo: { taxi: '#f5f5f4', bus: '#e9e4d8' },
  dubai: { taxi: '#d9c3a0', bus: '#e9e4d8' },
};
const CARS = [
  '#f4f4f2',
  '#c9cdd1',
  '#8f969d',
  '#2b2f36',
  '#1f3a5f',
  '#7a1f1f',
  '#e9e6df',
  '#4a4f55',
  '#b9bec4',
];

interface Car {
  pts: Float32Array;
  cum: Float32Array;
  len: number;
  speed: number;
  offset: number;
  bus: boolean;
  lane: number;
  /** A bus's stops: distance between them along its route (0: no stops). */
  stopGap: number;
}

/** How long a bus waits at a stop (s), and how far apart stops are (m). */
const DWELL = 7;
const STOP_EVERY = 420;
/** Lanes out from the centre line (m), by road class (motorway … tertiary). */
const LANES: number[][] = [[2, 5.5, 9], [2, 5.5, 9], [1.9, 5.2], [1.9, 5.2], [1.9], [1.8]];

/** Where a vehicle is along its route at time t (s): buses stop at their stops. */
export function routeS(c: Pick<Car, 'len' | 'speed' | 'offset' | 'stopGap'>, t: number) {
  if (!c.stopGap) return (c.offset + c.speed * t) % c.len;
  const n = Math.max(1, Math.floor(c.len / c.stopGap));
  const gap = c.len / n;
  const leg = gap / c.speed + DWELL;
  const tt = t + (c.offset / c.len) * n * leg;
  const k = Math.floor(tt / leg);
  const within = tt - k * leg;
  return ((k % n) * gap + Math.min(gap, within * c.speed)) % c.len;
}

const pick = <T>(arr: T[], r: number): T =>
  arr[Math.min(arr.length - 1, Math.floor(r * arr.length))]!;

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

export class Actors {
  private avatar: Character;
  private avatarGroup = new THREE.Group();
  private ride: THREE.Group | null = null;
  private pos = { x: 0, y: 0, h: 0, heading: 0 };
  private walking = false;
  private walkPhase = 0;
  private people: { w: Walker; c: Character }[] = [];
  private cars: Car[] = [];
  private carBody: THREE.InstancedMesh;
  private carCab: THREE.InstancedMesh;
  private busBody: THREE.InstancedMesh;
  private busBand: THREE.InstancedMesh;
  private lastT = 0;
  private dist = 700;
  private leftHand: boolean;
  /** Headlights and tail lights: four glowing points a vehicle (night only). */
  private carLights: THREE.Points | null = null;
  private night = 0;
  /** Driving your own car: the lane you keep to (m right of the centre line; left-hand cities negative). */
  private lane = 0;
  private centre = { x: 0, y: 0 };
  private wantHeading = 0;
  /** Bus stops: shelters on the kerb. */
  private shelters: THREE.InstancedMesh | null = null;

  constructor(
    private scene: THREE.Scene,
    layout: CityLayout,
    private roads: RoadIndex,
    look: AvatarLook,
    walkers: Walker[],
    tier: Tier,
    reduced: boolean,
    glow?: THREE.Material,
  ) {
    void reduced;
    this.leftHand = LEFT_HAND.has(layout.marketId);
    this.avatar = makeCharacter(look, { ring: '#f59e0b' });
    this.avatarGroup.add(this.avatar.root);
    scene.add(this.avatarGroup);
    this.setWalkers(walkers);

    // ---- Traffic.
    const fleet = FLEET[layout.marketId] ?? { taxi: '#f2c230', bus: '#e9e4d8' };
    const want = tier === 'high' ? 220 : 90;
    const lines = [...this.roads.lines].sort(
      (a, b) =>
        h3(Math.round(a.l[0]!), Math.round(a.l[1]!), 3) -
        h3(Math.round(b.l[0]!), Math.round(b.l[1]!), 3),
    );
    // The game's own traffic first (its routes), then the main roads.
    for (const v of layout.vehicles) {
      if (!v.path || v.path.length < 2) continue;
      this.addCar(
        v.path.flatMap((p) => {
          const m = geoMetres(p);
          return [m.e, m.s];
        }),
        v.spec.len >= 0.8,
        this.cars.length,
        3,
      );
    }
    for (let i = 0; this.cars.length < want && i < lines.length * 3; i++) {
      const ln = lines[i % lines.length]!;
      const fwd = h3(i, 17) < 0.5;
      const l = fwd ? ln.l : reversePts(ln.l);
      this.addCar(l, h3(i, 23) < 0.09 && ln.c >= 1, i, ln.c);
    }
    const n = this.cars.length;
    const nb = this.cars.filter((c) => c.bus).length;
    const carGeo = new THREE.BoxGeometry(4.4, 0.95, 1.85).translate(0, 0.78, 0);
    const cabGeo = new THREE.BoxGeometry(2.3, 0.6, 1.62).translate(-0.25, 1.55, 0);
    const busGeo = new THREE.BoxGeometry(11, 2.6, 2.5).translate(0, 1.6, 0);
    const bandGeo = new THREE.BoxGeometry(10.4, 0.8, 2.54).translate(0, 2.15, 0);
    const paint = new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.5 });
    const glass = new THREE.MeshStandardMaterial({
      color: '#1c242c',
      roughness: 0.15,
      metalness: 0.8,
    });
    this.carBody = new THREE.InstancedMesh(carGeo, paint, Math.max(1, n - nb));
    this.carCab = new THREE.InstancedMesh(cabGeo, glass, Math.max(1, n - nb));
    this.busBody = new THREE.InstancedMesh(busGeo, paint.clone(), Math.max(1, nb));
    this.busBand = new THREE.InstancedMesh(bandGeo, glass, Math.max(1, nb));
    const col = new THREE.Color();
    let ci = 0;
    let bi = 0;
    this.cars.forEach((c, i) => {
      if (c.bus) {
        col.set(fleet.bus);
        this.busBody.setColorAt(bi++, col);
      } else {
        col.set(h3(i, 5) < 0.18 ? fleet.taxi : CARS[Math.floor(h3(i, 7) * CARS.length)]!);
        this.carBody.setColorAt(ci++, col);
      }
    });
    if (fleet.double) this.busBody.scale.set(1, 1, 1);
    for (const m of [this.carBody, this.carCab, this.busBody, this.busBand]) {
      m.frustumCulled = false;
      // Phones: traffic casts no shadow (tiny from the air, and the shadow
      // map then needn't be redrawn for every car that moves).
      m.castShadow = tier === 'high';
      m.count = m === this.carBody || m === this.carCab ? n - nb : nb;
      scene.add(m);
    }
    if (glow && n) {
      const g = new THREE.BufferGeometry();
      const pos = new Float32Array(n * 4 * 3);
      const col: number[] = [];
      const size: number[] = [];
      for (const c of this.cars) {
        const k = c.bus ? 1.25 : 1;
        col.push(1, 0.93, 0.78, 1, 0.93, 0.78, 1, 0.12, 0.06, 1, 0.12, 0.06);
        size.push(3.4 * k, 3.4 * k, 2.2 * k, 2.2 * k);
      }
      g.setAttribute(
        'position',
        new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage),
      );
      g.setAttribute('aColor', new THREE.Float32BufferAttribute(col, 3));
      g.setAttribute('aSize', new THREE.Float32BufferAttribute(size, 1));
      g.setAttribute('aBlink', new THREE.Float32BufferAttribute(new Float32Array(n * 4), 1));
      this.carLights = new THREE.Points(g, glow);
      this.carLights.frustumCulled = false;
      this.carLights.renderOrder = 6;
      this.carLights.visible = false;
      scene.add(this.carLights);
    }
    this.buildShelters(scene);
    this.update(0, true);
  }

  /** How dark it is (0 day … 1 night): the cars put their lights on. */
  setNight(n: number) {
    this.night = n;
    if (this.carLights) this.carLights.visible = n > 0.02;
    if (this.shelters)
      (this.shelters.material as THREE.MeshStandardMaterial).emissiveIntensity = n * 0.9;
  }

  private addCar(l: number[], bus: boolean, i: number, cls: number) {
    if (l.length < 4) return;
    const pts = new Float32Array(l);
    const cum = new Float32Array(l.length / 2);
    let len = 0;
    for (let k = 1; k < cum.length; k++) {
      len += Math.hypot(pts[2 * k]! - pts[2 * k - 2]!, pts[2 * k + 1]! - pts[2 * k - 1]!);
      cum[k] = len;
    }
    if (len < 50) return;
    this.cars.push({
      pts,
      cum,
      len,
      speed: (bus ? 8 : 10) + h3(i, 11) * 7,
      offset: h3(i, 13) * len,
      bus,
      lane: bus
        ? (LANES[cls] ?? LANES[3]!).at(-1)! + 0.6
        : pick(LANES[cls] ?? LANES[3]!, h3(i, 19)),
      stopGap: bus && len > STOP_EVERY * 1.5 ? STOP_EVERY : 0,
    });
  }

  setWalkers(walkers: Walker[]) {
    for (const p of this.people) p.c.dispose();
    this.people = walkers.map((w) => {
      const c = makeCharacter(avatarLook(w.bg, w.id));
      this.scene.add(c.root);
      return { w, c };
    });
  }

  setLook(look: AvatarLook) {
    const parent = this.avatar.root.parent;
    this.avatar.dispose();
    this.avatar = makeCharacter(look, { ring: '#f59e0b' });
    parent?.add(this.avatar.root);
  }

  /** Where the avatar stands (tile point), and which way it moves. */
  setAvatar(p: Pt, dx = 0, dy = 0) {
    const m = geoMetres(p);
    this.centre.x = m.e;
    this.centre.y = m.s;
    if (!this.lane) {
      this.pos.x = m.e;
      this.pos.y = m.s;
    }
    this.pos.h = this.roads.deckAt(m.e, m.s);
    if (Math.abs(dx) + Math.abs(dy) > 1e-6) {
      // Tile direction → metres direction.
      const a = geoMetres({ x: p.x + dx, y: p.y + dy });
      this.wantHeading = Math.atan2(a.e - m.e, a.s - m.s);
      if (!this.lane) this.pos.heading = this.wantHeading;
    }
  }

  /**
   * Driving your own car (lane > 0: metres from the centre line, kept on the
   * right, or the left where the city drives on the left); 0 to stop. The
   * car turns smoothly into each street instead of snapping.
   */
  setDriving(lane: number) {
    this.lane = lane ? lane * (this.leftHand ? -1 : 1) : 0;
    this.pos.heading = this.wantHeading;
  }
  avatarPos() {
    return this.pos;
  }
  setWalking(on: boolean) {
    this.walking = on;
  }
  busy() {
    return this.walking;
  }

  /** Ride in (or on) a vehicle; null to step out. */
  setRide(spec: VehicleSpec | null) {
    if (this.ride) {
      this.ride.removeFromParent();
      this.ride = null;
    }
    this.avatar.root.visible = true;
    if (!spec) return;
    const g = new THREE.Group();
    const mat = (c: string, r = 0.4, m = 0.4) =>
      new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
    const box = (w: number, h: number, d: number, y: number, c: THREE.Material, z = 0) => {
      const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d).translate(0, y + h / 2, z), c);
      o.castShadow = true;
      g.add(o);
    };
    if (spec.extra === 'rider') {
      box(0.5, 0.6, 1.8, 0.3, mat(spec.body));
      box(0.1, 0.6, 0.1, 0.9, mat('#222'), 0.7);
      this.avatar.root.position.y = 0.45;
    } else if (spec.len >= 0.8) {
      const double = spec.extra === 'double';
      box(2.5, double ? 4.2 : 2.8, 11, 0.3, mat(spec.body, 0.4, 0.3));
      box(2.54, 0.8, 10.4, 1.7, mat('#1c242c', 0.15, 0.8));
      if (double) box(2.54, 0.8, 10.4, 3.2, mat('#1c242c', 0.15, 0.8));
      this.avatar.root.visible = false;
    } else {
      // A car (your own by its model: the SUV tall, the luxury one long and low).
      const model = spec.id.startsWith('my-car-') ? spec.id.slice(7) : '';
      const L =
        model === 'luxury' ? 5.1 : model === 'hatchback' ? 3.9 : model === 'city-suv' ? 4.6 : 4.4;
      const W = model === 'city-suv' ? 1.95 : 1.85;
      const bodyH = model === 'city-suv' ? 1.15 : model === 'luxury' ? 0.8 : 0.95;
      const cabH = model === 'city-suv' ? 0.75 : model === 'luxury' ? 0.52 : 0.6;
      const cabL = model === 'hatchback' ? L * 0.62 : L * 0.5;
      const glass = mat('#1c242c', 0.15, 0.8);
      box(W, bodyH, L, 0.35, mat(spec.body, 0.3, 0.6));
      box(W * 0.88, cabH, cabL, 0.35 + bodyH, glass, model === 'hatchback' ? -0.35 : -0.2);
      if (spec.extra === 'sign') box(0.6, 0.25, 0.3, 0.35 + bodyH + cabH, mat(spec.accent, 0.5, 0));
      if (model === 'luxury' || model === 'electric')
        box(W * 0.9, 0.08, 0.2, 0.35 + bodyH * 0.6, mat(spec.accent, 0.4, 0.8), L / 2);
      const tyre = mat('#111214', 0.9, 0);
      for (const sx of [-1, 1])
        for (const sz of [-1, 1]) {
          const w = new THREE.Mesh(
            new THREE.CylinderGeometry(0.36, 0.36, 0.28, 12).rotateZ(Math.PI / 2),
            tyre,
          );
          w.position.set(sx * (W / 2 - 0.08), 0.36, sz * (L / 2 - 0.75));
          g.add(w);
        }
      const head = new THREE.MeshStandardMaterial({
        color: '#fff6dd',
        emissive: '#fff1c8',
        emissiveIntensity: 1.2,
      });
      const tail = new THREE.MeshStandardMaterial({
        color: '#7f1d1d',
        emissive: '#ff2a1a',
        emissiveIntensity: 1.2,
      });
      for (const sx of [-1, 1]) {
        box(0.42, 0.18, 0.06, 0.35 + bodyH * 0.6, head, L / 2 + 0.01);
        g.children.at(-1)!.position.x = sx * (W / 2 - 0.35);
        box(0.42, 0.16, 0.06, 0.35 + bodyH * 0.65, tail, -L / 2 - 0.01);
        g.children.at(-1)!.position.x = sx * (W / 2 - 0.35);
      }
      this.avatar.root.visible = false;
    }
    this.ride = g;
    this.avatarGroup.add(g);
  }

  /** Advance everyone. Returns whether the avatar moved. */
  update(tMs: number, reduced: boolean, dist = this.dist) {
    this.dist = dist;
    const dt = this.lastT ? Math.min(0.1, (tMs - this.lastT) / 1000) : 0;
    this.lastT = tMs;
    // People are tiny from the air: they grow a little as the camera pulls back.
    const grow = Math.max(1, Math.min(9, dist / 140));
    if (this.lane) {
      // Turn towards the street's direction, then keep to the lane.
      let d = this.wantHeading - this.pos.heading;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.pos.heading += d * Math.min(1, dt * 7);
      const h = this.pos.heading;
      this.pos.x = this.centre.x - Math.cos(h) * this.lane;
      this.pos.y = this.centre.y + Math.sin(h) * this.lane;
    }
    const ag = this.avatarGroup;
    ag.position.set(this.pos.x, this.pos.h, this.pos.y);
    ag.rotation.y = this.pos.heading;
    ag.scale.setScalar(this.ride ? Math.max(1, Math.min(3, dist / 400)) : grow);
    if (this.walking && !this.ride) this.walkPhase += dt * 9;
    this.avatar.pose(this.walking && !this.ride ? 1 : 0, this.walkPhase);
    // Passers-by.
    const now = Date.now();
    for (const { w, c } of this.people) {
      const s = personAt(w, reduced ? 0 : now);
      const m = geoMetres(s.at);
      c.root.position.set(m.e, this.roads.deckAt(m.e, m.s), m.s);
      if (Math.abs(s.dx) + Math.abs(s.dy) > 1e-6) {
        const a = geoMetres({ x: s.at.x + s.dx, y: s.at.y + s.dy });
        c.root.rotation.y = Math.atan2(a.e - m.e, a.s - m.s);
      }
      c.root.scale.setScalar(Math.min(grow, 5));
      c.pose(s.walking && !reduced ? 1 : 0, (now / 1000) * 9 + w.phase * 10);
    }
    // Traffic.
    const t = reduced ? 0 : tMs / 1000;
    const vs = Math.max(1, Math.min(2.2, dist / 600));
    let ci = 0;
    let bi = 0;
    const lp =
      this.carLights && this.night > 0.02
        ? (this.carLights.geometry.getAttribute('position') as THREE.BufferAttribute)
        : null;
    let li = 0;
    for (const c of this.cars) {
      const s = routeS(c, t);
      // Binary search the segment.
      let lo = 0;
      let hi = c.cum.length - 1;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (c.cum[mid]! <= s) lo = mid;
        else hi = mid;
      }
      const ax = c.pts[2 * lo]!;
      const ay = c.pts[2 * lo + 1]!;
      const bx = c.pts[2 * hi]!;
      const by = c.pts[2 * hi + 1]!;
      const L = c.cum[hi]! - c.cum[lo]! || 1;
      const u = (s - c.cum[lo]!) / L;
      const dx = (bx - ax) / L;
      const dy = (by - ay) / L;
      const side = this.leftHand ? -1 : 1;
      const x = ax + (bx - ax) * u + -dy * c.lane * side;
      const y = ay + (by - ay) * u + dx * c.lane * side;
      _q.setFromAxisAngle(_up, -Math.atan2(dy, dx));
      _p.set(x, this.roads.deckAt(x, y), y);
      _s.set(vs, vs, vs);
      _m.compose(_p, _q, _s);
      if (lp) {
        // Front pair white, back pair red, a little in from the corners.
        const half = (c.bus ? 5.5 : 2.2) * vs;
        const side = (c.bus ? 1.0 : 0.68) * vs;
        const hy = _p.y + (c.bus ? 1.1 : 0.75) * vs;
        const a = lp.array as Float32Array;
        for (const [f, sg] of [
          [1, 1],
          [1, -1],
          [-1, 1],
          [-1, -1],
        ] as const) {
          a[li * 3] = x + dx * half * f - dy * side * sg;
          a[li * 3 + 1] = hy;
          a[li * 3 + 2] = y + dy * half * f + dx * side * sg;
          li++;
        }
      }
      if (c.bus) {
        this.busBody.setMatrixAt(bi, _m);
        this.busBand.setMatrixAt(bi++, _m);
      } else {
        this.carBody.setMatrixAt(ci, _m);
        this.carCab.setMatrixAt(ci++, _m);
      }
    }
    for (const m of [this.carBody, this.carCab, this.busBody, this.busBand])
      m.instanceMatrix.needsUpdate = true;
    if (lp) lp.needsUpdate = true;
    return this.walking;
  }

  /** The bus stops: a shelter on the kerb every few hundred metres of every route. */
  private buildShelters(scene: THREE.Scene) {
    const spots: { x: number; y: number; a: number }[] = [];
    for (const c of this.cars) {
      if (!c.stopGap) continue;
      const n = Math.max(1, Math.floor(c.len / c.stopGap));
      const gap = c.len / n;
      for (let k = 0; k < n; k++) {
        const s = k * gap + gap * 0.999;
        let i = 1;
        while (i < c.cum.length - 1 && c.cum[i]! < s) i++;
        const ax = c.pts[2 * i - 2]!;
        const ay = c.pts[2 * i - 1]!;
        const bx = c.pts[2 * i]!;
        const by = c.pts[2 * i + 1]!;
        const L = Math.hypot(bx - ax, by - ay) || 1;
        const u = Math.max(0, Math.min(1, (s - c.cum[i - 1]!) / L));
        const dx = (bx - ax) / L;
        const dy = (by - ay) / L;
        const side = (this.leftHand ? -1 : 1) * (c.lane + 3.4);
        spots.push({
          x: ax + (bx - ax) * u - dy * side,
          y: ay + (by - ay) * u + dx * side,
          a: Math.atan2(dy, dx),
        });
      }
    }
    if (!spots.length) return;
    const geo = new THREE.BoxGeometry(4, 2.6, 1.4).translate(0, 1.3, 0);
    const mat = new THREE.MeshStandardMaterial({
      color: '#9fb7c9',
      roughness: 0.3,
      metalness: 0.4,
      emissive: '#ffe2a8',
      emissiveIntensity: 0,
    });
    const m = new THREE.InstancedMesh(geo, mat, spots.length);
    spots.forEach((p, i) => {
      _q.setFromAxisAngle(_up, -p.a);
      _p.set(p.x, this.roads.deckAt(p.x, p.y), p.y);
      _s.set(1, 1, 1);
      _m.compose(_p, _q, _s);
      m.setMatrixAt(i, _m);
    });
    m.castShadow = true;
    this.shelters = m;
    scene.add(m);
  }

  /** Bus stops along the routes (for tests and the night glow). */
  stops() {
    return this.shelters?.count ?? 0;
  }

  dispose() {
    this.avatar.dispose();
    for (const p of this.people) p.c.dispose();
  }
}

function reversePts(l: number[]) {
  const r: number[] = [];
  for (let i = l.length - 2; i >= 0; i -= 2) r.push(l[i]!, l[i + 1]!);
  return r;
}

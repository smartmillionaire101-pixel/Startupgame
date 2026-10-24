/**
 * Wave 9 §B: who moves in the 3D city — your avatar (and the vehicle you
 * ride), the passers-by on the pavements, and traffic on the real roads
 * (instanced cars, taxis and buses, on the right or the left as the city
 * drives, up onto the bridges). People and vehicles are drawn to one scale
 * (a person about as tall as a car's roof), and the game's centre-line paths
 * are walked on the pavement and driven in the lane (./pavement).
 */
import * as THREE from 'three';
import { makeCharacter, type Character } from '../../three-kit/character';
import { avatarLook, type AvatarLook } from '../art';
import type { VehicleSpec } from '../flavour';
import type { CityLayout, Place, Pt } from '../layout';
import { personAt, type Walker } from '../people';
import { geoMetres, geoTile } from '../geoLayout';
import { h3 } from './buildings';
import type { RoadIndex } from './roads';
import type { Tier } from './scene';
import { dedupe, KERB, offsetPath, pavementPath, sideOf, type P2 } from './pavement';
import { RouteLine } from './routeline';
import {
  buildGraph,
  fleetOf,
  kindOfSlot,
  LANE,
  trafficBudget,
  TrafficSim,
  type Lead,
  type VehicleKind,
} from './traffic';
import { softwareGl } from '../../three-kit/quality';

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
const _l = new THREE.Vector3();
/** Where each kind's lights sit on its model (half length, half width, height, before scaling). */
const LIGHT_AT: Record<VehicleKind, { half: number; side: number; h: number; size: number }> = {
  car: { half: 2.2, side: 0.68, h: 0.75, size: 1 },
  bus: { half: 5, side: 1, h: 1.1, size: 1.25 },
  moto: { half: 0.95, side: 0, h: 0.7, size: 0.8 },
  keke: { half: 1.3, side: 0.5, h: 0.8, size: 0.9 },
};

/** While you drive: how far around your car the traffic lives (metres). */
const DRIVE_TRAFFIC_R = 180;
/**
 * While you drive, the trip runs faster than life (kilometres in a few
 * seconds): the traffic around you runs that much faster too, so it keeps
 * pace with you instead of standing still (and you don't have to drive
 * through it). A side street's real speed is about 8 m/s.
 */
const TOWN_SPEED = 8;

/** How much larger than life vehicles are drawn as the camera pulls back (still to be seen from the air). */
const vehicleScale = (dist: number) => Math.max(1, Math.min(2.6, dist / 300));
/**
 * People, to the same scale as the vehicles: a person stands about as high
 * as a car's roof and a car is well over twice as long as a person is tall
 * (a touch over life size, to read on a phone).
 */
export const personScale = (dist: number) => vehicleScale(dist) * 1.1;
/** Your ring on the ground grows on as before (it's how you find yourself from the air). */
const ringScale = (dist: number) => Math.max(1, Math.min(9, dist / 140));

/** A door's key (to a hundredth of a tile, about 30 cm: a position read back from storage still finds it). */
const tileKey = (p: Pt) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`;
const toM = (p: Pt): P2 => {
  const m = geoMetres(p);
  return { x: m.e, y: m.s };
};
const toTile = (p: P2): Pt => geoTile(p.x, p.y);

export class Actors {
  private avatar: Character;
  private avatarGroup = new THREE.Group();
  private ride: THREE.Group | null = null;
  private pos = { x: 0, y: 0, h: 0, heading: 0 };
  private walking = false;
  private walkPhase = 0;
  private people: { w: Walker; c: Character; route: P2[] }[] = [];
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
  /** Driving your own car (1; 0 not): its path is already in the lane (streetPath). */
  private lane = 0;
  /** Driving: how much faster than life the traffic runs (keeping pace with you). */
  private timeScale = 1;
  /** Your vehicle's length (m), for keeping your distance. */
  private rideLen = 4.4;
  /** Driving: the route ahead, on the road. */
  private routeLine = new RouteLine();
  /** The game's doors (tile key) → the middle of their building (metres): which side of the road you step out on. */
  private doors = new Map<string, P2>();
  private centre = { x: 0, y: 0 };
  private wantHeading = 0;
  /** Bus stops: shelters on the kerb. */
  private shelters: THREE.InstancedMesh | null = null;
  /** Street traffic around you (the roads you're on are never empty). */
  private local: TrafficSim | null = null;
  private localMeshes: Record<VehicleKind, THREE.InstancedMesh[]> | null = null;
  /** The street traffic's headlights and tail lights (night only), and its kinds in slot order. */
  private localLights: THREE.Points | null = null;
  private localKinds: VehicleKind[] = [];
  private glowMat: THREE.Material | undefined;
  private globalMeshes: THREE.Object3D[] = [];
  private localT = 0;
  private filled = false;
  private focus = { x: 0, y: 0, r: 400 };
  private focusSet = false;
  private doubleDecker = false;

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
    this.glowMat = glow;
    this.leftHand = LEFT_HAND.has(layout.marketId);
    this.avatar = makeCharacter(look, { ring: '#f59e0b' });
    this.avatarGroup.add(this.avatar.root);
    scene.add(this.avatarGroup);
    scene.add(this.routeLine.mesh);
    this.setPlaces(layout.places);
    this.setWalkers(walkers);

    // ---- Traffic.
    const fleet = FLEET[layout.marketId] ?? { taxi: '#f2c230', bus: '#e9e4d8' };
    // Through-traffic on the main roads, everywhere (fewer on a software GPU).
    const soft = softwareGl();
    const want = soft ? 45 : tier === 'high' ? 120 : 70;
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
    this.globalMeshes = [this.carBody, this.carCab, this.busBody, this.busBand];
    if (this.carLights) this.globalMeshes.push(this.carLights);
    this.buildShelters(scene);
    this.buildLocal(scene, layout.marketId, tier, soft);
    this.update(0, true);
  }

  /** The traffic that lives around you: cars, taxis, buses, motorbikes and tricycles. */
  private buildLocal(scene: THREE.Scene, marketId: string, tier: Tier, soft: boolean) {
    const fleet = fleetOf(marketId);
    this.doubleDecker = !!FLEET[marketId]?.double;
    let seed = 0;
    for (let i = 0; i < marketId.length; i++) seed = (seed * 31 + marketId.charCodeAt(i)) | 0;
    const n = trafficBudget(tier, soft);
    const kinds = Array.from({ length: n }, (_, k) => kindOfSlot(fleet, seed, k));
    const graph = buildGraph(this.roads.segs);
    if (!graph.ea.length) return;
    this.local = new TrafficSim(graph, kinds, seed, this.leftHand);
    // The passers-by were set before the road graph: again, now their crossings are known.
    for (const p of this.people) p.route = this.pavementLoop(p.w.route);
    const count = (k: VehicleKind) => Math.max(1, kinds.filter((x) => x === k).length);
    const paint = new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.35 });
    const dark = new THREE.MeshStandardMaterial({
      color: '#1c242c',
      roughness: 0.2,
      metalness: 0.7,
    });
    const cloth = new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0 });
    const mk = (geo: THREE.BufferGeometry, mat: THREE.Material, k: VehicleKind) => {
      const m = new THREE.InstancedMesh(geo, mat, count(k));
      m.frustumCulled = false;
      m.castShadow = tier === 'high' && !soft;
      m.count = kinds.filter((x) => x === k).length;
      scene.add(m);
      return m;
    };
    this.localMeshes = {
      car: [
        mk(new THREE.BoxGeometry(4.4, 0.95, 1.85).translate(0, 0.78, 0), paint, 'car'),
        mk(new THREE.BoxGeometry(2.3, 0.6, 1.62).translate(-0.25, 1.55, 0), dark, 'car'),
      ],
      bus: [
        mk(new THREE.BoxGeometry(10, 2.4, 2.4).translate(0, 1.5, 0), paint.clone(), 'bus'),
        mk(new THREE.BoxGeometry(9.4, 0.75, 2.44).translate(0, 2.0, 0), dark, 'bus'),
      ],
      moto: [
        mk(new THREE.BoxGeometry(1.9, 0.6, 0.45).translate(0, 0.55, 0), dark, 'moto'),
        mk(new THREE.BoxGeometry(0.55, 0.85, 0.55).translate(-0.1, 1.3, 0), cloth, 'moto'),
      ],
      keke: [
        mk(new THREE.BoxGeometry(2.6, 1.1, 1.4).translate(0, 0.85, 0), paint.clone(), 'keke'),
        mk(new THREE.BoxGeometry(2.4, 0.12, 1.5).translate(-0.1, 1.95, 0), dark, 'keke'),
      ],
    };
    const col = new THREE.Color();
    const idx: Record<VehicleKind, number> = { car: 0, bus: 0, moto: 0, keke: 0 };
    kinds.forEach((k, i) => {
      const j = idx[k]++;
      if (k === 'car')
        col.set(
          h3(seed, i, 5) < fleet.taxiShare
            ? fleet.taxi
            : CARS[Math.floor(h3(seed, i, 7) * CARS.length)]!,
        );
      else if (k === 'bus') col.set(fleet.bus[j % fleet.bus.length]!);
      else if (k === 'keke') col.set(fleet.keke);
      else col.set(CARS[Math.floor(h3(seed, i, 9) * CARS.length)]!);
      // Motorbikes: the rider's shirt carries the colour.
      this.localMeshes![k][k === 'moto' ? 1 : 0]!.setColorAt(j, col);
    });
    this.localKinds = kinds;
    if (this.glowMat) {
      // Four points a vehicle: the front pair white, the back pair red.
      const g = new THREE.BufferGeometry();
      const col: number[] = [];
      const size: number[] = [];
      for (const k of kinds) {
        const z = LIGHT_AT[k].size;
        col.push(1, 0.93, 0.78, 1, 0.93, 0.78, 1, 0.12, 0.06, 1, 0.12, 0.06);
        size.push(3.4 * z, 3.4 * z, 2.2 * z, 2.2 * z);
      }
      g.setAttribute(
        'position',
        // Out of sight until the traffic has been placed.
        new THREE.BufferAttribute(
          new Float32Array(n * 4 * 3).map((_, i) => (i % 3 === 1 ? -1e4 : 0)),
          3,
        ).setUsage(THREE.DynamicDrawUsage),
      );
      g.setAttribute('aColor', new THREE.Float32BufferAttribute(col, 3));
      g.setAttribute('aSize', new THREE.Float32BufferAttribute(size, 1));
      g.setAttribute('aBlink', new THREE.Float32BufferAttribute(new Float32Array(n * 4), 1));
      this.localLights = new THREE.Points(g, this.glowMat);
      this.localLights.frustumCulled = false;
      this.localLights.renderOrder = 6;
      this.localLights.visible = false;
      scene.add(this.localLights);
    }
  }

  /** The street traffic's lights, from where each vehicle was just drawn. */
  private placeLocalLights(meshes: Record<VehicleKind, THREE.InstancedMesh[]>) {
    const pts = this.localLights;
    if (!pts || !(this.night > 0.02)) return;
    const pos = pts.geometry.getAttribute('position') as THREE.BufferAttribute;
    const a = pos.array as Float32Array;
    const idx: Record<VehicleKind, number> = { car: 0, bus: 0, moto: 0, keke: 0 };
    let li = 0;
    for (const k of this.localKinds) {
      meshes[k][0]!.getMatrixAt(idx[k]++, _m);
      // A hidden vehicle (scaled to nothing) keeps its lights out of sight too.
      const hidden = Math.abs(_m.elements[0]!) + Math.abs(_m.elements[2]!) < 1e-6;
      const L = LIGHT_AT[k];
      for (const [f, sg] of [
        [1, 1],
        [1, -1],
        [-1, 1],
        [-1, -1],
      ] as const) {
        if (hidden) _l.set(0, -1e4, 0);
        else _l.set(L.half * f, L.h, L.side * sg).applyMatrix4(_m);
        a[li * 3] = _l.x;
        a[li * 3 + 1] = _l.y;
        a[li * 3 + 2] = _l.z;
        li++;
      }
    }
    pos.needsUpdate = true;
  }

  /** Vehicles on the streets now (the main-road fleet and the traffic around you). */
  trafficCount() {
    return this.cars.length + (this.local?.count() ?? 0);
  }

  /** Where the camera looks: traffic lives around it (or around your car when you drive). */
  setFocus(x: number, y: number, dist: number) {
    // Flown somewhere else: the traffic starts again there.
    if (Math.hypot(x - this.focus.x, y - this.focus.y) > this.focus.r * 2) this.filled = false;
    this.focusSet = true;
    this.focus.x = x;
    this.focus.y = y;
    this.focus.r = Math.max(320, Math.min(1500, dist * 1.1));
  }

  private updateLocal(tMs: number, reduced: boolean, vs: number) {
    const sim = this.local;
    const meshes = this.localMeshes;
    if (!sim || !meshes || (!this.focusSet && !this.lane)) return;
    // Driving: the traffic gathers on the streets around your car (the chase
    // camera sees a hundred metres or so), not spread over half a kilometre.
    // Its centre sits ahead of you, so the traffic you'll meet is on the road in front.
    const hx = Math.sin(this.pos.heading);
    const hy = Math.cos(this.pos.heading);
    const f = this.lane
      ? {
          x: this.pos.x + hx * DRIVE_TRAFFIC_R * 0.4,
          y: this.pos.y + hy * DRIVE_TRAFFIC_R * 0.4,
          r: DRIVE_TRAFFIC_R,
          hx,
          hy,
        }
      : this.focus;
    if (!this.filled) {
      sim.fill(f);
      this.filled = true;
      this.localT = tMs;
    }
    // Steps of at most a quarter second (a software GPU draws a few frames a
    // second); while the traffic runs at your pace, shorter ones (a few metres
    // each, so no one jumps through the car in front or into a junction
    // another is crossing), at most 100 a frame.
    let dt = this.localT ? Math.min(1, (tMs - this.localT) / 1000) : 0;
    this.localT = tMs;
    if (reduced) dt = 0;
    dt *= this.lane ? this.timeScale : 1;
    sim.size = vs;
    const n = Math.min(100, Math.ceil(dt / (this.lane ? 0.15 : 0.25)));
    for (let i = 0; i < n; i++) sim.step(dt / n, f, { x: this.pos.x, y: this.pos.y });
    const idx: Record<VehicleKind, number> = { car: 0, bus: 0, moto: 0, keke: 0 };
    for (const v of sim.vehicles) {
      const j = idx[v.kind]++;
      if (v.e < 0) _s.set(0, 0, 0);
      else if (v.kind === 'bus' && this.doubleDecker) _s.set(vs, vs * 1.6, vs);
      else _s.set(vs, vs, vs);
      _q.setFromAxisAngle(_up, -Math.atan2(v.dy, v.dx));
      _p.set(v.x, this.roads.deckAt(v.x, v.y), v.y);
      _m.compose(_p, _q, _s);
      for (const m of meshes[v.kind]) m.setMatrixAt(j, _m);
    }
    for (const list of Object.values(meshes))
      for (const m of list) m.instanceMatrix.needsUpdate = true;
    this.placeLocalLights(meshes);
  }

  /** How dark it is (0 day … 1 night): the cars put their lights on. */
  setNight(n: number) {
    this.night = n;
    if (this.carLights) this.carLights.visible = n > 0.02;
    if (this.localLights) this.localLights.visible = n > 0.02;
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
    // A software GPU draws fewer of them.
    this.people = walkers.slice(0, softwareGl() ? 8 : walkers.length).map((w) => {
      const c = makeCharacter(avatarLook(w.bg, w.id));
      this.scene.add(c.root);
      return { w, c, route: this.pavementLoop(w.route) };
    });
  }

  /**
   * A passer-by's walk out along the road and back, on the pavement: out on
   * the side of the building they came from, and back along the same side.
   */
  private pavementLoop(route: Pt[]): P2[] {
    const n = route.length;
    // The route is a walk out and the same walk back (see people.ts).
    const there = route.slice(0, (n + 1) >> 1);
    const back = route.slice((n - 1) >> 1);
    const mirrored =
      n > 2 && there.every((p, i) => tileKey(p) === tileKey(back[back.length - 1 - i]!));
    if (!mirrored) return this.streetPathM(route, 'walk');
    const out = this.streetPathM(there, 'walk', true);
    return [...out, ...out.slice(0, -1).reverse()];
  }

  /** The buildings' doors, for stepping out on the right side of the road. */
  setPlaces(places: readonly Place[]) {
    this.doors.clear();
    for (const p of places)
      this.doors.set(tileKey(p.door), toM({ x: p.x + p.w / 2, y: p.y + p.d / 2 }));
  }

  /** Whether a point (metres) is a junction of three or more ways. */
  private junction(p: P2) {
    const g = this.local?.g;
    const n = g?.ids.get(`${Math.round(p.x)},${Math.round(p.y)}`);
    return n !== undefined && g!.adj[n]!.length >= 3;
  }

  /**
   * Off the road: a door (or any point standing in a road) moved out to the
   * pavement, on its building's side. Metres in and out.
   */
  private kerbOf(p: P2, toward?: P2): P2 {
    const r = this.roads.nearest(p.x, p.y, 16);
    if (!r) return p;
    const kerb = KERB[r.c] ?? 5;
    if (r.d >= kerb - 0.8) return p;
    let nx = -Math.sin(r.angle);
    let ny = Math.cos(r.angle);
    const ref = toward ?? p;
    if ((ref.x - r.x) * nx + (ref.y - r.y) * ny < 0) {
      nx = -nx;
      ny = -ny;
    }
    return { x: r.x + nx * kerb, y: r.y + ny * kerb };
  }

  /**
   * A path of the game's (tiles, along the road centre lines, door to door)
   * as it's taken on the street: on the pavement on foot (crossing only at a
   * junction), or in your lane in a vehicle (out from the kerb and back in to
   * it at the end). Tiles in and out.
   */
  streetPath(path: readonly Pt[], how: 'walk' | 'lane', fromLane = false): Pt[] {
    return this.streetPathM(path, how, false, fromLane).map(toTile);
  }

  private streetPathM(
    path: readonly Pt[],
    how: 'walk' | 'lane',
    sameSide = false,
    fromLane = false,
  ): P2[] {
    const raw = path.map(toM);
    let m = dedupe(raw);
    if (m.length < 2) return raw;
    // Each end: where you stand there (a door, or any point in a road, is on
    // the pavement beside it: its building's side) says which side of the
    // road it is; a point already off the road (a stub across to it) too.
    const endOf = (first: boolean) => {
      const tile = first ? path[0]! : path[path.length - 1]!;
      const p = first ? m[0]! : m[m.length - 1]!;
      const q = first ? m[1]! : m[m.length - 2]!;
      const r = first ? m[2] : m[m.length - 3];
      // Travel direction at this end: away from the start, towards the end.
      const [a, b] = first ? [p, q] : [q, p];
      const stand = this.kerbOf(p, this.doors.get(tileKey(tile)));
      if (stand !== p) return { side: sideOf(a, b, stand), stub: false };
      if (r && Math.hypot(q.x - p.x, q.y - p.y) < 16) {
        const [c, d] = first ? [q, r] : [r, q];
        const u = Math.hypot(d.x - c.x, d.y - c.y) || 1;
        const w = Math.hypot(q.x - p.x, q.y - p.y) || 1;
        const dot = ((d.x - c.x) * (q.x - p.x) + (d.y - c.y) * (q.y - p.y)) / (u * w);
        if (Math.abs(dot) < 0.5) return { side: sideOf(c, d, p), stub: true };
      }
      return { side: 1 as const, stub: false };
    };
    const s0 = endOf(true);
    const s1 = sameSide ? s0 : endOf(false);
    const first = m[0]!;
    const last = m[m.length - 1]!;
    if (s0.stub) m = m.slice(1);
    if (s1.stub && m.length > 2) m = m.slice(0, -1);
    const cls = m.slice(1).map((b, i) => {
      const a = m[i]!;
      return this.roads.nearest((a.x + b.x) / 2, (a.y + b.y) / 2, 30)?.c ?? 5;
    });
    let out: P2[];
    if (how === 'walk') {
      const kerb = cls.map((c) => KERB[c] ?? 5);
      // Kept to one pavement: a walk out and back mirrors the end's side.
      out = pavementPath(m, kerb, s0.side, sameSide ? s0.side : s1.side, (k) =>
        this.junction(m[k]!),
      );
    } else {
      // Your lane all the way, out from the kerb at the start and in to it at the end.
      const sg = this.leftHand ? -1 : 1;
      const lane = offsetPath(
        m,
        cls.map((c) => sg * (LANE[c] ?? 2)),
      );
      const kerbAt = (p: P2, a: P2, b: P2, c: number) => {
        const L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        const k = sg * Math.max(LANE[c] ?? 2, (KERB[c] ?? 5) - 2.6);
        return { x: p.x - ((b.y - a.y) / L) * k, y: p.y + ((b.x - a.x) / L) * k };
      };
      const n = m.length;
      out = [
        // On from your lane (re-routing mid-trip), or out from the kerb.
        fromLane ? lane[0]! : kerbAt(m[0]!, m[0]!, m[1]!, cls[0]!),
        ...lane.slice(1, -1),
        kerbAt(m[n - 1]!, m[n - 2]!, m[n - 1]!, cls[n - 2]!),
      ];
    }
    // Off-road ends (where you stood) join on as they were.
    if (s0.stub) out.unshift(first);
    if (s1.stub && !sameSide) out.push(last);
    return out;
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
      // Standing still (at a door, or anywhere): on the pavement, never in the road.
      const still = Math.abs(dx) + Math.abs(dy) < 1e-6;
      const at = still ? this.kerbOf({ x: m.e, y: m.s }, this.doors.get(tileKey(p))) : null;
      this.pos.x = at?.x ?? m.e;
      this.pos.y = at?.y ?? m.s;
    }
    this.pos.h = this.roads.deckAt(m.e, m.s);
    if (!this.focusSet) {
      this.focus.x = m.e;
      this.focus.y = m.s;
      this.focusSet = true;
    }
    if (Math.abs(dx) + Math.abs(dy) > 1e-6) {
      // Tile direction → metres direction.
      const a = geoMetres({ x: p.x + dx, y: p.y + dy });
      this.wantHeading = Math.atan2(a.e - m.e, a.s - m.s);
      if (!this.lane) this.pos.heading = this.wantHeading;
    }
  }

  /**
   * Driving your own car along `path` (tiles, the road centre lines; you
   * place the car on its lane-side path, from streetPath) at about `cruise`
   * m/s; off to stop. The car turns smoothly into each street instead of
   * snapping, and the traffic around you runs at your pace, more of it on
   * your route.
   */
  setDriving(on: boolean, path?: readonly Pt[], cruise = 0) {
    this.lane = on ? 1 : 0;
    this.pos.heading = this.wantHeading;
    this.timeScale = on ? Math.max(1, Math.min(80, cruise / TOWN_SPEED)) : 1;
    this.local?.setRoute(on && path && path.length > 1 ? path.map(toM) : null);
  }

  /** How much faster than life the traffic runs now (your trip's pace). */
  get pace() {
    return this.lane ? this.timeScale : 1;
  }

  /** The road at a point (metres): its class and name. */
  roadAt(x: number, y: number) {
    return this.roads.nearest(x, y, 25);
  }

  /** Driving: the route ahead, laid on the road (map metres); null to take it up. */
  setRouteLine(pts: readonly P2[] | null) {
    this.routeLine.set(pts, (x, y) => this.roads.deckAt(x, y));
  }

  /**
   * Driving: the vehicle in front of you in your lane, if any (the gap to
   * its back in metres and its speed in m/s, at the trip's pace).
   */
  leadAhead(): Lead | null {
    if (!this.local || !this.lane) return null;
    const h = this.pos.heading;
    const lead = this.local.leadOf(this.pos.x, this.pos.y, Math.sin(h), Math.cos(h), this.rideLen);
    return lead && { gap: lead.gap, v: lead.v * this.timeScale };
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
    this.rideLen = 4.4;
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
      this.rideLen = 11;
      box(2.54, 0.8, 10.4, 1.7, mat('#1c242c', 0.15, 0.8));
      if (double) box(2.54, 0.8, 10.4, 3.2, mat('#1c242c', 0.15, 0.8));
      this.avatar.root.visible = false;
    } else {
      // A car (your own by its model: the SUV tall, the luxury one long and low).
      const model = spec.id.startsWith('my-car-') ? spec.id.slice(7) : '';
      const L =
        model === 'luxury' ? 5.1 : model === 'hatchback' ? 3.9 : model === 'city-suv' ? 4.6 : 4.4;
      const W = model === 'city-suv' ? 1.95 : 1.85;
      this.rideLen = L;
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
    // People are tiny from the air: they grow a little as the camera pulls
    // back, to the same scale as the traffic.
    const grow = personScale(dist);
    const vs = vehicleScale(dist);
    if (this.lane) {
      // Turn towards the street's direction (the path is already in the lane).
      let d = this.wantHeading - this.pos.heading;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.pos.heading += d * Math.min(1, dt * 7);
      this.pos.x = this.centre.x;
      this.pos.y = this.centre.y;
    }
    const ag = this.avatarGroup;
    ag.position.set(this.pos.x, this.pos.h, this.pos.y);
    ag.rotation.y = this.pos.heading;
    const k = this.ride ? vs : grow;
    ag.scale.setScalar(k);
    // Your ring keeps its size from the air (you find yourself by it).
    this.avatar.root.getObjectByName('ring')?.scale.setScalar(ringScale(dist) / k);
    if (this.walking && !this.ride) this.walkPhase += dt * 9;
    this.avatar.pose(this.walking && !this.ride ? 1 : 0, this.walkPhase);
    // Passers-by.
    const now = Date.now();
    for (const { w, c, route } of this.people) {
      // Their walk, on the pavement (metres).
      const s = personAt({ ...w, route }, reduced ? 0 : now);
      c.root.position.set(s.at.x, this.roads.deckAt(s.at.x, s.at.y), s.at.y);
      if (Math.abs(s.dx) + Math.abs(s.dy) > 1e-6) c.root.rotation.y = Math.atan2(s.dx, s.dy);
      c.root.scale.setScalar(grow);
      c.pose(s.walking && !reduced ? 1 : 0, (now / 1000) * 9 + w.phase * 10);
    }
    // Traffic.
    const t = reduced ? 0 : tMs / 1000;
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
    // Driving: only the traffic around you (it keeps its distance) shows.
    const through = !this.lane;
    for (const m of this.globalMeshes)
      m.visible = through && (m !== this.carLights || this.night > 0.02);
    this.updateLocal(tMs, reduced, vs);
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

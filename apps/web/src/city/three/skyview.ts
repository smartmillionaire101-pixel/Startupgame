/**
 * Wave 12: a sky view in the real 3D city. The camera rides up a big wheel
 * in its pod, along a cable car's line in a gondola, along a street cable
 * car's line on the running board, up a tower in the lift or up the last
 * stretch of a hill; then you look around freely (turn, tilt, zoom) over the
 * city's real buildings, landmarks, water and terrain.
 *
 * `SkyRide` is the scene's ViewController (scene.ts). Where the city draws the
 * landmark (the London Eye, the Shard, the Burj Khalifa…), the ride follows
 * the model; a wheel or a cable car the city doesn't draw is built here, at
 * its real place. `skyExtras` adds the real things a view sees just beyond
 * the city's map: the Thames and the O2 by London's cable car, Bluewaters
 * Island under Ain Dubai, the pyramids from Cairo Tower.
 */
import * as THREE from 'three';
import type { SkyViewSpec } from '@runway/engine';
import { fromLatLon } from '../geo';
import type { CityScene, ViewController } from './scene';

const RIDE_MS: Record<SkyViewSpec['kind'], number> = {
  wheel: 42_000,
  cable: 38_000,
  deck: 14_000,
  tram: 80_000,
  hill: 14_000,
};
const PITCH_MIN = -1.25;
const PITCH_MAX = 0.45;
const FOV_MIN = 12;
const FOV_MAX = 75;

const smooth = (u: number) => u * u * (3 - 2 * u);
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

function mat(color: string, o: { emissive?: string; metal?: number; rough?: number } = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: o.rough ?? 0.6,
    metalness: o.metal ?? 0.3,
    ...(o.emissive ? { emissive: o.emissive, emissiveIntensity: 0.5 } : {}),
  });
}

/** How far the view loads the city (metres) by device tier. */
export const skyReach = (tier: 'high' | 'low') => (tier === 'high' ? 11_000 : 6_500);
/** How far a software renderer (no GPU) loads the city. */
export const SOFT_REACH = 2_500;
/** The longest step a ride takes between two frames (a hidden tab comes back where it was). */
const MAX_STEP_MS = 2_000;

export class SkyRide implements ViewController {
  readonly ms: number;
  /** 0–1 along the ride; 1 = arrived, free look. */
  progress = 0;
  yaw = 0;
  pitch = -0.1;
  fov = 60;
  private want = { yaw: 0, pitch: -0.1, fov: 60 };
  private elapsed = 0;
  private last = 0;
  private paused = false;
  private skipped = false;
  /** Props built for this view (absolute heights: the terrain is in). */
  readonly props = new THREE.Group();
  private gondolas: { obj: THREE.Object3D; u0: number; at: (u: number) => void }[] = [];
  private path: (u: number, out: THREE.Vector3) => THREE.Vector3;
  /** Where you look out from at the end (scene metres: x east, z south). */
  readonly top = new THREE.Vector3();
  readonly reach: number;
  private wheel: { group: THREE.Object3D; base: number } | null = null;
  private reduced: boolean;
  /** A wheel: the direction out of the pod's window. */
  private facing: number | null = null;
  /** Along a line: the direction of travel now (the view turns with it). */
  private heading: number | null = null;
  private pods: THREE.Object3D[] = [];
  private hidden: THREE.Object3D[] = [];
  /** The cabin you ride in (a gondola, a cable car), following the camera. */
  private cabin: THREE.Object3D | null = null;
  private pos = new THREE.Vector3();
  private dir = new THREE.Vector3();
  private _p = new THREE.Vector3();

  constructor(
    readonly scene: CityScene,
    readonly spec: SkyViewSpec,
    opts: { reduced: boolean; tier: 'high' | 'low'; soft?: boolean },
  ) {
    this.ms = RIDE_MS[spec.kind];
    this.reduced = opts.reduced;
    // A software renderer (no GPU) draws a nearer city: every tile is decoded and
    // drawn on the CPU, so a few kilometres round you, the rest in the haze.
    this.reach = opts.soft ? SOFT_REACH : skyReach(opts.tier);
    const data = scene.geo.data;
    const a = fromLatLon(data, spec.at[0], spec.at[1]);
    const lm = spec.landmark
      ? (scene.scene.getObjectByName(spec.landmark) as THREE.Object3D | undefined)
      : undefined;
    const base = lm
      ? new THREE.Vector3(lm.position.x, 0, lm.position.z)
      : new THREE.Vector3(a.x, 0, a.y);
    base.y = this.ground(base.x, base.z);
    this.props.userData.noTerrain = true;
    scene.scene.add(this.props);
    if (spec.kind === 'wheel') this.path = this.wheelPath(lm, base);
    else if (spec.kind === 'cable') this.path = this.cablePath(base);
    else if (spec.kind === 'tram') this.path = this.tramPath();
    else if (spec.kind === 'hill') this.path = this.hillPath(base);
    else this.path = this.deckPath(base);
    this.path(1, this.top);
    // Up inside a tower the city draws: its own pieces round you (the floors of the
    // tiers below are their roofs) would fill the view, so they step aside.
    if (lm && spec.kind === 'deck') {
      lm.updateMatrixWorld(true);
      const box = new THREE.Box3();
      lm.traverse((o) => {
        if (!(o as THREE.Mesh).isMesh || !o.visible) return;
        box.setFromObject(o);
        const pad = 1.5;
        if (
          this.top.x > box.min.x - pad &&
          this.top.x < box.max.x + pad &&
          this.top.z > box.min.z - pad &&
          this.top.z < box.max.z + pad &&
          box.max.y > this.top.y - 400
        ) {
          o.visible = false;
          this.hidden.push(o);
        }
      });
    }
    const [c0, c1, c2, c3] = data.core;
    const cx = (c0 + c2) / 2 - this.top.x;
    const cz = (c1 + c3) / 2 - this.top.z;
    this.yaw = this.want.yaw =
      this.facing ?? this.heading ?? (Math.hypot(cx, cz) > 500 ? Math.atan2(cx, -cz) : 0.6);
    this.last = performance.now();
    if (opts.reduced) this.skip();
  }

  /** The ground under a point, the terrain included. */
  ground(x: number, z: number) {
    return this.scene.groundAt(x, z) + this.scene.terrainAt(x, z);
  }

  // ---------------------------------------------------------------- Paths

  /** A big wheel: from the bottom pod up to the top, the wheel turning with you. */
  private wheelPath(lm: THREE.Object3D | undefined, base: THREE.Vector3) {
    let hubY: number;
    let r: number;
    let rot: number;
    if (lm && /eye/i.test(this.spec.landmark ?? '')) {
      hubY = 70;
      r = 62;
      rot = lm.rotation.y;
      const wheel = lm.children.find((c) => c.type === 'Group') ?? null;
      if (wheel) this.wheel = { group: wheel, base: wheel.rotation.z };
    } else {
      r = Math.max(20, this.spec.height * 0.42);
      hubY = this.spec.height - r - 4;
      // Square to the heart of the city (the wheel's riders face it).
      const [c0, c1, c2, c3] = this.scene.geo.data.core;
      const to = this.toward ?? { x: (c0 + c2) / 2, z: (c1 + c3) / 2 };
      rot = Math.atan2(to.x - base.x, to.z - base.z);
      const g = buildWheel(r, hubY);
      g.position.copy(base);
      g.rotation.y = rot;
      this.props.add(g);
      const rim = g.getObjectByName('rim');
      if (rim) this.wheel = { group: rim, base: 0 };
    }
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rot, 0));
    const n = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
    const [c0, c1, c2, c3] = this.scene.geo.data.core;
    const side = n.x * ((c0 + c2) / 2 - base.x) + n.z * ((c1 + c3) / 2 - base.z) >= 0 ? 1 : -1;
    this.facing = Math.atan2(n.x * side, -n.z * side);
    if (this.wheel)
      this.wheel.group.traverse((o) => {
        const g = (o as THREE.Mesh).geometry;
        if (g && (g.type === 'CapsuleGeometry' || g.type === 'BoxGeometry')) this.pods.push(o);
      });
    // In your pod, by the window, going round with the wheel.
    return (u: number, out: THREE.Vector3) => {
      const ang = -Math.PI / 2 + smooth(u) * Math.PI;
      // In the pod, outside the rim (the London Eye's capsules ride outside it).
      const rr = r + 2.6;
      out.set(Math.cos(ang) * rr, hubY + Math.sin(ang) * rr - 0.4, side * 1.4).applyQuaternion(q);
      return out.add(base);
    };
  }

  /** Where a built wheel turns to face (the Marina for Ain Dubai). */
  private get toward(): { x: number; z: number } | null {
    if (this.spec.id !== 'ain-dubai') return null;
    const p = fromLatLon(this.scene.geo.data, 25.0805, 55.1403);
    return { x: p.x, z: p.y };
  }

  /** A cable car: out of the station, up past the towers, across the river and down. */
  private cablePath(base: THREE.Vector3) {
    const spec = this.spec;
    const data = this.scene.geo.data;
    const b2 = spec.to ? fromLatLon(data, spec.to[0], spec.to[1]) : { x: base.x + 1000, y: base.z };
    const B = new THREE.Vector3(b2.x, this.ground(b2.x, b2.y), b2.y);
    const H = spec.height;
    // The two towers and their heights (London: 88 m by the peninsula, 64 m by the docks).
    const towers: [number, number][] = [
      [0.24, H - 2],
      [0.73, H * 0.72],
    ];
    const hA = 11;
    const hB = 11;
    const yAt = (u: number) => {
      const [u1, h1] = towers[0]!;
      const [u2, h2] = towers[1]!;
      if (u < u1) return hA + (h1 - hA) * smooth(u / u1);
      if (u > u2) return h2 + (hB - h2) * smooth((u - u2) / (1 - u2));
      // A sag between the towers.
      const t = (u - u1) / (u2 - u1);
      return h1 + (h2 - h1) * t - Math.sin(Math.PI * t) * 9;
    };
    const line = (u: number, out: THREE.Vector3) => {
      out.set(base.x + (B.x - base.x) * u, 0, base.z + (B.z - base.z) * u);
      const g = base.y + (B.y - base.y) * u;
      return out.setY(g + yAt(u));
    };
    this.heading = Math.atan2(B.x - base.x, -(B.z - base.z));
    this.props.add(buildCable(base, B, line, towers, (g) => this.gondolas.push(g)));
    this.cabin = gondolaCabin(this.heading);
    this.props.add(this.cabin);
    return (u: number, out: THREE.Vector3) => line(0.02 + smooth(u) * 0.96, out).setY(out.y - 2.6);
  }

  /** A street cable car: along its line, stop by stop, on the running board. */
  private tramPath() {
    const data = this.scene.geo.data;
    // The line, sampled every few metres and kept on its street (the waypoints
    // are corners; the streets between them come from the map).
    const corners = (this.spec.path ?? [this.spec.at]).map((ll) => fromLatLon(data, ll[0], ll[1]));
    const pts: { x: number; y: number }[] = [];
    for (let i = 0; i + 1 < corners.length; i++) {
      const a = corners[i]!;
      const b = corners[i + 1]!;
      const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 10));
      for (let k = 0; k < n; k++) {
        const t = k / n;
        pts.push(this.snap(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t));
      }
    }
    const end = corners[corners.length - 1]!;
    pts.push(this.snap(end.x, end.y));
    // Smooth the snapped line a little (no jitter at junctions).
    for (let pass = 0; pass < 3; pass++)
      for (let i = 1; i + 1 < pts.length; i++) {
        const p = pts[i]!;
        p.x = (pts[i - 1]!.x + 2 * p.x + pts[i + 1]!.x) / 4;
        p.y = (pts[i - 1]!.y + 2 * p.y + pts[i + 1]!.y) / 4;
      }
    const lens = [0];
    for (let i = 1; i < pts.length; i++)
      lens.push(lens[i - 1]! + Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y));
    const total = lens[lens.length - 1]! || 1;
    const at = (u: number, out: THREE.Vector3) => {
      const d = clamp(u, 0, 1) * total;
      let i = 1;
      while (i < lens.length - 1 && lens[i]! < d) i++;
      const a = pts[i - 1]!;
      const b = pts[i]!;
      const t = (d - lens[i - 1]!) / Math.max(1e-6, lens[i]! - lens[i - 1]!);
      out.set(a.x + (b.x - a.x) * t, 0, a.y + (b.y - a.y) * t);
      this.heading = Math.atan2(b.x - a.x, -(b.y - a.y));
      return out;
    };
    at(0, this._p);
    this.cabin = cableCarBody();
    this.props.add(this.cabin);
    // At the end of the line: by the bay, looking out over it.
    return (u: number, out: THREE.Vector3) => {
      at(u, out);
      return out.setY(this.ground(out.x, out.z) + this.spec.height);
    };
  }

  /** The nearest point on a street to (x, y) (within 45 m), or the point itself. */
  private snap(x: number, y: number) {
    let best = { x, y, d: 60 };
    this.scene.roads.forNear(x, y, 60, (s) => {
      const dx = s.bx - s.ax;
      const dy = s.by - s.ay;
      const L2 = dx * dx + dy * dy || 1;
      const t = clamp(((x - s.ax) * dx + (y - s.ay) * dy) / L2, 0, 1);
      const px = s.ax + dx * t;
      const py = s.ay + dy * t;
      const d = Math.hypot(px - x, py - y);
      if (d < best.d) best = { x: px, y: py, d };
    });
    return { x: best.x, y: best.y };
  }

  /** An observation deck: the lift up the tower. */
  private deckPath(base: THREE.Vector3) {
    const H = this.spec.height;
    // Standing on the deck: eyes 1.7 m above its floor.
    return (u: number, out: THREE.Vector3) =>
      out.set(base.x, base.y + 2 + (H - 0.3) * smooth(u), base.z);
  }

  /** A hill: the last stretch of the path up to the top, then the view. */
  private hillPath(base: THREE.Vector3) {
    // Come up from the downhill side (the steepest way down of eight).
    let best = { x: base.x, z: base.z - 220, h: Infinity };
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      const x = base.x + Math.sin(a) * 220;
      const z = base.z - Math.cos(a) * 220;
      const h = this.ground(x, z);
      if (h < best.h) best = { x, z, h };
    }
    this.heading = Math.atan2(base.x - best.x, -(base.z - best.z));
    const eye = this.spec.height;
    return (u: number, out: THREE.Vector3) => {
      const t = smooth(u);
      out.set(best.x + (base.x - best.x) * t, 0, best.z + (base.z - best.z) * t);
      return out.setY(this.ground(out.x, out.z) + 1.7 + eye * t);
    };
  }

  // ---------------------------------------------------------------- Control

  get atTop() {
    return this.progress >= 1;
  }

  skip() {
    this.skipped = true;
    // Arrived now, not at the next frame (which can be a while on a slow renderer).
    this.progress = 1;
    this.scene.touch(600);
  }

  /** Jump to a point of the ride (0–1) and hold there (tests, screenshots). */
  seek(u: number) {
    this.elapsed = clamp(u, 0, 1) * this.ms;
    this.skipped = u >= 1;
    this.paused = u < 1;
    this.scene.touch(600);
  }

  setPaused(p: boolean) {
    this.paused = p;
    this.scene.touch(300);
  }

  /** Turn (radians) and tilt by a drag; slower when zoomed in. */
  look(dYaw: number, dPitch: number) {
    const k = this.fov / 60;
    this.want.yaw += dYaw * k;
    this.want.pitch = clamp(this.want.pitch + dPitch * k, PITCH_MIN, PITCH_MAX);
    this.scene.touch(500);
  }

  zoom(factor: number) {
    this.want.fov = clamp(this.want.fov / factor, FOV_MIN, FOV_MAX);
    this.scene.touch(500);
  }

  /** Start out facing this way (radians, 0 = north). */
  aim(yaw: number) {
    this.yaw = this.want.yaw = yaw;
    this.scene.touch(400);
  }

  /** Turn to face a world point (x, height, z). */
  face(x: number, y: number, z: number) {
    const e = this.pos;
    this.want.yaw = this.yaw + wrap(Math.atan2(x - e.x, -(z - e.z)) - this.yaw);
    const d = Math.hypot(x - e.x, z - e.z);
    this.want.pitch = clamp(Math.atan2(y - e.y, d), -0.6, 0.3);
    this.scene.touch(1500);
  }

  busy() {
    const easing =
      Math.abs(this.want.yaw - this.yaw) > 0.0005 ||
      Math.abs(this.want.pitch - this.pitch) > 0.0005 ||
      Math.abs(this.want.fov - this.fov) > 0.02;
    return (
      (this.progress < 1 && !this.paused) || easing || (!this.reduced && this.gondolas.length > 0)
    );
  }

  /** The camera's world position now. */
  get eye() {
    return this.pos;
  }

  place(camera: THREE.PerspectiveCamera) {
    const now = performance.now();
    // Wall-clock time, so the ride lasts as long at 2 frames a second as at 60.
    const dt = Math.min(MAX_STEP_MS, now - this.last);
    this.last = now;
    if (!this.paused && !this.skipped) this.elapsed += dt;
    this.progress = this.skipped ? 1 : clamp(this.elapsed / this.ms, 0, 1);
    const k = 0.2;
    this.yaw += (this.want.yaw - this.yaw) * k;
    this.pitch += (this.want.pitch - this.pitch) * k;
    this.fov += (this.want.fov - this.fov) * k;
    const prevHeading = this.heading;
    this.path(this.progress, this.pos);
    // Along a line the view turns with the car (you keep the angle you chose).
    if (this.heading !== null && prevHeading !== null && this.heading !== prevHeading) {
      const d = wrap(this.heading - prevHeading);
      this.yaw += d;
      this.want.yaw += d;
    }
    if (this.wheel) {
      this.wheel.group.rotation.z = this.wheel.base + smooth(this.progress) * Math.PI;
      this.wheel.group.updateMatrixWorld(true);
      const p = this._p;
      for (const pod of this.pods) pod.visible = pod.getWorldPosition(p).distanceTo(this.pos) > 9;
    }
    if (this.cabin) {
      this.cabin.position.copy(this.pos);
      if (this.heading !== null) this.cabin.rotation.y = -this.heading;
    }
    if (!this.reduced) for (const g of this.gondolas) g.at((g.u0 + now / 120_000) % 1);
    const cp = Math.cos(this.pitch);
    this.dir.set(Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
    camera.position.copy(this.pos);
    camera.fov = this.fov;
    camera.lookAt(this.pos.x + this.dir.x, this.pos.y + this.dir.y, this.pos.z + this.dir.z);
    return { x: this.pos.x, y: this.pos.z, reach: this.reach };
  }

  dispose() {
    this.props.removeFromParent();
    this.props.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mm = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mm)) mm.forEach((x) => x.dispose());
      else mm?.dispose();
    });
    for (const pod of this.pods) pod.visible = true;
    for (const o of this.hidden) o.visible = true;
    if (this.wheel && !this.props.getObjectById(this.wheel.group.id))
      this.wheel.group.rotation.z = this.wheel.base;
  }
}

// ---------------------------------------------------------------- Models

/** A big wheel where the map has none (Ain Dubai): rim, spokes, cabins, legs. */
function buildWheel(r: number, hubY: number) {
  const g = new THREE.Group();
  const rim = new THREE.Group();
  rim.name = 'rim';
  rim.position.y = hubY;
  const steel = mat('#eef2f6', { metal: 0.6, rough: 0.35 });
  rim.add(new THREE.Mesh(new THREE.TorusGeometry(r, 1.6, 8, 96), steel));
  rim.add(new THREE.Mesh(new THREE.TorusGeometry(r * 0.96, 0.8, 6, 96), steel));
  rim.add(new THREE.Mesh(new THREE.CylinderGeometry(6, 6, 14, 20).rotateX(Math.PI / 2), steel));
  const spokes: number[] = [];
  const pods = 48;
  const glass = mat('#cfe3f1', { metal: 0.5, rough: 0.15 });
  for (let k = 0; k < pods; k++) {
    const a = (k / pods) * Math.PI * 2;
    for (const z of [-3, 3]) spokes.push(0, 0, z, Math.cos(a) * r, Math.sin(a) * r, 0);
    const pod = new THREE.Mesh(
      new THREE.CapsuleGeometry(2.4, 5, 3, 10).rotateZ(Math.PI / 2),
      glass,
    );
    pod.position.set(Math.cos(a) * (r + 3), Math.sin(a) * (r + 3), 0);
    rim.add(pod);
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.Float32BufferAttribute(spokes, 3));
  rim.add(new THREE.LineSegments(sg, new THREE.LineBasicMaterial({ color: '#cbd5e1' })));
  g.add(rim);
  // Two pairs of legs, leaning in to the hub.
  const leg = mat('#e2e8f0', { metal: 0.5 });
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const L = Math.hypot(hubY, r * 0.45);
      const l = new THREE.Mesh(new THREE.BoxGeometry(3, L, 3), leg);
      l.position.set(sx * r * 0.22, hubY / 2, sz * 9);
      l.rotation.z = -sx * Math.atan2(r * 0.45, hubY);
      l.rotation.x = sz * 0.05;
      g.add(l);
    }
  const base = new THREE.Mesh(new THREE.BoxGeometry(r * 1.1, 6, 40), mat('#9aa6b2'));
  base.position.y = 3;
  g.add(base);
  return g;
}

/** A cable car: two stations, the towers, the ropes and gondolas gliding both ways. */
function buildCable(
  A: THREE.Vector3,
  B: THREE.Vector3,
  line: (u: number, out: THREE.Vector3) => THREE.Vector3,
  towers: [number, number][],
  onGondola: (g: { obj: THREE.Object3D; u0: number; at: (u: number) => void }) => void,
) {
  const g = new THREE.Group();
  const dx = B.x - A.x;
  const dz = B.z - A.z;
  const L = Math.hypot(dx, dz) || 1;
  const yaw = Math.atan2(dx, dz);
  const nx = dz / L;
  const nz = -dx / L;
  const white = mat('#f3f5f7', { metal: 0.35, rough: 0.5 });
  const steel = mat('#b8c2cc', { metal: 0.6, rough: 0.35 });
  for (const P of [A, B]) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(30, 16, 44), white);
    s.position.set(P.x, P.y + 8, P.z);
    s.rotation.y = yaw;
    g.add(s);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(34, 2, 50), steel);
    roof.position.set(P.x, P.y + 17, P.z);
    roof.rotation.y = yaw;
    g.add(roof);
  }
  const v = new THREE.Vector3();
  for (const [u] of towers) {
    line(u, v);
    const base = A.y + (B.y - A.y) * u;
    const h = v.y - base + 5;
    // A tapering lattice tower: two splayed legs each side.
    for (const side of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.8, h, 6), white);
      leg.position.set(v.x + nx * side * 7, base + h / 2, v.z + nz * side * 7);
      leg.rotation.y = yaw;
      leg.rotateOnAxis(new THREE.Vector3(0, 0, 1), side * 0.08);
      g.add(leg);
    }
    const head = new THREE.Mesh(new THREE.BoxGeometry(22, 2.4, 4), steel);
    head.position.set(v.x, base + h, v.z);
    head.rotation.y = yaw + Math.PI / 2;
    g.add(head);
  }
  const pts: number[] = [];
  for (const side of [-1, 1]) {
    let prev: THREE.Vector3 | null = null;
    for (let i = 0; i <= 96; i++) {
      const p = line(i / 96, new THREE.Vector3());
      p.x += nx * side * 4;
      p.z += nz * side * 4;
      if (prev) pts.push(prev.x, prev.y, prev.z, p.x, p.y, p.z);
      prev = p;
    }
  }
  const cg = new THREE.BufferGeometry();
  cg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  g.add(new THREE.LineSegments(cg, new THREE.LineBasicMaterial({ color: '#2f3a46' })));
  const colours = ['#e11d48', '#f8fafc', '#1d4ed8'];
  for (let i = 0; i < 12; i++) {
    const side = i % 2 ? 1 : -1;
    const obj = new THREE.Group();
    const cab = new THREE.Mesh(
      new THREE.BoxGeometry(2.6, 2.6, 3.2),
      mat(colours[i % 3]!, { metal: 0.25, emissive: '#111827' }),
    );
    cab.position.y = -3.4;
    obj.add(cab);
    const hanger = new THREE.Mesh(new THREE.BoxGeometry(0.25, 2.2, 0.25), steel);
    hanger.position.y = -1.1;
    obj.add(hanger);
    obj.rotation.y = yaw;
    const p = new THREE.Vector3();
    const at = (u: number) => {
      line(side > 0 ? u : 1 - u, p);
      obj.position.set(p.x + nx * side * 4, p.y, p.z + nz * side * 4);
    };
    at(i / 12);
    g.add(obj);
    onGondola({ obj, u0: i / 12, at });
  }
  return g;
}

/** The gondola you sit in: a floor, corner posts and a roof edge (the windows are clear). */
function gondolaCabin(heading: number) {
  const g = new THREE.Group();
  const frame = mat('#e5e7eb', { metal: 0.5, rough: 0.4 });
  const floor = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.12, 3.0), mat('#374151'));
  floor.position.y = -1.55;
  g.add(floor);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.1, 3.1), frame);
  roof.position.y = 1.35;
  g.add(roof);
  const bench = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.08, 0.5), mat('#1f2937'));
  bench.position.set(0, -0.8, 1.2);
  g.add(bench);
  g.rotation.y = -heading;
  return g;
}

/** A San Francisco cable car (maroon, cream and blue), you on its running board. */
function cableCarBody() {
  const g = new THREE.Group();
  const maroon = mat('#7f1d1d', { rough: 0.6, metal: 0.1 });
  const cream = mat('#f1e7d0', { rough: 0.7, metal: 0 });
  const blue = mat('#1e3a8a', { rough: 0.6, metal: 0.1 });
  const wood = mat('#6b4423', { rough: 0.8, metal: 0 });
  // You stand at x = 0 on the right-hand running board: the car is to your left.
  const cx = -1.8;
  const floor = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.25, 8.4), wood);
  floor.position.set(cx, -1.25, 0);
  g.add(floor);
  const board = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.08, 8.4), wood);
  board.position.set(cx + 1.45, -1.55, 0);
  g.add(board);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.14, 8.6), maroon);
  roof.position.set(cx, 0.85, 0);
  g.add(roof);
  const trim = new THREE.Mesh(new THREE.BoxGeometry(2.82, 0.12, 8.62), blue);
  trim.position.set(cx, 0.72, 0);
  g.add(trim);
  for (const z of [-4.1, -2, 0, 2, 4.1])
    for (const sx of [-1.25, 1.25]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.07, 2.1, 0.07), cream);
      post.position.set(cx + sx, -0.2, z);
      g.add(post);
    }
  // The closed cabin at the middle, cream with its windows.
  const cab = new THREE.Mesh(new THREE.BoxGeometry(2.5, 1.0, 3.2), cream);
  cab.position.set(cx, -0.65, 0);
  g.add(cab);
  const band = new THREE.Mesh(new THREE.BoxGeometry(2.52, 0.3, 8.42), maroon);
  band.position.set(cx, -1.0, 0);
  g.add(band);
  // The grab pole you hold.
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.025, 0.025, 2.1, 6),
    mat('#d4af37', { metal: 0.8, rough: 0.3 }),
  );
  pole.position.set(cx + 1.25, -0.2, -0.6);
  g.add(pole);
  return g;
}

// ---------------------------------------------------------------- Beyond the map

/** Real things a view sees just past the city's map, at their real places. */
export function skyExtras(scene: CityScene, spec: SkyViewSpec, water: THREE.Material | null) {
  const g = new THREE.Group();
  const data = scene.geo.data;
  const P = (lat: number, lon: number) => fromLatLon(data, lat, lon);
  const flat = (ll: [number, number][], m: THREE.Material, y: number, order: number) => {
    const shape = new THREE.Shape(
      ll.map(([la, lo]) => {
        const p = P(la, lo);
        return new THREE.Vector2(p.x, p.y);
      }),
    );
    const geo = new THREE.ShapeGeometry(shape, 4).rotateX(Math.PI / 2);
    // ShapeGeometry is in x/y; rotated so y becomes z (south). Faces up after the flip.
    const pos = geo.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) pos.setY(i, y);
    geo.computeVertexNormals();
    const n = geo.getAttribute('normal') as THREE.BufferAttribute;
    for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
    const mesh = new THREE.Mesh(geo, m);
    mesh.renderOrder = order;
    (m as THREE.Material).side = THREE.DoubleSide;
    g.add(mesh);
    return mesh;
  };
  const block = (
    lat: number,
    lon: number,
    w: number,
    d: number,
    h: number,
    rot: number,
    m: THREE.Material,
  ) => {
    const p = P(lat, lon);
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0), m);
    b.position.set(p.x, 0, p.y);
    b.rotation.y = rot;
    g.add(b);
    return b;
  };
  /** Deterministic stand-in blocks of flats around a point (the map stops short of them). */
  const district = (
    lat: number,
    lon: number,
    n: number,
    spread: number,
    hMin: number,
    hMax: number,
    seed: number,
  ) => {
    const walls = [
      mat('#c9c4bb', { metal: 0, rough: 0.85 }),
      mat('#a9b4bf', { metal: 0.2, rough: 0.5 }),
      mat('#d8cfc2', { metal: 0, rough: 0.8 }),
    ];
    let s = seed;
    const rnd = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32;
    for (let i = 0; i < n; i++) {
      const dlat = (rnd() - 0.5) * spread;
      const dlon = (rnd() - 0.5) * spread * 1.6;
      block(
        lat + dlat,
        lon + dlon,
        18 + rnd() * 30,
        14 + rnd() * 22,
        hMin + rnd() * (hMax - hMin),
        rnd() * 0.4,
        walls[i % 3]!,
      );
    }
  };
  if (spec.id === 'london-cable-car') {
    // The Thames round the Greenwich Peninsula, and the Royal Victoria Dock.
    const w = water ?? mat('#3d6f86', { metal: 0.1, rough: 0.2 });
    flat(
      [
        [51.5092, -0.001],
        [51.5072, 0.005],
        [51.5052, 0.011],
        [51.5022, 0.016],
        [51.499, 0.0195],
        [51.4962, 0.024],
        [51.4962, 0.042],
        [51.4932, 0.042],
        [51.493, 0.027],
        [51.495, 0.016],
        [51.4985, 0.01],
        [51.502, 0.0055],
        [51.5043, 0.0005],
        [51.5062, -0.001],
      ],
      w,
      0.05,
      -33.5,
    );
    flat(
      [
        [51.5085, 0.0165],
        [51.509, 0.042],
        [51.507, 0.042],
        [51.5066, 0.0165],
      ],
      w,
      0.05,
      -33.5,
    );
    // The O2: a white dome 365 m across and 52 m high, its twelve yellow masts.
    const o2 = P(51.503, 0.0032);
    const R = 346;
    const cap = Math.asin(182.5 / R);
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(R, 48, 10, 0, Math.PI * 2, 0, cap),
      mat('#f3f1ea', { metal: 0, rough: 0.7 }),
    );
    dome.position.set(o2.x, 52 - R, o2.y);
    g.add(dome);
    const yellow = mat('#f2c230', { metal: 0.3, rough: 0.5, emissive: '#3a2a00' });
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2 + 0.13;
      const m = new THREE.Mesh(
        new THREE.CylinderGeometry(0.9, 1.3, 100, 6).translate(0, 50, 0),
        yellow,
      );
      m.position.set(o2.x + Math.cos(a) * 112, 0, o2.y + Math.sin(a) * 112);
      m.rotation.set(Math.sin(a) * 0.17, 0, -Math.cos(a) * 0.17);
      g.add(m);
    }
    // ExCeL London along the dock's north side, and the flats around.
    block(51.5083, 0.0292, 640, 110, 22, 0.02, mat('#d6d9dc', { metal: 0.3, rough: 0.5 }));
    district(51.4975, 0.0035, 26, 0.006, 25, 75, 11); // Greenwich Peninsula
    district(51.5045, 0.03, 22, 0.004, 15, 60, 23); // Royal Wharf, Silvertown
    district(51.5115, 0.02, 18, 0.004, 12, 40, 37); // Custom House, Canning Town
  }
  if (spec.id === 'ain-dubai') {
    // Bluewaters Island, off JBR, and its low-rise homes and shops.
    flat(
      [
        [25.0822, 55.1196],
        [25.0826, 55.1232],
        [25.0806, 55.1256],
        [25.0784, 55.1251],
        [25.0776, 55.1214],
        [25.0795, 55.1192],
      ],
      mat('#d8cdb6', { metal: 0, rough: 0.95 }),
      0.4,
      -33.4,
    );
    district(25.0805, 55.1216, 16, 0.0025, 20, 48, 51);
  }
  if (spec.id === 'cairo-tower') {
    // The pyramids of Giza on the desert's edge: Khufu, Khafre and Menkaure.
    const stone = mat('#cdb58a', { metal: 0, rough: 0.95 });
    for (const [lat, lon, base, h] of [
      [29.9792, 31.1342, 230, 139],
      [29.9761, 31.1308, 215, 136],
      [29.9725, 31.1281, 103, 65],
    ] as const) {
      const p = P(lat, lon);
      const m = new THREE.Mesh(
        new THREE.ConeGeometry(base / Math.SQRT2, h, 4, 1)
          .rotateY(Math.PI / 4)
          .translate(0, h / 2, 0),
        stone,
      );
      m.position.set(p.x, 0, p.y);
      g.add(m);
    }
  }
  if (spec.id === 'leicester-peak') {
    // Across the Sierra Leone River estuary, the low Bullom shore: Lungi and its
    // airport, Tagrin Point, a line of mangrove and palms along the water.
    const shore: [number, number][] = [
      [8.566, -13.31],
      [8.569, -13.285],
      [8.577, -13.255],
      [8.588, -13.225],
      [8.595, -13.195],
      [8.594, -13.16],
      [8.584, -13.12],
      [8.568, -13.08],
      [8.552, -13.04],
    ];
    flat(
      [...shore, [8.56, -12.95], [8.8, -12.95], [8.8, -13.33], [8.63, -13.33]],
      mat('#3e6a2d', { metal: 0, rough: 1 }),
      1,
      -36,
    );
    const crown = new THREE.IcosahedronGeometry(1, 0).scale(9, 6, 9).translate(0, 5, 0);
    const roofGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    const trees: THREE.Vector3[] = [];
    const roofs: THREE.Vector3[] = [];
    let s = 917;
    const rnd = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32;
    for (let i = 0; i + 1 < shore.length; i++) {
      const a = P(...shore[i]!);
      const b = P(...shore[i + 1]!);
      const n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 40);
      for (let k = 0; k < n; k++) {
        const t = k / n;
        // A belt of trees a few hundred metres deep, the villages behind it.
        const back = rnd() * 600;
        trees.push(new THREE.Vector3(a.x + (b.x - a.x) * t, 0, a.y + (b.y - a.y) * t - back));
        if (rnd() < 0.5) {
          const back2 = 250 + rnd() * 900;
          roofs.push(
            new THREE.Vector3(a.x + (b.x - a.x) * t + rnd() * 30, 0, a.y + (b.y - a.y) * t - back2),
          );
        }
      }
    }
    // Lungi town, by the airport.
    const lungi = P(8.607, -13.2);
    for (let i = 0; i < 260; i++)
      roofs.push(
        new THREE.Vector3(lungi.x + (rnd() - 0.5) * 2200, 0, lungi.y + (rnd() - 0.5) * 1400),
      );
    const look = scene.look;
    const leaf = new THREE.Color(look.canopy?.[0] ?? '#2f5a26');
    const treeMesh = new THREE.InstancedMesh(
      crown,
      mat('#ffffff', { metal: 0, rough: 1 }),
      trees.length,
    );
    const roofMesh = new THREE.InstancedMesh(
      roofGeo,
      mat('#ffffff', { metal: 0.2, rough: 0.7 }),
      roofs.length,
    );
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const c = new THREE.Color();
    trees.forEach((v, i) => {
      m4.compose(v.setY(1), q, new THREE.Vector3(1, 1, 1).multiplyScalar(0.7 + rnd() * 0.8));
      treeMesh.setMatrixAt(i, m4);
      treeMesh.setColorAt(i, c.copy(leaf).multiplyScalar(0.8 + rnd() * 0.5));
    });
    roofs.forEach((v, i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * 3);
      m4.compose(v.setY(1), q, new THREE.Vector3(9 + rnd() * 8, 4, 7 + rnd() * 6));
      roofMesh.setMatrixAt(i, m4);
      roofMesh.setColorAt(i, c.set(look.pitchedRoofs[i % look.pitchedRoofs.length]!));
    });
    q.identity();
    for (const im of [treeMesh, roofMesh]) {
      im.computeBoundingSphere();
      g.add(im);
    }
    // Ships at Queen Elizabeth II Quay and at anchor in the estuary.
    const hulls = ['#2b2f33', '#7a2a22', '#23395b', '#3c4a3a'];
    const boxes = ['#b5462f', '#2f5f8f', '#d9b13b', '#3d7f5a', '#c9c4bb', '#8a3b5f'];
    const ships = new THREE.Group();
    ships.userData.noTerrain = true;
    for (const [i, [lat, lon, rot, len]] of (
      [
        [8.495, -13.2125, 0.18, 150],
        [8.4948, -13.2168, 0.18, 120],
        [8.4952, -13.2085, 0.2, 95],
        [8.502, -13.209, 0.9, 170],
        [8.507, -13.222, 1.4, 130],
        [8.513, -13.198, 0.5, 185],
        [8.518, -13.235, 2.1, 110],
        [8.524, -13.212, 1.1, 60],
      ] as const
    ).entries()) {
      const ship = new THREE.Group();
      const w = len * 0.15;
      const hull = new THREE.Mesh(
        new THREE.BoxGeometry(len, 7, w).translate(0, 2, 0),
        mat(hulls[i % hulls.length]!, { metal: 0.3, rough: 0.6 }),
      );
      const bridge = new THREE.Mesh(
        new THREE.BoxGeometry(len * 0.12, 12, w * 0.9).translate(-len * 0.38, 11.5, 0),
        mat('#e9e7e1', { metal: 0.1, rough: 0.5 }),
      );
      ship.add(hull, bridge);
      // Containers stacked along the deck.
      for (let k = 0; k < Math.floor(len / 28); k++) {
        const h = 3 + Math.floor(rnd() * 3) * 2.6;
        const box = new THREE.Mesh(
          new THREE.BoxGeometry(len * 0.11, h, w * 0.85).translate(
            -len * 0.24 + k * len * 0.13,
            5.5 + h / 2,
            0,
          ),
          mat(boxes[Math.floor(rnd() * boxes.length)]!, { metal: 0.2, rough: 0.7 }),
        );
        ship.add(box);
      }
      const p = P(lat, lon);
      ship.position.set(p.x, 0, p.y);
      ship.rotation.y = rot;
      ships.add(ship);
    }
    g.add(ships);
  }
  return g;
}

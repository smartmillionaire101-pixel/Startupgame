/**
 * Wave 9 §B: the 3D city — a three.js scene for a real-map CityLayout.
 *
 * Plain three.js in a class (no React): CityMap3D owns one and talks to it
 * through a few methods (camera, avatar, picking, projecting labels). It
 * renders on demand: every frame while something moves (a walk, a drag, a
 * ride), at a calm pace while only the traffic and the water move, and not
 * at all with reduced motion when nothing changes or while the tab is hidden.
 */
import * as THREE from 'three';
import { fromLatLon } from '../geo';
import { geoMetres, type GeoWorld } from '../geoLayout';
import type { CityLayout, Place, Pt } from '../layout';
import { cityLook, type CityLook } from './cities';
import { GroundMask } from './mask';
import { makeShared, facadeMaterial } from './materials';
import { RoadIndex } from './roads';
import {
  boxMeshes,
  bytes,
  CHUNK,
  cleanOutline,
  LotMaker,
  mergedMesh,
  osmFootprints,
  h3,
  type BoxB,
  type Centre,
  type Footprint,
} from './buildings';
import { buildGround, mixHex } from './ground';
import { applySky, skyAt, skyDome, skyEnvironment, skyUniforms, type SkyState } from './sky';
import { treeMeshes, treeSpots } from './trees';
import { buildLandmarks, EXTRA_3D, type LandmarkPlan } from './landmarks';
import { Actors } from './actors';
import { loadTiles, type TileSet } from './tiles';
import type { AvatarLook } from '../art';
import type { Walker } from '../people';

export type Tier = 'high' | 'low';

export interface SceneOptions {
  tier: Tier;
  reduced: boolean;
  /** Local hour (fractional), from the city's clock. */
  hour: number;
}

export interface PlaceBox {
  place: Place;
  x: number;
  y: number;
  w: number;
  d: number;
  h: number;
  rot: number;
}

const PITCH_MIN = 0.3;
const PITCH_MAX = 1.42;
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _ray = new THREE.Ray();
const _ndc = new THREE.Vector2();
const _rc = new THREE.Raycaster();

export const toMetres = (p: Pt) => geoMetres(p);

export class CityScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly look: CityLook;
  readonly layout: CityLayout;
  readonly geo: GeoWorld;
  readonly roads: RoadIndex;
  readonly mask: GroundMask;
  readonly places: PlaceBox[] = [];
  readonly actors: Actors;

  /** Camera rig: target on the ground (metres), distance, yaw (0 = north), pitch. */
  rig = { x: 0, y: 0, dist: 700, yaw: 0, pitch: 0.72 };
  private want = { x: 0, y: 0, dist: 700 };
  following = true;
  /** Stop drawing on its own (screenshots and tests draw with renderNow). */
  paused = false;

  private shared = makeShared();
  private sky = skyUniforms();
  private sun = new THREE.DirectionalLight(0xffffff, 3);
  private hemi = new THREE.HemisphereLight(0xffffff, 0x888888, 1);
  private fog: THREE.FogExp2;
  private dome: THREE.Mesh;
  private skyState: SkyState;
  private env: THREE.WebGLRenderTarget | null = null;
  private instMat: THREE.Material;
  private nearMat: THREE.Material;
  private farMat: THREE.Material;
  private mergedMat: THREE.Material;
  private detailR = 0;
  private lowGroup = new THREE.Group();
  private tallGroup = new THREE.Group();
  private lights: THREE.Points | null = null;
  private lots: LotMaker;
  private chunks = new Map<string, { group: THREE.Group; ci: number; cj: number }>();
  private queue: [number, number][] = [];
  private tiles: TileSet | null = null;
  private raf = 0;
  private lastRender = 0;
  private dirty = true;
  private activeUntil = 0;
  private dpr: number;
  private dprMax: number;
  private frameTimes: number[] = [];
  private disposed = false;
  private slow = 0;
  private degraded = false;
  private size = { w: 1, h: 1 };
  private hour: number;
  private onFrameCbs = new Set<() => void>();
  readonly stats = {
    draws: 0,
    tris: 0,
    frameMs: 0,
    buildMs: 0,
    lots: 0,
    trees: 0,
    dpr: 1,
    bgDone: false,
  };

  constructor(
    readonly canvas: HTMLCanvasElement,
    layout: CityLayout,
    private opts: SceneOptions,
    look: AvatarLook,
    walkers: Walker[],
  ) {
    const t0 = performance.now();
    if (!layout.geo) throw new Error('A 3D city needs a real map');
    this.layout = layout;
    this.geo = layout.geo;
    this.look = cityLook(layout.marketId);
    this.hour = opts.hour;
    const high = opts.tier === 'high';
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.dprMax = Math.min(2, window.devicePixelRatio || 1, high ? 2 : 1.75);
    this.dpr = this.dprMax;
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.shadowMap.autoUpdate = true;

    this.camera = new THREE.PerspectiveCamera(38, 1, 1, 50000);
    this.fog = new THREE.FogExp2(0xc8d8e8, 0.0002);
    this.scene.fog = this.fog;

    // ---- Light and sky.
    this.sun.castShadow = true;
    const sm = high ? 2048 : 1024;
    this.sun.shadow.mapSize.set(sm, sm);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.6;
    this.scene.add(this.sun, this.sun.target, this.hemi);
    this.dome = skyDome(this.sky, 1);
    this.scene.add(this.dome);
    this.skyState = skyAt(this.hour, this.look.lat, this.look.haze);
    this.applySky();

    // ---- The city.
    const data = this.geo.data;
    this.mask = new GroundMask(data, high ? 2048 : 1400);
    this.roads = new RoadIndex(data);
    this.instMat = facadeMaterial(this.shared, true);
    this.nearMat = facadeMaterial(this.shared, true, 'near');
    this.farMat = facadeMaterial(this.shared, true, 'far');
    this.mergedMat = facadeMaterial(this.shared, false);

    const plans = this.landmarkPlans();
    const landmarks = buildLandmarks(plans, this.roads);
    const ground = buildGround(
      data,
      this.look,
      this.mask,
      this.roads,
      this.shared,
      this.sky,
      this.instMat,
    );
    this.scene.add(ground.group, landmarks);

    // Ground cleared for landmarks and the game's places.
    const clear = [...this.geo.clear];
    for (const p of plans) if (p.e2 === undefined) clear.push({ e: p.e, s: p.s, r: 40 });

    // OSM outlines, merged per chunk.
    const osm = osmFootprints(data, this.look, clear, layout.marketId);
    const byChunk = new Map<string, Footprint[]>();
    for (const f of osm.polys) {
      const k = `${Math.floor(f.p[0]! / 800)},${Math.floor(f.p[1]! / 800)}`;
      let a = byChunk.get(k);
      if (!a) byChunk.set(k, (a = []));
      a.push(f);
    }
    for (const list of byChunk.values()) {
      const m = mergedMesh(list, this.mergedMat);
      if (m) this.scene.add(m);
    }
    for (const m of boxMeshes(osm.boxes, this.instMat)) this.scene.add(m);

    // The game's places: their own buildings, glowing softly.
    this.buildPlaces();

    // Infill: lots made around the camera; tall ones city-wide, in the background.
    const centres: Centre[] = [];
    const [c0, c1, c2, c3] = data.core;
    centres.push({ x: (c0 + c2) / 2, y: (c1 + c3) / 2, r: Math.max(2200, (c2 - c0) * 0.8), w: 1 });
    for (const a of layout.areas) {
      if (!['downtown', 'finance', 'tech'].includes(a.kind)) continue;
      const m = toMetres(a.at);
      centres.push({ x: m.e, y: m.s, r: 1300, w: a.kind === 'finance' ? 0.95 : 0.8 });
    }
    this.lots = new LotMaker(
      this.mask,
      this.roads,
      this.look,
      centres,
      layout.marketId,
      data.bounds,
    );
    this.scene.add(this.lowGroup, this.tallGroup);

    // Trees.
    const spots = treeSpots(data, this.look, this.mask, high ? 26000 : 11000);
    this.stats.trees = spots.length;
    this.scene.add(treeMeshes(spots, this.look, high));

    // Street lights (night).
    this.lights = this.streetLights();
    this.scene.add(this.lights);

    // People and traffic.
    this.actors = new Actors(
      this.scene,
      layout,
      this.roads,
      look,
      walkers,
      opts.tier,
      opts.reduced,
    );

    // Start at the avatar.
    const start = toMetres(layout.start);
    this.rig.x = this.want.x = start.e;
    this.rig.y = this.want.y = start.s;

    this.stats.buildMs = Math.round(performance.now() - t0);
    this.backgroundTall();
    void loadTiles(layout.marketId).then((t) => {
      if (this.disposed || !t) return;
      this.tiles = t;
      this.invalidate();
    });
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
    document.addEventListener('visibilitychange', this.onVis);
  }

  private onVis = () => this.invalidate();

  // ---------------------------------------------------------------------------
  // Building the city

  private landmarkPlans(): LandmarkPlan[] {
    const plans: LandmarkPlan[] = this.geo.sprites.map((s) => ({ ...s }));
    for (const x of EXTRA_3D[this.layout.marketId] ?? []) {
      const p = fromLatLon(this.geo.data, x.at[0], x.at[1]);
      plans.push({ kind: x.kind, name: x.name, e: p.x, s: p.y });
    }
    return plans;
  }

  private buildPlaces() {
    const fps: Footprint[] = [];
    const boxes: BoxB[] = [];
    for (const p of this.layout.places) {
      const c = toMetres({ x: p.x + p.w / 2, y: p.y + p.d / 2 });
      const door = toMetres(p.door);
      // Face the street: the door side towards the door point.
      const rot = Math.atan2(door.s - c.s, door.e - c.e) + Math.PI / 2;
      const spec = placeSpec(p);
      const r = h3(p.id.length * 31 + p.id.charCodeAt(p.id.length - 1), p.id.charCodeAt(0));
      // Inside its plot (the 2D map's tile square, turned to face the street).
      const side = Math.min(p.w, p.d) * 30 * 0.68;
      const w = Math.min(spec.w, Math.max(side, 4));
      const d = Math.min(spec.d, Math.max(side, 3));
      const cx = c.e;
      const cy = c.s;
      const co = Math.cos(rot);
      const si = Math.sin(rot);
      const pts: number[] = [];
      for (const [a, b] of [
        [-w / 2, -d / 2],
        [w / 2, -d / 2],
        [w / 2, d / 2],
        [-w / 2, d / 2],
      ] as const)
        pts.push(cx + a * co - b * si, cy + a * si + b * co);
      const outline = cleanOutline(pts)!;
      const wall = bytes(mixHex(spec.wall ?? p.color, '#e8e4dc', spec.wall ? 0 : 0.55));
      const roof = bytes(spec.roof ?? '#bdb9b1');
      if (p.kind === 'stall') {
        // A market stall: a counter and a striped awning.
        boxes.push({
          x: cx,
          y: cy,
          w,
          d,
          h: 1.1,
          y0: 0,
          rot,
          style: 7,
          wall: bytes('#8a6a4a'),
          roof: bytes('#8a6a4a'),
          seed: r,
          vOff: 0,
          roofType: 0,
        });
        boxes.push({
          x: cx,
          y: cy,
          w: w + 0.6,
          d: d + 0.6,
          h: 0.5,
          y0: 2.5,
          rot,
          style: 7,
          wall: bytes(p.color),
          roof: bytes(p.color),
          seed: r,
          vOff: 0,
          roofType: 1,
        });
      } else {
        fps.push({
          p: outline,
          base: 0,
          top: spec.h,
          vOff: 0,
          style: spec.style,
          wall,
          roof,
          seed: r,
          hl: 1,
        });
        // A coloured band at the top: the brand.
        fps.push({
          p: outline,
          base: spec.h,
          top: spec.h + 1.4,
          vOff: 0,
          style: 12,
          wall: bytes(p.accent || p.color),
          roof,
          seed: r,
          hl: 1,
        });
      }
      this.places.push({ place: p, x: cx, y: cy, w, d, h: spec.h + 1.4, rot });
    }
    const m = mergedMesh(fps, this.mergedMat);
    if (m) this.scene.add(m);
    for (const b of boxMeshes(boxes, this.instMat)) this.scene.add(b);
  }

  /** Tall infill (towers, mid-rise) over the whole city, a few chunks at a time. */
  private backgroundTall() {
    const [bx0, by0, bx1, by1] = this.geo.data.bounds;
    const list: [number, number][] = [];
    for (let cj = Math.floor(by0 / CHUNK); cj <= Math.floor(by1 / CHUNK); cj++)
      for (let ci = Math.floor(bx0 / CHUNK); ci <= Math.floor(bx1 / CHUNK); ci++)
        list.push([ci, cj]);
    // Nearest first.
    const cx = this.rig.x;
    const cy = this.rig.y;
    list.sort(
      (a, b) =>
        Math.hypot(a[0] * CHUNK - cx, a[1] * CHUNK - cy) -
        Math.hypot(b[0] * CHUNK - cx, b[1] * CHUNK - cy),
    );
    const SUPER = 2400;
    const groups = new Map<string, BoxB[]>();
    const farGroups = new Map<string, BoxB[]>();
    const merge = this.opts.tier === 'high' ? 4 : 8;
    let i = 0;
    const step = () => {
      if (this.disposed) return;
      const t = performance.now();
      while (i < list.length && performance.now() - t < 12) {
        const [ci, cj] = list[i++]!;
        if (this.tiles) continue;
        const { tall, far } = this.lots.chunk(ci, cj, merge);
        const k = `${Math.floor((ci * CHUNK) / SUPER)},${Math.floor((cj * CHUNK) / SUPER)}`;
        if (tall.length) {
          let a = groups.get(k);
          if (!a) groups.set(k, (a = []));
          a.push(...tall);
        }
        if (far.length) {
          let a = farGroups.get(k);
          if (!a) farGroups.set(k, (a = []));
          a.push(...far);
        }
        this.stats.lots += tall.length + far.length;
      }
      if (i < list.length) {
        setTimeout(step, 0);
        return;
      }
      for (const boxes of groups.values())
        for (const m of boxMeshes(boxes, this.instMat)) this.tallGroup.add(m);
      // A budget for the far city: thinned evenly beyond it (the haze hides the gaps).
      const budget = this.opts.tier === 'high' ? 70000 : 32000;
      let total = 0;
      for (const b of farGroups.values()) total += b.length;
      const keep = Math.min(1, budget / Math.max(1, total));
      for (let boxes of farGroups.values()) {
        if (keep < 1) boxes = boxes.filter((b) => h3(Math.round(b.x), Math.round(b.y), 61) < keep);
        for (const m of boxMeshes(boxes, this.farMat)) {
          m.castShadow = false;
          this.tallGroup.add(m);
        }
      }
      this.stats.lots = total;
      this.stats.bgDone = true;
      this.invalidate();
    };
    setTimeout(step, 30);
  }

  /** Low-rise lots near the camera: made when they come near, dropped when far. */
  private updateChunks() {
    if (this.tiles) {
      this.tiles.update(
        this.rig.x,
        this.rig.y,
        this.rig.dist,
        this.scene,
        this.mergedMat,
        this.look,
      );
      return;
    }
    const R =
      (this.opts.tier === 'high' ? 1 : 0.7) * Math.min(2200, Math.max(900, this.rig.dist * 1.8));
    const show = this.rig.dist < 6000;
    this.detailR = show ? R : 0;
    this.shared.uDetail.value.set(this.rig.x, this.rig.y, this.detailR);
    const want = new Set<string>();
    if (show) {
      const i0 = Math.floor((this.rig.x - R) / CHUNK);
      const i1 = Math.floor((this.rig.x + R) / CHUNK);
      const j0 = Math.floor((this.rig.y - R) / CHUNK);
      const j1 = Math.floor((this.rig.y + R) / CHUNK);
      for (let j = j0; j <= j1; j++)
        for (let i = i0; i <= i1; i++) {
          const d = Math.hypot((i + 0.5) * CHUNK - this.rig.x, (j + 0.5) * CHUNK - this.rig.y);
          if (d < R + CHUNK * 0.72) want.add(`${i},${j}`);
        }
    }
    for (const [k, c] of this.chunks) {
      const d = Math.hypot((c.ci + 0.5) * CHUNK - this.rig.x, (c.cj + 0.5) * CHUNK - this.rig.y);
      if (!want.has(k) && (d > R * 1.35 + CHUNK || !show)) {
        c.group.removeFromParent();
        c.group.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
        this.chunks.delete(k);
      }
    }
    this.queue = [...want]
      .filter((k) => !this.chunks.has(k))
      .map((k) => k.split(',').map(Number) as [number, number])
      .sort(
        (a, b) =>
          Math.hypot((a[0] + 0.5) * CHUNK - this.rig.x, (a[1] + 0.5) * CHUNK - this.rig.y) -
          Math.hypot((b[0] + 0.5) * CHUNK - this.rig.x, (b[1] + 0.5) * CHUNK - this.rig.y),
      );
  }

  private buildQueued(budgetMs: number) {
    const t = performance.now();
    while (this.queue.length && performance.now() - t < budgetMs) {
      const [ci, cj] = this.queue.shift()!;
      const k = `${ci},${cj}`;
      if (this.chunks.has(k)) continue;
      const { low } = this.lots.chunk(ci, cj);
      const group = new THREE.Group();
      for (const m of boxMeshes(low, this.nearMat)) group.add(m);
      this.lowGroup.add(group);
      this.chunks.set(k, { group, ci, cj });
      this.dirty = true;
    }
  }

  private streetLights() {
    const pts: number[] = [];
    let n = 0;
    for (const s of this.roads.segs) {
      if (s.c > 4) continue;
      const L = Math.hypot(s.bx - s.ax, s.by - s.ay);
      const half = s.c <= 1 ? 12 : 8;
      const nx = -(s.by - s.ay) / (L || 1);
      const ny = (s.bx - s.ax) / (L || 1);
      for (let d = 15; d < L; d += 38) {
        const sg = (n++ & 1) * 2 - 1;
        const t = d / L;
        const h = s.ha + (s.hb - s.ha) * t;
        pts.push(
          s.ax + (s.bx - s.ax) * t + nx * half * sg,
          h + 7,
          s.ay + (s.by - s.ay) * t + ny * half * sg,
        );
      }
      if (pts.length > 3 * 60000) break;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const m = new THREE.PointsMaterial({
      color: '#ffd9a0',
      size: 18,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: true,
    });
    const p = new THREE.Points(g, m);
    p.visible = false;
    return p;
  }

  // ---------------------------------------------------------------------------
  // Sky

  setHour(hour: number) {
    if (Math.abs(hour - this.hour) < 0.05) return;
    this.hour = hour;
    this.skyState = skyAt(hour, this.look.lat, this.look.haze);
    this.applySky();
    this.invalidate();
  }

  private applySky() {
    applySky(this.skyState, this.sky, this.sun, this.hemi, this.fog);
    this.shared.uNight.value = this.skyState.night;
    this.renderer.toneMappingExposure = 1.05 * this.skyState.exposure;
    if (this.lights) this.lights.visible = this.skyState.night > 0.4;
    this.env?.dispose();
    this.env = skyEnvironment(this.renderer, this.sky);
    this.scene.environment = this.env.texture;
    this.scene.environmentIntensity = 0.55 - this.skyState.night * 0.4;
  }

  // ---------------------------------------------------------------------------
  // Camera

  resize(w: number, h: number) {
    this.size = { w: Math.max(1, w), h: Math.max(1, h) };
    this.renderer.setSize(this.size.w, this.size.h, false);
    this.camera.aspect = this.size.w / this.size.h;
    this.invalidate();
  }

  maxDist() {
    const [bx0, by0, bx1, by1] = this.geo.data.bounds;
    return Math.max(bx1 - bx0, by1 - by0) * 0.95;
  }

  private placeCamera() {
    const r = this.rig;
    r.pitch = Math.max(PITCH_MIN, Math.min(PITCH_MAX, r.pitch));
    r.dist = Math.max(35, Math.min(this.maxDist(), r.dist));
    const [bx0, by0, bx1, by1] = this.geo.data.bounds;
    r.x = Math.max(bx0, Math.min(bx1, r.x));
    r.y = Math.max(by0, Math.min(by1, r.y));
    const fx = Math.sin(r.yaw);
    const fz = -Math.cos(r.yaw);
    // Pulled right back, the view lowers towards the horizon (an aerial photo's angle).
    const kf = Math.max(0, Math.min(1, (r.dist - 2500) / 7000));
    const pitch = r.pitch > 0.48 ? r.pitch + (0.48 - r.pitch) * kf * kf * (3 - 2 * kf) : r.pitch;
    const ch = Math.cos(pitch) * r.dist;
    const ground = this.groundAt(r.x, r.y);
    this.camera.position.set(r.x - fx * ch, ground + Math.sin(pitch) * r.dist, r.y - fz * ch);
    this.camera.lookAt(r.x, ground, r.y);
    this.camera.near = Math.max(0.5, r.dist * 0.01);
    this.camera.far = Math.max(6000, r.dist * 30);
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
    this.dome.position.copy(this.camera.position);
    this.dome.scale.setScalar(this.camera.far * 0.9);
    // Haze: thicker the further you see, by the city's air.
    this.fog.density = (0.55 + this.look.haze * 0.9) / (4.2 * r.dist + 1800);
    // Shadows: fitted around what is in view, off when the whole city shows.
    const S = Math.max(90, Math.min(1600, r.dist * 1.15));
    const sd = this.skyState.sunDir;
    this.sun.castShadow = !this.degraded && r.dist < 4500 && sd.y > 0.05;
    const cam = this.sun.shadow.camera;
    cam.left = -S;
    cam.right = S;
    cam.top = S;
    cam.bottom = -S;
    cam.near = 1;
    cam.far = S * 8;
    cam.updateProjectionMatrix();
    // Snap to shadow texels, so edges don't crawl while panning.
    const texel = (2 * S) / this.sun.shadow.mapSize.x;
    const cx = Math.round((r.x - fx * ch * 0.25) / texel) * texel;
    const cz = Math.round((r.y - fz * ch * 0.25) / texel) * texel;
    this.sun.target.position.set(cx, 0, cz);
    this.sun.position.set(cx + sd.x * S * 4, sd.y * S * 4, cz + sd.z * S * 4);
    this.sun.target.updateMatrixWorld();
  }

  groundAt(x: number, y: number) {
    return this.roads.deckAt(x, y);
  }

  /** The ground point under a screen point (null above the horizon). */
  groundPoint(sx: number, sy: number, out = new THREE.Vector3()): THREE.Vector3 | null {
    _ndc.set((sx / this.size.w) * 2 - 1, -(sy / this.size.h) * 2 + 1);
    _rc.setFromCamera(_ndc, this.camera);
    _ray.copy(_rc.ray);
    if (_ray.direction.y > -0.002) return null;
    const t = -_ray.origin.y / _ray.direction.y;
    return out.copy(_ray.origin).addScaledVector(_ray.direction, t);
  }

  /** Grab-pan: keep the ground point that was under `from` under `to`. */
  pan(fromX: number, fromY: number, toX: number, toY: number) {
    const a = this.groundPoint(fromX, fromY, _v);
    const b = this.groundPoint(toX, toY, _v2);
    if (!a || !b) {
      // Above the horizon: move by the screen.
      const k = this.rig.dist / this.size.h;
      this.panBy((fromX - toX) * k, (fromY - toY) * k);
      return;
    }
    this.following = false;
    this.rig.x += a.x - b.x;
    this.rig.y += a.z - b.z;
    this.want.x = this.rig.x;
    this.want.y = this.rig.y;
    this.touch();
  }

  /** Pan by metres in screen directions (right, down). */
  panBy(right: number, down: number) {
    this.following = false;
    const c = Math.cos(this.rig.yaw);
    const s = Math.sin(this.rig.yaw);
    this.rig.x += right * c - down * s;
    this.rig.y += right * s + down * c;
    this.want.x = this.rig.x;
    this.want.y = this.rig.y;
    this.touch();
  }

  zoomAt(factor: number, sx?: number, sy?: number) {
    const x = sx ?? this.size.w / 2;
    const y = sy ?? this.size.h / 2;
    const before = this.groundPoint(x, y, _v)?.clone();
    this.rig.dist /= factor;
    this.want.dist = this.rig.dist;
    this.placeCamera();
    const after = this.groundPoint(x, y, _v2);
    if (before && after && sx !== undefined) {
      this.rig.x += before.x - after.x;
      this.rig.y += before.z - after.z;
      this.want.x = this.rig.x;
      this.want.y = this.rig.y;
    }
    this.touch();
  }

  rotate(dYaw: number, dPitch: number) {
    this.rig.yaw += dYaw;
    this.rig.pitch += dPitch;
    this.touch();
  }

  /** Glide the camera to a point (and distance). */
  flyTo(x: number, y: number, dist?: number) {
    this.want.x = x;
    this.want.y = y;
    if (dist) this.want.dist = dist;
    this.touch(1200);
  }

  /** Something changed: draw (and keep drawing for a moment). */
  touch(ms = 400) {
    this.dirty = true;
    this.activeUntil = Math.max(this.activeUntil, performance.now() + ms);
  }
  invalidate() {
    this.dirty = true;
  }

  // ---------------------------------------------------------------------------
  // Picking and projecting

  /** The game place under a screen point. */
  pickPlace(sx: number, sy: number): Place | null {
    _ndc.set((sx / this.size.w) * 2 - 1, -(sy / this.size.h) * 2 + 1);
    _rc.setFromCamera(_ndc, this.camera);
    const o = _rc.ray.origin;
    const d = _rc.ray.direction;
    let best: Place | null = null;
    let bt = Infinity;
    for (const b of this.places) {
      // Into the box's frame.
      const c = Math.cos(-b.rot);
      const s = Math.sin(-b.rot);
      const ox = o.x - b.x;
      const oz = o.z - b.y;
      const lx = ox * c - oz * s;
      const lz = ox * s + oz * c;
      const dx = d.x * c - d.z * s;
      const dz = d.x * s + d.z * c;
      const pad = Math.max(2, this.rig.dist * 0.01);
      const t = slab(
        [lx, o.y, lz],
        [dx, d.y, dz],
        [-b.w / 2 - pad, -1, -b.d / 2 - pad],
        [b.w / 2 + pad, b.h + pad, b.d / 2 + pad],
      );
      if (t !== null && t < bt) {
        bt = t;
        best = b.place;
      }
    }
    return best;
  }

  /** World → CSS px (z > 1 when behind the camera). */
  project(x: number, y: number, z: number, out: { x: number; y: number; z: number }) {
    _v.set(x, y, z).project(this.camera);
    out.x = (_v.x * 0.5 + 0.5) * this.size.w;
    out.y = (-_v.y * 0.5 + 0.5) * this.size.h;
    out.z = _v.z;
    return out;
  }

  onFrame(cb: () => void) {
    this.onFrameCbs.add(cb);
    return () => this.onFrameCbs.delete(cb);
  }

  // ---------------------------------------------------------------------------
  // The loop

  private lastChunkAt = { x: Infinity, y: Infinity, d: 0 };
  private lastT = 0;

  private loop(t: number) {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    if (document.visibilityState === 'hidden' || this.paused) return;
    const dt = Math.min(0.1, this.lastT ? (t - this.lastT) / 1000 : 0.016);
    this.lastT = t;
    // Follow the avatar; glide to where we were sent.
    const av = this.actors.avatarPos();
    if (this.following) {
      this.want.x = av.x;
      this.want.y = av.y;
    }
    const k = 1 - Math.pow(0.0015, dt);
    const ddx = this.want.x - this.rig.x;
    const ddy = this.want.y - this.rig.y;
    const ddd = this.want.dist - this.rig.dist;
    if (Math.abs(ddx) > 0.05 || Math.abs(ddy) > 0.05 || Math.abs(ddd) > 0.05) {
      this.rig.x += ddx * k;
      this.rig.y += ddy * k;
      this.rig.dist += ddd * k;
      this.dirty = true;
    }
    const moved = this.actors.update(t, this.opts.reduced, this.rig.dist);
    if (moved) this.dirty = true;
    const active = this.dirty || t < this.activeUntil || this.actors.busy();
    const ambient = !this.opts.reduced;
    // Idle: about 20 frames a second for the traffic and the water.
    if (!active && !(ambient && t - this.lastRender > 50)) return;
    this.dirty = false;
    // Chunks near the camera.
    const lc = this.lastChunkAt;
    if (
      Math.hypot(lc.x - this.rig.x, lc.y - this.rig.y) > 150 ||
      Math.abs(lc.d - this.rig.dist) / (lc.d || 1) > 0.25
    ) {
      this.lastChunkAt = { x: this.rig.x, y: this.rig.y, d: this.rig.dist };
      this.updateChunks();
    }
    if (this.queue.length) {
      this.buildQueued(active ? 6 : 14);
      this.dirty = true;
    }
    this.shared.uTime.value = t / 1000;
    this.sky.uTime.value = t / 1000;
    this.placeCamera();
    this.renderer.render(this.scene, this.camera);
    for (const cb of this.onFrameCbs) cb();
    // Adapt the resolution to how fast frames come.
    const frame = t - this.lastRender;
    this.lastRender = t;
    // Very slow frames (a software renderer, an old phone): shadows off, fewer pixels.
    if (frame > 250 && frame < 20000) {
      this.slow++;
      if (this.slow >= 4 && !this.degraded) {
        this.degraded = true;
        this.renderer.shadowMap.enabled = false;
        this.sun.castShadow = false;
        this.dprMax = 1;
        this.setDpr(1);
      }
    } else this.slow = 0;
    if (frame < 200) {
      this.frameTimes.push(frame);
      if (this.frameTimes.length > 40) {
        const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
        this.frameTimes.length = 0;
        if (active && avg > 34 && this.dpr > 1) this.setDpr(this.dpr - 0.25);
        else if (avg < 18 && this.dpr < this.dprMax) this.setDpr(this.dpr + 0.25);
      }
    }
    const info = this.renderer.info;
    this.stats.draws = info.render.calls;
    this.stats.tris = info.render.triangles;
    this.stats.frameMs = Math.round(frame);
    this.stats.dpr = this.dpr;
  }

  private setDpr(d: number) {
    this.dpr = Math.max(1, Math.min(this.dprMax, d));
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.setSize(this.size.w, this.size.h, false);
  }

  /** Draw one frame now (tests, screenshots). */
  renderNow() {
    this.updateChunks();
    while (this.queue.length) this.buildQueued(1000);
    this.placeCamera();
    this.renderer.render(this.scene, this.camera);
    for (const cb of this.onFrameCbs) cb();
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    document.removeEventListener('visibilitychange', this.onVis);
    this.actors.dispose();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose?.();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat?.dispose?.();
    });
    this.env?.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}

/** Ray vs. axis-aligned box (slab test): the entry distance, or null. */
function slab(o: number[], d: number[], lo: number[], hi: number[]): number | null {
  let t0 = 0;
  let t1 = Infinity;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]!) < 1e-9) {
      if (o[i]! < lo[i]! || o[i]! > hi[i]!) return null;
      continue;
    }
    let a = (lo[i]! - o[i]!) / d[i]!;
    let b = (hi[i]! - o[i]!) / d[i]!;
    if (a > b) [a, b] = [b, a];
    t0 = Math.max(t0, a);
    t1 = Math.min(t1, b);
    if (t0 > t1) return null;
  }
  return t0;
}

/** How each kind of game place stands in 3D (metres). */
function placeSpec(p: Place): {
  w: number;
  d: number;
  h: number;
  style: number;
  wall?: string;
  roof?: string;
} {
  const W = (k: number, max = 40) => Math.min(max, Math.max(8, p.w * 30 * k));
  const D = (k: number, max = 40) => Math.min(max, Math.max(8, p.d * 30 * k));
  switch (p.kind) {
    case 'stall':
      return { w: 4.5, d: 3.2, h: 3, style: 7 };
    case 'newsstand':
      return { w: 5, d: 3.5, h: 3.2, style: 7, wall: '#2f5d50' };
    case 'airport':
      return { w: W(0.8, 140), d: D(0.6, 60), h: 22, style: 3, wall: '#7f9aab' };
    case 'eventhall':
      return { w: W(0.8, 70), d: D(0.7, 50), h: 16, style: 2 };
    case 'hub':
      return { w: W(0.75), d: D(0.75), h: 19, style: 2 };
    case 'office': {
      const lvl = p.level ?? 1;
      return { w: W(0.7), d: D(0.7), h: Math.min(90, 12 + lvl * 9), style: lvl >= 3 ? 3 : 2 };
    }
    case 'home':
      return { w: W(0.6, 26), d: D(0.6, 26), h: 9 + (p.level ?? 1) * 6, style: 0 };
    case 'fund':
    case 'capital':
      return { w: W(0.7), d: D(0.7), h: Math.max(30, Math.min(110, p.h * 0.7)), style: 3 };
    case 'lender':
    case 'playerbank': {
      const m = p.motif;
      if (m === 'tower') return { w: W(0.7), d: D(0.7), h: 80, style: 3 };
      if (m === 'glass') return { w: W(0.7), d: D(0.7), h: 45, style: 3 };
      if (m === 'columns') return { w: W(0.7), d: D(0.7), h: 22, style: 4, wall: '#d9d2c3' };
      return { w: W(0.6, 18), d: D(0.6, 14), h: 8, style: 0 };
    }
    case 'business':
      return { w: W(0.55, 18), d: D(0.55, 16), h: 8, style: 0 };
    default:
      return { w: W(0.6), d: D(0.6), h: 12, style: 0 };
  }
}

export { placeSpec };

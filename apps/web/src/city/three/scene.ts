import { citySun } from '../solar';
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
import { makeShared, facadeMaterial, setNightLook } from './materials';
import { RoadIndex } from './roads';
import { canvasJpeg } from '../../photos/snap';
import {
  boxMeshes,
  bytes,
  CHUNK,
  cleanOutline,
  LotMaker,
  mergedMesh,
  osmFootprints,
  h3,
  centroid,
  type BoxB,
  type Centre,
  type Footprint,
} from './buildings';
import { buildGround, canopyLand, mixHex } from './ground';
import { discPoly, FootprintGrid, makeFp, rectPoly, segRectDist, type Fp } from './footprints';
import { homeModel, PLOT, setHomesNight } from './homes3d';
import { ROAD_HALF, COVER } from './mask';
import { hoodAt, type OwnedProperty } from '../properties';
import { covered } from '../../three-kit/cover';
import { applySky, skyAt, skyDome, skyEnvironment, skyUniforms, type SkyState } from './sky';
import { canopyMeshes, forestSpots, treeMeshes, treeSpots, type TreeSpot } from './trees';
import { buildLandmarks, EXTRA_3D, landmarkLights, type LandmarkPlan } from './landmarks';
import {
  beacons,
  glowMaterial,
  glowPoints,
  glowUniforms,
  streetLamps,
  towerCrowns,
} from './lights';
import { Actors } from './actors';
import { loadTiles, type TileSet } from './tiles';
import {
  TerrainPatcher,
  heightAt,
  terrainGround,
  terrainMaterial,
  terrainUniforms,
  tessellate,
  type TerrainField,
} from './terrain';
import { makePlane3D } from '../../three-kit/plane';
import type { AvatarLook } from '../art';
import type { Walker } from '../people';

/** Least time between two frames on a software renderer (ms). */
const SOFT_FRAME_MS = 200;
/** How often a software renderer compiles new shaders ahead of drawing (ms). */
const SOFT_COMPILE_MS = 1500;
/** How long a software renderer gives new shaders before the frame that needs them (ms). */
const SOFT_COMPILE_WAIT_MS = 300;
/** Most pixels a software renderer shades a frame (a phone screen's worth). */
const SOFT_PIXELS = 360_000;

export type Tier = 'high' | 'low';

export interface SceneOptions {
  tier: Tier;
  reduced: boolean;
  /** Local hour (fractional), from the city's clock. */
  hour: number;
  /**
   * Wave 12: a sky view (experiences/Panorama): the camera is flown by a
   * ViewController, the whole city loads, there are no shadows, and with a
   * terrain everything stands on the real hills.
   */
  sky?: { terrain: TerrainField | null };
  /**
   * WebGL on the CPU (SwiftShader, llvmpipe): no antialiasing or shadows, one
   * pixel per CSS pixel and a thinner far city, from the first frame.
   */
  soft?: boolean;
}

/**
 * Wave 12: something that flies the camera itself (a sky view: the ride up
 * a wheel, along a cable or up a tower, then free look). It places the camera
 * each frame and says which ground point the view is over and how far it
 * reaches, so the city around is loaded that far.
 */
export interface ViewController {
  place(camera: THREE.PerspectiveCamera): { x: number; y: number; reach: number };
  /** Still moving (a ride, a drag easing out): keep drawing. */
  busy(): boolean;
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
/** Full-density tiles' size (metres): the city file's outlines are grouped the same way. */
const TILE_M = 1000;

/** Ground a landmark model covers (metres). */
function landmarkRadius(kind: string) {
  const r: Record<string, number> = {
    'burj-al-arab': 75,
    'london-eye': 70,
    'burj-khalifa': 60,
    kicc: 45,
    dome: 50,
  };
  return r[kind] ?? 40;
}
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
  layout: CityLayout;
  geo: GeoWorld;
  readonly roads: RoadIndex;
  readonly mask: GroundMask;
  readonly places: PlaceBox[] = [];
  readonly actors: Actors;

  /** Camera rig: target on the ground (metres), distance, yaw (0 = north), pitch. */
  rig = { x: 0, y: 0, dist: 700, yaw: 0, pitch: 0.64 };
  private want = { x: 0, y: 0, dist: 700 };
  following = true;
  /** Driving: the camera rides behind the car, looking down the road. */
  private chaseOn = false;
  private savedRig: { dist: number; pitch: number; yaw: number } | null = null;
  /** Stop drawing on its own (screenshots and tests draw with renderNow). */
  paused = false;
  /** Wave 12: a sky view flying the camera (null: the map's own rig). */
  view: ViewController | null = null;
  private viewReach = 0;
  /** Wave 12: the terrain under a sky view (null: flat, as the map is). */
  readonly terrain: TerrainField | null = null;
  private patcher: TerrainPatcher | null = null;
  private lastPatch = 0;
  /** Wave 12: the water's material (a sky view's own rivers share it). */
  readonly waterMaterial: THREE.Material | null = null;
  /** Wave 12: a moment to light the sky for instead of now (ms; null: now). */
  private sunTime: number | null = null;

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
  /** Night: street lamps, landmark and tower lights (glowing sprites). */
  private glow = glowUniforms();
  readonly glowMat: THREE.ShaderMaterial;
  private nightSets: THREE.Object3D[] = [];
  private lots: LotMaker;
  private chunks = new Map<string, { group: THREE.Group; ci: number; cj: number }>();
  private queue: [number, number][] = [];
  private tiles: TileSet | null = null;
  /** Whether the tiles' index has answered (infill waits for it). */
  private tilesKnown = false;
  /** The city file's outlines, by 1 km tile (hidden while a full-density tile stands there). */
  private fileTiles = new Map<string, THREE.Group>();
  /** Real outlines standing from the city file. */
  private realGrid = new FootprintGrid();
  /** The game's places and the landmarks: nothing else stands there. */
  readonly blocked = new FootprintGrid();
  private clear: { e: number; s: number; r: number }[] = [];
  /** The homes you own, on their plots (Wave 10). */
  readonly homes: {
    prop: OwnedProperty;
    x: number;
    y: number;
    w: number;
    d: number;
    h: number;
    rot: number;
  }[] = [];
  private homesGroup = new THREE.Group();
  /** The game's places (rebuilt in place when only their looks change). */
  private placesGroup = new THREE.Group();
  private placeFps: Fp[] = [];
  private homePlots: Fp[] = [];
  private homesKey = '';
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
      antialias: !opts.soft,
      powerPreference: 'high-performance',
      stencil: false,
    });
    // Phones: at most 1.5 device pixels per CSS pixel (sharp enough on a small
    // screen; 1.75 draws a third more pixels for little to see).
    // A sky view sees the whole city at once: 1.25 (1.5 on a big screen) is plenty.
    const cap = opts.sky ? (high ? 1.5 : 1.25) : high ? 2 : 1.5;
    this.dprMax = opts.soft ? 1 : Math.min(2, window.devicePixelRatio || 1, cap);
    this.dpr = this.dprMax;
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = !opts.soft;
    // Reading back every shader's log waits for it to compile: on a CPU that's seconds.
    // A sky view too: it brings a whole city's shaders at once (and see programsReady).
    if (opts.soft || opts.sky) this.renderer.debug.checkShaderErrors = false;
    if (opts.soft) this.degraded = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    // Redrawn when something that casts one moved (see loop), not every frame.
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.shadowMap.needsUpdate = true;

    this.camera = new THREE.PerspectiveCamera(38, 1, 1, 50000);
    this.glowMat = glowMaterial(this.glow);
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
    setNightLook(this.shared, this.look.night);
    this.skyState = skyAt(
      this.hour,
      this.look.lat,
      this.look.haze,
      citySun(this.layout.marketId),
      this.look.hazeTint,
      this.look.night.skyGlow,
    );
    this.applySky();
    this.dome.userData.noTerrain = true;

    // ---- The city.
    const data = this.geo.data;
    this.mask = new GroundMask(data, high ? 2048 : 1400);
    this.roads = new RoadIndex(data);
    this.instMat = facadeMaterial(this.shared, true);
    this.nearMat = facadeMaterial(this.shared, true, 'near');
    this.farMat = facadeMaterial(this.shared, true, 'far');
    this.mergedMat = facadeMaterial(this.shared, false);

    const plans = this.landmarkPlans();
    const landmarks = buildLandmarks(plans, this.roads, this.look.night.accent);
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
    this.waterMaterial = ground.water.material as THREE.Material;
    this.addNight(glowPoints(landmarkLights(landmarks), this.glowMat));
    // Wave 12: a sky view stands the city on its terrain.
    // (Flat cities — Lagos, Dubai — stay flat: nothing to see and less to draw.)
    const terrain = opts.sky?.terrain && opts.sky.terrain.max >= 25 ? opts.sky.terrain : null;
    if (terrain) {
      this.terrain = terrain;
      const u = terrainUniforms(terrain);
      this.patcher = new TerrainPatcher(u, terrain.max);
      ground.water.userData.noTerrain = true;
      for (const d of ground.decks) d.userData.noTerrain = true;
      for (const p of plans)
        if (p.e2 !== undefined) {
          const b = landmarks.getObjectByName(p.name);
          if (b) b.userData.noTerrain = true;
        }
      let land: THREE.Mesh | null = null;
      for (const c of ground.group.children) {
        const m = c as THREE.Mesh;
        if (!m.isMesh || c === ground.water || c.userData.noTerrain) continue;
        if (c.name === 'ground-land') {
          land = m;
          continue;
        }
        // Forested hills: the wild land is the terrain's own forest (canopyLand), not a flat green.
        if (c.name === 'ground-green' && this.look.canopy) {
          c.visible = false;
          continue;
        }
        // Long flat triangles cut finer, so they follow the hills.
        // (Beyond the map the cells are hundreds of metres: a coarser cut is plenty
        // there, and the finest one made it 600,000 triangles and a second's work.)
        const g = tessellate(m.geometry, c.name === 'ground-horizon' ? 320 : high ? 60 : 90);
        m.geometry.dispose();
        m.geometry = g;
      }
      if (land) {
        const mat = terrainMaterial(land.material as THREE.Material, u);
        if (mat) {
          if (this.look.canopy) canopyLand(mat, this.look.canopy);
          mat.depthWrite = true;
          mat.polygonOffset = true;
          mat.polygonOffsetFactor = 1;
          mat.polygonOffsetUnits = 2;
          const tm = terrainGround(terrain, this.mask, data.bounds, mat, {
            // About 300 cells across the city (finer where it is small).
            step: Math.max(
              high ? 32 : 48,
              Math.max(data.bounds[2] - data.bounds[0], data.bounds[3] - data.bounds[1]) /
                (high ? 360 : 240),
            ),
            skirt: 40000,
          });
          tm.renderOrder = -38.5;
          tm.receiveShadow = false;
          tm.userData.onTerrain = true;
          tm.name = 'terrain';
          ground.group.add(tm);
        }
      }
    }

    // Ground cleared for landmarks and the game's places.
    const clear = [...this.geo.clear];
    for (const p of plans) if (p.e2 === undefined) clear.push({ e: p.e, s: p.s, r: 40 });
    this.clear = clear;

    // No infill or trees where the game's places and the landmarks stand.
    for (const c of clear) this.mask.markBuilt(c.e, c.s, c.r + 8);

    // The game's places: their own buildings, glowing softly.
    this.scene.add(this.placesGroup);
    this.buildPlaces();
    // The landmarks' ground: no real outline or lot may stand there.
    // A bridge's: its line out from the shores (the file maps its towers as
    // tall outlines, which stood as black blocks beside the model's own).
    for (const p of plans)
      if (p.e2 === undefined) this.blocked.add(makeFp(discPoly(p.e, p.s, landmarkRadius(p.kind))));
      else if (p.s2 !== undefined) {
        const L = Math.hypot(p.e2 - p.e, p.s2 - p.s);
        const rot = Math.atan2(p.s2 - p.s, p.e2 - p.e);
        const mid = { x: (p.e + p.e2) / 2, y: (p.s + p.s2) / 2 };
        this.blocked.add(makeFp(rectPoly(mid.x, mid.y, L * 0.8, 30, rot)));
      }

    // OSM outlines, thinned (no two in one space), merged per 1 km tile: a
    // full-density tile, when it stands, takes over its square.
    const osm = osmFootprints(data, this.look, clear, layout.marketId, {
      blocked: this.blocked,
      grid: this.realGrid,
    });
    const byTile = new Map<string, { polys: Footprint[]; boxes: BoxB[] }>();
    const slot = (x: number, y: number) => {
      const k = `${Math.floor(x / TILE_M)}_${Math.floor(y / TILE_M)}`;
      let a = byTile.get(k);
      if (!a) byTile.set(k, (a = { polys: [], boxes: [] }));
      return a;
    };
    for (const f of osm.polys) {
      const c = centroid(f.p);
      slot(c.x, c.y).polys.push(f);
    }
    for (const b of osm.boxes) slot(b.x, b.y).boxes.push(b);
    for (const [k, list] of byTile) {
      const g = new THREE.Group();
      const m = mergedMesh(list.polys, this.mergedMat);
      if (m) g.add(m);
      for (const b of boxMeshes(list.boxes, this.instMat)) g.add(b);
      this.fileTiles.set(k, g);
      this.scene.add(g);
    }

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
      { real: this.realGrid, blocked: this.blocked },
    );
    this.scene.add(this.lowGroup, this.tallGroup);

    // Trees.
    const spots = treeSpots(data, this.look, this.mask, high ? 26000 : 11000);
    this.stats.trees = spots.length;
    const palms = this.look.palms ?? 0;
    if (palms > 0) {
      // Palms among the city's own trees (Freetown's mangoes and palms).
      const isPalm = (t: TreeSpot) => h3(Math.round(t.x * 5), Math.round(t.y * 5), 81) < palms;
      this.scene.add(
        treeMeshes(
          spots.filter((t) => !isPalm(t)),
          this.look,
          high,
        ),
      );
      this.scene.add(treeMeshes(spots.filter(isPalm), { ...this.look, tree: 'palm' }, high));
    } else this.scene.add(treeMeshes(spots, this.look, high));
    // Wave 12: a sky view over forested hills sees the forest.
    if (this.terrain && this.look.canopy) {
      const tf = this.terrain;
      const n = opts.soft ? 4000 : high ? 24000 : 12000;
      const forest = forestSpots(data, this.look, this.mask, (x, y) => heightAt(tf, x, y), n);
      this.stats.trees += forest.length;
      this.scene.add(canopyMeshes(forest, this.look.canopy));
    }

    // Street lamps (night): the streets around you first (a sky view: round the
    // city's centre). They follow you across the city (refreshLamps).
    const night = this.look.night;
    const at = opts.sky ? { e: 0, s: 0 } : toMetres(layout.start);
    this.lampsAt = { x: at.e, y: at.s };
    this.lamps = glowPoints(
      streetLamps(this.roads, high ? 40000 : 18000, night.lamps, this.lampsAt),
      this.glowMat,
    );
    this.addNight(this.lamps);
    this.addNight(glowPoints(beacons(osm.fps), this.glowMat));
    // Lit crowns on the towers, in the city's own accent (Dubai's gold).
    this.addNight(
      glowPoints(towerCrowns(osm.fps, night.accent, night.crowns, high ? 60 : 90), this.glowMat),
    );

    // People and traffic.
    this.actors = new Actors(
      this.scene,
      layout,
      this.roads,
      look,
      walkers,
      opts.tier,
      opts.reduced,
      this.glowMat,
    );
    this.actors.setNight(this.skyState.night);

    // Start at the avatar.
    const start = toMetres(layout.start);
    this.rig.x = this.want.x = start.e;
    this.rig.y = this.want.y = start.s;

    if (this.patcher) this.patcher.patch(this.scene);
    this.stats.buildMs = Math.round(performance.now() - t0);
    // Infill waits for the tiles' index: where real buildings stand, none is made.
    void loadTiles(layout.marketId)
      .catch(() => null)
      .then((t) => {
        if (this.disposed) return;
        if (t) {
          this.tiles = t;
          this.lots.setTiles(t.keys, t.size);
        }
        this.tilesKnown = true;
        this.lastChunkAt = { x: Infinity, y: Infinity, d: 0 };
        this.backgroundTall();
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

  /**
   * The same city, laid out again (a new office level, a siren, a business
   * that closed): the places are rebuilt where they stand, and the camera,
   * the avatar and everything else stay as they are. False when a place is
   * new or moved, or the map is another: then the city must be built again.
   */
  updatePlaces(layout: CityLayout): boolean {
    if (layout === this.layout) return true;
    if (!layout.geo || layout.geo.data !== this.geo.data) return false;
    const was = new Map(this.layout.places.map((p) => [p.id, p]));
    for (const p of layout.places) {
      const o = was.get(p.id);
      if (!o || o.x !== p.x || o.y !== p.y || o.w !== p.w || o.d !== p.d || o.kind !== p.kind)
        return false;
    }
    this.layout = layout;
    this.geo = layout.geo;
    this.buildPlaces();
    this.actors.setPlaces(layout.places);
    this.invalidate();
    return true;
  }

  private buildPlaces() {
    // Out with the old (shared materials stay).
    this.placesGroup.traverse((o) => {
      (o as THREE.Mesh).geometry?.dispose();
      // The airport's planes bring their own materials.
      if (o.userData.ownMaterial) ((o as THREE.Mesh).material as THREE.Material).dispose();
    });
    this.placesGroup.clear();
    for (const f of this.placeFps) this.blocked.remove(f);
    this.placeFps = [];
    this.places.length = 0;
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
      } else if (p.kind === 'golf') {
        // The golf course: lawn, a fairway, the green with its flag, a bunker,
        // the clubhouse by the road (local axes: u along the width, v deep).
        const at = (u: number, v: number) => ({
          x: cx + u * w * co - v * d * si,
          y: cy + u * w * si + v * d * co,
        });
        const flat = (
          u: number,
          v: number,
          bw: number,
          bd: number,
          h: number,
          col: string,
          y0 = 0,
          style = 7,
          roofType: 0 | 1 = 0,
        ) => {
          const q = at(u, v);
          boxes.push({
            x: q.x,
            y: q.y,
            w: bw,
            d: bd,
            h,
            y0,
            rot,
            style,
            wall: bytes(col),
            roof: bytes(col),
            seed: r,
            vOff: 0,
            roofType,
          });
        };
        flat(0, 0, w + 10, d + 10, 0.25, '#3f8a24');
        flat(0, -0.05, w * 0.3, d * 0.9, 0.32, '#6fb83a');
        flat(-0.12, -0.32, w * 0.34, d * 0.26, 0.38, '#93d653');
        flat(0.2, -0.3, w * 0.14, d * 0.1, 0.36, '#ead9a0');
        flat(-0.3, 0.05, w * 0.16, d * 0.14, 0.34, '#3fa9e0');
        flat(-0.12, -0.32, 0.25, 0.25, 7, '#f8fafc', 0.38);
        flat(-0.12 + 0.9 / w, -0.32, 1.8, 0.12, 1.1, '#ef4444', 6.1);
        flat(0.32, 0.36, 14, 9, 5, '#efe9dc', 0.25, 0, 1);
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
      // The airport: airliners parked nose-in on the airside, behind the terminal.
      if (p.kind === 'airport') {
        const len = Math.hypot(door.e - c.e, door.s - c.s) || 1;
        const ue = (door.e - c.e) / len;
        const us = (door.s - c.s) / len;
        const back = d / 2 + 24;
        for (const [k, off] of [-26, 26].entries()) {
          const pe = cx - ue * back - us * off;
          const ps = cy - us * back + ue * off;
          const plane = makePlane3D({ livery: k ? '#0f766e' : '#1d4ed8', length: 38 });
          plane.root.position.set(pe, this.groundAt(pe, ps), ps);
          plane.root.rotation.y = Math.atan2(-us, ue);
          this.placesGroup.add(plane.root);
        }
      }
    }
    const m = mergedMesh(fps, this.mergedMat);
    if (m) this.placesGroup.add(m);
    for (const b of boxMeshes(boxes, this.instMat)) this.placesGroup.add(b);
    // Their plots: no real outline or lot may stand there.
    for (const b of this.places) {
      const f = makeFp(rectPoly(b.x, b.y, b.w + 6, b.d + 6, b.rot));
      this.blocked.add(f);
      this.placeFps.push(f);
    }
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
      const budget = this.opts.soft ? 12000 : this.opts.tier === 'high' ? 70000 : 32000;
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
    if (!this.tilesKnown) return;
    this.tiles?.update(
      this.rig.x,
      this.rig.y,
      this.rig.dist,
      this.tileCtx(),
      this.view ? this.viewReach : undefined,
    );
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

  /** A set of night lights: shown only when it is dark enough to see them. */
  private addNight(o: THREE.Object3D | null) {
    if (!o) return;
    o.visible = this.skyState.night > 0.02;
    this.nightSets.push(o);
    this.scene.add(o);
  }

  // ---------------------------------------------------------------------------
  // Your homes

  /**
   * Show the homes you own at their real neighbourhoods: each on a free plot
   * near the neighbourhood's centre (off the roads, clear of buildings and
   * the game's places); tile buildings there give way.
   */
  setProperties(list: OwnedProperty[]) {
    const key = list.map((p) => `${p.id}:${p.tier}:${p.neighbourhood}`).join('|');
    if (key === this.homesKey) return;
    this.homesKey = key;
    this.homesGroup.removeFromParent();
    this.homesGroup.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    this.homesGroup = new THREE.Group();
    for (const f of this.homePlots) this.blocked.remove(f);
    this.homePlots = [];
    this.homes.length = 0;
    for (const prop of list) {
      const at = hoodAt(this.geo.data, this.layout.marketId, prop.neighbourhood || prop.name);
      const [w, d] = PLOT[prop.tier];
      const spot = this.freePlot(at.x, at.y, w, d, prop.id);
      if (!spot) continue;
      const { group, h } = homeModel(prop.tier, h3(prop.id.length, prop.id.charCodeAt(0) || 1));
      group.position.set(spot.x, this.groundAt(spot.x, spot.y), spot.y);
      group.rotation.y = -spot.rot;
      this.homesGroup.add(group);
      const plot = makeFp(rectPoly(spot.x, spot.y, w + 4, d + 4, spot.rot));
      this.blocked.add(plot);
      this.homePlots.push(plot);
      this.homes.push({ prop, x: spot.x, y: spot.y, w, d, h, rot: spot.rot });
    }
    this.scene.add(this.homesGroup);
    // Real buildings on the new plots give way: the tiles are thinned again.
    if (this.tiles && this.tilesKnown) {
      this.tiles.reset(this.tileCtx());
      this.lastChunkAt = { x: Infinity, y: Infinity, d: 0 };
    }
    this.invalidate();
  }

  /** A free plot near (x, y), facing the nearest street. */
  private freePlot(x: number, y: number, w: number, d: number, seed: string) {
    const turn = (seed.charCodeAt(seed.length - 1) || 0) * 0.37;
    for (let r = 0; r <= 900; r += 18)
      for (let k = 0; k < Math.max(1, Math.round(r / 12)); k++) {
        const a = turn + (k / Math.max(1, Math.round(r / 12))) * Math.PI * 2;
        const px = x + Math.cos(a) * r;
        const py = y + Math.sin(a) * r;
        if (this.mask.coverAt(px, py) === COVER.water) continue;
        const road = this.roads.nearest(px, py, 200);
        const rot = road ? road.angle : 0;
        let ok = true;
        this.roads.forNear(px, py, Math.hypot(w, d) / 2 + 16, (sg) => {
          if (
            ok &&
            segRectDist(sg.ax, sg.ay, sg.bx, sg.by, px, py, w, d, rot) < ROAD_HALF[sg.c]! + 2
          )
            ok = false;
        });
        if (!ok) continue;
        const f = makeFp(rectPoly(px, py, w + 4, d + 4, rot));
        if (this.realGrid.overlapsPlan(f) || this.blocked.overlapsPlan(f)) continue;
        return { x: px, y: py, rot };
      }
    return null;
  }

  /** The home of yours under a screen point. */
  pickHome(sx: number, sy: number): OwnedProperty | null {
    _ndc.set((sx / this.size.w) * 2 - 1, -(sy / this.size.h) * 2 + 1);
    _rc.setFromCamera(_ndc, this.camera);
    const o = _rc.ray.origin;
    const dv = _rc.ray.direction;
    let best: OwnedProperty | null = null;
    let bt = Infinity;
    for (const b of this.homes) {
      const c = Math.cos(-b.rot);
      const s = Math.sin(-b.rot);
      const ox = o.x - b.x;
      const oz = o.z - b.y;
      const t = slab(
        [ox * c - oz * s, o.y, ox * s + oz * c],
        [dv.x * c - dv.z * s, dv.y, dv.x * s + dv.z * c],
        [-b.w / 2, -1, -b.d / 2],
        [b.w / 2, b.h + 14, b.d / 2],
      );
      if (t !== null && t < bt) {
        bt = t;
        best = b.prop;
      }
    }
    return best;
  }

  private tileCtx() {
    return {
      scene: this.scene,
      mat: this.mergedMat,
      inst: this.instMat,
      look: this.look,
      clear: this.clear,
      blocked: this.blocked,
      glow: this.glowMat,
      onShow: (k: string, shown: boolean) => {
        const g = this.fileTiles.get(k);
        if (g) g.visible = !shown;
        this.invalidate();
      },
      // The map under a place's scene (going home, say): a tile that arrives
      // waits for the map to show again, not laid out while the place opens.
      stage: this.opts.sky
        ? (show: () => void) => {
            this.staged.push(show);
            this.invalidate();
          }
        : (show: () => void) => {
            if (this.paused || covered()) this.staged.push(show);
            else show();
          },
    };
  }

  // ---------------------------------------------------------------------------
  // Sky

  setHour(hour: number) {
    if (Math.abs(hour - this.hour) < 0.05) return;
    if (Number.isNaN(hour)) return;
    this.hour = hour;
    this.skyState = skyAt(
      hour,
      this.look.lat,
      this.look.haze,
      citySun(this.layout.marketId, this.sunTime ?? Date.now()),
      this.look.hazeTint,
      this.look.night.skyGlow,
    );
    this.applySky();
    this.invalidate();
  }

  /**
   * Wave 12: light the sky for a moment of today (ms) — a sunset, the night —
   * or now again (null). `hour` is the city's local hour at that moment.
   */
  setSunTime(at: number | null, hour: number) {
    this.sunTime = at;
    this.hour = Number.NaN;
    this.setHour(hour);
  }

  /** How dark it is: 0 day … 1 night (for the map's `data-night`). */
  get night() {
    return this.skyState.night;
  }

  private lamps: THREE.Points | null = null;
  private lampsAt = { x: 0, y: 0 };

  /**
   * The street lamps' budget goes to the streets round where you are: when
   * the view has moved far from them (a ride across the city), relay them.
   * Only at night, and at most once per few kilometres.
   */
  refreshLamps() {
    if (this.opts.sky || this.skyState.night < 0.02 || !this.lamps) return;
    const d = Math.hypot(this.rig.x - this.lampsAt.x, this.rig.y - this.lampsAt.y);
    if (d < 2500) return;
    this.lampsAt = { x: this.rig.x, y: this.rig.y };
    const list = streetLamps(
      this.roads,
      this.opts.tier === 'high' ? 40000 : 18000,
      this.look.night.lamps,
      this.lampsAt,
    );
    const next = glowPoints(list, this.glowMat);
    if (!next) return;
    const old = this.lamps;
    next.visible = old.visible;
    old.parent?.add(next);
    old.removeFromParent();
    old.geometry.dispose();
    this.nightSets[this.nightSets.indexOf(old)] = next;
    this.lamps = next;
    this.invalidate();
  }

  private applySky() {
    applySky(this.skyState, this.sky, this.sun, this.hemi, this.fog);
    this.shared.uNight.value = this.skyState.night;
    this.shared.uHour.value = this.hour;
    this.glow.uNight.value = this.skyState.night;
    setHomesNight(this.skyState.night);
    this.actors?.setNight(this.skyState.night);
    this.renderer.toneMappingExposure = 1.05 * this.skyState.exposure;
    for (const o of this.nightSets) o.visible = this.skyState.night > 0.02;
    // A software renderer skips the sky's reflections: rendering the sky into a
    // cube map takes seconds there, and every material compiles a heavier shader.
    if (this.opts.soft) return;
    this.env?.dispose();
    this.env = skyEnvironment(this.renderer, this.sky);
    this.scene.environment = this.env.texture;
    this.scene.environmentIntensity = 0.55 - this.skyState.night * 0.4;
  }

  // ---------------------------------------------------------------------------
  // Camera

  /** The canvas's size in CSS px (as last measured). */
  get viewSize() {
    return this.size;
  }

  /** A photo of the view right now, with a caption (the camera, ../../photos/snap.ts). */
  snapshot(caption?: string): string | null {
    try {
      this.renderer.render(this.scene, this.camera);
      // What a view draws over the city (an aircraft) is in the photo too.
      for (const cb of this.onFrameCbs) cb();
    } catch {
      return null;
    }
    return canvasJpeg(this.renderer.domElement, { caption });
  }

  resize(w: number, h: number) {
    // The same size again (a ResizeObserver's first call): resizing the canvas
    // clears and reallocates it even so, a second on a software renderer.
    if (Math.max(1, w) === this.size.w && Math.max(1, h) === this.size.h) return;
    this.size = { w: Math.max(1, w), h: Math.max(1, h) };
    if (this.opts.soft) {
      // Every pixel is shaded on the CPU: a big window draws fewer, scaled up.
      const fit = Math.sqrt(SOFT_PIXELS / (this.size.w * this.size.h));
      this.dprMax = this.dpr = Math.min(1, Math.max(0.4, fit));
      this.renderer.setPixelRatio(this.dpr);
    }
    this.renderer.setSize(this.size.w, this.size.h, false);
    this.camera.aspect = this.size.w / this.size.h;
    this.invalidate();
  }

  maxDist() {
    const [bx0, by0, bx1, by1] = this.geo.data.bounds;
    return Math.max(bx1 - bx0, by1 - by0) * 0.95;
  }

  private placeCamera() {
    if (this.view) {
      this.placeView(this.view);
      return;
    }
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
    this.glow.uScale.value =
      (this.size.h * this.dpr) / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2));
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

  /** A sky view's camera: placed by the view, seeing far, no shadows (the city is too big). */
  private placeView(v: ViewController) {
    const o = v.place(this.camera);
    this.viewReach = o.reach;
    this.rig.x = o.x;
    this.rig.y = o.y;
    this.rig.dist = Math.min(1500, o.reach / 2);
    const cam = this.camera;
    cam.near = 1;
    cam.far = Math.max(30000, o.reach * 8);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    this.glow.uScale.value =
      (this.size.h * this.dpr) / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2));
    this.dome.position.copy(cam.position);
    this.dome.scale.setScalar(cam.far * 0.9);
    this.fog.density = (0.55 + this.look.haze * 0.9) / (5.5 * o.reach + 2400);
    this.sun.castShadow = false;
  }

  groundAt(x: number, y: number) {
    return this.roads.deckAt(x, y);
  }

  /** Full-density tiles standing now. */
  get tileCount() {
    return this.tiles?.loaded() ?? 0;
  }

  /** Wave 12: the terrain's height at (x, y) in a sky view (0 when flat). */
  terrainAt(x: number, y: number) {
    return this.terrain ? heightAt(this.terrain, x, y) : 0;
  }

  /** Wave 12: stand new things on the terrain (a sky view's own props). */
  onTerrain(root: THREE.Object3D) {
    this.patcher?.patch(root);
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

  /** Driving your own car: a chase camera until endChase(). */
  startChase() {
    if (!this.chaseOn)
      this.savedRig = { dist: this.rig.dist, pitch: this.rig.pitch, yaw: this.rig.yaw };
    this.chaseOn = true;
    this.following = true;
    this.touch(1000);
  }

  endChase() {
    if (!this.chaseOn) return;
    this.chaseOn = false;
    const s = this.savedRig;
    if (s) {
      this.want.dist = s.dist;
      this.rig.pitch = s.pitch;
      this.rig.yaw = s.yaw;
    }
    this.savedRig = null;
    this.touch(1500);
  }

  get chasing() {
    return this.chaseOn;
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
  private ambientFrames = 0;

  private loop(t: number) {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    if (document.visibilityState === 'hidden' || this.paused) return;
    // The map under a full-screen view (a sky view, the home experiences) waits.
    if (!this.opts.sky && covered()) return;
    // On a software renderer every frame costs the page a lot: a few a second
    // leave it time to answer (the ride keeps to the clock, not the frames).
    if (this.opts.soft && t - this.lastRender < SOFT_FRAME_MS) return;
    const dt = Math.min(0.1, this.lastT ? (t - this.lastT) / 1000 : 0.016);
    this.lastT = t;
    // Follow the avatar; glide to where we were sent.
    const av = this.actors.avatarPos();
    if (this.view) this.dirty ||= this.view.busy();
    else if (this.following) {
      this.want.x = av.x;
      this.want.y = av.y;
    }
    if (this.chaseOn && !this.view) {
      // Behind the car, a little above, looking ahead down the street.
      const ease = 1 - Math.pow(0.04, dt);
      let d = Math.PI - av.heading - this.rig.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.rig.yaw += d * ease;
      this.rig.pitch += (0.42 - this.rig.pitch) * ease;
      this.want.dist = 48;
      if (this.following) {
        // Locked on (a fast car would outrun a lagging camera).
        this.want.x = this.rig.x = av.x + Math.sin(av.heading) * 12;
        this.want.y = this.rig.y = av.y + Math.cos(av.heading) * 12;
      }
      this.dirty = true;
    }
    const k = 1 - Math.pow(0.0015, dt);
    const ddx = this.want.x - this.rig.x;
    const ddy = this.want.y - this.rig.y;
    const ddd = this.want.dist - this.rig.dist;
    if (!this.view && (Math.abs(ddx) > 0.05 || Math.abs(ddy) > 0.05 || Math.abs(ddd) > 0.05)) {
      this.rig.x += ddx * k;
      this.rig.y += ddy * k;
      this.rig.dist += ddd * k;
      this.dirty = true;
    }
    const active = this.dirty || t < this.activeUntil || this.actors.busy();
    const ambient = !this.opts.reduced;
    // Idle: about 20 frames a second for the traffic and the water (10 on a
    // phone, which has the battery and the heat to think of).
    const idleMs = this.opts.soft ? 1000 : this.opts.tier === 'high' ? 50 : 100;
    if (!active && !(ambient && t - this.lastRender > idleMs)) return;
    // The people and the traffic move only in frames that are drawn.
    this.actors.setFocus(this.rig.x, this.rig.y, this.rig.dist);
    this.actors.update(t, this.opts.reduced, this.rig.dist);
    // Shadows: redrawn with the camera, the avatar or the city changing; while
    // only the traffic and the passers-by move, every few frames.
    this.renderer.shadowMap.needsUpdate =
      active || this.ambientFrames++ % (this.opts.tier === 'high' ? 2 : 4) === 0;
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
    if (this.patcher && t - this.lastPatch > 400) {
      this.lastPatch = t;
      this.patcher.patch(this.scene);
    }
    this.shared.uTime.value = t / 1000;
    this.sky.uTime.value = t / 1000;
    this.glow.uTime.value = t / 1000;
    this.placeCamera();
    // A sky view's tiles go up a few a frame: a slice of the frame's own time
    // (on a slow GPU the frames are long anyway, so more fit in each).
    if (this.staged.length && !this.warming) {
      const budget = Math.max(8, Math.min(250, this.stats.frameMs * 0.25));
      const t0 = performance.now();
      do this.staged.shift()!();
      while (this.staged.length && performance.now() - t0 < budget);
      this.dirty = true;
    }
    if (this.opts.soft && !this.shadersReady(t)) return;
    if (this.opts.sky && !this.opts.soft && !this.programsReady()) return;
    this.renderer.render(this.scene, this.camera);
    for (const cb of this.onFrameCbs) cb();
    // Adapt the resolution to how fast frames come.
    const frame = t - this.lastRender;
    this.lastRender = t;
    // A sky view's first seconds are slow while the city streams in: resizing
    // then (it waits for the GPU to finish) would only make them slower.
    const settling = this.opts.sky && (t < this.settleAt || this.staged.length > 0);
    // Very slow frames (a software renderer, an old phone): shadows off, fewer pixels.
    if (settling) this.slow = 0;
    else if (frame > 250 && frame < 20000) {
      this.slow++;
      if (this.slow >= 4 && !this.degraded) {
        this.degraded = true;
        this.renderer.shadowMap.enabled = false;
        this.sun.castShadow = false;
        this.dprMax = 1;
        this.setDpr(1);
      }
    } else this.slow = 0;
    if (frame < 200 && !settling) {
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

  private compiling = false;
  private compiledAt = -Infinity;

  /**
   * On a software renderer, compiling a shader takes seconds. Hand the new
   * ones to the GPU process first (and again, now and then, for what came into
   * view since) and draw a moment later, so the page keeps answering while
   * they compile instead of waiting on them in the middle of a frame.
   */
  private shadersReady(t: number): boolean {
    if (this.compiling) return false;
    if (t - this.compiledAt < SOFT_COMPILE_MS) return true;
    this.compiledAt = t;
    this.compiling = true;
    try {
      this.renderer.compile(this.scene, this.camera);
    } catch {
      /* drawn (and compiled) by the next frame instead */
    }
    setTimeout(() => {
      this.compiling = false;
      if (!this.disposed) this.invalidate();
    }, SOFT_COMPILE_WAIT_MS);
    return false;
  }

  private staged: (() => void)[] = [];
  private settleAt = performance.now() + 8000;
  private seen = -1;
  private warming: Set<THREE.Material> | null = null;

  /**
   * Wave 12: a sky view brings in a whole city's worth of new things (its
   * first frame, the tiles as they stream in). With KHR_parallel_shader_compile
   * their shaders compile in the background and are drawn once ready, so no
   * frame stops the page to wait for them: until then the last frame stays up.
   */
  private programsReady(): boolean {
    if (!this.renderer.extensions.has('KHR_parallel_shader_compile')) return true;
    const props = this.renderer.properties;
    const ready = (m: THREE.Material) => {
      const p = props.get(m) as { currentProgram?: { isReady(): boolean } };
      return !p.currentProgram || p.currentProgram.isReady();
    };
    if (this.warming) {
      for (const m of this.warming) if (ready(m)) this.warming.delete(m);
      this.dirty = true;
      if (this.warming.size) return false;
      this.warming = null;
      return true;
    }
    const n =
      this.scene.children.length + this.tallGroup.children.length + this.lowGroup.children.length;
    if (n === this.seen) return true;
    this.seen = n;
    // On the terrain first (else the flat copies compile too, for nothing).
    this.patcher?.patch(this.scene);
    let mats: Set<THREE.Material>;
    try {
      mats = this.renderer.compile(this.scene, this.camera);
    } catch {
      return true;
    }
    for (const m of mats) if (ready(m)) mats.delete(m);
    if (!mats.size) return true;
    this.warming = mats;
    this.dirty = true;
    return false;
  }

  private setDpr(d: number) {
    this.dpr = Math.max(Math.min(1, this.dprMax), Math.min(this.dprMax, d));
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.setSize(this.size.w, this.size.h, false);
  }

  /** Draw one frame now (tests, screenshots). */
  renderNow() {
    this.updateChunks();
    while (this.queue.length) this.buildQueued(1000);
    this.patcher?.patch(this.scene);
    this.placeCamera();
    this.renderer.shadowMap.needsUpdate = true;
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
    this.patcher?.dispose();
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
    case 'golf':
      return { w: W(0.9, 110), d: D(0.9, 90), h: 6, style: 7 };
    case 'mall':
      return { w: W(0.85, 80), d: D(0.85, 64), h: 18, style: 3, wall: '#cfd8dc' };
    case 'hub':
      return { w: W(0.75), d: D(0.75), h: 19, style: 2 };
    case 'office': {
      const lvl = p.level ?? 1;
      return { w: W(0.7), d: D(0.7), h: Math.min(90, 12 + lvl * 9), style: lvl >= 3 ? 3 : 2 };
    }
    case 'home':
      // Abroad in a named hotel, your room is in its tower.
      if (p.motif === 'b-hotel')
        return { w: W(0.65), d: D(0.65), h: 12 + (p.level ?? 3) * 9, style: 3 };
      return { w: W(0.6, 26), d: D(0.6, 26), h: 9 + (p.level ?? 1) * 6, style: 0 };
    // The feedback round's named hotels: taller with more stars.
    case 'hotel':
      return {
        w: W(0.65),
        d: D(0.65),
        h: 12 + (p.level ?? 3) * 9,
        style: (p.level ?? 3) >= 4 ? 3 : 2,
      };
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
    // City places: prominent buildings (stone columns for the state, glass and towers for money).
    case 'civic': {
      const m = p.motif;
      if (m === 'tower') return { w: W(0.75), d: D(0.75), h: 95, style: 3 };
      if (m === 'glass') return { w: W(0.75), d: D(0.75), h: 55, style: 3 };
      if (m === 'columns')
        return { w: W(0.8), d: D(0.8), h: Math.max(18, p.h * 0.5), style: 4, wall: p.color };
      return { w: W(0.8), d: D(0.8), h: Math.max(16, p.h * 0.45), style: 2 };
    }
    default:
      return { w: W(0.6), d: D(0.6), h: 12, style: 0 };
  }
}

export { placeSpec };

/**
 * Wave 9 §C: your home in 3D (lazy-loaded). The house from the floor plan
 * (./house.ts), what you own in its rooms (./furniture.ts), the people in it
 * (./character.ts) walking where the 2D scene says they are, and the home
 * acts played out: lying in bed, steam in the shower, a pan on the hob, the
 * TV flickering in front of the sofa.
 *
 * The 2D scene (../home/HomeScene.tsx) still owns the game: who walks where,
 * the menus, the commands. It sits on top as an invisible hit layer that this
 * view keeps aligned with the 3D floor (`onCamera`), and asks `api.pick` what
 * is under a tap.
 */
import { useEffect, useMemo, useRef, type ReactElement } from 'react';
import * as THREE from 'three';
import { TILE } from '../home/art';
import type { Spot } from '../home/layout';
import { makeCharacter, pose, setHair, type Character, type PoseId } from './character';
import { FIXTURE_MODEL, SLOT_MODEL, facingOf, frameOf } from './catalog';
import { buildModel, type Model } from './furniture';
import { Particles, fx } from './fx';
import { GROUND_Y, STOREY, buildHouse, cutWalls, wallOf, type House } from './house';
import { buildEstateModel } from './estate-models';
import { buildDivider, refinish } from './dividers';
import { groundsFor } from '../home/grounds';
import { Kit, disposeTree, mat } from './kit';
import { Stage, gestures, hasParkedStage, parkStage, unparkStage, type StageOpts } from './stage';
import { cullOccluders } from './surroundings';
import type { Home3DObject, Home3DPerson, Home3DProps } from './types';

const MAX_LAMPS = 4;

interface Placed {
  obj: Home3DObject;
  model: Model;
  group: THREE.Group;
  ry: number;
  /** Hung on an outer wall (hidden when that wall is cut away). */
  wall: 'back' | 'left' | 'right' | 'front' | null;
}

const modelIdOf = (o: Home3DObject): string | null => {
  // Wave 12: what a bigger home comes with, and things outside, name their model.
  if (o.model) return o.model;
  if (o.slot && o.owned) return SLOT_MODEL[o.slot] ?? null;
  if (o.slot && !o.owned) return null;
  // Fixtures: their id is the fixture's name in buildObjects (bed → mat when unowned…).
  const byId: Record<string, string> = {
    bed: 'mat',
    kitchen: 'kitchenette',
    sofa: 'cushions',
    bathroom: 'shared-bath',
    shower: 'shower',
    toilet: 'toilet',
    sink: 'sink',
    door: 'door',
    bathtub: 'bathtub',
    pool: 'pool',
    piano: 'piano',
  };
  const f = byId[o.id];
  return f ? (FIXTURE_MODEL[f] ?? null) : null;
};

/** A "+" on the floor (or wall) where something you could buy would go. */
function plusMarker(): THREE.Group {
  const k = new Kit();
  k.torus(0.2, 0.028, '#ffffff', 0, 0, 0, {
    rx: Math.PI / 2,
    emissive: '#ffffff',
    emissiveIntensity: 0.4,
    noShadow: true,
  });
  k.box(0.2, 0.02, 0.05, '#ffffff', 0, -0.01, 0, {
    emissive: '#ffffff',
    emissiveIntensity: 0.4,
    noShadow: true,
  });
  k.box(0.05, 0.02, 0.2, '#ffffff', 0, -0.01, 0, {
    emissive: '#ffffff',
    emissiveIntensity: 0.4,
    noShadow: true,
  });
  const g = k.build();
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(0.22, 24),
    mat('#22c55e', { opacity: 0.55, noShadow: true } as never),
  );
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = -0.012;
  g.add(disc);
  return g;
}

/** The home's stage: looking down on the house from the garden's corner. */
const stageOpts = (): StageOpts => ({
  target: new THREE.Vector3(),
  span: 12,
  azimuth: -0.3,
  elevation: 0.9,
  minElevation: 0.5,
  maxElevation: 1.4,
  background: '#cfe6f2',
});

/** Home views open now (the stage made ahead waits until none is). */
let open = 0;

/**
 * Make the home's stage (its WebGL context) in a quiet moment on the map, so
 * going home doesn't wait for one; it's kept for going home again too.
 */
export function prewarmHome3D() {
  if (open > 0 || hasParkedStage('home')) return;
  try {
    parkStage('home', new Stage(document.createElement('canvas'), stageOpts()));
  } catch {
    /* made when the home opens */
  }
}

export default function Home3D(props: Home3DProps): ReactElement | null {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const live = useRef(props);
  useEffect(() => {
    live.current = props;
  });
  const stageRef = useRef<Stage | null>(null);
  const placedRef = useRef(new Map<string, Placed>());
  const houseRef = useRef<House | null>(null);
  const furnRoot = useRef<THREE.Group | null>(null);
  const lampRoot = useRef<THREE.Group | null>(null);
  const markers = useRef(new Map<string, THREE.Group>());
  const ghostRef = useRef<THREE.Group | null>(null);
  const actT = useRef(0);

  const { plan, tier, objects, night, dusk, car, ghost, moving, buyMode, acting } = props;
  const garageKey = (props.cars ?? (car ? [car] : [])).join(',');
  // Wave 12: the grounds (pool, drive, a bay per car) from the plan and the garage.
  const grounds = useMemo(
    () => props.grounds ?? groundsFor(plan, garageKey ? garageKey.split(',') : []),
    [props.grounds, plan, garageKey],
  );
  // Anything that changes what people do: draw again.
  useEffect(() => {
    stageRef.current?.invalidate();
  }, [acting]);

  // ---- The stage (once).
  useEffect(() => {
    const anchor = anchorRef.current!;
    const parent = anchor.parentElement!;
    // The stage kept from the last time (or made ahead on the map): its
    // context and shaders are ready, so the home draws sooner.
    let stage: Stage;
    try {
      stage =
        unparkStage('home', stageOpts()) ??
        new Stage(document.createElement('canvas'), stageOpts());
    } catch {
      return;
    }
    const canvas = stage.canvas;
    canvas.className = 'home-3d';
    canvas.setAttribute('aria-hidden', 'true');
    canvas.setAttribute('data-home-3d', '');
    parent.insertBefore(canvas, anchor);
    open++;
    stageRef.current = stage;
    // The world round the home runs out into the haze (no edge, no sky under it):
    // the camera stands well back so nothing near it is clipped.
    stage.distance = 150;
    stage.camera.far = 600;
    stage.scene.fog = new THREE.Fog('#cfe6f2', 200, 400);
    const r = parent.getBoundingClientRect();
    stage.setSize(r.width, r.height);
    const ro = new ResizeObserver(() => {
      const b = parent.getBoundingClientRect();
      stage.setSize(b.width, b.height);
    });
    ro.observe(parent);
    // The 2D hit layer follows the floor.
    const sync = () => {
      const o = stage.project(new THREE.Vector3(0, 0, 0));
      const ex = stage.project(new THREE.Vector3(1, 0, 0));
      const ez = stage.project(new THREE.Vector3(0, 0, 1));
      const f = (n: number) => n.toFixed(4);
      live.current.onCamera(
        `matrix(${f((ex.x - o.x) / TILE)} ${f((ex.y - o.y) / TILE)} ${f((ez.x - o.x) / TILE)} ${f((ez.y - o.y) / TILE)} ${f(o.x)} ${f(o.y)})`,
      );
      if (houseRef.current) {
        cutWalls(houseRef.current, stage.azimuth);
        // The neighbours' houses (the city's towers) between you and the home step aside.
        const h = houseRef.current;
        cullOccluders(h.occluders, stage.camera, h.fitPoints, -h.drop);
        for (const p of placedRef.current.values())
          if (p.wall)
            p.group.visible =
              !houseRef.current.sides[['back', 'front', 'left', 'right'].indexOf(p.wall)]!.cut;
        for (const m of markers.current.values())
          if (m.userData.wall) {
            m.userData.shown =
              !houseRef.current.sides[
                ['back', 'front', 'left', 'right'].indexOf(m.userData.wall as string)
              ]!.cut;
            m.visible = live.current.buyMode && m.userData.shown !== false;
          }
      }
    };
    const offCam = stage.onCamera(sync);
    let readySent = false;
    // Shown (the 2D scene steps aside) once a frame has the whole home in it,
    // the world round it too.
    stage.onFrame = () => {
      if (!readySent && houseRef.current?.world) {
        readySent = true;
        live.current.onReady();
      }
    };
    live.current.api.current = {
      pick: (x, y) => {
        const objs: THREE.Object3D[] = [];
        for (const p of placedRef.current.values()) if (p.group.visible) objs.push(p.group);
        for (const m of markers.current.values()) if (m.visible) objs.push(m);
        const hit = stage.pick(x, y, objs);
        if (hit) {
          let o: THREE.Object3D | null = hit.object;
          while (o && !o.userData.obj) o = o.parent;
          if (o?.userData.obj) return { obj: o.userData.obj as string };
        }
        const f = stage.floorAt(x, y);
        if (!f) return null;
        const pl = live.current.plan;
        const tx = Math.floor(f.x);
        const ty = Math.floor(f.z);
        if (tx < 0 || ty < 0 || tx >= pl.w || ty >= pl.h) return null;
        return { tile: { x: tx, y: ty } };
      },
      project: (x, y, h) => stage.project(new THREE.Vector3(x, h, y)),
      orbit: (dx, dy) => stage.orbit(dx, dy),
      zoom: (f) => stage.zoomBy(f),
      wake: () => stage.invalidate(),
      turn: (dir) => {
        const from = stage.azimuth;
        const to = from + (dir * Math.PI) / 2;
        const t0 = performance.now();
        const off = stage.add(() => {
          const u = Math.min(1, (performance.now() - t0) / 450);
          stage.azimuth = from + (to - from) * (u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2);
          stage.updateCamera();
          if (u >= 1) off();
          return u < 1;
        });
      },
      lookAround: (onEnd) => {
        const from = stage.azimuth;
        const t0 = performance.now();
        // A full turn in 14 s; reduced motion cuts a quarter every 1.5 s instead.
        const reduced = live.current.reduced;
        const MS = reduced ? 6000 : 14_000;
        // Turning round, the camera comes down to a drone's height over the
        // garden (a lower angle shows the street and the neighbours), and goes
        // back up when the turn ends.
        const e0 = stage.elevation;
        const eLow = Math.min(e0, 0.66);
        // A hotel room also steps back to show its tower, the floors above and below.
        const z0 = stage.zoom;
        const lz = houseRef.current?.lookZoom ?? 1;
        const zLow = lz < 1 ? Math.min(z0, lz) : z0;
        const ease = (u: number) => (u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2);
        let done = false;
        const stop = () => {
          if (done) return;
          done = true;
          off();
          const eNow = stage.elevation;
          const zNow = stage.zoom;
          const t1 = performance.now();
          const back = stage.add(() => {
            const u = reduced ? 1 : Math.min(1, (performance.now() - t1) / 600);
            stage.elevation = eNow + (e0 - eNow) * ease(u);
            stage.zoom = zNow + (z0 - zNow) * ease(u);
            stage.updateCamera();
            if (u >= 1) back();
            return u < 1;
          });
          onEnd();
        };
        const off = stage.add(() => {
          if (done) return false;
          const now = performance.now();
          const u = Math.min(1, (now - t0) / MS);
          const turned = reduced ? Math.min(4, Math.floor(u * 4 + 0.001)) / 4 : u;
          const az = from + turned * Math.PI * 2;
          const dip = reduced ? 1 : ease(Math.min(1, (now - t0) / 1200));
          const el = e0 + (eLow - e0) * dip;
          const zm = z0 + (zLow - z0) * dip;
          if (az !== stage.azimuth || el !== stage.elevation || zm !== stage.zoom) {
            stage.azimuth = az;
            stage.elevation = el;
            stage.zoom = zm;
            stage.updateCamera();
          }
          if (u >= 1) stop();
          return !done;
        });
        return stop;
      },
      snapshot: () => stage.snapshot(),
    };
    const particles = new Particles();
    stage.scene.add(particles.group);
    stage.scene.userData.particles = particles;
    return () => {
      ro.disconnect();
      offCam();
      live.current.api.current = null;
      if (houseRef.current) disposeTree(houseRef.current.root);
      particles.clear();
      // Kept for the next home (what this one drew is let go by the effects below).
      for (const k of Object.keys(canvas.dataset)) if (k !== 'home-3d') delete canvas.dataset[k];
      canvas.remove();
      open--;
      parkStage('home', stage);
      stageRef.current = null;
    };
  }, []);

  // ---- The house shell and its grounds (plan, tier, cars, night).
  const lit = night || dusk;
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    // The room first; the world round it (the street, the city below, the
    // hotel's tower) in an idle slice after, unless it was kept from the last
    // time this home opened.
    const h = buildHouse(plan, { tier, night, lit, grounds, later: true });
    if (h.kept) h.attach();
    houseRef.current = h;
    stage.scene.add(h.root);
    stage.target.copy(h.centre);
    stage.span = h.span;
    stage.fitCenter = h.centre.clone();
    stage.fit = h.fitPoints;
    stage.fitMargin = 1.0;
    // A tall phone: look down a little more so the house fills the screen.
    if (stage.w / stage.h < 0.8) stage.elevation = 0.92;
    const s = h.shadow;
    const sc = stage.sun.shadow.camera;
    sc.left = -s;
    sc.right = s;
    sc.top = s;
    sc.bottom = -s;
    sc.far = 120;
    sc.updateProjectionMatrix();
    stage.sun.position.set(h.centre.x - 14, 30, h.centre.z + 8);
    stage.sun.target.position.copy(h.centre);
    stage.canvas.dataset.kind = plan.kind;
    // A flat: the block it's in (walk-up, block, modern tower).
    stage.canvas.dataset.block = grounds.block?.tier ?? '';
    stage.canvas.dataset.wealth = String(plan.wealth);
    stage.canvas.dataset.rooms = String(plan.rooms.length);
    stage.canvas.dataset.floor = String(plan.level ?? 0);
    stage.canvas.dataset.bathrooms = String(plan.rooms.filter((r) => r.id === 'bathroom').length);
    stage.canvas.dataset.pool = grounds.pool ? (grounds.pool.hot ? 'hot' : '1') : '0';
    stage.canvas.dataset.bays = String(grounds.bays.length);
    // The haze: clear over the home, thicker with distance, the far streets fading out.
    const fog = stage.scene.fog as THREE.Fog | null;
    if (fog) {
      fog.near = stage.distance + h.span * 0.45;
      fog.far = stage.distance + h.span * 1.5 + 70;
    }
    stage.updateCamera();
    let gone = false;
    let timer = 0;
    let idle = 0;
    const later = (f: () => void) => {
      const go = () => !gone && f();
      if (typeof requestIdleCallback === 'function')
        idle = requestIdleCallback(go, { timeout: 200 });
      else timer = window.setTimeout(go, 30);
    };
    let held = false;
    if (h.world) stage.canvas.dataset.world = '1';
    else {
      // Built in a slice of its own (the page answers meanwhile, the 2D room
      // showing); nothing is drawn until it's in, so the first frame on
      // screen has the whole home.
      delete stage.canvas.dataset.world;
      held = true;
      stage.hold();
      later(() => {
        h.attach();
        stage.canvas.dataset.world = '1';
        held = false;
        stage.release();
        stage.updateCamera();
      });
    }
    return () => {
      gone = true;
      clearTimeout(timer);
      if (idle) cancelIdleCallback(idle);
      if (held) stage.release();
      stage.scene.remove(h.root);
      disposeTree(h.root);
      houseRef.current = null;
    };
  }, [plan, tier, night, lit, grounds]);

  // ---- Light: day, dusk or night.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    if (night) {
      stage.sun.intensity = 0.6;
      stage.sun.color.set('#a9bbff');
      stage.hemi.intensity = 0.95;
      stage.hemi.color.set('#c9c8e8');
      stage.ambient.intensity = 0.3;
      stage.scene.background = new THREE.Color('#0b1328');
      (stage.scene.fog as THREE.Fog | null)?.color.set('#0b1328');
    } else if (dusk) {
      stage.sun.intensity = 1.4;
      stage.sun.color.set('#ffc58a');
      stage.hemi.intensity = 1.0;
      stage.hemi.color.set('#ffe1c2');
      stage.ambient.intensity = 0.2;
      stage.scene.background = new THREE.Color('#e9c7a8');
      (stage.scene.fog as THREE.Fog | null)?.color.set('#e9c7a8');
    } else {
      stage.sun.intensity = 1.9;
      stage.sun.color.set('#fff1d6');
      stage.hemi.intensity = 1.35;
      stage.hemi.color.set('#fff4e0');
      stage.ambient.intensity = 0.3;
      stage.scene.background = new THREE.Color('#cfe6f2');
      (stage.scene.fog as THREE.Fog | null)?.color.set('#cfe6f2');
    }
    stage.invalidate();
  }, [night, dusk]);

  // ---- Furniture and fixtures.
  const objKey = objects
    .map(
      (o) =>
        `${o.id}:${o.model ?? ''}:${o.owned ? 1 : 0}:${o.tier ?? 1}:${o.spot.x},${o.spot.y},${o.spot.w},${o.spot.h},${o.spot.rot ?? ''}:${o.ry ?? ''}:${o.finish ?? ''}`,
    )
    .join('|');
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const root = new THREE.Group();
    const placed = new Map<string, Placed>();
    const lampsOut: { pos: THREE.Vector3; color: string; intensity: number; distance: number }[] =
      [];
    const mk = new Map<string, THREE.Group>();
    const desk = objects.find((o) => o.slot === 'desk' && o.owned);
    const first = stage.frames === 0;
    const queue: Home3DObject[] = [];
    const place = (o: Home3DObject) => {
      const id = modelIdOf(o);
      if (!id) return;
      const ry = typeof o.ry === 'number' ? o.ry : facingOf(plan, o.slot ?? o.id, o.spot);
      const fr =
        o.ry !== undefined && o.outdoor
          ? { x: o.spot.x + o.spot.w / 2, z: o.spot.y + o.spot.h / 2, w: o.spot.w, d: o.spot.h }
          : frameOf(o.spot, ry);
      if (o.outdoor && Math.abs(Math.sin(ry)) > 0.7) [fr.w, fr.d] = [fr.d, fr.w];
      const model = buildEstateModel(id, {
        w: fr.w,
        d: fr.d,
        tier: o.tier ?? 1,
        seed: Math.round(o.spot.x * 7 + o.spot.y),
        // Wave 12: the reference's deep green velvet sofa in a well-off home.
        ...(o.slot === 'sofa' && (o.tier ?? 1) >= 2 ? { tint: '#1f6e52' } : {}),
      });
      const g = model.group;
      // Shop note: the finish you bought (its wood or fabric takes the colour).
      if (o.finish && o.owned) refinish(g, o.finish);
      // Outdoors (the cars, the loungers) is down on the lawn, a storey or two below you upstairs.
      g.position.set(fr.x, o.outdoor ? GROUND_Y + 0.03 - (plan.level ?? 0) * STOREY : 0, fr.z);
      g.rotation.y = ry;
      if (o.outdoor) g.userData.outdoor = true;
      if (id.startsWith('car:')) g.userData.car = true;
      if (o.slot === 'laptop') {
        // On the desk (or a stool when there's no desk).
        if (desk) {
          const ds = desk.spot;
          g.position.set(ds.x + 0.55, desk.tier === 3 ? 1.0 : 0.74, ds.y + 0.35);
        } else {
          const stool = new Kit();
          stool.box(0.5, 0.45, 0.4, '#c99a66', 0, -0.45, 0, { round: 0.02 });
          g.add(stool.build());
          g.position.y = 0.45;
        }
      }
      g.traverse((c) => (c.userData.obj = o.id));
      g.userData.obj = o.id;
      const wall = o.spot.wall ? wallOf(plan, o.spot) : null;
      placed.set(o.id, { obj: o, model, group: g, ry, wall });
      root.add(g);
      for (const l of model.lamps) {
        const p = l.pos.clone();
        p.applyAxisAngle(new THREE.Vector3(0, 1, 0), ry);
        p.add(g.position);
        lampsOut.push({ ...l, pos: p });
      }
    };
    for (const o of objects) {
      if (o.slot && !o.owned) {
        // A "+" where it would go.
        const m = plusMarker();
        const s = o.spot;
        if (s.wall) {
          const w = wallOf(plan, s);
          m.rotation.x = Math.PI / 2;
          if (w === 'back') m.position.set(s.x + s.w / 2, 1.5, 0.06);
          m.userData.wall = w;
        } else if (o.slot === 'laptop' && desk) {
          m.position.set(s.x + 0.5, 0.8, s.y + 0.4);
        } else {
          const corner = ['bed', 'kitchen', 'sofa'].includes(o.slot);
          m.position.set(
            corner ? s.x + s.w - 0.3 : s.x + s.w / 2,
            0.03,
            corner ? s.y + 0.3 : s.y + s.h / 2,
          );
        }
        m.traverse((c) => (c.userData.obj = o.id));
        m.userData.obj = o.id;
        m.visible = live.current.buyMode;
        mk.set(o.id, m);
        root.add(m);
        continue;
      }
      queue.push(o);
    }
    // Lamps: the ones you own first, then a warm ceiling light per room at night.
    const lamps = new THREE.Group();
    const light = () => {
      const lit = night || dusk;
      const want = [...lampsOut];
      if (lit)
        for (const r of plan.rooms)
          if (
            !want.some(
              (l) => l.pos.x >= r.x && l.pos.x < r.x + r.w && l.pos.z >= r.y && l.pos.z < r.y + r.h,
            )
          )
            want.push({
              pos: new THREE.Vector3(r.x + r.w / 2, 2.2, r.y + r.h / 2),
              color: '#ffd9a0',
              intensity: 1.6,
              distance: Math.max(r.w, r.h) * 1.1,
            });
      for (const l of want.slice(
        0,
        Math.max(1, MAX_LAMPS - (houseRef.current?.lamps.length ?? 0)),
      )) {
        const pl = new THREE.PointLight(
          l.color,
          lit ? l.intensity * 1.6 : l.intensity * 0.6,
          l.distance,
          1.6,
        );
        pl.position.copy(l.pos);
        lamps.add(pl);
      }
    };
    root.add(lamps);
    stage.scene.add(root);
    furnRoot.current = root;
    lampRoot.current = lamps;
    placedRef.current = placed;
    markers.current = mk;
    const countCars = () => {
      const cars = [...placed.values()].filter((p) => p.group.userData.car);
      stage.canvas.dataset.cars = String(cars.length);
      // How high the parked cars stand under this floor (for tests): on the lawn, whatever floor you're on.
      if (cars.length) stage.canvas.dataset.carsY = cars[0]!.group.position.y.toFixed(2);
      else delete stage.canvas.dataset.carsY;
    };
    let gone = false;
    let timer = 0;
    // Opening the home, the first frame waits for everything in it, built a
    // few pieces at a time so the page keeps answering (the 2D room shows
    // meanwhile); later changes (buying, moving things) are built at once.
    let held = false;
    const done = () => {
      light();
      countCars();
      stage.updateCamera();
      if (held) stage.release();
      held = false;
    };
    if (!first) {
      for (const o of queue) place(o);
      done();
    } else {
      held = true;
      stage.hold();
      const slice = () => {
        if (gone) return;
        const t0 = performance.now();
        while (queue.length && performance.now() - t0 < 40) place(queue.shift()!);
        if (queue.length) timer = window.setTimeout(slice, 0);
        else done();
      };
      slice();
    }
    return () => {
      gone = true;
      clearTimeout(timer);
      if (held) stage.release();
      stage.scene.remove(root);
      disposeTree(root);
    };
    // objKey stands for `objects`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [objKey, plan, night, dusk, grounds]);

  // ---- Shop note: the walls and dividers you put up on this floor.
  const dividers = props.dividers;
  const divKey = (dividers ?? [])
    .map((d) => `${d.id}:${d.kind}:${d.len}:${d.x},${d.y},${d.dir}:${d.swatch}`)
    .join('|');
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || !dividers?.length) {
      if (stage) delete stage.canvas.dataset.dividers;
      return;
    }
    const root = new THREE.Group();
    for (const d of dividers) {
      const g = buildDivider(d.kind, d.len, d.swatch);
      g.position.set(d.x, 0, d.y);
      if (d.dir === 'v') g.rotation.y = -Math.PI / 2;
      g.userData.dividerId = d.id;
      root.add(g);
    }
    stage.scene.add(root);
    stage.canvas.dataset.dividers = String(dividers.length);
    stage.invalidate();
    return () => {
      stage.scene.remove(root);
      disposeTree(root);
      stage.invalidate();
    };
    // divKey stands for `dividers`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [divKey, plan]);

  // ---- Buy mode: markers pulse; the thing being moved is a ghost.
  useEffect(() => {
    for (const m of markers.current.values()) {
      m.visible = buyMode && (!m.userData.wall || m.userData.shown !== false);
      m.scale.setScalar(1.4);
    }
    const p = moving ? placedRef.current.get(moving) : undefined;
    if (p) p.group.visible = false;
    stageRef.current?.invalidate();
    return () => {
      if (p) p.group.visible = true;
    };
  }, [buyMode, moving, objKey]);
  // With the catalogue open, the house moves up above it, a little smaller.
  const sheetOpen = props.sheetOpen;
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    stage.shiftY = sheetOpen ? 0.26 : moving ? 0.1 : 0;
    stage.zoom = sheetOpen ? Math.min(stage.zoom, 0.82) : Math.max(stage.zoom, 1);
    stage.updateCamera();
  }, [sheetOpen, moving]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || !ghost) return;
    const id = SLOT_MODEL[ghost.slot];
    if (!id) return;
    const ry = (ghost.spot.rot * Math.PI) / 2;
    const fr = frameOf(ghost.spot, ry);
    const model = buildModel(id, { w: fr.w, d: fr.d, tier: ghost.tier });
    const g = model.group;
    const tint = ghost.ok ? '#22c55e' : '#ef4444';
    g.traverse((c) => {
      const m = c as THREE.Mesh;
      if (!m.isMesh) return;
      const src = m.material as THREE.MeshStandardMaterial;
      const nm = new THREE.MeshStandardMaterial({
        color: src.color
          ? src.color.clone().lerp(new THREE.Color(tint), 0.35)
          : new THREE.Color(tint),
        transparent: true,
        opacity: 0.72,
        emissive: new THREE.Color(tint),
        emissiveIntensity: 0.25,
      });
      m.material = nm;
      m.castShadow = false;
    });
    // A footprint on the floor.
    const foot = new THREE.Mesh(
      new THREE.PlaneGeometry(ghost.spot.w, ghost.spot.h),
      new THREE.MeshBasicMaterial({
        color: tint,
        transparent: true,
        opacity: 0.3,
        depthWrite: false,
      }),
    );
    foot.rotation.x = -Math.PI / 2;
    foot.position.set(ghost.spot.x + ghost.spot.w / 2, 0.02, ghost.spot.y + ghost.spot.h / 2);
    g.position.set(fr.x, 0.02, fr.z);
    g.rotation.y = ry;
    stage.scene.add(g, foot);
    ghostRef.current = g;
    stage.invalidate();
    return () => {
      stage.scene.remove(g, foot);
      disposeTree(g);
      foot.geometry.dispose();
      (foot.material as THREE.Material).dispose();
      ghostRef.current = null;
      stage.invalidate();
    };
  }, [ghost]);

  // A real van drives along the street to the gate, then waits while the parcels are unloaded.
  const delivery = props.delivery;
  useEffect(() => {
    const stage = stageRef.current;
    const h = houseRef.current;
    if (!stage || !delivery || !h) return;
    const van = buildEstateModel('van', { w: 2.1, d: 5.6, tier: 2 }).group;
    // Parcels stacked by the open back doors once it has arrived.
    const boxes = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const b = buildEstateModel('box', { w: 0.5, d: 0.5, tier: 1 }).group;
      b.position.set(-0.4 + (i % 2) * 0.55, Math.floor(i / 2) * 0.44, -3.4);
      boxes.add(b);
    }
    van.add(boxes);
    stage.scene.add(van);
    stage.canvas.dataset.van = 'coming';
    const off = stage.add(() => {
      const u = Math.min(
        1,
        Math.max(0, (Date.now() - delivery.orderedAt) / (delivery.arrivesAt - delivery.orderedAt)),
      );
      const e = live.current.reduced ? 1 : 1 - (1 - u) ** 2;
      van.position.set(h.van.x + (1 - e) * 26, h.vanY, h.van.z);
      van.rotation.y = Math.PI / 2;
      boxes.visible = u >= 1;
      if (u >= 1) stage.canvas.dataset.van = 'here';
      return u < 1;
    });
    stage.invalidate();
    return () => {
      off();
      stage.scene.remove(van);
      disposeTree(van);
      delete stage.canvas.dataset.van;
    };
  }, [delivery, plan, grounds]);

  // ---- People and acts: one animator.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const chars = new Map<string, Character>();
    const last = new Map<
      string,
      { x: number; y: number; ry: number; moving: number; hair: string }
    >();
    const particles = stage.scene.userData.particles as Particles;
    let lastAct: string | null = null;
    const bedOf = () => {
      const pl = placedRef.current;
      return pl.get('bed')?.obj.spot;
    };
    const center = (s: Spot) => new THREE.Vector3(s.x + s.w / 2, 0, s.y + s.h / 2);
    const toward = (from: THREE.Vector3, to: THREE.Vector3) =>
      Math.atan2(to.x - from.x, to.z - from.z);
    const seatOf = (id: string, i = 0) => {
      const p = placedRef.current.get(id);
      if (!p || !p.model.seats.length) return null;
      const s = p.model.seats[Math.min(i, p.model.seats.length - 1)]!.clone();
      s.applyAxisAngle(new THREE.Vector3(0, 1, 0), p.ry);
      s.add(p.group.position);
      return { pos: s, ry: p.ry, h: p.model.seats[0]!.y };
    };
    const off = stage.add((t, dt) => {
      const P = live.current;
      const people: Home3DPerson[] = P.people();
      let busy = false;
      // Add or drop characters.
      const ids = new Set(people.map((p) => p.id));
      for (const [id, c] of chars)
        if (!ids.has(id)) {
          stage.scene.remove(c.root);
          chars.delete(id);
          last.delete(id);
          busy = true;
        }
      const acting = P.acting;
      const actKey = acting ? `${acting.act}:${acting.obj ?? ''}` : null;
      if (actKey !== lastAct) {
        lastAct = actKey;
        actT.current = t;
        busy = true;
      }
      for (const [n, p] of people.entries()) {
        let c = chars.get(p.id);
        if (!c) {
          c = makeCharacter(p.look, p.id);
          chars.set(p.id, c);
          stage.scene.add(c.root);
          busy = true;
        }
        const prev = last.get(p.id);
        // The hair group also carries facial hair and headwear (Phase 6a).
        const hairKey = `${p.look.hairStyle}${p.look.hair}${p.look.facialHair ?? ''}${p.look.headwear ?? ''}`;
        if (prev && prev.hair !== hairKey) setHair(c, p.look);
        const dx = prev ? p.x - prev.x : 0;
        const dy = prev ? p.y - prev.y : 0;
        const movingNow = Math.hypot(dx, dy) > 1e-4;
        let ry = prev?.ry ?? p.ry ?? Math.PI;
        if (movingNow) ry = Math.atan2(dx, dy);
        else if (p.ry !== undefined && !(prev?.moving ?? 0)) ry = p.ry;
        const st = {
          x: p.x,
          y: p.y,
          ry,
          moving: movingNow ? 0.12 : Math.max(0, (prev?.moving ?? 0) - dt),
          hair: hairKey,
        };
        last.set(p.id, st);
        const walking = st.moving > 0;
        let pos = new THREE.Vector3(p.x + 0.5, 0, p.y + 0.5);
        let poseId: PoseId = walking ? 'walk' : 'stand';
        let seatH = 0.45;
        let face = ry;
        const isMe = p.id === 'me';
        const outside = isMe && P.acting?.obj ? placedRef.current.get(P.acting.obj) : undefined;
        if (p.pose === 'lie' && outside && outside.group.userData.outdoor) {
          // On a sun lounger, or floating in the pool or the hot tub.
          pos = outside.group.position.clone();
          const water = /pool|tub/.test(outside.obj.id);
          if (water) pos.y = GROUND_Y - 0.55;
          face = outside.ry + (water ? 0 : Math.PI);
          poseId = water ? 'sit' : 'lie';
          seatH = water ? 0.2 : 0.42;
          if (water) fx.water(particles, pos.clone().add(new THREE.Vector3(0, 0.9, 0)), dt * 0.3);
        } else if (p.pose === 'lie') {
          const b = bedOf() ?? live.current.objects.find((o) => o.id === 'bed')?.spot;
          if (b) {
            const bc = center(b);
            const bedRy = facingOf(P.plan, 'bed', b);
            pos = bc
              .clone()
              .add(new THREE.Vector3(Math.sin(bedRy) * 0.25, 0, Math.cos(bedRy) * 0.25));
            face = bedRy;
            poseId = 'lie';
            seatH = placedRef.current.has('bed') ? 0.5 : 0.12;
          }
        } else if (p.pose === 'sit') {
          const sofa = placedRef.current.get('sofa') ?? placedRef.current.get('cushions' as string);
          face = sofa ? sofa.ry : Math.PI;
          pos = new THREE.Vector3(p.x + 0.5, 0, p.y + 0.5 + (sofa ? Math.cos(sofa.ry) * -0.05 : 0));
          poseId = n % 2 ? 'chat' : 'sit';
          if (poseId === 'chat') poseId = 'sit';
          seatH = sofa ? 0.48 : 0.2;
        }
        // Your act, played out.
        if (isMe && acting && !walking) {
          const at = t - actT.current;
          const o = acting.obj ? placedRef.current.get(acting.obj) : undefined;
          const oc = o ? o.group.position.clone() : pos.clone();
          busy = true;
          switch (acting.act) {
            case 'sleep':
            case 'nap': {
              fx.zz(particles, pos.clone().add(new THREE.Vector3(0, 1.0, -0.6)), dt);
              break;
            }
            case 'shower': {
              if (acting.obj === 'shower' && o) {
                pos = oc.clone();
                face = Math.PI * 0.25;
                const head = new THREE.Vector3(oc.x + 0.2, 2.0, oc.z - 0.15);
                fx.water(particles, head, dt);
                fx.steam(particles, new THREE.Vector3(oc.x, 1.4, oc.z), dt, 8);
              } else if (acting.obj === 'bathtub' && o) {
                pos = oc.clone();
                face = o.ry + Math.PI / 2;
                poseId = 'sit';
                seatH = 0.22;
                fx.steam(particles, new THREE.Vector3(oc.x, 0.7, oc.z), dt, 8);
              } else fx.steam(particles, pos.clone().add(new THREE.Vector3(0, 1.6, 0)), dt, 6);
              break;
            }
            case 'toilet': {
              if (acting.obj === 'toilet' && o) {
                const s = seatOf('toilet');
                if (s) {
                  pos = s.pos.clone();
                  pos.y = 0;
                  face = s.ry;
                  poseId = 'sit';
                  seatH = 0.42;
                }
              } else if (acting.obj === 'sink' && o) {
                face = toward(pos, oc);
                poseId = 'stir';
                fx.water(particles, new THREE.Vector3(oc.x, 1.0, oc.z), dt * 0.4);
              }
              break;
            }
            case 'cook':
            case 'snack': {
              face = toward(pos, oc);
              poseId = acting.act === 'cook' ? 'stir' : 'eat';
              if (acting.act === 'snack') {
                poseId = 'chat';
              }
              const pan = o?.model.parts.pan;
              if (pan && acting.act === 'cook') {
                pan.rotation.z = Math.sin(at * 9) * 0.08;
                pan.position.x += Math.sin(at * 9) * 0.0008;
                const wp = new THREE.Vector3();
                pan.getWorldPosition(wp);
                fx.steam(particles, wp.add(new THREE.Vector3(0, 0.12, 0)), dt, 14);
              }
              break;
            }
            case 'tv':
            case 'game': {
              const isGame = acting.act === 'game';
              const tv = placedRef.current.get(isGame ? 'gaming' : 'tv');
              if (acting.obj === 'pool' && o) {
                face = toward(pos, oc);
                poseId = 'present';
                break;
              }
              if (acting.obj === 'piano' && o) {
                const s = seatOf('piano');
                if (s) {
                  pos = s.pos.clone();
                  pos.y = 0;
                  face = s.ry + Math.PI;
                  poseId = 'type';
                  seatH = 0.5;
                  fx.notes(particles, s.pos.clone().add(new THREE.Vector3(0, 1.2, 0)), dt);
                }
                break;
              }
              const seat =
                !isGame && placedRef.current.has('sofa')
                  ? seatOf('sofa', 1)
                  : isGame
                    ? seatOf('gaming')
                    : null;
              if (seat) {
                pos = seat.pos.clone();
                pos.y = 0;
                face =
                  seat.ry +
                  (isGame && placedRef.current.get('gaming')?.obj.tier === 3 ? Math.PI : 0);
                poseId = isGame ? 'play' : 'sit';
                seatH = seat.h;
              } else if (tv) {
                face = toward(pos, tv.group.position);
                poseId = isGame ? 'play' : 'stand';
                if (isGame) poseId = 'cheer';
              }
              for (const sm of [
                ...(tv?.model.screens ?? []),
                ...(placedRef.current.get('tv')?.model.screens ?? []),
              ]) {
                sm.emissiveIntensity = 0.9 + Math.sin(at * 13) * 0.25 + Math.sin(at * 3.1) * 0.2;
              }
              if (isGame)
                fx.sparkle(
                  particles,
                  pos.clone().add(new THREE.Vector3(0, 1.8, 0)),
                  dt,
                  '#a78bfa',
                  3,
                );
              break;
            }
            case 'work':
            case 'read': {
              const s =
                acting.act === 'work'
                  ? seatOf('desk')
                  : placedRef.current.has('sofa')
                    ? seatOf('sofa', 1)
                    : seatOf('desk');
              if (s && (acting.act === 'work' || acting.obj !== 'books')) {
                pos = s.pos.clone();
                pos.y = 0;
                face =
                  s.ry + (acting.act === 'work' || !placedRef.current.has('sofa') ? Math.PI : 0);
                poseId = acting.act === 'work' ? 'type' : 'read';
                seatH = s.h;
              } else {
                face = toward(pos, oc);
                poseId = 'browse';
              }
              for (const sm of [
                ...(placedRef.current.get('laptop')?.model.screens ?? []),
                ...(placedRef.current.get('desk')?.model.screens ?? []),
              ])
                sm.emissiveIntensity = 0.9;
              break;
            }
            case 'workout':
              if (o?.group.userData.outdoor) {
                // A swim: in the water, splashing.
                pos = oc.clone();
                pos.y = GROUND_Y - 0.6;
                poseId = 'walk';
                fx.water(particles, oc.clone().add(new THREE.Vector3(0, 0.5, 0)), dt);
                break;
              }
              if (o && /treadmill|weights/.test(o.obj.id)) {
                pos = oc.clone();
                face = o.ry + Math.PI;
                poseId = o.obj.id === 'treadmill' ? 'walk' : 'squat';
                pos.y = o.obj.id === 'treadmill' ? 0.18 : 0;
                break;
              }
              poseId = 'squat';
              face = P.plan ? Math.PI * 0.15 : face;
              fx.sparkle(
                particles,
                pos.clone().add(new THREE.Vector3(0, 1.7, 0)),
                dt,
                '#7dd3fc',
                2,
              );
              break;
          }
        }
        c.root.position.copy(pos);
        // Turn smoothly towards the facing.
        let d = face - c.root.rotation.y;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        c.root.rotation.y += P.reduced ? d : d * Math.min(1, dt * 12);
        if (Math.abs(d) > 0.01) busy = true;
        pose(c, poseId, t, { seat: seatH, phase: n });
        if (walking) busy = true;
        // Keep the camera on you when zoomed in.
        if (isMe && stage.zoom > 1.25) {
          const tgt = new THREE.Vector3(pos.x, 0, pos.z);
          const h = houseRef.current;
          if (h) {
            stage.lookAt(tgt.x, tgt.z, P.reduced ? 1 : Math.min(1, dt * 4));
            if (Math.hypot(stage.target.x - tgt.x, stage.target.z - tgt.z) > 0.02) busy = true;
          }
        } else if (isMe && houseRef.current && stage.zoom <= 1.25) {
          const h = houseRef.current;
          if (Math.hypot(stage.target.x - h.centre.x, stage.target.z - h.centre.z) > 0.02) {
            stage.lookAt(h.centre.x, h.centre.z, Math.min(1, dt * 4));
            busy = true;
          }
        }
      }
      // Screens fade back when nobody watches.
      if (
        !acting ||
        (acting.act !== 'tv' &&
          acting.act !== 'game' &&
          acting.act !== 'work' &&
          acting.act !== 'read')
      )
        for (const p of placedRef.current.values())
          for (const sm of p.model.screens)
            if (sm.emissiveIntensity !== 0.05) {
              sm.emissiveIntensity = 0.05;
              busy = true;
            }
      // The fan turns.
      const fan = placedRef.current.get('cooling')?.model.parts.fan;
      if (fan) {
        fan.rotation.z += dt * 12;
        busy = true;
      }
      if (particles.update(dt)) busy = true;
      return busy;
    });
    return () => {
      off();
      // (Their GPU copies too: the stage is kept for the next home.)
      for (const c of chars.values()) {
        stage.scene.remove(c.root);
        disposeTree(c.root);
      }
      particles.clear();
    };
  }, []);

  // Gestures: the 2D hit layer above us forwards them through `api`; we only
  // take the wheel and pinch when the canvas itself gets them (Lite never mounts this).
  useEffect(() => {
    const canvas = stageRef.current?.canvas;
    if (!canvas) return;
    return gestures(canvas, {
      tap: () => {},
      orbit: (dx, dy) => stageRef.current?.orbit(dx, dy),
      zoom: (f) => stageRef.current?.zoomBy(f),
    });
  }, []);

  // The stage's canvas goes in just before this (it's kept between opens, so it isn't React's).
  return <span ref={anchorRef} hidden />;
}

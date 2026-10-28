/**
 * A skydive or a helicopter ride over the city's real 3D buildings (the same
 * tiles, terrain, water and sun as the sky views: ../Panorama.tsx).
 *
 * - Skydive: the climb with the door open, Jump, freefall (hold your arch,
 *   turn, track), Pull at the right height, steer the canopy to the target
 *   and flare to land. The landing goes to the engine (`games.land`), which
 *   scores it; the photo button catches the moment on the way down.
 * - Helicopter: lift off from the heliport, a route past the landmarks with
 *   their names and a line about each (on your left, on your right), and
 *   Take the controls to fly it yourself for a while (`games.end` at the pad).
 *
 * The flight is stepped here (./flight.ts) and the camera flown by an
 * `AirCam`, placed Inside or Outside the aircraft by the rig (./air3d.ts,
 * which draws the helicopter, its cabin, the jump plane and you); without
 * WebGL a map from above shows the same flight.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import * as THREE from 'three';
import { useView } from '../../store';
import { t } from '../../i18n';
import { HudButton, HudRail } from '../../ui';
import { money } from '../../format';
import { OSM_CREDIT, fromLatLon, useGeo } from '../../city/geo';
import { cachedCityLayout } from '../../city/geoLayout';
import type { CityLayout } from '../../city/layout';
import { cityInput } from '../../city/contract';
import { cityViewOf, localHour } from '../../city/travel';
import { avatarLook } from '../../city/art';
import { genderOf } from '../../city/life';
import { CityScene, toMetres, type ViewController } from '../../city/three/scene';
import { loadTerrainField, type TerrainField } from '../../city/three/terrain';
import { markWebGLBroken } from '../../city/three/quality';
import { softwareGl, webglAvailable } from '../../three-kit/quality';
import { createRng, hashString } from '@runway/engine';
import { SKY_LABELS } from '../skyLabels';
import { PhotoSheet, addPhoto } from '../../home/HomePhotos';
import { SnapButton } from '../../photos/SnapButton';
import { resultCard } from '../../photos/snap';
import {
  JUMP,
  arch,
  deploy,
  exitPlane,
  flare,
  heliRoute,
  jumpStyle,
  newHeli,
  newJump,
  sideOf,
  skipClimb,
  stepHeli,
  type RoofAt,
  stepJump,
  toTarget,
  type Heli,
  type Jump,
  type Waypoint,
} from './flight';
import { AirRig, saveCamMode, savedCamMode, type AirCamMode } from './air3d';
import '../../city/three/city3d.css';

export interface AirBooking {
  kind: 'skydive' | 'heli';
  item: string;
  bookingId: string;
  businessId: string;
  venueName: string;
  price: number;
  currency: string;
}

interface LandResult {
  score: number;
  pull: number;
  land: number;
  style: number;
  grade: '' | 'bronze' | 'silver' | 'gold';
  best: number;
  record: boolean;
}

/** The camera, flown by the flight: where it is and which way it looks. */
class AirCam implements ViewController {
  readonly pos = new THREE.Vector3();
  yaw = 0;
  pitch = -0.3;
  fov = 60;
  running = true;
  constructor(readonly reach: number) {}
  place(camera: THREE.PerspectiveCamera) {
    const cp = Math.cos(this.pitch);
    camera.position.copy(this.pos);
    camera.fov = this.fov;
    camera.lookAt(
      this.pos.x + Math.sin(this.yaw) * cp,
      this.pos.y + Math.sin(this.pitch),
      this.pos.z - Math.cos(this.yaw) * cp,
    );
    return { x: this.pos.x, y: this.pos.z, reach: this.reach };
  }
  busy() {
    return this.running;
  }
}

/** The landing target: rings on the field and a windsock, seen from the sky. */
function targetMesh() {
  const g = new THREE.Group();
  const rings: [number, number, string][] = [
    [0, 4, '#f8fafc'],
    [4, 14, '#dc2626'],
    [14, 30, '#f8fafc'],
    [30, 55, '#dc2626'],
    [55, 60, '#f8fafc'],
  ];
  for (const [a, b, c] of rings) {
    const m = new THREE.Mesh(
      new THREE.RingGeometry(Math.max(0.01, a), b, 48),
      new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide, depthWrite: false }),
    );
    m.rotation.x = -Math.PI / 2;
    m.renderOrder = 2;
    g.add(m);
  }
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.4, 0.4, 14, 6),
    new THREE.MeshStandardMaterial({ color: '#e5e7eb' }),
  );
  pole.position.set(70, 7, 0);
  const sock = new THREE.Mesh(
    new THREE.ConeGeometry(2, 8, 10, 1, true),
    new THREE.MeshStandardMaterial({ color: '#f97316' }),
  );
  sock.rotation.z = Math.PI / 2;
  sock.position.set(74, 13, 0);
  g.add(pole, sock);
  g.userData.noTerrain = true;
  return g;
}

const tierOf = () => {
  if (typeof window === 'undefined' || softwareGl()) return 'low' as const;
  const small = Math.min(window.innerWidth, window.innerHeight) < 600;
  return small || (navigator.hardwareConcurrency || 4) <= 4 ? ('low' as const) : ('high' as const);
};

/** What a landmark's name must not cover: the title, the buttons and the panels. */
const LABEL_BLOCKERS =
  '.air-head h2, .air-head small, .panorama-actions, .air-cam, .air-hud, .air-say, .air-controls, .air-result';

/** What the loading screen is waiting for, step by step. */
const LOAD_STEP: (() => string)[] = [
  () => t('The city map'),
  () => t('The hills and the river'),
  () => t('The streets'),
  () => t('The 3D city'),
  () => t('The aircraft'),
];

/** The helicopter flight's title: the flight you booked. */
const HELI_TITLE: Record<string, () => string> = {
  'heli-hop': () => t('Helicopter hop'),
  'heli-tour': () => t('City tour'),
  'heli-charter': () => t('Private charter'),
};

export default function AirFlight({
  booking,
  city,
  onClose,
}: {
  booking: AirBooking;
  city: string;
  onClose: () => void;
}) {
  const { view, send } = useView();
  const geo = useGeo(city);
  const [terrain, setTerrain] = useState<TerrainField | null | 'loading'>('loading');
  const [layout, setLayout] = useState<CityLayout | null>(null);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [photo, setPhoto] = useState<{ src: string | null } | null>(null);
  const mount = useRef<HTMLDivElement>(null);
  const mapRef = useRef<HTMLCanvasElement>(null);
  const labelsRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<CityScene | null>(null);
  const camRef = useRef<AirCam | null>(null);
  const rigRef = useRef<AirRig | null>(null);
  const gl = webglAvailable();
  const skydive = booking.kind === 'skydive';
  const charter = booking.item === 'heli-charter';
  const cityView = cityViewOf(view);
  const layoutKey = JSON.stringify(cityInput(cityView));
  const layoutKeyRef = useRef(layoutKey);
  const reduced = useMemo(
    () =>
      typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  );
  // Inside or Outside: remembered for the player. A skydive cuts by itself until
  // you choose: Outside for the climb (the whole plane, you in the door), Inside
  // at the open door, then your own choice for the jump.
  const [camMode, setCamMode] = useState<AirCamMode>(() =>
    skydive ? 'outside' : savedCamMode(view.me.id),
  );
  const camModeRef = useRef(camMode);
  const chosenCam = useRef(false);
  useEffect(() => {
    camModeRef.current = camMode;
  }, [camMode]);
  const pickCam = (m: AirCamMode) => {
    chosenCam.current = true;
    setCamMode(m);
    saveCamMode(view.me.id, m);
  };
  /** Skip the climb (asked for while loading, too): straight to the open door. */
  const skipRef = useRef(false);
  const [drawnOnce, setDrawnOnce] = useState(false);
  useEffect(() => {
    if (!geo || geo === 'loading') return;
    const id = setTimeout(() => setLayout(cachedCityLayout(layoutKeyRef.current, geo)), 30);
    return () => clearTimeout(id);
  }, [geo]);
  useEffect(() => {
    let live = true;
    void loadTerrainField(city).then((f) => live && setTerrain(f));
    return () => {
      live = false;
    };
  }, [city]);

  // Where it all happens: the venue on the map (the target, or the pad), and the landmarks.
  const where = useMemo(() => {
    if (!layout?.geo) return null;
    const p = layout.places.find((x) => x.id === `biz:${booking.businessId}`);
    const [c0, c1, c2, c3] = layout.geo.data.core;
    const at = p
      ? toMetres({ x: p.x + p.w / 2, y: p.y + p.d / 2 })
      : { e: (c0 + c2) / 2, s: (c1 + c3) / 2 };
    const marks: Waypoint[] = (SKY_LABELS[city] ?? [])
      .filter((l) => !l.area)
      .map((l) => {
        const q = fromLatLon(layout.geo!.data, l.at[0], l.at[1]);
        return { name: l.name, x: q.x, z: q.y, h: l.h, ...(l.detail ? { detail: l.detail } : {}) };
      });
    return { x: at.e, z: at.s, marks };
  }, [layout, booking.businessId, city]);
  const route = useMemo(
    () =>
      where && !skydive
        ? heliRoute(where, where.marks, charter ? 8 : booking.item === 'heli-hop' ? 3 : 5)
        : [],
    [where, skydive, charter, booking.item],
  );

  // The flight's state (stepped each frame) and what the screen shows of it.
  const jumpRef = useRef<Jump | null>(null);
  const heliRef = useRef<Heli | null>(null);
  const input = useRef({ turn: 0, climb: 0, track: false });
  const [track, setTrack] = useState(false);
  const setIn = useCallback((key: 'turn' | 'climb' | 'track', v: number | boolean) => {
    input.current = { ...input.current, [key]: v };
  }, []);
  const [hud, setHud] = useState({
    phase: '',
    alt: 0,
    dist: 0,
    rel: 0,
    body: 0,
    leg: 0,
    manual: false,
  });
  const [landed, setLanded] = useState<{ jump: Jump; result: LandResult | null } | null>(null);
  const [home, setHome] = useState<Heli | null>(null);
  const [say, setSay] = useState<{ name: string; side: string; detail?: string } | null>(null);
  const sayRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    sayRef.current = say ? `${say.name}:${say.side}` : undefined;
  }, [say]);

  useEffect(() => {
    if (!skydive || chosenCam.current) return;
    if (hud.phase === 'door') queueMicrotask(() => setCamMode('inside'));
    else if (hud.phase === 'freefall') queueMicrotask(() => setCamMode(savedCamMode(view.me.id)));
  }, [hud.phase, skydive, view.me.id]);

  useEffect(() => {
    if (!where) return;
    if (skydive) {
      const j = newJump(where.x, where.z);
      jumpRef.current = skipRef.current ? skipClimb(j) : j;
    } else
      heliRef.current = {
        ...newHeli(where.x, where.z),
        heading: route[0] ? Math.atan2(route[0].x - where.x, -(route[0].z - where.z)) : 0,
      };
  }, [where, skydive, route]);

  // ---- The 3D city.
  useEffect(() => {
    const el = mount.current;
    if (!el || !gl || !layout?.geo || !where || terrain === 'loading') return;
    const canvas = document.createElement('canvas');
    canvas.className = 'c3-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    const soft = softwareGl();
    const tier = tierOf();
    let scene: CityScene;
    try {
      scene = new CityScene(
        canvas,
        layout,
        { tier, reduced: false, hour: localHour(city), sky: { terrain }, soft },
        avatarLook(view.me.background?.id, view.me.id, genderOf(view.me)),
        [],
      );
    } catch {
      markWebGLBroken();
      queueMicrotask(() =>
        setError(
          t(
            'This flight needs WebGL. Enable 3D in Settings, or use a browser with hardware acceleration.',
          ),
        ),
      );
      return;
    }
    el.prepend(canvas);
    scene.following = false;
    const cam = new AirCam(soft ? 2_500 : tier === 'high' ? 9_000 : 5_500);
    camRef.current = cam;
    scene.view = cam;
    const hour = localHour(city);
    const look = avatarLook(view.me.background?.id, view.me.id, genderOf(view.me));
    const rig = new AirRig(booking.kind, look, { reduced, night: hour < 6 || hour >= 20 });
    rigRef.current = rig;
    void rig.warm(scene.renderer);
    // The aircraft go over the city, each frame and in photos.
    const offRig = scene.onFrame(() => rig.draw(scene.renderer, scene.camera));
    if (skydive) {
      const target = targetMesh();
      target.position.set(
        where.x,
        scene.groundAt(where.x, where.z) + scene.terrainAt(where.x, where.z) + 0.6,
        where.z,
      );
      scene.scene.add(target);
    }
    const size = () => {
      const r = el.getBoundingClientRect();
      scene.resize(r.width, r.height);
    };
    size();
    const ro = new ResizeObserver(size);
    ro.observe(el);
    sceneRef.current = scene;
    (window as unknown as { __air3d?: unknown }).__air3d = {
      scene,
      cam,
      rig,
      pad: { x: where.x, z: where.z },
    };
    const lost = (e: Event) => {
      e.preventDefault();
      markWebGLBroken();
      setError(t('The 3D view stopped. Close it and open it again.'));
    };
    canvas.addEventListener('webglcontextlost', lost);
    scene.touch(1500);
    queueMicrotask(() => setReady(true));
    return () => {
      canvas.removeEventListener('webglcontextlost', lost);
      ro.disconnect();
      cam.running = false;
      offRig();
      scene.view = null;
      scene.dispose();
      rig.dispose();
      canvas.remove();
      sceneRef.current = null;
      camRef.current = null;
      rigRef.current = null;
      delete (window as unknown as { __air3d?: unknown }).__air3d;
    };
    // The view is built once per city layout.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, terrain, where, gl, city, skydive]);
  useEffect(() => {
    if (!gl && where) queueMicrotask(() => setReady(true));
  }, [gl, where]);

  async function onLand(j: Jump) {
    setLanded({ jump: j, result: null });
    const r = await send<LandResult>({
      type: 'games.land',
      bookingId: booking.bookingId,
      deployAt: j.deployAt ?? JUMP.aad,
      miss: Math.min(20000, j.miss ?? 9999),
      style: jumpStyle(j),
    });
    setLanded({ jump: j, result: r ?? null });
  }
  async function onHome(h: Heli) {
    setHome(h);
    await send({ type: 'games.end', bookingId: booking.bookingId });
  }

  // ---- The flight: stepped each frame, the camera placed, the labels and the HUD updated.
  useEffect(() => {
    if (!where || !ready) return;
    let raf = 0;
    let last = performance.now();
    let hudAt = 0;
    const out = { x: 0, y: 0, z: 0 };
    let first = false;
    let measured = -1e9;
    let measuredSay: string | undefined;
    let blocks: { l: number; r: number; t: number; b: number }[] = [];
    const groundAt = (x: number, z: number) => {
      const s = sceneRef.current;
      return s ? s.groundAt(x, z) + s.terrainAt(x, z) : 0;
    };
    const base = groundAt(where.x, where.z);
    // How tall the city stands under the helicopter and ahead of it (its height is
    // drawn over `base`): the roofs straight down, 40 m cells cached, a few new rays
    // a frame (one not yet looked at counts as the last one found), and the landmarks.
    const roofs = new Map<string, number>();
    let rays = 0;
    let lastRoof = 0;
    const roof: RoofAt = (x, z) => {
      const k = `${Math.floor(x / 40)}_${Math.floor(z / 40)}`;
      let r = roofs.get(k);
      const s = sceneRef.current;
      if (r === undefined && s && rays < 4) {
        rays++;
        r = s.roofAt(x, z) + 0.8 * (groundAt(x, z) - base);
        for (const m of where.marks) if (Math.hypot(m.x - x, m.z - z) < 120) r = Math.max(r, m.h);
        roofs.set(k, r);
      }
      if (r !== undefined) lastRoof = r;
      return r ?? lastRoof;
    };
    // Low over the city and on the pad, the Outside camera keeps above what
    // stands under it: the ground and roofs there (world y), 8 m cells cached,
    // two new rays a frame.
    const tops = new Map<string, number>();
    let topRays = 0;
    const top = (x: number, z: number) => {
      const k = `${Math.floor(x / 8)}_${Math.floor(z / 8)}`;
      let r = tops.get(k);
      const s = sceneRef.current;
      if (r === undefined && s && topRays < 2) {
        topRays++;
        r = groundAt(x, z) + s.roofAt(x, z);
        tops.set(k, r);
      }
      return r ?? groundAt(x, z);
    };
    // The air's gusts: seeded by the booking (the same jump draws the same sky).
    const air = createRng(hashString(booking.bookingId));
    const frame = () => {
      const now = performance.now();
      // Wall-clock time (a slow renderer flies the same jump), sped up for tests.
      const speed = (window as unknown as { __airSpeed?: number }).__airSpeed ?? 1;
      const dt = Math.min(0.5, (now - last) / 1000) * speed;
      last = now;
      const cam = camRef.current;
      if (skydive && jumpRef.current) {
        let j = jumpRef.current;
        if (skipRef.current && j.phase === 'climb') j = skipClimb(j);
        if (j.phase !== 'landed') {
          // Small steps, so a big one doesn't skip the ground.
          for (let left = dt; left > 0; left -= 0.05) {
            const drift = (air.next() * 2 - 1) * 1.4;
            j = stepJump(j, Math.min(0.05, left), input.current, drift);
            if (j.phase === 'landed') break;
          }
          jumpRef.current = j;
          if (j.phase === 'landed') onLand(j);
        }
        const rig = rigRef.current;
        if (cam && rig)
          rig.placeJump(j, base, camModeRef.current, cam, dt, now, {
            track: input.current.track,
            turn: input.current.turn,
          });
        if (now - hudAt > 120) {
          hudAt = now;
          const tt = toTarget(j);
          setHud({
            phase: j.phase,
            alt: Math.round(j.alt),
            dist: Math.round(tt.dist),
            rel: Math.atan2(Math.sin(tt.bearing - j.heading), Math.cos(tt.bearing - j.heading)),
            body: j.body,
            leg: 0,
            manual: false,
          });
        }
      } else if (heliRef.current) {
        let h = heliRef.current;
        if (h.leg <= route.length) {
          rays = 0;
          h = stepHeli(h, dt, route, where, input.current, roof);
          heliRef.current = h;
          if (h.leg > route.length) onHome(h);
        }
        const rig = rigRef.current;
        topRays = 0;
        if (cam && rig)
          rig.placeHeli(
            h,
            groundAt(h.x, h.z) * 0.2 + base * 0.8 + h.alt,
            camModeRef.current,
            cam,
            dt,
            h.alt < 90 ? top : undefined,
          );
        if (now - hudAt > 150) {
          hudAt = now;
          const goal = route[h.leg];
          setHud({
            phase: h.leg > route.length ? 'landed' : 'flying',
            alt: Math.round(h.alt),
            dist: goal ? Math.round(Math.hypot(goal.x - h.x, goal.z - h.z)) : 0,
            rel: 0,
            body: 0,
            leg: h.leg,
            manual: h.manual,
          });
          if (goal && Math.hypot(goal.x - h.x, goal.z - h.z) < 1400)
            setSay((s) =>
              s?.name === goal.name
                ? s
                : { name: goal.name, side: sideOf(h, goal), detail: goal.detail },
            );
        }
      }
      // The loading screen stays up until the first frame with the aircraft is drawn.
      if (!first && (!gl || (rigRef.current?.frames ?? 0) > 0)) {
        first = true;
        setDrawnOnce(true);
      }
      // The landmarks' names over the city.
      const scene = sceneRef.current;
      const host = labelsRef.current;
      if (scene && host && cam) {
        const { w: W, h: H } = scene.viewSize;
        // The title, buttons and panels, measured a few times a second and as soon as the
        // commentary changes (measured every 20 frames, a slow phone left a name over the
        // new line for seconds): a name never sits on them, nor within a few pixels.
        const sayNow = sayRef.current;
        if (now - measured > 300 || sayNow !== measuredSay) {
          measured = now;
          measuredSay = sayNow;
          const at = host.getBoundingClientRect();
          const root = host.closest('.air');
          const pad = 6;
          blocks = root
            ? [...root.querySelectorAll<HTMLElement>(LABEL_BLOCKERS)]
                .map((e) => e.getBoundingClientRect())
                .filter((r) => r.width > 0 && r.height > 0)
                .map((r) => ({
                  l: r.left - at.left - pad,
                  r: r.right - at.left + pad,
                  t: r.top - at.top - pad,
                  b: r.bottom - at.top + pad,
                }))
            : [];
        }
        for (const node of host.querySelectorAll<HTMLElement>('[data-air-label]')) {
          const l = where.marks[Number(node.dataset.i)];
          if (!l) continue;
          const d = Math.hypot(l.x - cam.pos.x, l.z - cam.pos.z);
          scene.project(l.x, groundAt(l.x, l.z) + l.h + 10, l.z, out);
          // The name's box: centred over the point, above its 8 px stem (.sky-label).
          const lw = node.offsetWidth || 140;
          const lh = node.offsetHeight || 20;
          const box = { l: out.x - lw / 2, r: out.x + lw / 2, t: out.y - lh - 8, b: out.y };
          const vis =
            out.z < 1 &&
            box.l > 4 &&
            box.r < W - 4 &&
            box.t > 4 &&
            out.y < H - 120 &&
            d < 6000 &&
            !blocks.some((k) => box.l < k.r && box.r > k.l && box.t < k.b && box.b > k.t);
          if (vis)
            node.style.transform = `translate(${Math.round(out.x)}px,${Math.round(out.y)}px)`;
          if (node.hidden === vis) node.hidden = !vis;
        }
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
    // The handlers read refs; the loop runs once per flight.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [where, ready, route, skydive]);

  // ---- Lite: the flight on a map from above.
  useEffect(() => {
    if (gl || !where) return;
    let raf = 0;
    const draw = () => {
      const c = mapRef.current;
      const g = c?.getContext('2d');
      if (c && g) {
        const W = (c.width = c.clientWidth || 360);
        const H = (c.height = c.clientHeight || 480);
        g.fillStyle = '#cbd5c0';
        g.fillRect(0, 0, W, H);
        const j = jumpRef.current;
        const h = heliRef.current;
        const cx = j ? j.x : (h?.x ?? where.x);
        const cz = j ? j.z : (h?.z ?? where.z);
        const k = j ? (j.phase === 'canopy' || j.phase === 'landed' ? 0.25 : 0.08) : 0.06;
        const sx = (x: number) => W / 2 + (x - cx) * k;
        const sy = (z: number) => H / 2 + (z - cz) * k;
        if (j) {
          for (const [r, col] of [
            [60, '#dc2626'],
            [30, '#f8fafc'],
            [14, '#dc2626'],
            [4, '#f8fafc'],
          ] as const) {
            g.fillStyle = col;
            g.beginPath();
            g.arc(sx(j.tx), sy(j.tz), Math.max(2, r * k), 0, Math.PI * 2);
            g.fill();
          }
        }
        g.fillStyle = '#1e293b';
        g.font = '12px system-ui';
        for (const m of where.marks) {
          g.beginPath();
          g.arc(sx(m.x), sy(m.z), 3, 0, Math.PI * 2);
          g.fill();
          g.fillText(m.name, sx(m.x) + 5, sy(m.z) - 4);
        }
        const heading = j?.heading ?? h?.heading ?? 0;
        g.save();
        g.translate(W / 2, H / 2);
        g.rotate(heading);
        g.fillStyle = '#2563eb';
        g.beginPath();
        g.moveTo(0, -10);
        g.lineTo(7, 8);
        g.lineTo(-7, 8);
        g.fill();
        g.restore();
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [gl, where]);

  const act = (f: (j: Jump) => Jump) => {
    if (jumpRef.current) jumpRef.current = f(jumpRef.current);
  };
  const snap = () => {
    const src =
      sceneRef.current?.snapshot(
        skydive
          ? t('Skydiving over {city}', { city: cityView.market.name })
          : t('Over {city} by helicopter', { city: cityView.market.name }),
      ) ?? null;
    if (src) addPhoto(src);
    setPhoto({ src });
  };
  const done = !!landed || !!home;
  const loadSteps = [!!geo && geo !== 'loading', terrain !== 'loading', !!layout, ready, drawnOnce];
  const fmtAlt = (m: number) => t('{n} m', { n: m.toLocaleString('en-GB') });
  const result = landed?.result;

  return (
    <section
      className={`air ${skydive ? 'is-skydive' : 'is-heli'}`}
      role="dialog"
      aria-modal="true"
      aria-label={skydive ? t('Skydive') : t('Helicopter ride')}
      data-air={booking.kind}
      data-air-phase={skydive ? hud.phase || 'climb' : done ? 'landed' : 'flying'}
    >
      <div className="air-canvas" ref={mount}>
        {!gl && <canvas ref={mapRef} className="air-map" aria-hidden="true" />}
        <div ref={labelsRef} className="sky-labels" aria-hidden="true">
          {(where?.marks ?? []).map((l, i) => (
            <span key={l.name} className="sky-label" data-air-label={l.name} data-i={i} hidden>
              <b>{l.name}</b>
            </span>
          ))}
        </div>
        {/* Inside (or on the map): the door's frame, the canopy overhead, the goggles. */}
        {skydive &&
          (!gl || camMode === 'inside') &&
          (hud.phase === 'climb' || hud.phase === 'door') && (
            <div className="air-door" aria-hidden="true" />
          )}
        {skydive && (!gl || camMode === 'inside') && hud.phase === 'canopy' && (
          <div className="air-canopy" aria-hidden="true" />
        )}
        {skydive && gl && camMode === 'inside' && hud.phase === 'freefall' && (
          <div className="air-goggles" aria-hidden="true" />
        )}
        {!skydive && !gl && !done && <div className="air-cockpit" aria-hidden="true" />}
      </div>
      {!(ready && drawnOnce) && !error && (
        // A short loading screen: what's ready of the five steps, and (a skydive) Skip the climb.
        <div
          className="air-loading"
          role="status"
          data-air-loading={Math.round((loadSteps.filter(Boolean).length / loadSteps.length) * 100)}
        >
          <b>{skydive ? t('To the plane…') : t('To the heliport…')}</b>
          <span className="panorama-progress" aria-hidden="true">
            <span
              style={{
                width: `${Math.round((loadSteps.filter(Boolean).length / loadSteps.length) * 100)}%`,
              }}
            />
          </span>
          <small>{LOAD_STEP[Math.min(loadSteps.indexOf(false), LOAD_STEP.length - 1)]?.()}</small>
        </div>
      )}
      <header className="air-head">
        <div>
          <small>
            {skydive ? '🪂' : '🚁'} {booking.venueName}
          </small>
          <h2>
            {skydive
              ? hud.phase === 'climb'
                ? t('Climbing to altitude')
                : hud.phase === 'door'
                  ? t('The door is open')
                  : hud.phase === 'freefall'
                    ? t('Freefall!')
                    : hud.phase === 'canopy'
                      ? t('Under canopy')
                      : t('Landed')
              : done
                ? t('Back on the pad')
                : hud.manual
                  ? t('You have the controls')
                  : // The flight you booked (playtest round 6: every flight said "City tour").
                    (HELI_TITLE[booking.item]?.() ?? t('Helicopter ride'))}
          </h2>
        </div>
        <div className="panorama-actions">
          <button type="button" onClick={onClose} aria-label={t('Close')}>
            ×
          </button>
        </div>
      </header>
      {gl && ready && !error && (
        // The camera's round buttons down the right (the floating HUD's rail).
        <HudRail className="air-cam" label={t('Camera')} data-air-cam={camMode}>
          <HudButton
            icon="camera"
            className="panorama-snap"
            data-action="air-photo"
            label={t('Take a photo')}
            onClick={snap}
          />
          {(['inside', 'outside'] as const).map((m) => (
            <HudButton
              key={m}
              data-action={`air-cam-${m}`}
              aria-pressed={camMode === m}
              label={m === 'inside' ? t('Inside') : t('Outside')}
              onClick={() => pickCam(m)}
            >
              <span aria-hidden="true">{m === 'inside' ? '💺' : '🎥'}</span>
            </HudButton>
          ))}
        </HudRail>
      )}
      {error && (
        <p className="panorama-error" role="alert">
          {error}
        </p>
      )}
      {skydive && !done && (
        <div className="air-hud" data-alt={hud.alt}>
          <span className="air-alt">
            <small>{t('Altitude')}</small>
            <b>{fmtAlt(hud.alt)}</b>
          </span>
          {(hud.phase === 'freefall' || hud.phase === 'canopy') && (
            <span className="air-target">
              <i style={{ transform: `rotate(${hud.rel}rad)` }} aria-hidden="true">
                ⬆
              </i>
              {t('Target {n} m', { n: hud.dist })}
            </span>
          )}
          {hud.phase === 'freefall' && (
            <span className="air-body" aria-label={t('Body position')}>
              <i style={{ left: `${50 + hud.body * 45}%` }} />
            </span>
          )}
        </div>
      )}
      {!skydive && !done && say && (
        <p className="air-say" role="status" data-air-say={say.name}>
          <b>
            {say.side === 'left'
              ? t('On your left: {name}', { name: say.name })
              : t('On your right: {name}', { name: say.name })}
          </b>
          {say.detail && <span>{t(say.detail)}</span>}
        </p>
      )}
      <footer className="air-controls">
        {skydive && (hud.phase === 'climb' || !hud.phase) && (
          <>
            <p>{t('The plane climbs to 4,000 m over the city. Get ready at the door.')}</p>
            <button
              type="button"
              className="experience-secondary air-skip"
              data-action="air-skip"
              onClick={() => {
                skipRef.current = true;
                if (jumpRef.current) jumpRef.current = skipClimb(jumpRef.current);
              }}
            >
              {t('Skip the climb ›')}
            </button>
          </>
        )}
        {skydive && hud.phase === 'door' && (
          <button
            type="button"
            className="experience-primary"
            data-action="jump"
            onClick={() => act(exitPlane)}
          >
            {t('Jump!')}
          </button>
        )}
        {skydive && hud.phase === 'freefall' && (
          <>
            <p className="small">
              {t(
                'Hold a stable arch (tap Arch when you wobble), steer towards the target and pull between 1,700 and 1,000 m.',
              )}
            </p>
            <div className="air-row">
              <Hold label={t('Turn left')} onHold={(on) => setIn('turn', on ? -1 : 0)}>
                ◀
              </Hold>
              <button type="button" data-action="arch" onClick={() => act(arch)}>
                {t('Arch')}
              </button>
              <button
                type="button"
                aria-pressed={track}
                onClick={() => {
                  setTrack(!track);
                  setIn('track', !track);
                }}
              >
                {t('Track')}
              </button>
              <Hold label={t('Turn right')} onHold={(on) => setIn('turn', on ? 1 : 0)}>
                ▶
              </Hold>
            </div>
            <button
              type="button"
              className="experience-primary"
              data-action="pull"
              onClick={() => act(deploy)}
            >
              {t('Pull!')}
            </button>
          </>
        )}
        {skydive && hud.phase === 'canopy' && (
          <>
            <p className="small">
              {t('Steer to the target. Flare just before the ground for a soft landing.')}
            </p>
            <div className="air-row">
              <Hold label={t('Turn left')} onHold={(on) => setIn('turn', on ? -1 : 0)}>
                ◀
              </Hold>
              <button
                type="button"
                className="experience-primary"
                data-action="flare"
                disabled={hud.alt > JUMP.flareAt * 3}
                onClick={() => act(flare)}
              >
                {t('Flare')}
              </button>
              <Hold label={t('Turn right')} onHold={(on) => setIn('turn', on ? 1 : 0)}>
                ▶
              </Hold>
            </div>
          </>
        )}
        {!skydive && !done && (
          <>
            {hud.manual && (
              <div className="air-row">
                <Hold label={t('Turn left')} onHold={(on) => setIn('turn', on ? -1 : 0)}>
                  ◀
                </Hold>
                <Hold label={t('Climb')} onHold={(on) => setIn('climb', on ? 1 : 0)}>
                  ▲
                </Hold>
                <Hold label={t('Descend')} onHold={(on) => setIn('climb', on ? -1 : 0)}>
                  ▼
                </Hold>
                <Hold label={t('Turn right')} onHold={(on) => setIn('turn', on ? 1 : 0)}>
                  ▶
                </Hold>
              </div>
            )}
            <div className="air-row">
              <button
                type="button"
                data-action="heli-controls"
                aria-pressed={hud.manual}
                onClick={() => {
                  if (heliRef.current)
                    heliRef.current = { ...heliRef.current, manual: !heliRef.current.manual };
                }}
              >
                {hud.manual ? t('Back to the pilot') : t('Take the controls')}
              </button>
              <button
                type="button"
                data-action="heli-home"
                onClick={() => {
                  if (heliRef.current)
                    heliRef.current = {
                      ...heliRef.current,
                      manual: false,
                      leg: Math.max(heliRef.current.leg, route.length),
                    };
                }}
              >
                {t('Head back')}
              </button>
            </div>
            <p className="small">
              {t('Landmark {n} of {total} · {alt} up', {
                n: Math.min(hud.leg + 1, route.length),
                total: route.length,
                alt: fmtAlt(hud.alt),
              })}
            </p>
          </>
        )}
        {done && (
          <div className="air-result" data-air-result="">
            {skydive ? (
              result ? (
                <>
                  <h3>
                    {result.grade === 'gold'
                      ? t('Gold jump: {n} points', { n: result.score })
                      : result.grade === 'silver'
                        ? t('Silver jump: {n} points', { n: result.score })
                        : result.grade === 'bronze'
                          ? t('Bronze jump: {n} points', { n: result.score })
                          : t('{n} points', { n: result.score })}
                  </h3>
                  <p>
                    {t('Pulled at {alt} · landed {miss} m from the target · style {style}', {
                      alt: fmtAlt(landed!.jump.deployAt ?? JUMP.aad),
                      miss: Math.round(landed!.jump.miss ?? 0),
                      style: jumpStyle(landed!.jump),
                    })}
                  </p>
                  {result.record && <p className="air-record">{t('Your best jump yet!')}</p>}
                </>
              ) : (
                <p>{t('Landed. Packing up the canopy…')}</p>
              )
            ) : (
              <>
                <h3>{t('What a view!')}</h3>
                <p>
                  {(home?.seen.length ?? 0) === 0
                    ? t('You headed back before the first landmark: the city from the air.')
                    : home!.seen.length === 1
                      ? t('A landmark from the air: {name}', { name: home!.seen[0]! })
                      : t('{n} landmarks from the air: {names}', {
                          n: home!.seen.length,
                          names: home!.seen.join(', '),
                        })}
                </p>
              </>
            )}
            <SnapButton
              action="air-card"
              className="experience-secondary"
              label={t('Photo of the result')}
              title={t('Your result')}
              file={skydive ? 'my-skydive' : 'my-heli-ride'}
              city={cityView.market.name}
              make={() =>
                resultCard({
                  kicker: `${booking.venueName} · ${cityView.market.name}`,
                  title: skydive
                    ? t('Skydive: {n} points', { n: result?.score ?? 0 })
                    : t('Helicopter tour'),
                  subtitle: skydive
                    ? t('Landed {miss} m from the target', {
                        miss: Math.round(landed?.jump.miss ?? 0),
                      })
                    : (home?.seen ?? []).slice(0, 4).join(' · '),
                  stats: skydive
                    ? [
                        { label: t('Pull'), value: String(result?.pull ?? 0) },
                        { label: t('Landing'), value: String(result?.land ?? 0) },
                        { label: t('Style'), value: String(result?.style ?? 0) },
                        { label: t('Best'), value: String(result?.best ?? 0) },
                      ]
                    : [
                        { label: t('Landmarks'), value: String(home?.seen.length ?? 0) },
                        { label: t('Price'), value: money(booking.price, booking.currency) },
                      ],
                  footer: cityView.market.name,
                  tone: skydive ? 'teal' : 'night',
                })
              }
            />
            <button
              type="button"
              className="experience-primary"
              data-action="air-done"
              onClick={onClose}
            >
              {t('Done')}
            </button>
          </div>
        )}
        <small className="air-credit">{OSM_CREDIT}, Overture Maps</small>
      </footer>
      {photo && (
        <PhotoSheet
          first={photo.src}
          city={city}
          title={skydive ? t('Photo from the sky') : t('Photo from the helicopter')}
          file={skydive ? 'my-skydive-photo' : 'my-heli-photo'}
          floating
          onClose={() => setPhoto(null)}
        />
      )}
    </section>
  );
}

/** A button you hold (a toggle, a turn): on while pressed. */
function Hold({
  label,
  onHold,
  children,
}: {
  label: string;
  onHold: (on: boolean) => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onPointerDown={() => onHold(true)}
      onPointerUp={() => onHold(false)}
      onPointerLeave={() => onHold(false)}
      onPointerCancel={() => onHold(false)}
    >
      {children}
    </button>
  );
}

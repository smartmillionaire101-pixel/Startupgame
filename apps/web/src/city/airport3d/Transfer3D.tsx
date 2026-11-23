/**
 * The ride from Arrivals to your hotel, in 3D (lazy-loaded), at the hour it
 * is where you've landed. The terminal's glass doors slide open; you and
 * your friends walk out across the pavement to the hotel's car (a CC0 car)
 * waiting at the kerb and get in; it pulls away past the terminal's long
 * frontage, the camera alongside. At night the street lamps are on, the
 * terminal and the buildings' windows are lit, the car's headlights shine
 * ahead of it and its paint catches the light. A few seconds long; the
 * words over it (where you're going, who's with you) stay in the DOM
 * (./HotelRide.tsx).
 */
import { useEffect, useRef, type ReactElement } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Stage } from '../../interiors3d/stage';
import { makeCharacter, pose, type Character } from '../../interiors3d/character';
import { Kit, disposeTree, floorTexture, mat } from '../../interiors3d/kit';
import { carModel, loadCars, spinWheels, type CarModel } from '../../three-kit/vehicles';
import type { AvatarLook } from '../art';
import { fnv, seeded } from '../travel';

export interface Transfer3DProps {
  me: AvatarLook;
  party: AvatarLook[];
  night: boolean;
  /** The car: a taxi in the city's paint, or the hotel's own. */
  car: CarModel;
  paint: string;
  /** Seconds the ride lasts on screen. */
  seconds: number;
  seed: string;
  onFail?: () => void;
}

const CAR_Z = 0.95;
const KERB_Z = -0.4;
/** The terminal's front (its glass), and the doors you come out of. */
const FRONT_Z = -5.4;
const DOOR_X = -0.6;

/** A canvas texture of a building's face: rows of windows, some lit at night. */
function windowsTexture(night: boolean, seed: number) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const g = c.getContext('2d')!;
  const rnd = seeded(seed);
  g.fillStyle = night ? '#1a1f33' : '#ffffff';
  g.fillRect(0, 0, 128, 256);
  for (let y = 6; y < 256; y += 16)
    for (let x = 6; x < 128; x += 20) {
      const lit = night && rnd() < 0.55;
      g.fillStyle = lit
        ? ['#ffe7a8', '#fff3cf', '#ffd27a'][Math.floor(rnd() * 3)]!
        : night
          ? '#0d1222'
          : '#8fb0c8';
      g.fillRect(x, y, 12, 9);
    }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function build(stage: Stage, P: Transfer3DProps) {
  const root = new THREE.Group();
  const tex: THREE.Texture[] = [];
  const s = stage.scene;
  s.add(root);
  const night = P.night;
  s.background = new THREE.Color(night ? '#121a3a' : '#9fd0ee');
  s.fog = new THREE.Fog(night ? '#121a3a' : '#cfe5f3', 45, 170);
  stage.hemi.intensity = night ? 0.85 : 1.3;
  stage.hemi.color.set(night ? '#aab8f0' : '#fff4e0');
  stage.hemi.groundColor.set(night ? '#2a2233' : '#4a3b2c');
  stage.ambient.intensity = night ? 0.35 : 0.25;
  stage.sun.intensity = night ? 0.45 : 2.0;
  stage.sun.color.set(night ? '#9fb3ff' : '#fff1d6');
  const rnd = seeded(fnv(`${P.seed}:ride`));
  // The road, its markings, the pavement and kerb.
  const at = floorTexture('concrete').clone();
  at.needsUpdate = true;
  at.repeat.set(60, 3);
  tex.push(at);
  const road = new THREE.Mesh(
    new THREE.PlaneGeometry(400, 12),
    mat(night ? '#5a606b' : '#4b5058', { map: at, rough: 0.9, own: true }),
  );
  road.rotation.x = -Math.PI / 2;
  road.position.set(150, 0, 5.5);
  road.receiveShadow = true;
  root.add(road);
  const k = new Kit();
  for (let x = -40; x < 360; x += 6)
    k.box(3, 0.01, 0.14, '#f8fafc', x, 0.005, 5.4, { noShadow: true });
  k.box(400, 0.01, 0.12, '#facc15', 150, 0.005, 0.0, { noShadow: true });
  k.box(400, 0.16, 0.25, '#9ca3af', 150, 0, KERB_Z);
  k.box(400, 0.14, -FRONT_Z + KERB_Z + 0.2, '#d6d3d1', 150, 0, (FRONT_Z + KERB_Z) / 2);
  // The terminal's frontage, long enough to drive past: glass between
  // columns, a canopy high over the doors, the building above.
  const fx0 = -24;
  const fx1 = 70;
  const fw = fx1 - fx0;
  const fcx = (fx0 + fx1) / 2;
  k.box(fw, 9, 3, '#cfd5dc', fcx, 4.4, FRONT_Z - 1.6);
  k.box(fw, 0.3, 0.6, '#9aa3ad', fcx, 4.25, FRONT_Z - 0.1);
  for (let x = fx0; x <= fx1; x += 4) k.box(0.18, 4.3, 0.24, '#475569', x, 0, FRONT_Z);
  k.box(fw, 0.32, 2.6, '#e5e7eb', fcx, 5.1, FRONT_Z + 1.1);
  for (let x = fx0 + 6; x < fx1; x += 12) k.cyl(0.12, 0.12, 5.1, '#94a3b8', x, 0, FRONT_Z + 2.2);
  // Street lamps along the kerb, trees between.
  for (let x = -18; x < 360; x += 14) {
    k.cyl(0.07, 0.09, 5.2, '#4b5563', x, 0, KERB_Z - 0.5);
    k.box(1.2, 0.08, 0.2, '#4b5563', x + 0.5, 5.1, KERB_Z - 0.5);
    k.box(0.5, 0.1, 0.26, night ? '#fff1c1' : '#e5e7eb', x + 0.95, 5.0, KERB_Z - 0.5, {
      emissive: night ? '#ffd98a' : undefined,
      emissiveIntensity: night ? 2.2 : 1,
      noShadow: true,
    });
  }
  for (let x = 80; x < 360; x += 14) {
    k.cyl(0.1, 0.14, 2.2, '#5b4636', x + 7, 0, KERB_Z - 1.8);
    k.sphere(1.1, night ? '#1d3b28' : '#3f7d3a', x + 7, 2.8, KERB_Z - 1.8, { sy: 0.9 });
  }
  root.add(k.build());
  // The glass of the frontage (lit from inside at night), and its doors.
  const glassM = new THREE.MeshStandardMaterial({
    color: night ? '#f6e7c6' : '#b9d4e6',
    roughness: 0.15,
    metalness: 0.2,
    emissive: night ? '#ffe2a8' : '#000000',
    emissiveIntensity: night ? 0.75 : 0,
  });
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(fw, 4.1), glassM);
  glass.position.set(fcx, 2.15, FRONT_Z - 0.05);
  root.add(glass);
  const doorM = new THREE.MeshStandardMaterial({
    color: night ? '#fff3d6' : '#dbeafe',
    roughness: 0.1,
    transparent: true,
    opacity: 0.7,
    emissive: night ? '#ffe2a8' : '#000000',
    emissiveIntensity: night ? 0.4 : 0,
  });
  const doors = [-1, 1].map((sx) => {
    const d = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.6, 0.05), doorM);
    d.position.set(DOOR_X + sx * 0.55, 1.3, FRONT_Z + 0.05);
    root.add(d);
    return d;
  });
  // Buildings across the road and beyond the terminal, windows lit at night.
  const wt = windowsTexture(night, fnv(`${P.seed}:win`));
  tex.push(wt);
  const blocks: THREE.BufferGeometry[] = [];
  const col = new THREE.Color();
  const block = (x: number, z: number, w: number, h: number, d: number, c: string) => {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(x, h / 2, z);
    const uv = g.getAttribute('uv');
    // Windows at about 3 m a floor, 4 m a bay.
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (w / 4), uv.getY(i) * (h / 4.5));
    const n = g.getAttribute('position').count;
    const cols = new Float32Array(n * 3);
    col.set(c);
    for (let i = 0; i < n; i++) cols.set([col.r, col.g, col.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    blocks.push(g);
  };
  const walls = night ? ['#ffffff'] : ['#e7e2d6', '#cbd5e1', '#d6c7b0', '#b6bec9', '#f1ece2'];
  for (let x = -30; x < 360; x += 12 + rnd() * 8)
    block(x, 22, 9, 8 + rnd() * 22, 8, walls[Math.floor(rnd() * walls.length)]!);
  for (let x = 76; x < 360; x += 10 + rnd() * 6) {
    const d = 8 + rnd() * 6;
    block(
      x,
      FRONT_Z - 4 - d / 2,
      7 + rnd() * 4,
      8 + rnd() * 26,
      d,
      walls[Math.floor(rnd() * walls.length)]!,
    );
  }
  const bm = new THREE.MeshStandardMaterial({
    vertexColors: true,
    map: wt,
    roughness: 0.85,
    emissive: night ? '#ffffff' : '#000000',
    emissiveMap: night ? wt : null,
    emissiveIntensity: night ? 0.9 : 0,
  });
  const towns = new THREE.Mesh(mergeGeometries(blocks, false)!, bm);
  for (const g of blocks) g.dispose();
  root.add(towns);
  // The sign over the doors.
  const sign = (() => {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 128;
    const g = c.getContext('2d')!;
    g.fillStyle = '#1e3a8a';
    g.fillRect(0, 0, 512, 128);
    g.fillStyle = '#f8fafc';
    g.font = '900 64px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('Arrivals', 256, 68);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    tex.push(t);
    return new THREE.Mesh(
      new THREE.PlaneGeometry(3.2, 0.8),
      new THREE.MeshStandardMaterial({
        map: t,
        emissive: '#ffffff',
        emissiveMap: t,
        emissiveIntensity: night ? 0.9 : 0.4,
      }),
    );
  })();
  sign.position.set(DOOR_X, 5.0, FRONT_Z + 2.42);
  root.add(sign);
  // At night: the lamps' light on the pavement where you are.
  if (night)
    for (const x of [-4, 10]) {
      const l = new THREE.PointLight('#ffd9a0', 14, 15, 1.4);
      l.position.set(x + 0.95, 4.8, KERB_Z - 0.3);
      root.add(l);
    }
  // The car at the kerb, its headlights, and the people.
  const car = new THREE.Group();
  root.add(car);
  car.position.set(1.0, 0, CAR_Z);
  if (night) {
    for (const dz of [-0.55, 0.55]) {
      const lamp = new THREE.Mesh(
        new THREE.CircleGeometry(0.11, 12),
        new THREE.MeshBasicMaterial({ color: '#fffbe8' }),
      );
      lamp.position.set(2.32, 0.72, dz);
      lamp.rotation.y = Math.PI / 2;
      car.add(lamp);
    }
    const head = new THREE.SpotLight('#fff4d6', 30, 26, 0.5, 0.5, 1.2);
    head.position.set(2.2, 0.75, 0);
    head.target.position.set(10, 0, 0);
    car.add(head, head.target);
    const glowL = new THREE.PointLight('#ffe9c4', 9, 8, 1.4);
    glowL.position.set(-0.5, 3.0, 2.8);
    car.add(glowL);
  }
  const people: Character[] = [P.me, ...P.party.slice(0, 3)].map((look, n) => {
    const c = makeCharacter(look, n ? `ride:${n}` : 'me');
    root.add(c.root);
    return c;
  });
  return { root, tex, car, people, doors };
}

export default function Transfer3D(props: Transfer3DProps): ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const live = useRef(props);
  useEffect(() => {
    live.current = props;
  });
  useEffect(() => {
    const canvas = canvasRef.current!;
    const parent = canvas.parentElement!;
    let stage: Stage;
    try {
      stage = new Stage(canvas, {
        target: new THREE.Vector3(0, 1, 0),
        span: 10,
        azimuth: 0,
        elevation: 0.3,
        background: '#9fd0ee',
        shadowSize: 10,
        shadowMap: 1024,
        maxFps: 30,
      });
    } catch {
      live.current.onFail?.();
      return;
    }
    const P = live.current;
    const w = build(stage, P);
    const eye = new THREE.PerspectiveCamera(50, 1, 0.1, 300);
    stage.eye = eye;
    let model: THREE.Group | null = null;
    let disposed = false;
    // The car arrives with the models (a moment); until then nothing is drawn.
    stage.hold();
    let held = true;
    const release = () => {
      if (!held) return;
      held = false;
      stage.release();
    };
    const t0Ref = { t: -1 };
    void loadCars().then(() => {
      if (disposed) return;
      model = carModel(P.car, P.paint, 4.6);
      if (!model) {
        const k = new Kit();
        k.box(4.4, 0.8, 1.8, P.paint, 0, 0.3, 0, { round: 0.2 });
        k.box(2.4, 0.6, 1.6, '#1f2937', -0.2, 1.1, 0, { round: 0.2 });
        model = k.build();
      } else {
        // Paint that catches the light (a dark car reads at night too).
        const paint = model.userData.paint as THREE.MeshStandardMaterial | undefined;
        if (paint) {
          paint.metalness = 0.55;
          paint.roughness = 0.28;
          if (P.night) {
            paint.emissive.set(P.paint).multiplyScalar(0.5);
          }
        }
      }
      model.rotation.y = Math.PI / 2;
      w.car.add(model);
      release();
    });
    const holdTimer = window.setTimeout(release, 2500);
    const size = () => {
      const r = parent.getBoundingClientRect();
      stage.setSize(r.width, r.height);
      const aspect = r.width / Math.max(1, r.height);
      eye.aspect = aspect;
      const v = (2 * Math.atan(Math.tan((40 * Math.PI) / 360) / aspect) * 180) / Math.PI;
      eye.fov = Math.max(36, Math.min(64, v));
      eye.updateProjectionMatrix();
    };
    size();
    const ro = new ResizeObserver(size);
    ro.observe(parent);
    let lastX = w.car.position.x;
    const off = stage.add((t) => {
      if (held) return true;
      if (t0Ref.t < 0) t0Ref.t = t;
      const e = t - t0Ref.t;
      const D = live.current.seconds;
      const board = D * 0.52;
      // The doors slide open, then close behind the last of you.
      const open = Math.min(1, e / 0.45) * (1 - Math.max(0, Math.min(1, (e - board * 0.75) / 0.4)));
      w.doors.forEach((d, n) => (d.position.x = DOOR_X + (n ? 1 : -1) * (0.55 + 1.0 * open)));
      // Out of the doors, across the pavement to the car, one after another, then in.
      w.people.forEach((c, n) => {
        const start = 0.25 + n * 0.28;
        const k = Math.max(0, Math.min(1, (e - start) / (board - 0.6)));
        const from = new THREE.Vector3(DOOR_X + (n % 2 ? 0.35 : -0.35), 0, FRONT_Z - 0.4);
        const mid = new THREE.Vector3(DOOR_X + 0.4 + n * 0.5, 0, FRONT_Z + 2.2);
        const to = new THREE.Vector3(0.0 + n * 0.62, 0, KERB_Z - 0.32);
        const p = k < 0.5 ? from.clone().lerp(mid, k * 2) : mid.clone().lerp(to, k * 2 - 1);
        const ahead = k < 0.5 ? mid.clone().sub(from) : to.clone().sub(mid);
        c.root.position.copy(p);
        c.root.rotation.y = k < 1 ? Math.atan2(ahead.x, ahead.z) : Math.PI / 2;
        c.root.visible = e > start - 0.05 && e < board + 0.15 + n * 0.12;
        pose(c, k < 1 ? 'walk' : 'idle', t, { phase: n });
      });
      // Then the car pulls away past the terminal, faster and faster.
      const go = Math.max(0, e - board - 0.2);
      const x = 1.0 + 2.2 * go * go + 1.0 * go;
      w.car.position.x = x;
      if (model) spinWheels(model, x - lastX);
      lastX = x;
      // The camera alongside, keeping up (a little behind) once it moves.
      const cx = Math.max(0, x - 1.0 - 0.9 * Math.min(1, go));
      eye.position.set(cx + 1.8, 6.4, 10.2);
      eye.lookAt(cx + 0.2, 0.7, -2.0);
      stage.eyeMoved();
      return true;
    });
    const lost = (ev: Event) => {
      ev.preventDefault();
      live.current.onFail?.();
    };
    canvas.addEventListener('webglcontextlost', lost);
    return () => {
      disposed = true;
      window.clearTimeout(holdTimer);
      canvas.removeEventListener('webglcontextlost', lost);
      off();
      ro.disconnect();
      stage.eye = null;
      stage.scene.remove(w.root);
      disposeTree(w.root);
      for (const t of w.tex) t.dispose();
      stage.dispose();
    };
  }, []);
  return <canvas ref={canvasRef} className="transfer-3d" aria-hidden="true" data-transfer-3d="" />;
}

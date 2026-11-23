/**
 * The ride from Arrivals to your hotel, in 3D (lazy-loaded): the kerb
 * outside the terminal, the hotel's car (a CC0 car) waiting; you and your
 * friends walk out of the doors to it and get in, and it pulls away down the
 * road into town, the camera following alongside. A few seconds long; the
 * words over it (where you're going, who's with you) stay in the DOM
 * (./HotelRide.tsx).
 */
import { useEffect, useRef, type ReactElement } from 'react';
import * as THREE from 'three';
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

const CAR_Z = 0.9;
const KERB_Z = -0.4;

function build(stage: Stage, P: Transfer3DProps) {
  const root = new THREE.Group();
  const tex: THREE.Texture[] = [];
  const s = stage.scene;
  s.add(root);
  const night = P.night;
  s.background = new THREE.Color(night ? '#0b1026' : '#9fd0ee');
  s.fog = new THREE.Fog(night ? '#0b1026' : '#cfe5f3', 40, 160);
  stage.hemi.intensity = night ? 1.15 : 1.3;
  stage.hemi.color.set(night ? '#c7d2fe' : '#fff4e0');
  stage.ambient.intensity = night ? 0.6 : 0.25;
  stage.sun.intensity = night ? 0.6 : 2.0;
  stage.sun.color.set(night ? '#a5b4fc' : '#fff1d6');
  const rnd = seeded(fnv(`${P.seed}:ride`));
  // The road, its markings, the pavement and kerb.
  const at = floorTexture('concrete').clone();
  at.needsUpdate = true;
  at.repeat.set(60, 3);
  tex.push(at);
  const road = new THREE.Mesh(
    new THREE.PlaneGeometry(400, 12),
    mat('#4b5058', { map: at, rough: 0.95, own: true }),
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
  k.box(400, 0.14, 6, '#d6d3d1', 150, 0, KERB_Z - 3.1);
  // The terminal's front: glass, the canopy, its sign (at the start).
  k.box(36, 7, 0.5, '#cbd5e1', -2, 0, -9);
  k.box(30, 4.2, 0.1, '#a9cbe0', -2, 0.2, -8.7, {
    rough: 0.15,
    emissive: '#dbeafe',
    emissiveIntensity: 0.25,
  });
  for (let x = -16; x <= 12; x += 3) k.box(0.12, 4.2, 0.2, '#475569', x, 0.2, -8.6);
  k.box(32, 0.3, 1.6, '#e5e7eb', -2, 4.6, -8.0);
  // Then the city: blocks of buildings, trees, street lights, along the road.
  for (let x = 18; x < 360; x += 9 + rnd() * 6) {
    const h = 8 + rnd() * 26;
    const d = 8 + rnd() * 6;
    const c = night
      ? ['#1f2440', '#272b45', '#1c2238'][Math.floor(rnd() * 3)]!
      : ['#e7e2d6', '#cbd5e1', '#d6c7b0', '#b6bec9', '#f1ece2'][Math.floor(rnd() * 5)]!;
    k.box(7 + rnd() * 4, h, d, c, x, 0, -8 - d / 2, { noShadow: true });
  }
  for (let x = 24; x < 360; x += 14) {
    k.cyl(0.07, 0.09, 5.2, '#4b5563', x, 0, KERB_Z - 0.5);
    k.box(1.2, 0.08, 0.2, '#4b5563', x + 0.5, 5.1, KERB_Z - 0.5);
  }
  for (let x = 30; x < 360; x += 14) {
    k.cyl(0.1, 0.14, 2.2, '#5b4636', x, 0, KERB_Z - 1.8);
    k.sphere(1.1, night ? '#173322' : '#3f7d3a', x, 2.8, KERB_Z - 1.8, { sy: 0.9 });
  }
  // Across the road: a low wall and the far buildings.
  for (let x = -30; x < 360; x += 12 + rnd() * 8) {
    const h = 6 + rnd() * 18;
    k.box(9, h, 8, night ? '#20253f' : '#c9ced6', x, 0, 20, { noShadow: true });
  }
  root.add(k.build());
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
      new THREE.PlaneGeometry(4, 1),
      new THREE.MeshStandardMaterial({
        map: t,
        emissive: '#ffffff',
        emissiveMap: t,
        emissiveIntensity: 0.5,
      }),
    );
  })();
  sign.position.set(-1.2, 5.6, -8.6);
  root.add(sign);
  if (night) {
    for (let x = 24; x < 120; x += 14) {
      const l = new THREE.PointLight('#ffd9a0', 6, 12, 1.6);
      l.position.set(x + 0.9, 5, KERB_Z - 0.2);
      root.add(l);
    }
  }
  // The car at the kerb, and the people.
  const car = new THREE.Group();
  root.add(car);
  car.position.set(0.8, 0, CAR_Z);
  const people: Character[] = [P.me, ...P.party.slice(0, 3)].map((look, n) => {
    const c = makeCharacter(look, n ? `ride:${n}` : 'me');
    root.add(c.root);
    return c;
  });
  return { root, tex, car, people };
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
      }
      model.rotation.y = Math.PI / 2;
      w.car.add(model);
      release();
    });
    const holdTimer = window.setTimeout(release, 2500);
    let aspect = 1;
    const size = () => {
      const r = parent.getBoundingClientRect();
      stage.setSize(r.width, r.height);
      aspect = r.width / Math.max(1, r.height);
      eye.aspect = aspect;
      const v = (2 * Math.atan(Math.tan((34 * Math.PI) / 360) / aspect) * 180) / Math.PI;
      eye.fov = Math.max(34, Math.min(62, v));
      eye.updateProjectionMatrix();
    };
    size();
    const ro = new ResizeObserver(size);
    ro.observe(parent);
    let lastX = w.car.position.x;
    let camX = 0;
    const off = stage.add((t) => {
      if (held) return true;
      if (t0Ref.t < 0) t0Ref.t = t;
      const e = t - t0Ref.t;
      const D = live.current.seconds;
      const board = D * 0.5;
      // People out of the doors to the car, one after another, then in.
      w.people.forEach((c, n) => {
        const start = n * 0.22;
        const k = Math.max(0, Math.min(1, (e - start) / (board - 0.45)));
        const from = new THREE.Vector3(-1.6 + n * 0.55, 0, -4.4 - (n % 2) * 0.4);
        const to = new THREE.Vector3(-0.3 + n * 0.7, 0, KERB_Z - 0.3);
        const p = from.clone().lerp(to, k);
        c.root.position.copy(p);
        c.root.rotation.y = Math.atan2(to.x - from.x, to.z - from.z);
        c.root.visible = e < board + n * 0.1;
        pose(c, k < 1 ? 'walk' : 'idle', t, { phase: n });
      });
      // Then the car pulls away, faster and faster.
      const go = Math.max(0, e - board - 0.1);
      const x = 0.8 + 2.4 * go * go + 1.2 * go;
      w.car.position.x = x;
      if (model) spinWheels(model, x - lastX);
      lastX = x;
      // The camera alongside, catching up with it.
      camX = Math.max(0, x - 0.8 - 0.8 * Math.min(1, go));
      const cx = camX;
      eye.position.set(cx + 1.2, 5.9, 9.2);
      eye.lookAt(cx + 0.4, 0.9, -1.3);
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

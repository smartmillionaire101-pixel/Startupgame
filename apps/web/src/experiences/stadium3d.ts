/**
 * The stand behind the goal in the penalty shootout (./Shootout.tsx), made
 * of real people: the game's CC0 3D people (the kit's far copy), baked once
 * each into a still mesh in a few poses (../city/airport3d/crowd.ts) and
 * drawn instanced, one draw call per baked person, on concrete terraces with
 * coloured seats, the home end in red and white and the away fans in a
 * block of blue on the right, flags in the crowd and banners on the wall.
 *
 * The 2D pitch is drawn on a canvas (the goal and the net over the stand),
 * so the stand is not a live 3D view: it is rendered through the shootout's
 * own camera (./shootout-view.ts) by the shared offscreen renderer
 * (../three-kit/offscreen.ts) into a few still pictures, once per size:
 *
 * - `calm`: most sitting, some standing, a few clapping;
 * - `home` [a, b]: the home end up, arms in the air, flags waving; the two
 *   frames bob alternate people (a cheap jump when they're played in turn);
 * - `away` [a, b]: the same for the away block (the home end sits down).
 *
 * The shootout draws whichever fits the moment between the sky and the
 * boards. Loaded on demand (three.js only for a shootout in full 3D).
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AvatarLook } from '../city/art';
import { bakePeople, Instanced, type BakeSpec, type Placed } from '../city/airport3d/crowd';
import { travellerLook } from '../city/airport3d/looks';
import type { PoseId } from '../interiors3d/character';
import { offscreenRenderer } from '../three-kit/offscreen';
import type { Camera as PitchCamera } from './shootout-view';

export interface StandFrames {
  /** Device pixels per CSS pixel the pictures were drawn at. */
  scale: number;
  calm: HTMLCanvasElement;
  home: [HTMLCanvasElement, HTMLCanvasElement];
  away: [HTMLCanvasElement, HTMLCanvasElement];
}

/** The two ends' colours: shirts, the second shirt, seats, flags. */
export const HOME = {
  shirt: '#c8102e',
  alt: '#f8fafc',
  seat: '#9f1239',
  flag: ['#c8102e', '#f8fafc'],
};
export const AWAY = {
  shirt: '#38bdf8',
  alt: '#1e3a8a',
  seat: '#1d4ed8',
  flag: ['#38bdf8', '#1e3a8a'],
};
const EVERYDAY = ['#111827', '#334155', '#f97316', '#16a34a', '#eab308', '#7c3aed', '#64748b'];

/** The terraces: the first row's floor, each row up and back. */
const FRONT = { y: 1.25, z: -8.1 };
const ROW = { h: 0.44, d: 0.82 };
const ROWS = 13;
const SEAT_W = 0.56;
/** Aisles (stairs) and where the away block starts (x, m). */
const AISLES = [-4.1, 3.3];
const AWAY_FROM = 3.3;

/** The baked people: so many looks, each in these poses. */
const LOOKS = 10;
const POSES: { pose: PoseId; t: number }[] = [
  { pose: 'sit', t: 0 },
  { pose: 'idle', t: 0.4 },
  { pose: 'clap', t: 0.1 },
  { pose: 'cheer', t: 0 },
];
const P = { sit: 0, idle: 1, clap: 2, cheer: 3 } as const;

/** The paint colour the bake swaps for each fan's shirt (nothing else wears it). */
const PAINT = '#7a3e9d';

/** A seeded random number generator. */
function rng(seed: number) {
  let s = seed % 2147483647 || 1;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

/** A fan: a face from the city (and further), a tee or a hoodie in the paint colour. */
function fanLook(n: number, city: string): AvatarLook {
  const base = travellerLook(`fan:${n}`, city);
  return {
    ...base,
    topStyle: (['tee', 'hoodie', 'tee', 'tee', 'hoodie'] as const)[n % 5],
    top: PAINT,
    accessory: n % 4 === 1 ? 'cap' : 'none',
    headwear: 'none',
    glasses: undefined,
  } as AvatarLook;
}

/** The shootout's camera as a three.js camera (the same as the kicker's layer). */
export function pitchCamera(c: PitchCamera, cam = new THREE.PerspectiveCamera()) {
  const near = 0.1;
  const k = near / c.f;
  cam.position.set(0, c.eyeY, c.eyeZ);
  cam.rotation.set(0, 0, 0);
  cam.near = near;
  cam.far = 200;
  cam.projectionMatrix.makePerspective(
    (-c.width / 2) * k,
    (c.width / 2) * k,
    c.horizon * k,
    -(c.height - c.horizon) * k,
    near,
    200,
  );
  cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
  cam.updateMatrixWorld(true);
  return cam;
}

/** Row `r`'s floor. */
const rowAt = (r: number) => ({ y: FRONT.y + r * ROW.h, z: FRONT.z - r * ROW.d });

/** Half the width the camera sees at depth z (m), with a margin. */
const halfWide = (c: PitchCamera, z: number) => (c.width / 2) * ((c.eyeZ - z) / c.f) + 1.2;

/** A box as geometry with its colour in the vertices (for one merged, vertex-coloured mesh). */
function box(w: number, h: number, d: number, x: number, y: number, z: number, color: string) {
  const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
  g.translate(x, y, z);
  g.deleteAttribute('uv');
  const col = new THREE.Color(color);
  const n = g.getAttribute('position').count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.toArray(a, i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}

/** A banner's cloth: a canvas with the words (or stripes) on it. */
function bannerTexture(text: string, bg: string, fg: string, stripes = false) {
  const cv = document.createElement('canvas');
  cv.width = 512;
  cv.height = 96;
  const g = cv.getContext('2d')!;
  g.fillStyle = bg;
  g.fillRect(0, 0, cv.width, cv.height);
  if (stripes)
    for (let x = 0; x < cv.width; x += 64) {
      g.fillStyle = fg;
      g.fillRect(x, 0, 32, cv.height);
    }
  g.fillStyle = stripes ? bg : fg;
  g.font = '900 64px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  if (stripes) {
    g.fillRect(cv.width / 2 - 170, 10, 340, 76);
    g.fillStyle = fg;
  }
  g.fillText(text, cv.width / 2, cv.height / 2 + 4);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A hand flag: a pole and a two-colour cloth with a ripple in it. */
function flag(colors: string[], up: number, wave: number): THREE.Group {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.012, 0.012, 1.3, 5),
    new THREE.MeshStandardMaterial({ color: '#d1d5db', roughness: 0.6 }),
  );
  pole.position.y = 0.65;
  g.add(pole);
  const cloth = new THREE.PlaneGeometry(0.9, 0.56, 8, 1);
  const pos = cloth.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + 0.45;
    pos.setZ(i, Math.sin(x * 6 + wave * 3) * 0.06 * x);
  }
  cloth.translate(0.45, 0, 0);
  cloth.computeVertexNormals();
  const cv = document.createElement('canvas');
  cv.width = 64;
  cv.height = 40;
  const c = cv.getContext('2d')!;
  c.fillStyle = colors[0]!;
  c.fillRect(0, 0, 64, 40);
  c.fillStyle = colors[1]!;
  c.fillRect(0, 13, 64, 14);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(
    cloth,
    new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8, side: THREE.DoubleSide }),
  );
  m.position.y = 1.0;
  g.add(m);
  g.position.y = up;
  g.rotation.z = wave * 0.35;
  return g;
}

interface Fan {
  x: number;
  r: number;
  look: number;
  away: boolean;
  top: string;
  /** A keen one: on their feet even when the stand is calm. */
  keen: boolean;
  ry: number;
  flag: boolean;
}

/** Where everyone sits (deterministic): the seats the camera can see, nine in ten taken. */
function seatFans(c: PitchCamera): Fan[] {
  const rnd = rng(97);
  const out: Fan[] = [];
  for (let r = 0; r < ROWS; r++) {
    const { z } = rowAt(r);
    const half = halfWide(c, z);
    for (let x = -half + ((r % 2) * SEAT_W) / 2; x < half; x += SEAT_W) {
      if (AISLES.some((a) => Math.abs(x - a) < 0.5)) continue;
      if (rnd() < 0.09) continue;
      const away = x > AWAY_FROM;
      const kit = away ? AWAY : HOME;
      const u = rnd();
      out.push({
        x: x + (rnd() - 0.5) * 0.08,
        r,
        look: Math.floor(rnd() * LOOKS),
        away,
        top:
          u < 0.62
            ? kit.shirt
            : u < 0.82
              ? kit.alt
              : EVERYDAY[Math.floor(rnd() * EVERYDAY.length)]!,
        keen: rnd() < 0.22,
        ry: (rnd() - 0.5) * 0.35,
        flag: r > 1 && rnd() < (away ? 0.06 : 0.035),
      });
    }
  }
  return out;
}

type Mood = 'calm' | 'home' | 'away';

/** Each fan's pose and bob in one moment. */
function placeFans(fans: Fan[], mood: Mood, frame: 0 | 1): Placed[] {
  return fans.map((f, i) => {
    const up = mood !== 'calm' && f.away === (mood === 'away');
    const { y, z } = rowAt(f.r);
    let p: number;
    let bob = 0;
    if (up) {
      // Up and jumping: most arms high, some clapping; every other one in the air in each frame.
      p = (i * 7) % 10 < 8 ? P.cheer : P.clap;
      bob = (i + frame) % 2 === 0 ? 0.13 : 0;
    } else if (mood === 'calm') {
      p = f.keen ? ((i * 3) % 4 === 0 ? P.clap : P.idle) : P.sit;
    } else {
      // The other end, sunk back in their seats.
      p = f.keen && (i * 5) % 3 === 0 ? P.idle : P.sit;
    }
    return {
      v: f.look * POSES.length + p,
      x: f.x,
      y: y + bob,
      z: z - ROW.d * 0.55,
      ry: f.ry,
      top: f.top,
    };
  });
}

/** The concrete, the seats, the wall at the front and its banners (shared by every moment). */
function terraces(c: PitchCamera): THREE.Object3D {
  const g = new THREE.Group();
  const parts: THREE.BufferGeometry[] = [];
  const back = rowAt(ROWS);
  const W = halfWide(c, back.z) * 2 + 4;
  for (let r = 0; r <= ROWS; r++) {
    const { y, z } = rowAt(r);
    // The step: from the ground up to this row's floor.
    parts.push(box(W, y, ROW.d, 0, y / 2, z - ROW.d / 2, r % 2 ? '#5b6472' : '#626b79'));
    // A light nosing on the edge of each step.
    parts.push(box(W, 0.03, 0.05, 0, y + 0.015, z - 0.02, '#8b94a3'));
    if (r === ROWS) break;
    // The seats along the row (seat backs and pans), in the end's colour.
    const half = halfWide(c, z);
    for (let x = -half + ((r % 2) * SEAT_W) / 2; x < half; x += SEAT_W) {
      if (AISLES.some((a) => Math.abs(x - a) < 0.5)) continue;
      const seat = x > AWAY_FROM ? AWAY.seat : HOME.seat;
      parts.push(box(0.44, 0.36, 0.05, x, y + 0.62, z - ROW.d + 0.12, seat));
      parts.push(box(0.44, 0.05, 0.36, x, y + 0.42, z - ROW.d + 0.34, seat));
    }
  }
  // The back wall over the top row.
  parts.push(box(W, 3, 0.3, 0, back.y + 1.5, back.z - 0.15, '#374151'));
  // The wall at the front, with a rail on it, and the gap to the boards.
  parts.push(box(W, FRONT.y + 0.35, 0.25, 0, (FRONT.y + 0.35) / 2, FRONT.z + 0.12, '#1f2937'));
  parts.push(box(W, 0.05, 0.05, 0, FRONT.y + 1.0, FRONT.z - 0.1, '#9ca3af'));
  parts.push(box(W, 0.02, 1.2, 0, 0.01, FRONT.z + 0.8, '#1d6b2c'));
  // The fences down the aisles.
  for (const a of AISLES)
    for (let r = 0; r < ROWS; r++) {
      const { y, z } = rowAt(r);
      parts.push(box(0.04, 0.9, ROW.d, a + 0.52, y + 0.45, z - ROW.d / 2, '#9ca3af'));
    }
  const merged = mergeGeometries(parts, false)!;
  for (const p of parts) p.dispose();
  merged.computeVertexNormals();
  g.add(
    new THREE.Mesh(merged, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 })),
  );
  // Banners hung over the front wall.
  const banners: [string, string, string, number, boolean][] = [
    ['RUNWAY FC', HOME.shirt, HOME.alt, -6.2, false],
    ['★ ★ ★', HOME.alt, HOME.shirt, -1.6, true],
    ['RUNWAY', HOME.shirt, HOME.alt, 1.0, true],
    ['UP THE BLUES', AWAY.alt, AWAY.shirt, 5.6, false],
  ];
  for (const [text, bg, fg, x, stripes] of banners) {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(3.2, 0.6),
      new THREE.MeshStandardMaterial({
        map: bannerTexture(text, bg, fg, stripes),
        roughness: 0.85,
      }),
    );
    m.position.set(x, FRONT.y + 0.12, FRONT.z + 0.27);
    m.rotation.x = -0.08;
    g.add(m);
  }
  return g;
}

/** The flags in the crowd at this moment: up and waving at the end that's cheering. */
function flags(fans: Fan[], mood: Mood, frame: 0 | 1): THREE.Group {
  const g = new THREE.Group();
  fans.forEach((f, i) => {
    if (!f.flag) return;
    const up = mood !== 'calm' && f.away === (mood === 'away');
    const { y, z } = rowAt(f.r);
    const fl = flag(
      (f.away ? AWAY : HOME).flag,
      up ? 0.95 : 0.55,
      up ? (frame ? 1 : -1) * (0.6 + (i % 3) * 0.2) : 0.1 * ((i % 3) - 1),
    );
    fl.position.x += f.x + 0.2;
    fl.position.y += y;
    fl.position.z = z - ROW.d * 0.4;
    g.add(fl);
  });
  return g;
}

/** Floodlights from high behind the camera, the sky's blue from above, the pitch's green from below. */
function lights(scene: THREE.Scene) {
  scene.add(new THREE.HemisphereLight('#c7d7ff', '#2f6b35', 1.15));
  const key = new THREE.DirectionalLight('#fff8e8', 2.6);
  key.position.set(-8, 30, 40);
  const key2 = new THREE.DirectionalLight('#f1f5ff', 1.2);
  key2.position.set(14, 26, 36);
  scene.add(key, key2);
}

/** The fans' baked bodies: every look in every pose (kept between shootouts). */
async function bodies(city: string, cancelled?: () => boolean) {
  const specs: BakeSpec[] = [];
  for (let n = 0; n < LOOKS; n++)
    for (const p of POSES)
      specs.push({
        look: fanLook(n, city),
        pose: p.pose,
        t: p.t,
        ...(p.pose === 'sit' ? { seat: 0.45 } : {}),
      });
  return bakePeople(specs, { far: true, cancelled });
}

/**
 * The stand's pictures for this camera (null where WebGL can't draw or it
 * was cancelled). `scale`: device pixels per CSS pixel.
 */
export async function bakeStands(
  c: PitchCamera,
  { city, scale, cancelled }: { city: string; scale: number; cancelled?: () => boolean },
): Promise<StandFrames | null> {
  const geos = await bodies(city, cancelled);
  if (cancelled?.()) return null;
  const r = offscreenRenderer();
  if (!r) return null;
  const scene = new THREE.Scene();
  lights(scene);
  const ground = terraces(c);
  scene.add(ground);
  const cam = pitchCamera(c);
  const fans = seatFans(c);
  const W = Math.round(c.width * scale);
  const H = Math.round(c.height * scale);
  const shoot = (mood: Mood, frame: 0 | 1): HTMLCanvasElement => {
    const crowd = new Instanced(geos, placeFans(fans, mood, frame), { rough: 0.85 });
    const fl = flags(fans, mood, frame);
    scene.add(crowd.group, fl);
    r.setSize(W, H, false);
    r.toneMappingExposure = 1.0;
    r.setClearColor(0x000000, 0);
    r.clear();
    r.render(scene, cam);
    const cv = document.createElement('canvas');
    cv.width = W;
    cv.height = H;
    cv.getContext('2d')?.drawImage(r.domElement, 0, 0);
    crowd.dispose(true);
    fl.removeFromParent();
    disposeAll(fl);
    return cv;
  };
  try {
    return {
      scale,
      calm: shoot('calm', 0),
      home: [shoot('home', 0), shoot('home', 1)],
      away: [shoot('away', 0), shoot('away', 1)],
    };
  } catch {
    return null;
  } finally {
    disposeAll(ground);
  }
}

function disposeAll(o: THREE.Object3D) {
  o.traverse((x) => {
    const m = x as THREE.Mesh;
    if (!m.isMesh) return;
    m.geometry.dispose();
    const mt = m.material as THREE.MeshStandardMaterial;
    mt.map?.dispose();
    mt.dispose();
  });
}

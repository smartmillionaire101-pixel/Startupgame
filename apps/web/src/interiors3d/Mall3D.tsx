/**
 * The mall in 3D (lazy-loaded), to walk through: a two-level concourse
 * under a skylight, glass shopfronts with lit signs, escalators up to the
 * gallery, columns, planters and benches, shoppers walking with their bags
 * (and riding the escalators), the food court at the far end with people
 * eating, the cinema. Each shop has its own room behind its glass with what
 * it sells on rails, plinths and shelves (city/mall/layout.ts says where).
 *
 * You walk where you tap (a ring where you're going, a dotted path, round
 * whatever's in the way and only through doors), the camera following from
 * behind and above; Turn swings it round you, Look around puts it at your
 * eyes. On the home's stage machinery (./stage.ts): a stage kept between
 * opens (or the home's one, made ahead on the map), the mall built in idle
 * slices and nothing shown until a frame has all of it.
 */
import { useEffect, useRef, type MutableRefObject, type ReactElement, type RefObject } from 'react';
import * as THREE from 'three';
import type { MallShopId } from '@runway/engine';
import type { AvatarLook } from '../city/art';
import { hash, seeded } from '../city/contract';
import {
  COLUMN_Z,
  COUNTERS,
  COUNTER_Z,
  DEPTH,
  FIXED,
  FRONT_Z,
  HALF,
  LEVEL,
  PLANTER_Z,
  ROOM_SHOPS,
  SHOP_W,
  SPOT,
  START,
  TABLES,
  displays,
  findPath,
  pathLength,
  regionOf,
  shopToWorld,
  walkGrid,
  type Display,
  type RoomShop,
} from '../city/mall/layout';
import { makeCharacter, pose, type Character } from './character';
import { Kit, disposeTree, floorTexture, mat, paintingTexture, screenTexture } from './kit';
import { Stage, gestures, hasParkedStage, parkStage, unparkStage, type StageOpts } from './stage';

export interface MallStockItem {
  id: string;
  shop: MallShopId;
  topStyle?: string;
}

/** What a tap found: a shop's sign, an item's display, or a spot on the floor. */
export interface Mall3DHit {
  shop?: MallShopId;
  item?: string;
  floor?: { x: number; z: number };
}

export interface Mall3DApi {
  /** Walk to a point (round things, through doors); metres to go, or null if it can't be reached. */
  walkTo(to: { x: number; z: number }, then?: string): number | null;
  /** Stand somewhere at once (facing `heading`). */
  jump(to: { x: number; z: number }, heading?: number): void;
  /** Swing the camera a quarter round you (in Look around: turn your head). */
  turn(dir?: 1 | -1): void;
  /** Look around through your own eyes (true) or back to the camera behind you. */
  look(on: boolean): void;
  /** Turn to face a point (an item you tapped). */
  face(x: number, z: number): void;
  /** The view as a JPEG (null if it can't be read). */
  snapshot(): string | null;
  /** Where you are and which way the camera looks. */
  where(): { x: number; z: number; heading: number };
}

export interface Mall3DProps {
  me: AvatarLook;
  shoppers: AvatarLook[];
  names: Record<MallShopId, string>;
  mallName: string;
  stock: MallStockItem[];
  reduced: boolean;
  /** Pixels at the bottom a sheet covers: the picture moves up by half of it. */
  lift: number;
  api: MutableRefObject<Mall3DApi | null>;
  /** The HUD layer: its `[data-at="x y z"]` children are placed over those points each frame. */
  overlay: RefObject<HTMLElement | null>;
  onReady: () => void;
  /** No WebGL after all (the 2D mall takes over). */
  onFail: () => void;
  onTap: (hit: Mall3DHit, double: boolean) => void;
  onArrive: (at: { x: number; z: number }, then?: string) => void;
  /** Metres still to walk (null: not walking). */
  onWalk: (left: number | null) => void;
  /** Which way the camera looks, and from where (for the compass). */
  onHeading: (heading: number, at: { x: number; z: number }) => void;
}

const COLOUR: Record<MallShopId, string> = {
  fashion: '#db2777',
  phones: '#2563eb',
  home: '#a16207',
  supermarket: '#16a34a',
  foodcourt: '#ea580c',
  cinema: '#7c3aed',
};
const TOPS = [
  '#0f766e',
  '#2563eb',
  '#dc2626',
  '#f59e0b',
  '#7c3aed',
  '#db2777',
  '#16a34a',
  '#f97316',
  '#1e3a8a',
];
const WALK_SPEED = 2.3;

/** A sign: text on a wide board (canvas). */
function signTex(text: string, bg: string, fg = '#ffffff'): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 96;
  const g = c.getContext('2d')!;
  g.fillStyle = bg;
  g.fillRect(0, 0, 512, 96);
  g.fillStyle = fg;
  g.font = 'bold 50px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 256, 50, 480);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function signMesh(text: string, bg: string, w: number, h: number, fg?: string) {
  const tex = signTex(text, bg, fg);
  return new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshStandardMaterial({
      map: tex,
      emissive: new THREE.Color('#ffffff'),
      emissiveMap: tex,
      emissiveIntensity: 0.55,
      roughness: 0.4,
    }),
  );
}

/** The hall: floor, walls, roof and skylights, the gallery, escalators, columns, planters. */
function buildHall(mallName: string, names: Record<MallShopId, string>) {
  const root = new THREE.Group();
  const k = new Kit();
  const tex = floorTexture('marble').clone();
  tex.needsUpdate = true;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(12, 20);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(2 * (HALF + DEPTH) + 2, 56),
    new THREE.MeshStandardMaterial({
      map: tex,
      roughness: 0.22,
      metalness: 0.05,
      color: '#f2efe9',
    }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.z = -19.5;
  floor.receiveShadow = true;
  floor.userData.floor = true;
  root.add(floor);
  const W = HALF + DEPTH;
  k.box(0.4, 9.6, 56, '#ece7df', -W - 0.2, 0, -19.5);
  k.box(0.4, 9.6, 56, '#ece7df', W + 0.2, 0, -19.5);
  k.box(2 * W, 9.6, 0.4, '#ece7df', 0, 0, -46.5);
  // The entrance: glass doors in a glass wall, daylight beyond.
  k.box(2 * W, 9.6, 0.3, '#ece7df', 0, 4.4, FRONT_Z + 0.15);
  for (const x of [-W / 2 - 2, W / 2 + 2]) k.box(W - 4, 4.4, 0.3, '#ece7df', x, 0, FRONT_Z + 0.15);
  k.box(8, 4.4, 0.06, '#cfe8f5', 0, 0, FRONT_Z + 0.1, { opacity: 0.35, noShadow: true });
  k.box(8.6, 0.12, 0.2, '#94a3b8', 0, 4.3, FRONT_Z + 0.05, { metal: 0.7 });
  for (const x of [-4, -1.3, 1.3, 4])
    k.box(0.1, 4.3, 0.14, '#94a3b8', x, 0, FRONT_Z + 0.05, { metal: 0.7 });
  k.box(8, 4.4, 0.05, '#fff7df', 0, 0, FRONT_Z + 1.2, {
    emissive: '#fff4d6',
    emissiveIntensity: 1.0,
    noShadow: true,
  });
  k.box(2 * W, 0.4, 56, '#f8f6f2', 0, 9.5, -19.5, { noShadow: true });
  for (let z = 4; z > -44; z -= 4)
    k.box(7.6, 0.08, 3.4, '#ffffff', 0, 9.42, z, {
      emissive: '#fffbea',
      emissiveIntensity: 1.1,
      noShadow: true,
    });
  // The gallery: slabs along both sides at the first floor, a bridge over the hall.
  for (const s of [-1, 1]) {
    k.box(W - 4, 0.35, 52, '#f5f2ec', s * (4 + (W - 4) / 2), LEVEL - 0.35, -19);
    k.box(0.12, 0.42, 52, '#d6d0c4', s * 4, LEVEL - 0.42, -19);
    k.box(0.04, 1.0, 52, '#bfe3f2', s * 4.02, LEVEL, -19, { opacity: 0.35, noShadow: true });
    k.box(0.08, 0.06, 52, '#94a3b8', s * 4.02, LEVEL + 1.0, -19, { metal: 0.8, rough: 0.3 });
    for (const z of COLUMN_Z) k.cyl(0.32, 0.32, 9.4, '#f8fafc', s * 4.4, 0, z, { seg: 18 });
    // Wall between the shopfronts (and where there's no shop yet).
    const fronts = ROOM_SHOPS.filter((sh) => SPOT[sh].side === s).map((sh) => SPOT[sh].z);
    let top = FRONT_Z;
    for (const z of [...fronts.sort((a, b) => b - a), -37.3]) {
      const a = z + SHOP_W / 2;
      if (top - a > 0.05)
        k.box(0.25, LEVEL - 0.35, top - a, '#efe9e0', s * (HALF + 0.12), 0, (top + a) / 2);
      top = z - SHOP_W / 2;
    }
  }
  // A hoarding where the right side has no shop yet.
  const soon = signMesh('Opening soon', '#334155', 6, 0.8);
  soon.position.set(HALF - 0.06, 2.4, -28);
  soon.rotation.y = -Math.PI / 2;
  root.add(soon);
  k.box(8, 0.35, 3.2, '#f5f2ec', 0, LEVEL - 0.35, -22.6);
  k.box(8, 1.0, 0.04, '#bfe3f2', 0, LEVEL, -21, { opacity: 0.35, noShadow: true });
  // Escalators up to the bridge.
  const rise = LEVEL;
  const run = 8;
  const slope = Math.atan2(rise, run);
  for (const x of [-1.4, 1.4]) {
    const len = Math.hypot(rise, run);
    k.box(1.3, 0.5, len, '#475569', x, rise / 2 - 0.25, -13 - run / 2, {
      rx: slope,
      metal: 0.6,
      rough: 0.4,
    });
    for (const sx of [-0.7, 0.7]) {
      k.box(0.06, 0.95, len, '#bfe3f2', x + sx, rise / 2 + 0.25, -13 - run / 2, {
        rx: slope,
        opacity: 0.4,
        noShadow: true,
      });
      k.box(0.1, 0.08, len, '#111827', x + sx, rise / 2 + 1.15, -13 - run / 2, { rx: slope });
    }
    for (let i = 0; i < 18; i++) {
      const u = (i + 0.5) / 18;
      k.box(1.1, 0.04, 0.42, '#9ca3af', x, u * rise + 0.02, -13 - u * run, {
        metal: 0.7,
        rough: 0.35,
      });
    }
  }
  // Planters with trees, and benches.
  for (const z of PLANTER_Z)
    for (const x of [-3.1, 3.1]) {
      k.cyl(0.65, 0.7, 0.6, '#e7e2d8', x, 0, z, { seg: 18 });
      k.cyl(0.6, 0.6, 0.05, '#3f2d1d', x, 0.58, z, { seg: 18 });
      k.cyl(0.07, 0.1, 1.5, '#6b4a2f', x, 0.6, z);
      k.sphere(0.75, '#2f7d32', x, 2.3, z, { seg: 10 });
      k.box(0.55, 0.45, 1.8, '#8b5e3c', x, 0, z - 2.2, { round: 0.04 });
    }
  root.add(k.build());
  // The food court's sign on the bridge, the mall's name under it.
  const fc = signMesh(names.foodcourt, COLOUR.foodcourt, 7, 1.1);
  fc.position.set(0, LEVEL + 1.9, -22.6 + 1.62);
  fc.userData.shop = 'foodcourt';
  root.add(fc);
  const big = signMesh(mallName, '#0f172a', 8, 1.1, '#fde68a');
  big.position.set(0, LEVEL + 0.6, -21.0 + 0.04);
  root.add(big);
  return { root, picks: [fc] as THREE.Object3D[] };
}

/** One display: what's on it, in the shop's frame (s: its side of the hall). */
function buildDisplay(k: Kit, d: Display, s: number, it: MallStockItem | undefined, n: number) {
  const { x, z } = d;
  // Away from the glass (into the room) is +s on x.
  const ux = (du: number) => x + s * du;
  switch (d.kind) {
    case 'rail': {
      k.cyl(0.03, 0.03, 1.55, '#9ca3af', x, 0, z - 0.75, { metal: 0.8 });
      k.cyl(0.03, 0.03, 1.55, '#9ca3af', x, 0, z + 0.75, { metal: 0.8 });
      k.box(0.04, 0.04, 1.56, '#9ca3af', x, 1.52, z, { metal: 0.8 });
      const style = it?.topStyle ?? 'tee';
      const long = style === 'dress' || style === 'kaftan';
      const hgt = long ? 0.95 : 0.6;
      for (let i = 0; i < 3; i++) {
        const col = TOPS[(n * 2 + i) % TOPS.length]!;
        const gz = z - 0.48 + i * 0.48;
        k.box(0.12, hgt, 0.38, col, x, 1.48 - hgt, gz, { round: 0.03 });
        if (style !== 'dress')
          for (const sz of [-0.23, 0.23])
            k.box(0.1, long ? 0.6 : 0.42, 0.1, col, x, 1.48 - (long ? 0.62 : 0.44), gz + sz, {
              round: 0.03,
            });
        if (style === 'hoodie') k.sphere(0.12, col, ux(0.04), 1.42, gz, { seg: 8 });
        if (style === 'dress') k.box(0.16, 0.3, 0.5, col, x, 1.48 - hgt, gz, { round: 0.04 });
        if (style === 'blazer' || style === 'shirt')
          k.box(0.13, 0.18, 0.08, '#f8fafc', ux(-0.01), 1.3, gz, { noShadow: true });
      }
      break;
    }
    case 'plinth': {
      k.box(0.6, 0.95, 0.6, '#f8fafc', x, 0, z, { round: 0.04 });
      const id = it?.id ?? '';
      if (id === 'acc-cap') {
        k.sphere(0.13, '#2563eb', x, 1.0, z, { seg: 10, sy: 0.7 });
        k.box(0.16, 0.02, 0.22, '#1e3a8a', ux(-0.14), 0.97, z);
      } else if (id === 'acc-beanie') k.sphere(0.14, '#dc2626', x, 1.06, z, { seg: 10, sy: 0.9 });
      else if (id === 'acc-shades') {
        k.box(0.04, 0.05, 0.3, '#111827', x, 1.1, z);
        k.box(0.2, 0.18, 0.03, '#94a3b8', x, 0.95, z);
      } else {
        // A phone on a stand, bigger and brighter as it gets better.
        const tier = Number(id.split('-')[1] ?? 1) || 1;
        const h = 0.16 + tier * 0.03;
        k.box(0.08, 0.06, 0.16, '#475569', x, 0.95, z);
        k.box(0.03, h, 0.09 + tier * 0.01, '#0f172a', ux(-0.01), 1.0, z, { rz: s * 0.25 });
        k.box(0.005, h - 0.02, 0.08 + tier * 0.01, '#38bdf8', ux(-0.03), 1.01, z, {
          emissive: ['#38bdf8', '#a78bfa', '#fbbf24'][tier - 1] ?? '#38bdf8',
          emissiveIntensity: 0.9,
          noShadow: true,
          rz: s * 0.25,
        });
      }
      break;
    }
    case 'table': {
      k.box(0.9, 0.06, 1.2, '#f8fafc', x, 0.72, z, { round: 0.02 });
      k.cyl(0.05, 0.05, 0.72, '#64748b', x, 0, z);
      k.box(0.3, 0.02, 0.42, '#334155', x, 0.78, z);
      k.box(0.02, 0.28, 0.42, '#0f172a', ux(0.15), 0.8, z, { rz: -s * 0.2 });
      k.box(0.005, 0.24, 0.38, '#60a5fa', ux(0.135), 0.82, z, {
        emissive: '#60a5fa',
        emissiveIntensity: 0.8,
        noShadow: true,
        rz: -s * 0.2,
      });
      break;
    }
    case 'tv': {
      k.box(0.3, 0.6, 1.3, '#1e293b', x, 0, z);
      const tv = new THREE.Mesh(
        new THREE.PlaneGeometry(1.4, 0.8),
        new THREE.MeshStandardMaterial({
          map: screenTexture('film'),
          emissive: new THREE.Color('#ffffff'),
          emissiveMap: screenTexture('film'),
          emissiveIntensity: 0.8,
        }),
      );
      tv.position.set(ux(-0.05), 1.15, z);
      tv.rotation.y = s > 0 ? -Math.PI / 2 : Math.PI / 2;
      k.keep(tv);
      break;
    }
    case 'speaker':
      for (const dz of [-0.18, 0.18]) {
        k.box(0.3, 0.95, 0.28, '#111827', x, 0, z + dz, { round: 0.03 });
        k.cyl(0.08, 0.08, 0.02, '#475569', ux(-0.15), 0.6, z + dz, { rz: Math.PI / 2 });
      }
      break;
    case 'lamp':
      k.cyl(0.18, 0.2, 0.04, '#111827', x, 0, z);
      k.cyl(0.02, 0.02, 1.5, '#111827', x, 0, z);
      k.cyl(0.18, 0.24, 0.3, '#fef3c7', x, 1.45, z, {
        emissive: '#fde68a',
        emissiveIntensity: 0.7,
      });
      break;
    case 'plant':
      k.cyl(0.3, 0.24, 0.5, '#e7e2d8', x, 0, z);
      k.sphere(0.45, '#2f7d32', x, 0.95, z, { seg: 10 });
      break;
    case 'rug':
      k.box(1.6, 0.012, 2.2, '#b45309', x, 0.004, z, { noShadow: true });
      k.box(1.3, 0.014, 1.9, '#f59e0b', x, 0.005, z, { noShadow: true });
      break;
    case 'sofa':
      k.box(0.9, 0.45, 1.9, '#64748b', x, 0, z, { round: 0.08 });
      k.box(0.25, 0.55, 1.9, '#64748b', ux(0.38), 0.4, z, { round: 0.06 });
      for (const dz of [-0.95, 0.95])
        k.box(0.9, 0.6, 0.22, '#5b6577', x, 0, z + dz, { round: 0.06 });
      break;
    case 'bed':
      k.box(2.0, 0.4, 1.5, '#f8fafc', x, 0, z, { round: 0.05 });
      k.box(1.9, 0.12, 1.4, '#93c5fd', x, 0.4, z, { round: 0.04 });
      k.box(0.12, 1.0, 1.6, '#78350f', ux(1.0), 0, z);
      for (const dz of [-0.35, 0.35])
        k.box(0.3, 0.12, 0.5, '#ffffff', ux(0.75), 0.52, z + dz, { round: 0.04 });
      break;
    case 'art': {
      k.box(0.06, 1.1, 1.5, '#78350f', x, 1.0, z);
      const p = new THREE.Mesh(
        new THREE.PlaneGeometry(1.36, 0.96),
        mat('#ffffff', { map: paintingTexture(7) }),
      );
      p.position.set(ux(-0.04), 1.55, z);
      p.rotation.y = s > 0 ? -Math.PI / 2 : Math.PI / 2;
      k.keep(p);
      break;
    }
    case 'basket':
      k.box(0.7, 0.7, 0.7, '#e5e7eb', x, 0, z);
      k.box(0.6, 0.3, 0.6, '#dc2626', x, 0.7, z, { opacity: 0.9 });
      for (let i = 0; i < 4; i++)
        k.box(
          0.14,
          0.22,
          0.14,
          TOPS[i + 1]!,
          x - 0.15 + (i % 2) * 0.3,
          0.86,
          z - 0.15 + Math.floor(i / 2) * 0.3,
        );
      break;
    case 'trolley':
      k.box(0.7, 0.04, 1.0, '#94a3b8', x, 0.25, z, { metal: 0.7 });
      k.box(0.7, 0.5, 0.04, '#94a3b8', x, 0.3, z - 0.5, { metal: 0.7, opacity: 0.6 });
      k.box(0.7, 0.5, 0.04, '#94a3b8', x, 0.3, z + 0.5, { metal: 0.7, opacity: 0.6 });
      for (let i = 0; i < 6; i++)
        k.box(
          0.18,
          0.3,
          0.2,
          TOPS[i]!,
          x - 0.2 + (i % 2) * 0.4,
          0.3,
          z - 0.35 + Math.floor(i / 2) * 0.35,
        );
      for (const dz of [-0.4, 0.4])
        k.cyl(0.06, 0.06, 0.04, '#111827', x, 0.02, z + dz, { rx: Math.PI / 2 });
      break;
    case 'fridge':
      k.box(0.7, 2.0, 1.4, '#e2e8f0', x, 0, z);
      k.box(0.04, 1.8, 1.3, '#bfe3f2', ux(-0.36), 0.1, z, {
        opacity: 0.45,
        emissive: '#e0f2fe',
        emissiveIntensity: 0.3,
        noShadow: true,
      });
      for (let r = 0; r < 3; r++)
        for (let i = 0; i < 5; i++)
          k.cyl(
            0.05,
            0.05,
            0.24,
            TOPS[(i + r) % TOPS.length]!,
            ux(-0.15),
            0.25 + r * 0.55,
            z - 0.5 + i * 0.25,
            { noShadow: true },
          );
      break;
    case 'desk':
      k.box(0.8, 1.05, 1.8, '#7c3aed', x, 0, z, { round: 0.04 });
      k.box(0.82, 0.06, 1.84, '#fde68a', x, 1.05, z);
      break;
    case 'booth':
      k.box(0.9, 1.05, 1.8, '#4c1d95', x, 0, z, { round: 0.04 });
      k.box(0.92, 0.06, 1.84, '#fbbf24', x, 1.05, z, { metal: 0.6, rough: 0.3 });
      k.cyl(0.03, 0.03, 0.9, '#fbbf24', ux(-0.6), 0, z - 0.8, { metal: 0.8 });
      k.cyl(0.03, 0.03, 0.9, '#fbbf24', ux(-0.6), 0, z + 0.8, { metal: 0.8 });
      k.box(0.04, 0.06, 1.6, '#b91c1c', ux(-0.6), 0.8, z);
      break;
  }
}

/** The shops' rooms: walls, glass fronts, signs and their stock on display. */
function buildRooms(names: Record<MallShopId, string>, stock: MallStockItem[], ds: Display[]) {
  const root = new THREE.Group();
  const k = new Kit();
  const picks: THREE.Object3D[] = [];
  const fronts = new Map<RoomShop, THREE.Object3D>();
  const pickGeo = new THREE.BoxGeometry(1, 1, 1);
  // What a tap finds but nobody sees.
  const pickMat = new THREE.MeshBasicMaterial({ visible: false });
  const byId = new Map(stock.map((s) => [s.id, s]));
  for (const shop of ROOM_SHOPS) {
    const { side: s, z: z0 } = SPOT[shop];
    const col = COLOUR[shop];
    // Shop frame: u is depth in from the glass, v along the hall.
    const box = (
      w: number,
      h: number,
      d: number,
      c: string,
      u: number,
      y: number,
      v: number,
      o = {},
    ) => k.box(d, h, w, c, s * (HALF + u), y, z0 + v, o);
    box(0.2, 4.4, DEPTH, '#f1ede6', DEPTH / 2, 0, -SHOP_W / 2);
    box(0.2, 4.4, DEPTH, '#f1ede6', DEPTH / 2, 0, SHOP_W / 2);
    box(SHOP_W, 4.4, 0.2, shop === 'cinema' ? '#1e1b4b' : '#faf7f2', DEPTH, 0, 0);
    box(SHOP_W, 0.2, DEPTH, '#ffffff', DEPTH / 2, 4.3, 0, { noShadow: true });
    box(SHOP_W - 2, 0.05, DEPTH - 2, '#ffffff', DEPTH / 2, 4.25, 0, {
      emissive: '#fff7e6',
      emissiveIntensity: 0.9,
      noShadow: true,
    });
    // The shopfront (glass, mullions, fascia and sign) is its own: it's
    // cut away while you're inside, so the camera can look in from the hall.
    const fk = new Kit();
    const fbox = (
      w: number,
      h: number,
      d: number,
      c: string,
      u: number,
      y: number,
      v: number,
      o = {},
    ) => fk.box(d, h, w, c, s * (HALF + u), y, z0 + v, o);
    for (const v of [-3.05, 3.05])
      fbox(3.1, 3.3, 0.05, '#cfe8f5', 0, 0, v, { opacity: 0.28, rough: 0.05, noShadow: true });
    for (const v of [-4.5, -1.5, 1.5, 4.5])
      fbox(0.1, 3.3, 0.12, '#94a3b8', 0, 0, v, { metal: 0.7 });
    fbox(SHOP_W, 1.1, 0.25, col, 0, 3.3, 0);
    const front = fk.build();
    front.userData.front = shop;
    root.add(front);
    fronts.set(shop, front);
    // A mat at the door.
    box(2.0, 0.01, 0.9, col, 0.6, 0.003, 0, { noShadow: true, opacity: 0.35 });
    // What's fixed: mannequins' plinths, tills, posters.
    if (shop === 'fashion')
      box(1.4, 1.9, 0.04, '#e2e8f0', 6.9, 0.5, -3, { metal: 0.9, rough: 0.05 });
    if (shop === 'supermarket') {
      box(1.0, 0.9, 0.7, '#334155', 1.3, 0, -3.4);
      for (const v of [-4.25, 4.25]) {
        box(4.5, 1.8, 0.4, '#e5e7eb', 4.0, 0, v);
        for (let r = 0; r < 3; r++)
          for (let i = 0; i < 10; i++)
            box(
              0.3,
              0.3,
              0.16,
              TOPS[(i + r * 3) % TOPS.length]!,
              2.0 + i * 0.42,
              0.15 + r * 0.55,
              v - Math.sign(v) * 0.24,
              { noShadow: true },
            );
      }
    }
    if (shop === 'phones') {
      box(1.0, 1.0, 0.7, '#1e293b', 1.2, 0, -3.5);
      for (let i = 0; i < 3; i++) {
        const tv = new THREE.Mesh(
          new THREE.PlaneGeometry(1.35, 0.8),
          new THREE.MeshStandardMaterial({
            map: screenTexture(i % 2 ? 'game' : 'film'),
            emissive: new THREE.Color('#ffffff'),
            emissiveMap: screenTexture(i % 2 ? 'game' : 'film'),
            emissiveIntensity: 0.8,
          }),
        );
        tv.position.set(s * (HALF + 1.5 + i * 1.8), 2.6, z0 - SHOP_W / 2 + 0.12);
        root.add(tv);
      }
    }
    if (shop === 'cinema') {
      for (const v of [-3, 3]) {
        const p = new THREE.Mesh(
          new THREE.PlaneGeometry(1.4, 2.0),
          new THREE.MeshStandardMaterial({
            map: screenTexture('film'),
            emissive: new THREE.Color('#ffffff'),
            emissiveMap: screenTexture('film'),
            emissiveIntensity: 0.9,
          }),
        );
        p.position.set(s * (HALF + DEPTH - 0.12), 1.8, z0 + v);
        p.rotation.y = s > 0 ? -Math.PI / 2 : Math.PI / 2;
        root.add(p);
      }
      // The popcorn stand by the window, and the doors to the screens.
      box(0.8, 1.6, 0.7, '#dc2626', 1.2, 0, 3.4);
      box(0.7, 0.5, 0.6, '#fde68a', 1.2, 1.6, 3.4, {
        opacity: 0.85,
        emissive: '#fde047',
        emissiveIntensity: 0.4,
      });
      box(1.6, 2.4, 0.08, '#111827', DEPTH - 0.06, 0, 0);
    }
    // The sign, facing the hall.
    const sign = signMesh(names[shop], col, SHOP_W - 1, 0.95);
    sign.position.set(s * (HALF - 0.14), 3.85, z0);
    sign.rotation.y = s > 0 ? -Math.PI / 2 : Math.PI / 2;
    sign.userData.shop = shop;
    front.add(sign);
    picks.push(sign);
  }
  ds.forEach((d, n) => {
    if (d.shop === 'foodcourt') return;
    const s = SPOT[d.shop as RoomShop].side;
    buildDisplay(k, d, s, byId.get(d.id), n);
    // What a tap finds: an unseen box round it.
    const p = new THREE.Mesh(pickGeo, pickMat);
    p.scale.set(Math.max(0.6, d.hx * 2 + 0.2), d.tagY + 0.2, Math.max(0.6, d.hz * 2 + 0.2));
    p.position.set(d.x, (d.tagY + 0.2) / 2, d.z);
    p.userData.item = d.id;
    root.add(p);
    picks.push(p);
  });
  // Upstairs shopfronts (more of the mall), signed.
  const upper = ['Sports', 'Books', 'Beauty', 'Kids', 'Jewellery', 'Toys'];
  const ucol = ['#0ea5e9', '#a16207', '#ec4899', '#f59e0b', '#64748b', '#22c55e'];
  upper.forEach((name, i) => {
    const s = i % 2 ? 1 : -1;
    const z = -4 - Math.floor(i / 2) * 12;
    k.box(0.06, 3.0, 7.5, '#cfe8f5', s * HALF, LEVEL, z, { opacity: 0.3, noShadow: true });
    k.box(0.3, 0.8, 8, ucol[i]!, s * HALF, LEVEL + 3.0, z);
    const sg = signMesh(name, ucol[i]!, 6, 0.7);
    sg.position.set(s * (HALF - 0.17), LEVEL + 3.4, z);
    sg.rotation.y = s > 0 ? -Math.PI / 2 : Math.PI / 2;
    root.add(sg);
    for (let j = 0; j < 4; j++)
      k.box(
        0.4,
        1.2,
        0.6,
        ['#f87171', '#60a5fa', '#fbbf24', '#34d399'][j]!,
        s * (HALF + 1.2),
        LEVEL,
        z - 2.4 + j * 1.6,
      );
  });
  root.add(k.build());
  return { root, picks, fronts };
}

/** The food court: counters with signs (one per dish), tables and chairs. */
function buildCourt(mallName: string, ds: Display[]) {
  const root = new THREE.Group();
  const k = new Kit();
  const picks: THREE.Object3D[] = [];
  const r = seeded(hash(`mall:${mallName}`));
  for (const c of COUNTERS) {
    k.box(5.6, 1.1, 1.2, '#f8fafc', c.x, 0, COUNTER_Z - 0.6, { round: 0.05 });
    k.box(5.8, 3.4, 0.3, c.colour, c.x, 0, -46.1);
    const sg = signMesh(c.name, c.colour, 5, 0.8);
    sg.position.set(c.x, 3.0, -45.9);
    root.add(sg);
    const d = ds.find((x) => x.shop === 'foodcourt' && x.x === c.x);
    if (d) {
      for (const p of [sg]) {
        p.userData.item = d.id;
        picks.push(p);
      }
      const hit = new THREE.Mesh(
        new THREE.BoxGeometry(5.6, 2.4, 1.6),
        new THREE.MeshBasicMaterial({ visible: false }),
      );
      hit.position.set(c.x, 1.2, COUNTER_Z - 0.6);
      hit.userData.item = d.id;
      root.add(hit);
      picks.push(hit);
    }
  }
  const diners: { at: THREE.Vector3; face: number }[] = [];
  for (const t of TABLES) {
    k.cyl(0.6, 0.6, 0.05, '#f8fafc', t.x, 0.74, t.z, { seg: 20 });
    k.cyl(0.06, 0.06, 0.74, '#64748b', t.x, 0, t.z);
    for (const dz of [-0.9, 0.9])
      k.box(0.45, 0.45, 0.45, '#f97316', t.x, 0, t.z + dz, { round: 0.05 });
    if (r() < 0.75) diners.push({ at: new THREE.Vector3(t.x, 0, t.z + 0.9), face: Math.PI });
    if (r() < 0.5) diners.push({ at: new THREE.Vector3(t.x, 0, t.z - 0.9), face: 0 });
  }
  root.add(k.build());
  return { root, picks, diners };
}

const phone = () =>
  typeof window !== 'undefined' && Math.min(window.innerWidth, window.innerHeight) < 600;
const stageOpts = (): StageOpts => ({
  target: new THREE.Vector3(0, 0, -17),
  span: 20,
  azimuth: 0,
  elevation: 0.5,
  background: '#f3efe8',
  shadowSize: 14,
  maxFps: phone() ? 40 : 60,
});

export default function Mall3D(props: Mall3DProps): ReactElement | null {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const live = useRef(props);
  useEffect(() => {
    live.current = props;
  });
  const lookKey = JSON.stringify(props.me);
  const setMe = useRef<((look: AvatarLook) => void) | null>(null);
  useEffect(() => {
    setMe.current?.(live.current.me);
  }, [lookKey]);
  const refit = useRef<(() => void) | null>(null);
  useEffect(() => {
    refit.current?.();
  }, [props.lift]);

  useEffect(() => {
    const anchor = anchorRef.current!;
    const parent = anchor.parentElement!;
    let stage: Stage;
    try {
      // The mall's stage from last time, or the home's (made ahead on the map):
      // a WebGL context and its shaders ready.
      stage =
        unparkStage('mall', stageOpts()) ??
        unparkStage('home', stageOpts()) ??
        new Stage(document.createElement('canvas'), stageOpts());
    } catch {
      live.current.onFail();
      return;
    }
    const canvas = stage.canvas;
    canvas.className = 'mall-3d';
    canvas.setAttribute('aria-hidden', 'true');
    canvas.setAttribute('data-mall-3d', '');
    parent.insertBefore(canvas, anchor);
    const eye = new THREE.PerspectiveCamera(60, 1, 0.1, 140);
    stage.eye = eye;
    const scene = stage.scene;
    scene.fog = new THREE.Fog('#f3efe8', 34, 80);
    stage.hemi.color.set('#ffffff');
    stage.hemi.groundColor.set('#c9bfae');
    stage.hemi.intensity = 1.6;
    stage.ambient.intensity = 0.35;
    stage.sun.color.set('#fff6e8');
    stage.sun.intensity = 1.4;
    const sc = stage.sun.shadow.camera;
    sc.far = 60;
    sc.updateProjectionMatrix();
    const r0 = parent.getBoundingClientRect();
    stage.setSize(r0.width, r0.height);
    const ro = new ResizeObserver(() => {
      const b = parent.getBoundingClientRect();
      stage.setSize(b.width, b.height);
      fitLens();
    });
    ro.observe(parent);
    // A tall phone sees little across at an ordinary lens: open it up a bit.
    const fitLens = () => {
      const a = stage.w / stage.h;
      eye.fov = a < 0.8 ? 68 : 56;
      const lift = Math.round(live.current.lift / 2);
      if (lift > 0) eye.setViewOffset(stage.w, stage.h, 0, lift, stage.w, stage.h);
      else eye.clearViewOffset();
      stage.eyeMoved();
    };
    refit.current = fitLens;

    const P = live.current;
    const ds = displays(P.stock);
    const grid = walkGrid(ds);
    const world = new THREE.Group();
    scene.add(world);
    const picks: THREE.Object3D[] = [];
    const fronts = new Map<RoomShop, THREE.Object3D>();
    let cut: RoomShop | null = null;
    /** The shop you're in has its front cut away. */
    const cutFront = () => {
      const w = regionOf(pos.x, pos.z);
      const want = w !== 'concourse' && w !== 'foodcourt' ? w : null;
      if (want === cut) return;
      if (cut) fronts.get(cut)!.visible = true;
      cut = want;
      if (cut) fronts.get(cut)!.visible = false;
    };
    const chars: Character[] = [];
    type Walker = { c: Character; x: number; z0: number; z1: number; speed: number; phase: number };
    const walkers: Walker[] = [];
    const riders: { c: Character; x: number; phase: number }[] = [];
    const eaters: Character[] = [];
    const browsers: Character[] = [];
    const bagG = new THREE.BoxGeometry(0.28, 0.32, 0.1);
    const bagCols = ['#db2777', '#2563eb', '#16a34a', '#f59e0b', '#7c3aed', '#ffffff'];

    // ---- You.
    const pos = { x: START.x, z: START.z };
    let heading = START.heading;
    let camYaw = START.heading;
    let camDist = 5.4;
    let looking = false;
    let lookYaw = 0;
    let lookPitch = 0;
    let me: Character | null = null;
    const makeMe = (look: AvatarLook) => {
      if (me) {
        world.remove(me.root);
        disposeTree(me.root);
      }
      me = makeCharacter(look, 'me');
      const bag = new THREE.Mesh(bagG, mat('#db2777'));
      bag.position.set(0, -0.2, 0);
      bag.castShadow = true;
      me.handR.add(bag);
      me.root.position.set(pos.x, 0, pos.z);
      me.root.rotation.y = heading;
      me.root.visible = !looking;
      pose(me, 'idle', 0);
      world.add(me.root);
      stage.invalidate();
    };
    setMe.current = makeMe;

    // ---- Where you're going: a ring, and dots along the way.
    const ring = new THREE.Group();
    const ringMat = new THREE.MeshBasicMaterial({
      color: '#0f766e',
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const ringMat2 = new THREE.MeshBasicMaterial({
      color: '#0f766e',
      transparent: true,
      opacity: 0.45,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const r1 = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.56, 40), ringMat);
    const r2 = new THREE.Mesh(new THREE.RingGeometry(0.75, 0.82, 40), ringMat2);
    const dot = new THREE.Mesh(
      new THREE.CircleGeometry(0.16, 20),
      new THREE.MeshBasicMaterial({ color: '#ffffff' }),
    );
    for (const m of [r1, r2, dot]) {
      m.rotation.x = -Math.PI / 2;
      m.position.y = 0.02;
      ring.add(m);
    }
    ring.visible = false;
    scene.add(ring);
    const MAX_DOTS = 64;
    const dots = new THREE.InstancedMesh(
      new THREE.CircleGeometry(0.07, 12).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({
        color: '#0f766e',
        transparent: true,
        opacity: 0.8,
        depthWrite: false,
      }),
      MAX_DOTS,
    );
    dots.count = 0;
    dots.frustumCulled = false;
    scene.add(dots);
    const dm = new THREE.Matrix4();
    const layDots = (path: { x: number; z: number }[]) => {
      let n = 0;
      let p = { x: pos.x, z: pos.z };
      let carry = 0.7;
      for (const q of path) {
        const len = Math.hypot(q.x - p.x, q.z - p.z);
        for (let d = carry; d < len - 0.5 && n < MAX_DOTS; d += 0.55) {
          dm.makeTranslation(p.x + ((q.x - p.x) * d) / len, 0.018, p.z + ((q.z - p.z) * d) / len);
          dots.setMatrixAt(n++, dm);
        }
        carry = 0.2;
        p = q;
      }
      dots.count = n;
      dots.instanceMatrix.needsUpdate = true;
    };

    // ---- Walking.
    let walk: {
      path: { x: number; z: number }[];
      then?: string;
      left: number;
      told: number;
    } | null = null;
    const arrive = () => {
      const w = walk;
      walk = null;
      ring.visible = false;
      dots.count = 0;
      live.current.onWalk(null);
      if (me) pose(me, 'idle', 0);
      live.current.onArrive({ x: pos.x, z: pos.z }, w?.then);
      stage.invalidate();
    };
    const place = (x: number, z: number) => {
      pos.x = x;
      pos.z = z;
      me?.root.position.set(x, 0, z);
    };
    // The camera faces into a shop when you go in (and back out to the hall).
    const settle = () => {
      const w = regionOf(pos.x, pos.z);
      if (w !== 'concourse' && w !== 'foodcourt') {
        const s = SPOT[w].side;
        camYaw = s > 0 ? Math.PI / 2 : -Math.PI / 2;
        heading = camYaw;
      }
    };

    // ---- Lights and camera follow you.
    const camPos = new THREE.Vector3();
    const camAt = new THREE.Vector3();
    let camInit = false;
    let lastHeadingSent = NaN;
    const want = new THREE.Vector3();
    const wantAt = new THREE.Vector3();
    const inRoom = () => {
      const w = regionOf(pos.x, pos.z);
      return w !== 'concourse' && w !== 'foodcourt';
    };
    const clampEye = (v: THREE.Vector3) => {
      const w = regionOf(pos.x, pos.z);
      if (w !== 'concourse' && w !== 'foodcourt') {
        const { side: s, z: z0 } = SPOT[w];
        // In a shop (its front cut away) the camera may stand back in the
        // hall, looking in over your shoulder; in the room it stays under the ceiling.
        const u = Math.max(-2.8, Math.min(DEPTH - 0.3, s * v.x - HALF));
        v.x = s * (HALF + u);
        v.z = Math.max(z0 - SHOP_W / 2 + 0.3, Math.min(z0 + SHOP_W / 2 - 0.3, v.z));
        v.y = Math.min(v.y, u > 0.1 ? 3.7 : 4.0);
      } else {
        const wide = v.z < -33.2;
        const lim = wide ? HALF + DEPTH - 0.4 : HALF - 0.3;
        v.x = Math.max(-lim, Math.min(lim, v.x));
        v.z = Math.max(COUNTER_Z + 0.3, Math.min(FRONT_Z - 0.4, v.z));
        if (Math.abs(v.x) > 3.8) v.y = Math.min(v.y, 4.0);
      }
    };
    const aim = (snap: boolean, dt: number) => {
      if (looking) {
        want.set(pos.x, 1.62, pos.z);
        const cp = Math.cos(lookPitch);
        wantAt.set(
          pos.x + Math.sin(lookYaw) * cp * 4,
          1.62 + Math.sin(lookPitch) * 4,
          pos.z + Math.cos(lookYaw) * cp * 4,
        );
      } else {
        // Behind and above you, looking past you down the way you face.
        const d = camDist;
        const ahead = inRoom() ? 3 : 5;
        want.set(pos.x - Math.sin(camYaw) * d, 1.5 + d * 0.32, pos.z - Math.cos(camYaw) * d);
        clampEye(want);
        wantAt.set(pos.x + Math.sin(camYaw) * ahead, 1.15, pos.z + Math.cos(camYaw) * ahead);
      }
      if (snap || !camInit || live.current.reduced) {
        camPos.copy(want);
        camAt.copy(wantAt);
        camInit = true;
      } else {
        const e = 1 - Math.exp(-dt * (looking ? 14 : 5));
        camPos.lerp(want, e);
        camAt.lerp(wantAt, e);
      }
      cutFront();
      eye.position.copy(camPos);
      eye.lookAt(camAt);
      eye.updateMatrixWorld();
      // The sun's shadows cover where you are.
      stage.sun.position.set(pos.x - 6, 20, pos.z + 6);
      stage.sun.target.position.set(pos.x, 0, pos.z - 4);
      stage.sun.target.updateMatrixWorld();
      // The compass (Look around) follows your head.
      if (looking && !(Math.abs(lookYaw - lastHeadingSent) < 0.04)) {
        lastHeadingSent = lookYaw;
        live.current.onHeading(lookYaw, { x: pos.x, z: pos.z });
      }
      return camPos.distanceToSquared(want) > 1e-4 || camAt.distanceToSquared(wantAt) > 1e-4;
    };

    // ---- The HUD's tags follow what they're over.
    const tmpV = new THREE.Vector3();
    const placeTags = () => {
      const layer = live.current.overlay.current;
      if (!layer) return;
      const els = layer.querySelectorAll<HTMLElement>('[data-at]');
      const inv = eye.matrixWorldInverse;
      const shown: { el: HTMLElement; x: number; y: number; d: number; w: number; h: number }[] =
        [];
      for (const el of els) {
        const at = el.dataset.at!;
        let x: number;
        let y: number;
        let z: number;
        if (at === 'me') {
          x = pos.x;
          y = 2.15;
          z = pos.z;
        } else [x, y, z] = at.split(' ').map(Number) as [number, number, number];
        tmpV.set(x, y, z).applyMatrix4(inv);
        const far = Number(el.dataset.far ?? 30);
        const d = -tmpV.z;
        if (d < 0.4 || d > far || (at === 'me' && looking)) {
          el.style.visibility = 'hidden';
          continue;
        }
        tmpV.set(x, y, z).project(eye);
        const sx = ((tmpV.x + 1) / 2) * stage.w;
        const sy = ((1 - tmpV.y) / 2) * stage.h;
        if (sx < -40 || sx > stage.w + 40 || sy < 0 || sy > stage.h) {
          el.style.visibility = 'hidden';
          continue;
        }
        shown.push({
          el,
          x: sx,
          y: sy,
          d: at === 'me' ? 0 : d,
          w: el.offsetWidth,
          h: el.offsetHeight,
        });
      }
      // The HUD's own buttons and sheets: tags keep off them.
      const box = layer.getBoundingClientRect();
      const keep = [
        ...(layer.parentElement?.querySelectorAll<HTMLElement>('[data-keepout]') ?? []),
      ].map((k) => {
        const r = k.getBoundingClientRect();
        return {
          l: r.left - box.left,
          t: r.top - box.top,
          r: r.right - box.left,
          b: r.bottom - box.top,
        };
      });
      // Nearer tags first; ones that would cover another move up a little.
      shown.sort((a, b) => a.d - b.d);
      const put: { l: number; t: number; r: number; b: number }[] = [];
      for (const s of shown) {
        const l = Math.max(4, Math.min(stage.w - s.w - 4, s.x - s.w / 2));
        const hits = (top: number) => (p: { l: number; t: number; r: number; b: number }) =>
          l < p.r && l + s.w > p.l && top < p.b && top + s.h > p.t;
        // Where it belongs, or a step up or down from there if another tag is in the way.
        let top = s.y - s.h;
        for (const k of [0, -1, 1, -2, 2]) {
          const t = s.y - s.h + k * (s.h + 3);
          if (!put.some(hits(t))) {
            top = t;
            break;
          }
        }
        const over = put.some(hits(top)) || keep.some(hits(top));
        if (!over) put.push({ l, t: top, r: l + s.w, b: top + s.h });
        s.el.style.visibility = top < 0 || over ? 'hidden' : 'visible';
        s.el.style.transform = `translate(${Math.round(l)}px, ${Math.round(top)}px)`;
      }
    };

    let readySent = false;
    stage.onFrame = () => {
      placeTags();
      if (!readySent && built) {
        readySent = true;
        canvas.dataset.ready = '1';
        live.current.onReady();
      }
    };

    // ---- Building, a slice at a time (the page keeps answering); nothing drawn until all's in.
    let built = false;
    let gone = false;
    let idle = 0;
    let timer = 0;
    const later = (f: () => void) => {
      const go = () => {
        idle = 0;
        if (!gone) f();
      };
      if (typeof requestIdleCallback === 'function')
        idle = requestIdleCallback(go, { timeout: 200 });
      else timer = window.setTimeout(go, 30);
    };
    stage.hold();
    const slices: (() => void)[] = [
      () => {
        const h = buildHall(P.mallName, P.names);
        world.add(h.root);
        picks.push(...h.picks);
      },
      () => {
        const rm = buildRooms(P.names, P.stock, ds);
        world.add(rm.root);
        picks.push(...rm.picks);
        for (const [k2, v2] of rm.fronts) fronts.set(k2, v2);
      },
      () => {
        const ct = buildCourt(P.mallName, ds);
        world.add(ct.root);
        picks.push(...ct.picks);
        const looks = live.current.shoppers;
        const few = stage.soft ? 0.5 : 1;
        // Mannequins in the fashion shop's windows.
        for (const m of FIXED.slice(0, 2)) {
          const c = makeCharacter(
            {
              skin: '#e5e7eb',
              hair: '#e5e7eb',
              hairStyle: 'bald',
              top: m.z > SPOT.fashion.z ? '#1e3a8a' : '#db2777',
              bottom: '#f8fafc',
              accessory: 'none',
              topStyle: m.z > SPOT.fashion.z ? 'blazer' : 'dress',
              gender: m.z > SPOT.fashion.z ? 'male' : 'female',
            },
            'mannequin',
          );
          c.root.position.set(m.x, 0, m.z);
          c.root.rotation.y = Math.PI / 2;
          pose(c, 'stand', 0);
          world.add(c.root);
          chars.push(c);
        }
        // Shoppers walking up and down by the shopfronts and between the planters.
        const lanes = [
          { x: -5.8, z0: 5, z1: -31 },
          { x: 6.6, z0: 5, z1: -31 },
          { x: -1.0, z0: 5, z1: -11.5 },
          { x: 5.6, z0: 4, z1: -30 },
          { x: -6.7, z0: 3, z1: -31 },
          { x: 1.2, z0: -22.5, z1: -31.5 },
        ];
        const nw = Math.round(lanes.length * few);
        looks.slice(0, nw).forEach((look, i) => {
          const c = makeCharacter(look, `shopper:${i}`);
          const bag = new THREE.Mesh(bagG, mat(bagCols[i % bagCols.length]!));
          bag.position.set(0, -0.2, 0);
          c.handR.add(bag);
          world.add(c.root);
          chars.push(c);
          walkers.push({ c, ...lanes[i]!, speed: 0.9 + (i % 3) * 0.15, phase: i * 9.1 });
        });
        looks.slice(8, 8 + Math.round(2 * few)).forEach((look, i) => {
          const c = makeCharacter(look, `rider:${i}`);
          world.add(c.root);
          chars.push(c);
          riders.push({ c, x: i % 2 ? 1.4 : -1.4, phase: i * 4.7 });
        });
        ct.diners.slice(0, Math.round(8 * few)).forEach((d, i) => {
          const c = makeCharacter(looks[(10 + i) % looks.length]!, `diner:${i}`);
          c.root.position.copy(d.at);
          c.root.rotation.y = d.face;
          world.add(c.root);
          chars.push(c);
          eaters.push(c);
        });
        // A shopper in the fashion shop and one at the supermarket's till.
        [shopToWorld('fashion', 2.8, 0.9), shopToWorld('supermarket', 2.0, -3.4)].forEach(
          (p, i) => {
            const c = makeCharacter(looks[(18 + i) % looks.length]!, `browser:${i}`);
            c.root.position.set(p.x, 0, p.z);
            c.root.rotation.y = i ? -Math.PI / 2 : -Math.PI / 2 + 0.6;
            world.add(c.root);
            chars.push(c);
            browsers.push(c);
          },
        );
        makeMe(live.current.me);
      },
    ];
    let si = 0;
    const next = () => {
      slices[si++]!();
      if (si < slices.length) return later(next);
      built = true;
      fitLens();
      aim(true, 0);
      stage.release();
    };
    later(next);

    // ---- Every frame: people, your walk, the camera.
    let lastNow = performance.now();
    const off = stage.add((t, dt) => {
      if (!built) return true;
      let busy = walkers.length + riders.length + eaters.length > 0;
      for (const w of walkers) {
        const len = Math.abs(w.z1 - w.z0);
        const u = ((t * w.speed + w.phase) % (len * 2)) / len;
        const fwd = u < 1;
        const z = fwd ? w.z0 - u * len : w.z0 - (2 - u) * len;
        w.c.root.position.set(w.x + (fwd ? 0 : 0.6), 0, z);
        w.c.root.rotation.y = fwd ? Math.PI : 0;
        pose(w.c, 'walk', t * w.speed, { phase: w.phase });
      }
      for (const rd of riders) {
        const u = (((t * 0.1 + rd.phase / 10) % 1) + 1) % 1;
        rd.c.root.position.set(rd.x, u * LEVEL + 0.1, -13 - u * 8);
        rd.c.root.rotation.y = Math.PI;
        pose(rd.c, 'stand', t);
      }
      eaters.forEach((c, i) => pose(c, i % 3 ? 'eat' : 'drink', t, { seat: 0.45, phase: i }));
      browsers.forEach((c, i) => pose(c, 'browse', t, { phase: i }));
      if (walk && me) {
        const m = me as Character;
        let step = WALK_SPEED * Math.min(0.25, Math.max(dt, (performance.now() - lastNow) / 1000));
        while (walk && step > 0) {
          const q = walk.path[0]!;
          const dx = q.x - pos.x;
          const dz = q.z - pos.z;
          const d = Math.hypot(dx, dz);
          if (d > 1e-3) {
            const want = Math.atan2(dx, dz);
            let dh = want - heading;
            dh = Math.atan2(Math.sin(dh), Math.cos(dh));
            heading += dh * Math.min(1, dt * 10 + 0.15);
          }
          if (d <= step) {
            place(q.x, q.z);
            step -= d;
            walk.path.shift();
            if (!walk.path.length) {
              arrive();
              settle();
            }
          } else {
            place(pos.x + (dx / d) * step, pos.z + (dz / d) * step);
            step = 0;
          }
        }
        m.root.rotation.y = heading;
        if (walk) {
          pose(m, 'walk', t * 1.4);
          walk.left = pathLength(pos, walk.path);
          const left = Math.ceil(walk.left);
          if (left !== walk.told) {
            walk.told = left;
            live.current.onWalk(left);
          }
          layDots(walk.path);
          // The camera swings round behind you as you go.
          if (!looking) {
            let dy = heading - camYaw;
            dy = Math.atan2(Math.sin(dy), Math.cos(dy));
            camYaw += dy * Math.min(1, dt * 1.6);
          }
          const pulse = 1 + Math.sin(t * 5) * 0.08;
          r2.scale.set(pulse, pulse, 1);
        }
        busy = true;
      } else if (me) {
        const m = me as Character;
        pose(m, 'idle', t);
        busy = true;
      }
      lastNow = performance.now();
      if (aim(false, dt)) busy = true;
      return busy;
    });

    // ---- Taps, drags, pinches.
    const ray = new THREE.Raycaster();
    let lastTap = { at: 0, x: 0, y: 0 };
    const offG = gestures(canvas, {
      tap: (x, y) => {
        if (!built) return;
        const now = performance.now();
        const double = now - lastTap.at < 400 && Math.hypot(x - lastTap.x, y - lastTap.y) < 40;
        lastTap = { at: double ? 0 : now, x, y };
        const ndc = new THREE.Vector2((x / stage.w) * 2 - 1, 1 - (y / stage.h) * 2);
        ray.setFromCamera(ndc, eye);
        const shown = (o: THREE.Object3D | null): boolean => !o || (o.visible && shown(o.parent));
        const h = ray.intersectObjects(picks, false).find((x) => shown(x.object));
        if (h && (h.object.userData.item || h.object.userData.shop)) {
          const u = h.object.userData;
          live.current.onTap(
            u.item ? { item: u.item as string } : { shop: u.shop as MallShopId },
            double,
          );
          return;
        }
        const f = stage.floorAt(x, y);
        if (f) live.current.onTap({ floor: { x: f.x, z: f.z } }, double);
      },
      orbit: (dx, dy) => {
        if (looking) {
          lookYaw -= dx * 0.006;
          lookPitch = Math.max(-0.7, Math.min(0.7, lookPitch - dy * 0.005));
        } else camYaw -= dx * 0.008;
        stage.invalidate();
      },
      zoom: (f) => {
        if (looking) return;
        camDist = Math.max(3.2, Math.min(9, camDist / f));
        stage.invalidate();
      },
    });

    live.current.api.current = {
      walkTo: (to, then) => {
        const path = findPath(grid, pos, to);
        if (!path) return null;
        const len = pathLength(pos, path);
        const end = path[path.length - 1]!;
        if (live.current.reduced || len < 0.05) {
          // Reduced motion: there at once.
          const last = path.length > 1 ? path[path.length - 2]! : pos;
          if (len >= 0.05) heading = Math.atan2(end.x - last.x, end.z - last.z);
          camYaw = heading;
          place(end.x, end.z);
          if (me) (me as Character).root.rotation.y = heading;
          walk = { path: [], then, left: 0, told: 0 };
          arrive();
          settle();
          aim(true, 0);
          stage.invalidate();
          return len;
        }
        walk = { path, then, left: len, told: -1 };
        ring.position.set(end.x, 0, end.z);
        ring.visible = true;
        layDots(path);
        stage.invalidate();
        return len;
      },
      jump: (to, h) => {
        walk = null;
        ring.visible = false;
        dots.count = 0;
        place(to.x, to.z);
        if (h !== undefined) heading = camYaw = h;
        settle();
        aim(true, 0);
        stage.invalidate();
      },
      turn: (dir = 1) => {
        if (looking) {
          lookYaw -= dir * (Math.PI / 2);
          stage.invalidate();
          return;
        }
        const from = camYaw;
        const to = camYaw - dir * (Math.PI / 2);
        if (live.current.reduced) {
          camYaw = to;
          aim(true, 0);
          stage.invalidate();
          return;
        }
        const t0 = performance.now();
        const offT = stage.add(() => {
          const u = Math.min(1, (performance.now() - t0) / 500);
          camYaw = from + (to - from) * (u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2);
          if (u >= 1) offT();
          return u < 1;
        });
      },
      look: (on) => {
        looking = on;
        if (on) {
          lookYaw = camYaw;
          lookPitch = 0.04;
          lastHeadingSent = NaN;
        } else camYaw = lookYaw;
        if (me) (me as Character).root.visible = !on;
        aim(live.current.reduced, 0);
        stage.invalidate();
      },
      face: (x, z) => {
        heading = Math.atan2(x - pos.x, z - pos.z);
        if (me) (me as Character).root.rotation.y = heading;
        stage.invalidate();
      },
      snapshot: () => {
        placeTags();
        return stage.snapshot();
      },
      where: () => ({ x: pos.x, z: pos.z, heading: looking ? lookYaw : camYaw }),
    };

    return () => {
      gone = true;
      if (idle) cancelIdleCallback(idle);
      clearTimeout(timer);
      off();
      offG();
      ro.disconnect();
      live.current.api.current = null;
      setMe.current = null;
      refit.current = null;
      scene.remove(world, ring, dots);
      disposeTree(world);
      disposeTree(ring);
      dots.dispose();
      for (const k of Object.keys(canvas.dataset)) delete canvas.dataset[k];
      canvas.remove();
      if (!built) stage.release();
      // Kept for next time: as the home's if it has none (it's opened more), else the mall's.
      parkStage(hasParkedStage('home') ? 'mall' : 'home', stage);
    };
  }, []);
  return <span ref={anchorRef} hidden />;
}

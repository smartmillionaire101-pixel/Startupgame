/**
 * The mall in 3D (lazy-loaded): a two-level concourse under a skylight,
 * glass shopfronts with lit signs, escalators up to the gallery, columns,
 * planters and benches, shoppers walking with their bags (and riding the
 * escalators), the food court at the far end with people eating. Each shop
 * has its own room behind its glass (racks of clothes and mannequins, phone
 * tables and a wall of screens, sofas and beds, supermarket aisles, the
 * cinema's posters); choosing one takes the camera inside, where your own
 * figure browses, in what you're trying on.
 */
import { useEffect, useRef, type ReactElement } from 'react';
import * as THREE from 'three';
import type { MallShopId } from '@runway/engine';
import type { AvatarLook } from '../city/art';
import { hash, seeded } from '../city/contract';
import { cpuGl, softwareGl } from '../three-kit/quality';
import { makeCharacter, pose, type Character, type PoseId } from './character';
import { Kit, disposeTree, floorTexture, mat, screenTexture } from './kit';

export interface Mall3DProps {
  me: AvatarLook;
  shoppers: AvatarLook[];
  focus: MallShopId | null;
  names: Record<MallShopId, string>;
  mallName: string;
  onReady?: () => void;
}

/** Where each shop is: the side of the hall (−1 left, 1 right) and its middle (z). */
const SPOT: Record<Exclude<MallShopId, 'foodcourt'>, { side: -1 | 1; z: number }> = {
  fashion: { side: -1, z: -6 },
  phones: { side: -1, z: -17 },
  home: { side: -1, z: -28 },
  supermarket: { side: 1, z: -6 },
  cinema: { side: 1, z: -17 },
};
const COLOUR: Record<MallShopId, string> = {
  fashion: '#db2777',
  phones: '#2563eb',
  home: '#a16207',
  supermarket: '#16a34a',
  foodcourt: '#ea580c',
  cinema: '#7c3aed',
};
const HALF = 8;
const DEPTH = 7;
const SHOP_W = 9;
const LEVEL = 4.6;

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
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshStandardMaterial({
      map: signTex(text, bg, fg),
      emissive: new THREE.Color('#ffffff'),
      emissiveMap: signTex(text, bg, fg),
      emissiveIntensity: 0.55,
      roughness: 0.4,
    }),
  );
  return m;
}

const TOPS = [
  '#db2777',
  '#2563eb',
  '#f59e0b',
  '#16a34a',
  '#111827',
  '#e2e8f0',
  '#7c3aed',
  '#dc2626',
];

function buildMall(names: Record<MallShopId, string>, mallName: string) {
  const root = new THREE.Group();
  const k = new Kit();
  const r = seeded(hash(`mall:${mallName}`));
  // The floor: polished stone, the hall and the shops.
  const tex = floorTexture('marble').clone();
  tex.needsUpdate = true;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(12, 20);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(2 * (HALF + DEPTH) + 2, 60),
    new THREE.MeshStandardMaterial({
      map: tex,
      roughness: 0.22,
      metalness: 0.05,
      color: '#f2efe9',
    }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.z = -17;
  floor.receiveShadow = true;
  root.add(floor);
  // Walls round the outside, the roof and its skylight.
  const W = HALF + DEPTH;
  k.box(0.4, 9.6, 60, '#ece7df', -W - 0.2, 0, -17);
  k.box(0.4, 9.6, 60, '#ece7df', W + 0.2, 0, -17);
  k.box(2 * W, 9.6, 0.4, '#ece7df', 0, 0, -46.5);
  k.box(2 * W, 0.4, 60, '#f8f6f2', 0, 9.5, -17, { noShadow: true });
  for (let z = 8; z > -44; z -= 4)
    k.box(7.6, 0.08, 3.4, '#ffffff', 0, 9.42, z, {
      emissive: '#fffbea',
      emissiveIntensity: 1.1,
      noShadow: true,
    });
  // The gallery: slabs along both sides at the first floor, a bridge over the hall.
  for (const s of [-1, 1]) {
    k.box(W - 4, 0.35, 56, '#f5f2ec', s * (4 + (W - 4) / 2), LEVEL - 0.35, -17);
    // Its edge, and the glass balustrade with a steel rail.
    k.box(0.12, 0.42, 56, '#d6d0c4', s * 4, LEVEL - 0.42, -17);
    k.box(0.04, 1.0, 56, '#bfe3f2', s * 4.02, LEVEL, -17, { opacity: 0.35, noShadow: true });
    k.box(0.08, 0.06, 56, '#94a3b8', s * 4.02, LEVEL + 1.0, -17, { metal: 0.8, rough: 0.3 });
    // Columns.
    for (let z = 4; z > -44; z -= 11) k.cyl(0.32, 0.32, 9.4, '#f8fafc', s * 4.4, 0, z, { seg: 18 });
  }
  k.box(8, 0.35, 3.2, '#f5f2ec', 0, LEVEL - 0.35, -22.6);
  k.box(8, 1.0, 0.04, '#bfe3f2', 0, LEVEL, -21, { opacity: 0.35, noShadow: true });
  // Escalators up to the bridge: two, side by side, with glass sides and steps.
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
  // Planters with trees and benches down the hall.
  // Planters line the hall's edges (the middle stays open to walk and to look down).
  for (const z of [-1, -27])
    for (const x of [-3.1, 3.1]) {
      k.cyl(0.65, 0.7, 0.6, '#e7e2d8', x, 0, z, { seg: 18 });
      k.cyl(0.6, 0.6, 0.05, '#3f2d1d', x, 0.58, z, { seg: 18 });
      k.cyl(0.07, 0.1, 1.5, '#6b4a2f', x, 0.6, z);
      k.sphere(0.75, '#2f7d32', x, 2.3, z, { seg: 10 });
      k.box(0.55, 0.45, 1.8, '#8b5e3c', x, 0, z - 2.2, { round: 0.04 });
    }
  root.add(k.build());

  // Shops.
  const anchors: Partial<
    Record<
      MallShopId,
      { cam: THREE.Vector3; look: THREE.Vector3; you: THREE.Vector3; face: number }
    >
  > = {};
  const shopKit = new Kit();
  const add = (s: -1 | 1, z0: number) => ({
    // Shop frame: u is depth in from the glass, v along the hall.
    box: (w: number, h: number, d: number, col: string, u: number, y: number, v: number, o = {}) =>
      shopKit.box(d, h, w, col, s * (HALF + u), y, z0 + v, o),
    cyl: (a: number, b: number, h: number, col: string, u: number, y: number, v: number, o = {}) =>
      shopKit.cyl(a, b, h, col, s * (HALF + u), y, z0 + v, o),
    sphere: (rad: number, col: string, u: number, y: number, v: number, o = {}) =>
      shopKit.sphere(rad, col, s * (HALF + u), y, z0 + v, o),
  });
  const extras: { look: AvatarLook; at: THREE.Vector3; face: number; pose: PoseId }[] = [];
  for (const [shop, spot] of Object.entries(SPOT) as [
    Exclude<MallShopId, 'foodcourt'>,
    { side: -1 | 1; z: number },
  ][]) {
    const s = spot.side;
    const z0 = spot.z;
    const b = add(s, z0);
    const col = COLOUR[shop];
    // Walls, ceiling and a lit panel.
    b.box(0.2, 4.4, DEPTH, '#f1ede6', DEPTH / 2, 0, -SHOP_W / 2);
    b.box(0.2, 4.4, DEPTH, '#f1ede6', DEPTH / 2, 0, SHOP_W / 2);
    b.box(SHOP_W, 4.4, 0.2, shop === 'cinema' ? '#1e1b4b' : '#faf7f2', DEPTH, 0, 0);
    b.box(SHOP_W, 0.2, DEPTH, '#ffffff', DEPTH / 2, 4.3, 0, { noShadow: true });
    b.box(SHOP_W - 2, 0.05, DEPTH - 2, '#ffffff', DEPTH / 2, 4.25, 0, {
      emissive: '#fff7e6',
      emissiveIntensity: 0.9,
      noShadow: true,
    });
    // The shopfront: glass either side of the door, mullions, the fascia.
    for (const v of [-3.05, 3.05])
      b.box(3.1, 3.3, 0.05, '#cfe8f5', 0, 0, v, { opacity: 0.28, rough: 0.05, noShadow: true });
    for (const v of [-4.5, -1.5, 1.5, 4.5])
      b.box(0.1, 3.3, 0.12, '#94a3b8', 0, 0, v, { metal: 0.7 });
    b.box(SHOP_W, 1.1, 0.25, col, 0, 3.3, 0);
    // What's inside.
    switch (shop) {
      case 'fashion':
        for (const v of [-2.8, 0, 2.8]) {
          b.cyl(0.03, 0.03, 1.5, '#9ca3af', 3.2, 0, v - 0.9, { metal: 0.8 });
          b.cyl(0.03, 0.03, 1.5, '#9ca3af', 3.2, 0, v + 0.9, { metal: 0.8 });
          shopKit.box(0.04, 0.04, 1.9, '#9ca3af', s * (HALF + 3.2), 1.5, z0 + v, { metal: 0.8 });
          for (let i = 0; i < 7; i++)
            b.box(
              0.22,
              0.62,
              0.42,
              TOPS[(i + Math.round(v)) % TOPS.length]!,
              3.2,
              0.85,
              v - 0.8 + i * 0.27,
              {
                round: 0.03,
              },
            );
        }
        b.box(SHOP_W - 1, 1.9, 0.3, '#e7e2d8', 6.6, 0.3, 0);
        b.box(1.4, 1.9, 0.04, '#e2e8f0', 6.7, 0.5, -3, { metal: 0.9, rough: 0.05 });
        b.box(1.6, 0.8, 0.9, '#f5f0e6', 5.2, 0, 2.6, { round: 0.04 });
        for (let i = 0; i < 4; i++)
          b.box(0.35, 0.08, 0.3, TOPS[i + 2]!, 5.0 + (i % 2) * 0.4, 0.8, 2.3 + i * 0.2);
        extras.push(
          {
            look: {
              skin: '#e5e7eb',
              hair: '#e5e7eb',
              hairStyle: 'bald',
              top: '#db2777',
              bottom: '#f8fafc',
              accessory: 'none',
              topStyle: 'dress',
              gender: 'female',
            },
            at: new THREE.Vector3(s * (HALF + 1.2), 0, z0 - 3.6),
            face: s > 0 ? -Math.PI / 2 : Math.PI / 2,
            pose: 'stand',
          },
          {
            look: {
              skin: '#e5e7eb',
              hair: '#e5e7eb',
              hairStyle: 'bald',
              top: '#1e3a8a',
              bottom: '#334155',
              accessory: 'none',
              topStyle: 'blazer',
              gender: 'male',
            },
            at: new THREE.Vector3(s * (HALF + 5.6), 0, z0 + 3.0),
            face: s > 0 ? -Math.PI / 2 : Math.PI / 2,
            pose: 'stand',
          },
        );
        break;
      case 'phones':
        for (const v of [-2.2, 2.2]) {
          b.box(1.6, 0.9, 1.2, '#f8fafc', 3, 0, v, { round: 0.05 });
          for (let i = 0; i < 4; i++)
            b.box(
              0.18,
              0.02,
              0.09,
              '#0f172a',
              2.7 + (i % 2) * 0.55,
              0.91,
              v - 0.5 + Math.floor(i / 2) * 0.9,
              {
                emissive: '#38bdf8',
                emissiveIntensity: 0.8,
              },
            );
        }
        for (let i = 0; i < 6; i++) {
          const tv = new THREE.Mesh(
            new THREE.PlaneGeometry(1.35, 0.8),
            new THREE.MeshStandardMaterial({
              map: screenTexture(i % 2 ? 'game' : 'film'),
              emissive: new THREE.Color('#ffffff'),
              emissiveMap: screenTexture(i % 2 ? 'game' : 'film'),
              emissiveIntensity: 0.8,
            }),
          );
          tv.position.set(
            s * (HALF + DEPTH - 0.12),
            1.4 + Math.floor(i / 3) * 1.0,
            z0 - 2.9 + (i % 3) * 2.9,
          );
          tv.rotation.y = s > 0 ? -Math.PI / 2 : Math.PI / 2;
          root.add(tv);
        }
        b.box(2.6, 1.0, 0.7, '#1e293b', 5.4, 0, 3.2);
        break;
      case 'home':
        b.box(2.6, 0.45, 1.0, '#64748b', 3.6, 0, -1.6, { round: 0.08 });
        b.box(2.6, 0.55, 0.25, '#64748b', 4.0, 0.4, -1.6, { round: 0.06 });
        b.box(0.3, 0.6, 1.0, '#64748b', 3.6, 0, -2.9, { round: 0.06 });
        b.box(0.3, 0.6, 1.0, '#64748b', 3.6, 0, -0.3, { round: 0.06 });
        b.box(1.2, 0.4, 0.7, '#a16207', 2.3, 0, -1.6, { round: 0.03 });
        b.box(3.4, 0.01, 2.4, '#b45309', 3.0, 0.005, -1.6, { noShadow: true });
        b.cyl(0.03, 0.03, 1.6, '#111827', 4.8, 0, -3.6);
        b.cyl(0.25, 0.18, 0.35, '#fef3c7', 4.8, 1.55, -3.6, {
          emissive: '#fde68a',
          emissiveIntensity: 0.6,
        });
        b.box(2.0, 0.5, 2.4, '#f8fafc', 5.4, 0, 2.6, { round: 0.05 });
        b.box(2.0, 1.1, 0.12, '#78350f', 6.6, 0.2, 2.6);
        b.box(1.8, 0.1, 0.5, '#93c5fd', 5.6, 0.5, 2.6);
        b.cyl(0.35, 0.28, 0.6, '#e7e2d8', 1.0, 0, 3.6);
        b.sphere(0.55, '#2f7d32', 1.0, 1.0, 3.6);
        break;
      case 'supermarket':
        // Aisles running back from the tills, stacked with colourful packs.
        for (const v of [-3.2, -0.9]) {
          b.box(0.7, 1.8, 3.6, '#e5e7eb', 4.3, 0, v);
          for (let row = 0; row < 3; row++)
            for (let i = 0; i < 9; i++)
              for (const side of [-0.42, 0.42])
                b.box(
                  0.18,
                  0.32,
                  0.3,
                  TOPS[(i + row * 3 + (side > 0 ? 1 : 0)) % TOPS.length]!,
                  2.7 + i * 0.4,
                  0.15 + row * 0.55,
                  v + side,
                  {
                    noShadow: true,
                  },
                );
        }
        b.box(0.6, 0.9, 1.4, '#334155', 1.4, 0, -2.2);
        b.box(0.5, 0.6, 0.7, '#94a3b8', 5.8, 0.3, 2.6, { opacity: 0.8 });
        break;
      case 'cinema':
        for (const v of [-3, 0, 3]) {
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
        b.box(3.4, 1.05, 0.8, '#7c3aed', 4.4, 0, -1.2);
        b.box(0.8, 1.6, 0.7, '#dc2626', 4.4, 0, 2.6);
        b.box(0.7, 0.5, 0.6, '#fde68a', 4.4, 1.6, 2.6, {
          opacity: 0.85,
          emissive: '#fde047',
          emissiveIntensity: 0.4,
        });
        break;
    }
    // The sign, facing the hall.
    const sign = signMesh(names[shop], col, SHOP_W - 1, 0.95);
    sign.position.set(s * (HALF - 0.14), 3.85, z0);
    sign.rotation.y = s > 0 ? -Math.PI / 2 : Math.PI / 2;
    root.add(sign);
    anchors[shop] = {
      cam: new THREE.Vector3(s * (HALF + 0.6), 1.65, z0 + 4.1),
      look: new THREE.Vector3(s * (HALF + 3.6), 1.0, z0 - 0.4),
      you: new THREE.Vector3(s * (HALF + 2.6), 0, z0 + 1.2),
      face: s > 0 ? Math.PI / 2 + 0.5 : -Math.PI / 2 - 0.5,
    };
  }
  // Upstairs shopfronts (more of the mall), signed.
  const upper = ['Sports', 'Books', 'Beauty', 'Kids', 'Jewellery', 'Toys'];
  upper.forEach((name, i) => {
    const s = i % 2 ? 1 : -1;
    const z = -4 - Math.floor(i / 2) * 12;
    shopKit.box(0.06, 3.0, 7.5, '#cfe8f5', s * HALF, LEVEL, z, { opacity: 0.3, noShadow: true });
    shopKit.box(
      0.3,
      0.8,
      8,
      ['#0ea5e9', '#a16207', '#ec4899', '#f59e0b', '#64748b', '#22c55e'][i]!,
      s * HALF,
      LEVEL + 3.0,
      z,
    );
    const sg = signMesh(
      name,
      ['#0ea5e9', '#a16207', '#ec4899', '#f59e0b', '#64748b', '#22c55e'][i]!,
      6,
      0.7,
    );
    sg.position.set(s * (HALF - 0.17), LEVEL + 3.4, z);
    sg.rotation.y = s > 0 ? -Math.PI / 2 : Math.PI / 2;
    root.add(sg);
    for (let j = 0; j < 4; j++)
      shopKit.box(
        0.4,
        1.2,
        0.6,
        ['#f87171', '#60a5fa', '#fbbf24', '#34d399'][j]!,
        s * (HALF + 1.2),
        LEVEL,
        z - 2.4 + j * 1.6,
      );
  });
  // The food court at the far end: counters with signs, tables and chairs.
  const counters = ['Grill', 'Noodles', 'Burgers', 'Juice'];
  counters.forEach((name, i) => {
    const x = -10.5 + i * 7;
    shopKit.box(5.6, 1.1, 1.2, '#f8fafc', x, 0, -44.6, { round: 0.05 });
    shopKit.box(5.8, 3.4, 0.3, ['#ea580c', '#dc2626', '#f59e0b', '#16a34a'][i]!, x, 0, -46.1);
    const sg = signMesh(name, ['#ea580c', '#dc2626', '#f59e0b', '#16a34a'][i]!, 5, 0.8);
    sg.position.set(x, 3.0, -45.9);
    root.add(sg);
  });
  const diners: { at: THREE.Vector3; face: number }[] = [];
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 2; j++) {
      const x = -6 + i * 4;
      const z = -38 - j * 3.2;
      shopKit.cyl(0.6, 0.6, 0.05, '#f8fafc', x, 0.74, z, { seg: 20 });
      shopKit.cyl(0.06, 0.06, 0.74, '#64748b', x, 0, z);
      for (const dz of [-0.9, 0.9])
        shopKit.box(0.45, 0.45, 0.45, '#f97316', x, 0, z + dz, { round: 0.05 });
      if (r() < 0.75) diners.push({ at: new THREE.Vector3(x, 0, z + 0.9), face: Math.PI });
      if (r() < 0.5) diners.push({ at: new THREE.Vector3(x, 0, z - 0.9), face: 0 });
    }
  const fc = signMesh(names.foodcourt, COLOUR.foodcourt, 7, 1.1);
  fc.position.set(0, LEVEL + 1.9, -22.6 + 1.62);
  root.add(fc);
  // The mall's name over the bridge, facing the entrance.
  const big = signMesh(mallName, '#0f172a', 8, 1.1, '#fde68a');
  big.position.set(0, LEVEL + 0.6, -21.0 + 0.04);
  root.add(big);
  anchors.foodcourt = {
    cam: new THREE.Vector3(1.5, 2.3, -29),
    look: new THREE.Vector3(0, 0.9, -41),
    you: new THREE.Vector3(0.8, 0, -34.5),
    face: Math.PI,
  };
  root.add(shopKit.build());
  return { root, anchors, extras, diners };
}

export default function Mall3D(props: Mall3DProps): ReactElement | null {
  const ref = useRef<HTMLCanvasElement>(null);
  const live = useRef(props);
  useEffect(() => {
    live.current = props;
  });
  useEffect(() => {
    const canvas = ref.current!;
    const parent = canvas.parentElement!;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: !softwareGl() });
    } catch {
      return;
    }
    const soft = softwareGl();
    renderer.setPixelRatio(soft ? 1 : Math.min(2, window.devicePixelRatio || 1));
    renderer.shadowMap.enabled = !soft;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#f3efe8');
    scene.fog = new THREE.Fog('#f3efe8', 30, 75);
    scene.add(new THREE.HemisphereLight('#ffffff', '#c9bfae', 1.6));
    scene.add(new THREE.AmbientLight('#ffffff', 0.35));
    const sun = new THREE.DirectionalLight('#fff6e8', 1.4);
    sun.position.set(6, 20, 4);
    sun.target.position.set(0, 0, -16);
    sun.castShadow = true;
    sun.shadow.mapSize.set(soft ? 512 : 2048, soft ? 512 : 2048);
    const sc = sun.shadow.camera;
    sc.left = -18;
    sc.right = 18;
    sc.top = 30;
    sc.bottom = -30;
    sc.near = 1;
    sc.far = 60;
    scene.add(sun, sun.target);
    const camera = new THREE.PerspectiveCamera(56, 1, 0.1, 200);
    const { names, mallName } = live.current;
    const mall = buildMall(names, mallName);
    scene.add(mall.root);
    for (const e of mall.extras) {
      const c = makeCharacter(e.look, 'mannequin');
      c.root.position.copy(e.at);
      c.root.rotation.y = e.face;
      pose(c, e.pose, 0);
      scene.add(c.root);
    }

    // Shoppers: walking the hall with bags, riding the escalators, eating.
    const looks = live.current.shoppers;
    const walkers: { c: Character; lane: number; speed: number; phase: number; len: number }[] = [];
    const bagCols = ['#db2777', '#2563eb', '#16a34a', '#f59e0b', '#7c3aed', '#ffffff'];
    const bagG = new THREE.BoxGeometry(0.28, 0.32, 0.1);
    looks.slice(0, 12).forEach((look, i) => {
      const c = makeCharacter(look, `shopper:${i}`);
      for (let b = 0; b < 1 + (i % 2); b++) {
        const bag = new THREE.Mesh(bagG, mat(bagCols[(i + b) % bagCols.length]!));
        bag.position.set(0, -0.2, b * 0.06);
        bag.castShadow = true;
        (b ? c.handL : c.handR).add(bag);
      }
      scene.add(c.root);
      walkers.push({
        c,
        lane: [-3, -1.8, 2, 3.2, -2.6, 2.6][i % 6]!,
        speed: 0.9 + (i % 4) * 0.15,
        phase: i * 7.3,
        len: 34,
      });
    });
    const riders = looks.slice(12, 15).map((look, i) => {
      const c = makeCharacter(look, `rider:${i}`);
      scene.add(c.root);
      return { c, x: i % 2 ? 1.4 : -1.4, phase: i * 3.3 };
    });
    const eaters = mall.diners.slice(0, Math.max(0, looks.length - 15)).map((d, i) => {
      const c = makeCharacter(looks[15 + i]!, `diner:${i}`);
      c.root.position.copy(d.at);
      c.root.rotation.y = d.face;
      scene.add(c.root);
      return c;
    });
    const browsers = looks.slice(0, 4).map((look, i) => {
      const c = makeCharacter(look, `browser:${i}`);
      const s = i % 2 ? 1 : -1;
      c.root.position.set(s * (HALF - 1.0), 0, -10.5 - i * 6);
      c.root.rotation.y = s > 0 ? Math.PI / 2 : -Math.PI / 2;
      scene.add(c.root);
      return c;
    });

    let me: Character | null = null;
    let meKey = '';
    const camPos = new THREE.Vector3(0, 3.2, 9.5);
    const camLook = new THREE.Vector3(0, 1.6, -18);
    let lastFocus: MallShopId | null | undefined;
    const size = () => {
      const b = parent.getBoundingClientRect();
      if (b.width < 2 || b.height < 2) return;
      renderer.setSize(b.width, b.height, false);
      camera.aspect = b.width / b.height;
      camera.updateProjectionMatrix();
    };
    size();
    const ro = new ResizeObserver(size);
    ro.observe(parent);
    let raf = 0;
    let last = performance.now();
    const t0 = last;
    const minGap = cpuGl() ? 120 : soft ? 45 : 0;
    let ready = false;
    const want = new THREE.Vector3();
    const look = new THREE.Vector3();
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (document.hidden || now - last < minGap) return;
      const dt = Math.min(0.6, (now - last) / 1000);
      last = now;
      const t = (now - t0) / 1000;
      const p = live.current;
      const key = JSON.stringify(p.me);
      if (key !== meKey) {
        if (me) {
          scene.remove(me.root);
          disposeTree(me.root);
        }
        me = makeCharacter(p.me, 'me');
        const bag = new THREE.Mesh(bagG, mat('#db2777'));
        bag.position.set(0, -0.2, 0);
        me.handR.add(bag);
        scene.add(me.root);
        meKey = key;
      }
      const a = p.focus ? mall.anchors[p.focus] : undefined;
      if (!me) return;
      if (a) {
        me.root.position.copy(a.you);
        // Turned to the camera, as in a shop mirror, a little towards the stock.
        me.root.rotation.y =
          Math.atan2(a.cam.x - a.you.x, a.cam.z - a.you.z) + (p.focus === 'foodcourt' ? 0 : 0.35);
        pose(me, p.focus === 'foodcourt' ? 'idle' : 'browse', t);
        want.copy(a.cam);
        look.copy(a.look);
      } else {
        // In the concourse: you stroll in from the entrance.
        const z = 3.5 - ((t * 0.6) % 6);
        me.root.position.set(0.9, 0, z);
        me.root.rotation.y = Math.PI;
        pose(me, 'walk', t);
        want.set(0.4, 3.0 + Math.sin(t * 0.2) * 0.1, 9.5);
        look.set(0, 1.7, -16);
      }
      if (lastFocus !== p.focus) {
        camPos.copy(want);
        camLook.copy(look);
        lastFocus = p.focus;
      }
      const e = 1 - Math.exp(-dt * 3);
      camPos.lerp(want, e);
      camLook.lerp(look, e);
      camera.position.copy(camPos);
      camera.lookAt(camLook);
      for (const w of walkers) {
        const u = ((t * w.speed + w.phase) % (w.len * 2)) / w.len;
        const fwd = u < 1;
        const z = fwd ? 6 - u * w.len : 6 - (2 - u) * w.len;
        w.c.root.position.set(w.lane + (fwd ? 0 : 0.5), 0, z);
        w.c.root.rotation.y = fwd ? Math.PI : 0;
        pose(w.c, 'walk', t * w.speed, { phase: w.phase });
      }
      for (const rd of riders) {
        const u = (((t * 0.12 + rd.phase / 10) % 1) + 1) % 1;
        rd.c.root.position.set(rd.x, u * LEVEL + 0.1, -13 - u * 8);
        rd.c.root.rotation.y = Math.PI;
        pose(rd.c, 'stand', t);
      }
      eaters.forEach((c, i) => pose(c, i % 3 ? 'eat' : 'drink', t, { seat: 0.45, phase: i }));
      browsers.forEach((c, i) => pose(c, i % 2 ? 'browse' : 'chat', t, { phase: i }));
      renderer.render(scene, camera);
      if (!ready) {
        ready = true;
        p.onReady?.();
      }
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      disposeTree(scene);
      renderer.dispose();
    };
  }, []);
  return <canvas ref={ref} className="mall-3d" aria-hidden="true" data-mall-3d="" />;
}

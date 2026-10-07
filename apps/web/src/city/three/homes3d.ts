/**
 * Wave 10 §B: the homes you own, as models on the 3D map at their real
 * neighbourhoods — a mansion with its lawn, pool and wall, a white villa
 * with a pool, a penthouse crowning a glass tower, a townhouse, a flat —
 * each with a gold marker so you can find it from the air.
 *
 * Built from primitives (no textures); one small group per home.
 */
import * as THREE from 'three';
import type { PropertyTier } from '../properties';

const cache = new Map<string, THREE.MeshStandardMaterial>();
function mat(
  color: string,
  o: { rough?: number; metal?: number; emissive?: string; ei?: number } = {},
) {
  const k = `${color}|${o.rough}|${o.metal}|${o.emissive}|${o.ei}`;
  let m = cache.get(k);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color,
      roughness: o.rough ?? 0.75,
      metalness: o.metal ?? 0,
      flatShading: true,
      ...(o.emissive ? { emissive: o.emissive, emissiveIntensity: o.ei ?? 1 } : {}),
    });
    cache.set(k, m);
  }
  return m;
}

/** Windows that light up at night (setHomesNight). */
const WINDOW = () => mat('#2a3440', { rough: 0.2, metal: 0.6, emissive: '#ffbe73', ei: 0 });
const GOLD = () => mat('#d4a017', { rough: 0.3, metal: 0.8, emissive: '#ffb000', ei: 0.6 });

function box(
  g: THREE.Object3D,
  w: number,
  h: number,
  d: number,
  m: THREE.Material,
  x = 0,
  y = 0,
  z = 0,
) {
  const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0), m);
  o.position.set(x, y, z);
  o.castShadow = true;
  o.receiveShadow = true;
  g.add(o);
  return o;
}

/** A hipped roof over a w × d footprint. */
function hipRoof(
  g: THREE.Object3D,
  w: number,
  d: number,
  h: number,
  m: THREE.Material,
  y: number,
  x = 0,
  z = 0,
) {
  const geo = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1)
    .rotateY(Math.PI / 4)
    .translate(0, 0.5, 0);
  geo.scale(w * 1.08, h, d * 1.08);
  const o = new THREE.Mesh(geo, m);
  o.position.set(x, y, z);
  o.castShadow = true;
  g.add(o);
}

function tree(g: THREE.Object3D, x: number, z: number, s = 1) {
  box(g, 0.5 * s, 2.5 * s, 0.5 * s, mat('#6b4f35'), x, 0, z);
  const c = new THREE.Mesh(
    new THREE.IcosahedronGeometry(2.6 * s, 0).translate(0, 4.2 * s, 0),
    mat('#3f6f34'),
  );
  c.position.set(x, 0, z);
  c.castShadow = true;
  g.add(c);
}

function pool(g: THREE.Object3D, w: number, d: number, x: number, z: number) {
  box(g, w + 1.2, 0.18, d + 1.2, mat('#e9e4d8'), x, 0, z);
  box(
    g,
    w,
    0.22,
    d,
    mat('#2fa9d6', { rough: 0.1, metal: 0.2, emissive: '#1d8fc0', ei: 0.25 }),
    x,
    0,
    z,
  );
}

/** Window bands on a box's long faces (thin dark slabs that glow at night). */
function windows(
  g: THREE.Object3D,
  w: number,
  d: number,
  floors: number,
  fh: number,
  x = 0,
  z = 0,
  y0 = 0,
) {
  for (let f = 0; f < floors; f++) {
    const y = y0 + f * fh + fh * 0.35;
    box(g, w * 0.86, fh * 0.42, d + 0.12, WINDOW(), x, y, z);
  }
}

/** Plot size (metres) of each kind of home: [width along the street, depth]. */
export const PLOT: Record<PropertyTier, [number, number]> = {
  mansion: [52, 40],
  villa: [36, 30],
  penthouse: [28, 28],
  townhouse: [12, 18],
  apartment: [24, 18],
  studio: [20, 16],
};

/** A home's model (origin at its plot's centre, x along the street) and its height. */
export function homeModel(tier: PropertyTier, seed: number): { group: THREE.Group; h: number } {
  const g = new THREE.Group();
  const [W, D] = PLOT[tier];
  let h = 10;
  if (tier === 'mansion') {
    box(g, W, 0.12, D, mat('#5f9a45'));
    // Wall and gate.
    const wall = mat('#e8dfcc');
    box(g, W, 1.6, 0.5, wall, 0, 0, -D / 2);
    box(g, W, 1.6, 0.5, wall, 0, 0, D / 2);
    box(g, 0.5, 1.6, D, wall, -W / 2, 0, 0);
    box(g, 0.5, 1.6, D, wall, W / 2, 0, 0);
    box(g, 8, 0.14, D / 2, mat('#cfc6b4'), 0, 0, D / 4);
    const walls = mat(seed < 0.5 ? '#f1ece2' : '#e6dccb');
    const roof = mat(seed < 0.5 ? '#6d4a3a' : '#59616b');
    box(g, 24, 8, 14, walls, 0, 0, -4);
    windows(g, 24, 14, 2, 4, 0, -4);
    hipRoof(g, 24, 14, 5, roof, 8, 0, -4);
    for (const sx of [-1, 1]) {
      box(g, 10, 6, 11, walls, sx * 16, 0, -3);
      windows(g, 10, 11, 1, 4.5, sx * 16, -3);
      hipRoof(g, 10, 11, 3.5, roof, 6, sx * 16, -3);
    }
    // Portico.
    for (const sx of [-2.6, -0.9, 0.9, 2.6]) box(g, 0.6, 6, 0.6, walls, sx, 0, 3.6);
    box(g, 7, 0.6, 3, walls, 0, 6, 3.4);
    pool(g, 12, 5, 12, 12);
    for (const [x, z] of [
      [-22, 15],
      [-15, 16],
      [22, -15],
      [-22, -15],
      [21, 4],
    ] as const)
      tree(g, x, z, 0.9 + seed * 0.3);
    h = 14;
  } else if (tier === 'villa') {
    box(g, W, 0.12, D, mat('#6aa24e'));
    const white = mat('#f6f4ef', { rough: 0.6 });
    box(g, 18, 4, 12, white, -3, 0, -4);
    windows(g, 18, 12, 1, 4, -3, -4);
    box(g, 12, 3.6, 10, white, 2, 4, -5);
    windows(g, 12, 10, 1, 3.6, 2, -5, 4);
    box(g, 13, 0.4, 11, mat('#4a4f55'), 2, 7.6, -5);
    pool(g, 11, 4.5, 4, 9);
    tree(g, -14, 10);
    tree(g, 15, -10, 0.8);
    h = 8;
  } else if (tier === 'penthouse') {
    const glass = mat('#5d7a8c', { rough: 0.1, metal: 0.9 });
    const H = 78 + seed * 20;
    box(g, 22, H, 22, glass);
    windows(g, 22, 22, Math.floor(H / 3.6), 3.6);
    // The penthouse: a gold-lit glass crown and a roof terrace with a pool.
    box(
      g,
      16,
      4.5,
      16,
      mat('#dfe8ee', { rough: 0.1, metal: 0.5, emissive: '#ffcf7a', ei: 0.25 }),
      0,
      H,
      0,
    );
    box(g, 22, 0.3, 22, mat('#9a8f7e'), 0, H, 0);
    pool(g, 8, 3, 0, 8.5);
    g.children.at(-1)!.position.y = H + 0.3;
    g.children.at(-2)!.position.y = H + 0.3;
    h = H + 5;
  } else if (tier === 'townhouse') {
    const brick = mat(seed < 0.5 ? '#9a5a42' : '#c9b79c');
    box(g, 8, 11, 14, brick);
    windows(g, 8, 14, 3, 3.5);
    hipRoof(g, 8, 14, 3, mat('#4b5157'), 11);
    h = 14;
  } else {
    const c = mat(tier === 'studio' ? '#d9d4ca' : '#e3dccb');
    const H = tier === 'studio' ? 15 : 22;
    box(g, 20, H, 14, c);
    windows(g, 20, 14, Math.floor(H / 3.3), 3.3);
    // Your floor, lit gold.
    box(g, 20.3, 1.2, 14.3, GOLD(), 0, H * 0.62, 0);
    h = H;
  }
  // The marker: a gold diamond over the roof.
  const m = new THREE.Mesh(new THREE.OctahedronGeometry(2.2, 0).scale(1, 1.6, 1), GOLD());
  m.position.y = h + 9;
  m.name = 'marker';
  g.add(m);
  g.userData.h = h;
  return { group: g, h };
}

/** Windows light up as night falls. */
export function setHomesNight(n: number) {
  WINDOW().emissiveIntensity = n * 1.6;
}

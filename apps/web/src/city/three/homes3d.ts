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

/** Punched windows on a box's two long faces (they glow at night, like the bands). */
function punched(g: THREE.Object3D, w: number, d: number, floors: number, fh: number, bay = 3) {
  const n = Math.max(2, Math.floor(w / bay));
  for (let f = 0; f < floors; f++)
    for (let i = 0; i < n; i++)
      for (const sz of [-1, 1])
        box(
          g,
          1.3,
          1.4,
          0.12,
          WINDOW(),
          -w / 2 + (i + 0.5) * (w / n),
          f * fh + fh * 0.32,
          sz * (d / 2 + 0.03),
        );
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

/**
 * Player feedback: "This house is no different from the poor house (Lean),
 * and I selected Modest." Your rented home on the map, by lifestyle tier and
 * matching its housing label (and the home inside, ../../interiors3d/
 * hotel-tower.ts): a worn three-storey walk-up with water tanks on the roof
 * (a room in a shared flat), a tidy five-storey block with balconies (a
 * small flat), a modern tower with glass balconies (a good flat), a detached
 * house on its own plot (a house), a glass tower with a lit crown (a
 * penthouse). Your flat is lit gold. Origin at the plot's centre, the
 * entrance towards −z (the street); `w` × `d` is the plot.
 */
export function lifestyleHome(
  tier: number,
  w: number,
  d: number,
  seed = 0.5,
): { group: THREE.Group; h: number } {
  const t = Math.max(1, Math.min(5, Math.round(tier) || 2));
  if (t === 5) {
    const p = homeModel('penthouse', seed);
    p.group.getObjectByName('marker')?.removeFromParent();
    const s = Math.min(1, Math.min(w, d) / 22);
    p.group.scale.set(s, 1, s);
    return p;
  }
  const g = new THREE.Group();
  let h: number;
  if (t === 1) {
    // A walk-up: faded render, a damp band at its foot, a rusty stair hut and
    // black water tanks on the flat roof, a bare yard behind a low wall.
    const bw = Math.min(w * 0.85, 16);
    const bd = Math.min(d * 0.7, 11);
    const F = 3.1;
    h = 3 * F;
    box(g, w * 0.95, 0.08, d * 0.95, mat('#b59f7c', { rough: 1 }));
    box(g, w * 0.9, 1.0, 0.3, mat('#c9b48e'), 0, 0, -d / 2 + 0.6);
    box(g, bw, h, bd, mat(seed < 0.5 ? '#d6c39e' : '#cdb894', { rough: 0.95 }));
    box(g, bw + 0.06, 1.1, bd + 0.06, mat('#9c8b6c', { rough: 1 }));
    punched(g, bw, bd, 3, F, 2.6);
    // Your window, on the first floor (front and back).
    for (const sz of [-1, 1])
      box(g, 1.5, 1.5, 0.2, GOLD(), -bw * 0.22, F + 0.9, sz * (bd / 2 + 0.06));
    box(g, bw + 0.3, 0.3, bd + 0.3, mat('#a8977a'), 0, h);
    box(g, 3.2, 2.4, 3, mat('#8a4b2a', { rough: 0.9, metal: 0.3 }), bw / 2 - 2.4, h, bd / 2 - 2);
    for (const x of [-bw / 2 + 2, -bw / 2 + 4.2]) {
      const tank = new THREE.Mesh(
        new THREE.CylinderGeometry(0.9, 0.9, 1.9, 10).translate(0, 0.95, 0),
        mat('#15171c', { rough: 0.6 }),
      );
      tank.position.set(x, h + 0.3, bd / 2 - 2);
      tank.castShadow = true;
      g.add(tank);
    }
  } else if (t === 2) {
    // A tidy painted block: five storeys, two balconies a floor on the street
    // side, terracotta bands at each floor, the lift's housing on the roof.
    const bw = Math.min(w * 0.88, 18);
    const bd = Math.min(d * 0.72, 12);
    const F = 3.1;
    const floors = 5;
    h = floors * F;
    const wall = mat(seed < 0.5 ? '#f0e4cf' : '#ece2d0', { rough: 0.85 });
    const trim = mat('#c29a6b');
    const rail = mat('#3f3a36', { metal: 0.5, rough: 0.4 });
    box(g, w * 0.95, 0.08, d * 0.95, mat('#d6cfc2', { rough: 0.95 }));
    box(g, bw, h, bd, wall);
    punched(g, bw, bd, floors, F);
    for (let f = 1; f <= floors; f++) box(g, bw + 0.2, 0.25, bd + 0.2, trim, 0, f * F - 0.25);
    for (const sz of [-1, 1]) {
      for (let f = 1; f < floors; f++)
        for (const x of [-bw / 4, bw / 4]) {
          box(g, bw * 0.32, 0.2, 1.4, trim, x, f * F, sz * (bd / 2 + 0.7));
          box(g, bw * 0.32, 1.0, 0.08, rail, x, f * F + 0.2, sz * (bd / 2 + 1.35));
        }
      // Your flat, three floors up: its balconies lit gold.
      box(g, bw * 0.32, 1.0, 0.12, GOLD(), -bw / 4, 3 * F + 0.2, sz * (bd / 2 + 1.42));
    }
    box(g, 4, 2.6, 4, wall, bw / 2 - 3, h, 0);
    box(g, 4.4, 0.4, 1.8, mat('#7c5434'), 0, 2.6, -bd / 2 - 0.9);
    tree(g, -w * 0.4, -d * 0.4, 0.55);
    tree(g, w * 0.4, -d * 0.4, 0.55);
  } else if (t === 3) {
    // A modern tower: stone piers, glass, a glass-railed balcony on every
    // floor, a lit crown; your floor high up, lit gold.
    const bw = Math.min(w * 0.8, 17);
    const bd = Math.min(d * 0.7, 13);
    const F = 3.3;
    const floors = 11;
    h = floors * F;
    const stone = mat('#d3d9de', { rough: 0.6 });
    const glass = mat('#bfe3f0', { rough: 0.05, metal: 0.3 });
    box(g, w * 0.95, 0.08, d * 0.95, mat('#6aa24e'));
    box(g, 6, 0.1, d * 0.3, mat('#cfc6b4'), 0, 0, -d * 0.33);
    box(g, bw, h, bd, mat('#5d7a8c', { rough: 0.15, metal: 0.8 }));
    windows(g, bw, bd, floors, F);
    for (const sx of [-1, 1]) box(g, 1.2, h, bd + 0.2, stone, (sx * (bw - 1.2)) / 2, 0);
    for (const sz of [-1, 1]) {
      for (let f = 1; f <= floors; f++) {
        box(g, bw, 0.3, 2.2, stone, 0, f * F - 0.3, sz * (bd / 2 + 1.1));
        if (f < floors) box(g, bw, 1.0, 0.08, glass, 0, f * F, sz * (bd / 2 + 2.15));
      }
      box(g, bw + 0.4, 0.3, 0.12, GOLD(), 0, 9 * F + 0.9, sz * (bd / 2 + 2.25));
    }
    box(
      g,
      bw - 3,
      2.4,
      bd - 3,
      mat('#dfe8ee', { rough: 0.1, metal: 0.5, emissive: '#ffcf7a', ei: 0.3 }),
      0,
      h,
    );
    box(g, 6, 0.4, 3, mat('#2e3a46'), 0, 3.6, -bd / 2 - 1.6);
    for (const x of [-w * 0.4, w * 0.4]) tree(g, x, -d * 0.36, 0.7);
  } else {
    // A house of your own: two storeys under a hipped roof, a garage and its
    // drive, a lawn behind a hedge, trees.
    box(g, w * 0.95, 0.12, d * 0.95, mat('#5f9a45'));
    const walls = mat(seed < 0.5 ? '#f1ece2' : '#ece1cf');
    const hw = Math.min(w * 0.5, 13);
    const hd = Math.min(d * 0.42, 10);
    const hx = -w * 0.08;
    box(g, hw, 6.4, hd, walls, hx, 0, d * 0.05);
    windows(g, hw, hd, 2, 3.2, hx, d * 0.05);
    hipRoof(g, hw, hd, 3.6, mat('#6d4a3a'), 6.4, hx, d * 0.05);
    box(g, 5.5, 3, 6, walls, hx + hw / 2 + 2.8, 0, d * 0.08);
    box(g, 5.8, 0.3, 6.3, mat('#59616b'), hx + hw / 2 + 2.8, 3, d * 0.08);
    box(g, 4, 0.14, d * 0.45, mat('#cfc6b4'), hx + hw / 2 + 2.8, 0, -d * 0.25);
    const hedge = mat('#3f6f34', { rough: 1 });
    box(g, w * 0.95, 1.3, 0.9, hedge, 0, 0, -d * 0.47);
    box(g, 0.9, 1.3, d * 0.95, hedge, -w * 0.47, 0, 0);
    box(g, 0.9, 1.3, d * 0.95, hedge, w * 0.47, 0, 0);
    tree(g, -w * 0.35, -d * 0.3, 0.8);
    tree(g, w * 0.35, d * 0.3, 0.9);
    h = 10;
  }
  g.userData.h = h;
  return { group: g, h };
}

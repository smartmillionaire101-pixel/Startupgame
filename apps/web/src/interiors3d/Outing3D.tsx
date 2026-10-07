/**
 * Wave 10 §C: the lifestyle outings in 3D (lazy-loaded), each its own little
 * world built from the interiors kit: a yacht on the sea (by day, or at
 * sunset), a golf green or a polo field, a ballroom with chandeliers and
 * dancers, the cabin of a private jet with clouds racing past the windows,
 * a rooftop party under string lights with the city around.
 *
 * The 2D scene owns the timeline (`progress`, 0–1), the captions, Skip and
 * the result card; this view only draws the moment.
 */
import { useEffect, useRef, type ReactElement } from 'react';
import * as THREE from 'three';
import type { AvatarLook } from '../city/art';
import type { OutingKind } from '../city/outings';
import { makeCharacter, pose, type Character } from './character';
import { Particles, fx } from './fx';
import { Kit, disposeTree, mat } from './kit';
import { Stage, gestures } from './stage';

export interface Outing3DProps {
  kind: OutingKind;
  variant: string;
  me: AvatarLook;
  extras: AvatarLook[];
  /** 0–1 through the outing. */
  progress: () => number;
  onReady: () => void;
}

const ease = (u: number) => (u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2);
const seg = (k: number, a: number, b: number) => Math.max(0, Math.min(1, (k - a) / (b - a)));
const lerp = (a: number, b: number, u: number) => a + (b - a) * u;

const glass = (color = '#fde68a') => {
  const g = new THREE.Group();
  const m = new THREE.Mesh(
    new THREE.CylinderGeometry(0.035, 0.025, 0.14, 10),
    mat(color, { opacity: 0.85, rough: 0.1 }),
  );
  m.position.y = 0.05;
  g.add(m);
  return g;
};

interface World {
  root: THREE.Group;
  target: THREE.Vector3;
  span: number;
  azimuth: number;
  elevation: number;
  background: string;
  light: { sun: number; hemi: number; sunColor?: string; hemiColor?: string };
  update: (t: number, k: number, dt: number, ps: Particles) => void;
}

function person(root: THREE.Group, look: AvatarLook, id: string, x: number, z: number, ry = 0) {
  const c = makeCharacter(look, id);
  c.root.position.set(x, 0, z);
  c.root.rotation.y = ry;
  root.add(c.root);
  return c;
}

// ---------------------------------------------------------------- The yacht

function yacht(p: Outing3DProps): World {
  const root = new THREE.Group();
  const sunset = p.variant === 'sunset';
  // The sea: a wide plane with gentle waves.
  const seaGeo = new THREE.PlaneGeometry(80, 80, 40, 40);
  seaGeo.rotateX(-Math.PI / 2);
  const sea = new THREE.Mesh(
    seaGeo,
    mat(sunset ? '#1e3a8a' : '#0284c7', { rough: 0.25, metal: 0.15, own: true }),
  );
  sea.position.y = -0.3;
  sea.receiveShadow = true;
  root.add(sea);
  const base = (seaGeo.attributes.position!.array as Float32Array).slice();
  // The sun on the horizon (and its path on the water).
  const sun = new THREE.Mesh(
    new THREE.SphereGeometry(sunset ? 3.2 : 2.2, 24, 16),
    mat(sunset ? '#fb923c' : '#fef08a', {
      emissive: sunset ? '#f97316' : '#fde047',
      emissiveIntensity: 1.4,
    }),
  );
  sun.position.set(-6, sunset ? 1.2 : 9, -34);
  root.add(sun);
  const glint = new THREE.Mesh(
    new THREE.PlaneGeometry(3, 30),
    mat(sunset ? '#fdba74' : '#e0f2fe', {
      opacity: 0.35,
      emissive: '#fde68a',
      emissiveIntensity: 0.4,
    }),
  );
  glint.rotation.x = -Math.PI / 2;
  glint.position.set(-5, -0.28, -18);
  root.add(glint);
  // A distant coast.
  const coast = new Kit();
  for (let i = 0; i < 9; i++)
    coast.box(
      3 + (i % 3),
      1 + ((i * 7) % 5) * 0.6,
      2,
      i % 2 ? '#64748b' : '#475569',
      12 + i * 3.2,
      -0.3,
      -30 + (i % 2),
    );
  root.add(coast.build());
  // The yacht: hull, deck, cabin, rails, a mast.
  const boat = new THREE.Group();
  const k = new Kit();
  k.box(3.2, 0.9, 9, '#f8fafc', 0, -0.6, 0, { round: 0.3 });
  k.cyl(0.0, 1.6, 2.6, '#f8fafc', 0, -0.6, -5.3, { rx: -Math.PI / 2, seg: 4, ry: Math.PI / 4 });
  k.box(3.0, 0.08, 8.8, '#b7895a', 0, 0.3, 0.1, { rough: 0.6 });
  k.box(2.2, 1.2, 3.2, '#e2e8f0', 0, 0.38, -1.6, { round: 0.15 });
  k.box(2.24, 0.45, 3.0, '#0f172a', 0, 1.0, -1.6, { opacity: 0.85, rough: 0.1 });
  k.box(2.4, 0.08, 3.6, '#f1f5f9', 0, 1.58, -1.6);
  k.cyl(0.05, 0.06, 6.5, '#e5e7eb', 0, 1.6, -1.2);
  for (const x of [-1.5, 1.5]) k.box(0.04, 0.05, 8.4, '#cbd5e1', x, 1.0, 0.2, { metal: 0.6 });
  for (let i = 0; i < 9; i++)
    for (const x of [-1.5, 1.5]) k.cyl(0.02, 0.02, 0.7, '#cbd5e1', x, 0.32, -3.8 + i * 1.0);
  // Loungers and cushions aft.
  for (const x of [-0.7, 0.7]) {
    k.box(0.7, 0.25, 1.7, '#f8fafc', x, 0.38, 2.4, { round: 0.06 });
    k.box(0.66, 0.06, 1.6, sunset ? '#fb7185' : '#0ea5e9', x, 0.63, 2.4, { round: 0.03 });
  }
  k.cyl(0.45, 0.45, 0.06, '#f8fafc', 0, 0.7, 0.9, { seg: 20 });
  k.cyl(0.06, 0.06, 0.4, '#e5e7eb', 0, 0.32, 0.9);
  boat.add(k.build());
  root.add(boat);
  const me = person(boat, p.me, 'me', 0.7, 2.4, Math.PI);
  holdIn(me, glass(sunset ? '#fb7185' : '#fde68a'));
  const guests = p.extras
    .slice(0, 3)
    .map((look, i) =>
      person(boat, look, `guest:${i}`, -0.9 + i * 0.6, 0.4 + (i % 2) * 0.5, i % 2 ? 0.6 : -0.4),
    );
  guests.forEach((g, i) => i < 2 && holdIn(g, glass()));
  const skipper = person(boat, p.extras[3] ?? p.extras[0] ?? p.me, 'skipper', 0, -0.3, Math.PI);
  return {
    root,
    target: new THREE.Vector3(0, 0.6, 0.4),
    span: 11,
    azimuth: 0.9,
    elevation: 0.45,
    background: sunset ? '#7c2d12' : '#7dd3fc',
    light: sunset
      ? { sun: 1.4, hemi: 0.9, sunColor: '#fdba74', hemiColor: '#fed7aa' }
      : { sun: 2.0, hemi: 1.3 },
    update(t, k, dt, ps) {
      const pos = seaGeo.attributes.position!;
      const arr = pos.array as Float32Array;
      for (let i = 0; i < arr.length; i += 3)
        arr[i + 1] =
          base[i + 1]! +
          Math.sin(base[i]! * 0.35 + t * 1.3) * 0.12 +
          Math.cos(base[i + 2]! * 0.3 + t) * 0.1;
      pos.needsUpdate = true;
      boat.rotation.z = Math.sin(t * 0.9) * 0.025;
      boat.rotation.x = Math.sin(t * 0.7) * 0.015;
      boat.position.y = Math.sin(t * 1.1) * 0.05;
      boat.position.z = -k * 2;
      glint.material.opacity = 0.25 + Math.sin(t * 2) * 0.08;
      // You lounge, then stand at the rail and toast the view.
      const standing = k > 0.45;
      if (standing) {
        me.root.position.set(
          lerp(0.7, 1.1, seg(k, 0.45, 0.55)),
          0.34,
          lerp(2.4, -3.2, ease(seg(k, 0.45, 0.6))),
        );
        me.root.rotation.y = Math.PI;
        pose(me, k > 0.62 ? (k > 0.85 ? 'cheer' : 'drink') : 'walk', t);
      } else {
        me.root.position.set(0.7, 0.34, 2.4);
        me.root.rotation.y = 0;
        pose(me, 'lie', t);
        me.body.rotation.x = -0.5;
        me.body.position.y = 0.45;
      }
      guests.forEach((g, i) => {
        g.root.position.y = 0.34;
        pose(g, i === 2 ? 'chat' : k > 0.85 ? 'cheer' : 'drink', t, { phase: i });
      });
      skipper.root.position.y = 0.34;
      pose(skipper, 'stand', t);
      if (k > 0.85) fx.sparkle(ps, new THREE.Vector3(1.1, 2.2, -3.2 - k * 2), dt, '#fde047', 10);
    },
  };
}

// ---------------------------------------------------------------- Golf and polo

function golf(p: Outing3DProps): World {
  const root = new THREE.Group();
  const polo = p.variant === 'polo';
  const k = new Kit();
  k.box(60, 0.2, 60, '#4d7c0f', 0, -0.2, 0, { rough: 1 });
  // Mown stripes.
  for (let i = -6; i < 6; i++)
    k.box(60, 0.005, 2.5, i % 2 ? '#65a30d' : '#4d8a12', 0, 0, i * 5 + 1.25, { noShadow: true });
  // Trees around.
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const x = Math.cos(a) * (15 + (i % 3) * 2);
    const z = Math.sin(a) * (13 + (i % 2) * 3) - 2;
    k.cyl(0.15, 0.2, 1.6, '#6b4a2f', x, 0, z);
    k.sphere(1.3, i % 2 ? '#166534' : '#15803d', x, 2.4, z, { seg: 9 });
  }
  let flag: THREE.Group | null = null;
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), mat('#ffffff'));
  if (!polo) {
    // The green, the hole, the flag, a bunker.
    k.cyl(4, 4.2, 0.02, '#84cc16', 0, 0, -8, { seg: 32 });
    k.cyl(0.12, 0.12, 0.03, '#111827', 0, 0, -8, { seg: 12 });
    k.cyl(2, 2.2, 0.02, '#fde68a', 4.5, 0, -4.5, { seg: 20 });
    flag = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 2.2, 6), mat('#f8fafc'));
    pole.position.y = 1.1;
    const cloth = new THREE.Mesh(
      new THREE.PlaneGeometry(0.6, 0.4),
      mat('#ef4444', { side: THREE.DoubleSide }),
    );
    cloth.position.set(0.3, 1.95, 0);
    flag.add(pole, cloth);
    flag.position.set(0, 0, -8);
    root.add(flag);
    // The tee.
    k.box(1.4, 0.04, 1.4, '#a3e635', 0, 0, 5);
    root.add(ball);
  } else {
    // Goal posts at both ends, a stand.
    for (const z of [-12, 12])
      for (const x of [-1.8, 1.8]) k.cyl(0.12, 0.12, 2.2, '#f8fafc', x, 0, z);
    k.box(10, 1.4, 2, '#f1f5f9', 9, 0, 4, { round: 0.1 });
    k.box(10, 0.2, 2.4, '#1e3a8a', 9, 1.4, 4);
    root.add(ball);
  }
  root.add(k.build());
  const me = person(
    root,
    p.me,
    'me',
    polo ? 9 : 0.5,
    polo ? 2.4 : 5.1,
    polo ? -Math.PI / 2 : -Math.PI / 2,
  );
  const caddie = person(root, p.extras[0] ?? p.me, 'caddie', -1.2, 5.6, Math.PI * 0.85);
  // Polo: riders on horses circling.
  const riders: { horse: THREE.Group; rider: Character }[] = [];
  if (polo)
    for (let i = 0; i < 4; i++) {
      const horse = new THREE.Group();
      const hk = new Kit();
      const coat = ['#7c2d12', '#292524', '#a16207', '#57534e'][i]!;
      hk.box(0.55, 0.6, 1.5, coat, 0, 0.9, 0, { round: 0.2 });
      hk.box(0.3, 0.7, 0.35, coat, 0, 1.3, 0.75, { rx: -0.5, round: 0.1 });
      hk.box(0.25, 0.25, 0.5, coat, 0, 1.75, 1.0, { round: 0.08 });
      for (const [x, z] of [
        [-0.18, 0.55],
        [0.18, 0.55],
        [-0.18, -0.55],
        [0.18, -0.55],
      ] as const)
        hk.cyl(0.06, 0.05, 0.95, coat, x, 0, z, { seg: 6 });
      horse.add(hk.build());
      const rider = makeCharacter(
        p.extras[(i + 1) % Math.max(1, p.extras.length)] ?? p.me,
        `rider:${i}`,
      );
      rider.root.position.set(0, 0.85, 0);
      horse.add(rider.root);
      root.add(horse);
      riders.push({ horse, rider });
    }
  return {
    root,
    target: new THREE.Vector3(polo ? 3 : 0, 0.4, polo ? 0 : -1),
    span: polo ? 22 : 16,
    azimuth: polo ? 0.5 : 0.35,
    elevation: 0.55,
    background: '#bae6fd',
    light: { sun: 2.0, hemi: 1.3 },
    update(t, k, dt, ps) {
      if (flag) (flag.children[1] as THREE.Mesh).rotation.y = Math.sin(t * 4) * 0.3;
      if (!polo) {
        // Address, swing, the ball's flight, it drops by the pin, you cheer.
        const swing = seg(k, 0.25, 0.32);
        const fly = ease(seg(k, 0.32, 0.72));
        me.root.position.set(0.5, 0, 5.1);
        me.root.rotation.y = -Math.PI / 2;
        pose(me, k > 0.75 ? 'cheer' : 'stand', t);
        if (k <= 0.75) {
          const back = k < 0.25 ? seg(k, 0.1, 0.25) : 1 - swing * 2;
          me.armL.rotation.x = me.armR.rotation.x = -0.6 - back * 1.6;
          me.armL.rotation.z = 0.3;
          me.armR.rotation.z = -0.1;
          me.torso.rotation.y = back * 0.8;
        }
        ball.position.set(
          lerp(0, 0.4, fly),
          0.06 + Math.sin(fly * Math.PI) * 6 * (k < 0.32 ? 0 : 1),
          lerp(5, -7.6, fly),
        );
        if (k > 0.72 && k < 0.8)
          fx.sparkle(ps, new THREE.Vector3(0.4, 0.3, -7.6), dt, '#fde047', 14);
        pose(caddie, k > 0.75 ? 'clap' : 'stand', t);
      } else {
        // The chukka: riders chase the ball; you cheer from the stand.
        me.root.position.set(9, 1.6, 4);
        me.root.rotation.y = 0;
        pose(me, Math.sin(t * 3) > 0 && k > 0.4 ? 'cheer' : 'clap', t);
        caddie.root.position.set(10, 1.6, 4);
        caddie.root.rotation.y = 0;
        pose(caddie, 'clap', t, { phase: 2 });
        const bz = Math.sin(k * Math.PI * 3) * 9;
        const bx = Math.sin(k * Math.PI * 5) * 3;
        ball.position.set(bx, 0.06, bz);
        riders.forEach(({ horse, rider }, i) => {
          const lag = (i + 1) * 0.9;
          const hz = Math.sin((k - lag * 0.02) * Math.PI * 3) * 9 + (i % 2 ? 1.2 : -1.2);
          const hx = Math.sin((k - lag * 0.02) * Math.PI * 5) * 3 + (i - 1.5) * 0.8;
          const dz = Math.cos(k * Math.PI * 3);
          horse.position.set(hx, Math.abs(Math.sin(t * 9 + i)) * 0.12, hz);
          horse.rotation.y = dz >= 0 ? 0 : Math.PI;
          pose(rider, 'sit', t, { seat: 0.05, phase: i });
        });
      }
    },
  };
}

// ---------------------------------------------------------------- A gala

function gala(p: Outing3DProps): World {
  const root = new THREE.Group();
  const charity = p.variant === 'charity';
  const k = new Kit();
  // Marble floor, a dark back wall, columns, chandeliers.
  k.box(18, 0.1, 14, '#e7e5e4', 0, -0.1, 0, { rough: 0.3, metal: 0.05 });
  for (let i = -4; i < 4; i++)
    for (let j = -3; j < 3; j++)
      if ((i + j) % 2 === 0)
        k.box(2, 0.005, 2, '#d6d3d1', i * 2 + 1, 0, j * 2 + 1, { noShadow: true });
  k.box(18, 6, 0.3, '#3b0764', 0, 0, -7);
  for (let i = 0; i < 6; i++) k.cyl(0.35, 0.4, 6, '#f5f5f4', -7.5 + i * 3, 0, -6.4, { seg: 16 });
  // The stage (a band, or the auctioneer).
  k.box(6, 0.5, 2.2, '#7c2d12', 0, 0, -5.4);
  k.box(6.2, 0.06, 2.4, '#fbbf24', 0, 0.5, -5.4);
  k.box(4, 2.4, 0.05, '#581c87', 0, 2.4, -6.8, { emissive: '#7e22ce', emissiveIntensity: 0.3 });
  // Round tables with white cloths and candles.
  for (const [x, z] of [
    [-5.5, -1],
    [5.5, -1],
    [-5.5, 3.5],
    [5.5, 3.5],
  ] as const) {
    k.cyl(1.1, 1.15, 0.75, '#f8fafc', x, 0, z, { seg: 24 });
    k.cyl(0.03, 0.03, 0.25, '#fef3c7', x, 0.75, z, { emissive: '#fde68a', emissiveIntensity: 1 });
    for (let s = 0; s < 6; s++) {
      const a = (s / 6) * Math.PI * 2;
      k.box(0.4, 0.45, 0.4, '#b45309', x + Math.cos(a) * 1.5, 0, z + Math.sin(a) * 1.5, {
        round: 0.05,
      });
    }
  }
  root.add(k.build());
  const chandeliers: THREE.Mesh[] = [];
  for (const x of [-4, 0, 4]) {
    const c = new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 14, 10),
      mat('#fef3c7', { emissive: '#fde68a', emissiveIntensity: 1.6, opacity: 0.9, own: true }),
    );
    c.position.set(x, 4.6, 0.5);
    root.add(c);
    chandeliers.push(c);
    const l = new THREE.PointLight('#ffe4b5', 6, 9, 1.5);
    l.position.set(x, 4.2, 0.5);
    root.add(l);
  }
  const me = person(root, p.me, 'me', 0.4, 1.2, 0);
  const partner = person(root, p.extras[0] ?? p.me, 'partner', -0.4, 1.4, Math.PI);
  const dancers = [1, 2, 3, 4].map((i) =>
    person(
      root,
      p.extras[i % Math.max(1, p.extras.length)] ?? p.me,
      `dancer:${i}`,
      -2.5 + (i % 2) * 5,
      0.4 + Math.floor(i / 3) * 2.2,
      i * 0.9,
    ),
  );
  const host = person(root, p.extras[5 % Math.max(1, p.extras.length)] ?? p.me, 'host', 0, -5.4, 0);
  host.root.position.y = 0.55;
  if (charity) holdIn(host, glass('#fbbf24'));
  return {
    root,
    target: new THREE.Vector3(0, 0.8, -0.6),
    span: 13,
    azimuth: 0.25,
    elevation: 0.55,
    background: '#1e1b4b',
    light: { sun: 0.7, hemi: 0.8, sunColor: '#fde68a', hemiColor: '#e9d5ff' },
    update(t, k, dt, ps) {
      chandeliers.forEach((c, i) => {
        (c.material as THREE.MeshStandardMaterial).emissiveIntensity =
          1.4 + Math.sin(t * 2 + i) * 0.2;
      });
      // A waltz: you and your partner turn on the floor.
      const a = t * 0.9;
      const r = 0.45;
      me.root.position.set(Math.cos(a) * r, 0, 1.2 + Math.sin(a) * r);
      partner.root.position.set(-Math.cos(a) * r, 0, 1.2 - Math.sin(a) * r);
      me.root.rotation.y = -a + Math.PI / 2;
      partner.root.rotation.y = -a - Math.PI / 2;
      pose(me, k > 0.85 ? 'cheer' : 'dance', t);
      pose(partner, 'dance', t, { phase: 1 });
      dancers.forEach((d, i) => {
        d.root.rotation.y = t * (i % 2 ? 0.8 : -0.8);
        pose(d, 'dance', t, { phase: i + 2 });
      });
      pose(host, charity ? (k > 0.5 && k < 0.7 ? 'cheer' : 'present') : 'play', t);
      if (charity && k > 0.55 && k < 0.7)
        fx.sparkle(ps, new THREE.Vector3(0, 2.6, -5.2), dt, '#fde047', 12);
      if (k > 0.85) fx.hearts(ps, new THREE.Vector3(0, 2.2, 1.2), dt);
    },
  };
}

// ---------------------------------------------------------------- A private jet

function jet(p: Outing3DProps): World {
  const root = new THREE.Group();
  const k = new Kit();
  // The cabin, cut away: a floor, the far wall with oval windows, the ceiling arch.
  const L = 10;
  k.box(2.8, 0.1, L, '#d6c7a1', 0, -0.1, 0, { rough: 0.9 });
  k.box(2.6, 0.01, L - 0.4, '#1e3a8a', 0, 0, 0, { noShadow: true });
  const wall = new THREE.Mesh(
    new THREE.CylinderGeometry(1.7, 1.7, L, 32, 1, true, Math.PI, Math.PI / 1.4),
    mat('#f5f0e6', { side: THREE.DoubleSide, rough: 0.6 }),
  );
  wall.rotation.x = Math.PI / 2;
  wall.position.set(0, 1.1, 0);
  root.add(wall);
  // Leather seats facing each other, a table between.
  const seats: [number, number, number][] = [
    [-0.75, -2.4, 0],
    [-0.75, -0.6, Math.PI],
    [0.75, 1.4, 0],
    [0.75, 3.2, Math.PI],
  ];
  for (const [x, z, ry] of seats) {
    k.box(0.85, 0.45, 0.85, '#e7d8b8', x, 0, z, { round: 0.12, ry });
    k.box(0.85, 0.75, 0.2, '#e7d8b8', x, 0.45, z + (ry ? 0.35 : -0.35), { round: 0.08 });
  }
  k.box(0.7, 0.05, 0.9, '#7c4a2a', -0.75, 0.62, -1.5, { round: 0.02 });
  k.cyl(0.05, 0.08, 0.62, '#9ca3af', -0.75, 0, -1.5);
  root.add(k.build());
  // Windows on the far side with sky and clouds moving behind.
  const sky = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 8),
    mat('#38bdf8', { emissive: '#7dd3fc', emissiveIntensity: 0.6 }),
  );
  sky.position.set(-5, 1.6, 0);
  sky.rotation.y = Math.PI / 2;
  root.add(sky);
  const clouds = new THREE.Group();
  for (let i = 0; i < 14; i++) {
    const c = new THREE.Mesh(
      new THREE.SphereGeometry(0.5 + (i % 3) * 0.25, 10, 8),
      mat('#ffffff', { emissive: '#ffffff', emissiveIntensity: 0.5, opacity: 0.95 }),
    );
    c.scale.set(1, 0.5, 1.6);
    c.position.set(-4, 0.6 + (i % 4) * 0.5, -10 + i * 1.6);
    clouds.add(c);
  }
  root.add(clouds);
  const winGeo = new THREE.CircleGeometry(0.22, 18);
  winGeo.scale(1, 1.4, 1);
  for (let i = 0; i < 6; i++) {
    const frame = new THREE.Mesh(new THREE.RingGeometry(0.22, 0.3, 18), mat('#e5e7eb'));
    frame.scale.set(1, 1.4, 1);
    frame.position.set(-1.52, 1.35, -3.5 + i * 1.4);
    frame.rotation.y = Math.PI / 2;
    root.add(frame);
  }
  // Holes in the wall are faked with a dark band; the sky shows above the cut.
  const me = person(root, p.me, 'me', -0.75, -2.4, 0);
  holdIn(me, glass('#fef3c7'));
  const guest = person(root, p.extras[0] ?? p.me, 'guest', -0.75, -0.6, Math.PI);
  const crew = person(root, p.extras[1] ?? p.me, 'crew', 0.4, 0.4, -Math.PI / 2);
  return {
    root,
    target: new THREE.Vector3(-0.2, 0.9, -0.5),
    span: 6.5,
    azimuth: 1.2,
    elevation: 0.42,
    background: '#0c4a6e',
    light: { sun: 1.4, hemi: 1.2 },
    update(t, k, dt) {
      clouds.children.forEach((c, i) => {
        c.position.z += dt * (3 + (i % 3));
        if (c.position.z > 12) c.position.z = -12;
      });
      const landing = k > 0.78;
      (sky.material as THREE.MeshStandardMaterial).color.set(landing ? '#fdba74' : '#38bdf8');
      root.rotation.z = Math.sin(t * 0.8) * 0.01 + (landing ? -0.03 * seg(k, 0.78, 0.9) : 0);
      me.root.position.set(-0.75, 0, -2.4);
      pose(me, k > 0.3 && k < 0.6 ? 'drink' : k > 0.9 ? 'wave' : 'sit', t, { seat: 0.45 });
      if (!(k > 0.9)) {
        if (k > 0.3 && k < 0.6) {
          me.body.position.y = 0.45 - 0.82 + 0.04;
          me.thighL.rotation.x = me.thighR.rotation.x = -Math.PI / 2 + 0.08;
          me.shinL.rotation.x = me.shinR.rotation.x = Math.PI / 2 - 0.08;
        }
      }
      pose(guest, 'sit', t, { seat: 0.45, phase: 2 });
      // The attendant brings the champagne down the aisle.
      const walk = seg(k, 0.1, 0.3);
      crew.root.position.set(0.25, 0, lerp(3, -1.6, ease(walk)));
      crew.root.rotation.y = Math.PI;
      pose(crew, walk > 0 && walk < 1 ? 'walk' : 'chat', t);
    },
  };
}

// ---------------------------------------------------------------- A rooftop party

function rooftop(p: Outing3DProps): World {
  const root = new THREE.Group();
  const k = new Kit();
  k.box(14, 0.2, 10, '#3f3f46', 0, -0.2, 0, { rough: 0.9 });
  k.box(14, 0.005, 10, '#52525b', 0, 0, 0, { noShadow: true });
  // Parapet with glass, the DJ booth, a bar, planters.
  for (const [w, d, x, z] of [
    [14, 0.15, 0, -5],
    [14, 0.15, 0, 5],
    [0.15, 10, -7, 0],
    [0.15, 10, 7, 0],
  ] as const)
    k.box(w, 1.0, d, '#bfe3f0', x, 0, z, { opacity: 0.35, noShadow: true });
  k.box(2.4, 1.1, 0.8, '#18181b', 0, 0, -3.8, { round: 0.05 });
  k.box(2.2, 0.08, 0.6, '#a855f7', 0, 1.1, -3.8, { emissive: '#a855f7', emissiveIntensity: 1 });
  k.box(3, 1.1, 0.7, '#78350f', 5, 0, -3, { round: 0.04 });
  for (const x of [-6.2, 6.2]) {
    k.box(0.8, 0.6, 0.8, '#57534e', x, 0, 4.2);
    k.sphere(0.6, '#15803d', x, 1.0, 4.2, { seg: 8 });
  }
  // The city around: towers with lit windows.
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * Math.PI * 2;
    const r = 16 + (i % 4) * 3;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r - 4;
    const h = 4 + ((i * 37) % 13);
    k.box(3, h + 8, 3, i % 2 ? '#1e293b' : '#334155', x, -12, z);
    k.box(3.04, h + 6, 3.04, '#fde68a', x, -11, z, {
      opacity: 0.18,
      emissive: '#fbbf24',
      emissiveIntensity: 0.8,
      noShadow: true,
    });
  }
  root.add(k.build());
  // String lights: bulbs on catenaries.
  const bulbs: THREE.Mesh[] = [];
  const colors = ['#fde68a', '#f9a8d4', '#a5f3fc', '#fdba74'];
  for (let line = 0; line < 4; line++) {
    const z = -3 + line * 2;
    for (let i = 0; i <= 14; i++) {
      const x = -7 + i;
      const y = 2.8 - Math.sin((i / 14) * Math.PI) * 0.6;
      const b = new THREE.Mesh(
        new THREE.SphereGeometry(0.07, 8, 6),
        mat(colors[(i + line) % 4]!, {
          emissive: colors[(i + line) % 4]!,
          emissiveIntensity: 2,
          own: true,
        }),
      );
      b.position.set(x, y, z);
      root.add(b);
      bulbs.push(b);
    }
  }
  const glow = new THREE.PointLight('#f0abfc', 8, 12, 1.5);
  glow.position.set(0, 2.5, 0);
  root.add(glow);
  const me = person(root, p.me, 'me', 0, 0.8, 0);
  const dj = person(root, p.extras[0] ?? p.me, 'dj', 0, -4.4, 0);
  const crowd = [1, 2, 3, 4, 5, 6].map((i) => {
    const look = p.extras[i % Math.max(1, p.extras.length)] ?? p.me;
    return person(
      root,
      look,
      `crowd:${i}`,
      -3 + (i % 3) * 2.4 + (i > 3 ? 1 : 0),
      -1.5 + Math.floor(i / 3.5) * 2.6,
      i,
    );
  });
  crowd.forEach((c, i) => i % 2 && holdIn(c, glass('#f472b6')));
  return {
    root,
    target: new THREE.Vector3(0, 0.8, -0.6),
    span: 12,
    azimuth: 0.35,
    elevation: 0.5,
    background: '#0b1020',
    light: { sun: 0.35, hemi: 0.55, sunColor: '#c4b5fd', hemiColor: '#c7d2fe' },
    update(t, k, dt, ps) {
      bulbs.forEach((b, i) => {
        (b.material as THREE.MeshStandardMaterial).emissiveIntensity =
          1.5 + Math.sin(t * 3 + i * 0.7) * 0.8;
      });
      glow.color.setHSL((t * 0.05) % 1, 0.8, 0.7);
      pose(dj, 'play', t);
      crowd.forEach((c, i) =>
        pose(c, k > 0.6 ? (i % 3 ? 'dance' : 'cheer') : i % 2 ? 'drink' : 'dance', t, { phase: i }),
      );
      pose(me, k > 0.85 ? 'cheer' : 'dance', t);
      me.root.rotation.y = Math.sin(t * 0.6) * 0.4;
      fx.notes(ps, new THREE.Vector3(0, 2, -4), dt, '#e879f9');
      if (k > 0.85) fx.sparkle(ps, new THREE.Vector3(0, 2.4, 0.8), dt, '#f0abfc', 14);
    },
  };
}

function holdIn(c: Character, obj: THREE.Object3D) {
  c.handR.add(obj);
  return obj;
}

const BUILD: Record<OutingKind, (p: Outing3DProps) => World> = { yacht, golf, gala, jet, rooftop };

export default function Outing3D(props: Outing3DProps): ReactElement | null {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const live = useRef(props);
  useEffect(() => {
    live.current = props;
  });
  useEffect(() => {
    const canvas = canvasRef.current!;
    const parent = canvas.parentElement!;
    const w = BUILD[live.current.kind](live.current);
    let stage: Stage;
    try {
      stage = new Stage(canvas, {
        target: w.target,
        span: w.span,
        azimuth: w.azimuth,
        elevation: w.elevation,
        minAzimuth: w.azimuth - 0.9,
        maxAzimuth: w.azimuth + 0.9,
        minElevation: 0.25,
        maxElevation: 1.2,
        background: w.background,
        shadowSize: Math.max(8, w.span),
        shadowMap: 1024,
        maxFps: 30,
      });
    } catch {
      disposeTree(w.root);
      return;
    }
    const r = parent.getBoundingClientRect();
    stage.setSize(r.width, r.height);
    const ro = new ResizeObserver(() => {
      const b = parent.getBoundingClientRect();
      stage.setSize(b.width, b.height);
    });
    ro.observe(parent);
    stage.scene.add(w.root);
    stage.sun.intensity = w.light.sun;
    stage.hemi.intensity = w.light.hemi;
    if (w.light.sunColor) stage.sun.color.set(w.light.sunColor);
    if (w.light.hemiColor) stage.hemi.color.set(w.light.hemiColor);
    const particles = new Particles();
    stage.scene.add(particles.group);
    let sent = false;
    stage.onFrame = () => {
      if (!sent) {
        sent = true;
        live.current.onReady();
      }
    };
    const off = stage.add((t, dt) => {
      w.update(t, Math.max(0, Math.min(1, live.current.progress())), dt, particles);
      particles.update(dt);
      return true;
    });
    const offG = gestures(canvas, {
      tap: () => {},
      orbit: (dx, dy) => stage.orbit(dx, dy),
      zoom: (f) => stage.zoomBy(f),
    });
    return () => {
      off();
      offG();
      ro.disconnect();
      disposeTree(w.root);
      stage.dispose();
    };
  }, []);
  return <canvas ref={canvasRef} className="room-3d" aria-hidden="true" data-outing-3d="" />;
}

/**
 * Wave 12: the home's own models, on top of the furniture library
 * (./furniture.ts): cars drawn by type (a saloon, a boxy SUV, a low
 * supercar, a classic, a motorbike), the delivery van and its boxes, the
 * garages (a glass showroom, a steel carport), the gate, hedges, palms,
 * wall sconces, a kitchen island with stools, a guest bed with bedside
 * tables and the invisible tap targets over the pool and the hot tub. All
 * built from primitives with `Kit`, front facing +z, floor at y = 0.
 */
import * as THREE from 'three';
import { Kit, contactShadow, tone } from './kit';
import { buildModel, chairAt, type Model, type ModelOpts } from './furniture';
import { HOTEL_BUILDERS } from './hotel-models';

/** Car paint by model (the reference's black SUVs, a blue supercar, a silver saloon). */
const CAR_PAINT: Record<string, string> = {
  motorbike: '#b91c1c',
  hatchback: '#c9ced6',
  'ride-hail-sedan': '#16181d',
  'city-suv': '#121418',
  electric: '#f4f6f8',
  luxury: '#1e5bd8',
  classic: '#0f766e',
};

const BLACK = '#16161a';
const CHROME = '#d9dde3';
const GLASS_DARK = '#1b2433';
const metal = { metal: 0.65, rough: 0.3 };

type Builder = (k: Kit, o: ModelOpts, m: Model) => void;

// ---------------------------------------------------------------------------
// Cars

function wheel(k: Kit, x: number, z: number, r: number, wdt: number, rim = CHROME) {
  k.cyl(r, r, wdt, BLACK, x, r, z, { rz: Math.PI / 2, seg: 20, rough: 0.9 });
  k.cyl(r * 0.62, r * 0.62, wdt + 0.02, rim, x, r, z, { rz: Math.PI / 2, seg: 14, ...metal });
  k.cyl(r * 0.18, r * 0.18, wdt + 0.04, '#6b7280', x, r, z, { rz: Math.PI / 2, seg: 8, ...metal });
}

/** A car about 4.5 m long along z, nose at +z. */
function car(kind: string, paint: string): Builder {
  return (k, _o, m) => {
    const p = { rough: 0.18, metal: 0.55 };
    if (kind === 'motorbike') {
      wheel(k, 0, 0.7, 0.32, 0.12);
      wheel(k, 0, -0.7, 0.32, 0.14);
      k.box(0.26, 0.34, 1.0, paint, 0, 0.42, 0.05, { round: 0.1, ...p });
      k.box(0.3, 0.12, 0.6, BLACK, 0, 0.78, -0.25, { round: 0.05 });
      k.box(0.22, 0.26, 0.34, paint, 0, 0.72, 0.38, { round: 0.08, ...p });
      k.cyl(0.02, 0.02, 0.72, CHROME, 0, 0.98, 0.5, { rz: Math.PI / 2, ...metal });
      k.cyl(0.05, 0.05, 0.7, CHROME, 0.14, 0.32, -0.45, { rx: Math.PI / 2 - 0.15, ...metal });
      m.seats.push(new THREE.Vector3(0, 0.82, -0.2));
      return;
    }
    const suv = kind === 'city-suv';
    const sup = kind === 'luxury';
    const classic = kind === 'classic';
    const hatch = kind === 'hatchback';
    const L = sup ? 4.5 : suv ? 4.7 : hatch ? 3.9 : classic ? 4.4 : 4.7;
    const W = sup ? 2.0 : suv ? 1.95 : 1.82;
    const r = sup ? 0.34 : suv ? 0.42 : 0.33;
    const clear = sup ? 0.12 : suv ? 0.3 : 0.18;
    const bodyH = sup ? 0.5 : suv ? 0.85 : classic ? 0.52 : 0.6;
    const wz = L * (sup ? 0.32 : 0.34);
    // Lower body: a rounded slab, slightly tapered ends.
    k.box(W, bodyH, L, paint, 0, clear, 0, { round: sup ? 0.2 : suv ? 0.1 : 0.16, ...p });
    if (sup) {
      // A wedge nose and wide rear haunches.
      k.box(W - 0.1, 0.18, 1.2, paint, 0, clear + bodyH - 0.08, L / 2 - 0.75, {
        round: 0.12,
        rx: 0.12,
        ...p,
      });
      for (const sx of [-1, 1])
        k.box(0.3, 0.28, 1.3, paint, sx * (W / 2 - 0.12), clear + bodyH - 0.1, -L * 0.22, {
          round: 0.12,
          ...p,
        });
      // Air intakes.
      for (const sx of [-1, 1])
        k.box(0.04, 0.2, 0.6, BLACK, sx * (W / 2 + 0.005), clear + 0.18, -L * 0.12);
      k.box(W * 0.8, 0.06, 0.3, BLACK, 0, clear + bodyH + 0.04, -L / 2 + 0.25, { round: 0.02 });
    }
    if (classic) {
      // Round fenders over the wheels and chrome bumpers.
      for (const sx of [-1, 1])
        for (const sz of [-1, 1])
          k.sphere(0.48, paint, sx * (W / 2 - 0.22), clear + 0.42, sz * wz, {
            sx: 0.6,
            sy: 0.55,
            sz: 1.2,
            ...p,
          });
      for (const sz of [-1, 1])
        k.box(W + 0.06, 0.1, 0.08, CHROME, 0, clear + 0.08, sz * (L / 2 + 0.02), metal);
    }
    // Cabin and glass.
    const cabinL = sup
      ? L * 0.4
      : suv
        ? L * 0.62
        : hatch
          ? L * 0.55
          : classic
            ? L * 0.32
            : L * 0.48;
    const cabinZ = sup
      ? -L * 0.06
      : suv
        ? -L * 0.08
        : hatch
          ? -L * 0.12
          : classic
            ? -L * 0.14
            : -L * 0.04;
    const cabinH = sup ? 0.38 : suv ? 0.62 : classic ? 0.3 : 0.5;
    const top = clear + bodyH;
    if (classic) {
      // An open top: windscreen, seats, a folded hood.
      k.box(W - 0.3, 0.32, 0.05, '#bcd7e6', 0, top, cabinZ + cabinL / 2, {
        rx: -0.35,
        opacity: 0.55,
        rough: 0.05,
      });
      k.box(W - 0.3, 0.06, cabinL, '#e7d9c0', 0, top - 0.12, cabinZ, { round: 0.02 });
      for (const sx of [-1, 1])
        k.box(0.5, 0.42, 0.18, '#e7d9c0', sx * 0.35, top - 0.1, cabinZ - 0.25, { round: 0.06 });
      k.box(W - 0.3, 0.16, 0.42, '#3f3f46', 0, top - 0.02, cabinZ - cabinL / 2 - 0.2, {
        round: 0.06,
      });
    } else {
      k.box(W - (sup ? 0.3 : 0.16), cabinH, cabinL, GLASS_DARK, 0, top - 0.02, cabinZ, {
        round: sup ? 0.16 : 0.1,
        rough: 0.08,
        metal: 0.6,
      });
      // Roof in body colour (and pillars).
      k.box(
        W - (sup ? 0.36 : 0.22),
        0.05,
        cabinL * (sup ? 0.55 : 0.78),
        paint,
        0,
        top + cabinH - 0.06,
        cabinZ - (sup ? 0.08 : 0),
        {
          round: 0.03,
          ...p,
        },
      );
      if (suv) {
        // Roof rails, a spare wheel on the back, chunky bumpers.
        for (const sx of [-1, 1])
          k.box(
            0.05,
            0.05,
            cabinL * 0.8,
            '#3f3f46',
            sx * (W / 2 - 0.2),
            top + cabinH - 0.02,
            cabinZ,
            metal,
          );
        k.cyl(0.36, 0.36, 0.22, BLACK, 0, clear + 0.5, -L / 2 - 0.1, { rx: Math.PI / 2, seg: 18 });
        for (const sz of [-1, 1])
          k.box(W + 0.04, 0.2, 0.14, '#27272a', 0, clear + 0.02, sz * (L / 2), { round: 0.04 });
      }
    }
    // Wheels.
    for (const sx of [-1, 1])
      for (const sz of [-1, 1])
        wheel(k, sx * (W / 2 - 0.1), sz * wz, r, sup ? 0.32 : 0.26, sup ? '#1f2937' : CHROME);
    // Lights and grille.
    for (const sx of [-1, 1]) {
      k.box(
        sup ? 0.42 : 0.34,
        0.09,
        0.04,
        '#fffbe6',
        sx * (W / 2 - 0.32),
        clear + bodyH - (sup ? 0.16 : 0.2),
        L / 2 - 0.005,
        {
          emissive: '#fff7d6',
          emissiveIntensity: 0.8,
        },
      );
      k.box(
        sup ? 0.6 : 0.4,
        0.08,
        0.04,
        '#b91c1c',
        sx * (W / 2 - 0.34),
        clear + bodyH - 0.18,
        -L / 2 + 0.005,
        {
          emissive: '#991b1b',
          emissiveIntensity: 0.5,
        },
      );
    }
    if (!sup)
      k.box(
        W * (suv ? 0.5 : 0.36),
        suv ? 0.28 : 0.16,
        0.04,
        suv ? '#27272a' : '#111827',
        0,
        clear + 0.18,
        L / 2 - 0.004,
        metal,
      );
    // Door lines and mirrors.
    for (const sx of [-1, 1]) {
      k.box(
        0.01,
        bodyH * 0.6,
        0.012,
        tone(paint, -0.25),
        sx * (W / 2 + 0.002),
        clear + 0.12,
        cabinZ + 0.1,
      );
      k.box(0.12, 0.08, 0.16, paint, sx * (W / 2 + 0.04), top + 0.06, cabinZ + cabinL / 2 - 0.1, {
        round: 0.03,
        ...p,
      });
    }
    m.seats.push(new THREE.Vector3(-0.38, clear + 0.32, cabinZ + 0.1));
  };
}

// ---------------------------------------------------------------------------
// The delivery van and boxes

const van: Builder = (k, o) => {
  const paint = '#f8fafc';
  const L = 5.6;
  const W = 2.1;
  k.box(W, 1.95, L * 0.72, paint, 0, 0.42, -L * 0.14, { round: 0.12, rough: 0.35 });
  k.box(W, 1.15, L * 0.3, paint, 0, 0.42, L * 0.34, { round: 0.18, rough: 0.35 });
  k.box(W - 0.12, 0.62, 0.9, GLASS_DARK, 0, 1.1, L * 0.38, {
    round: 0.1,
    rx: 0.32,
    rough: 0.08,
    metal: 0.5,
  });
  // Livery stripe and the brand panel.
  for (const sx of [-1, 1]) {
    k.box(0.02, 0.32, L * 0.68, o.tint ?? '#0d9488', sx * (W / 2 + 0.005), 0.95, -L * 0.15);
    k.box(0.02, 0.5, 1.2, '#f59e0b', sx * (W / 2 + 0.006), 1.45, -L * 0.15, { round: 0.02 });
  }
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) wheel(k, sx * (W / 2 - 0.12), sz * L * 0.33, 0.38, 0.26);
  k.box(W * 0.8, 0.22, 0.05, '#27272a', 0, 0.48, L / 2 - 0.02, metal);
  for (const sx of [-1, 1])
    k.box(0.3, 0.1, 0.04, '#fffbe6', sx * (W / 2 - 0.3), 0.85, L / 2 - 0.01, {
      emissive: '#fff7d6',
      emissiveIntensity: 0.8,
    });
  // Open back doors.
  for (const sx of [-1, 1])
    k.box(0.05, 1.8, W / 2 - 0.05, paint, sx * (W / 2 + 0.25), 0.45, -L / 2 - 0.45, {
      ry: sx * 0.2,
    });
  k.box(W - 0.2, 0.06, 0.6, '#9ca3af', 0, 0.42, -L / 2 - 0.25, metal);
};

const box: Builder = (k) => {
  k.box(0.5, 0.42, 0.42, '#c69c6d', 0, 0, 0, { round: 0.015, rough: 0.95 });
  k.box(0.51, 0.02, 0.08, '#d9c3a0', 0, 0.42, 0, { rough: 0.9 });
};

// ---------------------------------------------------------------------------
// Furniture the library doesn't have

const nightstand: Builder = (k, o) => {
  k.box(0.46, 0.5, 0.4, o.tier >= 3 ? '#ece6da' : '#a87b50', 0, 0, 0, { round: 0.02 });
  k.box(0.4, 0.02, 0.01, '#c9a86a', 0, 0.32, 0.2, metal);
  k.cyl(0.06, 0.08, 0.22, '#e5e7eb', 0, 0.5, 0, { rough: 0.4 });
  k.cyl(0.12, 0.15, 0.18, '#fff7e0', 0, 0.72, 0, { emissive: '#ffe7a8', emissiveIntensity: 0.6 });
};

const island: Builder = (k, o, m) => {
  const w = Math.min(o.w - 0.05, 2.4);
  const d = Math.min(o.d, 0.95);
  const body = o.tier >= 3 ? '#f2eee6' : '#d7c3a5';
  k.box(w, 0.88, d, body, 0, 0, 0, { round: 0.02 });
  k.box(w + 0.08, 0.05, d + 0.1, o.tier >= 3 ? '#1f2024' : '#e9e4da', 0, 0.88, 0.02, {
    rough: 0.25,
    metal: 0.1,
  });
  // Bottles and a fruit bowl on top.
  for (let i = 0; i < 3; i++)
    k.cyl(
      0.035,
      0.04,
      0.3,
      ['#14532d', '#7c2d12', '#1e3a8a'][i]!,
      -w / 2 + 0.3 + i * 0.12,
      0.93,
      -0.15,
      { rough: 0.2 },
    );
  k.cyl(0.18, 0.12, 0.08, '#e5e7eb', w / 2 - 0.4, 0.93, 0, { rough: 0.3 });
  for (let i = 0; i < 4; i++)
    k.sphere(
      0.06,
      ['#f59e0b', '#16a34a', '#dc2626', '#facc15'][i]!,
      w / 2 - 0.44 + (i % 2) * 0.08,
      1.02,
      -0.04 + Math.floor(i / 2) * 0.08,
      { seg: 8 },
    );
  // Bar stools along the front.
  const n = Math.max(2, Math.min(4, Math.floor(w / 0.6)));
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + (w / n) * (i + 0.5);
    chairAt(k, x, d / 2 + 0.35, Math.PI, 'bar', o.tier >= 3 ? '#f4f1ea' : '#7c2d12');
    m.seats.push(new THREE.Vector3(x, 0.74, d / 2 + 0.35));
  }
  m.top = 0.93;
};

const showerCabin: Builder = (k, o, m) => {
  const w = Math.min(o.w, 1.1);
  const d = Math.min(o.d, 1.1);
  k.box(w, 0.08, d, '#f8fafc', 0, 0, 0, { round: 0.02 });
  const glass = { opacity: 0.32, rough: 0.05, metal: 0.2, noShadow: true };
  k.box(w, 2.0, 0.03, '#d6eef6', 0, 0.08, d / 2, glass);
  k.box(0.03, 2.0, d, '#d6eef6', -w / 2, 0.08, 0, glass);
  k.box(0.03, 2.0, d, '#d6eef6', w / 2, 0.08, 0, glass);
  k.box(w, 2.0, 0.05, '#e8eef2', 0, 0.08, -d / 2, { rough: 0.6 });
  for (const sx of [-1, 1]) k.box(0.04, 2.02, 0.04, CHROME, (sx * w) / 2, 0.08, d / 2, metal);
  k.box(w + 0.04, 0.04, 0.04, CHROME, 0, 2.08, d / 2, metal);
  k.cyl(0.015, 0.015, 0.5, CHROME, 0, 1.6, -d / 2 + 0.05, metal);
  k.cyl(0.11, 0.11, 0.03, CHROME, 0, 2.0, -d / 2 + 0.18, metal);
  m.parts.head = new THREE.Object3D();
  m.parts.head.position.set(0, 1.95, -d / 2 + 0.18);
  k.keep(m.parts.head);
};

/** Your suitcase by the hotel bed: a hard-shell case on wheels, the handle up, a tag. */
const suitcase: Builder = (k) => {
  const shell = '#1e3a5f';
  for (const sx of [-1, 1])
    for (const sz of [-1, 1])
      k.cyl(0.03, 0.03, 0.04, BLACK, sx * 0.17, 0, sz * 0.09, { rz: Math.PI / 2 });
  k.box(0.44, 0.62, 0.26, shell, 0, 0.05, 0, { round: 0.05, rough: 0.35 });
  for (const sx of [-0.1, 0, 0.1]) k.box(0.025, 0.58, 0.27, tone(shell, 0.1), sx, 0.07, 0);
  for (const sx of [-1, 1]) k.cyl(0.012, 0.012, 0.32, CHROME, sx * 0.1, 0.67, -0.08, metal);
  k.box(0.24, 0.03, 0.03, BLACK, 0, 0.98, -0.08, { round: 0.01 });
  k.box(0.06, 0.09, 0.01, '#f59e0b', 0.16, 0.48, 0.14, { round: 0.01 });
};

const sconce: Builder = (k) => {
  k.box(0.12, 0.2, 0.05, '#e5e7eb', 0, 0, 0, { round: 0.02, ...metal });
  k.cyl(0.08, 0.06, 0.16, '#fff8e1', 0, 0.03, 0.09, {
    emissive: '#ffe08a',
    emissiveIntensity: 1.6,
  });
};

// ---------------------------------------------------------------------------
// Outside: garages, gate, hedges, trees

/** A glass showroom box with a white floor and spotlights (supercar). */
export function showroomGarage(w: number, d: number): THREE.Group {
  const k = new Kit();
  k.box(w, 0.08, d, '#f3f4f6', 0, 0, 0, { rough: 0.15, metal: 0.1 });
  const glass = { opacity: 0.22, rough: 0.04, metal: 0.3, noShadow: true };
  k.box(w, 2.6, 0.04, '#cfe8f3', 0, 0.08, -d / 2, glass);
  for (const sx of [-1, 1]) k.box(0.04, 2.6, d, '#cfe8f3', (sx * w) / 2, 0.08, 0, glass);
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) k.box(0.1, 2.7, 0.1, '#111827', (sx * w) / 2, 0, (sz * d) / 2, metal);
  k.box(w + 0.1, 0.12, 0.12, '#111827', 0, 2.68, -d / 2, metal);
  k.box(w + 0.1, 0.12, 0.12, '#111827', 0, 2.68, d / 2, metal);
  for (const sx of [-1, 1]) k.box(0.12, 0.12, d, '#111827', (sx * w) / 2, 2.68, 0, metal);
  for (let i = 0; i < 3; i++)
    k.cyl(0.06, 0.09, 0.08, '#fff7d6', -w / 3 + (i * w) / 3, 2.6, 0, {
      emissive: '#fff1c2',
      emissiveIntensity: 1.5,
    });
  // A turntable ring on the floor.
  k.cyl(Math.min(w, d) * 0.42, Math.min(w, d) * 0.42, 0.02, '#e5e7eb', 0, 0.08, 0, {
    seg: 40,
    rough: 0.2,
    metal: 0.4,
  });
  return k.build();
}

/** A black steel carport with a glass roof (SUVs), `w` wide per bay row. */
export function carport(w: number, d: number): THREE.Group {
  const k = new Kit();
  k.box(w, 0.06, d, '#c8bba7', 0, 0, 0, { rough: 0.95 });
  const H = 2.75;
  for (const sx of [-1, 1])
    for (const sz of [-1, 1])
      k.box(0.12, H, 0.12, '#1f2023', (sx * (w - 0.2)) / 2, 0, (sz * (d - 0.2)) / 2, metal);
  for (const sz of [-1, 1]) k.box(w, 0.14, 0.12, '#1f2023', 0, H, (sz * (d - 0.2)) / 2, metal);
  for (const sx of [-1, 1]) k.box(0.12, 0.14, d, '#1f2023', (sx * (w - 0.2)) / 2, H, 0, metal);
  for (let i = 1; i < 5; i++)
    k.box(w, 0.06, 0.06, '#1f2023', 0, H + 0.06, -d / 2 + (i * d) / 5, metal);
  k.box(w, 0.02, d, '#d7eef8', 0, H + 0.13, 0, { opacity: 0.25, rough: 0.05, noShadow: true });
  return k.build();
}
/** Two gate leaves of dark slats between green pillars with lamps. */
export function gate(w: number): THREE.Group {
  const k = new Kit();
  const H = 1.9;
  for (const sx of [-1, 1]) {
    const px = (sx * (w / 2 + 0.3)) as number;
    k.box(0.55, 2.3, 0.55, '#1f7a5c', px, 0, 0, { round: 0.02 });
    k.box(0.65, 0.1, 0.65, '#e7e5e4', px, 2.3, 0);
    k.box(0.32, 0.36, 0.32, '#f5f5f4', px, 2.4, 0, { round: 0.03 });
    k.box(0.22, 0.24, 0.22, '#fff3c4', px, 2.46, 0, {
      emissive: '#ffd27a',
      emissiveIntensity: 1.2,
    });
    k.box(0.08, 0.32, 0.03, '#fff3c4', px, 1.1, 0.285, {
      emissive: '#ffd27a',
      emissiveIntensity: 1,
    });
  }
  const n = Math.round(w / 0.16);
  for (let i = 0; i < n; i++)
    k.box(0.1, H - 0.2, 0.06, '#1c1d21', -w / 2 + 0.08 + (i * (w - 0.16)) / (n - 1), 0.1, 0, metal);
  for (const y of [0.1, H - 0.1]) k.box(w, 0.1, 0.08, '#1c1d21', 0, y, 0, metal);
  return k.build();
}

export function hedge(w: number, d: number, h = 0.9): THREE.Group {
  const k = new Kit();
  k.box(w, h, d, '#2f6b2f', 0, 0, 0, { round: Math.min(0.25, d / 2.2), rough: 1 });
  // Leafy bumps on top.
  const n = Math.max(1, Math.round(Math.max(w, d) / 0.5));
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n - 0.5;
    const x = w > d ? t * w : 0;
    const z = w > d ? 0 : t * d;
    k.sphere(Math.min(w, d) * 0.55, i % 2 ? '#3a7d35' : '#336f2f', x, h - 0.05, z, {
      sy: 0.45,
      seg: 7,
      rough: 1,
    });
  }
  return k.build();
}

export function palm(s: number): THREE.Group {
  const k = new Kit();
  for (let i = 0; i < 6; i++)
    k.cyl(
      0.12 - i * 0.008,
      0.13 - i * 0.008,
      0.55,
      i % 2 ? '#8b6b4a' : '#7a5c3e',
      Math.sin(i * 0.4) * 0.05 * i,
      i * 0.55,
      0,
      { seg: 8 },
    );
  for (let j = 0; j < 8; j++) {
    const a = (j / 8) * Math.PI * 2;
    k.box(
      0.32,
      0.03,
      1.7,
      j % 2 ? '#2f8a3a' : '#3c9a43',
      Math.cos(a) * 0.7,
      3.1,
      Math.sin(a) * 0.7,
      { ry: -a + Math.PI / 2, rx: 0.45 },
    );
  }
  k.sphere(0.2, '#4a3524', 0, 3.2, 0, { seg: 8 });
  const g = k.build();
  g.scale.setScalar(s);
  return g;
}

export function tree(s: number): THREE.Group {
  const k = new Kit();
  k.cyl(0.1, 0.14, 1.3, '#6b4a2f', 0, 0, 0, { seg: 8 });
  k.sphere(0.9, '#3f7a36', 0, 1.9, 0, { seg: 10, sy: 0.9 });
  k.sphere(0.6, '#4d8a40', 0.4, 2.3, -0.2, { seg: 9 });
  k.sphere(0.55, '#356b2e', -0.4, 2.1, 0.3, { seg: 9 });
  const g = k.build();
  g.scale.setScalar(s);
  return g;
}

/** A pot plant (outdoor corners, the drive). */
export function potPlant(): THREE.Group {
  const k = new Kit();
  k.box(0.42, 0.42, 0.42, '#1f2933', 0, 0, 0, { round: 0.04 });
  for (let j = 0; j < 7; j++) {
    const a = (j / 7) * Math.PI * 2;
    k.box(
      0.12,
      0.02,
      0.7,
      j % 2 ? '#2f8a3a' : '#3c9a43',
      Math.cos(a) * 0.18,
      0.62,
      Math.sin(a) * 0.18,
      { ry: -a + Math.PI / 2, rx: 0.6 },
    );
  }
  return k.build();
}

// ---------------------------------------------------------------------------

/** An invisible box to tap (the water is drawn with the grounds). */
const hitBox: Builder = (k, o) => {
  k.box(o.w, 0.3, o.d, '#ffffff', 0, -0.2, 0, { opacity: 0, noShadow: true });
};

// ---------------------------------------------------------------------------
// Stairs and the penthouse balcony

/** The height of a storey (the outer walls' top): the stairs climb to it. */
const STOREY = 2.6;

/** A balustrade from (z0, y0) to (z1, y1) at x: posts and a handrail. */
function balustrade(
  k: Kit,
  x: number,
  z0: number,
  y0: number,
  z1: number,
  y1: number,
  rail: string,
  post: string,
) {
  const len = Math.hypot(z1 - z0, y1 - y0);
  const n = Math.max(2, Math.round(Math.abs(z1 - z0) / 0.28));
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    k.cyl(0.018, 0.018, 0.9, post, x, y0 + (y1 - y0) * u, z0 + (z1 - z0) * u, metal);
  }
  k.box(0.07, 0.05, len, rail, x, (y0 + y1) / 2 + 0.9, (z0 + z1) / 2, {
    rx: Math.atan2(y1 - y0, z0 - z1),
    round: 0.02,
  });
}

/**
 * A flight of stairs up to the next floor along -z: the foot at +z, the top
 * step (a landing a metre deep) against the back wall. Wide ones are the
 * grand staircase: white stone with a red runner and brass rods.
 */
const stairs: Builder = (k, o) => {
  const w = o.w - 0.12;
  const grand = o.w >= 3;
  const run = o.d - 1;
  const n = Math.max(6, Math.round(run / 0.27));
  const rise = STOREY / (n + 1);
  const tread = run / n;
  const stone = grand ? '#f3eee6' : '#c69563';
  const side = grand ? '#e2dacd' : '#9a6a3f';
  for (let i = 0; i < n; i++) {
    const z = o.d / 2 - (i + 0.5) * tread;
    k.box(w, (i + 1) * rise, tread + 0.005, i % 2 ? stone : tone(stone, -0.03), 0, 0, z, {
      rough: 0.4,
    });
    // The nosing, a line of shadow under each step.
    k.box(w + 0.01, 0.02, 0.03, tone(side, -0.25), 0, (i + 1) * rise - 0.03, z + tread / 2, {
      noShadow: true,
    });
    if (grand) {
      k.box(w * 0.56, 0.012, tread, '#9f1d2b', 0, (i + 1) * rise, z, { rough: 0.9 });
      k.cyl(0.008, 0.008, w * 0.6, '#c9a86a', 0, (i + 1) * rise + 0.012, z + tread / 2 - 0.03, {
        rz: Math.PI / 2,
        ...metal,
      });
    }
  }
  // The top step: a landing up to the next floor.
  k.box(w, STOREY, 1, stone, 0, 0, -o.d / 2 + 0.5, { rough: 0.4 });
  if (grand) k.box(w * 0.56, 0.012, 1, '#9f1d2b', 0, STOREY, -o.d / 2 + 0.5, { rough: 0.9 });
  // A balustrade up each side, newel posts at the foot.
  const rail = grand ? '#5b3a22' : '#3f2a1a';
  const post = grand ? '#f4f1ea' : '#2b2b30';
  for (const sx of [-1, 1]) {
    const x = (sx * (w + 0.06)) / 2;
    balustrade(k, x, o.d / 2 - 0.1, rise, -o.d / 2 + 1, STOREY, rail, post);
    k.box(0.12, 1.05, 0.12, grand ? '#f4f1ea' : rail, x, 0, o.d / 2 - 0.08, { round: 0.02 });
    if (grand) {
      k.sphere(0.08, '#c9a86a', x, 1.13, o.d / 2 - 0.08, metal);
      k.sphere(0.11, '#fff4d6', x, 1.3, o.d / 2 - 0.08, {
        emissive: '#ffe2a0',
        emissiveIntensity: 0.9,
      });
    }
  }
};

/**
 * Upstairs, the well over the flight: the steps going down into it (darker
 * further down) and a glass balustrade round three sides, open at the top
 * step at the back, where you come up.
 */
const stairwell: Builder = (k, o) => {
  const w = o.w - 0.06;
  const d = o.d;
  const n = Math.max(4, Math.round(d / 0.27));
  const grand = o.w >= 3;
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const c = new THREE.Color(grand ? '#efe9df' : '#c69563').lerp(
      new THREE.Color('#2a2420'),
      t * 0.85,
    );
    k.box(w, 0.012, d / n - 0.02, `#${c.getHexString()}`, 0, 0.004, -d / 2 + (i + 0.5) * (d / n), {
      noShadow: true,
    });
  }
  if (grand) k.box(w * 0.56, 0.014, d, '#7f1726', 0, 0.006, 0, { noShadow: true, opacity: 0.9 });
  const glass = { opacity: 0.32, rough: 0.05, noShadow: true };
  for (const sx of [-1, 1]) {
    const x = (sx * w) / 2;
    k.box(0.02, 0.95, d, '#bfe3f0', x, 0, 0, glass);
    k.box(0.06, 0.05, d + 0.04, '#5b3a22', x, 0.95, 0, { round: 0.02 });
  }
  k.box(w, 0.95, 0.02, '#bfe3f0', 0, 0, d / 2, glass);
  k.box(w + 0.06, 0.05, 0.06, '#5b3a22', 0, 0.95, d / 2, { round: 0.02 });
  for (const [x, z] of [
    [-w / 2, d / 2],
    [w / 2, d / 2],
    [-w / 2, -d / 2],
    [w / 2, -d / 2],
  ] as const)
    k.box(0.07, 1.0, 0.07, '#f4f1ea', x, 0, z, { round: 0.02 });
};

/** On the penthouse terrace: a brass telescope on a tripod and a high table with stools. */
const skylineRail: Builder = (k, o, m) => {
  const x0 = -o.w / 2 + 0.6;
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    k.cyl(0.015, 0.015, 1.25, '#3f3f46', x0 + Math.sin(a) * 0.18, 0, Math.cos(a) * 0.18, {
      rx: Math.cos(a) * 0.14,
      rz: -Math.sin(a) * 0.14,
      ...metal,
    });
  }
  k.cyl(0.06, 0.05, 0.75, '#c9a86a', x0, 1.25, 0.05, { rx: Math.PI / 2 - 0.35, ...metal });
  k.cyl(0.07, 0.07, 0.05, '#1b2433', x0, 1.38, 0.42, { rx: Math.PI / 2 - 0.35 });
  const tx = o.w / 2 - 0.7;
  k.cyl(0.32, 0.32, 0.04, '#f4f1ea', tx, 1.05, 0, { seg: 24 });
  k.cyl(0.03, 0.12, 1.05, '#2b2b30', tx, 0, 0, metal);
  for (const sx of [-1, 1]) {
    k.cyl(0.17, 0.17, 0.05, '#1f2937', tx + sx * 0.55, 0.75, 0.1, { seg: 16 });
    k.cyl(0.02, 0.1, 0.75, '#2b2b30', tx + sx * 0.55, 0, 0.1, metal);
    m.seats.push(new THREE.Vector3(tx + sx * 0.55, 0.8, 0.1));
  }
  k.cyl(0.03, 0.03, 0.18, '#fde68a', tx, 1.09, 0, { emissive: '#f59e0b', emissiveIntensity: 1 });
};

/**
 * A fitted kitchen's worktop run against the wall (home/layout.ts): base
 * cupboards with handles, a stone worktop, a sink with its tap, wall
 * cupboards over it, and a chopping board. A chef's kitchen (finish 3) is
 * dark stone over white doors.
 */
const kitchenCounter: Builder = (k, o, m) => {
  const w = o.w - 0.04;
  const dd = 0.62;
  const z = -o.d / 2 + dd / 2 + 0.02;
  const body = o.tier >= 3 ? '#f2eee6' : '#e7dfd2';
  const top = o.tier >= 3 ? '#1f2024' : '#b9b2a6';
  k.box(w, 0.82, dd, body, 0, 0.06, z, {});
  k.box(w, 0.06, dd, '#2b2b2f', 0, 0, z + 0.02);
  k.box(w + 0.02, 0.05, dd + 0.03, top, 0, 0.88, z, { rough: 0.2 });
  const n = Math.max(2, Math.round(w / 0.5));
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + (w / n) * (i + 0.5);
    k.box(w / n - 0.03, 0.7, 0.02, '#d9d1c4', x, 0.12, z + dd / 2);
    k.box(0.12, 0.015, 0.02, '#c0c0c8', x, 0.74, z + dd / 2 + 0.02, { metal: 0.8, rough: 0.3 });
  }
  // The sink and its tap, a third of the way along.
  const sx = -w / 2 + w * 0.3;
  k.box(0.5, 0.02, 0.38, '#cbd5e1', sx, 0.93, z, { metal: 0.6, rough: 0.25 });
  k.cyl(0.015, 0.015, 0.28, '#c0c0c8', sx, 0.93, z - 0.2, { metal: 0.9, rough: 0.2 });
  // A chopping board and a bowl.
  k.box(0.36, 0.02, 0.24, '#c08a4a', -w / 2 + w * 0.7, 0.93, z + 0.05, {});
  k.cyl(0.11, 0.08, 0.07, '#f5f5f4', -w / 2 + w * 0.85, 0.93, z, { rough: 0.4 });
  // Wall cupboards.
  k.box(w, 0.6, 0.34, body, 0, 1.5, -o.d / 2 + 0.19, {});
  m.top = 0.93;
};

const BUILDERS: Record<string, Builder> = {
  nightstand,
  island,
  'kitchen-counter': kitchenCounter,
  'shower-cabin': showerCabin,
  sconce,
  suitcase,
  van,
  box,
  'pool-water': hitBox,
  'hot-tub': hitBox,
  stairs,
  stairwell,
  'skyline-rail': skylineRail,
};
/** Build an estate model, or a furniture-library model for anything else. */
export function buildEstateModel(id: string, o: ModelOpts): Model {
  if (id === 'guest-bed') return guestBedModel(o);
  const carKind = id.startsWith('car:') ? id.slice(4) : null;
  const b = carKind
    ? car(carKind, o.tint ?? CAR_PAINT[carKind] ?? '#64748b')
    : (BUILDERS[id] ?? HOTEL_BUILDERS[id]);
  if (!b) return buildModel(id, o);
  const k = new Kit();
  const m: Model = { group: new THREE.Group(), parts: {}, lamps: [], screens: [], seats: [] };
  b(k, o, m);
  m.group = k.build();
  if (
    ![
      'sconce',
      'pool-water',
      'hot-tub',
      'hotel-art',
      'suite-rug',
      'round-rug',
      'towels',
      'cabinet',
      'hallmirror',
      'bathmat',
      'runner',
    ].includes(id)
  ) {
    const s = carKind
      ? contactShadow(2.4, 5, 0.65)
      : contactShadow(Math.max(0.5, o.w), Math.max(0.5, o.d), 0.4);
    m.group.add(s);
  }
  if (id === 'pool-water' || id === 'hot-tub')
    m.group.traverse((c) => {
      const mesh = c as THREE.Mesh;
      if (!mesh.isMesh) return;
      // Tappable, never drawn.
      mesh.material = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
      mesh.castShadow = false;
      mesh.receiveShadow = false;
    });
  m.group.userData.modelId = id;
  return m;
}

/** A bed with a lamp-lit bedside table each side. */
function guestBedModel(o: ModelOpts): Model {
  const m = buildModel('bed', o);
  for (const sx of [-1, 1]) {
    const k = new Kit();
    const n: Model = { group: new THREE.Group(), parts: {}, lamps: [], screens: [], seats: [] };
    nightstand(k, o, n);
    const g = k.build();
    g.position.set(sx * (Math.min(o.w, 2) / 2 + 0.05), 0, -o.d / 2 + 0.3);
    m.group.add(g);
  }
  return m;
}

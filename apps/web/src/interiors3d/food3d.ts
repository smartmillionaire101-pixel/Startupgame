/**
 * Places to eat in 3D: a restaurant, café or street-food place drawn from
 * its style (../city/cuisine.ts). The same 12 × 6.6 m cut-away box as
 * ./venues.ts (or an open-air yard), with the style's walls and floor, its
 * kitchen (pots, a suya grill, a braai fire, a tandoor, woks, a pizza oven,
 * a shawarma spit, a sushi counter, a fine-dining pass), its tables (plastic
 * chairs, benches, bistro tables, white cloths, banquettes, a majlis), its
 * decor and a window on the city (the towers, the Nile, the sea, the bay,
 * green hills).
 *
 * Built for phones: static parts merged per material (./kit.ts), canvas
 * textures cached, at most three point lights (two on CPU-drawn WebGL), and
 * the only moving parts are a fan, flames and steam (still when motion is
 * reduced).
 */
import * as THREE from 'three';
import type { Slot } from '../city/rooms';
import type { FoodPlace } from '../city/cuisine';
import { softwareGl } from '../three-kit/quality';
import { buildModel, chairAt } from './furniture';
import { FLOOR_SCALE, Kit, floorTexture, mat, tone } from './kit';
import { BACK, RD, RW, WALL_H, pairs, vx, vz, type SeatSpot, type VenueRoom } from './venues';
import type { NightEnv, NightRoom } from './nightlife3d';

export interface FoodOpts {
  style: FoodPlace;
  sign?: string;
  slots: Slot[];
  night: boolean;
  /** The menu board's lines, translated ("Jollof rice … ₦2,700"). */
  menu?: string[];
}

// ---------------------------------------------------------------------------
// Textures (canvas, cached)

const TEX = new Map<string, THREE.CanvasTexture>();
function tex(key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const hit = TEX.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  TEX.set(key, t);
  return t;
}

function signTex(text: string, bg: string, fg: string, tier: number) {
  return tex(`food-sign:${text}:${bg}:${fg}:${tier}`, 1024, 192, (g) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, 1024, 192);
    if (tier === 3) {
      g.strokeStyle = fg;
      g.lineWidth = 4;
      g.strokeRect(14, 14, 996, 164);
    } else if (tier === 1) {
      // Painted board: a darker edge.
      g.strokeStyle = 'rgba(0,0,0,0.25)';
      g.lineWidth = 16;
      g.strokeRect(0, 0, 1024, 192);
    }
    g.fillStyle = fg;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font =
      tier === 3
        ? 'italic 600 84px Georgia, "Times New Roman", serif'
        : tier === 1
          ? '900 96px Impact, "Arial Black", system-ui, sans-serif'
          : 'bold 88px system-ui, sans-serif';
    g.fillText(tier === 3 ? text : text.toUpperCase(), 512, 100, 960);
  });
}

function patternTex(a: string, b: string, kind: 'stripes' | 'tiles' | 'brick' | 'lattice') {
  const t = tex(`food-pat:${kind}:${a}:${b}`, 256, 256, (g) => {
    g.fillStyle = b;
    g.fillRect(0, 0, 256, 256);
    g.fillStyle = a;
    if (kind === 'stripes') {
      // Kente-ish: bands and blocks.
      for (let y = 0; y < 256; y += 64) g.fillRect(0, y, 256, 18);
      for (let x = 0; x < 256; x += 64) g.fillRect(x + 20, 26, 24, 30);
      g.fillStyle = 'rgba(0,0,0,0.25)';
      for (let x = 0; x < 256; x += 32) g.fillRect(x, 160, 12, 40);
    } else if (kind === 'tiles') {
      for (let y = 0; y < 256; y += 64)
        for (let x = 0; x < 256; x += 64) {
          g.fillStyle = (x + y) % 128 ? a : b;
          g.fillRect(x + 2, y + 2, 60, 60);
          g.strokeStyle = a;
          g.lineWidth = 3;
          g.beginPath();
          g.arc(x + 32, y + 32, 16, 0, Math.PI * 2);
          g.stroke();
        }
    } else if (kind === 'brick') {
      for (let r = 0; r < 8; r++)
        for (let c = -1; c < 4; c++) {
          g.fillStyle = r % 3 ? a : tone(a, -0.06);
          g.fillRect(c * 72 + (r % 2) * 36 + 3, r * 32 + 3, 66, 26);
        }
    } else {
      // Mashrabiya: a lattice of diamonds.
      g.strokeStyle = a;
      g.lineWidth = 10;
      for (let i = -256; i < 512; i += 42) {
        g.beginPath();
        g.moveTo(i, 0);
        g.lineTo(i + 256, 256);
        g.moveTo(i + 256, 0);
        g.lineTo(i, 256);
        g.stroke();
      }
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function menuTex(lines: string[], tier: number) {
  return tex(`food-menu:${tier}:${lines.join('|')}`, 512, 256, (g) => {
    g.fillStyle = tier === 1 ? '#f8fafc' : '#1f2a24';
    g.fillRect(0, 0, 512, 256);
    g.strokeStyle = tier === 1 ? '#dc2626' : '#a16207';
    g.lineWidth = 12;
    g.strokeRect(0, 0, 512, 256);
    g.fillStyle = tier === 1 ? '#111827' : '#f8fafc';
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    g.font = 'bold 30px system-ui, sans-serif';
    lines.slice(0, 4).forEach((l, i) => g.fillText(l, 24, 46 + i * 56, 464));
  });
}

function viewTex(view: string, night: boolean) {
  return tex(`food-view:${view}:${night}`, 512, 256, (g) => {
    const sky = g.createLinearGradient(0, 0, 0, 256);
    sky.addColorStop(0, night ? '#0b1328' : '#60a5fa');
    sky.addColorStop(1, night ? '#312e81' : '#e0f2fe');
    g.fillStyle = sky;
    g.fillRect(0, 0, 512, 256);
    const lit = night ? '#fde68a' : '#cbd5e1';
    if (view === 'skyline') {
      for (let i = 0; i < 18; i++) {
        const x = i * 30 + ((i * 37) % 11);
        const h = 70 + ((i * 53) % 110);
        g.fillStyle = night ? '#1e293b' : '#94a3b8';
        g.fillRect(x, 256 - h, 24, h);
        g.fillStyle = lit;
        for (let y = 256 - h + 8; y < 250; y += 14)
          for (let wx = x + 4; wx < x + 22; wx += 8) if ((wx + y) % 3) g.fillRect(wx, y, 4, 6);
      }
      // A spire above the rest.
      g.fillStyle = night ? '#334155' : '#cbd5e1';
      g.beginPath();
      g.moveTo(300, 256);
      g.lineTo(318, 20);
      g.lineTo(336, 256);
      g.fill();
    } else if (view === 'nile' || view === 'sea' || view === 'bay') {
      const water =
        view === 'nile' ? (night ? '#1e3a5f' : '#2b6f8f') : night ? '#0c4a6e' : '#0ea5e9';
      g.fillStyle = water;
      g.fillRect(0, 150, 512, 106);
      g.fillStyle = 'rgba(255,255,255,0.35)';
      for (let i = 0; i < 20; i++) g.fillRect((i * 71) % 512, 170 + ((i * 13) % 70), 26, 2);
      if (view === 'nile') {
        // The far bank: palms and low towers.
        g.fillStyle = night ? '#1e293b' : '#a8a29e';
        for (let i = 0; i < 12; i++) g.fillRect(i * 44, 150 - (20 + ((i * 29) % 40)), 34, 60);
        g.fillStyle = lit;
        for (let i = 0; i < 40; i++) g.fillRect((i * 37) % 512, 112 + ((i * 7) % 30), 3, 4);
        // Feluccas.
        g.fillStyle = '#f8fafc';
        for (const x of [120, 330]) {
          g.beginPath();
          g.moveTo(x, 196);
          g.lineTo(x + 6, 130);
          g.lineTo(x + 40, 196);
          g.fill();
          g.fillStyle = '#7c2d12';
          g.fillRect(x - 10, 196, 60, 8);
          g.fillStyle = '#f8fafc';
        }
      } else if (view === 'bay') {
        g.fillStyle = night ? '#1f2937' : '#65a30d';
        g.beginPath();
        g.moveTo(0, 150);
        g.quadraticCurveTo(120, 90, 260, 150);
        g.fill();
        // A red bridge.
        g.strokeStyle = '#c2410c';
        g.fillStyle = '#c2410c';
        g.lineWidth = 4;
        g.fillRect(300, 60, 8, 100);
        g.fillRect(430, 60, 8, 100);
        g.beginPath();
        g.moveTo(220, 140);
        g.quadraticCurveTo(304, 40, 370, 120);
        g.quadraticCurveTo(434, 40, 512, 130);
        g.stroke();
        g.fillRect(220, 138, 292, 5);
      } else {
        g.fillStyle = '#fde68a';
        g.fillRect(0, 238, 512, 18);
        g.fillStyle = '#f8fafc';
        g.beginPath();
        g.moveTo(380, 170);
        g.lineTo(390, 120);
        g.lineTo(420, 170);
        g.fill();
      }
    } else {
      // Green hills with houses.
      for (const [y, c] of [
        [120, night ? '#14532d' : '#4d7c0f'],
        [160, night ? '#166534' : '#65a30d'],
        [200, night ? '#15803d' : '#84cc16'],
      ] as const) {
        g.fillStyle = c;
        g.beginPath();
        g.moveTo(0, 256);
        for (let x = 0; x <= 512; x += 32) g.lineTo(x, y + Math.sin(x / 60 + y) * 18);
        g.lineTo(512, 256);
        g.fill();
      }
      g.fillStyle = night ? '#fde68a' : '#f8fafc';
      for (let i = 0; i < 50; i++) g.fillRect((i * 53) % 512, 140 + ((i * 31) % 100), 5, 4);
    }
  });
}

// ---------------------------------------------------------------------------
// Little props, added to the room's kit

const CHROME = '#cbd5e1';
const STEEL = { metal: 0.7, rough: 0.3 };

function palm(k: Kit, x: number, z: number) {
  k.cyl(0.1, 0.16, 3.2, '#8b5a2b', x, 0, z, { rz: 0.1 });
  for (let i = 0; i < 6; i++)
    k.box(1.4, 0.05, 0.35, '#15803d', x + Math.cos(i) * 0.6 + 0.3, 3.15, z + Math.sin(i) * 0.6, {
      ry: i,
      rz: -0.3,
    });
}

function bulbs(
  k: Kit,
  x0: number,
  x1: number,
  y: number,
  z: number,
  colors: readonly string[],
  n: number,
) {
  const len = x1 - x0;
  k.cyl(0.006, 0.006, len, '#1c1917', (x0 + x1) / 2, y + 0.02, z, {
    rz: Math.PI / 2,
    noShadow: true,
  });
  for (let i = 0; i <= n; i++) {
    const x = x0 + (len * i) / n;
    const sag = Math.sin((Math.PI * i) / n) * 0.25;
    const c = colors[i % colors.length]!;
    k.sphere(0.05, c, x, y - sag, z, {
      emissive: c,
      emissiveIntensity: 1.6,
      noShadow: true,
      seg: 8,
    });
  }
}

function flags(
  k: Kit,
  x0: number,
  x1: number,
  y: number,
  z: number,
  colors: readonly string[],
  square: boolean,
) {
  const n = Math.round((x1 - x0) / 0.35);
  for (let i = 0; i < n; i++) {
    const x = x0 + i * 0.35 + 0.17;
    const sag = Math.sin((Math.PI * i) / n) * 0.2;
    k.box(
      square ? 0.26 : 0.2,
      square ? 0.22 : 0.24,
      0.01,
      colors[i % colors.length]!,
      x,
      y - sag - 0.24,
      z,
      {
        noShadow: true,
        rz: square ? 0 : Math.PI / 4,
      },
    );
  }
}

function lantern(k: Kit, x: number, y: number, z: number, c: string, paper: boolean) {
  k.cyl(0.004, 0.004, 0.4, '#1c1917', x, y + 0.25, z, { noShadow: true });
  if (paper) {
    k.sphere(0.2, c, x, y, z, {
      sy: 1.25,
      emissive: c,
      emissiveIntensity: 0.9,
      noShadow: true,
      seg: 10,
    });
    k.cyl(0.08, 0.08, 0.04, '#fbbf24', x, y - 0.27, z, { noShadow: true });
  } else {
    k.box(0.22, 0.32, 0.22, '#b8892e', x, y - 0.16, z, { ...STEEL, noShadow: true });
    k.box(0.16, 0.24, 0.16, '#fde68a', x, y - 0.12, z, {
      emissive: '#f59e0b',
      emissiveIntensity: 1.4,
      noShadow: true,
    });
  }
}

function plateAt(k: Kit, x: number, y: number, z: number, food: string, tier: number) {
  k.cyl(0.12, 0.1, 0.015, tier === 1 ? '#f1f5f9' : '#ffffff', x, y, z, { seg: 14, noShadow: true });
  k.sphere(0.07, food, x, y + 0.03, z, { sy: 0.45, seg: 8, noShadow: true });
  if (tier === 3) {
    k.cyl(0.03, 0.025, 0.12, '#e0f2fe', x + 0.1, y, z - 0.12, {
      opacity: 0.55,
      noShadow: true,
      seg: 8,
    });
  } else {
    k.cyl(0.035, 0.03, 0.11, tier === 1 ? '#f97316' : '#e0f2fe', x + 0.1, y, z - 0.12, {
      noShadow: true,
      seg: 8,
    });
  }
}

const FOODS: Record<string, string> = {
  pots: '#ea580c',
  grill: '#7c2d12',
  fire: '#78350f',
  tandoor: '#c2410c',
  wok: '#ca8a04',
  espresso: '#a16207',
  oven: '#d97706',
  pass: '#65a30d',
  sushi: '#fb7185',
  spit: '#b45309',
};

// ---------------------------------------------------------------------------
// The room

export function buildFoodVenue(o: FoodOpts): NightRoom {
  const s = o.style;
  const has = (d: string) => s.decor.includes(d as never);
  const low = softwareGl();
  const open = !!s.outdoor;
  const root = new THREE.Group();
  const seats = new Map<number, SeatSpot>();
  const screens: THREE.MeshStandardMaterial[] = [];
  const lamps: THREE.PointLight[] = [];
  const sides: VenueRoom['sides'] = [];
  const k = new Kit();
  const flames: { l?: THREE.PointLight; m: THREE.Object3D }[] = [];
  const steam: THREE.Mesh[] = [];
  let fan: THREE.Object3D | null = null;
  const add = (
    id: string,
    x: number,
    z: number,
    w: number,
    d: number,
    ry = 0,
    tint?: string,
    tier = 2,
  ) => {
    const m = buildModel(id, { w, d, tier, tint });
    m.group.position.set(x, 0, z);
    m.group.rotation.y = ry;
    root.add(m.group);
    return m;
  };
  const light = (c: string, i: number, x: number, y: number, z: number, dist = 9) => {
    const l = new THREE.PointLight(c, i, dist, 1.5);
    l.position.set(x, y, z);
    root.add(l);
    return l;
  };
  const seat = (i: number, x: number, z: number, ry: number, h: number) =>
    seats.set(i, { pos: new THREE.Vector3(x, 0, z), ry, h });
  const tier = s.tier;
  const cloth = s.tableCloth;
  const flip = s.variant === 2 ? -1 : 1;

  // ---- Floor.
  {
    const fw = open ? RW + 3 : RW;
    const fd = open ? RD + 1.5 : RD;
    const t = floorTexture(s.floor, s.floorTint).clone();
    t.needsUpdate = true;
    const sc = FLOOR_SCALE[s.floor];
    t.repeat.set(fw / sc, fd / sc);
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(fw, fd),
      mat('#ffffff', { map: t, rough: s.floor === 'marble' ? 0.25 : 0.85, own: true }),
    );
    m.rotation.x = -Math.PI / 2;
    m.position.z = open ? 0.3 : 0;
    m.receiveShadow = true;
    root.add(m);
  }

  // ---- The kitchen's place: where the cook (the first staff slot) stands.
  const cook = o.slots.find((x) => x.who === 'staff') ?? o.slots[0]!;
  const kx = vx(cook.x);
  const kz = vz(cook.y);
  const winX = s.tier === 3 && s.view ? (kx > 0 ? -2.0 : 2.0) : kx > 0 ? -3.4 : 3.2;

  // ---- Shell.
  if (!open) {
    const wallMat = mat(s.wall, { rough: 0.9 });
    const mk = (w: number, d: number, x: number, z: number) => {
      const g = new THREE.BoxGeometry(w, 1, d);
      g.translate(0, 0.5, 0);
      const m = new THREE.Mesh(g, wallMat);
      m.position.set(x, 0, z);
      m.scale.y = WALL_H;
      m.receiveShadow = true;
      root.add(m);
      return m;
    };
    const back = mk(RW + 0.4, 0.2, 0, BACK - 0.1);
    const left = mk(0.2, RD + 0.2, -RW / 2 - 0.1, 0);
    const right = mk(0.2, RD + 0.2, RW / 2 + 0.1, 0);
    const front = mk(RW + 0.4, 0.2, 0, RD / 2 + 0.1);
    front.scale.y = 0.25;
    sides.push(
      { nx: 0, nz: -1, meshes: [back] },
      { nx: -1, nz: 0, meshes: [left] },
      { nx: 1, nz: 0, meshes: [right] },
    );
    // Skirting, and a band of pattern (kente, tiles, a dado) along the back wall.
    k.box(RW, 0.12, 0.03, tone(s.wall, -0.25), 0, 0, BACK + 0.02);
    const band = s.pattern ?? (has('tiles') ? (['#1e3a8a', '#f8fafc'] as const) : null);
    if (band) {
      const kind = has('tiles') ? 'tiles' : 'stripes';
      const t = patternTex(band[0], band[1], kind).clone();
      t.needsUpdate = true;
      t.repeat.set(RW / 1.2, 1);
      k.plane(
        RW,
        kind === 'tiles' ? 1.3 : 0.5,
        '#ffffff',
        0,
        kind === 'tiles' ? 0.75 : 1.25,
        BACK + 0.012,
        {
          map: t,
        },
      );
    }
    if (has('brick')) {
      const t = patternTex(tone(s.wall, 0.05), tone(s.wall, -0.2), 'brick').clone();
      t.needsUpdate = true;
      t.repeat.set(2.5, 1.2);
      k.plane(5, WALL_H - 0.2, '#ffffff', winX, WALL_H / 2, BACK + 0.011, { map: t });
    }
    // The window on the city.
    if (s.view) {
      const vw = tier === 3 ? 4.6 : 2.6;
      k.box(
        vw + 0.16,
        1.52,
        0.06,
        tier === 3 ? '#111827' : tone(s.wall, -0.3),
        winX,
        0.68,
        BACK + 0.03,
      );
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(vw, 1.36),
        new THREE.MeshBasicMaterial({ map: viewTex(s.view, o.night) }),
      );
      m.position.set(winX, 1.44, BACK + 0.065);
      root.add(m);
      for (let i = 1; i < (tier === 3 ? 3 : 2); i++)
        k.box(
          0.05,
          1.36,
          0.04,
          '#111827',
          winX - vw / 2 + (vw * i) / (tier === 3 ? 3 : 2),
          0.76,
          BACK + 0.08,
        );
    }
    if (has('lattice')) {
      const t = patternTex('#7c4a21', 'rgba(0,0,0,0)', 'lattice');
      for (const x of s.view ? [winX + (winX > 0 ? -2.6 : 2.6)] : [-4.4, 4.4])
        k.plane(1.4, 1.8, '#ffffff', x, 1.5, BACK + 0.015, { map: t, opacity: 0.99 });
    }
    if (has('arches'))
      for (const x of [-1.5, 1.5].map((v) => v + (winX > 0 ? 1.4 : -1.4))) {
        k.plane(1.1, 1.6, tone(s.wall, -0.18), x, 1.2, BACK + 0.012);
        k.torus(0.55, 0.05, tone(s.wall, 0.15), x, 2.0, BACK + 0.03, { seg: 16 });
      }
    if (has('photos'))
      for (let i = 0; i < 3; i++) {
        const x = winX + (winX > 0 ? -1 : 1) * (1.8 + i * 0.6);
        k.box(0.42, 0.52, 0.03, '#1c1917', x, 1.5 + (i % 2) * 0.2, BACK + 0.02);
        k.plane(
          0.34,
          0.42,
          ['#94a3b8', '#d6d3d1', '#a8a29e'][i]!,
          x,
          1.76 + (i % 2) * 0.2,
          BACK + 0.04,
        );
      }
    if (has('mirrors'))
      for (const x of [-4.8, 4.8]) {
        k.box(0.9, 1.2, 0.04, '#b8892e', x, 1.0, BACK + 0.02, STEEL);
        k.plane(0.78, 1.08, '#dbeafe', x, 1.6, BACK + 0.045, { metal: 0.8, rough: 0.05 });
      }
    if (has('wine')) {
      const x = winX > 0 ? 5.3 : -5.3;
      k.box(1.0, 2.0, 0.35, '#3b2414', x, 0, BACK + 0.2);
      for (let r = 0; r < 5; r++)
        for (let c = 0; c < 4; c++)
          k.cyl(
            0.035,
            0.035,
            0.05,
            ['#14532d', '#7f1d1d', '#1c1917'][(r + c) % 3]!,
            x - 0.36 + c * 0.24,
            0.3 + r * 0.34,
            BACK + 0.38,
            {
              rx: Math.PI / 2,
              seg: 8,
            },
          );
    }
    // The name on the back wall.
    if (o.sign) {
      const w = tier === 3 ? 3.0 : tier === 1 ? 4.0 : 3.6;
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(w, w * 0.1875),
        new THREE.MeshStandardMaterial({
          map: signTex(o.sign, s.sign[0], s.sign[1], tier),
          emissive: '#ffffff',
          emissiveIntensity: tier === 3 ? 0.35 : 0.2,
        }),
      );
      (m.material as THREE.MeshStandardMaterial).emissiveMap = (
        m.material as THREE.MeshStandardMaterial
      ).map;
      m.position.set(s.view ? winX : 0, 2.45, BACK + 0.03);
      root.add(m);
    }
  } else {
    // ---- Open air: a low wall, and beyond it the view or the street.
    const wallC = s.wall;
    k.box(RW + 3, 0.9, 0.25, wallC, 0, 0, BACK - 0.2, {});
    k.box(RW + 3, 0.06, 0.32, tone(wallC, 0.2), 0, 0.9, BACK - 0.2);
    if (s.view) {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(30, 10),
        new THREE.MeshBasicMaterial({ map: viewTex(s.view, o.night) }),
      );
      m.position.set(0, 3.2, BACK - 6);
      root.add(m);
    } else {
      // The street behind: shopfronts in a row.
      for (let i = 0; i < 5; i++) {
        const x = -6 + i * 3;
        const c = [tone(wallC, 0.1), '#e7e5e4', tone(wallC, -0.1), '#fef3c7', '#d6d3d1'][i]!;
        k.box(2.9, 3.6 + (i % 2) * 0.8, 0.4, c, x, 0, BACK - 1.6);
        k.box(1.8, 1.0, 0.05, o.night ? '#fde68a' : '#334155', x, 2.0, BACK - 1.38, {
          emissive: o.night ? '#f59e0b' : undefined,
          emissiveIntensity: 0.6,
          noShadow: true,
        });
      }
    }
    // An awning over the kitchen, with the name on its edge.
    const aw = 4.2;
    const ax = Math.max(-RW / 2 + aw / 2 + 0.6, Math.min(RW / 2 - aw / 2 - 0.6, kx));
    const az = kz - 0.3;
    for (const dx of [-aw / 2, aw / 2])
      for (const dz of [-1.0, 1.0]) k.cyl(0.04, 0.04, 2.4, '#57534e', ax + dx, 0, az + dz, STEEL);
    const stripes = 6;
    for (let i = 0; i < stripes; i++)
      k.box(
        aw / stripes,
        0.04,
        2.3,
        i % 2 ? s.sign[0] : '#f8fafc',
        ax - aw / 2 + (aw / stripes) * (i + 0.5),
        2.42,
        az,
        {
          rx: -0.12,
        },
      );
    if (o.sign) {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(aw, aw * 0.1875),
        new THREE.MeshStandardMaterial({
          map: signTex(o.sign, s.sign[0], s.sign[1], tier),
          emissive: '#ffffff',
          emissiveIntensity: 0.25,
        }),
      );
      (m.material as THREE.MeshStandardMaterial).emissiveMap = (
        m.material as THREE.MeshStandardMaterial
      ).map;
      m.position.set(ax, 2.95, az + 1.2);
      root.add(m);
      k.box(
        aw,
        aw * 0.1875 + 0.06,
        0.04,
        tone(s.sign[0], -0.2),
        ax,
        2.95 - (aw * 0.1875 + 0.06) / 2,
        az + 1.17,
      );
    }
    if (has('palms')) {
      palm(k, -RW / 2 - 0.6, BACK + 0.4);
      palm(k, RW / 2 + 0.4, 1.4);
      if (!low) palm(k, -RW / 2 + 0.2, RD / 2 + 0.2);
    }
  }

  // ---- The kitchen.
  const counter = (w: number, c: string, top = '#e7e5e4') => {
    k.box(w, 0.95, 0.6, c, kx, 0, kz + 0.6, { round: 0.02 });
    k.box(w + 0.06, 0.05, 0.66, top, kx, 0.95, kz + 0.6, { rough: 0.4 });
  };
  const fireAt = (x: number, y: number, z: number, big: boolean) => {
    k.box(big ? 1.6 : 0.9, 0.04, big ? 0.6 : 0.4, '#ea580c', x, y, z, {
      emissive: '#f97316',
      emissiveIntensity: 1.8,
      noShadow: true,
    });
    const g = new THREE.Group();
    for (let i = 0; i < (big ? 5 : 3); i++) {
      const f = new THREE.Mesh(
        new THREE.ConeGeometry(0.08, 0.32, 6),
        mat('#fb923c', { emissive: '#f97316', emissiveIntensity: 2, opacity: 0.85 }),
      );
      f.position.set((i - (big ? 2 : 1)) * 0.28, 0.16, 0);
      g.add(f);
    }
    g.position.set(x, y + 0.02, z);
    root.add(g);
    const l = low ? undefined : light('#fb923c', big ? 4 : 2.5, x, y + 0.6, z + 0.3, 5);
    flames.push({ l, m: g });
  };
  const steamAt = (x: number, y: number, z: number) => {
    if (low) return;
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 8, 6),
      mat('#ffffff', { opacity: 0.35, own: true }),
    );
    m.position.set(x, y, z);
    m.userData.y0 = y;
    root.add(m);
    steam.push(m);
  };
  const backZ = BACK + 0.35;
  switch (s.kitchen) {
    case 'pots': {
      counter(2.6, tier === 1 ? '#0f766e' : s.wood);
      for (const [i, c] of (['#ea580c', '#15803d', '#78350f'] as const).entries()) {
        const x = kx - 0.85 + i * 0.85;
        k.cyl(0.26, 0.24, 0.4, '#9ca3af', x, 1.0, kz + 0.6, { ...STEEL, seg: 14 });
        k.cyl(0.24, 0.24, 0.02, c, x, 1.36, kz + 0.6, { seg: 14 });
        steamAt(x, 1.55, kz + 0.6);
      }
      // A gas ring and a pot on the boil behind; coolers.
      k.box(1.2, 0.7, 0.5, '#57534e', kx, 0, backZ);
      k.cyl(0.3, 0.28, 0.5, '#6b7280', kx, 0.7, backZ, { ...STEEL, seg: 14 });
      k.box(0.6, 0.55, 0.45, '#2563eb', kx + 1.2, 0, backZ, { round: 0.04 });
      k.box(0.6, 0.06, 0.45, '#f8fafc', kx + 1.2, 0.55, backZ);
      break;
    }
    case 'grill': {
      // A charcoal drum grill on legs, skewers across it.
      for (const dx of [-0.6, 0.6]) k.cyl(0.03, 0.03, 0.75, '#1c1917', kx + dx, 0, kz + 0.6);
      k.box(1.5, 0.3, 0.55, '#27272a', kx, 0.72, kz + 0.6, { ...STEEL });
      fireAt(kx, 1.02, kz + 0.6, false);
      for (let i = 0; i < 7; i++) {
        const x = kx - 0.6 + i * 0.2;
        k.box(0.012, 0.012, 0.6, '#d6d3d1', x, 1.07, kz + 0.6);
        for (let j = 0; j < 3; j++)
          k.box(0.05, 0.04, 0.06, '#7c2d12', x, 1.08, kz + 0.45 + j * 0.15);
      }
      k.box(1.4, 0.8, 0.5, s.wood, kx, 0, backZ);
      for (let i = 0; i < 4; i++)
        k.sphere(0.08, i % 2 ? '#a21caf' : '#fde68a', kx - 0.45 + i * 0.3, 0.86, backZ, { seg: 8 });
      break;
    }
    case 'fire': {
      // An open braai: a brick pit with a grate and the fire.
      k.box(2.2, 0.55, 0.9, '#9a3412', kx, 0, kz + 0.7);
      k.box(2.0, 0.04, 0.7, '#1c1917', kx, 0.75, kz + 0.7, STEEL);
      fireAt(kx, 0.56, kz + 0.7, true);
      for (let i = 0; i < 6; i++)
        k.box(0.28, 0.05, 0.12, '#7c2d12', kx - 0.75 + i * 0.3, 0.8, kz + 0.6 + (i % 2) * 0.2);
      // Wood stacked behind.
      for (let i = 0; i < 9; i++)
        k.cyl(
          0.07,
          0.07,
          1.0,
          '#78350f',
          kx - 0.4 + (i % 3) * 0.16,
          0.07 + Math.floor(i / 3) * 0.14,
          backZ,
          {
            rz: Math.PI / 2,
            seg: 8,
          },
        );
      break;
    }
    case 'tandoor': {
      counter(2.6, s.wood, '#d6d3d1');
      for (let i = 0; i < 4; i++)
        k.cyl(0.14, 0.12, 0.16, '#b8892e', kx - 0.9 + i * 0.6, 1.0, kz + 0.6, {
          ...STEEL,
          seg: 12,
        });
      k.cyl(0.32, 0.45, 0.95, '#b45309', kx + 0.4, 0, backZ, { seg: 16 });
      k.cyl(0.2, 0.2, 0.02, '#f97316', kx + 0.4, 0.95, backZ, {
        emissive: '#ea580c',
        emissiveIntensity: 1.6,
        noShadow: true,
      });
      for (let i = 0; i < 3; i++)
        k.cyl(0.14, 0.14, 0.02, '#b45309', kx - 0.8 + i * 0.3, 1.6, BACK + 0.04, {
          rx: Math.PI / 2,
          ...STEEL,
        });
      steamAt(kx + 0.4, 1.2, backZ);
      break;
    }
    case 'wok': {
      counter(2.6, '#a8a29e', '#e5e7eb');
      for (let i = 0; i < 3; i++)
        for (let j = 0; j < 3 - (i % 2); j++)
          k.cyl(0.16, 0.16, 0.1, '#d6b98c', kx - 0.9 + i * 0.6, 1.0 + j * 0.1, kz + 0.6, {
            seg: 12,
          });
      k.box(1.8, 0.85, 0.6, '#71717a', kx, 0, backZ, STEEL);
      for (const dx of [-0.45, 0.45]) {
        k.torus(0.16, 0.02, '#60a5fa', kx + dx, 0.87, backZ, {
          rx: Math.PI / 2,
          emissive: '#3b82f6',
          emissiveIntensity: 2,
          noShadow: true,
        });
        k.cyl(0.3, 0.1, 0.14, '#27272a', kx + dx, 0.88, backZ, { ...STEEL, seg: 14 });
        steamAt(kx + dx, 1.2, backZ);
      }
      k.box(2.0, 0.4, 0.7, '#a1a1aa', kx, 2.0, backZ, STEEL);
      break;
    }
    case 'espresso': {
      counter(3.0, s.wood, tier === 1 ? '#e7e5e4' : '#f5f5f4');
      const em = add('espresso', kx + 0.8, kz + 0.6, 0.6, 0.45);
      em.group.position.y = 1.0;
      // A pastry case on the counter.
      k.box(0.9, 0.35, 0.45, '#e0f2fe', kx - 0.7, 1.0, kz + 0.6, { opacity: 0.4, noShadow: true });
      for (let i = 0; i < 4; i++)
        k.sphere(
          0.07,
          ['#d97706', '#a16207', '#fbbf24', '#7c2d12'][i]!,
          kx - 1.0 + i * 0.2,
          1.08,
          kz + 0.6,
          { sy: 0.6, seg: 8 },
        );
      // Shelves of beans and cups behind.
      k.box(2.2, 0.04, 0.3, s.wood, kx, 1.5, BACK + 0.17);
      for (let i = 0; i < 6; i++)
        k.box(
          0.18,
          0.26,
          0.14,
          ['#78350f', '#f8fafc', '#a16207'][i % 3]!,
          kx - 0.9 + i * 0.36,
          1.54,
          BACK + 0.17,
        );
      break;
    }
    case 'oven': {
      counter(2.6, s.wood, '#f5f5f4');
      for (let i = 0; i < 5; i++)
        k.sphere(0.13, i % 2 ? '#b45309' : '#d97706', kx - 1.0 + i * 0.5, 1.06, kz + 0.6, {
          sx: 1.6,
          sy: 0.6,
          seg: 10,
        });
      k.box(1.6, 0.9, 1.0, '#a8a29e', kx, 0, backZ + 0.15);
      k.sphere(0.75, '#c2410c', kx, 0.9, backZ + 0.15, { sy: 0.75, seg: 14 });
      k.box(0.5, 0.32, 0.04, '#1c1917', kx, 1.02, backZ + 0.82);
      k.box(0.4, 0.22, 0.02, '#f97316', kx, 1.06, backZ + 0.85, {
        emissive: '#ea580c',
        emissiveIntensity: 2,
        noShadow: true,
      });
      break;
    }
    case 'pass': {
      k.box(3.0, 1.0, 0.6, '#d4d4d8', kx, 0, kz + 0.6, STEEL);
      k.box(3.0, 0.04, 0.6, tier === 3 ? '#1c1917' : '#a8a29e', kx, 1.0, kz + 0.6);
      for (let i = 0; i < 3; i++) {
        const x = kx - 0.9 + i * 0.9;
        k.cyl(0.004, 0.004, 0.7, '#1c1917', x, 1.6, kz + 0.6, { noShadow: true });
        k.cyl(0.05, 0.14, 0.14, '#1c1917', x, 1.5, kz + 0.6, { noShadow: true });
        k.cyl(0.12, 0.12, 0.01, '#fde68a', x, 1.49, kz + 0.6, {
          emissive: '#f59e0b',
          emissiveIntensity: 1.4,
          noShadow: true,
        });
        plateAt(k, x, 1.04, kz + 0.66, FOODS.pass!, 3);
      }
      k.box(2.6, 0.9, 0.6, '#71717a', kx, 0, backZ, STEEL);
      k.box(2.8, 0.5, 0.7, '#a1a1aa', kx, 2.1, backZ, STEEL);
      steamAt(kx - 0.5, 1.2, backZ);
      break;
    }
    case 'sushi': {
      k.box(3.6, 1.0, 0.6, s.wood, kx, 0, kz + 0.6, { rough: 0.5 });
      k.box(3.0, 0.22, 0.3, '#e0f2fe', kx, 1.0, kz + 0.5, { opacity: 0.45, noShadow: true });
      for (let i = 0; i < 6; i++)
        k.box(
          0.3,
          0.05,
          0.12,
          ['#fb7185', '#fdba74', '#f8fafc'][i % 3]!,
          kx - 1.25 + i * 0.5,
          1.02,
          kz + 0.5,
        );
      k.box(2.6, 0.04, 0.3, s.wood, kx, 1.5, BACK + 0.17);
      for (let i = 0; i < 7; i++)
        k.cyl(
          0.05,
          0.05,
          0.22,
          ['#f8fafc', '#1c1917'][i % 2]!,
          kx - 1.1 + i * 0.36,
          1.54,
          BACK + 0.17,
          { seg: 8 },
        );
      break;
    }
    case 'spit': {
      counter(2.6, s.wood, '#e7e5e4');
      // The vertical spit, a heater behind it.
      k.box(0.5, 0.9, 0.06, '#7f1d1d', kx + 0.6, 1.0, kz + 0.1, {
        emissive: '#ea580c',
        emissiveIntensity: 1.1,
      });
      k.cyl(0.01, 0.01, 1.0, CHROME, kx + 0.6, 1.0, kz + 0.35, STEEL);
      k.cyl(0.13, 0.21, 0.65, '#a16207', kx + 0.6, 1.12, kz + 0.35, { seg: 12 });
      for (let i = 0; i < 4; i++)
        k.box(
          0.22,
          0.06,
          0.14,
          ['#16a34a', '#dc2626', '#fde68a', '#f8fafc'][i]!,
          kx - 1.0 + i * 0.3,
          0.98,
          kz + 0.7,
        );
      break;
    }
  }
  if (has('chalkboard') && o.menu?.length) {
    const w = 1.7;
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, w / 2),
      new THREE.MeshStandardMaterial({ map: menuTex(o.menu, tier), roughness: 0.9 }),
    );
    m.position.set(
      open ? kx : kx + (kx > 0 ? -1.9 : 1.9),
      open ? 1.9 : 2.05,
      open ? kz - 0.6 : BACK + 0.03,
    );
    root.add(m);
    if (open) k.box(w + 0.1, 0.04, 0.04, '#1c1917', kx, 1.9 - w / 4 - 0.04, kz - 0.6);
  }

  // ---- Tables.
  const seated = o.slots.map((x, i) => ({ s: x, i })).filter((x) => x.s.sit);
  const chairStyle =
    s.seating === 'plastic' ? 'plastic' : s.seating === 'cloth' ? 'dining' : 'wood';
  const chairColor =
    s.seating === 'plastic' ? s.wood : s.seating === 'cloth' ? tone(s.wood, 0.05) : s.wood;
  const food = FOODS[s.kitchen] ?? '#ea580c';
  const sitter = (x: number, z: number, dir: number) => {
    const ry = (dir * Math.PI) / 2;
    if (s.seating === 'bench') {
      k.box(0.36, 0.45, 1.0, tone(s.wood, -0.05), x, 0, z, { round: 0.02 });
    } else if (s.seating === 'booth') {
      k.box(0.55, 0.45, 1.1, cloth, x - dir * 0.05, 0, z, { round: 0.06 });
      k.box(0.18, 1.05, 1.1, cloth, x - dir * 0.32, 0, z, { round: 0.05 });
    } else if (s.seating === 'floor') {
      k.box(0.6, 0.16, 0.6, cloth, x, 0, z, { round: 0.06 });
      k.box(0.16, 0.5, 0.6, tone(cloth, -0.1), x - dir * 0.32, 0, z, { round: 0.06 });
    } else chairAt(k, x, z, ry, chairStyle, chairColor);
  };
  const seatH = s.seating === 'floor' ? 0.2 : 0.45;
  const table = (
    x: number,
    z: number,
    w: number,
    d: number,
    diners: { x: number; dir: number }[],
  ) => {
    const h = s.seating === 'floor' ? 0.36 : 0.74;
    if (s.seating === 'floor') {
      k.cyl(w / 2, w / 2, 0.05, s.wood, x, h - 0.05, z, { seg: 18 });
      k.cyl(0.08, 0.12, h - 0.05, tone(s.wood, -0.1), x, 0, z, { seg: 10 });
      k.cyl(w / 2 - 0.05, w / 2 - 0.05, 0.005, cloth, x, h, z, { seg: 18, noShadow: true });
    } else if (s.seating === 'cloth') {
      // A white cloth to the floor.
      k.box(w, h - 0.06, d, s.tableCloth, x, 0.06, z, { rough: 0.95 });
      k.box(w + 0.04, 0.02, d + 0.04, s.tableCloth, x, h - 0.02, z, { rough: 0.95 });
      k.cyl(0.025, 0.025, 0.12, '#fef3c7', x, h, z, {
        emissive: '#fbbf24',
        emissiveIntensity: 1.6,
        noShadow: true,
        seg: 8,
      });
      k.cyl(0.04, 0.03, 0.1, '#e0f2fe', x + 0.12, h, z + 0.18, {
        opacity: 0.5,
        noShadow: true,
        seg: 8,
      });
      k.sphere(0.05, ['#e11d48', '#f8fafc', '#facc15'][s.variant]!, x + 0.12, h + 0.15, z + 0.18, {
        seg: 8,
        noShadow: true,
      });
    } else if (s.seating === 'plastic') {
      k.box(w, 0.04, d, cloth, x, h - 0.04, z, { round: 0.01 });
      for (const sx of [-1, 1])
        for (const sz of [-1, 1])
          k.cyl(
            0.02,
            0.02,
            h - 0.04,
            '#e5e7eb',
            x + sx * (w / 2 - 0.08),
            0,
            z + sz * (d / 2 - 0.08),
            { seg: 6 },
          );
    } else {
      k.box(w, 0.05, d, s.wood, x, h - 0.05, z, { round: 0.01 });
      for (const sx of [-1, 1])
        for (const sz of [-1, 1])
          k.box(
            0.05,
            h - 0.05,
            0.05,
            tone(s.wood, -0.1),
            x + sx * (w / 2 - 0.08),
            0,
            z + sz * (d / 2 - 0.08),
          );
      // A runner in the venue's colour (benches and booths), a cloth square (bistro).
      if (s.seating === 'bistro')
        k.box(w * 0.7, 0.005, d * 0.7, cloth, x, h, z, { noShadow: true, ry: Math.PI / 4 });
      else k.box(0.3, 0.005, d, cloth, x, h, z, { noShadow: true });
    }
    for (const di of diners) plateAt(k, di.x + di.dir * 0.32, h + 0.005, z + 0.05, food, tier);
  };
  for (const p of pairs(seated)) {
    const ax = vx(p.a.s.x);
    const az = vz(p.a.s.y);
    if (p.b) {
      const bx = vx(p.b.s.x);
      sitter(ax, az, 1);
      sitter(bx, az, -1);
      const w = Math.max(0.6, Math.min(1.3, bx - ax - 0.5));
      table((ax + bx) / 2, az, w, s.seating === 'cloth' ? 0.95 : 0.8, [
        { x: ax, dir: 1 },
        { x: bx, dir: -1 },
      ]);
      seat(p.a.i, ax, az, Math.PI / 2, seatH);
      seat(p.b.i, bx, az, -Math.PI / 2, seatH);
    } else {
      const dir = p.a.s.flip ? -1 : 1;
      sitter(ax, az, dir);
      table(ax + dir * 0.75, az, 0.8, 0.75, [{ x: ax, dir }]);
      seat(p.a.i, ax, az, (dir * Math.PI) / 2, seatH);
    }
  }
  // Tier 1 outdoors: parasols over a couple of tables.
  if (has('umbrellas') && open) {
    const cols = s.cloth;
    pairs(seated)
      .slice(0, low ? 1 : 2)
      .forEach((p, i) => {
        const x = p.b ? (vx(p.a.s.x) + vx(p.b.s.x)) / 2 : vx(p.a.s.x);
        add('parasol', x, vz(p.a.s.y) - 0.1, 1, 1, 0, cols[i % cols.length]);
      });
  }
  // Plants in the corners.
  if (has('plants') && !open) {
    add(
      'plants',
      winX > 0 ? RW / 2 - 0.5 : -RW / 2 + 0.5,
      RD / 2 - 0.6,
      0.8,
      0.8,
      0,
      undefined,
      tier === 3 ? 3 : 2,
    );
    if (!low) add('plants', -kx * 0.4 + flip * 0.5, BACK + 0.4, 0.8, 0.8, 0, undefined, 2);
  }
  if (has('palms') && !open) palm(k, kx > 0 ? -RW / 2 + 0.6 : RW / 2 - 0.6, BACK + 0.6);

  // ---- Overhead: string lights, bunting, lanterns, a chandelier, a fan.
  const top = open ? 2.75 : 2.7;
  if (has('string-lights')) {
    const warm = ['#fde68a', '#fbbf24', '#fef3c7'];
    bulbs(k, -RW / 2 + 0.3, RW / 2 - 0.3, top, -0.4, warm, low ? 10 : 18);
    if (!low) bulbs(k, -RW / 2 + 0.3, RW / 2 - 0.3, top - 0.1, 1.6, warm, 18);
  }
  if (has('bunting')) flags(k, -RW / 2 + 0.3, RW / 2 - 0.3, top, 0.6, s.cloth, false);
  if (has('papel-picado')) {
    flags(
      k,
      -RW / 2 + 0.3,
      RW / 2 - 0.3,
      top,
      0.2,
      ['#ec4899', '#facc15', '#22c55e', '#3b82f6', '#f97316'],
      true,
    );
    if (!low)
      flags(k, -RW / 2 + 0.3, RW / 2 - 0.3, top, 1.8, ['#a855f7', '#ef4444', '#14b8a6'], true);
  }
  if (has('lanterns') || has('paper-lanterns')) {
    const paper = has('paper-lanterns');
    const xs = low ? [-3, 1] : [-4, -1.5, 1, 3.5];
    xs.forEach((x, i) =>
      lantern(k, x, top - 0.25, i % 2 ? 1.2 : -0.6, paper ? '#dc2626' : '#f59e0b', paper),
    );
  }
  if (has('chandelier') && !open) {
    const cx = winX > 0 ? 0.8 : -0.8;
    k.cyl(0.006, 0.006, 0.4, '#1c1917', cx, 2.6, 0.2, { noShadow: true });
    k.torus(0.4, 0.02, '#d4af37', cx, 2.55, 0.2, { rx: Math.PI / 2, ...STEEL, noShadow: true });
    for (let i = 0; i < 8; i++)
      k.sphere(0.04, '#fef3c7', cx + Math.cos(i) * 0.4, 2.6, 0.2 + Math.sin(i) * 0.4, {
        emissive: '#fbbf24',
        emissiveIntensity: 2,
        noShadow: true,
        seg: 6,
      });
  }
  if (has('fan') && !open) {
    const g = new THREE.Group();
    const bm = mat(tone(s.wood, -0.1));
    for (let i = 0; i < 4; i++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.015, 0.14), bm);
      b.position.x = 0.45;
      const arm = new THREE.Group();
      arm.rotation.y = (i * Math.PI) / 2;
      arm.add(b);
      g.add(arm);
    }
    g.position.set(-0.5, 2.55, 0.6);
    k.cyl(0.01, 0.01, 0.4, '#1c1917', -0.5, 2.6, 0.6, { noShadow: true });
    root.add(g);
    fan = g;
  }

  // ---- Light: bright tubes at a stall, pendants at a casual place, low and warm at fine dining.
  const bright = tier === 1 ? 3.6 : tier === 2 ? 2.8 : 2.3;
  const lampY = open ? 2.4 : 2.5;
  for (const x of low ? [-2.8, 2.8] : [-3.6, 3.6]) {
    const l = light(s.light, o.night ? bright * 1.1 : bright, x, lampY, 0.2);
    lamps.push(l);
    if (open) continue;
    if (tier === 1)
      k.box(1.1, 0.05, 0.08, '#f8fafc', x, 2.9, BACK + 0.06, {
        emissive: '#f8fafc',
        emissiveIntensity: 1.5,
        noShadow: true,
      });
    else {
      k.cyl(0.004, 0.004, 0.5, '#111', x, 2.5, 0.2, { noShadow: true });
      k.cyl(
        0.07,
        tier === 3 ? 0.14 : 0.22,
        tier === 3 ? 0.24 : 0.18,
        tier === 3 ? '#1c1917' : tone(s.wall, -0.2),
        x,
        2.32,
        0.2,
        {
          noShadow: true,
        },
      );
      k.cyl(0.06, 0.06, 0.01, '#fde68a', x, 2.32, 0.2, {
        emissive: '#fbbf24',
        emissiveIntensity: 2,
        noShadow: true,
      });
    }
  }

  root.add(k.build());

  const env: NightEnv = open
    ? {
        background: new THREE.Color(o.night ? '#0b1328' : '#7dd3fc'),
        hemi: o.night ? 0.6 : 1.25,
        hemiColor: o.night ? '#a5b4fc' : '#fff4e0',
        sun: o.night ? 0.4 : 2.0,
        ambient: o.night ? 0.2 : 0.3,
        elevation: 0.55,
      }
    : {
        background: new THREE.Color('#0f172a'),
        hemi: tier === 1 ? 1.2 : tier === 2 ? (o.night ? 0.8 : 1.0) : 0.8,
        hemiColor: tier === 3 ? '#ffd9a0' : '#fff4e0',
        sun: tier === 1 ? 1.4 : tier === 2 ? 1.0 : 0.7,
        ambient: tier === 3 ? 0.18 : 0.25,
      };

  const animate = (t: number, dt: number, reduced: boolean) => {
    if (reduced) return;
    if (fan) fan.rotation.y += dt * 3;
    flames.forEach((f, i) => {
      const n = 0.85 + Math.sin(t * 13 + i) * 0.1 + Math.sin(t * 7.3 + i * 2) * 0.08;
      f.m.scale.set(1, n, 1);
      if (f.l) f.l.intensity = (f.l.userData.base ??= f.l.intensity) * n;
    });
    steam.forEach((m, i) => {
      const u = (t * 0.4 + i * 0.37) % 1;
      m.position.y = (m.userData.y0 as number) + u * 0.6;
      m.scale.setScalar(0.6 + u);
      (m.material as THREE.MeshStandardMaterial).opacity = 0.35 * (1 - u);
    });
  };

  return {
    root,
    sides,
    seats,
    screens,
    decks: [],
    movers: [],
    lamps,
    env,
    lift: new Map(),
    faces: new Map(),
    poses: {},
    animate,
  };
}

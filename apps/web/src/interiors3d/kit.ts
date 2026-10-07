/**
 * Wave 9 §C: the 3D room kit's basics. Procedural canvas textures (floors,
 * rugs, grass), a material cache and `Kit`, a builder that collects
 * primitives by material and merges them into one mesh per material, so a
 * whole sofa or kitchen is a handful of draw calls. No external assets.
 *
 * Units are metres; a home tile is one metre. Models are built around their
 * footprint's centre with the front facing +z and the floor at y = 0.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

// ---------------------------------------------------------------------------
// Materials

export interface MatOpts {
  rough?: number;
  metal?: number;
  emissive?: string;
  emissiveIntensity?: number;
  opacity?: number;
  map?: THREE.Texture;
  /** Not cached: the caller animates it (a TV screen, a lamp shade). */
  own?: boolean;
  side?: THREE.Side;
}

const MATS = new Map<string, THREE.MeshStandardMaterial>();

export function mat(color: string, o: MatOpts = {}): THREE.MeshStandardMaterial {
  const key = `${color}|${o.rough ?? 0.75}|${o.metal ?? 0}|${o.emissive ?? ''}|${o.emissiveIntensity ?? 1}|${o.opacity ?? 1}|${o.map?.uuid ?? ''}|${o.side ?? 0}`;
  if (!o.own) {
    const hit = MATS.get(key);
    if (hit) return hit;
  }
  const m = new THREE.MeshStandardMaterial({
    color: new THREE.Color(color),
    roughness: o.rough ?? 0.75,
    metalness: o.metal ?? 0,
    ...(o.emissive
      ? { emissive: new THREE.Color(o.emissive), emissiveIntensity: o.emissiveIntensity ?? 1 }
      : {}),
    ...(o.opacity !== undefined && o.opacity < 1
      ? { transparent: true, opacity: o.opacity, depthWrite: false }
      : {}),
    ...(o.map ? { map: o.map } : {}),
    side: o.side ?? THREE.FrontSide,
  });
  if (!o.own) MATS.set(key, m);
  return m;
}

// ---------------------------------------------------------------------------
// Textures (canvas, generated once)

const TEX = new Map<string, THREE.CanvasTexture>();

function canvasTex(
  key: string,
  size: number,
  draw: (g: CanvasRenderingContext2D, s: number) => void,
  repeat = true,
): THREE.Texture {
  const hit = TEX.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  draw(g, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  TEX.set(key, t);
  return t;
}

/** Small deterministic noise for textures. */
function rnd(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 10000) / 10000;
  };
}

export type FloorKind =
  | 'parquet'
  | 'parquet-dark'
  | 'tile'
  | 'bath'
  | 'marble'
  | 'carpet'
  | 'concrete'
  | 'checker'
  | 'dance'
  | 'grass'
  | 'turf'
  | 'sand'
  | 'stone';

/** One texture covers this many metres. */
export const FLOOR_SCALE: Record<FloorKind, number> = {
  parquet: 2,
  'parquet-dark': 2,
  tile: 2,
  bath: 1,
  marble: 3,
  carpet: 2,
  concrete: 4,
  checker: 2,
  dance: 2,
  grass: 6,
  turf: 4,
  sand: 4,
  stone: 3,
};

export function floorTexture(kind: FloorKind, tint?: string): THREE.Texture {
  return canvasTex(`floor:${kind}:${tint ?? ''}`, 256, (g, s) => {
    const r = rnd(kind.length * 977 + (tint ? tint.charCodeAt(1) : 0));
    switch (kind) {
      case 'parquet':
      case 'parquet-dark': {
        const base = kind === 'parquet' ? [176, 122, 74] : [104, 66, 40];
        const plankW = s / 4;
        const plankL = s / 2;
        for (let col = 0; col < 4; col++)
          for (let row = -1; row < 3; row++) {
            const off = col % 2 ? plankL / 2 : 0;
            const v = (r() - 0.5) * 34;
            g.fillStyle = `rgb(${base[0]! + v},${base[1]! + v * 0.7},${base[2]! + v * 0.5})`;
            g.fillRect(col * plankW, row * plankL + off, plankW, plankL);
            // grain
            g.strokeStyle = 'rgba(60,30,10,0.12)';
            g.lineWidth = 1;
            for (let k = 0; k < 4; k++) {
              const x = col * plankW + 6 + r() * (plankW - 12);
              g.beginPath();
              g.moveTo(x, row * plankL + off + 4);
              g.bezierCurveTo(
                x + 4,
                row * plankL + off + plankL * 0.3,
                x - 4,
                row * plankL + off + plankL * 0.7,
                x + 1,
                row * plankL + off + plankL - 4,
              );
              g.stroke();
            }
            g.strokeStyle = 'rgba(40,20,8,0.55)';
            g.lineWidth = 2;
            g.strokeRect(col * plankW, row * plankL + off, plankW, plankL);
          }
        break;
      }
      case 'tile':
      case 'checker': {
        const a = kind === 'tile' ? '#e9e4da' : (tint ?? '#efe9df');
        const b = kind === 'tile' ? '#c9c2b5' : '#2f2a26';
        const n = 4;
        const q = s / n;
        for (let i = 0; i < n; i++)
          for (let j = 0; j < n; j++) {
            g.fillStyle = (i + j) % 2 ? b : a;
            g.fillRect(i * q, j * q, q, q);
          }
        g.strokeStyle = 'rgba(0,0,0,0.12)';
        g.lineWidth = 2;
        for (let i = 0; i <= n; i++) {
          g.beginPath();
          g.moveTo(i * q, 0);
          g.lineTo(i * q, s);
          g.moveTo(0, i * q);
          g.lineTo(s, i * q);
          g.stroke();
        }
        break;
      }
      case 'bath': {
        g.fillStyle = '#dfeef2';
        g.fillRect(0, 0, s, s);
        const n = 4;
        const q = s / n;
        for (let i = 0; i < n; i++)
          for (let j = 0; j < n; j++) {
            const v = r() * 14;
            g.fillStyle = `rgb(${205 + v},${226 + v * 0.5},${232})`;
            g.fillRect(i * q + 2, j * q + 2, q - 4, q - 4);
          }
        break;
      }
      case 'marble': {
        g.fillStyle = '#ece9e4';
        g.fillRect(0, 0, s, s);
        for (let k = 0; k < 14; k++) {
          g.strokeStyle = `rgba(120,115,110,${0.08 + r() * 0.15})`;
          g.lineWidth = 0.6 + r() * 2;
          g.beginPath();
          let x = r() * s;
          let y = 0;
          g.moveTo(x, y);
          while (y < s) {
            x += (r() - 0.5) * 40;
            y += 10 + r() * 30;
            g.lineTo(x, y);
          }
          g.stroke();
        }
        g.strokeStyle = 'rgba(0,0,0,0.12)';
        g.lineWidth = 2;
        g.strokeRect(0, 0, s / 2, s / 2);
        g.strokeRect(s / 2, s / 2, s / 2, s / 2);
        break;
      }
      case 'carpet': {
        g.fillStyle = tint ?? '#7c6f9c';
        g.fillRect(0, 0, s, s);
        for (let k = 0; k < 4000; k++) {
          g.fillStyle = `rgba(${r() > 0.5 ? '255,255,255' : '0,0,0'},0.06)`;
          g.fillRect(r() * s, r() * s, 2, 2);
        }
        break;
      }
      case 'concrete':
      case 'stone': {
        g.fillStyle = kind === 'concrete' ? '#9a9a96' : '#b9b2a6';
        g.fillRect(0, 0, s, s);
        for (let k = 0; k < 3000; k++) {
          const v = r();
          g.fillStyle = `rgba(${v > 0.5 ? '255,255,255' : '0,0,0'},${0.04 + r() * 0.05})`;
          g.fillRect(r() * s, r() * s, 1 + r() * 3, 1 + r() * 3);
        }
        g.strokeStyle = 'rgba(0,0,0,0.18)';
        g.lineWidth = 2;
        if (kind === 'stone') {
          g.strokeRect(0, 0, s / 2, s / 2);
          g.strokeRect(s / 2, s / 2, s / 2, s / 2);
        } else g.strokeRect(0, 0, s, s);
        break;
      }
      case 'dance': {
        const n = 4;
        const q = s / n;
        const cols = ['#7c3aed', '#db2777', '#0ea5e9', '#f59e0b', '#10b981'];
        for (let i = 0; i < n; i++)
          for (let j = 0; j < n; j++) {
            g.fillStyle = cols[Math.floor(r() * cols.length)]!;
            g.fillRect(i * q + 3, j * q + 3, q - 6, q - 6);
          }
        break;
      }
      case 'grass':
      case 'turf': {
        g.fillStyle = kind === 'grass' ? '#5f7a46' : '#2f8f46';
        g.fillRect(0, 0, s, s);
        for (let k = 0; k < 5000; k++) {
          const v = r();
          g.fillStyle =
            kind === 'grass'
              ? `rgba(${v > 0.5 ? '120,150,80' : '60,80,40'},0.35)`
              : `rgba(${v > 0.5 ? '70,170,90' : '20,100,40'},0.3)`;
          g.fillRect(r() * s, r() * s, 1, 2 + r() * 3);
        }
        if (kind === 'turf') {
          g.fillStyle = 'rgba(255,255,255,0.06)';
          g.fillRect(0, 0, s / 2, s);
        }
        break;
      }
      case 'sand': {
        g.fillStyle = '#e8d3a2';
        g.fillRect(0, 0, s, s);
        for (let k = 0; k < 4000; k++) {
          g.fillStyle = `rgba(${r() > 0.5 ? '255,255,255' : '150,110,60'},0.18)`;
          g.fillRect(r() * s, r() * s, 1, 1);
        }
        break;
      }
    }
  });
}

/** A rug's pattern, by tier (woven stripes, wool, hand-knotted). */
export function rugTexture(tier: number, color: string): THREE.Texture {
  return canvasTex(
    `rug:${tier}:${color}`,
    256,
    (g, s) => {
      const r = rnd(tier * 31 + 7);
      g.fillStyle = color;
      g.fillRect(0, 0, s, s);
      if (tier === 1) {
        for (let y = 0; y < s; y += 16) {
          g.fillStyle = y % 32 ? 'rgba(255,240,200,0.35)' : 'rgba(80,40,10,0.25)';
          g.fillRect(0, y, s, 8);
        }
      } else if (tier === 2) {
        g.strokeStyle = 'rgba(255,255,255,0.5)';
        g.lineWidth = 10;
        g.strokeRect(18, 18, s - 36, s - 36);
        for (let k = 0; k < 3000; k++) {
          g.fillStyle = `rgba(${r() > 0.5 ? '255,255,255' : '0,0,0'},0.05)`;
          g.fillRect(r() * s, r() * s, 2, 2);
        }
      } else {
        g.strokeStyle = '#f5deb3';
        g.lineWidth = 8;
        g.strokeRect(10, 10, s - 20, s - 20);
        g.strokeStyle = '#7f1d1d';
        g.lineWidth = 6;
        g.strokeRect(26, 26, s - 52, s - 52);
        g.fillStyle = '#f5deb3';
        g.beginPath();
        g.moveTo(s / 2, 50);
        g.lineTo(s - 50, s / 2);
        g.lineTo(s / 2, s - 50);
        g.lineTo(50, s / 2);
        g.closePath();
        g.fill();
        g.fillStyle = '#1e3a8a';
        g.beginPath();
        g.arc(s / 2, s / 2, 34, 0, Math.PI * 2);
        g.fill();
      }
    },
    false,
  );
}

/** A painting: a few soft blocks of colour, seeded. */
export function paintingTexture(seed: number): THREE.Texture {
  return canvasTex(
    `paint:${seed}`,
    128,
    (g, s) => {
      const r = rnd(seed * 131 + 3);
      const pal = ['#f59e0b', '#ef4444', '#0ea5e9', '#10b981', '#8b5cf6', '#f472b6', '#1e293b'];
      g.fillStyle = '#f8f3e7';
      g.fillRect(0, 0, s, s);
      for (let k = 0; k < 6; k++) {
        g.fillStyle = pal[Math.floor(r() * pal.length)]!;
        g.globalAlpha = 0.75;
        if (r() > 0.5) {
          g.beginPath();
          g.arc(r() * s, r() * s, 10 + r() * 34, 0, Math.PI * 2);
          g.fill();
        } else g.fillRect(r() * s, r() * s, 20 + r() * 60, 20 + r() * 60);
      }
      g.globalAlpha = 1;
    },
    false,
  );
}

/** A soft round shadow (contact shadows under furniture and people). */
export function blobTexture(): THREE.Texture {
  return canvasTex(
    'blob',
    128,
    (g, s) => {
      const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      grd.addColorStop(0, 'rgba(0,0,0,0.55)');
      grd.addColorStop(0.55, 'rgba(0,0,0,0.25)');
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, s, s);
    },
    false,
  );
}

/** A soft edge: darkens the floor along walls (baked ambient occlusion). */
export function edgeTexture(): THREE.Texture {
  return canvasTex(
    'edge',
    64,
    (g, s) => {
      const grd = g.createLinearGradient(0, 0, 0, s);
      grd.addColorStop(0, 'rgba(0,0,0,0.42)');
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, s, s);
    },
    false,
  );
}

/** A soft glow sprite (lamps, stage lights). */
export function glowTexture(): THREE.Texture {
  return canvasTex(
    'glow',
    64,
    (g, s) => {
      const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      grd.addColorStop(0, 'rgba(255,255,255,1)');
      grd.addColorStop(0.3, 'rgba(255,255,255,0.45)');
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, s, s);
    },
    false,
  );
}

/** A screen's picture: a few bright shapes (a film, a game, a slide). */
export function screenTexture(kind: 'film' | 'game' | 'slide' | 'lyrics' | 'menu'): THREE.Texture {
  return canvasTex(
    `screen:${kind}`,
    128,
    (g, s) => {
      const grd = g.createLinearGradient(0, 0, s, s);
      if (kind === 'film') {
        grd.addColorStop(0, '#1e3a8a');
        grd.addColorStop(1, '#f97316');
        g.fillStyle = grd;
        g.fillRect(0, 0, s, s);
        g.fillStyle = '#0f172a';
        g.beginPath();
        g.moveTo(0, s);
        g.lineTo(s * 0.35, s * 0.55);
        g.lineTo(s * 0.6, s * 0.75);
        g.lineTo(s, s * 0.45);
        g.lineTo(s, s);
        g.fill();
        g.fillStyle = '#fde68a';
        g.beginPath();
        g.arc(s * 0.7, s * 0.3, 12, 0, Math.PI * 2);
        g.fill();
      } else if (kind === 'game') {
        g.fillStyle = '#0b1020';
        g.fillRect(0, 0, s, s);
        const cols = ['#22d3ee', '#f472b6', '#facc15', '#4ade80'];
        for (let k = 0; k < 10; k++) {
          g.fillStyle = cols[k % 4]!;
          g.fillRect((k * 37) % s, (k * 53) % s, 14, 14);
        }
      } else if (kind === 'slide') {
        g.fillStyle = '#f8fafc';
        g.fillRect(0, 0, s, s);
        g.fillStyle = '#2563eb';
        g.fillRect(10, 12, s - 20, 16);
        g.fillStyle = '#94a3b8';
        for (let k = 0; k < 4; k++) g.fillRect(14, 40 + k * 14, s * 0.5 - k * 8, 6);
        g.fillStyle = '#10b981';
        for (let k = 0; k < 4; k++) g.fillRect(s * 0.62 + k * 10, s - 20 - k * 16, 7, k * 16 + 8);
      } else if (kind === 'lyrics') {
        g.fillStyle = '#312e81';
        g.fillRect(0, 0, s, s);
        g.fillStyle = '#f9a8d4';
        for (let k = 0; k < 3; k++) g.fillRect(16, 34 + k * 24, s - 32 - k * 18, 9);
      } else {
        g.fillStyle = '#1c1917';
        g.fillRect(0, 0, s, s);
        g.fillStyle = '#fbbf24';
        for (let k = 0; k < 5; k++) g.fillRect(14, 14 + k * 20, s * 0.6, 6);
      }
    },
    false,
  );
}

/** A sign's text on a board. */
export function signTexture(text: string, bg: string, fg = '#fff'): THREE.Texture {
  return canvasTex(
    `sign:${text}:${bg}:${fg}`,
    512,
    (g, s) => {
      g.fillStyle = bg;
      g.fillRect(0, 0, s, s / 4);
      g.fillStyle = fg;
      g.font = `bold ${Math.round(s / 10)}px system-ui, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(text, s / 2, s / 8, s - 20);
    },
    false,
  );
}

// ---------------------------------------------------------------------------
// The builder

export interface PartOpts extends MatOpts {
  rx?: number;
  ry?: number;
  rz?: number;
  /** Rounded box edge radius. */
  round?: number;
  seg?: number;
  /** Doesn't cast a shadow (glass, glows, rugs). */
  noShadow?: boolean;
}

interface Bucket {
  mat: THREE.Material;
  geos: THREE.BufferGeometry[];
  shadow: boolean;
}

const tmp = new THREE.Matrix4();
const q = new THREE.Quaternion();
const e = new THREE.Euler();

/**
 * Collects primitives (box, cylinder, sphere…) in a local frame and builds
 * one merged mesh per material. `y` is the bottom of a box or cylinder.
 */
export class Kit {
  private buckets = new Map<THREE.Material, Bucket>();
  /** Meshes that stay separate (animated parts). */
  readonly extras: THREE.Object3D[] = [];

  add(geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, o: PartOpts) {
    e.set(o.rx ?? 0, o.ry ?? 0, o.rz ?? 0);
    q.setFromEuler(e);
    tmp.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(1, 1, 1));
    const g = geo.index ? geo.toNonIndexed() : geo;
    g.applyMatrix4(tmp);
    for (const k of Object.keys(g.attributes))
      if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    let b = this.buckets.get(m);
    if (!b) {
      b = { mat: m, geos: [], shadow: !o.noShadow };
      this.buckets.set(m, b);
    }
    if (o.noShadow) b.shadow = false;
    b.geos.push(g);
    return this;
  }

  private m(color: string, o: PartOpts) {
    return mat(color, o);
  }

  /** A box: w (x) × h (y) × d (z), bottom at y. */
  box(
    w: number,
    h: number,
    d: number,
    color: string,
    x: number,
    y: number,
    z: number,
    o: PartOpts = {},
  ) {
    const geo =
      o.round && o.round > 0
        ? new RoundedBoxGeometry(w, h, d, 2, Math.min(o.round, w / 2, h / 2, d / 2) * 0.999)
        : new THREE.BoxGeometry(w, h, d);
    geo.translate(0, h / 2, 0);
    return this.add(geo, this.m(color, o), x, y, z, o);
  }

  /** A cylinder (or cone), bottom at y. */
  cyl(
    rTop: number,
    rBot: number,
    h: number,
    color: string,
    x: number,
    y: number,
    z: number,
    o: PartOpts = {},
  ) {
    const geo = new THREE.CylinderGeometry(rTop, rBot, h, o.seg ?? 16);
    geo.translate(0, h / 2, 0);
    return this.add(geo, this.m(color, o), x, y, z, o);
  }

  /** A sphere (scaled to an ellipsoid with sx/sy/sz), centred at (x, y, z). */
  sphere(
    r: number,
    color: string,
    x: number,
    y: number,
    z: number,
    o: PartOpts & { sx?: number; sy?: number; sz?: number } = {},
  ) {
    const geo = new THREE.SphereGeometry(
      r,
      o.seg ?? 14,
      Math.max(6, Math.round((o.seg ?? 14) * 0.7)),
    );
    geo.scale(o.sx ?? 1, o.sy ?? 1, o.sz ?? 1);
    return this.add(geo, this.m(color, o), x, y, z, o);
  }

  /** A torus (a ring, a tyre), centred, lying in the xy plane before rotation. */
  torus(r: number, tube: number, color: string, x: number, y: number, z: number, o: PartOpts = {}) {
    const geo = new THREE.TorusGeometry(r, tube, 8, o.seg ?? 20);
    return this.add(geo, this.m(color, o), x, y, z, o);
  }

  /** A flat panel (a picture, a screen) facing +z, centred at (x, y, z). */
  plane(w: number, h: number, color: string, x: number, y: number, z: number, o: PartOpts = {}) {
    const geo = new THREE.PlaneGeometry(w, h);
    return this.add(geo, this.m(color, { ...o, noShadow: true }), x, y, z, {
      ...o,
      noShadow: true,
    });
  }

  /** Keep a mesh separate (it moves or changes colour). */
  keep(obj: THREE.Object3D) {
    this.extras.push(obj);
    return obj;
  }

  build(): THREE.Group {
    const g = new THREE.Group();
    for (const b of this.buckets.values()) {
      if (!b.geos.length) continue;
      const geo = b.geos.length === 1 ? b.geos[0]! : mergeGeometries(b.geos, false);
      if (!geo) continue;
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, b.mat);
      mesh.castShadow = b.shadow;
      mesh.receiveShadow = true;
      g.add(mesh);
    }
    for (const x of this.extras) g.add(x);
    this.buckets.clear();
    return g;
  }
}

/** A flat soft shadow under something (w × d metres). */
export function contactShadow(w: number, d: number, opacity = 0.55): THREE.Mesh {
  const m = new THREE.MeshBasicMaterial({
    map: blobTexture(),
    transparent: true,
    depthWrite: false,
    opacity,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), m);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.012;
  mesh.renderOrder = 1;
  return mesh;
}

/** Free a scene graph's GPU memory (shared cached materials and textures are kept). */
export function disposeTree(root: THREE.Object3D) {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
    const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
    for (const x of mats) {
      let cached = false;
      for (const v of MATS.values()) if (v === x) cached = true;
      if (!cached) x.dispose();
    }
  });
}

export const hexOf = (c: THREE.Color) => `#${c.getHexString()}`;

/** Lighten (amt > 0) or darken a hex colour. */
export function tone(hex: string, amt: number): string {
  const c = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  c.setHSL(hsl.h, hsl.s, Math.max(0, Math.min(1, hsl.l + amt)));
  return `#${c.getHexString()}`;
}

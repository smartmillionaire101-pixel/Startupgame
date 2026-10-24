/**
 * Phase 6b: the flight's textures, all drawn here in canvases (no image
 * files): soft cumulus puffs for the cloud billboards, a tileable noise for
 * the cloud deck and the fields, the ground around an airport (fields, the
 * city, the coast, its lights at night), the runway's markings, and the
 * cabin's carpet, sky-lit window panes and front bulkhead.
 *
 * Every random choice is seeded (travel.ts `seeded`), so the same route
 * draws the same clouds and the same city every time.
 */
import * as THREE from 'three';
import { fnv, seeded } from '../travel';
import type { Flavour } from '../flavour';

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!] as const;
}

function canvasTexture(c: HTMLCanvasElement, srgb = true, repeat = false) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// ---------------------------------------------------------------------------
// Clouds

/**
 * Four cumulus puffs in a 2 × 2 atlas. Red is the light (sunlit tops, grey
 * bellies), alpha the density; the shader colours them by the sky.
 */
export function cloudAtlas(seed: string): THREE.Texture {
  const S = 256;
  const [out, o] = canvas(S * 2, S * 2);
  const rnd = seeded(fnv(`${seed}:clouds`));
  for (let cell = 0; cell < 4; cell++) {
    const [d, g] = canvas(S, S);
    const base = S * (0.68 + rnd() * 0.06);
    const wide = 0.34 + rnd() * 0.08;
    const tall = 0.26 + rnd() * 0.14;
    // The puffs: a domed heap on a flat-ish base.
    const puffs: [number, number, number][] = [];
    for (let i = 0; i < 34; i++) {
      const u = (rnd() * 2 - 1) * wide;
      const dome = tall * (1 - (u / (wide + 0.04)) ** 2);
      const r = S * (0.07 + rnd() * 0.1) * (0.6 + dome * 1.6);
      const x = S / 2 + u * S;
      const y = base - rnd() * dome * S * 0.95 - r * 0.25;
      puffs.push([x, y, r]);
    }
    for (const [x, y, r] of puffs) {
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(255,255,255,0.95)');
      gr.addColorStop(0.55, 'rgba(255,255,255,0.75)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
    // A softer, flatter bottom.
    g.globalCompositeOperation = 'destination-out';
    const cut = g.createLinearGradient(0, base - S * 0.04, 0, base + S * 0.12);
    cut.addColorStop(0, 'rgba(0,0,0,0)');
    cut.addColorStop(1, 'rgba(0,0,0,1)');
    g.fillStyle = cut;
    g.fillRect(0, base - S * 0.04, S, S);
    // The light: bright tops, darker bellies, each puff a little rounder.
    const [l, lg] = canvas(S, S);
    const shade = lg.createLinearGradient(0, base - tall * S, 0, base + 10);
    shade.addColorStop(0, 'rgb(255,0,0)');
    shade.addColorStop(0.55, 'rgb(205,0,0)');
    shade.addColorStop(1, 'rgb(95,0,0)');
    lg.fillStyle = shade;
    lg.fillRect(0, 0, S, S);
    for (const [x, y, r] of puffs) {
      const gr = lg.createRadialGradient(x - r * 0.2, y - r * 0.35, 0, x, y, r);
      gr.addColorStop(0, 'rgba(255,0,0,0.5)');
      gr.addColorStop(1, 'rgba(255,0,0,0)');
      lg.fillStyle = gr;
      lg.beginPath();
      lg.arc(x, y, r, 0, Math.PI * 2);
      lg.fill();
    }
    lg.globalCompositeOperation = 'destination-in';
    lg.drawImage(d, 0, 0);
    o.drawImage(l, (cell % 2) * S, Math.floor(cell / 2) * S);
  }
  const t = canvasTexture(out, false);
  t.premultiplyAlpha = false;
  return t;
}

/** A periodic value-noise fbm (0–1), `n` pixels square, tiling seamlessly. */
function noiseField(n: number, seed: string, octaves = 5): Float32Array {
  const rnd = seeded(fnv(`${seed}:noise`));
  const out = new Float32Array(n * n);
  let amp = 1;
  let total = 0;
  for (let o = 0; o < octaves; o++) {
    const cells = 4 << o;
    const lat = Float32Array.from({ length: cells * cells }, () => rnd());
    const at = (i: number, j: number) => lat[(j % cells) * cells + (i % cells)]!;
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const fx = (x / n) * cells;
        const fy = (y / n) * cells;
        const i = Math.floor(fx);
        const j = Math.floor(fy);
        let u = fx - i;
        let v = fy - j;
        u = u * u * (3 - 2 * u);
        v = v * v * (3 - 2 * v);
        const a = at(i, j) + (at(i + 1, j) - at(i, j)) * u;
        const b = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * u;
        out[y * n + x]! += (a + (b - a) * v) * amp;
      }
    total += amp;
    amp *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i] = out[i]! / total;
  return out;
}

/** The noise as a repeating texture (in red; the cloud deck and the fields read it). */
export function noiseTexture(seed: string): THREE.DataTexture {
  const n = 256;
  const f = noiseField(n, seed);
  // Stretch it: fbm sits around 0.5; the deck wants clear gaps and thick heaps.
  let lo = 1;
  let hi = 0;
  for (const v of f) {
    lo = Math.min(lo, v);
    hi = Math.max(hi, v);
  }
  const px = new Uint8Array(n * n * 4);
  for (let i = 0; i < f.length; i++) {
    const v = Math.round(((f[i]! - lo) / (hi - lo)) * 255);
    px[i * 4] = px[i * 4 + 1] = px[i * 4 + 2] = v;
    px[i * 4 + 3] = 255;
  }
  const t = new THREE.DataTexture(px, n, n, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}

// ---------------------------------------------------------------------------
// The ground around an airport

/** Metres the ground texture covers, centred on the runway. */
export const GROUND_SPAN = 26_000;
/** Where the city sits from the runway (metres, x along the runway, z across). */
export const CITY_AT = { x: 2600, z: 4200, r: 3600 };

/**
 * The land around the airport, seen from the air: a patchwork of fields in
 * the city's colours, roads, the city itself (blocks, roofs) and, for a
 * city on the water, the coast. At night the land goes dark and the city's
 * streets are strings of lights.
 */
export function groundTexture(marketId: string, fl: Flavour, night: boolean): THREE.Texture {
  const N = 1024;
  const [c, g] = canvas(N, N);
  const rnd = seeded(fnv(`${marketId}:ground`));
  const m = N / GROUND_SPAN;
  const X = (x: number) => N / 2 + x * m;
  const Z = (z: number) => N / 2 + z * m;
  const land = night ? '#10161f' : fl.land;
  g.fillStyle = land;
  g.fillRect(0, 0, N, N);
  // Fields: rotated plots in a few muted tones.
  const tones = night
    ? ['#121a24', '#0e141c', '#151d22']
    : [fl.park, fl.parkEdge, fl.land, '#b9c48e', '#9fb57a', '#c8b88a', fl.edgeColor];
  for (let i = 0; i < 900; i++) {
    const x = rnd() * N;
    const y = rnd() * N;
    g.save();
    g.translate(x, y);
    g.rotate((rnd() - 0.5) * 0.6 + (i % 2 ? Math.PI / 2 : 0));
    g.fillStyle = tones[Math.floor(rnd() * tones.length)]!;
    g.globalAlpha = night ? 0.8 : 0.55 + rnd() * 0.35;
    g.fillRect(0, 0, 8 + rnd() * 26, 6 + rnd() * 18);
    g.restore();
  }
  g.globalAlpha = 1;
  // The coast: the sea along one side, for cities on the water.
  if (fl.edge === 'water') {
    g.fillStyle = night ? '#060b16' : '#3d8fb0';
    g.beginPath();
    g.moveTo(0, 0);
    for (let x = 0; x <= N; x += 16)
      g.lineTo(x, Z(-5200) + Math.sin(x * 0.012) * 30 + Math.sin(x * 0.041) * 9 - N * 0.0);
    g.lineTo(N, 0);
    g.lineTo(0, 0);
    g.closePath();
    // The sea lies on the far side of the runway from the city.
    g.fill();
    g.strokeStyle = night ? '#0b1322' : '#e9dcae';
    g.lineWidth = 3;
    g.stroke();
  }
  // Roads: a ring and spokes out of the city, a highway past the airport.
  const cx = X(CITY_AT.x);
  const cz = Z(CITY_AT.z);
  g.strokeStyle = night ? '#f59e0b' : '#8b8f94';
  g.globalAlpha = night ? 0.55 : 0.8;
  g.lineWidth = 2.2;
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2 + rnd() * 0.3;
    g.beginPath();
    g.moveTo(cx, cz);
    let x = cx;
    let y = cz;
    for (let s = 0; s < 14; s++) {
      x += Math.cos(a + (rnd() - 0.5) * 0.5) * 34;
      y += Math.sin(a + (rnd() - 0.5) * 0.5) * 34;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  g.beginPath();
  g.moveTo(0, Z(900));
  g.bezierCurveTo(N * 0.3, Z(1300), N * 0.6, Z(500), N, Z(1100));
  g.lineWidth = 3;
  g.stroke();
  g.globalAlpha = 1;
  // The city: blocks thick in the middle, thinning out, roofs in its colours.
  const R = CITY_AT.r * m;
  for (let i = 0; i < 5200; i++) {
    const a = rnd() * Math.PI * 2;
    const d = Math.pow(rnd(), 0.75) * R;
    const x = cx + Math.cos(a) * d;
    const y = cz + Math.sin(a) * d * 0.8;
    const s = 1.5 + rnd() * 3.2;
    if (night) {
      g.fillStyle = rnd() < 0.55 ? '#fbbf24' : rnd() < 0.5 ? '#fde68a' : '#fb923c';
      g.globalAlpha = 0.35 + rnd() * 0.6 * (1 - d / R);
      g.fillRect(x, y, s * 0.5, s * 0.5);
    } else {
      g.fillStyle =
        rnd() < 0.45
          ? fl.roofs[Math.floor(rnd() * fl.roofs.length)]!
          : fl.walls[Math.floor(rnd() * fl.walls.length)]!;
      g.globalAlpha = 0.85;
      g.fillRect(x, y, s, s * (0.7 + rnd() * 0.6));
    }
  }
  g.globalAlpha = 1;
  if (night) {
    // A glow over the centre.
    const gl = g.createRadialGradient(cx, cz, 0, cx, cz, R * 1.1);
    gl.addColorStop(0, 'rgba(251,146,60,0.35)');
    gl.addColorStop(1, 'rgba(251,146,60,0)');
    g.fillStyle = gl;
    g.fillRect(0, 0, N, N);
  }
  // The airport's own ground: grass around the runway, aprons.
  g.fillStyle = night ? '#0d141b' : fl.parkEdge;
  g.fillRect(X(-2200), Z(-260), 4400 * m, 520 * m);
  g.fillStyle = night ? '#1c232c' : '#a3a8ad';
  g.fillRect(X(-400), Z(160), 1300 * m, 220 * m);
  return canvasTexture(c);
}

/** The runway: asphalt, the centreline, thresholds, the numbers, touchdown marks. */
export function runwayTexture(): THREE.Texture {
  const [c, g] = canvas(64, 2048);
  g.fillStyle = '#3b4048';
  g.fillRect(0, 0, 64, 2048);
  g.fillStyle = 'rgba(0,0,0,0.25)';
  for (let y = 0; y < 2048; y += 9) g.fillRect(20 + ((y * 7) % 24), y, 3, 5);
  g.fillStyle = '#e8eaed';
  // Edge lines and the dashed centreline.
  g.fillRect(2, 0, 2, 2048);
  g.fillRect(60, 0, 2, 2048);
  for (let y = 120; y < 1930; y += 40) g.fillRect(31, y, 2, 22);
  // Threshold piano keys at both ends, touchdown zone bars.
  for (const y0 of [8, 2008]) for (let k = 0; k < 8; k++) g.fillRect(6 + k * 7, y0, 4, 32);
  for (const y0 of [150, 1870]) {
    g.fillRect(12, y0, 8, 26);
    g.fillRect(44, y0, 8, 26);
  }
  const t = canvasTexture(c);
  return t;
}

// ---------------------------------------------------------------------------
// The cabin

/** Airline carpet: a dark ground with a small repeating pattern. */
export function carpetTexture(base: string, dot: string): THREE.Texture {
  const [c, g] = canvas(128, 128);
  g.fillStyle = base;
  g.fillRect(0, 0, 128, 128);
  const rnd = seeded(fnv(`carpet:${base}`));
  // A felt-like grain, then the pattern.
  for (let i = 0; i < 1400; i++) {
    g.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.08)';
    g.fillRect(rnd() * 128, rnd() * 128, 1.5, 1.5);
  }
  g.fillStyle = dot;
  for (let y = 0; y < 128; y += 32)
    for (let x = 0; x < 128; x += 32) {
      g.fillRect(x + 8 + ((y / 32) % 2) * 16, y + 8, 6, 2);
      g.fillRect(x + 10 + ((y / 32) % 2) * 16, y + 6, 2, 6);
    }
  return canvasTexture(c, true, true);
}

/** A window pane: the sky outside, brighter low down, a thin horizon of cloud. */
export function paneTexture(zenith: string, horizon: string, night: boolean): THREE.Texture {
  const [c, g] = canvas(64, 96);
  const gr = g.createLinearGradient(0, 0, 0, 96);
  gr.addColorStop(0, zenith);
  gr.addColorStop(0.62, horizon);
  gr.addColorStop(0.7, night ? '#334155' : '#ffffff');
  gr.addColorStop(1, night ? '#1e293b' : '#e2ecf5');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 96);
  if (night) {
    g.fillStyle = '#fff';
    const rnd = seeded(7);
    for (let i = 0; i < 12; i++) g.fillRect(rnd() * 64, rnd() * 50, 1, 1);
  }
  return canvasTexture(c);
}

/** A soft round glow (light around the windows, the sun's halo). */
export function glowTexture(): THREE.Texture {
  const [c, g] = canvas(64, 64);
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  return canvasTexture(c);
}

/**
 * The front of the cabin: a bulkhead across the cabin with a lavatory door
 * (the vacant sign green), the galley's closed carts and an exit sign over it.
 */
export function bulkheadTexture(wall: string, trim: string, jet: boolean): THREE.Texture {
  const W = 512;
  const H = 384;
  const [c, g] = canvas(W, H);
  g.fillStyle = wall;
  g.fillRect(0, 0, W, H);
  const shadeRect = (x: number, y: number, w: number, h: number, fill: string) => {
    g.fillStyle = fill;
    g.fillRect(x, y, w, h);
    g.strokeStyle = 'rgba(0,0,0,0.18)';
    g.lineWidth = 2;
    g.strokeRect(x + 1, y + 1, w - 2, h - 2);
  };
  if (jet) {
    // Your own jet: a walnut door to the cockpit, a cream galley.
    const wood = g.createLinearGradient(196, 0, 316, 0);
    wood.addColorStop(0, '#6b3f1f');
    wood.addColorStop(0.5, '#8a5a32');
    wood.addColorStop(1, '#5c3519');
    g.fillStyle = wood;
    g.fillRect(196, 70, 120, 314);
    g.fillStyle = '#d4af37';
    g.fillRect(296, 220, 8, 30);
    shadeRect(40, 150, 130, 234, '#efe6d2');
    shadeRect(342, 150, 130, 234, '#efe6d2');
    g.fillStyle = '#d4af37';
    g.fillRect(40, 144, 130, 4);
    g.fillRect(342, 144, 130, 4);
  } else {
    // Left: the lavatory door. Right: the galley.
    shadeRect(40, 60, 170, 324, '#e5e2db');
    g.fillStyle = '#9ca3af';
    g.fillRect(186, 210, 10, 40);
    g.fillStyle = '#16a34a';
    g.fillRect(150, 90, 40, 14);
    shadeRect(300, 80, 190, 160, '#d9d6cf');
    for (let k = 0; k < 3; k++) shadeRect(300 + k * 63, 246, 62, 138, '#c9ccd2');
    g.fillStyle = trim;
    g.fillRect(300, 74, 190, 6);
  }
  // The exit sign.
  g.fillStyle = '#065f46';
  g.fillRect(W / 2 - 46, 20, 92, 30);
  g.fillStyle = '#4ade80';
  g.font = 'bold 22px sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('EXIT', W / 2, 36);
  return canvasTexture(c);
}

/** The galley trolley's side: drawers and latches. */
export function trolleyTexture(): THREE.Texture {
  const [c, g] = canvas(128, 160);
  g.fillStyle = '#c7ccd3';
  g.fillRect(0, 0, 128, 160);
  for (let k = 0; k < 4; k++) {
    g.fillStyle = '#d9dde2';
    g.fillRect(6, 6 + k * 38, 116, 32);
    g.fillStyle = '#7b8490';
    g.fillRect(52, 18 + k * 38, 24, 5);
  }
  g.fillStyle = '#b91c1c';
  g.fillRect(6, 150, 116, 6);
  return canvasTexture(c);
}

/** A seat-back screen: the moving map, in the airline's blue. */
export function screenTexture(): THREE.Texture {
  const [c, g] = canvas(64, 40);
  const gr = g.createLinearGradient(0, 0, 64, 40);
  gr.addColorStop(0, '#0c4a6e');
  gr.addColorStop(1, '#1e3a8a');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 40);
  g.strokeStyle = '#7dd3fc';
  g.setLineDash([3, 3]);
  g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(8, 30);
  g.quadraticCurveTo(32, 4, 56, 26);
  g.stroke();
  g.fillStyle = '#fff';
  g.beginPath();
  g.arc(30, 14, 2.4, 0, Math.PI * 2);
  g.fill();
  return canvasTexture(c);
}

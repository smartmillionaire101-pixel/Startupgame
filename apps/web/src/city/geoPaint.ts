/**
 * Wave 8 §A: the real map's base layers, painted on a <canvas> under the
 * city's SVG (land, water, parks, the airport, rail, roads by class, bridges
 * over the water, building outlines raised to their height, neighbourhood
 * and street names). Everything is prepared once per layout in screen px at
 * zoom 1; each frame paints only what is in view, with detail by zoom.
 */
import type { Flavour } from './flavour';
import { GEO_KX, GEO_KY, type GeoWorld } from './geoLayout';
import { ROAD_CLASSES } from './geo';
import { hash } from './contract';
import { mix, shade } from './art';

export interface Cam {
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
}

type Box = [number, number, number, number];
interface Feat {
  p: Float32Array;
  b: Box;
}
interface Road extends Feat {
  n?: string;
}
interface Bldg extends Feat {
  /** Height in px at zoom 1. */
  h: number;
  wall: string;
  roof: string;
  /** South-most y, for painting back to front. */
  base: number;
  tall: boolean;
}

/** Road widths in metres (drawn a little wider than life, so streets read). */
const ROAD_W = [24, 20, 17, 14, 12, 9];
/** …and never thinner than this on screen (px). */
const ROAD_MIN = [2.4, 2.2, 1.8, 1.3, 0.9, 0.7];
/** Shown once a metre is at least this many px on screen. */
const ROAD_FROM = [0, 0, 0, 0.018, 0.045, 0.07];
const WATER = '#7cc4e4';
const WATER_DEEP = '#68b6db';

function prep(pts: number[], close = false): Feat {
  const n = pts.length / 2;
  const p = new Float32Array(close ? n * 2 : pts.length);
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let i = 0; i < n; i++) {
    const x = pts[2 * i]! * GEO_KX;
    const y = pts[2 * i + 1]! * GEO_KY;
    p[2 * i] = x;
    p[2 * i + 1] = y;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  return { p, b: [x0, y0, x1, y1] };
}

const hits = (b: Box, v: Box) => b[2] >= v[0] && b[0] <= v[2] && b[3] >= v[1] && b[1] <= v[3];

function trace(ctx: CanvasRenderingContext2D, fs: Feat[], v: Box, close: boolean, minSize = 0) {
  ctx.beginPath();
  for (const f of fs) {
    if (!hits(f.b, v)) continue;
    if (minSize && f.b[2] - f.b[0] < minSize && f.b[3] - f.b[1] < minSize) continue;
    const p = f.p;
    ctx.moveTo(p[0]!, p[1]!);
    for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i]!, p[i + 1]!);
    if (close) ctx.closePath();
  }
}

export class GeoPainter {
  private land: Feat[];
  private water: Feat[];
  private rivers: Feat[];
  private parks: Feat[];
  private green: Feat[];
  private beach: Feat[];
  private airport: Feat[];
  private runways: Feat[];
  private rail: Feat[];
  private roads: Road[][];
  private bridges: Road[][];
  private buildings: Bldg[];
  private maxH = 0;
  private labels: { x: number; y: number; text: string; big: boolean }[];
  private landC: string;
  private parkC: string;
  private greenC: string;
  private asphalt: string;
  private minor: string;
  private kerb: string;
  private last = '';

  constructor(world: GeoWorld, f: Flavour, areas: { x: number; y: number }[]) {
    const d = world.data;
    this.land = (d.land ?? []).map((p) => prep(p, true));
    this.water = (d.water ?? []).map((p) => prep(p, true));
    this.rivers = (d.rivers ?? []).map((p) => prep(p));
    this.parks = (d.parks ?? []).map((p) => prep(p, true));
    this.green = (d.green ?? []).map((p) => prep(p, true));
    this.beach = (d.beach ?? []).map((p) => prep(p, true));
    this.airport = (d.airport ?? []).map((p) => prep(p, true));
    this.runways = (d.runways ?? []).map((p) => prep(p));
    this.rail = (d.rail ?? []).map((p) => prep(p));
    this.roads = ROAD_CLASSES.map((c) =>
      (d.roads?.[c] ?? []).map((r) => ({ ...prep(r.l), ...(r.n ? { n: r.n } : {}) })),
    );
    this.bridges = ROAD_CLASSES.map(() => [] as Road[]);
    for (const br of d.bridges ?? []) {
      const ci = Math.max(0, ROAD_CLASSES.indexOf(br.c));
      this.bridges[ci]!.push({ ...prep(br.l), ...(br.n ? { n: br.n } : {}) });
    }
    this.landC = mix(f.land, '#ffffff', 0.4);
    this.parkC = f.park;
    this.greenC = shade(f.park, 0.18);
    this.asphalt = f.asphalt;
    this.minor = shade(f.asphalt, 0.32);
    this.kerb = f.sidewalk;

    // Buildings: the game's own buildings and landmarks stand where OSM had some.
    const clear = world.clear;
    const walls = f.walls;
    this.buildings = [];
    for (let i = 0; i < (d.buildings ?? []).length; i++) {
      const b = d.buildings[i]!;
      if (b.p.length < 6) continue;
      let cx = 0;
      let cy = 0;
      const n = b.p.length / 2;
      for (let k = 0; k < n; k++) {
        cx += b.p[2 * k]!;
        cy += b.p[2 * k + 1]!;
      }
      cx /= n;
      cy /= n;
      if (clear.some((c) => Math.hypot(c.e - cx, c.s - cy) < c.r + 6)) continue;
      const ft = prep(b.p, true);
      const levels = b.h ?? 2;
      const tall = levels >= 12;
      const h = levels * 3.2 * GEO_KX * 0.8;
      const hsh = hash(`${i}`);
      const wall = tall ? (hsh % 3 ? '#a9bfd0' : '#c7d2db') : walls[hsh % walls.length]!;
      this.maxH = Math.max(this.maxH, h);
      this.buildings.push({
        ...ft,
        h,
        wall,
        roof: tall ? shade(wall, 0.25) : shade(wall, 0.12),
        base: ft.b[3],
        tall,
      });
    }
    this.buildings.sort((a, b) => a.base - b.base);

    // Neighbourhood names, away from the game's own district names.
    this.labels = [];
    const named = new Set<string>();
    for (const p of d.places ?? []) {
      if (named.has(p.n)) continue;
      named.add(p.n);
      const x = p.x * GEO_KX;
      const y = p.y * GEO_KY;
      if (areas.some((a) => Math.hypot(a.x - x, (a.y - y) * 2) < 500)) continue;
      if (/[A-Z]{4}/.test(p.n) && p.n === p.n.toUpperCase() && p.k === 'neighbourhood') continue;
      this.labels.push({ x, y, text: p.n, big: p.k === 'suburb' || p.k === 'island' });
    }
  }

  /** Paint the view. Skips the work when nothing moved. */
  draw(canvas: HTMLCanvasElement, cam: Cam, force = false) {
    const dpr = Math.min(2, typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1);
    const W = Math.max(1, Math.round(cam.w * dpr));
    const H = Math.max(1, Math.round(cam.h * dpr));
    const key = `${cam.x.toFixed(2)},${cam.y.toFixed(2)},${cam.z.toFixed(5)},${W},${H}`;
    if (!force && key === this.last) return;
    this.last = key;
    if (canvas.width !== W || canvas.height !== H) {
      canvas.width = W;
      canvas.height = H;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const z = cam.z;
    const ppm = z * GEO_KX; // screen px per metre
    const hw = cam.w / 2 / z;
    const hh = cam.h / 2 / z;
    const v: Box = [cam.x - hw, cam.y - hh, cam.x + hw, cam.y + hh];
    const k = 1 / z; // one screen px in world px

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = this.land.length ? WATER_DEEP : this.landC;
    ctx.fillRect(0, 0, W, H);
    ctx.setTransform(
      dpr * z,
      0,
      0,
      dpr * z,
      dpr * (cam.w / 2 - cam.x * z),
      dpr * (cam.h / 2 - cam.y * z),
    );
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    // ---- Ground.
    if (this.land.length) {
      ctx.fillStyle = this.landC;
      trace(ctx, this.land, v, true);
      ctx.fill();
    }
    ctx.fillStyle = this.greenC;
    trace(ctx, this.green, v, true, 3 * k);
    ctx.fill();
    ctx.fillStyle = this.parkC;
    trace(ctx, this.parks, v, true, 3 * k);
    ctx.fill();
    ctx.fillStyle = '#f3e3bd';
    trace(ctx, this.beach, v, true);
    ctx.fill();
    ctx.fillStyle = '#e2e5ea';
    trace(ctx, this.airport, v, true);
    ctx.fill();
    ctx.strokeStyle = '#9aa3b2';
    ctx.lineWidth = Math.max(45 * GEO_KX, 2 * k);
    ctx.lineCap = 'butt';
    trace(ctx, this.runways, v, false);
    ctx.stroke();
    ctx.lineCap = 'round';

    // ---- Water.
    ctx.fillStyle = WATER;
    trace(ctx, this.water, v, true, 2 * k);
    ctx.fill();
    ctx.strokeStyle = WATER;
    ctx.lineWidth = Math.max(14 * GEO_KX, 1.5 * k);
    trace(ctx, this.rivers, v, false);
    ctx.stroke();
    if (ppm > 0.25) {
      // A soft shoreline.
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 1.2 * k;
      trace(ctx, this.water, v, true, 6 * k);
      ctx.stroke();
    }

    // ---- Rail.
    if (ppm > 0.03) {
      ctx.strokeStyle = 'rgba(120,113,108,0.55)';
      ctx.lineWidth = Math.max(2.5 * GEO_KX, 0.8 * k);
      ctx.setLineDash(ppm > 0.4 ? [6 * k, 5 * k] : []);
      trace(ctx, this.rail, v, false);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // ---- Roads: kerbs, then asphalt, minor roads first.
    const width = (c: number) => Math.max(ROAD_W[c]! * GEO_KX, ROAD_MIN[c]! * k);
    const order = [5, 4, 3, 2, 1, 0].filter((c) => ppm >= ROAD_FROM[c]!);
    if (ppm > 0.2) {
      ctx.strokeStyle = this.kerb;
      for (const c of order) {
        ctx.lineWidth = width(c) + 3.5 * GEO_KX + 0.8 * k;
        trace(ctx, this.roads[c]!, v, false);
        ctx.stroke();
      }
    }
    for (const c of order) {
      ctx.strokeStyle = c <= 2 ? this.asphalt : this.minor;
      ctx.lineWidth = width(c);
      trace(ctx, this.roads[c]!, v, false);
      ctx.stroke();
    }
    if (ppm > 0.6) {
      // Centre lines on the big roads.
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = 0.9 * k;
      ctx.setLineDash([8 * k, 8 * k]);
      for (const c of [0, 1, 2]) {
        trace(ctx, this.roads[c]!, v, false);
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }

    // ---- Bridges: decks with white parapets, over everything on the ground.
    for (const c of [5, 4, 3, 2, 1, 0]) {
      if (!this.bridges[c]!.length) continue;
      const w = Math.max(ROAD_W[c]! * GEO_KX, (ROAD_MIN[c]! + 0.6) * k);
      ctx.strokeStyle = 'rgba(15,23,42,0.28)';
      ctx.lineWidth = w + 6 * GEO_KX + 2.5 * k;
      ctx.save();
      ctx.translate(0, 4 * GEO_KY + 1.5 * k);
      trace(ctx, this.bridges[c]!, v, false);
      ctx.stroke();
      ctx.restore();
      ctx.strokeStyle = '#f8fafc';
      ctx.lineWidth = w + 4 * GEO_KX + 1.6 * k;
      trace(ctx, this.bridges[c]!, v, false);
      ctx.stroke();
      ctx.strokeStyle = c <= 2 ? this.asphalt : this.minor;
      ctx.lineWidth = w;
      ctx.stroke();
    }

    // ---- Buildings: outlines in the centre, raised to their height.
    if (ppm > 0.12) {
      const raise = ppm > 0.3;
      const vb: Box = [v[0], v[1], v[2], v[3] + this.maxH];
      for (const b of this.buildings) {
        if (!hits(b.b, vb)) continue;
        if (!raise && !b.tall && b.b[2] - b.b[0] < 2 * k) continue;
        this.building(ctx, b, raise ? b.h : 0, k);
      }
    }

    // ---- Names (screen space).
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.names(ctx, cam, ppm);
  }

  private building(ctx: CanvasRenderingContext2D, b: Bldg, h: number, k: number) {
    const p = b.p;
    const n = p.length / 2;
    if (h > 0.5) {
      let cx = 0;
      let cy = 0;
      for (let i = 0; i < n; i++) {
        cx += p[2 * i]!;
        cy += p[2 * i + 1]!;
      }
      cx /= n;
      cy /= n;
      for (let i = 0; i < n; i++) {
        const ax = p[2 * i]!;
        const ay = p[2 * i + 1]!;
        const j = (i + 1) % n;
        const bx = p[2 * j]!;
        const by = p[2 * j + 1]!;
        let nx = by - ay;
        let ny = -(bx - ax);
        if (nx * ((ax + bx) / 2 - cx) + ny * ((ay + by) / 2 - cy) < 0) {
          nx = -nx;
          ny = -ny;
        }
        if (ny <= 0) continue;
        const lit = nx / (Math.hypot(nx, ny) || 1);
        ctx.fillStyle = shade(b.wall, -0.12 - 0.16 * (lit + 1) * 0.5);
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
        ctx.lineTo(bx, by - h);
        ctx.lineTo(ax, ay - h);
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.beginPath();
    ctx.moveTo(p[0]!, p[1]! - h);
    for (let i = 1; i < n; i++) ctx.lineTo(p[2 * i]!, p[2 * i + 1]! - h);
    ctx.closePath();
    ctx.fillStyle = b.roof;
    ctx.fill();
    if (h > 0.5) {
      ctx.strokeStyle = shade(b.wall, -0.3);
      ctx.lineWidth = 0.6 * k;
      ctx.stroke();
    }
  }

  private names(ctx: CanvasRenderingContext2D, cam: Cam, ppm: number) {
    const z = cam.z;
    const sx = (x: number) => (x - cam.x) * z + cam.w / 2;
    const sy = (y: number) => (y - cam.y) * z + cam.h / 2;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    const boxes: Box[] = [];
    const free = (b: Box) => {
      for (const o of boxes) if (hits(o, b)) return false;
      boxes.push(b);
      return true;
    };
    // Neighbourhoods: zoomed out to the middle distance.
    if (ppm > 0.012 && ppm < 1.4) {
      for (const l of this.labels) {
        if (!l.big && ppm < 0.3) continue;
        const x = sx(l.x);
        const y = sy(l.y);
        if (x < -80 || x > cam.w + 80 || y < -20 || y > cam.h + 20) continue;
        const size = l.big ? 11 : 10;
        ctx.font = `600 ${size}px system-ui, sans-serif`;
        const w = ctx.measureText(l.text).width;
        if (!free([x - w / 2 - 4, y - 8, x + w / 2 + 4, y + 8])) continue;
        ctx.strokeStyle = 'rgba(255,255,255,0.85)';
        ctx.lineWidth = 3;
        ctx.strokeText(l.text, x, y);
        ctx.fillStyle = 'rgba(68,64,60,0.85)';
        ctx.fillText(l.text, x, y);
      }
    }
    // Street names along the roads, zoomed in.
    if (ppm > 0.7) {
      ctx.font = `600 10px system-ui, sans-serif`;
      const seen = new Set<string>();
      const all = [
        ...this.roads.flatMap((rs) => rs),
        ...this.bridges.flatMap((rs) => rs.filter((r) => /bridge/i.test(r.n ?? ''))),
      ];
      let shown = 0;
      for (const r of all) {
        if (!r.n || seen.has(r.n) || shown > 24) continue;
        const p = r.p;
        let best = -1;
        let bestL = 0;
        for (let i = 0; i + 3 < p.length; i += 2) {
          const ax = sx(p[i]!);
          const ay = sy(p[i + 1]!);
          const bx = sx(p[i + 2]!);
          const by = sy(p[i + 3]!);
          const mx = (ax + bx) / 2;
          const my = (ay + by) / 2;
          if (mx < 0 || mx > cam.w || my < 0 || my > cam.h) continue;
          const L = Math.hypot(bx - ax, by - ay);
          if (L > bestL) {
            bestL = L;
            best = i;
          }
        }
        if (best < 0) continue;
        const w = ctx.measureText(r.n).width;
        if (bestL < w + 16) continue;
        let ax = sx(p[best]!);
        let ay = sy(p[best + 1]!);
        let bx = sx(p[best + 2]!);
        let by = sy(p[best + 3]!);
        if (bx < ax) [ax, ay, bx, by] = [bx, by, ax, ay];
        const mx = (ax + bx) / 2;
        const my = (ay + by) / 2;
        if (!free([mx - w / 2, my - 7, mx + w / 2, my + 7])) continue;
        seen.add(r.n);
        shown++;
        ctx.save();
        ctx.translate(mx, my);
        ctx.rotate(Math.atan2(by - ay, bx - ax));
        ctx.strokeStyle = 'rgba(30,30,30,0.55)';
        ctx.lineWidth = 2.5;
        ctx.strokeText(r.n, 0, 0);
        ctx.fillStyle = '#fff';
        ctx.fillText(r.n, 0, 0);
        ctx.restore();
      }
    }
  }
}

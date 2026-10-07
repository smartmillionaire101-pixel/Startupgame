/**
 * Wave 9 §B: the city's ground as a raster, for fast questions while the 3D
 * city is built ("is this land?", "a park?", "on a road?", "is there already
 * a building?"). Polygons are painted onto small canvases once, then read
 * back as one byte per cell. Coordinates are the map file's metres (x east,
 * y south).
 */
import type { GeoData, RoadClass } from '../geo';
import { ROAD_CLASSES } from '../geo';

export const COVER = {
  water: 0,
  land: 1,
  park: 2,
  beach: 3,
  airport: 4,
} as const;

/** Road half-widths by class (metres), with pavements. */
export const ROAD_HALF = [12, 10, 8.5, 7.5, 6.5, 5];

export class GroundMask {
  readonly x0: number;
  readonly y0: number;
  readonly res: number;
  readonly w: number;
  readonly h: number;
  /** COVER per cell. */
  readonly cover: Uint8Array;
  /** 1 where a road (with its pavement) is. */
  readonly road: Uint8Array;
  /** Road density 0–255 (coarse, blurred): how urban a place is. */
  readonly urban: Uint8Array;
  /** 1 where a building already stands. */
  readonly built: Uint8Array;

  constructor(data: GeoData, maxCells = 2048) {
    const [bx0, by0, bx1, by1] = data.bounds;
    const span = Math.max(bx1 - bx0, by1 - by0);
    this.res = Math.max(6, Math.ceil(span / maxCells));
    this.x0 = bx0;
    this.y0 = by0;
    this.w = Math.ceil((bx1 - bx0) / this.res);
    this.h = Math.ceil((by1 - by0) / this.res);
    const n = this.w * this.h;
    this.cover = new Uint8Array(n);
    this.road = new Uint8Array(n);
    this.urban = new Uint8Array(n);
    this.built = new Uint8Array(n);
    const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
    const ctx = canvas?.getContext('2d', { willReadFrequently: true }) ?? null;
    if (!canvas || !ctx) {
      // No canvas (tests): all land, no roads.
      this.cover.fill(COVER.land);
      return;
    }
    canvas.width = this.w;
    canvas.height = this.h;
    const k = 1 / this.res;
    ctx.setTransform(k, 0, 0, k, -bx0 * k, -by0 * k);
    const fillPolys = (polys: number[][] | undefined, colour: string) => {
      if (!polys?.length) return;
      ctx.fillStyle = colour;
      ctx.beginPath();
      for (const p of polys) {
        if (p.length < 6) continue;
        ctx.moveTo(p[0]!, p[1]!);
        for (let i = 2; i + 1 < p.length; i += 2) ctx.lineTo(p[i]!, p[i + 1]!);
        ctx.closePath();
      }
      ctx.fill();
    };
    const strokeLines = (lines: number[][], width: number, colour: string) => {
      ctx.strokeStyle = colour;
      ctx.lineWidth = width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      for (const l of lines) {
        if (l.length < 4) continue;
        ctx.moveTo(l[0]!, l[1]!);
        for (let i = 2; i + 1 < l.length; i += 2) ctx.lineTo(l[i]!, l[i + 1]!);
      }
      ctx.stroke();
    };
    const read = (out: Uint8Array, map: (r: number, g: number, b: number) => number) => {
      const img = ctx.getImageData(0, 0, this.w, this.h).data;
      for (let i = 0; i < n; i++) out[i] = map(img[4 * i]!, img[4 * i + 1]!, img[4 * i + 2]!);
    };

    // ---- Cover: water, land, then parks, beaches and airports, then water again.
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = data.land?.length ? '#000000' : '#ff0000';
    ctx.fillRect(0, 0, this.w, this.h);
    ctx.restore();
    fillPolys(data.land, '#ff0000');
    fillPolys(data.airport, '#ffff00');
    fillPolys(data.green, '#00ff00');
    fillPolys(data.parks, '#00ff00');
    fillPolys(data.beach, '#0000ff');
    fillPolys(data.water, '#000000');
    strokeLines(data.rivers ?? [], 14, '#000000');
    read(this.cover, (r, g, b) =>
      r > 127 && g > 127
        ? COVER.airport
        : r > 127
          ? COVER.land
          : g > 127
            ? COVER.park
            : b > 127
              ? COVER.beach
              : COVER.water,
    );

    // ---- Roads (and rail), as wide as they are, with their pavements.
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, this.w, this.h);
    ctx.restore();
    ROAD_CLASSES.forEach((c: RoadClass, ci) =>
      strokeLines(
        (data.roads?.[c] ?? []).map((r) => r.l),
        ROAD_HALF[ci]! * 2 + 3,
        '#ffffff',
      ),
    );
    strokeLines(
      (data.bridges ?? []).map((b) => b.l),
      14,
      '#ffffff',
    );
    strokeLines(data.rail ?? [], 10, '#ffffff');
    strokeLines(data.runways ?? [], 70, '#ffffff');
    read(this.road, (r) => (r > 100 ? 1 : 0));

    // ---- Buildings already in the file.
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, this.w, this.h);
    ctx.restore();
    fillPolys(
      (data.buildings ?? []).map((b) => b.p),
      '#ffffff',
    );
    read(this.built, (r) => (r > 60 ? 1 : 0));

    // ---- How urban: road length nearby, painted thin and blurred.
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, this.w, this.h);
    ctx.restore();
    ctx.globalAlpha = 1;
    ROAD_CLASSES.forEach((c: RoadClass, ci) =>
      strokeLines(
        (data.roads?.[c] ?? []).map((r) => r.l),
        ci <= 1 ? 6 : 10,
        '#ffffff',
      ),
    );
    const small = document.createElement('canvas');
    const sw = Math.max(1, Math.round(this.w / 8));
    const sh = Math.max(1, Math.round(this.h / 8));
    small.width = sw;
    small.height = sh;
    const sctx = small.getContext('2d', { willReadFrequently: true });
    if (sctx) {
      sctx.filter = 'blur(5px)';
      sctx.drawImage(canvas, 0, 0, sw, sh);
      const img = sctx.getImageData(0, 0, sw, sh).data;
      for (let j = 0; j < this.h; j++) {
        const sj = Math.min(sh - 1, Math.floor((j * sh) / this.h));
        for (let i = 0; i < this.w; i++) {
          const si = Math.min(sw - 1, Math.floor((i * sw) / this.w));
          this.urban[j * this.w + i] = Math.min(255, img[4 * (sj * sw + si)]! * 3);
        }
      }
    }
    canvas.width = canvas.height = 1;
  }

  private idx(x: number, y: number) {
    const i = Math.floor((x - this.x0) / this.res);
    const j = Math.floor((y - this.y0) / this.res);
    if (i < 0 || j < 0 || i >= this.w || j >= this.h) return -1;
    return j * this.w + i;
  }

  /** Mark a disc as taken (the game's places and the landmarks stand there). */
  markBuilt(x: number, y: number, r: number) {
    const i0 = Math.max(0, Math.floor((x - r - this.x0) / this.res));
    const i1 = Math.min(this.w - 1, Math.floor((x + r - this.x0) / this.res));
    const j0 = Math.max(0, Math.floor((y - r - this.y0) / this.res));
    const j1 = Math.min(this.h - 1, Math.floor((y + r - this.y0) / this.res));
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        const cx = this.x0 + (i + 0.5) * this.res;
        const cy = this.y0 + (j + 0.5) * this.res;
        if (Math.hypot(cx - x, cy - y) <= r + this.res * 0.5) this.built[j * this.w + i] = 1;
      }
  }

  coverAt(x: number, y: number): number {
    const i = this.idx(x, y);
    return i < 0 ? COVER.water : this.cover[i]!;
  }
  roadAt(x: number, y: number) {
    const i = this.idx(x, y);
    return i >= 0 && this.road[i] === 1;
  }
  builtAt(x: number, y: number) {
    const i = this.idx(x, y);
    return i >= 0 && this.built[i] === 1;
  }
  /** 0–1. */
  urbanAt(x: number, y: number) {
    const i = this.idx(x, y);
    return i < 0 ? 0 : this.urban[i]! / 255;
  }
  isLand(x: number, y: number) {
    const c = this.coverAt(x, y);
    return c === COVER.land;
  }
}

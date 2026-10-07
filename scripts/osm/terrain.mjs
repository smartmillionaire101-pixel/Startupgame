/**
 * Terrain for the 3D city (Wave 9 §A): an elevation grid over a city's `wide`
 * box from the AWS Terrarium tiles (Mapzen terrain, open data; elevation =
 * R·256 + G + B/256 − 32768 metres), with the sea and water at 0 m.
 * The network part (fetchTerrarium) only runs in GitHub Actions; the rest is
 * pure and unit-tested.
 */
import { PNG } from 'pngjs';
import { sleep } from './overpass.mjs';

export const TERRARIUM = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium';

/** Metres of one Terrarium RGB pixel. */
export const terrariumElevation = (r, g, b) => r * 256 + g + b / 256 - 32768;

/** A Terrarium PNG (Buffer/Uint8Array) → { width, height, elev: Float32Array }. */
export function decodeTerrarium(png) {
  const img = PNG.sync.read(Buffer.from(png));
  const elev = new Float32Array(img.width * img.height);
  for (let i = 0; i < elev.length; i++)
    elev[i] = terrariumElevation(img.data[4 * i], img.data[4 * i + 1], img.data[4 * i + 2]);
  return { width: img.width, height: img.height, elev };
}

/** Web Mercator: [lon, lat] → global pixel [px, py] at zoom z (256 px tiles). */
export function lonLatToPixel(lon, lat, z) {
  const n = 256 * 2 ** z;
  const s = Math.sin((lat * Math.PI) / 180);
  return [((lon + 180) / 360) * n, (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n];
}

/** The grid size and the zoom to sample for a box `w`×`h` metres at latitude `lat`. */
export function terrainPlan(w, h, lat, { spacing = 30, min = 129, max = 513, maxTiles = 100 } = {}) {
  const cols = Math.max(min, Math.min(max, Math.ceil(w / spacing) + 1));
  const rows = Math.max(min, Math.min(max, Math.ceil(h / spacing) + 1));
  const step = Math.min(w / (cols - 1), h / (rows - 1));
  const cos = Math.cos((lat * Math.PI) / 180);
  // Finest zoom whose pixels are no larger than the grid step, at most z14.
  let z = Math.min(14, Math.max(8, Math.ceil(Math.log2((156543.03 * cos) / step))));
  const tilesAt = (zz) => {
    const tile = (156543.03 * cos * 256) / 2 ** zz;
    return (Math.ceil(w / tile) + 1) * (Math.ceil(h / tile) + 1);
  };
  while (z > 8 && tilesAt(z) > maxTiles) z--;
  return { cols, rows, zoom: z };
}

/**
 * Sample a grid of elevations: `getTile(z, x, y)` returns a decoded tile
 * ({ width, height, elev }) or null (treated as 0 m). `inv(x, y)` maps local
 * metres to [lon, lat]. Bilinear between pixel centres. Returns Float32Array.
 */
export function sampleGrid({ cols, rows, bounds, zoom, inv, getTile }) {
  const [x0, y0, x1, y1] = bounds;
  const out = new Float32Array(cols * rows);
  const px = (gx, gy) => {
    const tx = Math.floor(gx / 256);
    const ty = Math.floor(gy / 256);
    const t = getTile(zoom, tx, ty);
    if (!t) return 0;
    const ix = Math.min(t.width - 1, Math.max(0, Math.floor(gx - tx * 256)));
    const iy = Math.min(t.height - 1, Math.max(0, Math.floor(gy - ty * 256)));
    return t.elev[iy * t.width + ix];
  };
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++) {
      const x = x0 + ((x1 - x0) * i) / (cols - 1);
      const y = y0 + ((y1 - y0) * j) / (rows - 1);
      const [lon, lat] = inv(x, y);
      const [gx, gy] = lonLatToPixel(lon, lat, zoom);
      // Pixel centres sit at +0.5.
      const fx = gx - 0.5;
      const fy = gy - 0.5;
      const ix = Math.floor(fx);
      const iy = Math.floor(fy);
      const ax = fx - ix;
      const ay = fy - iy;
      const top = px(ix, iy) * (1 - ax) + px(ix + 1, iy) * ax;
      const bot = px(ix, iy + 1) * (1 - ax) + px(ix + 1, iy + 1) * ax;
      out[j * cols + i] = top * (1 - ay) + bot * ay;
    }
  return out;
}

/**
 * Rasterise polygons (flat [x, y, x, y, …] arrays in local metres) onto the
 * grid's sample points: 1 where a sample is inside any polygon (even–odd per
 * polygon). Scanline, so it stays fast for big grids and many polygons.
 */
export function rasterize(polys, cols, rows, bounds) {
  const [x0, y0, x1, y1] = bounds;
  const dx = (x1 - x0) / (cols - 1);
  const dy = (y1 - y0) / (rows - 1);
  const mask = new Uint8Array(cols * rows);
  for (const p of polys) {
    const n = p.length / 2;
    if (n < 3) continue;
    let pyMin = Infinity;
    let pyMax = -Infinity;
    for (let k = 1; k < p.length; k += 2) {
      pyMin = Math.min(pyMin, p[k]);
      pyMax = Math.max(pyMax, p[k]);
    }
    const jStart = Math.max(0, Math.ceil((pyMin - y0) / dy));
    const jEnd = Math.min(rows - 1, Math.floor((pyMax - y0) / dy));
    const xs = [];
    for (let j = jStart; j <= jEnd; j++) {
      const y = y0 + j * dy;
      xs.length = 0;
      for (let a = 0, b = n - 1; a < n; b = a++) {
        const ya = p[2 * a + 1];
        const yb = p[2 * b + 1];
        if (ya > y !== yb > y) {
          const xa = p[2 * a];
          const xb = p[2 * b];
          xs.push(xa + ((y - ya) * (xb - xa)) / (yb - ya));
        }
      }
      xs.sort((u, v) => u - v);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const iStart = Math.max(0, Math.ceil((xs[k] - x0) / dx));
        const iEnd = Math.min(cols - 1, Math.floor((xs[k + 1] - x0) / dx));
        for (let i = iStart; i <= iEnd; i++) mask[j * cols + i] ^= 1;
      }
    }
  }
  return mask;
}

/** OR of masks made one polygon at a time (so overlapping polygons don't cancel). */
export function unionMask(polys, cols, rows, bounds) {
  const out = new Uint8Array(cols * rows);
  for (const p of polys) {
    const m = rasterize([p], cols, rows, bounds);
    for (let i = 0; i < out.length; i++) out[i] |= m[i];
  }
  return out;
}

/**
 * Sea and water at 0 m: a sample is land when it is inside a land polygon
 * (all samples are land when `land` is empty) and not inside a water polygon.
 * Land never goes below 0 m either.
 */
export function clampWater(elev, cols, rows, bounds, land, water) {
  const landMask = land.length ? unionMask(land, cols, rows, bounds) : null;
  const waterMask = water.length ? unionMask(water, cols, rows, bounds) : null;
  const out = Float32Array.from(elev);
  for (let i = 0; i < out.length; i++) {
    const isLand = (!landMask || landMask[i]) && !(waterMask && waterMask[i]);
    out[i] = isLand ? Math.max(0, out[i]) : 0;
  }
  return out;
}

/** Download the Terrarium tiles a grid needs (cached in a Map by "z/x/y"). */
export async function fetchTerrarium({ bounds, zoom, inv }) {
  const [x0, y0, x1, y1] = bounds;
  const [lonW, latN] = inv(x0, y0);
  const [lonE, latS] = inv(x1, y1);
  const [pxW, pyN] = lonLatToPixel(lonW, latN, zoom);
  const [pxE, pyS] = lonLatToPixel(lonE, latS, zoom);
  const tiles = new Map();
  for (let tx = Math.floor(pxW / 256) - 1; tx <= Math.floor(pxE / 256) + 1; tx++)
    for (let ty = Math.floor(pyN / 256) - 1; ty <= Math.floor(pyS / 256) + 1; ty++) {
      const url = `${TERRARIUM}/${zoom}/${tx}/${ty}.png`;
      let tile = null;
      for (let attempt = 0; attempt < 4 && !tile; attempt++) {
        try {
          const res = await fetch(url);
          if (res.ok) tile = decodeTerrarium(new Uint8Array(await res.arrayBuffer()));
          else if (res.status === 404 || res.status === 403) break;
          else throw new Error(`${res.status}`);
        } catch (e) {
          console.warn(`terrarium retry ${url}: ${e?.message}`);
          await sleep(2000 * (attempt + 1));
        }
      }
      tiles.set(`${zoom}/${tx}/${ty}`, tile);
    }
  return tiles;
}

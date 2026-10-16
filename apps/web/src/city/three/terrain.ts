/**
 * Wave 12: the city's real terrain (public/geo/<city>/terrain.bin, from the
 * Mapzen Terrarium tiles) for the sky views. Up a tower or a hill you see the
 * shape of the land: San Francisco's hills, Freetown's mountains, Kigali's
 * thousand hills, Cairo's Mokattam.
 *
 * Heights are relative to the city's low ground (sea level by the coast,
 * the valley floor inland). Everything drawn is lifted on the GPU: each
 * material gets a vertex patch that adds the terrain under the vertex (in
 * world space, after the instance and model matrices), so the buildings,
 * trees, roads and landmarks stand on their hills. The flat ground layers
 * are cut finer first (tessellate) so they follow the land, and a terrain
 * mesh stands in for the land polygon. Only the sky view uses this; the
 * city map stays flat.
 */
import * as THREE from 'three';
import { decodeTerrain, type Terrain } from '../geo3d/tiles';
import { COVER, type GroundMask } from './mask';

export interface TerrainField {
  cols: number;
  rows: number;
  /** [minX, minY, maxX, maxY] (metres, y south): the grid's corner samples. */
  bounds: [number, number, number, number];
  /** Metres above the city's low ground, row-major from (minX, minY). */
  rel: Float32Array;
  /** The low ground, metres above sea level. */
  base: number;
  max: number;
}

const fields = new Map<string, Promise<TerrainField | null>>();

/** Load and prepare a city's terrain (null when it has none); once per city. */
export function loadTerrainField(city: string): Promise<TerrainField | null> {
  let f = fields.get(city);
  if (!f) {
    f = fetchTerrainField(city);
    fields.set(city, f);
    // A failed load is tried again next time.
    void f.then((x) => {
      if (!x) fields.delete(city);
    });
  }
  return f;
}

async function fetchTerrainField(city: string): Promise<TerrainField | null> {
  try {
    const res = await fetch(`/geo/${encodeURIComponent(city)}/terrain.bin`);
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') ?? '';
    if (ct.includes('html')) return null;
    return terrainField(decodeTerrain(await res.arrayBuffer()));
  } catch {
    return null;
  }
}

/**
 * Relative heights. Water and sea are 0 in the file: by the coast that is sea
 * level; inland (a lake 1,600 m up) those cells take their neighbours' height
 * instead of becoming pits.
 */
export function terrainField(t: Terrain): TerrainField {
  const { cols, rows } = t;
  const e = Float32Array.from(t.elev);
  const nz: number[] = [];
  for (let i = 0; i < e.length; i += 7) if (e[i]! > 0) nz.push(e[i]!);
  nz.sort((a, b) => a - b);
  const p2 = nz.length ? nz[Math.floor(nz.length * 0.02)]! : 0;
  const inland = p2 > 60;
  if (inland) {
    // Fill the zero cells from their neighbours (a few passes are plenty).
    for (let pass = 0; pass < 24; pass++) {
      let left = 0;
      for (let j = 0; j < rows; j++)
        for (let i = 0; i < cols; i++) {
          const k = j * cols + i;
          if (e[k]! > 0) continue;
          let s = 0;
          let n = 0;
          for (const [di, dj] of [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ] as const) {
            const ii = i + di;
            const jj = j + dj;
            if (ii < 0 || jj < 0 || ii >= cols || jj >= rows) continue;
            const v = e[jj * cols + ii]!;
            if (v > 0) {
              s += v;
              n++;
            }
          }
          if (n)
            e[k] = -s / n; // negative: filled this pass (not a source yet)
          else left++;
        }
      for (let k = 0; k < e.length; k++) if (e[k]! < 0) e[k] = -e[k]!;
      if (!left) break;
    }
    for (let k = 0; k < e.length; k++) if (e[k]! <= 0) e[k] = p2;
  }
  const base = inland ? p2 : 0;
  const rel = new Float32Array(e.length);
  let max = 0;
  for (let k = 0; k < e.length; k++) {
    const v = Math.max(0, e[k]! - base);
    rel[k] = v;
    if (v > max) max = v;
  }
  return { cols, rows, bounds: t.bounds, rel, base, max };
}

/** Height (metres above the low ground) at (x, y), bilinear, clamped at the edges. */
export function heightAt(f: TerrainField, x: number, y: number): number {
  const [x0, y0, x1, y1] = f.bounds;
  const fx = Math.min(f.cols - 1, Math.max(0, ((x - x0) / (x1 - x0)) * (f.cols - 1)));
  const fy = Math.min(f.rows - 1, Math.max(0, ((y - y0) / (y1 - y0)) * (f.rows - 1)));
  const i = Math.min(f.cols - 2, Math.floor(fx));
  const j = Math.min(f.rows - 2, Math.floor(fy));
  const ax = fx - i;
  const ay = fy - j;
  const at = (ii: number, jj: number) => f.rel[jj * f.cols + ii] ?? 0;
  const top = at(i, j) * (1 - ax) + at(i + 1, j) * ax;
  const bot = at(i, j + 1) * (1 - ax) + at(i + 1, j + 1) * ax;
  return top * (1 - ay) + bot * ay;
}

// ---------------------------------------------------------------------------
// The GPU side: one texture, a patch for every material.

export interface TerrainUniforms {
  uTerrain: { value: THREE.DataTexture };
  /** x0, y0 of the first sample; the span (x1 − x0, y1 − y0). */
  uTerrainFrame: { value: THREE.Vector4 };
  uTerrainTexel: { value: THREE.Vector2 };
}

export function terrainUniforms(f: TerrainField): TerrainUniforms {
  const data = new Uint16Array(f.rel.length);
  for (let k = 0; k < f.rel.length; k++) data[k] = THREE.DataUtils.toHalfFloat(f.rel[k]!);
  const tex = new THREE.DataTexture(data, f.cols, f.rows, THREE.RedFormat, THREE.HalfFloatType);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  const [x0, y0, x1, y1] = f.bounds;
  return {
    uTerrain: { value: tex },
    uTerrainFrame: { value: new THREE.Vector4(x0, y0, x1 - x0, y1 - y0) },
    uTerrainTexel: { value: new THREE.Vector2(f.cols, f.rows) },
  };
}

/** GLSL: the terrain height under a world point (xz). Sample centres sit on the grid corners. */
const TERRAIN_GLSL = /* glsl */ `
uniform sampler2D uTerrain;
uniform vec4 uTerrainFrame;
uniform vec2 uTerrainTexel;
float terrainH(vec2 xz) {
  vec2 f = clamp((xz - uTerrainFrame.xy) / uTerrainFrame.zw, 0.0, 1.0);
  vec2 uv = (f * (uTerrainTexel - 1.0) + 0.5) / uTerrainTexel;
  return texture2D(uTerrain, uv).r;
}
`;

const PROJECT = /* glsl */ `
vec4 mvPosition = vec4( transformed, 1.0 );
#ifdef USE_BATCHING
  mvPosition = batchingMatrix * mvPosition;
#endif
#ifdef USE_INSTANCING
  mvPosition = instanceMatrix * mvPosition;
#endif
mvPosition = modelMatrix * mvPosition;
mvPosition.y += terrainH(mvPosition.xz) * terrainLift;
mvPosition = viewMatrix * mvPosition;
gl_Position = projectionMatrix * mvPosition;
`;

function bindUniforms(sh: { uniforms: Record<string, THREE.IUniform> }, u: TerrainUniforms) {
  sh.uniforms.uTerrain = u.uTerrain;
  sh.uniforms.uTerrainFrame = u.uTerrainFrame;
  sh.uniforms.uTerrainTexel = u.uTerrainTexel;
}

/**
 * A copy of `m` that stands on the terrain (null: leave it as it is). The
 * original keeps drawing as before, flat, wherever else it is used.
 */
export function terrainMaterial(m: THREE.Material, u: TerrainUniforms): THREE.Material | null {
  if ((m as THREE.ShaderMaterial).isShaderMaterial) {
    const sm = m as THREE.ShaderMaterial;
    const vs = sm.vertexShader;
    let out: string | null = null;
    if (vs.includes('modelViewMatrix * vec4(position, 1.0)'))
      out = vs.replace(
        'modelViewMatrix * vec4(position, 1.0)',
        'viewMatrix * terrainLiftW(modelMatrix * vec4(position, 1.0))',
      );
    else if (vs.includes('vec4 w = modelMatrix * vec4(position, 1.0);'))
      out = vs.replace(
        'vec4 w = modelMatrix * vec4(position, 1.0);',
        'vec4 w = terrainLiftW(modelMatrix * vec4(position, 1.0));',
      );
    if (!out) return null;
    const c = sm.clone();
    // Keep the shared uniforms (the night, the time, the sky) shared.
    c.uniforms = { ...sm.uniforms };
    bindUniforms(c, u);
    c.vertexShader =
      TERRAIN_GLSL + 'vec4 terrainLiftW(vec4 w) { w.y += terrainH(w.xz); return w; }\n' + out;
    return c;
  }
  const c = m.clone();
  const before = m.onBeforeCompile.bind(m);
  const key = m.customProgramCacheKey();
  c.onBeforeCompile = (sh, r) => {
    before(sh, r);
    bindUniforms(sh, u);
    sh.vertexShader = sh.vertexShader
      .replace(
        '#include <common>',
        `#include <common>\n${TERRAIN_GLSL}\nconst float terrainLift = 1.0;`,
      )
      .replace('#include <project_vertex>', PROJECT);
  };
  c.customProgramCacheKey = () => `${key}|terrain`;
  return c;
}

/**
 * Patch everything under `root` onto the terrain (once each): materials are
 * swapped for terrain copies, cached per original. Subtrees marked
 * `userData.noTerrain` (the sea, the sky, bridges, things placed with the
 * terrain already in) are left alone.
 */
export class TerrainPatcher {
  private copies = new Map<THREE.Material, THREE.Material | null>();
  /** `lift`: the highest the terrain goes (bounding spheres grow by it, for culling). */
  constructor(
    private u: TerrainUniforms,
    private lift: number,
  ) {}

  patch(root: THREE.Object3D) {
    const visit = (o: THREE.Object3D) => {
      if (o.userData.noTerrain) return;
      const m = o as THREE.Mesh;
      if (m.material && !o.userData.onTerrain) {
        const g = m.geometry as THREE.BufferGeometry | undefined;
        if (g && !g.userData.lifted && g.getAttribute?.('position')) {
          if (!g.boundingSphere) g.computeBoundingSphere();
          if (g.boundingSphere) g.boundingSphere.radius += this.lift;
          g.userData.lifted = true;
        }
        const im = o as THREE.InstancedMesh;
        if (im.isInstancedMesh && im.boundingSphere) im.boundingSphere.radius += this.lift;
        const swap = (x: THREE.Material) => {
          if (x.userData?.terrainCopy) return x;
          let c = this.copies.get(x);
          if (c === undefined) {
            c = terrainMaterial(x, this.u);
            if (c) c.userData.terrainCopy = true;
            this.copies.set(x, c);
          }
          return c ?? x;
        };
        m.material = Array.isArray(m.material) ? m.material.map(swap) : swap(m.material);
        o.userData.onTerrain = true;
      }
      for (const ch of o.children) visit(ch);
    };
    visit(root);
  }

  dispose() {
    for (const c of this.copies.values()) c?.dispose();
    this.copies.clear();
  }
}

// ---------------------------------------------------------------------------
// Geometry

/**
 * Cut a flat, non-indexed triangle geometry finer, so no edge is longer than
 * `max` metres (in x/z): a big park or a long road then follows the hills.
 * Every attribute is interpolated. Gives up past `cap` triangles.
 */
export function tessellate(g: THREE.BufferGeometry, max: number, cap = 600_000) {
  if (g.index) g = g.toNonIndexed();
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const names = Object.keys(g.attributes);
  const attrs = names.map((n) => g.getAttribute(n) as THREE.BufferAttribute);
  const out = attrs.map(() => [] as number[]);
  const tri = pos.count / 3;
  const max2 = max * max;
  let made = 0;
  // A vertex as all its attributes, flat.
  const vert = (i: number) =>
    attrs.map((a) => Array.from({ length: a.itemSize }, (_, k) => a.array[i * a.itemSize + k]!));
  const mid = (a: number[][], b: number[][]) =>
    a.map((x, n) => x.map((v, k) => (v + b[n]![k]!) / 2));
  const d2 = (a: number[][], b: number[][]) => {
    const p = a[names.indexOf('position')]!;
    const q = b[names.indexOf('position')]!;
    return (p[0]! - q[0]!) ** 2 + (p[2]! - q[2]!) ** 2;
  };
  const emit = (a: number[][], b: number[][], c: number[][], depth: number) => {
    const ab = d2(a, b);
    const bc = d2(b, c);
    const ca = d2(c, a);
    const m = Math.max(ab, bc, ca);
    if (m <= max2 || depth > 14 || made > cap) {
      for (const v of [a, b, c]) v.forEach((x, n) => out[n]!.push(...x));
      made++;
      return;
    }
    // Split the longest edge.
    if (m === ab) {
      const p = mid(a, b);
      emit(a, p, c, depth + 1);
      emit(p, b, c, depth + 1);
    } else if (m === bc) {
      const p = mid(b, c);
      emit(a, b, p, depth + 1);
      emit(a, p, c, depth + 1);
    } else {
      const p = mid(c, a);
      emit(a, b, p, depth + 1);
      emit(p, b, c, depth + 1);
    }
  };
  for (let t = 0; t < tri; t++) emit(vert(3 * t), vert(3 * t + 1), vert(3 * t + 2), 0);
  const r = new THREE.BufferGeometry();
  names.forEach((n, i) =>
    r.setAttribute(n, new THREE.Float32BufferAttribute(out[i]!, attrs[i]!.itemSize)),
  );
  r.computeBoundingSphere();
  return r;
}

/**
 * The land as a mesh on the terrain (flat here: the vertex patch lifts it),
 * covering the city's frame and a wide skirt beyond it, so the horizon is
 * land where the land goes on and sea where the sea does. Cells on water
 * are left out (the flat water and land layers show there).
 */
export function terrainGround(
  f: TerrainField,
  mask: GroundMask,
  bounds: [number, number, number, number],
  material: THREE.Material,
  opts: { step: number; skirt: number },
): THREE.Mesh {
  const [bx0, by0, bx1, by1] = bounds;
  const xs: number[] = [];
  const ys: number[] = [];
  const axis = (a: number, b: number, out: number[]) => {
    const n = Math.max(2, Math.ceil((b - a) / opts.step));
    // The skirt: steps that grow outwards.
    const out0: number[] = [];
    for (let d = opts.step * 2, s = opts.step * 2; d < opts.skirt; s *= 1.35, d += s) out0.push(d);
    for (const d of out0.reverse()) out.push(a - d);
    for (let i = 0; i <= n; i++) out.push(a + ((b - a) * i) / n);
    for (const d of out0.reverse()) out.push(b + d);
  };
  axis(bx0, bx1, xs);
  axis(by0, by1, ys);
  const W = xs.length;
  const H = ys.length;
  const pos = new Float32Array(W * H * 3);
  const land = new Uint8Array(W * H);
  const inset = mask.res * 1.5;
  for (let j = 0; j < H; j++)
    for (let i = 0; i < W; i++) {
      const x = xs[i]!;
      const y = ys[j]!;
      const k = j * W + i;
      pos[3 * k] = x;
      pos[3 * k + 1] = -0.6;
      pos[3 * k + 2] = y;
      // Beyond the frame: as the frame's edge is (land goes on, the sea goes on).
      const cx = Math.min(bx1 - inset, Math.max(bx0 + inset, x));
      const cy = Math.min(by1 - inset, Math.max(by0 + inset, y));
      const c = mask.coverAt(cx, cy);
      land[k] = c === COVER.water ? 0 : 1;
    }
  const index: number[] = [];
  for (let j = 0; j + 1 < H; j++)
    for (let i = 0; i + 1 < W; i++) {
      const a = j * W + i;
      const b = a + 1;
      const c = a + W;
      const d = c + 1;
      if (land[a] && land[b] && land[c] && land[d]) index.push(a, c, b, b, c, d);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(index);
  // Normals from the terrain (the vertex patch moves the points, not the normals).
  const nrm = new Float32Array(W * H * 3);
  for (let j = 0; j < H; j++)
    for (let i = 0; i < W; i++) {
      const x = xs[i]!;
      const y = ys[j]!;
      const e = 15;
      const dx = heightAt(f, x + e, y) - heightAt(f, x - e, y);
      const dy = heightAt(f, x, y + e) - heightAt(f, x, y - e);
      const n = new THREE.Vector3(-dx, 2 * e, -dy).normalize();
      const k = 3 * (j * W + i);
      nrm[k] = n.x;
      nrm[k + 1] = n.y;
      nrm[k + 2] = n.z;
    }
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.computeBoundingSphere();
  const m = new THREE.Mesh(g, material);
  m.frustumCulled = false;
  return m;
}

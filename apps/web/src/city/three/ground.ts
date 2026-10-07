/**
 * Wave 9 §B: the ground — water with a sheen and waves, land, parks,
 * beaches, airfields, rail, roads with their markings, bridge decks on piers,
 * and hills on the horizon beyond the map. Everything on the ground is drawn
 * first and in order (no depth writes), so nothing flickers however far the
 * camera pulls back.
 */
import * as THREE from 'three';
import type { GeoData } from '../geo';
import { ROAD_CLASSES } from '../geo';
import type { CityLook } from './cities';
import { COVER, type GroundMask } from './mask';
import type { RoadIndex } from './roads';
import { h3 } from './buildings';
import type { SharedUniforms } from './materials';

export interface SkyUniforms {
  uZenith: { value: THREE.Color };
  uHorizon: { value: THREE.Color };
  uSunDir: { value: THREE.Vector3 };
  uSunColor: { value: THREE.Color };
  uTime: { value: number };
  uNight: { value: number };
}

/** The sky's colour in a direction (shared by the sky dome and the water). */
export const SKY_FN = /* glsl */ `
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uNight;
vec3 skyColor(vec3 d) {
  float y = max(d.y, 0.0);
  vec3 c = mix(uHorizon, uZenith, pow(y, 0.55));
  float s = max(dot(normalize(d), uSunDir), 0.0);
  c += uSunColor * (pow(s, 600.0) * 6.0 + pow(s, 12.0) * 0.18) * (1.0 - uNight * 0.8);
  // Below the horizon: the haze carries on.
  if (d.y < 0.0) c = uHorizon;
  return c;
}
`;

// ---------------------------------------------------------------------------
// Polygons to flat meshes

function polyGeometry(polys: number[][], y = 0, minArea = 0): THREE.BufferGeometry | null {
  const pos: number[] = [];
  for (const p of polys) {
    if (p.length < 6) continue;
    const contour: THREE.Vector2[] = [];
    for (let i = 0; i + 1 < p.length; i += 2) contour.push(new THREE.Vector2(p[i]!, p[i + 1]!));
    if (contour.length > 3 && contour[0]!.distanceTo(contour[contour.length - 1]!) < 0.01) contour.pop();
    if (contour.length < 3) continue;
    if (minArea && Math.abs(THREE.ShapeUtils.area(contour)) < minArea) continue;
    const tris = THREE.ShapeUtils.triangulateShape(contour, []);
    for (const t of tris) {
      let [a, b, c] = t as [number, number, number];
      const A = contour[a]!;
      const B = contour[b]!;
      const C = contour[c]!;
      const cy = (B.y - A.y) * (C.x - A.x) - (B.x - A.x) * (C.y - A.y);
      if (cy < 0) [b, c] = [c, b];
      for (const k of [a, b, c]) pos.push(contour[k]!.x, y, contour[k]!.y);
    }
  }
  if (!pos.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const n = new Float32Array(pos.length);
  for (let i = 1; i < n.length; i += 3) n[i] = 1;
  g.setAttribute('normal', new THREE.BufferAttribute(n, 3));
  g.computeBoundingSphere();
  return g;
}

function flatMat(color: string, order: number, rough = 0.95) {
  const m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0 });
  m.depthWrite = false;
  m.userData.order = order;
  return m;
}

function layer(g: THREE.BufferGeometry | null, m: THREE.Material, order: number) {
  if (!g) return null;
  const mesh = new THREE.Mesh(g, m);
  mesh.renderOrder = order;
  mesh.receiveShadow = true;
  mesh.frustumCulled = true;
  return mesh;
}

// ---------------------------------------------------------------------------
// Water

export function waterMesh(sky: SkyUniforms, look: CityLook, size: number) {
  const g = new THREE.PlaneGeometry(size, size, 1, 1);
  g.rotateX(-Math.PI / 2);
  const mat = new THREE.ShaderMaterial({
    fog: true,
    depthWrite: false,
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uDeep: { value: new THREE.Color(look.water[0]) },
        uShallow: { value: new THREE.Color(look.water[1]) },
      },
    ]),
    vertexShader: /* glsl */ `
      varying vec3 vW;
      #include <fog_pars_vertex>
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz;
        vec4 mvPosition = viewMatrix * w;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uDeep;
      uniform vec3 uShallow;
      uniform float uTime;
      varying vec3 vW;
      ${SKY_FN}
      #include <fog_pars_fragment>
      float wh(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      float vn(vec2 p) {
        vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(wh(i), wh(i + vec2(1, 0)), f.x), mix(wh(i + vec2(0, 1)), wh(i + vec2(1, 1)), f.x), f.y);
      }
      void main() {
        vec2 p = vW.xz;
        float t = uTime;
        float dist = length(cameraPosition - vW);
        // Small waves: two noise octaves drifting, fading out with distance.
        float k = 1.0 - smoothstep(300.0, 6000.0, dist);
        vec2 q1 = p * 0.045 + vec2(t * 0.05, t * 0.03);
        vec2 q2 = p * 0.13 - vec2(t * 0.07, -t * 0.04);
        float e = 0.6;
        float dx = (vn(q1 + vec2(e, 0)) - vn(q1 - vec2(e, 0))) + 0.5 * (vn(q2 + vec2(e, 0)) - vn(q2 - vec2(e, 0)));
        float dz = (vn(q1 + vec2(0, e)) - vn(q1 - vec2(0, e))) + 0.5 * (vn(q2 + vec2(0, e)) - vn(q2 - vec2(0, e)));
        vec3 n = normalize(vec3(dx * 0.22 * k, 1.0, dz * 0.22 * k));
        vec3 V = normalize(cameraPosition - vW);
        vec3 R = reflect(-V, n);
        R.y = abs(R.y);
        float fr = 0.03 + 0.97 * pow(1.0 - max(dot(n, V), 0.0), 5.0);
        vec3 deep = mix(uDeep, uShallow, 0.25 + 0.25 * vn(p * 0.004));
        deep *= mix(1.0, 0.22, uNight);
        vec3 col = mix(deep, skyColor(R), clamp(fr * 0.85, 0.0, 1.0));
        float sun = pow(max(dot(R, uSunDir), 0.0), 220.0);
        col += uSunColor * sun * 2.5 * (1.0 - uNight);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  Object.assign(mat.uniforms, sky);
  const m = new THREE.Mesh(g, mat);
  m.renderOrder = -40;
  m.frustumCulled = false;
  return m;
}

// ---------------------------------------------------------------------------
// Roads: ribbons that carry their own markings (centre dashes, edge lines).

const ROAD_W = [24, 19, 15, 12, 10, 8];
const PAVE = [0, 0, 3.2, 3, 2.6, 2.2];

function roadMaterial(shared: SharedUniforms, color: string, marked: boolean) {
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.92, metalness: 0 });
  m.depthWrite = false;
  if (!marked) return m;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uNight = shared.uNight;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aRoad;\nvarying vec3 vRoad;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRoad = aRoad;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRoad;\nuniform float uNight;')
      .replace(
        '#include <color_fragment>',
        /* glsl */ `#include <color_fragment>
        {
          float along = vRoad.x;
          float across = vRoad.y; // -1..1
          float cls = floor(vRoad.z + 0.5);
          float halfW = cls < 0.5 ? 12.0 : cls < 1.5 ? 9.5 : cls < 2.5 ? 7.5 : cls < 3.5 ? 6.0 : cls < 4.5 ? 5.0 : 4.0;
          float m = across * halfW; // metres from the centre
          float fa = fwidth(m);
          float fl = fwidth(along);
          float vis = 1.0 - smoothstep(0.08, 0.3, fa);
          float line = 0.0;
          // Centre: dashed on small roads, double solid on big ones.
          if (cls >= 2.5) {
            float dash = step(fract(along / 9.0), 0.45);
            line = max(line, dash * (1.0 - smoothstep(0.08, 0.08 + fa, abs(m))));
          } else {
            line = max(line, 1.0 - smoothstep(0.1, 0.1 + fa, abs(abs(m) - 0.25)));
            // Lane dashes.
            float lanes = cls < 0.5 ? 3.5 : 3.3;
            float lm = abs(m) / lanes;
            float ld = (1.0 - smoothstep(0.03, 0.03 + fa / lanes, abs(fract(lm) - 0.0) * lanes / lanes)) *
              step(fract(along / 12.0), 0.4) * step(0.9, lm) * step(lm, halfW / lanes - 0.6);
            line = max(line, ld);
          }
          // Edge lines.
          line = max(line, (1.0 - smoothstep(0.1, 0.1 + fa, abs(abs(m) - (halfW - 0.6)))) * 0.8);
          // Zebra crossings near the ends of residential blocks are skipped: keep it calm.
          vec3 paint = cls < 2.5 ? vec3(0.92, 0.9, 0.82) : vec3(0.95);
          diffuseColor.rgb = mix(diffuseColor.rgb, paint, line * vis * 0.85);
          // Wear: a darker strip where the wheels run.
          diffuseColor.rgb *= 1.0 - 0.06 * vis * (1.0 - smoothstep(0.0, 1.2, abs(abs(m) - halfW * 0.45)));
          roadGlow = (cls < 3.5 ? 1.0 : 0.6) * (0.55 + 0.45 * line);
        }`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\n  totalEmissiveRadiance += vec3(1.0, 0.7, 0.35) * 0.06 * uNight * roadGlow;',
      )
      .replace('void main() {', 'float roadGlow = 0.0;\nvoid main() {');
  };
  m.customProgramCacheKey = () => 'road-marked';
  return m;
}

interface Ribbon {
  pos: number[];
  road: number[];
}

/** One polyline as a ribbon: quads overlapping at the joins. */
function ribbon(r: Ribbon, l: number[], halfW: number, cls: number, h: number[] | null, lift = 0) {
  let along = 0;
  for (let i = 0; i + 3 < l.length; i += 2) {
    const ax = l[i]!;
    const ay = l[i + 1]!;
    const bx = l[i + 2]!;
    const by = l[i + 3]!;
    const L = Math.hypot(bx - ax, by - ay);
    if (L < 0.01) continue;
    const dx = (bx - ax) / L;
    const dy = (by - ay) / L;
    const nx = -dy * halfW;
    const ny = dx * halfW;
    // Extend each end by a little, so joins close.
    const ex = dx * Math.min(halfW * 0.6, L * 0.5);
    const ey = dy * Math.min(halfW * 0.6, L * 0.5);
    const ha = (h ? h[i / 2]! : 0) + lift;
    const hb = (h ? h[i / 2 + 1]! : 0) + lift;
    const A = [ax - ex + nx, ha, ay - ey + ny];
    const B = [bx + ex + nx, hb, by + ey + ny];
    const C = [bx + ex - nx, hb, by + ey - ny];
    const D = [ax - ex - nx, ha, ay - ey - ny];
    const u0 = along;
    const u1 = along + L;
    // A B C, A C D (facing up).
    r.pos.push(...A, ...B, ...C, ...A, ...C, ...D);
    r.road.push(u0, 1, cls, u1, 1, cls, u1, -1, cls, u0, 1, cls, u1, -1, cls, u0, -1, cls);
    along += L;
  }
}

function ribbonMesh(r: Ribbon, mat: THREE.Material, order: number) {
  if (!r.pos.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(r.pos, 3));
  g.setAttribute('aRoad', new THREE.Float32BufferAttribute(r.road, 3));
  const n = new Float32Array(r.pos.length);
  for (let i = 1; i < n.length; i += 3) n[i] = 1;
  g.setAttribute('normal', new THREE.BufferAttribute(n, 3));
  g.computeBoundingSphere();
  const m = new THREE.Mesh(g, mat);
  m.renderOrder = order;
  m.receiveShadow = true;
  return m;
}

// ---------------------------------------------------------------------------
// The ground, all together.

export interface Ground {
  group: THREE.Group;
  water: THREE.Mesh;
  /** Bridge decks and piers (they cast shadows). */
  decks: THREE.Object3D[];
}

export function buildGround(
  data: GeoData,
  look: CityLook,
  mask: GroundMask,
  roads: RoadIndex,
  shared: SharedUniforms,
  sky: SkyUniforms,
  pierMat: THREE.Material,
): Ground {
  const group = new THREE.Group();
  const [bx0, by0, bx1, by1] = data.bounds;
  const span = Math.max(bx1 - bx0, by1 - by0);
  const water = waterMesh(sky, look, span * 14);
  water.position.set((bx0 + bx1) / 2, -0.05, (by0 + by1) / 2);
  group.add(water);

  const ground = new THREE.Color(look.ground);
  // Land: the city file's coast (or the whole frame), with what is beyond.
  const landPolys = data.land?.length
    ? data.land
    : [[bx0, by0, bx1, by0, bx1, by1, bx0, by1]];
  const add = (m: THREE.Object3D | null) => m && group.add(m);
  add(layer(polyGeometry(landPolys), flatMat(look.ground, -39), -39));
  add(layer(polyGeometry(data.airport ?? []), flatMat('#a9a79f', -38), -38));
  add(layer(polyGeometry(data.green ?? [], 0, 400), flatMat(mixHex(look.park, look.ground, 0.35), -37), -37));
  add(layer(polyGeometry(data.parks ?? [], 0, 200), flatMat(look.park, -36), -36));
  add(layer(polyGeometry(data.beach ?? []), flatMat(look.beach, -35), -35));
  // Water on land (lakes, the river, the lagoon): drawn by the same shader.
  const inland = polyGeometry(data.water ?? []);
  if (inland) {
    const w = new THREE.Mesh(inland, water.material);
    w.renderOrder = -34;
    group.add(w);
  }
  const rivers: Ribbon = { pos: [], road: [] };
  for (const l of data.rivers ?? []) ribbon(rivers, l, 7, 9, null);
  if (rivers.pos.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(rivers.pos, 3));
    const w = new THREE.Mesh(g, water.material);
    w.renderOrder = -34;
    group.add(w);
  }

  // Runways and rail.
  const run: Ribbon = { pos: [], road: [] };
  for (const l of data.runways ?? []) ribbon(run, l, 24, 9, null);
  add(ribbonMesh(run, flatMat('#5d6168', -33), -33));
  const rail: Ribbon = { pos: [], road: [] };
  for (const l of data.rail ?? []) ribbon(rail, l, 3.2, 9, null);
  add(ribbonMesh(rail, flatMat('#6f6559', -33), -33));

  // Pavements, then asphalt (small roads under big ones).
  const pave: Ribbon = { pos: [], road: [] };
  const asphalt: Ribbon = { pos: [], road: [] };
  for (let ci = ROAD_CLASSES.length - 1; ci >= 0; ci--) {
    for (const r of data.roads?.[ROAD_CLASSES[ci]!] ?? []) {
      if (PAVE[ci]) ribbon(pave, r.l, ROAD_W[ci]! / 2 + PAVE[ci]!, ci, null);
      ribbon(asphalt, r.l, ROAD_W[ci]! / 2, ci, null);
    }
  }
  add(ribbonMesh(pave, flatMat(mixHex('#cfcbc2', look.ground, 0.3), -32, 0.9), -32));
  const asphaltMat = roadMaterial(shared, '#4a4d52', true);
  add(ribbonMesh(asphalt, asphaltMat, -31));

  // Bridge decks: raised, with parapets, on piers.
  const decks: THREE.Object3D[] = [];
  const deck: Ribbon = { pos: [], road: [] };
  const sides: number[] = [];
  const piers: { x: number; y: number; h: number; a: number }[] = [];
  const seen = new Set<string>();
  for (const s of roads.decks) {
    const k = `${Math.round(s.ax)},${Math.round(s.ay)},${Math.round(s.bx)},${Math.round(s.by)}`;
    if (seen.has(k)) continue;
    seen.add(k);
    const hw = ROAD_W[s.c]! / 2 + 1;
    ribbon(deck, [s.ax, s.ay, s.bx, s.by], hw, s.c, [s.ha, s.hb], 0.15);
    // Parapets and the deck's edge, down to its underside.
    const L = Math.hypot(s.bx - s.ax, s.by - s.ay);
    if (L < 0.01) continue;
    const nx = (-(s.by - s.ay) / L) * hw;
    const ny = ((s.bx - s.ax) / L) * hw;
    for (const sg of [1, -1]) {
      const ax = s.ax + nx * sg;
      const ay = s.ay + ny * sg;
      const bx = s.bx + nx * sg;
      const by = s.by + ny * sg;
      const lo = -1.4;
      const hi = 1.1;
      sides.push(ax, s.ha + lo, ay, bx, s.hb + lo, by, bx, s.hb + hi, by);
      sides.push(ax, s.ha + lo, ay, bx, s.hb + hi, by, ax, s.ha + hi, ay);
      sides.push(ax, s.ha + lo, ay, bx, s.hb + hi, by, bx, s.hb + lo, by);
      sides.push(ax, s.ha + lo, ay, ax, s.ha + hi, ay, bx, s.hb + hi, by);
    }
    // Piers where the deck is high.
    const n = Math.floor(L / 45);
    for (let i = 0; i <= n; i++) {
      const t = n ? i / n : 0.5;
      const h = s.ha + (s.hb - s.ha) * t;
      if (h < 3.5) continue;
      piers.push({
        x: s.ax + (s.bx - s.ax) * t,
        y: s.ay + (s.by - s.ay) * t,
        h,
        a: Math.atan2(s.by - s.ay, s.bx - s.ax),
      });
    }
  }
  if (deck.pos.length) {
    const dm = ribbonMesh(deck, roadMaterial(shared, '#55585d', true), 1)!;
    (dm.material as THREE.Material).depthWrite = true;
    dm.castShadow = true;
    group.add(dm);
    decks.push(dm);
  }
  if (sides.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(sides, 3));
    g.computeVertexNormals();
    const m = new THREE.Mesh(
      g,
      new THREE.MeshStandardMaterial({ color: '#c9c6bf', roughness: 0.8, side: THREE.DoubleSide }),
    );
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
    decks.push(m);
  }
  if (piers.length) {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    geo.translate(0, 0.5, 0);
    const im = new THREE.InstancedMesh(geo, pierMat, piers.length);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    piers.forEach((p, i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -p.a);
      m4.compose(new THREE.Vector3(p.x, -2, p.y), q, new THREE.Vector3(2.5, p.h + 0.6, 6));
      im.setMatrixAt(i, m4);
    });
    im.computeBoundingSphere();
    im.castShadow = true;
    group.add(im);
    decks.push(im);
  }

  group.add(horizon(data, look, mask, ground));
  return { group, water, decks };
}

export function mixHex(a: string, b: string, t: number) {
  return '#' + new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString();
}

// ---------------------------------------------------------------------------
// Beyond the map: land where the map's edge is land, and hills on the horizon.

function horizon(data: GeoData, look: CityLook, mask: GroundMask, ground: THREE.Color) {
  const [bx0, by0, bx1, by1] = data.bounds;
  const cx = (bx0 + bx1) / 2;
  const cy = (by0 + by1) / 2;
  const hx = (bx1 - bx0) / 2;
  const hy = (by1 - by0) / 2;
  const R = Math.max(hx, hy) * 5;
  // Is the map's edge land in this direction?
  const SECT = 48;
  const landAt: number[] = [];
  for (let k = 0; k < SECT; k++) {
    const a = (k / SECT) * Math.PI * 2;
    const dx = Math.sin(a);
    const dy = -Math.cos(a);
    const t = Math.min(Math.abs(hx / (dx || 1e-9)), Math.abs(hy / (dy || 1e-9))) * 0.97;
    let land = 0;
    for (let s = -2; s <= 2; s++) {
      const a2 = a + s * 0.02;
      const x = cx + Math.sin(a2) * t;
      const y = cy - Math.cos(a2) * t;
      if (mask.coverAt(x, y) !== COVER.water) land++;
    }
    landAt.push(land >= 3 ? 1 : 0);
  }
  const N = 96;
  const pos: number[] = [];
  const col: number[] = [];
  const hill = new THREE.Color(look.hillColor);
  const vtx = (i: number, j: number) => {
    const x = cx + (i / N - 0.5) * 2 * R;
    const y = cy + (j / N - 0.5) * 2 * R;
    const ox = Math.max(0, Math.abs(x - cx) - hx);
    const oy = Math.max(0, Math.abs(y - cy) - hy);
    const out = Math.hypot(ox, oy);
    const bearing = ((Math.atan2(x - cx, -(y - cy)) * 180) / Math.PI + 360) % 360;
    const sect = Math.floor((bearing / 360) * SECT) % SECT;
    const land = landAt[sect]!;
    let hgt = 0;
    for (const hz of look.horizon) {
      let db = Math.abs(bearing - hz.at);
      db = Math.min(db, 360 - db);
      const f = Math.max(0, 1 - db / hz.spread);
      const ridge = 0.6 + 0.4 * Math.sin(bearing * 0.31 + hz.at) * Math.sin(out * 0.0007 + hz.at);
      const rise = Math.min(1, out / 4000) * Math.max(0, 1 - Math.max(0, out - 14000) / 20000);
      hgt = Math.max(hgt, hz.h * f * f * (3 - 2 * f) * ridge * rise);
    }
    const n = h3(i, j, 5);
    hgt *= 0.85 + 0.3 * n;
    const isLand = land || hgt > 15;
    const y3 = out < 1 ? -0.2 : isLand ? hgt : -6;
    const c = ground
      .clone()
      .lerp(hill, Math.min(1, 0.35 + hgt / 120))
      .multiplyScalar(0.85 + 0.15 * n);
    return { x, y, z: y3, c, keep: out > 0 && isLand };
  };
  const grid: ReturnType<typeof vtx>[] = [];
  for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) grid.push(vtx(i, j));
  const at = (i: number, j: number) => grid[j * (N + 1) + i]!;
  for (let j = 0; j < N; j++)
    for (let i = 0; i < N; i++) {
      const a = at(i, j);
      const b = at(i + 1, j);
      const c = at(i + 1, j + 1);
      const d = at(i, j + 1);
      if (!(a.keep || b.keep || c.keep || d.keep)) continue;
      // Skip cells wholly inside the map.
      const mx = (a.x + c.x) / 2;
      const my = (a.y + c.y) / 2;
      if (Math.abs(mx - cx) < hx - 1 && Math.abs(my - cy) < hy - 1) continue;
      for (const v of [a, c, b, a, d, c]) {
        pos.push(v.x, v.z, v.y);
        col.push(v.c.r, v.c.g, v.c.b);
      }
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  const m = new THREE.Mesh(
    g,
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }),
  );
  m.renderOrder = -38;
  m.frustumCulled = false;
  m.receiveShadow = false;
  return m;
}

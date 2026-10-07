/**
 * Wave 9 §B: building facades drawn by a shader, not textures. One
 * MeshStandardMaterial, patched (onBeforeCompile), paints every wall with a
 * window grid at real floor heights and bay widths, by style:
 *
 *   0 stucco   punched windows, shopfronts on the ground floor
 *   1 brick    punched windows with stone lintels
 *   2 office   ribbon windows (concrete bands)
 *   3 glass    a curtain wall: mirror glass between thin mullions
 *   4 stone    a classic tower: piers and deep windows
 *   5 shed     industrial: a few high windows
 *   6 house    small windows, a door
 *   7 plain    no windows (landmarks, parapets)
 *   8 flat roof · 9 pitched roof · 10 rooftop plant · 11 gable end · 12 lamp
 *
 * Glass is metallic and smooth, so it reflects the sky (scene.environment).
 * Windows fade to their average tone with distance (no shimmer), and light
 * up at night from a hash per window.
 *
 * Two inputs: merged geometry carries `color` + `aFac` (u, v, style, seed)
 * per vertex; instanced boxes carry `aPart` per vertex and `iColor`, `iRoof`,
 * `iStyle` per instance (u and v come from the instance's scale).
 */
import * as THREE from 'three';

export interface SharedUniforms {
  uNight: { value: number };
  uTime: { value: number };
  uSunDir: { value: THREE.Vector3 };
  /** Detail ring: (x, z) of its centre and its radius; near lots inside, far rows outside. */
  uDetail: { value: THREE.Vector3 };
}

export const makeShared = (): SharedUniforms => ({
  uNight: { value: 0 },
  uTime: { value: 0 },
  uSunDir: { value: new THREE.Vector3(0.4, 0.8, 0.3) },
  uDetail: { value: new THREE.Vector3(0, 0, 0) },
});

/** Which side of the detail ring an instanced mesh draws. */
export type Lod = 'all' | 'near' | 'far';

const COMMON_FRAG = /* glsl */ `
uniform float uNight;
uniform float uTime;
varying vec4 vFac;
varying vec3 vBase;
varying float vHl;
float bh21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
// Antialiased box 0..1 inside [a, b] on a cell coordinate f, filter width w.
float abox(float f, float a, float b, float w) {
  return smoothstep(a - w, a + w, f) * (1.0 - smoothstep(b - w, b + w, f));
}
`;

const FACADE = /* glsl */ `
  float st = floor(vFac.z + 0.5);
  float seed = vFac.w;
  vec3 base = vBase;
  float fRough = 0.9;
  float fMetal = 0.0;
  vec3 fEmis = vec3(0.0);
  if (st < 7.5) {
    float floorH = st == 5.0 ? 6.0 : (st == 3.0 ? 3.7 : (st == 6.0 ? 3.0 : 3.25));
    float bayW = st == 3.0 ? 1.55 : (st == 2.0 ? 3.2 : (st == 4.0 ? 2.1 : (st == 5.0 ? 8.0 : 3.3)));
    bayW *= 0.9 + 0.25 * fract(seed * 7.13);
    vec2 cell = vec2(vFac.x / bayW, vFac.y / floorH);
    vec2 f = fract(cell);
    vec2 id = floor(cell);
    vec2 fw = min(fwidth(cell), vec2(0.5));
    vec2 wa, wb;
    if (st == 3.0) { wa = vec2(0.04, 0.12); wb = vec2(0.96, 0.98); }
    else if (st == 2.0) { wa = vec2(0.0, 0.32); wb = vec2(1.0, 0.86); }
    else if (st == 4.0) { wa = vec2(0.22, 0.2); wb = vec2(0.78, 0.84); }
    else if (st == 5.0) { wa = vec2(0.2, 0.62); wb = vec2(0.8, 0.86); }
    else if (st == 6.0) { wa = vec2(0.3, 0.32); wb = vec2(0.7, 0.8); }
    else { wa = vec2(0.24, 0.27); wb = vec2(0.76, 0.82); }
    // Each axis fades to its average on its own: from afar the bays blur
    // first and the floors still read as bands of windows.
    vec2 farK2 = smoothstep(vec2(0.22), vec2(0.6), fw);
    float wx = mix(abox(f.x, wa.x, wb.x, fw.x), wb.x - wa.x, farK2.x);
    float wy = mix(abox(f.y, wa.y, wb.y, fw.y), wb.y - wa.y, farK2.y);
    float win = wx * wy;
    float farK = max(farK2.x, farK2.y);
    // Ground floor: shopfronts on everything but houses, sheds and towers of glass.
    float ground = (st < 2.5 || st == 4.0) && vFac.y < 4.6 && seed > 0.25 ? 1.0 : 0.0;
    if (ground > 0.5 && id.y < 0.5) {
      float sf = abox(fract(vFac.x / 4.5), 0.08, 0.92, fwidth(vFac.x / 4.5)) *
        abox(vFac.y, 0.4, 3.6, fwidth(vFac.y));
      win = mix(sf, 0.7, farK);
    }
    // Rows of windows that are not there: plain bays on low walls, a blank first band on towers.
    float blank = st != 3.0 && fract(seed * 13.7 + id.x * 0.0) > 0.92 ? 1.0 : 0.0;
    win *= 1.0 - blank * 0.85;
    vec3 wall = base;
    if (st == 1.0) wall *= 0.92 + 0.12 * bh21(floor(vec2(vFac.x * 4.0, vFac.y * 13.0)));
    if (st == 4.0) wall *= 0.95 + 0.08 * abox(f.x, 0.0, 0.2, fw.x);
    // Lintels on brick, sills on stucco.
    if (st == 1.0 || st == 0.0)
      wall = mix(wall, vec3(0.86, 0.84, 0.8), abox(f.y, 0.83, 0.9, fw.y) * abox(f.x, wa.x - 0.04, wb.x + 0.04, fw.x) * (1.0 - farK));
    // Grime at street level, light at the top: buildings sit on the ground.
    wall *= mix(0.72, 1.0, smoothstep(0.0, 7.0, vFac.y));
    vec3 glass;
    if (st == 3.0) {
      // Curtain wall: mirror glass, tinted; spandrels a shade lighter.
      glass = base * 0.55;
      wall = base * 0.85 + 0.08;
      fRough = mix(0.5, 0.06, win);
      fMetal = mix(0.3, 0.95, win);
    } else {
      float tint = bh21(id + seed * 31.0);
      // Window glass reads dark from the air: curtains, rooms, a little sky.
      glass = mix(vec3(0.035, 0.045, 0.06), vec3(0.11, 0.13, 0.16), tint);
      fRough = mix(0.88, 0.3, win);
      fMetal = mix(0.0, 0.3, win);
    }
    base = mix(wall, glass, win);
    // Night: a share of the windows lit, warm or cool, by window.
    float r = bh21(id * vec2(1.7, 3.1) + seed * 57.0);
    float fs = fract(seed * 5.3);
    float frac = 0.03 + 0.5 * fs * fs;
    // Far off, the lit share is averaged (no sparkle).
    // Floors differ (offices dark, a few lit); far off, each floor averages.
    float rowFrac = frac * (0.3 + 1.4 * bh21(vec2(id.y * 7.1, seed * 13.0)));
    float litX = mix(step(r, rowFrac), rowFrac, farK2.x);
    float lit = mix(litX, frac, farK2.y) * win;
    vec3 warm = mix(vec3(1.0, 0.74, 0.42), vec3(0.85, 0.9, 1.0), step(0.78, fract(r * 9.1)) * (1.0 - farK));
    fEmis = warm * lit * uNight * mix(1.5, 0.75, farK);
    if (ground > 0.5 && vFac.y < 4.6) fEmis += vec3(1.0, 0.85, 0.6) * win * uNight * 0.9;
  } else if (st == 8.0) {
    // Flat roofs: membrane and gravel with patches.
    // Patches of membrane, blended (no blocky squares), fading out far away.
    vec2 rp = vec2(vFac.x, vFac.y) * 0.18 + seed * 11.0;
    vec2 ri = floor(rp);
    vec2 rf = fract(rp);
    rf = rf * rf * (3.0 - 2.0 * rf);
    float n = mix(mix(bh21(ri), bh21(ri + vec2(1, 0)), rf.x), mix(bh21(ri + vec2(0, 1)), bh21(ri + vec2(1, 1)), rf.x), rf.y);
    float rfar = smoothstep(0.3, 1.5, length(fwidth(rp)));
    base *= mix(0.92 + 0.12 * n, 0.98, rfar);
    fRough = 0.95;
  } else if (st == 9.0) {
    // Tiles or sheets: courses along the slope.
    float c = abox(fract(vFac.y * 2.6), 0.0, 0.18, fwidth(vFac.y * 2.6));
    base *= 1.0 - 0.18 * c * (1.0 - smoothstep(0.2, 0.6, fwidth(vFac.y * 2.6)));
    fRough = 0.8;
    fMetal = 0.08;
  } else if (st == 10.0) {
    base *= 0.95;
    fRough = 0.55;
    fMetal = 0.4;
  } else if (st == 12.0) {
    fEmis = base * (0.25 + 1.8 * uNight);
  } else {
    fRough = 0.85;
  }
  if (vHl > 0.5) {
    // A game place: a soft glow that breathes.
    float pulse = 0.55 + 0.45 * sin(uTime * 2.2);
    fEmis += vec3(1.0, 0.72, 0.25) * (0.06 + 0.12 * pulse) * (1.0 - smoothstep(0.0, 40.0, vFac.y) * 0.5);
  }
  diffuseColor.rgb = base;
`;

/** Patch a standard material into the facade shader. */
function patch(
  mat: THREE.MeshStandardMaterial,
  shared: SharedUniforms,
  instanced: boolean,
  lod: Lod,
) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uNight = shared.uNight;
    sh.uniforms.uTime = shared.uTime;
    sh.uniforms.uDetail = shared.uDetail;
    const vHead = instanced
      ? /* glsl */ `
attribute float aPart;
attribute vec3 iColor;
attribute vec3 iRoof;
attribute vec3 iStyle;
uniform vec3 uDetail;
varying vec4 vFac;
varying vec3 vBase;
varying float vHl;
`
      : /* glsl */ `
attribute vec4 aFac;
attribute vec3 aCol;
attribute float aHl;
varying vec4 vFac;
varying vec3 vBase;
varying float vHl;
`;
    const vBody = instanced
      ? /* glsl */ `
  vec3 sc = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
  float part = floor(aPart + 0.5);
  float st = iStyle.x * 255.0;
  float u = position.x * sc.x + position.z * sc.z + sc.x * 3.0;
  float v = position.y * sc.y + iStyle.z * 255.0;
  vec3 col = iColor;
  if (st > 7.5 && st < 12.5) { col = st == 10.0 ? iRoof : iColor; }
  else if (part == 1.0) { st = 8.0; col = iRoof; u = position.x * sc.x; v = position.z * sc.z; }
  else if (part == 2.0) { st = 9.0; col = iRoof; u = position.x * sc.x + position.z * sc.z; v = position.y * sc.y * 1.6; }
  else if (part == 3.0) { st = 11.0; }
  vFac = vec4(u, v, st, iStyle.y);
  vBase = col;
  vHl = 0.0;
  ${
    lod === 'all'
      ? ''
      : `{ float dd = distance(instanceMatrix[3].xz, uDetail.xy);
    if (${lod === 'near' ? 'dd >= uDetail.z' : 'dd < uDetail.z'}) transformed = vec3(0.0); }`
  }
`
      : /* glsl */ `
  vFac = aFac;
  vBase = aCol;
  vHl = aHl;
`;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${vHead}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${vBody}`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${COMMON_FRAG}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${FACADE}`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = fRough;')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = fMetal;')
      .replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\n  totalEmissiveRadiance += fEmis;',
      );
  };
  mat.customProgramCacheKey = () => (instanced ? `facade-i-${lod}` : 'facade-m');
}

export function facadeMaterial(shared: SharedUniforms, instanced: boolean, lod: Lod = 'all') {
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.9,
    metalness: 0,
    flatShading: true,
    envMapIntensity: 1.6,
  });
  patch(mat, shared, instanced, lod);
  return mat;
}

/** Linear-space colour from a CSS hex, as 0–255 bytes (for Uint8 attributes). */
export function rgbBytes(hex: string): [number, number, number] {
  const c = new THREE.Color(hex);
  // Attributes are read raw in the shader: store linear values.
  return [Math.round(c.r * 255), Math.round(c.g * 255), Math.round(c.b * 255)];
}

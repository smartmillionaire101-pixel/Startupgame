/**
 * Wave 10 §B: the city at night — lights as glowing point sprites, not real
 * lights (one draw call per set, nothing for the GPU to shade).
 *
 * Each light is a soft dot with a halo, added onto the picture (additive),
 * sized in metres so it shrinks with distance, faded in the haze, and
 * brightened by `uNight` (off by day). The halo stands in for bloom: around
 * every lamp the night air glows. Some blink (aviation beacons), some
 * twinkle (the Bay Lights).
 *
 * Sets: street lamps along the roads (by class), car headlights and tail
 * lights (actors.ts), landmark lights (landmarks.ts), beacons on towers.
 */
import * as THREE from 'three';
import type { RoadIndex } from './roads';
import type { Fp } from './footprints';

export interface GlowUniforms {
  uNight: { value: number };
  uTime: { value: number };
  /** Pixels per metre at one metre away: viewport height / (2 tan(fov / 2)). */
  uScale: { value: number };
}

export const glowUniforms = (): GlowUniforms => ({
  uNight: { value: 0 },
  uTime: { value: 0 },
  uScale: { value: 800 },
});

/** A light set under construction: positions (x, y up, z), colours, sizes (m), blink. */
export class LightList {
  pos: number[] = [];
  col: number[] = [];
  size: number[] = [];
  /** 0 steady; > 0 blinks (its phase); < 0 twinkles (its phase). */
  blink: number[] = [];
  get length() {
    return this.size.length;
  }
  add(x: number, y: number, z: number, color: THREE.ColorRepresentation, size: number, blink = 0) {
    const c = _c.set(color);
    this.pos.push(x, y, z);
    this.col.push(c.r, c.g, c.b);
    this.size.push(size);
    this.blink.push(blink);
  }
  append(o: LightList) {
    this.pos.push(...o.pos);
    this.col.push(...o.col);
    this.size.push(...o.size);
    this.blink.push(...o.blink);
  }
}
const _c = new THREE.Color();

/** The glow material: one per set (they share the uniforms). */
export function glowMaterial(u: GlowUniforms, opts: { day?: number } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      ...THREE.UniformsLib.fog,
      uNight: u.uNight,
      uTime: u.uTime,
      uScale: u.uScale,
      // How much shows by day (car lights: tail lights still read a little).
      uDay: { value: opts.day ?? 0 },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: true,
    vertexShader: /* glsl */ `
      attribute vec3 aColor;
      attribute float aSize;
      attribute float aBlink;
      uniform float uScale;
      uniform float uTime;
      uniform float uNight;
      uniform float uDay;
      varying vec3 vColor;
      varying float vK;
      #include <fog_pars_vertex>
      void main() {
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        float d = max(1.0, -mvPosition.z);
        float k = 1.0;
        if (aBlink > 0.0) k = step(0.55, fract(uTime * 0.8 + aBlink)) * 1.2;
        else if (aBlink < 0.0) k = 0.55 + 0.45 * sin(uTime * 2.3 + aBlink * 37.0);
        vK = k * max(uNight, uDay);
        vColor = aColor;
        // Far off, a light stays a few pixels (it doesn't vanish into the haze at once).
        gl_PointSize = clamp(aSize * uScale / d, 2.0, 220.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vColor;
      varying float vK;
      #include <fog_pars_fragment>
      void main() {
        vec2 q = gl_PointCoord * 2.0 - 1.0;
        float r2 = dot(q, q);
        if (r2 > 1.0) discard;
        // A hot core and a wide, faint halo (the glow in the night air).
        float a = exp(-r2 * 16.0) * 1.5 + exp(-r2 * 3.2) * 0.42;
        a *= 1.0 - r2;
        vec3 c = vColor * a * vK;
        #ifdef USE_FOG
          #ifdef FOG_EXP2
            float fogFactor = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
          #else
            float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);
          #endif
          // Haze dims a light but spreads it: less fade than solid things.
          c *= 1.0 - fogFactor * 0.75;
        #endif
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
}

/** Points for a light list (null when empty). */
export function glowPoints(list: LightList, mat: THREE.Material): THREE.Points | null {
  if (!list.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(list.pos, 3));
  g.setAttribute('aColor', new THREE.Float32BufferAttribute(list.col, 3));
  g.setAttribute('aSize', new THREE.Float32BufferAttribute(list.size, 1));
  g.setAttribute('aBlink', new THREE.Float32BufferAttribute(list.blink, 1));
  g.computeBoundingSphere();
  const p = new THREE.Points(g, mat);
  p.renderOrder = 5;
  return p;
}

/** Lamp colour by road class: sodium orange on the big roads, whiter LEDs in town. */
const LAMP = ['#ffb35c', '#ffbf6e', '#ffd49a', '#ffe2b8', '#ffe9c9', '#fff0d8'];

/**
 * Street lamps along the roads, alternating sides (both sides on the big
 * roads), spaced by class; on bridges at deck height. Capped for the budget.
 */
export function streetLamps(roads: RoadIndex, max = 40000): LightList {
  const out = new LightList();
  let n = 0;
  for (const s of roads.segs) {
    const L = Math.hypot(s.bx - s.ax, s.by - s.ay);
    if (L < 1) continue;
    const half = [12, 10, 8.5, 7.5, 6.5, 5][s.c] ?? 5;
    const step = s.c <= 1 ? 34 : s.c <= 3 ? 30 : s.c === 4 ? 36 : 44;
    const both = s.c <= 2;
    const nx = -(s.by - s.ay) / L;
    const ny = (s.bx - s.ax) / L;
    for (let d = step * 0.4; d < L; d += step) {
      const t = d / L;
      const h = s.ha + (s.hb - s.ha) * t + (s.c <= 1 ? 10 : 7.5);
      const x = s.ax + (s.bx - s.ax) * t;
      const y = s.ay + (s.by - s.ay) * t;
      const size = s.c <= 1 ? 9 : s.c <= 3 ? 7.5 : 6;
      if (both) {
        out.add(x + nx * half, h, y + ny * half, LAMP[s.c]!, size);
        out.add(x - nx * half, h, y - ny * half, LAMP[s.c]!, size);
      } else {
        const sg = (n++ & 1) * 2 - 1;
        out.add(x + nx * half * sg, h, y + ny * half * sg, LAMP[s.c]!, size);
      }
    }
    if (out.length > max) break;
  }
  return out;
}

/** Red aviation beacons on the tall towers (blinking, each its own beat). */
export function beacons(fps: Fp[]): LightList {
  const out = new LightList();
  for (const f of fps) {
    if (f.top < 80) continue;
    const [x0, y0, x1, y1] = f.box;
    out.add(
      (x0 + x1) / 2,
      f.top + 8,
      (y0 + y1) / 2,
      '#ff2a1a',
      Math.max(8, f.top / 22),
      0.05 + hash01(x0, y0) * 0.9,
    );
  }
  return out;
}

const hash01 = (x: number, y: number) => {
  const v = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return v - Math.floor(v);
};

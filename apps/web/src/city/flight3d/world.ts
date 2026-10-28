/**
 * Phase 6b: the world outside the plane, the full sky of the flight.
 *
 * - The sky dome and its light from the 3D city's own sky (../three/sky.ts:
 *   the gradient, the sun's disc and glow, stars at night), set from where
 *   the sun really is over the route at that moment (dawn, day, dusk, night),
 *   with a sun halo or a moon.
 * - The ground around the airport (a painted patchwork, the city in its
 *   colours, the coast; strings of lights at night), the runway with its
 *   lights, the terminal and a few hundred buildings, and the earth curving
 *   away towards a hazy horizon: far from the camera the ground and the
 *   clouds bend down (a little more to the sides, so the horizon reads as a
 *   gentle arc on a phone held upright).
 * - Clouds: soft billboards from a canvas atlas (one draw call, sorted far to
 *   near each frame) and, at cruise, a deck of cloud below, from a tiling
 *   noise. Flying through a cloud mists the view (`mist`).
 * - The plane (three-kit/plane.ts) at real size, with its navigation lights.
 *
 * Shots (`pose`): the take-off roll and climb-out with the city falling
 * away; at cruise the wing from a window seat, then out to the whole plane
 * banking gently against the sky; the approach down through the clouds to the
 * destination's runway; and the plane rolled out there.
 */
import * as THREE from 'three';
import { screenBoxOf } from '../../three-kit/screen-box';
import { applySky, skyAt, skyDome, skyUniforms, type SkyState } from '../three/sky';
import type { SkyUniforms } from '../three/ground';
import { makePlane3D, type Plane3D, type Plane3DKind } from '../../three-kit/plane';
import { flavourOf } from '../flavour';
import { CITY_GEO, fnv, seeded } from '../travel';
import {
  CITY_AT,
  GROUND_SPAN,
  cloudAtlas,
  glowTexture,
  groundTexture,
  noiseTexture,
  runwayTexture,
} from './textures';

export type WorldShot = 'takeoff' | 'sky' | 'landing' | 'arrived';
export type DayLight = 'dawn' | 'day' | 'dusk' | 'night';

const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const seg = (k: number, a: number, b: number) => clamp((k - a) / (b - a));
const ease = (x: number) => x * x * (3 - 2 * x);
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const DEG = Math.PI / 180;

/** The sun's local hour over a longitude at a moment (solar time, what the sky shows). */
function solarHour(lon: number, at: number): number {
  const d = new Date(at);
  const utc = d.getUTCHours() + d.getUTCMinutes() / 60;
  return (((utc + lon / 15) % 24) + 24) % 24;
}

/** The sky over a place at a moment, and what to call it. */
export function skyOver(lat: number, lon: number, at: number): { state: SkyState; part: DayLight } {
  const hour = solarHour(lon, at);
  const state = skyAt(hour, lat, 0.25);
  const part: DayLight =
    state.night > 0.6
      ? 'night'
      : state.night > 0.05 || hour < 9.5 || hour > 16.5
        ? hour < 12
          ? 'dawn'
          : 'dusk'
        : 'day';
  return { state, part };
}

/** A place on the route (a city, or the midpoint) and the moment over it. */
export interface Over {
  marketId: string;
  lat: number;
  lon: number;
  at: number;
}

export const overCity = (marketId: string, at: number): Over => ({
  marketId,
  lat: CITY_GEO[marketId]?.lat ?? 0,
  lon: CITY_GEO[marketId]?.lon ?? 0,
  at,
});

// ---------------------------------------------------------------------------
// Shaders

/**
 * The earth's curve: flat round the airport, then dropping away with the
 * square of the distance (more to the sides of the view than ahead).
 */
const CURVE = /* glsl */ `
uniform vec3 uCam;
uniform vec2 uFwd;
vec3 curve(vec3 w) {
  vec2 d = w.xz - uCam.xz;
  float len = length(d) + 1e-3;
  float dd = max(len - 9000.0, 0.0);
  float lat = (d.x * uFwd.y - d.y * uFwd.x) / len;
  w.y -= dd * dd * (1.0 / 400000.0 + lat * lat / 16000.0);
  return w;
}
`;

const FOG = /* glsl */ `
uniform vec3 uFogColor;
uniform float uFogDen;
float fogAt(vec3 w) {
  float d = length(w - uCam) * uFogDen;
  return 1.0 - exp(-d * d);
}
`;

const OUT = /* glsl */ `
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
`;

interface CloudSpec {
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  cell: number;
  a: number;
}

export interface WorldOpts {
  kind: Plane3DKind;
  livery: string;
  /** Fewer clouds on a small or software-drawn screen. */
  low: boolean;
}

/** Plane proportions (three-kit/plane SPECS), in plane lengths. */
const BODY: Record<Plane3DKind, { L: number; r: number; ride: number; span: number }> = {
  airliner: { L: 38, r: 0.052, ride: 0.13, span: 0.92 },
  bizjet: { L: 24, r: 0.06, ride: 0.09, span: 0.8 },
};

export class SkyWorld {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(70, 1, 2, 140_000);
  /** 0 clear … 1 inside a cloud. */
  mist = 0;
  part: DayLight = 'day';
  cloudCount = 0;

  private sky: SkyUniforms = skyUniforms();
  private dome = skyDome(this.sky, 1000);
  private sun = new THREE.DirectionalLight('#ffffff', 2);
  private hemi = new THREE.HemisphereLight('#ffffff', '#666666', 1);
  private fog = new THREE.FogExp2('#c6dbea', 1 / 9000);
  private shared = {
    uCam: { value: new THREE.Vector3() },
    uFwd: { value: new THREE.Vector2(1, 0) },
    uFogColor: { value: new THREE.Color() },
    uFogDen: { value: 1 / 9000 },
  };
  private noise = noiseTexture('flight');
  private glow = glowTexture();
  private ground: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private deck: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private clouds: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
  private cloudList: CloudSpec[] = [];
  private cloudBuf: { pos: Float32Array; size: Float32Array; meta: Float32Array };
  private cloudU: Record<string, THREE.IUniform>;
  private buildings: THREE.InstancedMesh;
  private runwayLights: THREE.Points;
  private sunHalo: THREE.Sprite;
  private moon: THREE.Sprite;
  private airport = new THREE.Group();
  private plane: Plane3D;
  private body: (typeof BODY)[Plane3DKind];
  private nav: {
    mesh: THREE.Sprite;
    at: THREE.Vector3;
    kind: 'red' | 'green' | 'strobe' | 'beacon';
  }[] = [];
  private placeKey = '';
  private layerKey = '';
  /** The heading at cruise that puts the sun (or the moon) beside the plane in the wide shot. */
  private cruiseHeading = 0;
  private lightDir = new THREE.Vector3(0, 1, 0);
  private night = 0;
  private low: boolean;

  constructor(o: WorldOpts) {
    this.low = o.low;
    this.body = BODY[o.kind];
    const s = this.scene;
    s.fog = this.fog;
    this.dome.renderOrder = -100;
    s.add(this.dome, this.sun, this.sun.target, this.hemi);

    // The ground: one big plane, bent by the curve, painted per airport.
    const gu = {
      ...this.shared,
      uMap: { value: null as THREE.Texture | null },
      uNoise: { value: this.noise },
      uLight: { value: new THREE.Color(1, 1, 1) },
      uSpan: { value: GROUND_SPAN },
    };
    this.ground = new THREE.Mesh(
      new THREE.PlaneGeometry(110_000, 110_000, 150, 150).rotateX(-Math.PI / 2),
      new THREE.ShaderMaterial({
        uniforms: gu,
        vertexShader: /* glsl */ `
          ${CURVE}
          varying vec3 vW;
          void main() {
            vec4 w = modelMatrix * vec4(position, 1.0);
            vW = w.xyz;
            w.xyz = curve(w.xyz);
            gl_Position = projectionMatrix * viewMatrix * w;
          }`,
        fragmentShader: /* glsl */ `
          uniform vec3 uCam;
          ${FOG}
          uniform sampler2D uMap;
          uniform sampler2D uNoise;
          uniform vec3 uLight;
          uniform float uSpan;
          varying vec3 vW;
          void main() {
            vec2 uv = vec2(0.5 + vW.x / uSpan, 0.5 - vW.z / uSpan);
            vec3 c = texture2D(uMap, clamp(uv, 0.001, 0.999)).rgb;
            float n = texture2D(uNoise, vW.xz / 1700.0).r;
            float n2 = texture2D(uNoise, vW.xz / 260.0).r;
            c *= (0.8 + 0.3 * n) * (0.92 + 0.16 * n2);
            c *= uLight;
            c = mix(c, uFogColor, fogAt(vW));
            gl_FragColor = vec4(c, 1.0);
            ${OUT}
          }`,
      }),
    );
    this.ground.frustumCulled = false;
    s.add(this.ground);

    // The cloud deck under the cruise.
    this.deck = new THREE.Mesh(
      new THREE.PlaneGeometry(110_000, 110_000, 120, 120).rotateX(-Math.PI / 2),
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: {
          ...this.shared,
          uNoise: { value: this.noise },
          uLit: { value: new THREE.Color() },
          uShadow: { value: new THREE.Color() },
          uCover: { value: 0.42 },
          uDrift: { value: new THREE.Vector2() },
        },
        vertexShader: /* glsl */ `
          ${CURVE}
          varying vec3 vW;
          void main() {
            vec4 w = modelMatrix * vec4(position, 1.0);
            vW = w.xyz;
            w.xyz = curve(w.xyz);
            gl_Position = projectionMatrix * viewMatrix * w;
          }`,
        fragmentShader: /* glsl */ `
          uniform vec3 uCam;
          ${FOG}
          uniform sampler2D uNoise;
          uniform vec3 uLit;
          uniform vec3 uShadow;
          uniform float uCover;
          uniform vec2 uDrift;
          varying vec3 vW;
          void main() {
            vec2 p = vW.xz;
            float d = texture2D(uNoise, p / 6400.0 + uDrift).r * 0.58
              + texture2D(uNoise, p / 1500.0 - uDrift * 1.7).r * 0.3
              + texture2D(uNoise, p / 380.0).r * 0.12;
            float a = smoothstep(uCover, uCover + 0.1, d);
            float th = smoothstep(uCover, uCover + 0.32, d);
            vec3 c = mix(uShadow, uLit, 0.3 + 0.7 * th);
            float f = fogAt(vW);
            c = mix(c, uFogColor, f * 0.9);
            gl_FragColor = vec4(c, mix(a, 1.0, f));
            ${OUT}
          }`,
      }),
    );
    this.deck.renderOrder = 1;
    this.deck.frustumCulled = false;
    this.deck.visible = false;
    s.add(this.deck);

    // Cloud billboards: one instanced quad.
    const max = 260;
    this.cloudBuf = {
      pos: new Float32Array(max * 3),
      size: new Float32Array(max * 2),
      meta: new Float32Array(max * 2),
    };
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute(
      'position',
      new THREE.BufferAttribute(
        new Float32Array([-0.5, -0.3, 0, 0.5, -0.3, 0, 0.5, 0.7, 0, -0.5, 0.7, 0]),
        3,
      ),
    );
    g.setIndex([0, 1, 2, 0, 2, 3]);
    g.setAttribute('aPos', new THREE.InstancedBufferAttribute(this.cloudBuf.pos, 3));
    g.setAttribute('aSize', new THREE.InstancedBufferAttribute(this.cloudBuf.size, 2));
    g.setAttribute('aMeta', new THREE.InstancedBufferAttribute(this.cloudBuf.meta, 2));
    for (const k of ['aPos', 'aSize', 'aMeta'])
      (g.getAttribute(k) as THREE.InstancedBufferAttribute).setUsage(THREE.DynamicDrawUsage);
    g.instanceCount = 0;
    this.cloudU = {
      ...this.shared,
      uAtlas: { value: cloudAtlas('flight') },
      uLit: { value: new THREE.Color() },
      uShadow: { value: new THREE.Color() },
    };
    this.clouds = new THREE.Mesh(
      g,
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: this.cloudU,
        vertexShader: /* glsl */ `
          ${CURVE}
          ${FOG}
          attribute vec3 aPos;
          attribute vec2 aSize;
          attribute vec2 aMeta;
          varying vec2 vUv;
          varying float vA;
          varying float vFog;
          void main() {
            vec3 c = curve(aPos);
            vec3 toCam = normalize(cameraPosition - c);
            vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), toCam));
            vec3 up = cross(toCam, right);
            vec3 w = c + right * position.x * aSize.x + up * position.y * aSize.y;
            float cell = aMeta.x;
            vec2 o = vec2(mod(cell, 2.0), floor(cell / 2.0));
            vec2 q = vec2(position.x + 0.5, position.y + 0.3);
            vUv = vec2((o.x + q.x) * 0.5, 1.0 - (o.y + 1.0 - q.y) * 0.5);
            float d = length(cameraPosition - c);
            // Fade out as the camera flies into it, rather than slicing through.
            vA = aMeta.y * smoothstep(aSize.x * 0.1, aSize.x * 0.5, d);
            vFog = fogAt(c);
            gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
          }`,
        fragmentShader: /* glsl */ `
          uniform sampler2D uAtlas;
          uniform vec3 uLit;
          uniform vec3 uShadow;
          uniform vec3 uFogColor;
          varying vec2 vUv;
          varying float vA;
          varying float vFog;
          void main() {
            vec4 t = texture2D(uAtlas, vUv);
            vec3 c = mix(uShadow, uLit, t.r);
            c = mix(c, uFogColor, vFog);
            float a = t.a * vA * (1.0 - vFog * 0.5);
            if (a < 0.004) discard;
            gl_FragColor = vec4(c, a);
            ${OUT}
          }`,
      }),
    );
    this.clouds.renderOrder = 2;
    this.clouds.frustumCulled = false;
    s.add(this.clouds);

    // The sun's halo and the moon.
    this.sunHalo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.glow,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
        transparent: true,
      }),
    );
    this.moon = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: moonTexture(),
        depthWrite: false,
        fog: false,
        transparent: true,
      }),
    );
    s.add(this.sunHalo, this.moon);

    // The airport: runway, its lights, the terminal and tower, the city's buildings.
    const rw = new THREE.Mesh(
      new THREE.PlaneGeometry(46, 3300).rotateX(-Math.PI / 2).rotateY(Math.PI / 2),
      new THREE.MeshLambertMaterial({
        map: runwayTexture(),
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      }),
    );
    rw.position.y = 0.2;
    const taxi = new THREE.Mesh(
      new THREE.PlaneGeometry(1500, 24).rotateX(-Math.PI / 2),
      new THREE.MeshLambertMaterial({
        color: '#5b616a',
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      }),
    );
    taxi.position.set(250, 0.15, 150);
    const term = new THREE.Mesh(
      new THREE.BoxGeometry(440, 18, 70),
      new THREE.MeshLambertMaterial({ color: '#d7dde4' }),
    );
    term.position.set(250, 9, 300);
    const glass = new THREE.Mesh(
      new THREE.BoxGeometry(442, 6, 72),
      new THREE.MeshLambertMaterial({ color: '#8fb3d1' }),
    );
    glass.position.set(250, 10, 300);
    const tower = new THREE.Mesh(
      new THREE.CylinderGeometry(4, 6, 56, 10).translate(0, 28, 0),
      new THREE.MeshLambertMaterial({ color: '#cbd2da' }),
    );
    tower.position.set(-260, 0, 330);
    const cab = new THREE.Mesh(
      new THREE.CylinderGeometry(11, 8, 9, 10),
      new THREE.MeshLambertMaterial({ color: '#334155' }),
    );
    cab.position.set(-260, 60, 330);
    this.airport.add(rw, taxi, term, glass, tower, cab);
    // Edge and approach lights.
    const lp: number[] = [];
    for (let x = -1640; x <= 1640; x += 60) lp.push(x, 1, -24, x, 1, 24);
    for (let k = 1; k <= 12; k++) for (const z of [-6, 0, 6]) lp.push(1650 + k * 60, 2, z);
    for (let k = 1; k <= 12; k++) for (const z of [-6, 0, 6]) lp.push(-1650 - k * 60, 2, z);
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
    this.runwayLights = new THREE.Points(
      lg,
      new THREE.PointsMaterial({
        map: this.glow,
        color: '#ffe8a8',
        size: 4,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.airport.add(this.runwayLights);
    this.buildings = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0),
      new THREE.MeshLambertMaterial({
        map: facadeTexture(false),
        emissiveMap: facadeTexture(true),
        emissive: '#ffffff',
        emissiveIntensity: 0,
      }),
      this.low ? 420 : 760,
    );
    this.buildings.frustumCulled = false;
    this.airport.add(this.buildings);
    s.add(this.airport);

    // The plane.
    this.plane = makePlane3D({ kind: o.kind, livery: o.livery, length: this.body.L });
    s.add(this.plane.root);
    const b = this.body;
    const tipX = o.kind === 'bizjet' ? -0.12 : -0.13;
    const tipY = b.ride - 0.03;
    const mk = (kind: 'red' | 'green' | 'strobe' | 'beacon', x: number, y: number, z: number) => {
      const color =
        kind === 'red' || kind === 'beacon' ? '#ff3b30' : kind === 'green' ? '#34d399' : '#ffffff';
      const m = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: this.glow,
          color,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          transparent: true,
          fog: false,
        }),
      );
      this.plane.root.add(m);
      this.nav.push({ mesh: m, at: new THREE.Vector3(x, y, z), kind });
      m.position.set(x, y, z);
    };
    mk('red', tipX, tipY, -b.span / 2);
    mk('green', tipX, tipY, b.span / 2);
    mk('strobe', tipX - 0.01, tipY, -b.span / 2);
    mk('strobe', tipX - 0.01, tipY, b.span / 2);
    mk('beacon', 0, b.ride + b.r * 1.02, 0);
    mk('beacon', 0.05, b.ride - b.r * 1.02, 0);
  }

  /** The airport and city on the ground, and the sky over them at a moment. */
  setPlace(over: Over, sunOver: Over = over) {
    const { state, part } = skyOver(sunOver.lat, sunOver.lon, sunOver.at);
    this.part = part;
    this.night = state.night;
    applySky(state, this.sky, this.sun, this.hemi, this.fog);
    this.lightDir.copy(state.sunDir);
    // At night the moon lights the scene, low enough to see.
    if (state.night > 0.5) {
      this.sun.color.set('#9fb3dc');
      this.sun.intensity = 0.55;
      this.hemi.intensity = 0.55;
    }
    this.shared.uFogColor.value.copy(state.horizon);
    const lit = new THREE.Color('#ffffff').lerp(state.sunColor, 0.45);
    const shadow = state.horizon.clone().lerp(state.zenith, 0.45).multiplyScalar(0.78);
    if (state.night > 0.5) {
      lit.set('#6f7fa3');
      shadow.set('#1a2236');
    } else {
      lit.multiplyScalar(1.12);
      shadow.lerp(new THREE.Color('#9aa6b8'), 0.35);
    }
    for (const u of [this.cloudU, this.deck.material.uniforms]) {
      (u.uLit!.value as THREE.Color).copy(lit);
      (u.uShadow!.value as THREE.Color).copy(shadow);
    }
    const gl = this.ground.material.uniforms.uLight!.value as THREE.Color;
    if (state.night > 0.5) gl.setRGB(1, 1, 1);
    else
      gl.copy(state.sunColor)
        .lerp(new THREE.Color(1, 1, 1), 0.6)
        .multiplyScalar(0.75 + 0.35 * (1 - state.night));
    const night = state.night > 0.5;
    (this.runwayLights.material as THREE.PointsMaterial).opacity = night
      ? 1
      : state.night > 0.1
        ? 0.7
        : 0.35;
    (this.buildings.material as THREE.MeshLambertMaterial).emissiveIntensity = night ? 1.1 : 0;
    this.nav.forEach((n) =>
      n.mesh.scale.setScalar((night ? 0.07 : 0.035) * (n.kind === 'strobe' ? 1.4 : 1)),
    );
    // Rebuild the ground only when the place (or day and night) changes.
    const key = `${over.marketId}:${night}`;
    if (key !== this.placeKey) {
      this.placeKey = key;
      const fl = flavourOf(over.marketId);
      const map = this.ground.material.uniforms.uMap!;
      (map.value as THREE.Texture | null)?.dispose();
      map.value = groundTexture(over.marketId, fl, night);
      this.placeBuildings(over.marketId, night);
    }
  }

  private placeBuildings(marketId: string, night: boolean) {
    const fl = flavourOf(marketId);
    const rnd = seeded(fnv(`${marketId}:towers`));
    const m = new THREE.Matrix4();
    const c = new THREE.Color();
    const n = this.buildings.count;
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2;
      const d = Math.pow(rnd(), 0.8) * CITY_AT.r * 0.85;
      const x = CITY_AT.x + Math.cos(a) * d;
      const z = CITY_AT.z + Math.sin(a) * d * 0.8;
      const core = 1 - d / (CITY_AT.r * 0.85);
      const h =
        8 + rnd() * 26 + (core > 0.75 && rnd() < 0.35 ? 60 + rnd() * 120 : core * rnd() * 40);
      const w = 18 + rnd() * 34;
      m.makeRotationY(rnd() * 0.3);
      m.scale(new THREE.Vector3(w, h, w * (0.6 + rnd() * 0.8)));
      m.setPosition(x, 0, z);
      this.buildings.setMatrixAt(i, m);
      c.set(night ? '#2a3140' : fl.walls[Math.floor(rnd() * fl.walls.length)]!);
      this.buildings.setColorAt(i, c);
    }
    this.buildings.instanceMatrix.needsUpdate = true;
    if (this.buildings.instanceColor) this.buildings.instanceColor.needsUpdate = true;
  }

  /** The clouds for a shot: scattered cumulus round the airport, or the deck at cruise. */
  setLayer(layer: 'climb' | 'cruise' | 'approach', seed: string) {
    const key = `${layer}:${seed}`;
    if (key === this.layerKey) return;
    this.layerKey = key;
    const rnd = seeded(fnv(key));
    const out: CloudSpec[] = [];
    const add = (x: number, y: number, z: number, w: number, a = 0.95) =>
      out.push({ x, y, z, w, h: w * (0.55 + rnd() * 0.25), cell: Math.floor(rnd() * 4), a });
    const scale = this.low ? 0.6 : 1;
    if (layer === 'cruise') {
      // Heaped tops on the deck, towers far off, and a few high wisps.
      for (let i = 0; i < 120 * scale; i++) {
        const a = rnd() * Math.PI * 2;
        const d = 600 + Math.pow(rnd(), 0.7) * 20_000;
        add(Math.cos(a) * d, 880 + rnd() * 160, Math.sin(a) * d, 500 + rnd() * 1200);
      }
      for (let i = 0; i < 14 * scale; i++) {
        const a = rnd() * Math.PI * 2;
        const d = 9000 + rnd() * 16_000;
        add(Math.cos(a) * d, 900, Math.sin(a) * d, 2600 + rnd() * 2600);
      }
      for (let i = 0; i < 22 * scale; i++) {
        const a = rnd() * Math.PI * 2;
        const d = 1500 + rnd() * 12_000;
        add(Math.cos(a) * d, 2600 + rnd() * 900, Math.sin(a) * d, 900 + rnd() * 1400, 0.35);
      }
    } else {
      const climb = layer === 'climb';
      // Along the climb-out (+x) or the approach (from +x): the plane flies through them.
      for (let i = 0; i < 90 * scale; i++) {
        const x = climb ? 700 + rnd() * 9000 : 1600 + rnd() * 9000;
        const z = (rnd() - 0.4) * 5000;
        const y = climb ? 430 + rnd() * 330 : 250 + rnd() * 200;
        add(x, y, z, 160 + rnd() * 420);
      }
      // A few right on the path, to fly through.
      for (let i = 0; i < 5; i++) {
        const x = climb ? 1500 + i * 450 : 2900 + i * 380;
        add(x, climb ? 470 + i * 25 : 300, (rnd() - 0.5) * 60, 220 + rnd() * 120, 0.9);
      }
      // The far band of cloud on the horizon, all round.
      for (let i = 0; i < 60 * scale; i++) {
        const a = rnd() * Math.PI * 2;
        const d = 7000 + rnd() * 14_000;
        add(Math.cos(a) * d, climb ? 600 : 360, Math.sin(a) * d, 900 + rnd() * 1800);
      }
    }
    this.cloudList = out.slice(0, this.cloudBuf.meta.length / 2);
    this.cloudCount = this.cloudList.length;
    this.deck.visible = layer === 'cruise';
    this.deck.position.y = 830;
  }

  /** Where the plane is and where the camera looks, for a shot at k (0–1) and t seconds in. */
  /** Where the plane is on screen (tests: the whole plane in the picture), or null. */
  planeOnScreen() {
    return screenBoxOf(this.plane.root, this.camera);
  }

  pose(shot: WorldShot, k: number, t: number, aspect: number) {
    const cam = this.camera;
    const P = this.plane.root;
    const L = this.body.L;
    const b = this.body;
    // A portrait phone: the field of view widens so the sky still fills it.
    const hfov = shot === 'sky' ? 58 : 52;
    const vf = (2 * Math.atan(Math.tan((hfov / 2) * DEG) / aspect)) / DEG;
    cam.fov = clamp(vf, 50, 84);
    cam.aspect = aspect;
    cam.near = 2;
    cam.up.set(0, 1, 0);
    // Clearer air up high: the deck and the horizon far off.
    const den = shot === 'sky' ? 1 / 19_000 : 1 / 11_000;
    this.shared.uFogDen.value = den;
    this.fog.density = den;
    let gear = 1;
    const look = new THREE.Vector3();
    if (shot === 'takeoff') {
      // The roll, rotate, lift-off, gear up, climb-out; the city drops away.
      const x = -900 + 600 * k + 1900 * k * k;
      const lift = seg(k, 0.36, 1);
      const y = 560 * Math.pow(lift, 1.5);
      const pitch = 10 * ease(seg(k, 0.3, 0.42)) * DEG;
      gear = 1 - ease(seg(k, 0.55, 0.7));
      P.position.set(x, y, 0);
      P.rotation.set(Math.sin(t * 1.3) * 0.6 * DEG * lift, 0, pitch, 'YZX');
      const e = ease(k);
      cam.position.set(x + lerp(-38, -105, e), y + lerp(6, 46, e), lerp(-27, -78, e));
      look.set(x + lerp(14, 34, e), y + lerp(3, -6, e), lerp(0, 8, e));
    } else if (shot === 'sky') {
      // Cruise: from the window seat over the wing, then out to the whole plane banking.
      const head = this.cruiseHeading;
      const roll = (5 + 5 * Math.sin(t * 0.55)) * DEG;
      P.position.set(Math.cos(head) * t * 230, 1550, -Math.sin(head) * t * 230);
      P.rotation.set(roll, head, 1.5 * DEG, 'YZX');
      gear = 0;
      P.updateMatrixWorld(true);
      // A: just outside your window, looking out and back along the wing.
      const aPos = P.localToWorld(new THREE.Vector3(0.06, b.ride + b.r * 0.55, -(b.r + 0.004)));
      const aLook = P.localToWorld(new THREE.Vector3(-0.42, b.ride - 0.05, -1.7));
      const aUp = new THREE.Vector3(0, 1, 0).applyQuaternion(P.quaternion);
      // B: out beside and behind the plane, the horizon level.
      const H = (x: number, y: number, z: number) =>
        new THREE.Vector3(x, y, z)
          .applyAxisAngle(new THREE.Vector3(0, 1, 0), head)
          .multiplyScalar(L)
          .add(P.position);
      const drift = k * 0.25;
      const bPos = H(-1.55 + drift, 0.32, -1.45);
      const bLook = H(0.3, -0.04, 0);
      const m = ease(seg(k, 0.42, 0.72));
      cam.near = m < 0.5 ? 0.3 : 2;
      cam.position.lerpVectors(aPos, bPos, m);
      // Ease the curved path out a little, so it clears the wing.
      cam.position.y += Math.sin(m * Math.PI) * L * 0.25;
      const qa = lookQuat(aPos, aLook, aUp);
      const qb = lookQuat(bPos, bLook, new THREE.Vector3(0, 1, 0));
      cam.quaternion.copy(qa).slerp(qb, m);
      this.finishPose(gear, t);
      // Over the wing, the belly beacon is right under the window: off.
      if (m < 0.5) this.nav[5]!.mesh.visible = false;
      return;
    } else {
      // The approach from +x, down through the cloud, the flare, mains first, the nose.
      const touch = 0.74;
      const q = Math.min(1, k / touch);
      const x = k < touch ? lerp(4300, 1150, q) : 1150 - 520 * (1 - (1 - seg(k, touch, 1)) ** 2);
      const y = k < touch ? 430 * Math.pow(1 - q, 1.25) : 0;
      const pitch =
        (k < 0.6
          ? 2.5
          : k < touch
            ? lerp(2.5, 6.5, ease(seg(k, 0.6, touch)))
            : lerp(6.5, 0, ease(seg(k, touch, 0.86)))) * DEG;
      const kk = shot === 'arrived' ? 1 : k;
      const px = shot === 'arrived' ? 630 : x;
      const py = shot === 'arrived' ? 0 : y;
      P.position.set(px, py, 0);
      P.rotation.set(
        shot === 'arrived' ? 0 : Math.sin(t * 0.9) * 1.2 * DEG * (1 - kk),
        Math.PI,
        shot === 'arrived' ? 0 : pitch,
        'YZX',
      );
      // Follow ahead of the plane, then hand over to a spot beside the runway.
      const follow = new THREE.Vector3(px - 70, py + 8, -46);
      const spot = new THREE.Vector3(880, 7, -120);
      const m = shot === 'arrived' ? 1 : ease(seg(k, 0.32, 0.72));
      cam.position.lerpVectors(follow, spot, m);
      if (shot === 'arrived') cam.position.set(470, 6, -78);
      look.set(px + lerp(10, -6, m), py + 3, 0);
    }
    cam.lookAt(look);
    this.finishPose(gear, t);
  }

  private finishPose(gear: number, t: number) {
    this.plane.setGear(gear);
    // Navigation lights: steady red and green, white strobes, the red beacon blinking.
    for (const n of this.nav) {
      const on = n.kind === 'strobe' ? t % 1.1 < 0.07 : n.kind === 'beacon' ? t % 1.3 < 0.18 : true;
      n.mesh.visible = on;
    }
    const cam = this.camera;
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld(true);
  }

  /** Point the cruise so the sun (or the moon) sits beside the plane in the wide shot. */
  aimCruise() {
    const want = Math.atan2(-this.moonDir().z, this.moonDir().x);
    // The wide shot looks along (1.85, 1.45) in the plane's heading frame.
    const a0 = Math.atan2(-1.45, 1.85);
    this.cruiseHeading = want - a0 - 0.32;
  }

  /** The bright thing in the sky: the sun by day, a low moon at night. */
  private moonDir(): THREE.Vector3 {
    if (this.night < 0.5) return this.lightDir.clone();
    return new THREE.Vector3(Math.cos(0.6), Math.sin(18 * DEG), -Math.sin(0.6)).normalize();
  }

  /** Per frame, before drawing: the curve follows the camera, clouds sorted, the mist. */
  update(t: number) {
    const cam = this.camera;
    this.dome.position.copy(cam.position);
    this.sky.uTime.value = t;
    this.shared.uCam.value.copy(cam.position);
    const f = new THREE.Vector3();
    cam.getWorldDirection(f);
    const h = new THREE.Vector2(f.x, f.z);
    if (h.lengthSq() > 1e-6) this.shared.uFwd.value.copy(h.normalize());
    const drift = this.deck.material.uniforms.uDrift!.value as THREE.Vector2;
    drift.set(t * 0.002, t * 0.0012);
    // The sun's halo, or the moon (its light comes from the same place).
    const md = this.moonDir();
    const day = this.night < 0.5;
    this.sunHalo.visible = day && md.y > -0.05;
    this.moon.visible = !day;
    if (!day) this.sky.uSunDir.value.copy(md);
    this.sunHalo.position.copy(cam.position).addScaledVector(md, 60_000);
    this.sunHalo.scale.setScalar(this.night > 0.1 ? 9000 : 5200);
    (this.sunHalo.material as THREE.SpriteMaterial).color
      .copy(this.sky.uSunColor.value as THREE.Color)
      .multiplyScalar(0.38);
    this.moon.position.copy(cam.position).addScaledVector(md, 60_000);
    this.moon.scale.setScalar(2600);
    if (!day) {
      this.sun.position.copy(md).multiplyScalar(1000);
      this.sun.target.position.set(0, 0, 0);
    } else {
      this.sun.position.copy(this.lightDir).multiplyScalar(1000);
    }
    // The clouds, far to near, and how far into one the camera is.
    const cp = cam.position;
    const list = this.cloudList
      .map((c) => ({ c, d: (c.x - cp.x) ** 2 + (c.y - cp.y) ** 2 + (c.z - cp.z) ** 2 }))
      .sort((a, b) => b.d - a.d);
    const B = this.cloudBuf;
    let mist = 0;
    list.forEach(({ c, d }, i) => {
      B.pos[i * 3] = c.x;
      B.pos[i * 3 + 1] = c.y;
      B.pos[i * 3 + 2] = c.z;
      B.size[i * 2] = c.w;
      B.size[i * 2 + 1] = c.h;
      B.meta[i * 2] = c.cell;
      B.meta[i * 2 + 1] = c.a;
      const r = c.w * 0.32;
      const dy = Math.abs(cp.y - (c.y + c.h * 0.15));
      if (dy < c.h * 0.32) mist = Math.max(mist, (1 - Math.sqrt(d) / r) * c.a);
    });
    this.mist = clamp(mist * 1.6);
    const g = this.clouds.geometry;
    g.instanceCount = list.length;
    for (const k of ['aPos', 'aSize', 'aMeta']) g.getAttribute(k).needsUpdate = true;
  }

  /** Brightness the renderer should use. */
  exposure() {
    return 1.0 + this.night * 0.25;
  }

  dispose() {
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
      for (const x of mats) {
        for (const v of Object.values(x as unknown as Record<string, unknown>))
          if (v instanceof THREE.Texture) v.dispose();
        const u = (x as THREE.ShaderMaterial).uniforms;
        if (u)
          for (const v of Object.values(u)) if (v.value instanceof THREE.Texture) v.value.dispose();
        x.dispose();
      }
    });
  }
}

function lookQuat(from: THREE.Vector3, to: THREE.Vector3, up: THREE.Vector3) {
  const m = new THREE.Matrix4().lookAt(from, to, up);
  return new THREE.Quaternion().setFromRotationMatrix(m);
}

/** City facades: pale walls with rows of dark windows by day, lit windows at night. */
function facadeTexture(lit: boolean): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 32;
  c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = lit ? '#000000' : '#f1f1f1';
  g.fillRect(0, 0, 32, 64);
  const rnd = seeded(fnv(`facade:${lit}`));
  for (let y = 2; y < 62; y += 4)
    for (let x = 2; x < 30; x += 4) {
      if (lit) {
        if (rnd() < 0.45) continue;
        g.fillStyle = rnd() < 0.6 ? '#ffd27a' : '#fff1c2';
      } else g.fillStyle = '#8a97a6';
      g.fillRect(x, y, 2, 2);
    }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  return t;
}

/** The moon: a pale disc, a little shaded, in a soft halo. */
function moonTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const halo = g.createRadialGradient(64, 64, 10, 64, 64, 64);
  halo.addColorStop(0, 'rgba(220,230,255,0.5)');
  halo.addColorStop(1, 'rgba(220,230,255,0)');
  g.fillStyle = halo;
  g.fillRect(0, 0, 128, 128);
  const disc = g.createRadialGradient(58, 58, 2, 64, 64, 16);
  disc.addColorStop(0, '#fdfcf5');
  disc.addColorStop(1, '#d9dce6');
  g.fillStyle = disc;
  g.beginPath();
  g.arc(64, 64, 15, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = 'rgba(150,160,180,0.35)';
  g.beginPath();
  g.arc(59, 60, 4, 0, Math.PI * 2);
  g.arc(70, 69, 3, 0, Math.PI * 2);
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

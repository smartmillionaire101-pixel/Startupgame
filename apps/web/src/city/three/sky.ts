/**
 * Wave 9 §B: sun, sky and haze from the city's clock. The sun rises in the
 * east, crosses the sky to the south (north, south of the equator) and sets
 * in the west; dawn and dusk turn the light gold, night turns it blue and
 * lights the windows. A gradient sky dome, a hemisphere light and an
 * environment map made from the same sky (glass reflects it).
 */
import * as THREE from 'three';
import { SKY_FN, type SkyUniforms } from './ground';
import { nightExposure, nightFactor } from './night';

export interface SkyState {
  /** The key light's direction: the sun (never quite below the horizon), or the moon. */
  sunDir: THREE.Vector3;
  /** Where the sun really is, for the sky dome and the water. */
  skyDir: THREE.Vector3;
  sunColor: THREE.Color;
  sunIntensity: number;
  hemiSky: THREE.Color;
  hemiGround: THREE.Color;
  hemiIntensity: number;
  zenith: THREE.Color;
  horizon: THREE.Color;
  /** Golden hour: the sky's glow low down towards the sun, the pink band above it. */
  glow: THREE.Color;
  band: THREE.Color;
  /** 0 … 1: how strongly the sky burns towards the sun (golden hour into civil dusk). */
  gold: number;
  /** 0 day … 1 night. */
  night: number;
  exposure: number;
}

const C = (h: string) => new THREE.Color(h);
const mixC = (a: THREE.Color, b: THREE.Color, t: number) => a.clone().lerp(b, t);
/** Smoothstep from a to b (b may be below a: then it falls as x rises). */
const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const DEG = Math.PI / 180;

/** The sky at a local hour (0–24, fractional) and latitude. */
export function skyAt(
  hour: number,
  lat: number,
  haze: number,
  solar?: { altitude: number; azimuth: number },
  /** The haze's own colour on the horizon (CityLook.hazeTint). */
  tint = '#e3e3dc',
  /** The city's glow on the low night sky (NightLook.skyGlow). */
  glow = '#2c2436',
): SkyState {
  // Day arc: sunrise ~6, noon 12.5, sunset ~19.
  const dayT = (hour - 6.2) / 12.6; // 0..1 across the day
  const elev = Math.sin(Math.PI * Math.max(-0.25, Math.min(1.25, dayT)));
  // Kept below ~50°: a lower sun models the buildings and casts the long
  // shadows of the photographs (the noon sun of the tropics would flatten them).
  const el = solar?.altitude ?? Math.asin(Math.max(-0.4, elev) * Math.sin(0.86));
  // Azimuth: east (90°) at dawn, through the equator side at noon, west at dusk.
  const south = lat >= 0 ? 180 : 0;
  const az =
    solar?.azimuth ??
    ((90 + (south === 180 ? 1 : -1) * 180 * Math.max(0, Math.min(1, dayT))) * Math.PI) / 180;
  // Bearing → three's frame: north is −z, east is +x.
  const sunDir = new THREE.Vector3(
    Math.sin(az) * Math.cos(el),
    Math.sin(el),
    -Math.cos(az) * Math.cos(el),
  ).normalize();
  const sunUp = Math.sin(el);
  const alt = el / DEG;
  const day = smooth(-0.08, 0.12, sunUp);
  const golden = day * (1 - smooth(0.08, 0.38, sunUp));
  // Civil twilight: dark once the sun is ~7° down (night.ts), so dusk fades.
  const night = nightFactor(hour, el);
  // Golden hour, by the sun's altitude: it builds from ~14° up (about 40
  // minutes before sunset at mid latitudes), burns hottest with the sun on the
  // horizon and dies away through civil dusk. The mirror at dawn.
  const rise = smooth(14, 2, alt);
  const gold = rise * (1 - smooth(-1.5, -8, alt));
  // The sun's light: warm and strong right down to the horizon (a low sun is
  // the brightest thing in a golden-hour photo), then gone as it sets.
  const lit = smooth(-1.8, 2, alt);
  // While it lights the city: the shade turns blue against the warm walls.
  const goldLight = rise * lit;

  const zenithDay = mixC(C('#3f7fcf'), C('#7aa6d6'), haze * 0.4);
  const horizonDay = mixC(C('#c6dbea'), C(tint), haze * 0.6);
  // A deep, clear blue overhead at golden hour, and a warm (not grey) horizon
  // all round: the haze takes the horizon's colour.
  const zenithGold = C('#2f63c4');
  const horizonGold = C('#8fa4d4');
  // Night is near black overhead (a hint of navy, so the moon and the stars
  // sit in a sky), a deep blue lower down, and the horizon tinged by the
  // city's own glow (sodium orange over Lagos, white over London). Players
  // preferred this to a navy sky lighting the whole city a flat grey-blue: the
  // skyline reads from its lit windows and lamps against the dark.
  const zenithNight = C('#030a19');
  const horizonNight = mixC(C('#0d152c'), C(glow), 0.45 + haze * 0.2);
  // Twilight: a deep blue overhead and a warm afterglow low down, never a
  // grey haze (the haze takes the horizon's colour). Colours mix in linear
  // light, where the pale day sky wins: the afterglow is given a strong share.
  const blue = night * (1 - night) * 4;
  let zenith = mixC(zenithDay, zenithGold, Math.max(golden * 0.6, gold * 0.9));
  let horizon = mixC(horizonDay, horizonGold, Math.max(golden * 0.85, gold * 0.7));
  zenith = mixC(zenith, C('#16285a'), blue * 0.75);
  horizon = mixC(horizon, C('#c8705a'), Math.min(1, blue * 0.9));
  zenith = mixC(zenith, zenithNight, smooth(0.35, 1, night));
  horizon = mixC(horizon, horizonNight, smooth(0.3, 1, night));
  // Towards the sun: amber with the sun a hand above the horizon, a deep
  // orange-red as it touches it, crimson in the afterglow; a rose-magenta band
  // above, turning violet as the light goes.
  const glowC = mixC(
    mixC(C('#ffb040'), C('#ff6410'), smooth(9, 0, alt)),
    C('#c42c1c'),
    smooth(-0.5, -6, alt),
  ).multiplyScalar(0.95 - 0.3 * smooth(0, -6, alt));
  const bandC = mixC(C('#f06a7e'), C('#8a3c8c'), smooth(-0.5, -6, alt));

  // A low sun is orange: sunrise and sunset light the walls gold, then a deep
  // orange as it reaches the horizon.
  const sunColor = mixC(
    mixC(C('#fff3e0'), C('#ffbe66'), Math.min(1, golden * 1.5)),
    C('#ff8a30'),
    smooth(7, 0, alt),
  );
  // Moonlight: faint and blue, from high up: enough to pick out the edges of
  // the buildings, not to light them. The sun has faded out by the time the
  // moon takes over (night 0.5, the sun 2° down), and the moon fades in, so
  // the light never jumps.
  const moon = C('#8fa8d8');
  const isMoon = night > 0.5;
  // The key light never comes from below the ground (it would light the walls
  // through the city), nor quite as low as the sun: from ~7.5° up a low sun
  // still gilds the roofs and the streets, and the shadows stay over seven
  // times as long as the buildings are tall.
  const keyDir =
    sunDir.y < 0.13 ? new THREE.Vector3(sunDir.x, 0.13, sunDir.z).normalize() : sunDir.clone();
  const lightDir = isMoon ? new THREE.Vector3(-0.3, 0.8, 0.4).normalize() : keyDir;
  // The sky's own light turns blue as soon as the sun is down and dims through
  // twilight: a dusk city is in blue shade, not lit a flat grey.
  const twi = smooth(0, 0.3, night);
  const dark = smooth(0.25, 0.85, night);
  return {
    sunDir: lightDir,
    skyDir: sunDir,
    sunColor: isMoon ? moon : sunColor,
    sunIntensity: isMoon
      ? 0.3 * smooth(0.5, 0.9, night)
      : 3.4 * (1 + 0.45 * rise) * lit + 0.2 * smooth(0.5, 0, night),
    hemiSky: mixC(
      mixC(mixC(C('#b9d3ee'), C('#7fb2e6'), goldLight * 0.5), C('#7088c0'), twi * 0.6),
      C('#1a2850'),
      dark,
    ),
    hemiGround: mixC(
      mixC(C('#8c8476'), C('#a06a40'), goldLight * 0.8),
      C('#0d0c12'),
      smooth(0, 0.6, night),
    ),
    hemiIntensity: 0.75 - 0.18 * goldLight * (1 - twi) - 0.25 * twi - 0.28 * dark,
    zenith,
    horizon,
    glow: glowC,
    band: bandC,
    gold,
    night,
    exposure: nightExposure(night),
  };
}

/**
 * The haze's colour looking along (dx, dz): the sky's horizon that way, so
 * the far city fades into orange towards the sun and into the cooler sky
 * behind you (mirrors the glow in SKY_FN, a little above the horizon).
 */
export function hazeToward(
  s: SkyState,
  dx: number,
  dz: number,
  out: THREE.Color,
  /** A cool haze to lay under the glow (the city map's dusk blue), and how much. */
  cool?: THREE.Color,
  coolK = 0,
) {
  out.copy(s.horizon);
  if (s.gold <= 0.001) return out;
  if (cool && coolK > 0) out.lerp(cool, coolK);
  const l = Math.hypot(dx, dz) || 1;
  const sl = Math.hypot(s.skyDir.x, s.skyDir.z) || 1;
  let side = ((dx * s.skyDir.x + dz * s.skyDir.z) / (l * sl)) * 0.5 + 0.5;
  side *= side;
  const y = 0.04;
  // Over a cool haze only the sun's side warms: the rest stays clean blue.
  const base = cool && coolK > 0 ? 0.15 * (1 - coolK) : 0.15;
  out.lerp(s.glow, s.gold * Math.exp(-y * (12 - 5.5 * side)) * (base + (1 - base) * side));
  return out;
}

export function skyUniforms(): SkyUniforms {
  return {
    uZenith: { value: new THREE.Color() },
    uHorizon: { value: new THREE.Color() },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uSunColor: { value: new THREE.Color() },
    uTime: { value: 0 },
    uNight: { value: 0 },
    uGlow: { value: new THREE.Color() },
    uBand: { value: new THREE.Color() },
    uGold: { value: 0 },
  };
}

/** A sky dome that follows the camera. */
export function skyDome(sky: SkyUniforms, radius: number) {
  const g = new THREE.SphereGeometry(radius, 32, 16);
  const m = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    fog: false,
    uniforms: sky as unknown as Record<string, THREE.IUniform>,
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vDir;
      uniform float uTime;
      ${SKY_FN}
      float sh(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
      void main() {
        vec3 c = skyColor(vDir);
        // Stars at night: a few bright, many faint, fading into the haze low down.
        if (uNight > 0.3 && vDir.y > 0.02) {
          vec3 q = floor(vDir * 420.0);
          float h = sh(q);
          float s = step(0.9975, h) * (0.35 + 0.65 * step(0.9995, h));
          float tw = 0.75 + 0.25 * sin(uTime * 3.0 + h * 900.0);
          c += vec3(0.9, 0.94, 1.0) * s * tw * smoothstep(0.3, 0.8, uNight) * smoothstep(0.02, 0.25, vDir.y) * 1.8;
        }
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        // A touch of dither: the wide sunset gradients would show 8-bit bands.
        gl_FragColor.rgb += (sh(vec3(gl_FragCoord.xy, 1.0)) - 0.5) / 255.0;
      }`,
  });
  const mesh = new THREE.Mesh(g, m);
  mesh.renderOrder = -100;
  mesh.frustumCulled = false;
  return mesh;
}

/** Apply a sky state to the uniforms, lights and fog. */
export function applySky(
  s: SkyState,
  sky: SkyUniforms,
  sun: THREE.DirectionalLight,
  hemi: THREE.HemisphereLight,
  fog: THREE.FogExp2,
) {
  sky.uZenith.value.copy(s.zenith);
  sky.uHorizon.value.copy(s.horizon);
  sky.uSunDir.value.copy(s.skyDir);
  sky.uSunColor.value.copy(s.sunColor);
  sky.uNight.value = s.night;
  sky.uGlow.value.copy(s.glow);
  sky.uBand.value.copy(s.band);
  sky.uGold.value = s.gold;
  sun.color.copy(s.sunColor);
  sun.intensity = s.sunIntensity;
  hemi.color.copy(s.hemiSky);
  hemi.groundColor.copy(s.hemiGround);
  hemi.intensity = s.hemiIntensity;
  fog.color.copy(s.horizon);
}

/** An environment map of the sky, for reflections (rebuilt when the sky changes). */
export function skyEnvironment(renderer: THREE.WebGLRenderer, sky: SkyUniforms) {
  const scene = new THREE.Scene();
  const dome = skyDome(sky, 100);
  (dome.material as THREE.ShaderMaterial).depthTest = true;
  scene.add(dome);
  // A ground below the horizon, so reflections see a city, not the sky.
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(400, 400).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: sky.uHorizon.value.clone().multiplyScalar(0.45) }),
  );
  floor.position.y = -2;
  scene.add(floor);
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(scene, 0.02, 0.1, 500);
  pm.dispose();
  dome.geometry.dispose();
  (dome.material as THREE.Material).dispose();
  floor.geometry.dispose();
  (floor.material as THREE.Material).dispose();
  return rt;
}

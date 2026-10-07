/**
 * Wave 9 §B: sun, sky and haze from the city's clock. The sun rises in the
 * east, crosses the sky to the south (north, south of the equator) and sets
 * in the west; dawn and dusk turn the light gold, night turns it blue and
 * lights the windows. A gradient sky dome, a hemisphere light and an
 * environment map made from the same sky (glass reflects it).
 */
import * as THREE from 'three';
import { SKY_FN, type SkyUniforms } from './ground';

export interface SkyState {
  sunDir: THREE.Vector3;
  sunColor: THREE.Color;
  sunIntensity: number;
  hemiSky: THREE.Color;
  hemiGround: THREE.Color;
  hemiIntensity: number;
  zenith: THREE.Color;
  horizon: THREE.Color;
  /** 0 day … 1 night. */
  night: number;
  exposure: number;
}

const C = (h: string) => new THREE.Color(h);
const mixC = (a: THREE.Color, b: THREE.Color, t: number) => a.clone().lerp(b, t);
const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** The sky at a local hour (0–24, fractional) and latitude. */
export function skyAt(hour: number, lat: number, haze: number): SkyState {
  // Day arc: sunrise ~6, noon 12.5, sunset ~19.
  const dayT = (hour - 6.2) / 12.6; // 0..1 across the day
  const elev = Math.sin(Math.PI * Math.max(-0.25, Math.min(1.25, dayT)));
  const maxElev = (90 - Math.abs(lat - 10)) * (Math.PI / 180);
  const el = Math.asin(Math.max(-0.4, elev) * Math.sin(Math.min(maxElev, 1.35)));
  // Azimuth: east (90°) at dawn, through the equator side at noon, west at dusk.
  const south = lat >= 0 ? 180 : 0;
  const az = ((90 + (south === 180 ? 1 : -1) * 180 * Math.max(0, Math.min(1, dayT))) * Math.PI) / 180;
  // Bearing → three's frame: north is −z, east is +x.
  const sunDir = new THREE.Vector3(
    Math.sin(az) * Math.cos(el),
    Math.sin(el),
    -Math.cos(az) * Math.cos(el),
  ).normalize();
  const sunUp = Math.sin(el);
  const day = smooth(-0.08, 0.12, sunUp);
  const golden = day * (1 - smooth(0.08, 0.38, sunUp));
  const night = 1 - smooth(-0.12, 0.04, sunUp);

  const zenithDay = mixC(C('#3f7fcf'), C('#7aa6d6'), haze * 0.4);
  const horizonDay = mixC(C('#c6dbea'), C('#e3e3dc'), haze * 0.6);
  const zenithGold = C('#5a7bb0');
  const horizonGold = C('#f0b27a');
  const zenithNight = C('#0b1530');
  const horizonNight = C('#25304a');
  let zenith = mixC(zenithDay, zenithGold, golden * 0.6);
  let horizon = mixC(horizonDay, horizonGold, golden * 0.85);
  zenith = mixC(zenith, zenithNight, night);
  horizon = mixC(horizon, horizonNight, night);

  const sunColor = mixC(C('#fff3e0'), C('#ffb066'), golden);
  const moon = C('#9fb6e0');
  const lightDir = night > 0.5 ? new THREE.Vector3(-0.3, 0.8, 0.4).normalize() : sunDir;
  return {
    sunDir: lightDir,
    sunColor: night > 0.5 ? moon : sunColor,
    sunIntensity: night > 0.5 ? 0.25 : 3.2 * day + 0.2,
    hemiSky: mixC(mixC(C('#b9d3ee'), C('#f4c9a0'), golden * 0.5), C('#2a3a63'), night),
    hemiGround: mixC(C('#8c8476'), C('#1a1d26'), night),
    hemiIntensity: 0.55 + 0.75 * (1 - night),
    zenith,
    horizon,
    night,
    exposure: 1.0 + night * 0.25,
  };
}

export function skyUniforms(): SkyUniforms {
  return {
    uZenith: { value: new THREE.Color() },
    uHorizon: { value: new THREE.Color() },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uSunColor: { value: new THREE.Color() },
    uTime: { value: 0 },
    uNight: { value: 0 },
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
      ${SKY_FN}
      float sh(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
      void main() {
        vec3 c = skyColor(vDir);
        // Stars at night.
        if (uNight > 0.5 && vDir.y > 0.05) {
          vec3 q = floor(vDir * 300.0);
          float s = step(0.9985, sh(q));
          c += vec3(s) * (uNight - 0.5) * 1.6;
        }
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
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
  sky.uSunDir.value.copy(s.sunDir);
  sky.uSunColor.value.copy(s.sunColor);
  sky.uNight.value = s.night;
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

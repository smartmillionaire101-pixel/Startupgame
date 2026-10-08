/**
 * Wave 12 §D: daylight for the 3D interiors and the home, from the city's
 * real sun (city/sun.ts `sunFor`). The stage's key light comes in along the
 * sun's real bearing, warm and low around sunrise and sunset, white at
 * noon; after dusk it turns into a cool moonlight and the lamps take over.
 */
import * as THREE from 'three';
import type { SunState } from '../city/sun';
import type { Stage } from './stage';

export interface StageLight {
  sunColor: string;
  sunIntensity: number;
  hemiColor: string;
  hemiIntensity: number;
  ambient: number;
  /** What shows behind the cut-away (the sky through the gap). */
  background: string;
}

const C = (h: string) => new THREE.Color(h);
const mix = (a: string, b: string, t: number) =>
  `#${C(a)
    .lerp(C(b), Math.max(0, Math.min(1, t)))
    .getHexString()}`;
const lerp = (a: number, b: number, t: number) => a + (b - a) * Math.max(0, Math.min(1, t));

/** The light inside, from the sun outside: day, golden hour, twilight, night. */
export function interiorLight(sun: SunState): StageLight {
  const { day, golden, night } = sun;
  // Day → golden hour (warm, lower) → night (moonlight; the lamps do the rest).
  const dayCol = mix('#fff1d6', sun.color, 0.5);
  return {
    sunColor: night > 0.5 ? '#a9bbff' : mix(dayCol, '#ffc58a', golden),
    sunIntensity: night > 0.5 ? 0.6 : lerp(0.9, 1.9, day) - 0.5 * golden,
    hemiColor: night > 0.5 ? '#c9c8e8' : mix('#fff4e0', '#ffe1c2', golden + (1 - day)),
    hemiIntensity: lerp(1.35, 0.95, Math.max(night, 0.6 * golden + 0.6 * (1 - day))),
    ambient: night > 0.5 ? 0.3 : lerp(0.25, 0.2, golden),
    background: mix(mix('#17233f', '#2a2443', golden + (1 - day) * 0.6), '#0b1328', night),
  };
}

/**
 * Aim the stage's sun at `centre` from the real sun's bearing (kept between
 * 14° and 62° up, so it always lights the rooms and casts shadows inside).
 * At night a fixed, high moonlight.
 */
export function aimStageSun(stage: Stage, sun: SunState, centre: THREE.Vector3, dist = 24) {
  let dir: THREE.Vector3;
  if (sun.night > 0.5) dir = new THREE.Vector3(-0.35, 0.85, 0.4).normalize();
  else {
    const el = (Math.max(14, Math.min(62, sun.elevation)) * Math.PI) / 180;
    const az = (sun.azimuth * Math.PI) / 180;
    // x east, z south (north is −z), as the city scene.
    dir = new THREE.Vector3(
      Math.sin(az) * Math.cos(el),
      Math.sin(el),
      -Math.cos(az) * Math.cos(el),
    );
  }
  stage.sun.position.copy(centre).addScaledVector(dir, dist);
  stage.sun.target.position.copy(centre);
  stage.sun.target.updateMatrixWorld();
}

/** Light a stage from the real sun (colours, intensities, background, direction). */
export function applyDaylight(stage: Stage, sun: SunState, centre: THREE.Vector3, dist = 24) {
  const l = interiorLight(sun);
  stage.sun.color.set(l.sunColor);
  stage.sun.intensity = l.sunIntensity;
  stage.hemi.color.set(l.hemiColor);
  stage.hemi.intensity = l.hemiIntensity;
  stage.ambient.intensity = l.ambient;
  stage.scene.background = new THREE.Color(l.background);
  aimStageSun(stage, sun, centre, dist);
  stage.invalidate();
}

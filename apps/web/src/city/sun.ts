/**
 * Wave 12 §D: the real sun, one for the whole game.
 *
 * Each city's sun is computed from its latitude and longitude and the real
 * date and time (the NOAA / SunCalc solar-position formulas: the sun's
 * ecliptic longitude, declination and right ascension, the local sidereal
 * time and the hour angle), so San Francisco, Lagos, London and Dubai each
 * see their own sunrise, noon, sunset and night at their own local time.
 *
 * `sunFor(marketId, now)` is the one entry point: the 3D city, the 2D map,
 * interiors and the home all read their light from it. It gives
 *
 * - the sun's elevation and compass azimuth, and a unit direction in the
 *   3D frame (x east, y up, z south, as the city scene uses);
 * - today's sunrise, sunset, solar noon and twilight times (epoch ms);
 * - the phase (night, dawn/dusk twilight, golden hour, day) and smooth
 *   0–1 factors for daylight, golden light and night;
 * - whether the street lamps and windows are on (they come on at real dusk);
 * - the sun's colour and a relative intensity.
 *
 * Pure functions, no dependency. A dev override (`?sun=` in the URL or
 * localStorage `runway.sun`: sunrise, sunset, noon, night, dusk, dawn or a
 * local hour like 7.5) forces a time of day for tests and screenshots.
 */
import { useEffect, useRef, useState } from 'react';
import { CITY_GEO, localMinutes } from './travel';

const RAD = Math.PI / 180;
const DAY_MS = 86_400_000;
const J1970 = 2440588;
const J2000 = 2451545;
/** Obliquity of the ecliptic. */
const OBLIQUITY = RAD * 23.4397;

const toJulian = (ms: number) => ms / DAY_MS - 0.5 + J1970;
const fromJulian = (j: number) => (j + 0.5 - J1970) * DAY_MS;
const toDays = (ms: number) => toJulian(ms) - J2000;

const declination = (l: number, b: number) =>
  Math.asin(Math.sin(b) * Math.cos(OBLIQUITY) + Math.cos(b) * Math.sin(OBLIQUITY) * Math.sin(l));
const rightAscension = (l: number, b: number) =>
  Math.atan2(Math.sin(l) * Math.cos(OBLIQUITY) - Math.tan(b) * Math.sin(OBLIQUITY), Math.cos(l));
const solarMeanAnomaly = (d: number) => RAD * (357.5291 + 0.98560028 * d);
function eclipticLongitude(M: number) {
  // Equation of centre, plus the perihelion of the Earth.
  const C = RAD * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
  const P = RAD * 102.9372;
  return M + C + P + Math.PI;
}
const siderealTime = (d: number, lw: number) => RAD * (280.16 + 360.9856235 * d) - lw;

/** The sun's position: elevation (altitude) and azimuth from south, westward (radians). */
export function solarPosition(ms: number, lat: number, lon: number) {
  const lw = RAD * -lon;
  const phi = RAD * lat;
  const d = toDays(ms);
  const M = solarMeanAnomaly(d);
  const L = eclipticLongitude(M);
  const dec = declination(L, 0);
  const ra = rightAscension(L, 0);
  const H = siderealTime(d, lw) - ra;
  const altitude = Math.asin(
    Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H),
  );
  const azimuth = Math.atan2(
    Math.sin(H),
    Math.cos(H) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi),
  );
  // Atmospheric refraction lifts the sun near the horizon (Bennett's formula, in degrees).
  const hDeg = altitude / RAD;
  const refr = hDeg > -1 ? 1.02 / Math.tan(RAD * (hDeg + 10.3 / (hDeg + 5.11))) / 60 : 0;
  return { altitude: altitude + RAD * refr, azimuth };
}

// ---------------------------------------------------------------------------
// Sunrise, sunset and twilight

const J0 = 0.0009;
const julianCycle = (d: number, lw: number) => Math.round(d - J0 - lw / (2 * Math.PI));
const approxTransit = (Ht: number, lw: number, n: number) => J0 + (Ht + lw) / (2 * Math.PI) + n;
const solarTransitJ = (ds: number, M: number, L: number) =>
  J2000 + ds + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
const hourAngle = (h: number, phi: number, dec: number) =>
  Math.acos((Math.sin(h) - Math.sin(phi) * Math.sin(dec)) / (Math.cos(phi) * Math.cos(dec)));

export interface SunTimes {
  /** Epoch ms; NaN when the sun never crosses that angle that day (polar day or night). */
  solarNoon: number;
  nadir: number;
  sunrise: number;
  sunset: number;
  /** Civil twilight (the sun 6° below the horizon): lamps are on by then. */
  dawn: number;
  dusk: number;
  nauticalDawn: number;
  nauticalDusk: number;
  /** The golden hour: the sun 6° up. */
  goldenHourEnd: number;
  goldenHour: number;
}

/** The solar day nearest `ms` at a place: sunrise, sunset, noon and twilights. */
export function sunTimes(ms: number, lat: number, lon: number): SunTimes {
  const lw = RAD * -lon;
  const phi = RAD * lat;
  const d = toDays(ms);
  const n = julianCycle(d, lw);
  const ds = approxTransit(0, lw, n);
  const M = solarMeanAnomaly(ds);
  const L = eclipticLongitude(M);
  const dec = declination(L, 0);
  const noon = solarTransitJ(ds, M, L);
  const pair = (deg: number): [number, number] => {
    const w = hourAngle(deg * RAD, phi, dec);
    const set = solarTransitJ(approxTransit(w, lw, n), M, L);
    const rise = noon - (set - noon);
    return [fromJulian(rise), fromJulian(set)];
  };
  const [sunrise, sunset] = pair(-0.833);
  const [dawn, dusk] = pair(-6);
  const [nauticalDawn, nauticalDusk] = pair(-12);
  const [goldenHourEnd, goldenHour] = pair(6);
  return {
    solarNoon: fromJulian(noon),
    nadir: fromJulian(noon - 0.5),
    sunrise,
    sunset,
    dawn,
    dusk,
    nauticalDawn,
    nauticalDusk,
    goldenHourEnd,
    goldenHour,
  };
}

// ---------------------------------------------------------------------------
// The sun a city sees

export type SunPhase = 'night' | 'dawn' | 'golden' | 'day' | 'dusk';

export interface SunState {
  marketId: string;
  /** The moment this light is for (epoch ms; the override's moment when forced). */
  at: number;
  lat: number;
  lon: number;
  /** Degrees above the horizon (negative: below). */
  elevation: number;
  /** Compass bearing in degrees: 0 north, 90 east, 180 south, 270 west. */
  azimuth: number;
  /** Unit vector towards the sun: x east, y up, z south (three.js: north is −z). */
  dir: { x: number; y: number; z: number };
  /** The morning (before solar noon). */
  rising: boolean;
  phase: SunPhase;
  /** 0 night … 1 full day (smooth through twilight). */
  day: number;
  /** 0 … 1: the low gold light around sunrise and sunset. */
  golden: number;
  /** 0 day … 1 full night (lamps, windows, stars). */
  night: number;
  /** Street lamps and windows on: from real dusk (just after sunset) until dawn. */
  lightsOn: boolean;
  /** The sun's light colour (hex) and its relative intensity (0 … 1). */
  color: string;
  intensity: number;
  /** Local hour in the city (0–24, fractional): who is in, which windows are lit. */
  hour: number;
  times: SunTimes;
  /** Set when a dev override forced this time of day. */
  forced: string | null;
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const hex = (r: number, g: number, b: number) =>
  `#${[r, g, b]
    .map((v) =>
      Math.round(Math.max(0, Math.min(255, v)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;

/** The sun's light colour by elevation: red-orange at the horizon, warm white high up. */
export function sunColor(elevation: number): string {
  const t = smooth(-1, 30, elevation);
  return hex(255, 120 + 125 * t, 50 + 175 * t ** 0.8);
}

/** The light at a place and moment (no override). */
export function sunAt(
  lat: number,
  lon: number,
  at: number,
  marketId = '',
  hour?: number,
): SunState {
  const pos = solarPosition(at, lat, lon);
  const el = pos.altitude / RAD;
  // Azimuth from south westward → compass bearing.
  const bearing = (((pos.azimuth / RAD + 180) % 360) + 360) % 360;
  const az = bearing * RAD;
  const cosEl = Math.cos(pos.altitude);
  const dir = { x: Math.sin(az) * cosEl, y: Math.sin(pos.altitude), z: -Math.cos(az) * cosEl };
  const times = sunTimes(at, lat, lon);
  const rising = at < times.solarNoon;
  // Daylight fades through civil twilight; night deepens to nautical twilight.
  const day = smooth(-4, 6, el);
  const golden = smooth(-4, 1, el) * (1 - smooth(4, 14, el));
  const night = 1 - smooth(-8, -0.5, el);
  const phase: SunPhase =
    el < -6 ? 'night' : el < 0 ? (rising ? 'dawn' : 'dusk') : el < 8 ? 'golden' : 'day';
  return {
    marketId,
    at,
    lat,
    lon,
    elevation: el,
    azimuth: bearing,
    dir,
    rising,
    phase,
    day,
    golden,
    night,
    // Lamps come on with the photocells, a little after sunset; off a little before sunrise.
    lightsOn: el < -1.5,
    color: sunColor(el),
    intensity: clamp01(Math.sin(Math.max(0, pos.altitude)) * 1.6) * smooth(-1, 4, el),
    hour: hour ?? (((at / 3_600_000 + lon / 15) % 24) + 24) % 24,
    times,
    forced: null,
  };
}

// ---------------------------------------------------------------------------
// The dev override (tests and screenshots)

const OVERRIDE_KEY = 'runway.sun';
const NAMED = ['sunrise', 'sunset', 'noon', 'night', 'dusk', 'dawn', 'golden'] as const;

/** The forced time of day, if any: `?sun=…` in the URL, else localStorage `runway.sun` (or the older `runway.mapHour`). */
export function sunOverride(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const q = new URLSearchParams(window.location.search).get('sun');
    if (q) return q;
  } catch {
    /* no URL */
  }
  try {
    const v = localStorage.getItem(OVERRIDE_KEY) ?? localStorage.getItem('runway.mapHour');
    return v && v.trim() ? v.trim() : null;
  } catch {
    return null;
  }
}

/** The moment an override stands for, near `now` (today's sunrise, sunset, or a local hour). */
export function overrideMoment(o: string, marketId: string, now: number): number | null {
  const g = CITY_GEO[marketId] ?? { lat: 0, lon: 0 };
  const t = sunTimes(now, g.lat, g.lon);
  const k = o.toLowerCase();
  if ((NAMED as readonly string[]).includes(k)) {
    const min = 60_000;
    const at =
      k === 'sunrise'
        ? t.sunrise + 4 * min
        : k === 'sunset'
          ? t.sunset - 4 * min
          : k === 'noon'
            ? t.solarNoon
            : k === 'night'
              ? t.nadir
              : k === 'dusk'
                ? (t.sunset + t.dusk) / 2
                : k === 'dawn'
                  ? (t.dawn + t.sunrise) / 2
                  : t.goldenHour + 20 * min;
    return Number.isFinite(at) ? at : null;
  }
  const h = Number(k);
  if (!Number.isFinite(h)) return null;
  const want = Math.round((((h % 24) + 24) % 24) * 60);
  const have = localMinutes(marketId, now);
  // The same day: earlier hours are this morning, later ones this evening.
  return now + (want - have) * 60_000 - (now % 60_000);
}

/** Local hour (fractional) in a city at a moment. */
const localHourAt = (marketId: string, at: number) =>
  localMinutes(marketId, at) / 60 + (at % 60_000) / 3_600_000;

/**
 * The sun a city sees right now: its real sunrise and sunset, at its own
 * local time. `now` defaults to the real clock; a dev override forces a time
 * of day (pass `override: null` to ignore it).
 */
export function sunFor(
  marketId: string,
  now = Date.now(),
  override: string | null = sunOverride(),
): SunState {
  const g = CITY_GEO[marketId] ?? { lat: 0, lon: 0 };
  const forcedAt = override ? overrideMoment(override, marketId, now) : null;
  const at = forcedAt ?? now;
  const s = sunAt(
    g.lat,
    g.lon,
    at,
    marketId,
    CITY_GEO[marketId] ? localHourAt(marketId, at) : undefined,
  );
  return forcedAt !== null ? { ...s, forced: override } : s;
}

/** The light in three words: what scenes that only know day, dusk and night read. */
export type DayLight = 'day' | 'dusk' | 'night';
export const dayLightOf = (s: SunState): DayLight =>
  s.lightsOn && s.elevation < -6 ? 'night' : s.elevation < 8 ? 'dusk' : 'day';

/** Day, dusk or night in a city right now (its real sun). */
export const dayLightFor = (marketId: string, now = Date.now()): DayLight =>
  dayLightOf(sunFor(marketId, now));

/** "06:12" in the city's own time. */
export function fmtSunTime(marketId: string, ms: number): string {
  if (!Number.isFinite(ms)) return '—';
  const m = localMinutes(marketId, ms);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Live updates

/** Milliseconds between updates: the light moves slowly, a minute is smooth enough. */
export const SUN_TICK_MS = 60_000;

/**
 * A value read from a city's sun, kept fresh every minute. The component
 * re-renders only when that value changes (`same` decides), so a scene that
 * only cares about day, dusk or night renders a few times a day.
 */
export function useSunValue<T>(
  marketId: string,
  pick: (s: SunState) => T,
  same: (a: T, b: T) => boolean = Object.is,
): T {
  const [state, setState] = useState(() => ({ marketId, value: pick(sunFor(marketId)) }));
  const fns = useRef({ pick, same });
  useEffect(() => {
    fns.current = { pick, same };
  });
  useEffect(() => {
    const id = setInterval(() => {
      const value = fns.current.pick(sunFor(marketId));
      setState((prev) =>
        prev.marketId === marketId && fns.current.same(prev.value, value)
          ? prev
          : { marketId, value },
      );
    }, SUN_TICK_MS);
    return () => clearInterval(id);
  }, [marketId]);
  return state.marketId === marketId ? state.value : pick(sunFor(marketId));
}

/**
 * The sun for a city, updated every minute; re-renders when the light has
 * visibly moved (a degree), or the phase or the lamps changed.
 */
export function useSun(marketId: string): SunState {
  return useSunValue(
    marketId,
    (s) => s,
    (a, b) =>
      Math.abs(a.elevation - b.elevation) < 1 && a.lightsOn === b.lightsOn && a.phase === b.phase,
  );
}

/** Day, dusk or night in a city, from its real sun (re-renders only when it changes). */
export const useDayLight = (marketId: string): DayLight => useSunValue(marketId, dayLightOf);

/**
 * A wash over a flat (2D) picture of the city: deep blue at night, rose and
 * gold around sunrise and sunset, nothing by day.
 */
export function mapTint(s: SunState): { color: string; opacity: number } {
  const r2 = (x: number) => Math.round(x * 100) / 100;
  if (s.night > 0.02)
    return { color: s.night > 0.6 ? '#1b2a5e' : '#5b4a8a', opacity: r2(0.12 + 0.4 * s.night) };
  if (s.golden > 0.02) return { color: '#ff9a4d', opacity: r2(0.22 * s.golden) };
  return { color: '#ffffff', opacity: 0 };
}

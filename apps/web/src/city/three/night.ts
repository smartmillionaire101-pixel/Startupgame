/**
 * How dark it is, and how each city lights its night. Pure (no three.js):
 * the sky (sky.ts), the windows (materials.ts), the street lamps (lights.ts)
 * and the landmarks read these.
 *
 * Night is driven by the sun's altitude when we know it (civil twilight: the
 * sun 6° below the horizon is dark enough for the street lamps to matter),
 * otherwise by the local hour, so dusk and dawn fade instead of switching.
 */

const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const DEG = Math.PI / 180;

/**
 * 0 by day … 1 at night. `altitude` is the sun's altitude in radians (solar.ts);
 * without it the hour (0–24) stands in: dusk 18:15–19:45, dawn 5:15–6:45.
 */
export function nightFactor(hour: number, altitude?: number): number {
  if (altitude !== undefined && Number.isFinite(altitude)) {
    // Full night from 7° below the horizon; none once the sun is 3° up.
    return 1 - smooth(-7 * DEG, 3 * DEG, altitude);
  }
  if (!Number.isFinite(hour)) return 0;
  const h = ((hour % 24) + 24) % 24;
  const dusk = smooth(18.25, 19.75, h);
  const dawn = 1 - smooth(5.25, 6.75, h);
  return Math.max(dusk, dawn);
}

/**
 * The renderer's exposure multiplier: 1 by day, down at night (the eye
 * adapted to the dark sees the lights first), but not so far that the city's
 * outline goes: roughly a night-time city photograph.
 */
export function nightExposure(night: number): number {
  const n = Math.max(0, Math.min(1, night));
  return 1 - 0.26 * n;
}

/** A city's night: the colours and how much of it is lit. */
export interface NightLook {
  /** Street lamps by road class (motorway … service): sodium orange, LED white. */
  lamps: [string, string, string, string, string, string];
  /** Lit windows: homes (warm) and offices (cool). */
  warm: string;
  cool: string;
  /** Share of lit windows that are cool (strip lights), by home and office. */
  coolShare: [home: number, office: number];
  /** How many windows are lit compared with an ordinary city (1). */
  lit: number;
  /** Landmark and tower floodlights. */
  accent: string;
  /** Share of the tall towers with a lit crown (lights.ts towerCrowns). */
  crowns: number;
  /** The glow of the city on the low sky (light pollution). */
  skyGlow: string;
}

/** Sodium orange on the big roads, whiter in town: the old default. */
const BASE_NIGHT: NightLook = {
  lamps: ['#ffb35c', '#ffbf6e', '#ffd49a', '#ffe2b8', '#ffe9c9', '#fff0d8'],
  warm: '#ff9a42',
  cool: '#bcd6ff',
  coolShare: [0.16, 0.7],
  lit: 1,
  accent: '#ffd9a0',
  crowns: 0.4,
  skyGlow: '#2c2436',
};

export const NIGHT_LOOKS: Record<string, NightLook> = {
  // Sodium lamps, generators, kerosene-warm windows; fewer lit (power cuts).
  lagos: {
    lamps: ['#ff9a3a', '#ffa448', '#ffae55', '#ffb866', '#ffc078', '#ffcb8c'],
    warm: '#ff8c34',
    cool: '#d8e6ff',
    coolShare: [0.1, 0.45],
    lit: 0.8,
    accent: '#ffb85c',
    crowns: 0.3,
    skyGlow: '#3a2614',
  },
  accra: {
    lamps: ['#ffa040', '#ffaa4e', '#ffb45e', '#ffbe6e', '#ffc680', '#ffd092'],
    warm: '#ff9038',
    cool: '#d8e6ff',
    coolShare: [0.1, 0.45],
    lit: 0.8,
    accent: '#ffbe6a',
    crowns: 0.3,
    skyGlow: '#36261a',
  },
  freetown: {
    lamps: ['#ff9a3a', '#ffa448', '#ffae55', '#ffb866', '#ffc078', '#ffcb8c'],
    warm: '#ff8a32',
    cool: '#d8e6ff',
    coolShare: [0.08, 0.4],
    lit: 0.6,
    accent: '#ffb85c',
    crowns: 0.2,
    skyGlow: '#2a1e16',
  },
  // Cool white LEDs on the streets, warm terrace windows.
  london: {
    lamps: ['#e8eeff', '#eef2ff', '#f4f2ea', '#fff2dc', '#fff0d6', '#ffeacc'],
    warm: '#ffa95a',
    cool: '#cfe0ff',
    coolShare: [0.2, 0.75],
    lit: 1.05,
    accent: '#eaf2ff',
    crowns: 0.4,
    skyGlow: '#2a2a3a',
  },
  // White and gold: towers lit up, gold accents, bright LED avenues.
  dubai: {
    lamps: ['#fff1d0', '#ffe6b8', '#fff4e0', '#fff8ec', '#fff2dc', '#ffeccc'],
    warm: '#ffc070',
    cool: '#e6f0ff',
    coolShare: [0.3, 0.8],
    lit: 1.3,
    accent: '#ffd27a',
    crowns: 0.9,
    skyGlow: '#3a2e22',
  },
  'san-francisco': {
    lamps: ['#ffb25a', '#ffd4a0', '#f2f0ff', '#fff0dc', '#ffe8c8', '#ffeed6'],
    warm: '#ffa04c',
    cool: '#c8dcff',
    coolShare: [0.2, 0.75],
    lit: 1.1,
    accent: '#eaf2ff',
    crowns: 0.5,
    skyGlow: '#2a2636',
  },
  cairo: {
    lamps: ['#ffcf7a', '#fff2d8', '#e6f0ff', '#ffe8c0', '#d8ffe0', '#ffecc8'],
    warm: '#ffa850',
    cool: '#d0ffe8',
    coolShare: [0.35, 0.6],
    lit: 1.15,
    accent: '#ffe0a0',
    crowns: 0.6,
    skyGlow: '#3a2e1e',
  },
  nairobi: {
    lamps: ['#ffa648', '#ffb058', '#f0f2ff', '#ffd09a', '#ffd8a8', '#ffe0b8'],
    warm: '#ff9840',
    cool: '#d0e2ff',
    coolShare: [0.14, 0.6],
    lit: 0.9,
    accent: '#ffd090',
    crowns: 0.35,
    skyGlow: '#2a2220',
  },
  johannesburg: {
    lamps: ['#ffa648', '#ffb058', '#ffc070', '#ffd09a', '#ffd8a8', '#ffe0b8'],
    warm: '#ff9840',
    cool: '#d0e2ff',
    coolShare: [0.14, 0.65],
    lit: 0.9,
    accent: '#ffd090',
    crowns: 0.4,
    skyGlow: '#2c2420',
  },
  kigali: {
    lamps: ['#f2f4ff', '#f6f6ff', '#fff4e4', '#fff0dc', '#ffecd0', '#ffe8c8'],
    warm: '#ffa04c',
    cool: '#d6e6ff',
    coolShare: [0.2, 0.6],
    lit: 0.85,
    accent: '#eaf2ff',
    crowns: 0.4,
    skyGlow: '#20202c',
  },
};

export const nightLook = (marketId: string): NightLook => NIGHT_LOOKS[marketId] ?? BASE_NIGHT;

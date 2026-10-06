/**
 * Wave 8 §A: real city maps from OpenStreetMap (© OpenStreetMap contributors,
 * ODbL). The data is built by scripts/osm/build.mjs and committed as
 * apps/web/src/city/geo/<city>.json; each file is its own chunk, loaded only
 * when that city's map opens. A market without a file keeps the generated
 * city (layout.ts).
 *
 * Coordinates in the files are whole metres from the city's centre, x east
 * and y SOUTH, as flat [x, y, x, y, …] arrays.
 */
import { useEffect, useSyncExternalStore } from 'react';

export type RoadClass = 'motorway' | 'trunk' | 'primary' | 'secondary' | 'tertiary' | 'residential';
export const ROAD_CLASSES: RoadClass[] = [
  'motorway',
  'trunk',
  'primary',
  'secondary',
  'tertiary',
  'residential',
];

export interface GeoData {
  city: string;
  attribution: string;
  /** [lon, lat] of the frame's centre. */
  origin: [number, number];
  /** [minX, minY, maxX, maxY] in metres (y south). */
  bounds: [number, number, number, number];
  /** The busy centre: every street and building outline comes from here. */
  core: [number, number, number, number];
  land: number[][];
  water: number[][];
  rivers: number[][];
  parks: number[][];
  green: number[][];
  beach: number[][];
  airport: number[][];
  runways: number[][];
  roads: Record<RoadClass, { n?: string; l: number[] }[]>;
  /** Road segments on a bridge: class, name, line. */
  bridges: { c: RoadClass; n: string | null; l: number[] }[];
  rail: number[][];
  /** Building outlines: footprint, levels, name (tall ones). */
  buildings: { p: number[]; h?: number; n?: string }[];
  /** OSM neighbourhoods and suburbs. */
  places: { n: string; k: string; x: number; y: number }[];
  landmarks: { n: string; k: string; x: number; y: number }[];
}

export const OSM_CREDIT = '© OpenStreetMap contributors';

// ---------------------------------------------------------------------------
// Loading: one chunk per city, cached.

const FILES = import.meta.glob<GeoData>('./geo/*.json', { import: 'default' });
const loaderOf = (id: string) => FILES[`./geo/${id}.json`];

/** Whether a market has a real map. */
export const hasGeo = (marketId: string) => !!loaderOf(marketId);

const cache = new Map<string, GeoData>();
const failed = new Set<string>();
const pending = new Map<string, Promise<GeoData | null>>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Load a city's map (resolves null for a market without one, or on failure). */
export function loadGeo(marketId: string): Promise<GeoData | null> {
  const hit = cache.get(marketId);
  if (hit) return Promise.resolve(hit);
  const load = loaderOf(marketId);
  if (!load || failed.has(marketId)) return Promise.resolve(null);
  let p = pending.get(marketId);
  if (!p) {
    p = load().then(
      (g) => {
        cache.set(marketId, g);
        pending.delete(marketId);
        emit();
        return g;
      },
      () => {
        // Offline, or a chunk from an old deploy: the generated city stands in.
        failed.add(marketId);
        pending.delete(marketId);
        emit();
        return null;
      },
    );
    pending.set(marketId, p);
  }
  return p;
}

/** The map if loaded; null when the market has none; 'loading' while it loads. */
export function geoState(marketId: string): GeoData | null | 'loading' {
  const hit = cache.get(marketId);
  if (hit) return hit;
  return loaderOf(marketId) && !failed.has(marketId) ? 'loading' : null;
}

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};

/** A city's map for React: loads it on first use. */
export function useGeo(marketId: string): GeoData | null | 'loading' {
  const state = useSyncExternalStore(
    subscribe,
    () => geoState(marketId),
    () => geoState(marketId),
  );
  useEffect(() => {
    if (state === 'loading') void loadGeo(marketId);
  }, [marketId, state]);
  return state;
}

/** Test hook: put a map in the cache directly. */
export function primeGeo(marketId: string, g: GeoData) {
  cache.set(marketId, g);
  emit();
}

// ---------------------------------------------------------------------------
// Real places

/** Degrees → the file's metres (x east, y south). */
export function fromLatLon(g: Pick<GeoData, 'origin'>, lat: number, lon: number) {
  const [lon0, lat0] = g.origin;
  return {
    x: (lon - lon0) * 111_320 * Math.cos((lat0 * Math.PI) / 180),
    y: -(lat - lat0) * 110_540,
  };
}

/**
 * Where each plan district really is ([lat, lon]), and the OSM place names
 * that mean it (the first one found in the file wins over the coordinate).
 */
export const GEO_DISTRICTS: Record<string, Record<string, [number, number, ...string[]]>> = {
  lagos: {
    ikeja: [6.6018, 3.3515, 'Ikeja'],
    yaba: [6.5095, 3.3755, 'Yaba'],
    surulere: [6.4969, 3.354, 'Surulere'],
    balogun: [6.4575, 3.3885],
    marina: [6.4525, 3.393],
    ikoyi: [6.4495, 3.435, 'Ikoyi'],
    'victoria-island': [6.4281, 3.4219, 'Victoria Island'],
    lekki: [6.4474, 3.472, 'Lekki Phase 1', 'Lekki Phase I'],
  },
  nairobi: {
    westlands: [-1.2676, 36.8108, 'Westlands'],
    eastleigh: [-1.278, 36.848, 'Eastleigh'],
    kilimani: [-1.29, 36.785, 'Kilimani'],
    cbd: [-1.2864, 36.8212],
    gikomba: [-1.2845, 36.836],
    'upper-hill': [-1.2985, 36.8145, 'Upper Hill'],
    karen: [-1.319, 36.712, 'Karen'],
    'industrial-area': [-1.3065, 36.851, 'Industrial Area'],
    'national-park': [-1.345, 36.82],
  },
  london: {
    mayfair: [51.51, -0.147, 'Mayfair'],
    soho: [51.5136, -0.134, 'Soho'],
    shoreditch: [51.5245, -0.078, 'Shoreditch'],
    camden: [51.5413, -0.146, 'Camden Town'],
    city: [51.5134, -0.089],
    'canary-wharf': [51.5054, -0.0235, 'Canary Wharf'],
    southbank: [51.506, -0.113],
    borough: [51.5015, -0.093, 'Borough'],
  },
  accra: {
    'east-legon': [5.635, -0.16, 'East Legon'],
    cantonments: [5.58, -0.172, 'Cantonments'],
    'airport-city': [5.6045, -0.1745, 'Airport City'],
    makola: [5.5485, -0.2085],
    osu: [5.556, -0.18, 'Osu'],
    labadi: [5.56, -0.15, 'Labadi', 'La'],
    jamestown: [5.534, -0.212, 'Jamestown', 'James Town'],
  },
  freetown: {
    aberdeen: [8.4895, -13.2705, 'Aberdeen'],
    central: [8.4845, -13.2335],
    'east-end': [8.4875, -13.2155],
    kissy: [8.4755, -13.196, 'Kissy'],
    lumley: [8.4575, -13.2625, 'Lumley'],
    'congo-cross': [8.477, -13.254, 'Congo Cross'],
    brookfields: [8.4725, -13.2395, 'Brookfields'],
    wilberforce: [8.4705, -13.262, 'Wilberforce'],
    'murray-town': [8.481, -13.263, 'Murray Town'],
    'hill-station': [8.4605, -13.248, 'Hill Station'],
  },
  kigali: {
    nyabugogo: [-1.9395, 30.0455, 'Nyabugogo'],
    kacyiru: [-1.937, 30.087, 'Kacyiru'],
    nyarugenge: [-1.9485, 30.0595],
    kiyovu: [-1.9535, 30.0645, 'Kiyovu'],
    kimihurura: [-1.9505, 30.0885, 'Kimihurura'],
    remera: [-1.957, 30.11, 'Remera'],
  },
  johannesburg: {
    braamfontein: [-26.193, 28.035, 'Braamfontein'],
    sandton: [-26.107, 28.056, 'Sandton'],
    marshalltown: [-26.207, 28.04, 'Marshalltown'],
    maboneng: [-26.204, 28.059, 'Maboneng'],
    rosebank: [-26.146, 28.043, 'Rosebank'],
    soweto: [-26.248, 27.88, 'Soweto', 'Orlando'],
    'or-tambo': [-26.134, 28.23],
  },
  cairo: {
    zamalek: [30.06, 31.22, 'Zamalek'],
    downtown: [30.048, 31.24],
    'khan-el-khalili': [30.0477, 31.262],
    'garden-city': [30.037, 31.231, 'Garden City'],
    heliopolis: [30.09, 31.32, 'Heliopolis'],
    maadi: [29.96, 31.258, 'Maadi'],
    'new-cairo': [30.03, 31.47],
  },
  dubai: {
    deira: [25.27, 55.31, 'Deira'],
    creek: [25.263, 55.299, 'Al Fahidi'],
    difc: [25.211, 55.28],
    'business-bay': [25.186, 55.265, 'Business Bay'],
    jumeirah: [25.212, 55.255, 'Jumeirah'],
    'al-quoz': [25.14, 55.23, 'Al Quoz'],
    marina: [25.08, 55.14, 'Dubai Marina'],
  },
  'san-francisco': {
    presidio: [37.7989, -122.4662],
    wharf: [37.808, -122.4177, 'Fisherman’s Wharf', "Fisherman's Wharf"],
    'north-beach': [37.8061, -122.4103, 'North Beach'],
    chinatown: [37.7941, -122.4078, 'Chinatown'],
    fidi: [37.7946, -122.3999, 'Financial District'],
    castro: [37.7609, -122.435, 'The Castro', 'Castro'],
    soma: [37.7785, -122.4056, 'South of Market', 'SoMa'],
    mission: [37.7599, -122.4148, 'Mission District'],
    dogpatch: [37.758, -122.388, 'Dogpatch'],
  },
};

/** A hand-drawn landmark at its real place. */
export type SpriteKind =
  | 'suspension'
  | 'cable-stayed'
  | 'bascule'
  | 'transamerica'
  | 'salesforce'
  | 'shard'
  | 'london-eye'
  | 'big-ben'
  | 'gherkin'
  | 'kicc'
  | 'dome'
  | 'burj-khalifa'
  | 'burj-al-arab'
  | 'cairo-tower'
  | 'hillbrow'
  | 'cotton-tree'
  | 'beach'
  | 'theatre'
  | 'star-gate'
  | 'lighthouse'
  | 'pyramid'
  | 'minaret'
  | 'painted-ladies';

export interface LandmarkSpec {
  kind: SpriteKind;
  name: string;
  /** [lat, lon]; a bridge also has its far end. */
  at: [number, number];
  to?: [number, number];
  /** A name in the file's landmarks or buildings that gives its real position instead. */
  match?: RegExp;
  /** A bridge's name in the file: its longest stretch gives the real ends. */
  bridge?: RegExp;
  color?: string;
}

export const GEO_LANDMARKS: Record<string, LandmarkSpec[]> = {
  'san-francisco': [
    {
      kind: 'suspension',
      name: 'Golden Gate Bridge',
      at: [37.8105, -122.477],
      to: [37.8275, -122.4795],
      bridge: /Golden Gate Bridge/i,
      color: '#c0362c',
    },
    {
      kind: 'suspension',
      name: 'Bay Bridge',
      at: [37.7885, -122.3885],
      to: [37.8075, -122.3665],
      bridge: /Bay Bridge/i,
      color: '#9ca3af',
    },
    { kind: 'transamerica', name: 'Transamerica Pyramid', at: [37.7952, -122.4028] },
    { kind: 'salesforce', name: 'Salesforce Tower', at: [37.7897, -122.3972] },
    { kind: 'painted-ladies', name: 'Painted Ladies', at: [37.7763, -122.4328] },
  ],
  lagos: [
    {
      kind: 'cable-stayed',
      name: 'Lekki–Ikoyi Link Bridge',
      at: [6.4497, 3.4496],
      to: [6.4472, 3.461],
      bridge: /Lekki.*Ikoyi/i,
      color: '#e5e7eb',
    },
    { kind: 'theatre', name: 'National Theatre', at: [6.4757, 3.3687], match: /National Theatre/i },
  ],
  london: [
    {
      kind: 'bascule',
      name: 'Tower Bridge',
      at: [51.5068, -0.0753],
      to: [51.5041, -0.0755],
      bridge: /^Tower Bridge$/i,
      color: '#1e3a8a',
    },
    { kind: 'shard', name: 'The Shard', at: [51.504, -0.0861], match: /^(The )?Shard$/i },
    { kind: 'london-eye', name: 'London Eye', at: [51.5033, -0.1196], match: /London Eye/i },
    { kind: 'big-ben', name: 'Big Ben', at: [51.5006, -0.1247], match: /Elizabeth Tower/i },
    { kind: 'gherkin', name: 'The Gherkin', at: [51.5145, -0.0799], match: /30 St Mary Axe/i },
  ],
  freetown: [
    { kind: 'cotton-tree', name: 'Cotton Tree', at: [8.4867, -13.2348], match: /Cotton Tree/i },
    { kind: 'beach', name: 'Lumley Beach', at: [8.4545, -13.2788], to: [8.436, -13.285] },
    { kind: 'lighthouse', name: 'Cape Lighthouse', at: [8.4975, -13.2938] },
  ],
  nairobi: [{ kind: 'kicc', name: 'KICC', at: [-1.2884, 36.8233] }],
  kigali: [{ kind: 'dome', name: 'Convention Centre', at: [-1.9545, 30.0935] }],
  accra: [
    { kind: 'star-gate', name: 'Black Star Gate', at: [5.5453, -0.1925] },
    { kind: 'lighthouse', name: 'Jamestown Lighthouse', at: [5.5333, -0.2128] },
  ],
  dubai: [
    { kind: 'burj-khalifa', name: 'Burj Khalifa', at: [25.1972, 55.2744] },
    { kind: 'burj-al-arab', name: 'Burj Al Arab', at: [25.1412, 55.1853] },
  ],
  cairo: [
    { kind: 'cairo-tower', name: 'Cairo Tower', at: [30.0459, 31.2243] },
    { kind: 'minaret', name: 'Al-Azhar', at: [30.0457, 31.2627] },
  ],
  johannesburg: [
    { kind: 'hillbrow', name: 'Hillbrow Tower', at: [-26.1903, 28.049] },
    {
      kind: 'cable-stayed',
      name: 'Nelson Mandela Bridge',
      at: [-26.1948, 28.0368],
      to: [-26.1975, 28.0373],
      bridge: /Nelson Mandela Bridge/i,
      color: '#f8fafc',
    },
  ],
};

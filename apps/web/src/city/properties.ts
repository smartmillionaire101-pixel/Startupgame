/**
 * Wave 10 §B: the homes you own, on the map (forward-compatible).
 *
 * The engine's real estate (Wave 10 §A) gives your portfolio in the view;
 * this reads it defensively from wherever it lands (`view.me.properties`,
 * `view.portfolio`, …) and finds each home's real neighbourhood (Pacific
 * Heights, Banana Island, Mayfair, Palm Jumeirah…) on the city's map. With
 * no portfolio in the view, nothing shows.
 */
import { fromLatLon, GEO_DISTRICTS, type GeoData } from './geo';

export type PropertyTier = 'studio' | 'apartment' | 'townhouse' | 'villa' | 'mansion' | 'penthouse';

export interface OwnedProperty {
  id: string;
  /** Market id (city). */
  market: string;
  neighbourhood: string;
  tier: PropertyTier;
  /** A name to show ("Sea Cliff mansion"); empty when the engine gives none. */
  name: string;
  /** You live there. */
  home: boolean;
}

const TIERS: PropertyTier[] = ['studio', 'apartment', 'townhouse', 'villa', 'mansion', 'penthouse'];
const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (...vs: unknown[]) => {
  for (const v of vs) if (typeof v === 'string' && v) return v;
  return '';
};

function tierOf(v: string): PropertyTier {
  const k = v.toLowerCase();
  return TIERS.find((t) => k.includes(t)) ?? (k.includes('flat') ? 'apartment' : 'apartment');
}

/** Your properties, wherever the view keeps them (empty when it doesn't). */
export function propertiesOf(view: unknown): OwnedProperty[] {
  if (!isObj(view)) return [];
  const me = isObj(view.me) ? view.me : {};
  const pf = isObj(view.portfolio) ? view.portfolio : null;
  const mpf = isObj(me.portfolio) ? me.portfolio : null;
  const list = [
    me.properties,
    pf?.properties,
    view.portfolio,
    mpf?.properties,
    me.portfolio,
    view.properties,
  ].find(Array.isArray) as unknown[] | undefined;
  if (!list) return [];
  const out: OwnedProperty[] = [];
  for (const raw of list) {
    if (!isObj(raw)) continue;
    const listing = isObj(raw.listing) ? raw.listing : {};
    const id = str(raw.id, raw.propertyId, raw.listingId, listing.id);
    if (!id) continue;
    out.push({
      id,
      market: str(raw.market, raw.marketId, raw.city, listing.market, listing.marketId),
      neighbourhood: str(
        raw.neighbourhood,
        raw.neighborhood,
        raw.hood,
        raw.area,
        raw.district,
        listing.neighbourhood,
        listing.neighborhood,
      ),
      tier: tierOf(str(raw.tier, raw.kind, raw.type, listing.tier, listing.kind)),
      name: str(raw.name, raw.label, raw.title, listing.name, listing.label),
      home: raw.home === true || raw.livingIn === true || raw.movedIn === true,
    });
  }
  return out;
}

/** The well-off neighbourhoods (and a few more) of each city: [lat, lon]. */
export const HOODS: Record<string, Record<string, [number, number]>> = {
  'san-francisco': {
    'pacific heights': [37.7925, -122.4382],
    'sea cliff': [37.7869, -122.49],
    soma: [37.7785, -122.4056],
    'nob hill': [37.793, -122.4161],
    'presidio heights': [37.7887, -122.4532],
    'russian hill': [37.8011, -122.4194],
    'noe valley': [37.7502, -122.4337],
    mission: [37.7599, -122.4148],
    marina: [37.8037, -122.4368],
    'mission bay': [37.7706, -122.3915],
    'hayes valley': [37.7759, -122.4245],
    castro: [37.7609, -122.435],
  },
  lagos: {
    'banana island': [6.4636, 3.442],
    ikoyi: [6.45, 3.435],
    lekki: [6.4474, 3.472],
    'victoria island': [6.4281, 3.4219],
    'eko atlantic': [6.4105, 3.41],
    yaba: [6.5095, 3.3755],
    'ikeja gra': [6.58, 3.355],
    ikeja: [6.6018, 3.3515],
    surulere: [6.4969, 3.354],
  },
  london: {
    mayfair: [51.51, -0.147],
    hampstead: [51.556, -0.178],
    kensington: [51.5, -0.193],
    chelsea: [51.4875, -0.1687],
    'notting hill': [51.509, -0.196],
    belgravia: [51.499, -0.153],
    knightsbridge: [51.501, -0.16],
    'canary wharf': [51.5054, -0.0235],
    shoreditch: [51.5245, -0.078],
  },
  dubai: {
    'palm jumeirah': [25.1124, 55.139],
    'emirates hills': [25.07, 55.169],
    'downtown dubai': [25.1972, 55.2744],
    'dubai marina': [25.0805, 55.1403],
    jumeirah: [25.21, 55.25],
    'business bay': [25.185, 55.265],
    'al barari': [25.099, 55.315],
  },
  nairobi: {
    karen: [-1.319, 36.712],
    runda: [-1.217, 36.806],
    muthaiga: [-1.247, 36.832],
    kilimani: [-1.29, 36.785],
    westlands: [-1.2676, 36.8108],
    lavington: [-1.278, 36.77],
    gigiri: [-1.234, 36.804],
  },
  accra: {
    'east legon': [5.635, -0.16],
    'airport residential': [5.605, -0.18],
    cantonments: [5.58, -0.17],
    labone: [5.565, -0.17],
    osu: [5.556, -0.182],
    trasacco: [5.68, -0.135],
  },
  freetown: {
    'hill station': [8.465, -13.27],
    aberdeen: [8.485, -13.285],
    lumley: [8.451, -13.262],
    wilberforce: [8.471, -13.259],
    juba: [8.452, -13.278],
  },
  kigali: {
    nyarutarama: [-1.94, 30.103],
    kiyovu: [-1.95, 30.062],
    kacyiru: [-1.94, 30.088],
    kimihurura: [-1.952, 30.087],
    rebero: [-1.98, 30.07],
  },
  johannesburg: {
    sandton: [-26.1076, 28.0567],
    sandhurst: [-26.11, 28.04],
    houghton: [-26.165, 28.06],
    'hyde park': [-26.127, 28.035],
    westcliff: [-26.17, 28.027],
    rosebank: [-26.145, 28.043],
    parkhurst: [-26.138, 28.017],
  },
  cairo: {
    zamalek: [30.0609, 31.2197],
    'garden city': [30.036, 31.231],
    'new cairo': [30.03, 31.47],
    maadi: [29.96, 31.257],
    heliopolis: [30.09, 31.32],
    'sheikh zayed': [30.04, 30.98],
  },
};

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\b(lofts?|phase \w+|estate|the)\b/g, '')
    .replace(/[^a-z ]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const hash = (s: string) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return (h >>> 0) / 4294967296;
};

/**
 * Where a neighbourhood is on the city's map (metres, x east, y south): the
 * table above, then the map file's own place names, then the plan's
 * districts; failing all, somewhere near the centre (stable for its name).
 */
export function hoodAt(data: GeoData, marketId: string, hood: string): { x: number; y: number } {
  const n = norm(hood);
  const table = HOODS[marketId] ?? {};
  const hit =
    table[n] ?? Object.entries(table).find(([k]) => n && (n.includes(k) || k.includes(n)))?.[1];
  if (hit) {
    const p = fromLatLon(data, hit[0], hit[1]);
    return { x: p.x, y: p.y };
  }
  const osm = (data.places ?? []).find((p) => n && norm(p.n) === n);
  if (osm) return { x: osm.x, y: osm.y };
  for (const [id, d] of Object.entries(GEO_DISTRICTS[marketId] ?? {})) {
    const names = [id, ...(d.slice(2) as string[])].map(norm);
    if (n && names.some((k) => k === n || k.includes(n) || n.includes(k))) {
      const p = fromLatLon(data, d[0], d[1]);
      return { x: p.x, y: p.y };
    }
  }
  const [c0, c1, c2, c3] = data.core;
  const a = hash(hood) * Math.PI * 2;
  const r = 600 + hash(`${hood}!`) * 900;
  return { x: (c0 + c2) / 2 + Math.cos(a) * r, y: (c1 + c3) / 2 + Math.sin(a) * r };
}

/** "Mansion", "Penthouse"… for a label. */
export const tierName = (t: PropertyTier) => t.charAt(0).toUpperCase() + t.slice(1);

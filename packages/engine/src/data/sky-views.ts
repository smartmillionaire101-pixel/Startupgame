/**
 * Wave 12: sky views — the real wheels, cable cars, observation decks and
 * hills of each city, at their real places. The client rides you up (or
 * along) in the city's real 3D buildings and terrain, then lets you look
 * around the whole skyline (apps/web/src/experiences/skyview.ts).
 *
 * Every city has at least one. Where a city has no wheel or cable car, its
 * real tallest observation point or hill stands in. Open to every player:
 * there is no lifestyle requirement.
 *
 * Coordinates are [lat, lon]. `height` is metres above the ground under the
 * viewpoint (the wheel's top, the deck's floor, the cable's highest point);
 * the client adds the real terrain.
 */
import type { MarketId } from './markets.js';

export type SkyViewKind = 'wheel' | 'cable' | 'deck' | 'tram' | 'hill';

export interface SkyViewSpec {
  /** Stable id (unique across cities; used by dates). */
  id: string;
  market: MarketId;
  name: string;
  kind: SkyViewKind;
  /** A wheel's hub, a deck's tower, a hill's top, a cable car's first station. */
  at: [number, number];
  /** A cable car's far station. */
  to?: [number, number];
  /** A street cable car's line, stop by stop (the first point is `at`). */
  path?: [number, number][];
  height: number;
  /** The 3D landmark it is (its name on the map), when the city draws one. */
  landmark?: string;
  /** One line about it (English; the client translates). */
  blurb: string;
}

const V = (s: SkyViewSpec) => s;

export const SKY_VIEWS: readonly SkyViewSpec[] = [
  // ---- London
  V({
    id: 'london-eye',
    market: 'london',
    name: 'London Eye',
    kind: 'wheel',
    at: [51.5033, -0.1196],
    height: 135,
    landmark: 'London Eye',
    blurb: 'A full turn of the wheel on the South Bank, opposite Westminster.',
  }),
  V({
    id: 'london-cable-car',
    market: 'london',
    name: 'IFS Cloud Cable Car',
    kind: 'cable',
    at: [51.4996, 0.0083],
    to: [51.5079, 0.0178],
    height: 90,
    blurb: 'Across the Thames from Greenwich Peninsula to the Royal Docks, 90 m up.',
  }),
  V({
    id: 'the-shard',
    market: 'london',
    name: 'The View from The Shard',
    kind: 'deck',
    at: [51.5045, -0.0865],
    height: 244,
    landmark: 'The Shard',
    blurb: 'The open-air deck on level 72, the highest view in London.',
  }),
  // ---- San Francisco
  V({
    id: 'powell-hyde',
    market: 'san-francisco',
    name: 'Powell–Hyde cable car',
    kind: 'tram',
    at: [37.7849, -122.4078],
    path: [
      [37.7849, -122.4078], // Powell & Market turntable
      [37.79205, -122.40924], // Powell & California, over Nob Hill
      [37.7956, -122.4099], // Powell & Jackson
      [37.7946, -122.4181], // Jackson & Hyde
      [37.8017, -122.4194], // Hyde & Lombard, top of Russian Hill
      [37.8066, -122.4205], // Hyde & Beach turntable, Aquatic Park
    ],
    height: 3.2,
    blurb: 'Up Nob Hill and over Russian Hill to the bay, on the running board.',
  }),
  V({
    id: 'coit-tower',
    market: 'san-francisco',
    name: 'Coit Tower',
    kind: 'deck',
    at: [37.8024, -122.4058],
    height: 58,
    landmark: 'Coit Tower',
    blurb: 'The observation deck on Telegraph Hill, over North Beach and the bay.',
  }),
  V({
    id: 'salesforce-tower',
    market: 'san-francisco',
    name: 'Salesforce Tower, Ohana Floor',
    kind: 'deck',
    at: [37.7897, -122.3972],
    height: 270,
    landmark: 'Salesforce Tower',
    blurb: 'The 61st floor of the city’s tallest tower.',
  }),
  // ---- Dubai
  V({
    id: 'burj-khalifa',
    market: 'dubai',
    name: 'Burj Khalifa, At the Top',
    kind: 'deck',
    at: [25.1972, 55.2744],
    height: 452,
    landmark: 'Burj Khalifa',
    blurb: 'Levels 124 and 125 of the world’s tallest building.',
  }),
  V({
    id: 'ain-dubai',
    market: 'dubai',
    name: 'Ain Dubai',
    kind: 'wheel',
    at: [25.0794, 55.124],
    height: 250,
    blurb: 'The giant wheel on Bluewaters Island, facing Dubai Marina and JBR.',
  }),
  // ---- Cairo
  V({
    id: 'cairo-tower',
    market: 'cairo',
    name: 'Cairo Tower',
    kind: 'deck',
    at: [30.0459, 31.2243],
    height: 165,
    landmark: 'Cairo Tower',
    blurb: 'The lotus tower on Gezira Island: the Nile, downtown and, far off, Giza.',
  }),
  // ---- Johannesburg
  V({
    id: 'top-of-africa',
    market: 'johannesburg',
    name: 'Top of Africa, Carlton Centre',
    kind: 'deck',
    at: [-26.2054, 28.047],
    height: 201,
    blurb: 'The 50th floor of Africa’s tallest office tower for decades.',
  }),
  // ---- Nairobi
  V({
    id: 'kicc-helipad',
    market: 'nairobi',
    name: 'KICC Rooftop Helipad',
    kind: 'deck',
    at: [-1.2884, 36.8233],
    height: 105,
    landmark: 'KICC',
    blurb: 'The helipad on the Kenyatta International Convention Centre.',
  }),
  // ---- Lagos
  V({
    id: 'necom-house',
    market: 'lagos',
    name: 'NECOM House rooftop',
    kind: 'deck',
    at: [6.4462, 3.3976],
    height: 160,
    blurb: 'The roof of Nigeria’s tallest building, on the Marina of Lagos Island.',
  }),
  // ---- Accra
  V({
    id: 'jamestown-lighthouse',
    market: 'accra',
    name: 'Jamestown Lighthouse',
    kind: 'deck',
    at: [5.5333, -0.2128],
    height: 28,
    landmark: 'Jamestown Lighthouse',
    blurb: 'Climb the lighthouse over the fishing harbour and Old Accra.',
  }),
  // ---- Freetown
  V({
    id: 'leicester-peak',
    market: 'freetown',
    name: 'Leicester Peak',
    kind: 'hill',
    at: [8.4496, -13.2238],
    height: 12,
    blurb: 'The peak above Freetown: the city, the harbour and the estuary below.',
  }),
  // ---- Kigali
  V({
    id: 'mount-kigali',
    market: 'kigali',
    name: 'Mount Kigali',
    kind: 'hill',
    at: [-1.9659, 30.0392],
    height: 12,
    blurb: 'The summit of Mont Kigali, over the thousand hills of the city.',
  }),
];

export const skyViewById = (id: string): SkyViewSpec | undefined =>
  SKY_VIEWS.find((v) => v.id === id);

export const skyViewsIn = (market: string): SkyViewSpec[] =>
  SKY_VIEWS.filter((v) => v.market === market);

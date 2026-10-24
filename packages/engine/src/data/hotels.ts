/**
 * The game-feedback round (player feedback: "More hotel options in different
 * parts of the city. Not only 3 hotels."): every city's named hotels, spread
 * over its districts (travel.ts prices and books them).
 *
 * Each hotel has a star rating (1–5), a room (its interior is one of the
 * three hotel rooms: budget, business or luxury), and how far it stands from
 * the centre. The nightly price is worked out from the stars and the city's
 * cost of living (travel.ts `hotelNightUsd`), so it is the same every time.
 *
 * The three hotels every city had before (guesthouse, business hotel,
 * five-star) are on each list under their old names: a stay booked by tier
 * finds its hotel on the map. Names are fictional, of their city. Districts
 * are city-plan ids (data/businesses.ts CITY_DISTRICTS).
 */
import type { MarketId } from './markets.js';

export type HotelRoomTier = 'budget' | 'business' | 'luxury';

/** What a room is like (the client translates these). */
export const HOTEL_ROOMS = [
  'Pod · shared bathroom',
  'Small double',
  'Twin · garden view',
  'Double room',
  'Business double',
  'Studio · workspace',
  'River view double',
  'Sea view double',
  'Deluxe king · breakfast',
  'Suite · city view',
  'Suite · sea view',
] as const;
export type HotelRoom = (typeof HOTEL_ROOMS)[number];

export interface HotelSpec {
  /** Unique across cities: `<market>-<slug>`. */
  id: string;
  name: string;
  /** City-plan district id, and its name as people say it. */
  district: string;
  area: string;
  stars: 1 | 2 | 3 | 4 | 5;
  /** Which of the three hotel rooms you sleep in. */
  tier: HotelRoomTier;
  room: HotelRoom;
  /** From the city centre, km. */
  km: number;
}

type Row = [
  slug: string,
  name: string,
  district: string,
  area: string,
  stars: HotelSpec['stars'],
  tier: HotelRoomTier,
  room: HotelRoom,
  km: number,
];

const city = (market: MarketId, rows: Row[]): HotelSpec[] =>
  rows.map(([slug, name, district, area, stars, tier, room, km]) => ({
    id: `${market}-${slug}`,
    name,
    district,
    area,
    stars,
    tier,
    room,
    km,
  }));

// prettier-ignore
export const CITY_HOTELS: Record<MarketId, readonly HotelSpec[]> = {
  london: city('london', [
    ['mayfair-grand', 'The Mayfair Grand', 'mayfair', 'Mayfair', 5, 'luxury', 'Deluxe king · breakfast', 0.8],
    ['shoreditch-loft', 'Shoreditch Loft Hotel', 'shoreditch', 'Shoreditch', 4, 'business', 'Studio · workspace', 3.9],
    ['canary-wharf', 'Canary Wharf Business Hotel', 'canary-wharf', 'Canary Wharf', 4, 'business', 'Business double', 6.2],
    ['south-bank', 'South Bank Riverside', 'southbank', 'South Bank', 4, 'business', 'River view double', 1.6],
    ['camden', 'Camden Guesthouse', 'camden', 'Camden', 2, 'budget', 'Small double', 4.1],
    ['soho-house', 'Soho Townhouse', 'soho', 'Soho', 3, 'business', 'Double room', 1.2],
    ['borough-inn', 'Borough Market Inn', 'borough', 'Borough', 3, 'budget', 'Twin · garden view', 2.3],
    ['city-pod', 'City Pod Hotel', 'city', 'The City', 1, 'budget', 'Pod · shared bathroom', 2.0],
  ]),
  lagos: city('lagos', [
    ['lagos-grand', 'The Lagos Grand', 'victoria-island', 'Victoria Island', 5, 'luxury', 'Suite · sea view', 1.5],
    ['eko-business', 'Eko Business Hotel', 'victoria-island', 'Victoria Island', 4, 'business', 'Business double', 1.8],
    ['ikoyi', 'Ikoyi Guesthouse', 'ikoyi', 'Ikoyi', 2, 'budget', 'Twin · garden view', 3.0],
    ['marina-towers', 'Marina Towers Hotel', 'marina', 'Marina', 4, 'business', 'River view double', 0.6],
    ['lekki-beach', 'Lekki Beach Resort', 'lekki', 'Lekki', 5, 'luxury', 'Sea view double', 9.5],
    ['yaba-rooms', 'Yaba Rooms', 'yaba', 'Yaba', 2, 'budget', 'Small double', 7.2],
    ['ikeja-airport', 'Ikeja Airport Hotel', 'ikeja', 'Ikeja', 3, 'business', 'Double room', 15.0],
    ['surulere-lodge', 'Surulere Lodge', 'surulere', 'Surulere', 1, 'budget', 'Pod · shared bathroom', 8.4],
  ]),
  nairobi: city('nairobi', [
    ['serena-grand', 'The Nairobi Serena Grand', 'cbd', 'CBD', 5, 'luxury', 'Deluxe king · breakfast', 0.5],
    ['westlands', 'Westlands Business Hotel', 'westlands', 'Westlands', 4, 'business', 'Business double', 4.2],
    ['kilimani', 'Kilimani Guesthouse', 'kilimani', 'Kilimani', 2, 'budget', 'Twin · garden view', 3.5],
    ['upper-hill', 'Upper Hill Suites', 'upper-hill', 'Upper Hill', 4, 'business', 'Studio · workspace', 2.1],
    ['karen-lodge', 'Karen Garden Lodge', 'karen', 'Karen', 5, 'luxury', 'Suite · city view', 13.0],
    ['eastleigh-inn', 'Eastleigh Inn', 'eastleigh', 'Eastleigh', 2, 'budget', 'Small double', 4.8],
    ['cbd-backpackers', 'City Backpackers', 'cbd', 'CBD', 1, 'budget', 'Pod · shared bathroom', 0.9],
    ['industrial-stay', 'Enterprise Road Hotel', 'industrial-area', 'Industrial Area', 3, 'business', 'Double room', 6.0],
  ]),
  accra: city('accra', [
    ['accra-grand', 'The Accra Grand', 'cantonments', 'Cantonments', 5, 'luxury', 'Deluxe king · breakfast', 3.4],
    ['airport-city', 'Airport City Business Hotel', 'airport-city', 'Airport City', 4, 'business', 'Business double', 6.0],
    ['osu', 'Osu Guesthouse', 'osu', 'Osu', 2, 'budget', 'Small double', 2.2],
    ['labadi-beach', 'Labadi Beach Hotel', 'labadi', 'Labadi', 4, 'luxury', 'Sea view double', 4.5],
    ['east-legon', 'East Legon Suites', 'east-legon', 'East Legon', 3, 'business', 'Studio · workspace', 9.0],
    ['jamestown-inn', 'Jamestown Lighthouse Inn', 'jamestown', 'Jamestown', 2, 'budget', 'Twin · garden view', 1.2],
    ['makola-rooms', 'Makola Rooms', 'makola', 'Makola', 1, 'budget', 'Pod · shared bathroom', 0.4],
  ]),
  freetown: city('freetown', [
    ['freetown-grand', 'The Freetown Grand', 'aberdeen', 'Aberdeen', 5, 'luxury', 'Suite · sea view', 7.0],
    ['aberdeen', 'Aberdeen Business Hotel', 'aberdeen', 'Aberdeen', 4, 'business', 'Business double', 6.6],
    ['lumley', 'Lumley Guesthouse', 'lumley', 'Lumley', 2, 'budget', 'Sea view double', 8.2],
    ['central-cotton', 'Cotton Tree Hotel', 'central', 'Central', 3, 'business', 'Double room', 0.3],
    ['wilberforce-hill', 'Wilberforce Hill Lodge', 'wilberforce', 'Wilberforce', 3, 'budget', 'Twin · garden view', 4.0],
    ['congo-cross', 'Congo Cross Inn', 'congo-cross', 'Congo Cross', 2, 'budget', 'Small double', 3.1],
    ['kissy-rooms', 'Kissy Road Rooms', 'kissy', 'Kissy', 1, 'budget', 'Pod · shared bathroom', 4.6],
  ]),
  kigali: city('kigali', [
    ['kigali-grand', 'The Kigali Grand', 'kiyovu', 'Kiyovu', 5, 'luxury', 'Deluxe king · breakfast', 1.0],
    ['kigali-heights', 'Kigali Heights Business Hotel', 'kacyiru', 'Kacyiru', 4, 'business', 'Business double', 3.8],
    ['kimihurura', 'Kimihurura Guesthouse', 'kimihurura', 'Kimihurura', 2, 'budget', 'Twin · garden view', 3.2],
    ['nyarugenge', 'Nyarugenge Town Hotel', 'nyarugenge', 'Nyarugenge', 3, 'business', 'Double room', 0.5],
    ['remera-suites', 'Remera Convention Suites', 'remera', 'Remera', 4, 'business', 'Studio · workspace', 5.6],
    ['nyabugogo-rooms', 'Nyabugogo Rooms', 'nyabugogo', 'Nyabugogo', 1, 'budget', 'Pod · shared bathroom', 2.4],
    ['kiyovu-hill', 'Kiyovu Hill Villa', 'kiyovu', 'Kiyovu', 5, 'luxury', 'Suite · city view', 1.4],
  ]),
  johannesburg: city('johannesburg', [
    ['joburg-grand', 'The Johannesburg Grand', 'sandton', 'Sandton', 5, 'luxury', 'Suite · city view', 15.0],
    ['sandton', 'Sandton Business Hotel', 'sandton', 'Sandton', 4, 'business', 'Business double', 14.5],
    ['melville', 'Melville Guesthouse', 'braamfontein', 'Braamfontein', 2, 'budget', 'Twin · garden view', 2.5],
    ['rosebank', 'Rosebank Boutique Hotel', 'rosebank', 'Rosebank', 4, 'business', 'Studio · workspace', 8.0],
    ['maboneng-loft', 'Maboneng Loft Hotel', 'maboneng', 'Maboneng', 3, 'business', 'Double room', 1.9],
    ['marshalltown', 'Marshalltown Pod Hotel', 'marshalltown', 'Marshalltown', 1, 'budget', 'Pod · shared bathroom', 0.4],
    ['soweto-inn', 'Vilakazi Street Inn', 'soweto', 'Soweto', 2, 'budget', 'Small double', 18.0],
  ]),
  cairo: city('cairo', [
    ['nile-grand', 'The Nile Grand', 'garden-city', 'Garden City', 5, 'luxury', 'River view double', 1.3],
    ['downtown', 'Downtown Business Hotel', 'downtown', 'Downtown', 4, 'business', 'Business double', 0.4],
    ['zamalek', 'Zamalek Guesthouse', 'zamalek', 'Zamalek', 2, 'budget', 'Twin · garden view', 2.6],
    ['khan-house', 'Khan el-Khalili House', 'khan-el-khalili', 'Khan el-Khalili', 3, 'budget', 'Double room', 2.8],
    ['heliopolis', 'Heliopolis Palace Hotel', 'heliopolis', 'Heliopolis', 4, 'business', 'Suite · city view', 11.0],
    ['maadi-suites', 'Maadi Corniche Suites', 'maadi', 'Maadi', 4, 'business', 'Studio · workspace', 9.5],
    ['new-cairo', 'New Cairo Resort', 'new-cairo', 'New Cairo', 5, 'luxury', 'Deluxe king · breakfast', 22.0],
    ['downtown-hostel', 'Talaat Harb Hostel', 'downtown', 'Downtown', 1, 'budget', 'Pod · shared bathroom', 0.6],
  ]),
  dubai: city('dubai', [
    ['marina-grand', 'The Marina Grand', 'marina', 'Marina', 5, 'luxury', 'Suite · sea view', 24.0],
    ['difc', 'DIFC Business Hotel', 'difc', 'DIFC', 4, 'business', 'Business double', 1.0],
    ['deira', 'Deira Guesthouse', 'deira', 'Deira', 2, 'budget', 'Small double', 5.5],
    ['jumeirah-beach', 'Jumeirah Beach Hotel', 'jumeirah', 'Jumeirah', 5, 'luxury', 'Sea view double', 11.0],
    ['business-bay', 'Business Bay Tower Hotel', 'business-bay', 'Business Bay', 4, 'business', 'Studio · workspace', 2.4],
    ['creek-heritage', 'Creek Heritage Inn', 'creek', 'The Creek', 3, 'budget', 'River view double', 4.8],
    ['al-quoz', 'Al Quoz Studio Rooms', 'al-quoz', 'Al Quoz', 2, 'budget', 'Double room', 8.0],
    ['deira-pod', 'Gold Souk Pods', 'deira', 'Deira', 1, 'budget', 'Pod · shared bathroom', 6.0],
  ]),
  'san-francisco': city('san-francisco', [
    ['nob-hill', 'The Nob Hill Grand', 'chinatown', 'Nob Hill', 5, 'luxury', 'Suite · city view', 1.2],
    ['soma', 'SoMa Business Hotel', 'soma', 'SoMa', 4, 'business', 'Business double', 1.5],
    ['mission', 'Mission Guesthouse', 'mission', 'Mission', 2, 'budget', 'Small double', 3.6],
    ['fidi-tower', 'Financial District Tower Hotel', 'fidi', 'FiDi', 4, 'business', 'Studio · workspace', 0.5],
    ['wharf-bay', 'Wharf Bay View Hotel', 'wharf', 'Fisherman’s Wharf', 4, 'luxury', 'Sea view double', 3.0],
    ['north-beach', 'North Beach Inn', 'north-beach', 'North Beach', 3, 'budget', 'Double room', 2.1],
    ['presidio-lodge', 'Presidio Park Lodge', 'presidio', 'Presidio', 5, 'luxury', 'Deluxe king · breakfast', 6.4],
    ['castro-hostel', 'Castro Street Hostel', 'castro', 'Castro', 1, 'budget', 'Pod · shared bathroom', 4.2],
    ['dogpatch', 'Dogpatch Warehouse Rooms', 'dogpatch', 'Dogpatch', 2, 'budget', 'Twin · garden view', 4.5],
  ]),
};

/** Every hotel by id. */
export const HOTEL_BY_ID: ReadonlyMap<string, HotelSpec & { market: MarketId }> = new Map(
  (Object.entries(CITY_HOTELS) as [MarketId, readonly HotelSpec[]][]).flatMap(([market, list]) =>
    list.map((h) => [h.id, { ...h, market }] as const),
  ),
);

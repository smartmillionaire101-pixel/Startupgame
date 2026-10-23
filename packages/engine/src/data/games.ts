/**
 * More games (../games.ts): each city's bowling alley, skydive centre and
 * heliport, and what a jump or a flight takes. The places open as local
 * businesses (AI owners, real ledger accounts) once the more-games release
 * note is logged, keyed so each opens once. Names are fictional but of their
 * city; districts are city-plan ids (data/businesses.ts CITY_DISTRICTS).
 */
import type { MarketId } from './markets.js';

export type GameVenueKind = 'bowling-alley' | 'skydive-centre' | 'heliport';

export interface GameVenueSeed {
  kind: GameVenueKind;
  name: string;
  district: string;
  owner: string;
  street?: string;
}

const V = (
  kind: GameVenueKind,
  name: string,
  district: string,
  owner: string,
  street?: string,
): GameVenueSeed => ({ kind, name, district, owner, ...(street ? { street } : {}) });

export const GAME_VENUES: Record<MarketId, readonly GameVenueSeed[]> = {
  london: [
    V('bowling-alley', 'Brick Lane Bowl', 'shoreditch', 'Danny Okafor', 'Brick Lane'),
    V('skydive-centre', 'Thames Estuary Skydive', 'canary-wharf', 'Fiona Blake'),
    V('heliport', 'Southbank Heliport', 'southbank', 'Rupert Hale', 'Belvedere Road'),
  ],
  lagos: [
    V('bowling-alley', 'Lekki Strike Lanes', 'lekki', 'Chidi Nwosu', 'Admiralty Way'),
    V('skydive-centre', 'Lagos Coast Skydivers', 'victoria-island', 'Bola Adewale'),
    V('heliport', 'Ikoyi Heli Tours', 'ikoyi', 'Captain Emeka Obi', 'Bourdillon Road'),
  ],
  nairobi: [
    V('bowling-alley', 'Westlands Bowling Lanes', 'westlands', 'Kevin Otieno'),
    V('skydive-centre', 'Rift Valley Skydive', 'karen', 'Wanjiru Kamau'),
    V('heliport', 'Upper Hill Heli Tours', 'upper-hill', 'Captain David Mwangi'),
  ],
  accra: [
    V('bowling-alley', 'Osu Bowling Alley', 'osu', 'Kofi Mensah', 'Oxford Street'),
    V('skydive-centre', 'Gold Coast Skydive', 'labadi', 'Ama Owusu'),
    V('heliport', 'Airport City Heliport', 'airport-city', 'Captain Yaw Boateng'),
  ],
  freetown: [
    V('bowling-alley', 'Aberdeen Bowl', 'aberdeen', 'Ibrahim Sesay'),
    V('skydive-centre', 'Lumley Beach Skydive', 'lumley', 'Fatmata Koroma'),
    V('heliport', 'Wilberforce Heli Tours', 'wilberforce', 'Captain Abu Bangura'),
  ],
  kigali: [
    V('bowling-alley', 'Kimihurura Lanes', 'kimihurura', 'Eric Habimana'),
    V('skydive-centre', 'Thousand Hills Skydive', 'remera', 'Diane Uwase'),
    V('heliport', 'Kacyiru Heli Tours', 'kacyiru', 'Captain Jean Bosco Nkurunziza'),
  ],
  johannesburg: [
    V('bowling-alley', 'Rosebank Bowl', 'rosebank', 'Thabo Nkosi'),
    V('skydive-centre', 'Highveld Skydive Club', 'braamfontein', 'Lerato Dlamini'),
    V('heliport', 'Sandton Heliport', 'sandton', 'Captain Pieter van Wyk'),
  ],
  cairo: [
    V('bowling-alley', 'Heliopolis Bowling Center', 'heliopolis', 'Ahmed Fathy'),
    V('skydive-centre', 'Pyramids Skydive', 'maadi', 'Nour Hassan'),
    V('heliport', 'Nile Heli Tours', 'zamalek', 'Captain Omar Said'),
  ],
  dubai: [
    V('bowling-alley', 'Al Quoz Bowling Club', 'al-quoz', 'Rashid Al Falasi'),
    V('skydive-centre', 'Palm Drop Zone', 'marina', 'Mia Jensen'),
    V('heliport', 'Creek Heliport Tours', 'creek', 'Captain Saeed Al Mazrouei'),
  ],
  'san-francisco': [
    V('bowling-alley', 'Mission Lanes', 'mission', 'Tony Russo', 'Valencia Street'),
    V('skydive-centre', 'Bay Area Skydive', 'dogpatch', 'Kayla Brooks'),
    V('heliport', 'Pier Heli Tours', 'wharf', 'Captain Mike Delgado', 'The Embarcadero'),
  ],
};

/** The landmark key a game venue opens under (one of each kind per city). */
export const gameVenueKey = (kind: GameVenueKind) => `games-${kind}`;

/**
 * A jump or a flight beyond its venue item (price and tier are the item's):
 * the hours it takes, what it does to you, and the rules of the jump.
 */
export interface AirActivity {
  kind: 'skydive' | 'heli';
  hours: number;
  energy: number;
  fun: number;
  social: number;
  stress: number;
}

export const AIR_ACTIVITIES: Record<string, AirActivity> = {
  'skydive-tandem': { kind: 'skydive', hours: 3, energy: -8, fun: 14, social: 4, stress: -10 },
  'skydive-solo': { kind: 'skydive', hours: 4, energy: -10, fun: 16, social: 4, stress: -12 },
  'heli-tour': { kind: 'heli', hours: 1, energy: -2, fun: 12, social: 4, stress: -8 },
  'heli-charter': { kind: 'heli', hours: 2, energy: -2, fun: 14, social: 6, stress: -10 },
};

export const SKYDIVE = {
  /** Exit altitude (m above the ground). */
  exit: 4000,
  /** The canopy should be open by here (m): the best pulls are in this band. */
  deployBest: [1000, 1700] as const,
  /** Below this the automatic opener fires the reserve: no pull points. */
  deployLow: 600,
  /** A landing within this of the target's centre is a bullseye (m). */
  bullseye: 3,
  /** Points: the pull, the landing, the style. */
  pullPts: 300,
  landPts: 500,
  bullseyePts: 100,
  stylePts: 200,
  /** A landing farther than this from the target scores nothing for it (m). */
  landRange: 120,
  /** A score at least this good is a great jump (a little more fun, less stress). */
  great: 550,
} as const;

export const BOWLING = {
  /** The alley's item for a game: its price is the lane fee each bowler pays. */
  item: 'bowling',
  /** What a game does to you (each human bowler, when it finishes). */
  fun: 12,
  social: 6,
  energy: -4,
  stress: -6,
  /** Extra calm and fun for a good game (this score or more). */
  goodGame: 150,
} as const;

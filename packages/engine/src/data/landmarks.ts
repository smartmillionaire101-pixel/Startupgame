/**
 * Wave 10: lifestyle landmarks (yacht marinas, golf and country clubs, grand
 * ballrooms, private jet terminals) where they fit each city, and San
 * Francisco's big tech campuses. They open as local businesses (AI owners,
 * real ledger accounts) at the first settlement, keyed so they open once.
 * Names are fictional but of their city; districts are city-plan ids.
 */
import type { MarketId } from './markets.js';

export interface LandmarkSeed {
  /** Stable key (unique per city). */
  key: string;
  name: string;
  kind: 'marina' | 'golf-club' | 'ballroom' | 'private-terminal' | 'tech-campus';
  district: string;
  owner: string;
  street?: string;
}

const L = (
  key: string,
  name: string,
  kind: LandmarkSeed['kind'],
  district: string,
  owner: string,
  street?: string,
): LandmarkSeed => ({ key, name, kind, district, owner, ...(street ? { street } : {}) });

export const LANDMARKS: Record<MarketId, readonly LandmarkSeed[]> = {
  'san-francisco': [
    L(
      'marina',
      'Gashouse Cove Yacht Harbor',
      'marina',
      'wharf',
      'Nathan Whitlock',
      'Marina Boulevard',
    ),
    L(
      'golf',
      'Presidio Links Club',
      'golf-club',
      'presidio',
      'Margaret Ellison',
      'Arguello Boulevard',
    ),
    L(
      'ballroom',
      'Nob Hill Grand Ballroom',
      'ballroom',
      'chinatown',
      'Victoria Chen',
      'California Street',
    ),
    L('terminal', 'Bayside Private Aviation', 'private-terminal', 'dogpatch', 'Owen Mercer'),
    L('campus-1', 'Halcyon AI Campus', 'tech-campus', 'soma', 'Priya Natarajan', 'Howard Street'),
    L('campus-2', 'Lumen Systems HQ', 'tech-campus', 'fidi', 'Daniel Whitaker', 'Mission Street'),
    L(
      'campus-3',
      'Northstar Cloud Campus',
      'tech-campus',
      'dogpatch',
      'Elena Vasquez',
      '3rd Street',
    ),
    L('campus-4', 'Bayline Robotics Lab', 'tech-campus', 'mission', 'Marcus Lee', 'Alabama Street'),
    L(
      'campus-5',
      'Letterman Digital Studios',
      'tech-campus',
      'presidio',
      'Sarah Kowalczyk',
      'Letterman Drive',
    ),
    L('campus-6', 'Embarcadero Social HQ', 'tech-campus', 'wharf', 'Jason Park', 'The Embarcadero'),
  ],
  lagos: [
    L(
      'marina',
      'Lagos Lagoon Yacht Club',
      'marina',
      'victoria-island',
      'Tunde Bankole',
      'Ozumba Mbadiwe Avenue',
    ),
    L(
      'golf',
      'Ikoyi Golf and Polo Club',
      'golf-club',
      'ikoyi',
      'Chief Adebayo Ogunleye',
      'Ikoyi Club Road',
    ),
    L(
      'ballroom',
      'Eko Grand Ballroom',
      'ballroom',
      'victoria-island',
      'Funmi Adeyemi',
      'Ahmadu Bello Way',
    ),
    L(
      'terminal',
      'Murtala Private Jet Terminal',
      'private-terminal',
      'ikeja',
      'Emeka Nwosu',
      'Airport Road',
    ),
  ],
  london: [
    L('marina', 'St Katharine Quay Marina', 'marina', 'canary-wharf', 'Hugo Ashworth'),
    L(
      'golf',
      'Hampstead Heath Golf Club',
      'golf-club',
      'camden',
      'Charlotte Pembroke',
      'Winnington Road',
    ),
    L('ballroom', 'Park Lane Grand Ballroom', 'ballroom', 'mayfair', 'Edward Fairfax', 'Park Lane'),
    L(
      'terminal',
      'Docklands Private Jet Centre',
      'private-terminal',
      'canary-wharf',
      'Imogen Hart',
    ),
  ],
  dubai: [
    L('marina', 'Dubai Marina Yacht Club', 'marina', 'marina', 'Khalid Al Mansoori', 'Marina Walk'),
    L('golf', 'Emirates Hills Golf and Polo Club', 'golf-club', 'jumeirah', 'Rashid Al Falasi'),
    L(
      'ballroom',
      'Downtown Grand Ballroom',
      'ballroom',
      'business-bay',
      'Leila Haddad',
      'Sheikh Zayed Road',
    ),
    L(
      'terminal',
      'Creekside Executive Jet Terminal',
      'private-terminal',
      'al-quoz',
      'Omar Siddiqui',
    ),
  ],
  nairobi: [
    L('golf', 'Karen Country Club', 'golf-club', 'karen', 'Wanjiru Kamau', 'Karen Road'),
    L('ballroom', 'Upper Hill Grand Ballroom', 'ballroom', 'upper-hill', 'David Otieno'),
    L(
      'terminal',
      'Wilson Executive Aviation',
      'private-terminal',
      'industrial-area',
      'Peter Mwangi',
      'Langata Road',
    ),
  ],
  accra: [
    L('marina', 'Labadi Beach Marina', 'marina', 'labadi', 'Kwame Asante', 'La Beach Road'),
    L('golf', 'Achimota Golf and Polo Club', 'golf-club', 'east-legon', 'Ama Owusu'),
    L('ballroom', 'Cantonments Grand Ballroom', 'ballroom', 'cantonments', 'Kofi Mensah'),
    L(
      'terminal',
      'Kotoka Executive Jet Centre',
      'private-terminal',
      'airport-city',
      'Efua Boateng',
      'Liberation Road',
    ),
  ],
  freetown: [
    L('marina', 'Aberdeen Yacht Harbour', 'marina', 'aberdeen', 'Mohamed Kamara', 'Cape Road'),
    L('golf', 'Lumley Golf Club', 'golf-club', 'lumley', 'Fatmata Sesay', 'Lumley Beach Road'),
    L('ballroom', 'Hill Station Grand Ballroom', 'ballroom', 'wilberforce', 'Abu Bakarr Conteh'),
  ],
  kigali: [
    L('golf', 'Nyarutarama Golf Club', 'golf-club', 'remera', 'Jean-Paul Habimana', 'KG 9 Avenue'),
    L(
      'ballroom',
      'Kigali Convention Ballroom',
      'ballroom',
      'kimihurura',
      'Aline Uwase',
      'KG 2 Roundabout',
    ),
    L('terminal', 'Kanombe Executive Terminal', 'private-terminal', 'remera', 'Eric Mugisha'),
  ],
  johannesburg: [
    L('golf', 'Houghton Golf and Polo Club', 'golf-club', 'rosebank', 'Thabo Nkosi', 'Osborn Road'),
    L(
      'ballroom',
      'Sandton Grand Ballroom',
      'ballroom',
      'sandton',
      'Naledi Dlamini',
      'Maude Street',
    ),
    L(
      'terminal',
      'Lanseria Executive Jet Centre',
      'private-terminal',
      'sandton',
      'Johan van der Merwe',
    ),
  ],
  cairo: [
    L('marina', 'Zamalek Nile Yacht Club', 'marina', 'zamalek', 'Karim Mansour', 'Gezira Street'),
    L('golf', 'Katameya Golf and Polo Club', 'golf-club', 'new-cairo', 'Nour El Sayed'),
    L(
      'ballroom',
      'Garden City Grand Ballroom',
      'ballroom',
      'garden-city',
      'Yasmine Fahmy',
      'Corniche El Nil',
    ),
    L(
      'terminal',
      'Heliopolis Executive Terminal',
      'private-terminal',
      'heliopolis',
      'Ahmed Farouk',
    ),
  ],
};

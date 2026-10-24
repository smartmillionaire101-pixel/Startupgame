/**
 * The city places release: each city's prominent buildings as real places,
 * with a name and a purpose (places.ts runs them).
 *
 * - Government offices (Ministry of Finance, Central Bank, Tax Office, High
 *   Court, Embassy, Investment Promotion Agency) see residents by
 *   appointment only.
 * - Members' places (the Stock Exchange floor, the Founders' Hub, a private
 *   members' club, a family office tower) open to some players: any one of
 *   their gates lets you in.
 * - Public institutions (Chamber of Commerce, Hospital, University) are open
 *   to everyone.
 *
 * Government names are generic roles; the rest are fictional, of their city.
 * Districts are city-plan ids (data/businesses.ts CITY_DISTRICTS).
 */
import type { Role } from './characters.js';
import type { MarketId } from './markets.js';
import type { ProfessionId } from './professions.js';

export const PLACE_ROLES = [
  'ministry-finance',
  'central-bank',
  'stock-exchange',
  'chamber',
  'high-court',
  'tax-office',
  'embassy',
  'ipa',
  'tech-hub',
  'members-club',
  'family-office',
  'hospital',
  'university',
] as const;
export type PlaceRole = (typeof PLACE_ROLES)[number];

/** Who may go in to a members' place: any one gate opens the door. */
export type PlaceGate =
  | { kind: 'role'; roles: readonly Role[] }
  | { kind: 'company' }
  | { kind: 'lifestyle'; min: number }
  | { kind: 'stars'; min: number }
  | { kind: 'rung'; min: number }
  | { kind: 'job'; professions: readonly ProfessionId[] };

export type PlaceAccess = 'public' | 'members' | 'appointment';

export const PLACE_SERVICES = [
  'roundtable',
  'payments-licence',
  'fund-licence',
  'tax-registration',
  'notarise',
  'one-stop',
  'incentive',
  'visa',
  'mixer',
  'mentor',
  'demo-night',
  'club-dinner',
  'principals',
  'floor-briefing',
  'check-up',
  'evening-class',
  // The feedback round (FEEDBACK_NOTE): more to do in each place (`PlaceSpec.more`).
  'consultation',
  'rate-briefing',
  'directory',
  'watch-case',
  'filing-check',
  'tax-clinic',
  'trade-attache',
  'delegation',
  'peer-feedback',
  'meet-members',
  'lp-meetings',
  'sick-care',
  'careers-fair',
  'guest-lecture',
] as const;
export type PlaceService = (typeof PLACE_SERVICES)[number];

export interface PlaceSpec {
  /** The generic role, shown under the name ("Tax Office"). */
  label: string;
  /** One line: what it is for. */
  purpose: string;
  access: PlaceAccess;
  /** Members' places: any one of these lets you in. */
  gates?: readonly PlaceGate[];
  /** Members' places: why the door stays shut, and what opens it. */
  refusal?: string;
  unlock?: string;
  services: readonly PlaceService[];
  /** More to do here once the feedback note is logged (places.ts `servicesOf`). */
  more?: readonly PlaceService[];
}

export const PLACE_SPECS: Record<PlaceRole, PlaceSpec> = {
  'ministry-finance': {
    label: 'Ministry of Finance',
    purpose: 'Economic policy and the budget. Founders and investors are heard at roundtables.',
    access: 'appointment',
    services: ['roundtable'],
    more: ['consultation'],
  },
  'central-bank': {
    label: 'Central Bank',
    purpose: 'The money regulator: payments licences and fund manager licences.',
    access: 'appointment',
    services: ['payments-licence', 'fund-licence'],
    more: ['rate-briefing'],
  },
  'stock-exchange': {
    label: 'Stock Exchange',
    purpose: 'The city’s listed companies trade here. The floor is for finance people.',
    access: 'members',
    gates: [
      { kind: 'role', roles: ['investor', 'banker'] },
      { kind: 'job', professions: ['bank', 'investment'] },
    ],
    refusal: 'The trading floor is for investors, bankers and people working in finance.',
    unlock: 'Play as an investor or banker, or get a job at a bank or an investment firm.',
    services: ['floor-briefing'],
  },
  chamber: {
    label: 'Chamber of Commerce',
    purpose: 'The city’s business association: mixers, members and introductions.',
    access: 'public',
    services: ['mixer'],
    more: ['directory'],
  },
  'high-court': {
    label: 'High Court',
    purpose: 'Commercial disputes, and a commissioner for oaths for company papers.',
    access: 'appointment',
    services: ['notarise'],
    more: ['watch-case'],
  },
  'tax-office': {
    label: 'Tax Office',
    purpose: 'Company tax registration and filing.',
    access: 'appointment',
    services: ['tax-registration'],
    more: ['filing-check', 'tax-clinic'],
  },
  embassy: {
    label: 'Embassy',
    purpose: 'Business visas for the cities you fly to.',
    access: 'appointment',
    services: ['visa'],
    more: ['trade-attache'],
  },
  ipa: {
    label: 'Investment Promotion Agency',
    purpose: 'A one-stop shop for company registrations, and incentives for new companies.',
    access: 'appointment',
    services: ['one-stop', 'incentive'],
    more: ['delegation'],
  },
  'tech-hub': {
    label: 'Founders’ Hub',
    purpose: 'Desks, mentors and demo nights for founders building a company.',
    access: 'members',
    gates: [{ kind: 'role', roles: ['founder'] }, { kind: 'company' }],
    refusal: 'The Founders’ Hub is for founders.',
    unlock: 'Start a company to get a desk here.',
    services: ['mentor', 'demo-night'],
    more: ['peer-feedback'],
  },
  'members-club': {
    label: 'Private members’ club',
    purpose: 'Dinner, quiet rooms and the city’s well-connected.',
    access: 'members',
    gates: [
      { kind: 'lifestyle', min: 4 },
      { kind: 'stars', min: 4 },
    ],
    refusal: 'Members only.',
    unlock: 'Live an Affluent lifestyle or better, or build a 4★ reputation.',
    services: ['club-dinner'],
    more: ['meet-members'],
  },
  'family-office': {
    label: 'Family office tower',
    purpose: 'Where the city’s family offices and LPs meet fund managers.',
    access: 'members',
    gates: [{ kind: 'rung', min: 3 }],
    refusal: 'The family offices see investors with a track record.',
    unlock: 'Reach level 3 of the investor career (ready to raise a Fund I).',
    services: ['principals'],
    more: ['lp-meetings'],
  },
  hospital: {
    label: 'Hospital',
    purpose: 'Check-ups and care, open to everyone.',
    access: 'public',
    services: ['check-up'],
    more: ['sick-care'],
  },
  university: {
    label: 'University',
    purpose: 'Evening classes for working people.',
    access: 'public',
    services: ['evening-class'],
    more: ['careers-fair', 'guest-lecture'],
  },
};

export interface ServiceSpec {
  label: string;
  /** Hours it takes (compliance filings: half the rule's hours, in person). */
  hours: number;
  /** Fee as a multiple of the city's monthly cost of living (0 = free). */
  feeCol: number;
  /** How often: once a (home) month, or once ever (a licence, an incentive per company). */
  once: 'month' | 'ever';
}

export const SERVICE_SPECS: Record<PlaceService, ServiceSpec> = {
  roundtable: { label: 'Policy roundtable', hours: 2, feeCol: 0, once: 'month' },
  'payments-licence': { label: 'File your payments licence', hours: 0, feeCol: 0, once: 'ever' },
  'fund-licence': { label: 'Fund manager licence', hours: 3, feeCol: 1, once: 'ever' },
  'tax-registration': { label: 'Register for company tax', hours: 0, feeCol: 0, once: 'ever' },
  notarise: { label: 'Notarise founder agreements', hours: 0, feeCol: 0, once: 'ever' },
  'one-stop': { label: 'File at the one-stop shop', hours: 0, feeCol: 0, once: 'ever' },
  incentive: { label: 'Investment incentive', hours: 2, feeCol: 0, once: 'ever' },
  visa: { label: 'Business visa', hours: 1, feeCol: 0.5, once: 'ever' },
  mixer: { label: 'Business mixer', hours: 2, feeCol: 0, once: 'month' },
  mentor: { label: 'Office hours with a mentor', hours: 3, feeCol: 0, once: 'month' },
  'demo-night': { label: 'Demo night', hours: 2, feeCol: 0, once: 'month' },
  'club-dinner': { label: 'Dinner at the club', hours: 2, feeCol: 0.25, once: 'month' },
  principals: { label: 'Breakfast with the principals', hours: 2, feeCol: 0, once: 'month' },
  'floor-briefing': { label: 'Trading floor briefing', hours: 2, feeCol: 0, once: 'month' },
  'check-up': { label: 'Health check-up', hours: 1, feeCol: 0.1, once: 'month' },
  'evening-class': { label: 'Evening class', hours: 6, feeCol: 0.2, once: 'month' },
  consultation: {
    label: 'Public consultation: vote on a tax change',
    hours: 1,
    feeCol: 0,
    once: 'month',
  },
  'rate-briefing': { label: 'Policy-rate briefing', hours: 2, feeCol: 0, once: 'month' },
  directory: { label: 'Members’ directory: SME sales leads', hours: 2, feeCol: 0, once: 'month' },
  'watch-case': { label: 'Watch a case', hours: 3, feeCol: 0, once: 'month' },
  'filing-check': { label: 'Monthly filing check', hours: 1, feeCol: 0, once: 'month' },
  'tax-clinic': { label: 'Tax clinic: ask a question', hours: 2, feeCol: 0, once: 'month' },
  'trade-attache': { label: 'Trade attaché: export leads', hours: 2, feeCol: 0, once: 'month' },
  delegation: { label: 'Meet a visiting investor delegation', hours: 2, feeCol: 0, once: 'month' },
  'peer-feedback': {
    label: 'Peer feedback from other founders',
    hours: 2,
    feeCol: 0,
    once: 'month',
  },
  'meet-members': { label: 'Meet the members', hours: 2, feeCol: 0.1, once: 'month' },
  'lp-meetings': { label: 'LP meetings', hours: 2, feeCol: 0, once: 'month' },
  'sick-care': { label: 'See a doctor', hours: 4, feeCol: 0.1, once: 'month' },
  'careers-fair': { label: 'Careers fair: meet graduates', hours: 0, feeCol: 0, once: 'month' },
  'guest-lecture': { label: 'Guest lecture', hours: 2, feeCol: 0, once: 'month' },
};

/** Every number in one place. */
export const PLACES = {
  /** Network from a roundtable, mixer, demo night, dinner or breakfast. */
  network: { roundtable: 3, mixer: 2, 'demo-night': 2, 'club-dinner': 3, principals: 3 },
  /** Skill points from a mentor, a briefing or a class (up to the jobs' skill cap). */
  skill: 2,
  /** A check-up: health up, stress down (life bars). */
  checkUp: { health: 10, stress: -5 },
  /** A club dinner: social and fun needs. */
  dinner: { social: 25, fun: 10 },
  /** LP credibility a fund manager licence adds (0–1). */
  licenceCredibility: 0.1,
  /** The investment incentive: months of cost of living, paid to the company by the state. */
  incentiveCol: 2,
  /** Months a business visa lasts. */
  visaMonths: 12,
  /** Appointments: office hours (game clock), the earliest lead and the spread. */
  officeOpen: 9,
  officeClose: 17,
  leadHours: [3, 20] as readonly [number, number],
  /** Appointments booked at once. */
  maxBooked: 3,
  /** The feedback round's services. */
  more: {
    /** Network from a consultation, a delegation, the directory, the attaché, a lecture. */
    network: 1,
    /** Sales leads from the directory; the attaché's export lead is this much bigger. */
    directoryLeads: [1, 2] as readonly [number, number],
    exportBudget: 1.6,
    /** A filing check: one worry less. */
    checkStress: -3,
    /** Discovery from peer feedback (share of what's left to learn). */
    peerDiscovery: 0.08,
    /** People you meet (delegation investors, members) and how warm. */
    meet: 2,
    warmth: 0.35,
    /** LP credibility from a round of LP meetings (0–1). */
    lpCredibility: 0.05,
    /** A doctor: when your health is under this, and what the care does. */
    unwell: 60,
    care: { health: 20, stress: -5, energy: 10 },
  },
} as const;

/** A city's places: name, plan district and (optionally) street, per role. */
type Row = readonly [name: string, district: string, street?: string];

const city = (rows: Record<PlaceRole, Row>) => rows;

export const CITY_PLACES: Record<MarketId, Record<PlaceRole, Row>> = {
  lagos: city({
    'ministry-finance': ['Federal Ministry of Finance', 'marina', 'Marina Road'],
    'central-bank': ['Central Bank', 'marina', 'Tinubu Square'],
    'stock-exchange': ['Stock Exchange', 'marina', 'Customs Street'],
    chamber: ['Lagos Chamber of Commerce', 'victoria-island', 'Idowu Taylor Street'],
    'high-court': ['High Court', 'balogun', 'Tafawa Balewa Square'],
    'tax-office': ['Tax Office', 'ikeja', 'Alausa Road'],
    embassy: ['Embassy Row Visa Centre', 'ikoyi', 'Walter Carrington Crescent'],
    ipa: ['Investment Promotion Agency', 'victoria-island', 'Ahmadu Bello Way'],
    'tech-hub': ['Yaba Founders’ Hub', 'yaba', 'Herbert Macaulay Way'],
    'members-club': ['The Lagoon House', 'ikoyi', 'Bourdillon Road'],
    'family-office': ['Meridian Family Office Tower', 'victoria-island', 'Adeola Odeku Street'],
    hospital: ['Lagos General Hospital', 'surulere'],
    university: ['Lagos City University', 'yaba'],
  }),
  nairobi: city({
    'ministry-finance': ['National Treasury', 'cbd', 'Harambee Avenue'],
    'central-bank': ['Central Bank', 'cbd', 'Haile Selassie Avenue'],
    'stock-exchange': ['Stock Exchange', 'westlands', 'Riverside Drive'],
    chamber: ['Nairobi Chamber of Commerce', 'upper-hill', 'Ngong Road'],
    'high-court': ['High Court', 'cbd', 'City Hall Way'],
    'tax-office': ['Tax Office', 'upper-hill', 'Haile Selassie Avenue'],
    embassy: ['Gigiri Visa Centre', 'westlands', 'United Nations Avenue'],
    ipa: ['Investment Promotion Agency', 'upper-hill', 'Kenyatta Avenue'],
    'tech-hub': ['Ngong Road Founders’ Hub', 'kilimani', 'Ngong Road'],
    'members-club': ['The Jacaranda House', 'karen', 'Karen Road'],
    'family-office': ['Acacia Family Office Tower', 'upper-hill', 'Upper Hill Road'],
    hospital: ['Nairobi General Hospital', 'upper-hill'],
    university: ['Nairobi City University', 'cbd'],
  }),
  london: city({
    'ministry-finance': ['The Treasury', 'southbank', 'Horse Guards Road'],
    'central-bank': ['Central Bank', 'city', 'Threadneedle Street'],
    'stock-exchange': ['Stock Exchange', 'city', 'Paternoster Square'],
    chamber: ['London Chamber of Commerce', 'city', 'Cannon Street'],
    'high-court': ['High Court', 'city', 'Strand'],
    'tax-office': ['Tax Office', 'canary-wharf'],
    embassy: ['Belgravia Visa Centre', 'mayfair', 'Grosvenor Square'],
    ipa: ['Investment Promotion Agency', 'canary-wharf'],
    'tech-hub': ['Shoreditch Founders’ Hub', 'shoreditch', 'Old Street'],
    'members-club': ['The Wexford Club', 'mayfair', 'Pall Mall'],
    'family-office': ['Fairhaven Family Office Tower', 'mayfair', 'Berkeley Square'],
    hospital: ['St Aldwyn’s Hospital', 'borough'],
    university: ['City of London University', 'camden'],
  }),
  accra: city({
    'ministry-finance': ['Ministry of Finance', 'jamestown', 'Liberia Road'],
    'central-bank': ['Central Bank', 'jamestown', 'Thorpe Road'],
    'stock-exchange': ['Stock Exchange', 'airport-city', 'Liberation Road'],
    chamber: ['Accra Chamber of Commerce', 'osu', 'Oxford Street'],
    'high-court': ['High Court', 'jamestown', 'High Street'],
    'tax-office': ['Tax Office', 'makola', 'Kinbu Road'],
    embassy: ['Cantonments Visa Centre', 'cantonments', 'Fourth Circular Road'],
    ipa: ['Investment Promotion Agency', 'airport-city'],
    'tech-hub': ['Osu Founders’ Hub', 'osu'],
    'members-club': ['The Ridge House', 'cantonments'],
    'family-office': ['Goldcoast Family Office Tower', 'airport-city'],
    hospital: ['Accra General Hospital', 'osu'],
    university: ['Accra City University', 'east-legon'],
  }),
  freetown: city({
    'ministry-finance': ['Ministry of Finance', 'central', 'George Street'],
    'central-bank': ['Central Bank', 'central', 'Siaka Stevens Street'],
    'stock-exchange': ['Stock Exchange', 'central', 'Wallace Johnson Street'],
    chamber: ['Freetown Chamber of Commerce', 'central', 'Rawdon Street'],
    'high-court': ['High Court', 'central', 'Tower Hill'],
    'tax-office': ['Tax Office', 'kissy', 'Kissy Road'],
    embassy: ['Hill Station Visa Centre', 'wilberforce', 'Spur Road'],
    ipa: ['Investment Promotion Agency', 'wilberforce'],
    'tech-hub': ['Congo Cross Founders’ Hub', 'congo-cross'],
    'members-club': ['The Aberdeen House', 'aberdeen', 'Cape Road'],
    'family-office': ['Lion Mountain Family Office Tower', 'aberdeen'],
    hospital: ['Freetown General Hospital', 'central'],
    university: ['Freetown City University', 'lumley'],
  }),
  kigali: city({
    'ministry-finance': ['Ministry of Finance', 'nyarugenge', 'KN 3 Avenue'],
    'central-bank': ['Central Bank', 'nyarugenge', 'KN 6 Avenue'],
    'stock-exchange': ['Stock Exchange', 'kiyovu'],
    chamber: ['Kigali Chamber of Commerce', 'kacyiru'],
    'high-court': ['High Court', 'kacyiru', 'KG 7 Avenue'],
    'tax-office': ['Tax Office', 'kimihurura'],
    embassy: ['Kacyiru Visa Centre', 'kacyiru'],
    ipa: ['Investment Promotion Agency', 'kimihurura', 'KG 220 Street'],
    'tech-hub': ['Kigali Founders’ Hub', 'kimihurura'],
    'members-club': ['The Hillside Club', 'kiyovu'],
    'family-office': ['Hillcrest Family Office Tower', 'kiyovu'],
    hospital: ['Kigali General Hospital', 'nyarugenge'],
    university: ['Kigali City University', 'remera'],
  }),
  johannesburg: city({
    'ministry-finance': ['Treasury Office', 'marshalltown', 'Market Street'],
    'central-bank': ['Central Bank', 'marshalltown', 'Fox Street'],
    'stock-exchange': ['Stock Exchange', 'sandton', 'Gwen Lane'],
    chamber: ['Johannesburg Chamber of Commerce', 'rosebank'],
    'high-court': ['High Court', 'marshalltown', 'Pritchard Street'],
    'tax-office': ['Tax Office', 'braamfontein'],
    embassy: ['Rosebank Visa Centre', 'rosebank', 'Oxford Road'],
    ipa: ['Investment Promotion Agency', 'sandton'],
    'tech-hub': ['Braamfontein Founders’ Hub', 'braamfontein', 'Juta Street'],
    'members-club': ['The Highveld Club', 'sandton', 'Maude Street'],
    'family-office': ['Summit Family Office Tower', 'sandton', 'Rivonia Road'],
    hospital: ['Johannesburg General Hospital', 'braamfontein'],
    university: ['Johannesburg City University', 'braamfontein'],
  }),
  cairo: city({
    'ministry-finance': ['Ministry of Finance', 'downtown'],
    'central-bank': ['Central Bank', 'downtown', 'Qasr El Nil Street'],
    'stock-exchange': ['Stock Exchange', 'downtown', 'Sherifein Street'],
    chamber: ['Cairo Chamber of Commerce', 'garden-city'],
    'high-court': ['High Court', 'downtown', '26th of July Street'],
    'tax-office': ['Tax Office', 'heliopolis'],
    embassy: ['Garden City Visa Centre', 'garden-city'],
    ipa: ['Investment Promotion Agency', 'new-cairo'],
    'tech-hub': ['Maadi Founders’ Hub', 'maadi'],
    'members-club': ['The Lotus House', 'zamalek'],
    'family-office': ['Nile Family Office Tower', 'garden-city', 'Corniche El Nil'],
    hospital: ['Cairo General Hospital', 'garden-city'],
    university: ['Cairo City University', 'new-cairo'],
  }),
  dubai: city({
    'ministry-finance': ['Ministry of Finance', 'creek'],
    'central-bank': ['Central Bank', 'difc'],
    'stock-exchange': ['Stock Exchange', 'difc', 'Gate Avenue'],
    chamber: ['Dubai Chamber of Commerce', 'deira', 'Baniyas Road'],
    'high-court': ['High Court', 'difc'],
    'tax-office': ['Tax Office', 'business-bay'],
    embassy: ['Consulate Visa Centre', 'jumeirah'],
    ipa: ['Investment Promotion Agency', 'business-bay'],
    'tech-hub': ['Al Quoz Founders’ Hub', 'al-quoz'],
    'members-club': ['The Falcon Club', 'jumeirah'],
    'family-office': ['Pearl Family Office Tower', 'difc', 'Sheikh Zayed Road'],
    hospital: ['Dubai General Hospital', 'jumeirah'],
    university: ['Dubai City University', 'business-bay'],
  }),
  'san-francisco': city({
    'ministry-finance': ['Treasury Building', 'fidi', 'Sansome Street'],
    'central-bank': ['Central Bank', 'fidi', 'Market Street'],
    'stock-exchange': ['Stock Exchange', 'fidi', 'Pine Street'],
    chamber: ['San Francisco Chamber of Commerce', 'fidi', 'Montgomery Street'],
    'high-court': ['High Court', 'soma', 'McAllister Street'],
    'tax-office': ['Tax Office', 'soma'],
    embassy: ['Consular Row Visa Centre', 'presidio'],
    ipa: ['Investment Promotion Agency', 'fidi'],
    'tech-hub': ['SoMa Founders’ Hub', 'soma', 'Folsom Street'],
    'members-club': ['The Telegraph Hill Club', 'north-beach'],
    'family-office': ['Embarcadero Family Office Tower', 'wharf'],
    hospital: ['San Francisco General Hospital', 'mission'],
    university: ['Bay City University', 'castro'],
  }),
};

/**
 * First class, properly (player feedback: "The first class just shows a
 * private seat: improve this experience to actually show how it is in
 * flight, and also a first-class lounge in the airport for waiting").
 *
 * What the lounge and the flight share: the acts and their labels, how an
 * act's effects read ("Hunger +40 · Stress −4"), the people you wait with
 * (made-up premium travellers beside the players flying up front), the crew
 * and the menu. The engine (`travel.lounge`, `travel.inflight`) decides
 * what each act does; this only shows it.
 */
import { t } from '../../i18n';
import { avatarLook, type AvatarLook } from '../art';
import { fnv, seeded } from '../travel';

export type Premium = 'business' | 'first';
export const isPremium = (c: string | undefined | null): c is Premium =>
  c === 'business' || c === 'first';

/** What a moment does to you (the engine's numbers). */
export interface PremiumFx {
  energy?: number;
  stress?: number;
  health?: number;
  hunger?: number;
  hygiene?: number;
  fun?: number;
  social?: number;
  network?: number;
  hours?: number;
}

export type LoungeActId = 'dine' | 'drink' | 'shower' | 'rest' | 'mingle';
export type InflightActId = 'dine' | 'sleep' | 'watch' | 'work' | 'bar' | 'spa';

export const LOUNGE_ICON: Record<LoungeActId, string> = {
  dine: '🍽️',
  drink: '🥂',
  shower: '🚿',
  rest: '🛋️',
  mingle: '🤝',
};

export const INFLIGHT_ICON: Record<InflightActId, string> = {
  dine: '🍽️',
  sleep: '🛏️',
  watch: '🎬',
  work: '💼',
  bar: '🍸',
  spa: '🚿',
};

/** The lounge's acts, as a button reads. */
export function loungeLabel(act: LoungeActId, cabin: Premium): string {
  switch (act) {
    case 'dine':
      return cabin === 'first' ? t('Dine à la carte') : t('Hot buffet');
    case 'drink':
      return cabin === 'first' ? t('Champagne at the bar') : t('A drink at the bar');
    case 'shower':
      return t('Shower suite');
    case 'rest':
      return cabin === 'first' ? t('Daybed in the quiet room') : t('Rest in the quiet area');
    default:
      return t('Meet the other travellers');
  }
}

/** The flight's acts, as a button reads. */
export function inflightLabel(act: InflightActId, cabin: Premium): string {
  switch (act) {
    case 'dine':
      return cabin === 'first' ? t('Dine on demand') : t('Three-course meal');
    case 'sleep':
      return cabin === 'first' ? t('Turndown: make up my bed') : t('Lie flat and sleep');
    case 'watch':
      return t('Watch a film');
    case 'work':
      return t('Work');
    case 'bar':
      return t('Onboard bar');
    default:
      return t('Shower spa');
  }
}

const signed = (n: number) => (n > 0 ? `+${n}` : `−${-n}`);

/** "Hunger +40 · Stress −4" (only what changes). */
export function fxLine(fx: PremiumFx): string {
  const bits: string[] = [];
  const add = (n: number | undefined, label: (v: string) => string) => {
    if (n) bits.push(label(signed(n)));
  };
  add(fx.energy, (v) => t('Energy {n}', { n: v }));
  add(fx.hunger, (v) => t('Hunger {n}', { n: v }));
  add(fx.hygiene, (v) => t('Hygiene {n}', { n: v }));
  add(fx.fun, (v) => t('Fun {n}', { n: v }));
  add(fx.social, (v) => t('Social {n}', { n: v }));
  add(fx.stress, (v) => t('Stress {n}', { n: v }));
  add(fx.health, (v) => t('Health {n}', { n: v }));
  add(fx.network, (v) => t('Network {n}', { n: v }));
  if (fx.hours) bits.push(t('{h}h back this month', { h: fx.hours }));
  return bits.join(' · ');
}

/** Add one set of effects to another (what the whole flight did). */
export function addFx(a: PremiumFx, b: PremiumFx): PremiumFx {
  const out: PremiumFx = { ...a };
  for (const [k, v] of Object.entries(b) as [keyof PremiumFx, number][])
    if (typeof v === 'number') out[k] = (out[k] ?? 0) + v;
  return out;
}

// ---------------------------------------------------------------------------
// The people

export interface Traveller {
  id: string;
  name: string;
  /** Who they are, in a few words. */
  role: string;
  look: AvatarLook;
  /** A player waiting for a flight too (from the server), not a made-up one. */
  player?: boolean;
  to?: string;
}

const FIRST_NAMES = [
  'Adaeze',
  'Kwame',
  'Amara',
  'Tunde',
  'Wanjiru',
  'Youssef',
  'Naledi',
  'Oliver',
  'Priya',
  'Mariam',
  'Daniel',
  'Zainab',
];
const LAST_NAMES = [
  'Okafor',
  'Mensah',
  'Kamau',
  'Haddad',
  'Dlamini',
  'Bennett',
  'Shah',
  'Diallo',
  'Mutua',
  'Adeyemi',
];
const ROLES = [
  () => t('Venture partner, flying to a board meeting'),
  () => t('Founder, Series B in the bag'),
  () => t('Bank chief executive'),
  () => t('Angel investor'),
  () => t('Private equity partner'),
  () => t('Fintech founder'),
  () => t('Family office principal'),
  () => t('Surgeon, off to a conference'),
];
const BGS = ['i-banker', 'f-corporate', 'i-operator', 'f-second-time', 'i-corporate', 'f-banker'];

/** Made-up travellers in this lounge today (the same ones for the same airport and day). */
export function loungeCrowd(marketId: string, day: string, cabin: Premium, n = 5): Traveller[] {
  const rnd = seeded(fnv(`${marketId}:${day}:${cabin}:lounge`));
  return Array.from({ length: n }, (_, k) => {
    const first = FIRST_NAMES[Math.floor(rnd() * FIRST_NAMES.length)]!;
    const last = LAST_NAMES[Math.floor(rnd() * LAST_NAMES.length)]!;
    const role = ROLES[Math.floor(rnd() * ROLES.length)]!();
    const bg = BGS[(k + Math.floor(rnd() * BGS.length)) % BGS.length]!;
    return {
      id: `lounge:${marketId}:${k}`,
      name: `${first} ${last}`,
      role,
      look: avatarLook(bg, `lounge:${marketId}:${day}:${k}`),
    };
  });
}

/** Cabin crew and lounge staff: a uniform over a person. */
export function staffLook(seed: string, uniform = '#1e293b', scarf = true): AvatarLook {
  const base = avatarLook('b-commercial', seed);
  return {
    ...base,
    top: uniform,
    bottom: uniform,
    accessory: scarf ? 'scarf' : 'tie',
    topStyle: 'blazer',
    glasses: 'none',
    headwear: 'none',
  };
}

const CREW_NAMES = ['Amaka', 'Sophie', 'Kofi', 'Leila', 'James', 'Nia'];
export const crewName = (seed: string) => CREW_NAMES[fnv(seed) % CREW_NAMES.length]!;

// ---------------------------------------------------------------------------
// The menu

export interface Course {
  id: 'amuse' | 'starter' | 'main' | 'dessert' | 'cheese';
  name: () => string;
  /** The plate's colours for the drawings: the plate, then what's on it. */
  colors: [string, string];
}

/** First class: dine on demand, five courses; business: three. */
export function menuFor(cabin: Premium): Course[] {
  const first: Course[] = [
    {
      id: 'amuse',
      name: () => t('Caviar with blinis and crème fraîche'),
      colors: ['#f8fafc', '#111827'],
    },
    {
      id: 'starter',
      name: () => t('Seared scallops, cauliflower purée'),
      colors: ['#f8fafc', '#fde68a'],
    },
    {
      id: 'main',
      name: () => t('Fillet of beef, jollof risotto, greens'),
      colors: ['#f8fafc', '#7c2d12'],
    },
    { id: 'cheese', name: () => t('A selection of cheeses'), colors: ['#f8fafc', '#facc15'] },
    {
      id: 'dessert',
      name: () => t('Chocolate fondant, vanilla ice cream'),
      colors: ['#f8fafc', '#451a03'],
    },
  ];
  if (cabin === 'first') return first;
  return [
    { id: 'starter', name: () => t('Smoked salmon salad'), colors: ['#f8fafc', '#fb923c'] },
    { id: 'main', name: () => t('Chicken suya with plantain'), colors: ['#f8fafc', '#b45309'] },
    { id: 'dessert', name: () => t('Lemon tart'), colors: ['#f8fafc', '#fde047'] },
  ];
}

/** The flight's moments, in order. */
export type FlightStage = 'boarding' | 'meal' | 'night' | 'arrival';
export const FLIGHT_STAGES: FlightStage[] = ['boarding', 'meal', 'night', 'arrival'];
export const stageLabel = (s: FlightStage) =>
  s === 'boarding'
    ? t('Take-off')
    : s === 'meal'
      ? t('Meal')
      : s === 'night'
        ? t('Sleep')
        : t('Arrival');

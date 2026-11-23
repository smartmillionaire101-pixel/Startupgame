/**
 * Who you see at the airport: travellers (mostly from this city, some from
 * everywhere the flights come from, in everyday clothes) and the staff in
 * their uniforms (check-in and gate agents, security, passport officers,
 * drivers, a barista). Deterministic from a seed.
 */
import { defaultAppearance, seedGender, type MarketId } from '@runway/engine';
import { lookFromAppearance, type AvatarLook } from '../art';
import { staffLook } from '../premium/premium';
import { fnv } from '../travel';

const CITIES: MarketId[] = [
  'lagos',
  'nairobi',
  'london',
  'accra',
  'johannesburg',
  'cairo',
  'dubai',
  'san-francisco',
];
const BOTTOMS = ['#1e293b', '#111827', '#334155', '#78350f', '#1e3a8a', '#3f3f46'];
const TOPS = [
  '#0ea5e9',
  '#f97316',
  '#16a34a',
  '#be123c',
  '#f8fafc',
  '#7c3aed',
  '#eab308',
  '#0f766e',
  '#334155',
  '#db2777',
  '#a16207',
];
const STYLES = ['tee', 'shirt', 'hoodie', 'blazer', 'tee', 'shirt', 'dress', 'blouse'] as const;

/** A traveller (seeded). */
export function travellerLook(seed: string, city: string): AvatarLook {
  const h = fnv(seed);
  const from = (h % 10 < 6 ? city : CITIES[h % CITIES.length]!) as MarketId;
  const g = seedGender(seed);
  const a = defaultAppearance(seed, g, from);
  const style = STYLES[(h >>> 5) % STYLES.length]!;
  const topStyle = g === 'male' && (style === 'dress' || style === 'blouse') ? 'shirt' : style;
  return {
    ...lookFromAppearance(a, g, BOTTOMS[h % BOTTOMS.length]!),
    top: TOPS[(h >>> 9) % TOPS.length]!,
    topStyle,
    headwear: 'none',
  };
}

export type StaffRole =
  'agent' | 'security' | 'officer' | 'driver' | 'barista' | 'clerk' | 'crew' | 'ground';

/** Staff in uniform: a local face, the role's clothes. */
export function uniformLook(seed: string, role: StaffRole, airline = '#1e293b'): AvatarLook {
  const base = staffLook(seed, airline);
  switch (role) {
    case 'agent':
      return { ...base, top: airline, bottom: '#111827' };
    case 'crew':
      return { ...base, top: airline, bottom: airline };
    case 'security':
      return {
        ...base,
        topStyle: 'shirt',
        top: '#f1f5f9',
        bottom: '#111827',
        accessory: 'tie',
        tie: 'navy',
      } as AvatarLook;
    case 'officer':
      return { ...base, top: '#1e293b', bottom: '#1e293b', accessory: 'tie' };
    case 'driver':
      return { ...base, top: '#111827', bottom: '#111827', accessory: 'tie' };
    case 'barista':
      return { ...base, topStyle: 'shirt', top: '#14532d', bottom: '#1c1917', accessory: 'none' };
    case 'clerk':
      return { ...base, topStyle: 'tee', top: '#6d28d9', bottom: '#111827', accessory: 'none' };
    case 'ground':
      return { ...base, topStyle: 'hoodie', top: '#f59e0b', bottom: '#1f2937', accessory: 'none' };
  }
}

/**
 * Every club its own room (player feedback: "The clubs all look the same").
 *
 * ./nightlife.ts gives a club its city's style (its sound, its floor plan,
 * its crowd's dress), so two clubs in one city used to share one room. A
 * club look sits on top of that style: its material (a concrete warehouse, a
 * velvet lounge, gold and champagne, white marble, tropical, a techno
 * bunker, neon), its palette, its light rig (beams, lasers, strobes, an LED
 * wall, chandeliers), its dance floor's shape, its DJ booth, a VIP mezzanine
 * or not, how full it gets, and its name in lights over the floor.
 *
 * Pure and client-side: picked from the venue's city, id, name and district
 * (no engine data, so old logs replay unchanged). The same club always gets
 * the same look. A club in an upscale district (or with a name that says so)
 * is a `luxe` tier: gold, marble or velvet, chandeliers, a VIP mezzanine.
 */
import { hash } from './contract';
import type { NightStyle } from './nightlife';

export type ClubTier = 'street' | 'mid' | 'luxe';
export type ClubTheme = 'warehouse' | 'techno' | 'neon' | 'velvet' | 'tropical' | 'gold' | 'marble';
export type FloorShape = 'grid' | 'wide' | 'round' | 'raised';
export type BoothStyle = 'deck' | 'riser' | 'pod' | 'throne';
export type Rig = 'beams' | 'lasers' | 'strobes' | 'ledwall' | 'chandeliers';
export type SignFont = 'sans' | 'serif' | 'mono' | 'script';

export interface ClubLook {
  /** Stable, for data attributes and tests: "gold2-round-chandeliers-throne-l-mz". */
  key: string;
  tier: ClubTier;
  theme: ClubTheme;
  /** Three light colours. */
  glow: [string, string, string];
  wall: string;
  /** The 2D floor. */
  floor: string;
  floor3d: NightStyle['floor3d'];
  floorTint?: string;
  accent: string;
  floorShape: FloorShape;
  booth: BoothStyle;
  rig: Rig;
  /** A raised VIP gallery along the side wall. */
  mezzanine: boolean;
  /** A roped-off VIP corner (luxe clubs always have one). */
  vip: boolean;
  /** Over the style's crowd: exclusive (luxe) or packed (street), and this club's pull. */
  crowd: number;
  /** The club's name in lights. */
  sign: string;
  font: SignFont;
  /** What kind of room it is, under the title (translated with tx). */
  label: string;
}

interface Theme {
  label: string;
  wall: string;
  floor: string;
  floor3d: NightStyle['floor3d'];
  floorTint?: string;
  accent: string;
  palettes: [string, string, string][];
  font: SignFont;
  rigs: Rig[];
  booths: BoothStyle[];
}

export const THEMES: Record<ClubTheme, Theme> = {
  warehouse: {
    label: 'Concrete warehouse',
    wall: '#3f3f46',
    floor: '#27272a',
    floor3d: 'concrete',
    floorTint: '#71717a',
    accent: '#52525b',
    palettes: [
      ['#f43f5e', '#f8fafc', '#38bdf8'],
      ['#22c55e', '#a3e635', '#f8fafc'],
      ['#f97316', '#fde047', '#f8fafc'],
    ],
    font: 'mono',
    rigs: ['strobes', 'lasers', 'beams'],
    booths: ['riser', 'deck'],
  },
  techno: {
    label: 'Techno bunker',
    wall: '#0a0a0a',
    floor: '#111111',
    floor3d: 'concrete',
    floorTint: '#3f3f46',
    accent: '#18181b',
    palettes: [
      ['#ef4444', '#f8fafc', '#b91c1c'],
      ['#06b6d4', '#3b82f6', '#e0f2fe'],
      ['#a3e635', '#f8fafc', '#65a30d'],
    ],
    font: 'mono',
    rigs: ['lasers', 'strobes', 'ledwall'],
    booths: ['riser', 'pod'],
  },
  neon: {
    label: 'Neon club',
    wall: '#1a0b2e',
    floor: '#0f0a1e',
    floor3d: 'dance',
    accent: '#7e22ce',
    palettes: [
      ['#ec4899', '#22d3ee', '#a3e635'],
      ['#a855f7', '#f59e0b', '#22d3ee'],
      ['#f43f5e', '#8b5cf6', '#2dd4bf'],
    ],
    font: 'sans',
    rigs: ['ledwall', 'beams', 'lasers'],
    booths: ['deck', 'pod'],
  },
  velvet: {
    label: 'Velvet lounge',
    wall: '#3b0a1a',
    floor: '#4c0519',
    floor3d: 'carpet',
    floorTint: '#7f1d1d',
    accent: '#9f1239',
    palettes: [
      ['#f43f5e', '#fbbf24', '#c084fc'],
      ['#e11d48', '#f9a8d4', '#fde68a'],
    ],
    font: 'script',
    rigs: ['chandeliers', 'beams'],
    booths: ['throne', 'deck'],
  },
  tropical: {
    label: 'Tropical club',
    wall: '#064e3b',
    floor: '#3f2a1c',
    floor3d: 'oak',
    accent: '#ea580c',
    palettes: [
      ['#f97316', '#22c55e', '#facc15'],
      ['#fb7185', '#2dd4bf', '#fde047'],
    ],
    font: 'script',
    rigs: ['beams', 'ledwall'],
    booths: ['pod', 'deck'],
  },
  gold: {
    label: 'Gold and champagne',
    wall: '#0c0a09',
    floor: '#1c1917',
    floor3d: 'marble',
    floorTint: '#44403c',
    accent: '#ca8a04',
    palettes: [
      ['#fbbf24', '#fde68a', '#f59e0b'],
      ['#fbbf24', '#e0e7ff', '#c084fc'],
    ],
    font: 'serif',
    rigs: ['chandeliers', 'lasers'],
    booths: ['throne', 'riser'],
  },
  marble: {
    label: 'White marble',
    wall: '#d6d3d1',
    floor: '#e7e5e4',
    floor3d: 'marble',
    floorTint: '#f5f5f4',
    accent: '#1e3a8a',
    palettes: [
      ['#60a5fa', '#e0f2fe', '#c4b5fd'],
      ['#38bdf8', '#f0abfc', '#f8fafc'],
    ],
    font: 'serif',
    rigs: ['chandeliers', 'ledwall', 'beams'],
    booths: ['throne', 'pod'],
  },
};

const TIER_THEMES: Record<ClubTier, ClubTheme[]> = {
  luxe: ['gold', 'marble', 'velvet'],
  mid: ['neon', 'velvet', 'tropical', 'techno'],
  street: ['warehouse', 'techno', 'neon'],
};

/** Districts where a night out costs more (by city). */
const UPSCALE = new Set([
  'victoria-island',
  'ikoyi',
  'mayfair',
  'marina',
  'difc',
  'downtown-dubai',
  'sandton',
  'rosebank',
  'zamalek',
  'kimihurura',
  'airport-city',
  'kilimani',
  'aberdeen',
  'pacific-heights',
]);

/** Districts where clubs are raw rooms. */
const GRITTY = new Set([
  'shoreditch',
  'soma',
  'braamfontein',
  'eastleigh',
  'congo-cross',
  'camden',
  'downtown',
  'maboneng',
]);

const LUXE_NAME = /velvet|gold|platinum|royal|elite|luxe|lux|vip|diamond|marina|champagne/i;
const STREET_NAME = /warehouse|basement|arches|underground|bunker|yard|garage/i;

/** The cities by the sea, where a club leans tropical. */
const COAST = new Set(['lagos', 'accra', 'freetown', 'dubai']);

/** A name's own word picks the theme ("Velvet", "Neon", "Warehouse"). */
const NAME_THEME: [RegExp, ClubTheme][] = [
  [/velvet/i, 'velvet'],
  [/neon/i, 'neon'],
  [/warehouse|arches/i, 'warehouse'],
  [/basement|bunker|pulse/i, 'techno'],
  [/gold|champagne/i, 'gold'],
  [/marble|white/i, 'marble'],
  [/beach|sands|palm|tropic|atlantic/i, 'tropical'],
];

const pick = <T>(xs: readonly T[], h: number): T => xs[h % xs.length]!;

export interface ClubVenue {
  market: string;
  id: string;
  kind: string;
  name?: string;
  district?: string;
}

/** Whether a venue gets a club look: a nightclub with a dance floor indoors. */
export function hasClubLook(v: ClubVenue, style: NightStyle | null): style is NightStyle {
  return (
    !!style &&
    v.kind.toLowerCase() === 'nightclub' &&
    (style.layout === 'dancefloor' || style.layout === 'warehouse')
  );
}

/** The tier of a club: its district first, then its name, else mid. */
export function clubTier(v: ClubVenue): ClubTier {
  const name = v.name ?? '';
  if (STREET_NAME.test(name)) return 'street';
  if (LUXE_NAME.test(name)) return 'luxe';
  const d = (v.district ?? '').toLowerCase();
  if (UPSCALE.has(d)) return 'luxe';
  if (GRITTY.has(d)) return 'street';
  return 'mid';
}

/**
 * A club's look. Deterministic: the same city, id, name and district always
 * give the same look; different clubs (even in one city, with one style)
 * mostly get different ones.
 */
export function clubLookOf(v: ClubVenue, style: NightStyle): ClubLook {
  const seed = `${v.market}:${v.id}`;
  const h = (salt: string) => hash(`${seed}:${salt}`);
  const tier = clubTier(v);
  const name = v.name ?? '';
  const named = NAME_THEME.find(([re]) => re.test(name))?.[1];
  let themes = TIER_THEMES[tier];
  if (COAST.has(v.market) && tier !== 'luxe') themes = [...themes, 'tropical'];
  // A name that says what it is wins ("Velvet Arches" is velvet, however raw the street).
  const theme = named ?? pick(themes, h('theme'));
  const th = THEMES[theme];
  const palette = h('palette') % th.palettes.length;
  const glow = th.palettes[palette]!;
  const shapes: FloorShape[] =
    tier === 'luxe' ? ['round', 'raised', 'grid'] : ['grid', 'wide', 'round', 'raised'];
  const floorShape = pick(shapes, h('floor'));
  const booth = pick(th.booths, h('booth'));
  const rig = pick(th.rigs, h('rig'));
  const mezzanine = tier === 'luxe' || h('mezz') % 3 === 0;
  const vip = tier === 'luxe' || style.props.includes('vip');
  // Exclusive rooms let fewer in; raw rooms pack them; each club has its own pull.
  const pull = 0.9 + (h('pull') % 5) * 0.05;
  const crowd = (tier === 'luxe' ? 0.85 : tier === 'street' ? 1.15 : 1) * pull;
  const sign = (name || style.neon || '').toUpperCase().slice(0, 24);
  const key = `${theme}${palette + 1}-${floorShape}-${rig}-${booth}-${tier[0]}${mezzanine ? '-mz' : ''}`;
  return {
    key,
    tier,
    theme,
    glow,
    wall: th.wall,
    floor: th.floor,
    floor3d: th.floor3d,
    ...(th.floorTint ? { floorTint: th.floorTint } : {}),
    accent: th.accent,
    floorShape,
    booth,
    rig,
    mezzanine,
    vip,
    crowd: Math.round(crowd * 100) / 100,
    sign,
    font: th.font,
    label: th.label,
  };
}

/** How full a club is at this local hour: quiet early, packed after eleven. */
export function hourCrowd(hour: number): number {
  const h = ((hour % 24) + 24) % 24;
  if (h >= 23 || h < 3) return 1.15;
  if (h >= 21) return 1;
  if (h >= 3 && h < 6) return 0.8;
  return 0.7;
}

/**
 * The style a club is drawn with: its city's style (sound, plan, dress) in
 * its own look. Other venues come back unchanged.
 */
export function clubStyleOf(
  v: ClubVenue,
  style: NightStyle | null,
  hour?: number,
): NightStyle | null {
  if (!hasClubLook(v, style)) return style;
  const look = clubLookOf(v, style);
  const crowd = style.crowd * look.crowd * (hour === undefined ? 1 : hourCrowd(hour));
  const out: NightStyle = {
    ...style,
    wall: look.wall,
    floor: look.floor,
    floor3d: look.floor3d,
    accent: look.accent,
    glow: look.glow,
    crowd: Math.round(Math.max(0.6, Math.min(1.6, crowd)) * 100) / 100,
    club: look,
  };
  if (look.floorTint) out.floorTint = look.floorTint;
  else delete out.floorTint;
  return out;
}

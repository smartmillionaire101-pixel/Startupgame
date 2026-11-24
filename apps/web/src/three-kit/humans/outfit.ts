/**
 * A look (`AvatarLook`, or the city's `CharacterLook`) as one of the CC0
 * Quaternius modular people (public/models/people/{men,women}.glb): which
 * head, top, legs and shoes to wear from the kit, and the colour each of
 * their materials takes (skin, hair, the top's and the trousers' colours,
 * the shoes, a tie). Pure: no three.js, so it is unit-tested
 * (test/outfit.test.ts) and the same look always comes out the same.
 *
 * The kit's parts are named `<Outfit>_<Part>` (Suit_Body, Casual2_Legs…);
 * every material of a part is named in the kit (Skin, Hair, Suit, White…).
 */
import { legsColour, shoeColour, SHIRT_WHITE, BLOUSE_IVORY, TIE_COLOUR } from '../../avatar/worn';
import { facialHairColour } from '../../avatar/tone';
import type { FaceHair } from './face';

export interface OutfitLook {
  skin: string;
  hair: string;
  hairStyle: string;
  top: string;
  bottom: string;
  gender?: 'female' | 'male';
  topStyle?: string;
  headwear?: string;
  facialHair?: string;
  accessory?: string;
  shoes?: string;
  legs?: string;
  tie?: string;
  trousers?: boolean;
}

export type Kit = 'men' | 'women';

export interface Outfit {
  kit: Kit;
  /** Kit node names, e.g. 'Suit_Head', 'Casual2_Body'. */
  head: string;
  body: string;
  legs: string;
  feet: string;
  /** Show the head's own hair (else it is hidden: bald, or our own hair drawn over it). */
  modelHair: boolean;
  /** `${node}/${material}` → colour (#rrggbb). Materials not listed keep the kit's colour. */
  colours: Record<string, string>;
  /** Facial hair grown on the head's jaw (./face.ts), and its colour. */
  facialHair?: { style: FaceHair; colour: string };
  /** Close-cropped hair grown over the bare head (under a hat, a buzz cut, under twists): its colour. */
  scalp?: string;
}

const FACE_HAIR = new Set<string>(['beard', 'stubble', 'moustache', 'goatee']);

/** Hairstyles the kit's heads have no match for: drawn by our own hair over a bare head. */
export const OWN_HAIR = new Set(['afro', 'twists', 'bald']);
/**
 * And per kit, styles its heads only roughly match: a man's bun, braids and
 * locs (the kit's nearest is slicked-back hair), a woman's buzz cut, braids
 * and locs (the nearest is a bob): our own hair, fitted to the bare head
 * (../../interiors3d/characterHead.ts).
 */
const OWN_HAIR_KIT: Record<Kit, ReadonlySet<string>> = {
  men: new Set(['bun', 'braids', 'locs']),
  women: new Set(['buzz', 'braids', 'locs']),
};

/** The kit's head for a hairstyle (its own hair shown), per kit. */
const HAIR_HEAD: Record<Kit, Record<string, string>> = {
  men: {
    short: 'Suit',
    buzz: 'Casual',
    curly: 'Casual2',
    long: 'Casual2',
    bun: 'Casual2',
    // Without our own hair (the city): the nearest head with hair.
    afro: 'Casual2',
    braids: 'Casual2',
    locs: 'Casual2',
    twists: 'Beach',
    bald: 'Suit',
  },
  women: {
    long: 'Casual',
    short: 'Casual',
    buzz: 'Casual',
    bun: 'Formal',
    curly: 'Formal',
    afro: 'Formal',
    braids: 'Casual',
    locs: 'Casual',
    twists: 'Formal',
    bald: 'Casual',
  },
};

/** The material each part's hair, garment or shoe is drawn in. */
const HAIR_MAT: Record<string, string> = {
  Casual2_Head: 'Hair',
  Casual_Head: 'Hair',
  Suit_Head: 'Hair',
  Beach_Head: 'Hair',
  'women:Casual_Head': 'Hair_Blond',
  'women:Suit_Head': 'Hair_Blond',
  'women:Formal_Head': 'Red',
};
/** The material a head's own hair is drawn in. */
export const hairMaterial = (kit: Kit, head: string): string | undefined =>
  HAIR_MAT[`${kit}:${head}`] ?? (kit === 'men' ? HAIR_MAT[head] : undefined);
const BROW_MAT: Record<Kit, string> = { men: 'Eyebrows', women: 'Hair_Brown' };
const TOP_MAT: Record<string, string> = {
  'men:Casual2_Body': 'LightBrown',
  'men:Casual_Body': 'Purple',
  'men:Suit_Body': 'Suit',
  'men:Beach_Body': 'LightBrown',
  'women:Casual_Body': 'White',
  'women:Suit_Body': 'Black',
  'women:Formal_Body': 'LimeGreen',
  'women:Formal_Legs': 'LimeGreen',
};
const LEGS_MAT: Record<string, string> = {
  'men:Casual2_Legs': 'LightBlue',
  'men:Casual_Legs': 'LightBlue',
  'men:Suit_Legs': 'Suit',
  'men:Beach_Legs': 'Red_Dark',
  'women:Casual_Legs': 'Orange',
  'women:Suit_Legs': 'Black',
};
const SHOE_MAT: Record<string, string> = {
  'men:Casual2_Feet': 'Red_Dark',
  'men:Casual_Feet': 'Purple',
  'men:Suit_Feet': 'Black',
  'men:Beach_Feet': 'Red_Dark',
  'men:Worker_Feet': 'Grey',
  'women:Casual_Feet': 'Grey',
  'women:Formal_Feet': 'Red',
  'women:Suit_Feet': 'Black',
  'women:Punk_Feet': 'Black',
};

const hex = (s: string) => {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(s.trim());
  if (!m) return null;
  const h = m[1]!;
  return h.length === 3
    ? `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`.toLowerCase()
    : `#${h.toLowerCase()}`;
};
/** Mix two colours (t = 0: a, 1: b). */
export function mix(a: string, b: string, t: number): string {
  const x = hex(a) ?? '#000000';
  const y = hex(b) ?? '#000000';
  const c = (s: string, i: number) => parseInt(s.slice(1 + i * 2, 3 + i * 2), 16);
  let out = '#';
  for (let i = 0; i < 3; i++)
    out += Math.round(c(x, i) + (c(y, i) - c(x, i)) * t)
      .toString(16)
      .padStart(2, '0');
  return out;
}

/** What a look wears from the kit. `ownHair`: our own hair can be drawn over a bare head. */
export function outfitFor(look: OutfitLook, opts: { ownHair?: boolean } = {}): Outfit {
  const ownHair = opts.ownHair ?? true;
  const kit: Kit = look.gender === 'female' ? 'women' : 'men';
  const style = look.topStyle ?? 'tee';
  const suit = style === 'suit' || style === 'blazer';
  const shoes = look.shoes && look.shoes !== 'none' ? look.shoes : null;
  const legsWorn = look.legs && look.legs !== 'none' ? look.legs : null;

  // Head: the hairstyle's head; headwear or a style the kit hasn't got: our own hair.
  const headwear = (look.headwear && look.headwear !== 'none') || look.accessory === 'cap';
  const own =
    ownHair && (OWN_HAIR.has(look.hairStyle) || OWN_HAIR_KIT[kit].has(look.hairStyle) || headwear);
  const headOutfit = HAIR_HEAD[kit][look.hairStyle] ?? HAIR_HEAD[kit].short!;
  const modelHair = !own && look.hairStyle !== 'bald';

  let body: string;
  let legs: string;
  let feet: string;
  if (kit === 'men') {
    body = suit ? 'Suit' : style === 'hoodie' ? 'Casual' : 'Casual2';
    legs =
      style === 'suit' || legsWorn === 'chinos'
        ? 'Suit'
        : legsWorn
          ? 'Casual2'
          : suit || style === 'kaftan'
            ? // (A kaftan, an agbada, over trousers: never shorts under it.)
              'Suit'
            : shoes === 'flipflops' || shoes === 'sandals'
              ? 'Beach'
              : 'Casual2';
    feet =
      shoes === 'oxfords' || shoes === 'loafers' || shoes === 'courts' || shoes === 'heels'
        ? 'Suit'
        : shoes === 'boots'
          ? 'Worker'
          : shoes === 'sandals' || shoes === 'flipflops'
            ? 'Beach'
            : shoes
              ? 'Casual2'
              : suit
                ? 'Suit'
                : 'Casual2';
  } else {
    const dress = (style === 'dress' || style === 'kaftan') && !look.trousers;
    body = suit ? 'Suit' : dress ? 'Formal' : 'Casual';
    legs = dress
      ? 'Formal'
      : style === 'suit'
        ? 'Suit'
        : legsWorn
          ? 'Casual'
          : suit
            ? 'Suit'
            : 'Casual';
    feet =
      shoes === 'heels' || shoes === 'courts' || shoes === 'sandals' || shoes === 'flipflops'
        ? 'Formal'
        : shoes === 'oxfords' || shoes === 'loafers'
          ? 'Suit'
          : shoes === 'boots'
            ? 'Punk'
            : shoes
              ? 'Casual'
              : suit
                ? 'Suit'
                : dress
                  ? 'Formal'
                  : 'Casual';
  }
  const head = `${headOutfit}_Head`;
  body = `${body}_Body`;
  legs = `${legs}_Legs`;
  feet = `${feet}_Feet`;

  const skin = hex(look.skin) ?? '#c68642';
  const hair = hex(look.hair) ?? '#2b1b12';
  const top = hex(look.top) ?? '#64748b';
  const bottom = hex(legsColour(legsWorn ?? undefined) ?? look.bottom) ?? '#1f2937';
  const colours: Record<string, string> = {};
  for (const n of [head, body, legs, feet]) colours[`${n}/Skin`] = skin;
  colours[`${head}/Skin_Darker`] = mix(skin, '#000000', 0.15);
  const hairMat = hairMaterial(kit, head);
  if (hairMat) colours[`${head}/${hairMat}`] = hair;
  // Brows: the hair's colour, darker (blond hair keeps light-brown brows).
  colours[`${head}/${BROW_MAT[kit]}`] = mix(hair, '#140d08', 0.55);
  const topMat = TOP_MAT[`${kit}:${body}`];
  if (topMat) colours[`${body}/${topMat}`] = top;
  const legsMat = LEGS_MAT[`${kit}:${legs}`] ?? TOP_MAT[`${kit}:${legs}`];
  if (legsMat) colours[`${legs}/${legsMat}`] = legs === 'Formal_Legs' ? top : bottom;
  const shoeMat = SHOE_MAT[`${kit}:${feet}`];
  if (shoeMat) colours[`${feet}/${shoeMat}`] = shoes ? shoeColour(shoes) : '#1f2937';
  if (body === 'Suit_Body') {
    // The shirt under the jacket, and a tie from the wardrobe (or the outfit's), else none.
    colours[`${body}/White`] = kit === 'women' ? BLOUSE_IVORY : SHIRT_WHITE;
    if (kit === 'men') {
      const tie =
        look.tie && look.tie !== 'none'
          ? TIE_COLOUR[look.tie]
          : look.accessory === 'tie'
            ? '#991b1b'
            : SHIRT_WHITE;
      colours[`${body}/Tie`] = tie ?? SHIRT_WHITE;
    }
  }
  const out: Outfit = { kit, head, body, legs, feet, modelHair, colours };
  const facial = look.facialHair ?? 'none';
  if (FACE_HAIR.has(facial)) {
    // Hair, darker than the skin (../../avatar/tone.ts); stubble is the skin a shade darker.
    const fc = facialHairColour(skin, hair);
    out.facialHair = {
      style: facial as FaceHair,
      colour: facial === 'stubble' ? mix(skin, fc, 0.42) : mix(fc, '#3b2a1e', 0.16),
    };
  }
  // Our own hair over the bare head: close-cropped hair under it (not under a wrap or a gele).
  const covered = look.headwear === 'headwrap' || look.headwear === 'gele';
  if (own && look.hairStyle !== 'bald' && !covered) out.scalp = hair;
  return out;
}

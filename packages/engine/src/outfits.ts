/**
 * Dress for the role (player feedback: "Improve the avatar for the different
 * gameplay. A banker should be in a suit"): the outfit a new player starts
 * in. A banker in a suit (a man's with a silk tie and Oxfords, a woman's a
 * trouser suit with courts), an investor smart-casual (a navy blazer over a
 * tee, chinos and loafers) and a founder casual (a hoodie, jeans and
 * trainers).
 *
 * - `roleOutfit`: the parts of the look and the mall items they are (pure,
 *   shared with the client, which dresses the look you see when you join).
 * - `dressForRole`: on joining, your look is your seeded one in your role's
 *   outfit, and its pieces are in your wardrobe to wear again free. You can
 *   change any of it in the creator, the wardrobe or the mall.
 *
 * Replay: only a player created with the game-feedback note logged is
 * dressed; every player before it keeps their look, and a world without the
 * note creates players exactly as before. Nothing is paid: the outfit comes
 * with you.
 */
import {
  appearanceSeed,
  defaultAppearance,
  seedGender,
  type Appearance,
  type WornSlot,
} from './appearance.js';
import type { Role } from './data/characters.js';
import { mallItem } from './data/leisure.js';
import { feedbackOn } from './releases.js';
import type { Gender, Player, World } from './types.js';
import { addToWardrobe } from './wardrobe.js';

/** A role's outfit: the parts of a look, and the mall items it's made of (a top: in its colour). */
export interface RoleOutfit {
  /** The kind of outfit (the wardrobe's card): a suit, smart-casual or casual. */
  kind: 'suit' | 'smart' | 'casual';
  look: Pick<Appearance, 'topStyle' | 'topColor'> & Partial<Pick<Appearance, WornSlot>>;
  items: readonly { item: string; colour?: string }[];
}

/** Charcoal and navy suit cloth (data/mall.ts SUIT_COLOURS), a navy blazer, a grey hoodie. */
const CHARCOAL = '#1f2633';
const NAVY = '#1e2a44';
const BLAZER = '#2b3a55';
const HOODIE = '#55606e';

const OUTFITS: Record<Role, Record<Gender, RoleOutfit>> = {
  banker: {
    male: {
      kind: 'suit',
      look: {
        topStyle: 'suit',
        topColor: CHARCOAL,
        tie: 'silk',
        shoes: 'oxfords',
        watch: 'dress',
        bag: 'briefcase',
      },
      items: [
        { item: 'sui-classic', colour: CHARCOAL },
        { item: 'sui-tie-silk' },
        { item: 'sui-oxfords' },
        { item: 'sui-watch' },
        { item: 'sui-briefcase' },
      ],
    },
    female: {
      kind: 'suit',
      look: {
        topStyle: 'suit',
        topColor: NAVY,
        shoes: 'courts',
        watch: 'dress',
        bag: 'worktote',
      },
      items: [
        { item: 'sui-trouser', colour: NAVY },
        { item: 'sui-courts' },
        { item: 'sui-watch' },
        { item: 'sui-tote' },
      ],
    },
  },
  investor: {
    male: {
      kind: 'smart',
      look: {
        topStyle: 'blazer',
        topColor: BLAZER,
        legs: 'chinos',
        shoes: 'loafers',
        bag: 'folio',
      },
      items: [
        { item: 'fash-blazer', colour: BLAZER },
        { item: 'fash-chinos' },
        { item: 'sui-loafers' },
        { item: 'sui-folio' },
      ],
    },
    female: {
      kind: 'smart',
      look: {
        topStyle: 'blazer',
        topColor: BLAZER,
        legs: 'chinos',
        shoes: 'loafers',
        bag: 'folio',
      },
      items: [
        { item: 'fash-blazer', colour: BLAZER },
        { item: 'fash-chinos' },
        { item: 'sui-loafers' },
        { item: 'sui-folio' },
      ],
    },
  },
  founder: {
    male: {
      kind: 'casual',
      look: { topStyle: 'hoodie', topColor: HOODIE, legs: 'jeans', shoes: 'trainers' },
      items: [
        { item: 'top-hoodie', colour: HOODIE },
        { item: 'fash-jeans' },
        { item: 'shoe-trainers' },
      ],
    },
    female: {
      kind: 'casual',
      look: { topStyle: 'hoodie', topColor: HOODIE, legs: 'jeans', shoes: 'trainers' },
      items: [
        { item: 'top-hoodie', colour: HOODIE },
        { item: 'fash-jeans' },
        { item: 'shoe-trainers' },
      ],
    },
  },
};

/** The outfit a role starts in, as this gender wears it. */
export const roleOutfit = (role: Role, gender: Gender): RoleOutfit => OUTFITS[role][gender];

/** A look in a role's outfit (the rest of it, skin to hair, as it was). */
export const inRoleOutfit = <A extends Partial<Appearance>>(
  a: A,
  role: Role,
  gender: Gender,
): A & RoleOutfit['look'] => ({ ...a, ...roleOutfit(role, gender).look });

/**
 * A new player, dressed for their role (only once the game-feedback note is
 * logged): their seeded look in the outfit, and its pieces in their wardrobe.
 */
export function dressForRole(world: World, p: Player, month: number, now = 0) {
  if (!feedbackOn(world)) return;
  const gender = p.gender ?? seedGender(appearanceSeed(p));
  const kit = roleOutfit(p.role, gender);
  const base = p.appearance ?? defaultAppearance(appearanceSeed(p), gender, p.market);
  p.appearance = inRoleOutfit(base, p.role, gender);
  p.appearanceAt = now;
  for (const k of kit.items) {
    const x = mallItem(k.item);
    if (x) addToWardrobe(p, x, month, k.colour);
  }
}

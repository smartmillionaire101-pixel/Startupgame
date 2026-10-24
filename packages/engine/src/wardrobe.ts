/**
 * Your wardrobe (player feedback: "character should be able to wear what they
 * buy and they should have a look at what they have bought").
 *
 * - Everything you wear from the mall is kept here once you buy it (or a
 *   friend gives it to you): tops in each colour you picked, headwear,
 *   glasses, and the things you keep that you wear (shoes, jeans, a belt,
 *   socks, a scarf, a bag, a watch, jewellery: a mall item's `worn`). Its own
 *   list (`Player.wardrobe`, up to `MALL_TRIP.wardrobeMax`), so the bag
 *   filling up with sweets and books never pushes out your clothes.
 * - `wardrobe.wear`: put on anything in it, free, any time. A top is worn in
 *   a colour you own it in.
 * - `wardrobe.remove`: take off headwear, glasses or a worn part (you always
 *   keep a top on).
 * - `wardrobeView`: what's in it (and what you're wearing), and the other
 *   things you keep (the bag), for the "My purchases" screen.
 *
 * Replay: worlds that never logged the investor release note keep nothing
 * here and both commands are refused, so they replay exactly as before.
 * Wearing costs nothing: no money moves.
 */
import {
  appearanceSeed,
  defaultAppearance,
  type Appearance,
  type Removable,
} from './appearance.js';
import { MALL_TRIP, forWardrobe, mallItem, type MallItem } from './data/leisure.js';
import { ensure } from './errors.js';
import { wearing } from './leisure.js';
import { investorOn } from './releases.js';
import type { Id, Player, World } from './types.js';

export type WardrobeEntry = NonNullable<Player['wardrobe']>[number];

/** The part of your look an item is (its slot) and the style it puts there. */
function partOf(x: MallItem): { slot: 'topStyle' | Removable; style: string } | null {
  if (x.topStyle) return { slot: 'topStyle', style: x.topStyle };
  if (x.headwear) return { slot: 'headwear', style: x.headwear };
  if (x.glasses) return { slot: 'glasses', style: x.glasses };
  if (x.worn) return { slot: x.worn.slot, style: x.worn.style };
  return null;
}

/**
 * Keep a wearable thing in someone's wardrobe (a top: in its colour). Owning
 * it once is enough: the same item in the same colour isn't kept twice.
 */
export function addToWardrobe(p: Player, x: MallItem, month: number, colour?: string, from?: Id) {
  const c = x.topStyle && colour ? colour.toLowerCase() : undefined;
  const w = (p.wardrobe ??= []);
  if (w.some((e) => e.item === x.id && e.colour === c)) return;
  w.push({ item: x.id, month, ...(c ? { colour: c } : {}), ...(from ? { from } : {}) });
  if (w.length > MALL_TRIP.wardrobeMax) w.splice(0, w.length - MALL_TRIP.wardrobeMax);
}

/**
 * Everything you own to wear: the wardrobe, and anything wearable kept in the
 * bag before the wardrobe opened (a gifted top, shoes), oldest first.
 */
export function ownedToWear(p: Player): WardrobeEntry[] {
  const out = [...(p.wardrobe ?? [])];
  for (const b of p.belongings ?? []) {
    const x = mallItem(b.item);
    if (x && forWardrobe(x) && !out.some((e) => e.item === b.item)) out.push(b);
  }
  return out;
}

const lookOf = (p: Player): Appearance =>
  p.appearance ?? defaultAppearance(appearanceSeed(p), p.gender);

/** Put on something from your wardrobe (free). A top: in a colour you own it in. */
export function wardrobeWear(world: World, me: Player, itemId: string, colour?: string, now = 0) {
  ensure(investorOn(world), 'wardrobe.off', 'Your wardrobe isn’t open in this world yet.');
  const x = mallItem(itemId);
  ensure(x && forWardrobe(x), 'wardrobe.item', 'That isn’t something you wear.');
  const owned = ownedToWear(me).filter((e) => e.item === x.id);
  ensure(owned.length > 0, 'wardrobe.missing', 'That isn’t in your wardrobe: buy it at the mall.');
  let c: string | undefined;
  if (x.topStyle) {
    const want = colour?.toLowerCase();
    // A top kept before the wardrobe opened has no colour: any you pick.
    const e = want
      ? (owned.find((o) => o.colour === want) ?? owned.find((o) => !o.colour))
      : owned.at(-1);
    ensure(e, 'wardrobe.colour', 'You don’t have it in that colour.');
    c = e.colour ?? want ?? lookOf(me).topColor;
  }
  const next = wearing(me, x, c);
  me.appearance = next;
  me.appearanceAt = now;
  return {
    item: x.id,
    appearance: next,
    ...(c ? { colour: c } : {}),
    message: `You put on: ${x.label}.`,
  };
}

/** Take off headwear, glasses or a worn part (back to none). */
export function wardrobeRemove(world: World, me: Player, slot: Removable, now = 0) {
  ensure(investorOn(world), 'wardrobe.off', 'Your wardrobe isn’t open in this world yet.');
  const was = lookOf(me);
  const on = (was as Partial<Record<Removable, string>>)[slot];
  ensure(on && on !== 'none', 'wardrobe.none', 'You’re not wearing anything there.');
  const next = { ...was, [slot]: 'none' } as Appearance;
  me.appearance = next;
  me.appearanceAt = now;
  return { slot, appearance: next, message: 'Taken off.' };
}

/** Whether a look wears this item (a top: in this colour). */
function wears(a: Appearance, x: MallItem, colour?: string) {
  const part = partOf(x);
  if (!part) return false;
  if (part.slot === 'topStyle') return a.topStyle === x.topStyle && a.topColor === colour;
  return (a as unknown as Partial<Record<string, string>>)[part.slot] === part.style;
}

/**
 * Your wardrobe and the other things you keep, for "My purchases": newest
 * first, and who gave you what. One entry per part is marked as worn (the
 * newest that matches your look), so two shops' T-shirts in the same colour
 * don't both say so.
 */
export function wardrobeView(world: World, p: Player) {
  const look = lookOf(p);
  const seen = new Set<string>();
  const from = (id?: Id) => (id ? { id, name: world.players[id]?.name ?? '' } : null);
  const items = ownedToWear(p)
    .reverse()
    .flatMap((e) => {
      const x = mallItem(e.item);
      const part = x && partOf(x);
      if (!x || !part) return [];
      const colour = e.colour ?? null;
      const on = !seen.has(part.slot) && wears(look, x, e.colour ?? look.topColor);
      if (on) seen.add(part.slot);
      return [
        {
          item: x.id,
          label: x.label,
          shop: x.shop,
          kind: x.keep ?? null,
          slot: part.slot,
          style: part.style,
          colour,
          month: e.month,
          from: from(e.from),
          wearing: on,
        },
      ];
    });
  const things = [...(p.belongings ?? [])]
    .reverse()
    .filter((b) => {
      const x = mallItem(b.item);
      return !x || !forWardrobe(x);
    })
    .map((b) => ({
      item: b.item,
      label: mallItem(b.item)?.label ?? b.item,
      kind: mallItem(b.item)?.keep ?? null,
      month: b.month,
      from: from(b.from),
    }));
  return {
    /** The wardrobe is open (the investor release note is logged). */
    on: investorOn(world),
    items,
    things,
  };
}

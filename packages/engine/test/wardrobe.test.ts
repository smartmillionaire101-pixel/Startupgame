import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { appearanceSchema, fitAppearance, lookSchema } from '../src/appearance.js';
import { MALL_ITEMS, MALL_TRIP } from '../src/data/leisure.js';
import { playerView } from '../src/views.js';
import type { World } from '../src/types.js';
import { addFounder, careerWorld, makeWorld, run, tryRun } from './helpers.js';

const F = 'u_founder';
const cash = (w: World, id = F) => w.accounts[w.players[id]!.accounts.local]!.balance;
const me = (w: World) => w.players[F]!;
/** The investor release (the wardrobe's note) logged, a founder in Lagos. */
const world = () => addFounder(careerWorld(42, ['lagos']));

interface WardrobeT {
  on: boolean;
  items: {
    item: string;
    slot: string;
    style: string;
    colour: string | null;
    wearing: boolean;
    from: { id: string } | null;
  }[];
  things: { item: string; kind: string | null }[];
}
const wardrobeOf = (w: World) =>
  (playerView(w, F)!.me as unknown as { wardrobe: WardrobeT }).wardrobe;
const mallItemOf = (w: World, id: string) =>
  (
    playerView(w, F)!.me as unknown as {
      mall: { items: { id: string; have?: boolean; haveColours?: string[] }[] };
    }
  ).mall.items.find((i) => i.id === id)!;

describe('the wardrobe', () => {
  it('a top in two colours: both kept, switching between them is free', () => {
    const w0 = world();
    const a = run(w0, F, { type: 'mall.buy', itemId: 'top-tee', colour: '#DC2626' });
    const b = run(a.world, F, { type: 'mall.buy', itemId: 'top-tee', colour: '#2563eb' });
    expect(me(b.world).appearance).toMatchObject({ topStyle: 'tee', topColor: '#2563eb' });
    expect(me(b.world).wardrobe).toEqual([
      expect.objectContaining({ item: 'top-tee', colour: '#dc2626' }),
      expect.objectContaining({ item: 'top-tee', colour: '#2563eb' }),
    ]);
    expect(mallItemOf(b.world, 'top-tee')).toMatchObject({
      have: true,
      haveColours: ['#dc2626', '#2563eb'],
    });
    // Back into the red one: nothing paid.
    const before = cash(b.world);
    const r = run(b.world, F, { type: 'wardrobe.wear', itemId: 'top-tee', colour: '#dc2626' });
    expect(cash(r.world)).toBe(before);
    expect(me(r.world).appearance).toMatchObject({ topStyle: 'tee', topColor: '#dc2626' });
    const v = wardrobeOf(r.world);
    expect(v.on).toBe(true);
    expect(v.items.filter((i) => i.wearing)).toEqual([
      expect.objectContaining({ item: 'top-tee', colour: '#dc2626' }),
    ]);
    // Not a colour you have, or already on, or never bought: refused.
    expect(
      tryRun(r.world, F, { type: 'wardrobe.wear', itemId: 'top-tee', colour: '#16a34a' }).ok,
    ).toBe(false);
    expect(
      tryRun(r.world, F, { type: 'wardrobe.wear', itemId: 'top-tee', colour: '#dc2626' }).ok,
    ).toBe(false);
    expect(tryRun(r.world, F, { type: 'wardrobe.wear', itemId: 'top-blazer' }).ok).toBe(false);
    // Food isn't something you wear.
    expect(tryRun(r.world, F, { type: 'wardrobe.wear', itemId: 'burger' }).ok).toBe(false);
  });

  it('shoes and a watch go on when you buy them; take them off and put them back on, free', () => {
    const w0 = world();
    const s = run(w0, F, { type: 'mall.buy', itemId: 'shoe-boots' });
    const t = run(s.world, F, { type: 'mall.buy', itemId: 'jew-watch' });
    const n = run(t.world, F, { type: 'mall.buy', itemId: 'jew-necklace' });
    const sneakers = run(n.world, F, { type: 'mall.buy', itemId: 'shoe-designer' });
    expect(me(sneakers.world).appearance).toMatchObject({
      shoes: 'sneakers',
      watch: 'everyday',
      necklace: 'silver',
    });
    // The look is still valid for every client that reads it.
    expect(appearanceSchema.safeParse(me(sneakers.world).appearance).success).toBe(true);
    const before = cash(sneakers.world);
    const boots = run(sneakers.world, F, { type: 'wardrobe.wear', itemId: 'shoe-boots' });
    expect(me(boots.world).appearance!.shoes).toBe('boots');
    const off = run(boots.world, F, { type: 'wardrobe.remove', slot: 'watch' });
    expect(me(off.world).appearance!.watch).toBe('none');
    expect(tryRun(off.world, F, { type: 'wardrobe.remove', slot: 'watch' }).ok).toBe(false);
    const on = run(off.world, F, { type: 'wardrobe.wear', itemId: 'jew-watch' });
    expect(me(on.world).appearance!.watch).toBe('everyday');
    expect(cash(on.world)).toBe(before);
    // Everything's listed, one of each part marked as worn.
    const v = wardrobeOf(on.world);
    expect(v.items.map((i) => i.item).sort()).toEqual(
      ['jew-necklace', 'jew-watch', 'shoe-boots', 'shoe-designer'].sort(),
    );
    expect(v.items.find((i) => i.item === 'shoe-boots')!.wearing).toBe(true);
    expect(v.items.find((i) => i.item === 'shoe-designer')!.wearing).toBe(false);
  });

  it('a full bag never pushes clothes out of the wardrobe', () => {
    const w0 = run(world(), F, { type: 'mall.buy', itemId: 'shoe-trainers' }).world;
    const full = produce(w0, (d) => {
      d.players[F]!.belongings = Array.from({ length: MALL_TRIP.bagMax }, () => ({
        item: 'toy-chocolates',
        month: 0,
      }));
    });
    const r = run(full, F, { type: 'mall.buy', itemId: 'book-novel' });
    expect(me(r.world).belongings).toHaveLength(MALL_TRIP.bagMax);
    expect(me(r.world).wardrobe).toEqual([expect.objectContaining({ item: 'shoe-trainers' })]);
    // Books and sweets are listed with the things you keep, not the wardrobe.
    const v = wardrobeOf(r.world);
    expect(v.things[0]).toMatchObject({ item: 'book-novel', kind: 'book' });
    expect(v.items.map((i) => i.item)).toEqual(['shoe-trainers']);
    // Plenty of room: every wearable item in every colour fits.
    const tops = MALL_ITEMS.filter((x) => x.topStyle).length;
    const rest = MALL_ITEMS.filter((x) => (x.headwear || x.glasses || x.worn) && !x.topStyle);
    expect(MALL_TRIP.wardrobeMax).toBeGreaterThanOrEqual(tops * 12 + rest.length);
  });

  it('things kept in the bag before the wardrobe opened can be worn', () => {
    const w0 = produce(world(), (d) => {
      d.players[F]!.belongings = [{ item: 'jew-studs', month: 0 }];
    });
    const r = run(w0, F, { type: 'wardrobe.wear', itemId: 'jew-studs' });
    expect(me(r.world).appearance!.earrings).toBe('studs');
    expect(wardrobeOf(r.world).items[0]).toMatchObject({ item: 'jew-studs', wearing: true });
  });

  it('the creator can’t put on what you don’t own', () => {
    // `player.appearance` sets the creator's parts; wardrobe parts are dropped.
    const r = run(world(), F, {
      type: 'player.appearance',
      appearance: { glasses: 'round', shoes: 'heels' } as never,
    });
    expect(me(r.world).appearance!.glasses).toBe('round');
    expect(me(r.world).appearance!.shoes).toBeUndefined();
    expect(Object.keys(lookSchema.shape)).not.toContain('shoes');
  });

  it('heels on a man are drawn as loafers', () => {
    expect(fitAppearance({ shoes: 'heels' }, 'male').shoes).toBe('loafers');
    expect(fitAppearance({ shoes: 'heels' }, 'female').shoes).toBe('heels');
  });

  it('an older world (before the investor release) is unaffected', () => {
    const w0 = addFounder(makeWorld(42, ['lagos']));
    const a = run(w0, F, { type: 'mall.buy', itemId: 'top-tee', colour: '#dc2626' });
    const b = run(a.world, F, { type: 'mall.buy', itemId: 'acc-cap' });
    // Bought and worn as ever, nothing kept.
    expect(me(b.world).appearance).toMatchObject({ topColor: '#dc2626', headwear: 'cap' });
    expect(me(b.world).wardrobe).toBeUndefined();
    expect(me(b.world).belongings).toBeUndefined();
    expect(Object.keys(me(b.world).appearance!).sort()).toEqual(
      Object.keys(lookSchema.shape).sort(),
    );
    // The new commands are refused, nothing changes.
    const wear = tryRun(b.world, F, { type: 'wardrobe.wear', itemId: 'top-tee' });
    expect(wear.ok).toBe(false);
    if (!wear.ok) expect(wear.error.code).toBe('wardrobe.off');
    expect(tryRun(b.world, F, { type: 'wardrobe.remove', slot: 'headwear' }).ok).toBe(false);
    expect(wardrobeOf(b.world)).toMatchObject({ on: false, items: [], things: [] });
    expect(mallItemOf(b.world, 'top-tee').have).toBeUndefined();
  });
});

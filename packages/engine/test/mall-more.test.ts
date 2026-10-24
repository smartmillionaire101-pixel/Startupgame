import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { MALL_ITEMS, MALL_SHOPS, mallItem } from '../src/data/leisure.js';
import { col, usdToLocal } from '../src/helpers.js';
import { mallPrice } from '../src/leisure.js';
import { scale } from '../src/money.js';
import { playerView } from '../src/views.js';
import type { World } from '../src/types.js';
import { addFounder, careerWorld, makeWorld, run, tryRun } from './helpers.js';

const F = 'u_founder';
const G = 'u_friend';
const cash = (w: World, id = F) => w.accounts[w.players[id]!.accounts.local]!.balance;
/** Every naira in the world, external accounts included: the ledger only moves money. */
const allNgn = (w: World) =>
  Object.values(w.accounts)
    .filter((a) => a.currency === 'NGN')
    .reduce((s, a) => s + a.balance, 0);
/** The bigger mall's world: the investor release note logged, a founder in Lagos. */
const world = () => addFounder(careerWorld(42, ['lagos']));
/** Two players in Lagos. */
const pair = () => addFounder(world(), G, 'lagos', 'Friendco');

interface MallViewT {
  shops: string[];
  items: { id: string; shop: string; price: number; gift?: boolean; keep?: string }[];
  bag: { item: string; from: { id: string; name: string } | null }[];
  trip?: {
    id: string;
    status: string;
    mine: boolean;
    friend: { id: string; name: string; ai: boolean };
    gifts: { item: string; price: number; from: string; to: string }[];
  } | null;
  invites?: { id: string; from: { id: string; name: string } }[];
  friends?: { id: string; name: string; ai: boolean }[];
}
interface WardrobeT {
  items: { item: string; from: { id: string; name: string } | null }[];
}
const mallOf = (w: World, id = F) => (playerView(w, id)!.me as unknown as { mall: MallViewT }).mall;
const aiFriend = (w: World) => mallOf(w).friends![0]!;

describe('the bigger mall', () => {
  it('only once the release note is logged: older worlds sell the first six shops', () => {
    const old = addFounder(makeWorld(42, ['lagos']));
    expect(mallOf(old).shops).toHaveLength(6);
    expect(mallOf(old).items.some((i) => i.id === 'shoe-trainers')).toBe(false);
    expect(tryRun(old, F, { type: 'mall.buy', itemId: 'shoe-trainers' }).ok).toBe(false);
    expect(tryRun(old, F, { type: 'mall.invite', playerId: 'x' }).ok).toBe(false);
    const w = world();
    const v = mallOf(w);
    expect(v.shops).toEqual(MALL_SHOPS);
    expect(v.shops.length).toBeGreaterThanOrEqual(16);
    // (The feedback round's things wait for their own note: outfits.test.ts.)
    expect(v.items).toHaveLength(MALL_ITEMS.filter((x) => !x.feedback).length);
    // Every shop has a good range, each item a price.
    for (const s of MALL_SHOPS)
      expect(v.items.filter((i) => i.shop === s).length, s).toBeGreaterThanOrEqual(5);
    for (const i of v.items) expect(i.price, i.id).toBeGreaterThan(0);
    expect(new Set(MALL_ITEMS.map((x) => x.id)).size).toBe(MALL_ITEMS.length);
  });

  it('prices: the city’s cost of living, tagged like a shop; imported goods at the dollar rate', () => {
    const w = world();
    const m = w.markets.lagos!;
    // A paperback in Lagos: 0.6 % of a month's living costs, two significant figures.
    const novel = mallItem('book-novel')!;
    const raw = scale(col(m), novel.priceCol);
    const p = mallPrice(w, m, novel);
    expect(p % 10_000).toBe(0);
    expect(Math.abs(p - raw) / raw).toBeLessThan(0.05);
    // A luxury watch costs at least its dollar price here.
    const watch = mallItem('jew-luxury-watch')!;
    const usd = usdToLocal(w, m, watch.usd!);
    expect(mallPrice(w, m, watch)).toBeGreaterThanOrEqual(Math.min(usd, scale(col(m), 3)) * 0.95);
    expect(mallPrice(w, m, watch)).toBeGreaterThanOrEqual(usd * 0.95);
    // Tiers: a value tee < the fashion shop's < a designer blazer < a luxury watch.
    const price = (id: string) => mallOf(w).items.find((i) => i.id === id)!.price;
    expect(price('out-tee')).toBeLessThan(price('top-tee'));
    expect(price('top-tee')).toBeLessThan(price('des-blazer'));
    expect(price('des-blazer')).toBeLessThan(price('jew-luxury-watch'));
    // The first shops' prices are as they always were.
    expect(price('top-hoodie')).toBe(scale(col(m), 0.035));
    // London prices in pounds, scaled to London.
    const ld = addFounder(careerWorld(42, ['london']), F, 'london');
    const lp = mallOf(ld).items.find((i) => i.id === 'book-novel')!.price;
    expect(lp).toBeGreaterThan(500);
    expect(lp).toBeLessThan(5_000);
  });

  it('things you keep go in your bag, paid to a till: money is only moved', () => {
    const w0 = world();
    const r = run(w0, F, { type: 'mall.buy', itemId: 'shoe-trainers' });
    expect(cash(w0) - cash(r.world)).toBe(r.result.price);
    expect(allNgn(r.world)).toBe(allNgn(w0));
    // Shoes: in your wardrobe (not the bag), and on your feet.
    expect(r.world.players[F]!.wardrobe).toEqual([
      { item: 'shoe-trainers', month: w0.markets.lagos!.month },
    ]);
    expect(r.world.players[F]!.belongings ?? []).toHaveLength(0);
    expect(r.world.players[F]!.appearance?.shoes).toBe('trainers');
    const r1 = run(r.world, F, { type: 'mall.buy', itemId: 'book-novel' });
    expect(r1.world.players[F]!.belongings).toEqual([
      { item: 'book-novel', month: w0.markets.lagos!.month },
    ]);
    expect(mallOf(r1.world).bag[0]).toMatchObject({ item: 'book-novel', from: null });
    // The pharmacy: a toothbrush is hygiene, kept nowhere.
    const w1 = produce(r1.world, (d) => {
      d.players[F]!.needs = { hunger: 50, hygiene: 30, fun: 50, social: 50 };
    });
    const r2 = run(w1, F, { type: 'mall.buy', itemId: 'ph-toothcare' });
    expect(r2.world.players[F]!.needs!.hygiene).toBe(40);
    expect(r2.world.players[F]!.belongings).toHaveLength(1);
    // New headwear from the designer boutique goes on.
    const r3 = run(r2.world, F, { type: 'mall.buy', itemId: 'des-headwrap' });
    expect(r3.world.players[F]!.appearance?.headwear).toBe('headwrap');
  });
});

describe('shopping together', () => {
  it('an AI friend says yes at once: social and fun for both, and closer', () => {
    const w0 = produce(world(), (d) => {
      d.players[F]!.needs = { hunger: 50, hygiene: 50, fun: 40, social: 30 };
    });
    const friend = aiFriend(w0);
    expect(friend.ai).toBe(true);
    const social0 = w0.players[friend.id]!.needs?.social ?? 70;
    const { world: w1, result } = run(w0, F, { type: 'mall.invite', playerId: friend.id });
    expect(result.status).toBe('together');
    expect(w1.players[F]!.needs!.social).toBe(48);
    expect(w1.players[F]!.needs!.fun).toBe(50);
    expect(w1.players[friend.id]!.needs!.social).toBeGreaterThan(Math.min(social0, 82));
    const c = w1.players[F]!.contacts!.find((x) => x.refId === friend.id);
    expect(c?.warmth).toBeGreaterThan(0);
    expect(w1.players[friend.id]!.contacts!.some((x) => x.refId === F)).toBe(true);
    const v = mallOf(w1);
    expect(v.trip).toMatchObject({ status: 'together', mine: true, friend: { id: friend.id } });
    // No second outing at once; the friend is no longer free to ask.
    expect(v.friends!.some((x) => x.id === friend.id)).toBe(false);
    expect(tryRun(w1, F, { type: 'mall.invite', playerId: aiFriend(w1).id }).ok).toBe(false);
    // Head off: it's over.
    const w2 = run(w1, F, { type: 'mall.leave', tripId: result.tripId }).world;
    expect(mallOf(w2).trip).toBeNull();
  });

  it('a player gets an invitation and says yes; either can say no', () => {
    const w0 = pair();
    const { world: w1, result } = run(w0, F, { type: 'mall.invite', playerId: G });
    expect(result.status).toBe('invited');
    expect(mallOf(w1).trip).toMatchObject({ status: 'invited', mine: true });
    const inv = mallOf(w1, G).invites!;
    expect(inv).toHaveLength(1);
    expect(inv[0]!.from.id).toBe(F);
    expect(w1.inbox[G]!.some((i) => i.ref?.kind === 'mall')).toBe(true);
    // Only the guest answers.
    expect(tryRun(w1, F, { type: 'mall.answer', tripId: result.tripId, accept: true }).ok).toBe(
      false,
    );
    const w2 = run(w1, G, { type: 'mall.answer', tripId: result.tripId, accept: true }).world;
    expect(mallOf(w2).trip).toMatchObject({ status: 'together', friend: { id: G } });
    expect(mallOf(w2, G).trip).toMatchObject({
      status: 'together',
      mine: false,
      friend: { id: F },
    });
    expect(mallOf(w2, G).invites).toHaveLength(0);
    // A no: the host hears, nothing else changes.
    const w3 = run(w1, G, { type: 'mall.answer', tripId: result.tripId, accept: false }).world;
    expect(w3.mallTrips![result.tripId]!.status).toBe('declined');
    expect(mallOf(w3).trip).toBeNull();
    expect(w3.inbox[F]!.some((i) => i.text.includes('can’t come shopping'))).toBe(true);
  });

  it('a gift: money moves from you to the till, the thing is theirs', () => {
    const w0 = pair();
    const trip = run(w0, F, { type: 'mall.invite', playerId: G });
    const w1 = run(trip.world, G, {
      type: 'mall.answer',
      tripId: trip.result.tripId,
      accept: true,
    }).world;
    const tripId = trip.result.tripId as string;
    const warm0 = w1.players[G]!.contacts!.find((c) => c.refId === F)!.warmth;
    const fun0 = w1.players[G]!.needs!.fun;
    const theirs0 = cash(w1, G);
    const r = run(w1, F, { type: 'mall.gift', tripId, itemId: 'jew-necklace' });
    const price = r.result.price as number;
    expect(price).toBeGreaterThan(0);
    // Yours to pay, nobody else's: the till (or the suppliers) gets exactly that.
    expect(cash(w1) - cash(r.world)).toBe(price);
    expect(cash(r.world, G)).toBe(theirs0);
    expect(allNgn(r.world)).toBe(allNgn(w1));
    // Theirs to keep (in their wardrobe), from you; they're happier and closer.
    expect(r.world.players[G]!.wardrobe).toEqual([
      { item: 'jew-necklace', month: w1.markets.lagos!.month, from: F },
    ]);
    expect(r.world.players[F]!.wardrobe ?? []).toHaveLength(0);
    const theirs = (playerView(r.world, G)!.me as unknown as { wardrobe: WardrobeT }).wardrobe;
    expect(theirs.items[0]).toMatchObject({ item: 'jew-necklace', from: { id: F } });
    expect(r.world.players[G]!.needs!.fun).toBeGreaterThan(fun0);
    expect(r.world.players[G]!.contacts!.find((c) => c.refId === F)!.warmth).toBeGreaterThan(warm0);
    expect(mallOf(r.world).trip!.gifts).toEqual([
      expect.objectContaining({ from: F, to: G, item: 'jew-necklace', price }),
    ]);
    expect(r.world.inbox[G]!.some((i) => i.text.includes('bought you a gift'))).toBe(true);
    // Clothes go on them, in the colour you pick.
    const r2 = run(r.world, F, {
      type: 'mall.gift',
      tripId,
      itemId: 'out-hoodie',
      colour: '#16A34A',
    });
    expect(r2.world.players[G]!.appearance).toMatchObject({
      topStyle: 'hoodie',
      topColor: '#16a34a',
    });
    // They can give back, too.
    const r3 = run(r2.world, G, { type: 'mall.gift', tripId, itemId: 'toy-flowers' });
    expect(cash(r2.world, G) - cash(r3.world, G)).toBe(r3.result.price);
    expect(r3.world.players[F]!.belongings!.at(-1)).toMatchObject({ item: 'toy-flowers', from: G });
  });

  it('gifts only while you’re there together, and only things to give', () => {
    const w0 = pair();
    const trip = run(w0, F, { type: 'mall.invite', playerId: G });
    const tripId = trip.result.tripId as string;
    // Not yet together.
    expect(tryRun(trip.world, F, { type: 'mall.gift', tripId, itemId: 'toy-teddy' }).ok).toBe(
      false,
    );
    const w1 = run(trip.world, G, { type: 'mall.answer', tripId, accept: true }).world;
    // A film takes hours; a sofa goes to your own home.
    expect(tryRun(w1, F, { type: 'mall.gift', tripId, itemId: 'film' }).ok).toBe(false);
    expect(tryRun(w1, F, { type: 'mall.gift', tripId, itemId: 'sofa-2' }).ok).toBe(false);
    // Not someone else's outing.
    const w2 = addFounder(w1, 'u_third', 'lagos', 'Thirdco');
    expect(tryRun(w2, 'u_third', { type: 'mall.gift', tripId, itemId: 'toy-teddy' }).ok).toBe(
      false,
    );
    // Too dear: refused, nothing moves.
    const poor = produce(w1, (d) => {
      d.accounts[d.players[F]!.accounts.local]!.balance = 100;
    });
    const r = tryRun(poor, F, { type: 'mall.gift', tripId, itemId: 'jew-luxury-watch' });
    expect(r.ok).toBe(false);
    // Once one heads off, no more gifts.
    const w3 = run(w1, G, { type: 'mall.leave', tripId }).world;
    expect(tryRun(w3, F, { type: 'mall.gift', tripId, itemId: 'toy-teddy' }).ok).toBe(false);
  });

  it('an AI friend can be bought a gift too (an AI-accepted outing)', () => {
    const w0 = world();
    const friend = aiFriend(w0);
    const t = run(w0, F, { type: 'mall.invite', playerId: friend.id });
    const before = allNgn(t.world);
    const r = run(t.world, F, {
      type: 'mall.gift',
      tripId: t.result.tripId,
      itemId: 'toy-chocolates',
    });
    expect(allNgn(r.world)).toBe(before);
    expect(r.world.players[friend.id]!.belongings).toEqual([
      expect.objectContaining({ item: 'toy-chocolates', from: F }),
    ]);
  });
});

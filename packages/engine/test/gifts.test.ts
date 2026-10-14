import { describe, expect, it } from 'vitest';
import { marketProperties } from '../src/property.js';
import { playerView } from '../src/views.js';
import type { World } from '../src/types.js';
import {
  addFounder,
  addInvestor,
  makeWorld,
  moneyByCurrency,
  negativeInternalAccounts,
  run,
  tryRun,
} from './helpers.js';

/** Hand a player money from the outside world (genesis), keeping the books balanced. */
function fund(w: World, playerId: string, amount: number): World {
  const out = structuredClone(w);
  const p = out.players[playerId]!;
  const m = out.markets[p.market]!;
  out.accounts[m.ext.genesis]!.balance -= amount;
  out.accounts[p.accounts.local]!.balance += amount;
  return out;
}

function setup() {
  let w = addInvestor(addFounder(makeWorld(7, ['lagos'])), 'u_inv');
  w = fund(w, 'u_founder', 2_000_000_000_00);
  const p = marketProperties(w, 'lagos')
    .filter((x) => x.tier === 'apartment')
    .sort((a, b) => a.basePrice - b.basePrice)[0]!;
  w = run(w, 'u_founder', { type: 'property.buy', propertyId: p.id }).world;
  return { w, p };
}

describe('giving a home (Wave 13)', () => {
  it('offers, then moves ownership on acceptance with no money moving', () => {
    const { w: start, p } = setup();
    let w = run(start, 'u_founder', { type: 'property.moveIn', propertyId: p.id }).world;
    const nwBefore = playerView(w, 'u_founder')!.me.netWorth;
    const offer = run(w, 'u_founder', {
      type: 'property.gift',
      propertyId: p.id,
      toPlayerId: 'u_inv',
    });
    w = offer.world;
    const giftId = offer.result.giftId as string;
    // Still the giver's until accepted.
    expect(w.properties![p.id]!.ownerId).toBe('u_founder');
    expect(w.inbox.u_inv!.some((i) => i.ref?.kind === 'gift' && i.ref.id === giftId)).toBe(true);
    // Only the receiver accepts.
    expect(tryRun(w, 'u_founder', { type: 'property.gift.accept', giftId }).ok).toBe(false);
    const money = moneyByCurrency(w);
    const balances = JSON.stringify(Object.values(w.accounts).map((a) => a.balance));
    w = run(w, 'u_inv', { type: 'property.gift.accept', giftId }).world;
    expect(w.properties![p.id]!.ownerId).toBe('u_inv');
    expect(w.propertyGifts![giftId]!.status).toBe('accepted');
    // The giver moved out.
    expect(w.players.u_founder!.residence).toBeUndefined();
    // No money moved at all.
    expect(moneyByCurrency(w)).toEqual(money);
    expect(JSON.stringify(Object.values(w.accounts).map((a) => a.balance))).toBe(balances);
    expect(negativeInternalAccounts(w)).toEqual([]);
    // Net worth follows the owner.
    const giver = playerView(w, 'u_founder')!.me;
    const receiver = playerView(w, 'u_inv')!.me;
    expect(giver.properties.find((x) => x.id === p.id)).toBeUndefined();
    const theirs = receiver.properties.find((x) => x.id === p.id)!;
    expect(theirs).toBeDefined();
    expect(giver.netWorth.propertyEquity).toBe(nwBefore.propertyEquity - theirs.value);
    expect(receiver.netWorth.propertyEquity).toBe(theirs.value);
    // The receiver can live in it.
    w = run(w, 'u_inv', { type: 'property.moveIn', propertyId: p.id }).world;
    expect(w.players.u_inv!.residence?.propertyId).toBe(p.id);
    // Answered once only.
    expect(tryRun(w, 'u_inv', { type: 'property.gift.accept', giftId }).ok).toBe(false);
  });

  it('refuses mortgaged or let homes, AI players and yourself', () => {
    const { w: start, p } = setup();
    let w = run(start, 'u_founder', { type: 'property.rent', propertyId: p.id }).world;
    const let_ = tryRun(w, 'u_founder', {
      type: 'property.gift',
      propertyId: p.id,
      toPlayerId: 'u_inv',
    });
    expect(!let_.ok && let_.error.code).toBe('gift.blocked');
    w = run(w, 'u_founder', { type: 'property.unrent', propertyId: p.id }).world;
    const self = tryRun(w, 'u_founder', {
      type: 'property.gift',
      propertyId: p.id,
      toPlayerId: 'u_founder',
    });
    expect(self.ok).toBe(false);
    const ai = Object.values(w.players).find((x) => x.ai)!;
    expect(
      tryRun(w, 'u_founder', { type: 'property.gift', propertyId: p.id, toPlayerId: ai.id }).ok,
    ).toBe(false);
    // Someone else's home.
    expect(
      tryRun(w, 'u_inv', { type: 'property.gift', propertyId: p.id, toPlayerId: 'u_founder' }).ok,
    ).toBe(false);
    // A mortgaged home.
    const q = marketProperties(w, 'lagos').find((x) => !x.ownerId && x.id !== p.id)!;
    w = run(w, 'u_founder', {
      type: 'property.buy',
      propertyId: q.id,
      mortgage: { downPct: 30, months: 120 },
    }).world;
    const mg = tryRun(w, 'u_founder', {
      type: 'property.gift',
      propertyId: q.id,
      toPlayerId: 'u_inv',
    });
    expect(!mg.ok && mg.error.code).toBe('gift.blocked');
  });

  it('can be declined, withdrawn, or fall through when the home is let meanwhile', () => {
    const { w: start, p } = setup();
    let r = run(start, 'u_founder', {
      type: 'property.gift',
      propertyId: p.id,
      toPlayerId: 'u_inv',
    });
    let w = run(r.world, 'u_inv', { type: 'property.gift.decline', giftId: r.result.giftId }).world;
    expect(w.propertyGifts![r.result.giftId]!.status).toBe('declined');
    expect(w.properties![p.id]!.ownerId).toBe('u_founder');

    r = run(w, 'u_founder', { type: 'property.gift', propertyId: p.id, toPlayerId: 'u_inv' });
    w = run(r.world, 'u_founder', {
      type: 'property.gift.decline',
      giftId: r.result.giftId,
    }).world;
    expect(w.propertyGifts![r.result.giftId]!.status).toBe('cancelled');

    r = run(w, 'u_founder', { type: 'property.gift', propertyId: p.id, toPlayerId: 'u_inv' });
    w = run(r.world, 'u_founder', { type: 'property.rent', propertyId: p.id }).world;
    const late = run(w, 'u_inv', { type: 'property.gift.accept', giftId: r.result.giftId });
    expect(late.result.accepted).toBe(false);
    expect(late.world.properties![p.id]!.ownerId).toBe('u_founder');
    expect(late.world.propertyGifts![r.result.giftId]!.status).toBe('cancelled');
  });
});

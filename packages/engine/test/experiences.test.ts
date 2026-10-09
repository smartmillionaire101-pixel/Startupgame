import { expect, it } from 'vitest';
import { addFounder, makeWorld, moneyByCurrency, run, tryRun, T0, settle } from './helpers.js';
import { playerView } from '../src/views.js';
import { flightFare } from '../src/travel.js';
import { FURNITURE } from '../src/data/lifestyle-shop.js';

function people() {
  let w = addFounder(makeWorld(), 'host');
  w = addFounder(w, 'alice', 'lagos', 'Alice Tools');
  return addFounder(w, 'bob', 'lagos', 'Bob Tools');
}
function homeVisit(w: ReturnType<typeof people>, guest: string) {
  const inv = run(w, 'host', { type: 'visit.invite', toPlayerId: guest });
  return run(inv.world, guest, { type: 'visit.accept', inviteId: inv.result.inviteId }).world;
}
const questions = [1, 2, 3].map((n) => ({
  text: `What is ${n} plus one?`,
  options: [String(n + 1), '8', '9', '10'],
  answer: 0,
}));
it('charges flights at booking, persists paid tickets, boards without charging twice and refunds cancellation', () => {
  let w = people();
  const id = w.players.host!.accounts.local;
  const before = w.accounts[id]!.balance;
  const fare = flightFare(w, w.players.host!, 'london');
  w = run(w, 'host', { type: 'travel.book', to: 'london' }).world;
  expect(w.accounts[id]!.balance).toBe(before - fare);
  expect(w.players.host!.location).toBeUndefined();
  expect(playerView(w, 'host')!.me.flightTicket?.paid).toBe(fare);
  w = run(w, 'host', { type: 'travel.book', to: 'london' }).world;
  expect(w.accounts[id]!.balance).toBe(before - fare);
  w = run(w, 'host', { type: 'travel.cancel' }).world;
  expect(w.accounts[id]!.balance).toBe(before);
  w = run(w, 'host', { type: 'travel.book', to: 'london' }).world;
  w = run(w, 'host', { type: 'travel.fly', to: 'london' }).world;
  expect(w.accounts[id]!.balance).toBe(before - fare);
  expect(w.players.host!.flightTicket).toBeUndefined();
  expect(w.players.host!.location?.market).toBe('london');
  expect(tryRun(w, 'host', { type: 'travel.fly', to: 'london' }).ok).toBe(false);
});
it('runs a custom multiplayer quiz, hides answers, excludes its author and pays the sole winner the full pot', () => {
  let w = homeVisit(homeVisit(people(), 'alice'), 'bob');
  const supply = moneyByCurrency(w);
  const beforeA = w.accounts[w.players.alice!.accounts.local]!.balance;
  const created = run(w, 'host', {
    type: 'play.create',
    venue: 'home:host',
    title: 'Friday quiz',
    game: 'quiz',
    stake: 1000,
    questions,
  });
  w = created.world;
  const id = created.result.id;
  expect(tryRun(w, 'host', { type: 'play.join', roomId: id }).ok).toBe(false);
  w = run(w, 'alice', { type: 'play.join', roomId: id }).world;
  w = run(w, 'bob', { type: 'play.join', roomId: id }).world;
  w = run(w, 'host', { type: 'play.start', roomId: id }).world;
  expect(playerView(w, 'alice')!.playRooms[0]!.question).not.toHaveProperty('answer');
  for (let round = 0; round < 3; round++) {
    w = run(
      w,
      'alice',
      { type: 'play.answer', roomId: id, round, choice: 0 },
      T0 + 1000 + round * 1000,
    ).world;
    expect(
      tryRun(
        w,
        'alice',
        { type: 'play.answer', roomId: id, round, choice: 0 },
        T0 + 1000 + round * 1000,
      ).ok,
    ).toBe(false);
    expect(playerView(w, 'bob')!.playRooms[0]!.myAnswer).toBeNull();
    w = run(
      w,
      'bob',
      { type: 'play.answer', roomId: id, round, choice: 1 },
      T0 + 1000 + round * 1000,
    ).world;
  }
  expect(w.playRooms![id]!.winners).toEqual(['alice']);
  expect(w.accounts[w.players.alice!.accounts.local]!.balance).toBe(beforeA + 1000);
  expect(w.accounts[w.playRooms![id]!.escrow]!.balance).toBe(0);
  expect(moneyByCurrency(w)).toEqual(supply);
  const paid = w.accounts[w.players.alice!.accounts.local]!.balance;
  w = run(w, 'alice', { type: 'play.sync', roomId: id }).world;
  expect(w.accounts[w.players.alice!.accounts.local]!.balance).toBe(paid);
});
it('refunds a cancelled room, prevents uninvited home entry, and cleans up expired stakes', () => {
  let w = people();
  const before = w.accounts[w.players.host!.accounts.local]!.balance;
  const created = run(w, 'host', {
    type: 'play.create',
    venue: 'home:host',
    title: 'Pool table',
    game: 'snooker',
    stake: 1000,
  });
  w = created.world;
  const id = created.result.id;
  expect(tryRun(w, 'alice', { type: 'play.join', roomId: id }).ok).toBe(false);
  w = run(w, 'host', { type: 'play.cancel', roomId: id }).world;
  expect(w.accounts[w.players.host!.accounts.local]!.balance).toBe(before);
  const next = run(w, 'host', {
    type: 'play.create',
    venue: 'home:host',
    title: 'Next table',
    game: 'snooker',
    stake: 1000,
  });
  w = next.world;
  w = run(w, 'host', { type: 'player.seen' }, T0 + 31 * 60_000).world;
  expect(w.playRooms![next.result.id]!.status).toBe('cancelled');
  expect(w.accounts[w.players.host!.accounts.local]!.balance).toBe(before);
});
it('locks football choices privately and resolves real player input instead of client scores', () => {
  let w = homeVisit(people(), 'alice');
  const made = run(w, 'host', {
    type: 'play.create',
    venue: 'home:host',
    title: 'Derby night',
    game: 'football',
    stake: 0,
  });
  w = made.world;
  const id = made.result.id;
  w = run(w, 'alice', { type: 'play.join', roomId: id }).world;
  w = run(w, 'host', { type: 'play.start', roomId: id }).world;
  w = run(w, 'host', { type: 'play.penalty', roomId: id, round: 0, lane: 2 }, T0 + 1000).world;
  expect(playerView(w, 'alice')!.playRooms[0]!.myMove).toBeNull();
  w = run(w, 'alice', { type: 'play.penalty', roomId: id, round: 0, lane: 1 }, T0 + 1000).world;
  expect(w.playRooms![id]!.members[0]!.score).toBe(1);
  expect(w.playRooms![id]!.round).toBe(1);
  expect(tryRun(w, 'host', { type: 'play.penalty', roomId: id, round: 0, lane: 1 }).ok).toBe(false);
});
it('simulates snooker server-side, respects turns, and replays deterministically', () => {
  let w = homeVisit(people(), 'alice');
  const made = run(w, 'host', {
    type: 'play.create',
    venue: 'home:host',
    title: 'Snooker night',
    game: 'snooker',
    stake: 0,
  });
  w = made.world;
  const id = made.result.id;
  w = run(w, 'alice', { type: 'play.join', roomId: id }).world;
  w = run(w, 'host', { type: 'play.start', roomId: id }).world;
  expect(
    tryRun(w, 'alice', { type: 'play.shot', roomId: id, round: 0, angle: 0, power: 85 }).ok,
  ).toBe(false);
  const cmd = { type: 'play.shot' as const, roomId: id, round: 0, angle: 0, power: 85 };
  const a = run(w, 'host', cmd, T0 + 1000),
    b = run(w, 'host', cmd, T0 + 1000);
  expect(a.world).toEqual(b.world);
  expect(a.world.playRooms![id]!.balls).not.toEqual(w.playRooms![id]!.balls);
  expect(a.world.playRooms![id]!.frames.length).toBeGreaterThan(1);
});
it('delivers furniture after arrival, lets an invited friend unpack, and blocks repeated collection', () => {
  let w = homeVisit(people(), 'alice');
  const item = FURNITURE.find((f) => f.slot === 'plants' && f.tier === 1)!;
  const order = run(w, 'host', { type: 'home.order', itemId: item.id });
  w = order.world;
  expect(w.players.host!.home?.items.some((i) => i.itemId === item.id)).toBe(false);
  expect(
    tryRun(w, 'alice', { type: 'living.collect', deliveryId: order.result.id }, T0 + 1000).ok,
  ).toBe(false);
  expect(
    tryRun(w, 'bob', { type: 'living.collect', deliveryId: order.result.id }, T0 + 31_000).ok,
  ).toBe(false);
  w = run(w, 'alice', { type: 'living.collect', deliveryId: order.result.id }, T0 + 31_000).world;
  expect(w.players.host!.home?.items.some((i) => i.itemId === item.id)).toBe(true);
  expect(
    tryRun(w, 'host', { type: 'living.collect', deliveryId: order.result.id }, T0 + 32_000).ok,
  ).toBe(false);
});
it('requires mutual consent for a date and holding hands, and lets either player stop', () => {
  let w = people();
  const d = run(w, 'host', { type: 'living.date.invite', playerId: 'alice', location: 'rooftop' });
  w = d.world;
  const id = d.result.id;
  expect(tryRun(w, 'host', { type: 'living.date.accept', dateId: id }).ok).toBe(false);
  w = run(w, 'alice', { type: 'living.date.accept', dateId: id }).world;
  expect(tryRun(w, 'host', { type: 'living.date.hands', dateId: id, accept: true }).ok).toBe(false);
  w = run(w, 'host', { type: 'living.date.hands', dateId: id, accept: false }).world;
  w = run(w, 'alice', { type: 'living.date.hands', dateId: id, accept: true }).world;
  expect(w.dates![id]!.holdingHands).toBe(true);
  w = run(w, 'host', { type: 'living.date.hands', dateId: id, accept: false }).world;
  expect(w.dates![id]!.holdingHands).toBe(false);
  expect(w.dates![id]!.handRequest).toBeNull();
  w = run(w, 'alice', { type: 'living.date.end', dateId: id }).world;
  expect(w.dates![id]!.status).toBe('ended');
});

it('keeps multiple cars, charges their running costs, selects a car and sells only that car', () => {
  let w = people();
  const supply = moneyByCurrency(w);
  const cars = playerView(w, 'host')!.market.shop.cars;
  const selected = cars.filter((c) => ['motorbike', 'hatchback'].includes(c.id));
  for (const car of selected)
    w = run(w, 'host', { type: 'car.buy', modelId: car.id, keepCurrent: true }).world;
  expect(w.players.host!.garage).toHaveLength(2);
  const monthly = selected.reduce((sum, c) => sum + c.monthlyCost, 0);
  const next = settle(w, 'lagos', 1);
  expect(
    next.accounts[next.players.host!.accounts.local]!.recent!.find(
      (t) => t.memo === 'Car running costs',
    )?.amount,
  ).toBe(-monthly);
  w = run(w, 'host', { type: 'car.select', modelId: 'motorbike' }).world;
  expect(w.players.host!.car!.modelId).toBe('motorbike');
  w = run(w, 'host', { type: 'car.sell' }).world;
  expect(w.players.host!.garage!.map((c) => c.modelId)).toEqual(['hatchback']);
  expect(w.players.host!.car!.modelId).toBe('hatchback');
  expect(moneyByCurrency(w)).toEqual(supply);
});
it('refunds tied games and rejects relocation while a paid stake or parcel is outstanding', () => {
  let w = homeVisit(people(), 'alice');
  const before = moneyByCurrency(w);
  const made = run(w, 'host', {
    type: 'play.create',
    venue: 'home:host',
    title: 'Even match',
    game: 'football',
    stake: 1000,
  });
  w = made.world;
  w = run(w, 'alice', { type: 'play.join', roomId: made.result.id }).world;
  expect(tryRun(w, 'host', { type: 'player.relocate', market: 'london' }).ok).toBe(false);
  w = run(w, 'host', { type: 'play.start', roomId: made.result.id }).world;
  for (let round = 0; round < 20; round++)
    for (const id of ['host', 'alice'])
      w = run(
        w,
        id,
        { type: 'play.penalty', roomId: made.result.id, round, lane: 2 },
        T0 + round * 500,
      ).world;
  expect(w.playRooms![made.result.id]!.winners).toHaveLength(2);
  expect(w.accounts[w.playRooms![made.result.id]!.escrow]!.balance).toBe(0);
  expect(moneyByCurrency(w)).toEqual(before);
  w = run(w, 'host', { type: 'home.order', itemId: FURNITURE[0]!.id }).world;
  expect(tryRun(w, 'host', { type: 'player.relocate', market: 'london' }).ok).toBe(false);
});

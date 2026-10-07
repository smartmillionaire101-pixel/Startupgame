import { expect, it } from 'vitest';
import { makeWorld, run, tryRun, moneyByCurrency } from './helpers.js';

it.each(['founder', 'investor', 'banker'] as const)(
  'creates a playable %s and defers business details',
  (role) => {
    const before = makeWorld();
    const { world } = run(before, 'quick', {
      type: 'player.quickStart',
      username: `quick_${role}`,
      role,
    });
    expect(world.players.quick!.role).toBe(role);
    expect(world.players.quick!.companyIds).toEqual([]);
    expect(moneyByCurrency(world)).toEqual(moneyByCurrency(before));
    expect(
      tryRun(world, 'quick', { type: 'player.quickStart', username: 'another', role }).ok,
    ).toBe(false);
  },
);

it('saves profile details without resetting progress and lets a founder create a company later', () => {
  let world = run(makeWorld(), 'quick', {
    type: 'player.quickStart',
    username: 'profile_user',
    role: 'founder',
  }).world;
  const before = world.players.quick!;
  world = run(world, 'quick', {
    type: 'player.profile',
    name: 'Ada',
    gender: 'female',
    backgroundId: 'f-consultant',
  }).world;
  expect(world.players.quick!).toMatchObject({
    name: 'Ada',
    gender: 'female',
    backgroundId: 'f-consultant',
    skills: before.skills,
  });
  expect(moneyByCurrency(world)).toEqual(moneyByCurrency(makeWorld()));
  world = run(world, 'quick', {
    type: 'company.found',
    company: {
      name: 'Profile Works',
      industry: 'saas',
      revenueModel: 'services',
      idea: 'Tools for local teams',
      incorporation: 'local',
    },
  }).world;
  expect(world.players.quick!.companyIds).toHaveLength(1);
  expect(
    tryRun(world, 'quick', { type: 'player.profile', name: 'Ada', backgroundId: 'b-commercial' })
      .ok,
  ).toBe(false);
});

it('allows investors to update their focus from their profile', () => {
  let world = run(makeWorld(), 'quick', {
    type: 'player.quickStart',
    username: 'focus_user',
    role: 'investor',
  }).world;
  world = run(world, 'quick', {
    type: 'player.profile',
    name: 'Ike',
    backgroundId: 'i-first',
    investor: { sectors: ['saas'], stages: ['seed'], checkSize: 500_000 },
  }).world;
  expect(world.players.quick!.investor).toMatchObject({
    sectors: ['saas'],
    stages: ['seed'],
    checkSize: 500_000,
  });
});

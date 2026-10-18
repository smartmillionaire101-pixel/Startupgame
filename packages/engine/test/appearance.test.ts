import { describe, expect, it } from 'vitest';
import {
  HAIR_STYLES,
  SKIN_TONES,
  appearanceSeed,
  defaultAppearance,
  type Appearance,
} from '../src/appearance.js';
import { commandSchema } from '../src/commands.js';
import { playerView } from '../src/views.js';
import { addFounder, makeWorld, moneyByCurrency, run, tryRun, T0 } from './helpers.js';

/** Phase 6a: the character creator's look, stored on the player. */
const LOOK: Appearance = {
  skin: '#7a4a2a',
  face: 'square',
  hairStyle: 'twists',
  hairColor: '#4a2c17',
  facialHair: 'goatee',
  glasses: 'shades',
  headwear: 'gele',
  topStyle: 'kaftan',
  topColor: '#db2777',
};

const parse = (appearance: unknown) =>
  commandSchema.safeParse({ type: 'player.appearance', appearance });

describe('player.appearance', () => {
  it('validates every part', () => {
    expect(parse(LOOK).success).toBe(true);
    expect(parse({ hairStyle: 'locs' }).success).toBe(true);
    expect(parse({}).success).toBe(false);
    expect(parse({ hairStyle: 'mohawk' }).success).toBe(false);
    expect(parse({ skin: '#123456' }).success).toBe(false);
    expect(parse({ topColor: 'red' }).success).toBe(false);
    expect(parse({ topColor: '#12345' }).success).toBe(false);
    expect(parse({ ...LOOK, extra: 1 }).success).toBe(true);
    const ok = parse({ topColor: '#ABCDEF' });
    expect(ok.success && ok.data.type === 'player.appearance' && ok.data.appearance.topColor).toBe(
      '#abcdef',
    );
  });

  it('stores the look, shows it in your view and to others, and moves no money', () => {
    let world = addFounder(addFounder(makeWorld(), 'u_a', 'lagos', 'Alpha Pay'), 'u_b');
    const before = moneyByCurrency(world);
    expect(playerView(world, 'u_a')!.me.appearance).toBeNull();
    world = run(world, 'u_a', { type: 'player.appearance', appearance: LOOK }, T0 + 5).world;
    expect(world.players.u_a!.appearance).toEqual(LOOK);
    expect(world.players.u_a!.appearanceAt).toBe(T0 + 5);
    const me = playerView(world, 'u_a')!.me;
    expect(me.appearance).toEqual(LOOK);
    expect(me.appearanceAt).toBe(T0 + 5);
    const seen = playerView(world, 'u_b')!.players.find((p) => p.id === 'u_a')!;
    expect(seen.appearance).toEqual(LOOK);
    expect(moneyByCurrency(world)).toEqual(before);

    // A haircut changes only the hair.
    world = run(world, 'u_a', {
      type: 'player.appearance',
      appearance: { hairStyle: 'bald' },
    }).world;
    expect(world.players.u_a!.appearance).toEqual({ ...LOOK, hairStyle: 'bald' });
  });

  it('starts a partial change from the seeded look', () => {
    let world = addFounder(makeWorld(), 'u_a');
    const p = world.players.u_a!;
    const seeded = defaultAppearance(appearanceSeed(p), p.gender);
    world = run(world, 'u_a', {
      type: 'player.appearance',
      appearance: { glasses: 'round' },
    }).world;
    expect(world.players.u_a!.appearance).toEqual({ ...seeded, glasses: 'round' });
  });

  it('is refused for a malformed look and for AI players', () => {
    const world = addFounder(makeWorld(), 'u_a');
    const ai = Object.values(world.players).find((p) => p.ai)!;
    expect(
      tryRun(world, ai.id, { type: 'player.appearance', appearance: { glasses: 'round' } }).ok,
    ).toBe(false);
  });

  it('is removed when a player is anonymised', () => {
    let world = addFounder(makeWorld(), 'u_a');
    world = run(world, 'u_a', { type: 'player.appearance', appearance: LOOK }).world;
    world = run(world, null, { type: 'player.anonymize', playerId: 'u_a' }).world;
    expect(world.players.u_a!.appearance).toBeUndefined();
  });
});

describe('defaultAppearance', () => {
  it('is a pure function of the seed, and follows a gender', () => {
    expect(defaultAppearance('ai:founder:x')).toEqual(defaultAppearance('ai:founder:x'));
    for (let k = 0; k < 40; k++) {
      expect(defaultAppearance(`p${k}`, 'female').facialHair).toBe('none');
      expect(defaultAppearance(`p${k}`, 'male').headwear).toBe('none');
      expect(defaultAppearance(`p${k}`, 'female').headwear).toBe('none');
    }
  });

  it('makes a diverse crowd', () => {
    const crowd = Array.from({ length: 300 }, (_, k) => defaultAppearance(`walker:${k}`));
    const skins = new Set(crowd.map((a) => a.skin));
    const hair = new Set(crowd.map((a) => a.hairStyle));
    expect(skins.size).toBe(SKIN_TONES.length);
    expect(hair.size).toBe(HAIR_STYLES.length);
    expect(new Set(crowd.map((a) => a.topColor)).size).toBeGreaterThan(8);
    expect(crowd.some((a) => a.glasses !== 'none')).toBe(true);
    // Headwear is a choice in the creator, never given by the seed.
    expect(crowd.every((a) => a.headwear === 'none')).toBe(true);
    expect(crowd.some((a) => a.facialHair === 'beard')).toBe(true);
  });

  it('takes its skin tones from the person’s city', () => {
    const share = (market: 'lagos' | 'london' | 'dubai') => {
      const crowd = Array.from({ length: 600 }, (_, k) =>
        defaultAppearance(`walker:${k}`, null, market),
      );
      // The three lightest tones.
      return crowd.filter((a) => SKIN_TONES.indexOf(a.skin) >= 5).length / crowd.length;
    };
    expect(share('lagos')).toBeLessThan(0.15);
    expect(share('london')).toBeGreaterThan(0.6);
    const dubai = share('dubai');
    expect(dubai).toBeGreaterThan(0.3);
    expect(dubai).toBeLessThan(0.6);
    // The same person in the same city: the same face, every time.
    expect(defaultAppearance('ai:x', 'male', 'london')).toEqual(
      defaultAppearance('ai:x', 'male', 'london'),
    );
  });

  it('passes the command schema', () => {
    for (let k = 0; k < 50; k++) expect(parse(defaultAppearance(`x${k}`)).success).toBe(true);
  });
});

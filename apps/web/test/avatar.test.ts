import { afterEach, describe, expect, it } from 'vitest';
import { defaultAppearance, type Appearance } from '@runway/engine';
import { appearanceOfLook, avatarLook, lookFromAppearance } from '../src/city/art';
import { rememberLook, setLookOverride } from '../src/city/acts/look';
import { portraitShapes } from '../src/avatar/portrait';

/** Phase 6a: one look → every drawing of it. */
const LOOK: Appearance = {
  skin: '#8d5524',
  face: 'round',
  hairStyle: 'afro',
  hairColor: '#2b1b10',
  facialHair: 'beard',
  glasses: 'round',
  headwear: 'none',
  topStyle: 'blazer',
  topColor: '#16a34a',
};

const parts = (a: Appearance, gender: 'female' | 'male' = 'male') =>
  portraitShapes(lookFromAppearance(a, gender, '#1e293b'));
const fills = (a: Appearance, part: string) =>
  parts(a)
    .filter((s) => s.part === part)
    .map((s) => s.fill);

describe('portraitShapes', () => {
  it('draws the skin, hair, top and extras of a look', () => {
    expect(fills(LOOK, 'face')).toEqual([LOOK.skin]);
    expect(fills(LOOK, 'hair')).toContain(LOOK.hairColor);
    expect(fills(LOOK, 'top')).toContain(LOOK.topColor);
    expect(fills(LOOK, 'beard')).toEqual([LOOK.hairColor]);
    expect(fills(LOOK, 'frame').length).toBeGreaterThan(0);
    expect(fills(LOOK, 'lapel').length).toBe(2);
  });

  it('leaves out what a look does not have', () => {
    const bare: Appearance = { ...LOOK, hairStyle: 'bald', facialHair: 'none', glasses: 'none' };
    expect(fills(bare, 'hair')).toEqual([]);
    expect(fills(bare, 'beard')).toEqual([]);
    expect(fills(bare, 'frame')).toEqual([]);
  });

  it('draws every hairstyle differently', () => {
    const styles = [
      'bald',
      'buzz',
      'short',
      'curly',
      'afro',
      'twists',
      'locs',
      'braids',
      'bun',
      'long',
    ] as const;
    const drawn = styles.map((hairStyle) =>
      JSON.stringify(parts({ ...LOOK, hairStyle }).filter((s) => s.part === 'hair')),
    );
    expect(new Set(drawn).size).toBe(styles.length);
  });

  it('covers the hair with a headwrap or gele, in the top colour', () => {
    const gele = parts({ ...LOOK, headwear: 'gele' });
    expect(gele.filter((s) => s.part === 'hair')).toEqual([]);
    expect(gele.some((s) => s.part === 'headwear' && s.fill === LOOK.topColor)).toBe(true);
  });
});

describe('avatarLook and saved looks', () => {
  afterEach(() => {
    rememberLook('u_look', null);
    setLookOverride('u_look', null);
  });

  it('draws a player as they saved themselves, over their background', () => {
    const seeded = avatarLook('f-engineer', 'u_look', 'male');
    rememberLook('u_look', LOOK, 100);
    const l = avatarLook('f-engineer', 'u_look', 'male');
    expect(l).toMatchObject({
      skin: LOOK.skin,
      hair: LOOK.hairColor,
      hairStyle: 'afro',
      top: LOOK.topColor,
      topStyle: 'blazer',
      glasses: 'round',
      facialHair: 'beard',
      bottom: seeded.bottom,
    });
    expect(appearanceOfLook(l)).toEqual(LOOK);
  });

  it('lets a newer haircut on this device win, and an older one lose', () => {
    rememberLook('u_look', LOOK, 1_000);
    setLookOverride('u_look', { hairStyle: 'buzz', at: 2_000 });
    expect(avatarLook(undefined, 'u_look').hairStyle).toBe('buzz');
    setLookOverride('u_look', null);
    setLookOverride('u_look', { hairStyle: 'buzz', at: 500 });
    expect(avatarLook(undefined, 'u_look').hairStyle).toBe('afro');
  });

  it('gives everyone else the engine’s seeded look, dressed by background', () => {
    const a = defaultAppearance('ai:founder:x:f-dropout', 'female');
    const l = avatarLook('f-dropout', 'ai:founder:x', 'female');
    expect(l.skin).toBe(a.skin);
    expect(l.hairStyle).toBe(a.hairStyle);
    // The dropout's orange hoodie colour and cap.
    expect(l.top).toBe('#f97316');
    expect(l.headwear).toBe('cap');
  });
});

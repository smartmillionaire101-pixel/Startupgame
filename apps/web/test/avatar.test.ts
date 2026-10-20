import { afterEach, describe, expect, it } from 'vitest';
import { defaultAppearance, type Appearance } from '@runway/engine';
import { appearanceOfLook, avatarLook, drawnGender, lookFromAppearance } from '../src/city/art';
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
      JSON.stringify(parts({ ...LOOK, hairStyle }, 'female').filter((s) => s.part === 'hair')),
    );
    expect(new Set(drawn).size).toBe(styles.length);
  });

  it('covers the hair with a headwrap or gele, in the top colour', () => {
    const gele = parts({ ...LOOK, headwear: 'gele' }, 'female');
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

  it('draws a man as a man: a look saved as a woman (or before he chose) follows his gender', () => {
    // The look a woman's creator gave him: a dress, a gele, long hair, no beard.
    const hers: Appearance = {
      ...LOOK,
      hairStyle: 'long',
      facialHair: 'none',
      headwear: 'gele',
      topStyle: 'dress',
    };
    rememberLook('u_look', hers, 100);
    const him = avatarLook('f-engineer', 'u_look', 'male');
    expect(him.gender).toBe('male');
    expect(him.topStyle).toBe('kaftan');
    expect(him.headwear).not.toBe('gele');
    expect(['bun', 'long', 'braids']).not.toContain(him.hairStyle);
    // His colours and face stay his.
    expect(him).toMatchObject({ skin: hers.skin, top: hers.topColor, hair: hers.hairColor });
    // A woman keeps all of it, and loses a beard.
    const her = avatarLook('f-engineer', 'u_look', 'female');
    expect(her).toMatchObject({ topStyle: 'dress', headwear: 'gele', hairStyle: 'long' });
    rememberLook('u_look', { ...LOOK, facialHair: 'beard' }, 200);
    expect(avatarLook('f-engineer', 'u_look', 'female').facialHair).toBe('none');
    // A salon cut kept on this device follows a later gender change too.
    rememberLook('u_look', null);
    setLookOverride('u_look', { hairStyle: 'bun', at: 300 });
    expect(avatarLook('f-engineer', 'u_look', 'male').hairStyle).not.toBe('bun');
  });

  it('never gives a man a dress from his seed, in any background', () => {
    for (const bg of ['f-engineer', 'f-banker', 'i-exited', 'b-wealthy', undefined])
      for (let k = 0; k < 200; k++) {
        const l = avatarLook(bg, `u_seed${k}`, 'male');
        expect(l.gender).toBe('male');
        expect(l.topStyle).not.toBe('dress');
        expect(['bun', 'long', 'braids']).not.toContain(l.hairStyle);
      }
  });

  it('agrees on the gender of a player who never chose one (the creator, the portrait, every scene)', () => {
    const g = drawnGender('f-engineer', 'u_old', null);
    expect(avatarLook('f-engineer', 'u_old', null).gender).toBe(g);
    expect(drawnGender('f-engineer', 'u_old', 'male')).toBe('male');
  });
});

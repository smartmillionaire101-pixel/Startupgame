import { describe, expect, it } from 'vitest';
import { mix, OWN_HAIR, outfitFor, type OutfitLook } from '../src/three-kit/humans/outfit';
import { DENIM, SHIRT_WHITE, TIE_COLOUR, shoeColour } from '../src/avatar/worn';

const base: OutfitLook = {
  skin: '#8d5524',
  hair: '#1f130c',
  hairStyle: 'short',
  top: '#475569',
  bottom: '#1f2937',
  accessory: 'none',
};

describe('a look as the CC0 modular people', () => {
  it('a man in a hoodie and jeans wears the kit hoodie, jeans and trainers in his colours', () => {
    const o = outfitFor({
      ...base,
      gender: 'male',
      topStyle: 'hoodie',
      legs: 'jeans',
      shoes: 'trainers',
    });
    expect(o.kit).toBe('men');
    expect([o.head, o.body, o.legs, o.feet]).toEqual([
      'Suit_Head',
      'Casual_Body',
      'Casual2_Legs',
      'Casual2_Feet',
    ]);
    expect(o.colours['Casual_Body/Purple']).toBe('#475569');
    expect(o.colours['Casual2_Legs/LightBlue']).toBe(DENIM);
    expect(o.colours['Casual2_Feet/Red_Dark']).toBe(shoeColour('trainers'));
    // Skin on every part, hair on the head's own hair.
    for (const n of [o.head, o.body, o.legs, o.feet])
      expect(o.colours[`${n}/Skin`]).toBe('#8d5524');
    expect(o.colours['Suit_Head/Hair']).toBe('#1f130c');
    expect(o.modelHair).toBe(true);
  });

  it('a suit is the kit suit, with a white shirt and the wardrobe tie (or none)', () => {
    const tied = outfitFor({
      ...base,
      gender: 'male',
      topStyle: 'suit',
      tie: 'navy',
      top: '#1e3a8a',
    });
    expect([tied.body, tied.legs, tied.feet]).toEqual(['Suit_Body', 'Suit_Legs', 'Suit_Feet']);
    expect(tied.colours['Suit_Body/Suit']).toBe('#1e3a8a');
    expect(tied.colours['Suit_Body/White']).toBe(SHIRT_WHITE);
    expect(tied.colours['Suit_Body/Tie']).toBe(TIE_COLOUR.navy);
    const open = outfitFor({ ...base, gender: 'male', topStyle: 'suit' });
    expect(open.colours['Suit_Body/Tie']).toBe(SHIRT_WHITE);
  });

  it('a woman in a dress wears the kit dress (top and skirt in the dress colour) and its shoes', () => {
    const o = outfitFor({
      ...base,
      gender: 'female',
      topStyle: 'dress',
      top: '#db2777',
      hairStyle: 'bun',
    });
    expect(o.kit).toBe('women');
    expect([o.head, o.body, o.legs, o.feet]).toEqual([
      'Formal_Head',
      'Formal_Body',
      'Formal_Legs',
      'Formal_Feet',
    ]);
    expect(o.colours['Formal_Body/LimeGreen']).toBe('#db2777');
    expect(o.colours['Formal_Legs/LimeGreen']).toBe('#db2777');
    expect(o.colours['Formal_Head/Red']).toBe('#1f130c');
    // Golf clothes: trousers, never a skirt.
    expect(outfitFor({ ...base, gender: 'female', topStyle: 'dress', trousers: true }).legs).toBe(
      'Casual_Legs',
    );
  });

  it("hair the kit hasn't got (an afro, twists, bald) or headwear: the head's own hair is hidden", () => {
    for (const hairStyle of OWN_HAIR)
      expect(outfitFor({ ...base, hairStyle }).modelHair, hairStyle).toBe(false);
    expect(outfitFor({ ...base, headwear: 'gele' }).modelHair).toBe(false);
    expect(outfitFor({ ...base, accessory: 'cap' }).modelHair).toBe(false);
    // Where our own hair isn't drawn (the city), the nearest head with hair instead.
    const city = outfitFor({ ...base, hairStyle: 'afro', gender: 'female' }, { ownHair: false });
    expect(city.modelHair).toBe(true);
    expect(city.head).toBe('Formal_Head');
  });

  it('shoes pick the kit shoes: heels and courts are the formal pair, boots the punk boots', () => {
    const f = (shoes: string) => outfitFor({ ...base, gender: 'female', shoes }).feet;
    expect(f('heels')).toBe('Formal_Feet');
    expect(f('courts')).toBe('Formal_Feet');
    expect(f('boots')).toBe('Punk_Feet');
    expect(f('oxfords')).toBe('Suit_Feet');
    const m = (shoes: string) => outfitFor({ ...base, gender: 'male', shoes }).feet;
    expect(m('flipflops')).toBe('Beach_Feet');
    expect(m('boots')).toBe('Worker_Feet');
  });

  it('the same look always comes out the same, and brows are a darker hair colour', () => {
    const l = { ...base, gender: 'female' as const, hair: '#e2c290', hairStyle: 'long' };
    expect(outfitFor(l)).toEqual(outfitFor(l));
    expect(outfitFor(l).colours['Casual_Head/Hair_Brown']).toBe(mix('#e2c290', '#140d08', 0.55));
    expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080');
  });
});

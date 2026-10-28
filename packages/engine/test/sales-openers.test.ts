/**
 * Round 7 (#8): sales conversation openings that don't fit the company: a
 * telehealth company selling to a hospital was offered "Records, bookings and
 * billing in one place, built for how you work". Openings come per segment,
 * and the product-fit one follows the company's idea.
 */
import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { INDUSTRIES, SEGMENT_TEMPLATES, type Industry } from '../src/data/industries.js';
import {
  PRODUCT_THEMES,
  SALES_OPENERS,
  openerFor,
  productTheme,
  type OpenerNeed,
} from '../src/data/sales-openers.js';
import { salesWithTalk } from '../src/salestalk.js';
import { companyOf, run } from './helpers.js';
import { founder } from './r7-helpers.js';

const NEEDS: OpenerNeed[] = ['fit', 'price', 'stars', 'reliability'];

/** Words only one industry's openings should use. */
const OWN: Partial<Record<Industry, RegExp>> = {
  fintech: /\b(payments?|payouts?|owes?|ledger|card machine)\b/i,
  healthtech: /\b(doctors?|patients?|clinics?|health)\b/i,
  edtech: /\b(exams?|teachers?|tutor|courses?|homework)\b/i,
  logistics: /\b(parcels?|truckloads?|pickups?|depots?)\b/i,
  agritech: /\b(harvest|farmers?|seeds|produce|tonne)\b/i,
};

describe('sales openings', () => {
  it('has every need for every segment of every industry, in English and French', () => {
    for (const s of SEGMENT_TEMPLATES) {
      const o = SALES_OPENERS[s.key];
      expect(o, s.key).toBeDefined();
      for (const n of NEEDS) {
        const l = openerFor(s.key, n, null)!;
        expect(l.en.length > 0 && l.fr.length > 0, `${s.key} ${n}`).toBe(true);
      }
      // Every kind of product the industry has gets its own product-fit opening.
      for (const t of PRODUCT_THEMES[s.industry] ?? [])
        expect(o!.fit[t.id], `${s.key} ${t.id}`).toBeDefined();
    }
  });

  it('never borrows another industry’s words', () => {
    const bad: string[] = [];
    for (const s of SEGMENT_TEMPLATES)
      for (const [j, words] of Object.entries(OWN) as [Industry, RegExp][]) {
        if (j === s.industry) continue;
        const o = SALES_OPENERS[s.key]!;
        for (const l of [...Object.values(o.fit), o.price, o.stars, o.reliability])
          if (words.test(l.en)) bad.push(`${s.key} uses ${j}'s words: ${l.en}`);
      }
    expect(bad).toEqual([]);
  });

  it('gives each segment of an industry its own product-fit opening', () => {
    for (const i of INDUSTRIES) {
      const fits = SEGMENT_TEMPLATES.filter((s) => s.industry === i).map(
        (s) => openerFor(s.key, 'fit', null)!.en,
      );
      expect(new Set(fits).size, i).toBe(fits.length);
    }
  });

  it('reads the kind of product from the idea', () => {
    expect(productTheme('healthtech', 'Telehealth for families and hospitals')).toBe('care');
    expect(productTheme('healthtech', 'Records and billing software for clinics')).toBe('records');
    expect(productTheme('fintech', 'Cheap card and phone payments for market traders')).toBe(
      'payments',
    );
    expect(productTheme('fintech', 'See who owes you: credit books for traders')).toBe('books');
    expect(productTheme('edtech', 'A marketplace of checked, rated tutors')).toBe('learning');
    expect(productTheme('logistics', 'Same-day delivery')).toBeNull();
  });

  it('a telehealth company talking to a clinic or hospital leads with doctors, not records', () => {
    let w = founder('healthtech', true, 7, 'Telehealth for families and hospitals');
    w = run(w, 'u_founder', {
      type: 'company.strategy',
      companyId: companyOf(w, 'u_founder').id,
      targetSegments: ['healthtech.clinics'],
    }).world;
    const r = run(w, 'u_founder', { type: 'sales.prospect' });
    w = r.world;
    const id = r.result.leads[0].id as string;
    w = run(w, 'u_founder', { type: 'sales.advance', dealId: id, action: 'contact' }).world;
    // They need a product that fits: the product-fit opening is on offer.
    w = produce(w, (x) => {
      companyOf(x, 'u_founder').deals!.find((d) => d.id === id)!.customer.need = 'fit';
    });
    w = run(w, 'u_founder', { type: 'sales.talk', dealId: id, action: 'start' } as never).world;
    const c = companyOf(w, 'u_founder');
    const talk = salesWithTalk(w, c).deals.find((d) => d.id === id)!.talk!;
    const lines = talk.leadOptions.map((o) => o.text.en).join(' ');
    expect(lines).not.toMatch(/Records, bookings and billing/);
    const fit = openerFor('healthtech.clinics', 'fit', 'care')!.en;
    expect(fit).toMatch(/doctors|patients/i);
    expect(talk.leadOptions.find((o) => o.id === 'fit')!.text.en).toBe(fit);
  });
});

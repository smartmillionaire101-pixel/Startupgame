/**
 * The sales conversation (salestalk.ts; player feedback, round two: "I simply
 * click and I have a customer. I should be quizzed with context of the
 * business and their needs"). Lead, price and terms against the prospect's
 * real needs, a live win chance, and a scored result that closes through the
 * pipeline. Feedback-note worlds only.
 */
import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { TALK, salesWithTalk } from '../src/salestalk.js';
import { customerFacts } from '../src/traction.js';
import { FEEDBACK_NOTE } from '../src/releases.js';
import { businessesOf, isOpen, specOf } from '../src/economy.js';
import type { SalesDeal, World } from '../src/types.js';
import {
  addFounder,
  companyOf,
  makeWorld,
  moneyByCurrency,
  negativeInternalAccounts,
  run,
  tryRun,
} from './helpers.js';

const F = 'u_founder';
const announce = (w: World) =>
  run(w, null, { type: 'system.announce', id: FEEDBACK_NOTE, text: 'Feedback.' }).world;
const deal = (w: World, id: string) => companyOf(w, F).deals!.find((d) => d.id === id)!;
const talk = (w: World, dealId: string, action: string, extra: Record<string, unknown> = {}) =>
  run(w, F, { type: 'sales.talk', dealId, action, ...extra } as never);
const view = (w: World, id: string) =>
  salesWithTalk(w, companyOf(w, F)).deals.find((d) => d.id === id)!.talk!;

/** A founder with one contacted lead (seeded per world). */
function contacted(seed = 42): { w: World; id: string } {
  let w = announce(addFounder(makeWorld(seed)));
  const r = run(w, F, { type: 'sales.prospect' });
  const id = r.result.leads[0].id as string;
  w = run(r.world, F, { type: 'sales.advance', dealId: id, action: 'contact' }).world;
  return { w, id };
}

/** Make the customer easy (or hard) to win, to test outcomes rather than dice. */
const tune = (w: World, id: string, f: (d: SalesDeal) => void) =>
  produce(w, (x) => {
    f(companyOf(x, F).deals!.find((d) => d.id === id)!);
  });

/** The whole conversation with the best calls (or the worst). */
function converse(w: World, id: string, good: boolean) {
  w = talk(w, id, 'start').world;
  const v = view(w, id);
  const lead = good ? deal(w, id).customer.need : 'tour';
  w = talk(w, id, 'lead', { option: lead }).world;
  w = talk(w, id, 'price', { option: good ? 'mid' : 'top', discountPct: 0 }).world;
  // The best terms on offer are the ones that raise the chance most (the worst, least).
  const byChance = v.termsOptions
    .map((o) => ({ id: o.id, p: talk(w, id, 'terms', { option: o.id }).result.chance }))
    .sort((x, y) => y.p - x.p);
  const annual = byChance.find((o) => o.id === 'annual');
  const terms = (good ? byChance[0] : (annual ?? byChance[byChance.length - 1]))!.id;
  w = talk(w, id, 'terms', { option: terms }).world;
  return talk(w, id, 'ask');
}

describe('a sales conversation', () => {
  it('opens with their real need on offer, deterministically, for 2 hours', () => {
    const a = contacted();
    const b = contacted();
    const ra = talk(a.w, a.id, 'start');
    const rb = talk(b.w, b.id, 'start');
    expect(deal(ra.world, a.id).talk).toEqual(deal(rb.world, b.id).talk);
    const t = deal(ra.world, a.id).talk!;
    // Three choices a turn (player feedback: "Maybe we reduce the questions").
    expect(t.leadOptions).toHaveLength(3);
    expect(t.leadOptions).toContain(deal(ra.world, a.id).customer.need);
    expect(t.leadOptions).toContain('tour');
    expect(t.termsOptions).toHaveLength(3);
    expect(view(ra.world, a.id).termsOptions).toHaveLength(3);
    expect(ra.world.players[F]!.hours.used - a.w.players[F]!.hours.used).toBe(TALK.hours);
    // Starting again resumes it, without the hours.
    const again = talk(ra.world, a.id, 'start');
    expect(again.result.resumed).toBe(true);
    expect(again.world.players[F]!.hours.used).toBe(ra.world.players[F]!.hours.used);
  });

  it('takes the turns in order, with a live chance and a reaction each', () => {
    const { w: w0, id } = contacted();
    let w = talk(w0, id, 'start').world;
    const early = tryRun(w, F, { type: 'sales.talk', dealId: id, action: 'price', option: 'mid' });
    expect(!early.ok && early.error.code).toBe('sales.talk.order');
    const need = deal(w, id).customer.need;
    const right = talk(w, id, 'lead', { option: need });
    const wrong = talk(w, id, 'lead', { option: 'tour' });
    expect(right.result.chance).toBeGreaterThan(wrong.result.chance);
    w = right.world;
    expect(view(w, id).lead!.reaction!.en).toMatch(/exactly my problem/);
    const over = tryRun(w, F, {
      type: 'sales.talk',
      dealId: id,
      action: 'price',
      option: 'mid',
      discountPct: 45,
    });
    expect(!over.ok && over.error.code).toBe('sales.discount');
    w = talk(w, id, 'price', { option: 'mid', discountPct: 10 }).world;
    expect(view(w, id).price!.monthly).toBe(Math.round(view(w, id).price!.amount * 0.9));
    expect(view(w, id).step).toBe('terms');
    // No discovery yet: the price was named against a guess, and the view says so.
    expect(view(w, id).band.known).toBe(false);
    expect(view(w, id).price!.guessed).toBe(true);
  });

  it('a won conversation is a paying account through the pipeline, scored with the best calls', () => {
    let won: ReturnType<typeof converse> | null = null;
    for (let seed = 1; seed < 12 && !won; seed++) {
      const { w, id } = contacted(seed);
      const easy = tune(w, id, (d) => {
        d.customer.trust = 0.9;
        d.customer.authority = 0.9;
        d.customer.urgency = 0.9;
        d.demoScore = 0.9;
      });
      const before = moneyByCurrency(easy);
      const r = converse(easy, id, true);
      expect(moneyByCurrency(r.world)).toEqual(before);
      expect(negativeInternalAccounts(r.world)).toEqual([]);
      if (r.result.won) won = r;
    }
    expect(won).not.toBeNull();
    const w = won!.world;
    const c = companyOf(w, F);
    const d = c.deals!.find((x) => x.stage === 'won')!;
    expect(c.salesAccounts!.some((a) => a.dealId === d.id)).toBe(true);
    expect(customerFacts(w, c).accounts).toBe(1);
    const res = view(w, d.id).result!;
    expect(res.won).toBe(true);
    expect(res.score).toBeGreaterThanOrEqual(80);
    expect(res.turns.map((t) => t.turn)).toEqual(['lead', 'price', 'terms']);
    expect(res.cared.reduce((a, x) => a + x.weight, 0)).toBeCloseTo(1, 1);
    expect(res.cared.filter((x) => x.theirs)).toHaveLength(1);
  });

  it('a lost conversation names its reason, scores low, and leaves the recovery', () => {
    let lost: ReturnType<typeof converse> | null = null;
    let dealId = '';
    for (let seed = 1; seed < 12 && !lost; seed++) {
      const { w, id } = contacted(seed);
      const hard = tune(w, id, (d) => {
        d.customer.trust = 0.05;
        d.customer.authority = 0.1;
        // Neither price-minded nor idle: of the three terms on offer, two fit badly.
        d.customer.urgency = 0.5;
        d.customer.need = 'stars';
      });
      const r = converse(hard, id, false);
      if (!r.result.won) {
        lost = r;
        dealId = id;
      }
    }
    expect(lost).not.toBeNull();
    const d = deal(lost!.world, dealId);
    expect(d.stage).toBe('lost');
    expect(d.lossReason).toBeTruthy();
    const res = view(lost!.world, dealId).result!;
    expect(res.won).toBe(false);
    expect(res.score).toBeLessThan(50);
    expect(res.turns.every((t) => t.mark !== 'good')).toBe(true);
    expect(res.turns.some((t) => t.best !== null || t.bestAmount !== null)).toBe(true);
    // The pipeline's one recovery attempt opens a fresh conversation.
    const back = run(lost!.world, F, { type: 'sales.advance', dealId, action: 'recover' }).world;
    expect(deal(back, dealId).talk!.result).toBeUndefined();
    // None of the last one's turns carry over: you sit down again (new openings, the hours).
    const v = view(back, dealId);
    expect(v.step).toBeNull();
    expect(v.lead).toBeNull();
    expect(v.price).toBeNull();
    expect(v.terms).toBeNull();
    const early = tryRun(back, F, { type: 'sales.talk', dealId, action: 'lead', option: 'tour' });
    expect(early.ok || early.error.code).toBe('sales.talk.none');
    expect(v.canStart).toBe(true);
    const used = back.players[F]!.hours.used;
    const again = talk(back, dealId, 'start');
    expect(again.result.started).toBe(true);
    expect(deal(again.world, dealId).talk!.n).toBe(2);
    expect(view(again.world, dealId).step).toBe('lead');
    expect(again.world.players[F]!.hours.used).toBe(used + TALK.hours);
  });

  it('walks into a local business: it joins the pipeline as a conversation', () => {
    const w0 = announce(addFounder(makeWorld()));
    const c = companyOf(w0, F);
    const b = Object.values(businessesOf(w0.markets[c.market]!))
      .filter((x) => isOpen(x) && (specOf(x).buys[c.industry] ?? 0) > 0)
      .sort((x, y) => (x.id < y.id ? -1 : 1))[0]!;
    const r = run(w0, F, { type: 'sales.talk', businessId: b.id, action: 'start' });
    const d = deal(r.world, r.result.dealId);
    expect(d.customer.businessId).toBe(b.id);
    expect(d.stage).toBe('contacted');
    // The card says what the business is ("Spa"), not a segment it may not fit.
    const row = salesWithTalk(r.world, companyOf(r.world, F)).deals.find((x) => x.id === d.id)!;
    expect(row.businessKind).toBe(specOf(b).label);
    expect(d.talk!.leadOptions).toHaveLength(3);
    expect(r.world.players[F]!.businessPitches!.count).toBe(1);
    // Walking in again resumes the same deal.
    const again = run(r.world, F, { type: 'sales.talk', businessId: b.id, action: 'start' });
    expect(again.result.dealId).toBe(d.id);
  });

  it('cannot start on a lead you have not called', () => {
    const w = announce(addFounder(makeWorld()));
    const r = run(w, F, { type: 'sales.prospect' });
    const out = tryRun(r.world, F, {
      type: 'sales.talk',
      dealId: r.result.leads[0].id,
      action: 'start',
    });
    expect(!out.ok && out.error.code).toBe('sales.stage');
  });
});

describe('without the feedback note', () => {
  it('is an unknown command, the view has no conversations, and the close works as before', () => {
    let w = addFounder(makeWorld());
    const r = run(w, F, { type: 'sales.prospect' });
    const id = r.result.leads[0].id as string;
    w = run(r.world, F, { type: 'sales.advance', dealId: id, action: 'contact' }).world;
    const out = tryRun(w, F, { type: 'sales.talk', dealId: id, action: 'start' });
    expect(!out.ok && out.error.code).toBe('command.unknown');
    const v = salesWithTalk(w, companyOf(w, F));
    expect(v.talks).toBe(false);
    expect(v.deals.every((d) => d.talk === null)).toBe(true);
    for (const a of ['discover', 'demo', 'propose', 'close'])
      w = run(w, F, { type: 'sales.advance', dealId: id, action: a } as never).world;
    expect(['won', 'lost']).toContain(deal(w, id).stage);
    expect(deal(w, id).talk).toBeUndefined();
  });
});

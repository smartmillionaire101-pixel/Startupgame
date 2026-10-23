/**
 * The jobs rework (work.ts): professional employers in every city, background
 * head starts, apply → interview → hired or turned down with a reason,
 * cooldowns, expiry, experience, promotion, payroll and tax, founders taking
 * a job, hours by level, and the release switch (old worlds play as before).
 */
import { describe, expect, it } from 'vitest';
import { BACKGROUNDS } from '../src/data/characters.js';
import { CITY_DISTRICTS } from '../src/data/businesses.js';
import { MARKET_IDS, type MarketId } from '../src/data/markets.js';
import {
  EMPLOYERS,
  HEAD_STARTS,
  PROFESSIONS,
  professionById,
  type ProfessionId,
} from '../src/data/professions.js';
import { dispatch } from '../src/dispatch.js';
import { businessesOf, isOpen } from '../src/economy.js';
import { JOBS_NOTE, LIFE_BARS_NOTE, RELEASES, jobsOn, lifeBarsOn } from '../src/releases.js';
import { playerView } from '../src/views.js';
import { WORK, jobHours, levelGate, workOf } from '../src/work.js';
import type { Player, World } from '../src/types.js';
import { T0, addFounder, makeWorld, run, settle, tryRun } from './helpers.js';

const F = 'u_founder';
const announce = (w: World, id: string = JOBS_NOTE) =>
  run(w, null, { type: 'system.announce', id, text: 'Jobs.' }).world;

/** A founder with a company, of this background, in a jobs world. */
function founderWith(backgroundId: string, w = announce(makeWorld(42, ['lagos'])), id = F) {
  return run(w, id, {
    type: 'player.create',
    handle: `h_${id}`.slice(0, 20),
    name: 'Ada Worker',
    role: 'founder',
    backgroundId,
    market: 'lagos',
    company: {
      name: `Co ${id.slice(-4)}`,
      industry: 'fintech',
      revenueModel: 'subscription',
      idea: 'Payments for market traders',
      incorporation: 'local',
    },
  }).world;
}

const me = (w: World, id = F): Player => w.players[id]!;
const employer = (w: World, prof: ProfessionId, market: MarketId = 'lagos') =>
  Object.values(businessesOf(w.markets[market]!)).find(
    (b) => b.landmark === `employer-${prof}` && isOpen(b),
  )!;
/** The best answer to each question (what the employer likes most). */
const best = (prof: ProfessionId) =>
  professionById(prof)!.questions.map((q) =>
    q.options.reduce((bi, o, i, xs) => (o.fit > xs[bi]!.fit ? i : bi), 0),
  );
const worst = (prof: ProfessionId) =>
  professionById(prof)!.questions.map((q) =>
    q.options.reduce((wi, o, i, xs) => (o.fit < xs[wi]!.fit ? i : wi), 0),
  );

function apply(w: World, prof: ProfessionId, level: number, id = F) {
  const b = employer(w, prof);
  const r = run(w, id, { type: 'job.apply', businessId: b.id, level });
  return { w: r.world, app: r.result.application as { id: string }, b };
}
function interview(w: World, appId: string, answers: number[], id = F) {
  const r = run(w, id, { type: 'job.interview', applicationId: appId, answers });
  return { w: r.world, r: r.result as { hired: boolean; reason: string; message: string } };
}

describe('jobs: the release switch', () => {
  it('comes before the investor career note and implies every earlier one', () => {
    expect(RELEASES.indexOf(JOBS_NOTE)).toBe(RELEASES.indexOf(LIFE_BARS_NOTE) + 1);
    const w = { announcements: [JOBS_NOTE] } as unknown as World;
    expect(jobsOn(w)).toBe(true);
    expect(lifeBarsOn(w)).toBe(true);
    expect(jobsOn({ announcements: [LIFE_BARS_NOTE] } as unknown as World)).toBe(false);
  });

  it('old worlds never open employers, refuse job.apply and replay as before', () => {
    let w = addFounder(
      run(makeWorld(42, ['lagos']), null, {
        type: 'system.announce',
        id: LIFE_BARS_NOTE,
        text: 'Life bars.',
      }).world,
    );
    w = settle(w, 'lagos', 2);
    const kinds = Object.values(businessesOf(w.markets.lagos!)).map((b) => b.kind);
    expect(kinds.some((k) => k.startsWith('employer-'))).toBe(false);
    const biz = Object.values(businessesOf(w.markets.lagos!))[0]!;
    const r = tryRun(w, F, { type: 'job.apply', businessId: biz.id, level: 1 });
    expect(r.ok).toBe(false);
    expect(playerView(w, F)!.work).toBeNull();
    expect(me(w).work).toBeUndefined();
    // The same log, replayed, is the same world.
    let w2 = addFounder(
      run(makeWorld(42, ['lagos']), null, {
        type: 'system.announce',
        id: LIFE_BARS_NOTE,
        text: 'Life bars.',
      }).world,
    );
    w2 = settle(w2, 'lagos', 2);
    expect(JSON.stringify(w2)).toBe(JSON.stringify(w));
  });

  it('a part-time job pays exactly as before in a world without the note', () => {
    let w = addFounder(makeWorld(42, ['lagos']));
    const job = playerView(w, F)!.market.jobs.at(-1)!;
    w = run(w, F, { type: 'job.take', businessId: job.businessId, role: job.role }).world;
    const before = w.accounts[me(w).accounts.local]!.balance;
    w = settle(w, 'lagos', 1);
    const wages = w.accounts[me(w).accounts.local]!.balance - before;
    expect(me(w).job?.role).toBe(job.role);
    expect(me(w).work).toBeUndefined();
    expect(wages).not.toBe(0);
  });

  it('the note opens all seven employers in every open city, once', () => {
    let w = announce(makeWorld(42, ['lagos', 'nairobi', 'london']));
    for (const m of ['lagos', 'nairobi', 'london'] as const)
      for (const p of PROFESSIONS) expect(employer(w, p.id, m), `${m}/${p.id}`).toBeDefined();
    const n = Object.keys(w.markets.lagos!.businesses!).length;
    w = settle(w, 'lagos', 3);
    const employers = Object.values(businessesOf(w.markets.lagos!)).filter((b) =>
      b.landmark?.startsWith('employer-'),
    );
    expect(employers).toHaveLength(7);
    expect(Object.keys(w.markets.lagos!.businesses!).length).toBeGreaterThanOrEqual(n);
  });
});

describe('jobs: data', () => {
  it('every city has all seven professions, in its own districts', () => {
    for (const m of MARKET_IDS) {
      const seeds = EMPLOYERS[m];
      expect(seeds.map((s) => s.profession).sort(), m).toEqual(PROFESSIONS.map((p) => p.id).sort());
      for (const s of seeds) expect(CITY_DISTRICTS[m], `${m}/${s.name}`).toContain(s.district);
    }
  });

  it('pays the approved ladders', () => {
    const pay = (id: ProfessionId) => professionById(id)!.levels.map((l) => l.payCol);
    expect(pay('bank')).toEqual([1.6, 2.6, 4.0, 6.0]);
    expect(pay('investment')).toEqual([1.8, 3.0, 4.5, 7.0]);
    expect(pay('tech')).toEqual([1.5, 2.4, 3.5, 5.0]);
    expect(pay('engineering')).toEqual([1.4, 2.2, 3.2, 4.5]);
    expect(pay('consultancy')).toEqual([1.5, 2.5, 3.8, 6.0]);
    expect(pay('law')).toEqual([1.2, 2.4, 3.6, 6.0]);
    expect(pay('hospital')).toEqual([1.6, 3.0, 4.5]);
  });

  it('every background has a head start', () => {
    for (const b of BACKGROUNDS) expect(HEAD_STARTS[b.id], b.id).toBeDefined();
  });
});

describe('jobs: eligibility by background', () => {
  /** The highest level each background can be hired at on paper, per profession. */
  const top = (backgroundId: string, prof: ProfessionId) => {
    const w = founderWith(backgroundId);
    const p = me(w);
    const pr = professionById(prof)!;
    let lvl = 0;
    for (const l of pr.levels) if (!levelGate(p, pr, l.level)) lvl = l.level;
    return lvl;
  };
  /** Founders only (player.create here makes founders); skills come from the background. */
  it.each([
    ['f-banker', 'bank', 2],
    ['f-engineer', 'tech', 2],
    ['f-consultant', 'consultancy', 2],
    ['f-corporate', 'engineering', 2],
    ['f-corporate', 'consultancy', 2],
    ['f-second-time', 'consultancy', 2],
    ['f-second-time', 'tech', 2],
    ['f-dropout', 'tech', 1],
    // Entry roles have no bar: anyone can interview for them.
    ['f-dropout', 'bank', 1],
    ['f-engineer', 'law', 1],
  ] as const)('%s → %s level %i', (bg, prof, lvl) => {
    expect(top(bg, prof)).toBe(lvl);
  });

  it('investors and bankers: head starts by background', () => {
    // Check against the background's own skills, without creating each role.
    const at = (backgroundId: string, prof: ProfessionId) => {
      const bg = BACKGROUNDS.find((b) => b.id === backgroundId)!;
      const base = me(founderWith('f-dropout'));
      const p = {
        ...base,
        backgroundId,
        skills: {
          ...base.skills,
          ...Object.fromEntries(Object.keys(base.skills).map((k) => [k, 20])),
          ...bg.skills,
        },
        work: undefined,
      } as Player;
      const pr = professionById(prof)!;
      let lvl = 0;
      for (const l of pr.levels) if (!levelGate(p, pr, l.level)) lvl = l.level;
      return lvl;
    };
    expect(at('i-banker', 'investment')).toBe(3);
    expect(at('i-operator', 'tech')).toBe(2);
    expect(at('i-consultant', 'consultancy')).toBe(2);
    expect(at('i-first', 'investment')).toBe(1);
    expect(at('b-commercial', 'bank')).toBe(2);
    expect(at('b-ib', 'bank')).toBe(2);
    expect(at('b-fintech', 'tech')).toBe(2);
    expect(at('b-regulator', 'law')).toBe(2);
    expect(at('b-regulator', 'bank')).toBe(2);
    expect(at('b-microfinance', 'bank')).toBe(1);
    expect(at('b-wealthy', 'investment')).toBe(2);
  });

  it('experience is seeded lazily from the background', () => {
    const w = founderWith('f-banker');
    expect(me(w).work).toBeUndefined();
    expect(workOf(me(w)).exp.finance).toBe(30);
    const view = playerView(w, F)!.work!;
    expect(view.exp.finance).toBe(30);
    const bank = view.employers.find((e) => e.profession === 'bank')!;
    expect(bank.levels.map((l) => l.status)).toEqual(['eligible', 'eligible', 'months', 'months']);
    expect(bank.levels[2]!.reason).toBe('Needs 48 months in finance — you have 30.');
  });
});

describe('jobs: apply, interview, decision', () => {
  it('a dropout applies to a bank Associate and is turned down for the months', () => {
    let w = founderWith('f-dropout');
    const used = me(w).hours.used;
    const a = apply(w, 'bank', 2);
    w = a.w;
    expect(me(w).hours.used).toBe(used + WORK.applyHours);
    const i = interview(w, a.app.id, best('bank'));
    w = i.w;
    expect(i.r.hired).toBe(false);
    expect(i.r.reason).toBe('Needs 24 months in finance — you have 0.');
    expect(me(w).hours.used).toBe(used + WORK.applyHours + WORK.interviewHours);
    expect(me(w).job).toBeUndefined();
    const app = me(w).work!.applications[0]!;
    expect(app.status).toBe('rejected');
    expect(app.why).toEqual({ code: 'months', field: 'finance', need: 24, have: 0 });
  });

  it('entry roles have no bar: the interview decides, and a bad one names the weakest answer', () => {
    // No finance background (finance and risk 20): weak answers are turned down.
    let w = founderWith('f-engineer');
    const view = playerView(w, F)!.work!;
    expect(view.employers.find((e) => e.profession === 'bank')!.levels[0]!.status).toBe('eligible');
    const a = apply(w, 'bank', 1);
    const i = interview(a.w, a.app.id, worst('bank'));
    w = i.w;
    expect(i.r.hired).toBe(false);
    expect(me(w).work!.applications[0]!.why).toMatchObject({ code: 'interview', need: 48 });
    expect(i.r.reason).toMatch(
      /^The interview didn’t convince them: \d+%, they hire from 48%\. Weakest answer: “.+”$/,
    );
  });

  it('entry odds without a matching background: good answers usually, middling a coin flip, bad never', () => {
    const rates = { best: 0, mid: 0, worst: 0 };
    const N = 30;
    const mid = (prof: ProfessionId) =>
      professionById(prof)!.questions.map((q) => {
        const order = [...q.options.keys()].sort((x, y) => q.options[y]!.fit - q.options[x]!.fit);
        return order[1]!;
      });
    for (let seed = 1; seed <= N; seed++) {
      const base = founderWith('f-engineer', announce(makeWorld(seed, ['lagos'])));
      for (const [k, ans] of [
        ['best', best('bank')],
        ['mid', mid('bank')],
        ['worst', worst('bank')],
      ] as const) {
        const a = apply(base, 'bank', 1);
        if (interview(a.w, a.app.id, [...ans]).r.hired) rates[k] += 1 / N;
      }
    }
    expect(rates.best).toBeGreaterThanOrEqual(0.55);
    expect(rates.best).toBeLessThanOrEqual(0.85);
    expect(rates.mid).toBeGreaterThanOrEqual(0.3);
    expect(rates.mid).toBeLessThanOrEqual(0.7);
    expect(rates.worst).toBe(0);
  });

  it('months are checked: a level-2 role needs 24 months in the field', () => {
    let w = founderWith('f-dropout');
    const a = apply(w, 'tech', 2);
    w = interview(a.w, a.app.id, best('tech')).w;
    expect(me(w).work!.applications[0]!.reason).toBe('Needs 24 months in tech — you have 0.');
  });

  it('an ex-banker is hired as Associate after a good interview, and paid from payroll at month end', () => {
    let w = founderWith('f-banker');
    const a = apply(w, 'bank', 2);
    const i = interview(a.w, a.app.id, best('bank'));
    w = i.w;
    expect(i.r.hired).toBe(true);
    expect(i.r.reason).toMatch(/^(Strong|Good) interview — offer: Associate\.$/);
    expect(me(w).job).toMatchObject({ profession: 'bank', level: 2, role: 'bank-associate' });
    expect(playerView(w, F)!.me.job).toMatchObject({ label: 'Associate', hours: 40 });

    const m = w.markets.lagos!;
    const view = playerView(w, F)!.work!;
    const gross = view.job!.monthlyPay;
    const tax = Math.round(gross * m.data.tax.personalIncome);
    w = settle(w, 'lagos', 1);
    const lines = w.accounts[me(w).accounts.local]!.recent;
    const salary = lines.filter((l) => l.memo === `Salary: Associate at ${a.b.name}`);
    expect(salary).toHaveLength(1);
    expect(salary[0]!.amount).toBe(gross);
    expect(salary[0]!.peer).toBe(m.ext.payroll);
    const taxed = lines.filter((l) => l.memo === `Income tax: ${a.b.name}`);
    expect(taxed[0]!.amount).toBe(-tax);
    expect(taxed[0]!.peer).toBe(m.ext.tax);
    // Take-home: the approved 2.6 cost-of-living units, near enough.
    expect((gross - tax) / (m.data.costOfLiving * 100)).toBeCloseTo(2.6, 1);
    // A month of finance experience, a point of finance.
    expect(me(w).work!.exp.finance).toBe(31);
    expect(me(w).job!.months).toBe(1);
    expect(me(w).skills.finance).toBe(61);
  });

  it('weak answers can sink a qualified candidate, with the weakest question named', () => {
    let w = founderWith('f-banker');
    const a = apply(w, 'bank', 2);
    const i = interview(a.w, a.app.id, worst('bank'));
    w = i.w;
    expect(i.r.hired).toBe(false);
    expect(i.r.reason).toMatch(
      /^The interview didn’t convince them: \d+%, they hire from 48%\. Weakest answer: “/,
    );
  });

  it('decisions are deterministic: the same log decides the same way', () => {
    const go = () => {
      let w = founderWith('f-dropout');
      const a = apply(w, 'tech', 1);
      w = interview(a.w, a.app.id, [1, 0, 2]).w;
      return me(w).work!.applications[0]!;
    };
    const x = go();
    const y = go();
    expect(x).toEqual(y);
    expect(typeof x.score).toBe('number');
  });

  it('a turn-down means a month before applying there again', () => {
    let w = founderWith('f-engineer');
    const a = apply(w, 'bank', 1);
    w = interview(a.w, a.app.id, worst('bank')).w;
    expect(me(w).work!.applications[0]!.status).toBe('rejected');
    const again = tryRun(w, F, { type: 'job.apply', businessId: a.b.id, level: 1 });
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error.code).toBe('job.cooldown');
    // Other employers are fine.
    expect(
      tryRun(w, F, { type: 'job.apply', businessId: employer(w, 'tech').id, level: 1 }).ok,
    ).toBe(true);
    w = settle(w, 'lagos', 1);
    expect(tryRun(w, F, { type: 'job.apply', businessId: a.b.id, level: 1 }).ok).toBe(true);
  });

  it('an interview nobody goes to expires after next month', () => {
    let w = founderWith('f-engineer');
    const a = apply(w, 'tech', 2);
    w = settle(a.w, 'lagos', 1);
    expect(me(w).work!.applications[0]!.status).toBe('booked');
    w = settle(w, 'lagos', 1);
    expect(me(w).work!.applications[0]!.status).toBe('expired');
    expect(me(w).work!.applications[0]!.reason).toBe('You missed the interview.');
    const late = tryRun(w, F, {
      type: 'job.interview',
      applicationId: a.app.id,
      answers: best('tech'),
    });
    expect(late.ok).toBe(false);
  });

  it('one booking per employer, and only from your home city', () => {
    let w = founderWith('f-engineer');
    const a = apply(w, 'tech', 2);
    w = a.w;
    expect(tryRun(w, F, { type: 'job.apply', businessId: a.b.id, level: 1 }).ok).toBe(false);
    const away = structuredClone(w);
    away.players[F]!.location = { market: 'nairobi', since: T0 };
    expect(
      tryRun(away, F, { type: 'job.interview', applicationId: a.app.id, answers: best('tech') }).ok,
    ).toBe(false);
  });
});

describe('jobs: founders, hours, promotion', () => {
  it('a founder with a company takes a full-time tech job; the company carries on', () => {
    let w = founderWith('f-engineer');
    expect(me(w).companyIds.length).toBe(1);
    const a = apply(w, 'tech', 2);
    const i = interview(a.w, a.app.id, best('tech'));
    w = i.w;
    expect(i.r.hired).toBe(true);
    expect(me(w).job).toMatchObject({ profession: 'tech', level: 2 });
    w = settle(w, 'lagos', 1);
    expect(w.companies[me(w).companyIds[0]!]!.status).toBe('active');
    // The job takes its hours at the start of the month.
    expect(me(w).hours.used).toBe(Math.min(me(w).hours.available, 40));
  });

  it('hours by level: 40, 40, 50, 60', () => {
    const p = {
      job: { businessId: 'x', role: 'r', since: 0, profession: 'bank', level: 1 },
    } as Player;
    const hours = [1, 2, 3, 4].map((level) =>
      jobHours({ ...p, job: { ...p.job!, level } } as Player),
    );
    expect(hours).toEqual([40, 40, 50, 60]);
    expect(jobHours({ job: { businessId: 'x', role: 'waiter', since: 0 } } as Player)).toBe(40);
  });

  it('a promotion needs six months in the role, then another interview', () => {
    let w = founderWith('f-banker');
    // Months of finance for VP (48): start at 30, work 18 months as Associate.
    const a = apply(w, 'bank', 2);
    w = interview(a.w, a.app.id, best('bank')).w;
    expect(me(w).job!.level).toBe(2);
    // Too early: asked after 2 months.
    w = settle(w, 'lagos', 2);
    let p = apply(w, 'bank', 3);
    let i = interview(p.w, p.app.id, best('bank'));
    expect(i.r.hired).toBe(false);
    expect(i.r.reason).toBe('Needs 48 months in finance — you have 32.');
    // Keep working until 48 months of finance (and the cooldown is over).
    w = settle(i.w, 'lagos', 16);
    expect(me(w).work!.exp.finance).toBe(48);
    expect(me(w).job!.months).toBe(18);
    const view = playerView(w, F)!.work!;
    expect(view.job!.next).toMatchObject({ level: 3, label: 'Vice President', reason: null });
    p = apply(w, 'bank', 3);
    i = interview(p.w, p.app.id, best('bank'));
    w = i.w;
    expect(i.r.hired).toBe(true);
    expect(me(w).job).toMatchObject({ level: 3, role: 'bank-vp', months: 0 });
    expect(jobHours(me(w))).toBe(50);
    expect(i.r.message).toMatch(/You’re promoted/);
  });

  it('a dropout learns half as fast again', () => {
    let w = founderWith('f-dropout');
    const a = apply(w, 'tech', 1);
    // Find answers that get the dropout hired (the jitter is seeded, the best answers clear it).
    const i = interview(a.w, a.app.id, best('tech'));
    expect(i.r.hired).toBe(true);
    w = settle(i.w, 'lagos', 2);
    expect(me(w).work!.exp.tech).toBe(3);
  });

  it('a part-time job counts as service experience in a jobs world', () => {
    let w = founderWith('f-engineer');
    const job = playerView(w, F)!.market.jobs.at(-1)!;
    w = run(w, F, { type: 'job.take', businessId: job.businessId, role: job.role }).world;
    w = settle(w, 'lagos', 2);
    expect(me(w).work!.exp.service).toBe(2);
  });

  it('a new hire replaces the old job (one job at a time)', () => {
    let w = founderWith('f-engineer');
    const job = playerView(w, F)!.market.jobs.at(-1)!;
    w = run(w, F, { type: 'job.take', businessId: job.businessId, role: job.role }).world;
    const a = apply(w, 'tech', 2);
    const i = interview(a.w, a.app.id, best('tech'));
    expect(i.r.hired).toBe(true);
    expect(me(i.w).job!.businessId).toBe(a.b.id);
    expect(i.r.message).toMatch(/You left /);
  });

  it('dispatch rejects malformed answers', () => {
    let w = founderWith('f-engineer');
    const a = apply(w, 'tech', 2);
    w = a.w;
    const bad = dispatch(
      w,
      { type: 'job.interview', applicationId: a.app.id, answers: [0, 0] },
      {
        actorId: F,
        now: T0,
      },
    );
    expect(bad.ok).toBe(false);
  });
});

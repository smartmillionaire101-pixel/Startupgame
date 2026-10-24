/**
 * Bankers (BANKERS_NOTE, bankers.ts): negotiating with shareholders before
 * signing (offers that differ, levers, counter-offers, control and policy
 * rights), the licence process (interview at the Central Bank, a coherent
 * business plan, key hires, systems and a branch, approval in principle and
 * pre-opening clients, the decision with conditions or reasons), the
 * banker's first session and journey, and old worlds playing as before.
 */
import { describe, expect, it } from 'vitest';
import {
  BANKERS,
  BANK_INTERVIEW,
  bankOffers,
  bankPlanChecks,
  capTablePreview,
  hasPolicyRights,
  suggestedPlan,
} from '../src/bankers.js';
import { bankFigures } from '../src/banks.js';
import { journeyView } from '../src/journey.js';
import { MONTH_MIN, gameMinute } from '../src/places.js';
import { BANKERS_NOTE, MORE_GAMES_NOTE, RELEASES, bankersOn } from '../src/releases.js';
import { playerView } from '../src/views.js';
import type { Bank, World } from '../src/types.js';
import { DAY, T0, makeWorld, moneyByCurrency, run, settle, tryRun } from './helpers.js';

const B = 'u_banker';
const announce = (w: World, id: string = BANKERS_NOTE) =>
  run(w, null, { type: 'system.announce', id, text: 'Bankers.' }).world;
const MS_PER_MIN = DAY / MONTH_MIN;

function newBanker(w: World, id = B, backgroundId = 'b-commercial'): World {
  return run(w, id, {
    type: 'player.quickStart',
    username: `h_${id}`.slice(0, 20),
    name: 'Bea Banker',
    role: 'banker',
    backgroundId,
    market: 'lagos',
  }).world;
}

const bankOf = (w: World, owner = B): Bank =>
  Object.values(w.banks).find((b) => b.ownerId === owner)!;

/** A banker's world with a microfinance bank formed (not signed). */
function formed(seed = 11, type: 'microfinance' | 'commercial' = 'microfinance') {
  let w = newBanker(announce(makeWorld(seed, ['lagos'])));
  const balance = w.accounts[w.players[B]!.accounts.local]!.balance;
  w = run(w, B, {
    type: 'bank.found',
    name: 'Harbour Trust',
    bankType: type,
    contribution: Math.floor(balance * 0.25),
  }).world;
  return w;
}

/** Sign with the capital group (enough capital, little control). */
function signed(seed = 11) {
  let w = formed(seed);
  const b = bankOf(w);
  w = run(w, B, { type: 'bank.terms', bankId: b.id, chosen: ['g1', 'g2'] }).world;
  w = run(w, B, { type: 'bank.sign', bankId: b.id }).world;
  return w;
}

/** The real time a game minute falls at (no settlement since T0). */
const at = (w: World, min: number) => T0 + (min - gameMinute(w.markets.lagos!, T0)) * MS_PER_MIN;

/** Book the Central Bank and answer the interview at the slot (best answers by default). */
function interview(w: World, answers = [1, 0, 2, 1]) {
  const bank = bankOf(w);
  const booked = run(w, B, { type: 'place.book', placeId: 'lagos:central-bank' });
  const slot = booked.result.appointment.at as number;
  const r = run(
    booked.world,
    B,
    { type: 'bank.interview', bankId: bank.id, answers },
    at(w, slot + 10),
  );
  return { world: r.world, result: r.result, slot };
}

/** Plan, people, system and branch: the rest of the checklist. */
function checklist(w: World, quality: 'best' | 'worst' = 'best') {
  const b = bankOf(w);
  const v = playerView(w, B)!.banker!.bank!.licence!;
  w = run(w, B, { type: 'bank.plan', bankId: b.id, ...v.suggestedPlan }).world;
  for (const role of ['ceo', 'cro', 'compliance', 'aml'] as const) {
    const list = v.candidates[role].filter((c) => c.id !== 'self');
    const pick = [...list].sort((a, c) =>
      quality === 'best' ? c.quality - a.quality : a.quality - c.quality,
    )[0]!;
    w = run(w, B, { type: 'bank.hire', bankId: b.id, role, candidateId: pick.id }).world;
  }
  w = run(w, B, {
    type: 'bank.setup',
    bankId: b.id,
    system: quality === 'best' ? 'premium' : 'basic',
    district: v.districts[0]!.id,
  }).world;
  return w;
}

describe('bankers: negotiate with shareholders before you sign', () => {
  it('forms a bank with three offers that differ: capital, control, a board seat and help', () => {
    const w = formed();
    const b = bankOf(w);
    expect(b.status).toBe('forming');
    expect(w.accounts[b.account]!.balance).toBe(0);
    const offers = bankOffers(w, b);
    expect(offers.map((o) => o.style)).toEqual(['capital', 'control', 'strategic']);
    const [cap, ctl, strat] = offers;
    expect(cap!.capital).toBeGreaterThan(ctl!.capital);
    expect(cap!.priceBps).toBeLessThan(ctl!.priceBps);
    expect(ctl!.voting).toBe(false);
    expect(ctl!.boardSeats).toBe(0);
    expect(strat!.boardSeats).toBe(2);
    expect(strat!.strategic).toBe(true);
    // Nothing chosen: short of the regulator's minimum.
    const pv = capTablePreview(w, b);
    expect(pv.short).toBeGreaterThan(0);
    expect(tryRun(w, B, { type: 'bank.sign', bankId: b.id }).ok).toBe(false);
  });

  it('ownership and control move with the levers: own capital, non-voting money, voting shares', () => {
    let w = formed();
    const b = bankOf(w);
    w = run(w, B, { type: 'bank.terms', bankId: b.id, chosen: ['g1'] }).world;
    const capOnly = capTablePreview(w, bankOf(w));
    w = run(w, B, { type: 'bank.terms', bankId: b.id, chosen: ['g2', 'g3'] }).world;
    const mixed = capTablePreview(w, bankOf(w));
    w = run(w, B, { type: 'bank.terms', bankId: b.id, dualClass: true }).world;
    const dual = capTablePreview(w, bankOf(w));
    expect(capOnly.controlBps).toBeLessThan(5000);
    expect(capOnly.policyRights).toBe(false);
    // Non-voting family-office money leaves you more of the vote than the capital group's.
    expect(mixed.controlBps).toBeGreaterThan(capOnly.controlBps);
    // Voting shares (3 votes each): control rises, ownership doesn't.
    expect(dual.controlBps).toBeGreaterThan(mixed.controlBps);
    expect(dual.ownershipBps).toBeLessThanOrEqual(mixed.ownershipBps);
    // More of your own money: more ownership.
    const more = run(w, B, {
      type: 'bank.terms',
      bankId: b.id,
      contribution: bankOf(w).charter!.contribution + 1_000_000,
    }).world;
    expect(capTablePreview(more, bankOf(more)).ownershipBps).toBeGreaterThan(dual.ownershipBps);
  });

  it('answers one counter-offer per group, deterministically by credibility', () => {
    let w = formed();
    const b = bankOf(w);
    const r1 = run(w, B, { type: 'bank.counter', bankId: b.id, groupId: 'g3', ask: 'price' });
    const r2 = run(formed(), B, {
      type: 'bank.counter',
      bankId: b.id,
      groupId: 'g3',
      ask: 'price',
    });
    expect(r1.result.accepted).toBe(r2.result.accepted);
    w = r1.world;
    const again = tryRun(w, B, { type: 'bank.counter', bankId: b.id, groupId: 'g3', ask: 'seat' });
    expect(!again.ok && again.error.code).toBe('bank.counter');
    const before = bankOffers(formed(), b)[2]!;
    const after = bankOffers(w, bankOf(w))[2]!;
    if (r1.result.accepted) expect(after.priceBps).toBeGreaterThan(before.priceBps);
    else expect(after.priceBps).toBe(before.priceBps);
    // A hard ask (voting shares from the capital group) needs more standing.
    const hard = run(w, B, { type: 'bank.counter', bankId: b.id, groupId: 'g1', ask: 'voting' });
    expect(hard.result.need).toBeGreaterThan(r1.result.need);
    expect(hard.result.accepted).toBe(hard.result.score >= hard.result.need);
  });

  it('signs: money moves through the ledger, shareholders, ownership and control are stored', () => {
    let w = formed();
    const total = moneyByCurrency(w);
    const b0 = bankOf(w);
    const mine = b0.charter!.contribution;
    const purse = w.accounts[w.players[B]!.accounts.local]!.balance;
    w = run(w, B, { type: 'bank.terms', bankId: b0.id, chosen: ['g1', 'g2'] }).world;
    w = run(w, B, { type: 'bank.sign', bankId: b0.id }).world;
    const b = bankOf(w);
    expect(b.status).toBe('applying');
    expect(b.charter).toBeUndefined();
    expect(b.shareholders!.map((s) => s.kind)).toEqual(['founder', 'ai', 'ai']);
    expect(w.accounts[w.players[B]!.accounts.local]!.balance).toBe(purse - mine);
    expect(bankFigures(w, b).equity).toBeGreaterThanOrEqual(
      capTablePreview(formed(), b0).minCapital,
    );
    expect(b.ownerShareBps).toBeGreaterThan(0);
    expect(b.ownerShareBps).toBeLessThan(10_000);
    expect(b.controlBps).toBeGreaterThan(b.ownerShareBps);
    expect(b.licence).toMatchObject({ attempt: 1, clients: [] });
    expect(moneyByCurrency(w)).toEqual(total);
  });

  it('control keeps policy rights; without it, the AI board vetoes risky policy', () => {
    // Capital group only: no control, no board majority.
    let w = formed();
    let b = bankOf(w);
    w = run(w, B, { type: 'bank.terms', bankId: b.id, chosen: ['g1'] }).world;
    const pv = capTablePreview(w, bankOf(w));
    if (pv.short > 0)
      w = run(w, B, { type: 'bank.terms', bankId: b.id, chosen: ['g1', 'g3'] }).world;
    w = run(w, B, { type: 'bank.sign', bankId: b.id }).world;
    b = bankOf(w);
    expect(hasPolicyRights(b)).toBe(false);
    const veto = tryRun(w, B, { type: 'bank.policy', bankId: b.id, loanSpreadPp: 1 });
    expect(!veto.ok && veto.error.code).toBe('bank.board');
    expect(tryRun(w, B, { type: 'bank.policy', bankId: b.id, loanSpreadPp: 7 }).ok).toBe(true);

    // Voting shares and non-voting money: control, and the founder sets policy.
    let v = formed(12);
    const c = bankOf(v);
    v = run(v, B, {
      type: 'bank.terms',
      bankId: c.id,
      chosen: ['g2', 'g3'],
      dualClass: true,
    }).world;
    v = run(v, B, { type: 'bank.sign', bankId: c.id }).world;
    expect(bankOf(v).controlBps).toBeGreaterThan(5000);
    expect(hasPolicyRights(bankOf(v))).toBe(true);
    expect(tryRun(v, B, { type: 'bank.policy', bankId: c.id, loanSpreadPp: 1 }).ok).toBe(true);
  });

  it('performance shares vest on the licence and grow your stake', () => {
    let w = formed();
    const b = bankOf(w);
    w = run(w, B, {
      type: 'bank.terms',
      bankId: b.id,
      chosen: ['g1', 'g2'],
      performanceBps: 900,
    }).world;
    w = run(w, B, { type: 'bank.sign', bankId: b.id }).world;
    expect(bankOf(w).vesting!.map((g) => g.milestone)).toEqual(['licence', 'profit', 'size']);
    const before = bankOf(w).ownerShareBps;
    w = interview(w).world;
    w = checklist(w);
    w = settle(w, 'lagos', 2);
    const after = bankOf(w);
    expect(after.status).toBe('licensed');
    expect(after.vesting![0]!.vestedMonth).toBeDefined();
    expect(after.ownerShareBps).toBeGreaterThan(before);
  });

  it('co-founders: a player co-invests, and their capital joins yours', () => {
    let w = formed();
    w = newBanker(w, 'u_friend', 'b-ib');
    const b = bankOf(w);
    w = run(w, B, {
      type: 'bank.invite',
      bankId: b.id,
      playerId: 'u_friend',
      amount: 1_000_000,
    }).world;
    expect(playerView(w, 'u_friend')!.banker!.invitations).toHaveLength(1);
    w = run(w, 'u_friend', { type: 'bank.join', bankId: b.id, accept: true }).world;
    expect(w.accounts[b.account]!.balance).toBe(1_000_000);
    const pv = capTablePreview(w, bankOf(w));
    expect(pv.shareholders.map((s) => s.kind)).toEqual(['founder', 'cofounder']);
    expect(pv.board.founderSide).toBe(2);
  });
});

describe('bankers: the licence process is the work', () => {
  it('the interview happens at the Central Bank by appointment and is scored', () => {
    let w = signed();
    const b = bankOf(w);
    const early = tryRun(w, B, { type: 'bank.interview', bankId: b.id, answers: [1, 0, 2, 1] });
    expect(!early.ok && early.error.code).toBe('bank.appointment');
    const good = interview(w);
    expect(good.result.passed).toBe(true);
    expect(good.result.score).toBeGreaterThanOrEqual(BANKERS.interviewPass);
    const bad = interview(signed(), [0, 2, 0, 2]);
    expect(bad.result.passed).toBe(false);
    expect(bad.result.weakest).toBeTruthy();
    // The same appointment can't be used twice.
    w = bad.world;
    const again = tryRun(
      w,
      B,
      { type: 'bank.interview', bankId: b.id, answers: [1, 0, 2, 1] },
      at(w, bad.slot + 20),
    );
    expect(!again.ok && again.error.code).toBe('bank.interview');
    expect(BANK_INTERVIEW).toHaveLength(4);
  });

  it('plan checks: coherent plans pass, incoherent ones show what is wrong', () => {
    const base = { type: 'microfinance' as const, capital: 10_000_000, col: 100_000, staffCost: 0 };
    const good = suggestedPlan('microfinance', base.capital, base.col);
    expect(bankPlanChecks({ ...base, plan: good }).every((c) => c.level !== 'bad')).toBe(true);
    const wild = bankPlanChecks({
      ...base,
      plan: {
        ...good,
        products: ['advisory', 'mortgages'],
        lending: [90_000_000, 50_000_000, 200_000_000],
      },
    });
    const level = (id: string) => wild.find((c) => c.id === id)!.level;
    expect(level('fit')).toBe('bad');
    expect(level('capital')).toBe('bad');
    expect(level('growth')).toBe('bad');
    let w = signed();
    const b = bankOf(w);
    const refused = tryRun(w, B, {
      type: 'bank.plan',
      bankId: b.id,
      segments: ['households'],
      products: ['advisory', 'mortgages'],
      branches: 2,
      lending: [1, 0, 0],
    });
    expect(!refused.ok && refused.error.code).toBe('bank.plan');
    w = run(w, B, {
      type: 'bank.plan',
      bankId: b.id,
      ...playerView(w, B)!.banker!.bank!.licence!.suggestedPlan,
    }).world;
    expect(bankOf(w).licence!.plan).toBeDefined();
  });

  it('interview and plan give approval in principle, which opens pre-opening clients', () => {
    let w = signed();
    const b = bankOf(w);
    const prospects = playerView(w, B)!.banker!.bank!.licence!.prospects;
    expect(prospects.length).toBeGreaterThan(0);
    const early = tryRun(w, B, { type: 'bank.client', bankId: b.id, companyId: prospects[0]!.id });
    expect(!early.ok && early.error.code).toBe('bank.aip');
    w = interview(w).world;
    w = run(w, B, {
      type: 'bank.plan',
      bankId: b.id,
      ...playerView(w, B)!.banker!.bank!.licence!.suggestedPlan,
    }).world;
    expect(bankOf(w).licence!.aip).toBeDefined();
    w = run(w, B, { type: 'bank.client', bankId: b.id, companyId: prospects[0]!.id }).world;
    w = run(w, B, { type: 'bank.client', bankId: b.id, companyId: prospects[1]!.id }).world;
    expect(bankOf(w).licence!.clients).toHaveLength(2);
    // Deterministic prospects.
    expect(playerView(signed(), B)!.banker!.bank!.licence!.prospects.map((x) => x.id)).toEqual(
      prospects.map((x) => x.id),
    );
  });

  it('the tracker counts the review days and waits for the checklist', () => {
    let w = signed();
    const lic = playerView(w, B)!.banker!.bank!.licence!;
    expect(lic.day).toBe(1);
    expect(lic.reviewDays).toBe(60);
    expect(lic.missing).toEqual([
      'interview',
      'plan',
      'hire.ceo',
      'hire.cro',
      'hire.compliance',
      'hire.aml',
      'system',
      'branch',
    ]);
    // Review time passes but the checklist isn't done: no decision yet.
    w = settle(w, 'lagos', 2);
    expect(bankOf(w).status).toBe('applying');
    expect(bankOf(w).licence!.decision).toBeUndefined();
  });

  it('a strong application is licensed, and the first clients move in', () => {
    let w = signed();
    const total = moneyByCurrency(w);
    const b = bankOf(w);
    w = interview(w).world;
    w = checklist(w);
    const prospects = playerView(w, B)!.banker!.bank!.licence!.prospects;
    w = run(w, B, { type: 'bank.client', bankId: b.id, companyId: prospects[0]!.id }).world;
    w = settle(w, 'lagos', 1);
    expect(bankOf(w).status).toBe('applying');
    w = settle(w, 'lagos', 1, T0 + DAY);
    const done = bankOf(w);
    expect(done.status).toBe('licensed');
    expect(done.licence!.decision!.outcome).toBe('approved');
    expect(w.players[B]!.milestones['banker.licence']).toBeDefined();
    const c = w.companies[prospects[0]!.id]!;
    expect(w.accounts[c.account]!.bankId).toBe(done.id);
    expect(moneyByCurrency(w)).toEqual(total);
  });

  it('a weak application is approved with conditions or refused with reasons, and can try again', () => {
    let w = signed();
    // A barely-passing interview, weak people and a basic system.
    const iv = interview(w, [2, 0, 1, 0]);
    expect(iv.result.passed).toBe(true);
    w = iv.world;
    w = checklist(w, 'worst');
    w = settle(w, 'lagos', 2);
    const after = bankOf(w);
    const d = after.licence!.decision!;
    expect(['conditions', 'refused']).toContain(d.outcome);
    expect(d.reasons.length).toBeGreaterThan(0);
    if (d.outcome === 'conditions') {
      expect(after.status).toBe('licensed');
      expect(after.conditions!.lendingCap).toBeGreaterThan(0);
    } else {
      expect(after.status).toBe('applying');
      expect(after.licence!.attempt).toBe(2);
      expect(playerView(w, B)!.banker!.bank!.licence!.missing.length).toBeGreaterThan(0);
    }
  });

  it('a short-of-capital application is refused with the reason and what to fix', () => {
    let w = signed();
    const b = bankOf(w);
    w = interview(w).world;
    w = checklist(w);
    // Drain the bank below the minimum (systems, branches and staff cost money).
    const t = structuredClone(w);
    const m = t.markets.lagos!;
    const acc = t.accounts[bankOf(t).account]!;
    t.accounts[m.ext.lps]!.balance += acc.balance - 1000;
    acc.balance = 1000;
    w = settle(t, 'lagos', 2);
    const d = bankOf(w).licence!.decision!;
    expect(d.outcome).toBe('refused');
    expect(d.reasons).toContain('capital');
    expect(bankOf(w).status).toBe('applying');
    // Fix: add capital (more shares for you).
    const before = bankOf(w).ownerShareBps;
    w = run(w, B, { type: 'bank.capital', bankId: b.id, amount: 1_000_000 }).world;
    expect(bankOf(w).ownerShareBps).toBeGreaterThan(before);
  });
});

describe('bankers: first session and journey', () => {
  it('walks a new banker from naming the bank to the Central Bank interview', () => {
    let w = newBanker(announce(makeWorld(21, ['lagos'])));
    const step = () => playerView(w, B)!.banker!.tutorial!.step;
    expect(step()).toBe('name');
    const balance = w.accounts[w.players[B]!.accounts.local]!.balance;
    w = run(w, B, {
      type: 'bank.found',
      name: 'Harbour Trust',
      bankType: 'microfinance',
      contribution: Math.floor(balance * 0.25),
    }).world;
    expect(step()).toBe('negotiate');
    const b = bankOf(w);
    w = run(w, B, { type: 'bank.terms', bankId: b.id, chosen: ['g1', 'g2'] }).world;
    expect(step()).toBe('sign');
    w = run(w, B, { type: 'bank.sign', bankId: b.id }).world;
    expect(step()).toBe('book');
    w = interview(w).world;
    expect(playerView(w, B)!.banker!.tutorial!.done).toBe(true);
    expect(w.players[B]!.milestones['banker.first-session']).toBeDefined();
  });

  it('a banker follows the banker journey, by role', () => {
    let w = signed();
    const j = journeyView(w, w.players[B]!)!;
    expect(j.kind).toBe('banker');
    expect(j.chapters.map((c) => c.id)).toEqual(['licence', 'open', 'loans', 'trusted', 'group']);
    expect(j.current).toBe(1);
    expect(j.main[0]!.id).toBe('licence.interview');
    w = interview(w).world;
    w = checklist(w);
    w = settle(w, 'lagos', 2);
    const after = journeyView(w, w.players[B]!)!;
    expect(after.chapters[0]!.status).toBe('done');
    expect(w.players[B]!.milestones['banker.chapter-1']).toBeDefined();
  });

  it('the tutorial can be skipped', () => {
    let w = newBanker(announce(makeWorld(22, ['lagos'])));
    w = run(w, B, { type: 'banker.tutorial', action: 'skip' }).world;
    expect(playerView(w, B)!.banker!.tutorial!.step).toBeNull();
  });
});

describe('bankers: the release switch', () => {
  it('is the newest note', () => {
    expect(RELEASES.at(-1)).toBe(BANKERS_NOTE);
    expect(bankersOn({ announcements: [BANKERS_NOTE] } as unknown as World)).toBe(true);
    expect(bankersOn({ announcements: [MORE_GAMES_NOTE] } as unknown as World)).toBe(false);
  });

  it('an old world founds a bank the old way, and new commands are unknown', () => {
    let w = announce(makeWorld(31, ['lagos']), MORE_GAMES_NOTE);
    w = run(w, B, {
      type: 'player.create',
      handle: 'h_old',
      name: 'Old Banker',
      role: 'banker',
      backgroundId: 'b-wealthy',
      market: 'lagos',
      bank: { name: 'Old Trust', bankType: 'microfinance' },
    }).world;
    const b = bankOf(w);
    expect(b.status).toBe('applying');
    expect(b.shareholders).toBeUndefined();
    expect(b.licence).toBeUndefined();
    expect(w.inbox[B]!.some((i) => /AI shareholders put in/.test(i.text))).toBe(true);
    const r = tryRun(w, B, { type: 'bank.sign', bankId: b.id });
    expect(!r.ok && r.error.code).toBe('command.unknown');
    expect(playerView(w, B)!.banker).toBeNull();
    expect(journeyView(w, w.players[B]!)).toBeNull();
    w = settle(w, 'lagos', 2);
    expect(bankOf(w).status).toBe('licensed');
  });
});

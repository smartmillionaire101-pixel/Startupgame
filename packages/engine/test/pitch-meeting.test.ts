/** Round 7 #13: the investor pitch meeting (gameplay note, pitchmeeting.ts). */
import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import type { Command } from '../src/commands.js';
import { forwardRunway } from '../src/company.js';
import { account } from '../src/ledger.js';
import { MEETING, answerPoints, meetingFacts } from '../src/pitchmeeting.js';
import { payingCustomers } from '../src/traction.js';
import { playerView } from '../src/views.js';
import type { Pitch, PitchMeetingAnswer, Staff, World } from '../src/types.js';
import { companyOf, run, tryRun } from './helpers.js';
import { F, founder, talkWin } from './r7-helpers.js';

const INV = 'u_ahmed';
const co = (w: World) => companyOf(w, F);

/** An AI fund in London that takes this pitch to the table (pre-seed, health, no star bar). */
function withFund(w: World): { w: World; fundId: string } {
  const fund = Object.values(w.funds).find(
    (f) =>
      f.ai &&
      f.market === 'london' &&
      f.stages.includes('pre-seed') &&
      (f.sectors === 'any' || f.sectors.includes('healthtech')),
  )!;
  return {
    w: produce(w, (x) => {
      x.funds[fund.id]!.minStars = 0;
    }),
    fundId: fund.id,
  };
}

function pitch(w: World, fundId: string, slides = ['problem', 'product', 'team'], extra = {}) {
  const ask = w.funds[fundId]!.check[0];
  const r = run(w, F, {
    type: 'pitch.start',
    companyId: co(w).id,
    fundId,
    slides,
    ask,
    ...extra,
  } as Command);
  return { w: r.world, p: r.world.pitches[r.result.pitchId]! };
}

const meet = (w: World, p: Pitch, action: string, extra: Record<string, unknown> = {}) =>
  run(w, F, { type: 'pitch.meet', pitchId: p.id, action, ...extra } as Command);

/** Play the meeting through: the best opener, `answer` to every question, then `ask`. */
function play(w: World, p: Pitch, answer: PitchMeetingAnswer = 'true', ask = 'inside') {
  const m = w.pitches[p.id]!.meeting!;
  const best = m.openers.includes('story')
    ? 'story'
    : m.openers.includes('traction')
      ? 'traction'
      : 'problem';
  w = meet(w, p, 'open', { option: best }).world;
  for (const q of w.pitches[p.id]!.meeting!.questions) {
    if (q.answer) continue;
    w = meet(w, p, 'answer', { questionId: q.id, option: answer }).world;
  }
  return meet(w, p, 'ask', { option: ask });
}

const view = (w: World, who: string, p: Pitch) =>
  playerView(w, who)!.pitches.find((x) => x.id === p.id)!.meeting!;

function cofounder(w: World, skill = 0.8): World {
  return produce(w, (x) => {
    const c = companyOf(x, F);
    c.staff.push({
      id: 'st_biz',
      name: 'Sidi Kamara',
      role: 'operations',
      seniority: 'head',
      salary: 0,
      equityBps: 2000,
      morale: 70,
      skill,
      personality: 'steady',
      hiredMonth: x.markets.london!.month,
      cofounder: {
        profile: 'operator',
        title: 'CEO',
        equityBps: 2000,
        vestingMonths: 48,
        cliffMonths: 12,
        since: 0,
      },
    } as Staff);
  });
}

describe('#13 the investor pitch meeting', () => {
  it('sits you down with him: opener, questions from your real numbers, the ask', () => {
    const { w, fundId } = withFund(founder('healthtech'));
    const { w: w1, p } = pitch(w, fundId);
    expect(p.status).toBe('meeting');
    const m = p.meeting!;
    // His questions ask about what is true: customers, revenue, runway.
    expect(m.facts.customers).toBe(payingCustomers(w1, co(w1)));
    const runway = forwardRunway(w1, co(w1));
    expect(m.facts.runway).toBe(Number.isFinite(runway) ? Math.round(runway * 10) / 10 : null);
    expect(m.questions.map((q) => q.id).slice(0, 2)).toEqual(['traction', 'runway']);
    expect(m.openers).toHaveLength(3);
    // With no paying customer that's his biggest worry, from the start.
    expect(m.start.find((x) => x.id === 'worry:customers')?.points).toBe(
      m.facts.customers === 0 ? -10 : undefined,
    );
    const v = view(w1, F, p);
    expect(v.step).toBe('open');
    expect(v.investor.name).toBe(w1.funds[fundId]!.partner);
    expect(v.questions[0]!.options.find((o) => o.id === 'stretch')!.tag).toBe('check');
    expect(v.questions[0]!.options.find((o) => o.id === 'true')!.tag).toBe('true');
    expect(v.band[0]).toBeLessThan(v.band[1]);
    // In order: no answering before opening.
    const early = tryRun(w1, F, {
      type: 'pitch.meet',
      pitchId: p.id,
      action: 'answer',
      questionId: 'traction',
      option: 'true',
    });
    expect(early.ok).toBe(false);
  });

  it('scores on the real numbers: won customers and interviews make answers stronger', () => {
    const base = founder('healthtech');
    const none = {
      ...meetingFacts(base, co(base)),
      customers: 0,
      accounts: 0,
      pipeline: 0,
      interviews: 0,
      pain: null,
      rival: null,
    };
    // Win a customer through a sales conversation.
    let w = run(base, F, { type: 'sales.prospect' }).world;
    const id = co(w).deals!.find((d) => d.stage === 'lead')!.id;
    const won = talkWin(w, id);
    expect(won.result.won).toBe(true);
    w = won.world;
    const f = meetingFacts(w, co(w));
    expect(f.accounts).toBe(1);
    expect(f.topAccount).toBe(co(w).salesAccounts![0]!.name);
    expect(answerPoints(f, 'traction', 'true')).toBeGreaterThan(
      answerPoints(none, 'traction', 'true'),
    );
    // A pipeline beats nothing; interviews beat nothing too.
    const pipe = { ...none, pipeline: 2, pipelineValue: 900_00, topDeal: 'Bankside Clinic' };
    expect(answerPoints(pipe, 'traction', 'true')).toBeGreaterThan(
      answerPoints(none, 'traction', 'true'),
    );
    const notes = { ...none, pain: { en: 'x', fr: 'x' }, painBy: 'Hannah', interviews: 2 };
    expect(answerPoints(notes, 'competition', 'true')).toBeGreaterThan(
      answerPoints({ ...none, rival: 'Kopa' }, 'competition', 'true'),
    );
    // The opener "from your interview notes" is on offer only with notes.
    const { w: fw, fundId } = withFund(
      produce(base, (x) => {
        const c = companyOf(x, F);
        c.interviews = {
          n: 2,
          month: x.markets.london!.month,
          count: 2,
          hints: [
            {
              segmentKey: c.targetSegments[0]!,
              name: 'Hannah Cole',
              place: 'Market',
              persona: 0,
              n: 1,
            },
          ],
        };
      }),
    );
    const { p } = pitch(fw, fundId);
    if (p.meeting!.facts.pain) expect(p.meeting!.openers).toContain('story');
  });

  it('catches overclaiming in diligence', () => {
    let caught = 0;
    let passedOnly = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const { w, fundId } = withFund(founder('healthtech', true, seed));
      const { w: w1, p } = pitch(w, fundId);
      const r = play(w1, p, 'stretch');
      const after = r.world.pitches[p.id]!;
      const res = after.meeting!.result!;
      if (res.outcome === 'caught') {
        caught++;
        expect(after.status).toBe('passed');
        expect(after.reason).toContain('didn’t match what we found in diligence');
        expect(res.caught.length).toBeGreaterThan(0);
        expect(res.moved.some((x) => x.id.startsWith('caught:'))).toBe(true);
        expect(after.dealId).toBeNull();
      } else passedOnly++;
    }
    // At 75% a stretched number, nearly every meeting with two stretches is found out.
    expect(caught).toBeGreaterThanOrEqual(9);
    expect(caught + passedOnly).toBe(12);
  });

  it('a term sheet: what moved him, accept it, and the money arrives on the ledger', () => {
    const { w, fundId } = withFund(cofounder(founder('healthtech')));
    // A keen fund, so this seed gets a term sheet.
    const keen = produce(w, (x) => {
      x.funds[fundId]!.mood = 1.5;
    });
    const { w: w1, p } = pitch(keen, fundId);
    const r = play(w1, p);
    const after = r.world.pitches[p.id]!;
    expect(after.status).toBe('term-sheet');
    const v = view(r.world, F, p);
    expect(v.result!.outcome).toBe('term-sheet');
    expect(v.result!.moved.length).toBeGreaterThan(2);
    expect(v.result!.terms!.preMoney).toBe(after.meeting!.ask!.preMoney);
    expect(v.result!.canCounter).toBe(true);
    const cash = account(r.world, co(r.world).account).balance;
    const amount = v.result!.terms!.amount;
    const ok = meet(r.world, p, 'accept');
    expect(ok.world.deals[after.dealId!]!.status).toBe('accepted');
    expect(account(ok.world, co(ok.world).account).balance).toBe(cash + amount);
    expect(view(ok.world, F, p).result!.closed).toBe('accepted');
  });

  it('you can counter once inside the meeting', () => {
    const { w, fundId } = withFund(cofounder(founder('healthtech')));
    const keen = produce(w, (x) => {
      x.funds[fundId]!.mood = 1.5;
    });
    const { w: w1, p } = pitch(keen, fundId);
    const r = play(w1, p);
    const offer = view(r.world, F, p).result!;
    const c1 = meet(r.world, p, 'counter');
    const res = c1.world.pitches[p.id]!.meeting!.result!;
    expect(res.counter!.preMoney).toBe(offer.counterTo);
    expect(['agreed', 'met', 'walked']).toContain(res.counter!.reply);
    expect(view(c1.world, F, p).result!.canCounter).toBe(false);
    const again = tryRun(c1.world, F, { type: 'pitch.meet', pitchId: p.id, action: 'counter' });
    expect(again.ok).toBe(false);
    if (res.counter!.reply === 'met') {
      // He met you part way: accept that, or walk.
      const walk = meet(c1.world, p, 'walk');
      expect(walk.world.deals[c1.world.pitches[p.id]!.dealId!]!.status).toBe('declined');
    }
  });

  it('a business co-founder joins: a bonus, and takes the competition question', () => {
    const { w, fundId } = withFund(founder('healthtech'));
    const solo = pitch(w, fundId);
    const { w: cw } = withFund(cofounder(founder('healthtech'), 0.8));
    const duo = pitch(cw, fundId);
    const m = duo.p.meeting!;
    expect(m.cofounder).toEqual({
      name: 'Sidi Kamara',
      points: Math.round(0.05 * 0.8 * 100),
    });
    expect(m.start.find((x) => x.id === 'cofounder')!.points).toBe(m.cofounder!.points);
    const comp = m.questions.find((q) => q.id === 'competition')!;
    expect(comp.cofounder).toBe(true);
    expect(comp.answer).toBe('true');
    expect(solo.p.meeting!.cofounder).toBeNull();
    const a = view(solo.w, F, solo.p).interest!;
    const b = view(duo.w, F, duo.p).interest!;
    expect(b).toBeGreaterThan(a);
  });

  it('the deck counts', () => {
    const { w, fundId } = withFund(founder('healthtech'));
    const weak = pitch(w, fundId, ['traction', 'financials']);
    const strong = pitch(w, fundId, ['problem', 'vision', 'ask']);
    const pts = (p: Pitch) => p.meeting!.start.find((x) => x.id === 'deck')?.points ?? 0;
    expect(pts(strong.p)).toBeGreaterThan(pts(weak.p));
    expect(view(strong.w, F, strong.p).interest!).toBeGreaterThan(
      view(weak.w, F, weak.p).interest!,
    );
  });

  it('is deterministic: the same meeting replays the same', () => {
    const go = () => {
      const { w, fundId } = withFund(cofounder(founder('healthtech', true, 3)));
      const { w: w1, p } = pitch(w, fundId);
      return play(w1, p, 'stretch', 'yours').world;
    };
    expect(go()).toEqual(go());
  });

  it('a player investor gets your pitch and answers it themselves', () => {
    let w = founder('healthtech');
    w = run(w, INV, {
      type: 'player.create',
      handle: 'h_ahmed',
      name: 'Ahmed Investor',
      role: 'investor',
      backgroundId: 'i-exited',
      market: 'london',
      investor: { sectors: ['healthtech'], stages: ['pre-seed', 'seed'], checkSize: 20_000_00 },
    }).world;
    const s = run(w, F, {
      type: 'pitch.start',
      companyId: co(w).id,
      investorId: INV,
      slides: ['problem', 'team'],
      ask: 20_000_00,
      preMoney: 400_000_00,
    });
    const p = s.world.pitches[s.result.pitchId]!;
    expect(p.status).toBe('meeting');
    // Not told until the meeting is done.
    const told = (x: World) => (x.inbox[INV] ?? []).some((i) => i.text.includes(co(x).name));
    expect(told(s.world)).toBe(false);
    const r = play(s.world, p, 'true', 'yours');
    const sent = r.world.pitches[p.id]!;
    expect(sent.status).toBe('sent');
    expect(sent.meeting!.result!.outcome).toBe('sent');
    expect(told(r.world)).toBe(true);
    // The investor sees what was said (no tags), and can answer.
    const iv = view(r.world, INV, p);
    expect(iv.canReply).toBe(true);
    expect(iv.questions.every((q) => q.options.every((o) => o.tag === null))).toBe(true);
    expect(iv.questions[0]!.answer!.checked).toBe('matches');
    expect(iv.interest).toBeNull();
    // Not decided by the game: still waiting after the founder's moves.
    expect(view(r.world, F, p).result!.terms).toBeNull();
    // He counters; the founder accepts it in the meeting.
    const reply = run(r.world, INV, {
      type: 'pitch.reply',
      pitchId: p.id,
      action: 'counter',
      amount: 20_000_00,
      preMoney: 320_000_00,
    } as Command);
    const ts = reply.world.pitches[p.id]!;
    expect(ts.status).toBe('term-sheet');
    const fv = view(reply.world, F, p).result!;
    expect(fv.terms!.preMoney).toBe(320_000_00);
    expect(fv.reply!.action).toBe('counter');
    const cash = account(reply.world, co(reply.world).account).balance;
    const ok = meet(reply.world, p, 'accept');
    expect(ok.world.deals[ts.dealId!]!.status).toBe('accepted');
    expect(account(ok.world, co(ok.world).account).balance).toBe(cash + 20_000_00);
    // Or he passes, with a note to the founder.
    const no = run(r.world, INV, {
      type: 'pitch.reply',
      pitchId: p.id,
      action: 'decline',
      reason: 'traction',
    } as Command);
    expect(no.world.pitches[p.id]!.status).toBe('passed');
    expect(no.world.inbox[F]!.some((x) => x.text.includes('passing for now'))).toBe(true);
  });

  it('leaving a meeting half-way ends it without putting the fund off', () => {
    const { w, fundId } = withFund(founder('healthtech'));
    const { w: w1, p } = pitch(w, fundId);
    const opened = meet(w1, p, 'open', { option: p.meeting!.openers[0] }).world;
    // While it's open, you can't start another with the same fund.
    const again = tryRun(opened, F, {
      type: 'pitch.start',
      companyId: co(opened).id,
      fundId,
      slides: ['problem'],
      ask: opened.funds[fundId]!.check[0],
    });
    expect(again.ok).toBe(false);
    const left = meet(opened, p, 'leave').world;
    const after = left.pitches[p.id]!;
    expect(after.meeting!.left).toBe(true);
    expect(after.meeting!.result).toBeUndefined();
    expect(view(left, F, p).left).toBe(true);
    // No more turns in it.
    expect(
      tryRun(left, F, { type: 'pitch.meet', pitchId: p.id, action: 'ask', option: 'inside' }).ok,
    ).toBe(false);
    // And the fund sees you again at once (a real pass would cool down for three months).
    const next = pitch(left, fundId);
    expect(next.p.status).toBe('meeting');
    const passed = produce(left, (x) => {
      delete x.pitches[p.id]!.meeting!.left;
    });
    const r = tryRun(passed, F, {
      type: 'pitch.start',
      companyId: co(passed).id,
      fundId,
      slides: ['problem'],
      ask: passed.funds[fundId]!.check[0],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('pitch.cooldown');
  });

  it('before the note, a pitch is the questions form and the meeting is unknown', () => {
    const { w, fundId } = withFund(founder('healthtech', false));
    const { w: w1, p } = pitch(w, fundId);
    expect(p.status).toBe('questions');
    expect(p.meeting).toBeUndefined();
    const r = tryRun(w1, F, {
      type: 'pitch.meet',
      pitchId: p.id,
      action: 'open',
      option: 'market',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('command.unknown');
    expect(MEETING.caught).toBe(0.75);
  });
});

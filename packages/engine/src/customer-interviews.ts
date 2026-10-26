/**
 * Customer interviews (player feedback, round two: "When I click interview
 * customers I don't really interview — I click discovery, spend hours and
 * everything happens"). Feedback-note worlds only (`company.interview` is an
 * unknown command before it; the old one-click `company.discovery` is kept).
 *
 * A founder meets one person from a segment of their industry, in their city:
 * a name, a portrait, their business and where it is (data/interviews.ts).
 * Three rounds: each offers four questions (the best one, open and about a
 * real past event, among broad, yes/no, leading and too-early ones), the
 * interviewee answers in character, and a good answer fills a line of notes:
 * Pain, Pays now, Would switch if. The summary scores the interview 0–100
 * (each question ✓ / ≈ / ✗ with why, the best question when you missed it,
 * and the question to ask next time) and the score feeds the company's
 * customer understanding for that segment (`product.discovery`, which the
 * stage tracker and the sales pipeline already read).
 *
 * About an hour each, a few a month, a small cost (transport, a drink) from
 * the company account through the ledger.
 *
 * Determinism: who you meet and what you can ask come from
 * `deriveRng(seed, 'interview', company, segment, n)`, with `n` the company's
 * interview count, so the same world meets the same people.
 */
import { CITY_NAME_PARTS } from './data/business-names.js';
import {
  INTERVIEW_GRADES,
  QUESTIONS,
  QUESTION_KINDS,
  QUESTION_SCORE,
  QUESTION_WHY,
  ROUND_NOTE,
  SEGMENT_INTERVIEWS,
  WEAK_ANSWERS,
  WEAK_NOTES,
  type Line,
  type NoteKey,
  type QuestionKind,
  type SegmentInterview,
} from './data/customer-interviews.js';
import { ensure, fail } from './errors.js';
import { col, getMarket, ownCompany, spendHours } from './helpers.js';
import { account, transfer } from './ledger.js';
import { clamp01 } from './math.js';
import { formatMoney, scale } from './money.js';
import { deriveRng } from './rng.js';
import type {
  Company,
  CompanyInterviews,
  Id,
  InterviewRecord,
  InterviewState,
  MarketState,
  Player,
  World,
} from './types.js';

export const INTERVIEW = {
  hours: 1,
  /** Cash per interview, a share of the city's monthly cost of living (transport, a drink). */
  costCol: 0.02,
  perMonth: 5,
  rounds: 3,
  /** Customer understanding a perfect interview adds, as a share of what's left to learn. */
  gain: 0.1,
  hintsKept: 6,
  /** What the placeholders are worth, in months of the segment's budget per buyer. */
  lostX: 2.5,
  spendX: 0.6,
  priceX: 1.1,
} as const;

const round3 = (x: number) => Math.round(x * 1000) / 1000;

// ---------------------------------------------------------------- Content

/** A question id: round (0–2), kind, wording. Round 0's best wording 0 is the segment's own. */
const qid = (round: number, kind: QuestionKind, v: number) => `${round}.${kind}.${v}`;

function parseQ(id: string): { round: number; kind: QuestionKind; v: number } | null {
  const [r, k, v] = id.split('.');
  const round = Number(r);
  const kind = k as QuestionKind;
  const n = Number(v);
  if (!Number.isInteger(round) || round < 0 || round >= INTERVIEW.rounds) return null;
  if (!QUESTION_KINDS.includes(kind) || !Number.isInteger(n) || n < 0) return null;
  return { round, kind, v: n };
}

/** The wordings a round has for a kind (round 0's best: the segment's own first). */
function wordings(seg: SegmentInterview, round: number, kind: QuestionKind): Line[] {
  const generic = QUESTIONS[round]![kind];
  return round === 0 && kind === 'best' ? [seg.ask, ...generic] : generic;
}

interface Vars {
  lost: string;
  spend: string;
  price: string;
  benefit: Line;
}

function varsFor(m: MarketState, segmentKey: string): Vars {
  const s = m.segments[segmentKey];
  const budget = Math.max(1, s?.budget ?? scale(col(m), 0.05));
  const cur = m.data.currency;
  // Round figures, the way people say them (two significant digits).
  const nice = (v: number) => {
    const p = 10 ** Math.max(0, Math.floor(Math.log10(Math.max(1, v))) - 1);
    return Math.round(v / p) * p;
  };
  const fmt = (x: number) => formatMoney(nice(budget * x), cur);
  return {
    lost: fmt(INTERVIEW.lostX),
    spend: fmt(INTERVIEW.spendX),
    price: fmt(INTERVIEW.priceX),
    benefit: SEGMENT_INTERVIEWS[segmentKey]?.benefit ?? { en: '', fr: '' },
  };
}

/** Fill a line's placeholders, in both languages. */
function fill(line: Line, v: Vars): Line {
  const one = (s: string, lang: 'en' | 'fr') =>
    s
      .replace(/\{lost\}/g, v.lost)
      .replace(/\{spend\}/g, v.spend)
      .replace(/\{price\}/g, v.price)
      .replace(/\{benefit\}/g, v.benefit[lang]);
  return { en: one(line.en, 'en'), fr: one(line.fr, 'fr') };
}

const segInterview = (key: string): SegmentInterview => {
  const s = SEGMENT_INTERVIEWS[key];
  if (!s) return fail('interview.segment', 'Nobody to interview in that segment yet.');
  return s;
};

interface Answer {
  answer: Line;
  note: { key: NoteKey; line: Line } | null;
}

function answerTo(seg: SegmentInterview, persona: number, id: string, v: Vars): Answer {
  const q = parseQ(id)!;
  const p = seg.personas[persona % seg.personas.length]!;
  if (q.kind === 'best') {
    if (q.round === 0)
      return { answer: fill(p.pain, v), note: { key: 'pain', line: fill(p.painNote, v) } };
    const pair = (q.round === 1 ? seg.tried : seg.switchIf)[persona % 2]!;
    return {
      answer: fill(pair[0], v),
      note: { key: ROUND_NOTE[q.round]!, line: fill(pair[1], v) },
    };
  }
  const answers = WEAK_ANSWERS[q.round]![q.kind];
  const answer = fill(answers[(persona + q.v) % answers.length]!, v);
  const notes = WEAK_NOTES[q.kind] ?? {};
  // A broad question in round 1 hints at the pain; a price asked too early gets a polite yes.
  const key: NoteKey | null =
    q.kind === 'broad' && q.round === 0
      ? 'pain'
      : q.kind === 'early' && q.round !== 1
        ? 'price'
        : null;
  const line = key ? notes[key] : undefined;
  return { answer, note: key && line ? { key, line: fill(line, v) } : null };
}

// ---------------------------------------------------------------- Who you meet

/** The person you'd meet next in a segment, and what you could ask them. Pure. */
export function meet(world: World, c: Company, segmentKey: string, n: number) {
  const m = getMarket(world, c.market);
  const seg = segInterview(segmentKey);
  const rng = deriveRng(world.seed, 'interview', c.id, segmentKey, n);
  const persona = (rng.int(0, seg.personas.length - 1) + n) % seg.personas.length;
  const parts = CITY_NAME_PARTS[m.id];
  const gender: 'female' | 'male' = rng.chance(0.5) ? 'female' : 'male';
  const name = `${rng.pick(gender === 'female' ? parts.female : parts.male)} ${rng.pick(parts.last)}`;
  const place = rng.pick(parts.places);
  const offers: string[][] = [];
  for (let r = 0; r < INTERVIEW.rounds; r++) {
    const best = wordings(seg, r, 'best');
    const weak: QuestionKind[] = ['broad', 'yesno', 'leading', 'early'];
    weak.splice(rng.int(0, weak.length - 1), 1);
    const ids = [
      qid(r, 'best', rng.int(0, best.length - 1)),
      ...weak.map((k) => qid(r, k, rng.int(0, wordings(seg, r, k).length - 1))),
    ];
    offers.push(rng.shuffle(ids));
  }
  return { n, segmentKey, persona, name, gender, place, offers };
}

// ---------------------------------------------------------------- Commands

const stateOf = (c: Company): CompanyInterviews => (c.interviews ??= { n: 0, month: 0, count: 0 });

const usedThisMonth = (c: Company, month: number) =>
  c.interviews?.month === month ? c.interviews.count : 0;

export const interviewCost = (m: MarketState) => scale(col(m), INTERVIEW.costCol);

/** Meet the next person from a segment of your industry (1h, a small cost). */
export function startInterview(world: World, me: Player, companyId: Id, segmentKey: string) {
  const c = ownCompany(world, me.id, companyId);
  const m = getMarket(world, c.market);
  const month = m.month;
  const seg = m.segments[segmentKey];
  ensure(seg && seg.industry === c.industry, 'interview.segment', 'Pick a segment in your sector.');
  segInterview(segmentKey);
  const st = stateOf(c);
  ensure(
    !st.active,
    'interview.active',
    `Finish your interview with ${st.active?.name ?? 'them'} first.`,
  );
  ensure(
    usedThisMonth(c, month) < INTERVIEW.perMonth,
    'interview.limit',
    `You’ve done ${INTERVIEW.perMonth} interviews this month. Come back next month.`,
  );
  const cost = interviewCost(m);
  ensure(
    account(world, c.account).balance >= cost,
    'interview.cash',
    'Your company doesn’t have the cash for this right now.',
  );
  spendHours(me, INTERVIEW.hours, 'A customer interview');
  transfer(world, c.account, m.ext.suppliers, cost, `Customer interview: ${seg.name}`, month);
  const who = meet(world, c, segmentKey, st.n);
  st.active = { ...who, month, picks: [] };
  st.n += 1;
  st.count = usedThisMonth(c, month) + 1;
  st.month = month;
  c.lastDecisionMonth = month;
  return { started: true, name: who.name, cost };
}

/** Ask one of this round's questions; the last round ends the interview with its score. */
export function askInterview(world: World, me: Player, companyId: Id, questionId: string) {
  const c = ownCompany(world, me.id, companyId);
  const m = getMarket(world, c.market);
  const st = stateOf(c);
  const a = st.active;
  ensure(a, 'interview.none', 'Start an interview first.');
  const round = a.picks.length;
  ensure(
    a.offers[round]?.includes(questionId) ?? false,
    'interview.question',
    'That isn’t one of the questions you can ask now.',
  );
  a.picks.push(questionId);
  const v = varsFor(m, a.segmentKey);
  const ans = answerTo(segInterview(a.segmentKey), a.persona, questionId, v);
  if (a.picks.length < INTERVIEW.rounds) return { round: round + 1, done: false, ...ans };
  // The summary: the score, and what it taught you about the segment.
  const score = scoreOf(a.picks);
  const before = c.product.discovery[a.segmentKey] ?? 0;
  const after = round3(clamp01(before + INTERVIEW.gain * (score / 100) * (1 - before)));
  c.product.discovery[a.segmentKey] = after;
  me.skills.sales = Math.min(100, me.skills.sales + 1);
  const rec: InterviewRecord = { ...a, picks: [...a.picks], score, before, after };
  st.last = rec;
  st.active = null;
  // What they told you about the pain stays as a hint for the sales conversation.
  if (a.picks[0] && parseQ(a.picks[0])?.kind === 'best')
    st.hints = [
      { segmentKey: a.segmentKey, name: a.name, place: a.place, persona: a.persona, n: a.n },
      ...(st.hints ?? []),
    ].slice(0, INTERVIEW.hintsKept);
  return { round: INTERVIEW.rounds, done: true, ...ans, score, before, after };
}

/** Walk away mid-interview: the hour is spent, nothing is learned. */
export function leaveInterview(world: World, me: Player, companyId: Id) {
  const c = ownCompany(world, me.id, companyId);
  const st = stateOf(c);
  ensure(st.active, 'interview.none', 'You’re not in an interview.');
  st.active = null;
  return { left: true };
}

const scoreOf = (picks: string[]) =>
  Math.round(
    (picks.reduce((s, id) => s + QUESTION_SCORE[parseQ(id)?.kind ?? 'early'], 0) /
      INTERVIEW.rounds) *
      100,
  );

// ---------------------------------------------------------------- View

const mark = (s: number) => (s >= 0.8 ? 'good' : s >= 0.5 ? 'ok' : 'bad');

function personView(m: MarketState, c: Company, who: Omit<InterviewState, 'month' | 'picks'>) {
  const seg = segInterview(who.segmentKey);
  const p = seg.personas[who.persona % seg.personas.length]!;
  return {
    name: who.name,
    gender: who.gender,
    place: who.place,
    /** Seeds the portrait: the same person always looks the same. */
    portraitId: `iv:${c.id}:${who.segmentKey}:${who.n}`,
    job: p.job,
    detail: p.detail,
    greeting: p.greeting,
    segmentKey: who.segmentKey,
    segment: m.segments[who.segmentKey]?.name ?? '',
  };
}

const questionText = (seg: SegmentInterview, id: string, v: Vars): Line => {
  const q = parseQ(id)!;
  return fill(wordings(seg, q.round, q.kind)[q.v] ?? wordings(seg, q.round, q.kind)[0]!, v);
};

function roundsView(m: MarketState, a: InterviewState) {
  const seg = segInterview(a.segmentKey);
  const v = varsFor(m, a.segmentKey);
  const notes: Partial<Record<NoteKey, Line>> = {};
  const rounds = a.picks.map((id, r) => {
    const q = parseQ(id)!;
    const ans = answerTo(seg, a.persona, id, v);
    // A real answer outranks a weak one already in the notes.
    if (ans.note && (!notes[ans.note.key] || q.kind === 'best'))
      notes[ans.note.key] = ans.note.line;
    return {
      round: r,
      id,
      kind: q.kind,
      question: questionText(seg, id, v),
      answer: ans.answer,
      note: ans.note,
      // Once asked, the round's questions show what kind they were.
      offered: a.offers[r]!.map((o) => ({
        id: o,
        kind: parseQ(o)!.kind,
        text: questionText(seg, o, v),
      })),
    };
  });
  return { seg, v, rounds, notes };
}

function summaryView(m: MarketState, c: Company, rec: InterviewRecord) {
  const { seg, v, rounds, notes } = roundsView(m, rec);
  const grade = INTERVIEW_GRADES.find((g) => rec.score >= g.min)!.label;
  return {
    person: personView(m, c, rec),
    score: rec.score,
    grade,
    before: rec.before,
    after: rec.after,
    rounds: rounds.map((r) => {
      const best = rec.offers[r.round]!.find((o) => parseQ(o)!.kind === 'best')!;
      const s = QUESTION_SCORE[r.kind];
      const whys = QUESTION_WHY[r.kind];
      return {
        round: r.round,
        question: r.question,
        kind: r.kind,
        score: s,
        mark: mark(s),
        why: whys[r.kind === 'best' ? r.round % whys.length : 0]!,
        best: r.kind === 'best' ? null : questionText(seg, best, v),
      };
    }),
    missed: { question: fill(seg.deeper, v), why: fill(seg.deeperWhy, v) },
    notes,
  };
}

/** Pain notes from your interviews in a segment (newest first), for the sales conversation. */
export function interviewHints(world: World, c: Company, segmentKey: string, max = 3) {
  const m = getMarket(world, c.market);
  const seg = SEGMENT_INTERVIEWS[segmentKey];
  if (!seg) return [];
  const v = varsFor(m, segmentKey);
  return (c.interviews?.hints ?? [])
    .filter((h) => h.segmentKey === segmentKey)
    .slice(0, max)
    .map((h) => ({
      text: fill(seg.personas[h.persona % seg.personas.length]!.painNote, v),
      name: h.name.split(' ')[0]!,
      place: h.place,
    }));
}

/** Interviews for the company view (feedback note): who you'd meet, the one under way, the last. */
export function interviewsView(world: World, c: Company) {
  const m = getMarket(world, c.market);
  const st = c.interviews;
  const used = usedThisMonth(c, m.month);
  const segs = Object.values(m.segments).filter(
    (s) => s.industry === c.industry && SEGMENT_INTERVIEWS[s.key],
  );
  const n = st?.n ?? 0;
  const active = st?.active
    ? (() => {
        const a = st.active;
        const { seg, v, rounds, notes } = roundsView(m, a);
        const round = a.picks.length;
        return {
          person: personView(m, c, a),
          round,
          rounds,
          options: (a.offers[round] ?? []).map((id) => ({ id, text: questionText(seg, id, v) })),
          notes,
        };
      })()
    : null;
  return {
    hours: INTERVIEW.hours,
    cost: interviewCost(m),
    perMonth: INTERVIEW.perMonth,
    left: Math.max(0, INTERVIEW.perMonth - used),
    done: n,
    rounds: INTERVIEW.rounds,
    /** Who you'd meet next in each segment of your industry. */
    next: segs.map((s) => ({
      ...personView(m, c, meet(world, c, s.key, n)),
      understanding: c.product.discovery[s.key] ?? 0,
      needs: s.needsLabel,
    })),
    active,
    last: st?.last ? summaryView(m, c, st.last) : null,
  };
}

export type InterviewsView = ReturnType<typeof interviewsView>;

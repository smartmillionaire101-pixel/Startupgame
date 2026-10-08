/**
 * Wave 12 §A: quiz night. Timed multiple-choice rounds from the question bank
 * (or the host's own questions). Everyone answers on their own phone; the
 * server scores every answer from the time it arrives: 100 points for a right
 * answer plus up to 100 more for speed. AI players answer from their own
 * seeded draw (how likely they know it depends on their skill and the
 * question's difficulty), so nothing about them is stored.
 *
 * The clock: a short countdown, then each question is open for
 * `QUIZ.answerMs` and its answer shows for `QUIZ.revealMs`. When every human
 * still playing has answered, the question closes a moment later and the
 * rest of the schedule moves up.
 */
import { BANK_BY_ID, QUIZ_BANK, QUIZ_CATEGORIES, type BankQuestion } from './data/quiz-bank.js';
import { ensure } from './errors.js';
import { deriveRng } from './rng.js';
import type { Game, GamePlayer, QuizQuestion } from './games-types.js';
import type { World } from './types.js';

export const QUIZ = {
  leadMs: 4000,
  answerMs: 15_000,
  revealMs: 4500,
  /** After the last human answers, the question stays open this long. */
  graceMs: 1200,
  minQuestions: 3,
  maxQuestions: 12,
  venueQuestions: 6,
  maxCustom: 12,
  minPlayers: 2,
  maxPlayers: 8,
  right: 100,
  speed: 100,
} as const;

export const QUIZ_PACKS = QUIZ_CATEGORIES;

/** Pick the game's questions: from the packs (city questions are this city's), shuffled. */
export function pickQuestions(
  world: World,
  g: Game,
  opts: { packs: string[]; count: number; custom: QuizQuestion['custom'][] },
): QuizQuestion[] {
  const rng = deriveRng(world.seed, 'game', g.id, 'questions');
  const order = (): [number, number, number, number] =>
    rng.shuffle([0, 1, 2, 3]) as [number, number, number, number];
  const out: QuizQuestion[] = opts.custom
    .filter((c): c is NonNullable<typeof c> => !!c)
    .map((custom) => ({ custom, order: order() }));
  const packs = opts.packs.length ? opts.packs : [...QUIZ_PACKS];
  const fits = (b: BankQuestion) =>
    packs.includes(b.cat) && (b.cat !== 'city' || b.city === g.market);
  // Spread across the packs: take them in turn.
  const byPack = packs.map((p) => rng.shuffle(QUIZ_BANK.filter((b) => b.cat === p && fits(b))));
  let i = 0;
  while (out.length < opts.count && byPack.some((l) => l.length)) {
    const list = byPack[i++ % byPack.length]!;
    const b = list.shift();
    if (b) out.push({ bankId: b.id, order: order() });
  }
  return out;
}

export function initQuiz(g: Game, now: number) {
  const qz = g.quiz!;
  const n = qz.questions.length;
  qz.closeAt = [];
  let t = now + QUIZ.leadMs;
  for (let i = 0; i < n; i++) {
    t += QUIZ.answerMs;
    qz.closeAt.push(t);
    t += QUIZ.revealMs;
  }
  qz.answers = {};
  for (const p of g.players) if (!p.ai) qz.answers[p.id] = Array.from({ length: n }, () => null);
}

const openAt = (g: Game, i: number) =>
  i === 0 ? g.startedAt! + QUIZ.leadMs : g.quiz!.closeAt[i - 1]! + QUIZ.revealMs;

export type QuizPhase =
  | { phase: 'countdown'; until: number }
  | { phase: 'question'; i: number; openAt: number; until: number }
  | { phase: 'reveal'; i: number; until: number }
  | { phase: 'over' };

export function quizPhase(g: Game, now: number): QuizPhase {
  const qz = g.quiz!;
  if (now < g.startedAt! + QUIZ.leadMs)
    return { phase: 'countdown', until: g.startedAt! + QUIZ.leadMs };
  for (let i = 0; i < qz.closeAt.length; i++) {
    if (now < qz.closeAt[i]!)
      return { phase: 'question', i, openAt: openAt(g, i), until: qz.closeAt[i]! };
    if (now < qz.closeAt[i]! + QUIZ.revealMs)
      return { phase: 'reveal', i, until: qz.closeAt[i]! + QUIZ.revealMs };
  }
  return { phase: 'over' };
}

/** The slot holding the right answer. */
export const rightSlot = (q: QuizQuestion) => q.order.indexOf(0);

const difficultyOf = (q: QuizQuestion) => (q.bankId ? (BANK_BY_ID.get(q.bankId)?.diff ?? 2) : 2);

/** An AI player's answer to question i: the slot and how long it took (ms after it opened). */
export function aiAnswer(world: World, g: Game, p: GamePlayer, i: number) {
  const q = g.quiz!.questions[i]!;
  const rng = deriveRng(world.seed, 'game', g.id, 'ai', p.id, i);
  const skill = p.skill ?? 0.5;
  // A host's own questions: nobody's read them before, so AI players mostly guess.
  const know = q.custom
    ? 0.25 + 0.2 * skill
    : Math.min(0.95, Math.max(0.1, skill + 0.35 - 0.2 * difficultyOf(q)));
  const right = rightSlot(q);
  const c = rng.chance(know) ? right : rng.int(0, 3);
  const window = g.quiz!.closeAt[i]! - openAt(g, i);
  const ms = Math.round(QUIZ.answerMs * rng.range(0.18, 0.7) * (1.25 - 0.5 * skill));
  return { c, ms: Math.min(ms, Math.max(300, window - 200)) };
}

const pointsFor = (right: boolean, ms: number) =>
  right ? QUIZ.right + Math.round(QUIZ.speed * Math.max(0, 1 - ms / QUIZ.answerMs)) : 0;

/** One player's answer and points for question i (null when they didn't answer). */
export function answerOf(world: World, g: Game, p: GamePlayer, i: number) {
  const q = g.quiz!.questions[i]!;
  if (p.ai) {
    const a = aiAnswer(world, g, p, i);
    return { c: a.c, ms: a.ms, points: pointsFor(a.c === rightSlot(q), a.ms) };
  }
  const a = g.quiz!.answers[p.id]?.[i];
  if (!a) return null;
  const ms = a.at - openAt(g, i);
  return { c: a.c, ms, points: pointsFor(a.c === rightSlot(q), ms) };
}

/** Totals over the questions that have closed by `upTo` (all of them by default). */
export function quizScores(world: World, g: Game, upTo = Infinity) {
  const out: Record<string, number> = {};
  const n = g.quiz!.questions.length;
  for (const p of g.players) {
    let t = 0;
    for (let i = 0; i < n && g.quiz!.closeAt[i]! <= upTo; i++)
      t += answerOf(world, g, p, i)?.points ?? 0;
    out[p.id] = t;
  }
  return out;
}

/** `game.play { move: { k: 'answer' } }`. */
export function answerQuestion(g: Game, playerId: string, q: number, choice: number, now: number) {
  const ph = quizPhase(g, now);
  ensure(ph.phase === 'question' && ph.i === q, 'game.closed', 'That question has closed.');
  ensure(Number.isInteger(choice) && choice >= 0 && choice <= 3, 'game.move', 'Pick an answer.');
  const qz = g.quiz!;
  const mine = qz.answers[playerId];
  ensure(mine, 'game.player', 'You’re not playing in this quiz.');
  ensure(!mine[q], 'game.answered', 'You’ve already answered.');
  mine[q] = { c: choice, at: now };
  // Everyone still in has answered: close it a moment from now and move the rest up.
  const humans = g.players.filter((p) => !p.ai && !p.out);
  if (humans.every((p) => qz.answers[p.id]?.[q])) {
    const close = Math.min(qz.closeAt[q]!, now + QUIZ.graceMs);
    const shift = qz.closeAt[q]! - close;
    if (shift > 0) for (let i = q; i < qz.closeAt.length; i++) qz.closeAt[i]! -= shift;
  }
  return { q, choice };
}

/** The text of question i in both languages (options in display order). */
export function questionText(g: Game, i: number) {
  const q = g.quiz!.questions[i]!;
  if (q.custom) {
    const opts = q.order.map((k) => q.custom!.options[k]!);
    return { en: q.custom.q, fr: q.custom.q, options: opts, optionsFr: opts, cat: 'custom' };
  }
  const b = BANK_BY_ID.get(q.bankId!)!;
  return {
    en: b.en[0],
    fr: b.fr[0],
    options: q.order.map((k) => b.en[k + 1]!),
    optionsFr: q.order.map((k) => b.fr[k + 1]!),
    cat: b.cat,
  };
}

/** What a viewer may see of a quiz right now: never the answer to an open question. */
export function quizView(world: World, g: Game, viewerId: string, now: number) {
  const qz = g.quiz!;
  const ph = g.status === 'playing' ? quizPhase(g, now) : { phase: 'over' as const };
  const n = qz.questions.length;
  const shownUpTo = ph.phase === 'question' || ph.phase === 'reveal' ? ph.i : n - 1;
  const closed = (i: number) => qz.closeAt[i] !== undefined && qz.closeAt[i]! <= now;
  const current =
    g.status === 'lobby' || ph.phase === 'countdown' || ph.phase === 'over'
      ? null
      : (() => {
          const i = shownUpTo;
          const text = questionText(g, i);
          const isClosed = ph.phase === 'reveal';
          return {
            i,
            ...text,
            openAt: openAt(g, i),
            closeAt: qz.closeAt[i]!,
            /** The right slot: only once the question has closed. */
            right: isClosed ? rightSlot(qz.questions[i]!) : null,
            /** Who has answered (not what) while it's open; everyone's answers after. */
            answers: g.players.map((p) => {
              const a = answerOf(world, g, p, i);
              const answeredYet = a !== null && (isClosed || openAt(g, i) + a.ms <= now);
              return {
                id: p.id,
                answered: answeredYet,
                choice: isClosed || p.id === viewerId ? (answeredYet ? a!.c : null) : null,
                points: isClosed ? (a?.points ?? 0) : null,
              };
            }),
          };
        })();
  const scores = quizScores(world, g, now);
  return {
    count: n,
    packs: qz.packs,
    phase: ph.phase,
    until: 'until' in ph ? ph.until : null,
    current,
    scores,
    /** Every question with its answer, once the quiz is over. */
    review:
      g.status === 'settled'
        ? qz.questions.map((q, i) => ({
            ...questionText(g, i),
            right: rightSlot(q),
            closed: closed(i),
          }))
        : null,
  };
}

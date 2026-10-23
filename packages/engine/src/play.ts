/** Persistent, server-scored social games. No client scores or client clocks are trusted. */
import type { World, Player, Id } from './types.js';
import type { MarketId } from './data/markets.js';
import type { Currency } from './money.js';
import { ensure } from './errors.js';
import { col, getMarket, locationOf, notify } from './helpers.js';
import { newId } from './ids.js';
import { account, openAccount, payExact, transfer } from './ledger.js';
import type { Command } from './commands.js';
import { createRng, deriveRng, hashString } from './rng.js';
import { QUIZ_BANK, type QuizCategory } from './data/quiz-bank.js';
import { investorOn, journeyEventsOn, lifeBarsOn, moreGamesOn } from './releases.js';
import {
  FULL_RACK,
  aiBowl,
  bowlingGame,
  simulateBowl,
  wobble,
  type BowlInput,
  type BowlLaunch,
} from './bowling.js';
import { BOWLING, gameVenueKey } from './data/games.js';
import { gamesRecordOf } from './games.js';
import { isOpen, specOf, venuePrice } from './economy.js';
import { applyBars, bumpEnergy } from './lifebars.js';
import { bumpNeed } from './needs.js';
import {
  POOL_FOOT,
  POOL_HEAD,
  freeSpot,
  groupOf,
  inGroup,
  poolPlan,
  poolRack,
  poolSpeed,
  simulatePool,
  type PoolGroup,
} from './pool.js';
import {
  aiDive,
  aiKick,
  laneOf,
  resolveKick,
  shootoutOver,
  type Kick,
  type KickOutcome,
} from './shootout.js';
import { GOLF, golfCourse } from './data/leisure.js';
import { golfClubOf, golfFee } from './leisure.js';
import { formatMoney } from './money.js';
import {
  CLUBS,
  LIE_CARRY,
  PUTTER,
  clubFor,
  defaultAim,
  dist,
  hit,
  holeGeo,
  scoreName,
  skillOf,
  strokeRng,
  type Club,
  type Lie,
  type Pt2,
} from './golf-physics.js';

export interface QuizQuestion {
  text: string;
  options: string[];
  answer: number;
  /** Wave 12: the French (built-in questions only). */
  fr?: { text: string; options: string[] };
  cat?: QuizCategory;
}

/**
 * Wave 12: from this moment quiz rooms are always drawn from the built-in bank
 * (data/quiz-bank.ts) and their host plays; custom question sets sent by older
 * clients are ignored. Commands logged before it replay exactly as they ran
 * (custom sets honoured, the original 20-question pool).
 */
export const AUTO_QUIZ_FROM = Date.UTC(2026, 9, 14);
/**
 * The release note that switches quizzes to the built-in bank. A world that
 * logged earlier release notes but not this one is from before Wave 12: its
 * rooms replay as they ran (custom questions allowed). The switch is the
 * logged note itself, never the clock, so replay can't diverge.
 */
export const AUTO_QUIZ_NOTE = 'release-2026-10-14-wave12';
export const autoQuiz = (w: World) => {
  const notes = w.announcements ?? [];
  // Later release notes come after Wave 12, so they switch it on too (a new
  // world's first note is the newest one).
  return notes.length === 0 || notes.includes(AUTO_QUIZ_NOTE) || journeyEventsOn(w);
};
/** Questions in a built-in quiz. */
export const QUIZ_LENGTH = 10;
/** A quiz host waiting alone this long is matched with AI opponents (on the next sync). */
export const QUIZ_AI_AFTER = 45_000;
const QUESTION_MS = 20_000;
/** Snooker: time for each shot. Football: time to lock in each penalty. */
const SHOT_MS = 45_000;
const PENALTY_MS = 20_000;
/** An AI opponent at snooker waits this long into its turn (the last shot plays out first). */
export const AI_SHOT_AFTER = 4_000;
export interface Ball {
  id: number;
  x: number;
  y: number;
  value: number;
  potted: boolean;
}
export interface PlayRoom {
  id: Id;
  host: Id;
  market: MarketId;
  venue: string;
  title: string;
  game: 'quiz' | 'snooker' | 'football' | 'golf' | 'bowling';
  status: 'waiting' | 'playing' | 'finished' | 'cancelled';
  createdAt: number;
  touchedAt: number;
  deadline: number;
  currency: Currency;
  stake: number;
  escrow: Id;
  members: { id: Id; score: number }[];
  winners: Id[];
  round: number;
  turn: number;
  custom: boolean;
  questions: QuizQuestion[];
  answers: Record<Id, number>;
  last: string;
  balls: Ball[];
  red: boolean;
  colorFree: boolean;
  frames: Ball[][];
  moves: Record<Id, number>;
  penalties: Penalty[];
  /**
   * The rules this room plays (rooms made before the investor-career note
   * have none: the old short snooker frame and the five-corner penalties).
   * 'pool8': 8-ball pool, played out ball by ball (r.pool). 'shootout': a
   * real penalty shootout, each kick played out (r.kicks).
   */
  rules?: 'pool8' | 'shootout';
  pool?: PoolMatch;
  /** Shootout: the kick the shooter has locked in this round (never shown until played). */
  kicks?: Record<Id, Kick>;
  /** Wave 12: AI opponents in this room (world AI players; their stakes are real). */
  ai?: Id[];
  /** Golf with a friend (game 'golf' only; older rooms never have it). */
  golf?: GolfMatch;
  /** Ten-pin bowling (game 'bowling' only: the more-games release). */
  bowling?: BowlingMatch;
}

// ---------------------------------------------------------------- Bowling

/** One bowler's game. */
export interface Bowler {
  /** Pins down per ball, in order. */
  rolls: number[];
  /** Pin numbers standing for their next ball. */
  standing: number[];
  /** 0 … 1: how steady their release is (a human's from games bowled, an AI's from its id). */
  skill: number;
}

/** A ball the engine rolled: what was asked, how it left the hand, what fell. */
export interface BowlRollLog {
  by: Id;
  /** The ball's number in the game (its seed). */
  n: number;
  frame: number;
  ball: number;
  input: BowlInput;
  launch: BowlLaunch;
  /** The pins standing as it was rolled, and the ones it knocked down. */
  standing: number[];
  knocked: number[];
  gutter: boolean;
  /** Played by the engine: a timed-out clock, or an AI bowler. */
  auto: 'timeout' | 'ai' | null;
  /** Seconds it took (the ball to the pit, the pins settled). */
  time: number;
}

export interface BowlingMatch {
  /** The lane fee each bowler pays the alley when the game starts. */
  fee: number;
  players: Record<Id, Bowler>;
  /** When the last ball's pins settle (the next bowler's clock starts then). */
  readyAt: number;
  balls: number;
  last: BowlRollLog | null;
}

/** One kick of a shootout. The details (kick on) are for shootout rooms. */
export interface Penalty {
  shooter: Id;
  /** The lane the kick went for (−1: no kick). */
  shot: number;
  /** The keeper's dive (−1: none). */
  keeper: number;
  goal: boolean;
  kick?: Kick;
  /** Where the ball crossed the goal line (m). */
  end?: { x: number; y: number };
  outcome?: KickOutcome;
  speed?: number;
  time?: number;
}

/** 8-ball pool: the frame's state beyond the balls. */
export interface PoolMatch {
  /** Each player's group, once the table is no longer open. */
  groups: Record<Id, PoolGroup>;
  /** Ball in hand for the player at the table: behind the head string, or anywhere. */
  inHand: 'kitchen' | 'table' | null;
  broken: boolean;
  shots: number;
  /** When the last shot's balls stop rolling (the next player's clock starts then). */
  readyAt: number;
  /** The last shot, so every client can replay it exactly. */
  last: PoolShotLog | null;
}
export type PoolCall =
  | 'break'
  | 'pot'
  | 'miss'
  | 'safe'
  | 'foul-scratch'
  | 'foul-no-hit'
  | 'foul-wrong-ball'
  | 'foul-no-rail'
  | 'timeout'
  | 'win'
  | 'lose-eight'
  | 'groups';
export interface PoolShotLog {
  by: Id;
  /** The shot's number in the frame. */
  n: number;
  call: PoolCall;
  /** The balls as the shot was struck (after ball in hand was placed). */
  before?: PoolBallState[];
  vx?: number;
  vy?: number;
  spin?: number;
  side?: number;
  /** Seconds the balls rolled. */
  time: number;
  pots: number[];
  /** The group the shooter took on this shot. */
  took?: PoolGroup;
}
type PoolBallState = Ball;

// ---------------------------------------------------------------- Golf with a friend

/** One player's round in a golf match. */
export interface GolfPlayer {
  /** Strokes per finished hole (a pick-up counts par + 3). */
  card: number[];
  ball: Pt2;
  lie: Lie;
  /** Strokes on the hole being played (penalties included). */
  strokes: number;
  /** Holed out (or picked up) on this hole. */
  done: boolean;
  /** 0 … 0.5: steadies the aim, as in a solo round (rounds played; an AI's from its seed). */
  skill: number;
}

/** One stroke the engine played out: what was asked and where the ball went. */
export interface GolfMatchShot {
  by: Id;
  hole: number;
  /** The stroke number on the hole before this one (its seed). */
  stroke: number;
  club: string;
  power: number;
  aim: number;
  /** Played by the engine: a timed-out shot clock, or an AI friend. */
  auto: 'timeout' | 'ai' | null;
  from: Pt2;
  land: Pt2;
  rest: Pt2;
  apex: number;
  curve: number;
  heading: number;
  carry: number;
  roll: number;
  lie: Lie;
  fromLie: Lie;
  penalty: boolean;
  holed: boolean;
  /** This shot ended the hole for them on par + 3 (picked up). */
  picked: boolean;
}

export interface GolfMatch {
  /** Who was asked to play (a member once they accept). */
  invite: Id;
  /** The first n holes of the city's course. */
  holes: number;
  pars: number[];
  /** The hole being played (0-based). */
  hole: number;
  /** The green fee each player pays the club when the match starts. */
  fee: number;
  /** When an invited AI friend answers (ms; 0 for a real player). */
  aiAcceptAt: number;
  players: Record<Id, GolfPlayer>;
  shots: GolfMatchShot[];
}

/** Time for each ball at bowling, from when the last one's pins settle. */
export const BOWL_MS = 45_000;
/** An AI bowler steps up this long after the pins settle. */
export const BOWL_AI_THINK = 2_500;
/** What the clock rolls for you when it runs out: a gentle ball down the middle. */
const BOWL_TIMEOUT: BowlInput = { x: 0, aim: 0, power: 0.25, spin: 0 };
/** A human bowler's steadiness from games bowled (the swipe is theirs; this is the release). */
export const bowlerSkill = (games: number) => Math.min(0.92, 0.8 + games * 0.01);
/** An AI bowler's steadiness, from its id (the same every game). */
export const bowlAiSkill = (aiId: Id) => 0.35 + (hashString(`bowl-skill:${aiId}`) % 46) / 100;

/** Time for each golf shot (snooker gives 45 s). */
export const GOLF_SHOT_MS = 60_000;
/** An AI friend says yes this long after the invite (on the next sync). */
export const GOLF_AI_ACCEPT_AFTER = 6_000;
/** An AI friend takes its shot this long into its turn (the last one plays out first). */
export const GOLF_AI_SHOT_AFTER = 4_000;
/** A timed-out shot clock plays a soft stroke for you at this power. */
export const GOLF_AUTO_POWER = 30;
/** A hole counts at most par + this (you pick up). */
export const GOLF_PICKUP_OVER = 3;
/** Stakes offered per player, as shares of a month's living costs (Lagos: ₦5k, ₦20k, ₦50k). */
const GOLF_STAKE_COL = [0.011, 0.044, 0.11];

/** A golfer's skill shown the golf way: a handicap (lower is better). */
export const golfHandicap = (skill: number) => Math.max(0, Math.round(36 - skill * 60));
/** An AI friend's skill, from its id (the same every match). */
export const golfAiSkill = (aiId: Id) => 0.1 + (hashString(`golf-skill:${aiId}`) % 36) / 100;
const skillFor = (w: World, id: Id) => {
  const p = w.players[id]!;
  return p.ai ? golfAiSkill(id) : skillOf(p.golf?.rounds ?? 0);
};
/** One significant figure in major units: ₦4,950 → ₦5,000. */
function niceStake(minor: number) {
  const major = minor / 100;
  if (major < 1) return 100;
  const e = 10 ** Math.floor(Math.log10(major));
  return Math.round(major / e) * e * 100;
}
/** The stake chips for this city: free, then small, medium and large (within the cap). */
export function golfStakes(m: ReturnType<typeof getMarket>) {
  const cap = m.data.costOfLiving * 100;
  return [0, ...GOLF_STAKE_COL.map((k) => Math.min(cap, niceStake(col(m) * k)))];
}
/** The venue a golf match is played at: the city's golf club (or the course itself). */
export const golfVenue = (m: ReturnType<typeof getMarket>) => golfClubOf(m)?.id ?? 'golf';
const golfGeo = (r: PlayRoom, hole: number) => holeGeo(golfCourse(r.market).holes[hole]!);
const golfer = (r: PlayRoom) => r.members[r.turn % Math.max(1, r.members.length)]?.id;
const CLUB_IDS = [...CLUBS.map((c) => c.id), PUTTER.id];
export const GOLF_CLUB_IDS = CLUB_IDS as readonly string[];
/** The pre-Wave 12 pool (kept so logged rooms replay with their questions). */
const QUIZ: QuizQuestion[] = [
  {
    text: 'Which planet is closest to the Sun?',
    options: ['Venus', 'Mercury', 'Mars', 'Earth'],
    answer: 1,
  },
  {
    text: 'What is the capital of Kenya?',
    options: ['Accra', 'Kigali', 'Nairobi', 'Lagos'],
    answer: 2,
  },
  {
    text: 'How many sides does a hexagon have?',
    options: ['Five', 'Six', 'Seven', 'Eight'],
    answer: 1,
  },
  {
    text: 'Which river runs through London?',
    options: ['Nile', 'Seine', 'Thames', 'Danube'],
    answer: 2,
  },
  {
    text: 'In football, how many players start on one team?',
    options: ['Nine', 'Ten', 'Eleven', 'Twelve'],
    answer: 2,
  },
  {
    text: 'What does a balance sheet show?',
    options: [
      'Only sales',
      'Assets, liabilities and equity',
      'Only cash payments',
      'Advertising reach',
    ],
    answer: 1,
  },
  {
    text: 'Which gas do plants absorb during photosynthesis?',
    options: ['Oxygen', 'Carbon dioxide', 'Helium', 'Hydrogen'],
    answer: 1,
  },
  {
    text: 'Who wrote Pride and Prejudice?',
    options: ['Jane Austen', 'Chinua Achebe', 'Mary Shelley', 'Charles Dickens'],
    answer: 0,
  },
  { text: 'What is 15% of 200?', options: ['15', '20', '25', '30'], answer: 3 },
  {
    text: 'Which country is home to Kigali?',
    options: ['Ghana', 'Rwanda', 'Kenya', 'Egypt'],
    answer: 1,
  },
  {
    text: 'What does revenue minus expenses give you?',
    options: ['Profit or loss', 'Market share', 'Headcount', 'Inventory'],
    answer: 0,
  },
  {
    text: 'How many points is the black ball worth in snooker?',
    options: ['Four', 'Five', 'Six', 'Seven'],
    answer: 3,
  },
  {
    text: 'Which ocean lies west of Africa?',
    options: ['Pacific', 'Indian', 'Atlantic', 'Arctic'],
    answer: 2,
  },
  { text: 'What is the square root of 144?', options: ['10', '11', '12', '14'], answer: 2 },
  {
    text: 'Which instrument has keys, pedals and strings?',
    options: ['Trumpet', 'Piano', 'Flute', 'Drum'],
    answer: 1,
  },
  {
    text: 'What is a mortgage secured against?',
    options: ['A property', 'A passport', 'A company name', 'A phone number'],
    answer: 0,
  },
  {
    text: 'Which is the largest continent by land area?',
    options: ['Africa', 'Europe', 'Asia', 'Australia'],
    answer: 2,
  },
  {
    text: 'What is an investor buying when they buy equity?',
    options: ['Ownership', 'A tax refund', 'A guaranteed salary', 'A licence'],
    answer: 0,
  },
  {
    text: 'In what unit is electrical resistance measured?',
    options: ['Watt', 'Volt', 'Ohm', 'Ampere'],
    answer: 2,
  },
  {
    text: 'Which city is known for the Golden Gate Bridge?',
    options: ['London', 'San Francisco', 'Dubai', 'Cairo'],
    answer: 1,
  },
];
const active = (r: PlayRoom) => r.status === 'waiting' || r.status === 'playing';

/**
 * A quiz from the bank, by a seeded shuffle (the same room id and time always
 * draw the same quiz): the categories take turns, so every quiz mixes general
 * knowledge, business and tech, sport, music, science, geography and the
 * game's own cities.
 */
export function drawQuiz(seed: string, n = QUIZ_LENGTH): QuizQuestion[] {
  const rng = createRng(hashString(`quiz:${seed}`));
  const byCat = new Map<QuizCategory, QuizQuestion[]>();
  for (const q of rng.shuffle(QUIZ_BANK)) {
    const list = byCat.get(q.cat) ?? [];
    list.push({
      text: q.text,
      options: [...q.options],
      answer: q.answer,
      fr: { text: q.fr.text, options: [...q.fr.options] },
      cat: q.cat,
    });
    byCat.set(q.cat, list);
  }
  const cats = rng.shuffle([...byCat.keys()]);
  const out: QuizQuestion[] = [];
  for (let i = 0; out.length < n && i < n * cats.length; i++) {
    const q = byCat.get(cats[i % cats.length]!)!.shift();
    if (q) out.push(q);
  }
  return out;
}

/** How an AI opponent answers: when (ms into the question) and what. Deterministic. */
export function aiAnswer(r: PlayRoom, aiId: Id, round: number) {
  const h = hashString(`${r.id}:${aiId}:${round}`);
  const skill = 52 + (hashString(aiId) % 30); // 52–81% right
  const q = r.questions[round];
  const right = h % 100 < skill;
  const wrong = q ? (q.answer + 1 + ((h >>> 8) % 3)) % 4 : 0;
  return { after: 3_000 + ((h >>> 12) % 11_000), choice: right ? (q?.answer ?? 0) : wrong };
}

/** AI players free to sit at this table (and pay its stake), most suitable first. */
function aiCandidates(w: World, r: PlayRoom) {
  const busy = new Set<Id>();
  for (const x of Object.values(w.playRooms ?? {}))
    if (active(x)) for (const m of x.members) busy.add(m.id);
  return Object.values(w.players)
    .filter((p) => {
      if (!p.ai || busy.has(p.id) || locationOf(p) !== r.market) return false;
      // Golf: the friend pays their own green fee as well.
      const fee = r.golf?.fee ?? r.bowling?.fee ?? 0;
      if (!r.stake && !fee) return true;
      const a = w.accounts[p.accounts.local];
      return !!a && a.currency === r.currency && a.balance >= r.stake * 4 + fee;
    })
    .sort((a, b) => hashString(`${r.id}:${a.id}`) - hashString(`${r.id}:${b.id}`));
}

/** Seat AI opponents and start the quiz (a host alone at the table). */
function fillWithAi(w: World, r: PlayRoom, now: number, count: number) {
  // Snooker and football are one against one: a single AI opponent.
  const seats =
    r.game === 'quiz'
      ? Math.max(1, Math.min(3, count, 8 - r.members.length))
      : r.game === 'bowling'
        ? Math.max(1, Math.min(3, count, 4 - r.members.length))
        : 1;
  const picks = aiCandidates(w, r).slice(0, seats);
  ensure(
    picks.length > 0,
    'play.ai',
    r.stake
      ? 'No AI opponent here can match that stake right now. Try a smaller stake or a free game.'
      : 'No AI opponents are free in this city right now.',
  );
  r.ai ??= [];
  for (const ai of picks) {
    if (r.stake)
      transfer(
        w,
        ai.accounts.local,
        r.escrow,
        r.stake,
        'Social game entry',
        getMarket(w, r.market).month,
        'move',
      );
    r.members.push({ id: ai.id, score: 0 });
    r.ai.push(ai.id);
  }
  r.status = 'playing';
  r.deadline = now + (r.game === 'snooker' ? SHOT_MS : QUESTION_MS);
  r.touchedAt = now;
  if (r.pool) r.pool.readyAt = now;
  r.last = `${picks.map((p) => p.name).join(', ')} joined the ${r.game === 'quiz' ? 'quiz' : 'game'}.`;
  if (r.bowling) startBowling(w, r, now);
}

const POCKETS: [number, number][] = [
  [0, 0],
  [60, 0],
  [120, 0],
  [0, 60],
  [60, 60],
  [120, 60],
];
/** How steady an AI player's cue is: an aim error (radians, one standard deviation). */
export const aiCueError = (aiId: Id) => 0.035 + (hashString(`cue:${aiId}`) % 25) / 1000;

/** Distance from point p to the segment a–b. */
function segDist(p: { x: number; y: number }, a: [number, number], b: [number, number]) {
  const dx = b[0] - a[0],
    dy = b[1] - a[1];
  const len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((p.x - a[0]) * dx + (p.y - a[1]) * dy) / len)) : 0;
  return Math.hypot(p.x - a[0] - t * dx, p.y - a[1] - t * dy);
}

/**
 * The AI's snooker shot: the easiest legal pot it can see (a ghost-ball aim at
 * a ball on, towards a pocket, avoiding blocked lines), struck with a
 * seeded, bounded aim error so it misses often enough to be beatable.
 */
export function aiShot(
  w: World,
  r: PlayRoom,
  aiId: Id,
  error = aiCueError(aiId),
): { angle: number; power: number } {
  const rng = deriveRng(w.seed, 'play-ai', r.id, r.round, aiId);
  const cue = r.balls[0]!;
  const colours = r.balls.filter((b) => b.value > 1 && !b.potted).map((b) => b.value);
  const on = r.balls.filter(
    (b) =>
      b.id !== 0 &&
      !b.potted &&
      (r.red ? b.value === 1 : r.colorFree ? b.value > 1 : b.value === Math.min(...colours)),
  );
  let best: { angle: number; power: number; score: number } | null = null;
  for (const b of on)
    for (const pocket of POCKETS) {
      const tx = pocket[0] - b.x,
        ty = pocket[1] - b.y,
        d2 = Math.hypot(tx, ty);
      if (d2 < 0.01) continue;
      const ux = tx / d2,
        uy = ty / d2;
      const ghost: [number, number] = [b.x - ux * 2.7, b.y - uy * 2.7];
      const ax = ghost[0] - cue.x,
        ay = ghost[1] - cue.y,
        d1 = Math.hypot(ax, ay);
      if (d1 < 0.5) continue;
      const cut = (ax * ux + ay * uy) / d1;
      if (cut < 0.25) continue;
      const others = r.balls.filter((o) => !o.potted && o.id !== 0 && o.id !== b.id);
      const blocked =
        others.some((o) => segDist(o, [cue.x, cue.y], ghost) < 2.7) ||
        others.some((o) => segDist(o, [b.x, b.y], pocket) < 2.7);
      const score = cut * 2 - (d1 + d2) / 120 - (blocked ? 3 : 0) + (r.red ? 0 : b.value / 20);
      const power = Math.min(100, Math.max(5, (0.9 * (d1 + (d2 + 10) / cut)) / 0.75));
      if (!best || score > best.score)
        best = { angle: Math.atan2(ay, ax), power: Math.round(power), score };
    }
  // Nothing pottable: roll the cue ball into the nearest ball on.
  if (!best) {
    const near = [...on].sort(
      (a, b) => Math.hypot(a.x - cue.x, a.y - cue.y) - Math.hypot(b.x - cue.x, b.y - cue.y),
    )[0];
    const angle = near ? Math.atan2(near.y - cue.y, near.x - cue.x) : rng.range(-Math.PI, Math.PI);
    best = { angle, power: 45, score: 0 };
  }
  let angle = best.angle + rng.normal(0, error);
  if (angle > Math.PI) angle -= 2 * Math.PI;
  if (angle < -Math.PI) angle += 2 * Math.PI;
  const power = Math.min(100, Math.max(5, Math.round(best.power * rng.range(0.9, 1.15))));
  return { angle, power };
}

/** The AI's penalty: a corner drawn from the room's seed, never from the other player's choice. */
export function aiPenalty(w: World, r: PlayRoom, aiId: Id) {
  const rng = deriveRng(w.seed, 'play-ai', r.id, r.round, aiId);
  return { lane: rng.int(0, 4), after: rng.int(1_500, 4_500) };
}

// ---------------------------------------------------------------- 8-ball pool

/** An AI player at pool thinks this long once the balls stop. */
export const POOL_AI_THINK = 2_500;
/** A frame that somehow runs this many shots is settled on balls potted. */
export const POOL_MAX_SHOTS = 200;
/** How steady an AI player's cue is at pool (radians, one standard deviation). */
export const poolAiError = (aiId: Id) => 0.0025 + (hashString(`pool-cue:${aiId}`) % 9) / 1000;
/** An AI keeper's knack for reading a kick (0 … 0.29), from its id. */
export const keeperSkill = (aiId: Id) => (hashString(`keeper:${aiId}`) % 30) / 100;

const other = (r: PlayRoom, id: Id) => r.members.find((m) => m.id !== id)?.id ?? id;
const atTable = (r: PlayRoom) => r.members[r.turn % Math.max(1, r.members.length)]!.id;

/** The balls a player may hit first: their group, the 8 once it's cleared, any (not the 8) while open. */
export function poolTargets(r: PlayRoom, id: Id): number[] {
  const pm = r.pool!;
  const up = r.balls.filter((b) => !b.potted && b.id !== 0);
  if (!pm.broken) return up.map((b) => b.id);
  const g = pm.groups[id];
  const open = up.filter((b) => b.id !== 8);
  if (!g) return open.length ? open.map((b) => b.id) : [8];
  const own = up.filter((b) => inGroup(b.id, g));
  return own.length ? own.map((b) => b.id) : [8];
}

function poolScores(r: PlayRoom) {
  for (const m of r.members) {
    const g = r.pool!.groups[m.id];
    m.score = g ? r.balls.filter((b) => b.potted && inGroup(b.id, g)).length : 0;
  }
}

function poolFinish(w: World, r: PlayRoom, winner: Id, text: string) {
  poolScores(r);
  for (const m of r.members) m.score = m.id === winner ? 8 : Math.min(7, m.score);
  r.last = text;
  payOut(w, r, false);
}

const nameOf = (w: World, id: Id) => w.players[id]?.name ?? 'Player';

/**
 * One pool shot, played out and refereed (WPA-style 8-ball, simplified): the
 * break (balls potted keep the table, a scratch gives ball in hand, the 8 on
 * the break is spotted), the open table (the first ball potted after the
 * break gives the shooter that group), fouls (no contact, the wrong ball
 * first, no cushion after contact, a scratch) give the opponent ball in hand
 * anywhere, and the 8: pot it last and cleanly to win; early or with a foul
 * it loses the frame.
 */
function poolShot(
  w: World,
  r: PlayRoom,
  by: Id,
  s: { angle: number; power: number; spin?: number; side?: number; cueX?: number; cueY?: number },
  now: number,
) {
  const pm = r.pool!;
  const opp = other(r, by);
  const targets = poolTargets(r, by);
  const onEight = pm.broken && !!pm.groups[by] && targets.length === 1 && targets[0] === 8;
  if (pm.inHand && s.cueX !== undefined && s.cueY !== undefined) {
    const [x, y] = freeSpot(r.balls, 0, s.cueX, s.cueY, pm.inHand === 'kitchen');
    r.balls = r.balls.map((b) => (b.id === 0 ? { ...b, x, y, potted: false } : b));
  }
  const spin = Math.max(-1, Math.min(1, s.spin ?? 0)),
    side = Math.max(-1, Math.min(1, s.side ?? 0));
  const speed = poolSpeed(s.power);
  const vx = Math.cos(s.angle) * speed,
    vy = Math.sin(s.angle) * speed;
  const before = r.balls.map((b) => ({ ...b }));
  const sim = simulatePool(before, vx, vy, spin, side);
  r.balls = sim.balls.map((b) => ({ ...b }));
  r.frames = [];
  const breakShot = !pm.broken;
  pm.broken = true;
  pm.shots++;
  r.round++;
  pm.readyAt = now + Math.ceil(sim.time * 1000);
  r.deadline = pm.readyAt + SHOT_MS;
  const scratch = sim.pots.includes(0);
  const objPots = sim.pots.filter((id) => id !== 0);
  let call: PoolCall = 'miss';
  if (scratch) call = 'foul-scratch';
  else if (sim.first < 0) call = 'foul-no-hit';
  else if (!breakShot && !targets.includes(sim.first)) call = 'foul-wrong-ball';
  else if (!breakShot && objPots.length === 0 && !sim.rail) call = 'foul-no-rail';
  const foul = call.startsWith('foul');
  const log: PoolShotLog = {
    by,
    n: pm.shots,
    call,
    before,
    vx,
    vy,
    spin,
    side,
    time: sim.time,
    pots: sim.pots,
  };
  pm.last = log;
  if (objPots.includes(8)) {
    if (!breakShot) {
      const won = onEight && !foul;
      log.call = won ? 'win' : 'lose-eight';
      return poolFinish(
        w,
        r,
        won ? by : opp,
        won
          ? `${nameOf(w, by)} pots the 8 and wins the frame.`
          : `${nameOf(w, by)} pots the 8 ${foul ? 'with a foul' : 'too early'} and loses the frame.`,
      );
    }
    // The 8 on the break comes back to the foot spot.
    const [x, y] = freeSpot(r.balls, 8, POOL_FOOT[0], POOL_FOOT[1]);
    r.balls = r.balls.map((b) => (b.id === 8 ? { ...b, x, y, potted: false } : b));
  }
  if (scratch) {
    const [x, y] = freeSpot(r.balls, 0, POOL_HEAD[0], POOL_HEAD[1]);
    r.balls = r.balls.map((b) => (b.id === 0 ? { ...b, x, y, potted: false } : b));
  }
  // The open table: the first group ball potted (cleanly, after the break) decides.
  if (!foul && !breakShot && !pm.groups[by]) {
    const g = objPots.map(groupOf).find((x): x is PoolGroup => !!x);
    if (g) {
      pm.groups[by] = g;
      pm.groups[opp] = g === 'solids' ? 'stripes' : 'solids';
      log.took = g;
    }
  }
  const g = pm.groups[by];
  const scored =
    !foul && objPots.some((id) => id !== 8 && (breakShot || !g ? true : inGroup(id, g)));
  poolScores(r);
  if (foul) {
    r.turn++;
    pm.inHand = 'table';
    r.last = `Foul by ${nameOf(w, by)}: ${nameOf(w, opp)} has ball in hand.`;
  } else if (scored) {
    pm.inHand = null;
    log.call = breakShot ? 'break' : log.took ? 'groups' : 'pot';
    r.last = log.took
      ? `${nameOf(w, by)} takes the ${log.took} and plays on.`
      : `${nameOf(w, by)} pots and plays on.`;
  } else {
    pm.inHand = null;
    r.turn++;
    log.call = breakShot ? 'break' : objPots.length ? 'safe' : 'miss';
    r.last = `${nameOf(w, opp)} to the table.`;
  }
  if (pm.shots >= POOL_MAX_SHOTS) {
    r.last = 'The frame went the distance: decided on balls potted.';
    payOut(w, r, false);
  }
}

/** The shot clock ran out: the turn passes, with ball in hand. */
function poolTimeout(w: World, r: PlayRoom, now: number) {
  const pm = r.pool!;
  const by = atTable(r);
  r.turn++;
  r.round++;
  pm.shots++;
  pm.inHand = pm.broken ? 'table' : 'kitchen';
  pm.readyAt = now;
  pm.last = { by, n: pm.shots, call: 'timeout', time: 0, pots: [] };
  r.deadline = now + SHOT_MS;
  r.last = `${nameOf(w, by)} ran out of time: ball in hand.`;
  if (pm.shots >= POOL_MAX_SHOTS) payOut(w, r, false);
}

/** The AI's pool shot: a planned pot (or safety), struck with a seeded wobble. */
export function aiPoolShot(w: World, r: PlayRoom, aiId: Id, error = poolAiError(aiId)) {
  const pm = r.pool!;
  const plan = poolPlan(r.balls, poolTargets(r, aiId), pm.inHand, !pm.broken);
  const rng = deriveRng(w.seed, 'pool-ai', r.id, r.round, aiId);
  let angle = plan.angle + rng.normal(0, pm.broken ? error : error * 2);
  if (angle > Math.PI) angle -= 2 * Math.PI;
  if (angle < -Math.PI) angle += 2 * Math.PI;
  const power = Math.min(100, Math.max(5, Math.round(plan.power * rng.range(0.95, 1.06))));
  return {
    angle,
    power,
    spin: plan.spin,
    side: plan.side,
    ...(plan.cue ? { cueX: plan.cue.x, cueY: plan.cue.y } : {}),
  };
}

// ---------------------------------------------------------------- The shootout

/** A lane pick from an older client, as a kick: the middle of that part of the goal. */
function laneKick(lane: number): Kick {
  const [x, y] = [
    [-2.6, 1.7],
    [2.6, 1.7],
    [0, 1.2],
    [-2.6, 0.4],
    [2.6, 0.4],
  ][lane] ?? [0, 1.2];
  return { x: x!, y: y!, power: 0.65, curve: 0 };
}

const KICK_TEXT: Record<KickOutcome, string> = {
  goal: 'GOAL!',
  'post-in': 'GOAL! In off the post.',
  'bar-in': 'GOAL! In off the bar.',
  saved: 'Saved by the goalkeeper!',
  post: 'Off the post!',
  bar: 'Off the crossbar!',
  wide: 'Wide of the post.',
  over: 'Over the bar.',
  none: 'Shot timed out.',
};

/** Play this round's kick out and see whether the shootout is over. */
function shootoutKick(w: World, r: PlayRoom, now: number) {
  const shooter = r.members[r.round % r.members.length]!;
  const keeper = r.members[(r.round + 1) % r.members.length]!;
  const lane = r.moves[shooter.id];
  const kick = r.kicks?.[shooter.id] ?? (lane !== undefined ? laneKick(lane) : null);
  const dive = r.moves[keeper.id] ?? 2;
  const res = resolveKick(deriveRng(w.seed, 'shootout', r.id, r.round), kick, dive);
  if (res.goal) shooter.score++;
  r.penalties.push({
    shooter: shooter.id,
    shot: kick ? laneOf(kick.x, kick.y) : -1,
    keeper: dive,
    goal: res.goal,
    ...(kick ? { kick } : {}),
    end: { x: res.x, y: res.y },
    outcome: res.outcome,
    speed: res.speed,
    time: res.time,
  });
  r.last = KICK_TEXT[res.outcome];
  r.moves = {};
  r.kicks = {};
  r.round++;
  r.deadline = now + PENALTY_MS;
  if (shootoutOver(r.penalties.map((p) => p.goal))) payOut(w, r, false);
}

/**
 * Snooker and football against AI: the AI locks in its penalty once its
 * thinking time is up (or as soon as every human has), and takes its snooker
 * shot once the last shot has played out.
 */
function aiMoves(w: World, r: PlayRoom, now: number) {
  if (r.status !== 'playing' || !r.ai?.length) return;
  if (r.game === 'football' && r.rules === 'shootout') {
    // The AI takes its kick after a moment; in goal it reads the kick as it comes.
    const start = r.deadline - PENALTY_MS;
    const shooter = r.members[r.round % r.members.length]!.id;
    for (const id of r.ai) {
      if (r.moves[id] !== undefined) continue;
      const rng = deriveRng(w.seed, 'play-ai', r.id, r.round, id);
      if (id === shooter) {
        const keeperIn = r.members.some((m) => m.id !== id && r.moves[m.id] !== undefined);
        if (!keeperIn && now < start + aiPenalty(w, r, id).after) continue;
        const k = aiKick(rng, keeperSkill(id));
        (r.kicks ??= {})[id] = k;
        r.moves[id] = laneOf(k.x, k.y);
      } else if (r.moves[shooter] !== undefined) {
        r.moves[id] = aiDive(rng, r.kicks?.[shooter] ?? null, keeperSkill(id));
      }
    }
  } else if (r.game === 'football') {
    const start = r.deadline - PENALTY_MS;
    const humansDone = r.members.every((m) => r.ai!.includes(m.id) || r.moves[m.id] !== undefined);
    for (const id of r.ai) {
      if (r.moves[id] !== undefined) continue;
      const a = aiPenalty(w, r, id);
      if (humansDone || now >= start + a.after) r.moves[id] = a.lane;
    }
  } else if (r.game === 'snooker' && r.pool) {
    const turn = atTable(r);
    if (!r.ai.includes(turn) || now < r.pool.readyAt + POOL_AI_THINK) return;
    poolShot(w, r, turn, aiPoolShot(w, r, turn), now);
    r.touchedAt = now;
  } else if (r.game === 'snooker') {
    const turn = r.members[r.turn % r.members.length]!.id;
    if (!r.ai.includes(turn) || now < r.deadline - SHOT_MS + AI_SHOT_AFTER) return;
    const s = aiShot(w, r, turn);
    shot(r, s.angle, s.power);
    r.deadline = now + SHOT_MS;
    r.touchedAt = now;
  }
}

/** AI opponents answer once their thinking time has passed. */
function aiAnswers(r: PlayRoom, now: number) {
  if (r.game !== 'quiz' || r.status !== 'playing' || !r.ai?.length) return;
  const start = r.deadline - QUESTION_MS;
  for (const id of r.ai) {
    if (r.answers[id] !== undefined) continue;
    const a = aiAnswer(r, id, r.round);
    if (now >= start + a.after) r.answers[id] = a.choice;
  }
}

/** When the next AI answer is due (null: none waiting). */
function aiDueAt(w: World, r: PlayRoom): number | null {
  if (r.bowling) {
    if (r.status !== 'playing' || !r.ai?.includes(bowlerOf(r) ?? '')) return null;
    return r.bowling.readyAt + BOWL_AI_THINK;
  }
  if (r.game === 'golf' && r.golf) {
    if (r.status === 'waiting') return r.golf.aiAcceptAt || null;
    if (r.status !== 'playing' || !r.ai?.includes(golfer(r) ?? '')) return null;
    return r.deadline - GOLF_SHOT_MS + GOLF_AI_SHOT_AFTER;
  }
  if (r.status !== 'playing' || !r.ai?.length) return null;
  if (r.game === 'snooker' && r.pool)
    return r.ai.includes(atTable(r)) ? r.pool.readyAt + POOL_AI_THINK : null;
  if (r.game === 'football' && r.rules === 'shootout') {
    const shooter = r.members[r.round % r.members.length]!.id;
    return r.ai.includes(shooter) && r.moves[shooter] === undefined
      ? r.deadline - PENALTY_MS + aiPenalty(w, r, shooter).after
      : null;
  }
  if (r.game === 'snooker')
    return r.ai.includes(r.members[r.turn % r.members.length]!.id)
      ? r.deadline - SHOT_MS + AI_SHOT_AFTER
      : null;
  if (r.game === 'football') {
    let due: number | null = null;
    for (const id of r.ai)
      if (r.moves[id] === undefined) {
        const t = r.deadline - PENALTY_MS + aiPenalty(w, r, id).after;
        due = due === null ? t : Math.min(due, t);
      }
    return due;
  }
  const start = r.deadline - QUESTION_MS;
  let due: number | null = null;
  for (const id of r.ai)
    if (r.answers[id] === undefined) {
      const t = start + aiAnswer(r, id, r.round).after;
      due = due === null ? t : Math.min(due, t);
    }
  return due;
}
export function canVisitHome(w: World, p: Player, host: string) {
  const h = w.players[host];
  return (
    !!h &&
    locationOf(p) === h.market &&
    (p.id === host ||
      Object.values(w.visits ?? {}).some(
        (v) =>
          v.hostId === host &&
          v.guestId === p.id &&
          v.status === 'accepted' &&
          v.month === getMarket(w, h.market).month,
      ))
  );
}
function access(w: World, p: Player, r: PlayRoom) {
  ensure(locationOf(p) === r.market, 'play.city', 'Travel to this city first.');
  if (r.venue.startsWith('home:'))
    ensure(
      canVisitHome(w, p, r.venue.slice(5)),
      'play.invite',
      'Accept an invitation to this home first.',
    );
}
function payOut(w: World, r: PlayRoom, refund: boolean) {
  if (!active(r)) return;
  // Golf: the lowest total wins. Every other game: the highest score.
  const scores = r.members.map((m) => m.score);
  const max = r.game === 'golf' ? Math.min(...scores) : Math.max(...scores);
  r.winners = refund ? [] : r.members.filter((m) => m.score === max).map((m) => m.id);
  // A tied competition returns every entry; a sole winner receives the whole pot.
  const recipients = !refund && r.winners.length === 1 ? r.winners : r.members.map((m) => m.id);
  const pot = account(w, r.escrow).balance;
  recipients.forEach((id, i) =>
    transfer(
      w,
      r.escrow,
      w.players[id]!.accounts.local,
      Math.floor(pot / recipients.length) + (i < pot % recipients.length ? 1 : 0),
      refund ? 'Game entry refunded' : 'Social game winnings',
      getMarket(w, r.market).month,
      'move',
    ),
  );
  r.status = refund ? 'cancelled' : 'finished';
  if (!refund)
    r.last += r.winners.length > 1 ? ' Tied game: all stakes refunded.' : ' Winner takes the pot.';
}
/** Timeout cleanup runs inside commands, so refunds are logged and replay safely. */
export function expirePlay(w: World, now: number) {
  for (const r of Object.values(w.playRooms ?? {})) {
    if (active(r) && now - r.touchedAt > 30 * 60_000) {
      r.last = 'Room expired. Entries refunded.';
      payOut(w, r, true);
    }
  }
}
function rack(): Ball[] {
  const balls: Ball[] = [{ id: 0, x: 24, y: 30, value: 0, potted: false }];
  for (let row = 0; row < 5; row++)
    for (let col = 0; col <= row; col++)
      balls.push({
        id: balls.length,
        x: 77 + row * 2.45,
        y: 30 + (col - row / 2) * 2.85,
        value: 1,
        potted: false,
      });
  for (const [value, x, y] of [
    [2, 25, 44],
    [3, 25, 16],
    [4, 25, 30],
    [5, 60, 30],
    [6, 72, 30],
    [7, 102, 30],
  ])
    balls.push({ id: balls.length, value: value!, x: x!, y: y!, potted: false });
  return balls;
}
const spots: Record<number, [number, number]> = {
  2: [25, 44],
  3: [25, 16],
  4: [25, 30],
  5: [60, 30],
  6: [72, 30],
  7: [102, 30],
};
function respot(b: Ball, balls: Ball[]) {
  const spot = spots[b.value] ?? [24, 30];
  b.x = spot[0];
  b.y = spot[1];
  b.potted = false;
  for (
    let i = 0;
    i < 40 &&
    balls.some((o) => o.id !== b.id && !o.potted && Math.hypot(o.x - b.x, o.y - b.y) < 2.8);
    i++
  )
    b.x += 2.8;
  b.x = Math.min(117, b.x);
}
function shot(r: PlayRoom, angle: number, power: number) {
  const balls = r.balls,
    vel = balls.map(() => ({ x: 0, y: 0 }));
  vel[0] = { x: Math.cos(angle) * power * 0.75, y: Math.sin(angle) * power * 0.75 };
  let first = -1;
  const pots: Ball[] = [];
  const frames: Ball[][] = [];
  for (let t = 0; t < 720; t++) {
    for (let i = 0; i < balls.length; i++) {
      const b = balls[i]!,
        v = vel[i]!;
      if (b.potted) continue;
      b.x += v.x / 60;
      b.y += v.y / 60;
      v.x *= 0.985;
      v.y *= 0.985;
      if (
        [
          [0, 0],
          [60, 0],
          [120, 0],
          [0, 60],
          [60, 60],
          [120, 60],
        ].some(([x, y]) => Math.hypot(b.x - x!, b.y - y!) < 3.1)
      ) {
        b.potted = true;
        v.x = 0;
        v.y = 0;
        pots.push(b);
        continue;
      }
      if (b.x < 1.35 || b.x > 118.65) {
        b.x = Math.max(1.35, Math.min(118.65, b.x));
        v.x *= -0.85;
      }
      if (b.y < 1.35 || b.y > 58.65) {
        b.y = Math.max(1.35, Math.min(58.65, b.y));
        v.y *= -0.85;
      }
    }
    for (let i = 0; i < balls.length; i++)
      for (let j = i + 1; j < balls.length; j++) {
        const a = balls[i]!,
          b = balls[j]!;
        if (a.potted || b.potted) continue;
        const dx = b.x - a.x,
          dy = b.y - a.y,
          d = Math.hypot(dx, dy);
        if (d >= 2.7 || d === 0) continue;
        const nx = dx / d,
          ny = dy / d,
          av = vel[i]!,
          bv = vel[j]!;
        const impulse = (av.x - bv.x) * nx + (av.y - bv.y) * ny;
        if (impulse > 0) {
          av.x -= impulse * nx;
          av.y -= impulse * ny;
          bv.x += impulse * nx;
          bv.y += impulse * ny;
          if (i === 0 && first < 0) first = b.value;
        }
        a.x -= (nx * (2.7 - d)) / 2;
        a.y -= (ny * (2.7 - d)) / 2;
        b.x += (nx * (2.7 - d)) / 2;
        b.y += (ny * (2.7 - d)) / 2;
      }
    if (t % 24 === 0) frames.push(balls.map((b) => ({ ...b })));
    if (t > 10 && vel.every((v) => Math.hypot(v.x, v.y) < 0.35)) break;
  }
  r.frames = frames;
  const reds = balls.some((b) => b.value === 1 && !b.potted);
  const remaining = balls.filter((b) => b.value > 1 && !b.potted).map((b) => b.value);
  const target = r.red
    ? 1
    : r.colorFree
      ? 0
      : Math.min(...remaining, ...pots.filter((b) => b.value > 1).map((b) => b.value));
  const legal = (v: number) => (r.red ? v === 1 : target === 0 ? v > 1 : v === target);
  const foul =
    first < 0 || !legal(first) || pots.some((b) => !legal(b.value)) || (!r.red && pots.length > 1);
  let points = 0;
  if (foul) {
    const penalty = Math.max(4, first, target > 0 ? target : 0, ...pots.map((b) => b.value));
    r.members[(r.turn + 1) % r.members.length]!.score += penalty;
    r.last = `Foul. Opponent receives ${penalty} points.`;
  } else {
    points = pots.reduce((n, b) => n + b.value, 0);
    r.members[r.turn % r.members.length]!.score += points;
    r.last = points ? `${points} points potted.` : 'No pot. Next player.';
  }
  if (reds || r.red || r.colorFree) for (const b of pots) if (b.value > 1) respot(b, balls);
  if (balls[0]!.potted) respot(balls[0]!, balls);
  if (!foul && points > 0) {
    r.colorFree = r.red;
    r.red = r.red ? false : reds;
  } else {
    r.turn++;
    r.red = reds;
    r.colorFree = false;
  }
  r.round++;
}
function advance(w: World, r: PlayRoom, now: number) {
  if (r.status !== 'playing') return;
  if (r.game === 'golf') return golfClock(w, r, now);
  if (r.bowling) return bowlingClock(w, r, now);
  aiAnswers(r, now);
  aiMoves(w, r, now);
  if (
    r.game === 'quiz' &&
    (r.members.every((m) => r.answers[m.id] !== undefined) || now >= r.deadline)
  ) {
    const q = r.questions[r.round]!;
    for (const m of r.members) if (r.answers[m.id] === q.answer) m.score += 10;
    r.last = `${q.text} Answer: ${q.options[q.answer]}.`;
    r.round++;
    r.answers = {};
    r.deadline = now + QUESTION_MS;
    if (r.round >= r.questions.length) payOut(w, r, false);
    else aiAnswers(r, now);
  } else if (
    r.game === 'football' &&
    r.rules === 'shootout' &&
    (r.members.every((m) => r.moves[m.id] !== undefined) || now >= r.deadline)
  ) {
    shootoutKick(w, r, now);
  } else if (
    r.game === 'football' &&
    r.rules !== 'shootout' &&
    (r.members.every((m) => r.moves[m.id] !== undefined) || now >= r.deadline)
  ) {
    const shooter = r.members[r.round % r.members.length]!;
    const keeper = r.members[(r.round + 1) % r.members.length]!;
    const s = r.moves[shooter.id] ?? -1,
      k = r.moves[keeper.id] ?? -1;
    const goal = s >= 0 && s !== k;
    if (goal) shooter.score++;
    r.penalties.push({ shooter: shooter.id, shot: s, keeper: k, goal });
    r.last = s < 0 ? 'Shot timed out.' : goal ? 'GOAL!' : 'Saved by the goalkeeper!';
    r.moves = {};
    r.round++;
    r.deadline = now + 20_000;
    if (
      r.round >= 10 &&
      r.round % 2 === 0 &&
      (r.members[0]!.score !== r.members[1]!.score || r.round >= 20)
    )
      payOut(w, r, false);
  } else if (r.game === 'snooker' && r.pool) {
    if (now >= r.deadline) poolTimeout(w, r, now);
  } else if (r.game === 'snooker' && now >= r.deadline) {
    r.turn++;
    r.round++;
    r.deadline = now + 45_000;
    r.last = 'Turn timed out. Next player.';
    r.red = r.balls.some((b) => b.value === 1 && !b.potted);
    r.colorFree = false;
  }
  if (r.game === 'snooker' && !r.pool && (r.round >= 60 || r.balls.slice(1).every((b) => b.potted)))
    payOut(w, r, false);
}
function createRoom(
  w: World,
  p: Player,
  cmd: Extract<Command, { type: 'play.create' }>,
  now: number,
): PlayRoom {
  const rooms = (w.playRooms ??= {});
  ensure(
    Object.values(rooms).filter((r) => active(r) && r.host === p.id).length === 0,
    'play.host',
    'Finish or cancel your current room first.',
  );
  const market = locationOf(p),
    m = getMarket(w, market),
    venue = cmd.venue;
  if (venue.startsWith('home:'))
    ensure(venue === `home:${p.id}` && market === p.market, 'play.home', 'Host at your own home.');
  else if (cmd.game === 'golf')
    ensure(venue === golfVenue(m), 'play.venue', 'Golf is played at the city’s golf club.');
  else if (cmd.game === 'bowling') {
    // More games: bowling is played at a bowling alley (worlds with the note only).
    ensure(moreGamesOn(w), 'play.game', 'Bowling isn’t open yet.');
    const b = m.businesses?.[venue];
    ensure(
      b && isOpen(b) && b.kind === 'bowling-alley',
      'play.venue',
      'Bowling is played at a bowling alley.',
    );
  } else ensure(!!m.businesses?.[venue], 'play.venue', 'Choose a venue in your current city.');
  ensure(
    cmd.stake <= m.data.costOfLiving * 100,
    'play.stake',
    'The maximum stake is one month of living costs.',
  );
  const id = newId(w, 'play');
  // Before Wave 12 a host could write the questions (and then could not play).
  const legacy = !autoQuiz(w);
  const custom = legacy && !!cmd.questions?.length;
  let questions: QuizQuestion[];
  if (custom) questions = cmd.questions!;
  else if (legacy) {
    const pool = [...QUIZ];
    let seed = (w.nextId * 2654435761) >>> 0;
    for (let i = pool.length - 1; i > 0; i--) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const j = seed % (i + 1);
      [pool[i], pool[j]] = [pool[j]!, pool[i]!];
    }
    questions = pool.slice(0, 8);
  } else questions = drawQuiz(`${w.seed}:${id}:${now}`);
  const r: PlayRoom = {
    id,
    host: p.id,
    market,
    venue,
    title: cmd.title,
    game: cmd.game,
    status: 'waiting',
    createdAt: now,
    touchedAt: now,
    deadline: 0,
    currency: m.data.currency,
    stake: cmd.stake,
    escrow: openAccount(w, { currency: m.data.currency, market, label: 'Social game pot' }),
    members: [],
    winners: [],
    round: 0,
    turn: 0,
    custom,
    questions,
    answers: {},
    last: '',
    balls: cmd.game === 'snooker' ? rack() : [],
    red: true,
    colorFree: false,
    frames: [],
    moves: {},
    penalties: [],
  };
  // The investor-career release plays real 8-ball pool and a real shootout
  // (rooms made before it replay with the old rules).
  if (investorOn(w) && r.game === 'snooker') {
    r.rules = 'pool8';
    r.balls = poolRack(deriveRng(w.seed, 'pool-rack', id));
    r.pool = { groups: {}, inHand: 'kitchen', broken: false, shots: 0, readyAt: 0, last: null };
  } else if (investorOn(w) && r.game === 'football') {
    r.rules = 'shootout';
    r.kicks = {};
  }
  ensure(
    !r.custom || r.game === 'quiz',
    'play.questions',
    'Custom questions are only for quizzes.',
  );
  if (r.game === 'golf') inviteToGolf(w, p, r, cmd, now);
  if (r.game === 'bowling') {
    const b = m.businesses![venue]!;
    const it = specOf(b).venue?.items.find((x) => x.id === BOWLING.item);
    r.bowling = {
      fee: it ? venuePrice(w, m, b, it) : 0,
      players: {},
      readyAt: 0,
      balls: 0,
      last: null,
    };
  }
  rooms[id] = r;
  // A custom quiz author (old rooms) is the non-playing quizmaster: they knew the answers.
  if (!r.custom) join(w, p, r);
  return r;
}

export function playCommand(
  w: World,
  p: Player,
  cmd: Extract<Command, { type: `play.${string}` }>,
  now: number,
) {
  const rooms = (w.playRooms ??= {});
  if (cmd.type === 'play.create') return { id: createRoom(w, p, cmd, now).id };
  if (cmd.type === 'play.match') {
    // Quick play: the next waiting quiz at this venue with the same stake, or a new one.
    const market = locationOf(p);
    const open = Object.values(rooms)
      .filter(
        (r) =>
          r.status === 'waiting' &&
          r.game === 'quiz' &&
          r.market === market &&
          r.venue === cmd.venue &&
          r.stake === cmd.stake &&
          !r.custom &&
          r.members.length < 8 &&
          !r.members.some((m) => m.id === p.id),
      )
      .sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : 1));
    for (const r of open) {
      try {
        access(w, p, r);
      } catch {
        continue;
      }
      join(w, p, r);
      r.touchedAt = now;
      return { id: r.id, joined: true };
    }
    const r = createRoom(
      w,
      p,
      {
        type: 'play.create',
        game: 'quiz',
        venue: cmd.venue,
        title: 'Quiz night',
        stake: cmd.stake,
      },
      now,
    );
    return { id: r.id, joined: false };
  }
  const r = rooms[cmd.roomId];
  ensure(r, 'play.missing', 'This game room no longer exists.');
  access(w, p, r);
  if (cmd.type === 'play.join') {
    join(w, p, r);
    // Golf: the invited friend's yes starts the match.
    if (r.golf && r.members.length === 2) startGolf(w, r, now);
    return { id: r.id };
  }
  if (cmd.type === 'play.decline') {
    ensure(
      r.golf?.invite === p.id && r.status === 'waiting',
      'play.invite',
      'There’s no invitation to answer here.',
    );
    r.last = `${p.name} can’t play this time. Your stake is back.`;
    payOut(w, r, true);
    notify(w, r.host, {
      month: getMarket(w, r.market).month,
      kind: 'system',
      text: `${p.name} declined your golf match. Your ${formatMoney(r.stake, r.currency)} stake is back.`,
    });
    return { ok: true };
  }
  if (cmd.type === 'play.cancel') {
    ensure(
      r.host === p.id && r.status === 'waiting',
      'play.cancel',
      'Only the host can cancel an unstarted game.',
    );
    payOut(w, r, true);
    return { ok: true };
  }
  if (cmd.type === 'play.leave') {
    ensure(r.status === 'waiting', 'play.started', 'A started game must be finished.');
    // Golf: the host leaving a waiting match calls it off (the invitation goes with it).
    if (r.golf) {
      ensure(r.host === p.id, 'play.member', 'You are not in this game.');
      r.last = 'Match called off. Stake refunded.';
      payOut(w, r, true);
      return { ok: true };
    }
    const member = r.members.find((m) => m.id === p.id);
    ensure(member, 'play.member', 'You are not in this game.');
    transfer(
      w,
      r.escrow,
      p.accounts.local,
      r.stake,
      'Game entry refunded',
      getMarket(w, r.market).month,
      'move',
    );
    r.members = r.members.filter((m) => m.id !== p.id);
    return { ok: true };
  }
  if (cmd.type === 'play.start') {
    ensure(!r.golf, 'play.golf', 'A golf match starts when your friend accepts.');
    ensure(
      r.host === p.id && r.status === 'waiting',
      'play.host',
      'Only the host can start this room.',
    );
    ensure(
      r.members.length >= ((r.game === 'quiz' || r.game === 'bowling') && r.stake === 0 ? 1 : 2),
      'play.players',
      'Wait for another player.',
    );
    // Bowling: the lane fees, the first bowler up.
    if (r.bowling) {
      startBowling(w, r, now);
      return { ok: true };
    }
    r.status = 'playing';
    r.deadline = now + (r.game === 'snooker' ? 45_000 : 20_000);
    r.touchedAt = now;
    if (r.pool) r.pool.readyAt = now;
    return { ok: true };
  }
  ensure(
    r.members.some((m) => m.id === p.id) || r.host === p.id,
    'play.member',
    'Join this game first.',
  );
  if (cmd.type === 'play.sync') {
    if (r.golf && r.status === 'waiting' && r.golf.aiAcceptAt && now >= r.golf.aiAcceptAt)
      aiAcceptsGolf(w, r, now);
    // A host alone at a quiz long enough is matched with AI opponents.
    if (
      autoQuiz(w) &&
      r.status === 'waiting' &&
      r.game === 'quiz' &&
      !r.custom &&
      r.members.length === 1 &&
      now - r.createdAt >= QUIZ_AI_AFTER &&
      aiCandidates(w, r).length > 0
    )
      fillWithAi(w, r, now, 2);
    advance(w, r, now);
    return { ok: true };
  }
  if (cmd.type === 'play.ai') {
    ensure(!r.golf, 'play.golf', 'Invite an AI friend to golf by name.');
    // Snooker and football (new): the host alone at the table plays one AI opponent.
    ensure(
      r.host === p.id &&
        r.status === 'waiting' &&
        !r.custom &&
        (r.game === 'quiz' || (r.members.length === 1 && r.members[0]!.id === p.id)),
      'play.host',
      r.game === 'quiz'
        ? 'Only the host of a waiting quiz can call in AI opponents.'
        : 'Only the host, alone at a waiting table, can play an AI opponent.',
    );
    fillWithAi(w, r, now, cmd.count ?? (r.game === 'bowling' ? 1 : 2));
    return { ok: true };
  }
  ensure(r.status === 'playing', 'play.status', 'This game is not in progress.');
  ensure(
    r.members.some((m) => m.id === p.id),
    'play.member',
    'Quizmasters cannot play their own custom quiz.',
  );
  // Late submissions never become answers to the next question/turn.
  if (now >= r.deadline) {
    advance(w, r, now);
    return { late: true };
  }
  ensure(cmd.round === r.round, 'play.round', 'The game has moved to the next turn.');
  r.touchedAt = now;
  if (cmd.type === 'play.answer') {
    ensure(
      r.game === 'quiz' && r.answers[p.id] === undefined,
      'play.answer',
      'You already answered this question.',
    );
    r.answers[p.id] = cmd.choice;
    advance(w, r, now);
  } else if (cmd.type === 'play.penalty') {
    ensure(
      r.game === 'football' && r.moves[p.id] === undefined,
      'play.move',
      'Your choice is already locked in.',
    );
    if (r.rules === 'shootout') {
      const shooter = r.members[r.round % r.members.length]!.id === p.id;
      // A shooter's swipe (or, from an older client, the lane as a kick).
      if (shooter) {
        const k = cmd.kick ?? laneKick(cmd.lane);
        (r.kicks ??= {})[p.id] = k;
        r.moves[p.id] = laneOf(k.x, k.y);
      } else r.moves[p.id] = cmd.lane;
      aiMoves(w, r, now);
    } else r.moves[p.id] = cmd.lane;
    advance(w, r, now);
  } else if (cmd.type === 'play.shot') {
    ensure(
      r.game === 'snooker' && r.members[r.turn % r.members.length]!.id === p.id,
      'play.turn',
      'Wait for your turn.',
    );
    if (r.pool) {
      ensure(now >= r.pool.readyAt, 'play.rolling', 'Wait for the balls to stop.');
      poolShot(w, r, p.id, cmd, now);
    } else {
      shot(r, cmd.angle, cmd.power);
      r.deadline = now + 45_000;
    }
    advance(w, r, now);
  } else if (cmd.type === 'play.bowl') {
    ensure(r.bowling && bowlerOf(r) === p.id, 'play.turn', 'Wait for your turn.');
    ensure(now >= r.bowling.readyAt, 'play.rolling', 'Wait for the pins to settle.');
    bowlRoll(w, r, p.id, { x: cmd.x, aim: cmd.aim, power: cmd.power, spin: cmd.spin }, null, now);
    advance(w, r, now);
  } else if (cmd.type === 'play.golf') {
    ensure(r.golf && golfer(r) === p.id, 'play.turn', 'Wait for your turn.');
    if (cmd.pickup) golfPickUp(w, r, p.id);
    else golfStroke(w, r, p.id, { club: cmd.club, aim: cmd.aim, power: cmd.power }, null);
    r.deadline = now + GOLF_SHOT_MS;
    advance(w, r, now);
  }
  return { ok: true };
}
function join(w: World, p: Player, r: PlayRoom) {
  access(w, p, r);
  ensure(r.status === 'waiting', 'play.started', 'This game has already started.');
  if (r.members.some((m) => m.id === p.id)) return;
  ensure(
    !r.custom || p.id !== r.host,
    'play.author',
    'Custom quiz authors host, but do not compete.',
  );
  ensure(
    r.members.length < (r.game === 'quiz' ? 8 : r.game === 'bowling' ? 4 : 2),
    'play.full',
    'This room is full.',
  );
  if (r.bowling) {
    const mine = account(w, p.accounts.local);
    ensure(
      mine.currency !== r.currency || mine.balance >= r.stake + r.bowling.fee,
      'bowling.funds',
      `You need ${formatMoney(r.stake + r.bowling.fee, r.currency)} for the stake and the lane.`,
    );
  }
  if (r.golf) {
    ensure(
      p.id === r.host || p.id === r.golf.invite,
      'play.invite',
      'This golf match is by invitation.',
    );
    const mine = account(w, p.accounts.local);
    ensure(
      mine.currency !== r.currency || mine.balance >= r.stake + r.golf.fee,
      'golf.funds',
      `You need ${formatMoney(r.stake + r.golf.fee, r.currency)} for the stake and the green fee.`,
    );
  }
  ensure(
    !Object.values(w.playRooms ?? {}).some(
      (x) => x.id !== r.id && active(x) && x.members.some((m) => m.id === p.id),
    ),
    'play.busy',
    'Finish or leave your other game first.',
  );
  ensure(
    !r.stake || account(w, p.accounts.local).currency === r.currency,
    'play.currency',
    'Staked games require a personal account in this city’s currency. Free games are open to everyone.',
  );
  if (r.stake)
    transfer(
      w,
      p.accounts.local,
      r.escrow,
      r.stake,
      'Social game entry',
      getMarket(w, r.market).month,
      'move',
    );
  r.members.push({ id: p.id, score: 0 });
}
export function playView(w: World, p: Player) {
  return Object.values(w.playRooms ?? {})
    .filter(
      (r) =>
        r.market === locationOf(p) &&
        (!r.venue.startsWith('home:') || canVisitHome(w, p, r.venue.slice(5))),
    )
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 40)
    .map((r) => ({
      id: r.id,
      host: r.host,
      venue: r.venue,
      title: r.title,
      game: r.game,
      status: r.status,
      createdAt: r.createdAt,
      currency: r.currency,
      stake: r.stake,
      pot: account(w, r.escrow).balance,
      members: r.members.map((m) => ({ ...m, name: w.players[m.id]?.name ?? 'Former player' })),
      winners: r.winners,
      round: r.round,
      turn: r.members[r.turn % Math.max(1, r.members.length)]?.id,
      custom: r.custom,
      deadline: r.deadline,
      last: r.last,
      totalQuestions: r.questions.length,
      question:
        r.status === 'playing' && r.game === 'quiz'
          ? {
              text: r.questions[r.round]?.text,
              options: r.questions[r.round]?.options,
              fr: r.questions[r.round]?.fr ?? null,
              cat: r.questions[r.round]?.cat ?? null,
            }
          : null,
      /** Wave 12: AI opponents at the table, and when the next one answers (clients sync then). */
      ai: r.ai ?? [],
      aiDueAt: aiDueAt(w, r),
      /** Wave 12: the last answered question (with its French), for the reveal. */
      reveal:
        r.game === 'quiz' && r.round > 0 && r.status !== 'waiting'
          ? (() => {
              const q = r.questions[r.round - 1]!;
              return {
                text: q.text,
                answer: q.options[q.answer]!,
                fr: q.fr ? { text: q.fr.text, answer: q.fr.options[q.answer]! } : null,
              };
            })()
          : null,
      answered: Object.keys(r.answers),
      myAnswer: r.answers[p.id] ?? null,
      balls: r.balls,
      frames: r.frames,
      red: r.red,
      penalties: r.penalties,
      /** The investor-career rules ('pool8', 'shootout'), or null for the old games. */
      rules: r.rules ?? null,
      pool: r.pool
        ? {
            groups: r.pool.groups,
            inHand: r.pool.inHand,
            broken: r.pool.broken,
            shots: r.pool.shots,
            readyAt: r.pool.readyAt,
            last: r.pool.last,
            targets: r.status === 'playing' ? poolTargets(r, atTable(r)) : [],
          }
        : null,
      locked: Object.keys(r.moves),
      myMove: r.moves[p.id] ?? null,
      shooter: r.members[r.round % Math.max(1, r.members.length)]?.id,
      /** Golf with a friend: the match (null for every other game). */
      golf: r.golf ? golfMatchView(w, r) : null,
      /** Bowling: every bowler's frames, the pins up, the last ball (null for other games). */
      bowling: r.bowling ? bowlingView(r) : null,
    }));
}

// ---------------------------------------------------------------- Golf with a friend: the match

/**
 * Set up a golf match on a new room: who's invited, the holes, the green fee.
 * The host's stake goes into the pot as they send it (join, below); an AI
 * friend answers after a short pause, a real player with Accept or Decline.
 */
function inviteToGolf(
  w: World,
  p: Player,
  r: PlayRoom,
  cmd: Extract<Command, { type: 'play.create' }>,
  now: number,
) {
  const m = getMarket(w, r.market);
  const course = golfCourse(r.market);
  const holes = Math.max(1, Math.min(course.holes.length, cmd.holes ?? course.holes.length));
  ensure(cmd.invite, 'play.invite', 'Pick who to play with.');
  const friend = w.players[cmd.invite];
  ensure(friend && friend.id !== p.id, 'play.invite', 'Pick who to play with.');
  ensure(
    locationOf(friend) === r.market,
    'play.city',
    `${friend.name} isn’t in ${m.data.name} right now.`,
  );
  ensure(
    !Object.values(w.playRooms ?? {}).some(
      (x) =>
        active(x) &&
        (x.members.some((y) => y.id === friend.id) ||
          (x.status === 'waiting' && x.golf?.invite === friend.id)),
    ),
    'play.busy',
    `${friend.name} is in another game right now.`,
  );
  r.golf = {
    invite: friend.id,
    holes,
    pars: course.holes.slice(0, holes).map((h) => h.par),
    hole: 0,
    fee: golfFee(m),
    aiAcceptAt: friend.ai ? now + GOLF_AI_ACCEPT_AFTER : 0,
    players: {},
    shots: [],
  };
  if (friend.ai)
    ensure(
      aiCandidates(w, r).some((x) => x.id === friend.id),
      'play.ai',
      r.stake
        ? `${friend.name} can’t cover that stake right now. Try a smaller one or a free round.`
        : `${friend.name} can’t play right now.`,
    );
  else {
    ensure(
      !r.stake || account(w, friend.accounts.local).currency === r.currency,
      'play.currency',
      'Staked games require a personal account in this city’s currency. Free games are open to everyone.',
    );
    notify(w, friend.id, {
      month: m.month,
      kind: 'system',
      text: r.stake
        ? `${p.name} invites you to golf at ${course.name}: ${formatMoney(r.stake, r.currency)} each, winner takes the pot.`
        : `${p.name} invites you to a round of golf at ${course.name}.`,
    });
  }
  r.last = `${p.name} invited ${friend.name} to golf.`;
}

/** Both are in: each pays the club their green fee, and the first tee is theirs. */
function startGolf(w: World, r: PlayRoom, now: number) {
  const G = r.golf!;
  const m = getMarket(w, r.market);
  const club = golfClubOf(m);
  const course = golfCourse(r.market);
  for (const { id } of r.members) {
    const who = w.players[id]!;
    payExact(
      w,
      who.accounts.local,
      club?.account ?? m.ext.suppliers,
      G.fee,
      `Green fee, ${G.holes} ${G.holes === 1 ? 'hole' : 'holes'} at ${club?.name ?? course.name}`,
      m.month,
    );
    G.players[id] = {
      card: [],
      ball: { x: 0, z: 0 },
      lie: 'tee',
      strokes: 0,
      done: false,
      skill: skillFor(w, id),
    };
  }
  r.status = 'playing';
  r.turn = 0;
  r.round = 0;
  r.deadline = now + GOLF_SHOT_MS;
  r.touchedAt = now;
  const friend = w.players[G.invite]!;
  r.last = `${friend.name} accepted. Hole 1, par ${G.pars[0]}.`;
}

/** The invited AI friend answers: in (its stake into the pot) if it still can, else a polite no. */
function aiAcceptsGolf(w: World, r: PlayRoom, now: number) {
  const G = r.golf!;
  const ai = w.players[G.invite]!;
  G.aiAcceptAt = 0;
  if (!aiCandidates(w, r).some((x) => x.id === ai.id)) {
    r.last = `${ai.name} can’t make it after all. Your stake is back.`;
    payOut(w, r, true);
    return;
  }
  if (r.stake)
    transfer(
      w,
      ai.accounts.local,
      r.escrow,
      r.stake,
      'Social game entry',
      getMarket(w, r.market).month,
      'move',
    );
  r.members.push({ id: ai.id, score: 0 });
  r.ai = [...(r.ai ?? []), ai.id];
  startGolf(w, r, now);
}

/** Next to play: whoever is farthest from the hole and still on it (the host first on a tie). */
function nextGolfer(r: PlayRoom): number {
  const G = r.golf!;
  const g = golfGeo(r, G.hole);
  let best = -1;
  let far = -1;
  r.members.forEach((m, i) => {
    const c = G.players[m.id]!;
    if (c.done) return;
    const d = dist(c.ball, g.pin);
    if (d > far + 1e-9) {
      far = d;
      best = i;
    }
  });
  return best;
}

/** After a stroke: the next player, the next hole, or the end of the match and the pot. */
function golfAfterShot(w: World, r: PlayRoom) {
  const G = r.golf!;
  r.round++;
  for (const m of r.members) m.score = G.players[m.id]!.card.reduce((a, b) => a + b, 0);
  let next = nextGolfer(r);
  if (next < 0) {
    const holeNo = G.hole + 1;
    if (holeNo >= G.holes) {
      const [a, b] = r.members.map((m) => `${w.players[m.id]?.name ?? 'Former player'} ${m.score}`);
      r.last = `Round complete: ${a}, ${b}.`;
      payOut(w, r, false);
      return;
    }
    G.hole = holeNo;
    for (const c of Object.values(G.players)) {
      c.ball = { x: 0, z: 0 };
      c.lie = 'tee';
      c.strokes = 0;
      c.done = false;
    }
    r.last += ` Hole ${holeNo + 1}, par ${G.pars[holeNo]}.`;
    next = nextGolfer(r);
  }
  r.turn = next;
}

/** The club asked for, if it can be played from here (else the one the course suggests). */
function clubOf(id: string, lie: Lie, distance: number): Club {
  if (lie === 'green') return PUTTER;
  const c = CLUBS.find((x) => x.id === id);
  return c && (c.id !== 'driver' || lie === 'tee') ? c : clubFor(distance, lie);
}

/**
 * One stroke, played out by the engine from the inputs alone (club, aim,
 * power): the same physics as a solo round, seeded per room, player, hole
 * and stroke, so it comes out the same on replay and nobody's score is
 * taken on trust.
 */
function golfStroke(
  w: World,
  r: PlayRoom,
  id: Id,
  input: { club: string; aim: number; power: number },
  auto: GolfMatchShot['auto'],
) {
  const G = r.golf!;
  const c = G.players[id]!;
  const g = golfGeo(r, G.hole);
  const par = G.pars[G.hole]!;
  const club = clubOf(input.club, c.lie, dist(c.ball, g.pin));
  const power = Math.max(4, Math.min(110, input.power));
  const stroke = c.strokes;
  const s = hit(
    g,
    c.ball,
    c.lie,
    club,
    power,
    input.aim,
    strokeRng(`${w.seed}:${r.id}:${id}`, G.hole, stroke),
    c.skill,
  );
  c.strokes += 1 + (s.penalty ? 1 : 0);
  const fromLie = c.lie;
  c.ball = s.rest;
  c.lie = s.lie;
  const max = par + GOLF_PICKUP_OVER;
  const picked = !s.holed && c.strokes >= max;
  if (s.holed || picked) {
    c.done = true;
    c.card.push(Math.min(c.strokes, max));
  }
  G.shots.push({
    by: id,
    hole: G.hole,
    stroke,
    club: club.id,
    power,
    aim: input.aim,
    auto,
    from: s.from,
    land: s.land,
    rest: s.rest,
    apex: s.apex,
    curve: s.curve,
    heading: s.heading,
    carry: s.carry,
    roll: s.roll,
    lie: s.lie,
    fromLie,
    penalty: s.penalty,
    holed: s.holed,
    picked,
  });
  const name = w.players[id]?.name ?? 'Former player';
  r.last = s.holed
    ? `${name}: ${scoreName(c.strokes, par).replace(/!$/, '')} (${c.strokes}) on hole ${G.hole + 1}.`
    : picked
      ? `${name} picks up on hole ${G.hole + 1} (${max}).`
      : auto === 'timeout'
        ? `${name}’s shot clock ran out: a soft ${club.id === PUTTER.id ? 'putt' : 'shot'} was played.`
        : `${name}: ${Math.round(dist(s.from, s.rest))} m${s.penalty ? ', in the water (one stroke penalty)' : ''}.`;
  golfAfterShot(w, r);
}

/** Pick up: the hole counts par + 3 (never better than playing it out). */
function golfPickUp(w: World, r: PlayRoom, id: Id) {
  const G = r.golf!;
  const c = G.players[id]!;
  const max = G.pars[G.hole]! + GOLF_PICKUP_OVER;
  c.strokes = max;
  c.done = true;
  c.card.push(max);
  r.last = `${w.players[id]?.name ?? 'Former player'} picks up on hole ${G.hole + 1} (${max}).`;
  golfAfterShot(w, r);
}

/** How an AI friend plays a shot: the suggested club and line, at about the right power. */
export function aiGolfShot(w: World, r: PlayRoom, aiId: Id) {
  const G = r.golf!;
  const c = G.players[aiId]!;
  const g = golfGeo(r, G.hole);
  const rng = deriveRng(w.seed, 'golf-ai', r.id, r.round, aiId);
  const left = dist(c.ball, g.pin);
  const club = clubFor(left, c.lie);
  const reach = club.carry * LIE_CARRY[c.lie];
  const need = ((left + (club === PUTTER ? 0.4 : 0)) / reach) * 100;
  const shaky = 1 - c.skill;
  const power = Math.max(5, Math.min(100, Math.min(96, need) * (1 + rng.normal(0, shaky * 0.07))));
  const aim = defaultAim(g, c.ball, club, c.lie) + rng.normal(0, shaky * 0.02);
  return { club: club.id, aim, power };
}

/**
 * The match's clock, run whenever a command reaches the room: an AI friend
 * plays once its thinking time is up, and a shot clock that ran out plays a
 * soft stroke for that player (in order, so it's the same on replay).
 */
function golfClock(w: World, r: PlayRoom, now: number) {
  for (let guard = 0; guard < 400 && r.status === 'playing'; guard++) {
    const id = golfer(r);
    if (!id) return;
    const start = r.deadline - GOLF_SHOT_MS;
    if (r.ai?.includes(id) && now >= start + GOLF_AI_SHOT_AFTER) {
      golfStroke(w, r, id, aiGolfShot(w, r, id), 'ai');
      r.deadline = start + GOLF_AI_SHOT_AFTER + GOLF_SHOT_MS;
      r.touchedAt = Math.max(r.touchedAt, start + GOLF_AI_SHOT_AFTER);
    } else if (now >= r.deadline) {
      const c = r.golf!.players[id]!;
      const g = golfGeo(r, r.golf!.hole);
      const club = clubFor(dist(c.ball, g.pin), c.lie);
      const at = r.deadline;
      golfStroke(
        w,
        r,
        id,
        { club: club.id, aim: defaultAim(g, c.ball, club, c.lie), power: GOLF_AUTO_POWER },
        'timeout',
      );
      r.deadline = at + GOLF_SHOT_MS;
      r.touchedAt = Math.max(r.touchedAt, at);
    } else return;
  }
}

/** The match as a player sees it (every number the engine worked out). */
function golfMatchView(w: World, r: PlayRoom) {
  const G = r.golf!;
  return {
    invite: G.invite,
    inviteName: w.players[G.invite]?.name ?? 'Former player',
    holes: G.holes,
    pars: G.pars,
    hole: G.hole,
    fee: G.fee,
    shotMs: GOLF_SHOT_MS,
    aiAcceptAt: G.aiAcceptAt,
    players: Object.fromEntries(
      Object.entries(G.players).map(([id, c]) => [id, { ...c, handicap: golfHandicap(c.skill) }]),
    ),
    /** Who's in it (the host, the friend): for the invite card and the figures on the course. */
    people: Object.fromEntries(
      [r.host, G.invite].map((id) => {
        const x = w.players[id];
        const company = x?.companyIds
          .map((c) => w.companies[c])
          .reverse()
          .find((c) => c?.status === 'active');
        return [
          id,
          {
            name: x?.name ?? 'Former player',
            role: x?.role ?? null,
            backgroundId: x?.backgroundId ?? null,
            gender: x?.gender ?? null,
            company: company?.name ?? null,
            ai: !!x?.ai,
          },
        ];
      }),
    ),
    /** The invited player's handicap, before they've accepted. */
    inviteHandicap: w.players[G.invite] ? golfHandicap(skillFor(w, G.invite)) : null,
    shots: G.shots,
  };
}

/**
 * For the invite sheet: the stake chips here, the cap, and the AI friends in
 * this city who are free (with their handicap and the most they can stake).
 */
export function golfMatchOptions(w: World, p: Player) {
  const market = locationOf(p);
  const m = getMarket(w, market);
  const busy = new Set<Id>();
  for (const x of Object.values(w.playRooms ?? {}))
    if (active(x)) {
      for (const y of x.members) busy.add(y.id);
      // Already asked to another match: not free until they answer.
      if (x.status === 'waiting' && x.golf) busy.add(x.golf.invite);
    }
  const fee = golfFee(m);
  const friends = Object.values(w.players)
    .filter((x) => x.ai && !busy.has(x.id) && locationOf(x) === market)
    .map((x) => {
      const a = w.accounts[x.accounts.local];
      const room = a && a.currency === m.data.currency ? Math.max(0, a.balance - fee) : -1;
      return {
        id: x.id,
        name: x.name,
        role: x.role,
        backgroundId: x.backgroundId,
        handicap: golfHandicap(golfAiSkill(x.id)),
        /** The largest stake they'd accept (a quarter of what they hold); −1: can't afford the fee. */
        maxStake: room < 0 ? -1 : Math.floor(room / 4),
      };
    })
    .filter((x) => x.maxStake >= 0)
    .sort((a, b) => b.maxStake - a.maxStake || (a.id < b.id ? -1 : 1))
    .slice(0, 6);
  return {
    venue: golfVenue(m),
    stakes: golfStakes(m),
    maxStake: m.data.costOfLiving * 100,
    shotMs: GOLF_SHOT_MS,
    pickupOver: GOLF_PICKUP_OVER,
    hours: GOLF.hours,
    friends,
    handicap: golfHandicap(skillOf(p.golf?.rounds ?? 0)),
  };
}

// ---------------------------------------------------------------- Bowling: the game

const bowlerOf = (r: PlayRoom) => r.members[r.turn % Math.max(1, r.members.length)]?.id;

/** Everyone's in: each pays the alley the lane fee, and the first bowler steps up. */
function startBowling(w: World, r: PlayRoom, now: number) {
  const B = r.bowling!;
  const m = getMarket(w, r.market);
  const b = m.businesses?.[r.venue];
  for (const { id } of r.members) {
    const who = w.players[id]!;
    if (B.fee > 0)
      payExact(
        w,
        who.accounts.local,
        b?.account ?? m.ext.suppliers,
        B.fee,
        `Lane fee at ${b?.name ?? 'the bowling alley'}`,
        m.month,
      );
    B.players[id] = {
      rolls: [],
      standing: [...FULL_RACK],
      skill: who.ai ? bowlAiSkill(id) : bowlerSkill(who.games?.bowling?.games ?? 0),
    };
  }
  r.status = 'playing';
  r.turn = 0;
  r.round = 0;
  B.readyAt = now;
  r.deadline = now + BOWL_MS;
  r.touchedAt = now;
  r.last =
    r.members.length === 1
      ? 'Your lane is ready: ten frames.'
      : `Ten frames each. ${nameOf(w, r.members[0]!.id)} bowls first.`;
}

/**
 * One ball, rolled by the engine from the inputs alone: the bowler's release
 * wobble is seeded per room and ball, the pins fall as the physics says, and
 * the frame is scored. The same on replay; nobody's pins are taken on trust.
 */
function bowlRoll(
  w: World,
  r: PlayRoom,
  id: Id,
  input: BowlInput,
  auto: BowlRollLog['auto'],
  now: number,
) {
  const B = r.bowling!;
  const me = B.players[id]!;
  const before = bowlingGame(me.rolls);
  const launch = wobble(deriveRng(w.seed, 'bowl', r.id, B.balls), input, me.skill);
  const sim = simulateBowl(me.standing, launch);
  const down = sim.knocked.length;
  B.last = {
    by: id,
    n: B.balls,
    frame: before.frame,
    ball: before.ball,
    input,
    launch,
    standing: [...me.standing],
    knocked: sim.knocked,
    gutter: sim.gutter,
    auto,
    time: sim.time,
  };
  B.balls++;
  r.round++;
  me.rolls.push(down);
  const after = bowlingGame(me.rolls);
  me.standing = after.fresh ? [...FULL_RACK] : me.standing.filter((n) => !sim.knocked.includes(n));
  for (const m of r.members) m.score = bowlingGame(B.players[m.id]!.rolls).score;
  const name = nameOf(w, id);
  const up = before.pinsUp;
  r.last =
    down === up && up === 10
      ? `${name}: STRIKE!`
      : down === up
        ? `${name}: spare!`
        : sim.gutter && down === 0
          ? `${name}: in the gutter.`
          : auto === 'timeout'
            ? `${name}’s clock ran out: a gentle ball rolled for ${down}.`
            : `${name}: ${down} ${down === 1 ? 'pin' : 'pins'}.`;
  // The roll plays out on every screen before the next ball.
  B.readyAt = now + Math.ceil(Math.min(6, sim.time) * 1000) + 1_000;
  r.deadline = B.readyAt + BOWL_MS;
  r.touchedAt = Math.max(r.touchedAt, now);
  // Their frame is done (or their game): the next bowler still bowling, in seat order.
  if (after.done || after.frame !== before.frame) {
    const n = r.members.length;
    const still = (k: number) => !bowlingGame(B.players[r.members[k]!.id]!.rolls).done;
    let next = -1;
    for (let step = 1; step <= n && next < 0; step++) {
      const k = (r.turn + step) % n;
      if (still(k)) next = k;
    }
    if (next < 0) return bowlingFinish(w, r);
    r.turn = next;
  }
}

/** The game's over: everyone who bowled feels it, records are kept, the pot is paid. */
function bowlingFinish(w: World, r: PlayRoom) {
  const B = r.bowling!;
  const month = getMarket(w, r.market).month;
  r.last = `Game over: ${r.members.map((m) => `${nameOf(w, m.id)} ${m.score}`).join(', ')}.`;
  for (const { id, score } of r.members) {
    const p = w.players[id];
    if (!p || p.ai) continue;
    const good = score >= BOWLING.goodGame;
    bumpNeed(p, 'fun', BOWLING.fun + (good ? 4 : 0));
    if (r.members.length > 1) bumpNeed(p, 'social', BOWLING.social);
    bumpEnergy(p, BOWLING.energy);
    if (lifeBarsOn(w)) applyBars(p, { stress: BOWLING.stress - (good ? 2 : 0) });
    const rec = gamesRecordOf(p);
    const was = rec.bowling;
    rec.bowling = {
      games: (was?.games ?? 0) + 1,
      best: Math.max(was?.best ?? 0, score),
      last: score,
      strikes: (was?.strikes ?? 0) + strikesIn(B.players[id]!.rolls),
      month,
    };
  }
  payOut(w, r, false);
}

/** Strikes in a game (a 10 on a fresh rack, not a spare's second ball). */
export function strikesIn(rolls: readonly number[]) {
  let n = 0;
  for (let k = 0; k < rolls.length; k++)
    if (rolls[k] === 10 && bowlingGame(rolls.slice(0, k)).fresh) n++;
  return n;
}

/**
 * The lane's clock, run whenever a command reaches the room: an AI bowler
 * steps up once the pins have settled and it's thought, and a clock that ran
 * out rolls a gentle ball for that bowler (in order, so it's the same on replay).
 */
function bowlingClock(w: World, r: PlayRoom, now: number) {
  const B = r.bowling!;
  for (let guard = 0; guard < 200 && r.status === 'playing'; guard++) {
    const id = bowlerOf(r);
    if (!id) return;
    const at = B.readyAt;
    if (r.ai?.includes(id) && now >= at + BOWL_AI_THINK) {
      const rng = deriveRng(w.seed, 'bowl-ai', r.id, B.balls);
      bowlRoll(w, r, id, aiBowl(rng, B.players[id]!.standing), 'ai', at + BOWL_AI_THINK);
    } else if (now >= r.deadline) {
      bowlRoll(w, r, id, BOWL_TIMEOUT, 'timeout', r.deadline);
    } else return;
  }
}

/** The game as a player sees it (every number the engine worked out). */
function bowlingView(r: PlayRoom) {
  const B = r.bowling!;
  return {
    fee: B.fee,
    shotMs: BOWL_MS,
    readyAt: B.readyAt,
    balls: B.balls,
    bowler: r.status === 'playing' ? (bowlerOf(r) ?? null) : null,
    last: B.last,
    players: Object.fromEntries(
      Object.entries(B.players).map(([id, x]) => {
        const g = bowlingGame(x.rolls);
        return [
          id,
          {
            rolls: x.rolls,
            standing: x.standing,
            frames: g.frames,
            score: g.score,
            done: g.done,
            frame: g.frame,
            ball: g.ball,
          },
        ];
      }),
    ),
  };
}

/** For the lobby: the city's bowling alley, the lane fee and the stake chips (as golf's). */
export function bowlingOptions(w: World, p: Player) {
  if (!moreGamesOn(w)) return null;
  const m = getMarket(w, locationOf(p));
  const b = Object.values(m.businesses ?? {}).find(
    (x) => isOpen(x) && x.landmark === gameVenueKey('bowling-alley'),
  );
  const it = b ? specOf(b).venue?.items.find((x) => x.id === BOWLING.item) : undefined;
  return {
    venue: b?.id ?? null,
    name: b?.name ?? null,
    fee: b && it ? venuePrice(w, m, b, it) : 0,
    stakes: golfStakes(m),
    maxStake: m.data.costOfLiving * 100,
    shotMs: BOWL_MS,
  };
}

/**
 * Wave 12 §A: the shapes of games you play for real (quiz night, pool,
 * football, darts). Kept apart from the rules so the client can import the
 * types and the shared physics without pulling in the question bank.
 */
import type { MarketId } from './data/markets.js';
import type { Currency } from './money.js';
import type { PoolBall } from './pool-physics.js';

type Id = string;

export const GAME_KINDS = ['quiz', 'pool', 'football', 'darts'] as const;
export type GameKind = (typeof GAME_KINDS)[number];
/** Quiz packs: the bank's categories (the city pack is the city you play in). */
export const QUIZ_CATEGORIES = ['general', 'business', 'sport', 'music', 'city'] as const;
export type QuizCategory = (typeof QUIZ_CATEGORIES)[number];

export const GAME_WHERE = ['venue', 'home'] as const;
export type GameWhere = (typeof GAME_WHERE)[number];

export interface GamePlayer {
  /** A player id, or `ai:<gameId>:<n>` for an AI player. */
  id: Id;
  name: string;
  ai: boolean;
  /** AI players: 0 (hopeless) … 1 (sharp). */
  skill?: number;
  /** AI players: the regular they are (`npc:<market>:<n>`), for their look. */
  npc?: string;
  gender?: 'female' | 'male';
  backgroundId?: string;
  /** What they put in the pot (game currency). */
  stake: number;
  joinedAt: number;
  /** Left or conceded: still in the pot, out of the running. */
  out?: boolean;
}

/** A quiz question as the game holds it (bank questions by id, custom ones in full). */
export interface QuizQuestion {
  /** A bank question (`data/quiz-bank.ts`). */
  bankId?: string;
  /** A host's own question: text and four options, the right one first. */
  custom?: { q: string; options: [string, string, string, string] };
  /** Display order: `order[i]` is the source option shown in slot i (source 0 is right). */
  order: [number, number, number, number];
}

export interface QuizState {
  questions: QuizQuestion[];
  /** When each question closes (ms). Moved earlier when everyone has answered. */
  closeAt: number[];
  /** Human answers per question: slot chosen and when. */
  answers: Record<Id, ({ c: number; at: number } | null)[]>;
  packs: string[];
}

export interface PoolShotRecord {
  seq: number;
  by: Id;
  /** The table before the shot. */
  before: PoolBall[];
  dx: number;
  dy: number;
  power: number;
  spin: number;
  potted: number[];
  foul: string | null;
}

export interface PoolState {
  balls: PoolBall[];
  /** Who has solids / stripes, once the table is no longer open. */
  groups: Record<Id, 'solids' | 'stripes'> | null;
  turn: Id;
  turnAt: number;
  ballInHand: boolean;
  shots: number;
  seq: number;
  /** The last few shots, for the client to animate. */
  recent: PoolShotRecord[];
  /** Fouls in a row per player (three in a row lose the frame). */
  fouls: Record<Id, number>;
}

export interface FootballKick {
  shooter: Id;
  keeper: Id;
  /** Aim in goal units: x −1 … 1 between the posts, y 0 … 1 up to the bar. */
  shot?: { x: number; y: number; power: number };
  dive?: { x: number; y: number };
  /** Where the ball went, and what happened. */
  ball?: { x: number; y: number };
  result?: 'goal' | 'saved' | 'miss' | 'post';
  at?: number;
}

export interface FootballState {
  kicks: FootballKick[];
  turnAt: number;
}

export interface DartThrow {
  aim: { x: number; y: number };
  hit: { x: number; y: number };
  score: number;
  /** "T20", "D16", "25", "BULL", "5", "MISS". */
  label: string;
}

export interface DartsState {
  throws: Record<Id, DartThrow[]>;
  turnAt: Record<Id, number>;
}

export interface GameResult {
  winners: Id[];
  scores: Record<Id, number>;
  payouts: Record<Id, number>;
  reason: 'score' | 'forfeit' | 'timeout' | 'eight-ball' | 'fouls' | 'tie' | 'abandoned';
}

export interface Game {
  id: Id;
  kind: GameKind;
  market: MarketId;
  /** Market month it was set up in. */
  month: number;
  where: GameWhere;
  businessId: Id | null;
  /** Home games: whose home. */
  homeOf: Id | null;
  /** Where it is: a venue's name, or "Ada’s place". */
  place: string;
  hostId: Id;
  /** Quizzes with questions the host wrote: the host is quizmaster and doesn't play. */
  hostPlays: boolean;
  /** Entry stake per player, in the game's currency (0: a friendly). */
  stake: number;
  currency: Currency;
  /** In escrow until the end. */
  pot: number;
  createdAt: number;
  /** Last move (for timeouts and abandoned games). */
  lastAt: number;
  status: 'lobby' | 'playing' | 'settled' | 'cancelled';
  maxPlayers: number;
  /** AI skill for the AI players (0 … 1). */
  aiSkill: number;
  players: GamePlayer[];
  /** Players asked to join (home games are invite-only). */
  invited: Id[];
  startedAt?: number;
  endedAt?: number;
  result?: GameResult;
  rematchOf?: Id;
  rematchId?: Id;
  quiz?: QuizState;
  pool?: PoolState;
  football?: FootballState;
  darts?: DartsState;
}

/** Per city, per game, per player: played, wins, current and best streak, net winnings. */
export interface GameStat {
  played: number;
  wins: number;
  streak: number;
  best: number;
  net: number;
}

export type GameStats = Partial<Record<MarketId, Partial<Record<GameKind, Record<Id, GameStat>>>>>;

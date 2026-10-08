/**
 * Wave 12 §A: games you play for real, with stakes. Quiz night (at a bar, or
 * hosted at home with your own questions), eight-ball pool, football on the
 * TV (a penalty shootout) and darts, against real players and AI players.
 *
 * Money: every player's entry stake moves into the city's games escrow
 * account (`acc:games:<market>`) when they join, and the whole pot moves out
 * to the winner (split evenly on a tie, the odd unit to the first winner)
 * when the game ends; a game called off refunds every stake. AI players stake
 * from and win back to the city's outside world (`ext.lifestyle`), so the
 * books still balance. Stakes have per-lifestyle limits and nobody can stake
 * more than they hold.
 *
 * Authority: the server decides everything. Quiz answers are scored from the
 * time they arrive, pool shots are simulated from the aim and power sent,
 * kicks and darts land where the seeded scatter puts them. A client never
 * reports a result.
 *
 * Time: the command's `now` (logged with it, so replays are exact) drives
 * quiz rounds and turn timeouts. A game that's over is settled by the next
 * `game.finish` (the server sends one when a player looks at a finished
 * game), or at the city's settlement, which also refunds stale lobbies and
 * ends abandoned games.
 */
import type { Command } from './commands.js';
import { ensure, fail } from './errors.js';
import { getBusiness, isOpen, specOf } from './economy.js';
import { addContact } from './events.js';
import { achieve, col, getMarket, getPlayer, locationOf, notify } from './helpers.js';
import { newId } from './ids.js';
import { account, costIn, openAccount, pay, payExact, transfer } from './ledger.js';
import { formatMoney, scale } from './money.js';
import { bumpNeed } from './needs.js';
import { npcPerson, NPC_POOL, peopleHere } from './people.js';
import { deriveRng } from './rng.js';
import { visitingView } from './social.js';
import { applyStarEvent } from './stars.js';
import {
  QUIZ,
  answerQuestion,
  initQuiz,
  pickQuestions,
  quizPhase,
  quizScores,
  quizView,
} from './games-quiz.js';
import {
  POOL,
  initPool,
  poolByCount,
  poolScores,
  poolShot,
  poolView,
  runPoolAi,
} from './games-pool.js';
import {
  FOOTBALL,
  footballMove,
  footballScores,
  footballView,
  footballWaitingOn,
  initFootball,
} from './games-football.js';
import {
  DARTS,
  dartsResult,
  dartsScores,
  dartsThrow,
  dartsView,
  initDarts,
} from './games-darts.js';
import type { MarketId } from './data/markets.js';
import type {
  Game,
  GameKind,
  GamePlayer,
  GameResult,
  GameStat,
  GameWhere,
  QuizQuestion,
} from './games-types.js';
import type { Id, LocalBusiness, MarketState, Player, World } from './types.js';

export const GAMES = {
  /** Max stake by lifestyle tier (1–5), in cost-of-living units. */
  stakeLimitCol: [0.01, 0.025, 0.05, 0.12, 0.3],
  /** Games you can be in (or host) at once. */
  maxActive: 3,
  /** A lobby nobody started is called off after this long. */
  lobbyMs: 3 * 3_600_000,
  /** A game with no move for this long is ended at the next settlement. */
  staleMs: 30 * 60_000,
  /** Finished games are kept this many months for results and rematches. */
  keepMonths: 2,
  aiSkill: [0.35, 0.6, 0.85],
  winFun: 14,
  playFun: 8,
  social: 8,
  warmth: 0.06,
  streakStars: 0.02,
  leaders: 10,
} as const;

export const GAME_LABEL: Record<GameKind, string> = {
  quiz: 'quiz night',
  pool: 'pool',
  football: 'football',
  darts: 'darts',
};

const ONE_ON_ONE: ReadonlySet<GameKind> = new Set(['pool', 'football', 'darts']);
export const maxPlayersOf = (k: GameKind) => (k === 'quiz' ? QUIZ.maxPlayers : 2);

export const gamesOf = (world: World): Record<Id, Game> => (world.games ??= {});

export function getGame(world: World, id: Id): Game {
  const g = world.games?.[id];
  if (!g) fail('game.missing', 'That game isn’t on any more.');
  return g;
}

/** The city's games escrow: every pot waits here. */
export function escrowOf(world: World, m: MarketState): Id {
  const id = `acc:games:${m.id}`;
  if (!world.accounts[id])
    openAccount(world, {
      id,
      currency: m.data.currency,
      market: m.id,
      label: `Game stakes held, ${m.data.name}`,
    });
  return id;
}

/** The most a player may stake in a city, by their lifestyle tier. */
export function stakeLimit(p: Player, m: MarketState): number {
  const tier = Math.max(1, Math.min(5, p.lifestyleTier || 1));
  return scale(col(m), GAMES.stakeLimitCol[tier - 1]!);
}

/** Players still in the running. */
export const contestants = (g: Game) => g.players.filter((p) => !p.out);
const humans = (g: Game) => g.players.filter((p) => !p.ai);
const isIn = (g: Game, id: Id) => g.players.some((p) => p.id === id);
const involved = (g: Game, id: Id) => g.hostId === id || isIn(g, id);
const live = (g: Game) => g.status === 'lobby' || g.status === 'playing';

/** Which of a venue's things to do a game needs. */
export function venueHas(b: LocalBusiness, kind: GameKind): boolean {
  const items = specOf(b).venue?.items ?? [];
  const bar = items.some((i) => i.id === 'quiz');
  if (kind === 'quiz' || kind === 'darts') return bar;
  if (kind === 'pool')
    return bar || items.some((i) => i.id === 'pool' && /game of pool/i.test(i.label));
  return b.kind === 'arcade';
}

/** Venue games anyone in town can join; which kinds a business hosts. */
export const venueGames = (b: LocalBusiness): GameKind[] =>
  (['quiz', 'pool', 'darts', 'football'] as const).filter((k) => venueHas(b, k));

const firstName = (name: string) => name.split(' ')[0] ?? name;

/** Where a home game is: the friend's place you're visiting, else your own (in your home city). */
function homeHere(world: World, me: Player) {
  const v = visitingView(world, me);
  if (v) {
    const host = getPlayer(world, v.host.id);
    return { ownerId: host.id, market: v.market, place: `${firstName(host.name)}’s place` };
  }
  ensure(
    locationOf(me) === me.market,
    'game.home',
    'You’re away from home: play at a bar here, or at a friend’s place.',
  );
  return { ownerId: me.id, market: me.market, place: `${firstName(me.name)}’s place` };
}

function activeCount(world: World, id: Id) {
  return Object.values(gamesOf(world)).filter((g) => live(g) && involved(g, id)).length;
}

/** Pay a stake into escrow (in the game's currency, converted for visitors). */
function payStake(world: World, g: Game, p: Player, m: MarketState) {
  if (g.stake <= 0) return;
  const mine = account(world, p.accounts.local);
  const fmt = (v: number) => formatMoney(v, g.currency);
  ensure(
    mine.balance >= costIn(world, g.stake, g.currency, mine.currency),
    'game.funds',
    `The stake is ${fmt(g.stake)}; you don’t have it.`,
  );
  payExact(
    world,
    p.accounts.local,
    escrowOf(world, m),
    g.stake,
    `Stake: ${GAME_LABEL[g.kind]} at ${g.place}`,
    m.month,
  );
  g.pot += g.stake;
}

function addAi(world: World, g: Game, m: MarketState, n: number, regulars: string[]) {
  const rng = deriveRng(world.seed, 'game', g.id, 'ai-players', g.players.length);
  const used = new Set(g.players.map((p) => p.npc).filter(Boolean));
  const base = GAMES.aiSkill[Math.round(g.aiSkill)] ?? GAMES.aiSkill[1];
  for (let k = 0; k < n && g.players.length < g.maxPlayers; k++) {
    let npc = regulars.find((r) => !used.has(r));
    for (let tries = 0; !npc && tries < 50; tries++) {
      const cand = `npc:${m.id}:${rng.int(0, NPC_POOL - 1)}`;
      if (!used.has(cand)) npc = cand;
    }
    if (!npc) break;
    used.add(npc);
    const person = npcPerson(m.id, Number(npc.split(':')[2]));
    const p: GamePlayer = {
      id: `ai:${g.id}:${g.players.length}`,
      name: person.name,
      ai: true,
      skill: Math.round(Math.max(0.1, Math.min(0.95, base + rng.range(-0.1, 0.1))) * 100) / 100,
      npc,
      gender: person.gender,
      stake: g.stake,
      joinedAt: g.createdAt,
    };
    if (g.stake > 0) {
      transfer(
        world,
        m.ext.lifestyle,
        escrowOf(world, m),
        g.stake,
        `Stake: ${GAME_LABEL[g.kind]} at ${g.place}`,
        m.month,
      );
      g.pot += g.stake;
    }
    g.players.push(p);
  }
}

const humanSeat = (p: Player, stake: number, now: number): GamePlayer => ({
  id: p.id,
  name: p.name,
  ai: false,
  ...(p.gender ? { gender: p.gender } : {}),
  backgroundId: p.backgroundId,
  stake,
  joinedAt: now,
});

type CreateCmd = Extract<Command, { type: 'game.create' }>;

/** `game.create`: set a game up (and stake in, unless you're the quizmaster). */
export function createGame(
  world: World,
  me: Player,
  cmd: CreateCmd,
  now: number,
  rematchOf?: Game,
) {
  const kind = cmd.kind;
  let market: MarketId;
  let place: string;
  let businessId: Id | null = null;
  let homeOf: Id | null = null;
  if (cmd.where === 'venue') {
    ensure(cmd.businessId, 'game.venue', 'Pick a venue.');
    const b = getBusiness(world, cmd.businessId);
    ensure(isOpen(b), 'business.closed', `${b.name} has closed.`);
    ensure(b.market === locationOf(me), 'business.market', `${b.name} is in another city.`);
    ensure(venueHas(b, kind), 'game.venue', `${b.name} doesn’t have ${GAME_LABEL[kind]}.`);
    market = b.market;
    place = b.name;
    businessId = b.id;
  } else {
    const h = homeHere(world, me);
    market = h.market;
    place = h.place;
    homeOf = h.ownerId;
  }
  const m = getMarket(world, market);
  ensure(
    activeCount(world, me.id) < GAMES.maxActive,
    'game.busy',
    'Finish a game you’re in first.',
  );
  const limit = stakeLimit(me, m);
  const fmt = (v: number) => formatMoney(v, m.data.currency);
  ensure(Number.isInteger(cmd.stake) && cmd.stake >= 0, 'game.stake', 'Pick a stake.');
  ensure(
    cmd.stake <= limit,
    'game.stake',
    `Your lifestyle lets you stake up to ${fmt(limit)} a game.`,
  );
  const custom = (cmd.quiz?.custom ?? []).map((c) => cleanQuestion(c));
  ensure(kind === 'quiz' || custom.length === 0, 'game.quiz', 'Questions are for quizzes.');
  const hostPlays = kind !== 'quiz' || custom.length === 0;
  const maxPlayers = maxPlayersOf(kind);
  const aiWanted = cmd.ai ?? (kind === 'quiz' && cmd.where === 'venue' ? 3 : 0);
  ensure(
    aiWanted >= 0 && aiWanted <= maxPlayers - (hostPlays ? 1 : 0),
    'game.ai',
    ONE_ON_ONE.has(kind) ? 'It’s one against one.' : `At most ${maxPlayers} players.`,
  );
  const invite = [...new Set(cmd.invite ?? [])].filter((id) => id !== me.id);
  for (const id of invite) {
    const p = world.players[id];
    ensure(p && !p.ai, 'game.invite', 'You can only invite other players.');
  }
  const id = newId(world, 'game');
  const g: Game = {
    id,
    kind,
    market,
    month: m.month,
    where: cmd.where as GameWhere,
    businessId,
    homeOf,
    place,
    hostId: me.id,
    hostPlays,
    stake: cmd.stake,
    currency: m.data.currency,
    pot: 0,
    createdAt: now,
    lastAt: now,
    status: 'lobby',
    maxPlayers,
    aiSkill: Math.max(0, Math.min(2, (cmd.aiSkill ?? 2) - 1)),
    players: [],
    invited: invite,
    ...(rematchOf ? { rematchOf: rematchOf.id } : {}),
  };
  gamesOf(world)[id] = g;
  if (hostPlays) {
    payStake(world, g, me, m);
    g.players.push(humanSeat(me, g.stake, now));
  }
  if (kind === 'quiz') {
    const count = Math.max(
      QUIZ.minQuestions,
      Math.min(QUIZ.maxQuestions, cmd.quiz?.count ?? QUIZ.venueQuestions),
    );
    const packs = [...new Set(cmd.quiz?.packs ?? [])];
    g.quiz = {
      questions: pickQuestions(world, g, { packs, count: Math.max(count, custom.length), custom }),
      closeAt: [],
      answers: {},
      packs: packs.length ? packs : ['general', 'business', 'sport', 'music', 'city'],
    };
    ensure(
      g.quiz.questions.length >= QUIZ.minQuestions,
      'game.quiz',
      `A quiz needs at least ${QUIZ.minQuestions} questions.`,
    );
  }
  if (aiWanted > 0) {
    const regulars =
      businessId !== null
        ? (peopleHere(world, m)[businessId] ?? [])
            .filter((p) => p.id.startsWith('npc:'))
            .map((p) => p.id)
        : [];
    addAi(world, g, m, aiWanted, regulars);
  }
  for (const pid of invite)
    notify(world, pid, {
      month: getMarket(world, world.players[pid]!.market).month,
      kind: 'meeting',
      text: `${me.name} invited you to ${GAME_LABEL[kind]} at ${place}${g.stake ? ` (stake ${fmt(g.stake)})` : ''}.`,
      ref: { kind: 'game', id },
    });
  // One against an AI: straight on.
  if (ONE_ON_ONE.has(kind) && g.players.length === 2 && !invite.length) startGame(world, g, now);
  return {
    gameId: id,
    message:
      g.status === 'playing'
        ? `Game on at ${place}.`
        : hostPlays
          ? `${cap(GAME_LABEL[kind])} at ${place} is set up. Waiting for players.`
          : `Your quiz at ${place} is set up: you’re the quizmaster.`,
  };
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** A host's question: tidy, chat-filtered (no links or numbers to call), four different options. */
function cleanQuestion(c: { q: string; options: string[] }): NonNullable<QuizQuestion['custom']> {
  const tidy = (s: string) => s.replace(/\s+/g, ' ').trim();
  const q = tidy(c.q);
  const options = c.options.map(tidy) as [string, string, string, string];
  ensure(q.length >= 3, 'game.quiz', 'Write each question.');
  ensure(
    options.every((o) => o.length > 0),
    'game.quiz',
    'Each question needs four answers.',
  );
  ensure(
    new Set(options.map((o) => o.toLowerCase())).size === 4,
    'game.quiz',
    'Make the four answers different.',
  );
  const bad = /(https?:|www\.|\.com\b|@|\d{7,})/i;
  ensure(
    ![q, ...options].some((s) => bad.test(s)),
    'game.quiz',
    'No links, emails or phone numbers in questions.',
  );
  return { q, options };
}

/** Who may join: anyone in town for a venue game; home games are invite-only. */
export function joinBlocker(world: World, me: Player, g: Game): string | null {
  if (g.status !== 'lobby') return 'It’s already started.';
  if (isIn(g, me.id)) return 'You’re in.';
  if (g.hostId === me.id) return 'You’re the quizmaster.';
  if (locationOf(me) !== g.market) return `It’s in ${getMarket(world, g.market).data.name}.`;
  if (g.where === 'home' && !g.invited.includes(me.id) && g.homeOf !== me.id)
    return 'Invitation only.';
  if (g.players.length >= g.maxPlayers) return 'It’s full.';
  if (activeCount(world, me.id) >= GAMES.maxActive) return 'Finish a game you’re in first.';
  const m = getMarket(world, g.market);
  if (g.stake > stakeLimit(me, m)) return 'That stake is above your lifestyle’s limit.';
  const mine = account(world, me.accounts.local);
  if (mine.balance < costIn(world, g.stake, g.currency, mine.currency))
    return 'You can’t cover the stake.';
  return null;
}

export function joinGame(world: World, me: Player, gameId: Id, now: number) {
  const g = getGame(world, gameId);
  const reason = joinBlocker(world, me, g);
  ensure(!reason, 'game.join', reason ?? '');
  const m = getMarket(world, g.market);
  payStake(world, g, me, m);
  g.players.push(humanSeat(me, g.stake, now));
  g.lastAt = now;
  notify(world, g.hostId, {
    month: m.month,
    kind: 'meeting',
    text: `${me.name} joined your ${GAME_LABEL[g.kind]} at ${g.place}.`,
    ref: { kind: 'game', id: g.id },
  });
  if (ONE_ON_ONE.has(g.kind) && g.players.length === 2) startGame(world, g, now);
  return {
    gameId: g.id,
    message:
      g.status === 'playing'
        ? 'Game on!'
        : `You’re in. Waiting for ${firstName(world.players[g.hostId]?.name ?? 'the host')} to start.`,
  };
}

export function inviteToGame(world: World, me: Player, gameId: Id, ids: Id[]) {
  const g = getGame(world, gameId);
  ensure(g.hostId === me.id || isIn(g, me.id), 'game.invite', 'Join the game first.');
  ensure(g.status === 'lobby', 'game.invite', 'It’s already started.');
  const m = getMarket(world, g.market);
  let n = 0;
  for (const id of new Set(ids)) {
    const p = world.players[id];
    if (!p || p.ai || id === me.id || g.invited.includes(id) || isIn(g, id)) continue;
    g.invited.push(id);
    n++;
    notify(world, id, {
      month: getMarket(world, p.market).month,
      kind: 'meeting',
      text: `${me.name} invited you to ${GAME_LABEL[g.kind]} at ${g.place}${g.stake ? ` (stake ${formatMoney(g.stake, m.data.currency)})` : ''}.`,
      ref: { kind: 'game', id: g.id },
    });
  }
  return { invited: n, message: n ? `Invited ${n}.` : 'They’re already invited.' };
}

function startGame(world: World, g: Game, now: number) {
  g.status = 'playing';
  g.startedAt = now;
  g.lastAt = now;
  if (g.kind === 'quiz') initQuiz(g, now);
  else if (g.kind === 'pool') {
    initPool(world, g, now);
    runPoolAi(world, g, now);
  } else if (g.kind === 'football') initFootball(world, g, now);
  else initDarts(g, now);
  const m = getMarket(world, g.market);
  for (const p of humans(g))
    if (p.id !== g.hostId)
      notify(world, p.id, {
        month: m.month,
        kind: 'meeting',
        text: `${cap(GAME_LABEL[g.kind])} at ${g.place} has started.`,
        ref: { kind: 'game', id: g.id },
      });
}

export function startByHost(world: World, me: Player, gameId: Id, now: number) {
  const g = getGame(world, gameId);
  ensure(g.hostId === me.id, 'game.start', 'The host starts the game.');
  ensure(g.status === 'lobby', 'game.start', 'It’s already started.');
  const need = ONE_ON_ONE.has(g.kind) ? 2 : QUIZ.minPlayers;
  ensure(
    g.players.length >= need,
    'game.start',
    ONE_ON_ONE.has(g.kind) ? 'Wait for your opponent.' : 'You need at least two players.',
  );
  startGame(world, g, now);
  return { gameId: g.id, message: 'Game on!' };
}

/** Leave a lobby (stake back), or concede a game in play (the stake stays in the pot). */
export function leaveGame(world: World, me: Player, gameId: Id, now: number) {
  const g = getGame(world, gameId);
  const m = getMarket(world, g.market);
  if (g.status === 'lobby') {
    if (g.hostId === me.id) {
      cancelGame(world, g, now, `${me.name} called off ${GAME_LABEL[g.kind]} at ${g.place}.`);
      return { gameId: g.id, message: 'Called off. Every stake has been returned.' };
    }
    const seat = g.players.find((p) => p.id === me.id);
    ensure(seat, 'game.player', 'You’re not in this game.');
    refund(world, g, m, seat);
    g.players = g.players.filter((p) => p.id !== me.id);
    g.invited = g.invited.filter((id) => id !== me.id);
    return { gameId: g.id, message: 'You left. Your stake is back.' };
  }
  ensure(g.status === 'playing', 'game.over', 'That game is over.');
  const seat = g.players.find((p) => p.id === me.id && !p.out);
  ensure(seat, 'game.player', 'You’re not playing in this one.');
  seat.out = true;
  g.lastAt = now;
  const left = contestants(g);
  if (ONE_ON_ONE.has(g.kind) || left.length <= 1) {
    settleGame(world, g, { winners: left.map((p) => p.id), reason: 'forfeit' }, now);
    return { gameId: g.id, message: 'You conceded.' };
  }
  return { gameId: g.id, message: 'You left. Your stake stays in the pot.' };
}

function refund(world: World, g: Game, m: MarketState, seat: GamePlayer) {
  if (seat.stake <= 0) return;
  const esc = escrowOf(world, m);
  if (seat.ai) transfer(world, esc, m.ext.lifestyle, seat.stake, `Stake back: ${g.place}`, m.month);
  else {
    const p = world.players[seat.id];
    if (p)
      pay(
        world,
        esc,
        p.accounts.local,
        seat.stake,
        `Stake back: ${GAME_LABEL[g.kind]} at ${g.place}`,
        m.month,
      );
    else transfer(world, esc, m.ext.lifestyle, seat.stake, `Stake back: ${g.place}`, m.month);
  }
  g.pot -= seat.stake;
}

function cancelGame(world: World, g: Game, now: number, why: string) {
  const m = getMarket(world, g.market);
  for (const seat of g.players) refund(world, g, m, seat);
  g.status = 'cancelled';
  g.endedAt = now;
  for (const p of humans(g))
    if (p.id !== g.hostId)
      notify(world, p.id, {
        month: m.month,
        kind: 'system',
        text: why,
        ref: { kind: 'game', id: g.id },
      });
}

// ---------------------------------------------------------------- Playing

type PlayCmd = Extract<Command, { type: 'game.play' }>;

export function playMove(world: World, me: Player, cmd: PlayCmd, now: number) {
  const g = getGame(world, cmd.gameId);
  ensure(
    g.status === 'playing',
    'game.over',
    g.status === 'lobby' ? 'It hasn’t started yet.' : 'That game is over.',
  );
  const seat = g.players.find((p) => p.id === me.id && !p.out);
  ensure(seat, 'game.player', 'You’re not playing in this one.');
  // A game that's run out of time is finished, not played on.
  ensure(!endingOf(world, g, now), 'game.over', 'Time’s up.');
  const mv = cmd.move;
  g.lastAt = now;
  let end: { winners: Id[]; reason: GameResult['reason'] } | null = null;
  let result: Record<string, unknown> = {};
  if (mv.k === 'answer') {
    ensure(g.kind === 'quiz', 'game.move', 'That’s a quiz move.');
    result = answerQuestion(world, g, me.id, mv.q, mv.choice, now);
  } else if (mv.k === 'shot') {
    ensure(g.kind === 'pool', 'game.move', 'That’s a pool shot.');
    end = poolShot(g, me.id, mv, now);
    if (!end) end = runPoolAi(world, g, now);
    result = { seq: g.pool!.seq };
  } else if (mv.k === 'kick' || mv.k === 'dive') {
    ensure(g.kind === 'football', 'game.move', 'That’s a football move.');
    end = footballMove(world, g, me.id, mv, now);
    const k = g.football!.kicks.filter((x) => x.result).at(-1);
    result = { kicks: g.football!.kicks.length, last: k?.result ?? null };
  } else {
    ensure(g.kind === 'darts', 'game.move', 'That’s a dart.');
    const r = dartsThrow(world, g, me.id, { x: mv.x, y: mv.y }, now);
    end = r.ending;
    result = { label: r.dart.label, score: r.dart.score };
  }
  if (end) settleGame(world, g, end, now);
  return { gameId: g.id, ...result, over: (g.status as Game['status']) === 'settled' };
}

/** Is the game over right now, and how did it end? (null while it's still on). */
export function endingOf(
  world: World,
  g: Game,
  now: number,
): { winners: Id[]; reason: GameResult['reason'] } | null {
  if (g.status !== 'playing') return null;
  if (g.kind === 'quiz') {
    if (quizPhase(g, now).phase !== 'over') return null;
    return topScorers(g, quizScores(world, g));
  }
  if (g.kind === 'pool') {
    const st = g.pool!;
    const turn = g.players.find((p) => p.id === st.turn);
    if (turn && !turn.ai && now > st.turnAt + POOL.turnMs)
      return {
        winners: contestants(g)
          .filter((p) => p.id !== turn.id)
          .map((p) => p.id),
        reason: 'timeout',
      };
    return null;
  }
  if (g.kind === 'football') {
    const waiting = footballWaitingOn(g).filter((id) => !g.players.find((p) => p.id === id)?.ai);
    if (waiting.length && now > g.football!.turnAt + FOOTBALL.turnMs) {
      const others = contestants(g)
        .filter((p) => !waiting.includes(p.id))
        .map((p) => p.id);
      return others.length
        ? { winners: others, reason: 'timeout' }
        : { winners: contestants(g).map((p) => p.id), reason: 'tie' };
    }
    return null;
  }
  // Darts: whoever stopped throwing while someone else finished.
  const st = g.darts!;
  const cs = contestants(g);
  const done = cs.filter((p) => st.throws[p.id]!.length >= DARTS.darts);
  const idle = cs.filter(
    (p) =>
      !p.ai && st.throws[p.id]!.length < DARTS.darts && now > (st.turnAt[p.id] ?? 0) + DARTS.turnMs,
  );
  if (done.length && idle.length && done.length + idle.length === cs.length)
    return { winners: done.map((p) => p.id), reason: 'timeout' };
  return null;
}

function topScorers(g: Game, scores: Record<Id, number>) {
  const cs = contestants(g);
  if (!cs.length) return { winners: [], reason: 'abandoned' as const };
  const best = Math.max(...cs.map((p) => scores[p.id] ?? 0));
  const winners = cs.filter((p) => (scores[p.id] ?? 0) === best).map((p) => p.id);
  return { winners, reason: winners.length > 1 ? ('tie' as const) : ('score' as const) };
}

export function scoresOf(world: World, g: Game): Record<Id, number> {
  if (g.kind === 'quiz') return g.quiz!.closeAt.length ? quizScores(world, g) : {};
  if (g.kind === 'pool') return g.pool ? poolScores(g) : {};
  if (g.kind === 'football') return g.football ? footballScores(g) : {};
  return g.darts ? dartsScores(g) : {};
}

/** `game.finish`: settle a game that's over (anyone in it may ask; the rules decide). */
export function finishGame(world: World, me: Player, gameId: Id, now: number) {
  const g = getGame(world, gameId);
  ensure(involved(g, me.id), 'game.player', 'You’re not in this game.');
  if (g.status === 'settled')
    return { gameId: g.id, result: g.result, message: 'Already settled.' };
  const end = endingOf(world, g, now);
  ensure(end, 'game.notOver', 'It’s not over yet.');
  settleGame(world, g, end, now);
  return { gameId: g.id, result: g.result, message: 'Settled.' };
}

/** Pay the pot out and record the result. */
export function settleGame(
  world: World,
  g: Game,
  end: { winners: Id[]; reason: GameResult['reason'] },
  now: number,
) {
  const m = getMarket(world, g.market);
  const esc = escrowOf(world, m);
  const cs = contestants(g);
  let winners = end.winners.filter((id) => g.players.some((p) => p.id === id));
  if (!winners.length) winners = (cs.length ? cs : g.players).map((p) => p.id);
  const scores = scoresOf(world, g);
  const payouts: Record<Id, number> = {};
  const share = Math.floor(g.pot / winners.length);
  let odd = g.pot - share * winners.length;
  for (const id of winners) {
    const amount = share + odd;
    odd = 0;
    payouts[id] = amount;
    if (amount <= 0) continue;
    const seat = g.players.find((p) => p.id === id)!;
    const p = seat.ai ? undefined : world.players[id];
    if (p)
      pay(
        world,
        esc,
        p.accounts.local,
        amount,
        `Winnings: ${GAME_LABEL[g.kind]} at ${g.place}`,
        m.month,
      );
    else
      transfer(
        world,
        esc,
        m.ext.lifestyle,
        amount,
        `Winnings: ${GAME_LABEL[g.kind]} at ${g.place}`,
        m.month,
      );
  }
  g.pot = 0;
  g.status = 'settled';
  g.endedAt = now;
  g.lastAt = now;
  g.result = {
    winners,
    scores,
    payouts,
    reason: winners.length > 1 && end.reason === 'score' ? 'tie' : end.reason,
  };
  recordStats(world, g, m, winners, payouts);
}

function recordStats(
  world: World,
  g: Game,
  m: MarketState,
  winners: Id[],
  payouts: Record<Id, number>,
) {
  const stats = (((world.gameStats ??= {})[g.market] ??= {})[g.kind] ??= {});
  const fmt = (v: number) => formatMoney(v, g.currency);
  const names = winners.map((id) => g.players.find((p) => p.id === id)?.name ?? '').join(' & ');
  const people = humans(g)
    .map((s) => world.players[s.id])
    .filter((p): p is Player => !!p);
  for (const p of people) {
    const st: GameStat = (stats[p.id] ??= { played: 0, wins: 0, streak: 0, best: 0, net: 0 });
    const won = winners.includes(p.id);
    const paid = g.players.find((s) => s.id === p.id)?.stake ?? 0;
    st.played += 1;
    st.net += (payouts[p.id] ?? 0) - paid;
    if (won) {
      st.wins += 1;
      st.streak += 1;
      st.best = Math.max(st.best, st.streak);
    } else st.streak = 0;
    bumpNeed(p, 'fun', won ? GAMES.winFun : GAMES.playFun);
    bumpNeed(p, 'social', people.length > 1 || g.players.length > 1 ? GAMES.social : 3);
    if (won) {
      achieve(world, p, 'games.first-win', 'Won your first game night', m.month);
      if (st.streak >= 3) {
        applyStarEvent(p.stars, GAMES.streakStars * Math.min(st.streak, 5));
        achieve(world, p, 'games.streak', 'Three wins in a row', m.month);
      }
    }
    notify(world, p.id, {
      month: m.month,
      kind: 'system',
      text: won
        ? winners.length > 1
          ? `You tied ${GAME_LABEL[g.kind]} at ${g.place} and share the pot: ${fmt(payouts[p.id] ?? 0)}.`
          : `You won ${GAME_LABEL[g.kind]} at ${g.place}${payouts[p.id] ? ` and ${fmt(payouts[p.id]!)}` : ''}!`
        : `${names} won ${GAME_LABEL[g.kind]} at ${g.place}.`,
      ref: { kind: 'game', id: g.id },
    });
  }
  // The quizmaster had a night of it too.
  if (!g.hostPlays) {
    const host = world.players[g.hostId];
    if (host) {
      bumpNeed(host, 'fun', GAMES.playFun);
      bumpNeed(host, 'social', GAMES.social);
      people.push(host);
      notify(world, host.id, {
        month: m.month,
        kind: 'system',
        text: `Your quiz at ${g.place} is over: ${names} won${payouts[winners[0]!] ? ` ${fmt(g.result!.payouts[winners[0]!] ?? 0)}` : ''}.`,
        ref: { kind: 'game', id: g.id },
      });
    }
  }
  // Everyone who played together knows each other a little better.
  for (const a of people)
    for (const b of people)
      if (a.id < b.id) {
        addContact(a, { kind: 'player', refId: b.id, name: b.name, warmth: GAMES.warmth }, m.month);
        addContact(b, { kind: 'player', refId: a.id, name: a.name, warmth: GAMES.warmth }, m.month);
      }
}

/** `game.rematch`: the same game again with the same people (or join the rematch someone set up). */
export function rematch(world: World, me: Player, gameId: Id, now: number) {
  const old = getGame(world, gameId);
  ensure(involved(old, me.id), 'game.player', 'You weren’t in that game.');
  ensure(
    old.status === 'settled' || old.status === 'cancelled',
    'game.rematch',
    'Finish this one first.',
  );
  const next = old.rematchId ? world.games?.[old.rematchId] : undefined;
  if (next && next.status === 'lobby') {
    if (involved(next, me.id)) return { gameId: next.id, message: 'You’re in the rematch.' };
    return joinGame(world, me, next.id, now);
  }
  ensure(!next, 'game.rematch', 'The rematch has already started.');
  const custom = old.quiz?.questions.some((q) => q.custom);
  const r = createGame(
    world,
    me,
    {
      type: 'game.create',
      kind: old.kind,
      where: old.where,
      ...(old.businessId ? { businessId: old.businessId } : {}),
      stake: old.stake,
      ai: old.players.filter((p) => p.ai).length,
      aiSkill: old.aiSkill + 1,
      invite: humans(old)
        .map((p) => p.id)
        .concat(old.hostPlays ? [] : [old.hostId])
        .filter((id) => id !== me.id),
      ...(old.quiz
        ? {
            quiz: {
              packs: old.quiz.packs as never,
              count: custom ? QUIZ.venueQuestions : old.quiz.questions.length,
            },
          }
        : {}),
    },
    now,
    old,
  );
  old.rematchId = r.gameId;
  return { ...r, message: 'Rematch set up. Your opponents are invited.' };
}

// ---------------------------------------------------------------- Settlement sweep

/** At a city's settlement: refund stale lobbies, end abandoned games, forget old ones. */
export function sweepGames(world: World, marketId: MarketId, now: number) {
  const all = world.games;
  if (!all) return;
  const m = getMarket(world, marketId);
  for (const g of Object.values(all)) {
    if (g.market !== marketId) continue;
    if (g.status === 'lobby' && now - g.createdAt > GAMES.lobbyMs)
      cancelGame(
        world,
        g,
        now,
        `${cap(GAME_LABEL[g.kind])} at ${g.place} never started; stakes returned.`,
      );
    else if (g.status === 'playing') {
      const end = endingOf(world, g, now);
      if (end) settleGame(world, g, end, now);
      else if (now - g.lastAt > GAMES.staleMs) settleGame(world, g, abandonedEnding(world, g), now);
    }
  }
  for (const [id, g] of Object.entries(all))
    if (g.market === marketId && !live(g) && g.month < m.month - GAMES.keepMonths) delete all[id];
}

function abandonedEnding(world: World, g: Game) {
  if (g.kind === 'pool') return poolByCount(g);
  if (g.kind === 'darts') return dartsResult(g);
  return topScorers(g, scoresOf(world, g));
}

// ---------------------------------------------------------------- Views

function summary(world: World, g: Game, viewer: Player) {
  const host = world.players[g.hostId];
  return {
    id: g.id,
    kind: g.kind,
    where: g.where,
    place: g.place,
    businessId: g.businessId,
    market: g.market,
    hostId: g.hostId,
    hostName: host?.name ?? '',
    hostPlays: g.hostPlays,
    stake: g.stake,
    currency: g.currency,
    pot: g.pot,
    status: g.status,
    players: g.players.map((p) => ({ id: p.id, name: p.name, ai: p.ai, out: !!p.out })),
    maxPlayers: g.maxPlayers,
    invited: g.invited.length,
    youIn: isIn(g, viewer.id),
    youHost: g.hostId === viewer.id,
    youInvited: g.invited.includes(viewer.id),
    canJoin: joinBlocker(world, viewer, g) === null,
    joinReason: joinBlocker(world, viewer, g),
    startedAt: g.startedAt ?? null,
    rematchId: g.rematchId ?? null,
    result: g.result
      ? {
          winners: g.result.winners.map((id) => ({
            id,
            name: g.players.find((p) => p.id === id)?.name ?? '',
          })),
          reason: g.result.reason,
          youWon: g.result.winners.includes(viewer.id),
          yourPayout: g.result.payouts[viewer.id] ?? 0,
        }
      : null,
  };
}

export type GameSummary = ReturnType<typeof summary>;

export function leadersOf(
  world: World,
  market: MarketId,
  kind: GameKind,
  n: number = GAMES.leaders,
) {
  const stats = world.gameStats?.[market]?.[kind] ?? {};
  return Object.entries(stats)
    .filter(([, s]) => s.played > 0)
    .sort(
      ([a, x], [b, y]) => y.wins - x.wins || y.best - x.best || y.net - x.net || (a < b ? -1 : 1),
    )
    .slice(0, n)
    .map(([id, s], i) => ({
      rank: i + 1,
      id,
      name: world.players[id]?.name ?? 'Former player',
      ...s,
    }));
}

/** `view.games`: your games, invitations, games open in the city you're in, leaderboards. */
export function gamesView(world: World, p: Player, now: number) {
  const here = locationOf(p);
  const m = world.markets[here];
  const all = Object.values(world.games ?? {}).sort((a, b) => b.createdAt - a.createdAt);
  const mine = all.filter((g) => involved(g, p.id));
  const kinds = ['quiz', 'pool', 'football', 'darts'] as const;
  return {
    stakeLimit: m ? { max: stakeLimit(p, m), currency: m.data.currency } : null,
    active: mine.filter(live).map((g) => summary(world, g, p)),
    invites: all
      .filter((g) => g.status === 'lobby' && g.invited.includes(p.id) && !involved(g, p.id))
      .map((g) => summary(world, g, p)),
    open: all
      .filter(
        (g) =>
          g.status === 'lobby' && g.where === 'venue' && g.market === here && !involved(g, p.id),
      )
      .slice(0, 12)
      .map((g) => summary(world, g, p)),
    recent: mine
      .filter((g) => g.status === 'settled')
      .slice(0, 6)
      .map((g) => summary(world, g, p)),
    leaders: Object.fromEntries(kinds.map((k) => [k, leadersOf(world, here, k, 5)])) as Record<
      GameKind,
      ReturnType<typeof leadersOf>
    >,
    me: Object.fromEntries(
      kinds.map((k) => [k, world.gameStats?.[here]?.[k]?.[p.id] ?? null]),
    ) as Record<GameKind, GameStat | null>,
    now,
  };
}

/** Who may watch a game: anyone in it or invited, and anyone in town for a venue game. */
const canSee = (g: Game, p: Player) =>
  involved(g, p.id) ||
  g.invited.includes(p.id) ||
  (g.where === 'venue' && locationOf(p) === g.market);

/** The full game for one viewer (GET /api/games/:id): never anything secret. */
export function gameView(world: World, gameId: Id, viewerId: Id, now: number) {
  const g = world.games?.[gameId];
  const p = world.players[viewerId];
  if (!g || !p || !canSee(g, p)) return null;
  const host = world.players[g.hostId];
  const m = world.markets[g.market];
  const due = endingOf(world, g, now);
  return {
    ...summary(world, g, p),
    serverNow: now,
    createdAt: g.createdAt,
    aiSkill: g.aiSkill,
    host: host ? { id: host.id, name: host.name } : null,
    city: m?.data.name ?? '',
    seats: g.players.map((s) => ({
      id: s.id,
      name: s.name,
      ai: s.ai,
      skill: s.skill ?? null,
      npc: s.npc ?? null,
      gender: s.gender ?? null,
      backgroundId: s.backgroundId ?? null,
      out: !!s.out,
      you: s.id === viewerId,
      stats: s.ai ? null : (world.gameStats?.[g.market]?.[g.kind]?.[s.id] ?? null),
    })),
    /** The game is over by the rules and waits for `game.finish`. */
    due: !!due,
    scores: g.status === 'lobby' ? {} : scoresOf(world, g),
    leaders: leadersOf(world, g.market, g.kind, 5),
    quiz:
      g.kind === 'quiz' && g.status !== 'lobby' && g.status !== 'cancelled'
        ? quizView(world, g, viewerId, now)
        : null,
    quizSetup:
      g.kind === 'quiz'
        ? {
            count: g.quiz!.questions.length,
            packs: g.quiz!.packs,
            custom: g.quiz!.questions.filter((q) => q.custom).length,
          }
        : null,
    pool: g.kind === 'pool' && g.pool ? poolView(g, viewerId, now) : null,
    football: g.kind === 'football' && g.football ? footballView(g, viewerId) : null,
    darts: g.kind === 'darts' && g.darts ? dartsView(g) : null,
  };
}

export type GameView = NonNullable<ReturnType<typeof gameView>>;

/** Persistent, server-scored social games. No client scores or client clocks are trusted. */
import type { World, Player, Id } from './types.js';
import type { MarketId } from './data/markets.js';
import type { Currency } from './money.js';
import { ensure } from './errors.js';
import { getMarket, locationOf } from './helpers.js';
import { newId } from './ids.js';
import { account, openAccount, transfer } from './ledger.js';
import type { Command } from './commands.js';

export interface QuizQuestion {
  text: string;
  options: string[];
  answer: number;
}
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
  game: 'quiz' | 'snooker' | 'football';
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
  penalties: { shooter: Id; shot: number; keeper: number; goal: boolean }[];
}
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
  const max = Math.max(...r.members.map((m) => m.score));
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
  if (
    r.game === 'quiz' &&
    (r.members.every((m) => r.answers[m.id] !== undefined) || now >= r.deadline)
  ) {
    const q = r.questions[r.round]!;
    for (const m of r.members) if (r.answers[m.id] === q.answer) m.score += 10;
    r.last = `${q.text} Answer: ${q.options[q.answer]}.`;
    r.round++;
    r.answers = {};
    r.deadline = now + 20_000;
    if (r.round >= r.questions.length) payOut(w, r, false);
  } else if (
    r.game === 'football' &&
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
  } else if (r.game === 'snooker' && now >= r.deadline) {
    r.turn++;
    r.round++;
    r.deadline = now + 45_000;
    r.last = 'Turn timed out. Next player.';
    r.red = r.balls.some((b) => b.value === 1 && !b.potted);
    r.colorFree = false;
  }
  if (r.game === 'snooker' && (r.round >= 60 || r.balls.slice(1).every((b) => b.potted)))
    payOut(w, r, false);
}
export function playCommand(
  w: World,
  p: Player,
  cmd: Extract<Command, { type: `play.${string}` }>,
  now: number,
) {
  const rooms = (w.playRooms ??= {});
  if (cmd.type === 'play.create') {
    ensure(
      Object.values(rooms).filter((r) => active(r) && r.host === p.id).length === 0,
      'play.host',
      'Finish or cancel your current room first.',
    );
    const market = locationOf(p),
      m = getMarket(w, market),
      venue = cmd.venue;
    if (venue.startsWith('home:'))
      ensure(
        venue === `home:${p.id}` && market === p.market,
        'play.home',
        'Host at your own home.',
      );
    else ensure(!!m.businesses?.[venue], 'play.venue', 'Choose a venue in your current city.');
    ensure(
      cmd.stake <= m.data.costOfLiving * 100,
      'play.stake',
      'The maximum stake is one month of living costs.',
    );
    const id = newId(w, 'play');
    const pool = [...QUIZ];
    let seed = (w.nextId * 2654435761) >>> 0;
    for (let i = pool.length - 1; i > 0; i--) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const j = seed % (i + 1);
      [pool[i], pool[j]] = [pool[j]!, pool[i]!];
    }
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
      custom: !!cmd.questions?.length,
      questions: cmd.questions?.length ? cmd.questions : pool.slice(0, 8),
      answers: {},
      last: '',
      balls: cmd.game === 'snooker' ? rack() : [],
      red: true,
      colorFree: false,
      frames: [],
      moves: {},
      penalties: [],
    };
    ensure(
      !r.custom || r.game === 'quiz',
      'play.questions',
      'Custom questions are only for quizzes.',
    );
    rooms[id] = r;
    // A custom quiz author is the non-playing quizmaster: they already know the answers.
    if (!r.custom) join(w, p, r);
    return { id };
  }
  const r = rooms[cmd.roomId];
  ensure(r, 'play.missing', 'This game room no longer exists.');
  access(w, p, r);
  if (cmd.type === 'play.join') {
    join(w, p, r);
    return { id: r.id };
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
    ensure(
      r.host === p.id && r.status === 'waiting',
      'play.host',
      'Only the host can start this room.',
    );
    ensure(
      r.members.length >= (r.game === 'quiz' && r.stake === 0 ? 1 : 2),
      'play.players',
      'Wait for another player.',
    );
    r.status = 'playing';
    r.deadline = now + (r.game === 'snooker' ? 45_000 : 20_000);
    r.touchedAt = now;
    return { ok: true };
  }
  ensure(
    r.members.some((m) => m.id === p.id) || r.host === p.id,
    'play.member',
    'Join this game first.',
  );
  if (cmd.type === 'play.sync') {
    advance(w, r, now);
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
    r.moves[p.id] = cmd.lane;
    advance(w, r, now);
  } else if (cmd.type === 'play.shot') {
    ensure(
      r.game === 'snooker' && r.members[r.turn % r.members.length]!.id === p.id,
      'play.turn',
      'Wait for your turn.',
    );
    shot(r, cmd.angle, cmd.power);
    r.deadline = now + 45_000;
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
  ensure(r.members.length < (r.game === 'quiz' ? 8 : 2), 'play.full', 'This room is full.');
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
          ? { text: r.questions[r.round]?.text, options: r.questions[r.round]?.options }
          : null,
      answered: Object.keys(r.answers),
      myAnswer: r.answers[p.id] ?? null,
      balls: r.balls,
      frames: r.frames,
      red: r.red,
      penalties: r.penalties,
      locked: Object.keys(r.moves),
      myMove: r.moves[p.id] ?? null,
      shooter: r.members[r.round % Math.max(1, r.members.length)]?.id,
    }));
}

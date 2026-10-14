import { describe, expect, it } from 'vitest';
import { dispatch } from '../src/dispatch.js';
import type { Command } from '../src/commands.js';
import { createWorld } from '../src/world.js';
import type { World } from '../src/types.js';
import { playerView } from '../src/views.js';
import { AUTO_QUIZ_FROM, QUIZ_AI_AFTER, QUIZ_LENGTH, drawQuiz } from '../src/play.js';
import { QUIZ_BANK } from '../src/data/quiz-bank.js';
import { SKY_VIEWS, skyViewsIn } from '../src/data/sky-views.js';
import { moneyByCurrency } from './helpers.js';

const T1 = AUTO_QUIZ_FROM + 3_600_000;

function run(w: World, actor: string | null, cmd: Command, now = T1) {
  const r = dispatch(w, cmd, { actorId: actor, now });
  if (!r.ok) throw new Error(`${cmd.type} failed: ${r.error.code} ${r.error.message}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- loosely typed results
  return { world: r.world, result: r.result as any };
}
const tryRun = (w: World, actor: string | null, cmd: Command, now = T1) =>
  dispatch(w, cmd, { actorId: actor, now });

function founder(w: World, id: string, market: 'lagos' | 'london' = 'lagos') {
  return run(w, id, {
    type: 'player.create',
    handle: `h_${id}`,
    name: `Player ${id}`,
    role: 'founder',
    backgroundId: 'f-engineer',
    market,
    company: {
      name: `${id} Labs`,
      industry: 'fintech',
      revenueModel: 'subscription',
      idea: 'Payments for market traders',
      incorporation: 'local',
    },
  }).world;
}
function world() {
  let w = createWorld({ seed: 7, now: T1, markets: ['lagos', 'london'], aiStartupsPerMarket: 6 });
  w = founder(w, 'host');
  w = founder(w, 'ada');
  return w;
}
const venueIn = (w: World) => Object.keys(w.markets.lagos!.businesses ?? {})[0]!;

describe('Wave 12: auto-filled quizzes', () => {
  it('has a large bilingual bank across every category', () => {
    expect(QUIZ_BANK.length).toBeGreaterThanOrEqual(180);
    const cats = new Set(QUIZ_BANK.map((q) => q.cat));
    expect(cats.size).toBe(8);
    for (const q of QUIZ_BANK) {
      expect(q.options).toHaveLength(4);
      expect(q.fr.options).toHaveLength(4);
      expect(new Set(q.options).size).toBe(4);
      expect(q.answer).toBeGreaterThanOrEqual(0);
      expect(q.answer).toBeLessThan(4);
      expect(q.fr.text.length).toBeGreaterThan(5);
    }
    expect(new Set(QUIZ_BANK.map((q) => q.text)).size).toBe(QUIZ_BANK.length);
  });

  it('draws a deterministic, varied quiz from a seed', () => {
    const a = drawQuiz('room-1');
    expect(a).toEqual(drawQuiz('room-1'));
    expect(a).toHaveLength(QUIZ_LENGTH);
    expect(new Set(a.map((q) => q.cat)).size).toBeGreaterThanOrEqual(6);
    expect(drawQuiz('room-2').map((q) => q.text)).not.toEqual(a.map((q) => q.text));
  });

  it('ignores custom questions from older clients: the bank fills the quiz and the host plays', () => {
    let w = world();
    const made = run(w, 'host', {
      type: 'play.create',
      game: 'quiz',
      venue: 'home:host',
      title: 'Friday quiz',
      stake: 0,
      questions: [1, 2, 3].map((n) => ({
        text: `What is ${n} plus one?`,
        options: [String(n + 1), '8', '9', '10'],
        answer: 0,
      })),
    });
    w = made.world;
    const room = w.playRooms![made.result.id]!;
    expect(room.custom).toBe(false);
    expect(room.questions).toHaveLength(QUIZ_LENGTH);
    expect(room.questions.some((q) => q.text.includes('plus one'))).toBe(false);
    expect(room.members.map((m) => m.id)).toEqual(['host']);
    w = run(w, 'host', { type: 'play.start', roomId: room.id }).world;
    const view = playerView(w, 'host')!.playRooms[0]!;
    expect(view.question?.text).toBe(w.playRooms![room.id]!.questions[0]!.text);
    expect(view.question?.fr?.text).toBeTruthy();
    expect(view.question).not.toHaveProperty('answer');
  });

  it('matches two players into one quiz, and opens a new room when none is waiting', () => {
    let w = world();
    const venue = venueIn(w);
    const a = run(w, 'host', { type: 'play.match', venue, stake: 500 });
    expect(a.result.joined).toBe(false);
    w = a.world;
    const b = run(w, 'ada', { type: 'play.match', venue, stake: 500 });
    expect(b.result).toEqual({ id: a.result.id, joined: true });
    w = b.world;
    expect(w.playRooms![a.result.id]!.members.map((m) => m.id)).toEqual(['host', 'ada']);
    expect(w.accounts[w.playRooms![a.result.id]!.escrow]!.balance).toBe(1000);
    // A different stake is a different table.
    w = founder(w, 'bo');
    expect(run(w, 'bo', { type: 'play.match', venue, stake: 0 }).result.joined).toBe(false);
  });

  it('plays a staked quiz against AI opponents, pays the winner the pot and conserves money', () => {
    let w = world();
    const supply = moneyByCurrency(w);
    const made = run(w, 'host', {
      type: 'play.create',
      game: 'quiz',
      venue: 'home:host',
      title: 'Me against the city',
      stake: 1000,
    });
    w = made.world;
    const id = made.result.id;
    expect(tryRun(w, 'ada', { type: 'play.ai', roomId: id }).ok).toBe(false);
    w = run(w, 'host', { type: 'play.ai', roomId: id, count: 2 }).world;
    let r = w.playRooms![id]!;
    expect(r.status).toBe('playing');
    expect(r.ai).toHaveLength(2);
    expect(r.ai!.every((x) => w.players[x]!.ai)).toBe(true);
    expect(w.accounts[r.escrow]!.balance).toBe(3000);
    expect(moneyByCurrency(w)).toEqual(supply);
    // The host knows every answer; AIs answer when their thinking time is up.
    let now = T1;
    for (let round = 0; round < QUIZ_LENGTH; round++) {
      r = w.playRooms![id]!;
      const answer = r.questions[round]!.answer;
      w = run(
        w,
        'host',
        { type: 'play.answer', roomId: id, round, choice: answer },
        now + 500,
      ).world;
      for (let k = 0; k < 4; k++) {
        const v = playerView(w, 'host')!.playRooms.find((x) => x.id === id)!;
        if (v.status !== 'playing' || v.round !== round) break;
        // The client syncs when the next AI is due to answer.
        expect(v.aiDueAt).not.toBeNull();
        w = run(w, 'host', { type: 'play.sync', roomId: id }, v.aiDueAt!).world;
      }
      r = w.playRooms![id]!;
      expect(r.round === round + 1 || r.status === 'finished').toBe(true);
      now = r.deadline - 20_000;
    }
    r = w.playRooms![id]!;
    expect(r.status).toBe('finished');
    expect(r.members.find((m) => m.id === 'host')!.score).toBe(QUIZ_LENGTH * 10);
    expect(r.winners).toEqual(['host']);
    expect(w.accounts[r.escrow]!.balance).toBe(0);
    expect(moneyByCurrency(w)).toEqual(supply);
    // Deterministic: the same commands give the same world.
    const again = run(world(), 'host', {
      type: 'play.create',
      game: 'quiz',
      venue: 'home:host',
      title: 'Me against the city',
      stake: 1000,
    });
    expect(again.world.playRooms![id]!.questions).toEqual(made.world.playRooms![id]!.questions);
  });

  it('seats AI opponents automatically when a host waits alone', () => {
    let w = world();
    const made = run(w, 'host', {
      type: 'play.create',
      game: 'quiz',
      venue: 'home:host',
      title: 'Anyone?',
      stake: 0,
    });
    w = made.world;
    w = run(w, 'host', { type: 'play.sync', roomId: made.result.id }, T1 + 1000).world;
    expect(w.playRooms![made.result.id]!.status).toBe('waiting');
    w = run(w, 'host', { type: 'play.sync', roomId: made.result.id }, T1 + QUIZ_AI_AFTER).world;
    expect(w.playRooms![made.result.id]!.status).toBe('playing');
    expect(w.playRooms![made.result.id]!.members.length).toBeGreaterThan(1);
  });
});

describe('Wave 12: sky views', () => {
  it('gives every game city a real sky view, and dates can go on one', () => {
    for (const m of [
      'london',
      'san-francisco',
      'dubai',
      'cairo',
      'johannesburg',
      'nairobi',
      'lagos',
      'accra',
      'freetown',
      'kigali',
    ])
      expect(skyViewsIn(m).length).toBeGreaterThan(0);
    expect(new Set(SKY_VIEWS.map((v) => v.id)).size).toBe(SKY_VIEWS.length);
    let w = createWorld({ seed: 3, now: T1, markets: ['london', 'lagos'], aiStartupsPerMarket: 2 });
    w = founder(w, 'host', 'london');
    w = founder(w, 'guest', 'london');
    expect(
      tryRun(w, 'host', {
        type: 'living.date.invite',
        playerId: 'guest',
        location: 'sky-view',
        viewId: 'burj-khalifa',
      }).ok,
    ).toBe(false);
    expect(
      tryRun(w, 'host', { type: 'living.date.invite', playerId: 'guest', location: 'sky-view' }).ok,
    ).toBe(false);
    const d = run(w, 'host', {
      type: 'living.date.invite',
      playerId: 'guest',
      location: 'sky-view',
      viewId: 'london-cable-car',
    });
    expect(d.world.dates![d.result.id]!.viewId).toBe('london-cable-car');
  });
});

describe('the switch to bank quizzes replays exactly', () => {
  it('keys on the logged Wave 12 release note, not the clock', async () => {
    const { autoQuiz, AUTO_QUIZ_NOTE } = await import('../src/play.js');
    const w = { announcements: ['release-2026-10-08-wave11'] } as unknown as Parameters<
      typeof autoQuiz
    >[0];
    expect(autoQuiz(w)).toBe(false);
    w.announcements!.push(AUTO_QUIZ_NOTE);
    expect(autoQuiz(w)).toBe(true);
    expect(autoQuiz({ announcements: [] } as unknown as typeof w)).toBe(true);
  });
});

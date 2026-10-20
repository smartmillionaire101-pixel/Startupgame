import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { golfCourse } from '../src/data/leisure.js';
import { MARKET_IDS } from '../src/data/markets.js';
import {
  CLUBS,
  PUTTER,
  clubFor,
  defaultAim,
  dist,
  headingTo,
  hit,
  holeGeo,
  lieAt,
  strokeRng,
  type Lie,
} from '../src/golf-physics.js';

/**
 * The golf ball moved from the client (apps/web/src/city/golf/game.ts) into
 * the engine so a match for money is played out on the server. It must give
 * exactly what the client gave: the cases below were recorded by the old
 * client file at 8020a04 (fixtures/golf-golden-lagos.json in full, and a
 * hash over every city's).
 */
function cases() {
  const out: Record<string, unknown>[] = [];
  for (const id of MARKET_IDS) {
    for (const h of golfCourse(id).holes) {
      const g = holeGeo(h);
      let ball = { ...g.tee };
      let lie: Lie = 'tee';
      for (let s = 0; s < 8 && lie !== 'holed'; s++) {
        const club = clubFor(dist(ball, g.pin), lie);
        const power = [95, 70, 104, 60, 85, 40, 108, 30][s]!;
        const aim = defaultAim(g, ball, club, lie) + [0, 0.05, -0.08, 0.02, 0, -0.03, 0.1, 0][s]!;
        const skill = [0, 0.2, 0.5][s % 3]!;
        const seed = `${id}:gold`;
        const shot = hit(g, ball, lie, club, power, aim, strokeRng(seed, h.n - 1, s), skill);
        out.push({
          market: id,
          hole: h.n - 1,
          ball,
          lie,
          club: club.id,
          power,
          aim,
          seed,
          stroke: s,
          skill,
          shot: { ...shot, club: shot.club.id },
        });
        ball = shot.rest;
        lie = shot.lie;
      }
      for (const club of [...CLUBS, PUTTER]) {
        const from = club === PUTTER ? { x: g.pin.x + 3, z: g.pin.z + 6 } : { x: 4, z: -30 };
        const l = lieAt(g, from);
        const aim = headingTo(from, g.pin);
        const shot = hit(g, from, l, club, 88, aim, strokeRng('c', h.n - 1, 3), 0.1);
        out.push({
          market: id,
          hole: h.n - 1,
          ball: from,
          lie: l,
          club: club.id,
          power: 88,
          aim,
          seed: 'c',
          stroke: 3,
          skill: 0.1,
          shot: { ...shot, club: shot.club.id },
        });
      }
    }
  }
  return out;
}

describe('golf physics in the engine', () => {
  const all = cases();

  it('plays Lagos’s holes exactly as the old client did, shot for shot', () => {
    const golden = JSON.parse(
      readFileSync(join(__dirname, 'fixtures', 'golf-golden-lagos.json'), 'utf8'),
    ) as unknown[];
    const mine = JSON.parse(JSON.stringify(all.filter((c) => c.market === 'lagos')));
    expect(mine).toEqual(golden);
  });

  it('matches the old client in every city (hash of all 461 shots)', () => {
    expect(all).toHaveLength(461);
    const h = createHash('sha256')
      .update(JSON.stringify(all.map((c) => c.shot)))
      .digest('hex');
    expect(h).toBe('65f7a6f36069bdc7612196947a7ee8adba50766455b2008ae69a1ce062900007');
  });
});

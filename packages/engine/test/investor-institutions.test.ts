import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { careerOrgs } from '../src/allocator.js';
import { usdToLocal } from '../src/helpers.js';
import { playerView } from '../src/views.js';
import type { World } from '../src/types.js';
import { GP, setup } from './investor-helpers.js';
import {
  addInvestor,
  careerWorld,
  makeWorld,
  negativeInternalAccounts,
  run,
  settle,
  tryRun,
} from './helpers.js';

const rung4 = (w: World) =>
  produce(w, (d) => {
    d.players[GP]!.career!.reached[4] = d.markets.lagos!.month;
  });

describe('a player-run accelerator (Phase 9)', () => {
  it('needs rung 4', () => {
    const w = setup(81);
    const r = tryRun(w, GP, {
      type: 'accelerator.found',
      name: 'Yaba Forge',
      cheque: 1,
      equityBps: 700,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('accel.rung');
  });

  it('admits startups on a SAFE; they join the cohort and pitch at demo day', () => {
    let w = rung4(setup(82));
    const cheque = usdToLocal(w, w.markets.lagos!, 20_000);
    w = run(w, GP, { type: 'accelerator.found', name: 'Yaba Forge', cheque, equityBps: 700 }).world;
    const c = Object.values(w.companies).find(
      (x) => x.ai && x.market === 'lagos' && x.status === 'active' && !x.ipo && !x.accelerator,
    )!;
    const before = w.positions[`${GP}:${c.id}`]?.invested ?? 0;
    const r = run(w, GP, { type: 'accelerator.admit', companyId: c.id });
    w = r.world;
    expect(r.result.status).toBe('accepted');
    expect(w.companies[c.id]!.accelerator!.name).toBe('Yaba Forge');
    expect(w.positions[`${GP}:${c.id}`]!.invested - before).toBe(cheque);
    expect(w.players[GP]!.milestones['investor.accelerator']).toBeDefined();
    const demo = w.companies[c.id]!.accelerator!.demoDayMonth;
    w = settle(w, 'lagos', demo - w.markets.lagos!.month + 1);
    expect(w.players[GP]!.milestones['investor.demo-day']).toBeDefined();
    const hof = playerView(w, GP)!.hallOfFame!;
    expect(hof.accelerators[0]!.name).toBe('Yaba Forge');
    expect(hof.accelerators[0]!.demoDays).toBe(1);
    expect(negativeInternalAccounts(w)).toEqual([]);
  });
});

describe('institutions (Phase 9)', () => {
  it('a sovereign fund hires a managing director in investor-career worlds; that is rung 8', () => {
    const plain = addInvestor(makeWorld(83, ['dubai' as never]), 'u_investor', 'dubai' as never);
    expect(
      careerOrgs(plain, plain.players.u_investor!).some((o) => o.orgKind === 'sovereign'),
    ).toBe(false);
    let w = addInvestor(careerWorld(83, ['dubai' as never]), 'u_investor', 'dubai' as never);
    w = run(w, 'u_investor', { type: 'investor.tutorial', action: 'skip' }).world;
    const orgs = careerOrgs(w, w.players.u_investor!);
    const swf = orgs.find((o) => o.orgKind === 'sovereign');
    expect(swf).toBeTruthy();
    w = run(w, 'u_investor', { type: 'career.join', orgKind: 'sovereign' }).world;
    expect(w.players.u_investor!.allocator!.career!.orgKind).toBe('sovereign');
    expect(playerView(w, 'u_investor')!.investorCareer!.rungs.find((r) => r.n === 8)!.status).toBe(
      'reached',
    );
  });

  it('the hall of fame ranks investors by realised gains', () => {
    let w = setup(84);
    w = produce(w, (d) => {
      d.players[GP]!.realised = {
        currency: 'NGN',
        proceeds: 10_000_000_00,
        gains: 5_000_000_00,
        tax: 0,
      };
    });
    w = run(w, GP, { type: 'player.seen' }).world;
    const hof = playerView(w, GP)!.hallOfFame!;
    expect(hof.investors[0]!.id).toBe(GP);
  });
});

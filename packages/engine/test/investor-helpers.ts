/** Shared setup for the investor career's fund tests (Phases 4–6). */
import { produce } from 'immer';
import { playerView } from '../src/views.js';
import type { Command } from '../src/commands.js';
import type { World } from '../src/types.js';
import { addInvestor, careerWorld, run } from './helpers.js';

export const GP = 'u_investor';
export const LP = 'u_lp';

/** A GP at rung 3 (four deals, 3.5★, cash returned) and a wealthy player LP. */
export function setup(seed = 31, anchor = true) {
  let w = addInvestor(careerWorld(seed));
  w = addInvestor(w, LP);
  w = run(w, GP, { type: 'investor.tutorial', action: 'skip' }).world;
  w = run(w, LP, { type: 'investor.tutorial', action: 'skip' }).world;
  w = produce(w, (d) => {
    d.players[GP]!.stars.value = 3.5;
    const ids = Object.values(d.companies)
      .filter((c) => c.market === 'lagos' && c.status === 'active')
      .slice(0, 4)
      .map((c) => c.id);
    for (const cid of ids)
      d.positions[`${GP}:${cid}`] = {
        investorId: GP,
        companyId: cid,
        invested: 1_000_00,
        returned: 2_000_00,
        month: 0,
        writtenOff: false,
      };
  });
  w = run(w, GP, { type: 'player.seen' }).world;
  w = topUp(w, GP, 2_000_000_000_00);
  w = topUp(w, LP, 4_000_000_000_00);
  if (anchor) {
    const inv = playerView(w, GP)!.investorCareer!.invitations.find((x) => x.kind === 'anchor')!;
    w = run(w, GP, { type: 'career.invitation', invitationId: inv.id, accept: true }).world;
  }
  return w;
}

export const target = (w: World) => w.players[GP]!.career!.anchor?.amount ?? 500_000_000_00;

/** Give a player more savings (from the outside world), so big LP cheques fit. */
export const topUp = (w: World, id: string, amount: number) =>
  produce(w, (d) => {
    d.accounts[d.players[id]!.accounts.local]!.balance += amount;
    d.accounts[d.markets.lagos!.ext.genesis]!.balance -= amount;
  });

export function launch(w: World, t: number): { world: World; fundId: string } {
  const cmd: Command = {
    type: 'fund.launch',
    sectors: ['fintech'],
    stages: ['seed'],
    checkSize: Math.round(t / 40),
    why: 'Payment rails for traders across West Africa',
    strategy: 'seed',
    target: t,
    minCommit: Math.round(t / 50),
    feeRate: 0.02,
    carry: 0.2,
    hurdle: 0,
    gpCommit: 0.02,
    termMonths: 48,
    investMonths: 24,
    keyPerson: true,
  };
  const r = run(w, GP, cmd);
  return { world: r.world, fundId: r.result.fundId };
}

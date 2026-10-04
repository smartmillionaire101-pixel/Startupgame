/**
 * Economy report: simulate a world for N game months with a few scripted
 * founders and print the health numbers the live-ops dashboard tracks
 * (§20 "Running the live game"): survival, revenue, money supply, stars.
 *
 *   npm run sim -- --months 24 --seed 7
 */
import { dispatch } from '../src/dispatch.js';
import { createWorld } from '../src/world.js';
import { economyDashboard } from '../src/views.js';
import { formatMoney } from '../src/money.js';
import type { Command } from '../src/commands.js';
import type { World } from '../src/types.js';
import { LAUNCH_MARKETS } from '../src/data/markets.js';

const arg = (name: string, fallback: number) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? Number(process.argv[i + 1]) : fallback;
};
const MONTHS = arg('months', 24);
const SEED = arg('seed', 7);
const T0 = Date.UTC(2026, 0, 1, 12);
const DAY = 86_400_000;

let world: World = createWorld({ seed: SEED, now: T0 });
const exec = (actor: string | null, cmd: Command, now = T0) => {
  const r = dispatch(world, cmd, { actorId: actor, now });
  if (r.ok) world = r.world;
  return r;
};

// Three scripted human founders per market with different styles.
const styles = ['frugal', 'balanced', 'aggressive'] as const;
for (const market of LAUNCH_MARKETS) {
  styles.forEach((style, i) => {
    const id = `sim_${market}_${style}`;
    exec(id, {
      type: 'player.create',
      handle: id.slice(0, 20),
      name: `${style} founder`,
      role: 'founder',
      backgroundId: 'f-engineer',
      market,
      company: {
        name: `Sim ${market.slice(0, 3)} ${style}`,
        industry: (['fintech', 'saas', 'logistics'] as const)[i]!,
        revenueModel: 'subscription',
        idea: 'A simulated company',
        incorporation: 'local',
      },
    });
  });
}

for (let month = 1; month <= MONTHS; month++) {
  const now = T0 + month * DAY;
  for (const p of Object.values(world.players)) {
    if (p.ai) continue;
    const c = world.companies[p.companyIds[0]!];
    if (!c || c.status !== 'active') continue;
    const m = world.markets[c.market]!;
    const col = m.data.costOfLiving * 100;
    const style = p.id.split('_')[2];
    if (month === 1)
      exec(
        p.id,
        { type: 'company.discovery', companyId: c.id, segmentKey: c.targetSegments[0]! },
        now,
      );
    exec(p.id, { type: 'company.build', companyId: c.id, hours: 60 }, now);
    const cash = world.accounts[c.account]!.balance;
    const budget = style === 'frugal' ? col * 0.3 : style === 'balanced' ? col : col * 3;
    exec(
      p.id,
      {
        type: 'company.strategy',
        companyId: c.id,
        marketingBudget: Math.round(Math.min(budget, cash / 6)),
      },
      now,
    );
    if (style === 'aggressive' && month % 3 === 1) {
      const cand = m.talent.find((t) => t.role === 'engineer');
      if (cand)
        exec(
          p.id,
          {
            type: 'company.offer',
            companyId: c.id,
            candidateId: cand.id,
            salary: Math.round(cand.ask * 1.2),
            equityBps: 25,
          },
          now,
        );
    }
    if (month % 4 === 2 && !c.lastRound) {
      const fund = Object.values(world.funds).find(
        (f) =>
          f.market === c.market &&
          f.stages.includes('pre-seed') &&
          (f.sectors === 'any' || f.sectors.includes(c.industry)),
      );
      if (fund) {
        const s = exec(
          p.id,
          {
            type: 'pitch.start',
            companyId: c.id,
            fundId: fund.id,
            slides: ['problem', 'product', 'team'],
            ask: fund.check[0],
          },
          now,
        );
        if (s.ok && (s.result as { status: string }).status === 'questions') {
          const pid = (s.result as { pitchId: string }).pitchId;
          const answers = Object.fromEntries(
            world.pitches[pid]!.questions.map((q) => [q.id, 'honest']),
          );
          const a = exec(p.id, { type: 'pitch.answer', pitchId: pid, answers }, now);
          const dealId = a.ok ? (a.result as { dealId?: string }).dealId : undefined;
          if (dealId) exec(p.id, { type: 'deal.act', dealId, action: 'accept' }, now);
        }
      }
    }
  }
  for (const market of LAUNCH_MARKETS) {
    const last = world.markets[market]!.lastSettledDate!;
    const d = new Date(`${last}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    exec(null, { type: 'market.settle', market, date: d.toISOString().slice(0, 10) }, now);
  }
}

const dash = economyDashboard(world);
console.log(`\nRunway economy report — seed ${SEED}, ${MONTHS} game months\n`);
console.table(dash.companies);
console.log('Star distribution (0★..5★):', dash.starDistribution.join(' / '));
console.log('\nMoney supply by holder type (net of outside world):');
for (const [cur, row] of Object.entries(dash.moneySupply)) {
  console.log(
    `  ${cur}: players ${formatMoney(row.players, cur as never)}, companies ${formatMoney(row.companies, cur as never)}, funds ${formatMoney(row.funds, cur as never)}`,
  );
}
console.log('\nScripted founders:');
const rows = Object.values(world.players)
  .filter((p) => !p.ai)
  .map((p) => {
    const c = world.companies[p.companyIds[0]!]!;
    const last = c.finance.history.at(-1);
    const cur = world.markets[c.market]!.data.currency;
    return {
      company: c.name,
      status: c.status,
      round: c.lastRound ?? '—',
      customers: last?.customers ?? 0,
      mrr: formatMoney(last?.revenue ?? 0, cur),
      cash: formatMoney(world.accounts[c.account]!.balance, cur),
      staff: c.staff.length,
      fit: c.product.fit.toFixed(2),
      stars: c.stars.value.toFixed(1),
    };
  });
console.table(rows);

/**
 * The AI population's monthly behaviour. Simple, legible policies: AI
 * founders run reasonable companies, AI funds back the best of them, AI
 * corporates make acquisition offers, and AI players step back gradually
 * as real players arrive (§2).
 */
import { closePricedRound, addSafe } from './captable.js';
import { companyRunway, setTargets, shutdownCompany } from './company.js';
import { openDeal, settleExit } from './deals.js';
import { col, getMarket, lastPnl, nextStage, notify, publish, totalCustomers } from './helpers.js';
import { account, transfer } from './ledger.js';
import { clamp } from './math.js';
import { formatMoney, scale } from './money.js';
import type { Rng } from './rng.js';
import { applyStarEvent } from './stars.js';
import { bandSalary, hire } from './staff.js';
import { valueCompany } from './valuation.js';
import { AI_STARTUPS_PER_MARKET, spawnAiStartup } from './world.js';
import type { MarketId } from './data/markets.js';
import type { Company, Fund, World } from './types.js';

/** AI founders: hire when funded, market within means, raise when runway is short, shut down cleanly. */
export function aiFounderPolicy(world: World, c: Company, rng: Rng, month: number) {
  const m = getMarket(world, c.market);
  const cash = account(world, c.account).balance;
  const runway = companyRunway(world, c);
  if (cash <= 0 || (runway < 1 && !c.raising)) {
    shutdownCompany(world, c, 'orderly', month);
    return;
  }
  c.marketingBudget = Math.max(0, Math.round(Math.min(cash / 30, scale(col(m), 3))));
  if (runway > 14 && c.staff.length < 12 && rng.chance(0.4)) {
    const want =
      c.staff.filter((s) => s.role === 'engineer').length <=
      c.staff.filter((s) => s.role === 'sales').length
        ? 'engineer'
        : 'sales';
    const cand = m.talent.find((t) => t.role === want && t.seniority !== 'head');
    if (cand)
      hire(
        world,
        c,
        cand,
        Math.max(cand.ask, bandSalary(world, c.market, cand.role, cand.seniority)),
        0,
        month,
      );
  }
  if (runway < 6 && c.staff.length > 1 && rng.chance(0.3)) {
    c.staff.pop();
  }
  c.raising = runway < 9;
  if (c.targetSegments.length === 0)
    setTargets(world, c, [
      Object.keys(m.segments).find((k) => m.segments[k]!.industry === c.industry)!,
    ]);
}

/** AI funds back AI startups that are raising (so markets move and player marks change). */
export function aiFundsInvest(world: World, market: MarketId, rng: Rng, month: number) {
  const funds = Object.values(world.funds).filter((f) => f.market === market && f.ai);
  for (const c of Object.values(world.companies)) {
    if (!c.ai || c.market !== market || c.status !== 'active' || !c.raising) continue;
    const stage = nextStage(c.lastRound);
    const fund = rng.pick(
      funds
        .filter(
          (f) =>
            (f.sectors === 'any' || f.sectors.includes(c.industry)) && f.stages.includes(stage),
        )
        .concat(funds.slice(0, 1)),
    );
    if (!fund) continue;
    const strength = c.product.fit * 0.5 + c.stars.value / 10 + (lastPnl(c)?.revenue ? 0.1 : 0);
    if (
      !rng.chance(clamp(strength * 0.5 * fund.mood * getMarket(world, market).climate, 0.02, 0.6))
    )
      continue;
    const pre = valueCompany(world, c, stage).value;
    const amount = clamp(Math.round(pre * rng.range(0.12, 0.25)), fund.check[0], fund.check[1]);
    if (account(world, fund.account).balance < amount) continue;
    transfer(world, fund.account, c.account, amount, `Investment (${stage})`, month);
    if (c.capTable.roundsRaised === 0 && (stage === 'pre-seed' || stage === 'seed')) {
      addSafe(c.capTable, { holderId: fund.id, amount, cap: pre + amount, month });
      c.capTable.lastPostMoney = Math.max(c.capTable.lastPostMoney, pre + amount);
    } else {
      closePricedRound(c.capTable, {
        investorId: fund.id,
        amount,
        preMoney: pre,
        poolTopUpBps: 1000,
        multiple: 1,
        participating: false,
      });
    }
    const key = `${fund.id}:${c.id}`;
    const pos = (world.positions[key] ??= {
      investorId: fund.id,
      companyId: c.id,
      invested: 0,
      returned: 0,
      month,
      writtenOff: false,
    });
    pos.invested += amount;
    c.lastRound = stage;
    c.lastRaiseMonth = month;
    c.raising = false;
    applyStarEvent(c.stars, 0.1);
    publish(world, {
      market,
      month,
      outletId: getMarket(world, market).outlets.find((o) => o.type === 'tech')?.id ?? 'tech',
      outletName:
        getMarket(world, market).outlets.find((o) => o.type === 'tech')?.name ?? 'Tech desk',
      kind: 'raise',
      alert: `${c.name} raises ${formatMoney(amount, getMarket(world, market).data.currency)} ${stage}.`,
      headline: `${c.name} raises ${stage} from ${fund.name}`,
      body: `${c.name}, a ${c.industry} startup, raised ${formatMoney(amount, getMarket(world, market).data.currency)} led by ${fund.name}.`,
      starDelta: 0.1,
      verified: true,
      subject: { kind: 'company', id: c.id },
    });
  }
}

/** Fund mood reacts to recent results: write-offs make funds cautious (§9 "A fund that just lost money…"). */
export function updateFundMood(world: World, f: Fund) {
  const positions = Object.values(world.positions).filter((p) => p.investorId === f.id);
  const recentLosses = positions.filter((p) => p.writtenOff).length;
  const wins = positions.filter((p) => p.returned > p.invested).length;
  f.mood = clamp(f.mood + (1 - f.mood) * 0.1 + wins * 0.01 - recentLosses * 0.005, 0.5, 1.5);
}

/** AI corporates make offers based on strategic fit, revenue and stars (§12). */
export function corporateOffers(world: World, market: MarketId, rng: Rng, month: number) {
  const m = getMarket(world, market);
  for (const c of Object.values(world.companies)) {
    if (c.market !== market || c.status !== 'active') continue;
    const pnl = lastPnl(c);
    if (!pnl || pnl.revenue <= 0 || totalCustomers(c) < 200) continue;
    const p = 0.003 + c.stars.value * 0.0015 + (c.forSale ? 0.2 : 0);
    if (!rng.chance(p)) continue;
    const seg = m.segments[c.targetSegments[0] ?? ''];
    const buyer = seg?.incumbentName ?? 'An AI corporate';
    const value = Math.max(
      valueCompany(world, c, nextStage(c.lastRound)).value,
      c.capTable.lastPostMoney,
    );
    const price = Math.round(value * rng.range(0.9, 1.5));
    if (c.ai) {
      // AI founders sell only at a clear premium to their last round.
      if (c.capTable.lastPostMoney > 0 && price >= c.capTable.lastPostMoney * 1.5) {
        settleExit(world, c, price, buyer, 'acquired');
        publish(world, {
          market,
          month,
          outletId: m.outlets.find((o) => o.type === 'national')?.id ?? 'national',
          outletName: m.outlets.find((o) => o.type === 'national')?.name ?? 'National desk',
          kind: 'feature',
          alert: `${buyer} buys ${c.name}.`,
          headline: `${buyer} acquires ${c.name}`,
          body: `${buyer} bought ${c.name} for ${formatMoney(price, m.data.currency)}.`,
          starDelta: 0,
          verified: true,
          subject: { kind: 'company', id: c.id },
        });
      }
      continue;
    }
    const open = Object.values(world.deals).some(
      (d) => d.companyId === c.id && d.status === 'open' && d.terms.kind === 'acquisition',
    );
    if (open) continue;
    openDeal(world, {
      companyId: c.id,
      proposer: { kind: 'corporate', id: buyer },
      counterparty: { kind: 'company', id: c.id },
      terms: { kind: 'acquisition', price, buyer },
      by: buyer,
      aiLimit: { maxValuation: Math.round(price * rng.range(1.05, 1.25)) },
    });
  }
}

/** Keep markets populated; AI founders step back as real founders arrive (AI incumbents stay forever). */
export function maintainPopulation(world: World, market: MarketId, rng: Rng, now: number) {
  const humans = Object.values(world.players).filter(
    (p) => !p.ai && p.market === market && p.role === 'founder',
  ).length;
  const target = Math.max(4, AI_STARTUPS_PER_MARKET - Math.floor(humans / 3));
  const active = Object.values(world.companies).filter(
    (c) => c.ai && c.market === market && c.status === 'active',
  ).length;
  // Population upkeep must never block a settlement; a failed spawn simply waits a month.
  if (active < target && rng.chance(0.5)) {
    try {
      spawnAiStartup(world, market, rng, now);
    } catch {
      /* try again next month */
    }
  }
}

/** Inactive players (§2): warnings at 30 real days, offered for sale at 60. */
export function inactivity(world: World, market: MarketId, now: number, month: number) {
  const DAY = 86_400_000;
  for (const p of Object.values(world.players)) {
    if (p.ai || p.market !== market) continue;
    const idle = now - p.lastActiveAt;
    if (idle >= 30 * DAY && !p.inactivity.warned) {
      p.inactivity.warned = true;
      notify(world, p.id, {
        month,
        kind: 'warning',
        text: 'You’ve been away 30 days. Your company is in maintenance mode.',
      });
    }
    if (idle >= 60 * DAY && !p.inactivity.forSale) {
      p.inactivity.forSale = true;
      for (const id of p.companyIds) {
        const c = world.companies[id];
        if (!c || c.status !== 'active') continue;
        c.forSale = true;
        notify(world, p.id, {
          month,
          kind: 'warning',
          text: `${c.name} is now offered for sale. Investors and co-founders get first vote.`,
        });
      }
    }
    if (idle < DAY) p.inactivity = { warned: false, forSale: false };
  }
}

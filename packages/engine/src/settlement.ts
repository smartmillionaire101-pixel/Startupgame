/**
 * Monthly settlement for one market (§2 "The clock"). Runs at local midnight
 * in that market: salaries, revenue, interest, loan repayments, taxes, rent,
 * lifestyle — then the AI world moves.
 *
 * Deterministic: the RNG stream is derived from (world seed, market, month).
 */
import {
  aiFounderPolicy,
  aiFundsInvest,
  corporateOffers,
  inactivity,
  maintainPopulation,
  updateFundMood,
} from './ai.js';
import { angelsInvest } from './angels.js';
import { settleCompany } from './company.js';
import { updateLenderAppetite } from './capital.js';
import { settleSegment } from './customers.js';
import { expireDeals } from './deals.js';
import { holdDueEvents } from './events.js';
import { settleEconomy } from './economy.js';
import { settleFundFees } from './funds.js';
import { payDividends } from './travel.js';
import { settleVotes } from './governance.js';
import { aiBanking, settleBanks } from './banks.js';
import { settleDisputes } from './arbitration.js';
import {
  aiProcurement,
  detectFakeRevenue,
  ensureAiListings,
  settleContracts,
  supplyEffects,
} from './marketplace.js';
import type { MarketId } from './data/markets.js';
import { localDate } from './clock.js';
import { getMarket } from './helpers.js';
import { clamp } from './math.js';
import { economicNote, reporterOutreach } from './media.js';
import { settlePerson } from './personal.js';
import { deriveRng } from './rng.js';
import { settleStars } from './stars.js';
import { refreshTalent } from './staff.js';
import type { Player, World } from './types.js';

/** Months a shut-down company's name stays reserved for its founder (open question §21). */
export const NAME_RESERVATION_MONTHS = 12;

function playerPerformance(world: World, p: Player): number {
  // Bankers are judged by their bank.
  const bank = Object.values(world.banks).find(
    (b) => b.ownerId === p.id && b.status === 'licensed',
  );
  if (p.role === 'banker' && bank) return bank.stars.value;
  if (p.role === 'investor') {
    const pos = Object.values(world.positions).filter(
      (x) => x.investorId === p.id || x.investorId === p.investor?.fundId,
    );
    if (pos.length === 0) return p.stars.anchor;
    const invested = pos.reduce((a, x) => a + x.invested, 0);
    const returned = pos.reduce((a, x) => a + x.returned, 0);
    const dpi = invested > 0 ? returned / invested : 0;
    return clamp(
      1 +
        Math.min(1.5, pos.length * 0.15) +
        Math.min(2, dpi) -
        pos.filter((x) => x.writtenOff).length * 0.1,
      0,
      5,
    );
  }
  const companies = p.companyIds
    .map((id) => world.companies[id])
    .filter((c) => c && c.status === 'active');
  if (companies.length === 0) return p.stars.anchor;
  return companies.reduce((a, c) => a + c!.stars.value, 0) / companies.length;
}

export function settleMarket(
  world: World,
  marketId: MarketId,
  now: number,
  clock: { at?: number; date?: string; monthMs?: number } = {},
) {
  const m = getMarket(world, marketId);
  m.month += 1;
  const month = m.month;
  const rng = deriveRng(world.seed, 'settle', marketId, month);
  const active = () =>
    Object.values(world.companies).filter((c) => c.market === marketId && c.status === 'active');

  for (const c of active()) if (c.ai || c.aiCeo) aiFounderPolicy(world, c, rng, month);

  // B2B marketplace (§6): its own RNG stream so it never shifts other systems' draws.
  const b2bRng = deriveRng(world.seed, 'b2b', marketId, month);
  ensureAiListings(world, marketId, b2bRng);
  aiProcurement(world, marketId, b2bRng);
  for (const c of active()) {
    c.supply = supplyEffects(world, c);
    // A supplier that failed last month leaves a month of disruption.
    if (c.supplyDisruptionMonth === month - 1) c.supply.reliabilityAdd -= 0.1;
  }
  settleContracts(world, marketId, month);

  // Customers, segment by segment, across every company present in it.
  const isMaintenance = (c: { ai: boolean; lastDecisionMonth: number }) =>
    !c.ai && month - c.lastDecisionMonth > 1;
  for (const seg of Object.values(m.segments)) {
    const present = active().filter(
      (c) => c.targetSegments.includes(seg.key) || c.segments[seg.key],
    );
    settleSegment(seg, present, rng, month, isMaintenance);
  }
  // City events due this month are held now (own RNG stream per event), so their
  // customer leads count in this month's revenue.
  holdDueEvents(world, marketId, month);
  // The city economy (Wave 3): households, local businesses and their trade with
  // startups. Own RNG stream; before companies so purchases count in this month's revenue.
  settleEconomy(world, marketId, month);
  for (const c of active()) {
    settleCompany(world, c, rng, month);
    payDividends(world, c, month);
    if (c.status === 'active') detectFakeRevenue(world, c, month);
  }

  aiFundsInvest(world, marketId, rng, month);
  // AI angels back raising companies, AI and human (own RNG stream: 'angels').
  angelsInvest(world, marketId, month);
  for (const f of Object.values(world.funds)) {
    if (f.market !== marketId) continue;
    updateFundMood(world, f);
    settleFundFees(world, f, month);
  }
  corporateOffers(world, marketId, rng, month);
  // Lenders loosen or tighten with the funding climate (deterministic).
  updateLenderAppetite(m);

  for (const p of Object.values(world.players)) {
    if (p.market !== marketId) continue;
    if (!p.ai) settlePerson(world, p, month);
    settleStars(p.stars, playerPerformance(world, p));
    p.lastMonth = { income: 0, spend: p.lastMonth.spend, tax: 0 };
  }

  // Banks settle after everyone has repaid what they owe this month (§8). Own RNG stream.
  const bankRng = deriveRng(world.seed, 'banks', marketId, month);
  aiBanking(world, marketId, bankRng);
  settleBanks(world, marketId, bankRng, month);

  settleVotes(world, marketId, month);
  settleDisputes(world, marketId, month);
  refreshTalent(world, marketId, rng);
  expireDeals(world, marketId);
  reporterOutreach(world, marketId, rng, month);
  maintainPopulation(world, marketId, rng, now);
  inactivity(world, marketId, now, month, clock.monthMs);

  // Release reserved names of long-closed companies.
  for (const c of Object.values(world.companies)) {
    if (
      c.market === marketId &&
      c.status !== 'active' &&
      c.closedMonth !== null &&
      month - c.closedMonth === NAME_RESERVATION_MONTHS
    ) {
      delete world.names[marketId]![c.handle];
    }
  }

  m.economicNote = economicNote(world, marketId);
  if (clock.at !== undefined) {
    m.settledAt = clock.at;
    m.lastSettledDate = localDate(clock.at, m.data.timeZone);
  } else if (clock.date !== undefined) m.lastSettledDate = clock.date;
}

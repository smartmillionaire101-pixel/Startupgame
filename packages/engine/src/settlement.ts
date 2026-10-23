/**
 * Monthly settlement for one market (§2 "The clock"). Runs once per game
 * month (see clock.ts): salaries, revenue, interest, loan repayments, taxes, rent,
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
import { aiExpansion, settleBranches } from './branches.js';
import { ensureCompetition, resolveCompetitions } from './competitions.js';
import { settleProperties } from './property.js';
import { appointGovernor, settlePrograms } from './programs.js';
import { settleCompany } from './company.js';
import { updateLenderAppetite } from './capital.js';
import { settleSegment } from './customers.js';
import { expireDeals } from './deals.js';
import { holdDueEvents } from './events.js';
import { settleEconomy } from './economy.js';
import { ensureEmployers } from './work.js';
import { ensureGameVenues } from './games.js';
import { settleFundFees } from './funds.js';
import { payDividends } from './travel.js';
import { settleExchange } from './exchange.js';
import { settleSyndicates } from './syndicates.js';
import { settleLpFunds } from './lpfunds.js';
import { settleFirms } from './firms.js';
import { settleDealCraft } from './dealcraft.js';
import { settleFundOps, settlePositionMarks } from './fundops.js';
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
import type { Company, Player, World } from './types.js';
import { investorOn, journeyEventsOn } from './releases.js';
import { rivalPressure, settleRivals } from './rivals.js';
import { settleDecisions } from './decisions.js';
import { settleLifeEvents } from './lifeevents.js';
import { buyShares, sellShares, settlePublicMarket } from './exits.js';
import { settleCareers, settleMentorships } from './allocator.js';

/** Months a shut-down company's name stays reserved for its founder (open question §21). */
export const NAME_RESERVATION_MONTHS = 12;

function playerPerformance(world: World, p: Player): number {
  // Bankers are judged by their bank (only bankers need it looked up).
  const bank =
    p.role === 'banker'
      ? Object.values(world.banks).find((b) => b.ownerId === p.id && b.status === 'licensed')
      : undefined;
  if (bank) return bank.stars.value;
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
  // Journey 4a: rivals weigh on founders' scores (journey-events worlds only).
  const pressure = journeyEventsOn(world) ? (c: Company) => rivalPressure(world, c) : undefined;
  for (const seg of Object.values(m.segments)) {
    const present = active().filter(
      (c) => c.targetSegments.includes(seg.key) || c.segments[seg.key],
    );
    settleSegment(seg, present, rng, month, isMaintenance, pressure);
  }
  // City events due this month are held now (own RNG stream per event), so their
  // customer leads count in this month's revenue.
  holdDueEvents(world, marketId, month);
  // The city economy (Wave 3): households, local businesses and their trade with
  // startups. Own RNG stream; before companies so purchases count in this month's revenue.
  // The jobs rework (jobs worlds only): the city's professional employers open first.
  ensureEmployers(world, marketId, month);
  // More games (more-games worlds only): the bowling alley, skydive centre and heliport.
  ensureGameVenues(world, marketId, month);
  settleEconomy(world, marketId, month);
  // Wave 10: branches trade (before companies settle, so this city's count this month),
  // and now and then an AI company or a thriving local business expands. Own streams.
  settleBranches(world, marketId, month);
  aiExpansion(world, marketId, month);
  for (const c of active()) {
    settleCompany(world, c, rng, month);
    payDividends(world, c, month);
    if (c.status === 'active') detectFakeRevenue(world, c, month);
  }

  aiFundsInvest(world, marketId, rng, month);
  // AI angels back raising companies, AI and human (own RNG stream: 'angels').
  angelsInvest(world, marketId, month);
  // Accelerators, grants and LPs decide; mentoring, demo days, grant reports (Wave 5).
  settlePrograms(world, marketId, month);
  // Investor career Phase 3: syndicates close, offer, refund or pay out (own RNG stream).
  settleSyndicates(world, marketId, month);
  // Investor career Phase 4: funds with an LP book: closes, capital calls, defaults.
  settleLpFunds(world, marketId, month);
  for (const f of Object.values(world.funds)) {
    if (f.market !== marketId) continue;
    updateFundMood(world, f);
    settleFundFees(world, f, month);
  }
  corporateOffers(world, marketId, rng, month);
  // Lenders loosen or tighten with the funding climate (deterministic).
  updateLenderAppetite(m);

  // Wave 10: house prices move; rent, running costs and mortgages (own stream).
  settleProperties(world, marketId, month);

  for (const p of Object.values(world.players)) {
    if (p.market !== marketId) continue;
    if (!p.ai) settlePerson(world, p, month);
    settleStars(p.stars, playerPerformance(world, p));
    p.lastMonth = { income: 0, spend: p.lastMonth.spend, tax: 0 };
  }
  // Investor career Phase 6: firms pay their teams and heads, and add their hours.
  settleFirms(world, marketId, month);

  // Founder Journey 5 (only worlds that used them): institution salaries,
  // mentors' advice, and listed companies' share prices (own stream each).
  settleCareers(world, marketId, month);
  settleMentorships(world, marketId, month);
  settlePublicMarket(world, marketId, month);
  // Investor career (after the note): the exchange's dividends, index, index fund and orders.
  settleExchange(world, marketId, month, { buy: buyShares, sell: sellShares });
  // Investor career Phase 5: marks for investors' positions; funds' metrics, letters and life.
  settlePositionMarks(world, marketId, month);
  settleFundOps(world, marketId, month);

  // Banks settle after everyone has repaid what they owe this month (§8). Own RNG stream.
  const bankRng = deriveRng(world.seed, 'banks', marketId, month);
  aiBanking(world, marketId, bankRng);
  settleBanks(world, marketId, bankRng, month);
  // Each quarter the best human banker may become central bank governor (Wave 5).
  appointGovernor(world, marketId, month);

  settleVotes(world, marketId, month);
  settleDisputes(world, marketId, month);
  refreshTalent(world, marketId, rng);
  // Investor career Phase 8: ghosting, watchlists, inbound pitches by reputation, hot rounds.
  settleDealCraft(world, marketId, month);
  expireDeals(world, marketId);
  // Wave 10: last month's pitch competitions are judged; this month's is announced.
  resolveCompetitions(world, marketId, month);
  ensureCompetition(world, marketId, month);
  // Journey 4a (after the release note only): rivals move, then decision events (own streams).
  settleRivals(world, marketId, month);
  settleDecisions(world, marketId, month);
  // Phase 5 (life-bars worlds only): friends' loans come back, new life events (own streams).
  settleLifeEvents(world, marketId, month);
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
  // Investor career: the month's real length, for insiders' results blackout.
  if (clock.monthMs && investorOn(world)) m.monthMs = clock.monthMs;
  if (clock.at !== undefined) {
    m.settledAt = clock.at;
    m.lastSettledDate = localDate(clock.at, m.data.timeZone);
  } else if (clock.date !== undefined) m.lastSettledDate = clock.date;
}

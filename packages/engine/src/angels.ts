/**
 * AI angel investors as people (Wave 3, section A).
 *
 * Every market has round(4 × angelDepth) (at least 2) AI angels: AI players
 * with role 'investor', a name, background, stars and a personal account
 * funded from the market's genesis account. Each manages a small angel fund
 * built with the ordinary AI fund machinery, so pitches, SAFEs, deal cards,
 * cap tables and portfolio views work unchanged; the fund points back at its
 * angel (`fund.angelId`) and the player at its fund (`player.angel.fundId`).
 * `managerId` stays null: it means "a human runs this fund".
 *
 * Determinism: ids are stable (`ai_angel_<market>_<n>`, `fund_<market>_angel_<n>`)
 * and every draw comes from the 'angels' RNG label, so adding angels never
 * shifts other ids or other systems' draws. No schema step: saved worlds get
 * their angels at the next settlement (`ensureAngels` from maintainPopulation).
 */
import { addSafe } from './captable.js';
import { createAiFund } from './capital.js';
import { BACKGROUNDS } from './data/characters.js';
import { CAPITAL } from './data/capital.js';
import { AI_FIRST_NAMES, AI_LAST_NAMES } from './data/fiction.js';
import { INDUSTRIES } from './data/industries.js';
import type { Industry } from './data/industries.js';
import type { MarketId } from './data/markets.js';
import { openDeal } from './deals.js';
import { getMarket, lastPnl, nextStage } from './helpers.js';
import { account, transfer } from './ledger.js';
import { clamp } from './math.js';
import { normaliseName } from './names.js';
import { deriveRng } from './rng.js';
import { newStars } from './stars.js';
import { valueCompany } from './valuation.js';
import { createPlayer } from './world.js';
import type { Company, Fund, Id, Player, Stage, World } from './types.js';

/** How many AI angels a market keeps: round(4 × angelDepth), at least 2. */
export const angelTarget = (market: MarketId): number =>
  Math.max(2, Math.round(4 * CAPITAL[market].angelDepth));

export const angelPlayerId = (market: MarketId, n: number): Id => `ai_angel_${market}_${n}`;
export const angelFundId = (market: MarketId, n: number): Id => `fund_${market}_angel_${n}`;

/** Angel cheques in USD at London depth; scaled like the market's angel networks. */
const ANGEL_CHECK_USD: [number, number] = [10_000, 50_000];
const ANGEL_STAGES: Stage[] = ['pre-seed', 'seed'];

/** Every angel (active or retired) in a market, oldest first. */
export const marketAngels = (world: World, market: MarketId): Player[] =>
  Object.values(world.players).filter((p) => p.ai && p.angel && p.market === market);

/** Angels still writing cheques. */
export const activeAngels = (world: World, market: MarketId): Player[] =>
  marketAngels(world, market).filter((p) => p.angel!.retiredMonth === undefined);

/** The angel behind a fund, if it is an AI angel's fund. */
export const fundAngel = (world: World, f: Fund): Player | null =>
  f.angelId ? (world.players[f.angelId] ?? null) : null;

function createAngel(world: World, market: MarketId, n: number, now: number): Player {
  const rng = deriveRng(world.seed, 'angels', market, 'person', n);
  const taken = new Set(marketAngels(world, market).map((p) => p.name));
  let name = '';
  for (let i = 0; i < 12 && (!name || taken.has(name)); i++)
    name = `${rng.pick(AI_FIRST_NAMES[market])} ${rng.pick(AI_LAST_NAMES[market])}`;
  const bg = rng.pick(BACKGROUNDS.filter((b) => b.role === 'investor'));
  const id = angelPlayerId(market, n);
  const player = createPlayer(world, {
    playerId: id,
    handle: `${normaliseName(name).replace(/[^a-z0-9]/g, '')}${n}`.slice(0, 20),
    name,
    role: 'investor',
    backgroundId: bg.id,
    market,
    now,
    ai: true,
    accountId: `acc_${id}`,
  });
  player.stars = newStars(Math.round((bg.stars + rng.range(0, 1.5)) * 10) / 10);

  const depth = CAPITAL[market].angelDepth;
  const factor = 0.25 + 0.75 * depth;
  const round = (x: number) => Math.max(1_000, Math.round((x * factor) / 1_000) * 1_000);
  const sectors: Industry[] | 'any' = rng.chance(0.4)
    ? 'any'
    : [...new Set([rng.pick(INDUSTRIES), rng.pick(INDUSTRIES)])];
  const names = (world.names[market] ??= {});
  let fundName = `${name} Angel Fund`;
  if (names[normaliseName(fundName)]) fundName = `${name} Angel Fund ${n + 1}`;
  const fund = createAiFund(
    world,
    market,
    {
      name: fundName,
      partner: name,
      sectors,
      stages: ANGEL_STAGES as ('pre-seed' | 'seed')[],
      check: [round(ANGEL_CHECK_USD[0]), round(ANGEL_CHECK_USD[1])],
      minStars: 0,
    },
    angelFundId(market, n),
  );
  fund.angelId = player.id;
  fund.thesis = `Angel · ${sectors === 'any' ? 'any sector' : sectors.join(', ')} · pre-seed, seed`;
  names[normaliseName(fundName)] ??= 'ai';
  player.investor = {
    sectors: sectors === 'any' ? [] : sectors,
    stages: [...ANGEL_STAGES],
    checkSize: Math.round((fund.check[0] + fund.check[1]) / 2),
    lpCredibility: bg.lpCredibility ?? 0.3,
    founderTrust: bg.founderTrust ?? 0.5,
    fundId: fund.id,
  };
  player.angel = { fundId: fund.id };
  return player;
}

/**
 * Keep the market's angel count: angels whose fund can no longer write its
 * smallest cheque retire, and missing ones are created (new markets, saved
 * worlds from before Wave 3, replacements). Never blocks a settlement.
 */
export function ensureAngels(world: World, market: MarketId, now: number) {
  const m = getMarket(world, market);
  for (const p of activeAngels(world, market)) {
    const f = world.funds[p.angel!.fundId];
    if (!f || account(world, f.account).balance < f.check[0]) p.angel!.retiredMonth = m.month;
  }
  let active = activeAngels(world, market).length;
  const target = angelTarget(market);
  for (let n = 0; active < target && n < target + 50; n++) {
    if (world.players[angelPlayerId(market, n)] || world.funds[angelFundId(market, n)]) continue;
    createAngel(world, market, n, now);
    active += 1;
  }
}

/** Most angel SAFEs one company takes before its priced round. */
const MAX_ANGELS_PER_COMPANY = 3;

/**
 * Would this company take an angel cheque? AI founders say so by raising, or
 * take one while young (two years or less); human founders show it by
 * raising or pitching in the last three months.
 */
function isRaising(c: Company, month: number, pitched: Set<Id>): boolean {
  if (c.raising) return true;
  if (c.ai || c.aiCeo) return month - c.foundedMonth <= 24;
  return pitched.has(c.id);
}

const angelSafes = (world: World, c: Company) =>
  c.capTable.safes.filter((s) => !!world.funds[s.holderId]?.angelId).length;

/**
 * Monthly: each active angel looks at the companies raising in its market
 * and backs at most one. AI companies take the SAFE straight away; human
 * founders get a SAFE offer on a deal card (accept, counter or let it lapse).
 * Angels only write pre-priced cheques (SAFEs) and never twice into the same
 * company. Own RNG stream ('angels'), so other systems' draws never shift.
 */
export function angelsInvest(world: World, market: MarketId, month: number) {
  const m = getMarket(world, market);
  const rng = deriveRng(world.seed, 'angels', market, month);
  // Looked up once per settlement, not per angel and company.
  const pitched = new Set(
    Object.values(world.pitches)
      .filter((p) => p.month >= month - 3)
      .map((p) => p.companyId),
  );
  const angelDeals = Object.values(world.deals).filter(
    (d) =>
      d.market === market &&
      d.terms.kind === 'investment' &&
      d.proposer.kind === 'fund' &&
      !!world.funds[d.proposer.id]?.angelId,
  );
  for (const angel of activeAngels(world, market)) {
    const fund = world.funds[angel.angel!.fundId];
    if (!fund) continue;
    const candidates = Object.values(world.companies).filter((c) => {
      if (c.market !== market || c.status !== 'active' || c.bannedFromRaising) return false;
      if (c.capTable.roundsRaised > 0 || !isRaising(c, month, pitched)) return false;
      if (!fund.stages.includes(nextStage(c.lastRound))) return false;
      if (fund.sectors !== 'any' && !fund.sectors.includes(c.industry)) return false;
      if (world.positions[`${fund.id}:${c.id}`]) return false;
      if (angelSafes(world, c) >= MAX_ANGELS_PER_COMPANY) return false;
      // One open offer per company from angels at a time; no repeat offers from this angel.
      return !angelDeals.some(
        (d) =>
          d.companyId === c.id &&
          (d.status === 'open' || (d.proposer.id === fund.id && month - d.createdMonth < 6)),
      );
    });
    if (candidates.length === 0) continue;
    const c = rng.pick(candidates);
    const strength = c.product.fit * 0.5 + c.stars.value / 10 + (lastPnl(c)?.revenue ? 0.1 : 0);
    if (!rng.chance(clamp(strength * 0.4 * fund.mood * m.climate, 0.03, 0.45))) continue;
    const stage = nextStage(c.lastRound);
    const pre = valueCompany(world, c, stage).value;
    const cash = account(world, fund.account).balance;
    const amount = Math.min(
      cash,
      clamp(Math.round(pre * rng.range(0.03, 0.08)), fund.check[0], fund.check[1]),
    );
    const cap = Math.round(pre * rng.range(0.9, 1.1)) + amount;
    if (amount < fund.check[0] || cap <= amount * 1.5) continue;
    if (c.ai || c.aiCeo) {
      transfer(world, fund.account, c.account, amount, `Angel investment (${stage})`, month);
      addSafe(c.capTable, { holderId: fund.id, amount, cap, month });
      c.capTable.lastPostMoney = Math.max(c.capTable.lastPostMoney, cap);
      const pos = (world.positions[`${fund.id}:${c.id}`] ??= {
        investorId: fund.id,
        companyId: c.id,
        invested: 0,
        returned: 0,
        month,
        writtenOff: false,
      });
      pos.invested += amount;
      continue;
    }
    // openDeal tells the founders: a new deal card from "<angel> Angel Fund".
    const deal = openDeal(world, {
      companyId: c.id,
      proposer: { kind: 'fund', id: fund.id },
      counterparty: { kind: 'company', id: c.id },
      terms: {
        kind: 'investment',
        instrument: 'safe',
        stage,
        amount,
        valuation: cap,
        liquidationMultiple: 1,
        participating: false,
        proRata: false,
        boardSeat: false,
        vetoOnSale: false,
        poolTopUpBps: 0,
      },
      by: fund.id,
      aiLimit: { maxValuation: Math.round(cap * 1.15), maxAmount: fund.check[1] },
    });
    angelDeals.push(deal);
  }
}

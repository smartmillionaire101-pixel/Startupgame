/**
 * Institutions and legacy (investor blueprint §8.1, §10.5, Phase 9):
 *
 *  - A player-run accelerator: a fund manager (rung 4) runs cohorts of small
 *    SAFE cheques, from a fund they run or their own money. Admitted
 *    companies get the programme the city's accelerators give (monthly
 *    mentoring, a demo day at the cohort's end: programs.ts), and the
 *    ecosystem builder's demo days make the news.
 *  - The hall of fame: league tables across every city: funds by cash
 *    returned, investors by realised gains, firms by assets, syndicate leads
 *    by carry, accelerators by cohorts.
 *
 * Deeper institution roles (a sovereign fund) live with the other careers
 * in allocator.ts; succession lives with the firm (firms.ts).
 */
import { checkPersonalCap } from './career.js';
import { INVESTOR } from './data/investor.js';
import { aiRespond, openDeal } from './deals.js';
import { ensure } from './errors.js';
import { checkFundCheque } from './fundops.js';
import { achieve, getCompany, getMarket, nextStage, notify, usdToLocal } from './helpers.js';
import { fundCanInvest } from './lpfunds.js';
import { account, costIn, valueIn } from './ledger.js';
import { roundTo } from './math.js';
import { formatMoney } from './money.js';
import { demoDayFor } from './programs.js';
import { investorOn } from './releases.js';
import { valueCompany } from './valuation.js';
import type { MarketId } from './data/markets.js';
import type { Company, Id, InvestmentTerms, Player, PlayerAccelerator, World } from './types.js';

/** Cheques and equity a player-run accelerator may set. */
export const PLAYER_ACCELERATOR = {
  equityBps: [500, 1000] as const,
  chequeUsd: [10_000, 150_000] as const,
  cohortSize: 6,
} as const;

const accelOf = (world: World): Record<Id, PlayerAccelerator> => (world.playerAccelerators ??= {});
/** Read-only (views): never creates the map. */
const accels = (world: World): Record<Id, PlayerAccelerator> => world.playerAccelerators ?? {};

export const playerAccelId = (id: Id) => `pacc:${id}`;

/** `accelerator.found`: start a programme (rung 4: you run a fund). */
export function foundAccelerator(
  world: World,
  me: Player,
  args: { name: string; cheque: number; equityBps: number; fundId?: Id },
) {
  ensure(investorOn(world), 'accel.off', 'Not available yet.');
  ensure(
    me.career?.reached[4] !== undefined,
    'accel.rung',
    'An accelerator comes once you run a fund (rung 4).',
  );
  ensure(
    !Object.values(accels(world)).some((a) => a.ownerId === me.id),
    'accel.exists',
    'You already run an accelerator.',
  );
  const name = args.name.trim();
  ensure(name.length >= 3 && name.length <= 40, 'accel.name', 'Name it (3–40 characters).');
  const m = getMarket(world, me.market);
  const [lo, hi] = PLAYER_ACCELERATOR.chequeUsd;
  const min = usdToLocal(world, m, lo);
  const max = usdToLocal(world, m, hi);
  ensure(
    args.cheque >= min && args.cheque <= max,
    'accel.cheque',
    `Cheques of ${formatMoney(min, m.data.currency)}–${formatMoney(max, m.data.currency)}.`,
  );
  const [elo, ehi] = PLAYER_ACCELERATOR.equityBps;
  ensure(
    args.equityBps >= elo && args.equityBps <= ehi,
    'accel.equity',
    `Take ${elo / 100}–${ehi / 100}% for the cheque.`,
  );
  if (args.fundId)
    ensure(world.funds[args.fundId]?.managerId === me.id, 'accel.fund', 'Use a fund you run.');
  const id = `${me.id}:accel`;
  accelOf(world)[id] = {
    id,
    ownerId: me.id,
    fundId: args.fundId ?? null,
    name,
    market: m.id,
    cheque: args.cheque,
    equityBps: args.equityBps,
    month: m.month,
    admitted: [],
    demoDays: 0,
  };
  return {
    acceleratorId: id,
    message: `${name} is open: admit startups for ${formatMoney(args.cheque, m.data.currency)} each.`,
  };
}

/**
 * `accelerator.admit`: offer a startup a place and a SAFE. AI founders answer
 * at once; human founders get a deal card. Joining happens when the deal closes.
 */
export function admitToAccelerator(world: World, me: Player, companyId: Id) {
  const a = Object.values(accels(world)).find((x) => x.ownerId === me.id);
  ensure(a, 'accel.none', 'Start your accelerator first.');
  const c = getCompany(world, companyId);
  ensure(c.market === a.market, 'accel.market', 'Admit startups in your accelerator’s city.');
  ensure(c.status === 'active' && !c.ipo, 'accel.company', 'Admit an operating, unlisted startup.');
  ensure(!c.founderIds.includes(me.id), 'invest.self', 'You can’t admit your own company.');
  ensure(
    !c.accelerator || c.accelerator.demoDayDone,
    'accel.busy',
    `${c.name} is already in a programme.`,
  );
  const live = a.admitted.filter(
    (id) =>
      world.companies[id]?.accelerator?.acceleratorId === playerAccelId(a.id) &&
      !world.companies[id]?.accelerator?.demoDayDone,
  );
  ensure(
    live.length < PLAYER_ACCELERATOR.cohortSize,
    'accel.full',
    `A cohort takes ${PLAYER_ACCELERATOR.cohortSize} startups.`,
  );
  const m = getMarket(world, c.market);
  const fund = a.fundId ? world.funds[a.fundId] : undefined;
  const cap = Math.round((a.cheque * 10_000) / a.equityBps);
  if (fund) {
    const why = fundCanInvest(world, fund, c.id);
    ensure(!why, 'fund.notInvesting', why ?? '');
    checkFundCheque(world, fund, c, a.cheque);
  } else checkPersonalCap(world, me, m.data.currency, a.cheque);
  const from = fund?.account ?? me.accounts.local;
  const acc = account(world, from);
  ensure(
    acc.balance >= costIn(world, a.cheque, m.data.currency, acc.currency),
    'accel.funds',
    'Not enough money for the cheque.',
  );
  const terms: InvestmentTerms = {
    kind: 'investment',
    instrument: 'safe',
    stage: nextStage(c.lastRound),
    amount: a.cheque,
    valuation: cap,
    liquidationMultiple: 1,
    participating: false,
    proRata: true,
    boardSeat: false,
    vetoOnSale: false,
    poolTopUpBps: 0,
    accelerator: a.id,
  };
  const model = valueCompany(world, c, terms.stage).value;
  const deal = openDeal(world, {
    companyId: c.id,
    proposer: fund ? { kind: 'fund', id: fund.id } : { kind: 'player', id: me.id },
    counterparty: { kind: 'company', id: c.id },
    terms,
    by: me.id,
    // Founders weigh the programme too: they take a lower cap from an accelerator.
    aiLimit: { minValuation: Math.round(model * 0.6), maxAmount: Math.round(model * 0.3) },
  });
  if (c.ai) aiRespond(world, deal);
  return {
    dealId: deal.id,
    status: deal.status,
    message:
      deal.status === 'accepted'
        ? `${c.name} joined ${a.name}.`
        : deal.status === 'declined'
          ? `${c.name} said no to ${a.name}.`
          : `Offer sent to ${c.name}.`,
  };
}

/** The deal closed (deals.ts): the company joins the cohort; demo day at the cohort's end. */
export function joinAccelerator(world: World, c: Company, acceleratorId: Id) {
  const a = accels(world)[acceleratorId];
  if (!a) return;
  const m = getMarket(world, c.market);
  const owner = world.players[a.ownerId];
  c.accelerator = {
    acceleratorId: playerAccelId(a.id),
    market: c.market,
    name: a.name,
    mentor: owner?.name ?? a.name,
    joinedMonth: m.month,
    demoDayMonth: demoDayFor(m.month),
  };
  if (!a.admitted.includes(c.id)) a.admitted.push(c.id);
  if (owner)
    achieve(
      world,
      owner,
      'investor.accelerator',
      'Ran an accelerator',
      getMarket(world, owner.market).month,
    );
}

/** Demo day held (programs.ts) for a player-run accelerator: the ecosystem builder's moment. */
export function playerDemoDay(world: World, acceleratorId: string, cohort: Company[]) {
  if (!acceleratorId.startsWith('pacc:')) return;
  const a = accels(world)[acceleratorId.slice(5)];
  if (!a) return;
  a.demoDays += 1;
  const owner = world.players[a.ownerId];
  if (!owner) return;
  const month = getMarket(world, owner.market).month;
  achieve(world, owner, 'investor.demo-day', 'Hosted a demo day', month);
  notify(world, owner.id, {
    month,
    kind: 'milestone',
    text: `${a.name} held its demo day: ${cohort.map((c) => c.name).join(', ')} pitched the city's investors.`,
  });
}

export function acceleratorView(world: World, p: Player) {
  if (!investorOn(world) || p.ai) return null;
  const a = Object.values(accels(world)).find((x) => x.ownerId === p.id);
  const m = getMarket(world, p.market);
  return {
    canFound: p.career?.reached[4] !== undefined,
    limits: {
      cheque: [
        usdToLocal(world, m, PLAYER_ACCELERATOR.chequeUsd[0]),
        usdToLocal(world, m, PLAYER_ACCELERATOR.chequeUsd[1]),
      ],
      equityBps: PLAYER_ACCELERATOR.equityBps,
      cohortSize: PLAYER_ACCELERATOR.cohortSize,
      currency: m.data.currency,
    },
    accelerator: a
      ? {
          ...a,
          currency: getMarket(world, a.market).data.currency,
          fundName: a.fundId ? (world.funds[a.fundId]?.name ?? null) : null,
          cohort: a.admitted
            .map((id) => world.companies[id])
            .filter((c): c is Company => !!c)
            .map((c) => ({
              companyId: c.id,
              name: c.name,
              status: c.status,
              demoDayMonth:
                c.accelerator?.acceleratorId === playerAccelId(a.id)
                  ? c.accelerator.demoDayMonth
                  : null,
              done:
                c.accelerator?.acceleratorId !== playerAccelId(a.id) ||
                !!c.accelerator?.demoDayDone,
            })),
        }
      : null,
  };
}

// ---------------------------------------------------------------- the hall of fame

/** League tables across every city (§10.5, Phase 9). Amounts in US dollars. */
export function hallOfFame(world: World) {
  if (!investorOn(world)) return null;
  const usd = (v: number, market: MarketId) =>
    valueIn(world, v, getMarket(world, market).data.currency, 'USD');
  const funds = Object.values(world.funds)
    .filter((f) => f.lp && !f.ai && f.managerId && f.lp.paidIn > 0)
    .map((f) => ({
      id: f.id,
      name: f.name,
      manager: world.players[f.managerId!]?.name ?? f.partner,
      dpi: roundTo(f.lp!.commitments.reduce((a, c) => a + c.distributed, 0) / f.lp!.paidIn, 2),
      sizeUsd: usd(f.size, f.market),
    }))
    .sort((a, b) => b.dpi - a.dpi || b.sizeUsd - a.sizeUsd)
    .slice(0, 5);
  const investors = Object.values(world.players)
    .filter(
      (p) => !p.ai && p.realised && p.realised.gains > 0 && (p.role === 'investor' || !!p.investor),
    )
    .map((p) => ({
      id: p.id,
      name: p.name,
      gainsUsd: valueIn(world, p.realised!.gains, p.realised!.currency, 'USD'),
    }))
    .sort((a, b) => b.gainsUsd - a.gainsUsd)
    .slice(0, 5);
  const firms = Object.values(world.firms ?? {})
    .map((f) => ({
      id: f.id,
      name: f.name,
      head: world.players[f.succession?.successorId ?? f.ownerId]?.name ?? '',
      aumUsd: f.fundIds.reduce(
        (a, id) => a + (world.funds[id] ? usd(world.funds[id]!.size, world.funds[id]!.market) : 0),
        0,
      ),
      stars: roundTo(f.stars.value, 1),
    }))
    .sort((a, b) => b.aumUsd - a.aumUsd)
    .slice(0, 5);
  const leads = new Map<Id, number>();
  for (const s of Object.values(world.syndicates ?? {}))
    if (s.carryPaid > 0)
      leads.set(s.leadId, (leads.get(s.leadId) ?? 0) + usd(s.carryPaid, s.market));
  const syndicateLeads = [...leads.entries()]
    .map(([id, carryUsd]) => ({ id, name: world.players[id]?.name ?? '', carryUsd }))
    .sort((a, b) => b.carryUsd - a.carryUsd)
    .slice(0, 5);
  const accelerators = Object.values(accels(world))
    .map((a) => ({
      id: a.id,
      name: a.name,
      owner: world.players[a.ownerId]?.name ?? '',
      admitted: a.admitted.length,
      demoDays: a.demoDays,
    }))
    .sort((a, b) => b.demoDays - a.demoDays || b.admitted - a.admitted)
    .slice(0, 5);
  return {
    funds,
    investors,
    firms,
    syndicateLeads,
    accelerators,
    minDpiFor: INVESTOR.ladder.allocatorDpi,
  };
}

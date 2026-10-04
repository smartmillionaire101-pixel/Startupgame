/**
 * Governance (§9): boards, shareholder votes, vetoes, and removing a founder CEO.
 *
 * - Board composition changes with each round: founders plus investors who
 *   negotiated a board seat.
 * - Selling the company needs a shareholder vote (by share count) and the
 *   consent of anyone holding a veto on sales.
 * - A new priced round needs board approval once investors sit on the board.
 * - The board can remove a founder CEO for poor performance or conduct.
 *
 * AI holders vote by simple, legible rules; humans vote from their inbox.
 * Votes resolve as soon as the outcome is certain, or at the next settlement.
 */
import { fullyDiluted, waterfall } from './captable.js';
import { companyRunway } from './company.js';
import { ensure } from './errors.js';
import { getCompany, getMarket, notify, publish } from './helpers.js';
import { newId } from './ids.js';
import { applyStarEvent } from './stars.js';
import { valueCompany } from './valuation.js';
import { nextStage } from './helpers.js';
import { executeDeal } from './deals.js';
import type { Company, DealCard, Id, Vote, World } from './types.js';

export const VOTE_THRESHOLD = 0.5;

/** Who votes as a person: players and funds. Staff, pool and institutions abstain. */
function isVoter(world: World, holderId: string) {
  return !!world.players[holderId] || !!world.funds[holderId];
}

/** The human who casts a holder's vote, if any. */
function humanVoter(world: World, holderId: string): Id | null {
  const p = world.players[holderId];
  if (p) return p.ai ? null : p.id;
  return world.funds[holderId]?.managerId ?? null;
}

export function boardOf(c: Company): Id[] {
  return [...new Set([...c.founderIds, ...c.board])];
}

/** Does executing this deal need a vote first? */
export function requiresVote(world: World, d: DealCard): Vote['kind'] | null {
  if (!d.companyId) return null;
  const c = world.companies[d.companyId];
  if (!c) return null;
  const t = d.terms;
  if (t.kind === 'acquisition') {
    const others = Object.keys(c.capTable.holdings).filter(
      (h) => isVoter(world, h) && !c.founderIds.includes(h),
    );
    return others.length > 0 || c.vetoes.length > 0 ? 'sale' : null;
  }
  if (t.kind === 'investment' && t.instrument === 'priced') {
    return c.board.some((m) => !c.founderIds.includes(m)) ? 'raise' : null;
  }
  return null;
}

/** AI voters' rules. Returns null when the holder is human (they vote themselves). */
function aiBallot(world: World, v: Vote, holderId: string): 'yes' | 'no' | null {
  if (humanVoter(world, holderId)) return null;
  const c = getCompany(world, v.companyId);
  const d = v.dealId ? world.deals[v.dealId] : undefined;
  const fund = world.funds[holderId];
  if (v.kind === 'sale' && d?.terms.kind === 'acquisition') {
    const payout =
      waterfall(c.capTable, d.terms.price).find((l) => l.holderId === holderId)?.total ?? 0;
    const invested = world.positions[`${holderId}:${c.id}`]?.invested ?? 0;
    if (fund) return payout >= invested ? 'yes' : 'no';
    // AI founders: sell at a fair price.
    return d.terms.price >= valueCompany(world, c, nextStage(c.lastRound)).value * 0.9
      ? 'yes'
      : 'no';
  }
  if (v.kind === 'raise' && d?.terms.kind === 'investment') {
    // No punishing down rounds.
    return d.terms.valuation >= c.capTable.lastPostMoney * 0.8 ? 'yes' : 'no';
  }
  if (v.kind === 'remove-ceo') {
    const poor = c.stars.value < 1.5 || c.finance.unpaidPayroll > 0 || companyRunway(world, c) < 2;
    return poor ? 'yes' : 'no';
  }
  return 'yes';
}

export function openVote(
  world: World,
  args: {
    companyId: Id;
    kind: Vote['kind'];
    dealId?: Id;
    targetId?: Id;
    proposerId: Id;
    reason: string;
  },
): Vote {
  const c = getCompany(world, args.companyId);
  const m = getMarket(world, c.market);
  const fd = fullyDiluted(c.capTable);
  const weights: Record<string, number> = {};
  if (args.kind === 'sale') {
    for (const [h, holding] of Object.entries(c.capTable.holdings))
      if (isVoter(world, h)) weights[h] = holding.shares / fd;
  } else {
    for (const h of boardOf(c)) weights[h] = 1;
  }
  const v: Vote = {
    id: newId(world, 'vote'),
    companyId: c.id,
    market: c.market,
    kind: args.kind,
    dealId: args.dealId ?? null,
    targetId: args.targetId ?? null,
    reason: args.reason,
    weights,
    vetoHolders:
      args.kind === 'sale'
        ? c.vetoes.filter((h) => weights[h] !== undefined || isVoter(world, h))
        : [],
    ballots: {},
    status: 'open',
    createdMonth: m.month,
    deadlineMonth: m.month + 1,
  };
  world.votes[v.id] = v;
  for (const h of Object.keys(weights)) {
    const ai = aiBallot(world, v, h);
    if (ai) v.ballots[h] = ai;
  }
  // The proposer (and their fund) vote yes by proposing.
  for (const h of Object.keys(weights))
    if (h === args.proposerId || world.funds[h]?.managerId === args.proposerId)
      v.ballots[h] = 'yes';
  for (const h of Object.keys(weights)) {
    const human = humanVoter(world, h);
    if (human && v.ballots[h] === undefined) {
      notify(world, human, {
        month: m.month,
        kind: 'deal',
        text: `Vote needed at ${c.name}: ${args.reason}`,
        ref: { kind: 'company', id: c.id },
      });
    }
  }
  resolveVote(world, v, false);
  return v;
}

export function castVote(world: World, voteId: Id, playerId: Id, ballot: 'yes' | 'no') {
  const v = world.votes[voteId];
  ensure(v && v.status === 'open', 'vote.closed', 'This vote has closed.');
  const holders = Object.keys(v.weights).filter((h) => humanVoter(world, h) === playerId);
  ensure(holders.length, 'vote.forbidden', 'You don’t have a vote here.');
  for (const h of holders) v.ballots[h] = ballot;
  resolveVote(world, v, false);
  return v;
}

/**
 * Decide if the outcome is certain (or the deadline passed). On a pass, the
 * underlying action executes; on a fail, the deal is declined.
 */
export function resolveVote(world: World, v: Vote, deadline: boolean) {
  if (v.status !== 'open') return;
  const total = Object.values(v.weights).reduce((a, b) => a + b, 0);
  const yes = Object.entries(v.ballots)
    .filter(([, b]) => b === 'yes')
    .reduce((a, [h]) => a + (v.weights[h] ?? 0), 0);
  const no = Object.entries(v.ballots)
    .filter(([, b]) => b === 'no')
    .reduce((a, [h]) => a + (v.weights[h] ?? 0), 0);
  const vetoed = v.vetoHolders.some((h) => v.ballots[h] === 'no');
  const vetoesIn = v.vetoHolders.every((h) => v.ballots[h] === 'yes');
  let outcome: 'passed' | 'failed' | null = null;
  if (vetoed || no >= total * (1 - VOTE_THRESHOLD)) outcome = 'failed';
  else if (yes > total * VOTE_THRESHOLD && vetoesIn) outcome = 'passed';
  else if (deadline) {
    // Abstentions don't count; a missing veto consent blocks.
    outcome = yes > no && vetoesIn ? 'passed' : 'failed';
  }
  if (!outcome) return;
  v.status = outcome;
  const c = getCompany(world, v.companyId);
  const m = getMarket(world, c.market);
  const human = new Set(
    Object.keys(v.weights)
      .map((h) => humanVoter(world, h))
      .filter((x): x is string => !!x),
  );
  for (const id of human)
    notify(world, id, {
      month: m.month,
      kind: 'deal',
      text: `Vote at ${c.name} ${outcome}: ${v.reason}`,
    });
  onVoteResolved(world, v);
}

function onVoteResolved(world: World, v: Vote) {
  if (v.kind === 'remove-ceo') {
    if (v.status === 'passed' && v.targetId) removeFounder(world, v.companyId, v.targetId);
    return;
  }
  const d = v.dealId ? world.deals[v.dealId] : undefined;
  if (!d || d.status !== 'open') return;
  d.pendingVoteId = null;
  if (v.status === 'passed') {
    executeDeal(world, d, 'vote', { approved: true });
  } else {
    d.status = 'declined';
    d.history.push({
      month: getMarket(world, d.market).month,
      by: 'vote',
      action: 'decline',
      summary: v.kind === 'sale' ? 'Shareholders voted it down.' : 'The board voted it down.',
    });
  }
}

/** Board removes a founder CEO (§9). They keep their shares. */
export function removeFounder(world: World, companyId: Id, founderId: Id) {
  const c = getCompany(world, companyId);
  const m = getMarket(world, c.market);
  const f = world.players[founderId];
  c.founderIds = c.founderIds.filter((id) => id !== founderId);
  c.board = c.board.filter((id) => id !== founderId);
  if (f) {
    f.companyIds = f.companyIds.filter((id) => id !== c.id);
    world.positions[`${f.id}:${c.id}`] ??= {
      investorId: f.id,
      companyId: c.id,
      invested: 0,
      returned: 0,
      month: m.month,
      writtenOff: false,
    };
    applyStarEvent(f.stars, -0.3);
    notify(world, f.id, {
      month: m.month,
      kind: 'warning',
      text: `The board of ${c.name} removed you as CEO. You keep your shares. You can take it to the arbitrator.`,
    });
  }
  if (c.founderIds.length === 0) c.aiCeo = true;
  c.removedFounders[founderId] = m.month;
  publish(world, {
    market: c.market,
    month: m.month,
    outletId: 'public-record',
    outletName: 'Public record',
    kind: 'public-record',
    alert: `${c.name}'s board removes its CEO.`,
    headline: `${c.name} board removes ${f?.name ?? 'its founder'} as CEO`,
    body: `The board of ${c.name} voted to remove ${f?.name ?? 'its founder'} as chief executive.${c.aiCeo ? ' An interim AI CEO takes over.' : ''}`,
    starDelta: -0.3,
    verified: true,
    subject: { kind: 'company', id: c.id },
  });
}

/** Votes past their deadline resolve at settlement ("rulings within one game month"). */
export function settleVotes(world: World, market: string, month: number) {
  for (const v of Object.values(world.votes)) {
    if (v.market === market && v.status === 'open' && month >= v.deadlineMonth)
      resolveVote(world, v, true);
  }
}

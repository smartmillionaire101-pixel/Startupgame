/**
 * The AI arbitrator (§9). Either party can file over a broken deal card or a
 * shareholder disagreement. The arbitrator reads only deal-card terms and
 * game data — never private chats — and rules within one game month, in a
 * few lines. Rulings are public-record events and can move stars.
 *
 * Cases in this phase:
 *  - supply-breach: a buyer cancelled a supply contract early. If the
 *    supplier was performing, the buyer owes a break fee.
 *  - wrongful-removal: a founder removed as CEO by the board. If the company
 *    was healthy at the time, the company owes six months' severance.
 */
import { companyRunway } from './company.js';
import { ensure } from './errors.js';
import { col, getCompany, getMarket, notify, publish } from './helpers.js';
import { newId } from './ids.js';
import { formatMoney } from './money.js';
import { pay, transferUpTo } from './ledger.js';
import { supplierQuality } from './marketplace.js';
import { applyStarEvent } from './stars.js';
import type { Dispute, Id, Player, World } from './types.js';

/** Share of the remaining contract value owed when a buyer walks without cause. */
export const BREAK_FEE = 0.25;
export const REMOVAL_WINDOW_MONTHS = 3;

export function fileDispute(world: World, p: Player, kind: Dispute['kind'], refId: Id): Dispute {
  ensure(
    !Object.values(world.disputes).some((d) => d.refId === refId && d.kind === kind),
    'dispute.exists',
    'That case has already been filed.',
  );
  let market = p.market;
  if (kind === 'supply-breach') {
    const k = world.contracts[refId];
    ensure(k, 'dispute.ref', 'Contract not found.');
    const seller = getCompany(world, k.sellerId);
    ensure(
      seller.founderIds.includes(p.id),
      'dispute.standing',
      'Only the supplier can claim a breach.',
    );
    ensure(
      k.status === 'cancelled' && k.cancelledBy === k.buyerId,
      'dispute.grounds',
      'The buyer didn’t cancel this contract early.',
    );
    market = k.market;
  } else {
    const c = getCompany(world, refId);
    const when = c.removedFounders[p.id];
    ensure(when !== undefined, 'dispute.standing', 'You weren’t removed from this company.');
    ensure(
      getMarket(world, c.market).month - when <= REMOVAL_WINDOW_MONTHS,
      'dispute.late',
      'Too late to file; claims must be made within three months.',
    );
    market = c.market;
  }
  const d: Dispute = {
    id: newId(world, 'disp'),
    market,
    kind,
    claimantId: p.id,
    refId,
    filedMonth: getMarket(world, market).month,
    status: 'open',
    ruling: null,
    award: 0,
  };
  world.disputes[d.id] = d;
  return d;
}

function rule(world: World, d: Dispute) {
  const m = getMarket(world, d.market);
  const claimant = world.players[d.claimantId];
  let won = false;
  let respondentName = '';
  if (d.kind === 'supply-breach') {
    const k = world.contracts[d.refId]!;
    const buyer = world.companies[k.buyerId];
    const seller = world.companies[k.sellerId];
    respondentName = buyer?.name ?? 'the buyer';
    const monthsLeft = Math.max(0, k.plannedEndMonth - k.endMonth);
    if (seller && buyer && supplierQuality(seller) >= 0 && monthsLeft > 0) {
      const fee = Math.round(k.price * monthsLeft * BREAK_FEE);
      d.award = transferUpTo(
        world,
        buyer.account,
        seller.account,
        fee,
        `Arbitration award: ${seller.name}`,
        m.month,
      );
      applyStarEvent(buyer.stars, -0.1);
      won = true;
      d.ruling = `The contract ran to month ${k.plannedEndMonth}. ${seller.name} was performing. ${buyer.name} owes a break fee of ${formatMoney(d.award, m.data.currency)}.`;
    } else {
      d.ruling = `${seller?.name ?? 'The supplier'} was not performing to standard. The cancellation stands; no award.`;
    }
  } else {
    const c = world.companies[d.refId]!;
    respondentName = c.name;
    const healthy =
      c.stars.value >= 2 && companyRunway(world, c) >= 6 && c.finance.unpaidPayroll === 0;
    if (healthy && claimant) {
      const severance = Math.max(c.founderSalary, col(m)) * 6;
      d.award = Math.min(severance, world.accounts[c.account]!.balance);
      pay(
        world,
        c.account,
        claimant.accounts.local,
        d.award,
        `Arbitration award from ${c.name}`,
        m.month,
      );
      won = true;
      d.ruling = `${c.name} was healthy when the board acted. The removal stands, but ${c.name} owes six months’ severance.`;
    } else {
      d.ruling = `${c.name} was struggling when the board acted. The removal was within the board’s rights; no award.`;
    }
  }
  d.status = 'ruled';
  if (claimant) {
    applyStarEvent(claimant.stars, won ? 0.05 : -0.05);
    notify(world, claimant.id, { month: m.month, kind: 'system', text: `Arbitrator: ${d.ruling}` });
  }
  publish(world, {
    market: d.market,
    month: m.month,
    outletId: 'public-record',
    outletName: 'Public record',
    kind: 'public-record',
    alert: `Arbitrator rules in ${claimant?.name ?? 'a claim'} v ${respondentName}.`,
    headline: `Arbitration: ${claimant?.name ?? 'Claimant'} v ${respondentName}`,
    body: d.ruling ?? '',
    starDelta: won ? -0.1 : 0,
    verified: true,
    subject: { kind: 'market', id: d.market },
  });
}

/** Rulings come within one game month (§9). */
export function settleDisputes(world: World, market: string, month: number) {
  for (const d of Object.values(world.disputes)) {
    if (d.market === market && d.status === 'open' && month > d.filedMonth) rule(world, d);
  }
}

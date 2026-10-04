/**
 * Personal loans and credit profiles (§8), and relationship capital in
 * comebacks (§13).
 *
 * A player's credit profile is built only from their game history:
 * repayments made on time, missed payments, defaults, assets and stars.
 * Banks lend to individuals, including those restarting after failure;
 * shares can be pledged as collateral and are taken on default.
 */
import { markValue, sharesOf } from './captable.js';
import { lenderOf, openDeal, partyName } from './deals.js';
import { assertCanLend, playerBankHolderId, recordInterest, recordLoanLoss } from './banks.js';
import { ensure, fail } from './errors.js';
import { achieve, col, getCompany, getMarket, notify, publish } from './helpers.js';
import { newId } from './ids.js';
import { account, transfer, transferUpTo, valueIn } from './ledger.js';
import { clamp } from './math.js';
import { formatMoney } from './money.js';
import { applyStarEvent } from './stars.js';
import type { DealCard, Id, PersonalLoanTerms, Player, World } from './types.js';

/** Holder id a bank uses on cap tables when it takes pledged shares. */
export const bankHolderId = (market: string) => `bank:${market}`;

export interface CreditProfile {
  score: number;
  band: 'excellent' | 'good' | 'fair' | 'poor' | 'very poor';
  savings: number;
  holdings: number;
  debt: number;
  onTimePayments: number;
  missedPayments: number;
  defaults: number;
  /** Largest unsecured amount the bank would lend today. */
  unsecuredLimit: number;
}

/** Paper value of the player's shares in active companies (at last round price). */
export function holdingsValue(world: World, p: Player): number {
  let total = 0;
  for (const c of Object.values(world.companies)) {
    if (c.status !== 'active' || c.market !== p.market) continue;
    total += markValue(c.capTable, p.id);
  }
  return total;
}

function pledged(p: Player, companyId: Id): boolean {
  return p.loans.some((l) => l.collateral?.companyId === companyId);
}

export function creditProfile(world: World, p: Player): CreditProfile {
  const m = getMarket(world, p.market);
  const c = col(m);
  const savings =
    account(world, p.accounts.local).balance +
    (p.accounts.usd
      ? valueIn(world, account(world, p.accounts.usd).balance, 'USD', m.data.currency)
      : 0);
  const holdings = holdingsValue(world, p);
  const debt = p.loans.reduce((a, l) => a + l.outstanding, 0);
  const net = Math.max(0, savings + holdings * 0.5 - debt);
  const score = Math.round(
    clamp(
      45 +
        Math.min(20, p.credit.onTimePayments) -
        p.credit.missedPayments * 4 -
        p.credit.defaults * 18 +
        p.stars.value * 4 +
        Math.log10(1 + net / Math.max(1, c)) * 10 -
        (debt > savings * 2 + c * 6 ? 10 : 0),
      0,
      100,
    ),
  );
  const band =
    score >= 80
      ? 'excellent'
      : score >= 65
        ? 'good'
        : score >= 45
          ? 'fair'
          : score >= 25
            ? 'poor'
            : 'very poor';
  // Even restarting players can borrow a little (§8: "including those restarting after failure").
  const unsecuredLimit =
    score < 20
      ? 0
      : Math.round(
          Math.max(c * 2, (savings * 0.3 + p.lastMonth.income * 6 + c * 6) * (score / 100)) -
            debt * 0.5,
        );
  return {
    score,
    band,
    savings,
    holdings,
    debt,
    onTimePayments: p.credit.onTimePayments,
    missedPayments: p.credit.missedPayments,
    defaults: p.credit.defaults,
    unsecuredLimit: Math.max(0, unsecuredLimit),
  };
}

/**
 * Ask the market's bank for a personal loan. The bank answers at once with a
 * deal card (or a one-line refusal). Pledging shares raises the limit and
 * lowers the rate.
 */
export function requestPersonalLoan(
  world: World,
  p: Player,
  req: { amount: number; months: number; collateralCompanyId?: Id; bankId?: Id },
): DealCard {
  const m = getMarket(world, p.market);
  ensure(req.amount > 0, 'loan.amount', 'Ask for an amount.');
  ensure(
    !Object.values(world.deals).some(
      (d) =>
        d.status === 'open' &&
        d.terms.kind === 'personal-loan' &&
        (d.counterparty.id === p.id || d.proposer.id === p.id),
    ),
    'loan.open',
    'You already have a loan offer waiting.',
  );
  const profile = creditProfile(world, p);
  let collateral: PersonalLoanTerms['collateral'] = null;
  let collateralValue = 0;
  if (req.collateralCompanyId) {
    const c = getCompany(world, req.collateralCompanyId);
    ensure(c.status === 'active', 'loan.collateral', 'That company is no longer operating.');
    ensure(!pledged(p, c.id), 'loan.collateral', 'Those shares are already pledged.');
    const shares = sharesOf(c.capTable, p.id);
    ensure(shares > 0, 'loan.collateral', 'You don’t hold shares in that company.');
    collateralValue = markValue(c.capTable, p.id);
    if (collateralValue <= 0)
      fail('loan.collateral', `${m.bankName}: “Those shares have no price until a priced round.”`);
    collateral = { companyId: c.id, shares, label: `Your ${c.name} shares` };
  }
  const maxAmount = profile.unsecuredLimit + Math.round(collateralValue * 0.5);
  if (maxAmount <= 0)
    fail('loan.declined', `${m.bankName}: “Your credit profile doesn’t support a loan right now.”`);
  const spreadPp = clamp(17 - profile.score / 7, 3, 17) - (collateral ? 3 : 0);
  const terms: PersonalLoanTerms = {
    kind: 'personal-loan',
    amount: Math.min(req.amount, maxAmount),
    rateBps: m.data.baseRateBps + Math.round(Math.max(1.5, spreadPp) * 100),
    months: req.months,
    collateral,
  };
  if (req.bankId) {
    // A player bank: the banker decides, and may approve what a credit profile alone wouldn't justify (§13).
    const bank = world.banks[req.bankId];
    ensure(
      bank && bank.status === 'licensed' && bank.market === m.id,
      'loan.bank',
      'Pick a licensed bank in your market.',
    );
    return openDeal(world, {
      companyId: null,
      market: m.id,
      proposer: { kind: 'player', id: p.id },
      counterparty: { kind: 'playerbank', id: bank.id },
      terms: {
        ...terms,
        amount: req.amount,
        rateBps: m.data.baseRateBps + Math.round(bank.policy.loanSpreadPp * 100),
      },
      by: p.id,
    });
  }
  return openDeal(world, {
    companyId: null,
    market: m.id,
    proposer: { kind: 'bank', id: m.id },
    counterparty: { kind: 'player', id: p.id },
    terms,
    by: m.id,
    aiLimit: { maxAmount },
  });
}

export function executePersonalLoan(world: World, d: DealCard, t: PersonalLoanTerms) {
  const m = getMarket(world, d.market);
  const borrower = d.proposer.kind === 'player' ? d.proposer : d.counterparty;
  const p = world.players[borrower.id];
  ensure(p, 'player.missing', 'Borrower not found.');
  const lender = lenderOf(d);
  const bank = lender.kind === 'playerbank' ? world.banks[lender.id] : undefined;
  if (bank) assertCanLend(world, bank, t.amount, 'person');
  const lenderAccount = bank ? bank.account : m.ext.bank;
  const lenderName = bank ? bank.name : partyName(world, lender);
  if (t.collateral) {
    ensure(
      !pledged(p, t.collateral.companyId),
      'loan.collateral',
      'Those shares are already pledged.',
    );
    const c = getCompany(world, t.collateral.companyId);
    ensure(
      sharesOf(c.capTable, p.id) >= t.collateral.shares,
      'loan.collateral',
      'You no longer hold those shares.',
    );
  }
  transfer(
    world,
    lenderAccount,
    p.accounts.local,
    t.amount,
    `Personal loan from ${lenderName}`,
    m.month,
  );
  if (bank) {
    const owner = world.players[bank.ownerId];
    if (owner) achieve(world, owner, 'banker.first-loan', 'First loan', m.month);
  }
  const r = t.rateBps / 10_000 / 12;
  p.loans.push({
    id: newId(world, 'ploan'),
    lender: lenderName,
    lenderAccount,
    lenderBankId: bank?.id ?? null,
    market: m.id,
    principal: t.amount,
    outstanding: t.amount,
    rateBps: t.rateBps,
    monthlyPayment:
      r === 0
        ? Math.ceil(t.amount / t.months)
        : Math.ceil((t.amount * r) / (1 - Math.pow(1 + r, -t.months))),
    monthsLeft: t.months,
    collateral: t.collateral,
    missed: 0,
    ...(lender.lenderId ? { lenderId: lender.lenderId } : {}),
    ...(t.productId ? { productId: t.productId } : {}),
  });
  notify(world, p.id, {
    month: m.month,
    kind: 'deal',
    text: `Loan received: ${formatMoney(t.amount, m.data.currency)}.`,
  });
}

/** Early repayment, any amount. */
export function repayPersonalLoan(
  world: World,
  p: Player,
  loanId: Id,
  amount: number,
  month: number,
) {
  const loan = p.loans.find((l) => l.id === loanId);
  ensure(loan, 'loan.missing', 'Loan not found.');
  const m = getMarket(world, loan.market);
  const pay = Math.min(amount, loan.outstanding);
  ensure(pay > 0, 'loan.amount', 'Enter an amount.');
  transfer(
    world,
    p.accounts.local,
    loan.lenderAccount ?? m.ext.bank,
    pay,
    `Repayment to ${loan.lender}`,
    month,
  );
  loan.outstanding -= pay;
  if (loan.outstanding === 0) {
    p.loans = p.loans.filter((l) => l.id !== loanId);
    p.credit.onTimePayments += 2;
    notify(world, p.id, {
      month,
      kind: 'system',
      text: `Loan from ${loan.lender} repaid in full.`,
    });
  }
  return { remaining: loan.outstanding };
}

/**
 * Monthly repayments. Two missed payments in a row is a default: pledged
 * shares go to the bank, the loan is written off, the credit profile takes
 * the hit, and the default is a public-record event (§10).
 */
export function settlePersonalLoans(world: World, p: Player, month: number) {
  for (const loan of [...p.loans]) {
    const m = getMarket(world, loan.market);
    const interest = Math.round((loan.outstanding * loan.rateBps) / 10_000 / 12);
    const due = Math.min(loan.monthlyPayment, loan.outstanding + interest);
    const paid = transferUpTo(
      world,
      p.accounts.local,
      loan.lenderAccount ?? m.ext.bank,
      due,
      `Loan repayment (${loan.lender})`,
      month,
    );
    recordInterest(world, loan.lenderBankId, Math.min(paid, interest));
    loan.outstanding = Math.max(0, loan.outstanding + interest - paid);
    loan.monthsLeft -= 1;
    if (paid >= due) {
      loan.missed = 0;
      p.credit.onTimePayments += 1;
    } else {
      loan.missed += 1;
      p.credit.missedPayments += 1;
      notify(world, p.id, {
        month,
        kind: 'warning',
        text: `Missed a loan payment to ${loan.lender}. Two in a row is a default.`,
      });
    }
    if (loan.missed >= 2) defaultPersonalLoan(world, p, loan.id, month);
    else if (loan.outstanding === 0) p.loans = p.loans.filter((l) => l.id !== loan.id);
  }
}

function defaultPersonalLoan(world: World, p: Player, loanId: Id, month: number) {
  const loan = p.loans.find((l) => l.id === loanId)!;
  p.loans = p.loans.filter((l) => l.id !== loanId);
  p.credit.defaults += 1;
  // The lender writes the loan off (pledged shares soften the blow).
  recordLoanLoss(world, loan.lenderBankId, loan.outstanding);
  let seized = '';
  if (loan.collateral) {
    const c = world.companies[loan.collateral.companyId];
    const h = c?.capTable.holdings[p.id];
    if (c && h) {
      const take = Math.min(h.shares, loan.collateral.shares);
      h.shares -= take;
      if (h.shares === 0) delete c.capTable.holdings[p.id];
      const bank = loan.lenderBankId
        ? playerBankHolderId(loan.lenderBankId)
        : bankHolderId(loan.market);
      const bh = (c.capTable.holdings[bank] ??= { shares: 0, kind: 'investor' });
      bh.shares += take;
      seized = ` ${loan.lender} took the pledged ${c.name} shares.`;
    }
  }
  applyStarEvent(p.stars, -0.25);
  notify(world, p.id, {
    month,
    kind: 'warning',
    text: `You defaulted on your loan from ${loan.lender}.${seized}`,
  });
  publish(world, {
    market: loan.market,
    month,
    outletId: 'public-record',
    outletName: 'Public record',
    kind: 'public-record',
    alert: `${p.name} defaults on a personal loan.`,
    headline: `${p.name} defaults on a bank loan`,
    body: `${p.name} missed repayments to ${loan.lender}; the loan is in default.${seized}`,
    starDelta: -0.25,
    verified: true,
    subject: { kind: 'player', id: p.id },
  });
}

/** A founder puts personal money into their company (founder capital; no new shares). */
export function injectCapital(
  world: World,
  p: Player,
  companyId: Id,
  amount: number,
  month: number,
) {
  const c = getCompany(world, companyId);
  ensure(
    c.founderIds.includes(p.id) && c.status === 'active',
    'company.forbidden',
    'Not your company.',
  );
  ensure(amount > 0, 'inject.amount', 'Enter an amount.');
  transfer(world, p.accounts.local, c.account, amount, 'Founder capital', month);
}

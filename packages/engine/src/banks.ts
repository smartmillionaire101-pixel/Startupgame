/**
 * Player-owned banks and the AI central bank (§8).
 *
 * Accounting model (keeps the ledger's per-currency sum at zero):
 *  - A bank has one operating account. Depositors' balances stay in their own
 *    accounts (their claims); the bank may run its operating account negative
 *    down to a liquidity limit of deposits × (1 − reserve ratio). That negative
 *    balance is money lent out of deposits, as real banks do.
 *  - Retail households (AI) deposit and borrow in aggregate; their money moves
 *    through the market's outside-world account and is tracked as a liability
 *    (retail deposits) and an asset (retail loans).
 *  - Equity = cash + loans owed to the bank + retail loans − retail deposits −
 *    central bank borrowing.
 *
 * The AI central bank sets the base rate (from real data), enforces capital and
 * reserve rules, lends to banks that run short against their loan book (above
 * base rate; less to weak banks; repeated borrowing triggers an inspection),
 * and winds down failed banks, covering deposits up to the insurance limit.
 */
import { backgroundById } from './data/characters.js';
import { creditProfile } from './credit.js';
import { ensure, fail } from './errors.js';
import { achieve, col, getMarket, notify, publish } from './helpers.js';
import { newId } from './ids.js';
import { account, openAccount, transfer, transferUpTo } from './ledger.js';
import { clamp, roundTo } from './math.js';
import { formatMoney, scale } from './money.js';
import { checkName } from './names.js';
import type { Rng } from './rng.js';
import { applyStarEvent, newStars, settleStars } from './stars.js';
import type { Bank, BankType, Id, Player, World } from './types.js';

export const RESERVE_RATIO = 0.1;
export const MIN_CAPITAL_RATIO = 0.1;
/** Below this the central bank winds the bank down. */
export const INSOLVENT_RATIO = 0.03;
export const LICENCE_MONTHS = 2;

export const BANK_TYPES: Record<
  BankType,
  {
    label: string;
    minCapitalCol: number;
    opexCol: number;
    retail: number;
    personal: boolean;
    companies: boolean;
    advisory: boolean;
    retailDefault: number;
    earns: string;
    wants: string;
    risk: string;
  }
> = {
  commercial: {
    label: 'Commercial bank',
    minCapitalCol: 120,
    opexCol: 6,
    retail: 1,
    personal: true,
    companies: true,
    advisory: false,
    retailDefault: 0.003,
    earns: 'Interest margin, account fees',
    wants: 'Deposits, safe lending, payroll accounts',
    risk: 'Bad loans, bank runs',
  },
  investment: {
    label: 'Investment bank',
    minCapitalCol: 60,
    opexCol: 5,
    retail: 0,
    personal: false,
    companies: false,
    advisory: true,
    retailDefault: 0,
    earns: 'Fees on M&A and fundraising',
    wants: 'Big deals, league tables',
    risk: 'Pushing deals against clients’ interests',
  },
  'venture-debt': {
    label: 'Venture debt lender',
    minCapitalCol: 80,
    opexCol: 3,
    retail: 0,
    personal: false,
    companies: true,
    advisory: false,
    retailDefault: 0,
    earns: 'Interest plus warrants',
    wants: 'Funded startups that survive',
    risk: 'Startup failures',
  },
  microfinance: {
    label: 'Microfinance bank',
    minCapitalCol: 30,
    opexCol: 2,
    retail: 3,
    personal: true,
    companies: true,
    advisory: false,
    retailDefault: 0.008,
    earns: 'Volume of small accounts and loans',
    wants: 'Many customers, strong service',
    risk: 'Higher default rates',
  },
};

/** Holder id a player bank uses on cap tables (warrants, seized collateral). */
export const playerBankHolderId = (bankId: Id) => `pbank:${bankId}`;

export const bankDeposits = (world: World, b: Bank) =>
  Object.values(world.accounts).reduce(
    (a, acc) => a + (acc.bankId === b.id && acc.balance > 0 ? acc.balance : 0),
    0,
  );

export function bankLoansOutstanding(world: World, b: Bank) {
  let total = 0;
  for (const c of Object.values(world.companies))
    for (const l of c.finance.loans) if (l.lenderBankId === b.id) total += l.outstanding;
  for (const p of Object.values(world.players))
    for (const l of p.loans) if (l.lenderBankId === b.id) total += l.outstanding;
  return total;
}

export function bankFigures(world: World, b: Bank) {
  const cash = account(world, b.account).balance;
  const loans = bankLoansOutstanding(world, b) + b.retail.loans;
  const cb = b.cbLoans.reduce((a, l) => a + l.outstanding, 0);
  const equity = cash + loans - b.retail.deposits - cb;
  const deposits = bankDeposits(world, b) + b.retail.deposits;
  const liquidityLimit = Math.round(bankDeposits(world, b) * (1 - RESERVE_RATIO));
  return {
    cash,
    loans,
    deposits,
    cbBorrowing: cb,
    equity,
    capitalRatio: loans > 0 ? roundTo(equity / loans, 3) : equity > 0 ? 1 : 0,
    liquidityLimit,
    /** How much more the bank can lend today within liquidity and capital rules. */
    lendingRoom: Math.max(
      0,
      Math.min(cash + liquidityLimit, Math.floor(equity / MIN_CAPITAL_RATIO - loans)),
    ),
    customers:
      b.retail.customers + Object.values(world.accounts).filter((a) => a.bankId === b.id).length,
  };
}

/** Called when a lender loses money on a loan (company shutdown, personal default). */
export function recordLoanLoss(world: World, bankId: Id | null, amount: number) {
  if (!bankId || amount <= 0) return;
  const b = world.banks[bankId];
  if (b) b.thisMonth.losses += amount;
}

/** Interest a borrower paid to a player bank (company or personal loan). */
export function recordInterest(world: World, bankId: Id | null, amount: number) {
  if (!bankId || amount <= 0) return;
  const b = world.banks[bankId];
  if (b) b.thisMonth.interest += amount;
}

// ------------------------------------------------------------------ founding & licence

/**
 * Raise capital from AI shareholders and file for a licence (§8 "Starting a
 * bank"). AI shareholders put in a multiple of the founder's stake that
 * depends on the founder's credibility.
 */
export function foundBank(
  world: World,
  p: Player,
  args: { name: string; type: BankType; contribution: number },
) {
  const m = getMarket(world, p.market);
  ensure(
    !Object.values(world.banks).some(
      (b) => b.ownerId === p.id && b.status !== 'failed' && b.status !== 'rejected',
    ),
    'bank.exists',
    'You already run a bank.',
  );
  const check = checkName(args.name, { taken: world.names[m.id] ?? {} });
  if (!check.ok) fail('bank.name', check.reason);
  ensure(args.contribution > 0, 'bank.capital', 'Put in some of your own capital.');
  const profile = creditProfile(world, p);
  ensure(
    profile.defaults === 0,
    'bank.credit',
    'Regulators won’t license someone with a recent default.',
  );
  const bg = backgroundById(p.backgroundId);
  const credibility = clamp(
    0.4 + p.stars.value / 5 + (bg?.role === 'banker' ? 0.3 : 0) + profile.score / 200,
    0.5,
    2,
  );
  const aiMultiple = roundTo(2 + credibility * 1.5, 2);
  const aiStake = Math.round(args.contribution * aiMultiple);
  const id = newId(world, 'bank');
  const acc = openAccount(world, { currency: m.data.currency, market: m.id, label: args.name });
  transfer(
    world,
    p.accounts.local,
    acc,
    args.contribution,
    `Capital for ${args.name}`,
    m.month,
    'capital',
  );
  transfer(world, m.ext.lps, acc, aiStake, `AI shareholders’ capital for ${args.name}`, m.month);
  const total = args.contribution + aiStake;
  const bank: Bank = {
    id,
    name: args.name.trim(),
    market: m.id,
    type: args.type,
    ownerId: p.id,
    status: 'applying',
    account: acc,
    appliedMonth: m.month,
    licensedMonth: null,
    ownerShareBps: Math.round((args.contribution / total) * 10_000),
    policy: {
      loanSpreadPp: 6,
      depositRateBps: Math.round(m.data.baseRateBps / 4),
      accountFee: scale(col(m), 0.002),
      salary: 0,
    },
    retail: { customers: 0, deposits: 0, loans: 0 },
    cbLoans: [],
    cbBorrowMonths: [],
    stars: newStars(Math.min(2.5, p.stars.value)),
    reviews: { sum: 0, count: 0 },
    lastMonth: { interestIncome: 0, fees: 0, depositInterest: 0, opex: 0, loanLosses: 0, net: 0 },
    thisMonth: { interest: 0, fees: 0, losses: 0 },
    advised: 0,
  };
  world.banks[id] = bank;
  world.names[m.id] ??= {};
  world.names[m.id]![check.normalised] = id;
  notify(world, p.id, {
    month: m.month,
    kind: 'system',
    text: `AI shareholders put in ${formatMoney(aiStake, m.data.currency)} (${aiMultiple}× your stake). Licence application filed; the regulator decides in ${LICENCE_MONTHS} months.`,
  });
  return bank;
}

export function getBank(world: World, id: Id): Bank {
  const b = world.banks[id];
  ensure(b, 'bank.missing', 'Bank not found.');
  return b;
}

export function ownBank(world: World, p: Player, id: Id): Bank {
  const b = getBank(world, id);
  ensure(b.ownerId === p.id, 'bank.forbidden', 'You don’t run this bank.');
  ensure(b.status === 'licensed' || b.status === 'applying', 'bank.closed', 'This bank is closed.');
  return b;
}

export const isLicensed = (b: Bank | undefined) => !!b && b.status === 'licensed';

/** A depositor moves an account to a licensed player bank, or back to the default AI bank. */
export function moveAccount(world: World, accountId: Id, bankId: Id | null) {
  const acc = account(world, accountId);
  if (bankId) {
    const b = getBank(world, bankId);
    ensure(isLicensed(b), 'bank.unlicensed', 'That bank isn’t licensed.');
    ensure(b.market === acc.market, 'bank.market', 'Bank with a bank in your market.');
    ensure(b.account !== accountId, 'bank.self', 'A bank can’t bank with itself.');
  }
  acc.bankId = bankId;
}

// ------------------------------------------------------------------ lending checks

/** Can this bank make a loan of this size right now? Throws a plain reason if not. */
export function assertCanLend(
  world: World,
  b: Bank,
  amount: number,
  borrower: 'person' | 'company',
) {
  ensure(isLicensed(b), 'bank.unlicensed', `${b.name} isn’t licensed to lend.`);
  const t = BANK_TYPES[b.type];
  ensure(
    borrower === 'person' ? t.personal : t.companies,
    'bank.product',
    `${t.label}s don’t make that kind of loan.`,
  );
  if (b.type === 'microfinance') {
    ensure(
      amount <= scale(col(getMarket(world, b.market)), 20),
      'bank.size',
      'Microfinance loans are small.',
    );
  }
  const f = bankFigures(world, b);
  ensure(
    amount <= f.lendingRoom,
    'bank.room',
    `${b.name} can’t lend that much right now (capital and reserve rules).`,
  );
  // Lending out of deposits: allow the operating account to go negative within the reserve rule.
  account(world, b.account).overdraftLimit = f.liquidityLimit;
}

// ------------------------------------------------------------------ monthly settlement

function wind(world: World, b: Bank, month: number, reason: string) {
  const m = getMarket(world, b.market);
  const limit = m.data.depositInsurance * 100;
  let cash = account(world, b.account).balance;
  // Depositors above the insurance limit take the loss, up to what's needed.
  for (const acc of Object.values(world.accounts)) {
    if (acc.bankId !== b.id) continue;
    if (cash < 0 && acc.balance > limit) {
      const take = Math.min(acc.balance - limit, -cash);
      transfer(
        world,
        acc.id,
        b.account,
        take,
        `${b.name} failed: deposits above the insured limit lost`,
        month,
      );
      cash += take;
      const owner = Object.values(world.players).find(
        (p) => p.accounts.local === acc.id || p.accounts.usd === acc.id,
      );
      if (owner)
        notify(world, owner.id, {
          month,
          kind: 'warning',
          text: `${b.name} failed. You lost ${formatMoney(take, m.data.currency)} above the insured limit.`,
        });
    }
    acc.bankId = null;
  }
  // Retail: insured part paid by the central bank, the rest lost.
  b.retail = { customers: 0, deposits: 0, loans: 0 };
  // Loans owed to the bank pass to the central bank (repayments now go there).
  for (const c of Object.values(world.companies))
    for (const l of c.finance.loans)
      if (l.lenderBankId === b.id) {
        l.lenderBankId = null;
        l.lenderAccount = m.ext.tax;
      }
  for (const p of Object.values(world.players))
    for (const l of p.loans)
      if (l.lenderBankId === b.id) {
        l.lenderBankId = null;
        l.lenderAccount = m.ext.tax;
      }
  // The central bank (deposit insurance) closes the hole; any surplus returns to shareholders (ext).
  const bal = account(world, b.account).balance;
  if (bal < 0) transfer(world, m.ext.tax, b.account, -bal, `Central bank covers ${b.name}`, month);
  else transferUpTo(world, b.account, m.ext.lps, bal, `${b.name} wound down`, month);
  b.cbLoans = [];
  b.status = 'failed';
  const owner = world.players[b.ownerId];
  if (owner) {
    applyStarEvent(owner.stars, -0.8);
    owner.failures += 1;
    notify(world, owner.id, {
      month,
      kind: 'warning',
      text: `The central bank wound down ${b.name}. ${reason}`,
    });
  }
  publish(world, {
    market: b.market,
    month,
    outletId: 'public-record',
    outletName: 'Public record',
    kind: 'public-record',
    alert: `Central bank closes ${b.name}.`,
    headline: `${b.name} fails; central bank steps in`,
    body: `The central bank wound down ${b.name}. ${reason} Deposits up to ${formatMoney(limit, m.data.currency)} are covered.`,
    starDelta: -0.8,
    verified: true,
    subject: { kind: 'market', id: b.market },
  });
}

function inspection(world: World, b: Bank, month: number, why: string) {
  const m = getMarket(world, b.market);
  const f = bankFigures(world, b);
  if (f.capitalRatio >= MIN_CAPITAL_RATIO) return;
  const fine = Math.max(scale(col(m), 2), Math.round(f.loans * 0.01));
  transferUpTo(world, b.account, m.ext.tax, fine, `Regulatory fine: ${why}`, month);
  applyStarEvent(b.stars, -0.3);
  publish(world, {
    market: b.market,
    month,
    outletId: 'public-record',
    outletName: 'Public record',
    kind: 'public-record',
    alert: `Regulator fines ${b.name}.`,
    headline: `${b.name} fined after inspection`,
    body: `Inspectors found ${b.name} below capital rules (${Math.round(f.capitalRatio * 100)}% vs ${MIN_CAPITAL_RATIO * 100}%). Fine: ${formatMoney(fine, m.data.currency)}.`,
    starDelta: -0.3,
    verified: true,
    subject: { kind: 'market', id: b.market },
  });
}

/**
 * The month for every bank in a market: licence decisions, retail business,
 * deposit interest and fees, running costs, central bank lending and
 * supervision, and stars.
 */
export function settleBanks(world: World, market: string, rng: Rng, month: number) {
  const m = getMarket(world, market as never);
  const base = m.data.baseRateBps / 10_000;
  for (const b of Object.values(world.banks)) {
    if (b.market !== market) continue;
    const owner = world.players[b.ownerId];
    if (b.status === 'applying') {
      if (month - b.appliedMonth < LICENCE_MONTHS) continue;
      const f = bankFigures(world, b);
      const need = scale(col(m), BANK_TYPES[b.type].minCapitalCol);
      if (f.equity >= need && owner && creditProfile(world, owner).score >= 35) {
        b.status = 'licensed';
        b.licensedMonth = month;
        if (owner) {
          achieve(world, owner, 'banker.licence', 'Licence granted', month);
          notify(world, owner.id, {
            month,
            kind: 'system',
            text: `Licence granted: ${b.name} is open for business.`,
          });
        }
      } else {
        b.status = 'rejected';
        // Capital goes back to shareholders.
        const bal = account(world, b.account).balance;
        const ownerPart = Math.round((bal * b.ownerShareBps) / 10_000);
        if (owner)
          transfer(
            world,
            b.account,
            owner.accounts.local,
            ownerPart,
            `${b.name}: capital returned`,
            month,
          );
        transferUpTo(
          world,
          b.account,
          m.ext.lps,
          account(world, b.account).balance,
          `${b.name}: capital returned`,
          month,
        );
        if (owner)
          notify(world, owner.id, {
            month,
            kind: 'warning',
            text: `Licence refused: ${b.name} needs at least ${formatMoney(need, m.data.currency)} of capital and a cleaner credit profile.`,
          });
      }
      continue;
    }
    if (b.status !== 'licensed') continue;
    const t = BANK_TYPES[b.type];
    account(world, b.account).overdraftLimit = bankFigures(world, b).liquidityLimit;
    // Start from what borrowers and clients paid in during the month.
    const lm = {
      interestIncome: b.thisMonth.interest,
      fees: b.thisMonth.fees,
      depositInterest: 0,
      opex: 0,
      loanLosses: b.thisMonth.losses,
      net: 0,
    };
    b.thisMonth = { interest: 0, fees: 0, losses: 0 };

    // Retail households: grow with stars and a competitive deposit rate; run when trust breaks.
    if (t.retail > 0) {
      const appeal =
        (b.stars.value - 1.5) / 3.5 + (b.policy.depositRateBps / 10_000 - base / 4) * 4;
      const avgDeposit = scale(col(m), b.type === 'microfinance' ? 0.15 : 0.6);
      const run = b.stars.value < 1.5;
      if (run) {
        const leaving = Math.ceil(b.retail.customers * 0.3);
        const out = Math.min(b.retail.deposits, leaving * avgDeposit);
        const paidOut = transferUpTo(
          world,
          b.account,
          m.ext.customers,
          out,
          'Retail withdrawals (bank run)',
          month,
        );
        b.retail.customers -= leaving;
        b.retail.deposits -= paidOut;
      } else {
        const joining = Math.max(0, Math.round(t.retail * 120 * appeal * rng.range(0.6, 1.4)));
        b.retail.customers += joining;
        const inflow = joining * avgDeposit;
        b.retail.deposits += inflow;
        transfer(world, m.ext.customers, b.account, inflow, 'Retail deposits', month);
      }
      // Retail lending: a share of new room, repaid with interest, some default.
      const r = (base + b.policy.loanSpreadPp / 100) / 12;
      const repay = Math.round(b.retail.loans * 0.08);
      const interest = Math.round(b.retail.loans * r);
      const defaults = Math.round(
        b.retail.loans * t.retailDefault * (b.type === 'microfinance' ? rng.range(0.5, 2) : 1),
      );
      transfer(
        world,
        m.ext.customers,
        b.account,
        repay + interest,
        'Retail loan repayments',
        month,
      );
      b.retail.loans = Math.max(0, b.retail.loans - repay - defaults);
      lm.interestIncome += interest;
      lm.loanLosses += defaults;
      const room = bankFigures(world, b).lendingRoom;
      const lend = Math.round(Math.min(room * 0.3, b.retail.deposits * 0.7));
      if (lend > 0) {
        transfer(world, b.account, m.ext.customers, lend, 'Retail loans', month);
        b.retail.loans += lend;
      }
      const retailInterest = transferUpTo(
        world,
        b.account,
        m.ext.customers,
        Math.round((b.retail.deposits * b.policy.depositRateBps) / 10_000 / 12),
        'Interest to retail depositors',
        month,
      );
      lm.depositInterest += retailInterest;
    }

    // Player depositors: interest paid, account fees collected.
    for (const acc of Object.values(world.accounts)) {
      if (acc.bankId !== b.id) continue;
      if (acc.balance > 0 && b.policy.depositRateBps > 0) {
        const i = transferUpTo(
          world,
          b.account,
          acc.id,
          Math.round((acc.balance * b.policy.depositRateBps) / 10_000 / 12),
          `Interest from ${b.name}`,
          month,
        );
        lm.depositInterest += i;
      }
      lm.fees += transferUpTo(
        world,
        acc.id,
        b.account,
        b.policy.accountFee,
        `${b.name} account fee`,
        month,
      );
    }

    // Running costs and the banker's salary.
    lm.opex = transferUpTo(
      world,
      b.account,
      m.ext.payroll,
      scale(col(m), t.opexCol),
      'Staff and systems',
      month,
    );
    if (owner && b.policy.salary > 0) {
      const gross = transferUpTo(
        world,
        b.account,
        owner.accounts.local,
        b.policy.salary,
        `${b.name} salary`,
        month,
      );
      const tax = Math.round(gross * m.data.tax.personalIncome);
      transfer(
        world,
        owner.accounts.local,
        m.ext.tax,
        Math.min(tax, account(world, owner.accounts.local).balance),
        'Personal income tax',
        month,
      );
      lm.opex += gross;
      owner.lastMonth.income += gross;
    }

    // Central bank loans: interest and repayment when due.
    for (const l of b.cbLoans) {
      const i = Math.round((l.outstanding * l.rateBps) / 10_000 / 12);
      const due = month >= l.dueMonth ? l.outstanding + i : i;
      const got = transferUpTo(world, b.account, m.ext.tax, due, 'Central bank loan', month);
      lm.depositInterest += Math.min(got, i);
      l.outstanding -= Math.max(0, got - i);
    }
    b.cbLoans = b.cbLoans.filter((l) => l.outstanding > 0);

    // Liquidity: if the bank is overdrawn past what deposits allow, the central bank lends against its loans.
    let f = bankFigures(world, b);
    if (f.cash < -f.liquidityLimit) {
      const short = -f.liquidityLimit - f.cash;
      const collateral =
        Math.round(
          f.loans * (b.stars.value < 2 || f.capitalRatio < MIN_CAPITAL_RATIO ? 0.4 : 0.7),
        ) - f.cbBorrowing;
      if (collateral >= short) {
        transfer(world, m.ext.tax, b.account, short, 'Central bank lending', month);
        b.cbLoans.push({
          outstanding: short,
          rateBps: m.data.baseRateBps + 300,
          dueMonth: month + 3,
        });
        b.cbBorrowMonths = [...b.cbBorrowMonths.filter((x) => month - x < 12), month];
        if (owner)
          notify(world, owner.id, {
            month,
            kind: 'warning',
            text: `${b.name} borrowed ${formatMoney(short, m.data.currency)} from the central bank above base rate.`,
          });
        if (b.cbBorrowMonths.length >= 3)
          inspection(world, b, month, 'repeated central bank borrowing');
      } else {
        wind(world, b, month, 'It ran out of cash and had too little collateral to borrow.');
        continue;
      }
    }
    f = bankFigures(world, b);
    if (f.equity < 0 || (f.loans > 0 && f.capitalRatio < INSOLVENT_RATIO)) {
      wind(world, b, month, 'Loan losses wiped out its capital.');
      continue;
    }

    lm.net = lm.interestIncome + lm.fees - lm.depositInterest - lm.opex - lm.loanLosses;
    b.lastMonth = lm;
    // Stars: capital strength, growth and how customers are treated.
    const rating = b.reviews.count ? b.reviews.sum / b.reviews.count : 3;
    settleStars(
      b.stars,
      clamp(
        1 +
          f.capitalRatio * 8 +
          Math.log10(1 + f.customers) * 0.5 +
          (rating - 3) * 0.4 -
          (b.cbLoans.length ? 0.5 : 0),
        0,
        5,
      ),
    );
    if (owner) {
      if (f.customers >= 1000)
        achieve(world, owner, 'banker.1000-customers', 'First 1,000 customers', month);
      if (b.stars.value >= 4.5)
        achieve(world, owner, 'banker.five-star', 'Five-star rating', month);
    }
  }
}

/** AI companies move their accounts toward strong banks and away from weak ones (deposits from players who trust them). */
export function aiBanking(world: World, market: string, rng: Rng) {
  const banks = Object.values(world.banks).filter(
    (b) => b.market === market && b.status === 'licensed' && BANK_TYPES[b.type].companies,
  );
  for (const c of Object.values(world.companies)) {
    if (!c.ai || c.market !== market || c.status !== 'active') continue;
    const acc = world.accounts[c.account]!;
    const current = acc.bankId ? world.banks[acc.bankId] : undefined;
    if (current && current.stars.value < 1.5) {
      acc.bankId = null; // run
      continue;
    }
    if (!acc.bankId && banks.length && rng.chance(0.05)) {
      const best = banks
        .slice()
        .sort(
          (a, b) =>
            b.stars.value - a.stars.value || b.policy.depositRateBps - a.policy.depositRateBps,
        )[0]!;
      if (best.stars.value >= 2.5) acc.bankId = best.id;
    }
  }
}

/** Investment bank advisory fee on a deal it advised (§8). */
export const ADVISORY_FEE = 0.02;

export function chargeAdvisory(
  world: World,
  bankId: Id,
  fromAccount: Id,
  dealValue: number,
  month: number,
) {
  const b = getBank(world, bankId);
  ensure(
    isLicensed(b) && BANK_TYPES[b.type].advisory,
    'bank.advisory',
    'Pick a licensed investment bank as adviser.',
  );
  const fee = Math.round(dealValue * ADVISORY_FEE);
  const paid = transferUpTo(world, fromAccount, b.account, fee, `Advisory fee: ${b.name}`, month);
  b.advised += 1;
  b.thisMonth.fees += paid;
  return paid;
}

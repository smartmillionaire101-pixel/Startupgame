/**
 * Founder finance and the Friends & Family round (blueprint §2.1 chapter 3,
 * §6.6, §7.2–7.4, FR-012, FR-013).
 *
 *  - A founder contribution is classified (§7.3): as **equity** it buys new
 *    founder shares at the company's current price (last round, else the
 *    model valuation), so ownership reconciles; as a **founder loan** it is a
 *    liability the company repays (`company.repayFounder`), never revenue.
 *    `company.inject` (unclassified founder capital) is unchanged.
 *  - A **business reserve** (§7.2): a second company account. Money there is
 *    left out of "available" cash (and runway) but counts in the total. If the
 *    month's costs can't be met from the main account, settlement releases the
 *    shortfall from the reserve first, so a reserve never sinks a company.
 *  - A **Friends & Family round**: SAFE terms (cap + discount). Any human
 *    player who isn't a founder of the company can commit (any role); the
 *    founder can ask AI angels once a month (bounded, deterministic). Money
 *    sits in an escrow account until close; closing moves it to the company
 *    once and writes one SAFE per backer; cancelling refunds everyone.
 *
 * Everything here is new state behind new commands, so old command logs
 * replay unchanged. Money moves only through the ledger.
 */
import { activeAngels } from './angels.js';
import { addSafe, fullyDiluted } from './captable.js';
import { monthlyCosts } from './company.js';
import { ensure } from './errors.js';
import {
  burn,
  getCompany,
  getMarket,
  holderAccount,
  lastPnl,
  nextStage,
  notify,
} from './helpers.js';
import { newId } from './ids.js';
import { account, costIn, openAccount, pay, payExact, transfer, withTx } from './ledger.js';
import { clamp } from './math.js';
import { deriveRng } from './rng.js';
import { valueCompany } from './valuation.js';
import type { Company, FriendsRound, Id, Player, World } from './types.js';

export const FF = {
  /** Most AI angels asked per month, and most that can commit per ask. */
  aiPerAsk: 2,
  /** AI angels can fill at most this share of a round (friends are mostly people). */
  aiShareMax: 0.5,
  maxDiscountPct: 30,
  /** Smallest commitment, as a share of the target. */
  minCommitShare: 0.01,
};

// ---------------------------------------------------------------- reserve and founder money

/** Money in the reserve account (0 without one). */
export const reserveBalance = (world: World, c: Company): number =>
  c.reserve ? (world.accounts[c.reserve]?.balance ?? 0) : 0;

export const founderLoanTotal = (c: Company): number =>
  Object.values(c.founderLoans ?? {}).reduce((a, b) => a + b, 0);

/** Price per share for new founder shares: the last round's, else the model valuation's. */
export function sharePrice(world: World, c: Company): number {
  if (c.capTable.lastPrice > 0) return c.capTable.lastPrice;
  const pre = Math.max(1, valueCompany(world, c, nextStage(c.lastRound)).value);
  return pre / Math.max(1, fullyDiluted(c.capTable));
}

/** A founder puts personal money in as equity (new shares) or as a founder loan (liability). */
export function contribute(
  world: World,
  me: Player,
  c: Company,
  amount: number,
  as: 'equity' | 'loan',
  month: number,
) {
  ensure(amount > 0, 'contribute.amount', 'Enter an amount.');
  ensure(
    account(world, me.accounts.local).balance >=
      costIn(world, amount, currencyOf(world, c), account(world, me.accounts.local).currency),
    'ledger.funds',
    'You don’t have that much in your personal account.',
  );
  if (as === 'equity') {
    const price = sharePrice(world, c);
    const shares = Math.floor(amount / price);
    ensure(shares > 0, 'contribute.small', 'That buys less than one share. Put in more.');
    withTx(world, { kind: 'investment' }, () =>
      payExact(
        world,
        me.accounts.local,
        c.account,
        amount,
        `Founder equity: ${c.name}`,
        month,
        'capital',
      ),
    );
    const h = c.capTable.holdings[me.id];
    if (h) h.shares += shares;
    else c.capTable.holdings[me.id] = { shares, kind: 'founder' };
    const eq = (c.founderEquity ??= {});
    eq[me.id] = (eq[me.id] ?? 0) + amount;
    return {
      as,
      shares,
      message: 'You put money in for new shares.',
    };
  }
  withTx(world, { kind: 'loan' }, () =>
    payExact(
      world,
      me.accounts.local,
      c.account,
      amount,
      `Founder loan to ${c.name}`,
      month,
      'capital',
    ),
  );
  const loans = (c.founderLoans ??= {});
  loans[me.id] = (loans[me.id] ?? 0) + amount;
  return { as, owed: loans[me.id], message: 'Lent to the company. It owes you this back.' };
}

/** The company repays (part of) a founder's loan. Not salary, not income: just the loan back. */
export function repayFounder(world: World, me: Player, c: Company, amount: number, month: number) {
  const owed = c.founderLoans?.[me.id] ?? 0;
  ensure(owed > 0, 'repay.none', 'The company doesn’t owe you a founder loan.');
  ensure(amount > 0 && amount <= owed, 'repay.amount', 'Repay up to what the company owes you.');
  ensure(
    account(world, c.account).balance >= amount,
    'ledger.funds',
    'Not enough available cash in the company.',
  );
  withTx(world, { kind: 'loan' }, () =>
    pay(
      world,
      c.account,
      me.accounts.local,
      amount,
      `Founder loan repaid: ${c.name}`,
      month,
      'move',
    ),
  );
  c.founderLoans![me.id] = owed - amount;
  if (c.founderLoans![me.id] === 0) delete c.founderLoans![me.id];
  return { owed: owed - amount, message: 'Founder loan repaid.' };
}

function ensureReserve(world: World, c: Company): Id {
  if (c.reserve && world.accounts[c.reserve]) return c.reserve;
  const main = account(world, c.account);
  c.reserve = openAccount(world, {
    currency: main.currency,
    market: main.market,
    label: `${c.name} reserve`,
  });
  return c.reserve;
}

/** Move money between the company's main account and its reserve. */
export function moveReserve(
  world: World,
  c: Company,
  amount: number,
  dir: 'in' | 'out',
  month: number,
) {
  ensure(amount > 0, 'reserve.amount', 'Enter an amount.');
  const reserve = ensureReserve(world, c);
  const [from, to] = dir === 'in' ? [c.account, reserve] : [reserve, c.account];
  ensure(
    account(world, from).balance >= amount,
    'ledger.funds',
    dir === 'in' ? 'Not enough available cash.' : 'Not that much in the reserve.',
  );
  withTx(world, { kind: 'transfer' }, () =>
    transfer(
      world,
      from,
      to,
      amount,
      dir === 'in' ? 'Moved to the business reserve' : 'Released from the business reserve',
      month,
      'move',
    ),
  );
  return { reserve: reserveBalance(world, c), available: account(world, c.account).balance };
}

/**
 * Settlement: if the main account can't cover this month's costs, release the
 * shortfall from the reserve first. Only companies with a reserve are touched.
 */
export function releaseReserveIfShort(world: World, c: Company, month: number) {
  const held = reserveBalance(world, c);
  if (!c.reserve || held <= 0) return;
  const short = monthlyCosts(world, c) - account(world, c.account).balance;
  if (short <= 0) return;
  transfer(
    world,
    c.reserve,
    c.account,
    Math.min(held, short),
    'Reserve released to cover the month',
    month,
    'move',
  );
}

/**
 * Shutdown (before the waterfall): the reserve comes back into the main
 * account, and founder loans are repaid after the banks, before shareholders.
 * Call once with `stage: 'reserve'` first, then `stage: 'founders'` after lenders.
 */
export function windDownFounderFinance(
  world: World,
  c: Company,
  stage: 'reserve' | 'founders',
  month: number,
) {
  if (stage === 'reserve') {
    // An open Friends & Family round is refunded: the company isn't taking it.
    const open = openRoundOf(world, c.id);
    if (open) cancelFriendsRound(world, open, month);
    const held = reserveBalance(world, c);
    if (held > 0) transfer(world, c.reserve!, c.account, held, 'Reserve closed', month, 'move');
    return;
  }
  for (const [fid, owed] of Object.entries(c.founderLoans ?? {})) {
    const f = world.players[fid];
    const cash = account(world, c.account).balance;
    const paid = Math.min(owed, cash);
    if (f && paid > 0)
      pay(
        world,
        c.account,
        f.accounts.local,
        paid,
        `Founder loan repaid: ${c.name}`,
        month,
        'move',
      );
  }
  if (c.founderLoans) c.founderLoans = {};
}

/**
 * An exit (acquisition, fire sale): before the shareholder waterfall, an open
 * Friends & Family round is refunded, the reserve comes back into the main
 * account, and founder loans are repaid out of the sale price (then company
 * cash for any rest). Returns what is left of the proceeds for shareholders.
 * Companies without the new fields are untouched (old replays unchanged).
 */
export function exitFounderFinance(
  world: World,
  c: Company,
  proceeds: number,
  payer: Id,
  month: number,
): number {
  const open = openRoundOf(world, c.id);
  if (open) cancelFriendsRound(world, open, month);
  const held = reserveBalance(world, c);
  if (held > 0) transfer(world, c.reserve!, c.account, held, 'Reserve closed', month, 'move');
  let left = proceeds;
  for (const [fid, owed] of Object.entries(c.founderLoans ?? {})) {
    const f = world.players[fid];
    if (!f || owed <= 0) continue;
    const fromSale = Math.min(owed, left);
    if (fromSale > 0)
      pay(
        world,
        payer,
        f.accounts.local,
        fromSale,
        `Founder loan repaid: ${c.name}`,
        month,
        'move',
      );
    left -= fromSale;
    const rest = Math.min(owed - fromSale, account(world, c.account).balance);
    if (rest > 0)
      pay(
        world,
        c.account,
        f.accounts.local,
        rest,
        `Founder loan repaid: ${c.name}`,
        month,
        'move',
      );
  }
  if (c.founderLoans) c.founderLoans = {};
  return left;
}

// ---------------------------------------------------------------- Friends & Family

const rounds = (world: World) => (world.ffRounds ??= {});
const currencyOf = (world: World, c: Company) => account(world, c.account).currency;

export function getRound(world: World, id: Id): FriendsRound {
  const r = world.ffRounds?.[id];
  ensure(r, 'ff.missing', 'That round doesn’t exist.');
  return r;
}

export const committed = (r: FriendsRound) => r.commitments.reduce((a, x) => a + x.amount, 0);

export const openRoundOf = (world: World, companyId: Id): FriendsRound | undefined =>
  Object.values(world.ffRounds ?? {}).find((r) => r.companyId === companyId && r.status === 'open');

export function openFriendsRound(
  world: World,
  me: Player,
  c: Company,
  opts: { target: number; valuationCap: number; discountPct: number; inviteIds?: Id[] },
  month: number,
) {
  ensure(!openRoundOf(world, c.id), 'ff.open', 'You already have a Friends & Family round open.');
  ensure(!c.bannedFromRaising, 'ff.banned', 'Barred from raising after a fraud ruling.');
  ensure(
    c.capTable.roundsRaised === 0,
    'ff.priced',
    'Friends & Family comes before a priced round.',
  );
  ensure(opts.target > 0, 'ff.target', 'Set how much you want to raise.');
  ensure(
    opts.valuationCap > opts.target * 2,
    'ff.cap',
    'The valuation cap must be more than twice the target.',
  );
  ensure(
    opts.discountPct >= 0 && opts.discountPct <= FF.maxDiscountPct,
    'ff.discount',
    'Discount between 0 and 30%.',
  );
  const main = account(world, c.account);
  const id = newId(world, 'ff');
  const escrow = openAccount(world, {
    currency: main.currency,
    market: main.market,
    label: `${c.name} Friends & Family escrow`,
  });
  const r: FriendsRound = {
    id,
    companyId: c.id,
    founderId: me.id,
    market: c.market,
    target: opts.target,
    valuationCap: opts.valuationCap,
    discountPct: opts.discountPct,
    status: 'open',
    openedMonth: month,
    escrow,
    commitments: [],
  };
  rounds(world)[id] = r;
  // The invitation: player contacts and anyone named.
  const invited = new Set<Id>(opts.inviteIds ?? []);
  for (const k of me.contacts ?? []) if (k.kind === 'player') invited.add(k.refId);
  invited.delete(me.id);
  for (const pid of invited)
    notify(world, pid, {
      month,
      kind: 'deal',
      text: `${me.name} opened a Friends & Family round for ${c.name}. Back them on a SAFE in Money → Friends & Family.`,
    });
  return { roundId: id, invited: invited.size, message: 'Your Friends & Family round is open.' };
}

/** Why this player can't commit to this round (null: they can). */
export function commitBlocker(world: World, p: Player, r: FriendsRound): string | null {
  if (r.status !== 'open') return 'This round has closed.';
  const c = world.companies[r.companyId];
  if (!c || c.status !== 'active') return 'The company has closed.';
  if (c.founderIds.includes(p.id)) return 'Founders put money in as founder equity or a loan.';
  if (committed(r) >= r.target) return 'The round is full.';
  return null;
}

export function commitToRound(
  world: World,
  me: Player,
  r: FriendsRound,
  amount: number,
  month: number,
) {
  const why = commitBlocker(world, me, r);
  ensure(!why, 'ff.commit', why ?? '');
  const c = getCompany(world, r.companyId);
  const room = r.target - committed(r);
  ensure(amount > 0, 'ff.amount', 'Enter an amount.');
  ensure(amount <= room, 'ff.amount', 'That’s more than the round has room for.');
  ensure(
    amount >= Math.min(room, Math.ceil(r.target * FF.minCommitShare)),
    'ff.amount',
    'That’s below the smallest cheque for this round.',
  );
  const from = me.accounts.local;
  ensure(
    account(world, from).balance >=
      costIn(world, amount, currencyOf(world, c), account(world, from).currency),
    'ledger.funds',
    'You don’t have that much in your personal account.',
  );
  withTx(world, { kind: 'investment' }, () =>
    payExact(
      world,
      from,
      r.escrow,
      amount,
      `Friends & Family: ${c.name} (held until close)`,
      month,
      'invested',
    ),
  );
  const mine = r.commitments.find((x) => x.holderId === me.id);
  if (mine) mine.amount += amount;
  else
    r.commitments.push({
      holderId: me.id,
      name: me.name,
      ai: false,
      amount,
      fromAccount: from,
      month,
    });
  notify(world, r.founderId, {
    month,
    kind: 'deal',
    text: `${me.name} committed to your Friends & Family round for ${c.name}.`,
  });
  return {
    committed: committed(r),
    message: 'Committed. The money is held until the founder closes.',
  };
}

/**
 * Ask AI angels in the company's city to join (once a month per round). Each
 * of at most FF.aiPerAsk angels says yes on a draw weighted by the company
 * and the founder; amounts are bounded by their cheque, their cash and the
 * AI share of the round.
 */
export function askAiFriends(world: World, me: Player, r: FriendsRound, month: number) {
  ensure(r.status === 'open', 'ff.closed', 'This round has closed.');
  const asked = (r.aiAskedMonths ??= []);
  ensure(!asked.includes(month), 'ff.asked', 'You’ve asked the angels this month. Try next month.');
  asked.push(month);
  const c = getCompany(world, r.companyId);
  const rng = deriveRng(world.seed, 'ff', r.id, month);
  const aiSoFar = r.commitments.filter((x) => x.ai).reduce((a, x) => a + x.amount, 0);
  let aiRoom = Math.min(Math.floor(r.target * FF.aiShareMax) - aiSoFar, r.target - committed(r));
  const angels = rng
    .shuffle(
      activeAngels(world, c.market).filter((a) => {
        const f = world.funds[a.angel!.fundId];
        return f && !r.commitments.some((x) => x.holderId === f.id);
      }),
    )
    .slice(0, FF.aiPerAsk);
  const yes: { name: string; amount: number }[] = [];
  const no: string[] = [];
  const strength = clamp(
    0.2 +
      c.product.fit * 0.35 +
      c.stars.value / 12 +
      (lastPnl(c)?.revenue ? 0.15 : 0) +
      me.stars.value / 25,
    0.1,
    0.8,
  );
  for (const a of angels) {
    const f = world.funds[a.angel!.fundId]!;
    const fits = f.sectors === 'any' || f.sectors.includes(c.industry);
    if (aiRoom <= 0 || !rng.chance(strength * (fits ? 1 : 0.5))) {
      no.push(a.name);
      continue;
    }
    const want = Math.round(r.target * rng.range(0.1, 0.3));
    const amount = Math.min(aiRoom, account(world, f.account).balance, clamp(want, 1, f.check[1]));
    // Angel funds hold their city's currency, same as the company: no conversion.
    if (amount <= 0 || account(world, f.account).currency !== currencyOf(world, c)) {
      no.push(a.name);
      continue;
    }
    transfer(
      world,
      f.account,
      r.escrow,
      amount,
      `Friends & Family: ${c.name} (held until close)`,
      month,
      'invested',
    );
    r.commitments.push({
      holderId: f.id,
      name: a.name,
      ai: true,
      amount,
      fromAccount: f.account,
      month,
    });
    aiRoom -= amount;
    yes.push({ name: a.name, amount });
  }
  return { yes, no, committed: committed(r) };
}

/** Close: escrow → company once, one SAFE per backer. Nothing committed: nothing to close. */
export function closeFriendsRound(world: World, me: Player, r: FriendsRound, month: number) {
  ensure(r.status === 'open', 'ff.closed', 'This round has already closed.');
  ensure(
    r.founderId === me.id || getCompany(world, r.companyId).founderIds.includes(me.id),
    'company.forbidden',
    'Not your round.',
  );
  ensure(r.commitments.length > 0, 'ff.empty', 'No one has committed yet.');
  const c = getCompany(world, r.companyId);
  ensure(c.status === 'active', 'company.closed', 'The company is no longer operating.');
  const total = committed(r);
  withTx(world, { kind: 'investment' }, () =>
    transfer(world, r.escrow, c.account, total, `Friends & Family round: ${c.name}`, month, 'move'),
  );
  for (const x of r.commitments) {
    addSafe(c.capTable, {
      holderId: x.holderId,
      amount: x.amount,
      cap: r.valuationCap,
      month,
      ...(r.discountPct > 0 ? { discountPct: r.discountPct } : {}),
    });
    const key = `${x.holderId}:${c.id}`;
    const pos = (world.positions[key] ??= {
      investorId: x.holderId,
      companyId: c.id,
      invested: 0,
      returned: 0,
      month,
      writtenOff: false,
    });
    pos.invested += x.amount;
    if (!x.ai)
      notify(world, x.holderId, {
        month,
        kind: 'deal',
        text: `${c.name} closed its Friends & Family round. You hold a SAFE for your commitment.`,
      });
  }
  c.capTable.lastPostMoney = Math.max(c.capTable.lastPostMoney, r.valuationCap);
  r.status = 'closed';
  r.closedMonth = month;
  return {
    raised: total,
    backers: r.commitments.length,
    message: 'Round closed. The money is in the company.',
  };
}

/** Cancel: every commitment goes back where it came from. */
export function cancelFriendsRound(world: World, r: FriendsRound, month: number) {
  ensure(r.status === 'open', 'ff.closed', 'This round has already closed.');
  const c = getCompany(world, r.companyId);
  const m = getMarket(world, c.market);
  for (const x of r.commitments) {
    const to = world.accounts[x.fromAccount] ? x.fromAccount : holderAccount(world, m, x.holderId);
    withTx(world, { kind: 'refund' }, () =>
      pay(world, r.escrow, to, x.amount, `Friends & Family refund: ${c.name}`, month, 'move'),
    );
    if (!x.ai)
      notify(world, x.holderId, {
        month,
        kind: 'deal',
        text: `${c.name} cancelled its Friends & Family round. Your money is back.`,
      });
  }
  r.status = 'cancelled';
  r.closedMonth = month;
  return { message: 'Round cancelled. Everyone has been refunded.' };
}

// ---------------------------------------------------------------- views

const roundView = (world: World, viewer: Player, r: FriendsRound) => {
  const c = world.companies[r.companyId];
  const mine = r.commitments.find((x) => x.holderId === viewer.id);
  return {
    id: r.id,
    companyId: r.companyId,
    companyName: c?.name ?? '',
    founderName: world.players[r.founderId]?.name ?? '',
    currency: c ? currencyOf(world, c) : '',
    target: r.target,
    valuationCap: r.valuationCap,
    discountPct: r.discountPct,
    status: r.status,
    openedMonth: r.openedMonth,
    committed: committed(r),
    commitments: r.commitments.map((x) => ({ name: x.name, ai: x.ai, amount: x.amount })),
    yourCommitment: mine?.amount ?? 0,
    canAskAi:
      r.status === 'open' && !(r.aiAskedMonths ?? []).includes(getMarket(world, r.market).month),
    blocker: commitBlocker(world, viewer, r),
  };
};

/**
 * Rounds this player can see: their companies' rounds, open rounds in their
 * home city or the city they're in, and rounds by their contacts.
 */
export function friendsRoundsView(world: World, p: Player, hereMarket: string) {
  const contacts = new Set(
    (p.contacts ?? []).filter((k) => k.kind === 'player').map((k) => k.refId),
  );
  const mine = new Set(p.companyIds);
  return Object.values(world.ffRounds ?? {})
    .filter(
      (r) =>
        mine.has(r.companyId) ||
        r.commitments.some((x) => x.holderId === p.id) ||
        (r.status === 'open' &&
          (r.market === p.market || r.market === hereMarket || contacts.has(r.founderId))),
    )
    .sort((a, b) => b.openedMonth - a.openedMonth)
    .slice(0, 20)
    .map((r) => roundView(world, p, r));
}

/**
 * The company's money in plain terms (§7.4, FR-012): available vs reserve,
 * net burn, runway (or cash-flow positive), and a small balance sheet.
 */
export function founderFinanceView(world: World, c: Company) {
  const available = account(world, c.account).balance;
  const reserve = reserveBalance(world, c);
  const netBurn = burn(c);
  const positive = netBurn <= 0;
  const runway = positive ? null : Math.floor((available / netBurn) * 10) / 10;
  const runwayTotal = positive ? null : Math.floor(((available + reserve) / netBurn) * 10) / 10;
  const bankDebt = c.finance.loans.reduce((a, l) => a + l.outstanding, 0);
  const founderLoans = founderLoanTotal(c);
  const receivables = c.finance.receivables.reduce((a, r) => a + r.amount, 0);
  const assets = available + reserve + receivables;
  const liabilities = bankDebt + founderLoans + c.finance.unpaidPayroll;
  return {
    available,
    reserve,
    total: available + reserve,
    netBurn: Math.max(0, netBurn),
    cashFlowPositive: positive,
    runwayMonths: runway,
    runwayWithReserve: runwayTotal,
    founderLoans: Object.entries(c.founderLoans ?? {}).map(([id, owed]) => ({
      founderId: id,
      name: world.players[id]?.name ?? '',
      owed,
    })),
    founderEquity: Object.entries(c.founderEquity ?? {}).map(([id, amount]) => ({
      founderId: id,
      name: world.players[id]?.name ?? '',
      amount,
    })),
    sharePrice: sharePrice(world, c),
    balanceSheet: {
      cash: available,
      reserve,
      receivables,
      assets,
      bankDebt,
      founderLoans,
      unpaidPayroll: c.finance.unpaidPayroll,
      liabilities,
      equity: assets - liabilities,
    },
  };
}

/**
 * The firm (investor blueprint §8.4, Phase 6): the management company
 * behind a GP's funds.
 *
 *  - A fund manager founds a firm: its own account, a name, an office in
 *    the Investor Quarter and stars. Every fund the GP runs joins it; the
 *    funds' management fees are paid to the firm, which pays the team, and
 *    what is left is the GP's salary.
 *  - Hires: AI associates (more diligence hours), principals and partners
 *    (hours, a seat on the investment committee, a share of the carry pool),
 *    or real players invited as partners.
 *  - The carry pool: carry from every fund is split by partners' shares;
 *    the rest is the GP's (and, after a succession, the founder's share).
 *  - Partners ask for more carry now and then (own RNG stream 'firm'):
 *    agree, or they leave, and LPs worry about key people.
 *  - Firm stars blend fund performance, founder trust and LP trust; they set
 *    how big the next fund can be (§8.4 "sets the size of the next fund").
 *  - Succession (Phase 9): the founder steps back, a partner runs the firm,
 *    and the founder keeps a share of carry.
 *
 * Investor-career worlds only.
 */
import { managedFunds } from './career.js';
import { AI_FIRST_NAMES, AI_LAST_NAMES } from './data/fiction.js';
import { INVESTOR } from './data/investor.js';
import { ensure } from './errors.js';
import { fundMetrics } from './fundops.js';
import { achieve, col, getMarket, notify } from './helpers.js';
import { newId } from './ids.js';
import { account, openAccount, pay, transfer, transferUpTo } from './ledger.js';
import { clamp, roundTo } from './math.js';
import { formatMoney, scale } from './money.js';
import { investorOn } from './releases.js';
import { deriveRng } from './rng.js';
import { newStars } from './stars.js';
import type { Firm, FirmMember, Fund, Id, Player, World } from './types.js';

const firmsOf = (world: World): Record<Id, Firm> => (world.firms ??= {});

/** The firm this player owns (or runs after a succession), if any. */
function firmOf(world: World, p: Player): Firm | undefined {
  return Object.values(world.firms ?? {}).find(
    (f) => f.ownerId === p.id || f.succession?.successorId === p.id,
  );
}

function myFirm(world: World, me: Player): Firm {
  const f = firmOf(world, me);
  ensure(f, 'firm.none', 'Found your firm first.');
  return f;
}

const salaryCol: Record<FirmMember['title'], number> = {
  associate: INVESTOR.firm.associateCol,
  principal: INVESTOR.firm.principalCol,
  partner: INVESTOR.firm.partnerCol,
};
const hoursOf: Record<FirmMember['title'], number> = {
  associate: INVESTOR.firm.associateHours,
  principal: INVESTOR.firm.principalHours,
  partner: INVESTOR.firm.partnerHours,
};

/** `firm.found`: a fund manager sets up the management company. */
export function foundFirm(world: World, me: Player, name: string) {
  ensure(investorOn(world), 'firm.off', 'Not available yet.');
  ensure(!firmOf(world, me), 'firm.exists', 'You already have a firm.');
  ensure(
    me.career?.reached[4] !== undefined,
    'firm.rung',
    'A firm comes once you run a fund (rung 4: close Fund I).',
  );
  const clean = name.trim();
  ensure(clean.length >= 3 && clean.length <= 40, 'firm.name', 'Name your firm (3–40 characters).');
  const m = getMarket(world, me.market);
  const id = newId(world, 'firm');
  const accountId = openAccount(world, { currency: m.data.currency, market: m.id, label: clean });
  const funds = managedFunds(world, me);
  const firm: Firm = {
    id,
    name: clean,
    ownerId: me.id,
    market: m.id,
    account: accountId,
    fundIds: funds.map((f) => f.id),
    members: [],
    stars: newStars(me.stars.value),
    month: m.month,
  };
  firmsOf(world)[id] = firm;
  for (const f of funds) f.firmId = id;
  achieve(world, me, 'investor.firm', 'Founded a firm', m.month);
  return {
    firmId: id,
    message: `${clean} is open: an office in the Investor Quarter, fees from every fund.`,
  };
}

/** Bring a fund under the firm (new funds join on their own at launch). */
export function attachFund(world: World, f: Fund) {
  const manager = f.managerId ? world.players[f.managerId] : undefined;
  const firm = manager ? firmOf(world, manager) : undefined;
  if (!firm || f.firmId) return;
  f.firmId = firm.id;
  if (!firm.fundIds.includes(f.id)) firm.fundIds.push(f.id);
}

/** `firm.hire`: an AI associate, principal or partner from the talent pool. */
export function hire(world: World, me: Player, title: FirmMember['title']) {
  const firm = myFirm(world, me);
  ensure(
    firm.ownerId === me.id || firm.succession?.successorId === me.id,
    'firm.owner',
    'Only the firm’s head can hire.',
  );
  const active = firm.members.filter((x) => x.status === 'active');
  ensure(active.length < 8, 'firm.full', 'Eight people is as big as a firm gets here.');
  const m = getMarket(world, firm.market);
  const rng = deriveRng(world.seed, 'firm', firm.id, 'hire', firm.members.length);
  const first = AI_FIRST_NAMES[m.id] ?? AI_FIRST_NAMES.lagos;
  const last = AI_LAST_NAMES[m.id] ?? AI_LAST_NAMES.lagos;
  const name = `${rng.pick(first)} ${rng.pick(last)}`;
  const member: FirmMember = {
    id: `${firm.id}:m${firm.members.length + 1}`,
    name,
    title,
    playerId: null,
    carryShare: title === 'partner' ? INVESTOR.firm.partnerCarry / 2 : 0,
    salary: scale(col(m), salaryCol[title]),
    hours: hoursOf[title],
    month: m.month,
    status: 'active',
  };
  ensure(
    carryAllocated(firm) + member.carryShare <= 0.6,
    'firm.carry',
    'The carry pool can’t give partners more than 60%.',
  );
  firm.members.push(member);
  achieve(world, me, 'investor.first-hire', 'First partner or associate hired', m.month);
  return {
    memberId: member.id,
    message: `${name} joins ${firm.name} as ${title}: ${formatMoney(member.salary, m.data.currency)} a month, ${member.hours} hours.`,
  };
}

const carryAllocated = (firm: Firm) =>
  firm.members.filter((x) => x.status === 'active').reduce((a, x) => a + x.carryShare, 0);

/** `firm.invite`: invite a real player as a partner with a share of carry. */
export function invitePartner(world: World, me: Player, playerId: Id, carryShare: number) {
  const firm = myFirm(world, me);
  const p = world.players[playerId];
  ensure(p && !p.ai && p.id !== me.id, 'firm.invite', 'Invite another player.');
  ensure(carryShare > 0 && carryShare <= 0.3, 'firm.carry', 'Offer 1–30% of the carry pool.');
  ensure(
    carryAllocated(firm) + carryShare <= 0.6,
    'firm.carry',
    'The carry pool can’t give partners more than 60%.',
  );
  ensure(
    !firm.members.some((x) => x.playerId === playerId && x.status !== 'left'),
    'firm.invite',
    'They’re already invited or on the team.',
  );
  const m = getMarket(world, firm.market);
  firm.members.push({
    id: `${firm.id}:m${firm.members.length + 1}`,
    name: p.name,
    title: 'partner',
    playerId,
    carryShare,
    salary: 0,
    hours: 0,
    month: m.month,
    status: 'invited',
  });
  notify(world, playerId, {
    month: getMarket(world, p.market).month,
    kind: 'deal',
    text: `${me.name} invites you to join ${firm.name} as a partner with ${Math.round(carryShare * 100)}% of the carry pool. Answer in your Portfolio.`,
  });
  return { message: `Invitation sent to ${p.name}.` };
}

/** `firm.answer`: a player accepts or declines a partnership. */
export function answerPartner(world: World, me: Player, firmId: Id, accept: boolean) {
  const firm = world.firms?.[firmId];
  ensure(firm, 'firm.missing', 'Firm not found.');
  const mbr = firm.members.find((x) => x.playerId === me.id && x.status === 'invited');
  ensure(mbr, 'firm.invite', 'No invitation from this firm.');
  mbr.status = accept ? 'active' : 'left';
  notify(world, firm.ownerId, {
    month: getMarket(world, firm.market).month,
    kind: 'deal',
    text: accept
      ? `${me.name} joined ${firm.name} as a partner.`
      : `${me.name} declined to join ${firm.name}.`,
  });
  if (accept)
    achieve(
      world,
      world.players[firm.ownerId]!,
      'investor.first-hire',
      'First partner or associate hired',
      getMarket(world, firm.market).month,
    );
  return { status: mbr.status };
}

/** `firm.let-go`: someone leaves the team (key-person worries for LPs). */
export function letGo(world: World, me: Player, memberId: Id) {
  const firm = myFirm(world, me);
  const mbr = firm.members.find((x) => x.id === memberId && x.status === 'active');
  ensure(mbr, 'firm.member', 'Not on the team.');
  leave(world, firm, mbr, `${mbr.name} left ${firm.name}.`);
  return { status: mbr.status };
}

function leave(world: World, firm: Firm, mbr: FirmMember, text: string) {
  mbr.status = 'left';
  delete mbr.ask;
  firm.stars.value = roundTo(
    clamp(firm.stars.value - (mbr.title === 'partner' ? 0.2 : 0.05), 0, 5),
    2,
  );
  if (mbr.title === 'partner')
    for (const fid of firm.fundIds) {
      const lp = world.funds[fid]?.lp;
      if (!lp?.terms.keyPerson) continue;
      for (const r of Object.values(lp.relations)) r.trust = clamp(r.trust - 0.05, 0, 1);
    }
  notify(world, firm.ownerId, { month: getMarket(world, firm.market).month, kind: 'system', text });
}

/** `firm.carry-ask`: answer a partner asking for a bigger share of carry. */
export function answerCarryAsk(world: World, me: Player, memberId: Id, accept: boolean) {
  const firm = myFirm(world, me);
  const mbr = firm.members.find((x) => x.id === memberId && x.status === 'active' && x.ask);
  ensure(mbr && mbr.ask, 'firm.ask', 'No request from them.');
  if (accept) {
    const extra = mbr.ask.carryShare - mbr.carryShare;
    ensure(
      carryAllocated(firm) + extra <= 0.6,
      'firm.carry',
      'The carry pool can’t give partners more than 60%.',
    );
    mbr.carryShare = mbr.ask.carryShare;
    delete mbr.ask;
    return {
      message: `${mbr.name} stays, with ${Math.round(mbr.carryShare * 100)}% of the carry pool.`,
    };
  }
  leave(world, firm, mbr, `${mbr.name} left ${firm.name} after you said no to more carry.`);
  return { message: `${mbr.name} left the firm.` };
}

// ---------------------------------------------------------------- money

/**
 * A fund's management fee (funds.ts): to the firm when there is one. The
 * firm pays the team at month end and the GP takes what is left.
 */
export function feeRecipient(world: World, f: Fund): Id | null {
  if (!f.firmId) return null;
  return world.firms?.[f.firmId]?.account ?? null;
}

/** Carry from a fund: partners' shares of the pool, a succession share, the rest to the head. */
export function splitCarry(world: World, f: Fund, carry: number): { to: Player; amount: number }[] {
  const firm = f.firmId ? world.firms?.[f.firmId] : undefined;
  const head = world.players[firm?.succession?.successorId ?? f.managerId ?? ''];
  if (!firm || !head) return head ? [{ to: head, amount: carry }] : [];
  const out: { to: Player; amount: number }[] = [];
  let left = carry;
  for (const mbr of firm.members) {
    if (mbr.status !== 'active' || mbr.carryShare <= 0 || !mbr.playerId) continue;
    const p = world.players[mbr.playerId];
    if (!p) continue;
    const amount = Math.round(carry * mbr.carryShare);
    left -= amount;
    out.push({ to: p, amount });
  }
  // AI partners' carry: paid out to them (the outside world) by the caller.
  const ai = firm.members
    .filter((x) => x.status === 'active' && x.carryShare > 0 && !x.playerId)
    .reduce((a, x) => a + Math.round(carry * x.carryShare), 0);
  left -= ai;
  if (firm.succession) {
    const founder = world.players[firm.ownerId];
    if (founder) {
      const amount = Math.round(left * firm.succession.founderCarry);
      left -= amount;
      out.push({ to: founder, amount });
    }
  }
  out.push({ to: head, amount: left });
  return out;
}

/** AI partners' share of a carry payment (paid to the outside world). */
export function aiCarry(world: World, f: Fund, carry: number): number {
  const firm = f.firmId ? world.firms?.[f.firmId] : undefined;
  if (!firm) return 0;
  return firm.members
    .filter((x) => x.status === 'active' && x.carryShare > 0 && !x.playerId)
    .reduce((a, x) => a + Math.round(carry * x.carryShare), 0);
}

/**
 * Month end: the firm pays salaries (AI staff to payroll), the head takes
 * the rest as salary (taxed), associates add hours, stars move, and now and
 * then a partner asks for more carry.
 */
export function settleFirms(world: World, marketId: string, month: number) {
  if (!investorOn(world)) return;
  for (const firm of Object.values(world.firms ?? {})) {
    if (firm.market !== marketId) continue;
    const m = getMarket(world, firm.market);
    for (const fid of firm.fundIds) {
      const f = world.funds[fid];
      if (f) attachFund(world, f);
    }
    for (const f of Object.values(world.funds))
      if (f.managerId === firm.ownerId && !f.firmId && f.lp) attachFund(world, f);
    // Salaries: AI staff are paid out to the world; human partners take carry, not salary.
    for (const mbr of firm.members) {
      if (mbr.status !== 'active' || mbr.playerId) continue;
      transferUpTo(world, firm.account, m.ext.payroll, mbr.salary, `Salary: ${mbr.name}`, month);
    }
    // What is left is the head's salary (taxed where the firm is).
    const head = world.players[firm.succession?.successorId ?? firm.ownerId];
    const left = account(world, firm.account).balance;
    if (head && left > 0) {
      const tax = Math.round(left * m.data.tax.personalIncome);
      transfer(world, firm.account, m.ext.tax, tax, 'Personal income tax (withheld)', month);
      pay(world, firm.account, head.accounts.local, left - tax, `Firm salary: ${firm.name}`, month);
      head.lastMonth.income += left;
    }
    // Associates and partners add diligence hours to the head next month.
    if (head) {
      const extra = firm.members
        .filter((x) => x.status === 'active' && !x.playerId)
        .reduce((a, x) => a + x.hours, 0);
      head.hours.available += extra;
    }
    // Firm stars: fund performance, founder trust, LP trust.
    const funds = firm.fundIds.map((id) => world.funds[id]).filter((f): f is Fund => !!f && !!f.lp);
    const tvpi = funds.length
      ? funds.reduce((a, f) => a + fundMetrics(world, f).tvpi, 0) / funds.length
      : 1;
    const trusts = funds.flatMap((f) => Object.values(f.lp!.relations).map((r) => r.trust));
    const lpTrust = trusts.length ? trusts.reduce((a, x) => a + x, 0) / trusts.length : 0.5;
    const founderTrust = world.players[firm.ownerId]?.investor?.founderTrust ?? 0.5;
    const target = clamp(tvpi * 1.2 + lpTrust * 1.5 + founderTrust * 1.5, 0, 5);
    firm.stars.value = roundTo(firm.stars.value + (target - firm.stars.value) * 0.2, 2);
    firm.stars.history.push(firm.stars.value);
    if (firm.stars.history.length > 24) firm.stars.history.shift();
    // A partner asks for more carry now and then (once a quarter at most).
    if (month % 3 === 0) {
      const rng = deriveRng(world.seed, 'firm', firm.id, month);
      for (const mbr of firm.members) {
        if (mbr.status !== 'active' || mbr.title !== 'partner' || mbr.playerId || mbr.ask) continue;
        if (rng.next() < 0.25 && mbr.carryShare < INVESTOR.firm.partnerCarry * 1.5) {
          mbr.ask = { carryShare: roundTo(mbr.carryShare + 0.05, 2), month };
          notify(world, firm.ownerId, {
            month,
            kind: 'deal',
            text: `${mbr.name} wants ${Math.round(mbr.ask.carryShare * 100)}% of the carry pool, or will leave. Answer in your firm.`,
          });
        }
      }
    }
    // An unanswered ask for two months: they leave.
    for (const mbr of firm.members)
      if (mbr.status === 'active' && mbr.ask && month - mbr.ask.month >= 2)
        leave(world, firm, mbr, `${mbr.name} left ${firm.name}: you never answered.`);
  }
}

/** The largest next fund the firm can raise (§8.4): the last one, scaled by the firm's stars. */
export function nextFundCap(world: World, p: Player): number | null {
  const firm = firmOf(world, p);
  const funds = managedFunds(world, p);
  if (funds.length === 0) return null;
  const last = funds.reduce((a, f) => (f.vintageMonth >= a.vintageMonth ? f : a));
  const stars = firm?.stars.value ?? p.stars.value;
  return Math.round(Math.max(last.size, 1) * Math.min(3, 1 + stars / 2.5));
}

/** `firm.succession`: step back; a human partner runs the firm; you keep a share of carry. */
export function stepBack(world: World, me: Player, successorMemberId: Id, founderCarry: number) {
  const firm = myFirm(world, me);
  ensure(
    firm.ownerId === me.id && !firm.succession,
    'firm.succession',
    'Only the founder can hand over, once.',
  );
  const mbr = firm.members.find(
    (x) => x.id === successorMemberId && x.status === 'active' && x.title === 'partner',
  );
  ensure(mbr && mbr.playerId, 'firm.succession', 'Hand over to a partner who is a real player.');
  ensure(founderCarry > 0 && founderCarry <= 0.5, 'firm.succession', 'Keep 1–50% of the carry.');
  const m = getMarket(world, firm.market);
  firm.succession = { successorId: mbr.playerId, month: m.month, founderCarry };
  // The successor runs the firm's funds from now on.
  for (const fid of firm.fundIds) {
    const f = world.funds[fid];
    if (f && f.lp && f.lp.stage !== 'wound-down') {
      f.managerId = mbr.playerId;
      const successor = world.players[mbr.playerId];
      if (successor?.investor && !successor.investor.fundId) successor.investor.fundId = f.id;
    }
  }
  achieve(world, me, 'investor.succession', 'Handed the firm to a successor', m.month);
  notify(world, mbr.playerId, {
    month: m.month,
    kind: 'deal',
    text: `${me.name} handed ${firm.name} to you. You run its funds now.`,
  });
  return {
    message: `${mbr.name} runs ${firm.name} now. You keep ${Math.round(founderCarry * 100)}% of the carry.`,
  };
}

// ---------------------------------------------------------------- view

export function firmView(world: World, p: Player) {
  if (!investorOn(world) || p.ai) return null;
  const firm = firmOf(world, p);
  const invites = Object.values(world.firms ?? {})
    .filter((f) => f.members.some((x) => x.playerId === p.id && x.status === 'invited'))
    .map((f) => ({
      firmId: f.id,
      name: f.name,
      from: world.players[f.ownerId]?.name ?? '',
      carryShare: f.members.find((x) => x.playerId === p.id && x.status === 'invited')!.carryShare,
    }));
  const partnerOf = Object.values(world.firms ?? {})
    .filter((f) => f.members.some((x) => x.playerId === p.id && x.status === 'active'))
    .map((f) => ({
      firmId: f.id,
      name: f.name,
      carryShare: f.members.find((x) => x.playerId === p.id)!.carryShare,
    }));
  if (!firm)
    return {
      firm: null,
      canFound: p.career?.reached[4] !== undefined,
      invites,
      partnerOf,
      nextFundCap: nextFundCap(world, p),
    };
  const m = getMarket(world, firm.market);
  const funds = firm.fundIds.map((id) => world.funds[id]).filter((f): f is Fund => !!f);
  const aum = funds.reduce((a, f) => a + f.size, 0);
  return {
    firm: {
      id: firm.id,
      name: firm.name,
      currency: m.data.currency,
      stars: roundTo(firm.stars.value, 1),
      starHistory: firm.stars.history,
      aum,
      cash: account(world, firm.account).balance,
      funds: funds.map((f) => ({
        id: f.id,
        name: f.name,
        vintage: f.vintageMonth,
        size: f.size,
        stage: f.lp?.stage ?? 'investing',
        strategy: f.lp?.strategy ?? 'seed',
        tvpi: fundMetrics(world, f).tvpi,
      })),
      members: firm.members
        .filter((x) => x.status !== 'left')
        .map((x) => ({ ...x, ai: x.playerId === null })),
      carryPool: { partners: carryAllocated(firm), head: roundTo(1 - carryAllocated(firm), 2) },
      salaries: firm.members
        .filter((x) => x.status === 'active' && !x.playerId)
        .reduce((a, x) => a + x.salary, 0),
      succession: firm.succession ?? null,
      isHead: (firm.succession?.successorId ?? firm.ownerId) === p.id,
      hireCost: {
        associate: scale(col(m), salaryCol.associate),
        principal: scale(col(m), salaryCol.principal),
        partner: scale(col(m), salaryCol.partner),
      },
    },
    canFound: false,
    invites,
    partnerOf,
    nextFundCap: nextFundCap(world, p),
  };
}

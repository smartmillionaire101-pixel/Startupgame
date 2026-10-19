import { livingCommand, orderFurniture, queueDelivery } from './living.js';
import {
  acceptHoliday,
  declineHoliday,
  doTogether,
  holidayJoined,
  inviteHoliday,
  knockHotel,
  answerKnock,
  leaveVisit,
} from './holidays.js';
import { expirePlay, playCommand } from './play.js';
/**
 * The command dispatcher: (world, command, actor, now) → new world + result.
 *
 * Runs each command inside an Immer producer (a settlement on a private copy
 * of the world instead, see WHOLE_WORLD), so a rule violation anywhere
 * (GameRuleError) rolls the whole command back: no half-applied deals.
 */
import { produce } from 'immer';
import { PLAYABLE_ROLES, backgroundById } from './data/characters.js';
import { PUBLIC_MULTIPLES } from './data/markets.js';
import { rulesFor } from './data/rules.js';
import type { Command } from './commands.js';
import { SYSTEM_COMMANDS } from './commands.js';
import { appearanceSeed, defaultAppearance } from './appearance.js';
import { payExpense } from './firstsession.js';
import { comply, pivot, setTargets, shutdownCompany } from './company.js';
import { actOnDeal, canAct, monthlyPayment, openDeal } from './deals.js';
import type { DealAction } from './deals.js';
import { ensure, fail, GameRuleError } from './errors.js';
import {
  DILIGENCE_HOURS,
  PARTNER_MEETING_HOURS,
  PITCH_HOURS,
  answerPitch,
  partnerMeeting,
  proposeInvestment,
  startPitch,
} from './fundraising.js';
import { raiseFund } from './funds.js';
import { injectCapital, repayPersonalLoan, requestPersonalLoan } from './credit.js';
import { requestCompanyProductLoan, requestFounderProductLoan } from './capital.js';
import { bookFlight, cancelFlight, fly, hasVisited, relocate, ride, travel } from './travel.js';
import { cancelEvent, hostEvent, rsvpEvent } from './events.js';
import { advanceDeal, dropDeal, prospect } from './sales.js';
import { chooseDecision } from './decisions.js';
import {
  acceptSecondary,
  buyShares,
  declineSecondary,
  listCompany,
  prepareIpo,
  proposeSecondary,
  seedPublicMarket,
  sellShares,
} from './exits.js';
import { exitsOn, investorOn, lifeBarsOn } from './releases.js';
import { backSyndicate, cancelSyndicate, closeSyndicate, openSyndicate } from './syndicates.js';
import {
  answerProRata,
  requestExtension,
  requestIc,
  setPlan,
  setReserve,
  writeLetter,
} from './fundops.js';
import {
  abandonFund,
  closeFund,
  commitToFund,
  delayCall,
  launchFund,
  lpDiligence,
  payCall,
  setAutopay,
} from './lpfunds.js';
import { buyIndex, cancelOrder, ensureExchange, placeOrder, sellIndex } from './exchange.js';
import {
  answerInvitation,
  recordCareer,
  startInvestorTutorial,
  tutorialCommand,
} from './career.js';
import { golfRound, mallBuy } from './leisure.js';
import {
  HOME_ACT_BARS,
  LIFE_BARS,
  applyBars,
  barsOf,
  foodBars,
  rideBars,
  venueBars,
  walk,
  workStress,
} from './lifebars.js';
import {
  answerMentoring,
  carrySerialFounder,
  decideCareer,
  endMentoring,
  joinCareer,
  leaveCareer,
  offerMentoring,
  pledge,
  serialEligible,
} from './allocator.js';
import {
  getBusiness,
  pitchBusiness,
  quitJob,
  specOf,
  takeBusinessGig,
  takeJob,
  venueBuy,
} from './economy.js';
import { buyCar, buyFurniture, sellCar } from './shop.js';
import { foodOrder, homeAct, homeInvite } from './needs.js';
import { removeContact, saveContact } from './people.js';
import {
  acceptVisit,
  attendTechEvent,
  declineVisit,
  inviteVisit,
  joinHangout,
  leaveHangout,
  planHangout,
  sendMoney,
} from './social.js';
import {
  applyAccelerator,
  applyGrant,
  broadcastEvent,
  pitchAngel,
  pitchLp,
  quickInvest,
} from './programs.js';
import { createListing, endContract, proposeSupply, reviewSupplier } from './marketplace.js';
import { buyProperty, letProperty, moveIn, sellProperty } from './property.js';
import { acceptGift, declineGift, giftProperty } from './gifts.js';
import { closeBranch, openBranch } from './branches.js';
import { enterCompetition, joinJudges, scoreEntry } from './competitions.js';
import { proposeAcquisition } from './acquisitions.js';
import { boardOf, castVote, openVote } from './governance.js';
import { fileDispute } from './arbitration.js';
import {
  BANK_TYPES,
  MIN_CAPITAL_RATIO,
  bankFigures,
  foundBank,
  getBank,
  moveAccount,
  ownBank,
} from './banks.js';
import {
  achieve,
  col,
  getCompany,
  getMarket,
  getPlayer,
  lastPnl,
  notify,
  ownCompany,
  publish,
  spendHours,
} from './helpers.js';
import { account, keepStatement, transfer } from './ledger.js';
import { clamp, clamp01 } from './math.js';
import { formatMoney, scale } from './money.js';
import {
  acceptInvite,
  answerInvite,
  declineInvite,
  pitchStory,
  publishInvite,
  pullInvite,
} from './media.js';
import { convertPersonal, openUsdAccount, setLifestyle, takeGig } from './personal.js';
import { deriveRng } from './rng.js';
import { settleMarket } from './settlement.js';
import { bandSalary, evaluateOffer, hire, layoff } from './staff.js';
import {
  closeRole,
  hireAiCofounder,
  interview,
  onPipelineDecline,
  onPipelineHire,
  openRole,
  pipelineCandidate,
  sourceCandidates,
} from './hiring.js';
import { companyRunway } from './company.js';
import {
  BRIDGE_HOURS,
  FIRE_SALE_HOURS,
  HIBERNATE_HOURS,
  cutCosts,
  fireSale,
  requestBridge,
  setHibernation,
} from './rescue.js';
import { createCompany, createPlayer, openMarket, setCogs, welcomeNewPlayer } from './world.js';
import type { DealTerms, Id, PartyRef, Player, World } from './types.js';
import {
  chooseBootstrap,
  dismissObjective,
  hasJourney,
  pinObjective,
  recordChapters,
  recordChaptersAfterSettle,
} from './journey.js';
import {
  addFeature,
  contractProject,
  dismissFeedback,
  prioritise,
  releaseProject,
  removeProject,
} from './roadmap.js';
import {
  askAiFriends,
  cancelFriendsRound,
  closeFriendsRound,
  commitToRound,
  contribute,
  getRound,
  moveReserve,
  openFriendsRound,
  repayFounder,
} from './founderfinance.js';

export interface CommandContext {
  /** The authenticated player, or null for system commands issued by the server. */
  actorId: Id | null;
  /** Wall-clock time (ms). Part of the command log so replays are exact. */
  now: number;
}

export type DispatchResult =
  | { ok: true; world: World; result: unknown }
  | { ok: false; world: World; error: { code: string; message: string } };

/**
 * Commands that read and write much of the world (a month-end settlement walks
 * every company, account, bank and player of a market, many times over). Under
 * Immer each of those reads makes a proxy, which in a busy world made one
 * settlement take seconds. These run instead on a private deep copy of the
 * world, mutated in place: the same code, the same writes in the same order,
 * so the same resulting world, and a rule error still discards everything.
 */
const WHOLE_WORLD = new Set<Command['type']>(['market.settle']);

/** A deep copy of plain data (the world is JSON-shaped: objects, arrays, primitives). */
function copyDeep<T>(v: T): T {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) {
    const out = new Array(v.length);
    for (let i = 0; i < v.length; i++) out[i] = copyDeep(v[i]);
    return out as T;
  }
  const out: Record<string, unknown> = {};
  for (const k in v) if (Object.hasOwn(v, k)) out[k] = copyDeep((v as Record<string, unknown>)[k]);
  return out as T;
}

/**
 * Frozen like Immer's results, so nothing outside dispatch can change a world
 * by accident. Parts already frozen (shared with earlier worlds) are skipped.
 */
function freezeDeep<T>(v: T): T {
  if (v === null || typeof v !== 'object' || Object.isFrozen(v)) return v;
  Object.freeze(v);
  for (const k in v) if (Object.hasOwn(v, k)) freezeDeep((v as Record<string, unknown>)[k]);
  return v;
}

function onPrivateCopy(world: World, recipe: (draft: World) => void): World {
  const draft = copyDeep(world);
  recipe(draft);
  return freezeDeep(draft);
}

export function dispatch(world: World, command: Command, ctx: CommandContext): DispatchResult {
  if (SYSTEM_COMMANDS.has(command.type) !== (ctx.actorId === null)) {
    return { ok: false, world, error: { code: 'command.forbidden', message: 'Not allowed.' } };
  }
  let result: unknown = null;
  try {
    const recipe = (draft: World) => {
      draft.activity ??= { since: ctx.now, at: ctx.now, sequence: 0, totals: {}, recent: [] };
      draft.activity.at = ctx.now;
      const actor = ctx.actorId ? draft.players[ctx.actorId] : undefined;
      if (actor) keepStatement(draft as World, actor);
      expirePlay(draft as World, ctx.now);
      result = apply(draft as World, command, ctx);
      // Phase 3: what the command did to the actor's life bars (after the release note).
      if (ctx.actorId && lifeBarsOn(draft as World))
        result = lifeBarsAfter(draft as World, command, ctx.actorId, result);
      // The founder journey: record chapters this command (or settlement) completed.
      if (command.type === 'market.settle')
        recordChaptersAfterSettle(draft as World, command.market);
      const who = ctx.actorId ? draft.players[ctx.actorId] : undefined;
      if (who) recordChapters(draft as World, who as Player);
      // The investor career: rungs reached, invitations (investor-career worlds only).
      if (who) recordCareer(draft as World, who as Player);
      if (command.type === 'market.settle' && investorOn(draft as World))
        for (const p of Object.values(draft.players))
          if (p.market === command.market) recordCareer(draft as World, p as Player);
      // The result is read (sent to the client) after the producer finished, when
      // any draft in it is revoked: copy it out as plain data while drafts still work.
      if (!WHOLE_WORLD.has(command.type)) result = copyDeep(result);
      draft.version += 1;
    };
    const next = WHOLE_WORLD.has(command.type)
      ? onPrivateCopy(world, recipe)
      : produce(world, recipe);
    return { ok: true, world: next, result };
  } catch (e) {
    if (e instanceof GameRuleError)
      return { ok: false, world, error: { code: e.code, message: e.message } };
    throw e;
  }
}

/** Start a company (company.found; company.start adds what a serial founder carries). */
function foundCompany(
  world: World,
  me: Player,
  setup: Extract<Command, { type: 'company.found' }>['company'],
  month: number,
) {
  const active = me.companyIds.filter((id) => world.companies[id]?.status === 'active').length;
  ensure(
    active < 2,
    'company.limit',
    'Two ventures at once is the limit; your hours are already split.',
  );
  const c = createCompany(world, { founderId: me.id, ...setup });
  if (me.failures > 0) achieve(world, me, 'any.comeback', 'First comeback after failure', month);
  if (me.role === 'investor') achieve(world, me, 'any.role-switch', 'First role switch', month);
  welcomeNewPlayer(world, me, c.id);
  // Trust becomes usable in a comeback: people who trust you hear first (§13).
  if (me.failures > 0) {
    for (const other of Object.values(world.players)) {
      if (other.ai || other.id === me.id || (other.trust[me.id] ?? 0) < 0.2) continue;
      notify(world, other.id, {
        month,
        kind: 'pitch',
        text: `${me.name}, whom you’ve worked with before, just started ${c.name}.`,
        ref: { kind: 'company', id: c.id },
      });
    }
  }
  return { companyId: c.id };
}

function apply(world: World, cmd: Command, ctx: CommandContext): unknown {
  if (cmd.type === 'market.open') {
    const m = openMarket(world, cmd.market, ctx.now);
    // A city opening after the stock market did gets its listings too.
    if (exitsOn(world)) seedPublicMarket(world, m.id);
    ensureExchange(world, m.id);
    return {
      market: m.id,
      funds: Object.values(world.funds).filter((f) => f.market === m.id).length,
    };
  }
  if (cmd.type === 'market.settle') {
    const m = getMarket(world, cmd.market);
    ensure(cmd.at === undefined || cmd.date === undefined, 'settle.clock', 'One clock at a time.');
    if (cmd.date !== undefined)
      ensure(
        m.lastSettledDate === null || cmd.date > m.lastSettledDate,
        'settle.date',
        'Already settled for that date.',
      );
    if (cmd.at !== undefined)
      ensure(
        m.settledAt === undefined || cmd.at > m.settledAt,
        'settle.date',
        'Already settled for that period.',
      );
    settleMarket(world, cmd.market, ctx.now, { at: cmd.at, date: cmd.date, monthMs: cmd.monthMs });
    return { month: m.month };
  }
  if (cmd.type === 'market.data') return applyMarketData(world, cmd);
  if (cmd.type === 'player.anonymize') return anonymize(world, cmd.playerId);
  if (cmd.type === 'system.announce') return announce(world, cmd);

  const actorId = ctx.actorId!;
  if (cmd.type === 'player.create') return createFromOnboarding(world, cmd, actorId, ctx.now);
  if (cmd.type === 'player.quickStart') {
    const market =
      cmd.market && world.markets[cmd.market]
        ? cmd.market
        : world.markets.lagos
          ? 'lagos'
          : Object.values(world.markets)[0]!.id;
    // Founder Journey 6: the background picked at onboarding, else the role's default.
    const backgroundId =
      cmd.backgroundId ??
      { founder: 'f-engineer', investor: 'i-first', banker: 'b-commercial' }[cmd.role];
    const p = createPlayer(world, {
      playerId: actorId,
      handle: cmd.username,
      name: cmd.name?.trim() || cmd.username,
      role: cmd.role,
      backgroundId,
      market,
      now: ctx.now,
    });
    if (cmd.gender) p.gender = cmd.gender;
    if (cmd.role === 'investor') {
      const bg = backgroundById(backgroundId)!;
      p.investor = {
        sectors: ['fintech'],
        stages: ['pre-seed', 'seed'],
        checkSize: col(getMarket(world, market)),
        lpCredibility: bg.lpCredibility ?? 0.3,
        founderTrust: bg.founderTrust ?? 0.5,
      };
    }
    welcomeNewPlayer(world, p, null);
    if (p.role === 'investor') startInvestorTutorial(world, p);
    return { playerId: p.id, companyId: null };
  }

  const me = getPlayer(world, actorId);
  ensure(!me.ai, 'player.ai', 'AI players are run by the simulation.');
  me.lastActiveAt = ctx.now;
  const m = getMarket(world, me.market);
  const month = m.month;
  const touch = (companyId: Id) => {
    const c = ownCompany(world, me.id, companyId);
    c.lastDecisionMonth = month;
    return c;
  };

  if (cmd.type.startsWith('living.'))
    return livingCommand(world, me, cmd as Extract<Command, { type: `living.${string}` }>, ctx.now);
  if (cmd.type.startsWith('play.'))
    return playCommand(world, me, cmd as Extract<Command, { type: `play.${string}` }>, ctx.now);

  switch (cmd.type) {
    case 'player.appearance': {
      // Cosmetic: how you're drawn, never a number in the simulation. Parts
      // left out keep what you had, or the look your seed gave you.
      const was = me.appearance ?? defaultAppearance(appearanceSeed(me), me.gender);
      const next = { ...was };
      for (const [k, v] of Object.entries(cmd.appearance))
        if (v !== undefined) (next as Record<string, unknown>)[k] = v;
      me.appearance = next;
      me.appearanceAt = ctx.now;
      return { appearance: next };
    }
    case 'player.profile': {
      const bg = backgroundById(cmd.backgroundId);
      ensure(bg && bg.role === me.role, 'player.background', 'Pick a background for your role.');
      me.name = cmd.name.trim();
      if (cmd.gender) me.gender = cmd.gender;
      // Biography edits never reset earned skills, savings or reputation.
      me.backgroundId = cmd.backgroundId;
      if (cmd.investor) {
        ensure(
          me.role === 'investor' && me.investor,
          'investor.role',
          'Only investors can set an investment focus.',
        );
        me.investor = { ...me.investor!, ...cmd.investor };
      }
      for (const other of Object.values(world.players))
        for (const contact of other.contacts ?? [])
          if (contact.kind === 'player' && contact.refId === me.id) contact.name = me.name;
      return { saved: true };
    }
    // ------------------------------------------------------------ founder
    case 'company.strategy': {
      const c = touch(cmd.companyId);
      if (cmd.price !== undefined) {
        ensure(cmd.price > 0, 'strategy.price', 'Price must be above zero.');
        c.price = cmd.price;
      }
      if (cmd.marketingBudget !== undefined) c.marketingBudget = cmd.marketingBudget;
      if (cmd.founderSalary !== undefined) {
        ensure(
          cmd.founderSalary <= scale(col(m), 10),
          'strategy.salary',
          'That salary would alarm any investor.',
        );
        c.founderSalary = cmd.founderSalary;
      }
      if (cmd.buildMode) c.product.buildMode = cmd.buildMode;
      if (cmd.targetSegments) setTargets(world, c, cmd.targetSegments);
      setCogs(world, c);
      return { message: 'Strategy updated.' };
    }
    case 'company.discovery': {
      const c = touch(cmd.companyId);
      const seg = m.segments[cmd.segmentKey];
      ensure(
        seg && seg.industry === c.industry,
        'discovery.segment',
        'Pick a segment in your sector.',
      );
      spendHours(me, 20, 'Customer discovery');
      transfer(
        world,
        c.account,
        m.ext.suppliers,
        scale(col(m), 0.2),
        `Customer discovery: ${seg.name}`,
        month,
      );
      const d = c.product.discovery[seg.key] ?? 0;
      const learned = 0.35 * (1 - d) * (0.6 + me.skills.sales / 120);
      c.product.discovery[seg.key] = clamp01(d + learned);
      me.skills.sales = Math.min(100, me.skills.sales + 1);
      return {
        message: `You spoke to ${seg.name.toLowerCase()}. Needs: ${seg.needsLabel}.`,
        discovery: c.product.discovery[seg.key],
      };
    }
    case 'company.build': {
      const c = touch(cmd.companyId);
      ensure(!c.hibernation, 'build.hibernating', 'The product is frozen while you hibernate.');
      spendHours(me, cmd.hours, 'Building');
      c.buildHours += cmd.hours;
      me.skills.product = Math.min(100, me.skills.product + cmd.hours / 40);
      return { message: `${cmd.hours}h of building logged. It shows at month end.` };
    }
    case 'company.offer': {
      const c = touch(cmd.companyId);
      ensure(!c.hibernation, 'hire.hibernating', 'You can’t hire while the company hibernates.');
      // The talent pool, or (§6.4) a candidate sourced through the hiring pipeline.
      const piped = m.talent.some((t) => t.id === cmd.candidateId)
        ? undefined
        : pipelineCandidate(c, cmd.candidateId);
      const cand = piped ?? m.talent.find((t) => t.id === cmd.candidateId);
      ensure(cand, 'hire.candidate', 'That candidate has left the market.');
      spendHours(me, 2, 'Making an offer');
      const runway = companyRunway(world, c);
      const res = evaluateOffer(
        world,
        c,
        me,
        cand,
        { salary: cmd.salary, equityBps: cmd.equityBps },
        runway,
      );
      me.skills.hiring = Math.min(100, me.skills.hiring + 0.5);
      me.skills.negotiation = Math.min(100, me.skills.negotiation + 0.3);
      if (res.outcome === 'accept') {
        const s = hire(world, c, cand, cmd.salary, cmd.equityBps, month);
        if (piped) onPipelineHire(world, c, piped, s);
        return { ...res, staffId: s.id };
      }
      cand.rejectedBy.push(c.id);
      if (piped && res.outcome === 'decline') onPipelineDecline(piped, c.id);
      if (res.outcome === 'decline' && cand.rejectedBy.filter((x) => x === c.id).length >= 2) {
        m.talent = m.talent.filter((t) => t.id !== cand.id);
      }
      return res;
    }
    case 'company.layoff': {
      const c = touch(cmd.companyId);
      const s = c.staff.find((x) => x.id === cmd.staffId);
      ensure(s, 'staff.missing', 'Staff member not found.');
      if (cmd.generous)
        transfer(world, c.account, m.ext.payroll, s.salary * 2, `Severance: ${s.name}`, month);
      layoff(c, cmd.staffId, cmd.generous, me);
      return {
        message: cmd.generous
          ? `${s.name} left with two months’ pay.`
          : `${s.name} was let go with nothing. The team noticed.`,
      };
    }
    case 'company.raiseSalary': {
      const c = touch(cmd.companyId);
      const s = c.staff.find((x) => x.id === cmd.staffId);
      ensure(s, 'staff.missing', 'Staff member not found.');
      ensure(
        cmd.salary > s.salary,
        'staff.raise',
        'A raise must be higher than the current salary.',
      );
      s.morale = clamp(s.morale + 40 * (cmd.salary / s.salary - 1) + 5, 0, 100);
      s.salary = cmd.salary;
      return {
        message: `${s.name} is happier.`,
        band: bandSalary(world, c.market, s.role, s.seniority),
      };
    }
    case 'company.comply': {
      const c = touch(cmd.companyId);
      const rule = rulesFor(c.market, c.industry).find((r) => r.id === cmd.ruleId);
      ensure(rule, 'rule.missing', 'That rule doesn’t apply to you.');
      spendHours(me, rule.hours, `Compliance (${rule.title})`);
      comply(world, c, cmd.ruleId, month);
      return { message: `Compliant: ${rule.title}.` };
    }
    case 'company.pivot': {
      const c = touch(cmd.companyId);
      spendHours(me, 20, 'A pivot');
      pivot(
        world,
        c,
        cmd.kind,
        { segments: cmd.segments, industry: cmd.industry, revenueModel: cmd.revenueModel },
        deriveRng(world.seed, 'pivot', c.id, c.pivots),
      );
      return {
        message:
          c.pivots > 2
            ? 'Pivoted. Investors are starting to worry about focus.'
            : 'Pivoted. Some customers and staff didn’t come along.',
      };
    }
    case 'company.shutdown': {
      const c = touch(cmd.companyId);
      shutdownCompany(world, c, 'orderly', month);
      return { message: `${c.name} has shut down.` };
    }
    case 'company.loan': {
      const c = touch(cmd.companyId);
      if (cmd.bankId) {
        // A player bank: the banker reads the request and decides (accept, counter or decline).
        const bank = getBank(world, cmd.bankId);
        ensure(
          bank.status === 'licensed' && bank.market === c.market,
          'loan.bank',
          'Pick a licensed bank in your market.',
        );
        ensure(
          bank.type !== 'venture-debt' || c.lastRound !== null,
          'loan.bank',
          'Venture debt is for startups that have raised equity.',
        );
        const deal = openDeal(world, {
          companyId: c.id,
          proposer: { kind: 'company', id: c.id },
          counterparty: { kind: 'playerbank', id: bank.id },
          terms: {
            kind: 'loan',
            amount: cmd.amount,
            rateBps: m.data.baseRateBps + Math.round(bank.policy.loanSpreadPp * 100),
            months: cmd.months,
            personalGuarantee: cmd.personalGuarantee,
          },
          by: me.id,
        });
        return { dealId: deal.id, message: `Request sent to ${bank.name}.` };
      }
      if (cmd.lenderId || cmd.productId) {
        ensure(
          !!cmd.lenderId && !!cmd.productId && !cmd.bankId,
          'loan.product',
          'Pick a lender and one of its loans.',
        );
        return requestCompanyProductLoan(world, c, me, {
          lenderId: cmd.lenderId!,
          productId: cmd.productId!,
          amount: cmd.amount,
          months: cmd.months,
          personalGuarantee: cmd.personalGuarantee,
        });
      }
      ensure(cmd.months <= 36, 'loan.term', 'Bank loans run 3–36 months.');
      const pnl = lastPnl(c);
      ensure(
        month - c.foundedMonth >= 3 && pnl && pnl.revenue > 0,
        'loan.early',
        `${m.bankName}: “Come back with at least three months of revenue.”`,
      );
      ensure(
        !Object.values(world.deals).some(
          (d) => d.companyId === c.id && d.status === 'open' && d.terms.kind === 'loan',
        ),
        'loan.open',
        'You already have a loan offer open.',
      );
      const maxAmount = Math.round(pnl.revenue * (3 + c.stars.value));
      const spreadPp =
        Math.max(3, 8 - c.stars.value) + me.credit.defaults * 3 - (cmd.personalGuarantee ? 2 : 0);
      const terms: DealTerms = {
        kind: 'loan',
        amount: Math.min(cmd.amount, maxAmount),
        rateBps: m.data.baseRateBps + Math.round(spreadPp * 100),
        months: cmd.months,
        personalGuarantee: cmd.personalGuarantee,
      };
      ensure(terms.amount > 0, 'loan.amount', 'Ask for an amount.');
      const deal = openDeal(world, {
        companyId: c.id,
        proposer: { kind: 'bank', id: m.id },
        counterparty: { kind: 'company', id: c.id },
        terms,
        by: m.id,
        aiLimit: { maxAmount },
      });
      return {
        dealId: deal.id,
        message:
          cmd.amount > maxAmount
            ? `${m.bankName} can lend up to ${formatMoney(maxAmount, m.data.currency)}.`
            : 'Loan offer ready.',
        monthly: monthlyPayment(terms.amount, terms.rateBps, terms.months),
      };
    }
    // ------------------------------------------------------------ rescue plan
    case 'company.cutCosts': {
      const c = touch(cmd.companyId);
      return cutCosts(
        world,
        c,
        { marketing: cmd.marketing, founderSalary: cmd.founderSalary, office: cmd.office },
        month,
      );
    }
    case 'company.hibernate': {
      const c = touch(cmd.companyId);
      if (cmd.on) spendHours(me, HIBERNATE_HOURS, 'Furloughing the team');
      return setHibernation(world, c, cmd.on, month);
    }
    case 'company.bridge': {
      const c = touch(cmd.companyId);
      spendHours(me, BRIDGE_HOURS, 'Calling your investors');
      const deals = requestBridge(world, c, cmd.amount, me.id);
      const accepted = deals.filter((d) => d.status === 'accepted').length;
      const waiting = deals.filter((d) => d.status === 'open').length;
      return {
        dealIds: deals.map((d) => d.id),
        deals: deals.map((d) => ({ dealId: d.id, status: d.status, summary: d.summary })),
        message:
          accepted === deals.length
            ? 'Your investors backed the bridge. The money is in.'
            : waiting > 0
              ? `${accepted} of ${deals.length} said yes. ${waiting} still to answer: check your deal cards.`
              : accepted > 0
                ? `${accepted} of ${deals.length} said yes.`
                : 'Your investors passed on the bridge.',
      };
    }
    case 'company.fireSale': {
      const c = touch(cmd.companyId);
      spendHours(me, FIRE_SALE_HOURS, 'Calling buyers');
      const d = fireSale(world, c, month);
      return { dealId: d.id, status: d.status, summary: d.summary };
    }
    case 'company.found':
      return foundCompany(world, me, cmd.company, month);
    case 'company.start': {
      ensure(
        serialEligible(world, me),
        'company.serial',
        'Serial founders start again after an exit or a closed company. Use Start a company instead.',
      );
      const res = foundCompany(world, me, cmd.company, month);
      return { ...res, ...carrySerialFounder(world, me, world.companies[res.companyId]!) };
    }
    case 'cofounder.invite': {
      const c = touch(cmd.companyId);
      const other = getPlayer(world, cmd.playerId);
      ensure(!other.ai && other.id !== me.id, 'cofounder.player', 'Invite another human player.');
      ensure(
        other.market === c.market,
        'cofounder.market',
        'Co-founders must be in the same market.',
      );
      const deal = openDeal(world, {
        companyId: c.id,
        proposer: { kind: 'company', id: c.id },
        counterparty: { kind: 'player', id: other.id },
        terms: {
          kind: 'cofounder',
          title: cmd.title,
          equityBps: cmd.equityBps,
          vestingMonths: 48,
          cliffMonths: 12,
        },
        by: me.id,
      });
      return { dealId: deal.id };
    }
    case 'pitch.start': {
      const c = touch(cmd.companyId);
      spendHours(me, PITCH_HOURS, 'A pitch');
      const p = startPitch(world, {
        founderId: me.id,
        companyId: c.id,
        fundId: cmd.fundId,
        investorPlayerId: cmd.investorId,
        slides: cmd.slides,
        ask: cmd.ask,
      });
      me.skills.fundraising = Math.min(100, me.skills.fundraising + 1);
      me.skills.publicSpeaking = Math.min(100, me.skills.publicSpeaking + 0.5);
      return { pitchId: p.id, status: p.status, reason: p.reason };
    }
    case 'pitch.answer': {
      const p = answerPitch(world, cmd.pitchId, me.id, cmd.answers, cmd.figures);
      return { pitchId: p.id, status: p.status, reason: p.reason, dealId: p.dealId };
    }
    case 'pitch.partners': {
      spendHours(me, PARTNER_MEETING_HOURS, 'A partner meeting');
      const p = partnerMeeting(world, cmd.pitchId, me.id);
      return { pitchId: p.id, status: p.status, reason: p.reason, dealId: p.dealId };
    }
    // ------------------------------------------------------------ deals
    case 'deal.act': {
      const d = world.deals[cmd.dealId];
      ensure(d, 'deal.missing', 'Deal not found.');
      const sides: PartyRef[] = [d.proposer, d.counterparty];
      const mine =
        cmd.action === 'withdraw'
          ? sides.find((s) => canAct(world, me.id, s))
          : canAct(world, me.id, d.awaiting)
            ? d.awaiting
            : sides.find((s) => canAct(world, me.id, s));
      ensure(mine, 'deal.forbidden', 'You are not a party to this deal.');
      const act: DealAction =
        cmd.action === 'counter'
          ? { action: 'counter', terms: (cmd.terms ?? {}) as Partial<DealTerms> }
          : { action: cmd.action };
      if (d.companyId && world.companies[d.companyId]?.founderIds.includes(me.id))
        world.companies[d.companyId]!.lastDecisionMonth = month;
      const out = actOnDeal(world, cmd.dealId, mine, me.id, act);
      return { dealId: out.id, status: out.status, summary: out.summary };
    }
    // ------------------------------------------------------------ investor
    case 'invest.propose': {
      spendHours(me, 2, 'Writing a term sheet');
      const deal = proposeInvestment(world, {
        investorId: me.id,
        companyId: cmd.companyId,
        terms: {
          instrument: cmd.instrument,
          amount: cmd.amount,
          valuation: cmd.valuation,
          proRata: cmd.proRata,
          boardSeat: cmd.boardSeat,
          vetoOnSale: cmd.vetoOnSale,
          fromFund: cmd.fromFund,
        },
      });
      me.skills.investing = Math.min(100, me.skills.investing + 0.5);
      return { dealId: deal.id, status: deal.status, summary: deal.summary };
    }
    case 'invest.diligence': {
      const c = getCompany(world, cmd.companyId);
      ensure(
        hasVisited(me, c.market),
        'diligence.market',
        'Diligence across markets needs a trip there first.',
      );
      const current = me.diligence[c.id] ?? 0;
      ensure(cmd.depth > current, 'diligence.done', 'Already done.');
      ensure(cmd.depth <= current + 1, 'diligence.order', 'Do the first pass first.');
      // Due diligence costs more across borders (§7).
      spendHours(
        me,
        Math.round(DILIGENCE_HOURS[cmd.depth] * (c.market === me.market ? 1 : 1.5)),
        'Due diligence',
      );
      me.diligence[c.id] = cmd.depth;
      me.skills.investing = Math.min(100, me.skills.investing + 1);
      me.skills.risk = Math.min(100, me.skills.risk + 0.5);
      return {
        message:
          cmd.depth === 1
            ? 'First call done: revenue, customers and burn unlocked.'
            : 'Deep diligence done: retention, concentration, legal and conflicts unlocked.',
      };
    }
    case 'fund.raise': {
      spendHours(me, 15, 'An LP panel');
      const raised = raiseFund(
        world,
        me,
        { sectors: cmd.sectors, stages: cmd.stages, checkSize: cmd.checkSize, why: cmd.why },
        month,
      );
      if (raised.ok && cmd.investorType) raised.fund.investorType = cmd.investorType;
      return raised;
    }
    // ------------------------------------------------------------ media
    case 'media.accept':
      return acceptInvite(world, cmd.inviteId, me.id, cmd.angle).status;
    case 'media.decline':
      return declineInvite(world, cmd.inviteId, me.id).status;
    case 'media.answer':
      spendHours(me, 1, 'An interview');
      return answerInvite(world, cmd.inviteId, me.id, cmd.answers).checks;
    case 'media.publish': {
      const item = publishInvite(world, cmd.inviteId, me.id, cmd.insist);
      me.skills.publicSpeaking = Math.min(100, me.skills.publicSpeaking + 1);
      return { newsId: item.id, alert: item.alert, starDelta: item.starDelta };
    }
    case 'media.pull':
      return pullInvite(world, cmd.inviteId, me.id).status;
    case 'media.pitch': {
      spendHours(me, 2, 'Pitching a story');
      const out = pitchStory(
        world,
        me,
        cmd.outletId,
        cmd.companyId ?? null,
        deriveRng(world.seed, 'storypitch', me.id, month, cmd.outletId),
      );
      return out.accepted ? { accepted: true, inviteId: out.invite.id } : out;
    }
    // ------------------------------------------------------------ personal
    case 'player.lifestyle':
      return setLifestyle(world, me, cmd.tier);
    case 'player.gig':
      return takeGig(world, me, month);
    case 'player.loan': {
      if (cmd.lenderId || cmd.productId) {
        ensure(
          !!cmd.lenderId && !!cmd.productId && !cmd.bankId && !cmd.collateralCompanyId,
          'loan.product',
          'Pick a lender and one of its loans.',
        );
        const r = requestFounderProductLoan(world, me, {
          lenderId: cmd.lenderId!,
          productId: cmd.productId!,
          amount: cmd.amount,
          months: cmd.months,
        });
        return { ...r, summary: world.deals[r.dealId]!.summary };
      }
      const deal = requestPersonalLoan(world, me, {
        amount: cmd.amount,
        months: cmd.months,
        collateralCompanyId: cmd.collateralCompanyId,
        bankId: cmd.bankId,
      });
      return { dealId: deal.id, summary: deal.summary };
    }
    case 'bank.found': {
      const bank = foundBank(world, me, {
        name: cmd.name,
        type: cmd.bankType,
        contribution: cmd.contribution,
      });
      if (me.role !== 'banker') achieve(world, me, 'any.role-switch', 'First role switch', month);
      return { bankId: bank.id };
    }
    case 'bank.policy': {
      const b = ownBank(world, me, cmd.bankId);
      if (cmd.loanSpreadPp !== undefined) b.policy.loanSpreadPp = cmd.loanSpreadPp;
      if (cmd.depositRateBps !== undefined) b.policy.depositRateBps = cmd.depositRateBps;
      if (cmd.accountFee !== undefined) b.policy.accountFee = cmd.accountFee;
      if (cmd.salary !== undefined) {
        ensure(
          cmd.salary <= scale(col(m), 10),
          'bank.salary',
          'A salary that large at a bank draws regulators and tabloids.',
        );
        b.policy.salary = cmd.salary;
      }
      return { message: 'Policy updated.' };
    }
    case 'bank.dividend': {
      const b = ownBank(world, me, cmd.bankId);
      ensure(b.status === 'licensed', 'bank.unlicensed', 'Only licensed banks pay dividends.');
      const f = bankFigures(world, b);
      // Dividends only from capital above the regulatory minimum.
      const room = Math.floor(
        f.equity -
          Math.max(
            f.loans * MIN_CAPITAL_RATIO * 1.5,
            scale(col(m), BANK_TYPES[b.type].minCapitalCol),
          ),
      );
      ensure(
        cmd.amount > 0 && cmd.amount <= room && cmd.amount <= f.cash,
        'bank.dividend',
        'Not enough surplus capital to pay that.',
      );
      const mine = Math.round((cmd.amount * b.ownerShareBps) / 10_000);
      transfer(world, b.account, me.accounts.local, mine, `${b.name} dividend`, month);
      transfer(
        world,
        b.account,
        m.ext.lps,
        cmd.amount - mine,
        `${b.name} dividend to AI shareholders`,
        month,
      );
      const tax = Math.round(mine * m.data.tax.capitalGains);
      transfer(world, me.accounts.local, m.ext.tax, tax, 'Dividend tax', month);
      return {
        message: `Dividend paid. Your share: ${formatMoney(mine - tax, m.data.currency)} after tax.`,
      };
    }
    case 'bank.review': {
      const b = getBank(world, cmd.bankId);
      ensure(b.ownerId !== me.id, 'bank.review', 'You can’t review your own bank.');
      const banked = [
        me.accounts.local,
        me.accounts.usd,
        ...me.companyIds.map((id) => world.companies[id]?.account),
      ].some((a) => a && world.accounts[a]?.bankId === b.id);
      ensure(banked, 'bank.review', 'Only customers can review a bank.');
      b.reviews.sum += cmd.rating;
      b.reviews.count += 1;
      return { message: 'Review posted.' };
    }
    case 'account.move': {
      const accId =
        cmd.account === 'personal'
          ? me.accounts.local
          : cmd.account === 'usd'
            ? me.accounts.usd
            : ownCompany(world, me.id, cmd.account).account;
      ensure(accId, 'account.missing', 'Open that account first.');
      moveAccount(world, accId, cmd.bankId);
      return {
        message: cmd.bankId
          ? `Now banking with ${getBank(world, cmd.bankId).name}.`
          : `Back with ${m.bankName}.`,
      };
    }
    case 'acquire.propose': {
      touch(cmd.buyerCompanyId);
      if (cmd.advisorBankId) {
        const adviser = getBank(world, cmd.advisorBankId);
        ensure(
          adviser.status === 'licensed' && BANK_TYPES[adviser.type].advisory,
          'bank.advisory',
          'Pick a licensed investment bank as adviser.',
        );
        ensure(
          adviser.market === getCompany(world, cmd.buyerCompanyId).market,
          'bank.advisory',
          'Pick an adviser in your market.',
        );
      }
      const deal = proposeAcquisition(world, {
        buyerId: cmd.buyerCompanyId,
        targetId: cmd.targetCompanyId,
        price: cmd.price,
        retention: cmd.retention,
        by: me.id,
        advisorBankId: cmd.advisorBankId,
      });
      return { dealId: deal.id, status: deal.status, summary: deal.summary };
    }
    case 'vote.cast': {
      const v = castVote(world, cmd.voteId, me.id, cmd.ballot);
      return { status: v.status };
    }
    case 'governance.removeCeo': {
      const c = getCompany(world, cmd.companyId);
      ensure(c.status === 'active', 'company.closed', 'The company is no longer operating.');
      ensure(
        boardOf(c).includes(me.id) || c.board.some((h) => world.funds[h]?.managerId === me.id),
        'governance.board',
        'Only board members can call this vote.',
      );
      ensure(
        c.founderIds.includes(cmd.founderId) && cmd.founderId !== me.id,
        'governance.target',
        'Pick a founder other than yourself.',
      );
      ensure(
        !Object.values(world.votes).some(
          (v) => v.companyId === c.id && v.status === 'open' && v.kind === 'remove-ceo',
        ),
        'governance.open',
        'A vote is already open.',
      );
      const target = getPlayer(world, cmd.founderId);
      const v = openVote(world, {
        companyId: c.id,
        kind: 'remove-ceo',
        targetId: target.id,
        proposerId: me.id,
        reason: `Remove ${target.name} as CEO`,
      });
      return { voteId: v.id, status: v.status };
    }
    case 'dispute.file': {
      const d = fileDispute(world, me, cmd.kind, cmd.refId);
      return { disputeId: d.id, message: 'Filed. The arbitrator rules within a month.' };
    }
    case 'listing.create': {
      const c = touch(cmd.companyId);
      return { listingId: createListing(world, c, cmd.title, cmd.price).id };
    }
    case 'listing.update': {
      const l = world.listings[cmd.listingId];
      ensure(l, 'listing.missing', 'Listing not found.');
      touch(l.companyId);
      if (cmd.price !== undefined) {
        ensure(cmd.price > 0, 'listing.price', 'Set a price.');
        l.price = cmd.price;
      }
      if (cmd.active !== undefined) l.active = cmd.active;
      return { message: 'Listing updated.' };
    }
    case 'supply.propose': {
      touch(cmd.buyerCompanyId);
      const deal = proposeSupply(world, {
        buyerId: cmd.buyerCompanyId,
        listingId: cmd.listingId,
        price: cmd.price,
        months: cmd.months,
        by: me.id,
      });
      return { dealId: deal.id, status: deal.status, summary: deal.summary };
    }
    case 'supply.cancel': {
      const k = world.contracts[cmd.contractId];
      ensure(k && k.status === 'active', 'supply.missing', 'Contract not found.');
      const mine = [k.buyerId, k.sellerId].find((cid) =>
        world.companies[cid]?.founderIds.includes(me.id),
      );
      ensure(mine, 'supply.forbidden', 'Not your contract.');
      endContract(world, k, 'cancelled', mine, month);
      return { message: 'Contract cancelled.' };
    }
    case 'supply.review': {
      const k = world.contracts[cmd.contractId];
      ensure(k, 'supply.missing', 'Contract not found.');
      ensure(
        world.companies[k.buyerId]?.founderIds.includes(me.id),
        'supply.forbidden',
        'Only the buyer reviews.',
      );
      reviewSupplier(world, k, cmd.rating);
      return { message: 'Review posted.' };
    }
    case 'player.travel':
      return travel(world, me, cmd.market);
    case 'travel.book':
      return bookFlight(world, me, cmd.to, ctx.now, cmd.hotel, cmd.flight);
    case 'travel.cancel':
      return cancelFlight(world, me);
    case 'travel.fly':
      return fly(world, me, cmd.to, ctx.now);
    case 'city.ride':
      return ride(world, me, cmd.mode, cmd.distance);
    case 'city.walk':
      // Phase 3: unknown until the life-bars release note (clients fall back to a free walk).
      if (!lifeBarsOn(world)) return fail('command.unknown', 'Unknown command.');
      return walk(world, me, cmd.mode, cmd.minutes);
    case 'player.seen':
      // lastActiveAt was set above: that's all this does.
      return null;
    case 'player.relocate':
      return relocate(world, me, cmd.market, cmd.handle);
    case 'player.repay':
      return repayPersonalLoan(world, me, cmd.loanId, cmd.amount, month);
    case 'company.inject': {
      touch(cmd.companyId);
      injectCapital(world, me, cmd.companyId, cmd.amount, month);
      return { message: 'Money moved into the company.' };
    }
    case 'player.usdOpen':
      return { accountId: openUsdAccount(world, me) };
    case 'player.convert':
      return { received: convertPersonal(world, me, cmd.direction, cmd.amount, month) };
    case 'player.becomeInvestor': {
      ensure(me.role === 'founder', 'role.same', 'You are already an investor.');
      const savings = account(world, me.accounts.local).balance;
      ensure(
        savings >= scale(col(m), 12),
        'role.savings',
        'You need at least a year of living costs in savings to start investing.',
      );
      me.role = 'investor';
      me.investor = { ...cmd.investor, lpCredibility: 0.3, founderTrust: 0.7 };
      achieve(world, me, 'any.role-switch', 'First role switch', month);
      startInvestorTutorial(world, me);
      return { message: 'You’re an angel investor now. Founders will start pitching you.' };
    }
    // ------------------------------------------------------------ city events (Wave 2)
    case 'event.host':
      return hostEvent(world, me, {
        kind: cmd.kind,
        title: cmd.title,
        venue: cmd.venue,
        month: cmd.month,
        budget: cmd.budget,
        ticket: cmd.ticket,
        segmentKey: cmd.segmentKey,
        businessId: cmd.businessId,
      });
    case 'event.rsvp':
      return rsvpEvent(world, me, cmd.eventId, cmd.going);
    case 'event.cancel':
      return cancelEvent(world, me, cmd.eventId);
    case 'event.choose':
      return chooseDecision(world, me, cmd.eventId, cmd.choiceId);
    // ---- Founder Journey 5: exits and the capital allocator
    case 'exit.secondary':
      return proposeSecondary(world, me, cmd.companyId, cmd.pctBps, cmd.buyerKind, cmd.buyerId);
    case 'exit.secondary.accept':
      return acceptSecondary(world, me, cmd.offerId);
    case 'exit.secondary.decline':
      return declineSecondary(world, me, cmd.offerId);
    case 'ipo.prepare':
      return prepareIpo(world, me, touch(cmd.companyId));
    case 'ipo.list':
      return listCompany(world, me, touch(cmd.companyId), cmd.pricePerShareHint);
    case 'shares.sell':
      return sellShares(world, me, cmd.companyId, cmd.pctBps, ctx.now);
    case 'shares.buy':
      return buyShares(world, me, cmd.companyId, cmd.amount, ctx.now);
    case 'shares.order':
      return placeOrder(world, me, cmd);
    case 'shares.cancel':
      return cancelOrder(world, me, cmd.orderId);
    case 'syndicate.open':
      return openSyndicate(world, me, cmd);
    case 'syndicate.back':
      return backSyndicate(world, me, cmd.syndicateId, cmd.amount);
    case 'syndicate.close':
      return closeSyndicate(world, me, cmd.syndicateId);
    case 'syndicate.cancel':
      return cancelSyndicate(world, me, cmd.syndicateId);
    case 'index.buy':
      return buyIndex(world, me, cmd.market, cmd.amount);
    case 'index.sell':
      return sellIndex(world, me, cmd.market, cmd.pctBps);
    case 'mentor.offer':
      return offerMentoring(world, me, cmd.companyId, cmd.grantBps);
    case 'mentor.answer':
      return answerMentoring(world, me, cmd.mentorshipId, cmd.accept);
    case 'mentor.end':
      return endMentoring(world, me, cmd.mentorshipId);
    case 'give.pledge':
      return pledge(world, me, cmd.cause, cmd.amount);
    case 'career.join':
      return joinCareer(world, me, cmd.orgKind, cmd.orgId);
    case 'career.leave':
      return leaveCareer(me);
    case 'career.decide':
      return decideCareer(world, me, cmd.choiceId);
    case 'sales.prospect':
      return prospect(world, me, cmd.companyId);
    case 'sales.advance':
      return advanceDeal(world, me, cmd);
    case 'sales.drop':
      return dropDeal(world, me, cmd.dealId, cmd.companyId);
    case 'company.expense':
      return payExpense(world, me, cmd.companyId, cmd.item);
    case 'business.pitch':
      return pitchBusiness(world, me, cmd.companyId, cmd.businessId);
    case 'gig.take':
      return takeBusinessGig(world, me, cmd.businessId, cmd.gigId);
    case 'venue.buy':
      return venueBuy(world, me, cmd.businessId, cmd.itemId, cmd.withId, cmd.to, ctx.now);
    // ------------------------------------------------------------ life and work (Wave 5)
    case 'job.take':
      return takeJob(world, me, cmd.businessId, cmd.role);
    case 'job.quit':
      return quitJob(world, me);
    case 'home.order':
      return orderFurniture(world, me, cmd.itemId, ctx.now, cmd.businessId);
    case 'home.buy':
      return buyFurniture(world, me, cmd.itemId, cmd.businessId);
    case 'car.buy':
      return buyCar(world, me, cmd.modelId, cmd.businessId, cmd.keepCurrent);
    // ------------------------------------------------------------ Who's here (Wave 6)
    case 'contact.save':
      return saveContact(world, me, cmd.personId, cmd.name);
    case 'contact.remove':
      return removeContact(me, cmd.contactId);
    case 'car.select': {
      const car = me.garage?.find((c) => c.modelId === cmd.modelId);
      ensure(car, 'car.owned', 'That car is not in your garage.');
      me.car = { ...car };
      return { ok: true };
    }
    case 'car.sell':
      return sellCar(world, me);
    // ------------------------------------------------------------ life at home (Wave 7)
    case 'home.act':
      return homeAct(world, me, cmd.act);
    case 'home.invite':
      return homeInvite(world, me, cmd.personId);
    case 'food.order': {
      const before = me.needs?.hunger ?? 70;
      const result = foodOrder(world, me, cmd.businessId, cmd.itemId);
      if (before !== undefined && me.needs) me.needs.hunger = before;
      const id = queueDelivery(world, me, cmd.itemId, 'food', ctx.now);
      return {
        ...result,
        effects: { hunger: 0 },
        needs: me.needs ? { ...me.needs } : undefined,
        id,
        etaMinutes: 0.5,
        message: 'Paid. Your food arrives at home in 30 seconds. Collect it at the door.',
      };
    }
    // ------------------------------------------------------------ friends (Wave 8)
    case 'money.send':
      return sendMoney(world, me, cmd.toPlayerId, cmd.amount, cmd.note, ctx.now);
    case 'visit.invite':
      return inviteVisit(world, me, cmd.toPlayerId);
    case 'visit.accept':
      return acceptVisit(world, me, cmd.inviteId);
    case 'visit.decline':
      return declineVisit(world, me, cmd.inviteId);
    case 'hangout.plan':
      return planHangout(world, me, cmd.businessId, cmd.inviteeIds, cmd.when);
    case 'hangout.join': {
      const joined = joinHangout(world, me, cmd.hangoutId);
      // Holiday with friends: an outing on the holiday carries the shared bonus.
      const holiday = holidayJoined(world, me, cmd.hangoutId);
      return holiday ? { ...joined, holiday } : joined;
    }
    case 'holiday.invite':
      return inviteHoliday(world, me, cmd.inviteeIds, cmd.hostPays, ctx.now);
    case 'holiday.accept':
      return acceptHoliday(world, me, cmd.holidayId, cmd.payOwn, ctx.now);
    case 'holiday.decline':
      return declineHoliday(world, me, cmd.holidayId);
    case 'holiday.together': {
      const r = doTogether(world, me, cmd.holidayId, cmd.businessId);
      if (r.plan) return r.plan;
      const joined = joinHangout(world, me, r.join);
      const holiday = holidayJoined(world, me, r.join);
      return {
        ...joined,
        ...(holiday ? { holiday } : {}),
        message: holiday?.message ?? joined.message,
      };
    }
    case 'hotel.knock':
      return knockHotel(world, me, cmd.holidayId, cmd.playerId, ctx.now);
    case 'hotel.answer':
      return answerKnock(world, me, cmd.holidayId, cmd.from, cmd.accept, ctx.now);
    case 'hotel.leave':
      return leaveVisit(world, me, cmd.holidayId);
    case 'hangout.leave':
      return leaveHangout(world, me, cmd.hangoutId);
    case 'techevent.attend':
      return attendTechEvent(world, me, cmd.eventId);
    // ------------------------------------------------------------ golf and the mall
    case 'golf.round':
      return golfRound(world, me, cmd.strokes);
    case 'mall.buy':
      return mallBuy(world, me, cmd.itemId, cmd.colour, ctx.now);
    // ------------------------------------------------------------ capital programmes (Wave 5)
    case 'accelerator.apply':
      return applyAccelerator(world, me, cmd.acceleratorId, cmd.companyId);
    case 'grant.apply':
      return applyGrant(world, me, cmd.partnerId, cmd.programId, cmd.companyId);
    case 'lp.pitch':
      return pitchLp(world, me, cmd.lpId, cmd.fundId);
    case 'fund.plan':
      return setPlan(world, me, cmd.fundId, {
        companies: cmd.companies,
        avgCheque: cmd.avgCheque,
        reserveRatio: cmd.reserveRatio,
      });
    case 'fund.reserve':
      return setReserve(world, me, cmd.fundId, cmd.companyId, cmd.amount);
    case 'fund.ic':
      return requestIc(world, me, cmd.fundId, cmd.companyId, cmd.amount);
    case 'fund.letter':
      return writeLetter(world, me, cmd.fundId, cmd.honest);
    case 'fund.extend':
      return requestExtension(world, me, cmd.fundId);
    case 'prorata.answer':
      return answerProRata(world, me, cmd.offerId, cmd.take);
    case 'fund.launch':
      return launchFund(world, me, cmd);
    case 'fund.close':
      return closeFund(world, me, cmd.fundId);
    case 'fund.abandon':
      return abandonFund(world, me, cmd.fundId);
    case 'lp.commit':
      return commitToFund(world, me, cmd.fundId, cmd.amount);
    case 'lp.diligence':
      return lpDiligence(world, me, cmd.fundId);
    case 'lp.pay':
      return payCall(world, me, cmd.callId);
    case 'lp.delay':
      return delayCall(world, me, cmd.callId);
    case 'lp.autopay':
      return setAutopay(world, me, cmd.fundId, cmd.on);
    case 'career.invitation':
      return answerInvitation(world, me, cmd.invitationId, cmd.accept);
    case 'investor.tutorial':
      return tutorialCommand(world, me, cmd.action, cmd.companyId);
    case 'invest.quick':
      return quickInvest(world, me, cmd.companyId, cmd.amount);
    case 'pitch.angel':
      return pitchAngel(world, me, {
        angelId: cmd.angelId,
        companyId: cmd.companyId,
        businessId: cmd.businessId,
        treat: cmd.treat,
      });
    case 'event.broadcast':
      return broadcastEvent(world, me, cmd.eventId, cmd.spend);
    // ------------------------------------------------------------ a living economy (Wave 10)
    case 'property.buy':
      return buyProperty(world, me, cmd.propertyId, cmd.mortgage ?? null);
    case 'property.sell':
      return sellProperty(world, me, cmd.propertyId);
    case 'property.rent':
      return letProperty(world, me, cmd.propertyId, true);
    case 'property.unrent':
      return letProperty(world, me, cmd.propertyId, false);
    case 'property.moveIn':
      return moveIn(world, me, cmd.propertyId);
    case 'property.gift':
      return giftProperty(world, me, cmd.propertyId, cmd.toPlayerId);
    case 'property.gift.accept':
      return acceptGift(world, me, cmd.giftId);
    case 'property.gift.decline':
      return declineGift(world, me, cmd.giftId);
    case 'company.branch.open':
      return openBranch(world, me, cmd.companyId, cmd.market, cmd.district);
    case 'company.branch.close':
      return closeBranch(world, me, cmd.branchId);
    case 'competition.enter':
      return enterCompetition(world, me, cmd.competitionId, cmd.companyId);
    case 'competition.judge.join':
      return joinJudges(world, me, cmd.competitionId);
    case 'competition.score':
      return scoreEntry(world, me, cmd.competitionId, cmd.entryId, cmd.score);
    case 'journey.pin':
      ensure(hasJourney(me), 'journey.none', 'The journey is for founders.');
      return pinObjective(me, cmd.kind, cmd.id);
    case 'journey.dismiss':
      ensure(hasJourney(me), 'journey.none', 'The journey is for founders.');
      return dismissObjective(me, cmd.kind, cmd.id, cmd.undo);
    case 'journey.bootstrap':
      ensure(hasJourney(me), 'journey.none', 'The journey is for founders.');
      return chooseBootstrap(me, cmd.on, month);
    case 'roadmap.add':
      return addFeature(world, touch(cmd.companyId), cmd.featureId, month);
    case 'roadmap.prioritise':
      return prioritise(touch(cmd.companyId), cmd.projectId, cmd.dir);
    case 'roadmap.remove':
      return removeProject(touch(cmd.companyId), cmd.projectId);
    case 'roadmap.release':
      return releaseProject(world, touch(cmd.companyId), cmd.projectId, month);
    case 'roadmap.contract':
      return contractProject(world, touch(cmd.companyId), cmd.projectId, month);
    case 'roadmap.dismiss':
      return dismissFeedback(touch(cmd.companyId), cmd.feedbackId);
    case 'hire.open':
      return openRole(
        world,
        touch(cmd.companyId),
        { role: cmd.role, seniority: cmd.seniority, salaryBand: cmd.salaryBand },
        month,
      );
    case 'hire.source':
      return sourceCandidates(world, touch(cmd.companyId), me, cmd.roleId, month);
    case 'hire.interview':
      return interview(world, touch(cmd.companyId), me, cmd.candidateId, cmd.style, month);
    case 'hire.close':
      return closeRole(touch(cmd.companyId), cmd.roleId);
    case 'cofounder.ai':
      return hireAiCofounder(world, touch(cmd.companyId), me, cmd.candidateId, month);
    case 'company.contribute':
      return contribute(world, me, touch(cmd.companyId), cmd.amount, cmd.as, month);
    case 'company.repayFounder':
      return repayFounder(world, me, touch(cmd.companyId), cmd.amount, month);
    case 'company.reserve':
      return moveReserve(world, touch(cmd.companyId), cmd.amount, cmd.dir, month);
    case 'ff.open':
      return openFriendsRound(world, me, touch(cmd.companyId), cmd, month);
    case 'ff.commit': {
      // Open to every role: friends back friends. Months follow the company's city.
      const r = getRound(world, cmd.roundId);
      return commitToRound(world, me, r, cmd.amount, getMarket(world, r.market).month);
    }
    case 'ff.askAi': {
      const r = getRound(world, cmd.roundId);
      touch(r.companyId);
      return askAiFriends(world, me, r, getMarket(world, r.market).month);
    }
    case 'ff.close': {
      const r = getRound(world, cmd.roundId);
      touch(r.companyId);
      return closeFriendsRound(world, me, r, getMarket(world, r.market).month);
    }
    case 'ff.cancel': {
      const r = getRound(world, cmd.roundId);
      touch(r.companyId);
      return cancelFriendsRound(world, r, getMarket(world, r.market).month);
    }
    case 'inbox.read': {
      for (const item of world.inbox[me.id] ?? [])
        if (!cmd.ids || cmd.ids.includes(item.id)) item.read = true;
      return null;
    }
    default:
      return fail('command.unknown', 'Unknown command.');
  }
}

/** Phase 3: work that adds a little stress (capped per month, lifebars.ts). */
const WORK_COMMANDS: ReadonlySet<Command['type']> = new Set([
  'company.build',
  'player.gig',
  'gig.take',
  'sales.advance',
  'pitch.start',
  'business.pitch',
  'pitch.angel',
  'lp.pitch',
]);

/**
 * Phase 3 life bars: a command's immediate effect on the actor's health and
 * stress (and a ride's time and energy), applied after the command itself
 * succeeded. Results that are objects gain `barChanges` (what moved) and
 * `bars` (all four now). Only called when `lifeBarsOn`.
 */
function lifeBarsAfter(world: World, cmd: Command, actorId: Id, result: unknown): unknown {
  const me = world.players[actorId];
  if (!me || me.ai) return result;
  if (WORK_COMMANDS.has(cmd.type)) {
    const stress = workStress(world, me);
    return result && typeof result === 'object'
      ? { ...result, barChanges: stress ? { stress } : {}, bars: barsOf(me) }
      : result;
  }
  if (!result || typeof result !== 'object') return result;
  const out = result as Record<string, unknown>;
  const changed = (fx: { health?: number; stress?: number }) => ({
    ...out,
    barChanges: applyBars(me, fx),
    bars: barsOf(me),
  });
  const social = { stress: LIFE_BARS.socialStress };
  switch (cmd.type) {
    case 'city.ride':
      return { ...out, ...rideBars(me, cmd.mode, cmd.distance) };
    case 'home.act':
      return changed(HOME_ACT_BARS[cmd.act] ?? {});
    case 'home.invite':
    case 'hangout.plan':
    case 'hangout.join':
    case 'holiday.together':
      return changed(social);
    case 'visit.accept': {
      const host = world.players[(out.host as { id: Id } | undefined)?.id ?? ''];
      if (host && !host.ai) applyBars(host, social);
      return changed(social);
    }
    case 'venue.buy': {
      const spec = specOf(getBusiness(world, cmd.businessId));
      const it = spec.venue?.items.find((x) => x.id === cmd.itemId);
      return it ? changed(venueBars(spec, it)) : out;
    }
    case 'food.order':
      return changed(foodBars(cmd.itemId));
    case 'golf.round':
    case 'mall.buy': {
      const { barsFx, ...rest } = out as { barsFx?: { stress?: number } };
      return barsFx ? { ...changed(barsFx), barsFx: undefined, ...rest } : out;
    }
    default:
      return result;
  }
}

function createFromOnboarding(
  world: World,
  cmd: Extract<Command, { type: 'player.create' }>,
  actorId: Id,
  now: number,
) {
  ensure(PLAYABLE_ROLES.includes(cmd.role), 'onboarding.role', 'Pick founder, investor or banker.');
  ensure(world.markets[cmd.market], 'onboarding.market', 'That market isn’t open yet.');
  if (cmd.role === 'founder')
    ensure(cmd.company, 'onboarding.company', 'Founders set up a company.');
  if (cmd.role === 'investor')
    ensure(cmd.investor, 'onboarding.investor', 'Investors set a focus.');
  if (cmd.role === 'banker')
    ensure(cmd.bank, 'onboarding.bank', 'Bankers pick a bank type and name.');
  const p = createPlayer(world, {
    playerId: actorId,
    handle: cmd.handle,
    name: cmd.name,
    role: cmd.role,
    backgroundId: cmd.backgroundId,
    market: cmd.market,
    now,
    ...(cmd.gender ? { gender: cmd.gender } : {}),
  });
  let companyId: Id | null = null;
  if (cmd.role === 'founder' && cmd.company) {
    companyId = createCompany(world, { founderId: p.id, ...cmd.company }).id;
  }
  if (cmd.role === 'investor' && cmd.investor) {
    const bg = backgroundById(cmd.backgroundId);
    p.investor = {
      ...cmd.investor,
      lpCredibility: bg?.lpCredibility ?? 0.3,
      founderTrust: bg?.founderTrust ?? 0.5,
    };
  }
  if (cmd.role === 'banker' && cmd.bank) {
    // First day (§3): an AI shareholder meeting raises starting capital and the licence application is filed.
    // Wave 6: savings doubled (12 months of runway), so the same capital is 40% of them;
    // the rest is there to live on.
    const contribution = Math.floor(account(world, p.accounts.local).balance * 0.4);
    foundBank(world, p, { name: cmd.bank.name, type: cmd.bank.bankType, contribution });
  }
  welcomeNewPlayer(world, p, companyId);
  if (p.role === 'investor') startInvestorTutorial(world, p);
  return { playerId: p.id, companyId };
}

/**
 * Account deletion (§18): personal data leaves the game, but the world's
 * history (cap tables, deals) must stay consistent, so the player becomes an
 * anonymous, inactive record and their handle is released.
 */
function anonymize(world: World, playerId: Id) {
  const p = getPlayer(world, playerId);
  const names = world.names[p.market]!;
  for (const [k, v] of Object.entries(names)) if (v === p.id && k.startsWith('@')) delete names[k];
  p.name = 'Former player';
  p.handle = `former_${p.id.slice(-6)}`;
  p.trust = {};
  p.contacts = [];
  // A look picked to resemble them goes too (they're drawn from their seed again).
  delete p.appearance;
  delete p.appearanceAt;
  // Other players' contact cards stop naming them.
  for (const other of Object.values(world.players))
    for (const c of other.contacts ?? [])
      if (c.kind === 'player' && c.refId === p.id) c.name = p.name;
  delete world.inbox[p.id];
  for (const inv of Object.values(world.media))
    if (inv.playerId === p.id && inv.status !== 'published') inv.status = 'pulled';
  return { anonymized: true };
}

function applyMarketData(world: World, cmd: Extract<Command, { type: 'market.data' }>) {
  const m = getMarket(world, cmd.market);
  const alerts: string[] = [];
  // A dollar market's currency is the reference: it is always 1 per USD.
  if (cmd.unitsPerUsd !== undefined && m.data.currency !== 'USD') {
    const change = cmd.unitsPerUsd / m.data.unitsPerUsd - 1;
    m.data.unitsPerUsd = cmd.unitsPerUsd;
    if (Math.abs(change) >= 0.02) {
      alerts.push(
        `${m.data.currency} ${change > 0 ? 'weakens' : 'strengthens'} ${Math.abs(Math.round(change * 100))}% against the dollar.`,
      );
    }
  }
  if (cmd.baseRateBps !== undefined && cmd.baseRateBps !== m.data.baseRateBps) {
    const up = cmd.baseRateBps > m.data.baseRateBps;
    m.data.baseRateBps = cmd.baseRateBps;
    alerts.push(
      `Central bank ${up ? 'raises' : 'cuts'} rate to ${(cmd.baseRateBps / 100).toFixed(2)}%.`,
    );
  }
  if (cmd.multiples) {
    for (const [k, v] of Object.entries(cmd.multiples))
      if (v) m.multiples[k as keyof typeof m.multiples] = v;
    // Funding climate: live multiples relative to the reference snapshot.
    const ratios = Object.entries(m.multiples).map(
      ([k, v]) => v / PUBLIC_MULTIPLES[k as keyof typeof PUBLIC_MULTIPLES],
    );
    const prev = m.climate;
    m.climate = clamp(ratios.reduce((a, b) => a + b, 0) / ratios.length, 0.5, 1.6);
    if (Math.abs(m.climate - prev) >= 0.1)
      alerts.push(
        m.climate > prev
          ? 'Public tech stocks rally; funding warms up.'
          : 'Public tech stocks slide; expect tougher rounds.',
      );
  }
  for (const alert of alerts) {
    publish(world, {
      market: m.id,
      month: m.month,
      outletId: 'market',
      outletName: 'Markets desk',
      kind: 'market',
      alert,
      headline: alert,
      body: alert,
      starDelta: 0,
      verified: true,
      subject: { kind: 'market', id: m.id },
    });
    for (const p of Object.values(world.players))
      if (!p.ai && p.market === m.id)
        notify(world, p.id, { month: m.month, kind: 'system', text: alert });
  }
  return { alerts };
}

/** Send a one-off message to every human player's inbox, once per announcement id. */
function announce(world: World, cmd: Extract<Command, { type: 'system.announce' }>) {
  const sent = (world.announcements ??= []);
  if (sent.includes(cmd.id)) return { sent: 0 };
  const hadExits = exitsOn(world);
  sent.push(cmd.id);
  // Founder Journey 5: the stock market opens with each city's leading AI companies.
  // (The note that first switches exits on: the exits note, or a later one in a world without it.)
  if (!hadExits && exitsOn(world))
    for (const id of Object.keys(world.markets)) seedPublicMarket(world, id);
  // The investor career: every city's exchange opens with its AI listings and an index.
  for (const id of Object.keys(world.markets)) ensureExchange(world, id);
  let n = 0;
  for (const p of Object.values(world.players)) {
    if (p.ai) continue;
    notify(world, p.id, {
      month: world.markets[p.market]?.month ?? 0,
      kind: 'system',
      text: cmd.text,
    });
    n++;
  }
  return { sent: n };
}

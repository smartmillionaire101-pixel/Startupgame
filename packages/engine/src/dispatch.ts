/**
 * The command dispatcher: (world, command, actor, now) → new world + result.
 *
 * Runs each command inside an Immer producer, so a rule violation anywhere
 * (GameRuleError) rolls the whole command back: no half-applied deals.
 */
import { produce } from 'immer';
import { PLAYABLE_ROLES, backgroundById } from './data/characters.js';
import { PUBLIC_MULTIPLES } from './data/markets.js';
import { rulesFor } from './data/rules.js';
import type { Command } from './commands.js';
import { SYSTEM_COMMANDS } from './commands.js';
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
import { account, transfer } from './ledger.js';
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
import { companyRunway } from './company.js';
import { createCompany, createPlayer, openMarket, setCogs, welcomeNewPlayer } from './world.js';
import type { DealTerms, Id, PartyRef, World } from './types.js';

export interface CommandContext {
  /** The authenticated player, or null for system commands issued by the server. */
  actorId: Id | null;
  /** Wall-clock time (ms). Part of the command log so replays are exact. */
  now: number;
}

export type DispatchResult =
  | { ok: true; world: World; result: unknown }
  | { ok: false; world: World; error: { code: string; message: string } };

export function dispatch(world: World, command: Command, ctx: CommandContext): DispatchResult {
  if (SYSTEM_COMMANDS.has(command.type) !== (ctx.actorId === null)) {
    return { ok: false, world, error: { code: 'command.forbidden', message: 'Not allowed.' } };
  }
  let result: unknown = null;
  try {
    const next = produce(world, (draft) => {
      result = apply(draft as World, command, ctx);
      draft.version += 1;
    });
    return { ok: true, world: next, result };
  } catch (e) {
    if (e instanceof GameRuleError)
      return { ok: false, world, error: { code: e.code, message: e.message } };
    throw e;
  }
}

function apply(world: World, cmd: Command, ctx: CommandContext): unknown {
  if (cmd.type === 'market.open') {
    const m = openMarket(world, cmd.market, ctx.now);
    return {
      market: m.id,
      funds: Object.values(world.funds).filter((f) => f.market === m.id).length,
    };
  }
  if (cmd.type === 'market.settle') {
    const m = getMarket(world, cmd.market);
    ensure(
      m.lastSettledDate === null || cmd.date > m.lastSettledDate,
      'settle.date',
      'Already settled for that date.',
    );
    settleMarket(world, cmd.market, ctx.now, cmd.date);
    return { month: m.month };
  }
  if (cmd.type === 'market.data') return applyMarketData(world, cmd);
  if (cmd.type === 'player.anonymize') return anonymize(world, cmd.playerId);

  const actorId = ctx.actorId!;
  if (cmd.type === 'player.create') return createFromOnboarding(world, cmd, actorId, ctx.now);

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

  switch (cmd.type) {
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
      spendHours(me, cmd.hours, 'Building');
      c.buildHours += cmd.hours;
      me.skills.product = Math.min(100, me.skills.product + cmd.hours / 40);
      return { message: `${cmd.hours}h of building logged. It shows at month end.` };
    }
    case 'company.offer': {
      const c = touch(cmd.companyId);
      const cand = m.talent.find((t) => t.id === cmd.candidateId);
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
        return { ...res, staffId: s.id };
      }
      cand.rejectedBy.push(c.id);
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
    case 'company.found': {
      const active = me.companyIds.filter((id) => world.companies[id]?.status === 'active').length;
      ensure(
        active < 2,
        'company.limit',
        'Two ventures at once is the limit; your hours are already split.',
      );
      const c = createCompany(world, { founderId: me.id, ...cmd.company });
      if (me.failures > 0)
        achieve(world, me, 'any.comeback', 'First comeback after failure', month);
      if (me.role === 'investor') achieve(world, me, 'any.role-switch', 'First role switch', month);
      welcomeNewPlayer(world, me, c.id);
      return { companyId: c.id };
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
      const p = answerPitch(world, cmd.pitchId, me.id, cmd.answers);
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
        c.market === me.market,
        'diligence.market',
        'Diligence across markets needs travel first.',
      );
      const current = me.diligence[c.id] ?? 0;
      ensure(cmd.depth > current, 'diligence.done', 'Already done.');
      ensure(cmd.depth <= current + 1, 'diligence.order', 'Do the first pass first.');
      spendHours(me, DILIGENCE_HOURS[cmd.depth], 'Due diligence');
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
      return raiseFund(
        world,
        me,
        { sectors: cmd.sectors, stages: cmd.stages, checkSize: cmd.checkSize, why: cmd.why },
        month,
      );
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
      return { message: 'You’re an angel investor now. Founders will start pitching you.' };
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

function createFromOnboarding(
  world: World,
  cmd: Extract<Command, { type: 'player.create' }>,
  actorId: Id,
  now: number,
) {
  ensure(
    PLAYABLE_ROLES.includes(cmd.role),
    'onboarding.role',
    'Player banks open in phase 2. Choose founder or investor for now.',
  );
  ensure(world.markets[cmd.market], 'onboarding.market', 'That market isn’t open yet.');
  if (cmd.role === 'founder')
    ensure(cmd.company, 'onboarding.company', 'Founders set up a company.');
  if (cmd.role === 'investor')
    ensure(cmd.investor, 'onboarding.investor', 'Investors set a focus.');
  const p = createPlayer(world, {
    playerId: actorId,
    handle: cmd.handle,
    name: cmd.name,
    role: cmd.role,
    backgroundId: cmd.backgroundId,
    market: cmd.market,
    now,
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
  welcomeNewPlayer(world, p, companyId);
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
  delete world.inbox[p.id];
  for (const inv of Object.values(world.media))
    if (inv.playerId === p.id && inv.status !== 'published') inv.status = 'pulled';
  return { anonymized: true };
}

function applyMarketData(world: World, cmd: Extract<Command, { type: 'market.data' }>) {
  const m = getMarket(world, cmd.market);
  const alerts: string[] = [];
  if (cmd.unitsPerUsd !== undefined) {
    const change = cmd.unitsPerUsd / m.data.unitsPerUsd - 1;
    m.data.unitsPerUsd = cmd.unitsPerUsd;
    if (Math.abs(change) >= 0.02 && m.data.currency !== 'USD') {
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

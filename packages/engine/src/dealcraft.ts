/**
 * Deal craft and reputation (investor blueprint §6.2–6.6, §10.3, §10.6,
 * Phase 8):
 *
 *  - The pipeline: sourced → screened → first call → deep diligence → term
 *    sheet → negotiation → closed / passed, with a watchlist. Stages move on
 *    their own with diligence and deals; passing gives the founder a reason.
 *  - Ghosting: a pitch left unanswered past the month it arrived costs
 *    founder trust; answering in time costs nothing.
 *  - Deal flow follows reputation: each month founders pitch investors with
 *    more founder trust and stars more often (own RNG stream 'pipeline').
 *    Outbound scouting finds companies not yet raising.
 *  - Claim checks against game data, reference calls (cheaper with a warm
 *    contact) and red flags that deep diligence finds in company state.
 *  - Founder support: intros to customers, hires or investors.
 *  - Founder-friendliness: tough terms win ownership and cost founder trust.
 *  - Hot rounds: a strong AI company raising takes offers for the month and
 *    picks one on price, terms, reputation and trust; others hear why not.
 *  - Reviews: founders rate an investor after a round, checked against the
 *    deal history, one per founder, investor and company.
 *  - The monthly investor recap (§10.6).
 *
 * Investor-career worlds only.
 */
import { companyRunway } from './company.js';
import { contactWarmth } from './events.js';
import { INVESTOR } from './data/investor.js';
import { executeDeal } from './deals.js';
import { ensure } from './errors.js';
import {
  achieve,
  getCompany,
  getMarket,
  lastPnl,
  locationOf,
  notify,
  spendHours,
} from './helpers.js';
import { clamp, roundTo } from './math.js';
import { investorOn } from './releases.js';
import { deriveRng } from './rng.js';
import { applyStarEvent } from './stars.js';
import { valueCompany } from './valuation.js';
import { nextStage } from './helpers.js';
import type {
  Company,
  DealCard,
  Id,
  InvestmentTerms,
  PassReason,
  PipelineEntry,
  PipelineStage,
  Player,
  World,
} from './types.js';
import { PIPELINE_STAGES } from './types.js';

const homeMonth = (world: World, p: Player) => getMarket(world, p.market).month;
const book = (p: Player) => (p.pipeline ??= {});

/** Founder trust moves (−1..1 stored as 0..1 on the profile). */
export function nudgeFounderTrust(p: Player | undefined, delta: number) {
  if (!p?.investor) return;
  p.investor.founderTrust = roundTo(clamp(p.investor.founderTrust + delta, 0, 1), 3);
}

// ---------------------------------------------------------------- the pipeline

/** Where a company really is in your pipeline: stored, moved on by diligence and deals. */
export function stageOf(world: World, p: Player, companyId: Id): PipelineStage {
  const e = p.pipeline?.[companyId];
  if (e?.stage === 'passed') return 'passed';
  const holders = [
    p.id,
    ...Object.values(world.funds)
      .filter((f) => f.managerId === p.id)
      .map((f) => f.id),
  ];
  if (holders.some((h) => world.positions[`${h}:${companyId}`])) return 'closed';
  const deal = Object.values(world.deals).find(
    (d) =>
      d.companyId === companyId &&
      d.status === 'open' &&
      d.terms.kind === 'investment' &&
      ((d.proposer.kind === 'player' && d.proposer.id === p.id) ||
        (d.proposer.kind === 'fund' && world.funds[d.proposer.id]?.managerId === p.id)),
  );
  if (deal) return deal.history.some((h) => h.action === 'counter') ? 'negotiation' : 'term-sheet';
  const depth = p.diligence[companyId] ?? 0;
  if (depth >= 2) return 'deep';
  if (depth >= 1) return 'first-call';
  return e?.stage ?? 'sourced';
}

function add(world: World, p: Player, companyId: Id, source: PipelineEntry['source']) {
  const e = book(p)[companyId];
  if (e) return e;
  const entry: PipelineEntry = { companyId, stage: 'sourced', month: homeMonth(world, p), source };
  book(p)[companyId] = entry;
  return entry;
}

/** `pipeline.add`: shortlist a company (optionally to watch). */
export function pipelineAdd(world: World, me: Player, companyId: Id, watch: boolean) {
  ensure(investorOn(world), 'pipeline.off', 'Not available yet.');
  const c = getCompany(world, companyId);
  ensure(!c.founderIds.includes(me.id), 'pipeline.own', 'It’s your own company.');
  const e = add(world, me, c.id, 'manual');
  if (e.stage === 'sourced') e.stage = 'screened';
  if (watch) {
    e.watch = true;
    e.seenRaise = c.lastRaiseMonth ?? -1;
  }
  return { stage: stageOf(world, me, c.id) };
}

/** `pipeline.watch`: follow a company; you hear when it raises again. */
export function pipelineWatch(world: World, me: Player, companyId: Id, on: boolean) {
  const c = getCompany(world, companyId);
  const e = add(world, me, c.id, 'manual');
  e.watch = on;
  e.seenRaise = c.lastRaiseMonth ?? -1;
  return { watch: on };
}

const PASS_NOTE: Record<PassReason, string> = {
  team: 'the team isn’t complete enough for us yet',
  market: 'we’re not convinced the market is big enough',
  traction: 'we’d like to see more traction first',
  price: 'the price is ahead of where we are',
  fit: 'it’s outside what we invest in',
  timing: 'the timing isn’t right for us',
};

/**
 * `pipeline.pass`: pass with a reason. A pitch to you is answered (no
 * ghosting); the founder gets a short, constructive note.
 */
export function pipelinePass(world: World, me: Player, companyId: Id, reason: PassReason) {
  ensure(investorOn(world), 'pipeline.off', 'Not available yet.');
  const c = getCompany(world, companyId);
  const e = add(world, me, c.id, 'manual');
  e.stage = 'passed';
  e.passReason = reason;
  const m = getMarket(world, c.market);
  for (const pitch of Object.values(world.pitches))
    if (pitch.companyId === c.id && pitch.investorPlayerId === me.id && pitch.status === 'sent') {
      pitch.status = 'passed';
      pitch.passReason = reason;
      pitch.reason = `${me.name}: “Thank you. We’re passing for now: ${PASS_NOTE[reason]}.”`;
    }
  for (const fid of c.founderIds) {
    const f = world.players[fid];
    if (!f || f.ai) continue;
    notify(world, fid, {
      month: m.month,
      kind: 'pitch',
      text: `${me.name} passed on ${c.name}: “${PASS_NOTE[reason].replace(/^./, (x) => x.toUpperCase())}. Keep us posted.”`,
      ref: { kind: 'company', id: c.id },
    });
  }
  nudgeFounderTrust(me, INVESTOR.reputation.passWithReason);
  return { stage: 'passed' as const };
}

// ---------------------------------------------------------------- diligence: claims, references, red flags

/** The claims a company made in its latest pitch with answers: what it said, and the truth. */
export function claimsOf(world: World, c: Company) {
  const pitch = Object.values(world.pitches)
    .filter(
      (p) =>
        p.companyId === c.id &&
        Object.keys(p.answers).length + Object.keys(p.figures ?? {}).length > 0,
    )
    .sort((a, b) => b.month - a.month || (a.id < b.id ? 1 : -1))[0];
  if (!pitch) return [];
  return pitch.questions
    .map((q) => {
      const typed = pitch.figures?.[q.id];
      const chosen = q.options.find((o) => o.id === pitch.answers[q.id]);
      const truth = q.options.find((o) => o.truth !== undefined)?.truth;
      const claimed = typed ?? chosen?.claim;
      if (claimed === undefined || truth === undefined) return null;
      return { questionId: q.id, text: q.text, claimed, truth };
    })
    .filter((x): x is { questionId: string; text: string; claimed: number; truth: number } => !!x);
}

const judge = (claimed: number, truth: number) => {
  const off = Math.abs(claimed - truth) / Math.max(1, Math.abs(truth));
  return off <= 0.1
    ? ('accurate' as const)
    : off <= 0.3
      ? ('slightly-off' as const)
      : ('false' as const);
};

/** `diligence.claim`: check one pitch claim against the game's data (2h). */
export function checkClaim(world: World, me: Player, companyId: Id, questionId: Id) {
  ensure(investorOn(world), 'pipeline.off', 'Not available yet.');
  const c = getCompany(world, companyId);
  ensure(
    (me.diligence[c.id] ?? 0) >= 1,
    'claim.firstCall',
    'Do a first call before checking claims.',
  );
  const claim = claimsOf(world, c).find((x) => x.questionId === questionId);
  ensure(claim, 'claim.none', 'They haven’t made that claim in a pitch.');
  spendHours(me, INVESTOR.hours.claimCheck, 'Checking a claim');
  const result = judge(claim.claimed, claim.truth);
  const e = add(world, me, c.id, 'manual');
  (e.claims ??= {})[questionId] = result;
  // An honesty signal: a false claim costs the founder your trust.
  if (result === 'false')
    for (const fid of c.founderIds) me.trust[fid] = clamp((me.trust[fid] ?? 0) - 0.2, -1, 1);
  return {
    result,
    message:
      result === 'accurate'
        ? 'The claim checks out.'
        : result === 'slightly-off'
          ? 'The claim is a little generous.'
          : 'The claim is false: a red flag.',
  };
}

/** `diligence.references`: talk to staff, customers and past co-investors (6h; less with a warm contact). */
export function references(world: World, me: Player, companyId: Id) {
  ensure(investorOn(world), 'pipeline.off', 'Not available yet.');
  const c = getCompany(world, companyId);
  const m = getMarket(world, me.market);
  const warm =
    (me.contacts ?? []).some(
      (x) =>
        (x.kind === 'founder' && c.founderIds.includes(x.refId)) ||
        (x.kind === 'fund' &&
          Object.values(world.positions).some(
            (p) => p.investorId === x.refId && p.companyId === c.id,
          )) ||
        (x.kind === 'player' &&
          Object.values(world.positions).some(
            (p) => p.investorId === x.refId && p.companyId === c.id,
          )),
    ) && (me.contacts ?? []).some((x) => contactWarmth(x, m.month) >= 0.2);
  spendHours(me, Math.round(INVESTOR.hours.references * (warm ? 0.5 : 1)), 'Reference calls');
  const signals: string[] = [];
  const morale = c.staff.length ? c.staff.reduce((a, s) => a + s.morale, 0) / c.staff.length : null;
  if (morale !== null)
    signals.push(
      morale >= 60
        ? 'Staff are happy and stay.'
        : morale >= 40
          ? 'Staff are mixed.'
          : 'Staff are unhappy: people are leaving.',
    );
  if (
    c.keyPersonLossMonth !== null &&
    (world.markets[c.market]?.month ?? 0) - c.keyPersonLossMonth <= 6
  )
    signals.push('A key person left recently.');
  const others = Object.values(world.players).filter(
    (x) => x.id !== me.id && !x.ai && c.founderIds.some((f) => x.trust[f] !== undefined),
  );
  if (others.length) {
    const avg =
      others.reduce(
        (a, x) => a + c.founderIds.reduce((b, f) => b + (x.trust[f] ?? 0), 0) / c.founderIds.length,
        0,
      ) / others.length;
    signals.push(
      avg >= 0.2
        ? 'Past co-investors speak well of the founders.'
        : avg <= -0.1
          ? 'Past co-investors warn you off.'
          : 'Past co-investors are neutral.',
    );
  }
  const segs = Object.values(c.segments);
  const paying = segs.reduce((a, s) => a + s.paying, 0);
  const churned = segs.reduce((a, s) => a + s.churned, 0);
  signals.push(
    paying === 0
      ? 'No paying customers to call yet.'
      : churned / Math.max(1, paying + churned) < 0.1
        ? 'Customers like the product and stay.'
        : 'Customers are leaving faster than they should.',
  );
  const e = add(world, me, c.id, 'manual');
  e.references = { month: homeMonth(world, me), signals };
  return { signals, warm };
}

/** Red flags deep diligence can find in company state (§6.3): never random. */
export function redFlags(world: World, c: Company): string[] {
  const flags: string[] = [];
  const m = world.markets[c.market];
  if (c.bannedFromRaising) flags.push('fake-revenue');
  if (
    Object.values(world.contracts).some(
      (k) => k.flags.length && (k.sellerId === c.id || k.buyerId === c.id),
    )
  )
    flags.push('related-party-revenue');
  if (c.keyPersonLossMonth !== null && (m?.month ?? 0) - c.keyPersonLossMonth <= 6)
    flags.push('key-person-left');
  if (
    Object.values(world.votes).some(
      (v) => v.companyId === c.id && v.kind === 'remove-ceo' && v.status === 'open',
    )
  )
    flags.push('board-fight');
  if (companyRunway(world, c) < 3) flags.push('runway-under-3-months');
  if (c.finance.loans.some((l) => l.monthsLeft <= 0 && l.outstanding > 0))
    flags.push('loan-in-default');
  return flags;
}

// ---------------------------------------------------------------- support

/** `invest.support`: an intro for a portfolio company (4h, once a company a month). */
export function supportCompany(
  world: World,
  me: Player,
  companyId: Id,
  kind: 'customers' | 'hires' | 'investors',
) {
  ensure(investorOn(world), 'pipeline.off', 'Not available yet.');
  const c = getCompany(world, companyId);
  ensure(c.status === 'active', 'company.closed', 'The company is no longer operating.');
  const holders = [
    me.id,
    ...Object.values(world.funds)
      .filter((f) => f.managerId === me.id)
      .map((f) => f.id),
  ];
  ensure(
    holders.some((h) => world.positions[`${h}:${c.id}`]),
    'support.holder',
    'Support companies you back.',
  );
  const month = homeMonth(world, me);
  ensure(
    (me.support?.[c.id] ?? -1) < month,
    'support.month',
    'You helped them this month already.',
  );
  spendHours(me, INVESTOR.hours.support, 'Founder support');
  (me.support ??= {})[c.id] = month;
  let message = '';
  if (kind === 'customers') {
    const key = c.targetSegments[0];
    const seg = key ? c.segments[key] : undefined;
    if (seg) seg.awareness = Math.min(1, seg.awareness + 0.02);
    message = `You introduced ${c.name} to buyers you know.`;
  } else if (kind === 'hires') {
    for (const s of c.staff) s.morale = Math.min(100, s.morale + 5);
    message = `You sent ${c.name} two strong candidates; the team is buoyed.`;
  } else {
    applyStarEvent(c.stars, 0.1);
    message = `You introduced ${c.name} to investors you know.`;
  }
  nudgeFounderTrust(me, INVESTOR.reputation.support);
  for (const fid of c.founderIds) {
    const f = world.players[fid];
    if (!f) continue;
    f.trust[me.id] = clamp((f.trust[me.id] ?? 0) + 0.05, -1, 1);
    if (!f.ai)
      notify(world, fid, {
        month: getMarket(world, c.market).month,
        kind: 'deal',
        text: `${me.name}: ${message}`,
      });
  }
  achieve(world, me, 'investor.first-support', 'First founder support', month);
  return { message };
}

// ---------------------------------------------------------------- terms, trust and hot rounds

/** Tough terms (§6.4 founder-friendliness): participating, more than 1×, a veto on sale. */
export const harshTerms = (t: InvestmentTerms) =>
  t.participating || t.liquidationMultiple > 1 || t.vetoOnSale;

/** After an investment executes (deals.ts): the investor's founder trust moves with the terms. */
export function afterTerms(world: World, investor: Player | undefined, t: InvestmentTerms) {
  if (!investorOn(world) || !investor || investor.ai) return;
  nudgeFounderTrust(
    investor,
    harshTerms(t) ? INVESTOR.reputation.harshTerms : INVESTOR.reputation.fairTerms,
  );
}

/** A strong AI company raising this month takes offers until month end. */
export function isHotRound(world: World, c: Company): boolean {
  if (!investorOn(world) || !c.ai || !c.raising || c.status !== 'active') return false;
  return c.stars.value >= 3.2 && companyRunway(world, c) >= 6;
}

/** Who backs an investment offer: the player, a fund's manager, a syndicate's lead. */
function backer(world: World, d: DealCard): Player | undefined {
  const p = d.proposer;
  if (p.kind === 'player') return world.players[p.id];
  if (p.kind === 'fund') return world.players[world.funds[p.id]?.managerId ?? ''];
  if (p.kind === 'syndicate') return world.players[world.syndicates?.[p.id]?.leadId ?? ''];
  return undefined;
}

/**
 * Month end: hot rounds pick the best offer (price, terms, reputation, trust)
 * and explain to the others why not (§6.4 competitive rounds).
 */
export function resolveHotRounds(world: World, marketId: string) {
  if (!investorOn(world)) return;
  const byCompany = new Map<Id, DealCard[]>();
  for (const d of Object.values(world.deals)) {
    if (d.market !== marketId || d.status !== 'open' || d.terms.kind !== 'investment' || !d.hot)
      continue;
    const list = byCompany.get(d.companyId!) ?? [];
    list.push(d);
    byCompany.set(d.companyId!, list);
  }
  for (const [cid, offers] of byCompany) {
    const c = world.companies[cid];
    if (!c || c.status !== 'active') continue;
    const model = Math.max(1, valueCompany(world, c, nextStage(c.lastRound)).value);
    const score = (d: DealCard) => {
      const t = d.terms as InvestmentTerms;
      const inv = backer(world, d);
      return (
        (t.valuation / model) * 0.4 +
        (harshTerms(t) ? 0 : 0.2) +
        ((inv?.stars.value ?? 2.5) / 5) * 0.2 +
        (inv?.investor?.founderTrust ?? 0.5) * 0.2
      );
    };
    const ranked = offers.slice().sort((a, b) => score(b) - score(a) || (a.id < b.id ? -1 : 1));
    const best = ranked[0]!;
    const bt = best.terms as InvestmentTerms;
    const acceptable =
      bt.valuation >= (best.aiLimit?.minValuation ?? 0) * 0.9 &&
      bt.amount <= (best.aiLimit?.maxAmount ?? bt.amount);
    const m = getMarket(world, c.market);
    for (const d of ranked) {
      const inv = backer(world, d);
      if (d === best && acceptable) {
        d.history.push({
          month: m.month,
          by: c.id,
          action: 'accept',
          summary: 'Chosen from several offers.',
        });
        executeDeal(world, d, c.id);
        if (inv)
          notify(world, inv.id, {
            month: m.month,
            kind: 'deal',
            text: `${c.name} chose your offer from several.`,
            ref: { kind: 'deal', id: d.id },
          });
        continue;
      }
      const t = d.terms as InvestmentTerms;
      const why =
        !acceptable && d === best
          ? 'nobody offered a price we could take'
          : t.valuation < bt.valuation
            ? 'another investor offered a better price'
            : harshTerms(t) && !harshTerms(bt)
              ? 'another investor offered cleaner terms'
              : 'we went with an investor founders rate more highly';
      d.status = 'declined';
      d.history.push({
        month: m.month,
        by: c.id,
        action: 'decline',
        summary: `We chose another offer: ${why}.`,
      });
      if (inv)
        notify(world, inv.id, {
          month: m.month,
          kind: 'deal',
          text: `${c.name} passed on your offer: ${why}.`,
          ref: { kind: 'deal', id: d.id },
        });
    }
    c.raising = false;
  }
}

// ---------------------------------------------------------------- reviews

/** `review.investor`: a founder rates an investor who backed their company (once). */
export function reviewInvestor(
  world: World,
  me: Player,
  investorId: Id,
  companyId: Id,
  rating: number,
  text: string,
) {
  ensure(investorOn(world), 'review.off', 'Not available yet.');
  const c = getCompany(world, companyId);
  ensure(c.founderIds.includes(me.id), 'review.founder', 'Review investors in your own company.');
  ensure(Number.isInteger(rating) && rating >= 1 && rating <= 5, 'review.rating', 'Rate 1 to 5.');
  const inv = world.players[investorId];
  ensure(inv && !inv.ai && inv.id !== me.id, 'review.investor', 'Review a human investor.');
  // Checked against the deal history: they must have invested in this company.
  const holders = [
    inv.id,
    ...Object.values(world.funds)
      .filter((f) => f.managerId === inv.id)
      .map((f) => f.id),
    ...Object.values(world.syndicates ?? {})
      .filter((s) => s.leadId === inv.id)
      .map((s) => s.id),
  ];
  ensure(
    holders.some((h) => world.positions[`${h}:${c.id}`]),
    'review.deal',
    'They never invested in this company.',
  );
  const id = `rev:${me.id}:${inv.id}:${c.id}`;
  const reviews = (world.reviews ??= {});
  ensure(!reviews[id], 'review.once', 'You already reviewed this investor for this company.');
  reviews[id] = {
    id,
    founderId: me.id,
    investorId: inv.id,
    companyId: c.id,
    rating,
    text: text.trim().slice(0, 200),
    month: getMarket(world, c.market).month,
  };
  nudgeFounderTrust(inv, (rating - 3) * 0.02);
  notify(world, inv.id, {
    month: getMarket(world, inv.market).month,
    kind: 'deal',
    text: `${me.name} reviewed you: ${'★'.repeat(rating)}${'☆'.repeat(5 - rating)}.`,
  });
  return { message: 'Review posted.' };
}

export function reviewsOf(world: World, investorId: Id) {
  const list = Object.values(world.reviews ?? {}).filter((r) => r.investorId === investorId);
  return {
    count: list.length,
    average: list.length ? roundTo(list.reduce((a, r) => a + r.rating, 0) / list.length, 1) : null,
    latest: list
      .sort((a, b) => b.month - a.month)
      .slice(0, 5)
      .map((r) => ({
        ...r,
        founderName: world.players[r.founderId]?.name ?? '',
        companyName: world.companies[r.companyId]?.name ?? '',
      })),
  };
}

// ---------------------------------------------------------------- scouting and inbound deal flow

/** `invest.scout`: spend hours finding companies not yet raising that fit your thesis (6h). */
export function scout(world: World, me: Player) {
  ensure(investorOn(world), 'pipeline.off', 'Not available yet.');
  spendHours(me, INVESTOR.hours.scouting, 'Scouting');
  const here = locationOf(me);
  const sectors = me.investor?.sectors ?? [];
  const found = Object.values(world.companies)
    .filter(
      (c) =>
        c.market === here &&
        c.status === 'active' &&
        !c.raising &&
        !c.ipo &&
        !c.founderIds.includes(me.id) &&
        !me.pipeline?.[c.id] &&
        (sectors.length === 0 || sectors.includes(c.industry)),
    )
    .sort((a, b) => b.stars.value - a.stars.value || (a.id < b.id ? -1 : 1))
    .slice(0, 3);
  const rng = deriveRng(world.seed, 'pipeline', 'scout', me.id, homeMonth(world, me));
  for (const c of found) {
    add(world, me, c.id, 'scouting');
    // Some founders open a round when a good investor comes knocking.
    if (c.ai && rng.next() < 0.5) c.raising = true;
  }
  return {
    found: found.map((c) => ({ companyId: c.id, name: c.name, raising: c.raising })),
    message: found.length
      ? `Found ${found.length} companies that fit your thesis.`
      : 'Nobody new fits your thesis here right now.',
  };
}

/**
 * Month end: pitches left unanswered are ghosting; watched companies that
 * raised are nudged; founders pitch investors by reputation.
 */
export function settleDealCraft(world: World, marketId: string, month: number) {
  if (!investorOn(world)) return;
  // Ghosting: a pitch to a human investor still unanswered after its month.
  for (const pitch of Object.values(world.pitches)) {
    if (pitch.status !== 'sent' || pitch.ghosted || !pitch.investorPlayerId) continue;
    const c = world.companies[pitch.companyId];
    if (!c || c.market !== marketId || pitch.month >= month) continue;
    const inv = world.players[pitch.investorPlayerId];
    if (!inv || inv.ai) continue;
    pitch.ghosted = true;
    nudgeFounderTrust(inv, -INVESTOR.penalties.ghostTrust);
    notify(world, inv.id, {
      month: getMarket(world, inv.market).month,
      kind: 'pitch',
      text: `You never answered ${c.name}'s pitch. Founders talk: your founder trust fell.`,
    });
  }
  for (const p of Object.values(world.players)) {
    if (p.ai || p.market !== marketId || !p.investor) continue;
    // Watchlist nudges.
    for (const e of Object.values(p.pipeline ?? {})) {
      if (!e.watch) continue;
      const c = world.companies[e.companyId];
      if (!c) continue;
      if ((c.lastRaiseMonth ?? -1) > (e.seenRaise ?? -1)) {
        e.seenRaise = c.lastRaiseMonth ?? -1;
        notify(world, p.id, {
          month,
          kind: 'pitch',
          text: `${c.name}, on your watchlist, just raised a round.`,
          ref: { kind: 'company', id: c.id },
        });
      } else if (c.raising && stageOf(world, p, c.id) === 'sourced')
        notify(world, p.id, {
          month,
          kind: 'pitch',
          text: `${c.name}, on your watchlist, is raising.`,
          ref: { kind: 'company', id: c.id },
        });
    }
    // Inbound pitches follow reputation: founder trust and stars.
    if (p.role !== 'investor') continue;
    const rng = deriveRng(world.seed, 'pipeline', p.id, month);
    const pull = clamp(
      p.investor.founderTrust * 0.7 + (p.stars.value / 5) * 0.5 + reviewPull(world, p.id),
      0,
      1.4,
    );
    const n = (rng.next() < pull ? 1 : 0) + (rng.next() < pull - 0.6 ? 1 : 0);
    if (n === 0) continue;
    const candidates = Object.values(world.companies)
      .filter(
        (c) =>
          c.ai &&
          c.market === marketId &&
          c.status === 'active' &&
          !c.bannedFromRaising &&
          !c.ipo &&
          !p.pipeline?.[c.id],
      )
      .sort((a, b) => b.stars.value - a.stars.value || (a.id < b.id ? -1 : 1));
    for (const c of candidates.slice(0, n)) {
      c.raising = true;
      add(world, p, c.id, 'pitch');
      notify(world, p.id, {
        month,
        kind: 'pitch',
        text: `${c.name} wants to pitch you (they heard good things).`,
        ref: { kind: 'company', id: c.id },
      });
    }
  }
  resolveHotRounds(world, marketId);
}

const reviewPull = (world: World, id: Id) => {
  const r = reviewsOf(world, id);
  return r.average === null ? 0 : (r.average - 3) * 0.1;
};

// ---------------------------------------------------------------- views

/** `view.dealCraft`: your pipeline, reputation and this month's recap. */
export function dealCraftView(world: World, p: Player) {
  if (!investorOn(world) || p.ai || !p.investor) return null;
  const pipeline = Object.values(p.pipeline ?? {})
    .map((e) => {
      const c = world.companies[e.companyId];
      if (!c) return null;
      const depth = p.diligence[c.id] ?? 0;
      return {
        companyId: c.id,
        name: c.name,
        industry: c.industry,
        stars: roundTo(c.stars.value, 1),
        raising: c.raising,
        hot: isHotRound(world, c),
        stage: stageOf(world, p, c.id),
        source: e.source ?? 'manual',
        watch: !!e.watch,
        passReason: e.passReason ?? null,
        month: e.month,
        claims: claimsOf(world, c).map((x) => ({
          questionId: x.questionId,
          text: x.text,
          claimed: x.claimed,
          result: e.claims?.[x.questionId] ?? null,
        })),
        references: e.references ?? null,
        redFlags: depth >= 2 ? redFlags(world, c) : null,
        diligence: depth,
      };
    })
    .filter((x): x is NonNullable<typeof x> => !!x)
    .sort((a, b) => PIPELINE_STAGES.indexOf(a.stage) - PIPELINE_STAGES.indexOf(b.stage));
  const pitchesToMe = Object.values(world.pitches)
    .filter((x) => x.investorPlayerId === p.id && x.status === 'sent')
    .map((x) => ({
      pitchId: x.id,
      companyId: x.companyId,
      companyName: world.companies[x.companyId]?.name ?? '',
      month: x.month,
      ask: x.ask,
    }));
  return {
    stages: PIPELINE_STAGES,
    pipeline,
    pitchesToMe,
    reputation: {
      founderTrust: p.investor.founderTrust,
      stars: roundTo(p.stars.value, 1),
      reviews: reviewsOf(world, p.id),
    },
    recap: investorRecap(world, p),
    supportedThisMonth: Object.entries(p.support ?? {})
      .filter(([, month]) => month === homeMonth(world, p))
      .map(([id]) => id),
  };
}

/** The monthly investor recap (§10.6): money, marks, decisions due, what's new. */
export function investorRecap(world: World, p: Player) {
  const month = homeMonth(world, p);
  const fundIds = Object.values(world.funds)
    .filter((f) => f.managerId === p.id)
    .map((f) => f.id);
  const holders = [p.id, ...fundIds];
  const marks = Object.values(world.positions)
    .filter((x) => holders.includes(x.investorId) && (x.marks?.length ?? 0) >= 2)
    .map((x) => {
      const m = x.marks!;
      const now = m[m.length - 1]!;
      const prev = m[m.length - 2]!;
      return {
        companyId: x.companyId,
        name: world.companies[x.companyId]?.name ?? '',
        change: now.value - prev.value,
        source: now.source,
      };
    })
    .filter((x) => x.change !== 0)
    .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
    .slice(0, 5);
  const votes = Object.values(world.votes)
    .filter((v) => v.status === 'open' && Object.keys(v.weights).some((h) => holders.includes(h)))
    .map((v) => ({
      voteId: v.id,
      companyName: world.companies[v.companyId]?.name ?? '',
      deadlineMonth: v.deadlineMonth,
    }));
  const offers = Object.values(world.deals)
    .filter(
      (d) =>
        d.status === 'open' &&
        ((d.awaiting.kind === 'player' && d.awaiting.id === p.id) ||
          (d.awaiting.kind === 'fund' && fundIds.includes(d.awaiting.id))),
    )
    .map((d) => ({ dealId: d.id, summary: d.summary, expiresMonth: d.expiresMonth }));
  const atRisk = Object.values(world.positions)
    .filter((x) => holders.includes(x.investorId) && !x.writtenOff)
    .map((x) => world.companies[x.companyId])
    .filter((c): c is Company => !!c && c.status === 'active' && companyRunway(world, c) < 3)
    .map((c) => ({ companyId: c.id, name: c.name }));
  return {
    month,
    cash: { income: p.lastMonth.income, spend: p.lastMonth.spend },
    fundCash: fundIds.reduce(
      (a, id) => a + (world.accounts[world.funds[id]!.account]?.balance ?? 0),
      0,
    ),
    marks,
    decisions: {
      votes,
      offers,
      prorata: Object.values(world.prorata ?? {}).filter(
        (o) => o.status === 'open' && holders.includes(o.holderId),
      ).length,
    },
    atRisk,
    newPitches: Object.values(p.pipeline ?? {}).filter(
      (e) => e.month === month && e.source === 'pitch',
    ).length,
    revenueLeaders: Object.values(world.positions)
      .filter((x) => holders.includes(x.investorId))
      .map((x) => world.companies[x.companyId])
      .filter((c): c is Company => !!c && c.status === 'active')
      .map((c) => ({ name: c.name, revenue: lastPnl(c)?.revenue ?? 0 }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 3),
  };
}

/** For founders: human investors who backed your companies, and whether you reviewed them. */
export function reviewableView(world: World, p: Player) {
  if (!investorOn(world) || p.ai) return [];
  const out: {
    investorId: Id;
    name: string;
    companyId: Id;
    companyName: string;
    reviewed: boolean;
  }[] = [];
  for (const cid of p.companyIds) {
    const c = world.companies[cid];
    if (!c || !c.founderIds.includes(p.id)) continue;
    const seen = new Set<Id>();
    for (const pos of Object.values(world.positions)) {
      if (pos.companyId !== c.id) continue;
      const inv =
        world.players[pos.investorId] ??
        world.players[world.funds[pos.investorId]?.managerId ?? ''] ??
        world.players[world.syndicates?.[pos.investorId]?.leadId ?? ''];
      if (!inv || inv.ai || inv.id === p.id || seen.has(inv.id)) continue;
      seen.add(inv.id);
      out.push({
        investorId: inv.id,
        name: inv.name,
        companyId: c.id,
        companyName: c.name,
        reviewed: !!world.reviews?.[`rev:${p.id}:${inv.id}:${c.id}`],
      });
    }
  }
  return out;
}

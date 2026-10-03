/**
 * Media, reporters and stars (§10).
 *
 *  - Private information is never published (no chats, negotiations or internal numbers).
 *  - Features, profiles, launches, raises and interviews run only with agreement.
 *  - Every factual claim is fact-checked against game data; the data stays private.
 *  - Public-record events (fines, defaults, shutdowns) run as short factual items.
 *  - Format: alert under 12 words; article under 60 words.
 */
import { OUTLET_EFFECT } from './data/fiction.js';
import type { OutletType } from './data/fiction.js';
import { ensure, fail } from './errors.js';
import {
  getCompany,
  getMarket,
  getPlayer,
  lastPnl,
  notify,
  publish,
  totalCustomers,
} from './helpers.js';
import { newId } from './ids.js';
import { clamp, roundTo } from './math.js';
import { formatMoney } from './money.js';
import type { Rng } from './rng.js';
import { applyStarEvent } from './stars.js';
import { monthlyGrowth } from './valuation.js';
import { companyRunway } from './company.js';
import type {
  Company,
  FactCheckResult,
  Id,
  MediaInvite,
  MediaQuestion,
  NewsItem,
  Outlet,
  Player,
  World,
} from './types.js';

export const STORY_PITCH_COOLDOWN = 3;
export const ALERT_MAX_WORDS = 12;
export const ARTICLE_MAX_WORDS = 60;

export const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

function truncateWords(s: string, max: number) {
  const words = s.trim().split(/\s+/);
  return words.length <= max ? s.trim() : `${words.slice(0, max).join(' ')}…`;
}

/** Truth for each metric a reporter can ask about. */
export function truthFor(
  world: World,
  c: Company | null,
  p: Player,
  metric: MediaQuestion['metric'],
): number {
  if (!c) return metric === 'team' ? 1 : 0;
  switch (metric) {
    case 'revenue':
      return lastPnl(c)?.revenue ?? 0;
    case 'customers':
      return totalCustomers(c);
    case 'growth':
      return Math.round(monthlyGrowth(c) * 100);
    case 'team':
      return c.staff.length + c.founderIds.length;
    case 'funding':
      return Object.values(world.positions)
        .filter((x) => x.companyId === c.id)
        .reduce((a, x) => a + x.invested, 0);
    case 'plan':
      return 0;
  }
  void p;
}

/** Accurate within ~10% (tighter for high-star players: closer fact-checking). */
export function factCheck(
  claim: number | null,
  truth: number,
  stars: number,
  metric: MediaQuestion['metric'],
): FactCheckResult {
  if (metric === 'plan') return 'future';
  if (claim === null) return 'accurate';
  const tolerance = 0.1 * (1 - stars / 20);
  const off = Math.abs(claim - truth) / Math.max(1, Math.abs(truth));
  if (off <= tolerance) return 'accurate';
  if (off <= 0.3) return 'slightly-off';
  return 'false';
}

const ANGLES: Record<string, string[]> = {
  growth: ['Fast growth', 'The customers', 'What’s next'],
  profile: ['Founder profile', 'Why this market', 'Lessons so far'],
  raise: ['The raise', 'Who backed them', 'Plans for the money'],
  investor: ['First cheques', 'What I look for', 'The market'],
  comeback: ['The comeback', 'What failure taught', 'What’s next'],
};

function questionsFor(world: World, c: Company | null, p: Player, angle: string): MediaQuestion[] {
  const cur = getMarket(world, p.market).data.currency;
  const q = (metric: MediaQuestion['metric'], text: string): MediaQuestion => {
    const truth = truthFor(world, c, p, metric);
    const fmt = (v: number) =>
      metric === 'revenue' || metric === 'funding'
        ? formatMoney(v, cur)
        : metric === 'growth'
          ? `${v}% a month`
          : v.toLocaleString('en-GB');
    if (metric === 'plan') {
      return {
        id: metric,
        text,
        metric,
        options: [
          { id: 'modest', label: 'Grow steadily and stay default alive', claim: null },
          { id: 'bold', label: 'Expand to a new segment this year', claim: null },
          { id: 'huge', label: 'Become the biggest in the market within a year', claim: null },
        ],
      };
    }
    return {
      id: metric,
      text,
      metric,
      options: [
        { id: 'true', label: fmt(truth), claim: truth },
        {
          id: 'round-up',
          label: fmt(Math.round(truth * 1.25 + (truth === 0 ? 5 : 0))),
          claim: Math.round(truth * 1.25 + (truth === 0 ? 5 : 0)),
        },
        {
          id: 'inflate',
          label: fmt(Math.round(truth * 2 + (truth === 0 ? 20 : 0))),
          claim: Math.round(truth * 2 + (truth === 0 ? 20 : 0)),
        },
        { id: 'decline', label: 'Prefer not to say', claim: null },
      ],
    };
  };
  if (p.role === 'investor') {
    return [
      q('team', 'How many companies have you backed?'),
      q('funding', 'How much have you deployed?'),
      q('plan', 'What are you looking for next?'),
    ];
  }
  if (angle === 'The raise' || angle === 'Who backed them') {
    return [
      q('funding', 'How much have you raised in total?'),
      q('customers', 'How many paying customers?'),
      q('plan', 'What will the money do?'),
    ];
  }
  return [
    q('customers', 'How many paying customers do you have?'),
    q('growth', 'How fast are you growing?'),
    q('plan', 'What’s the plan for the next year?'),
  ];
}

function pickOutlet(m: { outlets: Outlet[] }, rng: Rng, prefer: OutletType[]): Outlet {
  const list = m.outlets.filter((o) => prefer.includes(o.type));
  return rng.pick(list.length ? list : m.outlets);
}

export function invite(
  world: World,
  args: {
    player: Player;
    company: Company | null;
    outlet: Outlet;
    theme: keyof typeof ANGLES;
    origin: 'outreach' | 'pitched';
    month: number;
  },
): MediaInvite {
  const { player, company, outlet } = args;
  const open = Object.values(world.media).some(
    (x) =>
      x.playerId === player.id &&
      x.outletId === outlet.id &&
      ['invited', 'angle', 'questions', 'preview'].includes(x.status),
  );
  ensure(!open, 'media.open', 'You already have an open story with this outlet.');
  const first = outlet.reporter.split(' ')[0];
  const subject = company ? `${company.name}’s` : 'your';
  const lines: Record<string, string> = {
    growth: `Hi, I’m ${first} from ${outlet.name}. ${subject[0]!.toUpperCase()}${subject.slice(1)} growth caught our eye. Open to a short profile?`,
    profile: `Hi, I’m ${first} from ${outlet.name}. We’d like to profile you. Interested?`,
    raise: `Hi, I’m ${first} from ${outlet.name}. Congrats on the raise. Want us to cover it?`,
    investor: `Hi, I’m ${first} from ${outlet.name}. Readers want to know who’s writing cheques. Chat?`,
    comeback: `Hi, I’m ${first} from ${outlet.name}. Comebacks make great stories. Open to one?`,
  };
  const inv: MediaInvite = {
    id: newId(world, 'media'),
    playerId: player.id,
    companyId: company?.id ?? null,
    market: player.market,
    outletId: outlet.id,
    outletName: outlet.name,
    outletType: outlet.type,
    reporter: outlet.reporter,
    origin: args.origin,
    status: 'invited',
    invite: lines[args.theme] ?? lines.profile!,
    angles: ANGLES[args.theme] ?? ANGLES.profile!,
    angle: null,
    questions: [],
    answers: {},
    checks: [],
    draft: null,
    month: args.month,
  };
  world.media[inv.id] = inv;
  notify(world, player.id, {
    month: args.month,
    kind: 'reporter',
    text: inv.invite,
    ref: { kind: 'media', id: inv.id },
  });
  return inv;
}

function ownInvite(world: World, id: Id, playerId: Id): MediaInvite {
  const inv = world.media[id];
  ensure(inv && inv.playerId === playerId, 'media.missing', 'Story not found.');
  return inv;
}

/** Accept (no penalty for declining) and pick the angle. */
export function acceptInvite(world: World, id: Id, playerId: Id, angle: string) {
  const inv = ownInvite(world, id, playerId);
  ensure(inv.status === 'invited', 'media.state', 'This story has moved on.');
  ensure(inv.angles.includes(angle), 'media.angle', 'Pick one of the offered angles.');
  inv.angle = angle;
  inv.status = 'questions';
  const p = getPlayer(world, playerId);
  inv.questions = questionsFor(
    world,
    inv.companyId ? getCompany(world, inv.companyId) : null,
    p,
    angle,
  );
  return inv;
}

export function declineInvite(world: World, id: Id, playerId: Id) {
  const inv = ownInvite(world, id, playerId);
  ensure(
    inv.status === 'invited' || inv.status === 'questions',
    'media.state',
    'Too late to decline; pull out from the preview instead.',
  );
  inv.status = 'declined';
  return inv;
}

/** Answer the three questions → fact-check → preview with the draft article. */
export function answerInvite(world: World, id: Id, playerId: Id, answers: Record<string, string>) {
  const inv = ownInvite(world, id, playerId);
  ensure(
    inv.status === 'questions' || inv.status === 'preview',
    'media.state',
    'This story isn’t taking answers.',
  );
  for (const q of inv.questions)
    ensure(
      q.options.some((o) => o.id === answers[q.id]),
      'media.answers',
      'Answer every question.',
    );
  inv.answers = answers;
  const p = getPlayer(world, playerId);
  const c = inv.companyId ? getCompany(world, inv.companyId) : null;
  inv.checks = inv.questions.map((q) => {
    const opt = q.options.find((o) => o.id === answers[q.id])!;
    const truth = truthFor(world, c, p, q.metric);
    return {
      questionId: q.id,
      result: factCheck(opt.claim, truth, p.stars.value, q.metric),
      claim: opt.claim,
      truth,
    };
  });
  inv.draft = draftArticle(world, inv, p, c, false);
  inv.status = 'preview';
  return inv;
}

function draftArticle(
  world: World,
  inv: MediaInvite,
  p: Player,
  c: Company | null,
  insisted: boolean,
): Omit<NewsItem, 'id'> {
  const m = getMarket(world, inv.market);
  const cur = m.data.currency;
  const subject = c ? c.name : p.name;
  const fmt = (q: MediaQuestion, v: number) =>
    q.metric === 'revenue' || q.metric === 'funding'
      ? formatMoney(v, cur)
      : q.metric === 'growth'
        ? `${v}% monthly growth`
        : `${v.toLocaleString('en-GB')}`;
  const facts: string[] = [];
  let verified = true;
  let falseCount = 0;
  for (const chk of inv.checks) {
    const q = inv.questions.find((x) => x.id === chk.questionId)!;
    const label =
      q.metric === 'customers'
        ? 'paying customers'
        : q.metric === 'team'
          ? p.role === 'investor'
            ? 'companies backed'
            : 'people'
          : q.metric === 'funding'
            ? p.role === 'investor'
              ? 'deployed'
              : 'raised'
            : '';
    if (chk.result === 'future') {
      const opt = q.options.find((o) => o.id === inv.answers[q.id]);
      facts.push(`Plans: ${opt?.label.toLowerCase() ?? 'growth'}.`);
      continue;
    }
    if (chk.claim === null) {
      verified = false;
      continue;
    }
    if (chk.result === 'accurate') facts.push(`${fmt(q, chk.truth)} ${label}.`.replace(' .', '.'));
    else if (chk.result === 'slightly-off') {
      verified = false;
      facts.push(`${fmt(q, chk.truth)} ${label} (records show).`.replace(' (', ' ('));
    } else {
      verified = false;
      falseCount += 1;
      facts.push(`Claimed ${fmt(q, chk.claim)}; records show ${fmt(q, chk.truth)}.`);
    }
  }
  const effect = OUTLET_EFFECT[inv.outletType];
  const positivity = clamp(0.4 + (c ? c.stars.value / 10 : p.stars.value / 10), 0.3, 1);
  let delta = effect * positivity * (verified ? 1.3 : 1);
  if (insisted) delta = -effect * 0.8 * falseCount;
  delta = roundTo(delta, 2);
  const headline = truncateWords(`${subject}: ${inv.angle ?? 'profile'}`, 10);
  const body = truncateWords(
    `${inv.reporter} reports. ${facts.join(' ')}${insisted ? ' Figures corrected by our fact-checkers.' : ''}`,
    ARTICLE_MAX_WORDS,
  );
  const alert = truncateWords(
    `${subject} in ${inv.outletName}. Stars ${delta >= 0 ? '+' : ''}${delta}.`,
    ALERT_MAX_WORDS,
  );
  const chartValues = c ? c.finance.history.slice(-6).map((h) => h.customers) : undefined;
  return {
    market: inv.market,
    month: m.month,
    outletId: inv.outletId,
    outletName: inv.outletName,
    kind: inv.angle === 'The raise' ? 'raise' : 'feature',
    alert,
    headline,
    body,
    starDelta: delta,
    verified: verified && falseCount === 0,
    subject: c ? { kind: 'company', id: c.id } : { kind: 'player', id: p.id },
    ...(chartValues && chartValues.length > 1
      ? { chart: { label: 'Paying customers', values: chartValues } }
      : {}),
  };
}

/** Clearly false claims block a clean publish: correct, pull out, or insist (true figure runs; stars drop). */
export function publishInvite(world: World, id: Id, playerId: Id, insist: boolean) {
  const inv = ownInvite(world, id, playerId);
  ensure(inv.status === 'preview' && inv.draft, 'media.state', 'Nothing to publish yet.');
  const hasFalse = inv.checks.some((c) => c.result === 'false');
  if (hasFalse && !insist)
    fail(
      'media.false',
      'The fact-check found a false claim. Correct your answer, pull out, or insist.',
    );
  const p = getPlayer(world, playerId);
  const c = inv.companyId ? getCompany(world, inv.companyId) : null;
  const draft = hasFalse ? draftArticle(world, inv, p, c, true) : inv.draft;
  const item = publish(world, draft);
  const target = c ? c.stars : p.stars;
  applyStarEvent(target, item.starDelta);
  if (c) applyStarEvent(p.stars, item.starDelta / 2);
  // Coverage builds awareness among the segment's buyers.
  if (c && item.starDelta > 0) {
    for (const k of c.targetSegments) {
      const pos = c.segments[k];
      if (pos) pos.awareness = Math.min(1, pos.awareness + OUTLET_EFFECT[inv.outletType] * 0.01);
    }
  }
  inv.status = 'published';
  return item;
}

export function pullInvite(world: World, id: Id, playerId: Id) {
  const inv = ownInvite(world, id, playerId);
  ensure(inv.status === 'preview' || inv.status === 'questions', 'media.state', 'Nothing to pull.');
  inv.status = 'pulled';
  return inv;
}

/** A player pitches their own story; the reporter decides (§10). Limit: once per outlet every few months. */
export function pitchStory(
  world: World,
  p: Player,
  outletId: string,
  companyId: Id | null,
  rng: Rng,
) {
  const m = getMarket(world, p.market);
  const outlet = m.outlets.find((o) => o.id === outletId);
  ensure(outlet, 'media.outlet', 'Unknown outlet.');
  const last = p.pitchedOutlets[outletId];
  ensure(
    last === undefined || m.month - last >= STORY_PITCH_COOLDOWN,
    'media.cooldown',
    `You pitched ${outlet.name} recently. Try again in a few months.`,
  );
  p.pitchedOutlets[outletId] = m.month;
  const c = companyId ? getCompany(world, companyId) : null;
  if (c) ensure(c.founderIds.includes(p.id), 'company.forbidden', 'Not your company.');
  const growth = c ? monthlyGrowth(c) : 0;
  // Big outlets want big stories; regional and tech outlets favour newer, smaller players.
  const size = c ? Math.log10(Math.max(1, totalCustomers(c))) / 4 : 0.1;
  const favoursSmall =
    outlet.type === 'regional' || outlet.type === 'tech' || outlet.type === 'trade';
  const newsworthiness =
    0.2 +
    growth * 2 +
    (favoursSmall ? 0.2 : size * 0.6) +
    p.stars.value / 20 -
    (outlet.type === 'global' ? 0.4 : outlet.type === 'national' ? 0.15 : 0);
  if (!rng.chance(clamp(newsworthiness, 0.05, 0.9))) {
    return {
      accepted: false as const,
      reason: `${outlet.reporter.split(' ')[0]} at ${outlet.name}: “Not for us right now.”`,
    };
  }
  const inv = invite(world, {
    player: p,
    company: c,
    outlet,
    theme:
      p.role === 'investor'
        ? 'investor'
        : p.failures > 0 && c && c.foundedMonth > m.month - 12
          ? 'comeback'
          : 'growth',
    origin: 'pitched',
    month: m.month,
  });
  return { accepted: true as const, invite: inv };
}

/** Reporters look for players worth covering (§10 "Reporter outreach"). */
export function reporterOutreach(world: World, market: string, rng: Rng, month: number) {
  const m = getMarket(world, market as never);
  for (const p of Object.values(world.players)) {
    if (p.ai || p.market !== m.id) continue;
    const busy = Object.values(world.media).some(
      (x) => x.playerId === p.id && ['invited', 'questions', 'preview'].includes(x.status),
    );
    if (busy) continue;
    const c =
      p.companyIds.map((id) => world.companies[id]).find((x) => x && x.status === 'active') ?? null;
    if (c) {
      const growth = monthlyGrowth(c);
      const raisedRecently = c.lastRaiseMonth !== null && month - c.lastRaiseMonth <= 1;
      const quiet = c.stars.good < 0.05 && c.stars.value >= 3;
      const comeback = p.failures > 0 && month - c.foundedMonth < 12 && growth > 0.1;
      const theme = raisedRecently
        ? 'raise'
        : comeback
          ? 'comeback'
          : growth > 0.15 || quiet
            ? 'growth'
            : null;
      if (theme && rng.chance(raisedRecently ? 0.8 : 0.35)) {
        const outlet = pickOutlet(
          m,
          rng,
          raisedRecently
            ? ['tech', 'trade']
            : totalCustomers(c) > 5000
              ? ['national', 'tech']
              : ['regional', 'tech', 'trade'],
        );
        invite(world, { player: p, company: c, outlet, theme, origin: 'outreach', month });
      }
    } else if (p.role === 'investor') {
      const deals = Object.values(world.positions).filter((x) => x.investorId === p.id).length;
      if (deals >= 2 && rng.chance(0.15))
        invite(world, {
          player: p,
          company: null,
          outlet: pickOutlet(m, rng, ['tech', 'regional']),
          theme: 'investor',
          origin: 'outreach',
          month,
        });
    }
  }
}

/** Monthly economic note from the AI central bank (§8). */
export function economicNote(world: World, market: string): string {
  const m = getMarket(world, market as never);
  const rate = (m.data.baseRateBps / 100).toFixed(2);
  const fx =
    m.data.currency === 'USD'
      ? ''
      : ` ${m.data.currency}/USD ${m.data.unitsPerUsd.toLocaleString('en-GB')}.`;
  const mood =
    m.climate > 1.1
      ? 'Funding is hot.'
      : m.climate < 0.9
        ? 'Funding is tight.'
        : 'Funding is steady.';
  return `Policy rate ${rate}%.${fx} ${mood}`;
}

export const runwayFor = companyRunway;

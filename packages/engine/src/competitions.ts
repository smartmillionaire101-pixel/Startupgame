/**
 * Pitch competitions (Wave 10). Every city runs them (San Francisco every
 * month, the others every quarter): a sponsor puts up a prize pool, founders
 * enter with a company during the competition's month, and judges score each
 * pitch 1–10: real investor players who opt in, plus three AI investors from
 * the city's funds and angels (scoring from the company's numbers, with
 * seeded noise). The settlement that ends the month reveals the scores: the
 * winner takes most of the prize (the runner-up the rest), press, stars and
 * a warm intro to the AI judge who liked them most.
 *
 * Money: the pool moves from the sponsor's side of the world (`ext.lps`) into
 * the competition's own account when it is announced, and out to the winning
 * companies (whatever is left goes back). Deterministic: ids are
 * `comp-<market>-<month>`, and every draw comes from the 'competition' label.
 */
import { CITY_DISTRICTS } from './data/businesses.js';
import type { MarketId } from './data/markets.js';
import { gameDate } from './clock.js';
import { reliability } from './customers.js';
import { stableDistrict } from './districts.js';
import { districtLabel, isOpen } from './economy.js';
import { ensure, fail } from './errors.js';
import { addContact } from './events.js';
import {
  achieve,
  col,
  getMarket,
  locationOf,
  notify,
  ownCompany,
  publish,
  spendHours,
  totalCustomers,
} from './helpers.js';
import { account, openAccount, pay, transfer } from './ledger.js';
import { clamp, clamp01 } from './math.js';
import { formatMoney, scale } from './money.js';
import { hashString, deriveRng } from './rng.js';
import { applyStarEvent } from './stars.js';
import { monthlyGrowth } from './valuation.js';
import type {
  Company,
  Competition,
  CompetitionEntry,
  CompetitionJudge,
  Id,
  MarketState,
  Player,
  World,
} from './types.js';

export const COMPETITION = {
  maxEntries: 10,
  humanJudges: 3,
  aiJudges: 3,
  /** AI startups that enter on their own, [min, max]. */
  aiEntrants: [3, 5] as [number, number],
  /** Preparing a pitch. */
  hours: 4,
  /** Prize pool in cost-of-living units. */
  prizeCol: 15,
  runnerUpShare: 0.3,
  winnerStars: 0.3,
  founderStars: 0.15,
  interestWarmth: 0.4,
  judgeWarmth: 0.15,
  /** Judged competitions stay on the board this many months. */
  recentMonths: 3,
} as const;

/** Where competitions are held, best first. */
const VENUE_KINDS = ['ballroom', 'event-venue', 'tech-campus', 'hotel', 'co-working', 'bootcamp'];

export const competitionId = (market: MarketId, month: number) => `comp-${market}-${month}`;

/** San Francisco holds one every month; other cities every quarter (staggered by city). */
export const isCompetitionMonth = (market: MarketId, month: number): boolean =>
  market === 'san-francisco' || (month + (hashString(`comp:${market}`) % 3)) % 3 === 0;

/** The next month (from `from`, inclusive) a city holds a competition. */
export function nextCompetitionMonth(market: MarketId, from: number): number {
  let m = from;
  while (!isCompetitionMonth(market, m)) m++;
  return m;
}

export const competitionsOf = (world: World): Record<Id, Competition> => world.competitions ?? {};

export function getCompetition(world: World, id: Id): Competition {
  const c = competitionsOf(world)[id];
  if (!c) fail('competition.missing', 'That competition isn’t on.');
  return c;
}

const NAMES = [
  (sponsor: string, city: string) => `${sponsor} ${city} Pitch Night`,
  (sponsor: string, city: string) => `${city} Founders Cup, presented by ${sponsor}`,
  (sponsor: string, city: string) => `${sponsor} Startup Showdown ${city}`,
  (sponsor: string, city: string) => `The ${city} Pitch Battle by ${sponsor}`,
];

function sponsorsOf(world: World, m: MarketState): Competition['sponsor'][] {
  const out: Competition['sponsor'][] = [];
  for (const l of Object.values(m.lenders ?? {})) out.push({ name: l.name, kind: 'bank' });
  for (const f of Object.values(world.funds).sort((a, b) => (a.id < b.id ? -1 : 1)))
    if (f.market === m.id && f.ai && !f.angelId) out.push({ name: f.name, kind: 'fund' });
  for (const b of Object.values(m.businesses ?? {}))
    if (isOpen(b) && (b.kind === 'tech-campus' || b.kind === 'hotel'))
      out.push({ name: b.name, kind: 'corporate' });
  return out;
}

function aiJudgesFor(world: World, m: MarketState, rng: ReturnType<typeof deriveRng>): CompetitionJudge[] {
  const funds = Object.values(world.funds)
    .filter((f) => f.market === m.id && f.ai && !f.managerId)
    .filter((f) => !f.angelId || world.players[f.angelId]?.angel?.retiredMonth === undefined)
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  return rng
    .shuffle(funds)
    .slice(0, COMPETITION.aiJudges)
    .map((f) => {
      const angel = f.angelId ? world.players[f.angelId] : undefined;
      return {
        id: `fund:${f.id}`,
        kind: 'ai' as const,
        name: angel?.name ?? f.partner,
        org: f.name,
        fundId: f.id,
      };
    });
}

/** Announce this month's competition in a city (if it holds one and it isn't out yet). */
export function ensureCompetition(world: World, marketId: MarketId, month: number) {
  if (!isCompetitionMonth(marketId, month)) return null;
  const id = competitionId(marketId, month);
  const all = (world.competitions ??= {});
  if (all[id]) return all[id];
  const m = getMarket(world, marketId);
  const rng = deriveRng(world.seed, 'competition', marketId, month);
  const sponsors = sponsorsOf(world, m);
  const sponsor = sponsors.length
    ? sponsors[Math.floor(rng.next() * sponsors.length)]!
    : { name: `${m.data.name} Founders Network`, kind: 'corporate' as const };
  const name = NAMES[Math.floor(rng.next() * NAMES.length)]!(sponsor.name, m.data.name);
  const venues = Object.values(m.businesses ?? {})
    .filter((b) => isOpen(b) && VENUE_KINDS.includes(b.kind))
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  const vb = venues.length ? venues[Math.floor(rng.next() * venues.length)]! : null;
  const venue = vb
    ? { businessId: vb.id, name: vb.name, district: vb.district }
    : {
        businessId: null,
        name: 'Event Hall',
        district: stableDistrict(marketId, 'competition', month) ?? CITY_DISTRICTS[marketId]![0]!,
      };
  const prizePool = scale(col(m), COMPETITION.prizeCol);
  const acc = openAccount(world, {
    id: `acc:${id}`,
    currency: m.data.currency,
    market: marketId,
    label: name,
  });
  transfer(world, m.ext.lps, acc, prizePool, `Prize pool: ${name}`, month);
  const comp: Competition = {
    id,
    market: marketId,
    month,
    name,
    sponsor,
    venue,
    prizePool,
    account: acc,
    judges: aiJudgesFor(world, m, rng),
    entries: [],
    status: 'open',
  };
  // A few AI startups line up to pitch.
  const ai = Object.values(world.companies)
    .filter((c) => c.ai && c.market === marketId && c.status === 'active')
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  const n = rng.int(COMPETITION.aiEntrants[0], COMPETITION.aiEntrants[1]);
  for (const c of rng.shuffle(ai).slice(0, n)) addEntry(comp, c, c.founderIds[0] ?? c.id, true);
  all[id] = comp;
  return comp;
}

function addEntry(comp: Competition, c: Company, founderId: Id, ai: boolean): CompetitionEntry {
  const e: CompetitionEntry = {
    id: `${comp.id}:e${comp.entries.length}`,
    companyId: c.id,
    founderId,
    ai,
    scores: {},
  };
  comp.entries.push(e);
  return e;
}

const isFounderIn = (world: World, comp: Competition, playerId: Id) =>
  comp.entries.some((e) => world.companies[e.companyId]?.founderIds.includes(playerId));

// ---------------------------------------------------------------- Commands

/** Why a founder can't enter (null when they can). */
export function enterBlocker(world: World, me: Player, comp: Competition, companyId?: Id): string | null {
  const m = getMarket(world, comp.market);
  if (comp.status !== 'open' || comp.month !== m.month) return 'Entries are closed.';
  const mine = me.companyIds
    .map((id) => world.companies[id])
    .filter((c): c is Company => !!c && c.status === 'active' && c.founderIds.includes(me.id))
    .filter((c) => !companyId || c.id === companyId);
  if (!mine.length) return 'Enter with a company you run.';
  if (comp.judges.some((j) => j.id === me.id)) return 'You’re judging this one.';
  const free = mine.filter((c) => !comp.entries.some((e) => e.companyId === c.id));
  if (!free.length) return 'You’re already in.';
  if (comp.entries.length >= COMPETITION.maxEntries) return 'The line-up is full.';
  if (locationOf(me) !== comp.market) return `It’s on stage in ${m.data.name}: fly there to pitch.`;
  if (me.hours.available - me.hours.used < COMPETITION.hours)
    return `Preparing a pitch takes ${COMPETITION.hours} hours.`;
  return null;
}

export function enterCompetition(world: World, me: Player, competitionId: Id, companyId: Id) {
  const comp = getCompetition(world, competitionId);
  const c = ownCompany(world, me.id, companyId);
  const blocker = enterBlocker(world, me, comp, c.id);
  ensure(!blocker, 'competition.enter', blocker ?? '');
  spendHours(me, COMPETITION.hours, 'Preparing your pitch');
  const e = addEntry(comp, c, me.id, false);
  me.skills.publicSpeaking = Math.min(100, me.skills.publicSpeaking + 1);
  const m = getMarket(world, comp.market);
  return {
    entryId: e.id,
    message: `${c.name} is in the line-up for ${comp.name}. ${comp.judges.length} judges score it at the end of the month; the prize is ${formatMoney(comp.prizePool, m.data.currency)}.`,
  };
}

/** Why a player can't judge (null when they can). */
export function judgeBlocker(world: World, me: Player, comp: Competition): string | null {
  const m = getMarket(world, comp.market);
  if (comp.status !== 'open' || comp.month !== m.month) return 'Judging is over.';
  if (!me.investor) return 'Judges are investors.';
  if (comp.judges.some((j) => j.id === me.id)) return 'You’re on the panel.';
  if (isFounderIn(world, comp, me.id)) return 'You can’t judge a competition you pitch in.';
  if (comp.judges.filter((j) => j.kind === 'player').length >= COMPETITION.humanJudges)
    return 'The panel is full.';
  return null;
}

export function joinJudges(world: World, me: Player, competitionId: Id) {
  const comp = getCompetition(world, competitionId);
  const blocker = judgeBlocker(world, me, comp);
  ensure(!blocker, 'competition.judge', blocker ?? '');
  const fund = me.investor?.fundId ? world.funds[me.investor.fundId] : undefined;
  comp.judges.push({
    id: me.id,
    kind: 'player',
    name: me.name,
    org: fund?.name ?? 'Angel investor',
    fundId: fund?.id ?? null,
  });
  return {
    message: `You’re on the panel for ${comp.name}. Score each pitch from 1 to 10 before the month ends.`,
  };
}

export function scoreEntry(
  world: World,
  me: Player,
  competitionId: Id,
  entryId: Id,
  score: number,
) {
  const comp = getCompetition(world, competitionId);
  const m = getMarket(world, comp.market);
  ensure(
    comp.status === 'open' && comp.month === m.month,
    'competition.closed',
    'Judging is over.',
  );
  ensure(
    comp.judges.some((j) => j.id === me.id && j.kind === 'player'),
    'competition.judge',
    'Join the panel to score.',
  );
  ensure(Number.isInteger(score) && score >= 1 && score <= 10, 'competition.score', 'Score 1 to 10.');
  const e = comp.entries.find((x) => x.id === entryId);
  ensure(e, 'competition.entry', 'That pitch isn’t in the line-up.');
  e.scores[me.id] = score;
  const left = comp.entries.filter((x) => x.scores[me.id] === undefined).length;
  return {
    entryId: e.id,
    score,
    left,
    message: left ? `Scored. ${left} pitch${left === 1 ? '' : 'es'} left.` : 'All scored. Results at the end of the month.',
  };
}

// ---------------------------------------------------------------- Judging

/** An AI investor's score for a pitch: the company's numbers plus seeded noise (1–10). */
export function aiScore(world: World, comp: Competition, judge: CompetitionJudge, e: CompetitionEntry): number {
  const c = world.companies[e.companyId];
  if (!c) return 1;
  const founder = world.players[e.founderId];
  const growth = clamp01(0.5 + monthlyGrowth(c) * 2.5);
  const traction = clamp01(Math.log10(1 + totalCustomers(c)) / 4);
  const fund = judge.fundId ? world.funds[judge.fundId] : undefined;
  const fit = fund && (fund.sectors === 'any' || fund.sectors.includes(c.industry)) ? 0.05 : 0;
  const metric =
    0.25 * c.product.fit +
    0.2 * reliability(c) +
    0.2 * (c.stars.value / 5) +
    0.15 * growth +
    0.1 * traction +
    0.1 * ((founder?.skills.publicSpeaking ?? 30) / 100) +
    fit;
  const rng = deriveRng(world.seed, 'competition', comp.id, judge.id, e.id);
  return clamp(Math.round(1 + 9 * metric + rng.normal(0, 0.8)), 1, 10);
}

/** Judge every competition in this city whose month has ended. */
export function resolveCompetitions(world: World, marketId: MarketId, month: number) {
  for (const comp of Object.values(competitionsOf(world))) {
    if (comp.market !== marketId || comp.status !== 'open' || comp.month >= month) continue;
    judge(world, comp, month);
  }
}

function judge(world: World, comp: Competition, month: number) {
  const m = getMarket(world, comp.market);
  const fmt = (v: number) => formatMoney(v, m.data.currency);
  const refund = () => {
    const left = account(world, comp.account).balance;
    if (left > 0) transfer(world, comp.account, m.ext.lps, left, `Unawarded prize: ${comp.name}`, month);
  };
  if (!comp.entries.length) {
    comp.status = 'cancelled';
    refund();
    return;
  }
  for (const e of comp.entries) {
    for (const j of comp.judges) if (j.kind === 'ai') e.scores[j.id] = aiScore(world, comp, j, e);
    const all = Object.values(e.scores);
    e.total = all.length ? Math.round((all.reduce((a, b) => a + b, 0) / all.length) * 10) / 10 : 0;
  }
  const ranked = comp.entries
    .map((e, i) => ({ e, i }))
    .sort((a, b) => (b.e.total ?? 0) - (a.e.total ?? 0) || a.i - b.i)
    .map((x) => x.e);
  ranked.forEach((e, i) => (e.rank = i + 1));
  const winner = ranked[0]!;
  comp.winnerEntryId = winner.id;
  comp.status = 'judged';

  // Prizes: most to the winner, the rest to the runner-up.
  const shares =
    ranked.length > 1
      ? [comp.prizePool - Math.round(comp.prizePool * COMPETITION.runnerUpShare), Math.round(comp.prizePool * COMPETITION.runnerUpShare)]
      : [comp.prizePool];
  shares.forEach((amount, i) => {
    const e = ranked[i]!;
    const c = world.companies[e.companyId];
    if (!c || c.status !== 'active' || amount <= 0) return;
    pay(world, comp.account, c.account, amount, `${i === 0 ? 'Winner' : 'Runner-up'}: ${comp.name}`, month);
    e.prize = amount;
  });
  refund();

  // The winner: stars, press, and an investor who wants to meet them.
  const c = world.companies[winner.companyId];
  let interest: Competition['interest'] = null;
  if (c) {
    applyStarEvent(c.stars, COMPETITION.winnerStars);
    const best = comp.judges
      .filter((j) => j.kind === 'ai' && j.fundId && world.funds[j.fundId])
      .sort((a, b) => (winner.scores[b.id] ?? 0) - (winner.scores[a.id] ?? 0))[0];
    if (best?.fundId) {
      interest = { fundId: best.fundId, name: best.name };
      // Funds look at companies that are raising: the win puts this one on their list.
      if (c.status === 'active') c.raising = true;
    }
    for (const fid of c.founderIds) {
      const f = world.players[fid];
      if (!f) continue;
      if (!f.ai) {
        applyStarEvent(f.stars, COMPETITION.founderStars);
        achieve(world, f, 'founder.competition', 'Won a pitch competition', month);
        if (interest)
          addContact(
            f,
            {
              kind: 'fund',
              refId: interest.fundId,
              name: `${interest.name}, ${world.funds[interest.fundId]!.name}`,
              warmth: COMPETITION.interestWarmth,
            },
            month,
          );
      }
      notify(world, fid, {
        month,
        kind: 'milestone',
        text: `${c.name} won ${comp.name} (${winner.total}/10) and ${fmt(winner.prize ?? 0)}.${interest ? ` ${interest.name} wants to talk: a warm intro is waiting.` : ''}`,
        ref: { kind: 'company', id: c.id },
      });
    }
    const outlet = m.outlets.find((o) => o.type === 'tech') ?? m.outlets[0];
    if (outlet)
      publish(world, {
        market: m.id,
        month,
        outletId: outlet.id,
        outletName: outlet.name,
        kind: 'feature',
        alert: `${c.name} wins ${comp.name}`,
        headline: `${c.name} takes the ${comp.name} crown`,
        body: `${c.name} beat ${ranked.length - 1} other startup${ranked.length === 2 ? '' : 's'} at ${comp.venue.name}, scoring ${winner.total} out of 10 from ${comp.judges.length} judges, and wins ${fmt(winner.prize ?? 0)}.`,
        starDelta: COMPETITION.winnerStars,
        verified: true,
        subject: { kind: 'company', id: c.id },
      });
  }
  comp.interest = interest;

  // Everyone else hears how they did; human judges meet the founders.
  for (const e of ranked.slice(1)) {
    const f = world.players[e.founderId];
    const co = world.companies[e.companyId];
    if (f && !f.ai && co)
      notify(world, f.id, {
        month,
        kind: 'pitch',
        text: `${comp.name}: ${co.name} came ${ordinal(e.rank!)} of ${ranked.length} (${e.total}/10)${e.prize ? `, and wins ${fmt(e.prize)} as runner-up` : ''}.`,
        ref: { kind: 'company', id: co.id },
      });
  }
  for (const j of comp.judges) {
    if (j.kind !== 'player') continue;
    const p = world.players[j.id];
    if (!p) continue;
    p.network = Math.min(100, p.network + 1);
    for (const e of comp.entries) {
      const f = world.players[e.founderId];
      if (!f || f.ai || f.id === p.id) continue;
      addContact(p, { kind: 'player', refId: f.id, name: f.name, warmth: COMPETITION.judgeWarmth }, month);
      addContact(f, { kind: 'player', refId: p.id, name: p.name, warmth: COMPETITION.judgeWarmth }, month);
    }
    notify(world, p.id, {
      month,
      kind: 'system',
      text: `${comp.name} results are in: ${c?.name ?? 'the winner'} won.`,
    });
  }
}

const ordinal = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
};

// ---------------------------------------------------------------- Views

/** `market.competitions` / `here.competitions`: this month's and recent competitions. */
export function competitionsView(world: World, viewer: Player, m: MarketState) {
  const list = Object.values(competitionsOf(world))
    .filter(
      (c) =>
        c.market === m.id &&
        (c.status === 'open' || m.month - c.month <= COMPETITION.recentMonths),
    )
    .sort((a, b) => b.month - a.month);
  return {
    /** The next month a competition opens here (this month when one is on). */
    nextMonth: nextCompetitionMonth(m.id, m.month),
    frequency: m.id === 'san-francisco' ? 'monthly' : 'quarterly',
    list: list.map((comp) => {
      const revealed = comp.status !== 'open';
      const judging = comp.judges.some((j) => j.id === viewer.id);
      const enterReason = enterBlocker(world, viewer, comp);
      const judgeReason = judging ? null : judgeBlocker(world, viewer, comp);
      const winner = comp.winnerEntryId
        ? comp.entries.find((e) => e.id === comp.winnerEntryId)
        : undefined;
      const mine = comp.entries.find((e) =>
        world.companies[e.companyId]?.founderIds.includes(viewer.id),
      );
      return {
        id: comp.id,
        name: comp.name,
        market: comp.market,
        month: comp.month,
        dateLabel: gameDate(comp.month).label,
        status: comp.status,
        sponsor: comp.sponsor,
        venue: { ...comp.venue, districtLabel: districtLabel(comp.venue.district) },
        prizePool: comp.prizePool,
        currency: m.data.currency,
        judges: comp.judges.map((j) => ({
          id: j.id,
          kind: j.kind,
          name: j.name,
          org: j.org,
          you: j.id === viewer.id,
        })),
        entries: comp.entries.map((e) => {
          const c = world.companies[e.companyId];
          const f = world.players[e.founderId];
          return {
            id: e.id,
            companyId: e.companyId,
            companyName: c?.name ?? '',
            industry: c?.industry ?? null,
            idea: c?.idea ?? '',
            stars: c ? Math.round(c.stars.value * 10) / 10 : 0,
            founder: { id: e.founderId, name: f?.name ?? '' },
            ai: e.ai,
            you: !!c?.founderIds.includes(viewer.id),
            /** Every judge's score, revealed after the result (judge order). */
            scores: revealed
              ? comp.judges.map((j) => ({ judgeId: j.id, score: e.scores[j.id] ?? null }))
              : null,
            /** Your own score as a judge (before the result too). */
            myScore: e.scores[viewer.id] ?? null,
            total: revealed ? (e.total ?? null) : null,
            rank: revealed ? (e.rank ?? null) : null,
            prize: revealed ? (e.prize ?? 0) : null,
          };
        }),
        winner: winner
          ? {
              entryId: winner.id,
              companyId: winner.companyId,
              companyName: world.companies[winner.companyId]?.name ?? '',
              total: winner.total ?? 0,
            }
          : null,
        interest: comp.interest ?? null,
        you: {
          entryId: mine?.id ?? null,
          judging,
          canEnter: enterReason === null,
          enterReason,
          canJudge: judgeReason === null,
          judgeReason: judging ? null : judgeReason,
          /** As a judge: pitches you still have to score. */
          toScore: judging && !revealed ? comp.entries.filter((e) => e.scores[viewer.id] === undefined).length : 0,
        },
      };
    }),
  };
}

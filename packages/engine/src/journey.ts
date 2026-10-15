/**
 * The founder journey (blueprint §2.1, §9.2): seven chapters derived from
 * the world as it is, plus the three-prompt objective tracker.
 *
 * Pure derivation: no command is needed to make progress. Steps complete as
 * the company does real things (customers, hires, funding, exits), so a
 * player already mid-game sees their chapters at once. Chapters are guidance,
 * not gates: the current chapter is the first unfinished one, but a later
 * chapter can finish early.
 *
 * The only state kept is small and optional: `Player.journey` (pinned and
 * dismissed prompts, the bootstrap choice) and a `founder.chapter-N`
 * milestone when a chapter completes. Recording a chapter never takes an id
 * from the world counter, rolls dice or moves money, so replaying an old
 * command log reaches the same world (plus the new milestones).
 */
import { companyRunway } from './company.js';
import { getMarket, lastPnl, totalCustomers, INBOX_LIMIT } from './helpers.js';
import type { Currency } from './money.js';
import type { Company, Id, Player, World } from './types.js';
import { STAGES } from './types.js';

/** Every threshold in one place (money in US dollars a month, converted per city). */
export const JOURNEY = {
  hustle: { customers: 3 },
  team: { customers: 10, revenueUsd: 500 },
  fundraising: { runwayMonths: 6 },
  growth: { revenueUsd: 10_000, staff: 5 },
  /** The Empire: any two of second city, acquisition, Series A, a board. */
  empire: { need: 2 },
  exit: { valuationUsd: 5_000_000 },
  /** Dismissed prompts remembered per kind (oldest forgotten first). */
  maxDismissed: 30,
} as const;

export const OBJECTIVE_KINDS = ['main', 'opportunity', 'personal'] as const;
export type ObjectiveKind = (typeof OBJECTIVE_KINDS)[number];

/** Where a step's Go button takes you: a city place id, a bottom tab or a phone app. */
export type JourneyGo =
  | { kind: 'place'; place: string }
  | {
      kind: 'tab';
      tab: 'company' | 'money' | 'me' | 'portfolio' | 'deals';
      /** A section of that tab (the Company tab's Team, say). */
      section?: 'team' | 'roadmap';
    }
  | { kind: 'app'; app: string };

export interface JourneyStep {
  /** `<chapter>.<step>`, stable: the client keys its copy on it. */
  id: string;
  /** English label (the client has its own translated copy, keyed on `id`). */
  label: string;
  done: boolean;
  /** Not needed to finish the chapter (the Empire and Exit offer several ways). */
  optional?: boolean;
  /** `currency` set: amounts in minor units of that currency. */
  progress?: { have: number; need: number; currency?: Currency };
  go: JourneyGo | null;
}

export interface JourneyChapter {
  n: number;
  id: string;
  title: string;
  story: string;
  status: 'done' | 'current' | 'upcoming';
  /** Home-city month it was recorded complete, or null. */
  doneMonth: number | null;
  /** Steps needed to finish (the rest are optional). */
  need: number;
  steps: JourneyStep[];
}

export interface JourneyView {
  /** The current chapter's number (8 when all seven are done). */
  current: number;
  chapters: JourneyChapter[];
  /** Main-objective candidates, best first: unfinished steps from the current chapter on. */
  main: (JourneyStep & { chapter: number })[];
  pinned: Partial<Record<ObjectiveKind, string>>;
  dismissed: Partial<Record<ObjectiveKind, string[]>>;
  /** Chosen to bootstrap (home-city month), or null. */
  bootstrap: number | null;
}

export const chapterMilestone = (n: number) => `founder.chapter-${n}`;

/** Founders (and players who have founded a company) get a journey; others don't. */
export function hasJourney(p: Player): boolean {
  return !p.ai && (p.role === 'founder' || p.companyIds.length > 0);
}

// ---------------------------------------------------------------- facts

interface Facts {
  companies: Company[];
  active: Company[];
  /** The company the journey talks about: the first active one, else the latest. */
  main: Company | null;
  ms: Record<string, number>;
}

function factsOf(world: World, p: Player): Facts {
  const companies = p.companyIds.map((id) => world.companies[id]).filter((c): c is Company => !!c);
  const active = companies.filter((c) => c.status === 'active');
  return {
    companies,
    active,
    main: active[0] ?? companies[companies.length - 1] ?? null,
    ms: p.milestones,
  };
}

const usdIn = (world: World, c: Company, usd: number) =>
  Math.round(usd * 100 * getMarket(world, c.market).data.unitsPerUsd);
const currencyOf = (world: World, c: Company) => getMarket(world, c.market).data.currency;
const revenueOf = (c: Company) => lastPnl(c)?.revenue ?? 0;

/** Progress toward a monthly revenue goal, on the company closest to it. */
function revenueProgress(world: World, f: Facts, usd: number) {
  const list = f.active.length ? f.active : f.main ? [f.main] : [];
  let best: { have: number; need: number; currency: Currency } | null = null;
  for (const c of list) {
    const need = usdIn(world, c, usd);
    const have = c.status === 'active' ? revenueOf(c) : 0;
    if (!best || have / need > best.have / best.need)
      best = { have, need, currency: currencyOf(world, c) };
  }
  return best;
}

const maxOver = (cs: Company[], f: (c: Company) => number) =>
  cs.reduce((a, c) => Math.max(a, f(c)), 0);

/** Every way a company of yours has been funded from outside (or chosen not to be). */
export function fundingSources(world: World, p: Player): string[] {
  const out = new Set<string>();
  const mine = new Set(p.companyIds);
  for (const id of p.companyIds) {
    const c = world.companies[id];
    if (!c) continue;
    const outsiders = Object.entries(c.capTable.holdings).some(
      ([h, x]) =>
        (x.kind === 'investor' || x.kind === 'safe-converted') && !c.founderIds.includes(h),
    );
    if (outsiders || c.capTable.safes.length > 0 || c.capTable.roundsRaised > 0) out.add('equity');
    if (c.finance.loans.length > 0) out.add('loan');
    if (c.accelerator) out.add('accelerator');
    // Chapter 3 (§7.3): founder money classified as equity is a funding choice.
    if (Object.keys(c.founderEquity ?? {}).length > 0) out.add('founder');
  }
  for (const r of Object.values(world.ffRounds ?? {}))
    if (r.status === 'closed' && mine.has(r.companyId)) out.add('friends');
  for (const a of Object.values(world.applications ?? {}))
    if (a.kind === 'grant' && a.status === 'accepted' && a.companyId && mine.has(a.companyId))
      out.add('grant');
  if (p.milestones['founder.first-raise'] !== undefined) out.add('equity');
  if (p.milestones['founder.competition'] !== undefined) out.add('competition');
  return [...out].sort();
}

/** Has this founder put their company in front of anyone with money? */
function hasPitched(world: World, p: Player): boolean {
  if (Object.values(world.pitches).some((x) => x.founderId === p.id)) return true;
  if (Object.values(world.ffRounds ?? {}).some((r) => r.founderId === p.id)) return true;
  if (Object.values(world.applications ?? {}).some((a) => a.playerId === p.id && a.companyId))
    return true;
  return Object.values(world.competitions ?? {}).some((c) =>
    c.entries.some((e) => e.founderId === p.id),
  );
}

function secondCity(world: World, f: Facts): boolean {
  const markets = new Set(f.active.map((c) => c.market));
  if (markets.size > 1) return true;
  const ids = new Set(f.active.map((c) => c.id));
  for (const b of Object.values(world.branches ?? {}))
    if (b.status === 'open' && ids.has(b.companyId)) {
      const home = world.companies[b.companyId]!.market;
      if (b.market !== home) return true;
    }
  // A subsidiary in another city (bought across markets).
  return Object.values(world.companies).some(
    (c) => c.status === 'active' && c.parentId && ids.has(c.parentId) && !markets.has(c.market),
  );
}

function hadOffer(world: World, p: Player): boolean {
  const mine = new Set(p.companyIds);
  return Object.values(world.deals).some(
    (d) => d.terms.kind === 'acquisition' && d.companyId !== null && mine.has(d.companyId),
  );
}

function exited(p: Player, f: Facts): boolean {
  return (
    p.milestones['founder.exit'] !== undefined ||
    f.companies.some((c) => c.status === 'acquired' && c.founderIds.includes(p.id))
  );
}

/** Founder Journey 5: an exit, a secondary sale or a listing. */
function cashedOut(p: Player, f: Facts): boolean {
  return (
    exited(p, f) ||
    p.milestones['founder.secondary'] !== undefined ||
    p.milestones['founder.ipo'] !== undefined
  );
}

function mentored(world: World, p: Player): boolean {
  return Object.values(world.mentorships ?? {}).some(
    (x) => x.mentorId === p.id && (x.status === 'active' || x.status === 'ended'),
  );
}

const go = { capital: { kind: 'app', app: 'capital' } as JourneyGo };

function invested(world: World, p: Player): boolean {
  if (p.milestones['investor.first-check'] !== undefined) return true;
  const holders = new Set([p.id, ...(p.investor?.fundId ? [p.investor.fundId] : [])]);
  return Object.values(world.positions).some((x) => holders.has(x.investorId));
}

// ---------------------------------------------------------------- chapters

interface ChapterDef {
  id: string;
  title: string;
  story: string;
  /** Steps needed (default: every step not marked optional). */
  need?: number;
  steps: (world: World, p: Player, f: Facts) => JourneyStep[];
}

const step = (
  id: string,
  label: string,
  done: boolean,
  go: JourneyGo | null,
  extra: Partial<JourneyStep> = {},
): JourneyStep => ({ id, label, done, go, ...extra });

const count = (have: number, need: number) => ({ have: Math.min(have, need), need });

export const CHAPTERS: ChapterDef[] = [
  {
    id: 'hustle',
    title: 'The Hustle',
    story: 'Validate a problem and win your first customer.',
    steps: (_world, _p, f) => {
      const customers = maxOver(f.active, totalCustomers);
      const discovered = f.companies.some((c) =>
        Object.values(c.product.discovery).some((v) => v > 0),
      );
      // Founder Journey 6: a company started from a café idea counts its first
      // customer from the pipeline (the guided first sale), not the welcome one.
      const guided = f.main?.starterIdea !== undefined;
      const first = guided
        ? f.companies.some((c) => (c.salesAccounts?.length ?? 0) > 0) ||
          f.ms['founder.first-customer'] !== undefined
        : customers > 0 || f.ms['founder.first-customer'] !== undefined;
      const n = JOURNEY.hustle.customers;
      return [
        step('hustle.company', 'Start your company', f.companies.length > 0, {
          kind: 'tab',
          tab: 'company',
        }),
        step('hustle.discovery', 'Talk to customers about their problem', discovered, {
          kind: 'place',
          place: 'market',
        }),
        // Founder Journey 2a: the sales pipeline is where a first customer is won.
        step('hustle.first-customer', 'Win your first paying customer', first, {
          kind: 'app',
          app: 'sales',
        }),
        step(
          'hustle.customers',
          `Reach ${n} paying customers`,
          customers >= n,
          { kind: 'place', place: 'market' },
          { progress: count(customers, n) },
        ),
      ];
    },
  },
  {
    id: 'team',
    title: 'The First Team',
    story: 'Stop doing everything yourself: bring people in.',
    steps: (world, _p, f) => {
      const hired =
        f.ms['founder.first-hire'] !== undefined ||
        f.companies.some((c) => c.staff.length > 0 || c.founderIds.length > 1);
      const customers = maxOver(f.active, totalCustomers);
      const n = JOURNEY.team.customers;
      const rev = revenueProgress(world, f, JOURNEY.team.revenueUsd);
      const interviewed = f.companies.some((c) =>
        (c.hiring?.candidates ?? []).some((x) => x.interviews.length > 0),
      );
      const team = { kind: 'tab', tab: 'company', section: 'team' } as const;
      return [
        step('team.hire', 'Make your first hire or bring in a co-founder', hired, team),
        step(
          'team.interview',
          'Interview a candidate before you hire',
          interviewed || hired,
          team,
          {
            optional: true,
          },
        ),
        step(
          'team.customers',
          `Reach ${n} paying customers`,
          customers >= n,
          { kind: 'place', place: 'market' },
          { progress: count(customers, n) },
        ),
        step(
          'team.revenue',
          'Earn your first steady monthly revenue',
          !!rev && rev.have >= rev.need,
          { kind: 'tab', tab: 'company' },
          rev ? { progress: { ...rev, have: Math.min(rev.have, rev.need) } } : {},
        ),
      ];
    },
  },
  {
    id: 'fundraising',
    title: 'The Fundraising Game',
    story: 'Choose how to fund the company: bootstrap, borrow, win or raise.',
    steps: (world, p, f) => {
      const boot = p.journey?.bootstrap !== undefined;
      const funded = fundingSources(world, p).length > 0;
      const months = JOURNEY.fundraising.runwayMonths;
      const runway = Math.max(0, ...f.active.map((c) => companyRunway(world, c)));
      const safe =
        f.ms['founder.profitable'] !== undefined || (f.active.length > 0 && runway >= months);
      return [
        step(
          'fundraising.pitch',
          'Pitch an investor, an accelerator, a grant or a competition',
          boot || funded || hasPitched(world, p),
          { kind: 'place', place: 'investors' },
        ),
        step('fundraising.funding', 'Get funded, or choose to bootstrap', boot || funded, {
          kind: 'place',
          place: 'investors',
        }),
        step(
          'fundraising.runway',
          `Have ${months}+ months of runway, or turn a profit`,
          safe,
          { kind: 'tab', tab: 'money' },
          f.active.length && Number.isFinite(runway)
            ? { progress: count(Math.floor(runway), months) }
            : {},
        ),
      ];
    },
  },
  {
    id: 'growth',
    title: 'The Growth Trap',
    story: 'Scale up without letting burn and churn sink you.',
    steps: (world, _p, f) => {
      const rev = revenueProgress(world, f, JOURNEY.growth.revenueUsd);
      const staff = maxOver(f.active, (c) => c.staff.length);
      const n = JOURNEY.growth.staff;
      const profitable =
        f.ms['founder.profitable'] !== undefined ||
        f.active.some((c) => (lastPnl(c)?.net ?? 0) > 0 && revenueOf(c) > 0);
      return [
        step(
          'growth.revenue',
          'Grow monthly revenue',
          !!rev && rev.have >= rev.need,
          { kind: 'tab', tab: 'company' },
          rev ? { progress: { ...rev, have: Math.min(rev.have, rev.need) } } : {},
        ),
        step(
          'growth.team',
          `Build a team of ${n}`,
          staff >= n,
          { kind: 'place', place: 'hub' },
          { progress: count(staff, n) },
        ),
        step('growth.profit', 'Have a profitable month', profitable, {
          kind: 'tab',
          tab: 'company',
        }),
      ];
    },
  },
  {
    id: 'empire',
    title: 'The Empire',
    story: 'Compete and expand: new cities, acquisitions, a real board.',
    need: JOURNEY.empire.need,
    steps: (world, _p, f) => {
      const seriesA =
        f.ms['founder.series-a'] !== undefined ||
        f.companies.some(
          (c) => c.lastRound !== null && STAGES.indexOf(c.lastRound) >= STAGES.indexOf('series-a'),
        );
      return [
        step(
          'empire.city',
          'Open in a second city',
          secondCity(world, f),
          { kind: 'tab', tab: 'company' },
          { optional: true },
        ),
        step(
          'empire.acquire',
          'Buy another company',
          f.ms['founder.first-acquisition'] !== undefined,
          { kind: 'place', place: 'bank' },
          { optional: true },
        ),
        step(
          'empire.series-a',
          'Raise a Series A',
          seriesA,
          { kind: 'place', place: 'investors' },
          { optional: true },
        ),
        step(
          'empire.board',
          'Have an investor on your board',
          f.companies.some((c) => c.board.length > 0),
          { kind: 'tab', tab: 'company' },
          { optional: true },
        ),
      ];
    },
  },
  {
    id: 'exit',
    title: 'The Exit',
    story: 'Turn what you built into money in your pocket.',
    steps: (world, p, f) => {
      const value = f.main ? usdIn(world, f.main, JOURNEY.exit.valuationUsd) : 0;
      const post = f.main ? f.main.capTable.lastPostMoney : 0;
      return [
        step(
          'exit.valuation',
          'Reach a valuation worth selling',
          f.companies.some(
            (c) => c.capTable.lastPostMoney >= usdIn(world, c, JOURNEY.exit.valuationUsd),
          ),
          { kind: 'place', place: 'investors' },
          {
            optional: true,
            ...(f.main
              ? {
                  progress: {
                    have: Math.min(post, value),
                    need: value,
                    currency: currencyOf(world, f.main),
                  },
                }
              : {}),
          },
        ),
        step(
          'exit.offer',
          'Get an offer for your company',
          hadOffer(world, p),
          { kind: 'tab', tab: 'money' },
          { optional: true },
        ),
        // Founder Journey 5: a secondary sale or a listing also turns value into money.
        step(
          'exit.secondary',
          'Sell some of your shares in a secondary',
          p.milestones['founder.secondary'] !== undefined,
          { kind: 'app', app: 'capital' },
          { optional: true },
        ),
        step(
          'exit.ipo',
          'Get ready for the stock market, or list',
          f.companies.some((c) => !!c.ipo),
          { kind: 'app', app: 'capital' },
          { optional: true },
        ),
        step(
          'exit.sell',
          'Sell your company',
          exited(p, f),
          { kind: 'tab', tab: 'money' },
          { optional: true },
        ),
        step(
          'exit.cash',
          'Turn your shares into cash: a sale, a secondary or an IPO',
          cashedOut(p, f),
          {
            kind: 'app',
            app: 'capital',
          },
        ),
      ];
    },
  },
  {
    id: 'allocator',
    title: 'The Capital Allocator',
    story: 'Back the next founders: invest, mentor, build a legacy.',
    steps: (world, p) => [
      step(
        'allocator.investor',
        'Become an investor',
        p.role === 'investor' || !!p.investor,
        { kind: 'tab', tab: 'me' },
        { optional: true },
      ),
      step(
        'allocator.invest',
        'Invest in a startup',
        invested(world, p),
        { kind: 'app', app: 'invest' },
        { optional: true },
      ),
      step(
        'allocator.fund',
        'Raise a fund',
        p.milestones['investor.fund-1'] !== undefined,
        { kind: 'app', app: 'invest' },
        { optional: true },
      ),
      // Founder Journey 5: the other ways to put money and experience to work.
      step('allocator.mentor', 'Mentor a startup', mentored(world, p), go.capital, {
        optional: true,
      }),
      step(
        'allocator.give',
        'Give to a cause',
        (p.allocator?.pledges?.length ?? 0) > 0,
        go.capital,
        { optional: true },
      ),
      step(
        'allocator.career',
        'Take a senior role at a DFI or a bank',
        !!p.allocator?.career ||
          p.milestones['allocator.career-dfi'] !== undefined ||
          p.milestones['allocator.career-bank'] !== undefined,
        go.capital,
        { optional: true },
      ),
      step(
        'allocator.serial',
        'Start a new company as a serial founder',
        p.allocator?.serial !== undefined,
        go.capital,
        { optional: true },
      ),
      step(
        'allocator.path',
        'Choose your path: invest, mentor, give, lead an institution or found again',
        invested(world, p) ||
          mentored(world, p) ||
          (p.allocator?.pledges?.length ?? 0) > 0 ||
          p.milestones['allocator.career-dfi'] !== undefined ||
          p.milestones['allocator.career-bank'] !== undefined ||
          p.allocator?.serial !== undefined,
        go.capital,
      ),
    ],
  },
];

/** A chapter's steps are all there (or, with `need`, enough of them). */
function complete(def: ChapterDef, steps: JourneyStep[]): boolean {
  if (def.need !== undefined) return steps.filter((s) => s.done).length >= def.need;
  return steps.filter((s) => !s.optional).every((s) => s.done);
}

/** The seven chapters for this player right now (without the stored prompts). */
export function deriveChapters(world: World, p: Player): JourneyChapter[] {
  const f = factsOf(world, p);
  const chapters = CHAPTERS.map((def, i): JourneyChapter => {
    const n = i + 1;
    const recorded = p.milestones[chapterMilestone(n)];
    let steps = def.steps(world, p, f);
    const finished = recorded !== undefined || complete(def, steps);
    // Once a chapter is recorded, its needed steps stay ticked (revenue can dip).
    if (recorded !== undefined && def.need === undefined)
      steps = steps.map((s) => (s.optional || s.done ? s : { ...s, done: true }));
    return {
      n,
      id: def.id,
      title: def.title,
      story: def.story,
      status: finished ? 'done' : 'upcoming',
      doneMonth: recorded ?? null,
      need: def.need ?? steps.filter((s) => !s.optional).length,
      steps,
    };
  });
  const cur = chapters.find((c) => c.status !== 'done');
  if (cur) cur.status = 'current';
  return chapters;
}

export function journeyView(world: World, p: Player): JourneyView | null {
  if (!hasJourney(p)) return null;
  const chapters = deriveChapters(world, p);
  const cur = chapters.find((c) => c.status === 'current');
  const main = chapters
    .filter((c) => c.status !== 'done')
    .flatMap((c) =>
      // Needed steps first, then the optional ones.
      [...c.steps.filter((s) => !s.optional), ...c.steps.filter((s) => s.optional)]
        .filter((s) => !s.done)
        .map((s) => ({ ...s, chapter: c.n })),
    );
  return {
    current: cur?.n ?? chapters.length + 1,
    chapters,
    main,
    pinned: { ...(p.journey?.pinned ?? {}) },
    dismissed: { ...(p.journey?.dismissed ?? {}) },
    bootstrap: p.journey?.bootstrap ?? null,
  };
}

/**
 * The prompt to show for one kind: the pinned one while it's still a
 * candidate, else the first candidate not dismissed. Shared by the client.
 */
export function pickObjective<T extends { id: string }>(
  candidates: readonly T[],
  pinned: string | undefined,
  dismissed: readonly string[] | undefined,
): T | null {
  if (pinned) {
    const p = candidates.find((c) => c.id === pinned);
    if (p) return p;
  }
  const gone = new Set(dismissed ?? []);
  return candidates.find((c) => !gone.has(c.id)) ?? null;
}

// ---------------------------------------------------------------- state

/** Pin a prompt (`id` missing: unpin that kind). */
export function pinObjective(p: Player, kind: ObjectiveKind, id: string | undefined) {
  const j = (p.journey ??= {});
  const pinned = (j.pinned ??= {});
  if (id === undefined) delete pinned[kind];
  else {
    pinned[kind] = id;
    // Pinning something brings it back if it was dismissed.
    const list = j.dismissed?.[kind];
    if (list) j.dismissed![kind] = list.filter((x) => x !== id);
  }
  return { pinned: pinned[kind] ?? null };
}

/** Dismiss a prompt: the next candidate takes its place. `undo` brings it back. */
export function dismissObjective(p: Player, kind: ObjectiveKind, id: string, undo = false) {
  const j = (p.journey ??= {});
  const dismissed = (j.dismissed ??= {});
  const list = (dismissed[kind] ?? []).filter((x) => x !== id);
  if (!undo) {
    list.push(id);
    if (j.pinned?.[kind] === id) delete j.pinned[kind];
  }
  dismissed[kind] = list.slice(-JOURNEY.maxDismissed);
  return { dismissed: dismissed[kind].length };
}

/** Choose (or stop choosing) to bootstrap: it counts as a funding choice in chapter 3. */
export function chooseBootstrap(p: Player, on: boolean, month: number) {
  const j = (p.journey ??= {});
  if (on) j.bootstrap ??= month;
  else delete j.bootstrap;
  return { bootstrap: j.bootstrap ?? null };
}

/**
 * Record chapters just completed as `founder.chapter-N` milestones, with one
 * inbox note each. Called after every command (for the player who issued it)
 * and after a settlement (for every founder). Takes no world id, no dice and
 * no money, so it can't change how any other command plays out.
 */
export function recordChapters(world: World, p: Player): number[] {
  if (!hasJourney(p)) return [];
  const month = getMarket(world, p.market).month;
  const chapters = deriveChapters(world, p);
  const fresh = chapters.filter(
    (c) => c.status === 'done' && p.milestones[chapterMilestone(c.n)] === undefined,
  );
  if (!fresh.length) return [];
  const list = (world.inbox[p.id] ??= []);
  for (const c of fresh) {
    p.milestones[chapterMilestone(c.n)] = month;
    const next = chapters.find((x) => x.status !== 'done');
    list.unshift({
      // A fixed id per chapter: the world's id counter is left alone.
      id: `in_journey_${c.n}` as Id,
      month,
      kind: 'milestone',
      text: next
        ? `Chapter ${c.n} complete: ${c.title}. Next: ${next.title}.`
        : `Chapter ${c.n} complete: ${c.title}. Every chapter of your journey is done.`,
      read: false,
    });
  }
  if (list.length > INBOX_LIMIT) list.length = INBOX_LIMIT;
  return fresh.map((c) => c.n);
}

/** After a settlement: every human founder in that market (or with a company there). */
export function recordChaptersAfterSettle(world: World, market: string) {
  for (const p of Object.values(world.players)) {
    if (!hasJourney(p)) continue;
    const here =
      p.market === market || p.companyIds.some((id) => world.companies[id]?.market === market);
    if (here) recordChapters(world, p);
  }
}

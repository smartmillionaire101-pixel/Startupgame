/**
 * The founder journey on the client (blueprint §2.1, §9.2): the copy for
 * each chapter and step, and the three objective prompts (main, opportunity,
 * personal). The engine derives the chapters (`view.journey`); the
 * opportunity and personal prompts reuse what "What to do now" knows.
 * Pure apart from t(): the sheet and the tests share it.
 */
import { pickObjective, skyViewsIn, type ObjectiveKind, type PlayerView } from '@runway/engine';
import { money } from '../format';
import { t, tx } from '../i18n';
import { businessesOf } from './contract';
import { homeOf, venueItemsOf } from './life';
import { suggestionsFor } from './whatnow';
import { suggestionText } from './WhatNowCards';

export type Journey = NonNullable<PlayerView['journey']>;
type JourneyChapterView = Journey['chapters'][number];
export type JourneyStepView = JourneyChapterView['steps'][number];

/** Where a Go button takes you. `sky`: a sky view (the Sky views scene). */
export type JourneyGo = NonNullable<JourneyStepView['go']> | { kind: 'sky'; id: string };

/** The journey, or null (other roles, or a server without it yet). */
export const journeyOf = (view: PlayerView): Journey | null =>
  (view as { journey?: Journey | null }).journey ?? null;

export function chapterCopy(id: string): { title: string; story: string } {
  switch (id) {
    case 'hustle':
      return {
        title: t('The Hustle'),
        story: t('Validate a problem and win your first customer.'),
      };
    case 'team':
      return {
        title: t('The First Team'),
        story: t('Stop doing everything yourself: bring people in.'),
      };
    case 'fundraising':
      return {
        title: t('The Fundraising Game'),
        story: t('Choose how to fund the company: bootstrap, borrow, win or raise.'),
      };
    case 'growth':
      return {
        title: t('The Growth Trap'),
        story: t('Scale up without letting spending and lost customers sink you.'),
      };
    case 'empire':
      return {
        title: t('The Empire'),
        story: t('Compete and expand: new cities, acquisitions, a real board.'),
      };
    case 'exit':
      return {
        title: t('The Exit'),
        story: t('Turn what you built into money in your pocket.'),
      };
    case 'allocator':
      return {
        title: t('The Capital Allocator'),
        story: t('Back the next founders: invest, mentor, build a legacy.'),
      };
    // The investor journey.
    case 'first-cheque':
      return {
        title: t('The First Cheque'),
        story: t('Find a startup you believe in and back it.'),
      };
    case 'track-record':
      return {
        title: t('The Track Record'),
        story: t('Help your companies grow and widen what you own.'),
      };
    case 'fund':
      return {
        title: t('Fund I'),
        story: t('Invest other people’s money: fees and carry, and investors who expect returns.'),
      };
    case 'firm':
      return {
        title: t('The Firm'),
        story: t('Lead syndicates, back other managers and build a firm that outlasts you.'),
      };
    case 'legacy':
      return {
        title: t('The Legacy'),
        story: t('Put your money and experience to work beyond your own returns.'),
      };
    // The banker journey.
    case 'licence':
      return {
        title: t('The Licence'),
        story: t('Raise the capital, convince the regulator and get your banking licence.'),
      };
    case 'open':
      return {
        title: t('Open for Business'),
        story: t('Win depositors and price your bank.'),
      };
    case 'loans':
      return {
        title: t('First Loans'),
        story: t('Lend carefully and turn a profit.'),
      };
    case 'trusted':
      return {
        title: t('A Trusted Bank'),
        story: t('Earn the trust of customers and the regulator.'),
      };
    case 'group':
      return {
        title: t('Banking Group'),
        story: t('Build a bank that matters: capital, reputation and a voice in the city.'),
      };
    default:
      return { title: id, story: '' };
  }
}

/** A step's label and a plain line on how to do it. */
export function stepCopy(s: Pick<JourneyStepView, 'id' | 'label' | 'progress'>): {
  label: string;
  why: string;
} {
  const need = s.progress?.need ?? 0;
  switch (s.id) {
    case 'hustle.company':
      return {
        label: t('Start your company'),
        why: t('Pick an idea, a name and how you’ll charge'),
      };
    case 'hustle.discovery':
      return {
        label: t('Talk to customers about their problem'),
        why: t('At the Market: interviews show what they’d pay for'),
      };
    case 'hustle.first-customer':
      return {
        label: t('Win your first paying customer'),
        why: t('Find leads in your Sales pipeline and close a deal'),
      };
    case 'hustle.customers':
      return {
        label: t('Reach {n} paying customers', { n: need }),
        why: t('Keep selling: each one proves the idea'),
      };
    case 'team.hire':
      return {
        label: t('Make your first hire or bring in a co-founder'),
        why: t('On the Team screen: post a role, or choose a co-founder'),
      };
    case 'team.interview':
      return {
        label: t('Interview a candidate before you hire'),
        why: t('Interviews show true skill and fit before you commit'),
      };
    case 'team.customers':
      return {
        label: t('Reach {n} paying customers', { n: need }),
        why: t('Marketing, outreach and word of mouth'),
      };
    case 'team.revenue':
      return {
        label: t('Earn your first steady monthly revenue'),
        why: t('Set your price and grow customers on the Company tab'),
      };
    case 'fundraising.pitch':
      return {
        label: t('Pitch an investor, an accelerator, a grant or a competition'),
        why: t('The Investor Quarter, angels at cafés, the Events app'),
      };
    case 'fundraising.funding':
      return {
        label: t('Get funded, or choose to bootstrap'),
        why: t('Equity, a loan, a grant, an accelerator or a prize all count'),
      };
    case 'fundraising.runway':
      return {
        label: t('Have enough money for {n}+ months, or turn a profit', { n: need }),
        why: t('Cash divided by what you spend each month: see it on the Money screen'),
      };
    case 'growth.revenue':
      return {
        label: t('Grow monthly revenue'),
        why: t('More customers, better pricing, local business deals'),
      };
    case 'growth.team':
      return {
        label: t('Build a team of {n}', { n: need }),
        why: t('Hire at the Hub; mind the payroll'),
      };
    case 'growth.profit':
      return {
        label: t('Have a profitable month'),
        why: t('Revenue above all costs: you earn more than you spend'),
      };
    case 'empire.city':
      return {
        label: t('Open in a second city'),
        why: t('Open a branch from the Company tab'),
      };
    case 'empire.acquire':
      return { label: t('Buy another company'), why: t('Make an offer to a rival') };
    case 'empire.series-a':
      return { label: t('Raise a Series A'), why: t('Pitch the funds with real traction') };
    case 'empire.board':
      return {
        label: t('Have an investor on your board'),
        why: t('Negotiated with a round: governance grows up'),
      };
    case 'exit.valuation':
      return {
        label: t('Reach a valuation worth selling'),
        why: t('Set by your last priced round'),
      };
    case 'exit.offer':
      return {
        label: t('Get an offer for your company'),
        why: t('Buyers find growing companies; deals land on the Money tab'),
      };
    case 'exit.sell':
      return {
        label: t('Sell your company'),
        why: t('Accept an acquisition offer: the cap table pays out'),
      };
    case 'allocator.investor':
      return {
        label: t('Become an investor'),
        why: t('From your profile, with a year of savings'),
      };
    case 'allocator.invest':
      return { label: t('Invest in a startup'), why: t('Back a founder from the Invest app') };
    case 'allocator.fund':
      return { label: t('Raise a fund'), why: t('Pitch LPs and invest their money') };
    case 'exit.secondary':
      return {
        label: t('Sell some of your shares in a secondary'),
        why: t('Keep the company, take some money off the table: Capital app'),
      };
    case 'exit.ipo':
      return {
        label: t('Get ready for the stock market, or list'),
        why: t('Revenue, growth, a board and a year of books: Capital app'),
      };
    case 'exit.cash':
      return {
        label: t('Turn your shares into cash: a sale, a secondary or an IPO'),
        why: t('A high valuation is not money until you sell'),
      };
    case 'allocator.mentor':
      return {
        label: t('Mentor a startup'),
        why: t('Monthly advice for a small advisor stake'),
      };
    case 'allocator.give':
      return {
        label: t('Give to a cause'),
        why: t('Schools, clinics, clean water or new founders'),
      };
    case 'allocator.career':
      return {
        label: t('Take a senior role at a DFI or a bank'),
        why: t('A salary and big calls, using what you learned'),
      };
    case 'allocator.serial':
      return {
        label: t('Start a new company as a serial founder'),
        why: t('Your skills, name and contacts come with you'),
      };
    case 'allocator.path':
      return {
        label: t('Choose your path: invest, mentor, give, lead an institution or found again'),
        why: t('Open the Capital app to compare the paths'),
      };
    // The investor journey.
    case 'first-cheque.invest':
      return {
        label: t('Invest in a startup'),
        why: t('Open the Invest app: pick a deal offer and tap Invest'),
      };
    case 'first-cheque.portfolio':
      return {
        label: t('Back {n} startups', { n: need }),
        why: t('Deal offers lists every startup raising money'),
      };
    case 'first-cheque.events':
      return {
        label: t('Meet founders at a tech event or demo day'),
        why: t('Events app: founders pitch investors, and their deals join your pipeline'),
      };
    case 'track-record.follow-on':
      return {
        label: t('Back a company again'),
        why: t('Invest in its next round from Deal offers'),
      };
    case 'track-record.board':
      return {
        label: t('Take a board seat'),
        why: t('Ask for one when you offer terms'),
      };
    case 'track-record.mentor':
      return {
        label: t('Mentor a startup'),
        why: t('Capital app → Allocate: advice for advisor shares'),
      };
    case 'track-record.shares':
      return {
        label: t('Buy shares on the stock market'),
        why: t('Capital app → Markets'),
      };
    case 'fund.raise':
      return {
        label: t('Raise Fund I'),
        why: t('On Portfolio: meet the LP panel with your track record'),
      };
    case 'fund.invest':
      return {
        label: t('Invest from your fund'),
        why: t('Pay from the fund when you offer terms'),
      };
    case 'fund.exit':
      return {
        label: t('Return money to your investors'),
        why: t('A company you backed is bought or lists'),
      };
    case 'fund.learn':
      return {
        label: t('Talk strategy with {n} investors', { n: need }),
        why: t('At events, other investors share how they build a fund'),
      };
    case 'firm.syndicate':
      return {
        label: t('Lead a syndicate'),
        why: t('Portfolio → Syndicates: others invest alongside you'),
      };
    case 'firm.lp':
      return {
        label: t('Back another fund as an LP'),
        why: t('Portfolio → As an LP'),
      };
    case 'firm.found':
      return {
        label: t('Found a firm'),
        why: t('Portfolio → Firm: partners, a carry pool, more funds'),
      };
    case 'firm.fund-2':
      return {
        label: t('Raise Fund II'),
        why: t('Portfolio → Your funds, once Fund I returns money'),
      };
    case 'legacy.give':
      return {
        label: t('Give to a cause'),
        why: t('Capital app → Allocate → Philanthropy'),
      };
    case 'legacy.role':
      return {
        label: t('Take a senior role at a DFI, a bank or a sovereign fund'),
        why: t('Capital app → Allocate'),
      };
    case 'legacy.accelerator':
      return {
        label: t('Start an accelerator'),
        why: t('Portfolio → Legacy: back a cohort and run a demo day'),
      };
    // The banker journey.
    case 'licence.found':
      return {
        label: t('Choose your bank’s name and licence'),
        why: t('Bank tab: a name, the kind of bank and your own capital'),
      };
    case 'licence.sign':
      return {
        label: t('Negotiate with shareholders and sign'),
        why: t('Compare the offers, counter once each, keep control'),
      };
    case 'licence.interview':
      return {
        label: t('Pass the fit-and-proper interview at the Central Bank'),
        why: t('Book an appointment there, then answer in person'),
      };
    case 'licence.plan':
      return {
        label: t('File your business plan'),
        why: t('Bank tab: customers, products, branches and lending'),
      };
    case 'licence.team':
      return {
        label: t('Hire your key people'),
        why: t('A chief executive, risk, compliance and AML officers'),
      };
    case 'licence.setup':
      return {
        label: t('Choose a core banking system and lease a branch'),
        why: t('Reliability impresses the regulator'),
      };
    case 'licence.granted':
      return {
        label: t('Get your licence'),
        why: t('The regulator decides once the checklist is done'),
      };
    case 'open.pricing':
      return {
        label: t('Set your pricing'),
        why: t('Bank tab: loan spread, deposit rate and fees'),
      };
    case 'open.customers':
      return {
        label: t('Win {n} customers', { n: need }),
        why: t('A good deposit rate and stars bring them in'),
      };
    case 'loans.first':
      return {
        label: t('Make your first loans'),
        why: t('Answer loan requests on the Bank tab'),
      };
    case 'loans.profit':
      return {
        label: t('Have a profitable month'),
        why: t('Interest and fees above costs and losses'),
      };
    case 'loans.book':
      return {
        label: t('Grow the loan book'),
        why: t('Lend within the capital and reserve rules'),
      };
    case 'trusted.stars':
      return {
        label: t('Reach a 3.5★ rating'),
        why: t('Strong capital, happy customers'),
      };
    case 'trusted.customers':
      return {
        label: t('Serve {n} customers', { n: need }),
        why: t('Households and businesses banking with you'),
      };
    case 'trusted.dividend':
      return {
        label: t('Pay your shareholders a dividend'),
        why: t('From capital above the regulator’s minimum'),
      };
    case 'trusted.conditions':
      return {
        label: t('Run the bank with no licence conditions'),
        why: t('Conditions lift after a clean year'),
      };
    case 'group.capital':
      return {
        label: t('Grow capital to 3× the minimum'),
        why: t('Keep profits in the bank'),
      };
    case 'group.five-star':
      return {
        label: t('Earn a five-star rating'),
        why: t('The best-run bank in the city'),
      };
    case 'group.governor':
      return {
        label: t('Become central bank governor'),
        why: t('Each quarter the best banker may be appointed'),
      };
    default:
      return { label: s.label, why: '' };
  }
}

/** "2 / 3", or money for revenue and valuation goals. */
export function progressText(p: NonNullable<JourneyStepView['progress']>): string {
  return p.currency
    ? `${money(p.have, p.currency)} / ${money(p.need, p.currency)}`
    : `${p.have} / ${p.need}`;
}

export interface Objective {
  kind: ObjectiveKind;
  id: string;
  icon: string;
  label: string;
  why: string;
  go: JourneyGo | null;
  /** Main objectives: the chapter it belongs to. */
  chapter?: number;
}

const OPPORTUNITY_KINDS = new Set(['angel', 'accelerator', 'grant', 'sell', 'event']);
const OPP_ICON: Record<string, string> = {
  angel: '🤝',
  accelerator: '🚀',
  grant: '🌍',
  sell: '📣',
  event: '🎟',
};

/** Time-sensitive things worth a look, best first. */
function opportunityCandidates(view: PlayerView): Objective[] {
  const out: Objective[] = [];
  const cur = view.market.currency;
  for (const d of view.deals)
    if (d.yourTurn)
      out.push({
        kind: 'opportunity',
        id: `deal:${d.id}`,
        icon: '📝',
        label: t('A deal is waiting for your answer'),
        why: tx(d.summary),
        go: { kind: 'tab', tab: 'money' },
      });
  const comps =
    (view.market as { competitions?: { list?: CompetitionLike[] } }).competitions?.list ?? [];
  for (const c of comps)
    if (c.status === 'open' && c.you?.canEnter)
      out.push({
        kind: 'opportunity',
        id: `comp:${c.id}`,
        icon: '🏆',
        label: t('Enter {name}', { name: c.name }),
        why: t('A pitch competition this month · prize pool {amount}', {
          amount: money(c.prizePool, c.currency ?? cur),
        }),
        go: { kind: 'app', app: 'events' },
      });
  for (const s of suggestionsFor(view, 12)) {
    if (!OPPORTUNITY_KINDS.has(s.kind)) continue;
    const { label, why } = suggestionText(s, cur);
    out.push({
      kind: 'opportunity',
      id: `${s.kind}:${s.placeId}`,
      icon: OPP_ICON[s.kind] ?? '✨',
      label,
      why,
      go: { kind: 'place', place: s.placeId },
    });
  }
  return out;
}

interface CompetitionLike {
  id: string;
  name: string;
  status: string;
  prizePool: number;
  currency?: string;
  you?: { canEnter?: boolean };
}

/** Life outside work: rest, a night out, a quiz, a view, friends, a date, home. */
function personalCandidates(view: PlayerView): Objective[] {
  const out: Objective[] = [];
  const pocket = view.accounts.local?.balance ?? 0;
  const cur = view.market.currency;
  if (view.me.energy < 35)
    out.push({
      kind: 'personal',
      id: 'rest',
      icon: '🛏',
      label: t('Rest at home'),
      why: t('Your energy is low: sleep it off'),
      go: { kind: 'place', place: 'home' },
    });
  const biz = businessesOf(view).filter((b) => b.open);
  const quiz = biz
    .flatMap((b) => venueItemsOf(view, b.id).map((i) => ({ b, i })))
    .find((x) => /quiz/i.test(`${x.i.id} ${x.i.label}`) && x.i.price <= pocket && !x.i.locked);
  if (quiz)
    out.push({
      kind: 'personal',
      id: `quiz:${quiz.b.id}`,
      icon: '🧠',
      label: t('Quiz night at {place}', { place: quiz.b.name }),
      why: t('Play for the pot against other players'),
      go: { kind: 'place', place: `biz:${quiz.b.id}` },
    });
  const fun = suggestionsFor(view, 12).find((s) => s.kind === 'fun');
  if (fun) {
    const { label, why } = suggestionText(fun, cur);
    out.push({
      kind: 'personal',
      id: `fun:${fun.placeId}`,
      icon: '🎉',
      label,
      why,
      go: { kind: 'place', place: fun.placeId },
    });
  }
  const city = view.here?.id ?? view.market.id;
  const skies = skyViewsIn(city);
  if (skies.length) {
    // A different view each month.
    const v = skies[view.market.month % skies.length]!;
    out.push({
      kind: 'personal',
      id: `sky:${v.id}`,
      icon: '🎡',
      label: t('Take in the view from {name}', { name: v.name }),
      why: t('Go up alone, or take someone special'),
      go: { kind: 'sky', id: v.id },
    });
  }
  if ((view.me.contacts?.length ?? 0) > 0)
    out.push({
      kind: 'personal',
      id: 'friends',
      icon: '🥂',
      label: t('Plan a hangout with friends'),
      why: t('Friendships open doors, and lift your mood'),
      go: { kind: 'app', app: 'events' },
    });
  out.push({
    kind: 'personal',
    id: 'date',
    icon: '💛',
    label: t('Ask someone out on a date'),
    why: t('From a chat: dinner, a view or your place'),
    go: { kind: 'app', app: 'messages' },
  });
  const home = homeOf(view);
  if (home && home.comfort < 50)
    out.push({
      kind: 'personal',
      id: 'home',
      icon: '🛋',
      label: t('Make your home more comfortable'),
      why: t('Better rest, better mood'),
      go: { kind: 'app', app: 'house' },
    });
  return out;
}

/** The three prompts (any may be null when nothing fits or all were dismissed). */
export function objectivesFor(view: PlayerView): Record<ObjectiveKind, Objective | null> {
  const j = journeyOf(view);
  const main: Objective[] = (j?.main ?? []).map((s) => ({
    kind: 'main',
    id: s.id,
    icon: '🚩',
    ...stepCopy(s),
    go: s.go,
    chapter: s.chapter,
  }));
  const pinned = j?.pinned ?? {};
  const dismissed = j?.dismissed ?? {};
  return {
    main: pickObjective(main, pinned.main, dismissed.main),
    opportunity: pickObjective(
      opportunityCandidates(view),
      pinned.opportunity,
      dismissed.opportunity,
    ),
    personal: pickObjective(personalCandidates(view), pinned.personal, dismissed.personal),
  };
}

// ---------------------------------------------------------------- celebration

const SEEN_KEY = 'rw_journey_seen';

/**
 * Chapters completed since this browser last looked, highest first. The
 * first look only remembers (a returning player isn't greeted with a pile).
 */
export function freshChapters(j: Journey): number[] {
  const done = j.chapters.filter((c) => c.status === 'done').map((c) => c.n);
  let seen: number[] | null = null;
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    seen = raw ? (JSON.parse(raw) as number[]) : null;
  } catch {
    return []; // storage blocked: no way to tell what's new
  }
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(done));
  } catch {
    /* storage blocked: celebrations may repeat this session only */
  }
  if (seen === null) return [];
  return done.filter((n) => !seen.includes(n)).sort((a, b) => b - a);
}

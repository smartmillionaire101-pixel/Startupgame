/**
 * Investor deal flow (player feedback, 23 October 2026): how many founders
 * pitch an investor at each kind of event, how many investors they meet,
 * what those investors teach, and the LP panel's bars for a fund pitch.
 * Every number in one place, like `INVESTOR` (data/investor.ts).
 */

export const DEALFLOW = {
  /** Founders who pitch an investor, [min, max], by event kind (tech, hosted, hangout). */
  pitches: {
    'demo-day': [4, 6],
    conference: [2, 3],
    meetup: [1, 2],
    hackathon: [1, 2],
    workshop: [1, 1],
    'investor-breakfast': [2, 3],
    'founder-meetup': [1, 2],
    'talent-night': [0, 1],
    'customer-mixer': [0, 0],
    hangout: [0, 1],
    // Role events (feedback note): founders pitch at investor events, now and then elsewhere.
    'investor-demo-day': [3, 5],
    'investor-dinner': [1, 2],
    'family-office': [1, 2],
    'lp-forum': [0, 1],
    'fintech-summit': [1, 2],
    'policy-briefing': [0, 0],
    'banking-dinner': [0, 1],
    'sme-lending': [0, 1],
    'capital-markets': [0, 1],
    'risk-seminar': [0, 0],
  } as Record<string, [number, number]>,
  /** AI investors you get talking to, [min, max], by event kind. */
  talks: {
    'demo-day': [2, 2],
    conference: [1, 2],
    meetup: [1, 1],
    hackathon: [0, 1],
    workshop: [1, 1],
    'investor-breakfast': [2, 2],
    'founder-meetup': [0, 1],
    'talent-night': [0, 0],
    'customer-mixer': [0, 0],
    hangout: [0, 0],
    // Role events (feedback note): investor events are full of investors.
    'investor-demo-day': [2, 2],
    'investor-dinner': [2, 3],
    'family-office': [1, 2],
    'lp-forum': [2, 3],
    'capital-markets': [1, 1],
  } as Record<string, [number, number]>,
  /** A new investor (fewer deals than this) always hears at least `minPitches` at an event. */
  newInvestorDeals: 3,
  minPitches: 2,
  /** Fresh startups that may pitch beyond the city's usual AI population, so pitches never dry up. */
  extraStartups: 6,
  /** Chance an investor you meet refers a deal (higher for a new investor). */
  referralChance: 0.35,
  referralChanceNew: 0.55,
  /** Warmth of the contacts you make. */
  founderWarmth: 0.3,
  investorWarmth: 0.35,
  /** A lesson learned: investing skill points, and LP credibility (capped). */
  lessonSkill: 2,
  lessonCredibility: 0.01,
  credibilityCap: 0.9,
  /** Conversations kept on the profile. */
  talksKept: 12,
  /** What a founder asks for, as a share of the valuation investors put on them. */
  askShare: [0.12, 0.22] as [number, number],
} as const;

/** What a strategy conversation is about. */
type LessonTopic =
  | 'thesis'
  | 'cheque'
  | 'portfolio'
  | 'reserves'
  | 'ownership'
  | 'sourcing'
  | 'diligence'
  | 'looks-for'
  | 'mistakes'
  | 'pricing'
  | 'returns'
  | 'pacing'
  | 'reputation'
  | 'lps';

export interface Lesson {
  id: string;
  topic: LessonTopic;
  /** Who says it best: angels, fund partners, or both. */
  by: 'angel' | 'vc' | 'any';
  /** What they tell you (fixed English; the client translates it). */
  text: string;
  /** The tip it leaves you with. */
  tip: string;
}

/** What AI investors teach at events. Fixed strings so the client can translate them. */
export const LESSONS: readonly Lesson[] = [
  {
    id: 'thesis-lane',
    topic: 'thesis',
    by: 'any',
    text: 'Pick a lane you can win in. Founders remember the investor who knew their market cold.',
    tip: 'Keep your thesis to two or three sectors.',
  },
  {
    id: 'cheque-ownership',
    topic: 'cheque',
    by: 'angel',
    text: 'Size your cheque to the stake you need, not to what feels comfortable.',
    tip: 'Work out your cheque from your ownership target and the valuation.',
  },
  {
    id: 'portfolio-power-law',
    topic: 'portfolio',
    by: 'vc',
    text: 'Seed is a power-law game: one company returns the fund, so you need enough shots on goal.',
    tip: 'Plan 20 to 40 companies for a seed fund.',
  },
  {
    id: 'reserves-half',
    topic: 'reserves',
    by: 'vc',
    text: 'I keep about half the fund for follow-ons. The best companies raise again, and that is where the money is made.',
    tip: 'Keep 40–60% of a seed fund for follow-ons.',
  },
  {
    id: 'ownership-matters',
    topic: 'ownership',
    by: 'vc',
    text: 'Ownership matters more than price. Two per cent of a winner barely moves a fund; I aim for about ten per cent at entry.',
    tip: 'Set an ownership target that fits the stage you invest at.',
  },
  {
    id: 'sourcing-portfolio',
    topic: 'sourcing',
    by: 'any',
    text: 'My best deals come from founders I already backed. Help your companies and they send you their friends.',
    tip: 'Support your portfolio: it becomes your deal flow.',
  },
  {
    id: 'sourcing-demo-days',
    topic: 'sourcing',
    by: 'vc',
    text: 'I go to every demo day, but I decide in follow-up meetings, not in the room.',
    tip: 'Take follow-up meetings before you send terms.',
  },
  {
    id: 'diligence-customers',
    topic: 'diligence',
    by: 'any',
    text: 'Call customers before the references the founder gave you. Customers don’t rehearse.',
    tip: 'Do reference calls and check claims before you invest.',
  },
  {
    id: 'looks-for-learning',
    topic: 'looks-for',
    by: 'angel',
    text: 'I look for founders who learn fast. What changed in their thinking since we last spoke?',
    tip: 'Meet founders twice before you decide.',
  },
  {
    id: 'mistakes-herd',
    topic: 'mistakes',
    by: 'angel',
    text: 'My worst cheque was the one I wrote because everyone else was in. Do your own work.',
    tip: 'Never skip diligence because a round is hot.',
  },
  {
    id: 'pricing-hot-rounds',
    topic: 'pricing',
    by: 'any',
    text: 'Paying up for a hot round is fine once. Doing it every time ruins your returns.',
    tip: 'Price discipline: walk away when the valuation runs ahead.',
  },
  {
    id: 'returns-dpi',
    topic: 'returns',
    by: 'vc',
    text: 'LPs want cash back, not paper marks. Think about who could buy each company before you invest.',
    tip: 'DPI (cash returned) is what LPs judge you on.',
  },
  {
    id: 'pacing-vintages',
    topic: 'pacing',
    by: 'vc',
    text: 'Don’t spend the fund in a year. Pace your deals over the investment period.',
    tip: 'Spread your first cheques over the investment period.',
  },
  {
    id: 'reputation-answer',
    topic: 'reputation',
    by: 'angel',
    text: 'Answer every founder, even with a no. Your reputation is your deal flow.',
    tip: 'Pass with a reason within the month: never ghost.',
  },
  {
    id: 'lps-maths',
    topic: 'lps',
    by: 'vc',
    text: 'When you raise, LPs check the maths: fund size, cheque, number of companies and reserves have to add up.',
    tip: 'Fund size ≈ companies × cheque ÷ (1 − reserves), plus fees.',
  },
];

export const lessonById = (id: string): Lesson | undefined => LESSONS.find((l) => l.id === id);

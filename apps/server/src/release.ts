/**
 * The note every player gets in their inbox when a release changes how the
 * game plays. Bump `id` for each new note; the engine sends each id once.
 *
 * Logging a note is also a switch (see the engine's releases.ts): this one
 * turns on customers you can see (signed customers pay every month end and
 * count in that month's revenue, one customer count everywhere, the
 * Customers view, waking a hibernating company) and, being later, round
 * 7's gameplay (leads that fit the industry, lost deals with their real reason, one customer count, hires that do their job, investor pitch meetings, resting at home, one van per
 * order and quiz tables across the city) and, being
 * later, the game-feedback round (a 30-day banking licence review, a
 * bigger quiz bank, tasks at work, named hotels, outfits by role and the Suit
 * Shop, errands in every building, events by role, the banker's reputation,
 * the stock market's analysis and the founder and investor guides) and,
 * being later, shopping online and the catalogue (a Shop app on the phone,
 * every shop's things with pictures, options and prices, delivery with a fee
 * and a wait) and walls and dividers for your home, the banker
 * update (negotiating with shareholders, the licence process at the Central
 * Bank, the banker's first session and journey), more games (a bowling
 * alley, a skydive centre and a heliport in every city), realistic first
 * funds (a suggested Fund I size, first-time-manager LPs, the anchor effect
 * and rolling closes), city places (named buildings, members' doors and
 * government appointments), investor deal flow (founders pitch investors at
 * events, investors talk strategy, LPs judge a fund's strategy), the
 * investor career, the jobs rework, Phase 3 life bars and Phase 5 life
 * events, Founder Journey 5 (exits) and 4a (decision events and visible
 * rivals) for new worlds.
 */
import { CUSTOMERS_NOTE } from '@runway/engine';

export const RELEASE_NOTE = {
  id: CUSTOMERS_NOTE,
  text:
    'Update from your feedback: your customers, and their money, in one place. Customers you ' +
    'sign in Sales now pay their monthly price at every month end, straight into your company ' +
    'account, and it counts in that month’s revenue. Company → Customers lists everyone who ' +
    'pays you, with what they pay, when they signed, what they have paid so far and who may ' +
    'leave, plus your monthly recurring revenue and how it is worked out. Every screen shows the ' +
    'same number of customers. A company that went to sleep while you were away now says so on ' +
    'the Company screen, with a button to wake it up. Refresh to get it; your game is saved.',
} as const;

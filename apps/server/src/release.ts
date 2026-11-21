/**
 * The note every player gets in their inbox when a release changes how the
 * game plays. Bump `id` for each new note; the engine sends each id once.
 *
 * Logging a note is also a switch (see the engine's releases.ts): this one
 * turns on branches you can run (a branch's own customers, its local
 * marketing budget and staff, leads from its city in Sales, pitching its
 * businesses in person, and "Sell in a second city" counting customers
 * there) and, being later, what customers need the product to do (a lead
 * who buys on fit names one or two roadmap features, discovery shows which
 * you have, a deal lost on fit names what is missing, and shipping it wins
 * the deal back) and, being later, customers you can see (signed customers pay every month end and
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
import { BRANCHES_NOTE } from '@runway/engine';

export const RELEASE_NOTE = {
  id: BRANCHES_NOTE,
  text:
    'Update from your feedback: branches you can run, and customers who say what they need. ' +
    'Company → Branches shows each branch with its customers, revenue, costs and profit, and how ' +
    'to grow it. Give a branch a local marketing budget, hire a local sales rep or a manager, or ' +
    'close it. Sales now finds leads in your branch cities, with a city filter, and when you are ' +
    'in that city you can pitch its businesses in person. Branch customers count in your customer ' +
    'total and show in Customers with their city, and "Sell in a second city" is done once a ' +
    'branch in another city has customers. A discovery meeting in Sales now shows the features a ' +
    'customer needs by name, and which of them you already have. A deal lost because the product ' +
    'doesn’t do what they need names the missing feature, and “Open the Roadmap” takes you ' +
    'straight to it. On the Company screen, “Do it now” on your stage opens the place to work on ' +
    'that step. Refresh to get it; your game is saved.',
} as const;

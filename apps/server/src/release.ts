/**
 * The note every player gets in their inbox when a release changes how the
 * game plays. Bump `id` for each new note; the engine sends each id once.
 *
 * Logging a note is also a switch (see the engine's releases.ts): this one
 * turns on round 7's gameplay (leads that fit the industry, lost deals with
 * their real reason, one customer count, hires that do their job, investor pitch meetings, resting at home, one van per
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
import { GAMEPLAY_NOTE } from '@runway/engine';

export const RELEASE_NOTE = {
  id: GAMEPLAY_NOTE,
  text:
    'Update from your feedback. Sales leads are now the customers your industry really sells ' +
    'to, with openings that fit your idea and their business. Before you ask for a deal you see ' +
    'what is holding the chance back, and a lost deal tells you the real reason and what to do ' +
    'next. Won customers count everywhere at once. Your hires do their job: a salesperson brings ' +
    'leads from their sector, runs discovery and gives you tips; a technical co-founder lifts ' +
    'demos; a business co-founder brings warmer leads and introduces investors who fit your round; ' +
    'engineers ship faster. ' +
    'Pitching an investor is now a real meeting with questions about your numbers and a term ' +
    'sheet you can counter once. Sit on your sofa to lower stress or nap to get energy back, ' +
    'sit on your bed, visit your leased office, order several things in one delivery (now with ' +
    'bathroom and hallway pieces), find quiz opponents across ' +
    'the city and invite friends to a game from Messages. Refresh to get it; your game is saved.',
} as const;

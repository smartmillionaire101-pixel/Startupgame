/**
 * The note every player gets in their inbox when a release changes how the
 * game plays. Bump `id` for each new note; the engine sends each id once.
 *
 * Logging a note is also a switch (see the engine's releases.ts): this one
 * turns on the game-feedback round (a 30-day banking licence review, a
 * bigger quiz bank, tasks at work, named hotels, outfits by role and the Suit
 * Shop, errands in every building, events by role, the banker's reputation,
 * the stock market's analysis and the founder and investor guides) and,
 * being later, the banker update (negotiating with shareholders, the licence
 * process at the Central Bank, the banker's first session and journey) and,
 * being later, more games (a bowling alley, a skydive centre and a heliport in
 * every city) and realistic first funds (a suggested Fund I size, first-time-
 * manager LPs, the anchor effect and rolling closes) and, being later, city places (named buildings, members' doors
 * and government appointments), investor deal flow (founders pitch investors
 * at events, investors talk strategy, LPs judge a fund's strategy), the
 * investor career, the jobs rework, Phase 3 life bars and Phase 5 life
 * events, Founder Journey 5 (exits) and 4a (decision events and visible
 * rivals) for new worlds.
 */
import { FEEDBACK_NOTE } from '@runway/engine';

export const RELEASE_NOTE = {
  id: FEEDBACK_NOTE,
  text:
    'Update from your feedback. Founders and investors get a stage tracker, live checks on their ' +
    'numbers, scored decisions with the best answer and why, and a mentor. Bankers: the licence ' +
    'review takes 30 days, good advisory work earns a reputation, referrals and bigger clients, ' +
    'and the Events app has banking and finance events. Jobs come with tasks from your manager ' +
    '(answer badly and you can be let go). The stock market shows your city first, with a ' +
    'company analysis before you buy. Every city has named hotels in its districts, the mall has ' +
    'a Suit Shop and more clothes, new players dress for their role, and shops, offices and ' +
    'public buildings have more to do. Over 1,100 quiz questions, including real events. ' +
    'Refresh to get it; your game is saved.',
} as const;

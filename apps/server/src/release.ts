/**
 * The note every player gets in their inbox when a release changes how the
 * game plays. Bump `id` for each new note; the engine sends each id once.
 *
 * Logging a note is also a switch (see the engine's releases.ts): this one
 * turns on the game-feedback round (a 30-day banking licence review, a
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
import { FEEDBACK_NOTE } from '@runway/engine';

export const RELEASE_NOTE = {
  id: FEEDBACK_NOTE,
  text:
    'Update from your feedback. Founders now set up properly: register, fund the company with ' +
    'your own money, a scheme or a startup loan (banker players can lend), make a plan, then ' +
    'lease an office. Customer interviews and sales are real conversations, scored with the ' +
    'best answer and why. Founders and investors get a stage tracker, live checks and a mentor. ' +
    'Job interviews get harder with the level, with a brief to study, and jobs come with tasks ' +
    'from your manager. Bankers: a 30-day licence review, a reputation that brings bigger ' +
    'clients, and banking events. The stock market shows your city first, 15 to 20 companies ' +
    'each, with an analysis before you buy. Buy mode at home has pictures, a basket, floors and ' +
    'paint, and your things lift your needs. Named hotels, a Suit Shop, outfits by role, golf ' +
    'controls off the aim, a new sign-up and over 1,100 quiz questions. Refresh to get it; your ' +
    'game is saved.',
} as const;

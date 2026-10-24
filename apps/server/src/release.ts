/**
 * The note every player gets in their inbox when a release changes how the
 * game plays. Bump `id` for each new note; the engine sends each id once.
 *
 * Logging a note is also a switch (see the engine's releases.ts): this one
 * turns on the banker update (negotiating with shareholders, the licence
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
import { BANKERS_NOTE } from '@runway/engine';

export const RELEASE_NOTE = {
  id: BANKERS_NOTE,
  text:
    'Update for bankers: starting a bank is real work now. Before you sign, investor groups ' +
    'make different offers (more capital, more control, or a board seat and help): negotiate, ' +
    'put in more of your own money, bring co-founders and keep control. Then earn your licence: ' +
    'a fit-and-proper interview at the Central Bank, a business plan, key hires, a core banking ' +
    'system and a first branch, with a tracker showing what is missing. Approval in principle ' +
    'lets you sign up your first clients before you open. New bankers get a guided first ' +
    'session and a Journey. Refresh to get it; your game is saved.',
} as const;

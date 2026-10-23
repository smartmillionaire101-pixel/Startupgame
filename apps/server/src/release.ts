/**
 * The note every player gets in their inbox when a release changes how the
 * game plays. Bump `id` for each new note; the engine sends each id once.
 *
 * Logging a note is also a switch (see the engine's releases.ts): this one
 * turns on investor deal flow (founders pitch investors at events, investors
 * talk strategy, LPs judge a fund's strategy) and, being later, the investor
 * career, the jobs rework, Phase 3 life bars and Phase 5 life events,
 * Founder Journey 5 (exits) and 4a (decision events and visible rivals) for
 * new worlds.
 */
import { DEALFLOW_NOTE } from '@runway/engine';

export const RELEASE_NOTE = {
  id: DEALFLOW_NOTE,
  text:
    'Update for investors: go to tech events, demo days and investor breakfasts and founders ' +
    'will pitch you. Each pitch lands in your pipeline (Portfolio → Pipeline) with its traction, ' +
    'ask and valuation, ready for a follow-up meeting, a pass or a term sheet. You also meet ' +
    'other investors who share how they build a fund, and some refer deals. Raising a fund? ' +
    'LPs now judge your strategy: fund size, cheque, number of companies, reserves, ownership ' +
    'and fees must add up, and they tell you why they commit or pass. Refresh to get it; your ' +
    'game is saved.',
} as const;

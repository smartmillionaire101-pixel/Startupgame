/**
 * The note every player gets in their inbox when a release changes how the
 * game plays. Bump `id` for each new note; the engine sends each id once.
 *
 * Logging a note is also a switch (see the engine's releases.ts): this one
 * turns on the investor career (the ladder, the angel ceiling, syndicates,
 * LP funds, the exchange and firms) and, being later, the jobs rework,
 * Phase 3 life bars and Phase 5 life events, Founder Journey 5 (exits) and
 * 4a (decision events and visible rivals) for new worlds.
 */
import { INVESTOR_NOTE } from '@runway/engine';

export const RELEASE_NOTE = {
  id: INVESTOR_NOTE,
  text:
    'Update: the investor career. Your Portfolio, deal offers and stock market work as before; ' +
    'below them, investors now climb a ladder from angel to syndicate lead, Fund I, a firm ' +
    'and beyond, with syndicates, LP commitments, capital calls, an index fund and limit ' +
    'orders. Refresh to get it; your game is saved.',
} as const;

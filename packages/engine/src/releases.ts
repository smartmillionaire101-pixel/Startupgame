/**
 * Release notes that switch game behaviour on (docs/adr/0001: replay safety).
 *
 * A switch is the logged `system.announce` of its note, never the clock: a
 * command log replays every command before the note exactly as it first ran,
 * and every command after it with the new behaviour.
 *
 * A brand-new world logs only the newest note, so each switch is also on
 * when any later note is in the log (RELEASES is in release order).
 */
import type { World } from './types.js';

/**
 * Founder Journey 4a: decision events and visible rivals. Worlds that never
 * logged this note (every world before this release, and engine test worlds
 * that don't announce it) settle exactly as before.
 */
export const JOURNEY_EVENTS_NOTE = 'release-2026-10-15-journey-events';

/**
 * Founder Journey 5: exits and the capital allocator. New commands only
 * change worlds they're issued in; this note switches on what changes
 * existing play: an exit (sold company) is counted as realised wealth.
 */
export const EXITS_NOTE = 'release-2026-10-16-exits';

/**
 * Phase 3: life bars (lifebars.ts). Health and stress join energy, and
 * happiness is read from fun and social. Walking costs hours and energy
 * (`city.walk`), rides cost a little time, everyday acts move the bars, the
 * bars settle each month, and how you feel nudges sales and pitch odds.
 * Phase 5 life events ship under the same note (lifeevents.ts): choice cards
 * for every player, drawn at settlement and answered with `event.choose`.
 * Worlds without this note play exactly as before (`city.walk` is unknown).
 */
export const LIFE_BARS_NOTE = 'release-2026-10-17-life-bars';

/**
 * The investor career (investor blueprint): the career ladder and its
 * invitations, the angel ceiling (a cheque cap and a lead for Series A and
 * later), the investor first session, monthly marks, and the settlement work
 * of syndicates, LP funds, the exchange and firms. New commands only change
 * worlds they're issued in; this note switches on what changes existing play.
 */
export const INVESTOR_NOTE = 'release-2026-10-20-investor-career';

/** Every behaviour-switching note, oldest first. */
export const RELEASES = [JOURNEY_EVENTS_NOTE, EXITS_NOTE, LIFE_BARS_NOTE, INVESTOR_NOTE] as const;

/** Is `note` (or any later release note) in this world's log? */
export function releaseOn(w: World, note: (typeof RELEASES)[number]): boolean {
  const notes = w.announcements ?? [];
  return RELEASES.slice(RELEASES.indexOf(note)).some((n) => notes.includes(n));
}

export const journeyEventsOn = (w: World): boolean => releaseOn(w, JOURNEY_EVENTS_NOTE);
export const exitsOn = (w: World): boolean => releaseOn(w, EXITS_NOTE);
export const lifeBarsOn = (w: World): boolean => releaseOn(w, LIFE_BARS_NOTE);
export const investorOn = (w: World): boolean => releaseOn(w, INVESTOR_NOTE);

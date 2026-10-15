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
 * Phases 7–9: the living world and the endgame. This note switches on what
 * changes existing play: pro-rata rights are recorded, and holders who have
 * them are offered a follow-on at each later priced round (new deal cards).
 */
export const ENDGAME_NOTE = 'release-2026-10-17-endgame';

/** Every behaviour-switching note, oldest first. */
export const RELEASES = [JOURNEY_EVENTS_NOTE, EXITS_NOTE, ENDGAME_NOTE] as const;

/** Is `note` (or any later release note) in this world's log? */
export function releaseOn(w: World, note: (typeof RELEASES)[number]): boolean {
  const notes = w.announcements ?? [];
  return RELEASES.slice(RELEASES.indexOf(note)).some((n) => notes.includes(n));
}

export const journeyEventsOn = (w: World): boolean => releaseOn(w, JOURNEY_EVENTS_NOTE);
export const exitsOn = (w: World): boolean => releaseOn(w, EXITS_NOTE);
export const endgameOn = (w: World): boolean => releaseOn(w, ENDGAME_NOTE);

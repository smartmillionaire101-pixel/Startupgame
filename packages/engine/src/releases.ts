/**
 * Release notes that switch game behaviour on (docs/adr/0001: replay safety).
 *
 * A switch is the logged `system.announce` of its note, never the clock: a
 * command log replays every command before the note exactly as it first ran,
 * and every command after it with the new behaviour.
 */
import type { World } from './types.js';

/**
 * Founder Journey 4a: decision events and visible rivals. Worlds that never
 * logged this note (every world before this release, and engine test worlds
 * that don't announce it) settle exactly as before.
 */
export const JOURNEY_EVENTS_NOTE = 'release-2026-10-15-journey-events';

export const journeyEventsOn = (w: World): boolean =>
  (w.announcements ?? []).includes(JOURNEY_EVENTS_NOTE);

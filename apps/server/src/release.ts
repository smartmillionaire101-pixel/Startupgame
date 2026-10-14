/**
 * The note every player gets in their inbox when a release changes how the
 * game plays. Bump `id` for each new note; the engine sends each id once.
 *
 * Logging this note is also the switch for Founder Journey 4a (decision
 * events and visible rivals): see the engine's releases.ts.
 */
import { JOURNEY_EVENTS_NOTE } from '@runway/engine';

export const RELEASE_NOTE = {
  id: JOURNEY_EVENTS_NOTE,
  text:
    'Update: your company now meets real decisions. A big prospect, a stretched team, ' +
    'a rival cutting prices, a short runway, a friend with a free evening: each comes ' +
    'with choices and their costs up front, on your Today screen. Named rivals in your ' +
    'industry now raise, launch and compete, and you can see them on the Company tab. ' +
    'Refresh to get it; your game is saved.',
} as const;

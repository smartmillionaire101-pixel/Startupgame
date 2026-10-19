/**
 * The note every player gets in their inbox when a release changes how the
 * game plays. Bump `id` for each new note; the engine sends each id once.
 *
 * Logging a note is also a switch (see the engine's releases.ts): this one
 * turns on the jobs rework (professional employers in every city, applying,
 * interviews in person, experience and promotion) and, being later, Phase 3
 * life bars and Phase 5 life events, Founder Journey 5 (exits) and 4a
 * (decision events and visible rivals) for new worlds.
 */
import { JOBS_NOTE } from '@runway/engine';

export const RELEASE_NOTE = {
  id: JOBS_NOTE,
  text:
    'Update: careers. Every city now has a bank, an investment firm, a tech company, an ' +
    'engineering firm, a consultancy, a law firm and a hospital. Apply from the Jobs app, go ' +
    'to the interview in person and hear back straight away. Your background counts as ' +
    'experience, and each month on the job moves you towards promotion. Refresh to get it; ' +
    'your game is saved.',
} as const;

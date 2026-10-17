/**
 * The note every player gets in their inbox when a release changes how the
 * game plays. Bump `id` for each new note; the engine sends each id once.
 *
 * Logging a note is also a switch (see the engine's releases.ts): this one
 * turns on Phase 3 life bars (health, stress and happiness beside energy;
 * walking costs time and energy; how you feel nudges sales and pitches), and,
 * being later, Founder Journey 5 (exits) and 4a (decision events and visible
 * rivals) for new worlds.
 */
import { LIFE_BARS_NOTE } from '@runway/engine';

export const RELEASE_NOTE = {
  id: LIFE_BARS_NOTE,
  text:
    'Update: life bars. Energy, Health, Happiness and Stress now show at the top. Walking far ' +
    'takes time and energy, a taxi saves both but costs money, and how you feel changes how ' +
    'well you sell and pitch. Refresh to get it; your game is saved.',
} as const;

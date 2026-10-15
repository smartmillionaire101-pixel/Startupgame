/**
 * The note every player gets in their inbox when a release changes how the
 * game plays. Bump `id` for each new note; the engine sends each id once.
 *
 * Logging a note is also a switch (see the engine's releases.ts): this one
 * turns on Phases 7–9 (pro-rata follow-ons), and, being later, Founder
 * Journey 5 (exits counted as realised wealth) and 4a (decision events and
 * visible rivals) for new worlds.
 */
import { ENDGAME_NOTE } from '@runway/engine';
export const RELEASE_NOTE = {
  id: ENDGAME_NOTE,
  text:
    'Update: choose your ambition in the Journey (unicorn founder, profitable owner, serial ' +
    'founder, angel, VC, lifestyle or philanthropist) and its next step leads your goals. The ' +
    'month recap now shows your rivals, your decisions and your wealth. After a sale, "Your exits" ' +
    'in the Capital app shows how the price became your money. Investors with pro-rata rights are ' +
    'offered a follow-on at each new round, and the portfolio shows your returns. Refresh to get ' +
    'it; your game is saved.',
} as const;

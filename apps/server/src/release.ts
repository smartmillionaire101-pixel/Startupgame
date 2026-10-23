/**
 * The note every player gets in their inbox when a release changes how the
 * game plays. Bump `id` for each new note; the engine sends each id once.
 *
 * Logging a note is also a switch (see the engine's releases.ts): this one
 * turns on city places (named buildings, members' doors and government
 * appointments) and, being later, investor deal flow (founders pitch
 * investors at events, investors talk strategy, LPs judge a fund's strategy),
 * the investor career, the jobs rework, Phase 3 life bars and Phase 5 life
 * events, Founder Journey 5 (exits) and 4a (decision events and visible
 * rivals) for new worlds.
 */
import { PLACES_NOTE } from '@runway/engine';

export const RELEASE_NOTE = {
  id: PLACES_NOTE,
  text:
    'Update: the city’s big buildings are real places now. Visit the Chamber of Commerce, the ' +
    'Founders’ Hub or the Stock Exchange; some open only to certain players, and government ' +
    'offices (Tax Office, Central Bank, Embassy and more) see you by appointment. Investors: ' +
    'founders now pitch you at tech events, demo days and investor breakfasts, other investors ' +
    'share how they build a fund, and LPs judge your fund’s strategy and tell you why they ' +
    'commit or pass. Refresh to get it; your game is saved.',
} as const;

/**
 * The note every player gets in their inbox when a release changes how the
 * game plays. Bump `id` for each new note; the engine sends each id once.
 *
 * Logging a note is also a switch (see the engine's releases.ts): this one
 * turns on city places (named buildings, members' doors and government
 * appointments) and, being later, the investor career (the ladder, the angel
 * ceiling, syndicates, LP funds, the exchange and firms), the jobs rework,
 * Phase 3 life bars and Phase 5 life events, Founder Journey 5 (exits) and
 * 4a (decision events and visible rivals) for new worlds.
 */
import { PLACES_NOTE } from '@runway/engine';

export const RELEASE_NOTE = {
  id: PLACES_NOTE,
  text:
    'Update: the city’s big buildings are real places now. Visit the Chamber of Commerce, the ' +
    'Founders’ Hub or the Stock Exchange; some open only to certain players. Government ' +
    'offices (Tax Office, Central Bank, Embassy and more) see you by appointment. Refresh to ' +
    'get it; your game is saved.',
} as const;

/**
 * The note every player gets in their inbox when a release changes how the
 * game plays. Bump `id` for each new note; the engine sends each id once.
 *
 * Logging a note is also a switch (see the engine's releases.ts): this one
 * turns on more games (a bowling alley, a skydive centre and a heliport in
 * every city) and, being later, the investor career, the jobs rework, Phase 3
 * life bars and Phase 5 life events, Founder Journey 5 (exits) and 4a
 * (decision events and visible rivals) for new worlds.
 */
import { MORE_GAMES_NOTE } from '@runway/engine';

export const RELEASE_NOTE = {
  id: MORE_GAMES_NOTE,
  text:
    'Update: more games! Every city now has a bowling alley (ten frames, solo, against AI ' +
    'or friends), a skydive centre (tandem or solo jumps over the city) and a heliport ' +
    '(helicopter tours past the landmarks). Find them in Going out. Refresh to get it; ' +
    'your game is saved.',
} as const;

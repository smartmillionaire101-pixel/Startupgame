/**
 * The note every player gets in their inbox when a release changes how the
 * game plays. Bump `id` for each new note; the engine sends each id once.
 *
 * Logging a note is also a switch (see the engine's releases.ts): this one
 * turns on Founder Journey 5 (exits counted as realised wealth), and, being
 * later, Founder Journey 4a (decision events and visible rivals) for new worlds.
 */
import { EXITS_NOTE } from '@runway/engine';

export const RELEASE_NOTE = {
  id: EXITS_NOTE,
  text:
    'Update: the Exit and Capital Allocator chapters are here. Sell some of your shares in a ' +
    'secondary, get your company ready for the stock market, and buy and sell shares of listed ' +
    'companies. A new wealth card shows what you can spend today and what is only on paper. ' +
    'After an exit, mentor a startup, give to a cause, take a senior role at a DFI or a bank, ' +
    'or start again. Open the Capital app on your phone. Refresh to get it; your game is saved.',
} as const;

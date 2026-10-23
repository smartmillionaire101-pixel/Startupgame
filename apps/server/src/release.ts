/**
 * The note every player gets in their inbox when a release changes how the
 * game plays. Bump `id` for each new note; the engine sends each id once.
 *
 * Logging a note is also a switch (see the engine's releases.ts): this one
 * turns on more games (a bowling alley, a skydive centre and a heliport in
 * every city) and realistic first funds (a suggested Fund I size, first-time-
 * manager LPs, the anchor effect and rolling closes) and, being later, city places (named buildings, members' doors
 * and government appointments), investor deal flow (founders pitch investors
 * at events, investors talk strategy, LPs judge a fund's strategy), the
 * investor career, the jobs rework, Phase 3 life bars and Phase 5 life
 * events, Founder Journey 5 (exits) and 4a (decision events and visible
 * rivals) for new worlds.
 */
import { MORE_GAMES_NOTE } from '@runway/engine';

export const RELEASE_NOTE = {
  id: MORE_GAMES_NOTE,
  text:
    'Update: the city’s big buildings are real places now. Visit the Chamber of Commerce, the ' +
    'Founders’ Hub or the Stock Exchange; some open only to certain players, and government ' +
    'offices (Tax Office, Central Bank, Embassy and more) see you by appointment. Investors: ' +
    'founders now pitch you at tech events, demo days and investor breakfasts, other investors ' +
    'share how they build a fund, and LPs judge your fund’s strategy and tell you why they ' +
    'commit or pass. A first fund is realistic now: LPs say what size your record supports, an ' +
    'emerging-manager programme and angels you met can anchor it, and Fund I starts investing at ' +
    'half its target. And more games: every city has a bowling alley, a skydive centre and a ' +
    'heliport (find them in Going out). Refresh to get it; your game is saved.',
} as const;

/**
 * The note every player gets in their inbox when a release changes how the
 * game plays. Bump `id` for each new note; the engine sends each id once.
 */
export const RELEASE_NOTE = {
  id: 'release-2026-10-05-wave5',
  text:
    'Big update: walk into restaurants, cafés and clubs and see who is there; your new phone has ' +
    'chats (AI people reply too), alerts you can tap, contacts and a wallet; take a part-time job ' +
    'when cash is low; furnish your flat and buy a car; meet accelerators, development partners and ' +
    'LPs; pitch angels wherever you find them. Spending now costs money only, not hours. Refresh to ' +
    'get it; your game is saved.',
} as const;

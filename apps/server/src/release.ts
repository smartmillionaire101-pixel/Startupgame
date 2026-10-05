/**
 * The note every player gets in their inbox when a release changes how the
 * game plays. Bump `id` for each new note; the engine sends each id once.
 */
export const RELEASE_NOTE = {
  id: 'release-2026-10-05-pace',
  text:
    'Thanks for the feedback: a game month now lasts 15 minutes instead of 5, so your cash lasts ' +
    'longer while you explore. Lots more is on the way: restaurants, cafés and clubs you can walk ' +
    'into, a phone for chats and alerts, more jobs, accelerators and investors to meet. ' +
    'Refresh to get the latest version; your game is saved.',
} as const;

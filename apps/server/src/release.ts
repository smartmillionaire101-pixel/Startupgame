/**
 * The note every player gets in their inbox when a release changes how the
 * game plays. Bump `id` for each new note; the engine sends each id once.
 */
export const RELEASE_NOTE = {
  id: 'release-2026-10-08-wave11',
  text:
    'Update: one real day is now one game month again. New players choose their name, who ' +
    'they are and the city they build in. Book your flight first, then check in, go through ' +
    'security and board. Your wallet shows exact amounts, so money you send visibly leaves ' +
    'and arrives. The city map is faster, stays in 3D and keeps every place where it is. ' +
    'Refresh to get it; your game is saved.',
} as const;

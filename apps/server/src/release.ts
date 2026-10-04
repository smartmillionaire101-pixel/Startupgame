/**
 * The note every player gets in their inbox when a release changes how the
 * game plays. Bump `id` for each new note; the engine sends each id once.
 */
export const RELEASE_NOTE = {
  id: 'release-2026-10-04-wave4',
  text:
    'Runway has been updated: a game month now passes every 5 minutes, you can fly to other cities ' +
    'and play there, and the city has more room with new ways to get around (walk, cycle, local ' +
    'transport or taxi). Refresh the page to get the new version. Your game is saved and nothing is lost.',
} as const;

/**
 * The note every player gets in their inbox when a release changes how the
 * game plays. Bump `id` for each new note; the engine sends each id once.
 */
export const RELEASE_NOTE = {
  id: 'release-2026-10-07-wave10',
  text:
    'Big update: cities never sleep. At night the streets, windows and landmarks light up. ' +
    'Drive your own car, take the bus or a taxi, or walk. Buy homes, from studios to mansions, ' +
    'in cash or with a mortgage; rent them out or move in, in any city. Open branches of your ' +
    'business across town and in other cities. San Francisco has more investors and tech ' +
    'events, and pitch competitions where founders pitch on stage and investors judge. The new ' +
    'Going out app has yachts, golf and galas as your lifestyle grows. Refresh to get it.',
} as const;

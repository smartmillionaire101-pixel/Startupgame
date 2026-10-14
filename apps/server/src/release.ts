/**
 * The note every player gets in their inbox when a release changes how the
 * game plays. Bump `id` for each new note; the engine sends each id once.
 */
export const RELEASE_NOTE = {
  id: 'release-2026-10-14-wave12',
  text:
    'Update: your home now grows with your wealth, from a studio to a mansion with a pool, ' +
    'gardens and a garage for every car. Ride the London Eye, the cable car and real ' +
    'skyline views in every city, open to everyone, and take a date up with you. Quiz ' +
    'nights now pick the questions for you: find an opponent and play for the pot. ' +
    'Refresh to get it; your game is saved.',
} as const;

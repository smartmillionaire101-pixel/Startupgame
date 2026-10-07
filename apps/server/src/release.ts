/**
 * The note every player gets in their inbox when a release changes how the
 * game plays. Bump `id` for each new note; the engine sends each id once.
 */
export const RELEASE_NOTE = {
  id: 'release-2026-10-07-wave9',
  text:
    'Big update: your city is now 3D. Real streets and buildings with windows, glass towers, ' +
    'sunlight, shadows and landmarks you can fly around. Your home is a 3D house you walk ' +
    'through, with a Buy mode to place furniture. Barbers, restaurants, clubs and gyms are 3D ' +
    'too. On an older phone, choose Lite in Settings. Refresh to get it; your game is saved.',
} as const;

/**
 * The note every player gets in their inbox when a release changes how the
 * game plays. Bump `id` for each new note; the engine sends each id once.
 */
export const RELEASE_NOTE = {
  id: 'release-2026-10-07-wave8',
  text:
    'Big update: your city is now the real city. Every map is built from real streets, coastline, ' +
    'bridges and buildings (© OpenStreetMap contributors), with landmarks like the Golden Gate, ' +
    'the Bay Bridge, Third Mainland Bridge and Tower Bridge. You now see what you do: sit in the ' +
    'barber chair for a haircut, eat at the table, dance at the club, work out at the gym. Flights ' +
    'have a full cabin. Send money to friends, invite them home, plan hangouts and attend tech ' +
    'events from the Events app. The screens are cleaner too. Refresh to get it; your game is saved.',
} as const;

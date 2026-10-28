/**
 * Release notes that switch game behaviour on (docs/adr/0001: replay safety).
 *
 * A switch is the logged `system.announce` of its note, never the clock: a
 * command log replays every command before the note exactly as it first ran,
 * and every command after it with the new behaviour.
 *
 * A brand-new world logs only the newest note, so each switch is also on
 * when any later note is in the log (RELEASES is in release order).
 */
import type { World } from './types.js';

/**
 * Founder Journey 4a: decision events and visible rivals. Worlds that never
 * logged this note (every world before this release, and engine test worlds
 * that don't announce it) settle exactly as before.
 */
export const JOURNEY_EVENTS_NOTE = 'release-2026-10-15-journey-events';

/**
 * Founder Journey 5: exits and the capital allocator. New commands only
 * change worlds they're issued in; this note switches on what changes
 * existing play: an exit (sold company) is counted as realised wealth.
 */
export const EXITS_NOTE = 'release-2026-10-16-exits';

/**
 * Phase 3: life bars (lifebars.ts). Health and stress join energy, and
 * happiness is read from fun and social. Walking costs hours and energy
 * (`city.walk`), rides cost a little time, everyday acts move the bars, the
 * bars settle each month, and how you feel nudges sales and pitch odds.
 * Phase 5 life events ship under the same note (lifeevents.ts): choice cards
 * for every player, drawn at settlement and answered with `event.choose`.
 * Worlds without this note play exactly as before (`city.walk` is unknown).
 */
export const LIFE_BARS_NOTE = 'release-2026-10-17-life-bars';

/**
 * The jobs rework (work.ts): professional employers in every city (a bank, an
 * investment firm, a tech company, an engineering firm, a consultancy, a law
 * firm and a hospital), each with a career ladder you apply for, are
 * interviewed for in person and are hired or turned down with a reason.
 * Experience per field, promotion and payroll pay. Worlds without this note
 * play exactly as before (the employers never open; `job.apply` is refused;
 * part-time jobs pay as they always did).
 */
export const JOBS_NOTE = 'release-2026-10-19-jobs';

/**
 * The investor career (investor blueprint): the career ladder and its
 * invitations, the angel ceiling (a cheque cap and a lead for Series A and
 * later), the investor first session, monthly marks, and the settlement work
 * of syndicates, LP funds, the exchange and firms. New commands only change
 * worlds they're issued in; this note switches on what changes existing play.
 * The bigger mall ships with it too (data/mall.ts: ten more shops and their
 * things, sold by `mall.buy` only once this note is logged) and shopping
 * with a friend (malltrips.ts).
 */
export const INVESTOR_NOTE = 'release-2026-10-20-investor-career';

/**
 * Investor deal flow (dealflow.ts, lpreview.ts): founders pitch investors at
 * tech events, hosted events and hangouts (each pitch joins the pipeline),
 * AI investors talk strategy and refer deals (lessons learned, skill and LP
 * credibility), and LP pitches are judged on the fund's strategy (size,
 * cheque, companies, reserves, ownership, terms) and its track record, with
 * questions, reasons and commitment sizes. Worlds without this note play
 * exactly as before.
 */
export const DEALFLOW_NOTE = 'release-2026-10-23-investor-dealflow';

/**
 * City places (places.ts, data/places.ts): each city's prominent buildings
 * as named places with a purpose. Government offices see residents by
 * appointment (`place.book`, then go in at the booked time), members' places
 * open by player type, and inside each one there is something to do
 * (`place.use`). Worlds without this note play exactly as before (both
 * commands are unknown and the views list no places).
 */
export const PLACES_NOTE = 'release-2026-10-23-city-places';

/**
 * More games (games.ts, bowling.ts): a bowling alley, a skydive centre and a
 * heliport open in every city; ten-pin bowling in a play room (solo, against
 * AI or other players, the engine rolling every ball), and skydives and
 * helicopter tours to book. Worlds without this note play exactly as before
 * (the venues never open; bowling rooms and `games.*` are refused).
 */
export const MORE_GAMES_NOTE = 'release-2026-10-23-more-games';

/**
 * Bankers (banks.ts, bankers.ts): negotiating with shareholders, the licence
 * process (fit-and-proper interview, business plan, key hires, systems and a
 * branch), advisory work, conversations at banks and institutions, and the
 * banker tutorial and journey. Worlds without this note play exactly as before.
 */
export const BANKERS_NOTE = 'release-2026-10-24-bankers';

/**
 * Shopping online and the catalogue (catalog.ts, data/catalog.ts): every
 * shop's things in one catalogue with pictures, options (a finish, a fabric,
 * a warranty, a brand, a paint …) each priced in the engine's data, and a
 * Shop app that orders them online for delivery to your home (a delivery
 * fee and a wait; in person stays instant and free, and trying clothes on
 * or shopping with a friend stays an in-person thing). Walls and dividers
 * to split your home into rooms (`home.wall.*`), and room names
 * (`home.room.label`). Worlds without this note play exactly as before
 * (options, delivery and the wall commands are refused).
 */
export const SHOP_NOTE = 'release-2026-10-25-online-shop';

/**
 * The game-feedback round (fix-game-feedback): changes to existing play from
 * the players' feedback. A banking licence review takes 30 days and one month
 * end instead of 60 days and two. Worlds without this note play exactly as
 * before.
 */
export const FEEDBACK_NOTE = 'release-2026-10-25-game-feedback';

/**
 * Round 7 gameplay (sales and the team): leads are the kinds of business an
 * industry really sells to, a lost deal names the one real reason (luck only
 * when it was luck), budget and timing losses come back on a date, every
 * customer counts the same everywhere, and hires do their job (a salesperson
 * brings leads from their sector, runs discovery and lifts the chance; a
 * technical co-founder lifts demos; a business co-founder brings warmer leads
 * and a better pitch; everyone gets better with the months). Worlds without
 * this note play exactly as before.
 */
export const GAMEPLAY_NOTE = 'release-2026-10-28-gameplay';

/** Every behaviour-switching note, oldest first. */
export const RELEASES = [
  JOURNEY_EVENTS_NOTE,
  EXITS_NOTE,
  LIFE_BARS_NOTE,
  JOBS_NOTE,
  INVESTOR_NOTE,
  DEALFLOW_NOTE,
  PLACES_NOTE,
  MORE_GAMES_NOTE,
  BANKERS_NOTE,
  SHOP_NOTE,
  FEEDBACK_NOTE,
  GAMEPLAY_NOTE,
] as const;

/** Is `note` (or any later release note) in this world's log? */
function releaseOn(w: World, note: (typeof RELEASES)[number]): boolean {
  const notes = w.announcements ?? [];
  return RELEASES.slice(RELEASES.indexOf(note)).some((n) => notes.includes(n));
}

export const journeyEventsOn = (w: World): boolean => releaseOn(w, JOURNEY_EVENTS_NOTE);
export const exitsOn = (w: World): boolean => releaseOn(w, EXITS_NOTE);
export const lifeBarsOn = (w: World): boolean => releaseOn(w, LIFE_BARS_NOTE);
export const jobsOn = (w: World): boolean => releaseOn(w, JOBS_NOTE);
export const investorOn = (w: World): boolean => releaseOn(w, INVESTOR_NOTE);
export const dealflowOn = (w: World): boolean => releaseOn(w, DEALFLOW_NOTE);
export const placesOn = (w: World): boolean => releaseOn(w, PLACES_NOTE);
export const moreGamesOn = (w: World): boolean => releaseOn(w, MORE_GAMES_NOTE);
export const bankersOn = (w: World): boolean => releaseOn(w, BANKERS_NOTE);
export const shopOn = (w: World): boolean => releaseOn(w, SHOP_NOTE);
export const feedbackOn = (w: World): boolean => releaseOn(w, FEEDBACK_NOTE);
export const gameplayOn = (w: World): boolean => releaseOn(w, GAMEPLAY_NOTE);

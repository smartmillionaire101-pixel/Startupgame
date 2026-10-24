/**
 * The note every player gets in their inbox when a release changes how the
 * game plays. Bump `id` for each new note; the engine sends each id once.
 *
 * Logging a note is also a switch (see the engine's releases.ts): this one
 * turns on shopping online and the catalogue (a Shop app on the phone, every
 * shop's things with pictures, options and prices, delivery with a fee and a
 * wait) and walls and dividers for your home, and, being later, the banker
 * update (negotiating with shareholders, the licence process at the Central
 * Bank, the banker's first session and journey), more games (a bowling
 * alley, a skydive centre and a heliport in every city), realistic first
 * funds (a suggested Fund I size, first-time-manager LPs, the anchor effect
 * and rolling closes), city places (named buildings, members' doors and
 * government appointments), investor deal flow (founders pitch investors at
 * events, investors talk strategy, LPs judge a fund's strategy), the
 * investor career, the jobs rework, Phase 3 life bars and Phase 5 life
 * events, Founder Journey 5 (exits) and 4a (decision events and visible
 * rivals) for new worlds.
 */
import { SHOP_NOTE } from '@runway/engine';

export const RELEASE_NOTE = {
  id: SHOP_NOTE,
  text:
    'New: shop online and a catalogue. The Shop app on your phone sells everything the shops ' +
    'do, from groceries and clothes to furniture and cars, delivered to your home for a fee ' +
    '(express is quicker). Every item has a picture and options, a finish, a fabric, a ' +
    'warranty or a paint, each with its own price; filter by category and sort by price. ' +
    'Going in person stays instant and free, and that is still where you try clothes on. ' +
    'Walls and dividers are here too: buy a wall, a half wall, a glass divider, a sliding door ' +
    'or a bookshelf, place it in Buy mode at home to split your flat into rooms, and name ' +
    'them. Refresh to get it; your game is saved.',
} as const;

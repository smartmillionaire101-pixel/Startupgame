# Wave 12: Deeper experiences

The owner's brief after the fixes wave:

- Flights are charged when booked.
- Every experience is something you actually play, compete in and want to come back to, not an animation.
- The home is as immersive as the reference: a cut-away 3D house seen from above, with:
  - green walls, furnished rooms and people living in them;
  - a pool with loungers;
  - a gated drive with parked cars;
  - a carport.

Later waves, in order:
1. Each role's journey in depth (banker, investor, founder).
2. Security hardening before the official launch.

## Rules for every part

- **The engine stays deterministic.** Use `deriveRng`, never `Math.random`.
- **Money is conserved.** All money moves through the double-entry ledger. Stakes are held in escrow and paid out, never created.
- **Command schemas only grow,** because logged commands are replayed.
- **New engine code goes in new files.** `commands.ts` and `dispatch.ts` only gain the lines that wire it in.
- **Everything works on a phone, with Lite quality and with reduced motion.** It is accessible with names on controls, and all text is translated (`fr`).
- **Each part has tests:**
  - engine unit tests, with the money-conservation property test extended to cover the new money paths;
  - an E2E test for each new experience;
  - screenshots that have been looked at.

## A. Games you play for real, with stakes

**Quiz night**
- At bars, a quiz night is a real quiz: timed multiple-choice rounds from a large deterministic question bank (general knowledge, business and tech, the player's cities, sport, music).
- Players can host their own quiz at home. They write their own questions or pick packs, set the entry stake, and invite friends.
- Real players and AI players join. Everyone answers live, a scoreboard shows after each question, and the winner takes the whole pot. A split rule settles ties.

**Snooker / pool**
- A playable table with aim, power and cue-ball physics.
- Head-to-head against a real player or an AI player, with a stake.

**Video game night at home**
- A playable football match (a simple, fun 2D or 3D mini-game) between host and guest, or against AI, with a stake.

**More games**
- Darts, cards (whot or blackjack-style) and table football, where they fit.

**Stakes**
- Entry fees go into an escrow account and are paid out to the winner at the end, all inside the ledger.
- Stakes have per-lifestyle limits, and nobody can bet more than they hold.
- Results are server-checked: for real-player matches the server decides winners from submitted moves or answers, not from a client's claim. Quiz answers are scored on the server.

**Retention**
- A leaderboard per city and per game.
- Rematches.
- Winning streaks feed the player's reputation and fun.

## B. The home: like the reference image

**The house**
- A full cut-away 3D house seen from a three-quarter top view, with:
  - coloured walls with sconces, rooms with doors, floors and rugs;
  - a living room with sofas and TV, a kitchen with an island, a dining table, bedrooms, a study and a bathroom;
  - a pool with loungers and an umbrella, hedges, a gate, and a drive;
  - a garage or carport for each car the player owns.
- The size of the house follows the property tier and wealth: studio, apartment, townhouse, villa, mansion, penthouse, each with more rooms. A mansion has a pool, a multi-car garage and gardens.

**Garages**
- Every car owned is parked.
- The garage grows with the number of cars.
- Special garages by car type: a supercar showroom garage, an SUV carport, a classic-car bay.

**Ordering furniture and moving in**
- Ordering furniture or a whole house setup brings a delivery van that drives up and parks in front of the house. Movers carry the boxes in.
- Friends who are online (or AI friends) can be invited to help move in. Each helper speeds it up and warms the friendship.
- Moving in to a new property plays the same scene.

**Every object can be used**
- Every piece of furniture has interactions, with the avatar animating at the object:
  - the bed: sleep, nap;
  - the sofa: sit, chat;
  - the TV: watch, or play the football game (part A);
  - the kitchen: cook;
  - the dining table: eat, host dinner;
  - the pool: swim, lounge;
  - the desk: work;
  - the bookshelf: read;
  - the shower: shower;
  - cars: drive out.

**Buying with a mortgage**
- A property mortgage goes through a real bank: the player's own bank (a player-owned bank, if one is in their city and has the capital) or an AI bank.
- There is an application with affordability checks against income and credit, an offer, and acceptance. Monthly repayments come out of the ledger, and falling behind sends warnings and then repossession.
- This is where the banking gameplay starts; bankers in a later wave will underwrite these loans.

## C. Views and dates

**Sky views**
- The London Eye, cable cars (for example the Emirates Air Line in London, Table Mountain or the equivalent where the city has one) and observation decks (Salesforce Tower, Burj Khalifa) take you up into the real 3D city.
- You see the whole skyline from height, and you can turn, tilt and zoom to explore, with landmarks labelled.
- The ride itself moves the camera along the wheel or cable.
- It works in day, sunset and night light.

**Dates**
- On a date, two players (or a player and an AI character) can:
  - hold hands while walking;
  - sit together, share a meal or a view;
  - choose flirt, compliment, joke or deep-talk lines, with a chemistry meter that responds.
- Both players must agree to each step (hold hands needs the other person's yes).
- No sexual activity of any kind.
- Dates go to venues and sky views.

## D. Real time of day, and fares at booking

**Sunlight**
- The sun, sky, shadows and lights follow each city's real local sunrise and sunset, computed from the city's latitude and longitude and the real date.
- The 3D city, interiors, the home and the 2D map all use the one shared sun.

**Fares**
- `travel.book` (a new command) charges the fare when you book and issues a ticket held in the world.
- Boarding with a ticket doesn't charge again.
- Cancelling before departure refunds the fare minus a small fee.
- The airport and Travel app UIs use it.

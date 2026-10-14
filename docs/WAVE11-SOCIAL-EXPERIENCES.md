# Social experiences update

## Preview

Run `npm run dev` at the repository root. Open the Vite URL (normally http://localhost:5173).
The server normally listens on http://localhost:8787 and saves its world to
`apps/server/data/runway.db`. This update adds fields to the saved world; it does not reset players.

Use **Together** in the game header for games, deliveries, dates and skyline rides.
For multiplayer, use two signed-in accounts in separate browser profiles, or a normal and private
window. Players need to be in the same city. To play at a friend's home, send and accept a home
visit invitation through Friends first. Public bar games are available from the venue's scene.

## Included

- Flights charge at booking and persist a paid ticket on the server. Boarding consumes that ticket
  without charging again. Cancellation refunds the original amount. Older clients that call
  `travel.fly` directly still perform an atomic booking and boarding.
- Quiz rooms have timed questions, locked answers and server scores. Hosts can write 3–20 questions
  with four answers each. A custom quiz author is the quizmaster and cannot compete in their own
  quiz. The built-in quiz allows its host to play.
- Snooker is a two-player short frame: aiming, power, cushions, collisions, pockets, red/colour
  scoring, fouls and alternating turns. Frames end when the table clears or after 60 shots/turns.
- Football is a two-player penalty shootout. Shooter and goalkeeper choose independently;
  neither can see the other's choice before resolution. Five penalties each, followed by up to
  five sudden-death pairs. This is not a full pitch football simulation.
- Stakes use virtual game currency only. Joining transfers the stake into an escrow account.
  One winner receives the whole pot. Ties refund every entry. Waiting players can leave for a
  refund; the host can cancel before starting. Rooms idle for 30 minutes are refunded on the next
  world command. Paid games require matching personal-account and venue currencies; free games
  accept visitors. Relocation is blocked while a paid game is outstanding.
- Home Buy mode orders furniture for delivery. Food orders also arrive at home instead of
  immediately changing hunger. The van travels to the door over 30 seconds; the owner or an
  invited friend can unpack the delivery. Up to eight parcels can be pending. Showroom and Buy mode purchases use `home.order`; the older `home.buy` command remains
  compatible with older clients that install purchases immediately.
- The showroom can add cars to a collection, up to eight. Every car incurs running costs. Players
  can select their current car and sell it individually. The 3D garage displays one bay per car,
  with chargers for electric models and display platforms for premium/sport models. Visiting
  friends see the host's cars. Home size and estate style follow the existing lifestyle/property
  tiers; Homes provides the existing purchase and mortgage flow.
- Dates require an accepted invitation. Players can compliment, flirt, laugh and point out the
  skyline. Holding hands needs a request and the other player's acceptance. Either can let go
  or end the date. There are no sexual interactions.
- London Eye, scenic cable-car and rooftop views support looking around, zoom, pausing and landmark
  focus. These are stylised 3D views using the existing OpenStreetMap extract, with modelled London
  landmarks, river, roads and night windows. Map coverage follows the committed city extract,
  rather than all buildings in the metropolitan area. Scenic cable cars use fictional routes, not real transit schedules or route geometry.
- City sunlight follows the real date and city coordinates. Solar position, dawn/dusk and sunrise/
  sunset use the [NOAA approximation](https://gml.noaa.gov/grad/solcalc/solareqns.PDF).
  This changes lighting in the 3D city, homes, venues, ride scenes, flight scenes and panorama;
  it does not simulate live weather. Browser clocks drive the visual light; game actions and
  deadlines use server time.

## State and validation

Game rooms, scores, escrow accounts, tickets, delivery orders, car ownership and dates are part of
server world snapshots and command replay. Quiz answer keys and other players' uncommitted choices
are excluded from player views. Frontends poll active experience views every 1.5–2 seconds.
Furniture placement remains the existing device-local layout; ownership and delivered items are
shared. The missing house reference image has not been matched.

Engine tests cover booking/refund/no double charge, custom quiz payouts and hidden answers,
access checks, cancellation/expiry/tie refunds, football choices, deterministic snooker physics,
delivery timing and friend access, car ownership/upkeep, and mutual consent for hand holding.
Browser tests cover multiplayer football, a three-player custom quiz, dates and panorama controls,
delivery collection and ticket persistence. Run `npm test`, `npm run typecheck`, `npm run lint`,
and `npm run e2e -w @runway/web -- experiences.spec.ts`.

## Following phases

1. Map banker, investor and founder journeys in depth. For bankers, define player-operated deposits,
   lending decisions, credit assessment, liquidity, capital, repayments, arrears and bank growth;
   for investors, diligence, portfolio decisions and exits; for founders, product, hiring, revenue
   and fundraising loops. Specify actions, choices, feedback, progression and failure/recovery.
2. Implement and playtest those journeys before adding further experience types.
3. Perform the dedicated pre-launch security review across identity, sessions, authorisation,
   transactions, replay/concurrency, data exposure, abuse/rate limits, deployment and recovery.
   The checks in this update are not a completed security audit or a launch-readiness claim.

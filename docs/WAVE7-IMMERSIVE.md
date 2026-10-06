# Wave 7: Immersive life, travel and phone

## Player feedback after Wave 6

- They couldn't quit a job. This is fixed in PR 15.
- The game isn't immersive. Avatars are too big, and the home "looks funny".
- Homes should be seen from above (bird's-eye view). You should be able to walk around them, go to bed, use the bathroom, watch TV and invite friends.
- Bike, taxi, bus and plane trips should be experienced: you're on the bike, in the taxi or the bus, in the cabin, or a camera follows you over the city. A Skip button should take you there faster.
- The airport should be busy, with flights coming and going.
- The phone needs real apps tied to the city: gym, food ordering, banking, investing and more.
- The UI/UX has to improve significantly.

## Inputs

- **Research:** patterns from The Sims (pie menus, needs), Stardew Valley (top-down home, bed), Habbo, BitLife, the GTA V phone, Uber/Bolt, Citymapper, Pocket Planes, Mini Metro, Alto and Duolingo.
- **UX audit:** 241 screenshots at 390px and 1280px, saved in `/tmp/claude-0/-home-user-Startupgame/84b2ef13-b197-5b4d-bc9e-1bc61e130f92/scratchpad/audit/shots/` (read-only; look at them).
- **Key measured problems:**
  - Map avatar is 19×56 px against a 64×32 tile, while shop walls are 15–34 px. People are as tall as buildings.
  - "What to do now" covers about 40% of the phone map, and it reappears during rides.
  - There is no depth sort, so people are drawn on roofs. Labels scale with zoom until they are huge.
  - The home is a front-on room with "ghost" furniture at 14% opacity and a static figure.
  - A ride is a 3–4 s slide of a coloured box, with no Skip.
  - The flight is the same empty-sky frame for take-off and landing, then a crude map.
  - The airport has 4 people and a departures board with no text.
  - The phone has 6 apps and a Map app that is just a list.
  - Six tabs plus the phone, HUD buttons and pills compete for attention, and "Home" means two things.
  - Day-one stats contradict each other ("Profitable / Default dead" at ₦0, "Public warning").
  - The map is one 8k-node SVG that repaints its viewBox every frame. The bundle is a single 789 KB file.

## Principles

- Fewer, bigger, purposeful elements.
- The world stays visible; menus are bottom sheets.
- Primary actions sit in the bottom thumb zone.
- Every state change gets feedback: 150–250 ms ease-out, counters that tick, floating +/− numbers.
- Respect `prefers-reduced-motion` and an in-game "Reduce motion" setting: no parallax, cuts instead of slides.
- Every animation can be skipped.
- Phone first, at 360–430 px wide.
- Keep animated SVG nodes under about 150 per frame. Use one requestAnimationFrame loop per scene, write transforms through refs, never `setState` per frame, and pause when the tab is hidden.

Four parts are built in parallel. Contracts are exact; file ownership is strict (see each part).

---

## A. Life at home (packages/engine + new `apps/web/src/home/`)

### Engine: needs and home actions

`Player` gains `needs?: { hunger: number; hygiene: number; fun: number; social: number }`, each 0–100. New players start at 80. Old saves are backfilled with 70.

**Decay:**
- At each personal settlement (a market month): hunger −35, hygiene −30, fun −25, social −20, clamped at 0.
- Recovery happens through actions and through existing venue activities:
  - food and drink items → hunger +30;
  - `fun`/`activity` items → fun +(fun×4);
  - meetings and events → social +20;
  - gym → hygiene −10 and fun +10.

**Mood** = round(average of energy and the four needs). `view.me.mood` is 0–100.
- Mood below 30 gives −10% hours next month.
- Mood above 75 gives +5% hours.
- Show a small notification when a need drops under 25.

**New command** `{ type: 'home.act', act }`. Each act has a monthly use cap (counted in `me.homeActs: Record<act, {month, n}>`) and costs money only where stated (paid to `m.ext.lifestyle`):

| act | effect | cap/month | cost |
|---|---|---|---|
| sleep | energy +25 | 3 | — |
| nap | energy +8 | 6 | — |
| shower | hygiene +45 | 6 | — |
| toilet | hygiene +10 | 10 | — |
| cook | hunger +45 | 6 | 0.02 col (groceries) |
| snack | hunger +15 | 10 | 0.005 col |
| tv | fun +15; with a tv item: +25 | 6 | — |
| game | fun +25; needs the gaming slot | 4 | — |
| read | fun +10, hours +2 | 4 | — |
| work | hours +4, needs the desk slot; adds to company progress like `company.build` if the existing engine allows (otherwise just hours) | 4 | — |
| workout | energy −5, hygiene −15, fun +10 | 4 | — |

**New command** `{ type: 'home.invite', personId: string }`:
- `personId` is any contact chatId, a player id, or an `npc:`/`fund:` id in your city.
- Effect: social +30, fun +10, and the contact's warmth +0.1 (the same warmth logic as a meeting).
- Costs 0.03 col of snacks. Cap 3 a month.
- For a human guest, notify them: "{name} invited you over."

**New command** `{ type: 'food.order', businessId, itemId }`:
- Delivery from a food business in your city, from wherever you are in that city.
- The item must be food (not an activity or a meeting).
- Price + 15% delivery fee, paid to the business (it counts as takings).
- Hunger +35.
- `marketView` adds `delivery: { businessId, name, items: [{id,label,price}] }[]` for open food businesses: up to 20, cheapest first.

**Rules:**
- Deterministic: no RNG needed.
- The money-conservation property test must cover `home.act`, `home.invite` and `food.order`.
- Unit tests cover caps, effects, mood and the hours effect.

### Web: the home you walk around (`apps/web/src/home/*`, new)

`HomeScene.tsx` replaces the apartment room. The only edit to `PlaceScene.tsx` is one early branch: `if (room === 'apartment') return <HomeScene …/>`.

**Camera:** a top-down 3/4 view, like Stardew Valley. Walls show their front face (Sims "walls down").

**Size grows with lifestyle tier:**

| tier | home | grid (tiles) |
|---|---|---|
| 1 | shared room | 8×8 |
| 2 | flat | 10×10 |
| 3 | good flat | 12×12 |
| 4 | house | 14×14 |
| 5 | penthouse | 16×14 |

Rooms: bedroom, bathroom, kitchen and living room. Tier 1 has a shared bathroom door, and so on.

**Tiles and furniture:**
- Tile 32 CSS px at zoom 1. The camera fits the width on phones and pans or follows if the grid is larger.
- Furniture comes from `me.home` owned slots, placed at fixed per-tier grid positions with real footprints (bed 2×3, sofa 3×1…). Each piece has a `blocked` footprint and an `interact` tile.
- **Unowned slots are not drawn as ghosts.** Show an empty floor, plus a subtle "+" hotspot that opens the right showroom.

**Avatar:**
- 40 px tall (1.25 tiles), with a soft ellipse shadow. Use `AvatarFigure` scaled down.
- Depth-sort everything (people and furniture) by base y.

**Movement:**
- Tap a floor tile to walk there: A* with 4-way moves and Manhattan distance, about 3.5 tiles/s.
- Show a shrinking tap ring and a dotted path.
- If the tap lands on a blocked tile, walk to the nearest walkable tile.
- Separate taps from pans with an 8 px threshold.

**Objects (pie menu):**
- Tapping an object opens up to 4 verb chips (≥48 px) in an arc above it.
- Choosing a verb walks you to the object's interact tile, plays a 1.5 s action loop (sleeping Zzz, shower steam, TV glow, cooking pan…), then sends `home.act`.
- Show floating "+25 energy" numbers. When an act is used up this month, say "Done for this month".
- Verbs:
  - bed: Sleep / Nap
  - shower: Shower
  - toilet: Use
  - fridge/kitchen: Cook / Snack / Order in (→ phone Chop app)
  - TV: Watch
  - console: Play
  - desk/laptop: Work / Read
  - sofa: Sit / Invite friend (→ contact picker)
  - door: Go out (closes the scene)

**Guests:** after `home.invite`, the guest walks in from the door and sits on the sofa, for this session only (client-side, max 4).

**HUD in the scene:**
- Top: mood ring and four need icons. Only needs under 40% get a pulse.
- Bottom bar: Edit (opens showrooms list), Invite, Go out.

**Also:**
- Day/night tint from the city's local time.
- French strings in a new i18n file registered in the fr index.
- E2E `home.spec.ts`: enter home; the grid renders; tap a floor tile and the avatar moves; tap the bed, then Sleep, and energy rises and the float shows; tap the fridge, then Cook, and money and hunger change; Invite a contact and a guest appears.

---

## B. Travel you experience (apps/web: `city/ride/*` new, `Transport.tsx`, `travel.ts`, `Flight.tsx`, airport parts of `Interiors.tsx` and `rooms.ts`, plus the ride hook in `CityMap.walkTo`)

### Ride interludes

When a ride starts, a full-screen `RideScene` overlay plays. The map still animates underneath, so `done()` is unchanged.

**Every mode has:**
- Duration scaled by distance, clamped to 5–12 s (walk 5–8).
- A top card in Uber style: destination, ETA countdown and fare.
- **Skip ›** (48 px, bottom-right) appears after 0.5 s and jumps straight to arrival.
- An **"Always skip rides"** toggle after the second ride, stored in localStorage and also shown in phone Settings.

**Per mode:**
- **Walk:** a top-down follow camera on a procedural street strip, with a few walkers and vendors.
- **Bike/okada/keke:** side-view parallax in 3–4 layers (sky by time of day, the city skyline in the city's palette, mid buildings and billboards, road dashes). The rider has a 2-frame pedal cycle.
- **Taxi:**
  1. 2 s booking card: the car icon crawls to you, then "Driver arriving", the plate and a rating.
  2. Back-seat interior: driver's head, dashboard, street parallax in the windows, and a mini-map card with the car moving and rotating along the real route.
  - There is a chance of a "go-slow" (traffic jam) line that adds to the ETA, but only as text.
- **Bus/danfo/matatu/poda-poda:** a side-view interior with seats, NPC passengers and a conductor, and a stop ticker naming real districts along the route.
- **Reduced motion:** a bird's-eye "chase" on the existing map (camera follows the vehicle icon), no parallax.

**Map fixes:**
- Your vehicle on the map is distinct: a highlight ring and your colour.
- "What to do now" stays hidden during a ride. Coordinate with D, which owns CityScreen; B exposes `isRiding` via the existing bus or context.

### Airport and flights

**The airport scene** replaces the `AirportInterior` room for the airport place. It has three parts, top to bottom:

1. **Departures board:** split-flap style, amber on black, 6 rows (time, flight number, destination, gate, status: Boarding / Delayed / Departed / Landed). Characters flip with a staggered animation.
   - The schedule is deterministic from `hash(airport, game day)`.
   - Destinations are real game markets.
   - Airline names are fictional local ones.
2. **Apron, top-down:** 3–4 gates, a taxiway and a runway.
   - At most 6 small plane silhouettes, each looping pushback → taxi → takeoff roll (scale up and fade) or landing in reverse.
   - Something moves every 2–4 s.
   - 1–2 ground vehicles.
3. **Terminal strip:** 8–12 travellers walking.

**Bottom sheet "Your trip":** Check in → Security → Lounge (meet an investor, using the existing Who's here at the airport) → Board.
- Each step is a 1–2 s micro-animation and can be skipped.
- Departures shows times, airline, flight number and price.

**Flight scene:**
1. Take-off from the apron view, with the camera close to the plane.
2. **Cabin:** a window seat with an oval window, clouds parallax, day/night sky, a seatbelt sign, a meal cart and a progress arc ("6h 20m" as text).
   - "Sleep through" (energy +10 via `home.act` nap is not available away from home, so this is cosmetic only) and "Work on laptop" (cosmetic).
3. Landing at the destination airport scene, with a distinct frame.
- Total about 12 s. Skip is always available.
- Freetown arrival (Lungi airport) shows a short ferry/water-taxi leg across the estuary.

**E2E `travel-scenes.spec.ts`:** taxi ride shows the interior and Skip arrives; bus shows the stop ticker; bike shows the parallax; airport board shows ≥6 rows and moving planes; fly, see the cabin, Skip, and arrive. Update `travel.spec.ts` as needed.

---

## C. The phone (apps/web/src/phone/*)

**On phones it looks like a phone:**
- Rounded frame edge, status bar (city time, signal, battery = energy).
- Home screen: 4-column grid of 56 px icons with labels, a dock of 4 (Messages, Map, Bank, Founder), and red badges.
- Notification banners slide down for 3 s and can be tapped.
- Each app opens to its main action and Back returns to the home screen.

**Apps (one job each):**

| App | What it does |
|---|---|
| Messages | as today |
| Contacts | as today; adds Invite over (→ `home.invite`) and Chat |
| Rides | Bolt style: pick a destination place, see walk/bike/bus/taxi time, cost and energy, Book → uses the existing ride flow (navigate to the place with the chosen mode) |
| Chop | food delivery: list `here.delivery`, order → `food.order`, shows "Arriving in 20 min" then a toast |
| Bank | personal and USD balances, recent transactions (`view.me.lastMonth` and any ledger lines in view), loans (borrow/repay with existing commands), credit score |
| Invest | portfolio of your stakes (investors) or cap table (founders), deal flow (`view.here.dealFlow`, `invest.quick`), city "stock" tickers derived from company valuations; news hints price moves |
| Fit | gyms in the city with "Go" (navigate); shows energy, mood and needs |
| Jobs | as today, plus Quit (already added); group by level; icons per business category |
| Founder | your company dashboard: runway, burn, MRR, team, quick actions linking to the Company tab |
| News | city headlines (move the News tab content here; D removes the tab) |
| Map | a real mini map (a simple schematic of districts and places from the layout, with tap to go) instead of a list |
| Travel | flights from here (times, prices), Book → the airport |
| Home | needs, mood, what you own, Edit (showrooms), Invite |
| Social | a feed of city happenings: new businesses opening, events, deals, other players' milestones (from inbox/news data); post your own milestone, cosmetic |
| Settings | Reduce motion, Always skip rides, Sound (cosmetic), Language |

- Start the grid with all apps. An app with nothing to show says so plainly.
- The phone button must not cover content. D moves it into the top bar; C exposes `openPhone()`.
- **E2E:** update `phone.spec.ts`; add `phone-apps.spec.ts` (order food in Chop and money goes down; Bank shows the balance; Invest lists deal flow; Map taps a place and goes there; Settings toggles reduce motion).

---

## D. UI overhaul and the map (apps/web: `App.tsx`, `styles.css`, `screens/*`, `city/CityScreen.tsx`, `city/CityMap.tsx` except the `walkTo` ride hook, `city/Crowd.tsx`, `city/art.tsx`, `city/layout.ts`, `city/city.css`, `vite.config`)

**Scale:**
- Map avatar and passers-by drawn at 0.5 (about 26 px tall at zoom 1).
- Vehicles at a scale consistent with buildings.
- Interiors keep their size.

**Depth sort:** people and vehicles are sorted with buildings by iso base y, so nobody walks on a roof.

**Labels:** counter-scale with zoom so they stay 11–13 px, and hide less important labels at low zoom.

**Zoom:** fit the city bounds tightly (less empty sea or beige). The default zoom shows about 6×6 blocks around you.

**"What to do now":**
- Collapsed to a single chip by default (bottom-left, one line).
- Expands as a bottom sheet.
- Hidden during rides.
- The camera centres the avatar in the visible area.

**HUD:**
- Top bar, 48 px, one line, never wrapping: city + date (short "Y1 M1"), cash (count-up animation), energy/mood ring, and the phone button with a badge.
- Toasts sit above the bottom bar and never cover controls.

**Tabs:** reduce to 4 or 5.
- City; Today (was "Home": the inbox dashboard, renamed so it isn't confused with your flat); Company (founder) or Portfolio (investor) or Bank (banker); Money; Me.
- News moves to the phone.
- Glyph icons are replaced with a consistent inline SVG icon set (one stroke style). Emoji stay only inside content.

**Visual identity:**
- One display font for headings (e.g. "Space Grotesk" or "Sora" via Google Fonts, with a system fallback).
- Warmer palette tokens that match the art.
- Card hierarchy: title, one-line sub, one primary action.
- Dark mode covers the map and room art tint.
- Shorter pages: the Money page uses collapsible sections, and a first screen under about 1.5 viewports.

**Fix the day-one contradictions:**
- Runway "Profitable / Default dead" at zero revenue and zero burn should read "Pre-revenue".
- "Stars 1.0 / Public warning" on day one should read "New".
- "AI investors" becomes "Investors in town".

**Scenes (light polish, no new rooms):**
- Name tags clamp inside the view.
- The "Who's here" count equals the number of people drawn: draw up to N, show "+k" for the rest.
- Less dead space under the tray.

**Performance:**
- Cull off-screen buildings.
- Pan by `transform` on a group instead of rewriting the viewBox if it's measurably faster.
- `React.lazy` code-split for Flight, Phone, PlaceScene/HomeScene and the ride scenes.
- No source maps in the production dist (or upload them separately).
- Bundle main chunk under 500 KB.

**Also:**
- Reduced motion: honour `prefers-reduced-motion` plus the setting from C (localStorage `runway.reduceMotion`), applied as a `data-reduce-motion` attribute on `<html>`.
- Update the E2E specs that rely on tab names, the phone button or the What to do now panel.
- New `ui.spec.ts`: top bar is one line at 360 px; the avatar's on-screen height is between 20 and 34 px at default zoom; the What to do now chip is collapsed by default; tabs are ≤5.

---

## Integration

- Merge order: A (engine + home), D (UI), B (travel), C (phone).
- Run `npm run check` and the full E2E suite, then open the PR and get the preview green before asking to merge.
- New release note: `release-2026-10-06-wave7`.

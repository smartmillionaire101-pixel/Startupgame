# Wave 6: a city that's alive

Player feedback after Wave 5:

- The game is still boring. There are no nightclubs to speak of, nothing fun
  to do, too few jobs, and few things to buy (no TVs and more for the house,
  no car showrooms to visit).
- People should be met **inside buildings**, and every building should open.
- New businesses should keep appearing as players join (like AI companies), so
  the world grows. You can chat with anyone under "Who's here", and save the
  people you meet as contacts.
- AI characters don't follow the conversation.
- People's money runs out too quickly. Slow the game down.

Principle: **an economy moves when people spend.** Every fun thing a player
does costs money, and that money lands in a real business's till. The business
then pays wages (jobs), buys from startups (B2B), and grows. Jobs give players
money back. That is the loop.

Four parts, built in parallel. Contracts below are exact; anything not named
here is the builder's choice.

---

## A. Engine (packages/engine)

### A1. Pace and money

- `STARTING_RUNWAY_MONTHS` 6 → **12**. The human multiplier stays ×2.
- Living costs drop about 25% (`LIFESTYLE_TIERS[].costCol`): Lean 0.5,
  Modest 0.75, and the higher tiers scaled the same way.
- Jobs: every role pays at least **0.9 col** a month. Skilled roles pay
  1.2–2.0, and a manager or head role (where it fits) pays 2.0–3.0. A full-time
  job at Modest lifestyle must leave the player slightly ahead each month.
- Gigs pay about 30% more.
- The server's `MONTH_MINUTES` default goes 15 → **30** (part B owns that file).

### A2. Things to do (activities)

`VenueItem` gains optional fields:

```ts
fun?: number;        // 0..10, how much fun (feeds energy and the scene text)
meetChance?: number; // 0..1, chance you meet someone new here (a contact)
activity?: boolean;  // a thing to do (dance, watch a film), not just food
```

`venueBuy` result gains `met: { name: string; kind: ContactKind; refId: string } | null`.
When an item has `meetChance`, roll it on `deriveRng(world.seed, 'venue', me.id, month, <count of buys this month>)`.
On success, add a contact at warmth 0.12. Prefer someone actually "here" (see
A6): an AI founder, angel or fund partner first, otherwise a regular.

Nightclub items: entry, a dance, VIP table (meeting), bottle service (meeting).
Bars, pubs, hotels and gyms get at least one `activity` item each.

**New business kinds** (each with venue items, roles and gigs; look shapes may
reuse existing ones):

| kind | category | what you do |
|---|---|---|
| `cinema` | hospitality | watch a film, premiere night |
| `lounge` | food | cocktails, shisha, live DJ |
| `karaoke` | hospitality | karaoke room, sing a song |
| `arcade` | hospitality | arcade games, bowling lane |
| `spa` | health | massage, day pass |
| `beach-club` | hospitality | day bed, sunset party (coastal cities only) |
| `live-music` | hospitality | gig ticket, open-mic night |
| `football-pitch` | health | five-a-side game (meetChance high) |
| `art-gallery` | services | exhibition, opening night (meeting) |
| `furniture-store` | retail | showroom: sells home items (A3) |
| `car-dealer` | retail | showroom: sells cars (A3) |
| `appliance-store` | retail | showroom: sells appliances and electronics for the home (A3) |

The existing `electronics` kind also sells the electronics slots.

Every city gets at least: two nightclubs, one cinema, one lounge, a furniture
store, a car dealer, an appliance or electronics store, a spa or gym, a
football pitch, and a live-music venue or karaoke. Add them as seeds in
`CITY_BUSINESSES`, with fictional local names, real street names and existing
district ids for that city. Freetown gets the full set too.

### A3. Shops you walk into

`FurnitureSlot` grows to **at least 20 slots**: the existing 9 plus `fridge`,
`washer`, `cooling` (fan, then AC), `power` (generator or solar; in every city,
named locally), `lights`, `rug`, `dining`, `wardrobe`, `books`, `coffee`,
`wifi` and `laptop`. Three tiers each, one item per slot as now. Comfort energy
is normalised so the maximum home gives the same energy as before
(`MAX_COMFORT_ENERGY`).

Each slot has a `store` kind. These sets are exported as `SHOP_KINDS_FOR_SLOT`
and `CAR_SHOP_KINDS`:

- `furniture-store`: sofa, bed, desk, plants, art, rug, dining, wardrobe, books, lights.
- `appliance-store` (and `electronics`): tv, kitchen, sound, gaming, fridge, washer, cooling, power, coffee, wifi, laptop.
- `car-dealer`: cars.

Commands gain an optional `businessId`:

```ts
{ type: 'home.buy', itemId, businessId? }
{ type: 'car.buy', modelId, businessId? }
```

- With `businessId`: the business must be open, in your current city, and of a
  kind that sells that slot or cars (error code `shop.kind`). Money goes to
  **that business's account**, so it counts as takings.
- Without it (old clients): as today. The web always sends it.

The view adds `businesses[].sells: { slots: FurnitureSlot[] } | { cars: true } | null`.
Showrooms list the catalogue from `view.market.shop` / `view.here.shop`,
already there from Wave 5.

### A4. More jobs

- Every business kind has **at least 3 roles**: entry, skilled and lead.
- New kinds get fitting roles: DJ, bouncer, bartender, usher, projectionist,
  car salesperson, showroom manager, spa therapist, coach, gallery assistant,
  sound engineer.
- `jobsView` lists every open role in the city, sorted by pay. It should show
  at least 30 roles in every city.

### A5. Businesses keep opening

New local businesses open as people arrive:

```
targetCount(market) = rosterOpenCount + 2 × humansWhoJoinedInThisMarket (all-time), capped at roster + 150
```

At each market settlement, open up to **3** generated businesses while below
the target. When a human player is created, open **1** right away, so the
newcomer sees the city grow.

Each generated business has:

- a kind picked by weight from the kinds the city already has (food and
  services most often);
- a name generated from per-city name parts (`data/business-names.ts`: owner
  names, place words and suffixes per market, all fictional);
- a district and street taken from that city's existing seeds.

Use RNG labels `deriveRng(world.seed, 'economy', 'growth', market, month)` and
`deriveRng(world.seed, 'economy', 'growth', market, 'join', playerId)`.
Never use `Math.random`.

`LocalBusiness` gains `gen?: { name, kind, district, street, owner }`. Its
`seed` is -1, and every lookup of `CITY_BUSINESSES[m.id][b.seed]` must fall
back to `b.gen`. Generated businesses close like any other.

The view adds `businesses[].isNew: boolean` (opened within the last 2 months).
The inbox gets one market-wide line a month when anything opens:
"New in town: Mama Fatu's Kitchen opened in Aberdeen."

AI startups follow the same idea: change `aiStartupTarget` so it **grows** with
humans instead of shrinking. The target is
`AI_STARTUPS_PER_MARKET + floor(humans / 4)`, capped at +20. Wave 5's AI
angel phase-out stays.

### A6. Who's here

Each `businesses[]` entry in the market view gets
`people: PersonHere[]`. The entries are deterministic for a market month and
a time slot, using `deriveRng(world.seed, 'people', businessId, month)`, so
they don't change on every poll:

```ts
interface PersonHere {
  id: string;          // chat character id: player id, `fund:<id>`, `biz:<bizId>` (owner) or `npc:<market>:<n>`
  name: string;
  kind: 'owner' | 'staff' | 'founder' | 'angel' | 'partner' | 'regular';
  role: string;        // "Owner", "Bartender", "Founder, Kola Pay", "Angel investor", "Regular"
  playerId?: string;   // when it's a player (human staff, AI founder or angel)
  gender: 'female' | 'male';
}
```

- The owner is always there.
- Human players with a job there are listed as staff.
- Each AI founder, angel or fund partner in the city appears in exactly one
  business a month, picked by RNG and weighted to fitting kinds: angels in
  cafés, lounges and hotels; founders in cafés and co-working-like places;
  partners in hotels and restaurants. Wave 5's `angelsAt` stays.
- Food, fun and hospitality places get 2–6 regulars. A regular is an NPC with
  a name from the city's name list, a job line ("Nurse", "Taxi driver") and
  `id: npc:<market>:<n>`, stable for that `n`.

Human visitors come from server presence, which carries `place` already. The
web merges them in; the engine does not.

### A7. Saving contacts

```ts
{ type: 'contact.save', personId: string, name: string }
{ type: 'contact.remove', contactId: string }
```

- A `personId` that is a player id gives kind `player` for humans and
  `founder` for AI. `fund:<id>` gives `fund`. `biz:<id>` and `npc:...` give a
  new `ContactKind` `'local'`, with the refId set to the personId.
- Warmth is 0.15, or 0.3 if already met. Saving costs nothing and is limited
  to people in your current city (validated where possible; NPCs are trusted
  by id shape).
- `view.me.contacts[]` entries gain `chatId` (the id to open a chat with).
- A cap of 300 contacts drops the coldest one first.

Tests cover: money conservation (the property test includes `contact.save`,
the new venue items, shop buys with `businessId`, and growth), jobs at least
30 per city, every city having the required kinds, growth determinism, and
"a full-time job at Modest stays solvent for 24 months".

---

## B. Server (apps/server, netlify)

### B1. Pace

- `MONTH_MINUTES` default **30**. Update the tests.
- Write a new `RELEASE_NOTE` with id `release-2026-10-06-wave6`, short and in
  plain words: nightclubs and things to do, showrooms, more jobs, the city
  grows, Who's here, AI that listens, slower months, keep your progress.

### B2. AI that follows the conversation

`/api/ai-chat` keeps its API shape. Replies come from one of two paths.

**Claude (when `ANTHROPIC_API_KEY` is set).** Use the official
`@anthropic-ai/sdk`.

- Model: `process.env.AI_CHAT_MODEL ?? 'claude-opus-5-5'`, with
  `output_config: { effort: 'low' }` and `max_tokens: 600`.
- Server-side refusal fallbacks: the beta `server-side-fallback-2026-07-01`
  with `fallbacks: 'default'`.
- System prompt: a frozen general rules block with `cache_control`, then a
  character block. The character block holds the persona plus **live facts**
  built from the existing template data (fund thesis and cheque sizes, company
  numbers, what a business sells and buys, where to meet), in the player's
  language.
- Messages: the last 16 turns of the thread.
- Rules for the character:
  - stay in character and keep it short (1–3 sentences);
  - answer what was actually asked and refer back to earlier messages;
  - never invent numbers beyond the facts given;
  - never claim to have done an in-game action; suggest the player do it
    ("come by the café and pitch me").
- Timeout 10s. On any error, refusal or empty answer, fall back to templates.
- Per-user budget: `AI_CHAT_DAILY_LIMIT` (default 80) Claude replies a day,
  templates after that.
- Nothing about the key is ever logged.

**Templates (always available).** They now track the conversation:

- They remember the previous intent and the topics already covered (stored
  with the thread).
- Follow-ups ("yes", "ok", "tell me more", "how much?", "when?", "where?",
  "why?") continue the previous topic with the next unused detail.
- They never repeat a line already sent in that thread.
- They greet only on the first message, and pick up the player's own words
  (their company name, a number they gave, a place they named).

**New characters.** `npc:<market>:<n>` regulars are people with a job, a
neighbourhood, opinions about the city and small talk; they can point you to
places. `biz:<id>` owners exist already; include staff lines.

Deterministic tests cover the template path with no key set, including
follow-ups that continue a topic and no repeated lines. The Claude path is
unit-tested with the SDK client mocked (a `createClient` seam). There are no
network calls in tests.

### B3. Presence

`/api/presence` already sends `place`. Add `GET /api/presence?place=<placeId>`
returning only the players at that place. The web polls it while a scene is
open.

---

## C1. Web: people live inside buildings (apps/web)

Owns: `CityMap.tsx`, `Crowd.tsx`, `people.ts`, `PersonCard.tsx`, `presence.ts`,
`layout.ts` and the phone (`phone/*`). Adds a new `city/WhoIsHere.tsx`.

- **Streets have no interactive people.** At most a few non-interactive
  passers-by for life (no tap target, no names). All AI characters move inside
  buildings. Human players on the map show as a small marker on the building
  they are in (a count badge), not walking around.
- **Every building opens.** Tapping any building or lot on the map enters its
  scene: banks, funds, hubs, offices, homes and businesses. Remove any dead or
  decorative-only building, or give it a scene (a generic room is fine).
- **Who's here** (`WhoIsHere.tsx`): the list of `businesses[].people` plus
  humans from presence at this place, with avatars by gender. Each person has:
  - **Chat**, which opens the phone thread (`/api/ai-chat` for AI ids, player
    chat for humans);
  - **Save**, which sends `contact.save` and then shows "Saved ✓";
  - **Invite**, for a meeting where the place has a meeting item (existing
    `venue.buy` with `withId`).
  PlaceScene renders it via one import and one line (C2 owns PlaceScene;
  coordinate with that line only).
- **Growth on the map.** Generated businesses appear on lots. `isNew` shows a
  small "New" ribbon. The layout must handle 200+ businesses a city: grow
  district grids or add lots. Keep the map readable on a phone (zoom or pan
  already exist).
- **Phone Contacts app** lists saved contacts (warmth, kind) with Chat and
  Remove.
- French strings for everything new.
- E2E `people-inside.spec.ts`: no tappable people on the street; entering a
  café shows Who's here with the owner; Save a person, who then appears in the
  phone's Contacts; Chat opens a thread and gets a reply.

## C2. Web: things to do and showrooms (apps/web)

Owns: `PlaceScene.tsx`, `RoomArt.tsx`, `rooms.ts`, `life.ts`, `whatnow.ts`,
`WhatNow.tsx`, `scenes.css`, `Business.tsx`, `art-places.tsx` and
`i18n/fr/places.ts`.

- **Activities first.** A scene's tray leads with the fun things
  (`activity: true` items): Dance, VIP table, Watch a film, Sing karaoke,
  Five-a-side. After buying, show a short line of what happened, plus "You met
  Ama, a nurse — Save contact?" when `met` comes back.
- **Room art** for every new kind, with people drawn in the room:
  - nightclub: dance floor, lights and a DJ booth;
  - cinema: a screen and rows of seats;
  - lounge, karaoke, arcade or bowling, spa, beach club, live music, football
    pitch, gallery;
  - showrooms: furniture on display, cars on the floor, TVs on the wall.
- **Showrooms.** The furniture store, appliance or electronics store and car
  dealer list what they sell (`businesses[].sells` and the shop catalogue),
  with price, comfort and an "owned" mark, and buy with `businessId`. The old
  Home "shop" buttons now send the player to the nearest showroom (a "Go to
  the showroom" button that walks or rides there).
- **Home** shows everything owned in the apartment art: all 20+ slots, with
  empty spots shown faintly.
- **What to do now** suggests fun ("Friday night: Club Eko Nights is busy")
  and jobs when money is low.
- French strings for everything new.
- E2E `fun.spec.ts`: enter a nightclub and Dance (money down, the message
  shows); a car dealer lists cars, buy one, and Home shows the car; a
  furniture store sells a TV, and the Home art shows it.

---

## Integration

Merge order: A, then B, then C1, then C2. Run `npm run check` and the full
E2E suite locally, open the PR, and get the deploy preview green before
merge.

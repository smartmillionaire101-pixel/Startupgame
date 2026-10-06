# Wave 8: Real places, real activities, real friends

Player feedback after Wave 7:

- Immersion has to be everywhere. When I get a haircut, I sit in the chair and get my hair cut.
- The plane cabin is just window seats.
- San Francisco doesn't look like San Francisco: no bridges, no skyscrapers. Move away from the block layout. Each city's layout should match the real city as closely as possible.
- The UI must improve significantly.
- Players should be able to:
  - send each other money;
  - visit friends;
  - go out and hang out together;
  - attend tech events.

---

## A. Real city maps (blocked until the network allows OpenStreetMap)

Replace the generated block grid with maps built from OpenStreetMap data (ODbL, with the credit "© OpenStreetMap contributors" on the map).

- **Data pipeline:** `scripts/osm/` downloads, for each city's core bounding box, through Overpass:
  - coastline and water;
  - parks;
  - main roads (motorway to tertiary);
  - bridges;
  - rail;
  - named landmarks;
  - simplified building footprints in the centre.
- **Processing:** simplify (Douglas–Peucker), project to a local metric frame, and quantise. The result is committed as compact JSON in `apps/web/src/city/geo/<city>.json`, under 300 KB each and lazy-loaded. Nothing is fetched at runtime.
- **Renderer:** a top-down map with a slight tilt.
  - Base layers (land, water, parks, roads) are drawn on a `<canvas>`, once per zoom level.
  - Buildings are extruded footprints in the centre.
  - Hand-drawn landmark sprites sit at real coordinates: Golden Gate Bridge, Bay Bridge, Transamerica Pyramid and Salesforce Tower (San Francisco); Third Mainland Bridge and the Lekki–Ikoyi Link Bridge (Lagos); Tower Bridge, the Shard and the London Eye (London); the Cotton Tree and Lumley Beach (Freetown); and so on.
  - Places (businesses, funds, homes) sit at real neighbourhood coordinates.
  - The existing districts map to real neighbourhoods.
- **Existing behaviour is kept:** paths, rides and presence keep working, because routes come from the road graph.

---

## B. Activities you see, everywhere (apps/web)

A small **choreography engine**: `city/acts/*`.

- Each venue item and home act maps to a scene script.
- A script walks the avatar to a station, sits or stands it, plays a 4–8 s loop, and shows the result. Steps with visible change are included, for example the hair changes after a haircut.
- Every script has **Skip**, and every one ends with a result card (what it cost, what you gained).

Scripts, at least:

| Place | Scenes |
|---|---|
| Barber/salon | sit in the chair; cape on; clippers or braids; mirror reveal with the new haircut. The style is stored client-side per player; `avatarLook` takes an override. |
| Restaurant/café/buka | seated; the waiter brings the plate; eating. |
| Bar/pub/lounge | drinks at the counter; clink. |
| Nightclub | dance floor with crowd; lights; DJ. |
| Gym | treadmill or weights loop; sweat. |
| Cinema | dark room, screen flicker, popcorn. |
| Karaoke | mic and lyrics. |
| Spa | massage table. |
| Football pitch | five-a-side kick-about. |
| Others | Arcade, bowling, gallery, live music and beach club each get a scene. |
| Showroom | test-drive or sit on the sofa before buying. |
| Home acts (from Wave 7) | richer animation where it is thin. |

**The plane** gets a full cabin interior seen from the aisle, rendered in perspective:

- rows of seats with passengers, crew, an overhead-bin row and the trolley coming down the aisle;
- your seat;
- a window view inset;
- seatbelt and meal moments;
- the cabin class follows your lifestyle tier (economy, premium, business).

---

## C. Friends: money, visits, hangouts, tech events

### Engine (packages/engine)

**Send money:** `{ type: 'money.send', toPlayerId, amount, note? }`

- Between human players in any city; currency is converted at the existing FX rate.
- 1% fee, with a minimum of 0.0001 col (about ₦45 in Lagos, like a real transfer fee), paid to the receiver's market bank sink.
- Limit 2 col per day per sender (anti-abuse).
- Both players get an inbox line.
- Covered by the money-conservation property test.

**Home visits**

- `{ type: 'visit.invite', toPlayerId }`, then `{ type: 'visit.accept', inviteId }` or `{ type: 'visit.decline', inviteId }`.
- An accepted visit lasts the rest of the game month.
- The guest can open the host's home (`view.visiting`). Both gain social +30 and trust.
- Player homes are viewable read-only by guests.

**Hangouts**

- `{ type: 'hangout.plan', businessId, inviteeIds: string[], when: 'now' | 'tonight' }`, plus `hangout.join` and `hangout.leave`.
- Every player who joins and is present at the venue gets a social and fun boost.
- Contacts warm between every pair.
- An inbox note is sent to invitees.

**Tech events**

- An AI calendar per city: meetups, hackathons, demo days, conferences, workshops.
- Deterministic from `deriveRng(seed,'tech-events',market,month)`, 3–6 per month, held at the hub, event venues, hotels or universities.
- Each event has a topic, speakers (AI founders and investors), capacity and a ticket price (often free).
- `{ type: 'techevent.attend', eventId }` (when the event is "on" this month) gives a network boost and contacts with the speakers. It can also include a "pitch on stage" chance (a demo day gives investor interest).
- View: `here.techEvents`.

### Web

- **Phone Wallet:** a "Send money" flow (contact picker, amount, note, confirm).
- **Phone Contacts / Messages:** Send money, Invite over, and Plan a hangout.
- **Phone Events app:** the city's tech events (RSVP, Attend, and Go to the venue).
- **The event scene:** a stage, a speaker talking (speech bubbles with the talk title), the crowd, a networking phase, and a demo-day pitch moment.
- **Visiting a friend's home** opens their `HomeScene` read-only, with you and them in it.

---

## D. UI, significantly better

Done after B and C land, as a review-driven pass:

- screenshots of every screen at 390 px, critiqued against a design checklist (hierarchy, spacing scale, type scale, colour roles, motion, empty states, feedback);
- then fixes;
- a consistent component kit (cards, sheets, list rows, buttons, chips, stat tiles), with every screen moved onto it.

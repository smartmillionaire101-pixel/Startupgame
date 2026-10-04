# Wave 2: people in the city, and events that build a network

Wave 1 gave each market a city you walk around. Wave 2 fills it with people:
other players walking the streets, AI characters going about their day, a
tap-to-meet card for anyone you see, and events that players host (at a cost)
to network. Networking has real game effects: warm introductions to
investors, customer leads, referred hires and trust between players.

Three parts, built in parallel against the contracts below.

---

## A. Presence (apps/server; outside the simulation)

Where people are on the map is social, ephemeral and never affects outcomes,
so it lives next to chat, not in the engine (like chat, it must never be
visible to reporters or arbitrators).

- `POST /api/presence` body `{ x: number, y: number, place: string | null }`
  (map coordinates in layout units, the building id the avatar is at or
  inside). Needs a session and the CSRF header. Rate limit about 30/minute.
  Stores `{ userId, market, x, y, place, at }` with the market taken from the
  player. Returns 204. Ignored (still 204) when the player has turned
  visibility off.
- `GET /api/presence` → `{ players: PresenceView[] }`: players in the
  viewer's market seen in the last 120 s, excluding the viewer, anyone the
  viewer blocked or who blocked the viewer, and anyone with visibility off.
  `PresenceView = { id, name, handle, role, backgroundId, stars, company: string | null, x, y, place, seenAt }`
  (profile fields come from the world's player record).
- `GET /api/me/presence` → `{ visible: boolean }`;
  `PUT /api/me/presence` `{ visible: boolean }`. Default visible.
- Storage: extend `AccountStore` (`store/types.ts`) with
  `putPresence(userId, market, p)`, `listPresence(market, sinceMs)`,
  `getPresenceVisible(userId)`, `setPresenceVisible(userId, visible)`.
  SQLite: a `presence` table (migration) and a `presence_settings` table.
  KV (`serverless/kv-accounts.ts`): `presence/<market>/<userId>` docs listed by
  prefix; prune stale entries opportunistically. Deleting an account removes
  its presence.
- Tests in apps/server/test for both stores and the routes (visibility,
  blocking, staleness, market isolation, CSRF).

## B. Events, contacts and warm intros (packages/engine)

### Event kinds (data/events.ts)

| kind | who comes | main outcome |
| --- | --- | --- |
| `founder-meetup` | founders, talent | contacts with founders; referred hires |
| `investor-breakfast` | investors, founders | warm intros to funds |
| `demo-day` | founders pitch, investors watch | warm intros; host stars if strong turnout |
| `customer-mixer` | customers of a segment | leads/awareness for attendees' companies in that segment |
| `talent-night` | candidates | referred candidates for attendees' companies |

Each kind: label, one-line description, base cost in cost-of-living units,
hours to host (≈10) and attend (≈4), capacity range.

### State and commands

- `world.events: Record<Id, CityEvent>`;
  `CityEvent = { id, market, hostId, kind, title, venue: 'hall' | 'hub' | 'office', month, capacity, budget, ticket, segmentKey?, attendees: Id[], status: 'upcoming' | 'held' | 'cancelled', outcome?: EventOutcome }`.
  `month` is the game month in which it is held (at that month's settlement).
- `event.host { kind, title, venue, month?, budget, ticket?, segmentKey? }`:
  host pays venue + budget immediately (to the market's suppliers account),
  spends hours, must be in the market; title passes the name checker; a
  player hosts at most one upcoming event. Founders and investors can host;
  `investor-breakfast` and `demo-day` need some standing (stars ≥ 1.5 or an
  investor role).
- `event.rsvp { eventId, going }`: attendee pays the ticket to the host on
  going (refunded on cancel or un-RSVP before the event), capacity enforced,
  hours reserved at the event.
- `event.cancel { eventId }`: host only, before it is held; tickets refunded,
  costs not refunded.
- At settlement of the event month, hold it deterministically
  (`deriveRng(seed, 'event', id)`): AI turnout from kind, budget, host stars,
  market depth (`capital.vcDepth` for investor events) and capacity; then
  outcomes for the host and each human attendee:
  - **Contacts**: `player.contacts: Contact[]`,
    `Contact = { id, kind: 'fund' | 'founder' | 'talent' | 'customer' | 'player', refId, name, warmth: 0..1, month }`
    (AI funds by fund id, AI founders, candidates, a segment for customers,
    human players by player id).
  - **Warm intros**: a warm fund contact makes a pitch to that fund more
    likely to get a first meeting (relax `minStars` by up to 1 and improve
    the meeting odds with warmth). Wire this into fundraising where the
    first meeting is decided.
  - **Customer leads**: awareness and a small number of trials in the
    attendee company's segment.
  - **Referred hires**: a referred candidate appears for the attendee's
    company (via the talent pool) with better acceptance odds.
  - **Network and trust**: `p.network` rises (and is now used: a higher
    network slightly raises AI investors' first-meeting odds); human
    attendees gain trust with each other and the host (`p.trust`).
  - **Host reputation**: good turnout gives the host a small star bump;
    an empty room a small embarrassment. Inbox recap for host and attendees.
- Saved worlds: missing `events`/`contacts` treated as empty (schema step
  only if needed; coordinate the number with the current `CURRENT_SCHEMA`).
- Money conserved (extend the property test with hosting, RSVPs, cancels).

### Views

- `market.events`: upcoming and recently held events in the viewer's market:
  `{ id, kind, kindLabel, title, host: { id, name }, venue, month, dateLabel, capacity, going, ticket, segmentKey, status, youHost, youGoing, outcome: { summary: string, contacts: number } | null }`.
- `market.eventKinds`: `{ kind, label, description, cost: number /* minor */, hoursHost, hoursAttend, capacity: [min, max], who: string }[]`.
- `me.contacts`: newest first, capped at 50.

## C. The city comes alive (apps/web)

- **Other players**: poll `GET /api/presence` every 5 s while the City tab is
  open (not in lite mode); draw each as an avatar (appearance from their
  background id, like yours) at their position, gliding between updates,
  with a name tag. Report your own position after each walk and as a
  heartbeat every 30 s (`POST /api/presence`).
- **AI characters**: deterministic ambient people from the view: fund
  partners near their offices, AI founders near the Hub and their companies,
  shoppers at the Market stalls, candidates at the Hub. They stroll along
  the street graph on simple loops (client-side, no server). Density modest
  on phones.
- **Tap anyone** → a person card (bottom sheet): name, role, company, stars,
  your trust and contact warmth. Actions:
  - human player: Chat (existing starters flow), Invite to your event.
  - fund partner: Visit their office (walks you there), Pitch.
  - AI founder / candidate / shopper: a short line of talk with a tip from
    the world (e.g. what a segment cares about, who is hiring) and, for
    candidates, "See at the Hub".
- **Event Hall** (replaces "opening soon"): upcoming events with RSVP
  (ticket, hours, who is going), a host form (kind with description, cost
  and who comes; title; venue; budget; ticket; segment for customer mixers),
  and past events with your recap. Venues show a bunting flag on the map
  when an event is coming up there.
- **Me → Contacts**: your contacts and their warmth; a fund contact links
  to that office.
- **Settings**: "Show me on the map" toggle.
- Everything translated (French fragment), works on a 375 px phone, reduced
  motion respected, accessible lists for screen readers and lite mode.
- E2E: two browser contexts sign up in the same market; one sees the other's
  avatar, taps it, opens chat. A host creates an event and the other RSVPs;
  advance a month (dev tools); both see a recap with new contacts.

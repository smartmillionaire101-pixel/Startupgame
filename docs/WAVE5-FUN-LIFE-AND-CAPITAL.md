# Wave 5: a fun, lived-in game

Live-player feedback (October 2026): the game is boring; there isn't enough
to explore or do; places are only cards; investors have little to do; the
hours budget gets in the way of simply spending money; it's too complex;
home notifications aren't clickable; people run out of money with nothing to
do and no work to take; months went too fast (now 15 minutes); Freetown
looks empty; cities should feel familiar (real streets and markets); there
should be accelerators, development partners and LPs; people want to chat
with AI players, pitch angels wherever they meet them, furnish their
apartment, buy a car, choose male or female; event hosts should be able to
pay to broadcast and AI players should attend too; as human players arrive
AI players phase out, and the best banker becomes head of the central bank.

The rule for everything below: **fun first, real second, simple always**.
Every screen answers "what can I do here?" with 2–4 clear choices. Use the
space that exists; never add clutter to the map.

Four parts, built in parallel against these contracts.

---

## A. Life, money and work (packages/engine)

- **Money, not hours, for spending.** Buying, eating, drinking, rides,
  flights, event tickets, furniture, cars and meetings over a meal cost
  money only (no hours). Hours remain only for company work (building,
  sales, discovery, hiring) and for jobs/gigs. Remove `hours.short`
  failures from all spending commands.
- **Never stuck.** Starting personal savings ×2. There is always work:
  - `job.take { businessId, role }`: a part-time job at a local business
    (`roles` per business kind: waiter, barista, cashier, driver, junior
    developer, bookkeeper, sales rep…; pay in cost-of-living units by role
    and city; uses 40 hours a month; paid monthly from the business till by
    `transferUpTo`; one job at a time; `job.quit`). View:
    `view.me.job: { businessId, businessName, role, label, monthlyPay, hours } | null`,
    `view.here.jobs: { businessId, businessName, role, label, monthlyPay, hours }[]`.
  - Gigs stay, limit raised to 8 a month.
  - A founder with zero personal cash can always take an "agency gig" (no cap).
- **Who you are.** `player.create` gains `gender: 'female' | 'male'`
  (required for new players; saved players default to the avatar they have).
  `view.me.gender`.
- **Home and car.**
  - `data/lifestyle-shop.ts`: furniture catalogue (sofa, bed, desk, TV,
    plants, art, kitchen, sound system, gaming setup; 3 quality tiers;
    prices in COL units) and car catalogue per market (economy hatchback,
    city SUV, ride-hail sedan, electric car, luxury car, motorbike; local
    flavour names, no real brands; price, monthly running cost).
  - `home.buy { itemId }` adds to `player.home.items` (max one per slot,
    replacing sells the old one back at 40%). `car.buy { modelId }` sets
    `player.car` (selling the old one back at 50%); running cost monthly at
    settlement. Owning a car makes "Drive" a free transport option (fuel is
    in the running cost). Furniture and car give small **comfort/status**:
    energy recovery +, and a status score shown on profile.
  - Views: `view.me.home: { items: { slot, itemId, label, tier }[], comfort }`,
    `view.me.car: { modelId, label, monthlyCost } | null`,
    `view.here.shop: { furniture: [...], cars: [...] }` with prices.
- **More to do in town.** Add business kinds: nightclub, lounge/rooftop bar,
  coffee chain café, cinema, gym class studio, car dealership, furniture
  store, co-working, art gallery, live-music venue. Venue items for clubs
  (entry, VIP table), cinemas (ticket), etc. Each market's roster gains the
  new kinds in fitting districts. **Freetown** gets a full roster (≥ 32)
  with real-feel places on Lumley Beach Road, Aberdeen, Wilkinson Road,
  Siaka Stevens Street, Kissy Road, Congo Cross, Big Market — fictional
  business names, real street/area names.
- Money conserved (extend the property test).

## B. Capital: accelerators, development partners, LPs, investors (packages/engine)

- **Accelerators** (AI-run, 1–3 per market by depth; e.g. a Yaba demo-day
  program, a Kigali innovation hub, an SF top-tier program): cohort every 3
  months; `accelerator.apply { acceleratorId, companyId }` → answer next
  settlement (fit by stage, traction, founder stars); acceptance gives cash
  for small equity (SAFE), a stars bump and a mentor; demo day at cohort end
  raises fund interest. Views: `view.here.accelerators[]`.
- **Development partners** (AI-run DFIs/donors per market: grant windows,
  women-founder programs, climate/agritech funds, youth employment
  programs; generous in Freetown/Kigali/Lagos/Nairobi/Accra, few in London/
  SF/Dubai): `grant.apply { partnerId, programId, companyId }` → decision at
  settlement with eligibility reasons; non-dilutive cash with reporting
  conditions. Views: `view.here.devPartners[]`.
- **Investor gameplay.**
  - Investor types on funds and players: angel, VC, impact, corporate.
  - **LPs** (AI: pension fund, family office, endowment, DFI fund-of-funds,
    sovereign fund): a player-run fund can `lp.pitch { lpId }` (meet at their
    office or over a meal) → commitment added to the fund's capital at
    settlement, based on track record and stars. Views: `view.here.lps[]`.
  - Investing in AI companies is first-class: `view.here.dealFlow[]` lists
    raising AI and human companies with stage, traction, ask and a one-tap
    "Invest" (existing SAFE/round machinery) for player investors.
- **Pitch angels anywhere.** If you're at the same business as an AI angel
  (they spend time at cafés/restaurants: `view.here.angelsAt[businessId]`),
  `pitch.angel { angelId, companyId }` works there with a warm bonus; also
  from their office.
- **Events.** `event.broadcast { eventId, spend }` (money only) boosts AI
  turnout; the view lists AI attendees by name and kind
  (`attendeesAi: { name, kind }[]`), and AI players RSVP over the month.
- **Central bank.** When at least one human player runs a licensed bank in a
  market, the best of them (capital ratio, stars, deposits) is named
  `governor` of that market's central bank each quarter (inbox + news);
  otherwise the AI governor stays. `view.market.centralBank.governor:
  { name, human: boolean }`.
- **AI phase-out.** AI startup and angel counts per market shrink as humans
  join (keep minimums so the economy stays liquid).
- Money conserved.

## C. The phone (apps/server + apps/web)

- A phone button always visible (above the tab bar, right). It opens a
  full-screen phone with apps:
  - **Messages**: all chats — players and **AI characters** (founders,
    angels, partners, business owners, LP managers). Unread badges; new
    messages toast and buzz the phone icon.
  - **Alerts**: the inbox; every item is tappable and takes you where it
    matters (deal card, company, event, business, bank…); mark read.
  - **Contacts**: people you've met, with Call (= open chat) and Meet
    (= suggest a place).
  - **Wallet**: personal cash, salary/job, car and home costs at a glance.
  - **Jobs**: open jobs and gigs nearby (from `view.here.jobs` and gigs).
  - **Map**: Places list.
- **AI chat** (server): `POST /api/ai-chat { characterId, text }` →
  `{ reply }`, stored like player chats. Replies are generated server-side
  from the character's persona and live game data (templates with
  variety: greetings, what they invest in / need / sell, current deals,
  advice, invitations to meet), deterministic per message id, rate-limited.
  Chat list includes AI threads.
- Home screen alerts become tappable too (same handler as the phone).
- French for everything.

## D. Places you walk into (apps/web)

- Entering any place opens a **full-screen scene**, not a card: an
  illustrated room (SVG) with furnishing for its kind — restaurant tables
  and a kitchen pass, café counter and espresso machine, club dance floor
  with lights and DJ booth, bar, cinema, gym, office, bank lobby, investor
  office, accelerator space, development-partner office, car showroom,
  furniture store, your apartment (shows the furniture you own), hotel
  room abroad. **Occupants**: AI characters and players present
  (presence `place`) placed in the room doing an activity animation
  (eating, chatting, dancing, typing, ordering); tap anyone → person card
  (chat, invite, pitch an angel). The decision cards sit in a bottom tray
  (2–4 primary actions + "More").
- **Real streets and markets**: each city plan gets real street names on
  its streets and its real markets/landmarks named (Lagos: Broad Street,
  Ahmadu Bello Way, Adeola Odeku, Admiralty Way, Herbert Macaulay Way,
  Balogun Market, Computer Village…; Freetown: Siaka Stevens Street,
  Lumley Beach Road, Wilkinson Road, Kissy Road, Big Market, Congo Cross…;
  London, Nairobi, Accra, Kigali, Johannesburg, Cairo, Dubai, SF likewise).
  Street names show only when zoomed in. **Freetown's plan** fills out:
  hills, beach, more districts and businesses, using the space it has.
- **Onboarding**: choose Female/Male (avatar previews) and keep it
  three quick steps.
- **"What to do now"**: a small card on the City and Home with 3 simple
  suggested actions for this player right now (e.g. "Get a job at Mama
  Titi's Buka", "Pitch Dolores Park Angels — they're at Blue Fog Coffee",
  "Apply to the Yaba Accelerator"), each one tap to go there.
- Uses `view.here` (A/B shapes) with graceful fallbacks.

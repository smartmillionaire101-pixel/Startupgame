# Wave 10: A living economy and a city that never sleeps

Player feedback after Wave 9 (now live):

- Add activities for people to do. San Francisco and every city has to come fully alive, with activities unlocked by lifestyle level.
- As founders get rich, they buy real estate and mansions and travel between cities.
- At night the cities light up.
- Players choose how they get around: drive their own car, walk, take the bus, a taxi, and so on.
- The 3D cities are okay, but buildings must never sit on top of each other, and there must be space between them.
- The game must never be boring:
  - businesses expand;
  - a real economy comes alive, scattered across each city and across cities, not centred in one place;
  - SF gets more investors, tech companies, tech events and immersive pitch competitions, with founders pitching and investors judging, both real players and AI.

## A. Engine (`packages/engine`): property, expansion, a scattered economy, pitch competitions, lifestyle activities

- **Real estate.** Each city has a property market of real listings in real neighbourhoods:
  - **Neighbourhoods:** SF has Pacific Heights, Sea Cliff and SoMa lofts. Lagos has Banana Island, Ikoyi and Lekki. London has Mayfair and Hampstead. Dubai has Palm Jumeirah and Emirates Hills. Other cities get their equivalents.
  - **Property tiers:** studio, apartment, townhouse, villa, mansion, penthouse.
  - **Ways to buy and earn:** buy outright or with a mortgage (through the existing banks and credit), rent out for monthly income, or sell.
  - **Prices:** they move with a deterministic city index.
  - **Moving in:** you can move in to any property you own, which sets your home tier and home city. Properties count towards net worth.
  - **Money:** double-entry ledger, conserved, covered by the property test.
- **Business expansion.** A business can open branches in other neighbourhoods and other cities, each with its own costs and demand. AI businesses also expand over time.
- **A scattered economy.** New AI businesses, offices, investors and events are spread across all of a city's districts, weighted by real activity, never piled up in the centre.
- **SF is the tech capital.**
  - It has more VC funds and angels, more AI tech companies (startups and big tech campuses) and a busier tech-event calendar.
  - **Pitch competitions** (`competition.*`) run in every city and most often in SF. Founders enter with a company. Judges are real investor players (who score) plus AI investors (scoring from company metrics with seeded noise). Rounds: entries, then a pitch on stage, then judges' scores, then prizes. Prizes are cash from the sponsor's sink, investor interest, press and stars. Everything is deterministic (`deriveRng`).
- **Lifestyle-gated activities.** Activities carry a lifestyle tier: street food, bus and football; gym and cinema; fine dining, golf and spa; yacht, private jet, gala and polo. Players see locked activities with "unlocks at tier N". New venue kinds are added where needed: yacht marina, golf club, gala ballroom, private terminal.

## B. 3D city (`apps/web/src/city/three/*`)

- **No overlaps.** Generated buildings must never overlap each other, real buildings, roads or places. Keep proper setbacks and gaps, test it, and also thin any OSM or Overture footprint that overlaps another.
- **Night.** The city lights up at night:
  - lit windows by building type and hour;
  - street lights along roads, and car headlights and tail lights;
  - landmark lighting (Golden Gate, Bay Bridge lights, Burj);
  - a soft glow in the haze.
- **Getting around in 3D.**
  - The transport chooser offers walk, bike, bus, taxi and your own car (a car you own, driving it yourself on the road graph).
  - Visible buses run on routes with stops, and taxis and traffic stay in lanes.
  - Driving uses a chase camera with Skip.
- **Your properties on the map.** Properties you own show on the 3D map at their real neighbourhoods (a mansion model with a garden or pool), and you can visit them.

## C. Experiences (web)

- **Pitch competition scene.** A 3D stage with a founder at the podium and slides on screen, a judges' table with real-player and AI investors, an audience, scores revealed one by one, and a winner's moment. Real investor players can judge live from their phone.
- **Real estate.** A phone "Homes" app with listings by city and neighbourhood (photos rendered in 3D), a tour of a listing in 3D (the interiors kit, scaled up for mansions), buy, mortgage, rent out and sell, and a portfolio view.
- **Activities.** A phone "Going out" app listing activities by tier: yacht day, golf, gala, private-jet weekend trip to another city, and more. Each gets an act scene (using the Wave 8/9 act engine).
- **Business expansion UI.** Open a branch, with a map picker for the neighbourhood or city, and a branch list.

## Checks

- `npm run check`, including the money-conservation property test covering property and branches.
- E2E: buy a property and move in; enter a pitch competition with an AI-judged result; the activity tier gate; driving your own car.
- Screenshots of SF by day and at night, a mansion, and a pitch competition.

# Wave 3: a living city economy, and San Francisco

Player feedback after Wave 2: the cities all feel like the same board with a
different paint job, and they only contain capital (banks, investors), the
Hub and founders. A real city is full of businesses (restaurants, cafés,
shops, salons, workshops, clinics, schools, depots) with trade going on all
the time. Players should be able to pick up gigs, eat, meet people over a
meal, and above all **sell to the businesses around them**, because real
trade is the only way a company grows. AI business owners and AI angel
investors keep the economy liquid and the city alive while human players are
still arriving. Every coin a player spends comes out of their own pocket.

And a new city: **San Francisco**, with the SF vibe.

Three parts, built in parallel against the contracts below. Same principles
as before: the engine is pure and deterministic (`deriveRng` with new
labels, never `Math.random`), money is double-entry and conserved, every
string is translatable, mobile-first, lite mode keeps working.

---

## A. San Francisco and AI angels (packages/engine)

### San Francisco (`'san-francisco'`)

Add to `MARKET_IDS` (after dubai) with real public data, USD currency:

- `currency: 'USD'`, `timeZone: 'America/Los_Angeles'`, `unitsPerUsd: 1`,
  base rate ≈ the Fed funds upper bound (cite source), US federal + California
  tax (corporate 21% + 8.84% state ≈ 29.8%, personal ≈ 35% blended for the
  game's single rate, capital gains 20% + CA), cost of living ≈ $5,500/month
  single adult, office seat ≈ $900/month (co-working), salary bands from
  public SF data (engineer senior ≈ $17k/month), demographics for the Bay
  Area (population ≈ 7.7m, high digital adoption), deep capital: `vcDepth`
  ≈ 1.6 (deeper than London), `angelDepth` ≈ 1.8.
- **The USD caveat**: `ledger.ts` hard-codes USD = 1 and `fxDesk('USD')`
  returns `world.usdExt.fx`. A USD market must work with that (its local
  account *is* a USD account; conversions to USD are no-ops). Add tests:
  founder in SF opens, pays costs, gets revenue, a London player travels to SF
  and pays in USD, money conserved.
- Fiction tables (`fiction-phase2.ts` style, fictional names): 6 AI fund
  seeds (seed, sector, growth, angels, accelerator, corporate VC), outlets
  (national/tech/tabloid/trade/regional/global), AI banks, incumbents,
  first/last names reflecting SF's mix.
- `CAPITAL['san-francisco']`: lenders (two big banks, a startup/venture
  bank, an SBA-backed lender, a revenue-based financier, a fintech
  merchant-cash-advance lender); schemes (QSBS, SBA 7(a)); extra funds by
  depth.
- `RULE_CARDS` ≥ 6, `travel.ts` `REGION`.
- Tests that count markets updated (9 → 10).

### AI angel investors as people

Today AI "angels" are only `Fund` entities with a partner name. Make them
people, like AI founders:

- Per market `round(4 × angelDepth)` (min 2; London ≈ 4, SF ≈ 7,
  Freetown 2) AI `Player`s with `role: 'investor'`, `ai: true`, a name,
  handle, background, stars, and a personal account funded from
  `ext.genesis`. Each manages a small angel `Fund` (existing machinery:
  `createAiFund` with an `angel` archetype, `manager`/partner = that
  player), so pitches, SAFEs, cap tables and portfolio views all work
  unchanged.
- They invest monthly in raising companies (AI and human), with cheques
  sized to the market, via the existing `aiFundsInvest` path (rng label
  `'angels'`).
- `maintainPopulation` keeps the angel count (replaces any who fold).
- Views: they appear in `view.directory`/`view.players` like AI founders,
  with `role: 'investor'`; `market.funds[]` entries for angel funds gain
  `angel: { playerId, name }`.
- Saved worlds: no schema step; `maintainPopulation` creates missing angels
  for open markets at the next settlement (and `market.open` for new ones).

---

## B. The city economy (packages/engine)

### Local businesses

`data/businesses.ts`:

```ts
export type BusinessCategory =
  | 'food'        // restaurant, café, street food, bakery, pub/bar
  | 'retail'      // grocer, market stall, boutique, electronics, pharmacy
  | 'services'    // salon, laundry, tailor, repair shop, print shop
  | 'trades'      // workshop, builder's merchant, mechanic
  | 'health'      // clinic, dentist, gym
  | 'education'   // tutoring centre, private school, coding bootcamp
  | 'logistics'   // courier depot, warehouse
  | 'hospitality';// hotel, event venue, co-living

export interface BusinessKindSpec {
  kind: string;                 // 'restaurant', 'cafe', 'suya-spot', 'pub', 'salon'…
  category: BusinessCategory;
  label: string;                // translatable
  /** A player can go in and spend (eat, drink, get a haircut…). */
  venue?: { items: { id: string; label: string; priceCol: number; energy?: number; meeting?: boolean }[] };
  /** Typical monthly takings in cost-of-living units, and spread. */
  revenueCol: [number, number];
  /** Share of takings spent on each startup sector it buys from. */
  buys: Partial<Record<Industry, number>>;   // e.g. restaurant: { fintech: .015, logistics: .03, saas: .01, agritech: .08 }
  /** Gigs it offers. */
  gigs: { id: string; label: string; hours: number; payCol: number; skill?: 'tech' | 'sales' | 'ops' | 'creative' | null }[];
  look: { shape: 'shopfront' | 'stall' | 'kiosk' | 'restaurant' | 'pub' | 'warehouse' | 'clinic' | 'school' | 'hotel'; awning?: string; color: string };
}

export interface BusinessSeed {
  name: string;          // fictional, local, recognisably of the city
  kind: string;          // BusinessKindSpec.kind
  district: string;      // district id from the city plan (section C), e.g. 'mission'
  owner: string;         // AI owner's name
}

export const BUSINESS_KINDS: BusinessKindSpec[];
export const CITY_BUSINESSES: Record<MarketId, BusinessSeed[]>; // 24–36 per market
```

Rosters must feel like the city: London (a pub, a caff, a Brick Lane-style
curry house, a market-hall stall, a corner shop, a barber, a Shoreditch
coffee roaster…), Lagos (a buka/mama-put, a suya spot, a Balogun fabric
stall, a Computer Village phone repair shop, a pharmacy, an event centre, a
POS agent kiosk…), Nairobi (a nyama choma joint, a matatu SACCO depot, an
M-Pesa agent, a Gikomba stall…), SF (a Mission taqueria, a sourdough bakery,
a third-wave coffee bar, a dim sum place, a bike shop, a co-living house, a
climbing gym…), and so on for every market. No real brands.

### State

```ts
m.businesses: Record<Id, LocalBusiness>;
interface LocalBusiness {
  id: Id; market: MarketId; name: string; kind: string; district: string;
  owner: { name: string };
  account: Id;                       // a real ledger account
  monthlyTakings: number;            // minor, last month
  health: number;                    // 0..1, drives openings/closures
  suppliers: { companyId: Id; sector: Industry; monthlyMinor: number; since: number }[];
  openedMonth: number; closedMonth?: number;
}
```

Seeded at `market.open` from `CITY_BUSINESSES`, with a starting balance
from `ext.genesis`. Saved worlds: no schema step; `m.businesses` is optional
and an `ensureBusinesses(world, market)` call at the start of the economy
step seeds it when missing (views treat missing as empty).

### The monthly loop (settlement, rng label `'economy'`)

Runs after customer segments, before company settlement, so purchases count
in this month's revenue:

1. **Households spend** at businesses: takings = base × market climate ×
   season × noise, paid `ext.customers → business.account`.
2. **Businesses pay their costs**: wages → `ext.payroll`, rent →
   `ext.suppliers` (a share of takings, so they keep a modest margin).
3. **Businesses buy from startups (the trade)**: for each sector in `buys`,
   the business spends `takings × share` with its supplier in that sector,
   `transferUpTo(business.account → company.account)`. This is real revenue
   for the company (booked like B2B revenue, with an invoice line in the
   company's month). Players and AI startups compete for these accounts:
   - A business with no supplier in a sector, or unhappy with its current
     one, picks among companies in that sector in its market by a score
     (price vs its budget, product quality/reliability, stars, awareness,
     the founder's trust/warmth with the owner) with some inertia.
   - Players win businesses by **pitching them** (below); AI startups win
     some on their own each month (so AI founders grow too).
   - Satisfaction follows reliability and price; poor service loses the
     account.
4. **Health**: profitable businesses grow takings slowly; loss-makers shrink
   and, at health 0, close (their account's balance returns to
   `ext.genesis`). New businesses open over time from the market's roster
   pool so the city keeps changing (deterministic).
5. Story items: a company's monthly story (Wave 1) gains lines like "Won
   Mama Titi's Buka as a customer: +₦45k/month" and "Lost Blue Fog Coffee:
   your app was down too often".

### Commands

- `business.pitch { companyId, businessId }` — the founder walks in and
  pitches: costs hours (6) and maybe a coffee from the founder's pocket;
  the owner answers on a deal card (yes with a monthly amount, "come back
  when you have X" with the specific reason, or no). Max 4 pitches/month.
- `gig.take { businessId, gigId }` — work a shift or a freelance job:
  spends the gig's hours and energy, paid from the business's account
  (`transferUpTo`, so a struggling business can only pay what it has; a
  short payment is reported), income tax to `ext.tax`. Replaces the generic
  `floorGig` (keep `takeGig` working as "agency gig" fallback). Max 4 gigs
  per month; skill gigs pay more for matching backgrounds.
- `venue.buy { businessId, itemId, withId? }` — eat, drink, get a haircut:
  the price comes from the player's personal account to the business. With
  `withId` (a fund partner/AI angel/AI founder/player/contact) it is a
  meeting over a meal: both spend hours, the contact's warmth rises (fund
  contacts count toward warm intros), with players trust rises; the
  inviter pays. Energy items restore a little energy.
- Existing hosted events at a restaurant/hotel venue pay that business
  (instead of `ext.suppliers`).

Money conserved: extend the property test with pitches, gigs, venue buys and
settlements with businesses.

### Views

```ts
view.market.businesses: {
  id, name, kind, kindLabel, category, district, owner: { name },
  look, open: boolean,
  venue: { items: { id, label, price /* minor */, energy?, meeting? }[] } | null,
  gigs: { id, label, hours, pay /* minor */, skillMatch: boolean }[],
  buys: { sector, label, monthlyBudget /* minor, approx */,
          supplier: { companyId, name, you: boolean } | null }[],
  you: { customer: boolean /* one of your companies supplies it */, canPitch: boolean, reason: string | null }
}[];
view.market.economy: { businessesOpen, takingsLastMonth, tradeWithStartups, gigsWorked };
```

`view.companies[]` gains `businessCustomers: { businessId, name, monthly }[]`.

---

## C. Cities that feel like themselves (apps/web/src/city)

### City plans

Replace "one generator, different paint" with a **plan per city**
(`city/plans/<market>.ts`), each a small data file the generator reads:

```ts
interface CityPlan {
  districts: { id: string; name: string; kind: 'downtown' | 'finance' | 'tech' | 'market' | 'residential' | 'nightlife' | 'industrial' | 'waterfront' | 'park' | 'airport' | 'campus'; at: [col, row]; size: [w, h] }[];
  water?: { side: 'north' | 'south' | 'east' | 'west'; name: string };   // Thames, Lagos Lagoon, the Bay
  hills?: { at: [col, row]; height: number }[];                          // SF's hills
  streets: 'grid' | 'organic' | 'radial' | 'mixed';
  bridges?: { name: string; from: [c, r]; to: [c, r] }[];               // Golden Gate, Third Mainland, Tower Bridge
  landmarks: { kind: LandmarkKind; name: string; at: [col, row] }[];
  transit: ('bus' | 'danfo' | 'matatu' | 'cable-car' | 'tube' | 'tram' | 'okada' | 'boda' | 'keke' | 'metro' | 'ferry' | 'abra')[];
  streetNames: string[];
}
```

The important places (banks in the finance district, funds in the
investor/tech quarter, the Hub, the Market, your office, home, airport,
Event Hall, Newsstand) are placed into the plan's districts; local
businesses go into the district their seed names. Examples:

- **San Francisco**: Financial District (banks), SoMa (startups, the Hub,
  your office), South Park/Sand Hill-style investor row, the Mission
  (taquerias, murals, nightlife), Chinatown, Fisherman's Wharf on the Bay,
  hills with cable cars, the Golden Gate at the edge, fog.
- **London**: the City (banks), Shoreditch (tech, coffee), Mayfair
  (investors), Soho (food, nightlife), Borough/Camden markets, the Thames
  with Tower Bridge, red buses, the Tube.
- **Lagos**: Marina/Broad Street (banks), Victoria Island & Ikoyi
  (investors, restaurants), Yaba (tech, the Hub), Ikeja Computer Village,
  Balogun Market, Lekki, the Lagoon and Third Mainland Bridge, danfos,
  okadas, kekes.
- **Nairobi**: CBD, Upper Hill (banks), Westlands (investors), Kilimani
  (tech), Gikomba/Toi markets, matatus with art, Nairobi National Park edge.
- Every other market gets its own plan in the same spirit (Johannesburg:
  Sandton/Braamfontein/Maboneng; Dubai: DIFC/Marina/Deira souks/Creek with
  abras; Cairo: Downtown/Zamalek on the Nile/Khan el-Khalili/Maadi; Accra:
  Osu/Airport City/Makola Market/trotros; Kigali: Kiyovu/Kimihurura/Nyabugogo
  hills, motos; Freetown: Central/Aberdeen/Lumley beach, kekes, poda-podas).

### Buildings and businesses

- New building art per `look.shape` (restaurant with tables outside, café,
  pub sign, kiosk, stall, clinic cross, school, warehouse, hotel), each with
  its name sign; categories colour-coded on the Places list.
- **Business interior** (bottom sheet): owner, what they sell, "Eat/Drink/
  Buy" items with prices and "Invite someone" (pick from contacts, players
  here, fund partners, AI angels), **Gigs** (hours, pay, skill match, "Take
  shift"), and **Sell to them**: what they spend on startup products in each
  sector, who supplies them now, and "Pitch your company" (deal card
  result).
- A **Jobs board** on the Hub listing all gigs in the city, and a "Who buys
  what" view on the Market so founders can find customers.
- AI owners stand at their shops; AI angels walk between the investor
  district and restaurants; more people overall (density still capped on
  phones).
- Places list grouped by district, with categories filter; still the lite
  mode / screen-reader path.

### San Francisco flavour

Palette (fog greys, Victorian pastels, Golden Gate red), landmarks (Golden
Gate, Transamerica-style pyramid, painted ladies, cable car), vehicles (cable
car, Muni bus, scooters, self-driving cars), street names (Market, Valencia,
Mission, Folsom, Howard, Embarcadero, Castro, Haight), NPC names.

---

## Testing

- Engine: SF market, USD market ledger, angels created and investing, the
  business loop (households → businesses → startups), pitches, gigs, venue
  meetings, closures/openings, determinism, money conservation.
- Web: plans for all 10 markets produce valid connected layouts with every
  important place reachable and each business placed in its district;
  building art per shape; interiors; French.
- E2E: a founder in SF walks to a Mission taqueria, buys lunch (pocket money
  goes down), takes a gig, pitches a business and sees it become a customer
  after a month; a London founder sees the Thames and red buses.

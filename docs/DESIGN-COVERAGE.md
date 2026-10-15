# Design document coverage

What the code implements against *Runway: The Startup Game (Design Document)*, section by section. "API only" means the engine and server support it but the web client has no screen for it yet.

## Phase 1 (MVP) checklist — §20

| Item | Status | Notes |
| --- | --- | --- |
| 3 markets: Lagos, Nairobi, London | ✅ | Sourced seed snapshots in `engine/src/data/markets.ts` |
| Roles: founder and investor; banks AI only | ✅ | Bankers became playable in phase 2 |
| Onboarding under 2 minutes | ✅ | Five screens; covered by an E2E test |
| Local and dollar accounts, real FX and interest rates | ✅ / partial | FX refreshed from a free feed; policy rates are seed values, updated via `market.data` (no live rate feed yet) |
| AI customers, segments, funnel, revenue models | ✅ | Segments sized bottom-up from demographics; B2B pipelines and payment terms |
| AI staff hiring with negotiation | ✅ | Accept / counter / decline with one-line reasons; morale, management load, departures, layoffs |
| Co-founding and deal cards | ✅ / API only | Deal cards fully in UI; inviting a player co-founder is API only (`cofounder.invite`) |
| Fundraising with AI and player investors; plain-language term sheets | ✅ | SAFEs and priced rounds, partner meetings, diligence on claims, counters |
| Live public-market multiples for valuations | partial | Multiples drive valuations and the funding climate; values are seed data until a market-data feed is added |
| AI reporters: outreach, fact-checking, one public star rating | ✅ | |
| Daily digest and short alerts | ✅ / partial | Digest (offline-capable) and in-app alerts; no push notifications yet |
| Taxes, maintenance mode, the floor | ✅ | |
| Private text chat with conversation starters | ✅ | Filters, scam flagging |
| Names check, phone verification, block and report | ✅ / partial | Real registry/trademark lookups and a production SMS gateway are adapters still to plug in; reports are stored but there is no moderator console yet |
| Rule cards for the three markets | ✅ | Simplified, labelled, with regulator names |

## Phase 2 checklist — §20

| Item | Status | Notes |
| --- | --- | --- |
| More markets: Accra, Freetown, Kigali, Johannesburg, Cairo, Dubai | ✅ | Seed snapshots in `data/markets-phase2.ts` (GHS, SLE, RWF, ZAR, EGP, AED), fiction and rule cards per market. Markets open in waves with the `market.open` system command; the server's `OPEN_MARKETS` setting picks which are live |
| Personal loans, credit profiles, trust in comebacks | ✅ | `credit.ts`: score from on-time payments, misses and defaults; shares as collateral (seized on default); trust built only through real interactions lowers rates and helps comebacks |
| Travel and relocation | ✅ | `travel.ts`: a trip (money + 40 h) is required once before investing or acquiring across markets and allows pitching there that month. Relocation costs half of everything (cash, shares, SAFEs, preferences) to the old market's central bank; companies left behind get an AI CEO and pay dividends only while profitable |
| Player-to-player B2B marketplace | ✅ | `marketplace.ts`: listings, contracts, supplier quality feeding the buyer's costs, output and reliability; related-party and off-market price flags; fake-revenue detection with fines |
| Acquisitions between players, AI arbitrator, shareholder votes | ✅ | `acquisitions.ts`, `governance.ts`, `arbitration.ts`: fair-value band, related-party refusal, integration risk (staff leave, churn, morale); board seats, vetoes and share-weighted votes are enforced; boards can remove a founder CEO; the arbitrator rules on supply breaches and wrongful removal within a month |
| Player-owned banks and the full AI central bank | ✅ | `banks.ts`: four licence types with minimum capital, two-month licence decision, lending out of deposits within reserve and capital rules, retail customers, depositor interest and fees, central bank lending above base rate against the loan book, inspections, wind-down with deposit insurance. Investment banks earn advisory fees; venture-debt lenders take warrants |
| French language support | ✅ / partial | The whole web client is translated (`apps/web/src/i18n`), with French money and number formats and a test that fails on any untranslated string. Text the server writes (refusals, notifications, data labels) is translated when it is fixed text; sentences the simulation builds with live numbers (news stories, most inbox items) are still English |

Worlds saved before phase 2 are upgraded on boot (`upgrade.ts`, schema 7).

## Built ahead of schedule
- Fund I from AI LPs, management fees and carry (§7; phase 3 for Fund II).
- AI corporate acquisition offers with the liquidation waterfall (§12; phase 2).
- Pivots, working-capital loans with personal guarantees, regulator inspections and fines.
- Internal economy dashboard (`GET /api/admin/economy`) and the offline economy report (§20 "Running the live game").
- Founder Journey 5 (`exits.ts`, `allocator.ts`, `wealth.ts`; the phone's Capital app): secondary sales of founder shares (cap-table transfer, capital gains tax, 25% a year, board consent; real-player buyers accept an offer card), the IPO path (readiness checklist, bankers' fee, listing with a public float and a 6-month lock-up) and a stock market (monthly seeded prices around the valuation model; `shares.buy` / `shares.sell`), realised vs unrealised wealth, and the Capital Allocator paths: mentoring for advisor shares, gifts to causes with measured outcomes, senior roles at DFIs and banks, and serial founding (`company.start`).
- Phase 7, living world and replayability (`ambitions.ts`, `recap.ts`; the Journey panel and the month recap): seven founder ambitions (§4.1, §9.5), namely unicorn founder, profitable owner, serial founder, angel investor, venture capitalist, lifestyle entrepreneur and philanthropist. Each is measured from the world like the chapters, chosen or changed with `journey.ambition`, leads the main objective, and is recorded as an `ambition.<id>` milestone when reached. Investors and bankers can choose one too. The month recap now covers every system: rivals' moves in your industries (those that hit you first), decisions answered or defaulted, your wealth now (what you can spend vs what you own) and your ambition's progress. Already in place from earlier work: rivals with scheduled moves (Journey 4a), decision events with deadlines, defaults and cooldowns, four business concepts, and failure recovery (pivot, the rescue plan, wind-down, serial founding with comeback credit).
- Phase 8, exits and the investor endgame (`deals.ts`, `captable.ts`, `wealth.ts`; the Capital app and the Portfolio screen): an exit statement for every company sale that pays a human holder (price, what was paid first, other holders' preferences, your stake, your preference and common payout, tax and net), kept as "Your exits"; portfolio returns per currency (invested, still held at the mark, returned, TVPI, DPI, a multiple per position); and pro-rata follow-ons: rights are recorded when an investment with them closes, and each later priced round offers every human holder their share at the round's price (same round and preference tier, no vote, no counters, lapses at the next round). Behind `ENDGAME_NOTE`, which also records rights agreed before it.
- Phase 9, balance, usability and content: aggregate playtest numbers in the admin dashboard (`metrics.ts`, `GET /api/admin/economy` → `playtest`; no player ids), a two-year long-session test with a save round trip (`longrun.test.ts`), automated WCAG 2.1 AA checks on the main screens (`a11y.spec.ts`, axe-core; the one finding, green pill contrast, is fixed), and a content guide (`docs/CONTENT.md`). Structured playtests and tuning from their results are still to do.

## Not built yet
- **Phase 2 follow-ups:** French for generated news stories and inbox sentences (needs the engine to emit message keys with parameters instead of English sentences).
- **Phase 3:** syndicates and Fund II, awards and hall of fame, world events desk, programme version for accelerators, paid features.
- **Simplifications to revisit:** staff and co-founder equity vests immediately; bad-news responses (statement, interview, correction) are not offered yet.

## Open questions (§21) — what the code assumes today
| Question | Current assumption | Where to change it |
| --- | --- | --- |
| Public-record events | Run as short factual items without consent (fines, defaults, shutdowns) | `company.ts` `publish(...)` calls |
| Hours per month and lifestyle effects | 200 base, ±background, ±lifestyle, scaled by energy; burnout −30% | `data/characters.ts`, `personal.ts` |
| Star change per outlet and event | `OUTLET_EFFECT` table; bad news ×1.5 | `data/fiction.ts`, `stars.ts` |
| Deposit insurance limit | Real figures per market (NDIC, KDIC, FSCS, GDPC, …; none in Cairo and Dubai); paid when the central bank winds down a player bank | `data/markets.ts` |
| Shut-down name reservation | 12 game months | `settlement.ts` `NAME_RESERVATION_MONTHS` |
| Floor gig pay and hours | Per-market values, 30 h, max 2 per month | `data/markets.ts`, `personal.ts` |
| "Runway" trademark | Unresolved; "runway" is on the protected-brand list so players can't take it | `names.ts` |
| Team, architecture, budget | Architecture: see `ARCHITECTURE.md`. Team/budget/timeline still open. | — |

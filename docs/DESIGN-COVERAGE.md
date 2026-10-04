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

## Not built yet
- **Phase 2 follow-ups:** French for generated news stories and inbox sentences (needs the engine to emit message keys with parameters instead of English sentences).
- **Phase 3:** IPOs, syndicates and Fund II, awards and hall of fame, world events desk, programme version for accelerators, paid features.
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

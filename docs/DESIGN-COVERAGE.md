# Design document coverage

What the code implements against *Runway: The Startup Game (Design Document)*, section by section. "API only" means the engine and server support it but the web client has no screen for it yet.

## Phase 1 (MVP) checklist — §20

| Item | Status | Notes |
| --- | --- | --- |
| 3 markets: Lagos, Nairobi, London | ✅ | Sourced seed snapshots in `engine/src/data/markets.ts` |
| Roles: founder and investor; banks AI only | ✅ | Banker cards shown as "Phase 2" |
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

## Built ahead of schedule
- Fund I from AI LPs, management fees and carry (§7; phase 3 for Fund II).
- AI corporate acquisition offers with the liquidation waterfall (§12; phase 2).
- Pivots, working-capital loans with personal guarantees, regulator inspections and fines.
- Internal economy dashboard (`GET /api/admin/economy`) and the offline economy report (§20 "Running the live game").

## Not built yet
- **Phase 2:** player-owned banks and the full central bank, player-to-player B2B marketplace (and its related-party guardrails), acquisitions between players, AI arbitrator and shareholder votes, travel and relocation, personal loans and trust-based comebacks, more markets, French.
- **Phase 3:** IPOs, syndicates and Fund II, awards and hall of fame, world events desk, programme version for accelerators, paid features.
- **Simplifications to revisit:** board seats and vetoes are recorded on deal cards but governance votes are not enforced; staff and co-founder equity vests immediately; bad-news responses (statement, interview, correction) are not offered yet.

## Open questions (§21) — what the code assumes today
| Question | Current assumption | Where to change it |
| --- | --- | --- |
| Public-record events | Run as short factual items without consent (fines, defaults, shutdowns) | `company.ts` `publish(...)` calls |
| Hours per month and lifestyle effects | 200 base, ±background, ±lifestyle, scaled by energy; burnout −30% | `data/characters.ts`, `personal.ts` |
| Star change per outlet and event | `OUTLET_EFFECT` table; bad news ×1.5 | `data/fiction.ts`, `stars.ts` |
| Deposit insurance limit | Real NDIC / KDIC / FSCS figures (shown; used once player banks exist) | `data/markets.ts` |
| Shut-down name reservation | 12 game months | `settlement.ts` `NAME_RESERVATION_MONTHS` |
| Floor gig pay and hours | Per-market values, 30 h, max 2 per month | `data/markets.ts`, `personal.ts` |
| "Runway" trademark | Unresolved; "runway" is on the protected-brand list so players can't take it | `names.ts` |
| Team, architecture, budget | Architecture: see `ARCHITECTURE.md`. Team/budget/timeline still open. | — |

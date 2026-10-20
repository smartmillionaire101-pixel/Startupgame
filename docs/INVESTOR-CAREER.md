# The investor career

This is how the *Startup Investor Simulator Implementation Blueprint* (v1.2, 18 October 2026) is built in Runway. It follows the blueprint's roadmap order (§14). Each phase is a vertical slice: engine rules, views, screens, tests and French.

Everything here is switched on by one release note, `INVESTOR_NOTE` (`release-2026-10-20-investor-career`, `packages/engine/src/releases.ts`), which the server logs at boot (`apps/server/src/release.ts`). Saved worlds replay exactly up to the note and play the investor career from then on. Worlds without the note (and engine tests that don't announce it) play exactly as before. New fields are optional, so there is no schema step.

Every number in §11.6 lives in one place: `INVESTOR` in `packages/engine/src/data/investor.ts`, next to the eight `RUNGS` and the investor `GLOSSARY` (Phase 0).

## Where it lives

| Phase | Engine | Screen (Portfolio section) | Tests |
| --- | --- | --- | --- |
| 1 First session, ladder, angel ceiling | `career.ts` | Overview (first session, prompts, ladder); Journey app | `investor-career.test.ts`, `e2e/investor-career.spec.ts` |
| 2 Public markets | `exchange.ts` (+ hooks in `exits.ts`) | Markets; Capital → Markets | `investor-exchange.test.ts` |
| 3 Syndicates | `syndicates.ts` | Syndicates | `investor-syndicates.test.ts` |
| 4 Raising a fund with player LPs | `lpfunds.ts` | Your funds, As an LP | `investor-lpfunds.test.ts` |
| 5 Managing a fund | `fundops.ts` | Your funds (dashboard), pro-rata offers | `investor-fundops.test.ts` |
| 6 Fund II and the firm | `firms.ts` | Firm; fund picker on term sheets; crossover trading | `investor-firms.test.ts` |
| 7 Allocators | `allocation.ts` | Family office | `investor-allocators.test.ts` |
| 8 Deal craft and reputation | `dealcraft.ts` | Pipeline; Capital → Review your investors | `investor-dealcraft.test.ts` |
| 9 Institutions and legacy | `institutions.ts`, `allocator.ts` (sovereign roles), `firms.ts` (succession) | Legacy | `investor-institutions.test.ts` |
| 10 Balance and release | `scripts/economy-report.ts` (investor outcomes) | — | `investor-invariants.test.ts` (money conservation under random play) |

The views are on `playerView`: `investorCareer`, `exchange`, `syndicates`, `lpFunds`, `prorata`, `firm`, `familyOffice`, `dealCraft`, `reviewable`, `playerAccelerator`, `hallOfFame`, `stakeConsents` and `offerComparison`. Each is `null` (or empty) in worlds without the note.

## The ladder (§2)

| Rung | Requirements (configurable) | Opens |
| --- | --- | --- |
| 1 Angel | Be an investor | Angel cheques, deal flow, the exchange |
| 2 Syndicate lead | 2 angel deals, 2★ | `syndicate.*`; secondaries |
| 3 Emerging manager | 3 deals (syndicates count), LP panel score 0.42 | `fund.launch` (Fund I) |
| 4 Fund manager | Fund I closed | Firm, accelerator, fund operations |
| 5 Established GP | Fund I DPI 0.5 and 2 LPs who would re-up | Fund II and later, strategy funds |
| 6 Firm founder | 2 funds, 1 hire | — |
| 7 Allocator | 60 months of living costs liquid, or a fund at DPI 1 | Fund of funds |
| 8 Institution leader | A senior DFI, bank or sovereign-fund role | — |

Rungs 2–6 are climbed one at a time. Rungs 7 and 8 open on their own conditions. Each rung is recorded once (milestone `investor.rung-N` and an inbox note). Reaching rung 2 brings a co-lead invitation from an AI angel; reaching rung 3 brings an anchor commitment from a development LP (`career.invitation`).

## Commands

| Area | Commands |
| --- | --- |
| Career | `career.invitation`, `investor.tutorial` |
| Exchange | `shares.buy` / `shares.sell` (now with an optional `fundId`), `shares.order`, `shares.cancel`, `index.buy`, `index.sell` |
| Syndicates | `syndicate.open`, `syndicate.back`, `syndicate.close`, `syndicate.cancel` |
| Funds and LPs | `fund.launch`, `fund.close`, `fund.abandon`, `lp.commit`, `lp.diligence`, `lp.pay`, `lp.delay`, `lp.autopay`, `lp.pitch` (now with `fundId`) |
| Fund operations | `fund.plan`, `fund.reserve`, `fund.ic`, `fund.letter`, `fund.extend`, `prorata.answer`, `invest.propose` (now with `fundId`) |
| Firm | `firm.found`, `firm.hire`, `firm.invite`, `firm.answer`, `firm.letGo`, `firm.carryAsk`, `firm.succession` |
| Allocators | `fof.commit`, `fund.lpac`, `lpac.vote`, `stake.sell`, `stake.offer`, `stake.answer`, `stake.consent`, `secondary.investorSell` |
| Deal craft | `deal.choose`, `pipeline.add`, `pipeline.watch`, `pipeline.pass`, `diligence.claim`, `diligence.references`, `invest.support`, `invest.scout`, `review.investor` |
| Institutions | `accelerator.found`, `accelerator.admit`, `career.join` (now with `sovereign`) |

Month-end work runs inside `settleMarket`, each piece on its own RNG label where it draws (`syndicate`, `firm`, `pipeline`):

1. `settleSyndicates` and `settleLpFunds`, after the programmes.
2. `settleExchange`, `settlePositionMarks` and `settleFundOps`, after listed prices move.
3. `settleFirms`, after people settle.
4. `settleDealCraft`, before deals expire.

## Functional requirements (§13)

Every requirement has an engine test. FR-I-026 to FR-I-028 and FR-I-002 also have a browser test.

| ID | Status | Where |
| --- | --- | --- |
| FR-I-001, 003, 004, 006, 008, 009, 011, 015–017, 019, 020, 022, 024, 025 | Existed; still pass | (earlier waves) |
| FR-I-002 First session | Built | `career.ts` tutorial; e2e |
| FR-I-005 Pipeline, pass reasons, ghosting | Built | `dealcraft.ts` |
| FR-I-007 Claim checks and red flags | Built | `dealcraft.ts` (`checkClaim`, `redFlags`) |
| FR-I-010 Competitive rounds | Built (AI hot rounds) | `dealcraft.ts` (`resolveHotRounds`) |
| FR-I-012 Mark history, TVPI, IRR | Built | `fundops.ts` |
| FR-I-013 Pro-rata | Built | `fundops.ts` (`afterRound`, `answerProRata`) |
| FR-I-014 Reserves | Built | `fundops.ts` |
| FR-I-018 Syndicates | Built | `syndicates.ts` |
| FR-I-021 Fund II | Built | `lpfunds.ts` (rung 5), `firms.ts` (size cap) |
| FR-I-023 Investor reputation | Built | `dealcraft.ts` (inbound pitches, reviews) |
| FR-I-026–028 Ladder, angel ceiling, invitations | Built | `career.ts` |
| FR-I-029–032 Exchange, orders and depth, index fund, blackout | Built | `exchange.ts` |
| FR-I-033–036 Fund terms and closes, player LPs, calls, LP reporting | Built | `lpfunds.ts`, `fundops.ts` |
| FR-I-037 Investment committee | Built | `fundops.ts` |
| FR-I-038, 039 Firm and partners, multiple funds | Built | `firms.ts` |
| FR-I-040 Fund of funds, family office | Built | `allocation.ts` |

## Choices and departures from the blueprint

These are the places where the blueprint left room, or where Runway's existing rules needed an interpretation.

- **Credit penalty for a missed capital call.** The blueprint's "−50 points" assumes a 300–850 credit scale. Runway's score runs 0–100, so a missed call goes on the record as one default (−18 points). It is configurable in `INVESTOR.penalties`.
- **Ghosting penalty.** It applies to pitches human founders send to human investors (`pitch.start` with an investor). AI founders' interest shows up as pipeline entries, not pitches.
- **GP consent for LP stake sales.** A human GP approves or rejects every sale of an LP stake in their fund (`stake.consent`), whether the buyer is an outside secondary buyer or another player. Nothing changes hands until then. The buyer must still qualify: meet the LP-track threshold and not be barred after a missed call. A sale the GP leaves past its expiry lapses. AI-managed funds consent at once to qualified buyers.
- **Competitive rounds.** Strong AI companies that are raising run "hot rounds": they compare every offer made in the month. Human founders with two or more open offers see them side by side on the deals screen (`offerComparison`): amount, valuation, the share each investor would own, terms, and the investor's stars, founder trust and reviews. A "best fit" pick uses the same score the AI founders use. `deal.choose` takes one offer and declines the others, telling each investor why.
- **Insider blackout timing.** The results blackout is the last quarter of each game month. It is known only when the server's clock settles the market (`MarketState.monthMs`). Open votes and open sale offers black out insiders at any time.
- **First-session protection.** A player still in the first session gets an AI founder's immediate answer even when the round is hot, so the first cheque never depends on luck (§3.1).
- **Index fund dividends.** These are reinvested by buying more of the paying company from the float. If a listed company is acquired, the index fund's share of the proceeds goes to the outside world, as the public float's does.

## Balance: what the simulator says (Phase 10)

`npm run sim` (on by default; `--before-investor` turns it off) scripts one human angel per launch city and prints the outcome distribution of every cheque against §11.2's targets. On seed 7 at 24 and 48 months, very few cheques have lost money: 3–5% sit below 1×, against a target of 50–65%. Most sit at 1–3× on paper. That is because AI startups rarely shut down in the current company simulation, and SAFEs are marked at cost until they convert. Bringing returns to a power law would mean changing company survival, which also changes the founder game. Decision (20 October 2026): keep returns as they are, so 3–5% of cheques sit below 1×. Company survival and SAFE marks are unchanged, and the founder game plays as before. The §11.2 targets are not met on purpose.

The other balance knobs are all in `INVESTOR`: ladder thresholds, fund life, the angel cap, syndicate carry and the index fee.

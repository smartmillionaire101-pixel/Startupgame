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

## The investor journey

Investors get the same guidance founders get: chapters in the Journey app and on the map's Journey button, and the main "What to do now" prompt (`journeyView` with `kind: 'investor'`, `packages/engine/src/journey.ts`). The first chapters point at investing that was already in the game. The investor career's new features come later, as optional steps.

| Chapter | Steps (Go opens) |
| --- | --- |
| 1 The First Cheque | Invest in a startup (Invest app); back 3 startups (Deal offers) |
| 2 The Track Record (any one) | Back a company again; take a board seat; mentor a startup; buy listed shares (Capital app) |
| 3 Fund I | Raise Fund I (Portfolio); invest from your fund; optionally return money to your investors |
| 4 The Firm (any one) | Lead a syndicate; back another fund as an LP; found a firm; raise Fund II (Portfolio) |
| 5 The Legacy (any one) | Give to a cause; take a senior DFI, bank or sovereign role (Capital app); start an accelerator |

A finished chapter is recorded once as `investor.chapter-N`, with an inbox note. The journey follows the role you play: investors get the investor journey even if they once started or sold a company; founders keep the founder journey. Pinning and dismissing prompts (`journey.pin`, `journey.dismiss`) work for investors too.

The screens investors already knew come first. Portfolio opens on Deal offers, Positions and the fund card, with the investor career ("Grow as an investor") below. Capital → Markets is the stock market list, and the city exchange is under Portfolio → Markets. Simple mode applies to founders only.

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

- **Angel ceiling switched off.** `INVESTOR.caps.angelCeiling` is `false`: angels invest with no per-cheque cap and can back Series A and later rounds alone, as before. Only a new investor's guided first cheque is capped. Set it to `true` to turn on the blueprint's ceiling (a tenth of liquid net worth, and a lead for Series A and later).
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

## Deal flow at events and realistic LP pitches (23 October 2026)

Player feedback: a new investor had little deal flow, events didn't help, and LP pitches ignored strategy. Switched on by its own release note, `DEALFLOW_NOTE` (`release-2026-10-23-investor-dealflow`, `dealflowOn`); worlds without it play exactly as before. Numbers live in `DEALFLOW` and the lessons in `LESSONS` (`packages/engine/src/data/dealflow.ts`).

- **Founders pitch you** (`dealflow.ts`). At a tech event (`techevent.attend`), a hosted investor breakfast, demo day or founder meetup (held at settlement), or a hangout, founders approach a human investor: AI companies, and human founders who are there too. Each pitch joins the pipeline (source `event`) with a snapshot: stage, sector, revenue, customers, growth, team, the ask and the valuation (an AI founder takes those terms). A new investor (under 3 deals) always hears at least two pitches; a demo day is a batch of 4–6. When the city has too few unseen companies, fresh startups pitch (within the city's AI population plus `extraStartups`). Follow up with first-call diligence, invest with `invest.propose`, or `pipeline.pass`.
- **Investors teach you.** AI angels and fund partners there share their strategy (cheque, stages, sectors, fund size, companies, reserves, ownership) and a lesson. A new lesson adds investing skill and a little LP credibility, and counts as knowledge in an LP pitch. They become contacts, and some refer a deal (`referral`; a co-investment when their fund holds it).
- **LP pitches judge strategy** (`lpreview.ts`). `fund.raise` and `fund.launch` take an optional `plan` (geography, average cheque, companies, reserves, ownership target; `fund.raise` adds size, fee and carry). `strategyChecks` (pure, also run live in the client) checks the deploy arithmetic after fees and reserves, portfolio size for the stage, reserves, ownership against a typical post-money, terms, focus; the review adds fund size against your record and geography. Each LP weighs track record (TVPI, DPI, deals, losses), strategy, team and market through its own lens, asks questions, and commits (an amount in its ticket range) or passes with a reason. Broken arithmetic is a no from everyone. Fund I closes when commitments reach half the target; `lp.pitch` decisions for a fund launched with a plan carry the same review.
- Views: `investorDealFlow` (pitches, talks, lessons, the last panel, typical valuations, LP capacity); `lpFunds.gp[].lpPipeline[]` gains status and review. Journey: optional steps `first-cheque.events` and `fund.learn`. Tests: `investor-dealflow.test.ts`, `e2e/investor-dealflow.spec.ts`.

## A realistic first fund (23 October 2026)

Player feedback: a new angel with three small cheques pitching a ₦1.6bn Fund I was passed by every LP ("54,667× what you have shown") with no path forward. Switched on by `MORE_GAMES_NOTE` (`moreGamesOn`, same release); worlds that logged the deal-flow or places notes but not this one keep the old panel exactly. Code in `firstfund.ts`, numbers in `FIRST_FUND` (`data/investor.ts`).

- **Suggested size.** `suggestFundSize` (pure) reads the record: capital deployed, deals, markups (a company you backed raising again at a higher price, `markupsOf`), cash returned, lessons and stars. It is 10–50× the capital deployed, never below a floor in months of the city's cost of living (about ₦100–300m in Lagos for a handful of deals and a markup). The pitch form says "LPs will take you seriously up to about X" with a one-tap **Use this size** that also fits the strategy (`fitPlanToSize`). The review's size check uses it; far above it (2× the top of the range) every LP passes.
- **First-time-manager LPs.** Besides the city's LPs (same bars): the city's **emerging-manager programme** (Fund I only, a lower bar, but 5 deals and a markup) and your **circle**: angels and fund partners you met at events and friends and family, who commit small tickets on relationship and reputation (from 3 deals). Each still gives a specific reason.
- **The anchor.** The first LP willing to put in 20–30% of the target anchors the fund and lifts every other LP's score by `anchorLift` (deterministic); the review says who anchored it. A career anchor counts the same way.
- **Rolling closes.** Once half the target is covered the other willing LPs wait ("after your first close"). Fund I opens an LP book (`lp.rolling`), holds its first close and invests (`firstClose`: AI LPs pay in, the GP's 1% is called). Each month the LPs not yet in re-review (`rollingClose`), and the most willing joins with a catch-up, up to the target; `lp.pitch` works too. The final close comes at the target, by hand, or six months on (`finalClose`).
- **Next steps.** When LPs pass, `nextSteps` names the gap: "Do 2 more deals", "Get one markup", "Try ₦240m instead of ₦1.6bn", "Meet more investors at events", reputation. A record of 0–2 deals is heard rather than refused. The pitch form shows the same steps before you pitch (`investorDealFlow.firstFund`).
- Tests: `first-fund.test.ts`, `e2e/investor-dealflow.spec.ts`.

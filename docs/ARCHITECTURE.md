# Architecture

## Principles carried from the design document

| Design principle | How the code honours it |
| --- | --- |
| Real data sets conditions; simulation decides outcomes | `engine/src/data/*` holds sourced market snapshots; live feeds only issue `market.data` commands. No outcome reads a feed directly. |
| Systems connect | Lifestyle → hours/energy → product output → customers → revenue → valuation → fundraising → exits → savings → lifestyle. All one engine, one settlement. |
| The world persists | Append-only command log + snapshots; exact replay on boot. |
| Short and sharp | Read models (`views.ts`) pre-compute what each screen needs; articles ≤ 60 words, alerts ≤ 12 (tested). |
| Honesty is checked | Pitch answers and press claims are checked against game data (`fundraising.ts`, `media.ts`). |
| Failure is part of a career | Shutdown waterfall, reputation by how you fail, comebacks, the floor. |
| Money can't buy success | No payment code exists; monetisation is deferred (§19). |

## Engine (`packages/engine`)

- **Pure and deterministic.** All randomness comes from `rng.ts`, derived per purpose from the world seed (`deriveRng(seed, 'settle', market, month)`), so adding a random draw in one system never shifts another. `Math.random` is banned by lint.
- **Commands in, world out.** `dispatch(world, command, { actorId, now })` validates rules and returns a new world (Immer). A rule violation throws `GameRuleError` and the *whole* command rolls back — no half-executed deals.
- **Double-entry money.** Every movement is a ledger transfer between accounts in one currency; the outside world (AI customers, tax authority, LPs, FX desks) is modelled as external accounts. The sum of all balances per currency is always zero — a property test checks it against random play.
- **Integer money.** Minor units only (kobo, cents, pence). Floats never touch balances.
- **Privacy by projection.** The world holds everything; `playerView` returns only what that player may see. AI negotiation limits and the truth behind pitch options are stripped (tested).

Key modules: `customers.ts` (segments capped by real buyers, funnel, competition), `staff.ts` (talent pool, negotiation, morale), `captable.ts` (SAFEs, priced rounds, pool shuffle, waterfall), `fundraising.ts`, `deals.ts` (deal cards), `media.ts` (outreach, fact-check), `company.ts` (monthly operations), `personal.ts` (lifestyle, hours, gigs, FX), `funds.ts` (Fund I, fees, carry), `ai.ts` (AI population), `settlement.ts` (the month). Phase 2: `credit.ts`, `travel.ts`, `marketplace.ts`, `governance.ts`, `acquisitions.ts`, `arbitration.ts`, `banks.ts`, and `upgrade.ts` (schema upgrades for saved worlds). Wave 1: `story.ts` (the monthly story: why the month went the way it did, ranked by impact, with suggested next moves) and `rescue.ts` (distress levels, the rescue plan and its moves: cut costs, hibernate, bridge SAFE, fire sale).

Balancing constants live in one place per system (`CUSTOMER_TUNING`, `STAR_TUNING`, salary bands, `OUTLET_EFFECT`), and `npm run sim` prints an economy report to tune them — the design doc lists star values and hours as beta-tuning questions.

## Server (`apps/server`)

- **Single writer.** `GameService` holds the world in memory. Node runs one command at a time and dispatch is synchronous, so commands are serialised without locks.
- **Durability.** The command is appended to SQLite *before* the new world replaces the old one. Snapshots (gzip JSON) every N commands and after each settlement; boot = latest snapshot + replay. A replay that diverges fails loudly rather than serving a wrong world.
- **The clock.** Every 30 s the server checks `dueSettlements`: each market settles once its local midnight passes, with capped catch-up after downtime.
- **Feeds.** FX from a free public endpoint every 6 h, with sanity bounds; failures keep the last values.
- **Security.** Phone numbers stored only as HMAC; OTPs and session tokens stored as SHA-256; OTP attempts limited; DOB checked and discarded; `httpOnly` + `SameSite=Strict` cookies plus a required `x-runway` header against CSRF; rate limits; strict CSP; Zod validation at every boundary; logs redact phone, code and cookies; system commands cannot be sent by clients.
- **Chat** lives outside the simulation (it must never affect outcomes or be visible to reporters/arbitrators): starters only to begin, filters for links/phones/emails/handles, scam flagging, block and report.

### Serverless hosting (Netlify)

The same Fastify app runs inside a Netlify Function: each request is passed through `app.inject`, so routes, validation, security headers and rate limits are identical. Because no process lives long enough to hold the world, `KvGame` keeps it in Netlify Blobs as an event log plus a snapshot. Writing `log/<version>` with "only if new" is the commit point: exactly one writer can produce each version, and a writer that loses the race reloads and re-runs the command on the newer world. Snapshots are written once per version every ten commands and after each settlement (the newest three are kept); a cold function loads the newest and replays the log after it (the engine is deterministic). A warm function only checks whether the next log entry exists. The function code is bundled into one plain JavaScript file at build time (`scripts/build-functions.mjs`), because Netlify copies dependencies as they are and the engine is a TypeScript workspace package. Accounts and chats use per-record compare-and-swap (`KvAccountStore`). The clock is a scheduled function; clients poll instead of holding a server-sent-events connection.

### Scaling path

Markets are independent except for FX and cross-market rules, so the natural next step is one writer per market (shard the command log by market) behind the same API. The read model can be cached per `(player, worldVersion)`. Postgres can replace SQLite behind the `Store` class.

## Web (`apps/web`)

React with hand-written CSS (about 90 KB gzipped, mostly React). Server-sent events tell clients to refetch when the world changes; **lite mode** drops charts and the live connection and polls every minute. A service worker caches the app shell and the public daily digest for offline reading; private state is never cached. Light/dark themes, safe-area insets, reduced-motion support, labelled controls.

**Languages.** English and French (`src/i18n`). Strings are written in English and wrapped in `t('…')`, gettext style, so a missing translation falls back to readable English; placeholders (`{name}`) keep word order free. A test extracts every `t()` call from the source and fails on any string without French or with mismatched placeholders. Server text goes through `tx()`, which translates exact matches. The language is detected from the browser and can be switched on the sign-in screen or in Settings.

## Testing

| Layer | Tool | Highlights |
| --- | --- | --- |
| Engine | Vitest + fast-check | money conservation under random play, cap-table and waterfall properties, determinism, fact-checking, privacy of views |
| Server | Vitest + Fastify inject | auth, CSRF, rule errors → 422, chat privacy and filters, account deletion, exact replay after restart |
| Web | Vitest + Testing Library | sign-in flow and request headers, amount parsing, French catalog completeness and formats |
| End to end | Playwright | founder, investor and banker journeys against the real server and production build |

# Runway: The Startup Game

**Build, invest and grow. Real startup lessons. No real-world losses.**

A persistent multiplayer simulation where players found startups, invest in them, and (from phase 2) run banks, inside real cities whose conditions — exchange rates, interest rates, salaries, cost of living, taxes, public-market multiples — come from real data. The simulation decides outcomes; real data only sets the stage.

This repository implements **Phases 1 and 2** of the design document: nine markets (Lagos, Nairobi, London, Accra, Freetown, Kigali, Johannesburg, Cairo, Dubai); founder, investor and banker roles; AI customers, staff, investors, reporters and incumbents; player banks, a B2B marketplace, acquisitions and votes, travel, personal credit; English and French.

> This is a game. Nothing here is financial, legal, or tax advice.

## Quick start

Requires Node 22.13+.

```bash
npx -y npm@11 install       # npm 11: npm 10 has a resolver bug with this dependency tree
cp apps/server/.env.example apps/server/.env
npm run dev                 # server on :8787, web on http://localhost:5173
```

In development the sign-in screen shows the SMS code, and Home has an **Advance one month** button so you don't have to wait for midnight.

| Command | What it does |
| --- | --- |
| `npm run check` | format check, lint, typecheck, all unit/integration tests |
| `npm test` | Vitest across engine, server and web |
| `npm run e2e -w @runway/web` | Playwright: real server + production client on a phone viewport |
| `npm run sim -- --months 24 --seed 7` | Economy report: simulate a world and print survival, money supply, stars |
| `npm run build` | Production client and bundled server |
| `docker build -t runway .` | Container with a non-root runtime; mount `/data` for the database |

## Deploying

**Netlify** (`netlify.toml`): the client is served as static files, the API runs as a Netlify Function (`netlify/functions/api.mts`), and the game clock as a scheduled function every five minutes (`netlify/functions/clock.mts`). State lives in Netlify Blobs: the world as a command log plus a snapshot, with compare-and-swap commits so simultaneous players never overwrite each other (`apps/server/src/serverless`). Production uses one site-wide store that survives redeploys; every deploy preview gets its own empty world with dev tools on. Connect the repository in Netlify and it deploys on every push to `main`; the **Deploy check** workflow then tests the live site.

- No SMS gateway is connected yet, so the sign-in code is shown on screen (`SHOW_SIGNIN_CODE`). Plug a provider into `adapters/sms.ts` and set `SHOW_SIGNIN_CODE=0` before a public launch.
- `SESSION_SECRET` can be set in the Netlify UI; otherwise one is generated once and kept in the site's private blob store.

**Docker** (`Dockerfile`): the long-running server with SQLite and live updates over server-sent events.

## How it fits together

```
packages/engine   Pure, deterministic simulation. No I/O. Same seed + same commands = same world.
apps/server       Fastify. Auth, persistence (command log + snapshots), the clock, data feeds, chat.
apps/web          React, mobile-first, no UI framework. Lite mode, offline digest.
docs/             Architecture, decision records, design-document coverage.
```

An analogy: the **engine is a chess rulebook**, the **server is the referee with the scoresheet**, and the **web app is the board players look at**. The referee never improvises rules — it writes down every move (the command log). Because the rulebook is deterministic, anyone with the scoresheet can replay the whole game and arrive at exactly the same position. That is how the world survives restarts, and how any dispute or bug can be audited.

Read more in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and the decision records in [docs/adr](docs/adr). What is and isn't built yet, section by section of the design document, is in [docs/DESIGN-COVERAGE.md](docs/DESIGN-COVERAGE.md).

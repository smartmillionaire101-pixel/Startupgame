# Runway: The Startup Game

**Build, invest and grow. Real startup lessons. No real-world losses.**

A persistent multiplayer simulation where players found startups, invest in them, and (from phase 2) run banks, inside real cities whose conditions — exchange rates, interest rates, salaries, cost of living, taxes, public-market multiples — come from real data. The simulation decides outcomes; real data only sets the stage.

**Play it: [runwaystartup.netlify.app](https://runwaystartup.netlify.app)** (tick that you're 18 or older and press Play now).

This repository implements **Phases 1 and 2** of the design document plus three waves of city play: ten markets (Lagos, Nairobi, London, Accra, Freetown, Kigali, Johannesburg, Cairo, Dubai, San Francisco), each an illustrated city with its own plan, local businesses that trade with startups, gigs, AI founders and angel investors, hosted events and networking; founder, investor and banker roles; AI customers, staff, investors, reporters and incumbents; player banks, a B2B marketplace, acquisitions and votes, travel, personal credit; guest play with email sign-in links; English and French.

> This is a game. Nothing here is financial, legal, or tax advice.

## Quick start

Requires Node 22.13+.

```bash
npx -y npm@11 install       # npm 11: npm 10 has a resolver bug with this dependency tree
cp apps/server/.env.example apps/server/.env
npm run dev                 # server on :8787, web on http://localhost:5173
```

In development, sign-in links are shown on screen (no email is sent), and Home has an **Advance one month** button so you don't have to wait for midnight.

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

- Players start as guests; to let them save their game and log in on other devices, switch on email sign-in (below). Until then production answers "Email sign-in isn’t switched on yet" and guest play still works.
- The old phone sign-in endpoints still exist for older clients; `SHOW_SIGNIN_CODE` only affects them (and lets previews show sign-in links). Nothing new depends on it.
- `SESSION_SECRET` can be set in the Netlify UI; otherwise one is generated once and kept in the site's private blob store.

## Sign-in

- **Play now.** The player ticks "I confirm I’m 18 or older" and taps Play now: a guest account and a session cookie (30 days), no email, no date of birth. The game lives only in that browser until it is saved.
- **Save progress.** Guests see a Save progress button (Me tab, Settings, and a nudge on Home after their first month). They enter an email and get a one-time sign-in link (valid 15 minutes, single use; only its SHA-256 is stored). Opening it attaches the email to their account. One account per email: an email that already has a saved game is never merged or overwritten — the player is told to log in instead.
- **Log in.** "Already saved? Log in" emails a link that opens the saved game on any device. No passwords.
- **Signing out as a guest** first warns: "You’ll lose this game unless you save it with an email".

API: `POST /api/auth/guest {adult:true}` → `{ok, guest}`; `POST /api/auth/email {email, intent:'login'|'save', lang?}` → `{ok, sent}` (the same whether or not the email has an account; `devLink` too in development and previews); `POST /api/auth/email/verify {token}` → `{ok, intent, isNew, account}` + session cookie; `GET /api/state` includes `account: {guest, email}`. All POSTs need the `x-runway: 1` header. Limits: 30 new guests per address per 10 minutes (`GUEST_RATE_LIMIT`), 20 links per address (`EMAIL_RATE_LIMIT`) and 5 per email per 15 minutes.

### Email sign-in: switching it on

The server sends links through **Resend** if `RESEND_API_KEY` is set, otherwise through **SMTP** if `SMTP_HOST` is set, otherwise nowhere (development: the link is logged and shown on screen; production: email sign-in is off). In production links always point at `PUBLIC_URL` (on Netlify, the site's main URL is used automatically), never at whatever Host a request claims. Test addresses on reserved domains (`@example.com`, `.test`) are never mailed.

**Free option: a Gmail account with an App Password** (fine for a few hundred emails a day):

1. Sign in to the Gmail account that should send the emails, open **Google Account → Security**.
2. Turn on **2-Step Verification** (App passwords only appear once it is on).
3. Open **App passwords** (Security → 2-Step Verification → App passwords, or search "App passwords"), create one named **Runway**, and copy the 16-character password (spaces don't matter).
4. In Netlify: **Site configuration → Environment variables**, add:

   | Variable | Value |
   | --- | --- |
   | `SMTP_HOST` | `smtp.gmail.com` |
   | `SMTP_PORT` | `465` |
   | `SMTP_USER` | your Gmail address |
   | `SMTP_PASS` | the 16-character App Password |
   | `EMAIL_FROM` | `Runway <your Gmail address>` |

   For the Docker/Node server, put the same lines in `apps/server/.env` and also set `PUBLIC_URL=https://your.domain`.
5. Redeploy, then use "Already saved? Log in" with your own address to check a link arrives.

**Alternative: Resend** (free tier, better deliverability, needs a domain you control): create an API key at resend.com, verify your sending domain, then set `RESEND_API_KEY` and `EMAIL_FROM=Runway <signin@your.domain>`. Resend wins if both are set.

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

# 0001 — Deterministic engine with an append-only command log

**Status:** accepted

## Context
The world persists forever (§1 principle 3), disputes are settled from deal-card evidence (§9), and fraud must be provable (§18). We need durability, auditability and the ability to reproduce any bug.

## Decision
The simulation is a pure function of `(seed, ordered commands, timestamps)`. The server logs each successful command before applying it and snapshots periodically. Randomness is derived per purpose from the seed.

## Consequences
- Restarts replay to the identical world (tested).
- Any reported bug can be reproduced from the log.
- Engine changes that alter outcomes need a versioned migration (replay from the last snapshot under the old engine, then snapshot). `World.schemaVersion` exists for this.
- Commands must carry everything external (time, feed values) — feeds therefore enter as `market.data` commands.

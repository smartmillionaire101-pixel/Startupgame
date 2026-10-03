# 0003 — Stack: TypeScript monorepo, Fastify, SQLite, React

**Status:** accepted for the MVP

- **One language end to end** so the engine's types and command schemas are shared by server and client.
- **Fastify** for speed, schema-friendly hooks and mature security plugins.
- **Node's built-in SQLite** (no native build) behind a small `Store` class; swappable for Postgres when sharding by market.
- **React without a UI kit** to keep the bundle small for low-bandwidth markets (§20 access requirements).
- **Zod** at every trust boundary; **Vitest**, **fast-check** and **Playwright** for tests.

Trade-off: `node:sqlite` still prints an experimental warning on Node 22; it is stable API-wise for our use and isolated behind `Store`.

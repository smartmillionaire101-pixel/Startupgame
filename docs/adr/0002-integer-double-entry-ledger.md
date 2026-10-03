# 0002 — Integer, double-entry money

**Status:** accepted

## Context
Taxes, fees and lifestyle are the game's money sinks (§8); inflation must be visible to the live-ops dashboard (§20).

## Decision
All balances are integers in minor units. Every movement is a transfer between two accounts in one currency. The outside world is modelled as external accounts (customers, payroll, suppliers, tax, LPs, FX desks) that may go negative. Conversion goes through per-currency FX desk accounts at the official rate minus a fee.

## Consequences
- Per-currency totals always sum to zero; a property test enforces it.
- The external accounts are exactly the money supply dashboard: how much entered from customers, how much left as tax.
- Real accounts can never go negative; shortfalls become explicit game states (unpaid payroll, missed payments, defaults).

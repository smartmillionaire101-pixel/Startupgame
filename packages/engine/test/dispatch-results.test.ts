import { describe, expect, it } from 'vitest';
import { addFounder, makeWorld, run } from './helpers.js';

/** Every object in `v`, read the way a JSON serializer reads it (a revoked draft throws). */
function walk(v: unknown, seen = new Set<object>()) {
  if (v === null || typeof v !== 'object' || seen.has(v)) return;
  seen.add(v);
  for (const k of Object.keys(v)) walk((v as Record<string, unknown>)[k], seen);
}

describe('command results', () => {
  it('are plain data after dispatch: booking the same flight again returns the ticket, not a draft', () => {
    let w = structuredClone(addFounder(makeWorld(), 'host'));
    const local = w.accounts[w.players.host!.accounts.local]!;
    local.balance = Math.max(local.balance, 50_000_000);
    const first = run(w, 'host', { type: 'travel.book', to: 'london', hotel: 'business' });
    w = first.world;
    // The web client books the ticket home again on its way to the airport.
    const again = run(w, 'host', { type: 'travel.book', to: 'london', hotel: 'business' });
    expect(() => walk(again.result)).not.toThrow();
    expect(JSON.parse(JSON.stringify(again.result))).toEqual(
      JSON.parse(JSON.stringify(w.players.host!.flightTicket)),
    );
    expect(again.world.players.host!.flightTicket).toEqual(w.players.host!.flightTicket);
  });
});

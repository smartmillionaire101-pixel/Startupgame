/**
 * Wave 7 view adapters for the home: needs, mood, home-act caps and people
 * you can invite. Read defensively: an older server simply hides what it
 * doesn't send.
 */
import type { PlayerView } from '@runway/engine';

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown, d: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : d;

export const NEEDS = ['hunger', 'hygiene', 'fun', 'social'] as const;
export type NeedKey = (typeof NEEDS)[number];
export type Needs = Record<NeedKey, number>;

const meOf = (view: PlayerView) => view.me as unknown as Record<string, unknown>;

/** `view.me.needs`, or null from an engine without them. */
export function needsOf(view: PlayerView): Needs | null {
  const n = meOf(view).needs;
  if (!isObj(n)) return null;
  return {
    hunger: num(n.hunger, 70),
    hygiene: num(n.hygiene, 70),
    fun: num(n.fun, 70),
    social: num(n.social, 70),
  };
}

/** `view.me.mood` (0–100), else computed the engine's way. */
export function moodOf(view: PlayerView): number {
  const m = meOf(view).mood;
  if (typeof m === 'number') return m;
  const n = needsOf(view);
  const e = view.me.energy;
  return n ? Math.round((e + n.hunger + n.hygiene + n.fun + n.social) / 5) : e;
}

/** Uses left this month for an act (or 'invite'); null when the engine doesn't say. */
export function actsLeft(view: PlayerView, act: string): number | null {
  const a = meOf(view).homeActs;
  if (!isObj(a)) return null;
  const x = a[act];
  return isObj(x) && typeof x.left === 'number' ? x.left : null;
}

export interface Invitee {
  personId: string;
  name: string;
  sub: string;
  contact: boolean;
}

/** Your contacts you can have over, then fund partners in your city. */
export function inviteesOf(view: PlayerView): Invitee[] {
  const out: Invitee[] = [];
  const seen = new Set<string>();
  const contacts = (view.me as unknown as { contacts?: unknown }).contacts;
  if (Array.isArray(contacts))
    for (const c of contacts) {
      if (!isObj(c) || typeof c.chatId !== 'string' || !c.chatId) continue;
      const [name, ...rest] = String(c.name ?? '').split(',');
      if (seen.has(c.chatId)) continue;
      seen.add(c.chatId);
      out.push({
        personId: c.chatId,
        name: (name ?? '').trim() || '—',
        sub: rest.join(',').trim(),
        contact: true,
      });
    }
  for (const f of view.market.funds ?? []) {
    const id = `fund:${f.id}`;
    if (seen.has(id) || out.length >= 14) continue;
    seen.add(id);
    out.push({ personId: id, name: f.partner, sub: f.name, contact: false });
  }
  return out;
}

/** The furniture tier per slot you own (1–3). */
export function ownedTiers(view: PlayerView): Map<string, number> {
  const h = meOf(view).home;
  const out = new Map<string, number>();
  if (isObj(h) && Array.isArray(h.items))
    for (const i of h.items)
      if (isObj(i) && typeof i.slot === 'string')
        out.set(i.slot, Math.max(1, Math.min(3, num(i.tier, 1))));
  return out;
}

/**
 * Wave 10 §C: lifestyle outings (a yacht day, golf or polo, a gala, a
 * private-jet weekend, a rooftop party) play as their own full-screen act,
 * above the city and the phone, so a jet that lands you in another city
 * doesn't cut the scene short. Anything can start one: the venue's tray, the
 * Going out app. The host (./OutingScene.tsx) is mounted once, with the phone.
 *
 * The same host shows a pitch competition (`openCompetition`).
 */
export type OutingKind = 'yacht' | 'golf' | 'gala' | 'jet' | 'rooftop';

export interface OutingRequest {
  businessId: string;
  venueName: string;
  item: { id: string; label: string; price: number; travel?: boolean };
  /** A travel outing's destination (asked in the scene when missing). */
  to?: string;
}

/** Which outing an item is, or null for an ordinary act in the room. */
export function outingOf(item: { id: string; label?: string }): {
  kind: OutingKind;
  variant: string;
} | null {
  const s = `${item.id} ${item.label ?? ''}`.toLowerCase();
  if (/yacht|cruise/.test(s))
    return { kind: 'yacht', variant: /sunset/.test(s) ? 'sunset' : 'day' };
  if (/\bpolo\b/.test(s)) return { kind: 'golf', variant: 'polo' };
  if (/\bgolf\b/.test(s)) return { kind: 'golf', variant: 'golf' };
  if (/gala|charity-ball|charity ball/.test(s))
    return { kind: 'gala', variant: /charity/.test(s) ? 'charity' : 'gala' };
  if (/jet/.test(s)) return { kind: 'jet', variant: '' };
  if (/rooftop-party|rooftop party/.test(s)) return { kind: 'rooftop', variant: '' };
  return null;
}

export type HostRequest =
  { kind: 'outing'; req: OutingRequest } | { kind: 'competition'; id: string };

let current: HostRequest | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function startOuting(req: OutingRequest) {
  current = { kind: 'outing', req };
  emit();
}

/** Open the pitch competition scene (the stage, the judges, the results). */
export function openCompetition(id: string) {
  current = { kind: 'competition', id };
  emit();
}

export function closeHost() {
  current = null;
  emit();
}

export const hostRequest = () => current;

export function onHost(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/**
 * Wave 12 §A: opening a game from anywhere (a bar's tray, the home TV, the
 * Games app, an alert). One host (./GamesHost.tsx) is mounted with the phone
 * and shows either the set-up sheet or the game itself, full screen.
 */
import type { GameKind, GameWhere } from '@runway/engine';

export interface NewGameRequest {
  kind: GameKind;
  where: GameWhere;
  /** A venue game: where. */
  businessId?: string;
  venueName?: string;
  /** Ask these players along (e.g. the friend you're visiting). */
  invite?: string[];
}

export type GamesRequest = { kind: 'new'; req: NewGameRequest } | { kind: 'game'; id: string };

let current: GamesRequest | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Set up a new game (the sheet: stake, AI players, invites, quiz questions). */
export function newGame(req: NewGameRequest) {
  current = { kind: 'new', req };
  emit();
}

/** Open a game: its lobby, the play, or the result. */
export function openGame(id: string) {
  current = { kind: 'game', id };
  emit();
}

export function closeGames() {
  current = null;
  emit();
}

export const gamesRequest = () => current;

export function onGames(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

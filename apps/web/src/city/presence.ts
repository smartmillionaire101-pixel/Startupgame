/**
 * Live presence (docs/WAVE2-PEOPLE-AND-EVENTS.md §A, §C): who else is on the
 * map, and telling the server where you are.
 *
 * Polls `GET /api/presence` every 5 s while the city map is open and the tab
 * is visible; reports your position after each walk and as a 30 s heartbeat.
 * When the server doesn't have presence (404), it stops asking for the rest
 * of the session: the city simply shows no other players.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../api';
import { normPresence, type PresenceView } from './people';

export const POLL_MS = 5_000;
export const HEARTBEAT_MS = 30_000;

/** Set once the server answers 404: presence isn't deployed. */
let missing = false;
const isMissing = (e: unknown) =>
  e instanceof ApiError && (e.status === 404 || e.status === 405 || e.status === 501);

/** `next`, or `was` when it holds the same players (so React keeps the old one). */
function same(was: PresenceView[], next: PresenceView[]): PresenceView[] {
  return was.length === next.length && JSON.stringify(was) === JSON.stringify(next) ? was : next;
}

export interface Spot {
  x: number;
  y: number;
  place: string | null;
}

export function usePresence({ enabled, selfId }: { enabled: boolean; selfId: string }) {
  const [players, setPlayers] = useState<PresenceView[]>([]);
  const last = useRef<Spot | null>(null);
  const lastSent = useRef(0);

  // Poll for other players.
  useEffect(() => {
    if (!enabled || missing) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      if (stopped) return;
      if (typeof document === 'undefined' || document.visibilityState !== 'hidden') {
        try {
          const raw = await api.presence();
          // The same players where they were: keep the old list, so the map
          // and the HUD don't re-render every few seconds for nothing.
          if (!stopped) setPlayers((was) => same(was, normPresence(raw, selfId)));
        } catch (e) {
          if (isMissing(e)) {
            missing = true;
            if (!stopped) setPlayers([]);
            return;
          }
          // Offline or a hiccup: keep what we have and try again.
        }
      }
      if (!stopped) timer = setTimeout(() => void tick(), POLL_MS);
    };
    void tick();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [enabled, selfId]);

  const send = useCallback((s: Spot) => {
    if (missing) return;
    lastSent.current = Date.now();
    // A failed report is harmless (the server also answers 404 before you have a
    // player); only the GET decides whether presence exists at all.
    api.reportPresence(s).catch(() => {});
  }, []);

  /** Report where you are now (after a walk). */
  const report = useCallback(
    (s: Spot) => {
      last.current = s;
      if (enabled) send(s);
    },
    [enabled, send],
  );

  // Heartbeat: keep you on other players' maps while you stand still.
  useEffect(() => {
    if (!enabled) return;
    const timer = setInterval(() => {
      if (missing || !last.current) return;
      if (document.visibilityState === 'hidden') return;
      if (Date.now() - lastSent.current >= HEARTBEAT_MS - 1000) send(last.current);
    }, HEARTBEAT_MS / 3);
    return () => clearInterval(timer);
  }, [enabled, send]);

  return { players: enabled ? players : [], report };
}

/**
 * Wave 6: the players inside one place, polled while its scene is open
 * (`GET /api/presence?place=<id>`). An older server ignores the parameter
 * and sends everyone, so the answer is filtered by `place` here as well.
 */
/** How long a player who was just in a place stays listed when a poll misses them. */
export const STICKY_MS = 30_000;

export function usePlacePresence({
  place,
  enabled,
  selfId,
}: {
  place: string;
  enabled: boolean;
  selfId: string;
}): PresenceView[] {
  const [players, setPlayers] = useState<PresenceView[]>([]);
  useEffect(() => {
    if (!enabled || missing) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // A player stays listed for a while after one poll misses them, so their row
    // (and its Chat button) doesn't blink out from under your finger.
    const recent = new Map<string, { p: PresenceView; seen: number }>();
    const tick = async () => {
      if (stopped) return;
      if (typeof document === 'undefined' || document.visibilityState !== 'hidden') {
        try {
          const raw = await api.presence(place);
          const now = Date.now();
          for (const p of normPresence(raw, selfId))
            if (p.place === place) recent.set(p.id, { p, seen: now });
            else recent.delete(p.id);
          for (const [id, r] of recent) if (now - r.seen > STICKY_MS) recent.delete(id);
          if (!stopped)
            setPlayers((was) =>
              same(
                was,
                [...recent.values()].map((r) => r.p),
              ),
            );
        } catch (e) {
          if (isMissing(e)) {
            missing = true;
            return;
          }
          // Offline or a hiccup: keep what we have and try again.
        }
      }
      if (!stopped) timer = setTimeout(() => void tick(), POLL_MS);
    };
    void tick();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [place, enabled, selfId]);
  return enabled ? players : [];
}

/** Test hook: whether the server answered 404 for presence. */
export const presenceMissing = () => missing;

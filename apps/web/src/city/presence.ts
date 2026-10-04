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
          if (!stopped) setPlayers(normPresence(raw, selfId));
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
    api.reportPresence(s).catch((e: unknown) => {
      if (isMissing(e)) missing = true;
    });
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

/** Test hook: whether the server answered 404 for presence. */
export const presenceMissing = () => missing;

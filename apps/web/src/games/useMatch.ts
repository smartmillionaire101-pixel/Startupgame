/**
 * Wave 12 §A: one game, kept fresh by polling `GET /api/games/:id` about once
 * a second while it's on (every few seconds in the lobby, and not at all once
 * it's settled). The server's clock comes with each answer, so countdowns run
 * on the server's time, not the phone's.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Command, GameView } from '@runway/engine';
import { api, ApiError } from '../api';
import { t, tx } from '../i18n';
import { useGame } from '../store';

export type Match = GameView;

export function useMatch(id: string) {
  const { toast, refresh: refreshState } = useGame();
  const [game, setGame] = useState<Match | null>(null);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const tag = useRef<string | null>(null);
  const offset = useRef(0);
  const seq = useRef(0);

  const load = useCallback(async () => {
    const n = ++seq.current;
    try {
      const res = await fetch(`/api/games/${encodeURIComponent(id)}`, {
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'x-runway': '1', ...(tag.current ? { 'if-none-match': tag.current } : {}) },
      });
      if (n !== seq.current) return;
      if (res.status === 304) return;
      if (res.status === 404) {
        setMissing(true);
        return;
      }
      if (!res.ok) return;
      const body = (await res.json()) as { game: Match };
      tag.current = res.headers.get('etag');
      offset.current = body.game.serverNow - Date.now();
      setGame(body.game);
    } catch {
      /* offline for a moment: the next poll catches up */
    }
  }, [id]);

  const status = game?.status;
  useEffect(() => {
    const first = setTimeout(() => void load(), 0);
    if (status === 'settled' || status === 'cancelled') return;
    const every = status === 'playing' ? 1000 : 2500;
    const timer = setInterval(() => {
      if (document.visibilityState !== 'hidden') void load();
    }, every);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [load, status]);

  /** Send a move or a lifecycle command, then refetch the game at once. */
  const act = useCallback(
    async <R = unknown>(command: Command, quiet = false): Promise<R | null> => {
      setBusy(true);
      try {
        const r = await api.command<R>(command);
        tag.current = null;
        await load();
        void refreshState();
        return r.result;
      } catch (e) {
        if (!quiet)
          toast(
            e instanceof ApiError || e instanceof Error
              ? tx(e.message)
              : t('Something went wrong.'),
            'error',
          );
        tag.current = null;
        void load();
        return null;
      } finally {
        setBusy(false);
      }
    },
    [load, refreshState, toast],
  );

  const now = useCallback(() => Date.now() + offset.current, []);
  return { game, missing, busy, act, now, reload: load };
}

/** A ticking server clock (re-renders every `ms`). */
export function useTick(now: () => number, ms = 250, on = true) {
  const [, set] = useState(0);
  useEffect(() => {
    if (!on) return;
    const id = setInterval(() => set((x) => x + 1), ms);
    return () => clearInterval(id);
  }, [ms, on]);
  return now();
}

/**
 * Client state: one source of truth fetched from /api/state, refreshed when
 * the server says the world changed (SSE), or by polling in lite mode.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { Command, PlayerView } from '@runway/engine';
import { api, ApiError, type Meta } from './api';
import { t, tx } from './i18n';

type Status = 'loading' | 'signedOut' | 'onboarding' | 'ready' | 'offline';

interface Toast {
  id: number;
  text: string;
  tone: 'ok' | 'error' | 'info';
}

interface GameContext {
  status: Status;
  view: PlayerView | null;
  meta: Meta | null;
  lite: boolean;
  setLite: (v: boolean) => void;
  refresh: () => Promise<void>;
  send: <R = unknown>(
    command: Command,
    okText?: string | ((r: R) => string | null),
  ) => Promise<R | null>;
  toast: (text: string, tone?: Toast['tone']) => void;
  toasts: Toast[];
  busy: boolean;
}

const Ctx = createContext<GameContext | null>(null);

const readLite = () => {
  try {
    return localStorage.getItem('rw_lite') === '1';
  } catch {
    return false;
  }
};

export function GameProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [view, setView] = useState<PlayerView | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [busy, setBusy] = useState(false);
  const [lite, setLiteState] = useState(readLite);
  const versionRef = useRef(0);
  const toastId = useRef(0);

  const toast = useCallback((text: string, tone: Toast['tone'] = 'info') => {
    const id = ++toastId.current;
    setToasts((t) => [...t.slice(-2), { id, text, tone }]);
    setTimeout(
      () => setToasts((t) => t.filter((x) => x.id !== id)),
      tone === 'error' ? 6000 : 3500,
    );
  }, []);

  const apply = useCallback((s: Awaited<ReturnType<typeof api.state>>) => {
    if (s.onboarded) {
      versionRef.current = s.view.worldVersion;
      setView(s.view);
      setStatus('ready');
    } else {
      setView(null);
      setStatus('onboarding');
    }
  }, []);

  const applyError = useCallback((e: unknown) => {
    if (e instanceof ApiError && e.status === 401) {
      setView(null);
      setStatus('signedOut');
    } else {
      setStatus((s) => (s === 'ready' ? s : 'offline'));
    }
  }, []);

  const refresh = useCallback(() => api.state().then(apply, applyError), [apply, applyError]);

  useEffect(() => {
    api.meta().then(setMeta, () => undefined);
    api.state().then(apply, applyError);
  }, [apply, applyError]);

  // Live updates: SSE normally; polling where the host can't hold a connection
  // open (the server answers 204), and a slow poll in lite mode to save data.
  useEffect(() => {
    if (status !== 'ready') return;
    let timer: ReturnType<typeof setInterval> | undefined;
    const poll = (ms: number) => {
      timer ??= setInterval(() => {
        if (document.visibilityState !== 'hidden') void refresh();
      }, ms);
    };
    if (lite) {
      poll(60_000);
      return () => clearInterval(timer);
    }
    const es = new EventSource('/api/events');
    es.onmessage = (e) => {
      const { version } = JSON.parse(e.data as string) as { version: number };
      if (version > versionRef.current) void refresh();
    };
    es.onerror = () => {
      // CLOSED means the server won't stream (no retry coming): fall back to polling.
      if (es.readyState === EventSource.CLOSED) poll(20_000);
    };
    return () => {
      es.close();
      clearInterval(timer);
    };
  }, [status, lite, refresh]);

  const send = useCallback(
    async <R,>(
      command: Command,
      okText?: string | ((r: R) => string | null),
    ): Promise<R | null> => {
      setBusy(true);
      try {
        const r = await api.command<R>(command);
        const text = typeof okText === 'function' ? okText(r.result) : okText;
        if (text) toast(text, 'ok');
        await refresh();
        return r.result;
      } catch (e) {
        toast(e instanceof Error ? tx(e.message) : t('Something went wrong.'), 'error');
        return null;
      } finally {
        setBusy(false);
      }
    },
    [refresh, toast],
  );

  const setLite = useCallback((v: boolean) => {
    setLiteState(v);
    try {
      localStorage.setItem('rw_lite', v ? '1' : '0');
    } catch {
      /* storage unavailable: setting lasts for this session */
    }
  }, []);

  const value = useMemo(
    () => ({ status, view, meta, lite, setLite, refresh, send, toast, toasts, busy }),
    [status, view, meta, lite, setLite, refresh, send, toast, toasts, busy],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useGame() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useGame outside GameProvider');
  return ctx;
}

/** Narrowed hook for screens that only render once the player is in the game. */
export function useView() {
  const g = useGame();
  if (!g.view) throw new Error('useView before ready');
  return { ...g, view: g.view, cur: g.view.market.currency };
}

export type Company = PlayerView['companies'][number];
export type Deal = PlayerView['deals'][number];

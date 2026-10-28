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
import { api, ApiError, type Account, type Meta } from './api';
import { recordProblem } from './feedback';
import { t, tx } from './i18n';
import { rememberViewLooks } from './city/acts/look';

type Status = 'loading' | 'signedOut' | 'onboarding' | 'ready' | 'offline';

interface Toast {
  id: number;
  text: string;
  tone: 'ok' | 'error' | 'info';
}

interface GameContext {
  status: Status;
  view: PlayerView | null;
  /** Guest or saved; null while signed out. */
  account: Account | null;
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
  /** A screen that needs news fast (a knock at the door) asks for it; returns the undo. */
  quicken: () => () => void;
}

const Ctx = createContext<GameContext | null>(null);

const arrivals = new Set<(v: PlayerView) => void>();
/**
 * Round 7 (city load time): told the moment a state arrives, before the app
 * renders it, so the city's map starts downloading while the first render runs.
 */
export function onViewArrived(cb: (v: PlayerView) => void): () => void {
  arrivals.add(cb);
  return () => {
    arrivals.delete(cb);
  };
}

/** Takes ?signin=<token> out of the address bar (so it isn't reused or shared) and returns it. */
function readSignInToken(): string | null {
  if (typeof window === 'undefined') return null;
  const url = new URL(window.location.href);
  const token = url.searchParams.get('signin');
  if (!token) return null;
  url.searchParams.delete('signin');
  window.history.replaceState(null, '', url.pathname + url.search + url.hash);
  return token;
}

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
  const [account, setAccount] = useState<Account | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [busy, setBusy] = useState(false);
  const [lite, setLiteState] = useState(readLite);
  const versionRef = useRef(0);
  /** Screens asking for quick updates, for while the server can't stream them. */
  const [quick, setQuick] = useState(0);
  const quicken = useCallback(() => {
    setQuick((n) => n + 1);
    let done = false;
    return () => {
      if (!done) setQuick((n) => n - 1);
      done = true;
    };
  }, []);
  const [streaming, setStreaming] = useState(true);
  const toastId = useRef(0);

  const toast = useCallback((text: string, tone: Toast['tone'] = 'info') => {
    if (tone === 'error') recordProblem(text);
    const id = ++toastId.current;
    // A new success replaces the last ones ("named… registered… funded" don't pile
    // up over the screen); errors and notes stay until they time out.
    setToasts((t) => [
      ...(tone === 'ok' ? t.filter((x) => x.tone !== 'ok') : t).slice(-2),
      { id, text, tone },
    ]);
    setTimeout(
      () => setToasts((t) => t.filter((x) => x.id !== id)),
      tone === 'error' ? 6000 : 3500,
    );
  }, []);

  const apply = useCallback((s: Awaited<ReturnType<typeof api.state>>) => {
    setAccount(s.account ?? { guest: false, email: null });
    if (s.onboarded) {
      versionRef.current = s.view.worldVersion;
      // Phase 6a: everyone's saved look, for every drawing of them.
      rememberViewLooks(s.view);
      for (const cb of arrivals) cb(s.view);
      setView(s.view);
      setStatus('ready');
    } else {
      setView(null);
      setStatus('onboarding');
    }
  }, []);

  const signOut = useCallback(() => {
    setView(null);
    setAccount(null);
    setStatus('signedOut');
  }, []);

  const applyError = useCallback(
    (e: unknown) => {
      if (e instanceof ApiError && e.status === 401) signOut();
      else setStatus((s) => (s === 'ready' ? s : 'offline'));
    },
    [signOut],
  );

  // A background refresh that comes back "signed out" in the middle of a game
  // is asked once more before the player is sent to the sign-in screen, so a
  // single bad answer from a busy server never throws someone out mid-move.
  //
  // Only the newest refresh may change the screen: an answer to a request sent
  // before the player tapped "Play now" (no session yet) can arrive after the
  // signed-in one, and must not send them back to the sign-in screen.
  const refreshSeq = useRef(0);
  const refresh = useCallback(() => {
    const seq = ++refreshSeq.current;
    const latest = () => seq === refreshSeq.current;
    const ok = (s: Awaited<ReturnType<typeof api.state>>) => {
      if (latest()) apply(s);
    };
    const fail = (e: unknown) => {
      if (latest()) applyError(e);
    };
    return api.state().then(ok, (e: unknown) => {
      if (!latest()) return;
      if (!(e instanceof ApiError && e.status === 401)) return applyError(e);
      return new Promise((r) => setTimeout(r, 1500)).then(() =>
        latest() ? api.state().then(ok, fail) : undefined,
      );
    });
  }, [apply, applyError]);

  useEffect(() => {
    // Game settings; retried so one failed request at startup doesn't hide them.
    const loadMeta = (attempt: number) =>
      api.meta().then(setMeta, () => {
        if (attempt < 5) setTimeout(() => void loadMeta(attempt + 1), 1000 * 2 ** attempt);
      });
    void loadMeta(0);
    // Opened from a sign-in email: use the link first, then load the game.
    const token = readSignInToken();
    const opened = token
      ? api.openLink(token).then(
          (r) => {
            if (r.intent === 'save')
              toast(
                t('Progress saved. Log in with {email} on any device.', {
                  email: r.account.email ?? '',
                }),
                'ok',
              );
            else toast(t('Signed in as {email}.', { email: r.account.email ?? '' }), 'ok');
          },
          (e: unknown) =>
            toast(e instanceof Error ? tx(e.message) : t('Something went wrong.'), 'error'),
        )
      : Promise.resolve();
    void opened.then(() => api.state().then(apply, applyError));
  }, [apply, applyError, toast]);

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
      if (es.readyState === EventSource.CLOSED) {
        setStreaming(false);
        poll(20_000);
      }
    };
    return () => {
      es.close();
      clearInterval(timer);
    };
  }, [status, lite, refresh]);

  // Polling, and a screen wants news fast: every few seconds while it's open.
  useEffect(() => {
    if (status !== 'ready' || !quick || (streaming && !lite)) return;
    const timer = setInterval(() => {
      if (document.visibilityState !== 'hidden') void refresh();
    }, 4_000);
    return () => clearInterval(timer);
  }, [status, quick, streaming, lite, refresh]);

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
    () => ({
      status,
      view,
      account,
      meta,
      lite,
      setLite,
      refresh,
      send,
      toast,
      toasts,
      busy,
      quicken,
    }),
    [status, view, account, meta, lite, setLite, refresh, send, toast, toasts, busy, quicken],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useGame() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useGame outside GameProvider');
  return ctx;
}

/**
 * Shows a subtree a different view of the same game: the City, while you're
 * away, sees the market you're in as `view.market` (Wave 4 `view.here`), so
 * its places, prices and people are that city's.
 */
export function WithView({ view, children }: { view: PlayerView; children: ReactNode }) {
  const g = useGame();
  const value = useMemo(() => ({ ...g, view }), [g, view]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Narrowed hook for screens that only render once the player is in the game. */
export function useView() {
  const g = useGame();
  if (!g.view) throw new Error('useView before ready');
  return { ...g, view: g.view, cur: g.view.market.currency };
}

export type Company = PlayerView['companies'][number];
export type Deal = PlayerView['deals'][number];

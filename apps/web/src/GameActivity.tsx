import { useEffect, useState } from 'react';
import { api } from './api';
import { t } from './i18n';
import { OnlineNowSheet } from './city/OnlineNow';

/**
 * The live player count, compact under the HUD's pills on the map (a dot and
 * the number; tap for who's online). The game music plays from the HUD
 * (Hud.tsx), on every screen; music on/off and Feedback live in the phone's
 * Settings app.
 */
export function GameActivity() {
  const [count, setCount] = useState<number | null>(null);
  const [listOpen, setListOpen] = useState(false);
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let request: AbortController | undefined;
    const visible = () => document.visibilityState !== 'hidden';
    const tick = async () => {
      clearTimeout(timer);
      request?.abort();
      if (stopped) return;
      if (!visible() || !navigator.onLine) {
        setCount(null);
        return;
      }
      const current = new AbortController();
      request = current;
      const timeout = setTimeout(() => current.abort(), 10_000);
      try {
        const result = await api.online(current.signal);
        if (!stopped && request === current && !current.signal.aborted)
          setCount(Number.isSafeInteger(result.count) && result.count >= 0 ? result.count : null);
      } catch {
        if (!stopped && request === current) setCount(null);
      } finally {
        clearTimeout(timeout);
        if (!stopped && request === current && visible())
          timer = setTimeout(() => void tick(), 15_000);
      }
    };
    const refresh = () => void tick();
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('online', refresh);
    window.addEventListener('offline', refresh);
    refresh();
    return () => {
      stopped = true;
      clearTimeout(timer);
      request?.abort();
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('online', refresh);
      window.removeEventListener('offline', refresh);
    };
  }, []);

  return (
    <>
      <button
        type="button"
        className={`online-count topbar-online${count === null ? ' is-unavailable' : ''}`}
        aria-haspopup="dialog"
        aria-label={count === null ? t('Online count unavailable') : t('{n} online', { n: count })}
        title={t('Players across all cities, including you. Tap to see who’s online.')}
        onClick={() => setListOpen(true)}
      >
        <span className="online-dot" aria-hidden="true" />
        {/* The number shows; the words are for screen readers. */}
        <span role="status">
          {count === null ? (
            <span className="sr-only">{t('Online count unavailable')}</span>
          ) : (
            <>
              {count}
              <span className="sr-only"> {t('online')}</span>
            </>
          )}
        </span>
      </button>
      {listOpen && <OnlineNowSheet onClose={() => setListOpen(false)} />}
    </>
  );
}

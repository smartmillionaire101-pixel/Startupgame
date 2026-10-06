import { useEffect, useState } from 'react';
import { api } from './api';
import { t } from './i18n';
import { useMusic } from './music';
import { setSetting, useSetting } from './phone/settings';

export function GameActivity() {
  const sound = useSetting('sound');
  useMusic(sound);
  const [count, setCount] = useState<number | null>(null);
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
    <div className="game-activity">
      <span
        className={`online-count${count === null ? ' is-unavailable' : ''}`}
        role="status"
        title={t('Players across all cities, including you. Updates every 15 seconds.')}
      >
        <span className="online-dot" aria-hidden="true" />
        {count === null ? t('Online count unavailable') : t('{n} online', { n: count })}
      </span>
      <button
        type="button"
        className="music-toggle"
        aria-pressed={sound}
        aria-label={t('Game music')}
        onClick={() => setSetting('sound', !sound)}
      >
        <span aria-hidden="true">♫</span>
        {sound ? t('Music on') : t('Music off')}
      </button>
    </div>
  );
}

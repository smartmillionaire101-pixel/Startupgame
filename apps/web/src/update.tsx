import { useEffect, useState } from 'react';
import { t } from './i18n';

/** How often an open app checks whether a newer version has been published. */
const CHECK_MS = 60_000;

/** The release this page loaded (its first check), for feedback and error reports. */
let loaded: string | null = null;
export const pageRelease = () => loaded;

/** No version file here (a local or self-hosted server): nothing to watch for. */
const NONE = 'none';

async function servedCommit(): Promise<string | null> {
  try {
    const r = await fetch('/version.json', { cache: 'no-store' });
    if (r.status === 404) return NONE;
    if (!r.ok) return null;
    const v = (await r.json()) as { commit?: unknown };
    return typeof v.commit === 'string' ? v.commit : null;
  } catch {
    return null;
  }
}

/**
 * "A new version is ready" with a Refresh button. The game lives on the
 * server, so reloading the page never loses progress. The version this page
 * started with is the first one it sees; any later change offers a refresh.
 */
export function UpdateBanner() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let first: string | null = null;
    let stopped = false;
    const stop = () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onShow);
    };
    const check = async () => {
      const now = await servedCommit();
      // Play-test: a 404 logged every minute on a local server. No file, no checks.
      if (now === NONE) return stop();
      if (stopped || !now || now === 'local') return;
      if (first === null) first = loaded = now;
      else if (now !== first) setReady(true);
    };
    void check();
    const timer = setInterval(() => void check(), CHECK_MS);
    const onShow = () => document.visibilityState === 'visible' && void check();
    document.addEventListener('visibilitychange', onShow);
    return stop;
  }, []);
  if (!ready) return null;
  return (
    <div className="update-banner" role="status">
      <span>{t('A new version of Runway is ready. Your game is saved.')}</span>
      <button type="button" className="btn btn-primary" onClick={() => location.reload()}>
        {t('Refresh')}
      </button>
    </div>
  );
}

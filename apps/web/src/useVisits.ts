import { useEffect } from 'react';
let memoryId: string | undefined;
/** A visit is one browser-tab session; 30 minutes away starts a new visit. */
export function useVisits() {
  useEffect(() => {
    let id = (memoryId ??= crypto.randomUUID());
    try {
      id = sessionStorage.getItem('rw_visit') ?? id;
      sessionStorage.setItem('rw_visit', id);
    } catch {
      /* Private browsing may disable storage. */
    }
    let busy = false;
    const controller = new AbortController();
    const beat = async () => {
      if (document.hidden || !navigator.onLine || busy) return;
      busy = true;
      try {
        await fetch('/api/visits', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-runway': '1' },
          body: JSON.stringify({ id }),
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)]),
        });
      } catch {
        /* A later heartbeat retries when the connection recovers. */
      } finally {
        busy = false;
      }
    };
    void beat();
    const timer = window.setInterval(() => void beat(), 15_000);
    document.addEventListener('visibilitychange', beat);
    window.addEventListener('online', beat);
    return () => {
      controller.abort();
      clearInterval(timer);
      document.removeEventListener('visibilitychange', beat);
      window.removeEventListener('online', beat);
    };
  }, []);
}

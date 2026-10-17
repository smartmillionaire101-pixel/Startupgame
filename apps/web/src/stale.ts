/**
 * After a new version is published, a page opened before it still asks for
 * the old version's code files, which no longer exist: the screen it was
 * opening fails to load. Reloading picks up the new version (the game lives
 * on the server, so nothing is lost). Once a minute at most, so a file that
 * is really missing can't reload the page over and over.
 */
const KEY = 'runway.staleReload';
const GAP_MS = 60_000;

/** A code file of this app that failed to download (each browser words it differently). */
export function isStaleChunk(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  return /dynamically imported module|Importing a module script failed|error loading dynamically|Failed to load module script|valid JavaScript MIME type|Unable to preload CSS/i.test(
    msg,
  );
}

/** Reload to the new version; false when that was just tried (the file is really missing). */
export function reloadForUpdate(): boolean {
  try {
    const last = Number(sessionStorage.getItem(KEY) ?? 0);
    if (Date.now() - last < GAP_MS) return false;
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    /* storage blocked: reload anyway, the browser's own cache stops a loop */
  }
  location.reload();
  return true;
}

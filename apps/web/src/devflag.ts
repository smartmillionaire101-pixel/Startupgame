/**
 * Dev tools are hidden unless the URL carries `?dev=1` (deploy previews have
 * dev tools on the server, but players testing a preview shouldn't see them).
 * The flag is kept for the browser tab's session, so moving between screens
 * (or reloading without the query) keeps it; `?dev=0` switches it off again.
 */
const KEY = 'rw_dev';

/** Reads `?dev=` from a search string and updates the stored flag; returns whether it's on. */
export function readDevFlag(
  search: string,
  store: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null,
): boolean {
  const q = new URLSearchParams(search).get('dev');
  try {
    if (q === '1') store?.setItem(KEY, '1');
    else if (q === '0') store?.removeItem(KEY);
    return store?.getItem(KEY) === '1' || q === '1';
  } catch {
    return q === '1';
  }
}

const session = (): Storage | null => {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage;
  } catch {
    return null;
  }
};

// Read once at start-up, before any screen rewrites the URL.
const atStart = typeof location === 'undefined' ? false : readDevFlag(location.search, session());

/** Whether the dev tools card shows: the server must allow them and the player asked with `?dev=1`. */
export function devToolsShown(serverAllows: boolean | undefined): boolean {
  return !!serverAllows && atStart;
}

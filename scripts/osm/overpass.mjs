/**
 * The Overpass API, with mirrors and retries (used by build.mjs and tiles.mjs).
 * Only GitHub's runners reach it; the game never fetches map data at runtime.
 */
export const MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** POST a query; retries across the mirrors with a growing pause, then throws. */
export async function overpass(query, { attempts = 6, pause = 15_000 } = {}) {
  let last;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const url = MIRRORS[attempt % MIRRORS.length];
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          'user-agent': 'runway-startup-game-map-builder',
        },
        body: 'data=' + encodeURIComponent(query),
      });
      if (res.ok) {
        const json = await res.json();
        // Overpass reports a timeout or a memory limit inside a 200 response.
        if (typeof json.remark === 'string' && /runtime error/i.test(json.remark))
          last = new Error(`${url} ${json.remark.slice(0, 200)}`);
        else return json;
      } else last = new Error(`${url} ${res.status} ${(await res.text()).slice(0, 200)}`);
    } catch (e) {
      last = e;
    }
    console.warn(`overpass retry ${attempt + 1}: ${last?.message}`);
    if (attempt < attempts - 1) await sleep(pause * (attempt + 1));
  }
  throw last;
}

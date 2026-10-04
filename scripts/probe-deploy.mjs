/**
 * Probes a deployed Runway API with a few sign-in flows at once (guest →
 * state → delete) and prints each step, so a deploy check shows exactly
 * which server step misbehaves. Exits non-zero on any failure.
 *
 *   node scripts/probe-deploy.mjs https://deploy-preview-3--site.netlify.app
 */
const base = process.argv[2];
if (!base) throw new Error('Usage: probe-deploy.mjs <site url>');
const H = { 'x-runway': '1' };

/**
 * Netlify's edge can answer "site not found" for a few seconds after a new
 * deploy goes live, before every edge node knows about it. Such a 404 never
 * reached the app (no x-runway-mode header), so wait and ask again, for up to
 * a minute; anything the app itself answered is reported as is.
 */
const EDGE_RETRIES = 12;

async function step(name, method, path, body, cookie) {
  const t = Date.now();
  let edgeMisses = 0;
  for (;;) {
    const res = await fetch(base + path, {
      method,
      headers: {
        ...H,
        ...(body ? { 'content-type': 'application/json' } : {}),
        ...(cookie ? { cookie } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const text = await res.text();
    const mode = res.headers.get('x-runway-mode');
    if (res.status === 404 && !mode && edgeMisses < EDGE_RETRIES) {
      edgeMisses++;
      await new Promise((r) => setTimeout(r, 5000));
      continue;
    }
    const waited = edgeMisses ? ` (after ${edgeMisses} edge 404s)` : '';
    const line = `${name} ${res.status} ${Date.now() - t}ms mode=${mode ?? '-'}${waited}`;
    return { res, text, line };
  }
}

async function flow() {
  const out = [];
  const guest = await step('guest', 'POST', '/api/auth/guest', { adult: true });
  out.push(guest.line);
  if (!guest.res.ok) return { ok: false, out: [...out, guest.text] };
  const cookie = guest.res.headers.get('set-cookie')?.split(';')[0];
  if (!cookie) return { ok: false, out: [...out, 'no session cookie'] };
  const state = await step('state', 'GET', '/api/state', undefined, cookie);
  out.push(state.line);
  if (!state.res.ok) return { ok: false, out: [...out, state.text] };
  // Leave nothing behind.
  const del = await step('delete', 'DELETE', '/api/account', undefined, cookie);
  out.push(del.line);
  return { ok: state.res.ok && del.res.ok, out };
}

// Preview deploys expose a store self-test: run it from several instances at once.
const selftests = await Promise.all(
  [1, 2, 3, 4, 5, 6].map(() =>
    fetch(`${base}/api/dev/kv-selftest`)
      .then(async (r) => (r.ok ? r.json() : { status: r.status }))
      .catch((e) => ({ error: String(e) })),
  ),
);
if (selftests.some((t) => t.instance)) {
  console.log('store self-test:');
  for (const t of selftests) console.log(' ', JSON.stringify(t));
  const secrets = new Set(selftests.filter((t) => t.secret).map((t) => t.secret));
  if (secrets.size > 1) console.log('  !! instances disagree on the session secret');
}

const results = await Promise.all([1, 2, 3].map(() => flow()));
results.forEach((r, i) =>
  console.log(`flow ${i + 1}: ${r.ok ? 'ok' : 'FAILED'}\n  ${r.out.join('\n  ')}`),
);
process.exit(results.every((r) => r.ok) ? 0 : 1);

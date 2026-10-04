/**
 * Probes a deployed Runway API with a few sign-in flows at once (start →
 * verify → state) and prints each step, so a deploy check shows exactly
 * which server step misbehaves. Exits non-zero on any failure.
 *
 *   node scripts/probe-deploy.mjs https://deploy-preview-3--site.netlify.app
 */
const base = process.argv[2];
if (!base) throw new Error('Usage: probe-deploy.mjs <site url>');
const H = { 'x-runway': '1' };

async function step(name, method, path, body, cookie) {
  const t = Date.now();
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
  const mode = res.headers.get('x-runway-mode') ?? '-';
  const line = `${name} ${res.status} ${Date.now() - t}ms mode=${mode}`;
  return { res, text, line };
}

async function flow(n) {
  const out = [];
  const phone = `+1555${String(Date.now() + n).slice(-7)}`;
  const start = await step('start', 'POST', '/api/auth/start', {
    phone,
    dob: { year: 1990, month: 1, day: 1 },
  });
  out.push(start.line);
  if (!start.res.ok) return { ok: false, out: [...out, start.text] };
  const code = JSON.parse(start.text).devCode;
  if (!code) return { ok: false, out: [...out, 'no code shown on screen'] };
  const verify = await step('verify', 'POST', '/api/auth/verify', { phone, code });
  out.push(verify.line);
  if (!verify.res.ok) return { ok: false, out: [...out, verify.text] };
  const cookie = verify.res.headers.get('set-cookie')?.split(';')[0];
  const state = await step('state', 'GET', '/api/state', undefined, cookie);
  out.push(state.line);
  if (!state.res.ok) return { ok: false, out: [...out, state.text] };
  // Leave nothing behind.
  const del = await step('delete', 'DELETE', '/api/account', undefined, cookie);
  out.push(del.line);
  return { ok: state.res.ok && del.res.ok, out };
}

const results = await Promise.all([1, 2, 3].map(flow));
results.forEach((r, i) =>
  console.log(`flow ${i + 1}: ${r.ok ? 'ok' : 'FAILED'}\n  ${r.out.join('\n  ')}`),
);
process.exit(results.every((r) => r.ok) ? 0 : 1);

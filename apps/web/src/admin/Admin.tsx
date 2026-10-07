import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import './admin.css';

type Totals = { spent: number; sent: number; invested: number; capital: number };
type Player = {
  id: string;
  name: string;
  handle: string;
  role: string;
  city: string;
  joinedAt: number;
  lastActiveAt: number;
  online: boolean;
};
interface Dashboard {
  at: number;
  localAccess: boolean;
  onlinePlayers: number;
  businesses: number;
  banks: number;
  funds: number;
  openReports: number;
  visits: {
    since: number | null;
    total: number;
    today: number;
    active: number;
    daily: { day: string; visits: number }[];
  };
  players: Player[];
  roles: { name: string; count: number }[];
  cities: { name: string; count: number }[];
  finances: {
    since: number | null;
    totals: Record<string, Totals>;
    recent: {
      id: number;
      at: number;
      player: string;
      kind: keyof Totals;
      currency: string;
      amount: number;
    }[];
  };
}
const number = (n: number) => n.toLocaleString('en-GB');
const date = (n: number | null) =>
  n
    ? new Date(n).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : 'Awaiting activity';
const cash = (n: number, currency: string) =>
  new Intl.NumberFormat('en-GB', { style: 'currency', currency, maximumFractionDigits: 2 }).format(
    n / 100,
  );
const labels = {
  spent: 'Amount spent',
  sent: 'Money sent',
  invested: 'Total invested',
  capital: 'Business capital',
};
const descriptions = {
  spent: 'Personal payments, living costs and fees',
  sent: 'Player transfers, excluding fees',
  invested: 'Completed personal and managed-fund investments',
  capital: 'Founder contributions to businesses and banks',
};
const empty: Totals = { spent: 0, sent: 0, invested: 0, capital: 0 };

export default function Admin() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [locked, setLocked] = useState(false);
  /** The server's sign-in method once locked: an admin email in the game, or the admin password. */
  const [signIn, setSignIn] = useState<'email' | 'password'>('password');
  const [error, setError] = useState('');
  const [token, setToken] = useState('');
  const [currency, setCurrency] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const busy = useRef(false);
  const refresh = useCallback(async () => {
    if (busy.current || document.hidden) return;
    busy.current = true;
    try {
      const r = await fetch('/api/admin/dashboard', {
        cache: 'no-store',
        signal: AbortSignal.timeout(10_000),
      });
      if (r.status === 401) {
        const body = (await r.json().catch(() => ({}))) as { signIn?: string };
        setSignIn(body.signIn === 'email' ? 'email' : 'password');
        setLocked(true);
        setData(null);
        return;
      }
      const body = await r.json();
      if (!r.ok) throw new Error(body.error?.message ?? 'Could not load dashboard.');
      setData(body);
      setLocked(false);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Connection lost. Retrying…');
    } finally {
      busy.current = false;
    }
  }, []);
  useEffect(() => {
    document.title = 'Admin · Runway';
    const initial = window.setTimeout(() => void refresh(), 0);
    const timer = window.setInterval(() => void refresh(), 10_000);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      clearTimeout(initial);
      clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [refresh]);
  async function login(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const r = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-runway': '1' },
        body: JSON.stringify({ token }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!r.ok) throw new Error((await r.json()).error?.message ?? 'Sign-in failed.');
      setToken('');
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign-in failed.');
    } finally {
      setSubmitting(false);
    }
  }
  async function logout() {
    try {
      const r = await fetch('/api/admin/logout', {
        method: 'POST',
        headers: { 'x-runway': '1' },
        signal: AbortSignal.timeout(10_000),
      });
      if (!r.ok) throw new Error('Could not sign out. Try again.');
      setData(null);
      setLocked(true);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const currencies = Object.keys(data?.finances.totals ?? {}).sort();
  const selected = currencies.includes(currency) ? currency : (currencies[0] ?? 'NGN');
  const totals = data?.finances.totals[selected] ?? empty;
  const players = (data?.players ?? []).filter((p) =>
    `${p.name} ${p.handle} ${p.role} ${p.city}`.toLowerCase().includes(search.toLowerCase()),
  );
  const currentPage = Math.min(page, Math.max(0, Math.ceil(players.length / 20) - 1));
  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <a className="admin-brand" href="/">
          R
          <span>
            RUNWAY<small>THE STARTUP GAME</small>
          </span>
        </a>
        <div className="admin-workspace">CONTROL ROOM</div>
        <nav aria-label="Admin navigation">
          <a href="#overview">◈ &nbsp; Overview</a>
          <a href="#finances">↗ &nbsp; Game economy</a>
          <a href="#players">◎ &nbsp; Players</a>
          <a href="#activity">≋ &nbsp; Recent activity</a>
        </nav>
        <div className="admin-sidebar-footer">
          <span>Admin workspace</span>
          <small>See how your world is growing.</small>
          <a href="/">← Back to game</a>
        </div>
      </aside>
      <main className="admin-main" id="overview">
        <header className="admin-header">
          <div>
            <div className="admin-eyebrow">RUNWAY / ADMIN</div>
            <h1>Your game, at a glance.</h1>
            <p>People, activity and the money moving through your world.</p>
          </div>
          <div className="admin-status">
            <span className={error || !data ? 'admin-badge paused' : 'admin-badge'}>
              {error
                ? 'Connection interrupted'
                : data
                  ? '● Live · refreshes every 10s'
                  : 'Admin access'}
            </span>
            {data && <small>Updated {new Date(data.at).toLocaleTimeString()}</small>}
            {data && !data.localAccess && <button onClick={() => void logout()}>Sign out</button>}
          </div>
        </header>
        {error && (
          <div className="admin-error" role="alert">
            {error}
            {data && ' Showing the last successful update.'}
          </div>
        )}
        {locked ? (
          <section className="admin-panel admin-login">
            <div className="admin-eyebrow">PRIVATE WORKSPACE</div>
            <h2>Sign in to admin</h2>
            {signIn === 'email' ? (
              <>
                <p>
                  Admin is open to the admin email only. Sign in to the game with that email (from
                  the sign-in link we send you), then come back to this page.
                </p>
                <a className="admin-primary" href="/">
                  Go to sign-in →
                </a>
              </>
            ) : (
              <>
                <p>Use the admin password configured on your server.</p>
                <form onSubmit={login}>
                  <label htmlFor="admin-password">Admin password</label>
                  <input
                    id="admin-password"
                    type="password"
                    autoComplete="current-password"
                    required
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                  />
                  <button className="admin-primary" disabled={submitting}>
                    {submitting ? 'Signing in…' : 'Open dashboard →'}
                  </button>
                </form>
              </>
            )}
          </section>
        ) : !data ? (
          <section className="admin-panel">
            <p>{error ? 'Dashboard unavailable.' : 'Loading live server data…'}</p>
            <button onClick={() => void refresh()}>Retry</button>
          </section>
        ) : (
          <>
            {data.localAccess && (
              <p className="admin-local">
                Local development access · Hosted servers require an admin password.
              </p>
            )}
            <section className="admin-kpis" aria-label="Traffic and players">
              <Metric
                title="Live visitors"
                value={number(data.visits.active)}
                note="Active browser tabs · last 45 seconds"
                accent
              />
              <Metric
                title="Players online"
                value={number(data.onlinePlayers)}
                note="Unique player accounts · last 45 seconds"
              />
              <Metric
                title="Visits today"
                value={number(data.visits.today)}
                note="Browser-tab sessions · UTC day"
              />
              <Metric
                title="Total visits"
                value={number(data.visits.total)}
                note={`Tracked since ${date(data.visits.since)}`}
              />
              <Metric
                title="Total players"
                value={number(data.players.length)}
                note="Human players · excludes deleted accounts"
              />
            </section>
            <section id="finances" className="admin-section">
              <div className="admin-section-heading">
                <div>
                  <h2>The game economy</h2>
                  <p>In-game money · tracked since {date(data.finances.since)}</p>
                </div>
                <label className="admin-currency">
                  Currency{' '}
                  <select value={selected} onChange={(e) => setCurrency(e.target.value)}>
                    {(currencies.length ? currencies : ['NGN']).map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="admin-finances">
                {(Object.keys(labels) as (keyof Totals)[]).map((k) => (
                  <Metric
                    key={k}
                    title={labels[k]}
                    value={cash(totals[k], selected)}
                    note={descriptions[k]}
                  />
                ))}
              </div>
              <p className="admin-footnote">
                Currencies are kept separate. Spending excludes transfers, investments and business
                capital. Totals are gross outgoing payments, not revenue or profit. Activity before
                tracking began is not included.
              </p>
            </section>
            <div className="admin-middle">
              <section className="admin-panel">
                <div className="admin-section-heading">
                  <div>
                    <h2>Visits over time</h2>
                    <p>Last 14 days · UTC</p>
                  </div>
                  <span className="admin-chip">
                    {number(data.visits.daily.reduce((s, d) => s + d.visits, 0))} visits
                  </span>
                </div>
                <div
                  className="admin-chart"
                  role="img"
                  aria-label={data.visits.daily
                    .map((d) => `${d.day}: ${d.visits} visits`)
                    .join(', ')}
                >
                  {data.visits.daily.map((d) => (
                    <div
                      className="admin-bar-column"
                      key={d.day}
                      title={`${d.day}: ${d.visits} visits`}
                    >
                      <span>{d.visits || ''}</span>
                      <div
                        className="admin-bar"
                        style={{
                          height: `${Math.max(2, (d.visits / Math.max(1, ...data.visits.daily.map((v) => v.visits))) * 130)}px`,
                          opacity: d.visits ? 1 : 0.15,
                        }}
                      />
                      <small>{d.day.slice(8)}</small>
                    </div>
                  ))}
                </div>
                <p className="admin-footnote">
                  A new visit starts after 30 minutes of inactivity. Visits count browser-tab
                  sessions, not unique people. Admin pages are excluded.
                </p>
              </section>
              <section className="admin-panel">
                <h2>Who's building?</h2>
                <p>Players by chosen role</p>
                <div className="admin-breakdown">
                  {data.roles.map((r) => (
                    <Breakdown
                      key={r.name}
                      name={r.name}
                      count={r.count}
                      total={data.players.length}
                    />
                  ))}
                </div>
                <div className="admin-mini-stats">
                  <div>
                    <b>{number(data.businesses)}</b>
                    <small>Businesses</small>
                  </div>
                  <div>
                    <b>{number(data.banks)}</b>
                    <small>Banks</small>
                  </div>
                  <div>
                    <b>{number(data.funds)}</b>
                    <small>Funds</small>
                  </div>
                </div>
              </section>
            </div>
            <section className="admin-panel admin-section" id="players">
              <div className="admin-section-heading">
                <div>
                  <h2>
                    Players <span className="admin-chip">{number(data.players.length)}</span>
                  </h2>
                  <p>Online players first, then newest members.</p>
                </div>
                <input
                  className="admin-search"
                  aria-label="Search players"
                  placeholder="Search name, role or city…"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(0);
                  }}
                />
              </div>
              <div className="admin-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Player</th>
                      <th>Role</th>
                      <th>City</th>
                      <th>Joined</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {players.slice(currentPage * 20, currentPage * 20 + 20).map((p) => (
                      <tr key={p.id}>
                        <td>
                          <strong>{p.name}</strong>
                          <small>@{p.handle}</small>
                        </td>
                        <td className="admin-capitalize">{p.role}</td>
                        <td className="admin-capitalize">{p.city}</td>
                        <td>{date(p.joinedAt)}</td>
                        <td>
                          <span className={`admin-player-status ${p.online ? 'online' : ''}`}>
                            {p.online ? '● Online' : 'Offline'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!players.length && (
                  <div className="admin-empty">
                    {search
                      ? 'No players match your search.'
                      : 'Your first players will appear here when they join.'}
                  </div>
                )}
              </div>
              <div className="admin-pagination">
                <small>
                  {number(players.length)} players
                  {players.length > 20 &&
                    ` · Page ${currentPage + 1} of ${Math.ceil(players.length / 20)}`}
                </small>
                <div>
                  <button disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>
                    Previous
                  </button>
                  <button
                    disabled={(currentPage + 1) * 20 >= players.length}
                    onClick={() => setPage(currentPage + 1)}
                  >
                    Next
                  </button>
                </div>
              </div>
            </section>
            <div className="admin-bottom">
              <section className="admin-panel" id="activity">
                <div className="admin-section-heading">
                  <div>
                    <h2>Recent money movement</h2>
                    <p>Latest 100 recorded payments · all currencies</p>
                  </div>
                </div>
                <div className="admin-transactions">
                  {data.finances.recent.slice(0, 20).map((a) => (
                    <div className="admin-transaction" key={a.id}>
                      <span className="admin-transaction-icon">↗</span>
                      <div>
                        <strong>{labels[a.kind]}</strong>
                        <small>
                          {a.player} · {new Date(a.at).toLocaleString()}
                        </small>
                      </div>
                      <b>{cash(a.amount, a.currency)}</b>
                    </div>
                  ))}
                  {!data.finances.recent.length && (
                    <div className="admin-empty">
                      No payments recorded yet. New game transactions will appear here.
                    </div>
                  )}
                </div>
                {data.finances.recent.length > 20 && (
                  <details>
                    <summary>Show remaining recent payments</summary>
                    {data.finances.recent.slice(20).map((a) => (
                      <p key={a.id}>
                        {date(a.at)} · {a.player} · {labels[a.kind]} · {cash(a.amount, a.currency)}
                      </p>
                    ))}
                  </details>
                )}
              </section>
              <section className="admin-panel">
                <h2>Across the world</h2>
                <p>Players by home city</p>
                <div className="admin-breakdown">
                  {data.cities
                    .filter((c) => c.count > 0)
                    .map((c) => (
                      <Breakdown
                        key={c.name}
                        name={c.name}
                        count={c.count}
                        total={data.players.length}
                      />
                    ))}
                  {!data.players.length && <p>No player cities yet.</p>}
                </div>
                <div className="admin-report">
                  <b>{number(data.openReports)}</b>
                  <span>Open player reports</span>
                </div>
              </section>
            </div>
            <footer className="admin-footer">
              Runway admin · Server-backed metrics · All financial amounts are virtual game
              currency.
            </footer>
          </>
        )}
      </main>
    </div>
  );
}
function Metric({
  title,
  value,
  note,
  accent = false,
}: {
  title: string;
  value: string;
  note: string;
  accent?: boolean;
}) {
  return (
    <article className={`admin-metric ${accent ? 'accent' : ''}`}>
      <h3>{title}</h3>
      <strong>{value}</strong>
      <p>{note}</p>
    </article>
  );
}
function Breakdown({ name, count, total }: { name: string; count: number; total: number }) {
  return (
    <div>
      <div className="admin-breakdown-label">
        <span>{name}</span>
        <b>{number(count)}</b>
      </div>
      <div className="admin-track">
        <div style={{ width: `${total ? (count / total) * 100 : 0}%` }} />
      </div>
    </div>
  );
}

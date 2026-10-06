/**
 * The phone (Wave 5 §C): a button above the tab bar that opens a full-screen
 * phone with Messages (players and AI characters), Alerts (the inbox, every
 * item tappable), Contacts, Wallet, Jobs and a Map of places.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { PlayerView } from '@runway/engine';
import { api, type AiThread, type ChatMessage, type ChatSummary } from '../api';
import { money, stars } from '../format';
import { getLang, t, tx } from '../i18n';
import { useView } from '../store';
import { Bar, Button, Empty, Pill } from '../ui';
import { visitPlace } from '../city/goto';
import { businessesOf } from '../city/contract';
import { looseCmd } from '../city/life';
import { contactChat, contactsOf, type ContactView } from '../city/people';
import { cityViewOf, hereOf } from '../city/travel';
import { onPhone, useNav, type PhoneApp, type PhoneOpen } from './bus';
import './phone.css';

type View = PlayerView;

// ---------------------------------------------------------------------------
// Loose readers for Wave 5 view fields (built in parallel; may be missing)

const isObj = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x);
const str = (x: unknown, d = ''): string => (typeof x === 'string' ? x : d);
const num = (x: unknown, d = 0): number => (typeof x === 'number' && Number.isFinite(x) ? x : d);

export interface JobView {
  businessId: string;
  businessName: string;
  role: string;
  label: string;
  monthlyPay: number;
  hours: number;
}

const normJob = (x: unknown): JobView | null =>
  isObj(x) && typeof x.businessId === 'string'
    ? {
        businessId: x.businessId,
        businessName: str(x.businessName, '—'),
        role: str(x.role),
        label: str(x.label, str(x.role, '—')),
        monthlyPay: num(x.monthlyPay),
        hours: num(x.hours),
      }
    : null;

/** Jobs at businesses where you are (`view.here.jobs`, else `view.market.jobs`). */
export function jobsOf(view: View): JobView[] {
  const here: unknown = (view as unknown as Record<string, unknown>).here;
  const raw =
    (isObj(here) && Array.isArray(here.jobs) ? here.jobs : null) ??
    (view.market as unknown as Record<string, unknown>).jobs;
  return Array.isArray(raw) ? raw.map(normJob).filter((j): j is JobView => !!j) : [];
}

export const myJobOf = (view: View) => normJob((view.me as unknown as Record<string, unknown>).job);

function homeOf(view: View) {
  const h = (view.me as unknown as Record<string, unknown>).home;
  if (!isObj(h)) return null;
  const items = Array.isArray(h.items)
    ? h.items.filter(isObj).map((i) => ({ slot: str(i.slot), label: str(i.label, '—') }))
    : [];
  return { items, comfort: num(h.comfort) };
}

function carOf(view: View) {
  const c = (view.me as unknown as Record<string, unknown>).car;
  return isObj(c) ? { label: str(c.label, '—'), monthlyCost: num(c.monthlyCost) } : null;
}

/** Wave 5 capital places in the city you're in, if the engine sends them. */
function capitalOf(view: View) {
  const city = hereOf(view) as unknown as Record<string, unknown>;
  const out: { id: string; place: string; name: string; manager: string; kind: string }[] = [];
  const add = (key: string, prefix: string, kind: string) => {
    const xs = city[key];
    if (!Array.isArray(xs)) return;
    for (const x of xs)
      if (isObj(x) && typeof x.id === 'string') {
        const name = str(x.name, str(x.label, '—'));
        const m = isObj(x.manager) ? str(x.manager.name) : str(x.manager);
        out.push({
          id: `${prefix}:${x.id}`,
          place: `${prefix}:${x.id}`,
          name,
          manager: str(x.managerName, m) || name,
          kind,
        });
      }
  };
  add('accelerators', 'acc', 'accelerator');
  add('devPartners', 'dp', 'devpartner');
  add('lps', 'lp', 'lp');
  return out;
}

// ---------------------------------------------------------------------------
// People you can message

export interface AiContact {
  id: string;
  kind: string;
  name: string;
  org: string | null;
}

const kindName = (k: string | null) =>
  (
    ({
      partner: t('Fund partner'),
      angel: t('Angel investor'),
      founder: t('Founder'),
      owner: t('Business owner'),
      lp: t('LP manager'),
      accelerator: t('Accelerator'),
      devpartner: t('Development partner'),
      person: t('Person'),
      investor: t('Investor'),
      banker: t('Banker'),
    }) as Record<string, string>
  )[k ?? ''] ??
  k ??
  '';

/** AI characters in the city you're in, for "New message". */
export function aiPeopleOf(view: View): AiContact[] {
  const city = hereOf(view);
  const out: AiContact[] = [];
  for (const f of city.funds) {
    if (!f.ai || f.market !== city.id) continue;
    const a = (f as typeof f & { angel?: { playerId: string; name: string } | null }).angel;
    out.push(
      a
        ? { id: a.playerId, kind: 'angel', name: a.name, org: f.name }
        : { id: `fund:${f.id}`, kind: 'partner', name: f.partner, org: f.name },
    );
  }
  for (const x of capitalOf(view))
    out.push({ id: x.id, kind: x.kind, name: x.manager, org: x.name });
  for (const c of view.directory) {
    if (!c.ai || c.status !== 'active' || c.market !== city.id) continue;
    const f = c.founders.find((x) => x.ai);
    if (f) out.push({ id: f.id, kind: 'founder', name: f.name, org: c.name });
  }
  for (const b of businessesOf(cityViewOf(view)))
    if (b.open) out.push({ id: `biz:${b.id}`, kind: 'owner', name: b.owner.name, org: b.name });
  return out;
}

// ---------------------------------------------------------------------------
// Unread player chats: the last message time you've seen, per chat (this browser).

const SEEN_KEY = 'rw_chat_seen';
function readSeen(): Record<string, number> | null {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    return raw ? (JSON.parse(raw) as Record<string, number>) : null;
  } catch {
    return null;
  }
}
function writeSeen(seen: Record<string, number>) {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(seen));
  } catch {
    /* storage unavailable: unread marks last for this session */
  }
}
const chatUnread = (c: ChatSummary, seen: Record<string, number>) =>
  !c.lastMine && c.lastAt !== null && c.lastAt > (seen[c.id] ?? 0) ? 1 : 0;

const reducedMotion = () =>
  typeof window !== 'undefined' &&
  !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// ---------------------------------------------------------------------------
// The dock: button, polling, and the phone itself

interface ThreadRef {
  ai?: string;
  player?: string;
  say?: string;
}

export function PhoneDock() {
  const { view, toast, lite } = useView();
  const [open, setOpen] = useState(false);
  const [app, setApp] = useState<PhoneApp>('home');
  const [thread, setThread] = useState<ThreadRef | null>(null);
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [ai, setAi] = useState<AiThread[]>([]);
  const [seen, setSeen] = useState<Record<string, number>>(() => readSeen() ?? {});
  const [buzz, setBuzz] = useState(false);
  const prev = useRef<Map<string, number> | null>(null);
  const viewing = useRef<string | null>(null);
  useEffect(() => {
    viewing.current = open && thread?.player ? thread.player : null;
  });

  const loadChats = useCallback(async () => {
    try {
      const r = await api.chats();
      setChats(r.chats);
      const before = prev.current;
      prev.current = new Map(r.chats.map((c) => [c.id, c.lastAt ?? 0]));
      if (!before) {
        // First time on this device: what's already there counts as seen.
        if (!readSeen()) {
          const base = Object.fromEntries(r.chats.map((c) => [c.id, c.lastAt ?? 0]));
          writeSeen(base);
          setSeen(base);
        }
        return;
      }
      const fresh = r.chats.filter(
        (c) =>
          !c.lastMine && (c.lastAt ?? 0) > (before.get(c.id) ?? 0) && viewing.current !== c.with.id,
      );
      if (fresh.length) {
        toast(t('New message from {name}', { name: fresh[0]!.with.name }), 'info');
        setBuzz(true);
        setTimeout(() => setBuzz(false), 1400);
        if (!reducedMotion()) navigator.vibrate?.(60);
      }
    } catch {
      /* offline or signed out: try again on the next tick */
    }
  }, [toast]);

  const loadAi = useCallback(async () => {
    try {
      setAi((await api.aiThreads()).threads);
    } catch {
      /* older server without AI chat */
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(() => {
      void loadChats();
      void loadAi();
    }, 0);
    const timer = setInterval(
      () => {
        if (document.visibilityState !== 'hidden') void loadChats();
      },
      lite ? 60_000 : 15_000,
    );
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [loadChats, loadAi, lite]);

  // Opened from elsewhere: a person card's Chat, a contact.
  useEffect(
    () =>
      onPhone((o: PhoneOpen) => {
        setOpen(true);
        if (o.ai || o.player) {
          setApp('messages');
          setThread({ ai: o.ai, player: o.player, say: o.say });
        } else {
          setApp(o.app ?? 'home');
          setThread(null);
        }
      }),
    [],
  );

  const markSeen = useCallback((c: { id: string; lastAt: number | null }) => {
    setSeen((s) => {
      if ((s[c.id] ?? 0) >= (c.lastAt ?? 0)) return s;
      const next = { ...s, [c.id]: c.lastAt ?? 0 };
      writeSeen(next);
      return next;
    });
  }, []);

  const unreadMessages =
    chats.reduce((a, c) => a + chatUnread(c, seen), 0) + ai.reduce((a, x) => a + x.unread, 0);
  const unreadAlerts = view.inbox.filter((i) => !i.read).length;
  const badge = unreadMessages + unreadAlerts;

  const close = () => {
    setOpen(false);
    setThread(null);
  };

  return (
    <>
      <button
        className={`phone-fab${buzz ? ' buzz' : ''}`}
        aria-label={badge ? t('Phone, {n} new', { n: badge }) : t('Phone')}
        onClick={() => {
          setOpen(true);
          setApp('home');
          setThread(null);
        }}
      >
        <PhoneGlyph />
        {badge > 0 && <span className="phone-fab-badge">{badge > 99 ? '99+' : badge}</span>}
      </button>
      {open && (
        <PhoneScreen
          app={app}
          setApp={(a) => {
            setApp(a);
            setThread(null);
          }}
          thread={thread}
          setThread={setThread}
          onClose={close}
          chats={chats}
          ai={ai}
          seen={seen}
          markSeen={markSeen}
          reload={() => {
            void loadChats();
            void loadAi();
          }}
          unreadMessages={unreadMessages}
          unreadAlerts={unreadAlerts}
        />
      )}
    </>
  );
}

function PhoneGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
      <rect
        x="6"
        y="2.5"
        width="12"
        height="19"
        rx="2.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
      <line
        x1="10.5"
        y1="18.2"
        x2="13.5"
        y2="18.2"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

const APPS: { id: Exclude<PhoneApp, 'home'>; icon: string; label: () => string; tone: string }[] = [
  { id: 'messages', icon: '💬', label: () => t('Messages'), tone: 'green' },
  { id: 'alerts', icon: '🔔', label: () => t('Alerts'), tone: 'red' },
  { id: 'contacts', icon: '👥', label: () => t('Contacts'), tone: 'blue' },
  { id: 'wallet', icon: '👛', label: () => t('Wallet'), tone: 'gold' },
  { id: 'jobs', icon: '🧰', label: () => t('Jobs'), tone: 'teal' },
  { id: 'map', icon: '🗺️', label: () => t('Map'), tone: 'violet' },
];

function PhoneScreen(props: {
  app: PhoneApp;
  setApp: (a: PhoneApp) => void;
  thread: ThreadRef | null;
  setThread: (t: ThreadRef | null) => void;
  onClose: () => void;
  chats: ChatSummary[];
  ai: AiThread[];
  seen: Record<string, number>;
  markSeen: (c: { id: string; lastAt: number | null }) => void;
  reload: () => void;
  unreadMessages: number;
  unreadAlerts: number;
}) {
  const { app, setApp, thread, setThread, onClose } = props;
  const { view } = useView();
  const ref = useRef<HTMLDivElement>(null);
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const back = () => {
    if (thread) {
      setThread(null);
      props.reload();
    } else if (picking) setPicking(false);
    else if (app !== 'home') setApp('home');
    else onClose();
  };

  const title = thread
    ? t('Chat')
    : picking
      ? t('New message')
      : app === 'home'
        ? t('Phone')
        : (APPS.find((a) => a.id === app)?.label() ?? '');

  return (
    <div
      className="phone"
      role="dialog"
      aria-modal="true"
      aria-label={t('Phone')}
      ref={ref}
      tabIndex={-1}
    >
      <div className="phone-frame">
        <header className="phone-bar">
          {app !== 'home' || thread ? (
            <button className="phone-back" onClick={back} aria-label={t('Back')}>
              ‹
            </button>
          ) : (
            <span className="phone-time small">{view.market.date.label}</span>
          )}
          <h2 className="phone-title">{title}</h2>
          <button className="icon-btn" aria-label={t('Close phone')} onClick={onClose}>
            ✕
          </button>
        </header>
        <div className="phone-screen">
          {app === 'home' && (
            <PhoneHome
              open={setApp}
              badges={{ messages: props.unreadMessages, alerts: props.unreadAlerts }}
            />
          )}
          {app === 'messages' &&
            (thread?.ai ? (
              <AiThreadView id={thread.ai} say={thread.say} onClose={onClose} />
            ) : thread?.player ? (
              <PlayerThreadView
                playerId={thread.player}
                draft={thread.say}
                chats={props.chats}
                markSeen={props.markSeen}
              />
            ) : picking ? (
              <NewMessage
                onPick={(r) => {
                  setPicking(false);
                  setThread(r);
                }}
              />
            ) : (
              <MessagesList
                chats={props.chats}
                ai={props.ai}
                seen={props.seen}
                onOpen={setThread}
                onNew={() => setPicking(true)}
              />
            ))}
          {app === 'alerts' && <Alerts onDone={onClose} />}
          {app === 'contacts' && (
            <Contacts
              onChat={(r) => {
                setApp('messages');
                setThread(r);
              }}
            />
          )}
          {app === 'wallet' && <Wallet onJobs={() => setApp('jobs')} />}
          {app === 'jobs' && (
            <Jobs
              onGo={(place) => {
                visitPlace(place);
                onClose();
              }}
            />
          )}
          {app === 'map' && (
            <PlacesMap
              onGo={(place) => {
                visitPlace(place);
                onClose();
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function PhoneHome({
  open,
  badges,
}: {
  open: (a: PhoneApp) => void;
  badges: Partial<Record<PhoneApp, number>>;
}) {
  const { view, cur } = useView();
  return (
    <div className="phone-home">
      <div className="phone-glance">
        <div className="small muted">{hereOf(view).name}</div>
        <div className="phone-glance-cash">{money(view.accounts.local?.balance ?? 0, cur)}</div>
        <div className="small muted">{t('Personal cash')}</div>
      </div>
      <div className="phone-apps">
        {APPS.map((a) => (
          <button
            key={a.id}
            className={`phone-app tone-${a.tone}`}
            data-app={a.id}
            onClick={() => open(a.id)}
            aria-label={badges[a.id] ? `${a.label()} (${badges[a.id]})` : a.label()}
          >
            <span className="phone-app-icon" aria-hidden="true">
              {a.icon}
              {!!badges[a.id] && <span className="phone-app-badge">{badges[a.id]}</span>}
            </span>
            <span className="phone-app-label">{a.label()}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Messages

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');

function Avatar({ name, ai }: { name: string; ai?: boolean }) {
  return (
    <span className={`phone-avatar${ai ? ' ai' : ''}`} aria-hidden="true">
      {initials(name) || '•'}
    </span>
  );
}

interface Convo {
  key: string;
  ref: ThreadRef;
  name: string;
  sub: string;
  lastText: string | null;
  lastAt: number;
  unread: number;
  ai: boolean;
}

function MessagesList({
  chats,
  ai,
  seen,
  onOpen,
  onNew,
}: {
  chats: ChatSummary[];
  ai: AiThread[];
  seen: Record<string, number>;
  onOpen: (r: ThreadRef) => void;
  onNew: () => void;
}) {
  const convos: Convo[] = [
    ...chats.map((c) => ({
      key: `chat:${c.id}`,
      ref: { player: c.with.id },
      name: c.with.name,
      sub: kindName(c.with.role),
      lastText: c.blocked ? t('Blocked') : c.lastText,
      lastAt: c.lastAt ?? 0,
      unread: chatUnread(c, seen),
      ai: false,
    })),
    ...ai.map((x) => ({
      key: `ai:${x.characterId}`,
      ref: { ai: x.characterId },
      name: x.name,
      sub: x.org
        ? t('{role} · {company}', { role: kindName(x.kind), company: x.org })
        : kindName(x.kind),
      lastText: x.lastText,
      lastAt: x.lastAt ?? 0,
      unread: x.unread,
      ai: true,
    })),
  ].sort((a, b) => b.lastAt - a.lastAt);
  return (
    <>
      <Button onClick={onNew}>{t('New message')}</Button>
      {convos.length === 0 ? (
        <Empty>{t('No conversations yet. Say hello to someone in town.')}</Empty>
      ) : (
        <ul className="phone-list" aria-label={t('Conversations')}>
          {convos.map((c) => (
            <li key={c.key}>
              <button className="phone-row" onClick={() => onOpen(c.ref)}>
                <Avatar name={c.name} ai={c.ai} />
                <span className="phone-row-main">
                  <span className="item-title">{c.name}</span>
                  <span className="small muted">{c.sub}</span>
                  {c.lastText && <span className="small phone-row-last">{tx(c.lastText)}</span>}
                </span>
                {c.unread > 0 && (
                  <span className="phone-unread" aria-label={t('{n} unread', { n: c.unread })}>
                    {c.unread}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function NewMessage({ onPick }: { onPick: (r: ThreadRef) => void }) {
  const { view } = useView();
  const [q, setQ] = useState('');
  const people = useMemo(() => aiPeopleOf(view), [view]);
  const players = view.players.filter((p) => !p.ai);
  const match = (s: string) => s.toLowerCase().includes(q.trim().toLowerCase());
  const groups: { title: string; kinds: string[] }[] = [
    { title: t('Investors'), kinds: ['partner', 'angel', 'lp'] },
    { title: t('Programmes'), kinds: ['accelerator', 'devpartner'] },
    { title: t('Founders'), kinds: ['founder'] },
    { title: t('Businesses'), kinds: ['owner'] },
  ];
  const shownPlayers = players.filter((p) => match(p.name));
  return (
    <>
      <input
        className="phone-search"
        type="search"
        aria-label={t('Search people')}
        placeholder={t('Search people')}
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      {shownPlayers.length > 0 && (
        <section>
          <h3 className="phone-h">{t('Players')}</h3>
          <ul className="phone-list">
            {shownPlayers.map((p) => (
              <li key={p.id}>
                <button className="phone-row" onClick={() => onPick({ player: p.id })}>
                  <Avatar name={p.name} />
                  <span className="phone-row-main">
                    <span className="item-title">{p.name}</span>
                    <span className="small muted">{kindName(p.role)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {groups.map((g) => {
        const xs = people.filter(
          (p) => g.kinds.includes(p.kind) && (match(p.name) || match(p.org ?? '')),
        );
        if (!xs.length) return null;
        return (
          <section key={g.title}>
            <h3 className="phone-h">{g.title}</h3>
            <ul className="phone-list" data-group={g.kinds[0]}>
              {xs.map((p) => (
                <li key={p.id}>
                  <button
                    className="phone-row"
                    data-character={p.id}
                    onClick={() => onPick({ ai: p.id })}
                  >
                    <Avatar name={p.name} ai />
                    <span className="phone-row-main">
                      <span className="item-title">{p.name}</span>
                      <span className="small muted">
                        {p.org
                          ? t('{role} · {company}', { role: kindName(p.kind), company: p.org })
                          : kindName(p.kind)}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </>
  );
}

const QUICK: Record<string, (() => string)[]> = {
  partner: [() => t('What do you invest in?'), () => t('Any advice?'), () => t('Can we meet?')],
  angel: [() => t('What do you invest in?'), () => t('Can we meet?'), () => t('Any advice?')],
  lp: [() => t('What do you invest in?'), () => t('Can we meet?')],
  accelerator: [() => t('What do you invest in?'), () => t('Any advice?')],
  devpartner: [() => t('What do you invest in?'), () => t('Any advice?')],
  founder: [() => t('How’s business?'), () => t('Are you hiring?'), () => t('Any advice?')],
  owner: [() => t('What do you need to buy?'), () => t('Any work going?'), () => t('Can we meet?')],
};

function ChatLog({ messages, typing }: { messages: ChatMessage[]; typing?: boolean }) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView?.({ block: 'end' });
  }, [messages.length, typing]);
  return (
    <div className="phone-log" aria-live="polite">
      {messages.map((m) => (
        <div key={m.id} className={`bubble${m.mine ? ' mine' : ''}`}>
          {m.text}
        </div>
      ))}
      {typing && (
        <div className="bubble phone-typing" aria-label={t('Typing…')}>
          <span />
          <span />
          <span />
        </div>
      )}
      <div ref={end} />
    </div>
  );
}

function Composer({
  value,
  onChange,
  onSend,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  disabled?: boolean;
}) {
  const { meta } = useView();
  return (
    <form
      className="phone-compose"
      onSubmit={(e) => {
        e.preventDefault();
        if (value.trim() && !disabled) onSend();
      }}
    >
      <input
        aria-label={t('Message')}
        placeholder={t('Message')}
        value={value}
        maxLength={meta?.chatMaxLength ?? 280}
        onChange={(e) => onChange(e.target.value)}
      />
      <button className="btn btn-primary" type="submit" disabled={!value.trim() || disabled}>
        {t('Send')}
      </button>
    </form>
  );
}

function AiThreadView({ id, say, onClose }: { id: string; say?: string; onClose: () => void }) {
  const { toast } = useView();
  const [thread, setThread] = useState<AiThread | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [typing, setTyping] = useState(false);
  const [missing, setMissing] = useState(false);
  const said = useRef(false);

  const post = useCallback(
    async (body: string) => {
      const mine: ChatMessage = { id: -Date.now(), mine: true, text: body, at: Date.now() };
      setMessages((m) => [...m, mine]);
      setTyping(true);
      try {
        const r = await api.aiSend(id, body, getLang());
        if (r.flagged) toast(t('Careful: that looks like a common scam pattern.'), 'info');
        setThread(r.thread);
        setMessages((m) => [...m, r.reply]);
        return true;
      } catch (e) {
        setMessages((m) => m.filter((x) => x !== mine));
        toast(tx((e as Error).message), 'error');
        return false;
      } finally {
        setTyping(false);
      }
    },
    [id, toast],
  );

  useEffect(() => {
    let live = true;
    api.aiThread(id).then(
      (r) => {
        if (!live) return;
        setThread(r.thread);
        setMessages(r.messages);
        if (say && !said.current) {
          said.current = true;
          void post(say);
        }
      },
      () => live && setMissing(true),
    );
    return () => {
      live = false;
    };
  }, [id, say, post]);

  if (missing) return <Empty>{t('This person isn’t around any more.')}</Empty>;
  if (!thread) return <p className="muted small">{t('Loading…')}</p>;
  const quick = QUICK[thread.kind ?? ''] ?? [() => t('Hello!'), () => t('Any advice?')];
  return (
    <div className="phone-thread" data-thread={thread.characterId}>
      <div className="phone-thread-head">
        <Avatar name={thread.name} ai />
        <div className="phone-row-main">
          <div className="item-title">{thread.name}</div>
          <div className="small muted">
            {thread.org
              ? t('{role} · {company}', { role: kindName(thread.kind), company: thread.org })
              : kindName(thread.kind)}
          </div>
        </div>
        {thread.place && (
          <Button
            variant="subtle"
            onClick={() => {
              visitPlace(thread.place!);
              onClose();
            }}
          >
            {t('Go there')}
          </Button>
        )}
      </div>
      {messages.length === 0 && !typing && (
        <p className="small muted">
          {t('Say hello. They answer from what’s really going on in town.')}
        </p>
      )}
      <ChatLog messages={messages} typing={typing} />
      {thread.available && (
        <>
          <div className="chips phone-quick">
            {[() => t('Hello!'), ...quick]
              .slice(messages.length ? 1 : 0, messages.length ? 4 : 3)
              .map((q) => (
                <button key={q()} className="chip" disabled={typing} onClick={() => void post(q())}>
                  {q()}
                </button>
              ))}
          </div>
          <Composer
            value={text}
            onChange={setText}
            disabled={typing}
            onSend={() => {
              const body = text;
              setText('');
              void post(body).then((ok) => !ok && setText(body));
            }}
          />
        </>
      )}
    </div>
  );
}

function PlayerThreadView({
  playerId,
  draft,
  chats,
  markSeen,
}: {
  playerId: string;
  draft?: string;
  chats: ChatSummary[];
  markSeen: (c: { id: string; lastAt: number | null }) => void;
}) {
  const { view, toast } = useView();
  const known = chats.find((c) => c.with.id === playerId) ?? null;
  const [started, setChatId] = useState<string | null>(null);
  const chatId = started ?? known?.id ?? null;
  const [data, setData] = useState<Awaited<ReturnType<typeof api.messages>> | null>(null);
  const [starters, setStarters] = useState<string[] | null>(null);
  const [text, setText] = useState(draft ?? '');
  const other = view.players.find((p) => p.id === playerId);

  const load = useCallback(() => {
    if (!chatId) return;
    void api.messages(chatId).then(
      (r) => {
        setData(r);
        const last = r.messages[r.messages.length - 1];
        markSeen({ id: chatId, lastAt: last?.at ?? null });
      },
      (e: Error) => toast(tx(e.message), 'error'),
    );
  }, [chatId, markSeen, toast]);

  useEffect(() => {
    if (!chatId) return;
    load();
    const timer = setInterval(load, 8000);
    return () => clearInterval(timer);
  }, [chatId, load]);

  useEffect(() => {
    if (chatId || known) return;
    void api.starters(playerId).then(
      (r) => setStarters(r.starters),
      () => setStarters([]),
    );
  }, [chatId, known, playerId]);

  const name = data?.chat.with.name ?? known?.with.name ?? other?.name ?? t('Chat');

  if (!chatId)
    return (
      <div className="phone-thread">
        <div className="phone-thread-head">
          <Avatar name={name} />
          <div className="item-title">{name}</div>
        </div>
        <p className="small muted">{t('Start with one tap')}</p>
        <div className="choice-grid">
          {(starters ?? []).map((s) => (
            <button
              key={s}
              className="choice"
              onClick={() =>
                void api.startChat(playerId, s).then(
                  (r) => setChatId(r.chat.id),
                  (e: Error) => toast(tx(e.message), 'error'),
                )
              }
            >
              “{tx(s)}”
            </button>
          ))}
        </div>
      </div>
    );

  const sendMsg = async () => {
    const body = text;
    setText('');
    try {
      const r = await api.send(chatId, body);
      if (r.flagged) toast(t('Careful: that looks like a common scam pattern.'), 'info');
      load();
    } catch (e) {
      setText(body);
      toast(tx((e as Error).message), 'error');
    }
  };

  return (
    <div className="phone-thread">
      <div className="phone-thread-head">
        <Avatar name={name} />
        <div className="phone-row-main">
          <div className="item-title">{name}</div>
          {other && <div className="small muted">{kindName(other.role)}</div>}
        </div>
      </div>
      <ChatLog messages={data?.messages ?? []} />
      {data?.chat.blocked ? (
        <p className="small muted">{t('This chat is blocked.')}</p>
      ) : (
        <>
          <Composer value={text} onChange={setText} onSend={() => void sendMsg()} />
          <p className="small muted">
            {t('No links, numbers, emails or handles. Commitments happen on deal cards.')}
          </p>
          <div className="row">
            <Button variant="ghost" onClick={() => void api.block(chatId).then(load)}>
              {t('Block')}
            </Button>
            <Button
              variant="ghost"
              onClick={() =>
                void api.report(chatId, 'scam').then(() => {
                  toast(t('Reported. A moderator will review.'), 'ok');
                  load();
                })
              }
            >
              {t('Report')}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Alerts

const KIND_ICON: Record<string, string> = {
  lead: '🧲',
  meeting: '🤝',
  reporter: '📰',
  pitch: '📨',
  warning: '⚠️',
  deal: '📝',
  system: 'ℹ️',
  milestone: '🏁',
  staff: '👥',
};

function Alerts({ onDone }: { onDone: () => void }) {
  const { view, send } = useView();
  const nav = useNav();
  const unread = view.inbox.filter((i) => !i.read).length;
  return (
    <>
      {unread > 0 && (
        <Button variant="ghost" onClick={() => void send({ type: 'inbox.read' })}>
          {t('Mark all read')}
        </Button>
      )}
      {view.inbox.length === 0 ? (
        <Empty>{t('Nothing yet.')}</Empty>
      ) : (
        <ul className="phone-list" aria-label={t('Alerts')}>
          {view.inbox.slice(0, 60).map((i) => (
            <li key={i.id}>
              <button
                className={`phone-row phone-alert${i.read ? ' read' : ''}`}
                data-alert={i.kind}
                onClick={() => {
                  nav?.openItem(i);
                  onDone();
                }}
              >
                <span className="phone-alert-icon" aria-hidden="true">
                  {KIND_ICON[i.kind] ?? '•'}
                </span>
                <span className="phone-row-main">
                  <span>{tx(i.text)}</span>
                  <span className="small muted">{t('Month {n}', { n: i.month })}</span>
                </span>
                {!i.read && <span className="phone-dot" aria-label={t('New')} />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Contacts

const contactKind = (k: ContactView['kind']) =>
  ({
    fund: t('Investor'),
    founder: t('Founder'),
    talent: t('Looking for work'),
    customer: t('Customer'),
    player: t('Player'),
    local: t('In town'),
  })[k];

/**
 * Wave 6: the people you saved ("Who's here" → Save) and met, with warmth
 * and kind; Chat opens their thread, Remove forgets them (`contact.remove`).
 */
function Contacts({ onChat }: { onChat: (r: ThreadRef) => void }) {
  const { view, send } = useView();
  const contacts = contactsOf(view);
  const [armed, setArmed] = useState<string | null>(null);
  return contacts.length === 0 ? (
    <Empty>{t('No contacts yet. Go into a café, a bar or the Hub and save who you meet.')}</Empty>
  ) : (
    <ul className="phone-list" aria-label={t('Contacts')}>
      {contacts.map((c) => {
        const r = contactChat(c, view);
        return (
          <li key={c.id} className="phone-contact" data-contact={c.chatId ?? c.refId}>
            <div className="phone-row static">
              <Avatar name={c.name} ai={!(r && 'player' in r)} />
              <span className="phone-row-main">
                <span className="item-title">{c.name}</span>
                <span className="small muted">
                  {c.chatId?.startsWith('biz:') ? t('Business owner') : contactKind(c.kind)}
                </span>
                <Bar value={c.warmth} label={t('Contact warmth')} tone="good" />
              </span>
            </div>
            <div className="row">
              <Button variant="subtle" disabled={!r} onClick={() => r && onChat(r)}>
                {t('Chat')}
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  if (armed !== c.id) return setArmed(c.id);
                  setArmed(null);
                  void send(looseCmd({ type: 'contact.remove', contactId: c.id }), () =>
                    t('{name} is no longer in your contacts.', { name: c.name }),
                  );
                }}
              >
                {armed === c.id ? t('Tap again to remove') : t('Remove')}
              </Button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Wallet

function Line({ label, value, tone }: { label: string; value: ReactNode; tone?: 'good' | 'bad' }) {
  return (
    <div className="spread phone-line">
      <span>{label}</span>
      <span className={tone}>{value}</span>
    </div>
  );
}

/** Quit your job: a second tap confirms (this month's hours aren't paid). */
export function QuitJob({ place }: { place: string }) {
  const { send } = useView();
  const [armed, setArmed] = useState(false);
  return (
    <Button
      variant={armed ? 'primary' : 'ghost'}
      onClick={() => {
        if (!armed) return setArmed(true);
        setArmed(false);
        void send(looseCmd({ type: 'job.quit' }), (r: { message?: string } | null) =>
          r?.message ? tx(r.message) : t('You left your job at {place}.', { place }),
        );
      }}
    >
      {armed ? t('Tap again to quit') : t('Quit job')}
    </Button>
  );
}

function Wallet({ onJobs }: { onJobs: () => void }) {
  const { view, cur } = useView();
  const job = myJobOf(view);
  const car = carOf(view);
  const home = homeOf(view);
  const living = view.me.lifestyle.monthlyCost;
  const loans = view.me.loans.reduce(
    (a, l) => a + num((l as unknown as Record<string, unknown>).outstanding),
    0,
  );
  const net = (job?.monthlyPay ?? 0) - living - (car?.monthlyCost ?? 0);
  return (
    <div className="phone-wallet">
      <section className="phone-card phone-cash">
        <div className="small">{t('Personal cash')}</div>
        <div className="phone-glance-cash">{money(view.accounts.local?.balance ?? 0, cur)}</div>
        {view.accounts.usd && (
          <div className="small">{money(view.accounts.usd.balance, 'USD')}</div>
        )}
        <div className="small">
          {t('Last month: in {income}, out {spend}', {
            income: money(view.me.lastMonth.income, cur),
            spend: money(view.me.lastMonth.spend, cur),
          })}
        </div>
      </section>
      <section className="phone-card">
        <h3 className="phone-h">{t('Work')}</h3>
        {job ? (
          <>
            <Line
              label={t('{role} at {place}', { role: tx(job.label), place: job.businessName })}
              value=""
            />
            <Line
              label={t('Pay')}
              value={t('{amount}/mo', { amount: money(job.monthlyPay, cur) })}
              tone="good"
            />
            <Line label={t('Hours')} value={t('{n}h a month', { n: job.hours })} />
            <QuitJob place={job.businessName} />
          </>
        ) : (
          <>
            <p className="small muted">{t('No job right now.')}</p>
            <Button variant="subtle" onClick={onJobs}>
              {t('Find work')}
            </Button>
          </>
        )}
        <Line label={t('Gigs this month')} value={view.me.gigsThisMonth} />
      </section>
      <section className="phone-card">
        <h3 className="phone-h">{t('Monthly costs')}</h3>
        <Line
          label={t('Living ({tier})', { tier: tx(String(view.me.lifestyle.name ?? '')) })}
          value={t('{amount}/mo', { amount: money(living, cur) })}
        />
        <Line
          label={car ? t('Car: {car}', { car: tx(car.label) }) : t('Car')}
          value={car ? t('{amount}/mo', { amount: money(car.monthlyCost, cur) }) : t('None')}
        />
        {loans > 0 && <Line label={t('Personal loans')} value={money(loans, cur)} tone="bad" />}
        <Line
          label={t('Each month, roughly')}
          value={money(net, cur)}
          tone={net >= 0 ? 'good' : 'bad'}
        />
      </section>
      <section className="phone-card">
        <h3 className="phone-h">{t('Home')}</h3>
        {home && home.items.length ? (
          <>
            <div className="chips">
              {home.items.map((i) => (
                <Pill key={`${i.slot}:${i.label}`}>{tx(i.label)}</Pill>
              ))}
            </div>
            <Line label={t('Comfort')} value={home.comfort} />
          </>
        ) : (
          <p className="small muted">{t('Your flat is bare. Furniture makes rest go further.')}</p>
        )}
        <Line label={t('Stars')} value={stars(view.me.stars)} />
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Jobs

function Jobs({ onGo }: { onGo: (place: string) => void }) {
  const { view } = useView();
  const city = cityViewOf(view);
  const cur = city.market.currency;
  const jobs = jobsOf(view);
  const mine = myJobOf(view);
  const gigs = businessesOf(city)
    .filter((b) => b.open)
    .flatMap((b) => b.gigs.map((g) => ({ b, g })));
  return (
    <>
      {mine && (
        <div className="phone-card">
          <p className="small">
            {t('You work as {role} at {place}.', {
              role: tx(mine.label),
              place: mine.businessName,
            })}
          </p>
          <QuitJob place={mine.businessName} />
        </div>
      )}
      <h3 className="phone-h">{t('Jobs')}</h3>
      {jobs.length === 0 ? (
        <Empty>{t('No part-time jobs listed here yet. Try a shift instead.')}</Empty>
      ) : (
        <ul className="phone-list" aria-label={t('Jobs')}>
          {jobs.map((j) => (
            <li key={`${j.businessId}:${j.role}`}>
              <button className="phone-row" onClick={() => onGo(`biz:${j.businessId}`)}>
                <span className="phone-alert-icon" aria-hidden="true">
                  💼
                </span>
                <span className="phone-row-main">
                  <span className="item-title">{tx(j.label)}</span>
                  <span className="small muted">{j.businessName}</span>
                </span>
                <span className="small phone-row-end">
                  {t('{amount}/mo', { amount: money(j.monthlyPay, cur) })}
                  <br />
                  {t('{n}h', { n: j.hours })}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <h3 className="phone-h">{t('Shifts and gigs')}</h3>
      {gigs.length === 0 ? (
        <Empty>{t('No shifts going right now.')}</Empty>
      ) : (
        <ul className="phone-list" aria-label={t('Shifts and gigs')}>
          {gigs.slice(0, 40).map(({ b, g }) => (
            <li key={`${b.id}:${g.id}`}>
              <button className="phone-row" onClick={() => onGo(`biz:${b.id}`)}>
                <span className="phone-alert-icon" aria-hidden="true">
                  ⏱️
                </span>
                <span className="phone-row-main">
                  <span className="item-title">{tx(g.label)}</span>
                  <span className="small muted">{b.name}</span>
                </span>
                <span className="small phone-row-end">
                  {money(g.pay, cur)}
                  <br />
                  {t('{n}h', { n: g.hours })}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Map: every place in town as a list

function PlacesMap({ onGo }: { onGo: (place: string) => void }) {
  const { view } = useView();
  const city = hereOf(view);
  const founder = view.companies.some((c) => c.status === 'active');
  const town: { id: string; name: string }[] = [
    ...(founder ? [{ id: 'office', name: t('Your office') }] : []),
    { id: 'home', name: t('Home') },
    { id: 'hub', name: t('The Hub') },
    { id: 'eventhall', name: t('Event Hall') },
    { id: 'newsstand', name: t('Newsstand') },
    { id: 'airport', name: t('Airport') },
  ];
  const money_: { id: string; name: string }[] = [
    ...city.lenders.map((l) => ({ id: `lender:${l.id}`, name: l.name })),
    ...city.banks.map((b) => ({ id: `playerbank:${b.id}`, name: b.name })),
    ...city.funds
      .filter((f) => f.market === city.id)
      .map((f) => ({ id: `fund:${f.id}`, name: f.name })),
    ...capitalOf(view).map((x) => ({ id: x.place, name: x.name })),
  ];
  const shops = businessesOf(cityViewOf(view))
    .filter((b) => b.open)
    .sort((a, b) => (a.name < b.name ? -1 : 1));
  return (
    <>
      <p className="small muted">{t('Tap a place to walk there.')}</p>
      <PlaceGroup onGo={onGo} title={t('Around town')} items={town} />
      <PlaceGroup onGo={onGo} title={t('Money and investors')} items={money_} />
      <PlaceGroup
        onGo={onGo}
        title={t('Businesses')}
        items={shops.map((b) => ({ id: `biz:${b.id}`, name: b.name, sub: tx(b.kindLabel) }))}
      />
    </>
  );
}

interface PlaceItem {
  id: string;
  name: string;
  sub?: string;
}

function PlaceGroup({
  title,
  items,
  onGo,
}: {
  title: string;
  items: PlaceItem[];
  onGo: (place: string) => void;
}) {
  if (!items.length) return null;
  return (
    <section>
      <h3 className="phone-h">{title}</h3>
      <ul className="phone-list">
        {items.map((p) => (
          <li key={p.id}>
            <button className="phone-row" data-place={p.id} onClick={() => onGo(p.id)}>
              <span className="phone-row-main">
                <span className="item-title">{p.name}</span>
                {p.sub && <span className="small muted">{p.sub}</span>}
              </span>
              <span aria-hidden="true">›</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

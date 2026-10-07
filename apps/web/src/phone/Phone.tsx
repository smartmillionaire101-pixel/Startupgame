/**
 * The phone (Wave 5 §C, Wave 7 §C): a real-looking phone with a status bar
 * (city time, signal, battery = your energy), a home screen of apps in a
 * 4-column grid with a dock and red badges, and notification banners that
 * slide down and open what they're about. Each app lives in ./apps.
 *
 * `openPhone()` (./bus) opens it from anywhere; `usePhoneBadge()` gives a
 * phone button elsewhere its badge. `<PhoneDock fab={false} />` hides the
 * floating button when the top bar has its own.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { PlayerView } from '@runway/engine';
import { api, type AiThread, type ChatSummary } from '../api';
import { money } from '../format';
import { t, tx } from '../i18n';
import { useView } from '../store';
import { visitPlace } from '../city/goto';
import { CITY_GEO, hereOf } from '../city/travel';
import { onPhone, setPhoneBadge, type PhoneApp, type PhoneOpen } from './bus';
import { Battery, Icon, type IconName } from './icons';
import { applySavedSettings, prefersReducedMotion } from './settings';
import { moodOf, type PhoneCtx, type ThreadRef } from './shared';
import { Alerts, KIND_ICON } from './apps/Alerts';
import { Bank } from './apps/Bank';
import { Chop } from './apps/Chop';
import { Contacts } from './apps/Contacts';
import { Events } from './apps/Events';
import { Fit } from './apps/Fit';
import { Founder } from './apps/Founder';
import { GoingOut } from './apps/GoingOut';
import { Homes } from './apps/Homes';
import { OutingHost } from '../city/OutingScene';
import { HomeApp } from './apps/HomeApp';
import { Invest } from './apps/Invest';
import { Jobs } from './apps/Jobs';
import { MapApp } from './apps/MapApp';
import {
  AiThreadView,
  chatUnread,
  MessagesList,
  NewMessage,
  PlayerThreadView,
} from './apps/Messages';
import { News } from './apps/News';
import { Rides } from './apps/Rides';
import { Settings } from './apps/Settings';
import { Social } from './apps/Social';
import { Travel } from './apps/Travel';
import { VisitHome } from './Visit';
import './phone.css';

// Backward-compatible exports (Wave 5/6 callers).
export { aiPeopleOf, type AiContact } from './apps/Messages';
export { QuitJob } from './shared';
export { jobsOf, myJobOf, type JobView } from '../city/life';

applySavedSettings();

type AppId = Exclude<PhoneApp, 'home' | 'wallet'>;

interface AppDef {
  id: AppId;
  icon: IconName;
  label: () => string;
  /** Tile gradient. */
  bg: [string, string];
}

export const APPS: AppDef[] = [
  { id: 'messages', icon: 'messages', label: () => t('Messages'), bg: ['#4ade80', '#16a34a'] },
  { id: 'map', icon: 'map', label: () => t('Map'), bg: ['#60a5fa', '#2563eb'] },
  { id: 'bank', icon: 'bank', label: () => t('Bank'), bg: ['#2dd4bf', '#0f766e'] },
  { id: 'founder', icon: 'founder', label: () => t('Founder'), bg: ['#fb923c', '#ea580c'] },
  { id: 'contacts', icon: 'contacts', label: () => t('Contacts'), bg: ['#94a3b8', '#475569'] },
  { id: 'alerts', icon: 'alerts', label: () => t('Alerts'), bg: ['#f87171', '#dc2626'] },
  { id: 'rides', icon: 'rides', label: () => t('Rides'), bg: ['#34d399', '#047857'] },
  { id: 'chop', icon: 'chop', label: () => t('Chop'), bg: ['#fbbf24', '#d97706'] },
  { id: 'invest', icon: 'invest', label: () => t('Invest'), bg: ['#a78bfa', '#6d28d9'] },
  { id: 'fit', icon: 'fit', label: () => t('Fit'), bg: ['#f472b6', '#db2777'] },
  { id: 'jobs', icon: 'jobs', label: () => t('Jobs'), bg: ['#a8a29e', '#57534e'] },
  { id: 'news', icon: 'news', label: () => t('News'), bg: ['#64748b', '#1e293b'] },
  { id: 'travel', icon: 'travel', label: () => t('Travel'), bg: ['#38bdf8', '#0369a1'] },
  { id: 'house', icon: 'house', label: () => t('Home'), bg: ['#86efac', '#15803d'] },
  { id: 'social', icon: 'social', label: () => t('Social'), bg: ['#e879f9', '#a21caf'] },
  { id: 'events', icon: 'events', label: () => t('Events'), bg: ['#818cf8', '#4338ca'] },
  { id: 'homes', icon: 'key', label: () => t('Homes'), bg: ['#fcd34d', '#b45309'] },
  { id: 'goingout', icon: 'cocktail', label: () => t('Going out'), bg: ['#fb7185', '#be123c'] },
  { id: 'settings', icon: 'settings', label: () => t('Settings'), bg: ['#9ca3af', '#4b5563'] },
];
const DOCK: AppId[] = ['messages', 'map', 'bank', 'founder'];

const appOf = (a: PhoneApp | undefined): PhoneApp => (a === 'wallet' ? 'bank' : (a ?? 'home'));

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

// ---------------------------------------------------------------------------
// Banners

interface Banner {
  key: string;
  icon: IconName;
  color: string;
  title: string;
  text: string;
  open: PhoneOpen;
}

const BANNER_MS = 3000;

function BannerView({ b, onTap, onDone }: { b: Banner; onTap: () => void; onDone: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDone, BANNER_MS);
    return () => clearTimeout(timer);
  }, [b.key, onDone]);
  return (
    <button
      className="phone-banner"
      data-banner={b.key}
      onClick={onTap}
      aria-label={t('Notification: {title}. {text}', { title: b.title, text: b.text })}
    >
      <span className="phone-banner-icon" style={{ background: b.color }}>
        <Icon name={b.icon} size={18} />
      </span>
      <span className="phone-row-main">
        <span className="phone-banner-title">{b.title}</span>
        <span className="phone-banner-text">{b.text}</span>
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// The dock: button, polling, banners, and the phone itself

type InboxItem = PlayerView['inbox'][number];

export function PhoneDock({ fab = true }: { fab?: boolean } = {}) {
  const { view, lite } = useView();
  const [open, setOpen] = useState(false);
  const [app, setApp] = useState<PhoneApp>('home');
  const [invite, setInvite] = useState(false);
  const [sendTo, setSendTo] = useState<string | undefined>(undefined);
  const [property, setProperty] = useState<string | undefined>(undefined);
  const [thread, setThread] = useState<ThreadRef | null>(null);
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [ai, setAi] = useState<AiThread[]>([]);
  const [seen, setSeen] = useState<Record<string, number>>(() => readSeen() ?? {});
  const [buzz, setBuzz] = useState(false);
  const [banner, setBanner] = useState<Banner | null>(null);
  const prev = useRef<Map<string, number> | null>(null);
  const viewing = useRef<string | null>(null);
  useEffect(() => {
    viewing.current = open && thread?.player ? thread.player : null;
  });

  const notify = useCallback((b: Banner) => {
    setBanner(b);
    setBuzz(true);
    setTimeout(() => setBuzz(false), 1400);
    if (!prefersReducedMotion()) navigator.vibrate?.(60);
  }, []);

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
        const c = fresh[0]!;
        notify({
          key: `chat:${c.id}:${c.lastAt}`,
          icon: 'messages',
          color: '#16a34a',
          title: t('New message from {name}', { name: c.with.name }),
          text: c.lastText ? tx(c.lastText) : '',
          open: { player: c.with.id },
        });
      }
    } catch {
      /* offline or signed out: try again on the next tick */
    }
  }, [notify]);

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

  // New alerts slide down as a banner (not the ones already there when the game loaded).
  const known = useRef<Set<number | string> | null>(null);
  useEffect(() => {
    const ids = new Set<number | string>(view.inbox.map((i) => i.id));
    if (!known.current) {
      known.current = ids;
      return;
    }
    const fresh: InboxItem | undefined = view.inbox.find(
      (i) => !i.read && !known.current!.has(i.id),
    );
    known.current = ids;
    if (fresh) {
      const [icon, color] = KIND_ICON[fresh.kind] ?? ['alerts', '#64748b'];
      notify({
        key: `inbox:${fresh.id}`,
        icon,
        color,
        title: t('Alerts'),
        text: tx(fresh.text),
        open: { app: 'alerts' },
      });
    }
  }, [view.inbox, notify]);

  const openWith = useCallback((o: PhoneOpen) => {
    setOpen(true);
    setInvite(!!o.invite);
    setSendTo(o.send);
    setProperty(o.property);
    if (o.property !== undefined) {
      setApp('homes');
      setThread(null);
    } else if (o.send !== undefined) {
      setApp('bank');
      setThread(null);
    } else if (o.ai || o.player) {
      setApp('messages');
      setThread({ ai: o.ai, player: o.player, say: o.say });
    } else {
      setApp(o.invite ? 'contacts' : appOf(o.app));
      setThread(null);
    }
  }, []);

  // Opened from elsewhere: a person card's Chat, a contact, the top bar.
  useEffect(() => onPhone(openWith), [openWith]);

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
  useEffect(() => setPhoneBadge(badge), [badge]);

  const close = useCallback(() => {
    setOpen(false);
    setThread(null);
    setInvite(false);
    setSendTo(undefined);
  }, []);
  const dismissBanner = useCallback(() => setBanner(null), []);

  return (
    <>
      {fab && (
        <button
          className={`phone-fab${buzz ? ' buzz' : ''}`}
          aria-label={badge ? t('Phone, {n} new', { n: badge }) : t('Phone')}
          onClick={() => openWith({})}
        >
          <Icon name="phone" size={24} strokeWidth={2} />
          {badge > 0 && <span className="phone-fab-badge">{badge > 99 ? '99+' : badge}</span>}
        </button>
      )}
      {banner && (
        <div className={`phone-banner-slot${open ? ' over-phone' : ''}`}>
          <BannerView
            key={banner.key}
            b={banner}
            onDone={dismissBanner}
            onTap={() => {
              setBanner(null);
              openWith(banner.open);
            }}
          />
        </div>
      )}
      <VisitHome />
      <OutingHost />
      {open && (
        <PhoneScreen
          app={app}
          setApp={(a) => {
            setApp(a);
            setThread(null);
            setInvite(false);
            setSendTo(undefined);
            setProperty(undefined);
          }}
          invite={invite}
          sendTo={sendTo}
          property={property}
          pickGuest={() => openWith({ invite: true })}
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
          badges={{ messages: unreadMessages, alerts: unreadAlerts }}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// The status bar: city local time, signal, battery = your energy

function cityTime(marketId: string): string {
  const tz = CITY_GEO[marketId]?.tz;
  try {
    return new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      ...(tz ? { timeZone: tz } : {}),
    }).format(new Date());
  } catch {
    return '';
  }
}

function StatusBar() {
  const { view } = useView();
  const id = hereOf(view).id;
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((n) => n + 1), 20_000);
    return () => clearInterval(timer);
  }, []);
  const time = cityTime(id);
  const energy = view.me.energy;
  return (
    <div className="phone-status" aria-label={t('Status bar')}>
      <span className="phone-status-time" title={hereOf(view).name}>
        {time}
      </span>
      <span className="phone-status-notch" aria-hidden="true" />
      <span className="phone-status-right">
        <Icon name="signal" size={15} strokeWidth={2.4} />
        <span
          className="phone-battery"
          role="meter"
          aria-label={t('Energy')}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={energy}
        >
          <span className="phone-battery-n">{energy}</span>
          <Battery level={energy} />
        </span>
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The phone

function PhoneScreen(props: {
  app: PhoneApp;
  setApp: (a: PhoneApp) => void;
  invite: boolean;
  sendTo?: string;
  property?: string;
  pickGuest: () => void;
  thread: ThreadRef | null;
  setThread: (t: ThreadRef | null) => void;
  onClose: () => void;
  chats: ChatSummary[];
  ai: AiThread[];
  seen: Record<string, number>;
  markSeen: (c: { id: string; lastAt: number | null }) => void;
  reload: () => void;
  badges: Partial<Record<PhoneApp, number>>;
}) {
  const { app, setApp, thread, setThread, onClose } = props;
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

  const ctx: PhoneCtx = {
    open: setApp,
    chat: (r) => {
      setApp('messages');
      setThread(r);
    },
    close: onClose,
    goPlace: (place) => {
      visitPlace(place);
      onClose();
    },
    pickGuest: props.pickGuest,
    invite: props.invite,
    sendTo: props.sendTo,
    property: props.property,
  };

  const def = APPS.find((a) => a.id === app);
  const title = thread
    ? t('Chat')
    : picking
      ? t('New message')
      : props.invite && app === 'contacts'
        ? t('Invite over')
        : (def?.label() ?? t('Phone'));

  let body: ReactNode = null;
  switch (app) {
    case 'home':
      body = <PhoneHome open={setApp} badges={props.badges} />;
      break;
    case 'messages':
      body = thread?.ai ? (
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
      );
      break;
    case 'alerts':
      body = <Alerts ctx={ctx} />;
      break;
    case 'contacts':
      body = <Contacts ctx={ctx} />;
      break;
    case 'wallet':
    case 'bank':
      body = <Bank ctx={ctx} />;
      break;
    case 'jobs':
      body = <Jobs ctx={ctx} />;
      break;
    case 'map':
      body = <MapApp ctx={ctx} />;
      break;
    case 'rides':
      body = <Rides ctx={ctx} />;
      break;
    case 'chop':
      body = <Chop ctx={ctx} />;
      break;
    case 'invest':
      body = <Invest ctx={ctx} />;
      break;
    case 'fit':
      body = <Fit ctx={ctx} />;
      break;
    case 'founder':
      body = <Founder ctx={ctx} />;
      break;
    case 'news':
      body = <News ctx={ctx} />;
      break;
    case 'travel':
      body = <Travel ctx={ctx} />;
      break;
    case 'house':
      body = <HomeApp ctx={ctx} />;
      break;
    case 'social':
      body = <Social ctx={ctx} />;
      break;
    case 'settings':
      body = <Settings ctx={ctx} />;
      break;
    case 'events':
      body = <Events ctx={ctx} />;
      break;
    case 'homes':
      body = <Homes ctx={ctx} />;
      break;
    case 'goingout':
      body = <GoingOut ctx={ctx} />;
      break;
  }

  const home = app === 'home' && !thread;
  return (
    <div
      className="phone"
      role="dialog"
      aria-modal="true"
      aria-label={t('Phone')}
      ref={ref}
      tabIndex={-1}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className={`phone-frame${home ? ' at-home' : ''}`} data-phone-app={app}>
        <StatusBar />
        {!home && (
          <header className="phone-bar">
            <button className="phone-back" onClick={back} aria-label={t('Back')}>
              <Icon name="chevron" size={22} strokeWidth={2.4} className="flip" />
            </button>
            <h2 className="phone-title">
              {def && !thread && !picking && (
                <span className="phone-title-icon" style={tileBg(def)}>
                  <Icon name={def.icon} size={14} strokeWidth={2.2} />
                </span>
              )}
              {title}
            </h2>
            <button className="phone-x" aria-label={t('Close phone')} onClick={onClose}>
              <Icon name="close" size={18} strokeWidth={2.2} />
            </button>
          </header>
        )}
        <div className={`phone-screen${home ? ' phone-home-screen' : ''}`} key={app}>
          {body}
        </div>
        {home && (
          <button className="phone-indicator" aria-label={t('Close phone')} onClick={onClose}>
            <span />
          </button>
        )}
      </div>
    </div>
  );
}

const tileBg = (a: AppDef) => ({
  background: `linear-gradient(160deg, ${a.bg[0]}, ${a.bg[1]})`,
});

function AppTile({ a, badge, open }: { a: AppDef; badge?: number; open: (a: PhoneApp) => void }) {
  return (
    <button
      className="phone-app"
      data-app={a.id}
      onClick={() => open(a.id)}
      aria-label={badge ? `${a.label()} (${badge})` : a.label()}
    >
      <span className="phone-app-icon" style={tileBg(a)} aria-hidden="true">
        <Icon name={a.icon} size={28} />
        {!!badge && <span className="phone-app-badge">{badge > 99 ? '99+' : badge}</span>}
      </span>
      <span className="phone-app-label">{a.label()}</span>
    </button>
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
  const mood = moodOf(view);
  const grid = APPS.filter((a) => !DOCK.includes(a.id));
  const dock = DOCK.map((id) => APPS.find((a) => a.id === id)!);
  return (
    <div className="phone-home">
      <section className="phone-widget" aria-label={t('Today')}>
        <div className="phone-widget-top">
          <span>{hereOf(view).name}</span>
          <span>{tx(view.market.date.label)}</span>
        </div>
        <div className="phone-glance-cash">{money(view.accounts.local?.balance ?? 0, cur)}</div>
        <div className="phone-widget-row">
          <span>
            <Icon name="bolt" size={14} /> {t('Energy {n}', { n: view.me.energy })}
          </span>
          {mood !== null && (
            <span>
              <Icon name="heart" size={14} /> {t('Mood {n}', { n: mood })}
            </span>
          )}
        </div>
      </section>
      <div className="phone-apps" role="group" aria-label={t('Apps')}>
        {grid.map((a) => (
          <AppTile key={a.id} a={a} badge={badges[a.id]} open={open} />
        ))}
      </div>
      <div className="phone-dock" role="group" aria-label={t('Dock')}>
        {dock.map((a) => (
          <AppTile key={a.id} a={a} badge={badges[a.id]} open={open} />
        ))}
      </div>
    </div>
  );
}

import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useGame, useView } from './store';
import { CountUp, Icon, initReduceMotion, Sheet, Toasts, type IconName } from './ui';
import { money } from './format';
import { t } from './i18n';
import { SignIn } from './screens/SignIn';
import { Onboarding } from './screens/Onboarding';
import { Home } from './screens/Home';
import { CompanyScreen } from './screens/Company';
import { MoneyScreen } from './screens/Money';
import { DealFlow, Portfolio } from './screens/Investor';
import { MeScreen } from './screens/Me';
import { BankScreen } from './screens/Bank';
import { CityScreen } from './city/CityScreen';
import { onVisit, visitPlace } from './city/goto';
import { DealCard } from './screens/common';
import { NavContext, openPhone, type Nav } from './phone/bus';
import { inboxTarget, type TabId, type Target } from './phone/navigate';
import { UpdateBanner } from './update';
import { useVisits } from './useVisits';
import { GameActivity } from './GameActivity';
import { hereOf, isAbroad } from './city/travel';

// Reduced motion is decided once, before anything animates (Wave 7 §D).
initReduceMotion();

// The display font for headings, loaded without blocking the first paint (and
// skipped in lite mode to save data: the system font stands in).
if (typeof document !== 'undefined' && !document.getElementById('rw-font')) {
  let lite = false;
  try {
    lite = localStorage.getItem('rw_lite') === '1';
  } catch {
    /* storage blocked */
  }
  const add = () => {
    if (document.getElementById('rw-font')) return;
    const link = document.createElement('link');
    link.id = 'rw-font';
    link.rel = 'stylesheet';
    link.href =
      'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&display=swap';
    document.head.appendChild(link);
  };
  // After the page has loaded, so a slow font host never holds the game up.
  if (!lite) {
    if (document.readyState === 'complete') add();
    else window.addEventListener('load', add, { once: true });
  }
}

// Heavy, occasional screens load on demand: the main chunk stays small.
// The phone is opened from the top bar: wait until its dock is mounted (and so
// listening) before asking it to open, in case the chunk is still loading.
let phoneMounted: () => void = () => {};
const phoneReady = new Promise<void>((resolve) => {
  phoneMounted = resolve;
});
const PhoneDock = lazy(async () => {
  const m = await import('./phone/Phone');
  function Dock() {
    useEffect(() => phoneMounted(), []);
    return <m.PhoneDock />;
  }
  return { default: Dock };
});
const NewsScreen = lazy(() => import('./screens/News').then((m) => ({ default: m.NewsScreen })));

export function App() {
  useVisits();
  const { status } = useGame();
  return (
    <>
      {status === 'loading' && (
        <div className="app">
          <p className="muted" style={{ paddingTop: '3rem' }}>
            {t('Loading Runway…')}
          </p>
        </div>
      )}
      {status === 'offline' && (
        <div className="app">
          <p style={{ paddingTop: '3rem' }}>
            {t(
              'Can’t reach the server. Your daily digest is available offline once you’ve opened it.',
            )}
          </p>
        </div>
      )}
      {status === 'signedOut' && <SignIn />}
      {status === 'onboarding' && <Onboarding />}
      {status === 'ready' && <Game />}
      <Toasts />
      <UpdateBanner />
    </>
  );
}

interface TabDef {
  id: TabId;
  label: string;
  icon: IconName;
  badge?: number;
}

/**
 * The bottom tabs (Wave 7: at most five). "Today" is the inbox dashboard
 * (its id stays 'home' for notifications); News lives behind Today and the
 * phone rather than in a tab of its own.
 */
function tabsOf(
  role: 'banker' | 'founder' | 'investor',
  b: { unread: number; myTurn: number; bankRequests: number },
): TabDef[] {
  const city: TabDef = { id: 'city', label: t('City'), icon: 'city' };
  const today: TabDef = { id: 'home', label: t('Today'), icon: 'today', badge: b.unread };
  const me: TabDef = { id: 'me', label: t('Me'), icon: 'me' };
  if (role === 'banker')
    return [city, today, { id: 'bank', label: t('Bank'), icon: 'bank', badge: b.bankRequests }, me];
  if (role === 'founder')
    return [
      city,
      today,
      { id: 'company', label: t('Company'), icon: 'company' },
      { id: 'money', label: t('Money'), icon: 'money', badge: b.myTurn },
      me,
    ];
  return [
    city,
    today,
    { id: 'portfolio', label: t('Portfolio'), icon: 'portfolio' },
    { id: 'deals', label: t('Deal flow'), icon: 'deals', badge: b.myTurn },
    me,
  ];
}

/** Screens you reach without a tab of their own (News, from Today or a notification). */
const EXTRA: TabId[] = ['news'];

function Game() {
  const { view, send } = useView();
  const founder = view.me.role === 'founder' || view.companies.some((c) => c.status === 'active');
  const [tab, setTab] = useState<TabId>('city');
  const [focusDeal, setFocusDeal] = useState<string | null>(null);
  const unread = view.inbox.filter((i) => !i.read).length;
  const myTurn = view.deals.filter((d) => d.yourTurn).length;
  const bankRequests = view.deals.filter(
    (d) => d.yourTurn && d.counterparty.kind === 'playerbank',
  ).length;
  const banker = view.me.role === 'banker';
  const tabs = tabsOf(banker ? 'banker' : founder ? 'founder' : 'investor', {
    unread,
    myTurn,
    bankRequests,
  });
  const current = tabs.some((x) => x.id === tab) || EXTRA.includes(tab) ? tab : 'city';
  const go = (id: TabId) => {
    setTab(id);
    window.scrollTo({ top: 0 });
  };
  // Where notifications take you (phone Alerts and the Today inbox).
  const goTarget = useCallback((target: Target) => {
    if (target.kind === 'place') {
      visitPlace(target.place);
      return;
    }
    setTab(target.tab);
    window.scrollTo({ top: 0 });
    setFocusDeal(target.dealId ?? null);
  }, []);
  const viewRef = useRef(view);
  useEffect(() => {
    viewRef.current = view;
  });
  const nav = useMemo<Nav>(
    () => ({
      go: goTarget,
      openItem: (item) => {
        if (!item.read) void send({ type: 'inbox.read', ids: [item.id] });
        goTarget(inboxTarget(item, viewRef.current));
      },
    }),
    [goTarget, send],
  );
  const dealOpen = focusDeal ? view.deals.find((d) => d.id === focusDeal) : undefined;

  // "Take me there" (e.g. a contact's office) opens the City, which walks you over.
  useEffect(
    () =>
      onVisit(() => {
        setTab('city');
        window.scrollTo({ top: 0 });
      }),
    [],
  );

  // Panels (sheets) open above the bottom bar, never over it, so the tabs keep
  // working while one is open: tapping a tab leaves the screen and closes it.
  const navRef = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const root = document.documentElement;
    const set = () => root.style.setProperty('--nav-h', `${nav.offsetHeight}px`);
    set();
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(set);
    ro?.observe(nav);
    return () => {
      ro?.disconnect();
      root.style.removeProperty('--nav-h');
    };
  }, []);

  return (
    <NavContext.Provider value={nav}>
      <div className={`app${current === 'city' ? ' app-city' : ''}`}>
        <TopBar alerts={unread} />
        <GameActivity />
        <main>
          {current === 'city' && <CityScreen onNavigate={go} />}
          {current === 'home' && <Home onNews={() => go('news')} />}
          {current === 'company' && <CompanyScreen />}
          {current === 'money' && <MoneyScreen />}
          {current === 'deals' && <DealFlow />}
          {current === 'portfolio' && <Portfolio />}
          {current === 'bank' && <BankScreen />}
          {current === 'news' && (
            <Suspense fallback={<p className="muted">{t('Loading…')}</p>}>
              <NewsScreen />
            </Suspense>
          )}
          {current === 'me' && <MeScreen />}
        </main>
      </div>
      <nav className="nav" ref={navRef} aria-label={t('Main')}>
        <div className="nav-inner" style={{ gridTemplateColumns: `repeat(${tabs.length}, 1fr)` }}>
          {tabs.map((x) => (
            <button
              key={x.id}
              data-tab={x.id}
              aria-current={current === x.id ? 'page' : undefined}
              onClick={() => go(x.id)}
            >
              <span className="ico">
                <Icon name={x.icon} />
              </span>
              <span className="nav-label">{x.label}</span>
              {!!x.badge && <span className="badge">{x.badge > 99 ? '99+' : x.badge}</span>}
            </button>
          ))}
        </div>
      </nav>
      <Suspense fallback={null}>
        <PhoneDock />
      </Suspense>
      {dealOpen && (
        <Sheet title={t('Deal card')} onClose={() => setFocusDeal(null)}>
          <DealCard deal={dealOpen} />
        </Sheet>
      )}
    </NavContext.Provider>
  );
}

/**
 * The top bar (Wave 7): one 48px line that never wraps. Where you are and
 * when, your cash (it ticks to new values), an energy ring and the phone.
 */
function TopBar({ alerts }: { alerts: number }) {
  const { view, cur } = useView();
  const here = hereOf(view);
  const d = view.market.date;
  const short = t('Y{y} M{m}', { y: d.year, m: d.month });
  const energy = Math.max(0, Math.min(100, Math.round(view.me.energy)));
  // Builder A adds a mood (0–100); until then the ring shows energy alone.
  const mood = (view.me as { mood?: number }).mood;
  const tone = view.me.burnout || energy < 25 ? 'bad' : energy < 40 ? 'warn' : 'good';
  const cash = view.accounts.local?.balance ?? 0;
  const hoursLeft = view.me.hours.left;
  return (
    <header className="topbar">
      <div className="brand" title={d.label}>
        <img src="/icon.svg" alt="" width={22} height={22} />
        <span className="brand-city">{here.name}</span>
        {isAbroad(view) && (
          <span className="sr-only">{t('from {city}', { city: view.market.name })}</span>
        )}
        <span className="topbar-date" aria-label={d.label}>
          {short}
        </span>
      </div>
      <div className="topbar-meta">
        <span className="topbar-cash" aria-label={t('Cash in your pocket')}>
          <CountUp value={cash} format={(n) => money(n, cur)} />
        </span>
        <span
          className={`topbar-hours${hoursLeft < 20 ? ' is-low' : ''}`}
          aria-label={t('{n} hours left this month', { n: hoursLeft })}
        >
          {t('{n}h', { n: hoursLeft })}
        </span>
        <span
          className={`ring ring-${tone}`}
          role="meter"
          aria-label={mood !== undefined ? t('Energy and mood') : t('Energy')}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={energy}
          style={{ ['--v' as string]: energy }}
          title={
            mood !== undefined
              ? t('Energy {e} · mood {m}', { e: energy, m: Math.round(mood) })
              : t('Energy {e}', { e: energy })
          }
        >
          <span className="ring-num">{energy}</span>
        </span>
        <button
          type="button"
          className="topbar-phone"
          aria-label={alerts ? t('Phone, {n} new', { n: alerts }) : t('Phone')}
          onClick={() => void phoneReady.then(() => openPhone({ app: 'home' }))}
        >
          <Icon name="phone" size={20} />
          {alerts > 0 && <span className="badge">{alerts > 99 ? '99+' : alerts}</span>}
        </button>
      </div>
    </header>
  );
}

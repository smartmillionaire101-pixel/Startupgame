import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { useGame, useView } from './store';
import { Icon, initReduceMotion, Sheet, Toasts, type IconName } from './ui';
import { t } from './i18n';
import { SignIn } from './screens/SignIn';
import { shouldShowLanding } from './landing/seen';
import { Onboarding, type JoinRole } from './screens/Onboarding';
import { Home } from './screens/Home';
import { CompanyScreen, openCompanyTab } from './screens/Company';
import { MoneyScreen } from './screens/Money';
import { DealFlow, Portfolio } from './screens/Investor';
import { MeScreen, askMeTab } from './screens/Me';
import { BankScreen } from './screens/Bank';
import { CityScreen } from './city/CityScreen';
import { preloadCityMap } from './city/CityMap';
import { onVisit, visitPlace } from './city/goto';
import { DealCard } from './screens/common';
import { NavContext, openPhone, type Nav } from './phone/bus';
import { inboxTarget, type TabId, type Target } from './phone/navigate';
import { UpdateBanner } from './update';
import { FeedbackHost, setFeedbackScreen } from './feedback';
import { Hud } from './Hud';
import { ScreenBoundary } from './ScreenBoundary';
import { useVisits } from './useVisits';
import { hereOf } from './city/travel';
import { openRecap, RecapHost } from './recap/Recap';
import { TutorialHost } from './tutorial/Coach';
import { requestDecision } from './screens/Decisions';
import { LifeEventHost } from './LifeEventHost';
import {
  applySavedSettings,
  joinedAtOf,
  setSimpleDefault,
  setSimpleRole,
  useSimple,
} from './phone/settings';

// Reduced motion is decided once, before anything animates (Wave 7 §D), and
// a saved Simple mode choice is on <html> before the first paint.
initReduceMotion();
applySavedSettings();

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
// The phone is opened from the HUD's phone button: wait until its dock is mounted (and so
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
const Landing = lazy(() => import('./landing/Landing'));
const NewsScreen = lazy(() => import('./screens/News').then((m) => ({ default: m.NewsScreen })));

// The city map's code and map file start loading with the game, not after it:
// the city you were last in is remembered, so they load alongside sign-in.
const MARKET_KEY = 'runway.market';
try {
  const m = typeof localStorage === 'undefined' ? null : localStorage.getItem(MARKET_KEY);
  if (m) preloadCityMap(m);
} catch {
  /* storage blocked */
}

const LivingHost = lazy(() => import('./experiences/LivingHost'));
const SkyHost = lazy(() => import('./experiences/SkyHost'));
const AirHost = lazy(() => import('./experiences/air/AirHost'));
const PlayHost = lazy(() => import('./experiences/PlayHost'));
const GolfInviteHost = lazy(() => import('./city/golf/GolfInviteHost'));
const MallInviteHost = lazy(() => import('./city/mall/MallInviteHost'));

type Entry = 'landing' | 'signup' | 'login';
/** The sign-up screen this history entry is on (set by goEntry below). */
const historyEntry = () =>
  (typeof window === 'undefined' ? null : window.history.state) as {
    runwayEntry?: Entry;
    runwayRole?: JoinRole;
  } | null;

export function App() {
  useVisits();
  const { status, view } = useGame();
  // Signed out: the landing page first (once), then sign-up or log in.
  // (A change of language redraws the app: it stays on the screen in history.)
  const [entry, setEntry] = useState<Entry>(
    () => historyEntry()?.runwayEntry ?? (shouldShowLanding() ? 'landing' : 'signup'),
  );
  // A role card on the landing page opens sign-up with that role chosen.
  const [joinAs, setJoinAs] = useState<JoinRole | undefined>(() => historyEntry()?.runwayRole);
  // Each step past the landing page is a history entry: Back (the browser's,
  // or sign-up's own) comes back to the landing page.
  const goEntry = (to: Entry, role?: JoinRole) => {
    window.history.pushState({ runwayEntry: to, runwayRole: role }, '');
    setEntry(to);
    setJoinAs(role);
  };
  useEffect(() => {
    if (!shouldShowLanding()) return;
    const onPop = (e: PopStateEvent) => {
      const st = e.state as { runwayEntry?: Entry; runwayRole?: JoinRole } | null;
      setEntry(st?.runwayEntry ?? 'landing');
      setJoinAs(st?.runwayRole);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  const here = view ? hereOf(view).id : null;
  useEffect(() => {
    if (!here) return;
    preloadCityMap(here);
    try {
      localStorage.setItem(MARKET_KEY, here);
    } catch {
      /* storage blocked */
    }
  }, [here]);
  return (
    <>
      {status === 'loading' && (
        <div className="app loading-screen" role="status">
          <img src="/icon.svg" alt="" width={56} height={56} />
          <span className="spinner" aria-hidden="true" />
          <p className="muted">{t('Loading Runway…')}</p>
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
      {status === 'signedOut' &&
        (entry === 'landing' ? (
          <Suspense fallback={null}>
            <Landing onPlay={(role) => goEntry('signup', role)} onLogIn={() => goEntry('login')} />
          </Suspense>
        ) : (
          <SignIn
            key={`${entry}-${joinAs ?? ''}`}
            startLogin={entry === 'login'}
            joinAs={joinAs}
            onBack={shouldShowLanding() ? () => window.history.back() : undefined}
          />
        ))}
      {status === 'onboarding' && <Onboarding />}
      {status === 'ready' && (
        <>
          <Game />
          <Suspense fallback={null}>
            <PlayHost />
            <GolfInviteHost />
            <MallInviteHost />
            <LivingHost />
            <SkyHost />
            <AirHost />
          </Suspense>
        </>
      )}
      <Toasts />
      <UpdateBanner />
      <FeedbackHost />
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
 * The bottom tabs: four, in a floating pill (only the active one says its
 * name). "Today" is the inbox dashboard (its id stays 'home' for
 * notifications); News lives behind Today and the phone rather than in a tab
 * of its own.
 *
 * City, Today, one tab for what you run (your company, your investments or
 * your bank) and Me. Money (founders) has no tab: the money pill at the top
 * opens it, and Company links there; Deal offers (investors) is one big link
 * away on Portfolio. Their "your turn" badge moves onto that tab. Simple mode
 * (Phase 2) has the same four, with plainer names.
 */
function tabsOf(
  role: 'banker' | 'founder' | 'investor',
  b: { unread: number; myTurn: number; bankRequests: number },
  simple = false,
): TabDef[] {
  const city: TabDef = { id: 'city', label: t('City'), icon: 'city' };
  const today: TabDef = { id: 'home', label: t('Today'), icon: 'today', badge: b.unread };
  const me: TabDef = { id: 'me', label: t('Me'), icon: 'me' };
  if (role === 'banker')
    return [
      city,
      today,
      {
        id: 'bank',
        label: simple ? t('My bank') : t('Bank'),
        icon: 'bank',
        badge: b.bankRequests,
      },
      me,
    ];
  return [
    city,
    today,
    role === 'founder'
      ? { id: 'company', label: t('Company'), icon: 'company', badge: b.myTurn }
      : {
          id: 'portfolio',
          label: simple ? t('My investments') : t('Portfolio'),
          icon: 'portfolio',
          badge: b.myTurn,
        },
    me,
  ];
}

/**
 * Screens you reach without a tab of their own: News (from Today or a
 * notification), Money (the money pill, Company) and Deal offers (Portfolio);
 * notifications still land on them.
 */
const EXTRA: TabId[] = ['news'];
/** Where Back goes from a screen without a tab. */
const PARENT: Partial<Record<TabId, TabId>> = {
  money: 'company',
  deals: 'portfolio',
  news: 'home',
};
const extraOf = (role: 'banker' | 'founder' | 'investor'): TabId[] =>
  role === 'banker' ? EXTRA : [...EXTRA, role === 'founder' ? 'money' : 'deals'];

function Game() {
  const { view, send, lite } = useView();
  const founder = view.me.role === 'founder' || view.companies.some((c) => c.status === 'active');
  const [tab, setTab] = useState<TabId>('city');
  const [focusDeal, setFocusDeal] = useState<string | null>(null);
  const unread = view.inbox.filter((i) => !i.read).length;
  const myTurn = view.deals.filter((d) => d.yourTurn).length;
  const bankRequests = view.deals.filter(
    (d) => d.yourTurn && d.counterparty.kind === 'playerbank',
  ).length;
  const banker = view.me.role === 'banker';
  const simple = useSimple();
  // Simple mode's default follows when this player joined (before the first paint).
  const joinedAt = joinedAtOf(view.me as { joinedAt?: number | null });
  const role = banker ? 'banker' : founder ? 'founder' : 'investor';
  useLayoutEffect(() => {
    setSimpleRole(role);
    setSimpleDefault(joinedAt);
  }, [joinedAt, role]);
  const tabs = tabsOf(role, { unread, myTurn, bankRequests }, simple);
  // Your company's screen opens from the office (and notifications) even when
  // it has no tab of its own (a banker who also founded a company).
  const hasCompany = view.companies.some((c) => c.status === 'active');
  const current =
    tabs.some((x) => x.id === tab) ||
    extraOf(role).includes(tab) ||
    (tab === 'company' && hasCompany)
      ? tab
      : 'city';
  useEffect(() => setFeedbackScreen(current), [current]);
  const go = (id: TabId) => {
    setTab(id);
    window.scrollTo({ top: 0 });
  };
  // Where notifications take you (phone Alerts and the Today inbox).
  const goTarget = useCallback((target: Target) => {
    switch (target.kind) {
      case 'place':
        visitPlace(target.place);
        return;
      case 'phone': {
        const open = target.open;
        void phoneReady.then(() => openPhone(open));
        return;
      }
      case 'recap':
        openRecap(target.month ?? null);
        return;
      case 'decision':
        requestDecision(target.id ?? null);
        setTab('home');
        window.scrollTo({ top: 0 });
        return;
      case 'tab':
        if (target.section) openCompanyTab(target.section);
        setTab(target.tab);
        window.scrollTo({ top: 0 });
        setFocusDeal(target.dealId ?? null);
    }
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
        const target = inboxTarget(item, viewRef.current);
        if (target) goTarget(target);
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

  // Panels (sheets) open above the bottom nav, never over it, so the tabs keep
  // working while one is open: tapping a tab leaves the screen and closes it.
  // `--nav-h` is the room the floating nav takes at the bottom (its height and
  // the gap under it); on a wide screen it is a pill down the left: 0.
  const navRef = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const root = document.documentElement;
    const set = () => {
      const bottom = parseFloat(getComputedStyle(nav).bottom) || 0;
      root.style.setProperty(
        '--nav-h',
        `${nav.offsetWidth > nav.offsetHeight ? Math.round(nav.offsetHeight + bottom) : 0}px`,
      );
    };
    set();
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(set);
    ro?.observe(nav);
    window.addEventListener('resize', set);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', set);
      root.style.removeProperty('--nav-h');
    };
  }, []);
  // The City's map is a 3D screen (pills over it); Lite mode's places list is a list.
  const scene = current === 'city' && !lite;

  return (
    <NavContext.Provider value={nav}>
      <div
        className={`app app-game${current === 'city' ? ' app-city' : ''}${scene ? ' app-scene' : ''}`}
      >
        <Hud
          scene={scene}
          screen={current}
          alerts={unread}
          onDecisions={() => goTarget({ kind: 'decision' })}
          onInbox={() => go('home')}
          onCompany={hasCompany ? () => go('company') : undefined}
          onAllMoney={() => {
            askMeTab('money');
            go('me');
          }}
          onCompanyMoney={extraOf(role).includes('money') ? () => go('money') : undefined}
          onPhone={() => void phoneReady.then(() => openPhone({ app: 'home' }))}
        />
        <main>
          {/* A screen without a tab has Back, top-left, to where it came from
              (News only in Simple mode: Today's tab is lit meanwhile). */}
          {PARENT[current] && (simple || current !== 'news') && (
            <button type="button" className="back-btn" onClick={() => go(PARENT[current]!)}>
              <Icon name="chevron" size={18} className="back-btn-ico" />
              {t('Back')}
            </button>
          )}
          <ScreenBoundary resetKey={current} name={current}>
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
          </ScreenBoundary>
        </main>
      </div>
      <nav className="nav" ref={navRef} aria-label={t('Main')} data-tabs={tabs.length}>
        <div className="nav-inner" style={{ '--nav-cols': tabs.length } as CSSProperties}>
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
      <RecapHost />
      {/* Phase 5: a life event's card pops up when nothing else is open. */}
      <LifeEventHost />
      <TutorialHost />
      {dealOpen && (
        <Sheet title={t('Deal card')} onClose={() => setFocusDeal(null)}>
          <DealCard deal={dealOpen} />
        </Sheet>
      )}
    </NavContext.Provider>
  );
}

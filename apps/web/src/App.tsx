import { useState } from 'react';
import { useGame, useView } from './store';
import { Pill, Toasts } from './ui';
import { stars } from './format';
import { SignIn } from './screens/SignIn';
import { Onboarding } from './screens/Onboarding';
import { Home } from './screens/Home';
import { CompanyScreen } from './screens/Company';
import { MoneyScreen } from './screens/Money';
import { DealFlow, Portfolio } from './screens/Investor';
import { NewsScreen } from './screens/News';
import { MeScreen } from './screens/Me';

export function App() {
  const { status } = useGame();
  return (
    <>
      {status === 'loading' && (
        <div className="app">
          <p className="muted" style={{ paddingTop: '3rem' }}>
            Loading Runway…
          </p>
        </div>
      )}
      {status === 'offline' && (
        <div className="app">
          <p style={{ paddingTop: '3rem' }}>
            Can’t reach the server. Your daily digest is available offline once you’ve opened it.
          </p>
        </div>
      )}
      {status === 'signedOut' && <SignIn />}
      {status === 'onboarding' && <Onboarding />}
      {status === 'ready' && <Game />}
      <Toasts />
    </>
  );
}

type TabId = 'home' | 'company' | 'money' | 'deals' | 'portfolio' | 'news' | 'me';

function Game() {
  const { view } = useView();
  const founder = view.me.role === 'founder' || view.companies.some((c) => c.status === 'active');
  const [tab, setTab] = useState<TabId>('home');
  const unread = view.inbox.filter((i) => !i.read).length;
  const myTurn = view.deals.filter((d) => d.yourTurn).length;
  const stories = view.media.filter((m) => m.status === 'invited' || m.status === 'preview').length;
  const tabs: { id: TabId; label: string; icon: string; badge?: number }[] = founder
    ? [
        { id: 'home', label: 'Home', icon: '⌂', badge: unread },
        { id: 'company', label: 'Company', icon: '◧' },
        { id: 'money', label: 'Money', icon: '◎', badge: myTurn },
        { id: 'news', label: 'News', icon: '▤', badge: stories },
        { id: 'me', label: 'Me', icon: '◉' },
      ]
    : [
        { id: 'home', label: 'Home', icon: '⌂', badge: unread },
        { id: 'deals', label: 'Deal flow', icon: '◎', badge: myTurn },
        { id: 'portfolio', label: 'Portfolio', icon: '◧' },
        { id: 'news', label: 'News', icon: '▤', badge: stories },
        { id: 'me', label: 'Me', icon: '◉' },
      ];
  const current = tabs.some((t) => t.id === tab) ? tab : 'home';

  return (
    <>
      <div className="app">
        <header className="topbar">
          <div className="brand">
            <img src="/icon.svg" alt="" width={22} height={22} /> {view.market.name}
            <span className="small muted">{view.market.date.label}</span>
          </div>
          <div className="topbar-meta">
            <Pill tone={view.me.hours.left < 20 ? 'warn' : undefined}>{view.me.hours.left}h</Pill>
            <Pill tone={view.me.burnout ? 'bad' : view.me.energy < 40 ? 'warn' : undefined}>
              ⚡{view.me.energy}
            </Pill>
            <Pill>{stars(view.me.stars)}</Pill>
          </div>
        </header>
        <main>
          {current === 'home' && <Home />}
          {current === 'company' && <CompanyScreen />}
          {current === 'money' && <MoneyScreen />}
          {current === 'deals' && <DealFlow />}
          {current === 'portfolio' && <Portfolio />}
          {current === 'news' && <NewsScreen />}
          {current === 'me' && <MeScreen />}
        </main>
      </div>
      <nav className="nav" aria-label="Main">
        <div className="nav-inner">
          {tabs.map((t) => (
            <button
              key={t.id}
              aria-current={current === t.id ? 'page' : undefined}
              onClick={() => {
                setTab(t.id);
                window.scrollTo({ top: 0 });
              }}
            >
              <span className="ico" aria-hidden>
                {t.icon}
              </span>
              {t.label}
              {!!t.badge && <span className="badge">{t.badge}</span>}
            </button>
          ))}
        </div>
      </nav>
    </>
  );
}

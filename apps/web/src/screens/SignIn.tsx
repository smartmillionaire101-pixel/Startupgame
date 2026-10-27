import { useState } from 'react';
import { LANGS, setLang, t, tx, useLang } from '../i18n';
import { useGame } from '../store';
import { Button } from '../ui';
import { CitySkyline } from '../signup/cityArt';
import { EmailLinkForm } from './Account';
import { Onboarding, type JoinRole } from './Onboarding';

/** Sign-up in three steps, or an email link to an existing game. */
export function SignIn({
  startLogin = false,
  joinAs,
  onBack,
}: {
  startLogin?: boolean;
  /** The role picked on the landing page (sign-up skips the path step). */
  joinAs?: JoinRole;
  /** Back to the landing page (when there is one). */
  onBack?: () => void;
}) {
  const [login, setLogin] = useState(startLogin);
  if (!login) return <Onboarding joinAs={joinAs} onBack={onBack} onLogIn={() => setLogin(true)} />;
  return <LogIn onBack={onBack} onSignUp={() => setLogin(false)} />;
}

/** Log in with an email link. */
function LogIn({ onBack, onSignUp }: { onBack?: () => void; onSignUp: () => void }) {
  const { meta } = useGame();
  const lang = useLang();
  return (
    <div className="app app-narrow">
      <div className="spread">
        {onBack ? (
          <button type="button" className="back-link" data-signin-back="" onClick={onBack}>
            ‹ {t('Back')}
          </button>
        ) : (
          <span />
        )}
        <div
          className="chips"
          role="group"
          aria-label={t('Language')}
          style={{ justifyContent: 'flex-end' }}
        >
          {LANGS.map((l) => (
            <button
              key={l.id}
              type="button"
              className="chip"
              aria-pressed={lang === l.id}
              lang={l.id}
              onClick={() => setLang(l.id)}
            >
              {l.label}
            </button>
          ))}
        </div>
      </div>
      <div className="hero title-hero">
        <CitySkyline city="lagos" className="title-skyline" />
        <div className="brand">
          <img src="/icon.svg" alt="" width={32} height={32} /> Runway
        </div>
        <h1>{t('Build, invest and grow.')}</h1>
        <p>{t('Real startup lessons. No real-world losses.')}</p>
      </div>
      <section className="card">
        <h2>{t('Log in')}</h2>
        <EmailLinkForm intent="login" submitLabel={t('Email me a sign-in link')} />
        <Button type="button" variant="ghost" onClick={onSignUp}>
          {t('Back')}
        </Button>
      </section>
      <p className="disclaimer">
        {meta?.disclaimer
          ? tx(meta.disclaimer)
          : t('This is a game. Nothing here is financial, legal, or tax advice.')}
      </p>
    </div>
  );
}

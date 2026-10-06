import { useState } from 'react';
import { LANGS, setLang, t, tx, useLang } from '../i18n';
import { useGame } from '../store';
import { Button } from '../ui';
import { EmailLinkForm } from './Account';
import { Onboarding } from './Onboarding';

/** Quick registration or an email link to an existing game. */
export function SignIn() {
  const { meta } = useGame();
  const lang = useLang();
  const [login, setLogin] = useState(false);

  return (
    <div className="app">
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
      <div className="hero">
        <div className="brand" style={{ fontSize: '1.1rem' }}>
          <img src="/icon.svg" alt="" width={28} height={28} /> Runway
        </div>
        <h1 style={{ marginTop: '1rem' }}>{t('Build, invest and grow.')}</h1>
        <p className="muted">{t('Real startup lessons. No real-world losses.')}</p>
      </div>
      {!login && <Onboarding embedded />}
      <section className="card">
        {login ? (
          <>
            <h2>{t('Log in')}</h2>
            <EmailLinkForm intent="login" submitLabel={t('Email me a sign-in link')} />
            <Button type="button" variant="ghost" onClick={() => setLogin(false)}>
              {t('Back')}
            </Button>
          </>
        ) : (
          <Button
            type="button"
            variant="ghost"
            className="btn btn-ghost btn-block"
            onClick={() => setLogin(true)}
          >
            {t('Already saved? Log in')}
          </Button>
        )}
      </section>
      <p className="disclaimer">
        {meta?.disclaimer
          ? tx(meta.disclaimer)
          : t('This is a game. Nothing here is financial, legal, or tax advice.')}
      </p>
    </div>
  );
}

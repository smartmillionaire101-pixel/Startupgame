import { useState, type FormEvent } from 'react';
import { api } from '../api';
import { LANGS, setLang, t, tx, useLang } from '../i18n';
import { useGame } from '../store';
import { Button } from '../ui';
import { EmailLinkForm } from './Account';

/**
 * Entry (§3 step 1): play straight away after confirming 18+ (no date of
 * birth, no email), or log back in to a saved game with an email link.
 */
export function SignIn() {
  const { refresh, toast, meta } = useGame();
  const lang = useLang();
  const [adult, setAdult] = useState(false);
  const [loading, setLoading] = useState(false);
  const [login, setLogin] = useState(false);

  const play = async (e: FormEvent) => {
    e.preventDefault();
    if (!adult) return toast(t('Confirm you are 18 or older to play.'), 'error');
    setLoading(true);
    try {
      await api.guest();
      await refresh();
    } catch (err) {
      toast(tx((err as Error).message), 'error');
    } finally {
      setLoading(false);
    }
  };

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
      <section className="card">
        <form onSubmit={play} className="stack">
          <label className="check">
            <input
              type="checkbox"
              checked={adult}
              onChange={(e) => setAdult(e.target.checked)}
              required
            />
            <span>{t('I confirm I’m 18 or older')}</span>
          </label>
          <Button
            type="submit"
            className="btn btn-primary btn-block btn-big"
            loading={loading}
            disabled={!adult}
          >
            {t('Play now')}
          </Button>
          <p className="small muted">
            {t('No sign-up needed. You can save your progress with an email later.')}
          </p>
        </form>
      </section>
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

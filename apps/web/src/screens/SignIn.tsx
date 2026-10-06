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
    <div className="app app-narrow">
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
      <div className="hero title-hero">
        <TitleSkyline />
        <div className="brand">
          <img src="/icon.svg" alt="" width={32} height={32} /> Runway
        </div>
        <h1>{t('Build, invest and grow.')}</h1>
        <p>{t('Real startup lessons. No real-world losses.')}</p>
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

/** The title screen's skyline: a few towers, lit windows and a sun, in flat shapes. */
function TitleSkyline() {
  const towers: [number, number, number, string][] = [
    [8, 70, 34, '#134e4a'],
    [46, 46, 40, '#1e3a8a'],
    [90, 88, 30, '#0f766e'],
    [124, 58, 44, '#312e81'],
    [172, 30, 36, '#155e75'],
    [212, 74, 30, '#1e1b4b'],
    [246, 52, 42, '#0f766e'],
    [292, 84, 34, '#1e3a8a'],
    [330, 64, 40, '#134e4a'],
  ];
  return (
    <svg
      className="title-skyline"
      viewBox="0 0 380 140"
      preserveAspectRatio="xMidYMax slice"
      aria-hidden="true"
    >
      <circle cx="318" cy="34" r="16" fill="#fde68a" opacity="0.9" />
      {towers.map(([x, top, w, fill]) => (
        <g key={x}>
          <rect x={x} y={top} width={w} height={140 - top} rx="3" fill={fill} />
          {Array.from({ length: Math.floor((132 - top) / 14) }, (_, r) =>
            Array.from({ length: Math.floor((w - 6) / 10) }, (_, c) => (
              <rect
                key={`${r}-${c}`}
                x={x + 5 + c * 10}
                y={top + 8 + r * 14}
                width="5"
                height="6"
                rx="1"
                fill="#fde68a"
                opacity={(x + r * 7 + c * 13) % 5 === 0 ? 0.95 : 0.22}
              />
            )),
          )}
        </g>
      ))}
    </svg>
  );
}

/**
 * Settings: Reduce motion, Always skip rides, Sound (cosmetic) and Language.
 */
import { LANGS, setLang, t, useLang } from '../../i18n';
import { setSetting, useSetting, type SettingKey } from '../settings';
import { H, type PhoneCtx } from '../shared';

function Toggle({ k, label, hint }: { k: SettingKey; label: string; hint: string }) {
  const on = useSetting(k);
  return (
    <label className="phone-toggle" data-setting={k}>
      <span className="phone-row-main">
        <span className="item-title">{label}</span>
        <span className="small muted">{hint}</span>
      </span>
      <input
        type="checkbox"
        role="switch"
        checked={on}
        aria-label={label}
        onChange={(e) => setSetting(k, e.target.checked)}
      />
      <span className="phone-switch" aria-hidden="true" />
    </label>
  );
}

export function Settings(_: { ctx: PhoneCtx }) {
  const lang = useLang();
  return (
    <div className="phone-stack">
      <section className="phone-card">
        <Toggle
          k="reduceMotion"
          label={t('Reduce motion')}
          hint={t('Cuts instead of slides, no parallax.')}
        />
        <Toggle
          k="skipRides"
          label={t('Always skip rides')}
          hint={t('Arrive straight away, without the ride scene.')}
        />
        <Toggle k="sound" label={t('Sound')} hint={t('Game sounds, when there are some.')} />
      </section>
      <section className="phone-card">
        <H>{t('Language')}</H>
        <div className="chips" role="radiogroup" aria-label={t('Language')}>
          {LANGS.map((l) => (
            <button
              key={l.id}
              className="chip"
              role="radio"
              aria-checked={lang === l.id}
              onClick={() => setLang(l.id)}
            >
              {l.label}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

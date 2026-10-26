/**
 * Settings: Simple mode (Phase 2), Reduce motion, Always skip rides, Music,
 * Language, and Feedback to the Runway team.
 */
import { LANGS, setLang, t, tx, useLang } from '../../i18n';
import { openFeedback } from '../../feedback';
import { useView } from '../../store';
import { LifestyleButton } from '../../screens/Lifestyle';
import { setSetting, useSetting, useSimpleAvailable, type SettingKey } from '../settings';
import { setMapQuality, useMapQuality } from '../../city/three/quality';
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

/** Wave 9: the city map in 3D, or the Lite 2D map. */
function MapQuality() {
  const q = useMapQuality();
  return (
    <section className="phone-card" data-setting="mapQuality">
      <H>{t('Map quality')}</H>
      <p className="small muted">{t('3D draws the real city; Lite is lighter on older phones.')}</p>
      <div className="chips" role="radiogroup" aria-label={t('Map quality')}>
        {(
          [
            ['3d', t('3D')],
            ['lite', t('Lite')],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            className="chip"
            role="radio"
            aria-checked={q === id}
            onClick={() => setMapQuality(id)}
          >
            {label}
          </button>
        ))}
      </div>
    </section>
  );
}

export function Settings({ ctx }: { ctx: PhoneCtx }) {
  const lang = useLang();
  const { view } = useView();
  // Simple mode is for founders; investors and bankers always play the full game.
  const simpleAvailable = useSimpleAvailable();
  return (
    <div className="phone-stack">
      <section className="phone-card">
        <div className="spread">
          <span>
            <b>{t('Lifestyle')}</b>{' '}
            <span className="small muted">{tx(String(view.me.lifestyle.name ?? ''))}</span>
          </span>
          <LifestyleButton size="sm" />
        </div>
      </section>
      {simpleAvailable && (
        <section className="phone-card">
          <Toggle
            k="simple"
            label={t('Simple mode')}
            hint={t('Bigger text, words on every button, four tabs and one clear next step.')}
          />
        </section>
      )}
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
        <Toggle k="sound" label={t('Music')} hint={t('Background game music.')} />
      </section>
      <MapQuality />
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
      <section className="phone-card">
        <div className="spread">
          <span>
            <b>{t('Feedback')}</b>{' '}
            <span className="small muted">{t('Tell the Runway team what you think.')}</span>
          </span>
          <button
            type="button"
            className="btn btn-sm"
            data-feedback-open=""
            onClick={() => {
              // The form opens over the game, so the phone steps aside.
              ctx.close();
              openFeedback();
            }}
          >
            {t('Send feedback')}
          </button>
        </div>
      </section>
    </div>
  );
}

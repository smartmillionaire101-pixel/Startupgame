/**
 * Wave 8 §B: around an act. Over the room: what's happening now and Skip
 * (always there, 48 px). In the tray: the result card, with what it cost,
 * what you gained, who you met and your new look.
 */
import { money } from '../../format';
import { t, tx } from '../../i18n';
import type { Met } from '../life';
import { STYLE_NAME, type HairStyle } from './look';

export function ActHud({
  title,
  ended,
  onSkip,
}: {
  title: string;
  ended: boolean;
  onSkip: () => void;
}) {
  return (
    <div className="act-hud" data-act-hud="">
      <p className="act-caption" aria-live="polite">
        <b>{title}</b>
        <span data-act-step="">{t('On your way…')}</span>
      </p>
      {!ended && (
        <button type="button" className="act-skip" onClick={onSkip}>
          {t('Skip')} <span aria-hidden="true">›</span>
        </button>
      )}
    </div>
  );
}

/** The engine's answer to `venue.buy` (the fields the card uses). */
export interface ActResult {
  price?: number;
  energy?: number;
  needs?: Record<string, number>;
  message?: string;
}

const NEED_LABEL: Record<string, string> = {
  hunger: 'hunger',
  hygiene: 'hygiene',
  fun: 'fun',
  social: 'social',
};

export function ActCard({
  title,
  icon,
  result,
  cur,
  met,
  saved,
  busy,
  look,
  onSave,
  onDone,
}: {
  title: string;
  icon: string;
  /** undefined: still waiting for the engine. */
  result: ActResult | undefined;
  cur: string;
  met: Met | null;
  saved: boolean;
  busy: boolean;
  /** A new hairstyle to show off. */
  look: HairStyle | null;
  onSave: () => void;
  onDone: () => void;
}) {
  const chips: { text: string; tone: string }[] = [];
  if (result) {
    if (result.price) chips.push({ text: `−${money(result.price, cur)}`, tone: 'money' });
    if (result.energy)
      chips.push({ text: t('{n} energy', { n: `+${result.energy}` }), tone: 'energy' });
    for (const [k, v] of Object.entries(result.needs ?? {}))
      if (v && NEED_LABEL[k])
        chips.push({
          text: t('{n} {need}', { n: v > 0 ? `+${v}` : `${v}`, need: t(NEED_LABEL[k]!) }),
          tone: k,
        });
  }
  return (
    <div className="act-result tray-result" role="status" data-act-result={result ? 'ok' : 'wait'}>
      <p className="act-result-head">
        <span aria-hidden="true">{icon}</span>
        <b>{title}</b>
      </p>
      {result ? (
        <ul className="act-chips" aria-label={t('What you got')}>
          {chips.map((c) => (
            <li key={c.text} className={`act-chip is-${c.tone}`}>
              {c.text}
            </li>
          ))}
          {!chips.length && <li className="act-chip">{t('Feeling good')}</li>}
        </ul>
      ) : (
        <p className="small muted">{t('Paying…')}</p>
      )}
      {look && (
        <p className="act-look" data-new-look={look}>
          {t('New look: {style}', { style: t(STYLE_NAME[look]) })}
        </p>
      )}
      {met && (
        <p className="tray-met" data-met={met.refId}>
          <span>
            {met.role
              ? t('You met {name}, {role}. Save the contact?', {
                  name: met.name,
                  role: tx(met.role),
                })
              : t('You met {name}. Save the contact?', { name: met.name })}
          </span>
          {saved ? (
            <b className="tray-saved">{t('Saved ✓')}</b>
          ) : (
            <button
              type="button"
              className="btn btn-subtle tray-save"
              disabled={busy}
              onClick={onSave}
            >
              {t('Save')}
            </button>
          )}
        </p>
      )}
      <button type="button" className="btn btn-primary act-done" onClick={onDone}>
        {t('Done')}
      </button>
    </div>
  );
}

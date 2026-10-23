/**
 * Shopping together, the friend's side: when a player in your city invites
 * you to the mall, a notice and the invitation card. Accept (`mall.answer`)
 * and you head to the mall, where they're waiting; Decline tells them. An
 * invitation lasts the city's month. Mounted once, for the whole game.
 */
import { useEffect, useState } from 'react';
import { t } from '../../i18n';
import { useView } from '../../store';
import { visitPlace } from '../goto';
import { mallOf, mallSpot } from '../leisure';
import '../golf/golf.css';

export default function MallInviteHost() {
  const { view, send, busy, quicken } = useView();
  const [seen, setSeen] = useState<string[]>([]);
  const invites = mallOf(view)?.invites ?? [];
  const open = invites.find((r) => !seen.includes(r.id)) ?? null;
  // An invitation on screen hears quickly if it's called off.
  useEffect(() => (invites.length ? quicken() : undefined), [invites.length, quicken]);
  if (!invites.length) return null;
  const dismiss = (id: string) => setSeen((s) => [...s, id]);
  if (!open)
    return (
      <button
        type="button"
        className="golf-notice golf-notice-small"
        data-mall-notice=""
        onClick={() => setSeen([])}
      >
        <span className="golf-notice-icon" aria-hidden="true">
          🛍️
        </span>
        <span>
          <b>{t('Shopping invite from {name}', { name: invites[0]!.from.name })}</b>
        </span>
      </button>
    );
  const mallName = mallSpot(open.market).name;
  return (
    <div className="golf-invite-backdrop">
      <section
        className="golf-invite-card"
        role="dialog"
        aria-modal="true"
        aria-label={t('Shopping invite')}
        data-mall-invite-card={open.id}
      >
        <div className="golf-invite-who">
          <span className="golf-mp-face big" aria-hidden="true">
            {open.from.name.slice(0, 1)}
          </span>
          <div>
            <span className="golf-kicker">{t('Shopping invite')}</span>
            <h3>{t('{name} invites you shopping', { name: open.from.name })}</h3>
            <p className="small muted">
              {t('{mall} · {city}', { mall: mallName, city: open.city })}
            </p>
          </div>
        </div>
        <p className="small">
          {t(
            'Walk round the shops together, maybe pick out a gift for each other. You’ll both feel happier and closer.',
          )}
        </p>
        <div className="golf-invite-actions">
          <button
            type="button"
            className="btn btn-subtle"
            data-action="mall-decline"
            disabled={busy}
            onClick={async () => {
              if (
                await send({ type: 'mall.answer', tripId: open.id, accept: false }, t('Declined.'))
              )
                dismiss(open.id);
            }}
          >
            {t('Decline')}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            data-action="mall-accept"
            disabled={busy}
            onClick={async () => {
              const r = await send({ type: 'mall.answer', tripId: open.id, accept: true });
              if (!r) return;
              dismiss(open.id);
              visitPlace('mall');
            }}
          >
            {t('Accept · go to the mall')}
          </button>
        </div>
        <button type="button" className="golf-later" onClick={() => dismiss(open.id)}>
          {t('Later')}
        </button>
      </section>
    </div>
  );
}

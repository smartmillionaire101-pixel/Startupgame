/**
 * Golf with a friend, the friend's side (mockup 3b): a notice when someone
 * in your city invites you to golf, and the invitation card with the stake,
 * the pot, your green fee and the rules. Accept pays your stake into the
 * same pot (`play.join`) and the match starts; you head to the club. Decline
 * (`play.decline`) gives the host their stake back, as does no answer in
 * 30 minutes (the engine's expiry). Mounted once, for the whole game.
 */
import { useEffect, useState, useSyncExternalStore } from 'react';
import { money } from '../../format';
import { t } from '../../i18n';
import { useView } from '../../store';
import { visitPlace } from '../goto';
import { golfOf } from '../leisure';
import { golfInviteShown, onGolfInvite, showGolfInvite } from './invite-bus';
import { pendingInvites } from './match';
import './golf.css';

const ROLE: Record<string, () => string> = {
  founder: () => t('Founder'),
  investor: () => t('Investor'),
  banker: () => t('Banker'),
};

export default function GolfInviteHost() {
  const { view, send, busy, quicken } = useView();
  const asked = useSyncExternalStore(onGolfInvite, golfInviteShown, () => null);
  const [seen, setSeen] = useState<string[]>([]);
  const invites = pendingInvites(view);
  const open =
    invites.find((r) => r.id === asked) ?? invites.find((r) => !seen.includes(r.id)) ?? null;
  const later = invites.filter((r) => r.id !== open?.id);
  // An invitation on screen hears quickly if the host calls it off.
  useEffect(() => (invites.length ? quicken() : undefined), [invites.length, quicken]);
  if (!invites.length) return null;
  const golf = golfOf(view, view.here?.id ?? view.market.id);
  const dismiss = (id: string) => {
    setSeen((s) => [...s, id]);
    if (asked === id) showGolfInvite(null);
  };
  if (!open)
    return (
      <button
        type="button"
        className="golf-notice golf-notice-small"
        data-golf-notice=""
        onClick={() => showGolfInvite(later[0]!.id)}
      >
        <span className="golf-notice-icon" aria-hidden="true">
          ⛳
        </span>
        <span>
          <b>
            {t('Golf invite from {name}', {
              name: later[0]!.golf.people[later[0]!.host]?.name ?? '',
            })}
          </b>
        </span>
      </button>
    );
  const G = open.golf;
  const host = G.people[open.host];
  const hostName = host?.name ?? '';
  const firstName = hostName.split(' ')[0] ?? hostName;
  const cur = open.currency;
  const pot = open.stake * 2;
  const par = G.pars.reduce((a, b) => a + b, 0);
  const hours = G.holes === 1 ? 1 : golf.hours;
  return (
    <div className="golf-invite-backdrop">
      <div className="golf-notice" role="status" data-golf-notice="">
        <span className="golf-notice-icon" aria-hidden="true">
          ⛳
        </span>
        <span>
          <b>{t('Golf invite from {name}', { name: hostName })}</b>
          <small>
            {open.stake
              ? t('now · {stake} each · {club}', { stake: money(open.stake, cur), club: golf.name })
              : t('now · a free round · {club}', { club: golf.name })}
          </small>
        </span>
      </div>
      <section
        className="golf-invite-card"
        role="dialog"
        aria-modal="true"
        aria-label={t('Golf challenge')}
        data-golf-invite-card={open.id}
      >
        <div className="golf-invite-who">
          <span className="golf-mp-face big" aria-hidden="true">
            {hostName.slice(0, 1)}
          </span>
          <div>
            <span className="golf-kicker">{t('Golf challenge')}</span>
            <h3>{t('{name} invites you', { name: hostName })}</h3>
            <p className="small muted">
              {[host?.role ? (ROLE[host.role]?.() ?? null) : null, host?.company]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
        </div>
        <div className="golf-invite-tiles">
          <div>
            <b>{G.holes === 1 ? t('1 hole') : t('{n} holes', { n: G.holes })}</b>
            <small>{t('Par {par} · ~{n} h', { par, n: hours })}</small>
          </div>
          <div>
            <b>{open.stake ? money(open.stake, cur) : t('Free')}</b>
            <small>{t('Your stake')}</small>
          </div>
          <div>
            <b>{money(G.fee, cur)}</b>
            <small>{t('Green fee (yours)')}</small>
          </div>
          <div className="pot">
            <b data-golf-pot={pot}>{money(pot, cur)}</b>
            <small>{t('Pot · winner takes it')}</small>
          </div>
        </div>
        <dl className="golf-invite-rules">
          <div>
            <dt>{t('{name}’s stake', { name: firstName })}</dt>
            <dd className="ok">✓ {t('in the pot')}</dd>
          </div>
          <div>
            <dt>{t('Your stake')}</dt>
            <dd>{t('paid when you accept')}</dd>
          </div>
          <div>
            <dt>{t('Tie')}</dt>
            <dd>{t('both stakes back')}</dd>
          </div>
          <div>
            <dt>{t('Shot clock')}</dt>
            <dd>{t('{n} s, then a soft shot is played', { n: Math.round(G.shotMs / 1000) })}</dd>
          </div>
          <div>
            <dt>{t('No answer in 30 min')}</dt>
            <dd>{t('{name} refunded', { name: firstName })}</dd>
          </div>
        </dl>
        <div className="golf-invite-actions">
          <button
            type="button"
            className="btn btn-subtle"
            data-action="golf-decline"
            disabled={busy}
            onClick={async () => {
              if (await send({ type: 'play.decline', roomId: open.id }, t('Declined.')))
                dismiss(open.id);
            }}
          >
            {t('Decline')}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            data-action="golf-accept"
            disabled={busy}
            onClick={async () => {
              const r = await send({ type: 'play.join', roomId: open.id });
              if (!r) return;
              dismiss(open.id);
              visitPlace('golf');
            }}
          >
            {open.stake
              ? t('Accept · pay {stake}', { stake: money(open.stake, cur) })
              : t('Accept')}
          </button>
        </div>
        <button type="button" className="golf-later" onClick={() => dismiss(open.id)}>
          {t('Later')}
        </button>
        <p className="small muted golf-invite-foot">
          {t('You’ll go to {club} and tee off together. In-game money only.', {
            club: golf.name,
          })}
        </p>
      </section>
    </div>
  );
}

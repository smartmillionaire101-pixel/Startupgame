/**
 * Shopping together (player feedback: "you can invite someone and take them
 * shopping"): pick a player in your city (they get an invitation to accept)
 * or an AI friend (they say yes at once, as at golf) and send `mall.invite`.
 * While you're there together they walk with you and you can buy them
 * something (`mall.gift`, from any shop's card or list).
 *
 * `personLook` draws whoever you're with: a player's chosen look, an AI
 * friend dressed by their background (in what you bought them).
 */
import { useState } from 'react';
import { t } from '../../i18n';
import { useView } from '../../store';
import { useOnlinePlayers } from '../OnlineNow';
import { avatarLook, drawnGender, lookFromAppearance, type AvatarLook } from '../art';
import type { MallPerson, MallView } from '../leisure';
import '../golf/golf.css';

/** How someone you shop with looks. */
export function personLook(p: MallPerson): AvatarLook {
  const g = drawnGender(p.backgroundId, p.id, p.gender);
  const base = avatarLook(p.backgroundId, p.id, g);
  const a = p.appearance;
  if (!a || !p.styled) return base;
  // A player's own look; an AI friend as they always are, in what they were bought.
  if (!p.ai) return lookFromAppearance(a, g, base.bottom);
  return {
    ...base,
    topStyle: a.topStyle,
    top: a.topColor,
    headwear: a.headwear,
    glasses: a.glasses,
  };
}

interface Pick {
  id: string;
  name: string;
  sub: string;
  ai: boolean;
}

export function MallInviteSheet({
  mall,
  onClose,
  onInvited,
}: {
  mall: MallView;
  onClose: () => void;
  onInvited: (status: string) => void;
}) {
  const { view, send, busy } = useView();
  const here = view.here?.id ?? view.market.id;
  const city = view.here?.name ?? view.market.name;
  const [tab, setTab] = useState<'here' | 'contacts'>('here');
  const [picked, setPicked] = useState<string | null>(null);
  const { players } = useOnlinePlayers(true);

  const humans: Pick[] = (players ?? [])
    .filter((p) => p.market === here && p.id !== view.me.id)
    .map((p) => ({
      id: p.id,
      name: p.name,
      sub: [t('Player'), t('online'), p.placeName ? t('at {place}', { place: p.placeName }) : null]
        .filter(Boolean)
        .join(' · '),
      ai: false,
    }));
  const ai: Pick[] = (mall.friends ?? []).map((f) => ({
    id: f.id,
    name: f.name,
    sub: f.company
      ? t('AI friend · {company} · free now', { company: f.company })
      : t('AI friend · free now'),
    ai: true,
  }));
  const contacts: Pick[] = view.me.contacts
    .filter((c) => c.kind === 'player')
    .map((c) => {
      const on = players?.find((p) => p.id === c.refId);
      return {
        id: c.refId,
        name: c.name,
        sub: on
          ? on.market === here
            ? t('Player · online · in {city}', { city })
            : t('Player · in {city} · travel first', { city: on.city })
          : t('Player · offline'),
        ai: false,
      };
    });
  const list = tab === 'here' ? [...humans, ...ai] : contacts;
  const who = [...humans, ...ai, ...contacts].find((p) => p.id === picked) ?? null;
  const name = who?.name.split(' ')[0] ?? '';

  const invite = async () => {
    if (!who) return;
    const r = await send<{ status?: string }>({ type: 'mall.invite', playerId: who.id });
    if (r) onInvited(r.status ?? 'invited');
  };

  return (
    <div
      className="golf-invite mall-invite"
      role="dialog"
      aria-label={t('Shop with a friend')}
      data-mall-invite=""
    >
      <div className="golf-invite-head">
        <h3>🛍️ {t('Shop with a friend')}</h3>
        <button type="button" className="icon-btn" aria-label={t('Close')} onClick={onClose}>
          ✕
        </button>
      </div>
      <p className="small muted">
        {t(
          'Take someone in {city} shopping: they walk round the mall with you, you can buy them a gift, and you both come away happier and closer.',
          { city },
        )}
      </p>
      <div className="golf-tabs" role="tablist">
        {(
          [
            ['here', t('In {city} now', { city })],
            ['contacts', t('Contacts')],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            className="golf-tab"
            onClick={() => setTab(k)}
          >
            {label}
          </button>
        ))}
      </div>
      <ul className="golf-people" aria-label={t('Who to take shopping')}>
        {list.length === 0 && (
          <li className="small muted golf-people-empty">
            {tab === 'contacts'
              ? t('No players in your contacts yet.')
              : t('Nobody free here right now.')}
          </li>
        )}
        {list.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              className="golf-person"
              aria-pressed={picked === p.id}
              data-mall-friend={p.id}
              data-mall-ai={p.ai ? '1' : '0'}
              onClick={() => setPicked(p.id)}
            >
              <span className={`golf-mp-face${p.ai ? ' ai' : ''}`} aria-hidden="true">
                {p.name.slice(0, 1)}
              </span>
              <span className="golf-person-text">
                <b>{p.name}</b>
                <small>{p.sub}</small>
              </span>
              <span className="golf-check" aria-hidden="true">
                {picked === p.id ? '✓' : ''}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="btn btn-primary golf-invite-send"
        data-action="mall-invite-send"
        disabled={busy || !who}
        onClick={() => void invite()}
      >
        {who ? t('Invite {name} shopping', { name }) : t('Pick who to take shopping')}
      </button>
      <div className="golf-ai-note">
        <span aria-hidden="true">🤖</span>
        <p className="small">
          <b>{t('No one free?')}</b>{' '}
          {t('An AI friend comes along at once. A player gets an invitation to accept.')}
        </p>
      </div>
    </div>
  );
}

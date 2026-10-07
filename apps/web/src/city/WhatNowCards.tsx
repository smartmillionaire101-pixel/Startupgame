/**
 * The "What to do now" cards (Wave 5 §D), on the City and on Home: three
 * suggestions, each one tap to walk there.
 */
import './scenes.css';
import { money } from '../format';
import { t, tx } from '../i18n';
import { useView } from '../store';
import { Card } from '../ui';
import { suggestionsFor, type Suggestion } from './whatnow';

const ICON: Record<Suggestion['kind'], string> = {
  fun: '🎉',
  job: '💼',
  gig: '🧾',
  eat: '🍽',
  angel: '🤝',
  accelerator: '🚀',
  grant: '🌍',
  sell: '📣',
  event: '🎟',
  customers: '🗣',
  hub: '☕',
};

export function suggestionText(s: Suggestion, cur: string): { label: string; why: string } {
  const amount = s.amount !== undefined ? money(s.amount, cur) : '';
  switch (s.kind) {
    case 'fun':
      return {
        label: s.night
          ? t('Tonight: {place} is busy', { place: s.name })
          : t('Have some fun at {place}', { place: s.name }),
        why: t('{activity} for {price}', { activity: tx(s.detail ?? ''), price: amount }),
      };
    case 'job':
      return {
        label: t('Get a job at {place}', { place: s.name }),
        why: t('{role} · {pay}/mo', { role: tx(s.detail ?? ''), pay: amount }),
      };
    case 'gig':
      return {
        label: t('Take a shift at {place}', { place: s.name }),
        why: t('{gig} · {pay}', { gig: tx(s.detail ?? ''), pay: amount }),
      };
    case 'eat':
      return {
        label: t('Eat at {place}', { place: s.name }),
        why: t('You’re tired: {dish} for {price}', { dish: tx(s.detail ?? ''), price: amount }),
      };
    case 'angel':
      return {
        label: t('Pitch {name}', { name: s.name }),
        why: t('They’re at {place} right now', { place: s.where ?? '' }),
      };
    case 'accelerator':
      return {
        label: t('Apply to {name}', { name: s.name }),
        why: t('Cash, a mentor and a demo day'),
      };
    case 'grant':
      return {
        label: t('Apply: {programme}', { programme: tx(s.name) }),
        why: t('A grant from {name}: no equity', { name: s.where ?? '' }),
      };
    case 'sell':
      return {
        label: t('Sell to {place}', { place: s.name }),
        why: t('They spend about {amount}/mo on what you make', { amount }),
      };
    case 'event':
      return {
        label: t('Go to “{title}”', { title: s.name }),
        why: t('At the Event Hall · {date}', { date: s.where ?? '' }),
      };
    case 'customers':
      return {
        label: t('Interview customers'),
        why: t('At the Market: learn what they’d pay for'),
      };
    case 'hub':
      return { label: t('Meet people at the Hub'), why: t('Founders, talent and the jobs board') };
  }
}

export function WhatNowList({ onGo }: { onGo: (placeId: string) => void }) {
  const { view, cur } = useView();
  const list = suggestionsFor(view);
  return (
    <ul className="whatnow-list">
      {list.map((s) => {
        const { label, why } = suggestionText(s, cur);
        return (
          <li key={s.placeId}>
            <button
              type="button"
              className="whatnow-btn"
              data-suggestion={s.kind}
              onClick={() => onGo(s.placeId)}
            >
              <span className="tray-icon" aria-hidden="true">
                {ICON[s.kind]}
              </span>
              <span>
                <b>{label}</b>
                <span className="whatnow-why">{why}</span>
              </span>
              <span className="whatnow-go" aria-hidden="true">
                ›
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** On Home: the card, opening the City at the place. */
export function WhatNowCard({ onGo }: { onGo: (placeId: string) => void }) {
  return (
    <Card title={t('What to do now')}>
      <div className="whatnow">
        <WhatNowList onGo={onGo} />
      </div>
    </Card>
  );
}

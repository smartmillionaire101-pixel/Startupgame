/**
 * Wave 12 §A: the Games app on the phone. Start something (football on your
 * TV, a quiz night at home, pool or darts at a bar), pick up a game you're in,
 * answer invitations, join a quiz someone started in town, and see who rules
 * the leaderboards in this city.
 */
import { useState } from 'react';
import type { GameKind, GameSummary } from '@runway/engine';
import { money } from '../format';
import { t } from '../i18n';
import { useView } from '../store';
import { businessesOf } from '../city/contract';
import { cityViewOf } from '../city/travel';
import type { PhoneCtx } from '../phone/shared';
import { newGame, openGame } from './open';
import { KIND_ICON, kindName } from './labels';
import { Face } from './GamesHost';
import './games.css';

const KINDS: GameKind[] = ['quiz', 'pool', 'football', 'darts'];

export function GamesApp({ ctx }: { ctx: PhoneCtx }) {
  const { view } = useView();
  const games = view.games;
  const [board, setBoard] = useState<GameKind>('quiz');
  const city = cityViewOf(view);
  const bars = businessesOf(city).filter((b) => b.open && (b.kind === 'bar' || b.kind === 'pub'));
  const away = !!view.here;
  const go = (fn: () => void) => {
    ctx.close();
    fn();
  };
  const row = (g: GameSummary, label: string) => (
    <li key={g.id} className="phone-row games-row" data-game-row={g.id}>
      <span aria-hidden="true">{KIND_ICON[g.kind]}</span>
      <span className="games-row-main">
        <b>
          {kindName(g.kind)} · {g.place}
        </b>
        <span className="small muted">
          {g.status === 'settled' && g.result
            ? g.result.youWon
              ? t('You won {amount}', { amount: money(g.result.yourPayout, g.currency) })
              : t('{name} won', { name: g.result.winners.map((w) => w.name).join(' & ') })
            : t('{n} players · stake {stake}', {
                n: g.players.length,
                stake: g.stake ? money(g.stake, g.currency) : t('none'),
              })}
        </span>
      </span>
      <button
        type="button"
        className="btn btn-primary btn-sm"
        onClick={() => go(() => openGame(g.id))}
      >
        {label}
      </button>
    </li>
  );
  if (!games) return null;
  const leaders = games.leaders[board] ?? [];
  const mine = games.me[board];
  return (
    <div className="phone-stack games-app">
      {(games.invites.length > 0 || games.active.length > 0) && (
        <section aria-label={t('Your games')}>
          <h3 className="phone-h">{t('Your games')}</h3>
          <ul className="phone-list">
            {games.invites.map((g) => row(g, t('See invite')))}
            {games.active.map((g) => row(g, g.status === 'playing' ? t('Play') : t('Lobby')))}
          </ul>
        </section>
      )}
      <section aria-label={t('Play something')}>
        <h3 className="phone-h">{t('Play something')}</h3>
        <div className="games-play">
          <button
            type="button"
            className="games-tile k-football"
            disabled={away && !view.visiting}
            onClick={() => go(() => newGame({ kind: 'football', where: 'home' }))}
          >
            <span aria-hidden="true">⚽</span>
            {t('Football on the TV')}
            <span className="small">{t('A shootout at home')}</span>
          </button>
          <button
            type="button"
            className="games-tile k-quiz"
            disabled={away && !view.visiting}
            onClick={() => go(() => newGame({ kind: 'quiz', where: 'home' }))}
          >
            <span aria-hidden="true">🧠</span>
            {t('Host a quiz night')}
            <span className="small">{t('Your own questions')}</span>
          </button>
          {bars[0] && (
            <button
              type="button"
              className="games-tile k-pool"
              onClick={() =>
                go(() =>
                  newGame({
                    kind: 'pool',
                    where: 'venue',
                    businessId: bars[0]!.id,
                    venueName: bars[0]!.name,
                  }),
                )
              }
            >
              <span aria-hidden="true">🎱</span>
              {t('Pool at {place}', { place: bars[0].name })}
              <span className="small">{t('Eight-ball for a stake')}</span>
            </button>
          )}
          {bars[0] && (
            <button
              type="button"
              className="games-tile k-darts"
              onClick={() =>
                go(() =>
                  newGame({
                    kind: 'darts',
                    where: 'venue',
                    businessId: bars[0]!.id,
                    venueName: bars[0]!.name,
                  }),
                )
              }
            >
              <span aria-hidden="true">🎯</span>
              {t('Darts at {place}', { place: bars[0].name })}
              <span className="small">{t('Nine darts, best total')}</span>
            </button>
          )}
        </div>
        {bars[0] && (
          <button
            type="button"
            className="btn btn-subtle btn-sm"
            onClick={() =>
              go(() =>
                newGame({
                  kind: 'quiz',
                  where: 'venue',
                  businessId: bars[0]!.id,
                  venueName: bars[0]!.name,
                }),
              )
            }
          >
            {t('Start a quiz night at {place}', { place: bars[0].name })}
          </button>
        )}
      </section>
      {games.open.length > 0 && (
        <section aria-label={t('On in town')}>
          <h3 className="phone-h">{t('On in town')}</h3>
          <ul className="phone-list">{games.open.map((g) => row(g, t('Join')))}</ul>
        </section>
      )}
      <section aria-label={t('Leaderboards')}>
        <h3 className="phone-h">{t('Leaderboards')}</h3>
        <div className="chip-row" role="group" aria-label={t('Game')}>
          {KINDS.map((k) => (
            <button
              key={k}
              type="button"
              className={`chip-btn${board === k ? ' on' : ''}`}
              aria-pressed={board === k}
              onClick={() => setBoard(k)}
            >
              {KIND_ICON[k]} {kindName(k)}
            </button>
          ))}
        </div>
        {mine && (
          <p className="small">
            {t('You: {w} wins in {p} · streak {s} · best {b}', {
              w: mine.wins,
              p: mine.played,
              s: mine.streak,
              b: mine.best,
            })}
          </p>
        )}
        {leaders.length === 0 ? (
          <p className="small muted">{t('No games played here yet. Be the first on the board.')}</p>
        ) : (
          <ol className="phone-list" data-leaders={board}>
            {leaders.map((l) => (
              <li key={l.id} className="phone-row games-row">
                <b>{l.rank}</b>
                <Face id={l.id} name={l.name} size={26} />
                <span className="games-row-main">
                  <b>{l.id === view.me.id ? t('You') : l.name}</b>
                  <span className="small muted">
                    {t('{w} wins · best streak {s}', { w: l.wins, s: l.best })}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>
      {games.recent.length > 0 && (
        <section aria-label={t('Recent results')}>
          <h3 className="phone-h">{t('Recent results')}</h3>
          <ul className="phone-list">{games.recent.map((g) => row(g, t('See')))}</ul>
        </section>
      )}
    </div>
  );
}

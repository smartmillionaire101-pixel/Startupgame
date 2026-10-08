/**
 * Wave 12 §A: the game, full screen. The lobby (who's in, the pot, start or
 * join), then the game itself (quiz, pool, football, darts), then the result
 * (who takes the pot, the scoreboard, your streak, a rematch). Mounted once
 * with the phone; `openGame()` / `newGame()` (./open) show it.
 */
import { Suspense, lazy, useState, useSyncExternalStore } from 'react';
import { money } from '../format';
import { t } from '../i18n';
import { useView } from '../store';
import { contactsOf } from '../city/people';
import { closeGames, gamesRequest, onGames, openGame } from './open';
import { NewGame } from './NewGame';
import { useMatch, type Match } from './useMatch';
import { KIND_ICON, kindName, reasonName } from './labels';
import { Quiz } from './Quiz';
import { Football } from './Football';
import { Darts } from './Darts';
import './games.css';

const PoolTable = lazy(() => import('./PoolTable'));

export function GamesHost() {
  const req = useSyncExternalStore(onGames, gamesRequest, () => null);
  if (!req) return null;
  if (req.kind === 'new') return <NewGame req={req.req} onClose={closeGames} />;
  return <MatchScreen key={req.id} id={req.id} onClose={closeGames} />;
}

export type Act = ReturnType<typeof useMatch>['act'];

export function MatchScreen({ id, onClose }: { id: string; onClose: () => void }) {
  const { game: g, missing, act, busy, now } = useMatch(id);
  if (missing)
    return (
      <Frame title={t('Game')} onClose={onClose}>
        <p className="gm-empty">{t('That game isn’t on any more.')}</p>
      </Frame>
    );
  if (!g)
    return (
      <Frame title={t('Game')} onClose={onClose}>
        <p className="gm-empty" aria-busy="true">
          {t('Loading…')}
        </p>
      </Frame>
    );
  const title = `${kindName(g.kind)} · ${g.place}`;
  return (
    <Frame title={title} onClose={onClose} g={g}>
      {g.status === 'lobby' && <Lobby g={g} act={act} busy={busy} />}
      {g.status === 'cancelled' && (
        <p className="gm-empty">{t('This game was called off. Every stake was returned.')}</p>
      )}
      {(g.status === 'playing' || g.status === 'settled') && (
        <>
          {g.status === 'settled' && <Result g={g} act={act} busy={busy} onClose={onClose} />}
          {g.kind === 'quiz' && <Quiz g={g} act={act} now={now} />}
          {g.kind === 'pool' && (
            <Suspense fallback={<p className="gm-empty">{t('Racking up…')}</p>}>
              <PoolTable g={g} act={act} busy={busy} />
            </Suspense>
          )}
          {g.kind === 'football' && <Football g={g} act={act} busy={busy} now={now} />}
          {g.kind === 'darts' && <Darts g={g} act={act} busy={busy} />}
          {g.status === 'playing' && <Concede g={g} act={act} />}
        </>
      )}
    </Frame>
  );
}

function Frame({
  title,
  onClose,
  g,
  children,
}: {
  title: string;
  onClose: () => void;
  g?: Match;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`gm-screen${g ? ` gm-k-${g.kind}` : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      data-game={g?.id}
      data-game-kind={g?.kind}
      data-game-status={g?.status}
    >
      <header className="gm-head">
        <span className="gm-head-icon" aria-hidden="true">
          {g ? KIND_ICON[g.kind] : '🎲'}
        </span>
        <div className="gm-head-title">
          <h2>{g ? kindName(g.kind) : title}</h2>
          {g && <span className="gm-head-sub">{g.place}</span>}
        </div>
        {g && (g.stake > 0 || g.pot > 0) && (
          <span
            className="gm-pot"
            data-pot={g.status === 'settled' ? 0 : g.pot}
            aria-label={t('Pot')}
          >
            <span aria-hidden="true">💰</span>
            {money(g.status === 'settled' ? g.stake * g.players.length : g.pot, g.currency)}
          </span>
        )}
        <button type="button" className="gm-close" aria-label={t('Close')} onClick={onClose}>
          ✕
        </button>
      </header>
      <div className="gm-body">{children}</div>
    </div>
  );
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');

const HUES = [12, 168, 205, 280, 38, 330, 95, 245];
export const hueOf = (id: string) => {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return HUES[h % HUES.length]!;
};

export function Face({
  id,
  name,
  ai,
  size = 36,
}: {
  id: string;
  name: string;
  ai?: boolean;
  size?: number;
}) {
  return (
    <span
      className={`gm-face${ai ? ' is-ai' : ''}`}
      style={{ width: size, height: size, ['--h' as string]: hueOf(id) }}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
}

function Lobby({ g, act, busy }: { g: Match; act: Act; busy: boolean }) {
  const { view } = useView();
  const [inviting, setInviting] = useState(false);
  const friends = contactsOf(view).filter((c) => c.kind === 'player' && c.refId);
  const empty = Math.max(
    0,
    (g.kind === 'quiz' ? Math.min(g.maxPlayers, g.players.length + 2) : 2) - g.players.length,
  );
  return (
    <section className="gm-lobby" aria-label={t('Lobby')}>
      <div className="gm-lobby-hero">
        <span className="gm-big-icon" aria-hidden="true">
          {KIND_ICON[g.kind]}
        </span>
        <p>
          {g.stake
            ? t('Entry {stake} each. Winner takes the pot.', { stake: money(g.stake, g.currency) })
            : t('A friendly: no stake.')}
        </p>
        {g.quizSetup && (
          <p className="small">
            {g.quizSetup.custom
              ? t('{n} questions written by {host}, the quizmaster.', {
                  n: g.quizSetup.count,
                  host: g.hostName,
                })
              : t('{n} questions from the packs.', { n: g.quizSetup.count })}
          </p>
        )}
      </div>
      <ul className="gm-seats" aria-label={t('Players')}>
        {g.seats.map((s) => (
          <li
            key={s.id}
            className={`gm-seat${s.you ? ' is-you' : ''}`}
            data-seat={s.ai ? 'ai' : 'player'}
          >
            <Face id={s.id} name={s.name} ai={s.ai} size={44} />
            <b>{s.you ? t('You') : s.name}</b>
            <span className="small">
              {s.ai ? t('AI player') : s.stats ? t('{w} wins', { w: s.stats.wins }) : t('Player')}
            </span>
          </li>
        ))}
        {Array.from({ length: empty }, (_, i) => (
          <li key={`e${i}`} className="gm-seat is-empty">
            <span className="gm-face is-empty" aria-hidden="true">
              ?
            </span>
            <span className="small">{t('Waiting…')}</span>
          </li>
        ))}
      </ul>
      {g.invited > 0 && <p className="small gm-muted">{t('{n} invited', { n: g.invited })}</p>}
      {!g.hostPlays && g.youHost && (
        <p className="gm-note">{t('You’re the quizmaster: start when your friends are in.')}</p>
      )}
      <div className="gm-actions">
        {g.youHost && (
          <button
            type="button"
            className="btn btn-primary btn-lg"
            disabled={busy || g.players.length < 2}
            onClick={() => void act({ type: 'game.start', gameId: g.id })}
          >
            {t('Start the game')}
          </button>
        )}
        {!g.youIn && !g.youHost && (
          <button
            type="button"
            className="btn btn-primary btn-lg"
            disabled={busy || !g.canJoin}
            onClick={() => void act({ type: 'game.join', gameId: g.id })}
          >
            {g.stake ? t('Join: stake {stake}', { stake: money(g.stake, g.currency) }) : t('Join')}
          </button>
        )}
        {!g.youIn && !g.youHost && g.joinReason && (
          <span className="small gm-muted">{g.joinReason}</span>
        )}
        {(g.youIn || g.youHost) && (
          <button
            type="button"
            className="btn btn-subtle"
            disabled={busy}
            onClick={() => setInviting((v) => !v)}
          >
            {t('Invite friends')}
          </button>
        )}
        {(g.youIn || g.youHost) && (
          <button
            type="button"
            className="btn btn-ghost"
            disabled={busy}
            onClick={() => void act({ type: 'game.leave', gameId: g.id })}
          >
            {g.youHost ? t('Call it off') : t('Leave (stake back)')}
          </button>
        )}
      </div>
      {inviting && (
        <div className="gm-invite" role="group" aria-label={t('Invite friends')}>
          {friends.length === 0 && (
            <p className="small gm-muted">
              {t('Save players you meet as contacts to invite them.')}
            </p>
          )}
          {friends.map((f) => (
            <button
              key={f.refId}
              type="button"
              className="chip-btn"
              disabled={busy}
              onClick={() => void act({ type: 'game.invite', gameId: g.id, playerIds: [f.refId] })}
            >
              + {f.name}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function Result({
  g,
  act,
  busy,
  onClose,
}: {
  g: Match;
  act: Act;
  busy: boolean;
  onClose: () => void;
}) {
  const r = g.result!;
  const me = g.seats.find((s) => s.you);
  const sorted = [...g.seats].sort((a, b) => (g.scores[b.id] ?? 0) - (g.scores[a.id] ?? 0));
  const winners = r.winners.map((w) => (w.id === me?.id ? t('You') : w.name)).join(' & ');
  const mine = me?.stats ?? null;
  return (
    <section
      className={`gm-result${r.youWon ? ' is-win' : ''}`}
      aria-label={t('Result')}
      data-result={r.youWon ? 'won' : 'lost'}
    >
      {r.youWon && <div className="gm-confetti" aria-hidden="true" />}
      <p className="gm-result-head">
        {r.youWon
          ? r.yourPayout
            ? t('You win {amount}!', { amount: money(r.yourPayout, g.currency) })
            : t('You win!')
          : t('{name} wins', { name: winners })}
      </p>
      <p className="small gm-muted">{reasonName(r.reason)}</p>
      <ol className="gm-board" aria-label={t('Final scores')}>
        {sorted.map((s, i) => (
          <li key={s.id} className={r.winners.some((w) => w.id === s.id) ? 'is-winner' : ''}>
            <span className="gm-rank">{i + 1}</span>
            <Face id={s.id} name={s.name} ai={s.ai} size={28} />
            <span className="gm-board-name">{s.you ? t('You') : s.name}</span>
            <b>{g.scores[s.id] ?? 0}</b>
          </li>
        ))}
      </ol>
      {mine && (
        <p className="small gm-streak" data-streak={mine.streak}>
          {mine.streak >= 2
            ? t('🔥 {n} wins in a row · {w} wins in {p} games here', {
                n: mine.streak,
                w: mine.wins,
                p: mine.played,
              })
            : t('{w} wins in {p} games here', { w: mine.wins, p: mine.played })}
        </p>
      )}
      <div className="gm-actions">
        {(g.youIn || g.youHost) && (
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={async () => {
              const res = await act<{ gameId: string }>({ type: 'game.rematch', gameId: g.id });
              if (res?.gameId) openGame(res.gameId);
            }}
          >
            {g.rematchId ? t('Join the rematch') : t('Rematch')}
          </button>
        )}
        <button type="button" className="btn btn-subtle" onClick={onClose}>
          {t('Done')}
        </button>
      </div>
      {g.leaders.length > 0 && (
        <details className="gm-leaders">
          <summary>
            {t('{game} leaderboard in {city}', { game: kindName(g.kind), city: g.city })}
          </summary>
          <ol>
            {g.leaders.map((l) => (
              <li key={l.id}>
                <span>
                  {l.rank}. {l.name}
                </span>
                <span className="small">
                  {t('{w} wins · best streak {s}', { w: l.wins, s: l.best })}
                </span>
              </li>
            ))}
          </ol>
        </details>
      )}
    </section>
  );
}

function Concede({ g, act }: { g: Match; act: Act }) {
  const [sure, setSure] = useState(false);
  if (!g.youIn) return null;
  return (
    <div className="gm-concede">
      {sure ? (
        <>
          <span className="small">{t('Concede? Your stake stays in the pot.')}</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSure(false)}>
            {t('Keep playing')}
          </button>
          <button
            type="button"
            className="btn btn-danger btn-sm"
            onClick={() => void act({ type: 'game.leave', gameId: g.id })}
          >
            {t('Concede')}
          </button>
        </>
      ) : (
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSure(true)}>
          {t('Concede')}
        </button>
      )}
    </div>
  );
}

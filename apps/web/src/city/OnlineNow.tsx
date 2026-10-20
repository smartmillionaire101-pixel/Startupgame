/**
 * "Online now": the real players online across every city (people who show
 * themselves on the map; never AI players, never anyone blocked either way).
 * Polled every 15 s only while the list is open. Each row can open the chat,
 * the person card, or send an invitation to play (a card in your chat).
 */
import { useEffect, useState } from 'react';
import { api, type OnlinePlayer, type PlayGame } from '../api';
import { t, tx } from '../i18n';
import { openPhone } from '../phone/bus';
import { useView } from '../store';
import { Button, Sheet } from '../ui';
import { PersonCard, roleName } from './PersonCard';
import type { PresenceView } from './people';
import './online-now.css';

export const ONLINE_POLL_MS = 15_000;

const GAMES: { game: PlayGame; label: () => string }[] = [
  { game: 'quiz', label: () => t('Quiz') },
  { game: 'snooker', label: () => t('Snooker') },
  { game: 'football', label: () => t('Football') },
];
const gameName = (g: PlayGame) => GAMES.find((x) => x.game === g)?.label() ?? t('Golf');

/** The players online now, polled while `enabled` and the tab is visible. */
export function useOnlinePlayers(enabled: boolean) {
  const [players, setPlayers] = useState<OnlinePlayer[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let request: AbortController | undefined;
    const tick = async () => {
      clearTimeout(timer);
      if (stopped) return;
      if (document.visibilityState !== 'hidden') {
        request?.abort();
        const current = new AbortController();
        request = current;
        try {
          const r = await api.onlinePlayers(current.signal);
          if (!stopped) {
            setPlayers(Array.isArray(r.players) ? r.players : []);
            setFailed(false);
          }
        } catch {
          if (!stopped && !current.signal.aborted) setFailed(true);
        }
      }
      if (!stopped) timer = setTimeout(() => void tick(), ONLINE_POLL_MS);
    };
    const onVisible = () => {
      if (document.visibilityState !== 'hidden') void tick();
    };
    document.addEventListener('visibilitychange', onVisible);
    void tick();
    return () => {
      stopped = true;
      clearTimeout(timer);
      request?.abort();
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled]);
  return { players, failed };
}

/** What a person card needs to show an online player. */
const asPresence = (p: OnlinePlayer): PresenceView => ({
  id: p.id,
  name: p.name,
  handle: p.handle,
  role: p.role,
  backgroundId: p.backgroundId,
  stars: p.stars,
  company: p.company,
  x: 0,
  y: 0,
  place: p.here ? p.place : null,
  seenAt: 0,
});

function OnlineRow({
  p,
  onView,
  onLeave,
}: {
  p: OnlinePlayer;
  onView: (p: OnlinePlayer) => void;
  onLeave?: () => void;
}) {
  const { toast } = useView();
  const [inviting, setInviting] = useState(false);
  const [sending, setSending] = useState(false);
  const where = [p.city, ...(p.placeName ? [tx(p.placeName)] : [])].join(' · ');
  const invite = async (game: PlayGame) => {
    setSending(true);
    try {
      await api.act(p.id, { playGame: game });
      toast(
        t('Invitation to play {game} sent to {name}.', { game: gameName(game), name: p.name }),
        'ok',
      );
      setInviting(false);
    } catch (e) {
      toast(tx((e as Error).message), 'error');
    } finally {
      setSending(false);
    }
  };
  return (
    <li className="online-row" data-online-player={p.id}>
      <div className="online-id">
        <span className="online-avatar" aria-hidden="true">
          {(p.name.trim()[0] ?? '?').toUpperCase()}
        </span>
        <span className="online-name">
          <span className="item-title">{p.name}</span>
          <span className="small muted">
            {roleName(p.role)} · {where}
          </span>
          {p.inGame && (
            <span className="small online-playing">
              {t('Playing {game}', { game: gameName(p.inGame) })}
            </span>
          )}
        </span>
      </div>
      <div className="online-actions">
        <Button
          variant="subtle"
          size="sm"
          onClick={() => {
            onLeave?.();
            openPhone({ player: p.id });
          }}
        >
          {t('Message')}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => onView(p)}>
          {t('View')}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          aria-expanded={inviting}
          onClick={() => setInviting((v) => !v)}
        >
          {t('Invite to play')}
        </Button>
      </div>
      {inviting && (
        <div
          className="online-invite"
          role="group"
          aria-label={t('Invite {name}', { name: p.name })}
        >
          <p className="small muted">
            {p.here
              ? t('They get a card in your chat. Host a table first and the card takes them to it.')
              : t('They are in {city}: to play together you need to be in the same city.', {
                  city: p.city,
                })}
          </p>
          <div className="row">
            {GAMES.map((g) => (
              <Button
                key={g.game}
                variant="subtle"
                size="sm"
                disabled={sending}
                onClick={() => void invite(g.game)}
              >
                {g.label()}
              </Button>
            ))}
          </div>
        </div>
      )}
    </li>
  );
}

/** The list itself, grouped by "In your city" and "Other cities". */
export function OnlineNowList({
  enabled = true,
  onLeave,
}: {
  enabled?: boolean;
  /** Called before leaving for the phone (to close the sheet around the list). */
  onLeave?: () => void;
}) {
  const { players, failed } = useOnlinePlayers(enabled);
  const [viewing, setViewing] = useState<OnlinePlayer | null>(null);
  if (players === null)
    return (
      <p className="small muted" role="status">
        {failed ? t('Can’t load who’s online right now.') : t('Loading…')}
      </p>
    );
  const here = players.filter((p) => p.here);
  const away = players.filter((p) => !p.here);
  return (
    <div className="online-now">
      <p className="small muted">
        {t('Real players online now who show themselves on the map. Updates every 15 seconds.')}
      </p>
      {!players.length && (
        <p className="small muted">
          {t('Nobody else is online right now. Play against AI meanwhile.')}
        </p>
      )}
      {[
        { title: t('In your city'), list: here },
        { title: t('Other cities'), list: away },
      ].map(
        (g) =>
          g.list.length > 0 && (
            <section key={g.title} className="online-group">
              <h3>
                {g.title} <span className="muted">· {g.list.length}</span>
              </h3>
              <ul className="online-list" aria-label={g.title}>
                {g.list.map((p) => (
                  <OnlineRow key={p.id} p={p} onView={setViewing} onLeave={onLeave} />
                ))}
              </ul>
            </section>
          ),
      )}
      {viewing && (
        <PersonCard
          person={{ kind: 'player', p: asPresence(viewing) }}
          onClose={() => setViewing(null)}
          onVisit={() => setViewing(null)}
          onHub={() => setViewing(null)}
        />
      )}
    </div>
  );
}

export function OnlineNowSheet({ onClose }: { onClose: () => void }) {
  return (
    <Sheet title={t('Online now')} onClose={onClose}>
      <OnlineNowList onLeave={onClose} />
    </Sheet>
  );
}

/**
 * Wave 12 §A: what a venue's tray offers to play: a quiz night, pool and
 * darts at a bar or pub, football on the machines at an arcade, and any game
 * someone has set up here that's waiting for players.
 */
import type { GameKind, PlayerView } from '@runway/engine';
import { money } from '../format';
import { t } from '../i18n';
import type { BusinessView } from '../city/contract';
import { newGame, openGame } from './open';
import { KIND_ICON, kindName } from './labels';

interface Action {
  id: string;
  label: string;
  sub?: string;
  icon: string;
  run: () => void;
}

export function venueGameKinds(b: BusinessView): GameKind[] {
  const items = b.venue?.items ?? [];
  if (items.some((i) => i.id === 'quiz') || b.kind === 'bar' || b.kind === 'pub')
    return ['quiz', 'pool', 'darts'];
  if (b.kind === 'arcade') return ['football'];
  return [];
}

export function gameActions(view: PlayerView, b: BusinessView): Action[] {
  const out: Action[] = [];
  const open = (view.games?.open ?? []).filter((g) => g.businessId === b.id);
  for (const g of open.slice(0, 2))
    out.push({
      id: `game:${g.id}`,
      label: t('Join {game} ({n} in)', { game: kindName(g.kind), n: g.players.length }),
      sub: g.stake
        ? t('Stake {stake} · winner takes the pot', { stake: money(g.stake, g.currency) })
        : t('A friendly'),
      icon: KIND_ICON[g.kind],
      run: () => openGame(g.id),
    });
  const sub: Record<GameKind, string> = {
    quiz: t('A real quiz for a stake · winner takes the pot'),
    pool: t('Eight-ball against a friend or an AI player'),
    darts: t('Nine darts, best total takes the pot'),
    football: t('A penalty shootout on the machines'),
  };
  for (const kind of venueGameKinds(b))
    out.push({
      id: `newgame:${kind}`,
      label:
        kind === 'quiz'
          ? t('Quiz night: play for real')
          : t('Play {game}', { game: kindName(kind) }),
      sub: sub[kind],
      icon: KIND_ICON[kind],
      run: () => newGame({ kind, where: 'venue', businessId: b.id, venueName: b.name }),
    });
  return out;
}

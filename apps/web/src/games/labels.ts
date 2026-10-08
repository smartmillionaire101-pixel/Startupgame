/** Wave 12 §A: names and icons for games, packs and how a game ended. */
import type { GameKind } from '@runway/engine';
import { t } from '../i18n';

export const KIND_ICON: Record<GameKind, string> = {
  quiz: '🧠',
  pool: '🎱',
  football: '⚽',
  darts: '🎯',
};

export const kindName = (k: GameKind | string) =>
  ({ quiz: t('Quiz night'), pool: t('Pool'), football: t('Football'), darts: t('Darts') })[
    k as GameKind
  ] ?? k;

export const packName = (p: string) =>
  ({
    general: t('General knowledge'),
    business: t('Business & tech'),
    sport: t('Sport'),
    music: t('Music'),
    city: t('This city'),
    custom: t('The host’s question'),
  })[p] ?? p;

export const reasonName = (r: string) =>
  ({
    score: t('on points'),
    forfeit: t('the other side conceded'),
    timeout: t('the clock ran out'),
    'eight-ball': t('on the black'),
    fouls: t('three fouls in a row'),
    tie: t('a tie: the pot is shared'),
    abandoned: t('the game was abandoned'),
  })[r] ?? r;

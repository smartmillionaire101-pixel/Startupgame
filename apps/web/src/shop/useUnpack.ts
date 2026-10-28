import { useCallback } from 'react';
import type { Command } from '@runway/engine';
import { t } from '../i18n';
import { useView } from '../store';
import { placeAfterUnpack, toPlace, unpackCommands, type ToPlace, type VanGroup } from './vans';

/**
 * Unpack a whole van ("Unpack all"); what you place yourself goes straight
 * to placing (the home scene takes it). Resolves to whether it all came in,
 * and how many things wait to be placed.
 */
export function useUnpack() {
  const { view, send } = useView();
  const basket = !!view?.me.shop?.basket;
  const mine = view?.me.id;
  return useCallback(
    async (van: VanGroup) => {
      const own = van.items[0]?.owner === mine;
      let n = 0;
      for (const cmd of unpackCommands(van, basket)) {
        const r = await send(cmd as Command, (x: { message?: string } | null) =>
          own
            ? basket || van.items.length === 1
              ? van.items.length === 1
                ? t('Unpacked.')
                : t('Unpacked {n} things.', { n: van.items.length })
              : null
            : x?.message
              ? t('You helped your friend unpack. Thank you!')
              : null,
        );
        if (r === null) break;
        n++;
      }
      const done = basket ? (n ? van.items : []) : van.items.slice(0, n);
      // Only the owner places things (a friend helping carries them in).
      const place = own ? done.map(toPlace).filter((x): x is ToPlace => x !== null) : [];
      placeAfterUnpack(place);
      return { all: done.length === van.items.length, toPlace: place.length };
    },
    [send, basket, mine],
  );
}

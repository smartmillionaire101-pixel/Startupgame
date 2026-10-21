/**
 * "My purchases" (player feedback: "character should be able to wear what
 * they buy and they should have a look at what they have bought"): your
 * outfit on your figure, your wardrobe (everything you bought or were given
 * to wear, a top in each colour you picked) with Wear and Take off, and the
 * other things you keep (books, toys, gadgets, decor …) by kind, with who
 * gave you what. Wearing is the engine's `wardrobe.wear` (free, any time),
 * taking off `wardrobe.remove`. Opened from the mall and from Me.
 */
import { useMemo, useState } from 'react';
import type { Command, MallShopId, Removable } from '@runway/engine';
import { REMOVABLE } from '@runway/engine';
import { AvatarFigure, avatarLook, drawnGender, type AvatarLook } from '../city/art';
import { useLookVersion } from '../city/acts/look';
import { genderOf } from '../city/life';
import { wardrobeOf, type WardrobeItemView } from '../city/leisure';
import { colourName, itemIcon, wearing } from '../city/mall/shops';
import { t, tx } from '../i18n';
import { useView } from '../store';
import { Button, Empty, Pill, Sheet } from '../ui';
import './avatar.css';

type Group = 'clothes' | 'shoes' | 'hats' | 'bags' | 'jewellery';
const GROUP_OF: Record<string, Group> = {
  topStyle: 'clothes',
  legs: 'clothes',
  belt: 'clothes',
  socks: 'clothes',
  scarf: 'clothes',
  shoes: 'shoes',
  headwear: 'hats',
  glasses: 'hats',
  bag: 'bags',
  watch: 'jewellery',
  bracelet: 'jewellery',
  ring: 'jewellery',
  cufflinks: 'jewellery',
  necklace: 'jewellery',
  earrings: 'jewellery',
};
const GROUPS: readonly Group[] = ['clothes', 'shoes', 'hats', 'bags', 'jewellery'];
const groupLabel = (g: Group) =>
  ({
    clothes: () => t('Clothes'),
    shoes: () => t('Shoes'),
    hats: () => t('Hats and glasses'),
    bags: () => t('Bags'),
    jewellery: () => t('Watches and jewellery'),
  })[g]();

const KINDS: Record<string, () => string> = {
  book: () => t('Books'),
  toy: () => t('Toys and games'),
  gadget: () => t('Gadgets'),
  decor: () => t('Home decor'),
  flowers: () => t('Flowers'),
  sweets: () => t('Sweets and treats'),
  beauty: () => t('Beauty'),
  sports: () => t('Sports kit'),
};
const kindLabel = (k: string | null) => KINDS[k ?? '']?.() ?? t('Other things');

const removable = (slot: string): slot is Removable =>
  (REMOVABLE as readonly string[]).includes(slot);

/** What an entry looks like as a mall item (its icon, how wearing it changes a look). */
const asItem = (e: WardrobeItemView) => ({
  id: e.item,
  shop: e.shop as MallShopId,
  ...(e.slot === 'topStyle' ? { topStyle: e.style } : {}),
  ...(e.slot === 'headwear' ? { headwear: e.style } : {}),
  ...(e.slot === 'glasses' ? { glasses: e.style } : {}),
  ...(e.slot !== 'topStyle' && e.slot !== 'headwear' && e.slot !== 'glasses'
    ? { worn: { slot: e.slot, style: e.style } }
    : {}),
});

/** A small figure of a look (feet at the bottom). */
function Figure({ look, size, label }: { look: AvatarLook; size: number; label?: string }) {
  return (
    <svg
      viewBox="-16 -48 32 50"
      width={size * 0.64}
      height={size}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <AvatarFigure look={look} />
    </svg>
  );
}

/** Your purchases, in a sheet (from the mall or Me). */
export function PurchasesSheet({ onClose }: { onClose: () => void }) {
  return (
    <Sheet title={t('My purchases')} onClose={onClose}>
      <Purchases />
    </Sheet>
  );
}

/** A button that opens your purchases. */
export function PurchasesButton({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="secondary"
        block
        className={className}
        data-open-purchases=""
        onClick={() => setOpen(true)}
      >
        {t('👜 My purchases')}
      </Button>
      {open && <PurchasesSheet onClose={() => setOpen(false)} />}
    </>
  );
}

export function Purchases() {
  const { view, send, busy } = useView();
  const me = view.me;
  const gender = drawnGender(me.background?.id, me.id, genderOf(me));
  const v = useLookVersion();
  const look = useMemo(
    () => avatarLook(me.background?.id, me.id, gender),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- v: a saved look changed
    [me.background?.id, me.id, gender, v],
  );
  const w = wardrobeOf(view);
  const items = w?.items ?? [];
  const things = w?.things ?? [];

  const wear = (e: WardrobeItemView) =>
    void send(
      {
        type: 'wardrobe.wear',
        itemId: e.item,
        ...(e.colour ? { colour: e.colour } : {}),
      } as Command,
      t('You put on: {item}.', { item: tx(e.label) }),
    );
  const takeOff = (e: WardrobeItemView) => {
    if (!removable(e.slot)) return;
    void send({ type: 'wardrobe.remove', slot: e.slot } as Command, t('Taken off.'));
  };

  const byKind = new Map<string, typeof things>();
  for (const x of things) byKind.set(x.kind ?? '', [...(byKind.get(x.kind ?? '') ?? []), x]);
  const worn = items.filter((e) => e.wearing);

  return (
    <div className="purchases" data-purchases="">
      <section className="purchases-hero" data-outfit="">
        <Figure look={look} size={170} label={t('Your outfit')} />
        <div className="purchases-hero-text">
          <b>{t('Your outfit')}</b>
          {worn.length ? (
            <ul className="purchases-worn">
              {worn.map((e) => (
                <li key={`${e.item}:${e.colour ?? ''}`}>
                  <span aria-hidden="true">{itemIcon(asItem(e))} </span>
                  {tx(e.label)}
                  {e.colour ? ` · ${colourName(e.colour)}` : ''}
                </li>
              ))}
            </ul>
          ) : (
            <span className="small muted">
              {t('Wear something you bought and it shows on you, everywhere.')}
            </span>
          )}
          {w && !w.on && (
            <span className="small muted">{t('Your wardrobe opens with the bigger mall.')}</span>
          )}
        </div>
      </section>

      <h3 className="section-h">{t('Wardrobe')}</h3>
      {items.length === 0 ? (
        <Empty>
          {t(
            'Nothing to wear yet: clothes, shoes and jewellery you buy at the mall are kept here.',
          )}
        </Empty>
      ) : (
        GROUPS.map((g) => {
          const list = items.filter((e) => (GROUP_OF[e.slot] ?? 'clothes') === g);
          if (!list.length) return null;
          return (
            <div key={g} className="purchases-group" data-group={g}>
              <h4>{groupLabel(g)}</h4>
              <ul className="wardrobe-grid">
                {list.map((e) => (
                  <li
                    key={`${e.item}:${e.colour ?? ''}`}
                    className={`wardrobe-card${e.wearing ? ' is-on' : ''}`}
                    data-wardrobe-item={e.item}
                    data-colour={e.colour ?? ''}
                    data-wearing={e.wearing ? '1' : '0'}
                  >
                    <span className="wardrobe-fig" aria-hidden="true">
                      <Figure look={wearing(look, asItem(e), e.colour ?? look.top)} size={96} />
                    </span>
                    <span className="wardrobe-name">
                      <span aria-hidden="true">{itemIcon(asItem(e))} </span>
                      {tx(e.label)}
                    </span>
                    {e.colour && (
                      <span className="small muted wardrobe-colour">
                        <i style={{ background: e.colour }} aria-hidden="true" />
                        {colourName(e.colour)}
                      </span>
                    )}
                    {e.from && (
                      <span className="small muted">
                        {t('A gift from {name}', { name: e.from.name })}
                      </span>
                    )}
                    {e.wearing ? (
                      removable(e.slot) ? (
                        <Button
                          size="sm"
                          variant="subtle"
                          data-take-off={e.item}
                          disabled={busy || !w?.on}
                          onClick={() => takeOff(e)}
                        >
                          {t('Take off')}
                        </Button>
                      ) : (
                        <Pill tone="good">{t('Wearing')}</Pill>
                      )
                    ) : (
                      <Button
                        size="sm"
                        data-wear={e.item}
                        disabled={busy || !w?.on}
                        onClick={() => wear(e)}
                      >
                        {t('Wear')}
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          );
        })
      )}

      <h3 className="section-h">{t('Other things you keep')}</h3>
      {things.length === 0 ? (
        <Empty>{t('Books, toys, gadgets and gifts you keep show up here.')}</Empty>
      ) : (
        [...byKind.entries()].map(([k, list]) => (
          <div key={k} className="purchases-group" data-kind={k || 'other'}>
            <h4>{kindLabel(k || null)}</h4>
            <ul className="purchases-things">
              {list.map((x, i) => (
                <li key={`${x.item}:${i}`} data-thing={x.item}>
                  <span aria-hidden="true">
                    {itemIcon({ id: x.item, shop: 'toys' as MallShopId })}
                  </span>
                  <span className="purchases-thing-name">{tx(x.label)}</span>
                  {x.from && (
                    <span className="small muted">
                      {t('A gift from {name}', { name: x.from.name })}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
    </div>
  );
}

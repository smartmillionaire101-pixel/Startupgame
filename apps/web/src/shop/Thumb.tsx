/**
 * A catalogue picture. Furniture, appliances, cars and walls are rendered
 * from the game's own 3D models (./thumbs3d.ts, in the finish or paint you
 * picked); clothes show you wearing them, in the colour you picked; the
 * rest are illustrated (the mall's own icons on the shop's colour). While a
 * 3D picture renders (or where WebGL isn't there) the illustration shows.
 */
import { useEffect, useState } from 'react';
import { SHOP_COLOUR, itemIcon, wearing } from '../city/mall/shops';
import { AvatarFigure, type AvatarLook } from '../city/art';
import type { CatEntry, CatVariant } from './catalog';
import type { ThumbSpec } from './thumbs3d';

const SLOT_ICON: Record<string, string> = {
  sofa: '🛋️',
  tv: '📺',
  sound: '🔊',
  gaming: '🎮',
  rug: '🟫',
  lights: '💡',
  plants: '🪴',
  art: '🖼️',
  books: '📚',
  bed: '🛏️',
  wardrobe: '🚪',
  desk: '🪑',
  laptop: '💻',
  kitchen: '🍳',
  fridge: '🧊',
  coffee: '☕',
  dining: '🍽️',
  washer: '🧺',
  cooling: '❄️',
  power: '🔋',
  wifi: '📶',
};
const WALL_ICON: Record<string, string> = {
  full: '🧱',
  half: '🧱',
  glass: '🪟',
  sliding: '🚪',
  bookshelf: '📚',
};
const CAT_BG: Record<string, string> = {
  home: '#e9d8c4',
  walls: '#dfe7dc',
  appliances: '#dde6ee',
  electronics: '#dfe0f2',
  fashion: '#f3dde6',
  beauty: '#f6e2ef',
  groceries: '#e2f0d9',
  books: '#f4ead2',
  sports: '#d9efe9',
  cars: '#e3e6ea',
};

/** The illustration: an icon on a soft colour. */
export function iconOf(e: CatEntry): string {
  if (e.slot) return SLOT_ICON[e.slot] ?? '📦';
  if (e.wall) return WALL_ICON[e.wall] ?? '🧱';
  if (e.source === 'car') return e.variants[0]?.ref === 'motorbike' ? '🏍️' : '🚗';
  if (e.mall) return itemIcon(e.mall);
  return '📦';
}

/** Renders one at a time, so a page of pictures never blocks the screen for long. */
let queue: Promise<unknown> = Promise.resolve();
function render(spec: ThumbSpec): Promise<string | null> {
  const next = queue.then(
    () =>
      new Promise<string | null>((resolve) => {
        setTimeout(() => {
          import('./thumbs3d').then((m) => resolve(m.renderThumb(spec))).catch(() => resolve(null));
        }, 0);
      }),
  );
  queue = next.catch(() => null);
  return next;
}

export function Thumb({
  entry,
  variant,
  swatch,
  colour,
  look,
  size = 'card',
}: {
  entry: CatEntry;
  variant: CatVariant;
  swatch?: string | null;
  /** A top's colour. */
  colour?: string;
  /** Your look (clothes are shown on you). */
  look?: AvatarLook | null;
  size?: 'card' | 'big';
}) {
  const spec: ThumbSpec | null =
    entry.source === 'furniture'
      ? { kind: 'furniture', id: entry.slot!, tier: variant.tier ?? 1, swatch: swatch ?? null }
      : entry.source === 'car'
        ? { kind: 'car', id: variant.ref, swatch: swatch ?? null }
        : entry.source === 'wall'
          ? { kind: 'wall', id: entry.wall!, len: Number(variant.ref), swatch: swatch ?? null }
          : null;
  const key = spec ? JSON.stringify(spec) : '';
  const [url, setUrl] = useState<{ key: string; url: string } | null>(null);
  useEffect(() => {
    if (!spec) return;
    let live = true;
    void render(spec).then((u) => {
      if (live && u) setUrl({ key, url: u });
    });
    return () => {
      live = false;
    };
    // The spec is its key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const bg =
    entry.mall && !entry.slot
      ? `${SHOP_COLOUR[entry.mall.shop]}33`
      : (CAT_BG[entry.category] ?? '#eee');
  const wear =
    look &&
    entry.mall &&
    (entry.mall.topStyle || entry.mall.headwear || entry.mall.glasses || entry.mall.worn)
      ? wearing(look, entry.mall, colour ?? '#2563eb')
      : null;
  const shown = url && url.key === key ? url.url : null;
  return (
    <span
      className={`cat-thumb is-${size}`}
      style={{ background: bg }}
      data-thumb={shown ? '3d' : wear ? 'look' : 'icon'}
      aria-hidden="true"
    >
      {shown ? (
        <img src={shown} alt="" draggable={false} />
      ) : wear ? (
        <svg viewBox="-24 -50 48 54" className="cat-thumb-look">
          <AvatarFigure look={wear} />
        </svg>
      ) : (
        <span className="cat-thumb-icon">{iconOf(entry)}</span>
      )}
      {swatch && entry.source !== 'mall' && (
        <i className="cat-thumb-swatch" style={{ background: swatch }} />
      )}
    </span>
  );
}

/**
 * The Suit Shop's aisles (the feedback round): chips over its list for
 * suits, shirts and blouses, ties, shoes, watches and bags. An aisle with
 * nothing in it (for who you are) isn't offered.
 */
import type { MallItemView } from '../leisure';
import { SUIT_AISLES, aisleLabel, aisleOf, type SuitAisle } from './shops';

export function SuitAisles({
  items,
  aisle,
  onAisle,
}: {
  items: readonly MallItemView[];
  aisle: SuitAisle;
  onAisle: (a: SuitAisle) => void;
}) {
  const open = SUIT_AISLES.filter((a) => a === 'all' || items.some((i) => aisleOf(i) === a));
  return (
    <div className="mall-aisles" role="tablist" aria-label={aisleLabel('all')}>
      {open.map((a) => (
        <button
          key={a}
          type="button"
          role="tab"
          aria-selected={a === aisle}
          className={`chip mall-aisle${a === aisle ? ' on' : ''}`}
          data-aisle={a}
          onClick={() => onAisle(a)}
        >
          {aisleLabel(a)}
        </button>
      ))}
    </div>
  );
}

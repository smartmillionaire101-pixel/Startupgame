/**
 * Round 7: the van at your home, one per order ("Your delivery is outside:
 * 3 items · Unpack all"). Unpacking goes straight to placing what you place
 * yourself (../shop/vans.ts). On its way, it counts down; Open shows the lot.
 */
import { useEffect, useState } from 'react';
import { t } from '../i18n';
import { useView } from '../store';
import { openLiving } from '../experiences/living-bus';
import { vansOf } from '../shop/vans';
import { useUnpack } from '../shop/useUnpack';

export function DeliveryBanner({ owner }: { owner: string }) {
  const { view, busy } = useView();
  const unpack = useUnpack();
  const vans = vansOf(view.living.deliveries, owner);
  const [now, setNow] = useState(() => Date.now());
  const waiting = vans.length > 0;
  useEffect(() => {
    if (!waiting) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [waiting]);
  if (!waiting) return null;
  // The first van at the door, else the next on its way.
  const van = vans.find((v) => v.arrivesAt <= now) ?? vans[0]!;
  const n = van.items.length;
  const here = van.arrivesAt <= now;
  const left = Math.max(1, Math.ceil((van.arrivesAt - now) / 1000));
  return (
    <div
      className="home-delivery-banner"
      data-van={van.id}
      data-van-items={n}
      data-van-state={here ? 'outside' : 'coming'}
    >
      <span className="home-delivery-text">
        🚚{' '}
        {here
          ? n === 1
            ? t('Your delivery is outside: 1 item')
            : t('Your delivery is outside: {n} items', { n })
          : n === 1
            ? t('Your delivery is on its way: 1 item · {s}s', { s: left })
            : t('Your delivery is on its way: {n} items · {s}s', { n, s: left })}
        {vans.length > 1 && <> · {t('{n} vans', { n: vans.length })}</>}
      </span>
      {here ? (
        <button
          type="button"
          data-action="unpack-all"
          disabled={busy}
          onClick={() => void unpack(van)}
        >
          {t('Unpack all')}
        </button>
      ) : (
        <button type="button" onClick={() => openLiving(owner)}>
          {t('Open')}
        </button>
      )}
    </div>
  );
}

/**
 * Chop: food delivery from the city's open food businesses
 * (`view.here.delivery`, Wave 7 §A), ordered with `food.order`. Price plus
 * a 15% delivery fee; hunger goes up. "Arriving in 20 min", then a toast.
 */
import { useEffect, useRef, useState } from 'react';
import { money } from '../../format';
import { t } from '../../i18n';
import { useView } from '../../store';
import { Button } from '../../ui';
import { hereField, looseCmd } from '../../city/life';
import { cityViewOf } from '../../city/travel';
import { Icon } from '../icons';
import { H, Meter, Nothing, isObj, list, needsOf, num, str, type PhoneCtx } from '../shared';

export interface DeliveryItem {
  id: string;
  label: string;
  price: number;
}
export interface DeliveryPlace {
  businessId: string;
  name: string;
  items: DeliveryItem[];
}

/** Open food places that deliver, or null when the engine doesn't send them yet. */
export function deliveryOf(view: Parameters<typeof hereField>[0]): DeliveryPlace[] | null {
  const raw = hereField(view, 'delivery');
  if (!Array.isArray(raw)) return null;
  return raw
    .filter(isObj)
    .filter((d) => typeof d.businessId === 'string')
    .map((d) => ({
      businessId: d.businessId as string,
      name: str(d.name, '—'),
      items: list(d.items)
        .filter((i) => typeof i.id === 'string')
        .map((i) => ({
          id: i.id as string,
          label: str(i.label, i.id as string),
          price: num(i.price),
        })),
    }))
    .filter((d) => d.items.length > 0);
}

/** Delivery adds 15% (paid to the business). */
export const withDelivery = (price: number) => Math.round(price * 1.15);

export function Chop(_: { ctx: PhoneCtx }) {
  const { view, send, toast } = useView();
  const cur = cityViewOf(view).market.currency;
  const places = deliveryOf(view);
  const needs = needsOf(view);
  const [q, setQ] = useState('');
  const [coming, setComing] = useState<{ label: string; from: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  const order = async (p: DeliveryPlace, i: DeliveryItem) => {
    const r = await send(looseCmd({ type: 'food.order', businessId: p.businessId, itemId: i.id }));
    if (r === null) return;
    setComing({ label: i.label, from: p.name });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setComing(null);
      toast(`Your ${i.label} from ${p.name} is at your door. Unpack it at home.`, 'ok');
    }, 30_000);
  };

  if (!places)
    return (
      <Nothing icon="chop">
        {t('Food delivery isn’t running in this city yet. Try a café or a restaurant in person.')}
      </Nothing>
    );
  const match = (s: string) => s.toLowerCase().includes(q.trim().toLowerCase());
  const shown = places
    .map((p) => (match(p.name) ? p : { ...p, items: p.items.filter((i) => match(i.label)) }))
    .filter((p) => p.items.length > 0);
  return (
    <div className="phone-stack">
      {coming && (
        <section className="phone-card phone-arriving" role="status" data-arriving>
          <span className="phone-arriving-icon">
            <Icon name="rides" size={22} />
          </span>
          <div>
            <div className="item-title">{'Delivery arrives in 30 seconds · unpack at home'}</div>
            <div className="small">
              {t('{item} from {place}', { item: coming.label, place: coming.from })}
            </div>
          </div>
        </section>
      )}
      {needs && <Meter label={t('Hunger')} value={needs.hunger} icon="food" />}
      <input
        className="phone-search"
        type="search"
        aria-label={t('Search food')}
        placeholder={t('Search food')}
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      {places.length === 0 ? (
        <Nothing icon="chop">{t('No kitchens are delivering right now.')}</Nothing>
      ) : shown.length === 0 ? (
        <Nothing>{t('Nothing matches.')}</Nothing>
      ) : (
        shown.map((p) => (
          <section
            key={p.businessId}
            className="phone-card phone-kitchen"
            data-kitchen={p.businessId}
          >
            <H>{p.name}</H>
            <ul className="phone-menu">
              {p.items.map((i) => (
                <li key={i.id} className="spread" data-dish={i.id}>
                  <span className="phone-row-main">
                    <span>{i.label}</span>
                    <span className="small muted">
                      {t('{price} + delivery = {total}', {
                        price: money(i.price, cur),
                        total: money(withDelivery(i.price), cur),
                      })}
                    </span>
                  </span>
                  <Button variant="subtle" onClick={() => void order(p, i)}>
                    {t('Order')}
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}

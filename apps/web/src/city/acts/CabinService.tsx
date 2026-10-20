/**
 * What the cabin you're in gives you (player feedback: "economy, business
 * and first class… each one has to have different experiences"): the seat,
 * the meal, the drink and the amenity kit, on a card over the cabin. The
 * same card in the drawn cabin (./Cabin.tsx) and the 3D one (../flight3d).
 */
import { t } from '../../i18n';
import type { CabinClass } from './Cabin';

interface Service {
  title: () => string;
  seat: () => string;
  meal: () => string;
  drink: () => string;
  kit: () => string;
}

const SERVICE: Record<CabinClass, Service> = {
  economy: {
    title: () => t('Economy'),
    seat: () => t('A narrow seat, three across, knees to the seat in front'),
    meal: () => t('Chicken or beef, on a plastic tray'),
    drink: () => t('Water, juice or a soft drink from the trolley'),
    kit: () => t('No amenity kit: bring your own earphones'),
  },
  premium: {
    title: () => t('Premium economy'),
    seat: () => t('A wider seat, two across, with more legroom'),
    meal: () => t('A hot meal on real cutlery'),
    drink: () => t('Wine or beer with your meal'),
    kit: () => t('Earphones and a blanket'),
  },
  business: {
    title: () => t('Business'),
    seat: () => t('A seat that lies flat into a bed, with aisle access'),
    meal: () => t('Three courses on china, on a white cloth'),
    drink: () => t('Wine, cocktails and coffee whenever you like'),
    kit: () => t('An amenity kit: socks, an eye mask, lip balm'),
  },
  first: {
    title: () => t('First class'),
    seat: () => t('Your own suite with a door, made into a real bed'),
    meal: () => t('Caviar, then the chef’s menu, served when you want it'),
    drink: () => t('Champagne, poured at your suite'),
    kit: () => t('Pyjamas, slippers and a designer amenity kit'),
  },
  private: {
    title: () => t('Private jet'),
    seat: () => t('Cream leather club chairs and a divan'),
    meal: () => t('Whatever you asked the chef for'),
    drink: () => t('Champagne, poured at your suite'),
    kit: () => t('Pyjamas, slippers and a designer amenity kit'),
  },
};

export function CabinService({ cls }: { cls: CabinClass }) {
  const s = SERVICE[cls];
  return (
    <div className={`cab-service cab-service-${cls}`} data-cabin-service={cls}>
      <b className="cab-service-title">{s.title()}</b>
      <ul>
        <li>
          <span aria-hidden="true">💺</span> {s.seat()}
        </li>
        <li data-cabin-meal="">
          <span aria-hidden="true">🍽️</span> {s.meal()}
        </li>
        <li>
          <span aria-hidden="true">🥂</span> {s.drink()}
        </li>
        <li data-cabin-kit="">
          <span aria-hidden="true">👜</span> {s.kit()}
        </li>
      </ul>
    </div>
  );
}

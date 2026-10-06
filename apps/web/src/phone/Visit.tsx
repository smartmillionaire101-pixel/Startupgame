/**
 * Wave 8 §C: visiting a friend. Once you accept their invitation
 * (`visit.accept`), `view.visiting` names their home: this opens their
 * HomeScene read-only, with you and them in it. `openVisit()` opens it from
 * anywhere (the phone, an alert); the phone dock renders it.
 */
import { useMemo, useSyncExternalStore } from 'react';
import { t } from '../i18n';
import { useView } from '../store';
import type { Place } from '../city/layout';
import { HomeScene, type HostView } from '../home/HomeScene';
import { visitingOf } from './friends';

let open = false;
const listeners = new Set<() => void>();
const set = (v: boolean) => {
  open = v;
  for (const l of listeners) l();
};

/** Go into the friend's home you're visiting. */
export const openVisit = () => set(true);
export const closeVisit = () => set(false);

const useOpen = () =>
  useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => open,
    () => false,
  );

/** Their home as a place (only the door and id are read by the scene). */
const hostPlace = (hostId: string, name: string): Place => ({
  id: `visit:${hostId}`,
  kind: 'home',
  name,
  district: 'residential',
  x: 0,
  y: 0,
  w: 1,
  d: 1,
  h: 1,
  motif: 'home',
  color: '#e5e7eb',
  accent: '#9ca3af',
  door: { x: 0, y: 0 },
  doorFace: null,
});

export function VisitHome() {
  const { view } = useView();
  const isOpen = useOpen();
  const visiting = visitingOf(view);
  const key = visiting
    ? `${visiting.host.id}:${visiting.tier}:${visiting.items.map((i) => `${i.slot}${i.tier}`).join()}`
    : '';
  const host: HostView | null = useMemo(
    () =>
      visiting
        ? {
            id: visiting.host.id,
            name: visiting.host.name,
            tier: visiting.tier,
            tiers: new Map(visiting.items.map((i) => [i.slot, i.tier])),
          }
        : null,
    // The key captures everything the scene reads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  );
  if (!isOpen || !visiting || !host) return null;
  const title = t('{name}’s place', { name: visiting.host.name.split(' ')[0]! });
  return (
    <HomeScene
      place={hostPlace(visiting.host.id, visiting.host.name)}
      title={title}
      onClose={closeVisit}
      onPerson={() => {}}
      nav={() => {}}
      players={[]}
      abroad={false}
      hostView={host}
    >
      {null}
    </HomeScene>
  );
}

/**
 * Something to do in every building (the engine's errands.ts): the errands
 * a business or one of the city's spots offers, in the scene's tray and as
 * cards under More, and what each one did, in words.
 *
 * The engine words its results in English; the client words them from the
 * result's fields (leads, a tip, who you met) so they read in French too.
 */
import { SPOT_ERRANDS, type PlayerView, type StandupFocus } from '@runway/engine';
import { money } from '../format';
import { t, tx } from '../i18n';
import { useView } from '../store';
import { Button, Card } from '../ui';
import { looseCmd } from './life';
import type { Place } from './layout';

type View = PlayerView;
export type ErrandsView = NonNullable<View['market']['errands']>;
type Errand = ErrandsView['errands'][number];
type Send = ReturnType<typeof useView>['send'];

/** A tray card (PlaceScene's own shape). */
export interface ErrandAction {
  id: string;
  label: string;
  sub?: string;
  icon: string;
  disabled?: boolean;
  run: () => void | Promise<unknown>;
}

/** The errands of the city you're in (null before the feedback note). */
export const errandsOf = (view: View): ErrandsView | null =>
  (view.here ?? view.market).errands ?? null;

/** Where an errand is done: the place id the engine knows (`biz:`, `cap:`, a spot). */
export function errandAt(place: Pick<Place, 'id' | 'kind'>, abroad: boolean): string | null {
  switch (place.kind as string) {
    case 'business':
    case 'capital':
      return place.id;
    case 'newsstand':
    case 'airport':
      return place.kind;
    case 'office':
      return abroad ? null : 'office';
    default:
      return null;
  }
}

/** The errands at a place: a business kind's, or a spot's. */
export function errandIdsAt(
  e: ErrandsView,
  place: Pick<Place, 'kind'>,
  opts: { kind?: string; capital?: string },
): string[] {
  switch (place.kind as string) {
    case 'business':
      return [...(e.byKind[opts.kind ?? ''] ?? [])];
    case 'newsstand':
      return [...SPOT_ERRANDS.newsstand];
    case 'airport':
      return [...SPOT_ERRANDS.airport];
    case 'office':
      return [...SPOT_ERRANDS.office];
    case 'capital':
      return SPOT_ERRANDS.capital.filter(
        (x) => x !== 'rehearsal' || opts.capital === 'accelerator',
      );
    default:
      return [];
  }
}

export const ERRAND_ICON: Record<string, string> = {
  groceries: '🧺',
  clothes: '👕',
  medicine: '💊',
  'car-service': '🔧',
  prototype: '🛠',
  course: '📚',
  storage: '📦',
  'ship-stock': '🚚',
  lawyer: '⚖️',
  'meet-team': '🤝',
  chat: '💬',
  'test-drive': '🚗',
  paper: '📰',
  lounge: '🛋',
  standup: '☀️',
  'office-hours': '🧑‍🏫',
  cohort: '👥',
  rehearsal: '🎤',
};

const skillLabel = (k: string) =>
  ({
    product: t('Product'),
    sales: t('Sales'),
    fundraising: t('Fundraising'),
    finance: t('Finance'),
    hiring: t('Hiring'),
    leadership: t('Leadership'),
    negotiation: t('Negotiation'),
    publicSpeaking: t('Public speaking'),
    investing: t('Investing'),
    risk: t('Risk'),
  })[k] ?? k;

const names = (xs: { name: string; org?: string }[]) =>
  xs.map((x) => (x.org ? `${x.name} (${x.org})` : x.name)).join(', ');

/** What an errand's result says. */
type Result = {
  errand?: string;
  effects?: Record<string, number>;
  item?: { label: string };
  skill?: string;
  rule?: string;
  met?: { name: string; org?: string }[] | { name: string; org: string };
  learned?: { segment: string; needs: string } | null;
  leads?: { name: string }[];
  pitches?: number;
  investors?: number;
  tip?: string;
  focus?: StandupFocus;
} | null;

/** An errand's result, in words. */
export function errandText(r: Result): string {
  const fx = r?.effects ?? {};
  switch (r?.errand) {
    case 'groceries':
      return t('Food for the week: +{n} hunger.', { n: fx.hunger ?? 0 });
    case 'clothes':
      return t('New {item}: in your wardrobe, and on you.', { item: tx(r.item?.label ?? '') });
    case 'medicine':
      return t('You took your medicine and feel better.');
    case 'car-service':
      return t('Your car is serviced and running well.');
    case 'prototype':
      return t('A prototype built in the workshop: +{h}h on your build this month.', {
        h: fx.buildHours ?? 0,
      });
    case 'course':
      return t('A course: your {skill} is a little stronger.', {
        skill: skillLabel(r.skill ?? '').toLowerCase(),
      });
    case 'storage':
      return t('Stock stored safely: fewer failed orders.');
    case 'ship-stock':
      return t('Stock shipped on time: your customers notice.');
    case 'lawyer':
      return t('Your lawyer filed it: {rule}.', { rule: tx(r.rule ?? '') });
    case 'meet-team':
      return !Array.isArray(r.met) && r.met
        ? t('You met the team at {org}.', { org: r.met.org })
        : t('You met the team.');
    case 'chat':
      return r.learned
        ? t('You talked to the customers waiting: {segment} care about {needs}.', {
            segment: tx(r.learned.segment),
            needs: tx(r.learned.needs).toLowerCase(),
          })
        : t('A friendly chat while you waited.');
    case 'test-drive':
      return t('A test drive: fun, and no pressure to buy.');
    case 'paper':
      if (r.leads?.length)
        return t(
          'A tip in the paper: {name} is looking for a supplier. They’re in your pipeline.',
          {
            name: r.leads[0]!.name,
          },
        );
      if (r.pitches)
        return t('The paper led you to {n} founders raising: they’re in your pipeline.', {
          n: r.pitches,
        });
      return tx(r.tip ?? '') || t('You read the papers.');
    case 'lounge':
      if (Array.isArray(r.met) && r.met.length)
        return t('In the lounge you met {names}: they’ll remember you when you pitch.', {
          names: names(r.met),
        });
      if (r.pitches)
        return t('In the lounge {n} founders pitched you: they’re in your pipeline.', {
          n: r.pitches,
        });
      return t('A quiet hour in the lounge.');
    case 'standup':
      if (r.focus === 'sell')
        return r.leads?.length
          ? t('Stand-up done: today the team chases a new lead, {name}.', {
              name: r.leads[0]!.name,
            })
          : t('Stand-up done: today is for selling.');
      if (r.focus === 'team') return t('Stand-up done: a calmer team today.');
      return t('Stand-up done: today the team builds (+{h}h).', { h: fx.buildHours ?? 0 });
    case 'office-hours':
      return t('Office hours with the programme lead: you leave with sharper ideas.');
    case 'cohort':
      return Array.isArray(r.met) && r.met.length
        ? t('You met {names} from the cohort.', { names: names(r.met) })
        : t('The cohort is heads-down today.');
    case 'rehearsal':
      return t('You rehearsed your demo-day pitch.');
    default:
      return t('Done.');
  }
}

/** One line under an errand: hours and the fee (yours or the company's), or why not. */
function errandSub(e: Errand, cur: string, fee = e.fee): string {
  if (!e.ok && e.reason) return tx(e.reason);
  const bits: string[] = [];
  if (e.hours) bits.push(t('{n}h', { n: e.hours }));
  if (fee)
    bits.push(
      e.paidBy === 'company'
        ? t('{amount} from the company', { amount: money(fee, cur) })
        : money(fee, cur),
    );
  return bits.join(' · ');
}

const run = (send: Send, at: string, errand: string, extra: Record<string, unknown> = {}) =>
  send(looseCmd({ type: 'errand.do', at, errand, ...extra }), (r: Result) => errandText(r));

/**
 * The tray's errands here: one card each (clothes: one per thing on the
 * rail you don't own yet; the stand-up opens More to pick the day's focus).
 */
export function errandTray(opts: {
  view: View;
  at: string;
  ids: string[];
  kind?: string;
  send: Send;
  busy: boolean;
  cur: string;
  openMore: () => void;
}): ErrandAction[] {
  const e = errandsOf(opts.view);
  if (!e) return [];
  const out: ErrandAction[] = [];
  for (const id of opts.ids) {
    const x = e.errands.find((y) => y.id === id);
    if (!x) continue;
    if (id === 'clothes') {
      for (const c of (e.clothes[opts.kind ?? ''] ?? []).filter((c) => !c.owned).slice(0, 2))
        out.push({
          id: `errand:clothes:${c.item}`,
          label: t('Buy {item}', { item: tx(c.label) }),
          sub: errandSub(x, opts.cur, c.price),
          icon: ERRAND_ICON.clothes!,
          disabled: opts.busy,
          run: () => run(opts.send, opts.at, 'clothes', { item: c.item }),
        });
      continue;
    }
    out.push({
      id: `errand:${id}`,
      label: tx(x.label),
      sub: errandSub(x, opts.cur),
      icon: ERRAND_ICON[id] ?? '✨',
      disabled: opts.busy || !x.ok,
      run: () => (id === 'standup' ? opts.openMore() : run(opts.send, opts.at, id)),
    });
  }
  return out;
}

const FOCUS: { id: StandupFocus; label: () => string; sub: () => string }[] = [
  { id: 'build', label: () => t('Build'), sub: () => t('Everyone on the product today') },
  { id: 'sell', label: () => t('Sell'), sub: () => t('Chase a new customer lead') },
  { id: 'team', label: () => t('The team'), sub: () => t('Clear blockers, ease the pressure') },
];

/** Under More: every errand here as a card (the stand-up with its three focuses). */
export function ErrandsCards({ at, ids, kind }: { at: string; ids: string[]; kind?: string }) {
  const { view, send, busy, cur } = useView();
  const e = view ? errandsOf(view) : null;
  if (!e || !ids.length) return null;
  const here = view?.here?.currency ?? cur;
  return (
    <div className="errands" data-errands={at}>
      {ids.map((id) => {
        const x = e.errands.find((y) => y.id === id);
        if (!x) return null;
        const title = `${ERRAND_ICON[id] ?? '✨'} ${tx(x.label)}`;
        if (id === 'clothes')
          return (
            <Card key={id} title={title}>
              {(e.clothes[kind ?? ''] ?? []).map((c) => (
                <Button
                  key={c.item}
                  data-errand={`clothes:${c.item}`}
                  disabled={busy || c.owned}
                  onClick={() => void run(send, at, 'clothes', { item: c.item })}
                >
                  {c.owned
                    ? t('{item} (you have it)', { item: tx(c.label) })
                    : `${tx(c.label)} · ${money(c.price, here)}`}
                </Button>
              ))}
            </Card>
          );
        if (id === 'standup')
          return (
            <Card key={id} title={title} sub={errandSub(x, here)}>
              <p className="small muted">{t('Pick what the team does today.')}</p>
              {FOCUS.map((f) => (
                <Button
                  key={f.id}
                  data-errand={`standup:${f.id}`}
                  disabled={busy || !x.ok}
                  onClick={() => void run(send, at, 'standup', { focus: f.id })}
                >
                  {f.label()} · {f.sub()}
                </Button>
              ))}
            </Card>
          );
        return (
          <Card key={id} title={title} sub={errandSub(x, here)}>
            <Button
              data-errand={id}
              disabled={busy || !x.ok}
              onClick={() => void run(send, at, id)}
            >
              {tx(x.label)}
            </Button>
          </Card>
        );
      })}
    </div>
  );
}

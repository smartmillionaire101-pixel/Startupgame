/**
 * Where a notification takes you (Wave 5 §C): the phone's Alerts and the
 * Home inbox share this, so tapping an item always lands on the screen that
 * matters (a deal card, your company, the Event Hall, a business…).
 */
import type { PlayerView } from '@runway/engine';

export type TabId =
  'city' | 'home' | 'company' | 'money' | 'deals' | 'portfolio' | 'bank' | 'news' | 'me';

export type Target =
  | { kind: 'tab'; tab: TabId; dealId?: string }
  /** Walk there in the City (a place id on the map: `biz:<id>`, `eventhall`…). */
  | { kind: 'place'; place: string };

type ViewLike = Pick<PlayerView, 'me' | 'companies' | 'deals'>;

/** The bottom tabs this player has, in order. */
export function tabsFor(view: ViewLike): TabId[] {
  if (view.me.role === 'banker') return ['city', 'home', 'bank', 'news', 'me'];
  const founder = view.me.role === 'founder' || view.companies.some((c) => c.status === 'active');
  return founder
    ? ['city', 'home', 'company', 'money', 'news', 'me']
    : ['city', 'home', 'deals', 'portfolio', 'news', 'me'];
}

export interface InboxLike {
  kind: string;
  text: string;
  ref?: { kind: string; id: string } | null;
}

/** Place ids for things that live in the city, by the kind of reference. */
const PLACE_PREFIX: Record<string, string> = {
  business: 'biz',
  biz: 'biz',
  job: 'biz',
  fund: 'fund',
  accelerator: 'acc',
  acc: 'acc',
  devPartner: 'dp',
  devpartner: 'dp',
  grant: 'dp',
  dp: 'dp',
  lp: 'lp',
  lender: 'lender',
  playerbank: 'playerbank',
};

export function inboxTarget(item: InboxLike, view: ViewLike): Target {
  const tabs = tabsFor(view);
  const has = (t: TabId) => tabs.includes(t);
  const tab = (...prefs: TabId[]): Target => ({
    kind: 'tab',
    tab: prefs.find(has) ?? 'home',
  });
  /** Deals live on the Money tab (founders), Deal flow (investors) or the Bank. */
  const dealsTab = (dealId?: string): Target => {
    const d = dealId ? view.deals.find((x) => x.id === dealId) : undefined;
    const t: TabId =
      d?.counterparty.kind === 'playerbank' && has('bank')
        ? 'bank'
        : (['money', 'deals', 'bank'] as TabId[]).find(has)!;
    return { kind: 'tab', tab: t, ...(d ? { dealId: d.id } : {}) };
  };
  const ref = item.ref ?? null;
  if (ref) {
    switch (ref.kind) {
      case 'deal':
        return dealsTab(ref.id);
      case 'pitch':
        return tab('money', 'deals');
      case 'media':
        return tab('news');
      case 'candidate':
        return tab('company', 'home');
      case 'company': {
        const mine = view.companies.some((c) => c.id === ref.id);
        return mine ? tab('company', 'portfolio') : tab('deals', 'portfolio', 'money');
      }
      case 'event':
        return { kind: 'place', place: 'eventhall' };
      case 'bank':
        return has('bank') ? tab('bank') : { kind: 'place', place: `playerbank:${ref.id}` };
      default: {
        const prefix = PLACE_PREFIX[ref.kind];
        if (prefix) return { kind: 'place', place: `${prefix}:${ref.id}` };
      }
    }
  }
  const text = item.text;
  switch (item.kind) {
    case 'deal':
    case 'pitch':
      return dealsTab();
    case 'reporter':
      return tab('news');
    case 'staff':
    case 'warning':
      return tab('company', 'portfolio', 'bank', 'home');
    case 'lead':
      return tab('company', 'deals', 'bank');
    case 'milestone':
      return tab('me');
  }
  if (/\bevent|RSVP|Event Hall/i.test(text)) return { kind: 'place', place: 'eventhall' };
  if (/\b(deposit|loan|bank|repay|credit)/i.test(text)) return tab('bank', 'money', 'me');
  if (/\b(story|reporter|interview|headline)/i.test(text)) return tab('news');
  if (/\b(company|runway|burn|hire|staff|customers?)\b/i.test(text))
    return tab('company', 'portfolio');
  return tab('home');
}

/**
 * Where a notification takes you: one mapping, used by every notification
 * surface (the phone's Alerts, the Today inbox, the decisions badge). Tapping
 * an item lands on the thing to act on: a deal card, a chat, a receipt, the
 * Sales pipeline, Hiring, Friends & Family, a place in the City, the Journey…
 * An item with nowhere useful to go gets `null` and is shown as plain text.
 */
import type { PlayerView } from '@runway/engine';
import type { PhoneOpen } from './bus';

export type TabId =
  'city' | 'home' | 'company' | 'money' | 'deals' | 'portfolio' | 'bank' | 'news' | 'me';

/** The Company screen's tabs (screens/Company.tsx). */
export type CompanySection =
  'product' | 'roadmap' | 'sales' | 'customers' | 'team' | 'suppliers' | 'board' | 'rules';

export type Target =
  | {
      kind: 'tab';
      tab: TabId;
      /** Open this deal's card over the tab. */
      dealId?: string;
      /** On the Company tab: open this section. */
      section?: CompanySection;
    }
  /** Walk there in the City (a place id on the map: `biz:<id>`, `cap:<id>`, `eventhall`…). */
  | { kind: 'place'; place: string }
  /** Open the phone on an app, a chat or a receipt. */
  | { kind: 'phone'; open: PhoneOpen }
  /** Today, with this decision's sheet open (the first waiting one without an id). */
  | { kind: 'decision'; id?: string }
  /** The month recap sheet. */
  | { kind: 'recap'; month?: number | null };

type Named = { id: string; name?: string };
type ViewLike = Pick<PlayerView, 'me' | 'companies' | 'deals'> & {
  journey?: unknown;
  market?: unknown;
};

/** The bottom tabs this player has, in order. */
export function tabsFor(view: Pick<PlayerView, 'me' | 'companies'>): TabId[] {
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
  /** The other player (a payment, a gift): their chat. */
  from?: string;
  /** A payment's transaction id: its receipt. */
  receipt?: string;
}

/** Place ids for things that live in the city, by the kind of reference. */
const PLACE_PREFIX: Record<string, string> = {
  business: 'biz',
  biz: 'biz',
  job: 'biz',
  fund: 'fund',
  accelerator: 'cap',
  acc: 'cap',
  devPartner: 'cap',
  devpartner: 'cap',
  grant: 'cap',
  dp: 'cap',
  lp: 'cap',
};

/** The accelerators, development partners and LPs in town (for names in a note). */
function capitalPlaces(view: ViewLike): Named[] {
  const m = view.market as Record<string, unknown> | undefined;
  if (!m || typeof m !== 'object') return [];
  const out: Named[] = [];
  for (const key of ['accelerators', 'devPartners', 'lps']) {
    const list = m[key];
    if (!Array.isArray(list)) continue;
    for (const x of list as Named[])
      if (x && typeof x.id === 'string' && typeof x.name === 'string') out.push(x);
  }
  return out;
}

export function inboxTarget(item: InboxLike, view: ViewLike): Target | null {
  const tabs = tabsFor(view);
  const has = (t: TabId) => tabs.includes(t);
  const tab = (...prefs: TabId[]): Target | null => {
    const t = prefs.find(has);
    return t ? { kind: 'tab', tab: t } : null;
  };
  const mine = (id?: string) =>
    id
      ? view.companies.some((c) => c.id === id)
      : view.companies.some((c) => c.status === 'active');
  const hasCompany = view.companies.some((c) => c.status === 'active');
  /** A section of your Company screen (or the nearest thing you have). */
  const company = (section?: CompanySection): Target | null =>
    hasCompany
      ? { kind: 'tab', tab: 'company', ...(section ? { section } : {}) }
      : tab('portfolio', 'home');
  /** Deals live on the Money tab (founders), Deal flow (investors) or the Bank. */
  const dealsTab = (dealId?: string): Target => {
    const d = dealId ? view.deals.find((x) => x.id === dealId) : undefined;
    const t: TabId =
      d?.counterparty.kind === 'playerbank' && has('bank')
        ? 'bank'
        : (['money', 'deals', 'bank'] as TabId[]).find(has)!;
    return { kind: 'tab', tab: t, ...(d ? { dealId: d.id } : {}) };
  };
  const phone = (open: PhoneOpen): Target => ({ kind: 'phone', open });
  const text = item.text;

  // ---- a payment: its receipt; a gift: the chat with the giver.
  if (item.receipt) return phone({ receipt: item.receipt });
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
        return company('team');
      case 'company': {
        if (!mine(ref.id)) return tab('deals', 'portfolio', 'money');
        // Your own company: the section that matters.
        if (item.kind === 'staff' || /\b(raise|took another job|hire|candidate)/i.test(text))
          return company('team');
        if (/\bvote\b|\bboard\b/i.test(text)) return company('board');
        const place = capitalPlaces(view).find((p) => p.name && text.includes(p.name));
        if (place) return { kind: 'place', place: `cap:${place.id}` };
        if (/\b(won|came \d|runner-up|competition)/i.test(text)) return phone({ app: 'events' });
        if (/\b(distress|out of distress|rescue|runway|months? left)/i.test(text))
          return { kind: 'place', place: 'office' };
        return company();
      }
      case 'event':
      case 'techevent':
      case 'visit':
      case 'hangout':
        return phone({ app: 'events' });
      case 'holiday':
        return phone({ app: 'travel' });
      case 'player':
      case 'gift':
        return item.from ? phone({ player: item.from }) : phone({ app: 'messages' });
      case 'bank':
        return has('bank') ? tab('bank') : { kind: 'place', place: `playerbank:${ref.id}` };
      default: {
        const prefix = PLACE_PREFIX[ref.kind];
        if (prefix) return { kind: 'place', place: `${prefix}:${ref.id}` };
      }
    }
  }
  if (item.from) return phone({ player: item.from });

  // ---- no reference: by kind, then by what the note says.
  if (/^Chapter \d+ complete/.test(text) && view.journey) return phone({ app: 'journey' });
  if (/Friends & Family/.test(text))
    return /^Back them|opened a Friends/.test(text) || !hasCompany
      ? tab('home', 'money')
      : tab('money', 'home');
  if (/\bwent cold\b|\bstopped buying\b|\bstarted buying\b|\bsales (pipeline|lead)/i.test(text))
    return hasCompany ? phone({ app: 'sales' }) : null;
  if (/^First customer/.test(text)) return company('customers');
  if (/\b(mortgage|repossess|your home|a home|property)/i.test(text))
    return phone({ app: 'homes' });
  if (/\b(event|RSVP|Event Hall)\b/i.test(text)) return phone({ app: 'events' });
  if (/\bmonth in review|recap\b/i.test(text)) return { kind: 'recap' };
  const place = capitalPlaces(view).find((p) => p.name && text.includes(p.name));
  if (place) return { kind: 'place', place: `cap:${place.id}` };
  switch (item.kind) {
    case 'deal':
    case 'pitch':
      return dealsTab();
    case 'reporter':
      return tab('news');
    case 'staff':
      return company('team');
    case 'lead':
      return hasCompany ? company('customers') : tab('deals', 'bank');
    case 'milestone':
      return view.journey ? phone({ app: 'journey' }) : tab('me');
    case 'warning':
      if (/\b(supplier|supply contract)/i.test(text)) return company('suppliers');
      if (/\b(fine|regulator)/i.test(text)) return company('rules');
      if (hasCompany && /\b(staff|quit|left|team)\b/i.test(text)) return company('team');
      break;
  }
  if (/\b(supplier|supply contract)/i.test(text) && hasCompany) return company('suppliers');
  if (/\b(sold shares|secondary|lock-up|stock market|public|dividend|carry|mentor)/i.test(text))
    return phone({ app: 'capital' });
  if (/\b(deposit|loan|bank|repay|credit|licence)/i.test(text)) return tab('bank', 'money', 'me');
  if (/\b(story|reporter|interview|headline)/i.test(text)) return tab('news');
  if (/\b(job|wage|freelance|gig)\b/i.test(text)) return phone({ app: 'jobs' });
  if (/\b(living costs|out of money|burning out|car)\b/i.test(text)) return tab('me');
  if (/\b(company|runway|burn|hire|staff|customers?)\b/i.test(text))
    return hasCompany ? company() : tab('portfolio');
  return null;
}

/**
 * City events (Wave 2): what players can host in the Event Hall, the Hub or
 * their own office, and who comes. Costs are in cost-of-living units so an
 * event costs about the same share of a month's living wherever you are.
 */

export const EVENT_KINDS = [
  'founder-meetup',
  'investor-breakfast',
  'demo-day',
  'customer-mixer',
  'talent-night',
] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

export const EVENT_VENUES = ['hall', 'hub', 'office'] as const;
export type EventVenue = (typeof EVENT_VENUES)[number];

export interface EventKindData {
  label: string;
  description: string;
  /** Who turns up, in plain words. */
  who: string;
  /** Base cost to host at the Event Hall, in cost-of-living units. */
  costCol: number;
  hoursHost: number;
  hoursAttend: number;
  /** Seats: [office/minimum, hall/maximum]. */
  capacity: [number, number];
  /** Share of seats AI guests fill at a normal budget, before stars and market depth. */
  baseTurnout: number;
  /** Needs some standing to host (stars ≥ 1.5 or an investor). */
  needsStanding: boolean;
}

export const EVENT_KIND_DATA: Record<EventKind, EventKindData> = {
  'founder-meetup': {
    label: 'Founder meetup',
    description: 'Drinks for founders to swap notes; good for peers and referred hires.',
    who: 'Founders and talent',
    costCol: 0.4,
    hoursHost: 8,
    hoursAttend: 3,
    capacity: [12, 60],
    baseTurnout: 0.65,
    needsStanding: false,
  },
  'investor-breakfast': {
    label: 'Investor breakfast',
    description: 'A small breakfast where fund partners meet founders: warm intros.',
    who: 'Investors and founders',
    costCol: 1,
    hoursHost: 10,
    hoursAttend: 4,
    capacity: [8, 30],
    baseTurnout: 0.55,
    needsStanding: true,
  },
  'demo-day': {
    label: 'Demo day',
    description: 'Founders pitch on stage while investors watch. Strong turnout lifts the host.',
    who: 'Founders pitch, investors watch',
    costCol: 2,
    hoursHost: 12,
    hoursAttend: 4,
    capacity: [20, 120],
    baseTurnout: 0.5,
    needsStanding: true,
  },
  'customer-mixer': {
    label: 'Customer mixer',
    description: 'Meet buyers from one customer segment: awareness and a few trials.',
    who: 'Customers from one segment',
    costCol: 0.8,
    hoursHost: 10,
    hoursAttend: 4,
    capacity: [15, 80],
    baseTurnout: 0.6,
    needsStanding: false,
  },
  'talent-night': {
    label: 'Talent night',
    description: 'Candidates meet hiring companies; attendees get referred candidates.',
    who: 'Candidates looking for work',
    costCol: 0.6,
    hoursHost: 10,
    hoursAttend: 4,
    capacity: [15, 80],
    baseTurnout: 0.65,
    needsStanding: false,
  },
};

/** Venue cost multiplier and where in the capacity range it sits (0 = minimum, 1 = maximum). */
export const VENUE_DATA: Record<EventVenue, { label: string; costMult: number; size: number }> = {
  hall: { label: 'Event Hall', costMult: 1, size: 1 },
  hub: { label: 'The Hub', costMult: 0.6, size: 0.5 },
  office: { label: 'Your office', costMult: 0.25, size: 0 },
};

/** How far ahead an event can be scheduled (game months). */
export const EVENT_MAX_LEAD_MONTHS = 3;
/** Most a host can add on top of the venue, in cost-of-living units. */
export const EVENT_MAX_BUDGET_COL = 20;
/** Highest ticket price, in cost-of-living units. */
export const EVENT_MAX_TICKET_COL = 2;
/** Held and cancelled events stay in the market view for this many months. */
export const EVENT_RECENT_MONTHS = 3;
/** Contacts kept per player (Wave 6: 300, the coldest dropped first). */
export const CONTACTS_LIMIT = 300;
/** A contact's warmth fades to nothing over this many months without contact. */
export const CONTACT_FADE_MONTHS = 12;

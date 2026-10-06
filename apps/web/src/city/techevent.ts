/**
 * Wave 8 §C: going to a tech event. The phone's Events app (or a person
 * choosing "Go") remembers which event you're heading to; when you walk into
 * that venue, PlaceScene opens the event scene instead of the usual room.
 * Leaving the event clears it, so the venue is a normal place again.
 */
import { t } from '../i18n';

const KIND_LABEL: Record<string, string> = {
  meetup: 'Meetup',
  hackathon: 'Hackathon',
  'demo-day': 'Demo day',
  conference: 'Conference',
  workshop: 'Workshop',
};
/** A tech event's kind, in words. */
export const techKindLabel = (k: string) => t(KIND_LABEL[k] ?? 'Meetup');

let intent: { eventId: string; placeId: string } | null = null;

/** You're going to this event (held at `placeId`). */
export function goToTechEvent(eventId: string, placeId: string) {
  intent = { eventId, placeId };
}

/** The event you chose to attend at this place, if any. */
export function techEventAt(placeId: string): string | null {
  return intent && intent.placeId === placeId ? intent.eventId : null;
}

export function leaveTechEvent() {
  intent = null;
}

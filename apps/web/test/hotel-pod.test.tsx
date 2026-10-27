import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Stars } from '../src/city/HotelList';
import { hotelContents, hotelPlan, hotelRoomOf, isPodStay } from '../src/home/hotel';

/**
 * Play-test round 6, #39: Makola Rooms ("Pod · shared bathroom", one star)
 * read as five stars (the grey ones were filled stars too) and its room was
 * the budget double with a desk and a TV.
 */
afterEach(cleanup);

describe('a one-star pod', () => {
  it('reads as one star', () => {
    const { container } = render(<Stars n={1} />);
    const stars = container.querySelector('[role="img"]')!;
    expect(stars.getAttribute('aria-label')).toBe('1 star');
    expect(stars.textContent).toBe('★☆☆☆☆');
    expect(render(<Stars n={4} />).container.textContent).toBe('★★★★☆');
  });

  it('is a pod: a single bed and a locker, no desk and no TV', () => {
    const stay = { id: 'accra-makola-rooms', tier: 'budget' as const };
    expect(hotelRoomOf(stay)).toBe('Pod · shared bathroom');
    expect(isPodStay(stay)).toBe(true);
    expect(isPodStay({ id: 'accra-osu' })).toBe(false);
    expect(isPodStay(null)).toBe(false);
    const pod = hotelPlan('budget', true);
    expect(pod.slots.bed!.w).toBe(1);
    expect(hotelContents('budget', true)).not.toContain('desk');
    expect(hotelContents('budget', true)).not.toContain('tv');
    expect(hotelContents('budget', true)).toContain('locker');
    // You can still shower and use the (shared) bathroom.
    expect(Object.keys(pod.fixtures)).toEqual(expect.arrayContaining(['shower', 'toilet']));
    // The budget double is unchanged.
    expect(hotelPlan('budget').slots.bed!.w).toBe(2);
    expect(hotelContents('budget')).toContain('desk');
    // Only a budget room can be a pod.
    expect(hotelPlan('luxury', true)).toBe(hotelPlan('luxury'));
  });
});

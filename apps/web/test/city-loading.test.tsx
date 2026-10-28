/**
 * Round 7 (the city is slow to load at start): the loading screen says what
 * it's doing, step by step, and the bar moves with the steps.
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { CityLoading } from '../src/city/CityLoading';

afterEach(cleanup);

it('shows the steps done, the one under way and the bar', () => {
  const { rerender } = render(<CityLoading step="map" city="London" />);
  expect(screen.getByText('Getting London ready')).toBeTruthy();
  const bar = screen.getByRole('progressbar');
  expect(bar.getAttribute('aria-valuenow')).toBe('25');
  const steps = () =>
    [...document.querySelectorAll('.city-load-steps li')].map((li) =>
      li.getAttribute('data-state'),
    );
  expect(steps()).toEqual(['done', 'now', 'next', 'next']);
  expect(screen.getByText(/The map of London/)).toBeTruthy();
  rerender(<CityLoading step="layout" city="London" />);
  expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('50');
  expect(steps()).toEqual(['done', 'done', 'now', 'next']);
  rerender(<CityLoading step="draw" city="London" />);
  expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('75');
  expect(steps()).toEqual(['done', 'done', 'done', 'now']);
  // Not the map: tests and players wait for "Map of London", not this.
  expect(screen.queryByRole('application')).toBeNull();
});

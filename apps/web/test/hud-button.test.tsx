/**
 * Play-test #21: on a busy page (the 3D city at 2 frames a second) HUD taps
 * stopped registering. The finger's lift was handled after the long-press
 * timer had fired, so a quick tap read as "say the button's name". The
 * events' own times decide now.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { HudButton } from '../src/ui';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/** A pointer event stamped with when it really happened. */
function pointer(el: Element, type: 'pointerdown' | 'pointerup', at: number) {
  const e = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(e, {
    pointerType: { value: 'touch' },
    pointerId: { value: 1 },
    timeStamp: { value: at },
  });
  fireEvent(el, e);
}

it('presses on a quick tap even when the lift is handled after the long-press timer', async () => {
  vi.useFakeTimers();
  const onClick = vi.fn();
  render(<HudButton icon="phone" label="Phone" onClick={onClick} />);
  const btn = screen.getByRole('button', { name: 'Phone' });
  pointer(btn, 'pointerdown', 1000);
  // The page is busy for 600 ms: the timer runs before the lift is handled.
  await act(() => vi.advanceTimersByTimeAsync(600));
  pointer(btn, 'pointerup', 1080);
  fireEvent.click(btn);
  expect(onClick).toHaveBeenCalledTimes(1);
  expect(document.querySelector('[data-hud-tip]')).toBeNull();
});

it('still says the name (and doesn’t press) on a real long press', async () => {
  vi.useFakeTimers();
  const onClick = vi.fn();
  render(<HudButton icon="phone" label="Phone" onClick={onClick} />);
  const btn = screen.getByRole('button', { name: 'Phone' });
  pointer(btn, 'pointerdown', 1000);
  await act(() => vi.advanceTimersByTimeAsync(600));
  pointer(btn, 'pointerup', 1600);
  fireEvent.click(btn);
  expect(onClick).not.toHaveBeenCalled();
  expect(document.querySelector('[data-hud-tip]')).not.toBeNull();
});

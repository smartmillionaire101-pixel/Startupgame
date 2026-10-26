import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { GameActivity } from '../src/GameActivity';
import { api } from '../src/api';
import { musicSamples, useMusic } from '../src/music';
import { setSetting } from '../src/phone/settings';

vi.mock('../src/store', () => ({
  useView: () => ({ view: { me: { id: 'test' }, living: { dates: [] } }, toast: () => {} }),
  useGame: () => ({ busy: false, lite: false }),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it('refreshes totals, clears failed counts, and pauses heartbeats in hidden tabs', async () => {
  vi.useFakeTimers();
  const heartbeat = vi.spyOn(api, 'online').mockResolvedValue({ count: 3 });
  render(<GameActivity />);
  await act(async () => {});
  expect(screen.getByRole('status').textContent).toContain('3 online');
  heartbeat.mockResolvedValue({ count: 4 });
  await act(() => vi.advanceTimersByTimeAsync(15_000));
  expect(screen.getByRole('status').textContent).toContain('4 online');
  heartbeat.mockRejectedValue(new Error('offline'));
  await act(() => vi.advanceTimersByTimeAsync(15_000));
  expect(screen.getByRole('status').textContent).toBe('Online count unavailable');
  const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
  fireEvent(document, new Event('visibilitychange'));
  await act(() => vi.advanceTimersByTimeAsync(60_000));
  expect(heartbeat).toHaveBeenCalledTimes(3);
  visibility.mockReturnValue('visible');
  heartbeat.mockResolvedValue({ count: 1 });
  await act(async () => {
    fireEvent(document, new Event('visibilitychange'));
  });
  expect(screen.getByRole('status').textContent).toContain('1 online');
  cleanup();
  await act(() => vi.advanceTimersByTimeAsync(60_000));
  expect(heartbeat).toHaveBeenCalledTimes(4);
});

it('opens Online now from the count, grouped by city, polling only while open', async () => {
  vi.useFakeTimers();
  vi.spyOn(api, 'online').mockResolvedValue({ count: 3 });
  const row = (id: string, name: string, here: boolean, city: string) => ({
    id,
    name,
    handle: id,
    role: 'founder',
    backgroundId: 'f-engineer',
    stars: 2,
    company: null,
    market: here ? 'lagos' : 'nairobi',
    city,
    here,
    place: here ? 'hub' : null,
    placeName: here ? 'The Hub' : null,
    inGame: here ? ('snooker' as const) : null,
  });
  const list = vi.spyOn(api, 'onlinePlayers').mockResolvedValue({
    players: [row('p1', 'Bola', true, 'Lagos'), row('p2', 'Wanjiru', false, 'Nairobi')],
  });
  render(<GameActivity />);
  await act(async () => {});
  expect(list).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: /3 online/ }));
  await act(async () => {});
  const sheet = screen.getByRole('dialog', { name: 'Online now' });
  expect(sheet.textContent).toContain('In your city');
  expect(sheet.textContent).toContain('Bola');
  expect(sheet.textContent).toContain('Playing Snooker');
  expect(sheet.textContent).toContain('Other cities');
  expect(sheet.textContent).toContain('Nairobi');
  expect(screen.getAllByRole('button', { name: 'Invite to play' })).toHaveLength(2);
  await act(() => vi.advanceTimersByTimeAsync(15_000));
  expect(list).toHaveBeenCalledTimes(2);
  fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  await act(() => vi.advanceTimersByTimeAsync(60_000));
  expect(list).toHaveBeenCalledTimes(2);
});

it('shows just the number, a dash when unavailable, and no music or feedback buttons', async () => {
  vi.useFakeTimers();
  const heartbeat = vi.spyOn(api, 'online').mockResolvedValue({ count: 7 });
  setSetting('sound', true);
  const { container } = render(<GameActivity />);
  await act(async () => {});
  const count = container.querySelector('.online-count')!;
  expect(count.classList.contains('topbar-online')).toBe(true);
  expect(count.querySelector('.sr-only')!.textContent).toBe(' online');
  expect(screen.queryByRole('button', { name: 'Game music' })).toBeNull();
  expect(container.querySelector('[data-feedback-open]')).toBeNull();
  heartbeat.mockRejectedValue(new Error('offline'));
  await act(() => vi.advanceTimersByTimeAsync(15_000));
  expect(count.classList.contains('is-unavailable')).toBe(true);
});

// Renders the whole loop sample by sample: slow on a busy machine, hence the longer limit.
it('produces a finite, audible loop without clipping', () => {
  const samples = musicSamples();
  let peak = 0;
  let energy = 0;
  for (const sample of samples) {
    expect(Number.isFinite(sample)).toBe(true);
    peak = Math.max(peak, Math.abs(sample));
    energy += sample * sample;
  }
  expect(samples.length / 22_050).toBe(20);
  expect(peak).toBeLessThan(1);
  expect(Math.sqrt(energy / samples.length)).toBeGreaterThan(0.01);
}, 30_000);

it('starts audio after a gesture, suspends when hidden, and closes on mute', () => {
  const resume = vi.fn().mockResolvedValue(undefined);
  const suspend = vi.fn().mockResolvedValue(undefined);
  const close = vi.fn().mockResolvedValue(undefined);
  const start = vi.fn();
  const stop = vi.fn();
  const connect = vi.fn().mockReturnValue({ connect: vi.fn() });
  class Context {
    resume = resume;
    suspend = suspend;
    close = close;
    createBuffer = () => ({ getChannelData: () => new Float32Array(441_000) });
    createBufferSource = () => ({ connect, start, stop });
    createGain = () => ({ gain: { value: 0 } });
  }
  vi.stubGlobal('AudioContext', Context);
  function Music({ enabled }: { enabled: boolean }) {
    useMusic(enabled);
    return null;
  }
  const { rerender } = render(<Music enabled />);
  expect(start).not.toHaveBeenCalled();
  fireEvent.pointerDown(document);
  fireEvent.keyDown(document, { key: 'a' });
  expect(start).toHaveBeenCalledTimes(1);
  const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
  fireEvent(document, new Event('visibilitychange'));
  expect(suspend).toHaveBeenCalledOnce();
  visibility.mockReturnValue('visible');
  fireEvent(document, new Event('visibilitychange'));
  expect(resume).toHaveBeenCalledTimes(3);
  rerender(<Music enabled={false} />);
  expect(stop).toHaveBeenCalledOnce();
  expect(close).toHaveBeenCalledOnce();
  fireEvent.pointerDown(document);
  expect(start).toHaveBeenCalledTimes(1);
});

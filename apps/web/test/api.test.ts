import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from '../src/api';
import { isStaleChunk } from '../src/stale';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const page = (status: number) =>
  new Response('<html>Bad gateway</html>', { status, headers: { 'content-type': 'text/html' } });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('api while a new release goes live', () => {
  it('sends again when the host answers with its own error page, then succeeds', async () => {
    vi.useFakeTimers();
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(page(502))
      .mockResolvedValueOnce(json(200, { ok: true }));
    vi.stubGlobal('fetch', fetch);
    const done = api.command({ type: 'tick' } as never);
    await vi.runAllTimersAsync();
    await expect(done).resolves.toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('says the game is updating when it keeps happening', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn().mockImplementation(() => Promise.resolve(page(503)));
    vi.stubGlobal('fetch', fetch);
    const done = api.command({ type: 'tick' } as never).catch((e: unknown) => e);
    await vi.runAllTimersAsync();
    const err = (await done) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe('updating');
    expect(err.message).toMatch(/updating/);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('never sends again when the game itself answered', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(json(500, { error: { code: 'error', message: 'Something went wrong.' } }));
    vi.stubGlobal('fetch', fetch);
    await expect(api.command({ type: 'tick' } as never)).rejects.toMatchObject({
      status: 500,
      message: 'Something went wrong.',
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('says so when the network is down', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(api.command({ type: 'tick' } as never)).rejects.toMatchObject({
      code: 'offline',
    });
  });
});

describe('isStaleChunk', () => {
  it('recognises each browser’s wording for a missing code file', () => {
    expect(
      isStaleChunk(
        new TypeError('Failed to fetch dynamically imported module: /assets/Sales-abc.js'),
      ),
    ).toBe(true);
    expect(isStaleChunk(new TypeError('Importing a module script failed.'))).toBe(true);
    expect(isStaleChunk(new TypeError('error loading dynamically imported module'))).toBe(true);
    expect(isStaleChunk(new Error('Cannot read properties of undefined'))).toBe(false);
  });
});

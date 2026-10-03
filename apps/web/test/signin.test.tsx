import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { App } from '../src/App';
import { GameProvider } from '../src/store';

const json = (status: number, body: unknown) =>
  Promise.resolve(
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }),
  );

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('sign in', () => {
  it('shows sign-in when signed out and sends the CSRF header with the phone and DOB', async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (url === '/api/meta')
        return json(200, {
          disclaimer: 'This is a game. Nothing here is financial, legal, or tax advice.',
          markets: [],
          backgrounds: [],
          industries: [],
          revenueModels: [],
          stages: [],
          slides: [],
          maxSlides: 5,
          incorporation: {},
          chatMaxLength: 280,
          devTools: false,
        });
      if (url === '/api/state')
        return json(401, { error: { code: 'auth', message: 'Sign in first.' } });
      if (url === '/api/auth/start') return json(200, { sent: true, devCode: '123456' });
      return json(404, {});
    });
    render(
      <GameProvider>
        <App />
      </GameProvider>,
    );
    await screen.findByText('Build, invest and grow.');
    expect(screen.getByText(/Nothing here is financial/)).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Mobile number'), {
      target: { value: '+2348031234567' },
    });
    fireEvent.change(screen.getByLabelText('Date of birth'), { target: { value: '1995-05-04' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send code' }));
    await waitFor(() => expect(screen.getByText('Dev mode: your code is 123456')).toBeTruthy());

    const start = calls.find((c) => c.url === '/api/auth/start')!;
    expect((start.init?.headers as Record<string, string>)['x-runway']).toBe('1');
    expect(JSON.parse(start.init!.body as string)).toEqual({
      phone: '+2348031234567',
      dob: { year: 1995, month: 5, day: 4 },
    });
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { App } from '../src/App';
import { GameProvider } from '../src/store';

const json = (status: number, body: unknown) =>
  Promise.resolve(
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }),
  );

const META = {
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
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
});

function stub(handler: (url: string, init?: RequestInit) => Promise<Response> | undefined) {
  const calls: { url: string; init?: RequestInit }[] = [];
  vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    if (url === '/api/meta') return json(200, META);
    return handler(url, init) ?? json(404, {});
  });
  return calls;
}

const renderApp = () =>
  render(
    <GameProvider>
      <App />
    </GameProvider>,
  );

describe('sign in', () => {
  it('joins with only username, email and role in one request', async () => {
    const calls = stub((url) => {
      if (url === '/api/state')
        return json(401, { error: { code: 'auth', message: 'Sign in first.' } });
      if (url === '/api/onboarding')
        return json(422, { error: { code: 'player.handle', message: 'That handle is taken.' } });
    });
    renderApp();
    await screen.findByText('Build, invest and grow.');
    expect(screen.getAllByRole('textbox')).toHaveLength(2);
    expect(screen.getAllByRole('combobox')).toHaveLength(1);
    expect(screen.queryByLabelText('Company name')).toBeNull();
    expect(screen.queryByRole('checkbox')).toBeNull();
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'ada_test' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'ada@example.com' } });
    fireEvent.change(screen.getByLabelText('Join as'), { target: { value: 'investor' } });
    fireEvent.click(screen.getByRole('button', { name: 'Play now' }));
    await screen.findByRole('alert');
    const submitted = calls.find((c) => c.url === '/api/onboarding')!;
    expect((submitted.init?.headers as Record<string, string>)['x-runway']).toBe('1');
    expect(JSON.parse(submitted.init!.body as string)).toEqual({
      username: 'ada_test',
      email: 'ada@example.com',
      role: 'investor',
      adult: true,
    });
    expect(screen.getByRole('alert').textContent).toBe('That handle is taken.');
    expect((screen.getByLabelText('Email') as HTMLInputElement).value).toBe('ada@example.com');
  });

  it('asks for a log-in link by email and shows the preview link when the server gives one', async () => {
    const calls = stub((url) => {
      if (url === '/api/state') return json(401, { error: { code: 'auth', message: 'x' } });
      if (url === '/api/auth/email')
        return json(200, { ok: true, sent: true, devLink: 'http://x.test/?signin=abc' });
    });
    renderApp();
    fireEvent.click(await screen.findByRole('button', { name: 'Already saved? Log in' }));
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'ada@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Email me a sign-in link' }));
    await screen.findByText(/we sent a link to ada@example.com/);
    const link = screen.getByRole('link', { name: 'Preview: open your sign-in link' });
    expect(link.getAttribute('href')).toBe('http://x.test/?signin=abc');
    const body = JSON.parse(calls.find((c) => c.url === '/api/auth/email')!.init!.body as string);
    expect(body).toEqual({ email: 'ada@example.com', intent: 'login', lang: 'en' });
  });

  it('says so when email sign-in is off', async () => {
    stub((url) => {
      if (url === '/api/state') return json(401, { error: { code: 'auth', message: 'x' } });
      if (url === '/api/auth/email')
        return json(503, {
          error: { code: 'email.off', message: 'Email sign-in isn’t switched on yet.' },
        });
    });
    renderApp();
    fireEvent.click(await screen.findByRole('button', { name: 'Already saved? Log in' }));
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'ada@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Email me a sign-in link' }));
    await screen.findByText('Email sign-in isn’t switched on yet.');
  });

  it('opens a sign-in link from the address bar, then strips it', async () => {
    window.history.replaceState(null, '', '/?signin=tok_123&x=1');
    const order: string[] = [];
    const calls = stub((url) => {
      order.push(url);
      if (url === '/api/auth/email/verify')
        return json(200, {
          ok: true,
          intent: 'login',
          isNew: false,
          account: { guest: false, email: 'ada@example.com' },
        });
      if (url === '/api/state')
        return json(200, { onboarded: false, account: { guest: false, email: 'ada@example.com' } });
    });
    renderApp();
    await screen.findByText('Signed in as ada@example.com.');
    const verify = calls.find((c) => c.url === '/api/auth/email/verify')!;
    expect(JSON.parse(verify.init!.body as string)).toEqual({ token: 'tok_123' });
    expect(order.indexOf('/api/auth/email/verify')).toBeLessThan(order.indexOf('/api/state'));
    expect(window.location.search).toBe('?x=1');
  });
});

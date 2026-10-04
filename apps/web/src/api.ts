/** Typed client for the Runway API. All mutations send the CSRF header. */
import type { Command, PlayerView } from '@runway/engine';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    credentials: 'same-origin',
    headers: {
      'x-runway': '1',
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as {
    error?: { code: string; message: string };
  };
  if (!res.ok)
    throw new ApiError(
      res.status,
      data.error?.code ?? 'error',
      data.error?.message ?? 'Something went wrong.',
    );
  return data as T;
}

export interface Meta {
  disclaimer: string;
  markets: {
    id: string;
    name: string;
    country: string;
    currency: string;
    timeZone: string;
    card: Record<'costOfLiving' | 'talent' | 'capitalAccess' | 'regulation', number>;
    costOfLiving: number;
  }[];
  backgrounds: { id: string; role: string; name: string; strengths: string; gaps: string }[];
  industries: { id: string; label: string }[];
  revenueModels: string[];
  stages: string[];
  slides: string[];
  maxSlides: number;
  incorporation: Record<string, { label: string; costCol: number }>;
  chatMaxLength: number;
  /** Bank licences (§8). Minimum capital is minCapitalCol × the market's monthly cost of living. */
  bankTypes: { id: string; label: string; minCapitalCol: number; earns: string; risk: string }[];
  /** Server has development tools enabled (never in production). */
  devTools: boolean;
}

export type StateResponse = { onboarded: false } | { onboarded: true; view: PlayerView };

export interface ChatSummary {
  id: string;
  with: { id: string; name: string; handle: string; role: string };
  blocked: boolean;
  blockedByMe: boolean;
  lastText: string | null;
  lastAt: number | null;
}

export const api = {
  meta: () => request<Meta>('GET', '/api/meta'),
  state: () => request<StateResponse>('GET', '/api/state'),
  command: <R = unknown>(command: Command) =>
    request<{ ok: true; result: R; version: number }>('POST', '/api/commands', { command }),
  startAuth: (phone: string, dob: { year: number; month: number; day: number }) =>
    request<{ sent: true; devCode?: string; codeShown?: 'dev' | 'no-sms' }>(
      'POST',
      '/api/auth/start',
      { phone, dob },
    ),
  verify: (phone: string, code: string) =>
    request<{ ok: true; isNew: boolean }>('POST', '/api/auth/verify', { phone, code }),
  logout: () => request('POST', '/api/auth/logout', {}),
  deleteAccount: () => request('DELETE', '/api/account'),
  checkName: (name: string, market: string, kind: 'company' | 'handle') =>
    request<{ ok: boolean; reason?: string }>(
      'GET',
      `/api/names/check?${new URLSearchParams({ name, market, kind })}`,
    ),
  digest: (market: string) =>
    request<{ market: string; month: number; note: string; headlines: PlayerView['digest'] }>(
      'GET',
      `/api/digest?market=${market}`,
    ),
  devSettle: (market: string) => request<{ month: number }>('POST', '/api/dev/settle', { market }),
  chats: () => request<{ chats: ChatSummary[] }>('GET', '/api/chats'),
  starters: (playerId: string) =>
    request<{ starters: string[] }>('GET', `/api/chats/starters/${playerId}`),
  startChat: (playerId: string, starter: string) =>
    request<{ chat: ChatSummary }>('POST', '/api/chats', { playerId, starter }),
  messages: (chatId: string) =>
    request<{
      chat: ChatSummary;
      messages: { id: number; mine: boolean; text: string; at: number }[];
    }>('GET', `/api/chats/${chatId}/messages`),
  send: (chatId: string, text: string) =>
    request<{ ok: true; flagged: boolean }>('POST', `/api/chats/${chatId}/messages`, { text }),
  block: (chatId: string) => request('POST', `/api/chats/${chatId}/block`, {}),
  report: (chatId: string, reason: 'harassment' | 'scam' | 'spam' | 'other') =>
    request('POST', `/api/chats/${chatId}/report`, { reason }),
};

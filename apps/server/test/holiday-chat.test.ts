/**
 * Holiday with friends: an AI friend answers an invitation at once, and the
 * invitation and their reply land in your chat with them.
 */
import { describe, expect, it } from 'vitest';
import { api, founderSetup, makeApp, playAsGuest } from './helpers.js';

describe('holiday invitations to AI friends', () => {
  it('puts the invitation and the reply in the AI chat thread', async () => {
    const { app } = await makeApp();
    const s = api(app, await playAsGuest(app));
    expect((await s.command(founderSetup('holiday_host'))).statusCode).toBe(200);
    const friend = 'npc:lagos:7';
    expect((await s.command({ type: 'contact.save', personId: friend, name: '' })).statusCode).toBe(
      200,
    );
    expect(
      (await s.command({ type: 'travel.book', to: 'london', hotel: 'budget' })).statusCode,
    ).toBe(200);
    const r = await s.command({ type: 'holiday.invite', inviteeIds: [friend], hostPays: true });
    expect(r.statusCode).toBe(200);
    const reply = r.json().result.replies[0];
    expect(['yes', 'pay', 'busy']).toContain(reply.answer);

    const t = await s.get(`/api/ai-chat/${encodeURIComponent(friend)}`);
    expect(t.statusCode).toBe(200);
    const msgs = t.json().messages as { mine: boolean; text: string }[];
    expect(msgs.map((m) => m.mine)).toEqual([true, false]);
    expect(msgs[0]!.text).toContain('Fancy a holiday in London with me this month? My treat');
    expect(msgs[1]!.text).toBe(reply.text);
    await app.close();
  });
});

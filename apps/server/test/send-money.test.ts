/**
 * Sending money between two players, end to end through the Netlify function
 * handler: two function instances (two runtimes) share one store, each player
 * is served by a different instance, and both players' views must show the
 * debit and the credit, at home, across cities and while travelling.
 */
import { describe, expect, it } from 'vitest';
import { MemoryKv } from '../src/serverless/kv.js';
import { configFor, createRuntime, handle } from '../src/serverless/netlify.js';
import { founderSetup } from './helpers.js';

type Rt = Awaited<ReturnType<typeof createRuntime>>;

interface View {
  worldVersion: number;
  me: { id: string; location?: { market: string } | null };
  accounts: { local: { balance: number; currency: string; recent: { memo: string }[] } };
  inbox?: { text: string }[];
}

function client(home: Rt) {
  let cookie = '';
  const call = async (method: string, path: string, body?: unknown, via: Rt = home) => {
    const res = await handle(
      via,
      new Request(`https://runway.test${path}`, {
        method,
        headers: {
          'content-type': 'application/json',
          'x-runway': '1',
          ...(cookie ? { cookie } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
      '203.0.113.7',
    );
    const set = res.headers.getSetCookie().find((c) => c.startsWith('rw_session='));
    if (set) cookie = set.split(';')[0]!;
    const text = await res.text();
    return { status: res.status, json: text ? JSON.parse(text) : null };
  };
  return {
    call,
    async view(via: Rt = home): Promise<View> {
      const r = await call('GET', '/api/state', undefined, via);
      expect(r.status).toBe(200);
      return r.json.view as View;
    },
    async command(command: unknown, via: Rt = home) {
      const r = await call('POST', '/api/commands', { command }, via);
      expect(r.status, JSON.stringify(r.json)).toBe(200);
      return r.json.result;
    },
    async join(phone: string, handle: string, market = 'lagos') {
      const start = await call('POST', '/api/auth/start', {
        phone,
        dob: { year: 1994, month: 2, day: 3 },
      });
      await call('POST', '/api/auth/verify', { phone, code: start.json.devCode });
      await this.command({ ...founderSetup(handle), market });
      return (await this.view()).me.id;
    },
  };
}

async function twoInstances() {
  const kv = new MemoryKv();
  const config = await configFor(kv, 'preview');
  const rt1 = await createRuntime(kv, config);
  const rt2 = await createRuntime(kv, config);
  return { rt1, rt2, a: client(rt1), b: client(rt2) };
}

const bal = (v: View) => v.accounts.local.balance;

describe('sending money between players (two function instances, one store)', () => {
  it('debits the sender and credits the friend in both players’ views, on every instance', async () => {
    const { rt1, rt2, a, b } = await twoInstances();
    await a.join('+2348039990001', 'ada_sender');
    const bId = await b.join('+2348039990002', 'bisi_friend');
    const a0 = bal(await a.view());
    const b0 = bal(await b.view());

    // A sends from instance 1, which last saw the world before B joined on instance 2.
    const r = await a.command({
      type: 'money.send',
      toPlayerId: bId,
      amount: 500_000,
      note: 'Friends and family round',
    });
    expect(r).toMatchObject({ amount: 500_000, received: 500_000 });

    for (const via of [rt1, rt2]) {
      const va = await a.view(via);
      const vb = await b.view(via);
      expect(bal(va)).toBe(a0 - 500_000 - r.fee);
      expect(bal(vb)).toBe(b0 + 500_000);
      expect(va.accounts.local.recent[0]!.memo).toContain('Transfer fee');
      expect(vb.accounts.local.recent[0]!.memo).toContain('Transfer:');
      expect(vb.inbox?.some((i) => i.text.includes('Friends and family round'))).toBe(true);
    }

    // B passes the money on into their company: it leaves the personal account.
    const vb = await b.view();
    const companyId = (vb as unknown as { companies: { id: string }[] }).companies[0]!.id;
    await b.command({ type: 'company.inject', companyId, amount: 500_000 });
    expect(bal(await b.view(rt1))).toBe(b0);
  });

  it('works across cities (other currency) and while the sender or the friend is travelling', async () => {
    const { rt1, rt2, a, b } = await twoInstances();
    await a.join('+2348039990011', 'ada_abroad');
    const bId = await b.join('+447700900011', 'lou_london', 'london');
    const a0 = bal(await a.view());
    const b0 = bal(await b.view());
    expect((await b.view()).accounts.local.currency).toBe('GBP');

    // Lagos → London: naira out, pounds in.
    const r1 = await a.command({ type: 'money.send', toPlayerId: bId, amount: 1_000_000 });
    expect(r1.receivedCurrency).toBe('GBP');
    expect(r1.received).toBeGreaterThan(0);
    expect(bal(await a.view(rt2))).toBe(a0 - 1_000_000 - r1.fee);
    expect(bal(await b.view(rt1))).toBe(b0 + r1.received);

    // A flies to London (still paying from the naira account) and sends again from there.
    const fly = await a.command({ type: 'travel.fly', to: 'london' });
    const aAbroad = await a.view(rt2);
    expect(aAbroad.me.location?.market).toBe('london');
    const a1 = bal(aAbroad);
    expect(a1).toBe(a0 - 1_000_000 - r1.fee - fly.cost);
    const r2 = await a.command({ type: 'money.send', toPlayerId: bId, amount: 200_000 }, rt2);
    expect(bal(await a.view(rt1))).toBe(a1 - 200_000 - r2.fee);
    expect(bal(await b.view(rt1))).toBe(b0 + r1.received + r2.received);

    // The friend travels too (to Lagos) and pays A back in pounds.
    await b.command({ type: 'travel.fly', to: 'lagos' });
    const b1 = bal(await b.view());
    const a2 = bal(await a.view());
    const back = await b.command({
      type: 'money.send',
      toPlayerId: (await a.view()).me.id,
      amount: 1_000,
    });
    expect(back.currency).toBe('GBP');
    expect(back.receivedCurrency).toBe('NGN');
    expect(bal(await b.view(rt1))).toBe(b1 - 1_000 - back.fee);
    expect(bal(await a.view(rt2))).toBe(a2 + back.received);
  });

  it('gives both players a statement line and a receipt, and nobody else', async () => {
    const { rt1, rt2, a, b } = await twoInstances();
    await a.join('+2348039990021', 'ada_receipts');
    const bId = await b.join('+2348039990022', 'bisi_receipts');
    const r = await a.command({
      type: 'money.send',
      toPlayerId: bId,
      amount: 250_000,
      note: 'Suya money',
    });
    expect(r.receiptId).toMatch(/^TX\d{8}$/);

    const sa = await a.call('GET', '/api/statement?dir=out', undefined, rt2);
    expect(sa.status).toBe(200);
    const [feeLine, sent] = sa.json.statement.lines;
    expect(sent).toMatchObject({ ref: r.receiptId, amount: -250_000, note: 'Suya money' });
    expect(sent.counterparty).toMatchObject({ kind: 'player', playerId: bId });
    expect(feeLine).toMatchObject({ ref: r.receiptId, amount: -r.fee, fee: true });
    expect(sa.json.statement.totals.out).toBeGreaterThanOrEqual(250_000 + r.fee);

    const sb = await b.call('GET', '/api/statement?q=suya', undefined, rt1);
    expect(sb.json.statement.lines).toHaveLength(1);
    expect(sb.json.statement.lines[0]).toMatchObject({ amount: 250_000, ref: r.receiptId });

    const ra = await a.call('GET', `/api/receipts/${r.receiptId}`, undefined, rt1);
    expect(ra.json.receipt).toMatchObject({
      direction: 'out',
      amount: 250_000,
      fee: r.fee,
      total: 250_000 + r.fee,
      note: 'Suya money',
    });
    const rb = await b.call('GET', `/api/receipts/${r.receiptId}`, undefined, rt2);
    expect(rb.json.receipt).toMatchObject({ direction: 'in', amount: 250_000, fee: 0 });

    // A receipt of B's own (their starting savings) isn't A's to read.
    const bLines = (await b.call('GET', '/api/statement?dir=in', undefined, rt1)).json.statement
      .lines as { ref: string | null; description: string }[];
    const own = bLines.find((l) => l.description === 'Starting savings' && l.ref)!;
    expect((await a.call('GET', `/api/receipts/${own.ref}`)).status).toBe(404);
    expect((await a.call('GET', '/api/statement?account=nope')).status).toBe(400);
  });

  it('serves the month recap, with personal totals matching the statement', async () => {
    const { rt1, a } = await twoInstances();
    await a.join('+2348039990031', 'ada_recap');
    const view = await a.view();
    expect(view.recap.month).toBe(view.market.month);
    const r = await a.call('GET', `/api/recap?month=${view.market.month}`, undefined, rt1);
    expect(r.status).toBe(200);
    const s = await a.call('GET', `/api/statement?month=${view.market.month}`, undefined, rt1);
    const mine = r.json.recap.personal[0];
    expect(mine.in).toBe(s.json.statement.totals.in);
    expect(mine.out).toBe(s.json.statement.totals.out);
    expect((await a.call('GET', '/api/recap?month=-1')).status).toBe(400);
  });
});

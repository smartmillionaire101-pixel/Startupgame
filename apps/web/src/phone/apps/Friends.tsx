/**
 * Wave 8 §C: doing things with friends from the phone. Send money (pick a
 * friend, an amount, a note, confirm: `money.send`), plan a hangout (a venue,
 * when, who: `hangout.plan`) and answer invitations (visits and hangouts).
 * Used by Bank (the wallet), Contacts, Messages and Events.
 */
import { useState } from 'react';
import '../friends.css';
import { money, moneyExact, parseAmount } from '../../format';
import { t, tx } from '../../i18n';
import { useView } from '../../store';
import { Button } from '../../ui';
import { businessesOf } from '../../city/contract';
import { cityViewOf } from '../../city/travel';
import {
  feeFor,
  friendsOf,
  hangoutsOf,
  sendLimitsOf,
  visitingOf,
  visitsOf,
  type Friend,
} from '../friends';
import { openVisit } from '../Visit';
import { Avatar, H, Nothing, type PhoneCtx } from '../shared';

// ---------------------------------------------------------------- Send money

type SendStep = 'who' | 'amount' | 'confirm' | 'sent';

interface SendResult {
  amount?: number;
  fee?: number;
  received?: number;
  receivedCurrency?: string;
}

export function SendMoney({ to, onDone }: { to?: string; onDone: () => void }) {
  const { view, send, busy } = useView();
  const friends = friendsOf(view);
  const limits = sendLimitsOf(view);
  const cur = limits?.currency ?? view.accounts.local?.currency ?? view.market.currency;
  const pocket = view.accounts.local?.balance ?? 0;
  const preset = to ? (friends.find((f) => f.id === to) ?? null) : null;
  const [who, setWho] = useState<Friend | null>(preset);
  const [step, setStep] = useState<SendStep>(preset ? 'amount' : 'who');
  const [text, setText] = useState('');
  const [note, setNote] = useState('');
  const [result, setResult] = useState<SendResult | null>(null);
  const amount = parseAmount(text) ?? 0;
  const fee = amount > 0 ? feeFor(amount, limits) : 0;
  const left = limits?.left ?? Infinity;
  const problem =
    amount <= 0
      ? t('Enter an amount.')
      : amount > left
        ? t('You can send up to {amount} more today.', { amount: money(left, cur) })
        : amount + fee > pocket
          ? t('Not enough money for that and the fee.')
          : null;

  const confirm = async () => {
    if (!who) return;
    const r = await send<SendResult>({
      type: 'money.send',
      toPlayerId: who.id,
      amount,
      ...(note.trim() ? { note: note.trim() } : {}),
    });
    if (!r) return;
    setResult(r);
    setStep('sent');
  };

  const chips = limits
    ? [0.05, 0.1, 0.25, 0.5].map((f) => Math.max(100, Math.round((limits.limit * f) / 100) * 100))
    : [];

  return (
    <section className="phone-card phone-send" aria-label={t('Send money')} data-send-step={step}>
      <div className="spread">
        <H>{t('Send money')}</H>
        <button type="button" className="btn btn-ghost" onClick={onDone}>
          {step === 'sent' ? t('Done') : t('Cancel')}
        </button>
      </div>
      {step === 'who' &&
        (friends.length === 0 ? (
          <Nothing icon="contacts">
            {t('No friends to pay yet. Meet players in town and save them to your contacts.')}
          </Nothing>
        ) : (
          <ul className="phone-list" aria-label={t('Pick a friend')}>
            {friends.map((f) => (
              <li key={f.id}>
                <button
                  type="button"
                  className="phone-row"
                  data-friend={f.id}
                  onClick={() => {
                    setWho(f);
                    setStep('amount');
                  }}
                >
                  <Avatar name={f.name} />
                  <span className="phone-row-main">
                    <span className="item-title">{f.name}</span>
                    <span className="small muted">
                      {f.contact ? t('In your contacts') : t('In your city')}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ))}
      {step === 'amount' && who && (
        <div className="phone-stack">
          <div className="phone-row static">
            <Avatar name={who.name} />
            <span className="item-title">{t('To {name}', { name: who.name })}</span>
          </div>
          <label className="phone-field">
            <span className="small muted">{t('Amount ({currency})', { currency: cur })}</span>
            <input
              className="phone-search"
              inputMode="decimal"
              aria-label={t('Amount')}
              placeholder="0"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </label>
          {chips.length > 0 && (
            <div className="chips" role="group" aria-label={t('Quick amounts')}>
              {chips.map((c) => (
                <button
                  key={c}
                  type="button"
                  className="chip"
                  onClick={() => setText(String(c / 100))}
                >
                  {money(c, cur)}
                </button>
              ))}
            </div>
          )}
          <label className="phone-field">
            <span className="small muted">{t('Note (optional)')}</span>
            <input
              className="phone-search"
              maxLength={80}
              aria-label={t('Note')}
              placeholder={t('For lunch')}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          <p className="small muted">
            {limits
              ? t('Fee 1% (at least {min}). You can send {left} more today.', {
                  min: money(limits.minFee, cur),
                  left: money(limits.left, cur),
                })
              : t('Fee 1%.')}
          </p>
          {amount > 0 && problem && <p className="small bad">{problem}</p>}
          <Button disabled={!!problem} onClick={() => setStep('confirm')}>
            {t('Continue')}
          </Button>
        </div>
      )}
      {step === 'confirm' && who && (
        <div className="phone-stack" data-confirm>
          <div className="phone-send-total">{money(amount, cur)}</div>
          <p className="small">
            {t('To {name}', { name: who.name })}
            {note.trim() ? ` · “${note.trim()}”` : ''}
          </p>
          <div className="spread small">
            <span>{t('Fee')}</span>
            <span>{money(fee, cur)}</span>
          </div>
          <div className="spread small">
            <span>{t('Total')}</span>
            <b>{money(amount + fee, cur)}</b>
          </div>
          <div className="row">
            <Button variant="ghost" onClick={() => setStep('amount')}>
              {t('Back')}
            </Button>
            <Button disabled={busy} onClick={() => void confirm()}>
              {t('Send {amount}', { amount: money(amount, cur) })}
            </Button>
          </div>
        </div>
      )}
      {step === 'sent' && who && (
        <div className="phone-stack" role="status" data-sent>
          <div className="phone-send-done" aria-hidden="true">
            ✓
          </div>
          <p className="item-title">
            {t('Sent {amount} to {name}.', {
              amount: money(result?.amount ?? amount, cur),
              name: who.name,
            })}
          </p>
          {result?.received !== undefined && result.receivedCurrency !== cur && (
            <p className="small muted">
              {t('They receive {amount}.', {
                amount: money(result.received, result.receivedCurrency ?? cur),
              })}
            </p>
          )}
          <p className="small" data-balance-after>
            {t('Your balance: {amount}', { amount: moneyExact(pocket, cur) })}
          </p>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- Plan a hangout

const HANGOUT_CATEGORIES = new Set(['food', 'hospitality', 'health']);

export function PlanHangout({ invitee, onDone }: { invitee?: string; onDone: () => void }) {
  const { view, send, busy } = useView();
  const friends = friendsOf(view);
  const venues = businessesOf(cityViewOf(view))
    .filter((b) => b.open && b.venue && HANGOUT_CATEGORIES.has(b.category))
    .sort(
      (a, b) =>
        Number(/bar|pub|lounge|club/.test(b.kind)) - Number(/bar|pub|lounge|club/.test(a.kind)) ||
        a.name.localeCompare(b.name),
    );
  const [venue, setVenue] = useState<string>(venues[0]?.id ?? '');
  const [when, setWhen] = useState<'now' | 'tonight'>('tonight');
  const [who, setWho] = useState<string[]>(invitee ? [invitee] : []);
  const toggle = (id: string) =>
    setWho((xs) => (xs.includes(id) ? xs.filter((x) => x !== id) : [...xs, id].slice(0, 8)));
  const plan = async () => {
    const r = await send(
      { type: 'hangout.plan', businessId: venue, inviteeIds: who, when },
      t('Plans made. Your friends have been told.'),
    );
    if (r !== null) onDone();
  };
  return (
    <section className="phone-card phone-plan" aria-label={t('Plan a hangout')}>
      <div className="spread">
        <H>{t('Plan a hangout')}</H>
        <button type="button" className="btn btn-ghost" onClick={onDone}>
          {t('Cancel')}
        </button>
      </div>
      {venues.length === 0 ? (
        <Nothing>{t('Nowhere is open to hang out right now.')}</Nothing>
      ) : (
        <div className="phone-stack">
          <label className="phone-field">
            <span className="small muted">{t('Where')}</span>
            <select
              className="phone-search"
              aria-label={t('Where')}
              value={venue}
              onChange={(e) => setVenue(e.target.value)}
            >
              {venues.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} · {tx(b.kindLabel)}
                </option>
              ))}
            </select>
          </label>
          <div className="chips" role="group" aria-label={t('When')}>
            {(['now', 'tonight'] as const).map((w) => (
              <button
                key={w}
                type="button"
                className="chip"
                aria-pressed={when === w}
                onClick={() => setWhen(w)}
              >
                {w === 'now' ? t('Now') : t('Tonight')}
              </button>
            ))}
          </div>
          <span className="small muted">{t('Who')}</span>
          {friends.length === 0 ? (
            <p className="small muted">{t('No friends to ask yet.')}</p>
          ) : (
            <ul className="phone-list" aria-label={t('Who')}>
              {friends.map((f) => (
                <li key={f.id}>
                  <label className="phone-row phone-check" data-invitee={f.id}>
                    <input
                      type="checkbox"
                      checked={who.includes(f.id)}
                      onChange={() => toggle(f.id)}
                    />
                    <span className="item-title">{f.name}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          <Button disabled={busy || !venue || who.length === 0} onClick={() => void plan()}>
            {t('Send the plan')}
          </Button>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- Invitations

/** Visits and hangouts waiting for you (and where you're expected). */
export function Invitations({ ctx }: { ctx: PhoneCtx }) {
  const { view, send, busy } = useView();
  const visits = visitsOf(view);
  const visiting = visitingOf(view);
  const hangouts = hangoutsOf(view);
  const pending = visits.incoming.filter((v) => v.status === 'pending');
  if (!pending.length && !visiting && !hangouts.length) return null;
  const enter = () => {
    ctx.close();
    openVisit();
  };
  return (
    <section className="phone-card phone-invites" aria-label={t('Invitations')}>
      <H>{t('Invitations')}</H>
      {visiting && (
        <div className="phone-invite" data-visiting={visiting.host.id}>
          <span className="phone-row-main">
            <span className="item-title">
              {t('You’re visiting {name}', { name: visiting.host.name })}
            </span>
          </span>
          <Button onClick={enter}>{t('Go in')}</Button>
        </div>
      )}
      {pending.map((v) => (
        <div key={v.id} className="phone-invite" data-visit-invite={v.id}>
          <span className="phone-row-main">
            <span className="item-title">{t('{name} invited you over', { name: v.hostName })}</span>
            <span className="small muted">{v.city}</span>
          </span>
          <div className="row">
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() =>
                void send({ type: 'visit.decline', inviteId: v.id }, t('Maybe next time.'))
              }
            >
              {t('Decline')}
            </Button>
            <Button
              disabled={busy}
              onClick={async () => {
                const r = await send({ type: 'visit.accept', inviteId: v.id });
                if (r !== null) enter();
              }}
            >
              {t('Accept')}
            </Button>
          </div>
        </div>
      ))}
      {hangouts.map((h) => (
        <div key={h.id} className="phone-invite" data-hangout={h.id}>
          <span className="phone-row-main">
            <span className="item-title">
              {h.mine
                ? t('Your plan: {place}', { place: h.businessName })
                : t('{name}: {place}', { name: h.host.name, place: h.businessName })}
            </span>
            <span className="small muted">
              {h.when === 'now' ? t('Now') : t('Tonight')} ·{' '}
              {t('{n} going', { n: h.members.length })}:{' '}
              {h.members.map((m) => m.name.split(' ')[0]).join(', ')}
            </span>
          </span>
          <div className="row">
            {h.joined ? (
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() =>
                  void send({ type: 'hangout.leave', hangoutId: h.id }, t('You headed off.'))
                }
              >
                {t('Leave')}
              </Button>
            ) : (
              <Button
                disabled={busy}
                onClick={async () => {
                  const r = await send(
                    { type: 'hangout.join', hangoutId: h.id },
                    t('You’re in. See you there.'),
                  );
                  if (r !== null) ctx.goPlace(h.placeId);
                }}
              >
                {t('Join')}
              </Button>
            )}
            <Button variant="subtle" onClick={() => ctx.goPlace(h.placeId)}>
              {t('Go')}
            </Button>
          </div>
        </div>
      ))}
    </section>
  );
}

// ---------------------------------------------------------------- A friend's quick actions

/** Send money, Invite over, Plan a hangout: for one friend (a player). */
export function FriendActions({ playerId }: { playerId: string }) {
  const { send, busy } = useView();
  const [panel, setPanel] = useState<'send' | 'hangout' | null>(null);
  return (
    <div className="phone-friend-actions" data-friend-actions={playerId}>
      <div className="row">
        <Button variant="subtle" onClick={() => setPanel(panel === 'send' ? null : 'send')}>
          {t('Send money')}
        </Button>
        <Button
          variant="subtle"
          disabled={busy}
          onClick={() =>
            void send(
              { type: 'visit.invite', toPlayerId: playerId },
              t('Invitation sent. They’ll see it in their phone.'),
            )
          }
        >
          {t('Invite over')}
        </Button>
        <Button variant="subtle" onClick={() => setPanel(panel === 'hangout' ? null : 'hangout')}>
          {t('Plan a hangout')}
        </Button>
      </div>
      {panel === 'send' && <SendMoney to={playerId} onDone={() => setPanel(null)} />}
      {panel === 'hangout' && <PlanHangout invitee={playerId} onDone={() => setPanel(null)} />}
    </div>
  );
}

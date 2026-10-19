/**
 * The firm (investor blueprint §5.3 "Firm dashboard", §8.4, Phase 6): AUM,
 * funds by vintage, the team (hire, let go, answer carry requests, invite
 * a player as partner), the carry pool, firm stars and succession.
 */
import type { PlayerView } from '@runway/engine';
import { useState } from 'react';
import { money, pct } from '../format';
import { t, tx } from '../i18n';
import { useView } from '../store';
import { Button, Card, Empty, Pill, Sparkline, Stat } from '../ui';
import { fundStageText } from './Funds';
import './investor.css';

type FirmView = NonNullable<PlayerView['firm']>;

export const firmOf = (view: PlayerView): FirmView | null =>
  (view as { firm?: FirmView | null }).firm ?? null;

function titleText(x: string): string {
  return x === 'partner' ? t('Partner') : x === 'principal' ? t('Principal') : t('Associate');
}

function Invitations({ v }: { v: FirmView }) {
  const { send } = useView();
  if (v.invites.length === 0 && v.partnerOf.length === 0) return null;
  return (
    <Card title={t('Partnerships')}>
      {v.invites.map((i) => (
        <div key={i.firmId} className="inv-row">
          <span className="grow">
            {t('{from} invites you to {firm} with {share} of the carry pool.', {
              from: i.from,
              firm: i.name,
              share: pct(i.carryShare, 0),
            })}
          </span>
          <Button
            size="sm"
            onClick={() =>
              void send(
                { type: 'firm.answer', firmId: i.firmId, accept: true },
                t('You’re a partner now.'),
              )
            }
          >
            {t('Join')}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              void send({ type: 'firm.answer', firmId: i.firmId, accept: false }, t('Declined.'))
            }
          >
            {t('Decline')}
          </Button>
        </div>
      ))}
      {v.partnerOf.map((x) => (
        <p key={x.firmId} className="small">
          {t('Partner at {firm}: {share} of its carry pool.', {
            firm: x.name,
            share: pct(x.carryShare, 0),
          })}
        </p>
      ))}
    </Card>
  );
}

export function FirmScreen() {
  const { view, send } = useView();
  const v = firmOf(view);
  const [name, setName] = useState('');
  const [invitee, setInvitee] = useState('');
  const [share, setShare] = useState('0.1');
  const [heir, setHeir] = useState('');
  if (!v) return null;
  const f = v.firm;
  if (!f)
    return (
      <div className="stack">
        <Invitations v={v} />
        <Card title={t('Found your firm')} sub={t('A management company behind your funds')}>
          {v.canFound ? (
            <div className="inv-form">
              <p className="small">
                {t(
                  'Your funds’ fees go to the firm, which pays the team; what’s left is your salary. Hire associates for diligence hours and partners who share the carry.',
                )}
              </p>
              <div className="row">
                <input
                  aria-label={t('Firm name')}
                  placeholder={t('Firm name')}
                  value={name}
                  maxLength={40}
                  onChange={(e) => setName(e.target.value)}
                />
                <Button
                  disabled={name.trim().length < 3}
                  onClick={() =>
                    void send({ type: 'firm.found', name }, (r: { message: string }) =>
                      tx(r.message),
                    )
                  }
                >
                  {t('Found it')}
                </Button>
              </div>
            </div>
          ) : (
            <Empty>{t('A firm comes once you run a fund (rung 4: close Fund I).')}</Empty>
          )}
        </Card>
      </div>
    );
  const humans = view.players.filter((p) => !p.ai);
  const partners = f.members.filter((m) => !m.ai && m.status === 'active');
  return (
    <div className="stack">
      <Invitations v={v} />
      <Card
        title={f.name}
        sub={t('{stars}★ · AUM {aum}', {
          stars: f.stars.toFixed(1),
          aum: money(f.aum, f.currency),
        })}
      >
        {f.starHistory.length > 1 && <Sparkline values={f.starHistory} label={t('Firm stars')} />}
        <div className="inv-grid">
          <Stat label={t('Assets under management')} value={money(f.aum, f.currency)} />
          <Stat label={t('Team salaries a month')} value={money(f.salaries, f.currency)} />
          <Stat
            label={t('Carry pool')}
            value={t('{head} you · {partners} partners', {
              head: pct(f.carryPool.head, 0),
              partners: pct(f.carryPool.partners, 0),
            })}
          />
          {v.nextFundCap !== null && (
            <Stat
              label={t('Next fund up to')}
              value={money(v.nextFundCap, f.currency)}
              hint={t('The last fund’s size, scaled by the firm’s stars')}
            />
          )}
        </div>
        <h3 className="cap-h">{t('Funds')}</h3>
        {f.funds.map((x) => (
          <div key={x.id} className="inv-row">
            <span className="grow">
              {x.name}{' '}
              <span className="small muted">{t('vintage month {n}', { n: x.vintage })}</span>
            </span>
            <span className="small">{money(x.size, f.currency)}</span>
            <Pill>{fundStageText(x.stage)}</Pill>
            <span className="small">TVPI {x.tvpi.toFixed(2)}×</span>
          </div>
        ))}
        <h3 className="cap-h">{t('Team')}</h3>
        {f.members.length === 0 && <p className="small muted">{t('Just you so far.')}</p>}
        {f.members.map((m) => (
          <div key={m.id} className="inv-row" data-member={m.title}>
            <span className="grow">
              <strong>{m.name}</strong> <span className="small muted">{titleText(m.title)}</span>{' '}
              {m.status === 'invited' && <Pill>{t('invited')}</Pill>}
              {m.ai && m.hours > 0 && (
                <span className="small muted"> · {t('+{n}h a month', { n: m.hours })}</span>
              )}
              {m.carryShare > 0 && (
                <span className="small muted">
                  {' '}
                  · {t('{pct} of carry', { pct: pct(m.carryShare, 0) })}
                </span>
              )}
              {m.ask && (
                <div className="career-invite">
                  <p>
                    {t('{name} wants {pct} of the carry pool, or will leave.', {
                      name: m.name,
                      pct: pct(m.ask.carryShare, 0),
                    })}
                  </p>
                  <div className="row">
                    <Button
                      size="sm"
                      onClick={() =>
                        void send(
                          { type: 'firm.carryAsk', memberId: m.id, accept: true },
                          (r: { message: string }) => tx(r.message),
                        )
                      }
                    >
                      {t('Agree')}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        void send(
                          { type: 'firm.carryAsk', memberId: m.id, accept: false },
                          (r: { message: string }) => tx(r.message),
                        )
                      }
                    >
                      {t('Say no')}
                    </Button>
                  </div>
                </div>
              )}
            </span>
            {f.isHead && m.status === 'active' && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  void send({ type: 'firm.letGo', memberId: m.id }, t('They left the firm.'))
                }
              >
                {t('Let go')}
              </Button>
            )}
          </div>
        ))}
        {f.isHead && (
          <div className="row">
            {(['associate', 'principal', 'partner'] as const).map((title) => (
              <Button
                key={title}
                size="sm"
                variant="subtle"
                onClick={() =>
                  void send({ type: 'firm.hire', title }, (r: { message: string }) => tx(r.message))
                }
              >
                {t('Hire {title} ({cost}/mo)', {
                  title: titleText(title).toLowerCase(),
                  cost: money(f.hireCost[title], f.currency),
                })}
              </Button>
            ))}
          </div>
        )}
        {f.isHead && humans.length > 0 && (
          <div className="row">
            <select
              aria-label={t('Player')}
              value={invitee}
              onChange={(e) => setInvitee(e.target.value)}
            >
              <option value="">{t('Invite a player as partner')}</option>
              {humans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <select
              aria-label={t('Carry share')}
              value={share}
              onChange={(e) => setShare(e.target.value)}
            >
              {['0.05', '0.1', '0.2'].map((x) => (
                <option key={x} value={x}>
                  {pct(Number(x), 0)}
                </option>
              ))}
            </select>
            <Button
              size="sm"
              disabled={!invitee}
              onClick={() =>
                void send(
                  { type: 'firm.invite', playerId: invitee, carryShare: Number(share) },
                  (r: { message: string }) => tx(r.message),
                )
              }
            >
              {t('Invite')}
            </Button>
          </div>
        )}
        {f.succession ? (
          <p className="small">
            {t('Handed over: your successor runs the firm; you keep {pct} of the carry.', {
              pct: pct(f.succession.founderCarry, 0),
            })}
          </p>
        ) : (
          f.isHead &&
          partners.length > 0 && (
            <div className="inv-form">
              <h3 className="cap-h">{t('Succession')}</h3>
              <p className="small muted">
                {t(
                  'Step back: a partner runs the firm and its funds, and you keep a share of the carry.',
                )}
              </p>
              <div className="row">
                <select
                  aria-label={t('Successor')}
                  value={heir}
                  onChange={(e) => setHeir(e.target.value)}
                >
                  <option value="">{t('Pick a successor')}</option>
                  {partners.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!heir}
                  onClick={() =>
                    void send(
                      { type: 'firm.succession', memberId: heir, founderCarry: 0.25 },
                      (r: { message: string }) => tx(r.message),
                    )
                  }
                >
                  {t('Hand over, keep 25% of carry')}
                </Button>
              </div>
            </div>
          )
        )}
      </Card>
    </div>
  );
}

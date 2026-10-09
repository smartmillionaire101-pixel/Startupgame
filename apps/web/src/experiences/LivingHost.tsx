import { lazy, Suspense, useEffect, useState, useSyncExternalStore } from 'react';
import { useView } from '../store';
import { openPhone } from '../phone/bus';
import { closeLiving, livingPlace, onLiving } from './living-bus';
import { openPlay } from './play-bus';
import './experiences.css';
const Panorama = lazy(() => import('./Panorama'));
export default function LivingHost() {
  const host = useSyncExternalStore(onLiving, livingPlace, () => null);
  return host ? <LivingRoom host={host} /> : null;
}
function LivingRoom({ host }: { host: string }) {
  const { view, send, busy, refresh } = useView();
  const me = view.me.id;
  const [person, setPerson] = useState('');
  const [where, setWhere] = useState<'home' | 'london-eye' | 'cable-car' | 'rooftop'>('rooftop');
  const [panorama, setPanorama] = useState<'london-eye' | 'cable-car' | 'rooftop' | null>(null);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
      if (!document.hidden) void refresh();
    }, 2000);
    return () => clearInterval(timer);
  }, [refresh]);
  const city = view.here?.id ?? view.market.id;
  const dates = view.living.dates.filter(
    (d) => d.status !== 'ended' && now - d.createdAt < 3_600_000,
  );
  const date = dates[dates.length - 1];
  const deliveries = view.living.deliveries.filter((d) => d.owner === host && !d.complete);
  return (
    <div className="experience-backdrop">
      <section
        className="experience-shell"
        role="dialog"
        aria-modal="true"
        aria-label="Home and social experiences"
      >
        <header className="experience-header">
          <div>
            <small>SETTLE IN · SPEND TIME TOGETHER</small>
            <h1>A place to make memories.</h1>
          </div>
          <button
            className="experience-close"
            onClick={closeLiving}
            aria-label="Close home experiences"
          >
            ×
          </button>
        </header>
        <div className="experience-toolbar">
          <button
            onClick={() => {
              closeLiving();
              openPlay({
                venue: `home:${host}`,
                name: host === me ? 'Your home' : 'Your friend’s home',
                game: 'football',
              });
            }}
          >
            🎮 Play football or host game night
          </button>
          <button
            onClick={() => {
              closeLiving();
              openPhone({ app: 'chop' });
            }}
          >
            Order food
          </button>
          <button
            onClick={() => {
              closeLiving();
              openPhone({ app: 'homes' });
            }}
          >
            Homes & mortgages
          </button>
        </div>
        <h2>Games with other players</h2>
        <div className="experience-rooms">
          {view.playRooms
            .filter((r) => r.status === 'waiting' || r.status === 'playing')
            .map((r) => (
              <button
                key={r.id}
                onClick={() => {
                  closeLiving();
                  openPlay({ venue: r.venue, name: r.title, roomId: r.id });
                }}
              >
                <strong>{r.title}</strong>
                <small>
                  {r.game} · {r.members.length} players · {r.status}
                </small>
              </button>
            ))}
        </div>
        <h2>At your door</h2>
        {deliveries.length === 0 ? (
          <p>No deliveries on the way.</p>
        ) : (
          deliveries.map((d) => (
            <article className="living-delivery" key={d.id}>
              <div className="living-van" data-arrived={now >= d.arrivesAt}>
                🚚
              </div>
              <div>
                <strong>{d.label.replaceAll('-', ' ')}</strong>
                <p>
                  {now < d.arrivesAt
                    ? `Van arriving in ${Math.ceil((d.arrivesAt - now) / 1000)}s`
                    : 'Your van is outside. Ready to unpack.'}
                </p>
              </div>
              <button
                disabled={busy || now < d.arrivesAt}
                onClick={() => void send({ type: 'living.collect', deliveryId: d.id })}
              >
                {host === me ? 'Unpack delivery' : 'Help carry it inside'}
              </button>
            </article>
          ))
        )}
        {host === me && (
          <>
            <h2>Your garage · {view.me.garage.length} cars</h2>
            <div className="experience-rooms">
              {view.me.garage.map((car) => (
                <div className="living-car" key={car.modelId}>
                  <span>🚘</span>
                  <strong>{car.modelId.replaceAll('-', ' ')}</strong>
                  <small>
                    {/electric|tesla|ev-|byd/i.test(car.modelId)
                      ? 'Charging bay'
                      : /porsche|ferrari|lambo|sport|bentley|rolls/i.test(car.modelId)
                        ? 'Display garage'
                        : 'Private parking bay'}
                  </small>
                  <button
                    disabled={busy || car.active}
                    onClick={() => void send({ type: 'car.select', modelId: car.modelId })}
                  >
                    {car.active ? 'Currently driving' : 'Drive this car'}
                  </button>
                </div>
              ))}
              {!view.me.garage.length && <p>Your cars and their parking bays will appear here.</p>}
            </div>
          </>
        )}
        <h2>Make time for someone</h2>
        {!date ? (
          <form
            className="experience-create"
            onSubmit={(e) => {
              e.preventDefault();
              void send({ type: 'living.date.invite', playerId: person, location: where });
            }}
          >
            <label>
              Invite a player
              <select required value={person} onChange={(e) => setPerson(e.target.value)}>
                <option value="">Choose someone in this city</option>
                {view.living.people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Where shall we go?
              <select value={where} onChange={(e) => setWhere(e.target.value as typeof where)}>
                {city === 'london' && <option value="london-eye">London Eye</option>}
                <option value="cable-car">Scenic cable-car ride</option>
                <option value="rooftop">Rooftop skyline</option>
                <option value="home">At my home · invited guests</option>
              </select>
            </label>
            <button className="experience-primary" disabled={busy || !person}>
              Invite on a date
            </button>
            <p>
              Your partner chooses whether to accept. Either person can end the date at any time.
            </p>
          </form>
        ) : (
          <section className="experience-create">
            <h2>
              {date.hostName} & {date.guestName}
            </h2>
            <p>
              {date.location.replaceAll('-', ' ')} ·{' '}
              {date.status === 'invited' ? 'Invitation pending' : 'Together'}
            </p>
            {date.status === 'invited' && date.guest === me && (
              <button
                className="experience-primary"
                disabled={busy}
                onClick={() => void send({ type: 'living.date.accept', dateId: date.id })}
              >
                Accept date
              </button>
            )}
            {date.status === 'together' && (
              <>
                <div
                  className={`living-couple ${date.holdingHands ? 'holding' : ''}`}
                  aria-label={date.holdingHands ? 'Holding hands' : 'Together'}
                >
                  <span>🧑</span>
                  <b>{date.holdingHands ? '♥' : '✦'}</b>
                  <span>🧑</span>
                </div>
                {date.location !== 'home' && (
                  <button
                    className="experience-primary"
                    onClick={() =>
                      setPanorama(date.location as 'london-eye' | 'cable-car' | 'rooftop')
                    }
                  >
                    Step into the view
                  </button>
                )}
                <div className="experience-toolbar">
                  {(['compliment', 'flirt', 'laugh', 'point'] as const).map((action) => (
                    <button
                      key={action}
                      disabled={busy}
                      onClick={() =>
                        void send({ type: 'living.date.gesture', dateId: date.id, action })
                      }
                    >
                      {
                        {
                          compliment: 'Give a compliment',
                          flirt: 'Flirt',
                          laugh: 'Share a laugh',
                          point: 'Point out the view',
                        }[action]
                      }
                    </button>
                  ))}
                </div>
                {date.handRequest && date.handRequest !== me ? (
                  <div>
                    <p>Your partner offers their hand.</p>
                    <button
                      disabled={busy}
                      onClick={() =>
                        void send({ type: 'living.date.hands', dateId: date.id, accept: true })
                      }
                    >
                      Hold hands
                    </button>
                    <button
                      disabled={busy}
                      onClick={() =>
                        void send({ type: 'living.date.hands', dateId: date.id, accept: false })
                      }
                    >
                      Not now
                    </button>
                  </div>
                ) : (
                  <button
                    disabled={busy || date.handRequest === me}
                    onClick={() =>
                      void send({ type: 'living.date.hands', dateId: date.id, accept: false })
                    }
                  >
                    {date.holdingHands
                      ? 'Let go'
                      : date.handRequest === me
                        ? 'Waiting for their answer…'
                        : 'Offer your hand'}
                  </button>
                )}
                <div className="living-reactions" aria-live="polite">
                  {date.reactions.slice(-4).map((r, i) => (
                    <p key={i}>
                      {r.by === date.host ? date.hostName : date.guestName}:{' '}
                      {
                        {
                          compliment: '“I really enjoy spending time with you.”',
                          flirt: '“You make this view even better.”',
                          laugh: 'Shares a warm laugh.',
                          point: 'Points out something on the skyline.',
                        }[r.action]
                      }
                    </p>
                  ))}
                </div>
              </>
            )}
            <button
              disabled={busy}
              onClick={() => void send({ type: 'living.date.end', dateId: date.id })}
            >
              {date.status === 'invited' ? 'Decline / cancel invitation' : 'End date'}
            </button>
          </section>
        )}
        <h2>Explore the skyline</h2>
        <p>Look around freely, find landmarks, and watch the light change with the real day.</p>
        <div className="experience-toolbar">
          {city === 'london' && (
            <button onClick={() => setPanorama('london-eye')}>Ride the London Eye</button>
          )}
          <button onClick={() => setPanorama('cable-car')}>Scenic cable-car view</button>
          <button onClick={() => setPanorama('rooftop')}>Rooftop panorama</button>
        </div>
        <p className="experience-note">
          Mortgages and repayments use the existing bank system.{' '}
          {view.me.residence
            ? `Your home: ${view.me.residence.tierLabel}.`
            : 'A larger home can be rented through lifestyle or bought through Homes.'}{' '}
          All prices and stakes are virtual game currency.
        </p>
        {panorama && (
          <Suspense fallback={<p>Opening your view…</p>}>
            <Panorama
              city={city}
              kind={panorama}
              holdingHands={!!date?.holdingHands}
              onClose={() => setPanorama(null)}
            >
              {date?.status === 'together' && (
                <div className="panorama-date">
                  <span>
                    {date.holdingHands
                      ? '♥ Holding hands'
                      : date.handRequest && date.handRequest !== me
                        ? 'Your partner offers their hand.'
                        : 'Enjoying the view together'}
                  </span>
                  <button
                    disabled={busy}
                    onClick={() =>
                      void send({ type: 'living.date.gesture', dateId: date.id, action: 'flirt' })
                    }
                  >
                    Flirt
                  </button>
                  <button
                    disabled={busy}
                    onClick={() =>
                      void send({ type: 'living.date.gesture', dateId: date.id, action: 'point' })
                    }
                  >
                    Point out the view
                  </button>
                  <button
                    disabled={busy || date.handRequest === me}
                    onClick={() =>
                      void send({
                        type: 'living.date.hands',
                        dateId: date.id,
                        accept: !!date.handRequest && date.handRequest !== me,
                      })
                    }
                  >
                    {date.holdingHands
                      ? 'Let go'
                      : date.handRequest && date.handRequest !== me
                        ? 'Hold hands'
                        : date.handRequest === me
                          ? 'Waiting…'
                          : 'Offer your hand'}
                  </button>
                  <button onClick={() => void send({ type: 'living.date.end', dateId: date.id })}>
                    End date
                  </button>
                </div>
              )}
            </Panorama>
          </Suspense>
        )}
      </section>
    </div>
  );
}

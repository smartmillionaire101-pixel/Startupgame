import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react';
import type { PlayerView } from '@runway/engine';
import { useView } from '../store';
import { api } from '../api';
import { money } from '../format';
import { closePlay, onPlay, playPlace, type PlayPlace } from './play-bus';
import './experiences.css';
type Room = PlayerView['playRooms'][number];
const names = { quiz: 'Quiz night', snooker: 'Snooker', football: 'Football shootout' };
const colors = ['#fff', '#dc3545', '#f6d32d', '#259553', '#985528', '#338ddd', '#fa86b4', '#111'];
export default function PlayHost() {
  const place = useSyncExternalStore(onPlay, playPlace, () => null);
  return place ? <Lobby key={place.venue} place={place} /> : null;
}
function Lobby({ place }: { place: PlayPlace }) {
  const { view, send, busy, cur, refresh } = useView();
  const [selected, setSelected] = useState<string | null>(place.roomId ?? null);
  const [game, setGame] = useState<Room['game']>(place.game ?? 'quiz');
  const [title, setTitle] = useState('Game night');
  const [stake, setStake] = useState('0');
  const [custom, setCustom] = useState(false);
  const [questions, setQuestions] = useState([
    { text: '', options: ['', '', '', ''], answer: 0 },
    { text: '', options: ['', '', '', ''], answer: 0 },
    { text: '', options: ['', '', '', ''], answer: 0 },
  ]);
  const [clock, setClock] = useState(Date.now);
  const timeOffset = useRef(0);
  useEffect(() => {
    timeOffset.current = (view.clock?.serverNow ?? Date.now()) - Date.now();
  }, [view.clock?.serverNow]);
  const rooms = view.playRooms.filter((r) => r.venue === place.venue);
  const room = rooms.find((r) => r.id === selected);
  const me = view.me.id;
  const tick = useRef(false);
  const roomRef = useRef(room);
  const refreshRef = useRef(refresh);
  useEffect(() => {
    roomRef.current = room;
    refreshRef.current = refresh;
  });
  useEffect(() => {
    const timer = setInterval(() => {
      setClock(Date.now() + timeOffset.current);
      if (document.hidden || tick.current) return;
      tick.current = true;
      const current = roomRef.current;
      const sync =
        current?.status === 'playing' && Date.now() + timeOffset.current >= current.deadline
          ? api.command({ type: 'play.sync', roomId: current.id }).catch(() => undefined)
          : Promise.resolve();
      void sync
        .then(() => refreshRef.current())
        .finally(() => {
          tick.current = false;
        });
    }, 1500);
    return () => clearInterval(timer);
  }, []);
  const member = room?.members.find((m) => m.id === me);
  const seconds = room ? Math.max(0, Math.ceil((room.deadline - clock) / 1000)) : 0;
  const mayHost = !place.venue.startsWith('home:') || place.venue === `home:${me}`;
  async function create() {
    const result = await send<{ id: string }>({
      type: 'play.create',
      game,
      venue: place.venue,
      title,
      stake: Math.round(Number(stake) * 100),
      ...(custom && game === 'quiz' ? { questions } : {}),
    });
    if (result) setSelected(result.id);
  }
  return (
    <div className="experience-backdrop">
      <section
        className="experience-shell"
        role="dialog"
        aria-modal="true"
        aria-label="Play together"
      >
        <header className="experience-header">
          <div>
            <small>RUNWAY SOCIAL CLUB · {place.name}</small>
            <h1>{room ? room.title : 'Make a night of it.'}</h1>
          </div>
          <button className="experience-close" onClick={closePlay} aria-label="Close games">
            ×
          </button>
        </header>
        <p className="experience-note">
          Virtual game money only. No purchases or cash payouts. Winners take the pot; ties and
          cancelled rooms refund entries.
        </p>
        {!room ? (
          <>
            <div className="experience-games">
              {(Object.keys(names) as Room['game'][]).map((g) => (
                <button className={game === g ? 'selected' : ''} key={g} onClick={() => setGame(g)}>
                  <span>{g === 'quiz' ? '?' : g === 'snooker' ? '●' : '⚽'}</span>
                  <strong>{names[g]}</strong>
                  <small>
                    {g === 'quiz'
                      ? 'Think fast. Play together.'
                      : g === 'snooker'
                        ? 'Aim, set power, pot the balls.'
                        : 'Read your opponent. Pick your corner.'}
                  </small>
                </button>
              ))}
            </div>
            <h2>Open tables</h2>
            <div className="experience-rooms">
              {rooms.map((r) => (
                <button key={r.id} onClick={() => setSelected(r.id)}>
                  <strong>{r.title}</strong>
                  <span>
                    {names[r.game]} · {r.members.length} players · {r.status}
                  </span>
                  <small>{money(r.stake, r.currency)} entry</small>
                </button>
              ))}
              {!rooms.length && <p>No games here yet. Start the first one.</p>}
            </div>
            {mayHost && (
              <form
                className="experience-create"
                onSubmit={(e) => {
                  e.preventDefault();
                  void create();
                }}
              >
                <h2>Host {names[game].toLowerCase()}</h2>
                <label>
                  Room name
                  <input
                    required
                    minLength={3}
                    maxLength={60}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </label>
                <label>
                  Stake per player ({view.here?.currency ?? cur})
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    max="1000000"
                    value={stake}
                    onChange={(e) => setStake(e.target.value)}
                    required
                  />
                </label>
                <p className="small">
                  The stake is charged when a player joins. The host starts when everyone is ready.
                  Waiting players can leave for a refund. Idle rooms expire after 30 minutes.
                </p>
                {game === 'quiz' && (
                  <>
                    <label>
                      <input
                        type="checkbox"
                        checked={custom}
                        onChange={(e) => setCustom(e.target.checked)}
                      />{' '}
                      Write my own questions
                    </label>
                    {custom && (
                      <>
                        <p>
                          You are the quizmaster, so you cannot compete in your own custom quiz.
                        </p>
                        {questions.map((q, i) => (
                          <fieldset key={i}>
                            <legend>Question {i + 1}</legend>
                            <input
                              aria-label={`Question ${i + 1}`}
                              required
                              minLength={5}
                              maxLength={240}
                              placeholder="Your question"
                              value={q.text}
                              onChange={(e) =>
                                setQuestions(
                                  questions.map((x, j) =>
                                    j === i ? { ...x, text: e.target.value } : x,
                                  ),
                                )
                              }
                            />
                            {q.options.map((o, k) => (
                              <input
                                key={k}
                                aria-label={`Question ${i + 1} option ${k + 1}`}
                                required
                                maxLength={100}
                                placeholder={`Option ${k + 1}`}
                                value={o}
                                onChange={(e) =>
                                  setQuestions(
                                    questions.map((x, j) =>
                                      j === i
                                        ? {
                                            ...x,
                                            options: x.options.map((a, b) =>
                                              b === k ? e.target.value : a,
                                            ),
                                          }
                                        : x,
                                    ),
                                  )
                                }
                              />
                            ))}
                            <label>
                              Correct answer
                              <select
                                value={q.answer}
                                onChange={(e) =>
                                  setQuestions(
                                    questions.map((x, j) =>
                                      j === i ? { ...x, answer: Number(e.target.value) } : x,
                                    ),
                                  )
                                }
                              >
                                {q.options.map((_, k) => (
                                  <option key={k} value={k}>
                                    Option {k + 1}
                                  </option>
                                ))}
                              </select>
                            </label>
                          </fieldset>
                        ))}
                        <button
                          type="button"
                          disabled={questions.length >= 20}
                          onClick={() =>
                            setQuestions([
                              ...questions,
                              { text: '', options: ['', '', '', ''], answer: 0 },
                            ])
                          }
                        >
                          Add question
                        </button>
                      </>
                    )}
                  </>
                )}
                <button className="experience-primary" disabled={busy}>
                  Create room
                </button>
              </form>
            )}
          </>
        ) : (
          <>
            <div className="experience-toolbar">
              <button onClick={() => setSelected(null)}>← All tables</button>
              <span>{names[room.game]}</span>
              <b>Pot {money(room.pot, room.currency)}</b>
              {room.status === 'playing' && (
                <strong className="experience-timer">{seconds}s</strong>
              )}
            </div>
            <div className="experience-scores">
              {room.members.map((m) => (
                <div key={m.id} className={m.id === me ? 'you' : ''}>
                  <span>
                    {m.name}
                    {m.id === me ? ' (you)' : ''}
                  </span>
                  <strong>{m.score}</strong>
                  {(room.answered.includes(m.id) || room.locked.includes(m.id)) && (
                    <small>Locked in ✓</small>
                  )}
                </div>
              ))}
            </div>
            {room.status === 'waiting' && (
              <div className="experience-wait">
                <h2>Get everyone around the table.</h2>
                <p>
                  {room.game === 'quiz'
                    ? '20 seconds per question. Correct answers earn 10 points.'
                    : 'Invite another player in this city to open this room.'}
                </p>
                <p>
                  Entry: {money(room.stake, room.currency)} ·{' '}
                  {room.currency !== cur && room.stake > 0
                    ? 'Staked play needs a matching-currency account.'
                    : 'Paid into the game pot when you join.'}
                </p>
                {!member && !(room.custom && room.host === me) && (
                  <button
                    className="experience-primary"
                    disabled={busy}
                    onClick={() => void send({ type: 'play.join', roomId: room.id })}
                  >
                    Join · {money(room.stake, room.currency)}
                  </button>
                )}
                {member && (
                  <button
                    disabled={busy}
                    onClick={() => void send({ type: 'play.leave', roomId: room.id })}
                  >
                    Leave and refund
                  </button>
                )}
                {room.host === me && (
                  <>
                    <button
                      className="experience-primary"
                      disabled={
                        busy ||
                        room.members.length < (room.game === 'quiz' && room.stake === 0 ? 1 : 2)
                      }
                      onClick={() => void send({ type: 'play.start', roomId: room.id })}
                    >
                      Start game
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => void send({ type: 'play.cancel', roomId: room.id })}
                    >
                      Cancel room
                    </button>
                  </>
                )}
              </div>
            )}
            {room.status === 'playing' && room.game === 'quiz' && (
              <div className="experience-quiz">
                <small>
                  QUESTION {room.round + 1} OF {room.totalQuestions}
                </small>
                <h2>{room.question?.text}</h2>
                <div className="experience-answers">
                  {room.question?.options?.map((o, i) => (
                    <button
                      key={`${room.round}:${i}`}
                      disabled={busy || !member || room.myAnswer !== null || seconds === 0}
                      className={room.myAnswer === i ? 'selected' : ''}
                      onClick={() =>
                        void send({
                          type: 'play.answer',
                          roomId: room.id,
                          round: room.round,
                          choice: i,
                        })
                      }
                    >
                      <b>{String.fromCharCode(65 + i)}</b>
                      {o}
                    </button>
                  ))}
                </div>
                {room.myAnswer !== null && <p>Answer locked. Waiting for the others…</p>}
              </div>
            )}
            {room.status === 'playing' && room.game === 'snooker' && (
              <Snooker room={room} me={me} />
            )}
            {room.status === 'playing' && room.game === 'football' && (
              <div className="experience-football">
                <h2>
                  {room.shooter === me
                    ? 'Your penalty. Where will you shoot?'
                    : 'You are in goal. Where will you dive?'}
                </h2>
                <p>
                  Both choices stay hidden until locked in. Match the shot to save it. Five
                  penalties each, then sudden death.
                </p>
                <div className="experience-goal">
                  {['Top left', 'Top right', 'Centre', 'Bottom left', 'Bottom right'].map(
                    (label, i) => (
                      <button
                        key={label}
                        disabled={busy || !member || room.myMove !== null || seconds === 0}
                        className={room.myMove === i ? 'selected' : ''}
                        onClick={() =>
                          void send({
                            type: 'play.penalty',
                            roomId: room.id,
                            round: room.round,
                            lane: i,
                          })
                        }
                      >
                        {label}
                      </button>
                    ),
                  )}
                </div>
                <div
                  key={room.penalties.length}
                  className={`experience-ball ${room.penalties.length ? 'is-kicked' : ''}`}
                  style={
                    {
                      '--shot-x': `${[-80, 80, 0, -80, 80][room.penalties.at(-1)?.shot ?? 2] ?? 0}px`,
                      '--shot-y': `${[-200, -200, -140, -90, -90][room.penalties.at(-1)?.shot ?? 2] ?? -140}px`,
                    } as CSSProperties
                  }
                >
                  ⚽
                </div>
                <p>
                  Penalty {room.round + 1} · {room.myMove !== null ? 'Choice locked in.' : ''}
                </p>
                <div className="experience-penalties">
                  {room.penalties.map((p, i) => (
                    <span title={p.goal ? 'Goal' : 'Saved or missed'} key={i}>
                      {p.goal ? '●' : '×'}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {room.last && (
              <p className="experience-result" role="status">
                {room.last}
              </p>
            )}
            {(room.status === 'finished' || room.status === 'cancelled') && (
              <div className="experience-wait">
                <h2>
                  {room.status === 'cancelled'
                    ? 'Entries refunded'
                    : room.winners.length === 1
                      ? `${room.members.find((m) => m.id === room.winners[0])?.name} wins!`
                      : 'It’s a tie!'}
                </h2>
                <p>
                  {room.status === 'finished' && room.winners.length === 1
                    ? `${money(room.stake * room.members.length, room.currency)} paid to the winner.`
                    : 'All stakes have been returned.'}
                </p>
                <button
                  className="experience-primary"
                  onClick={() => {
                    setSelected(null);
                    setGame(room.game);
                  }}
                >
                  Play again
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
function Snooker({ room, me }: { room: Room; me: string }) {
  const { send, busy } = useView();
  const [angle, setAngle] = useState(0);
  const [power, setPower] = useState(70);
  const [frame, setFrame] = useState(-1);
  const frames = useRef(room.frames);
  useEffect(() => {
    frames.current = room.frames;
  });
  useEffect(() => {
    let i = 0;
    const t = setInterval(() => {
      if (i >= frames.current.length) {
        setFrame(-1);
        clearInterval(t);
      } else setFrame(i++);
    }, 70);
    return () => clearInterval(t);
  }, [room.round]);
  const balls = frame >= 0 ? (room.frames[frame] ?? room.balls) : room.balls;
  const cue = room.balls[0]!;
  const mine = room.turn === me;
  return (
    <div className="experience-snooker">
      <h2>{mine ? 'Your shot' : `${room.members.find((m) => m.id === room.turn)?.name}’s turn`}</h2>
      <p>
        Tap the cloth to aim.{' '}
        {room.red
          ? 'Red next (1 point).'
          : 'Colour next (2–7 points); colours go back while reds remain.'}{' '}
        Fouls give at least four points to your opponent. This short frame ends after 60 turns.
      </p>
      <svg
        viewBox="-6 -6 132 72"
        role="img"
        aria-label="Snooker table: tap to aim"
        onPointerDown={(e) => {
          const point = e.currentTarget.createSVGPoint();
          point.x = e.clientX;
          point.y = e.clientY;
          const matrix = e.currentTarget.getScreenCTM();
          if (matrix) {
            const local = point.matrixTransform(matrix.inverse());
            setAngle(Math.atan2(local.y - cue.y, local.x - cue.x));
          }
        }}
      >
        <rect x="-6" y="-6" width="132" height="72" rx="4" fill="#653d2c" />
        <rect width="120" height="60" rx="2" fill="#126345" />
        {[
          [0, 0],
          [60, 0],
          [120, 0],
          [0, 60],
          [60, 60],
          [120, 60],
        ].map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="3" fill="#071611" />
        ))}
        {mine && frame < 0 && (
          <line
            x1={cue.x}
            y1={cue.y}
            x2={cue.x + Math.cos(angle) * 35}
            y2={cue.y + Math.sin(angle) * 35}
            stroke="#c9eac0"
            strokeDasharray="1 1"
            strokeWidth=".3"
          />
        )}
        {balls
          .filter((b) => !b.potted)
          .map((b) => (
            <circle
              key={b.id}
              cx={b.x}
              cy={b.y}
              r="1.35"
              fill={colors[b.value]}
              stroke="#ffffff44"
              strokeWidth=".15"
            />
          ))}
      </svg>
      <label>
        Aim angle
        <input
          type="range"
          min="-180"
          max="180"
          value={Math.round((angle * 180) / Math.PI)}
          onChange={(e) => setAngle((Number(e.target.value) * Math.PI) / 180)}
        />
      </label>
      <label>
        Shot power · {power}%
        <input
          type="range"
          min="5"
          max="100"
          value={power}
          onChange={(e) => setPower(Number(e.target.value))}
        />
      </label>
      <button
        className="experience-primary"
        disabled={!mine || busy || frame >= 0}
        onClick={() =>
          void send({ type: 'play.shot', roomId: room.id, round: room.round, angle, power })
        }
      >
        Take shot
      </button>
    </div>
  );
}

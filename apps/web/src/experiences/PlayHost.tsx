import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react';
import { QUIZ_AI_AFTER, type PlayerView } from '@runway/engine';
import { useView } from '../store';
import { api } from '../api';
import { money } from '../format';
import { t, useLang } from '../i18n';
import { closePlay, onPlay, playPlace, type PlayPlace } from './play-bus';
import './experiences.css';
type Room = PlayerView['playRooms'][number];
const names = {
  quiz: 'Quiz night',
  snooker: 'Snooker',
  football: 'Football shootout',
  golf: 'Golf',
};
/** The games hosted here (golf with a friend is played at the golf club). */
const TABLE_GAMES = ['quiz', 'snooker', 'football'] as const;
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
  const lang = useLang();
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
  const meRef = useRef(me);
  useEffect(() => {
    roomRef.current = room;
    refreshRef.current = refresh;
    meRef.current = me;
  });
  useEffect(() => {
    const timer = setInterval(() => {
      setClock(Date.now() + timeOffset.current);
      if (document.hidden || tick.current) return;
      tick.current = true;
      const current = roomRef.current;
      const now = Date.now() + timeOffset.current;
      // Sync when the question's time is up or an AI opponent is due to answer,
      // and once a host has waited alone long enough to be matched with AI opponents.
      const due =
        current?.status === 'playing'
          ? now >= current.deadline || (current.aiDueAt !== null && now >= current.aiDueAt)
          : current?.status === 'waiting' &&
            current.game === 'quiz' &&
            current.members.length === 1 &&
            current.members[0]!.id === meRef.current &&
            now - current.createdAt >= QUIZ_AI_AFTER;
      const sync = due
        ? api.command({ type: 'play.sync', roomId: current!.id }).catch(() => undefined)
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
    });
    if (result) setSelected(result.id);
  }
  /** Solo: open a table and seat an AI opponent at once (it pays the same stake). */
  async function playAi(g: Room['game']) {
    const made = await send<{ id: string }>({
      type: 'play.create',
      game: g,
      venue: place.venue,
      title:
        g === 'quiz'
          ? t('Quiz against AI')
          : g === 'snooker'
            ? t('Snooker against AI')
            : t('Penalties against AI'),
      stake: Math.round(Number(stake) * 100),
    });
    if (!made) return;
    setSelected(made.id);
    await send({ type: 'play.ai', roomId: made.id, ...(g === 'quiz' ? { count: 2 } : {}) });
  }
  /** Quiz quick play: join the next quiz waiting here with this stake, or open one. */
  async function match() {
    const result = await send<{ id: string }>({
      type: 'play.match',
      venue: place.venue,
      stake: Math.round(Number(stake) * 100),
    });
    if (result) setSelected(result.id);
  }
  const fr = lang === 'fr';
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
              {TABLE_GAMES.map((g) => (
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
            {game === 'quiz' && (
              <form
                className="experience-create"
                aria-label={t('Quick match')}
                onSubmit={(e) => {
                  e.preventDefault();
                  void match();
                }}
              >
                <h2>{t('Quiz night: play against someone')}</h2>
                <p>
                  {t(
                    'Ten questions from the quiz bank: general knowledge, business and tech, sport, music, science, geography and the cities. Everyone plays, the host too.',
                  )}
                </p>
                <label>
                  {t('Stake per player ({currency})', { currency: view.here?.currency ?? cur })}
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
                  {t(
                    'You join the next quiz waiting here with the same stake, or open one. If nobody joins within 45 seconds, AI players from this city take the other seats.',
                  )}
                </p>
                <button className="experience-primary" disabled={busy}>
                  {t('Find an opponent')}
                </button>
              </form>
            )}
            {mayHost && game !== 'quiz' && (
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
                <button className="experience-primary" disabled={busy}>
                  Create room
                </button>
              </form>
            )}
            {mayHost && (
              <div className="experience-create experience-solo" aria-label={t('Play vs AI')}>
                <h2>{t('Nobody around? Play vs AI')}</h2>
                <p className="small">
                  {game === 'quiz'
                    ? t('Two AI players from this city sit down at once and the quiz starts.')
                    : t(
                        'An AI player from this city takes the other side and the game starts at once.',
                      )}{' '}
                  {Number(stake) > 0
                    ? t(
                        'Each AI player pays the same {stake} stake into the pot. Winner takes the pot; a tie refunds everyone.',
                        {
                          stake: money(Math.round(Number(stake) * 100), view.here?.currency ?? cur),
                        },
                      )
                    : t('Free game: set a stake above to play for the pot.')}
                </p>
                <button
                  className="experience-primary"
                  disabled={busy}
                  onClick={() => void playAi(game)}
                >
                  {t('Play vs AI')}
                </button>
              </div>
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
                    {room.ai.includes(m.id) ? ` · ${t('AI player')}` : ''}
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
                    ? t(
                        '{n} questions, 20 seconds each. Correct answers earn 10 points. Waiting for an opponent…',
                        { n: room.totalQuestions },
                      )
                    : t(
                        'Invite another player in this city, or play an AI opponent now. The AI pays the same stake.',
                      )}
                </p>
                {room.game === 'quiz' && room.host === me && room.members.length === 1 && (
                  <QuizWait createdAt={room.createdAt} />
                )}
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
                {room.host === me &&
                  room.game !== 'quiz' &&
                  room.members.length === 1 &&
                  room.members[0]!.id === me && (
                    <button
                      disabled={busy}
                      onClick={() => void send({ type: 'play.ai', roomId: room.id })}
                    >
                      {t('Play vs AI')}
                    </button>
                  )}
                {room.host === me && room.game === 'quiz' && room.members.length < 4 && (
                  <button
                    disabled={busy}
                    onClick={() => void send({ type: 'play.ai', roomId: room.id, count: 2 })}
                  >
                    {t('Play AI opponents now')}
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
                {room.question?.cat && <small>{t(CATS[room.question.cat] ?? 'General')}</small>}
                <h2>{(fr && room.question?.fr?.text) || room.question?.text}</h2>
                <div className="experience-answers">
                  {((fr && room.question?.fr?.options) || room.question?.options)?.map((o, i) => (
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
                {room.myAnswer !== null && <p>{t('Answer locked. Waiting for the others…')}</p>}
                {room.reveal && (
                  <p className="experience-reveal">
                    {t('Last question: {answer}', {
                      answer: (fr && room.reveal.fr?.answer) || room.reveal.answer,
                    })}
                  </p>
                )}
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
      {!mine && room.turn && room.ai.includes(room.turn) && frame < 0 && (
        <p className="experience-match" role="status">
          {t('The AI player is lining up its shot…')}
        </p>
      )}
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

const CATS: Record<string, string> = {
  general: 'General knowledge',
  business: 'Business and money',
  tech: 'Technology',
  sport: 'Sport',
  music: 'Music',
  cities: 'The cities',
  science: 'Science',
  geography: 'Geography',
};

/** A host waiting alone: when AI opponents will take the other seats. */
function QuizWait({ createdAt }: { createdAt: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const left = Math.max(0, Math.ceil((createdAt + QUIZ_AI_AFTER - now) / 1000));
  return (
    <p className="experience-match" role="status">
      {left > 0
        ? t('Looking for a player in this city… AI opponents in {n}s.', { n: left })
        : t('Calling in AI opponents…')}
    </p>
  );
}

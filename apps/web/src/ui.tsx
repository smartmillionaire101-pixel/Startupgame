/** Small, accessible UI primitives. No UI framework: keeps the app tiny. */
import {
  useEffect,
  useLayoutEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type Ref,
} from 'react';
import { useGame } from './store';
import { t } from './i18n';
import { useSimple } from './phone/settings';

export function Card({
  title,
  sub,
  action,
  children,
  tone,
  className,
}: {
  title?: ReactNode;
  /** A quiet line under the title. */
  sub?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  tone?: 'warn' | 'good' | 'bad';
  className?: string;
}) {
  return (
    <section className={`card${tone ? ` card-${tone}` : ''}${className ? ` ${className}` : ''}`}>
      {(title || action) && (
        <header className="card-head">
          {title && (
            <h2>
              {title}
              {sub && <span className="card-sub">{sub}</span>}
            </h2>
          )}
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

/** A stat tile: a small label, one big number, and a hint under it. */
export function Stat({
  label,
  value,
  hint,
  tone,
  icon,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: 'good' | 'bad' | 'warn' | 'money';
  icon?: IconName;
}) {
  return (
    <div className={`stat${tone ? ` stat-${tone}` : ''}`}>
      <div className="stat-label">
        {icon && <Icon name={icon} size={14} />}
        {label}
      </div>
      <div
        className={`stat-value${typeof value === 'string' && value.length > 9 ? ' is-long' : ''}`}
      >
        {value}
      </div>
      {hint && <div className="stat-hint">{hint}</div>}
    </div>
  );
}
export function Button({
  variant = 'primary',
  size,
  block,
  loading,
  children,
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle';
  size?: 'sm' | 'lg';
  block?: boolean;
  loading?: boolean;
}) {
  const { busy } = useGame();
  const cls =
    className ?? `btn btn-${variant}${size ? ` btn-${size}` : ''}${block ? ' btn-block' : ''}`;
  return (
    <button
      className={cls}
      disabled={rest.disabled || busy || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Bar({
  value,
  label,
  tone,
}: {
  value: number;
  label: string;
  tone?: 'good' | 'bad' | 'warn';
}) {
  const v = Math.max(0, Math.min(1, value));
  return (
    <div
      className="bar"
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(v * 100)}
    >
      <div className="bar-row">
        <span>{label}</span>
        <span>{Math.round(v * 100)}</span>
      </div>
      <div className="bar-track">
        <div className={`bar-fill${tone ? ` bar-${tone}` : ''}`} style={{ width: `${v * 100}%` }} />
      </div>
    </div>
  );
}

/** Tiny SVG sparkline. Hidden in lite mode (no charts for low bandwidth). */
export function Sparkline({ values, label }: { values: number[]; label: string }) {
  const { lite } = useGame();
  if (lite || values.length < 2) return null;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const w = 120;
  const h = 32;
  const pts = values
    .map((v, i) => `${(i / (values.length - 1)) * w},${h - ((v - min) / (max - min || 1)) * h}`)
    .join(' ');
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={label}>
      <polyline
        points={pts}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: ReactNode;
  children: (id: string) => ReactNode;
}) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children(id)}
      {hint && <div className="field-hint">{hint}</div>}
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string; disabled?: boolean }[];
  onChange: (v: T) => void;
  label: string;
}) {
  const row = useRef<HTMLDivElement>(null);
  // A row that scrolls: keep the chosen option in view.
  // (Sideways only: scrollIntoView could move the page too.)
  useEffect(() => {
    const r = row.current;
    const b = r?.querySelector<HTMLElement>('button.on');
    if (!r || !b) return;
    if (b.offsetLeft < r.scrollLeft) r.scrollLeft = b.offsetLeft;
    else if (b.offsetLeft + b.offsetWidth > r.scrollLeft + r.clientWidth)
      r.scrollLeft = b.offsetLeft + b.offsetWidth - r.clientWidth;
  }, [value]);
  return (
    <div className="segmented" role="radiogroup" aria-label={label} ref={row}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          className={value === o.value ? 'on' : ''}
          disabled={o.disabled}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Pill({
  children,
  tone,
}: {
  children: ReactNode;
  tone?: 'good' | 'bad' | 'warn' | 'info';
}) {
  return <span className={`pill${tone ? ` pill-${tone}` : ''}`}>{children}</span>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>;
}

/** An empty state: an icon, a title, why it's empty and what to do next. */
export function EmptyState({
  icon = 'spark',
  emoji,
  title,
  children,
  action,
}: {
  icon?: IconName;
  emoji?: string;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-state-icon" aria-hidden="true">
        {emoji ?? <Icon name={icon} size={24} />}
      </span>
      {title && <p className="empty-state-title">{title}</p>}
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

/**
 * A list row: something at the start (an icon, emoji or avatar), a title,
 * a line under it, and something at the end. With onClick it's a button
 * with a chevron.
 */
export function ListRow({
  lead,
  leadRound,
  title,
  sub,
  end,
  onClick,
  chevron,
  read,
  className,
  label,
}: {
  lead?: ReactNode;
  leadRound?: boolean;
  title: ReactNode;
  sub?: ReactNode;
  end?: ReactNode;
  onClick?: () => void;
  chevron?: boolean;
  read?: boolean;
  className?: string;
  /** An accessible name, when the title alone doesn't say it. */
  label?: string;
}) {
  const body = (
    <>
      {lead !== undefined && (
        <span className={`lrow-lead${leadRound ? ' is-round' : ''}`} aria-hidden="true">
          {lead}
        </span>
      )}
      <span className="lrow-main">
        <span className="lrow-title">{title}</span>
        {sub && <span className="lrow-sub">{sub}</span>}
      </span>
      {(end !== undefined || (onClick && chevron !== false)) && (
        <span className="lrow-end">
          {end}
          {onClick && chevron !== false && <Icon name="chevron" size={18} className="lrow-chev" />}
        </span>
      )}
    </>
  );
  const cls = `lrow${read ? ' is-read' : ''}${className ? ` ${className}` : ''}`;
  return onClick ? (
    <button type="button" className={cls} onClick={onClick} aria-label={label}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  );
} /**
 * Bottom sheet for focused flows (offers, pitches, deal cards). Escape closes it.
 * Simple mode (Phase 2): "‹ Back" at the top-left closes it instead of the ×,
 * the same word in the same spot as the phone's Back.
 */
export function Sheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const simple = useSimple();
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <header className={`sheet-head${simple ? ' sheet-head-simple' : ''}`}>
          {simple && (
            <button type="button" className="back-btn" onClick={onClose}>
              <Icon name="chevron" size={18} className="back-btn-ico" />
              {t('Back')}
            </button>
          )}
          <h2>{title}</h2>
          {!simple && (
            <button className="icon-btn" aria-label={t('Close')} onClick={onClose}>
              <Icon name="close" size={18} />
            </button>
          )}
        </header>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  );
}

export function Confirm({
  label,
  confirmLabel,
  onConfirm,
  variant = 'danger',
}: {
  label: string;
  confirmLabel: string;
  onConfirm: () => void;
  variant?: 'danger' | 'primary';
}) {
  const [armed, setArmed] = useState(false);
  return armed ? (
    <div className="row">
      <Button variant={variant} onClick={onConfirm}>
        {confirmLabel}
      </Button>
      <Button variant="ghost" onClick={() => setArmed(false)}>
        {t('Cancel')}
      </Button>
    </div>
  ) : (
    <Button variant="ghost" onClick={() => setArmed(true)}>
      {label}
    </Button>
  );
}

const TOAST_ICON: Record<'ok' | 'error' | 'info', IconName> = {
  ok: 'check',
  error: 'alert',
  info: 'spark',
};

export function Toasts() {
  const { toasts } = useGame();
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((x) => (
        <div key={x.id} className={`toast toast-${x.tone}`}>
          <span className="toast-icon" aria-hidden="true">
            <Icon name={TOAST_ICON[x.tone]} size={16} />
          </span>
          <span>{x.text}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * A card that folds (Wave 7): title, a one-line summary while closed, and
 * the body on demand. Keeps long screens to a first screen you can read.
 */
export function Fold({
  title,
  sub,
  open,
  children,
  id,
}: {
  title: ReactNode;
  sub?: ReactNode;
  open?: boolean;
  children: ReactNode;
  id?: string;
}) {
  return (
    <details className="card fold" open={open} data-fold={id}>
      <summary className="fold-head">
        <span className="fold-title">
          <h2>{title}</h2>
          {sub && <span className="fold-sub">{sub}</span>}
        </span>
        <Icon name="chevron" className="fold-chev" />
      </summary>
      <div className="fold-body">{children}</div>
    </details>
  );
}

export type IconName =
  | 'city'
  | 'today'
  | 'company'
  | 'portfolio'
  | 'deals'
  | 'bank'
  | 'money'
  | 'me'
  | 'phone'
  | 'news'
  | 'plus'
  | 'minus'
  | 'locate'
  | 'list'
  | 'people'
  | 'spark'
  | 'chevron'
  | 'close'
  | 'bolt'
  | 'check'
  | 'alert'
  | 'wallet'
  | 'clock'
  | 'bell'
  | 'more'
  | 'door'
  | 'cart'
  | 'rotate'
  | 'rotateLeft'
  | 'eye'
  | 'camera'
  | 'sofa'
  | 'friends'
  | 'pad'
  | 'wave'
  | 'wheel'
  | 'flag'
  | 'sun'
  | 'moon'
  | 'face'
  | 'faceMeh'
  | 'faceSad'
  | 'info'
  | 'up'
  | 'down';

/** One stroke style for every icon: 24-unit grid, 1.8 stroke, round caps. */
const PATHS: Record<IconName, ReactNode> = {
  city: (
    <>
      <path d="M3 21h18" />
      <path d="M5 21V9l5-3v15" />
      <path d="M10 21V4l9 4v13" />
      <path d="M13 10h3M13 14h3M13 18h3" />
    </>
  ),
  today: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
      <path d="M8 14.5h3" />
    </>
  ),
  company: (
    <>
      <rect x="3" y="7.5" width="18" height="12.5" rx="2.5" />
      <path d="M9 7.5V5.5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 5.5v2" />
      <path d="M3 13h18" />
    </>
  ),
  portfolio: (
    <>
      <path d="M12 3v9l7.5 4.5" />
      <circle cx="12" cy="12" r="9" />
    </>
  ),
  deals: <path d="M4 7h12l-3-3M20 17H8l3 3" />,
  bank: (
    <>
      <path d="M3 9.5 12 4l9 5.5" />
      <path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20.5h18" />
    </>
  ),
  money: (
    <>
      <rect x="2.5" y="6" width="19" height="12" rx="2.5" />
      <circle cx="12" cy="12" r="2.6" />
      <path d="M6 9.5v5M18 9.5v5" />
    </>
  ),
  me: (
    <>
      <circle cx="12" cy="8.5" r="4" />
      <path d="M4.5 20.5a7.5 7.5 0 0 1 15 0" />
    </>
  ),
  phone: (
    <>
      <rect x="6.5" y="2.5" width="11" height="19" rx="2.6" />
      <path d="M10.5 18.3h3" />
    </>
  ),
  news: (
    <>
      <path d="M4 5.5h13v13a2 2 0 0 0 2 2H6a2 2 0 0 1-2-2z" />
      <path d="M17 9h3v9.5a2 2 0 0 1-2 2" />
      <path d="M7.5 9h6M7.5 12.5h6M7.5 16h4" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  locate: (
    <>
      <circle cx="12" cy="12" r="6.5" />
      <circle cx="12" cy="12" r="2" />
      <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3" />
    </>
  ),
  list: <path d="M8 6.5h12M8 12h12M8 17.5h12M4 6.5h.01M4 12h.01M4 17.5h.01" />,
  people: (
    <>
      <circle cx="9" cy="8.5" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
      <path d="M15.5 5.2a3.5 3.5 0 0 1 0 6.6M18 14.2a6.5 6.5 0 0 1 3.5 5.8" />
    </>
  ),
  spark: <path d="M12 3l2.2 6.3L20.5 12l-6.3 2.2L12 20.5l-2.2-6.3L3.5 12l6.3-2.7z" />,
  chevron: <path d="m6 9 6 6 6-6" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  bolt: <path d="M13 2.5 5 13.5h6l-1 8 8-11h-6z" />,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  alert: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5v5.5M12 16.5h.01" />
    </>
  ),
  wallet: (
    <>
      <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H18v3" />
      <rect x="3.5" y="7.5" width="17" height="12" rx="2.5" />
      <path d="M16 13.5h.01" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  bell: (
    <>
      <path d="M6 9a6 6 0 1 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9z" />
      <path d="M10 20a2.2 2.2 0 0 0 4 0" />
    </>
  ),
  more: <path d="M5 12h.01M12 12h.01M19 12h.01" strokeWidth="3.4" />,
  door: (
    <>
      <path d="M5 21h14M7 21V4.5A1.5 1.5 0 0 1 8.5 3h7A1.5 1.5 0 0 1 17 4.5V21" />
      <path d="M14 12h.01" strokeWidth="3" />
    </>
  ),
  cart: (
    <>
      <path d="M3 4h2l2.2 10.5h10.6L20 7H6.2" />
      <circle cx="9" cy="19" r="1.4" />
      <circle cx="17" cy="19" r="1.4" />
    </>
  ),
  rotate: (
    <>
      <path d="M20 12a8 8 0 1 1-2.4-5.7" />
      <path d="M20 4v5h-5" />
    </>
  ),
  rotateLeft: (
    <>
      <path d="M4 12a8 8 0 1 0 2.4-5.7" />
      <path d="M4 4v5h5" />
    </>
  ),
  eye: (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="2.8" />
    </>
  ),
  camera: (
    <>
      <path d="M4 8h3l1.6-2.5h6.8L17 8h3v11H4z" />
      <circle cx="12" cy="13" r="3.4" />
    </>
  ),
  sofa: (
    <>
      <path d="M4 11V8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3" />
      <path d="M3 11h3v3h12v-3h3v7H3z" />
      <path d="M5 18v2M19 18v2" />
    </>
  ),
  friends: (
    <>
      <path d="M3 11 12 4l9 7" />
      <path d="M5.5 9.5V20h13V9.5" />
      <circle cx="12" cy="13" r="2" />
      <path d="M9 19c.4-1.6 1.5-2.5 3-2.5s2.6.9 3 2.5" />
    </>
  ),
  pad: (
    <>
      <rect x="2.5" y="7" width="19" height="11" rx="5.5" />
      <path d="M7 10.5v4M5 12.5h4M15.5 11.5h.01M18 13.5h.01" />
    </>
  ),
  wave: (
    <path d="M7 11V5.5a1.5 1.5 0 0 1 3 0V10M10 9.5V4a1.5 1.5 0 0 1 3 0v6M13 9.5V5a1.5 1.5 0 0 1 3 0v7M16 10.5a1.5 1.5 0 0 1 3 0v3a7 7 0 0 1-7 7h-.5a6 6 0 0 1-5.2-3l-2.4-4.3a1.5 1.5 0 0 1 2.6-1.5L7 13" />
  ),
  wheel: (
    <>
      <circle cx="12" cy="10" r="7" />
      <path d="M12 3v14M5 10h14M7 5l10 10M17 5 7 15" />
      <path d="M9 21h6M12 17v4" />
    </>
  ),
  flag: <path d="M5 21V4M5 4h11l-2 4 2 4H5" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </>
  ),
  moon: <path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z" />,
  face: (
    <>
      <circle cx="12" cy="12" r="9.2" />
      <path d="M8.2 14.2c1 1.4 2.3 2.1 3.8 2.1s2.8-.7 3.8-2.1" />
      <path d="M9 9.6h.01M15 9.6h.01" strokeWidth="2.8" />
    </>
  ),
  faceMeh: (
    <>
      <circle cx="12" cy="12" r="9.2" />
      <path d="M8.5 15h7" />
      <path d="M9 9.6h.01M15 9.6h.01" strokeWidth="2.8" />
    </>
  ),
  faceSad: (
    <>
      <circle cx="12" cy="12" r="9.2" />
      <path d="M8.2 16.2c1-1.4 2.3-2.1 3.8-2.1s2.8.7 3.8 2.1" />
      <path d="M9 9.6h.01M15 9.6h.01" strokeWidth="2.8" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6M12 7.5h.01" />
    </>
  ),
  up: <path d="m6 15 6-6 6 6" />,
  down: <path d="m6 9 6 6 6-6" />,
};

export function Icon({
  name,
  size = 22,
  className,
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      className={`icon${className ? ` ${className}` : ''}`}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}

/** A number that ticks to its new value; with reduced motion it just changes. */
export function CountUp({ value, format }: { value: number; format: (n: number) => string }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = from.current;
    if (start === value || reduceMotion()) {
      from.current = value;
      const id = requestAnimationFrame(() => setShown(value));
      return () => cancelAnimationFrame(id);
    }
    const t0 = performance.now();
    const ms = 600;
    let raf = 0;
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / ms);
      const v = k < 1 ? start + (value - start) * (1 - Math.pow(1 - k, 3)) : value;
      from.current = v;
      setShown(v);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{format(shown)}</>;
}

/** Reduced motion: the OS setting, or the in-game one (`runway.reduceMotion`). */
export function reduceMotion(): boolean {
  if (typeof document !== 'undefined') {
    const d = document.documentElement.dataset.reduceMotion;
    if (d === '1') return true;
    if (d === '0') return false;
  }
  return (
    typeof window !== 'undefined' &&
    !!window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * Work out reduced motion at start-up (and when the OS setting or the stored
 * preference changes) and expose it as `data-reduce-motion` on <html>, so CSS
 * and code share one answer. The phone's Settings can dispatch
 * `runway:reduce-motion` after writing `runway.reduceMotion` to apply it at once.
 */
export function initReduceMotion() {
  if (typeof window === 'undefined') return;
  const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const apply = () => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem('runway.reduceMotion');
    } catch {
      /* storage blocked: the OS setting decides */
    }
    const on =
      stored === '1' || stored === 'true'
        ? true
        : stored === '0' || stored === 'false'
          ? false
          : !!mq?.matches;
    document.documentElement.dataset.reduceMotion = on ? '1' : '0';
  };
  apply();
  mq?.addEventListener?.('change', apply);
  window.addEventListener('storage', (e) => {
    if (e.key === 'runway.reduceMotion') apply();
  });
  window.addEventListener('runway:reduce-motion', apply);
}

/**
 * A round icon button of the floating HUD (player: "make the whole game look
 * like this"). The icon alone shows; its name is the accessible name, a
 * bubble on a long press (or keyboard focus, or a mouse hovering), and a small
 * label under it in a first session and in Simple mode (`.hud-lbl`).
 */
export function HudButton({
  icon,
  label,
  name,
  badge,
  dot,
  tone,
  size,
  tip = 'left',
  className,
  children,
  onClick,
  ref,
  ...rest
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'name'> & {
  ref?: Ref<HTMLButtonElement>;
  icon?: IconName;
  /** The accessible name (and the bubble's words). */
  label: string;
  /** The shorter name under the icon (the label when not given). */
  name?: string;
  /** A count on the button ("3" waiting). */
  badge?: number;
  /** A red dot: something new. */
  dot?: boolean;
  tone?: 'accent';
  size?: 'sm';
  /** Where the bubble opens. */
  tip?: 'left' | 'right' | 'below' | 'above';
}) {
  const [bubble, setBubble] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pressed = useRef(false);
  useEffect(() => () => clearTimeout(timer.current), []);
  const hideSoon = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setBubble(false), 1400);
  };
  const cls = [
    'hud-ib',
    tone === 'accent' ? 'is-accent' : '',
    size === 'sm' ? 'is-sm' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <button
      type="button"
      {...rest}
      ref={ref}
      className={cls}
      aria-label={label}
      data-hud-btn=""
      onPointerDown={(e) => {
        rest.onPointerDown?.(e);
        pressed.current = false;
        if (e.pointerType === 'mouse') return;
        clearTimeout(timer.current);
        // A long press (about half a second) says the button's name.
        timer.current = setTimeout(() => {
          pressed.current = true;
          setBubble(true);
        }, 450);
      }}
      onPointerUp={(e) => {
        rest.onPointerUp?.(e);
        if (pressed.current) hideSoon();
        else clearTimeout(timer.current);
      }}
      onPointerCancel={() => {
        if (pressed.current) hideSoon();
        else clearTimeout(timer.current);
      }}
      onPointerEnter={(e) => {
        if (e.pointerType === 'mouse') setBubble(true);
      }}
      onPointerLeave={(e) => {
        if (e.pointerType === 'mouse') setBubble(false);
        else if (!pressed.current) clearTimeout(timer.current);
      }}
      onContextMenu={(e) => e.preventDefault()}
      onFocus={(e) => {
        rest.onFocus?.(e);
        // Keyboard focus (not a tap) shows the name too.
        if (e.currentTarget.matches(':focus-visible')) setBubble(true);
      }}
      onBlur={(e) => {
        rest.onBlur?.(e);
        setBubble(false);
      }}
      onClick={(e: ReactMouseEvent<HTMLButtonElement>) => {
        // The press that showed the name doesn't also press the button.
        if (pressed.current) {
          pressed.current = false;
          e.preventDefault();
          return;
        }
        onClick?.(e);
      }}
    >
      {children ?? (icon && <Icon name={icon} />)}
      {!!badge && (
        <span className="hud-badge" aria-hidden="true">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
      {dot && <span className="hud-dot" aria-hidden="true" />}
      <span className="hud-lbl" aria-hidden="true">
        {name ?? label}
      </span>
      {bubble && (
        <span className={`hud-tip is-${tip}`} data-hud-tip="" aria-hidden="true">
          {label}
        </span>
      )}
    </button>
  );
}

/**
 * A scene's own buttons, a column of round icons down the right edge. The
 * few used most show; `extras` wait behind ⋯ (with their names beside them
 * when it opens). Escape or a tap outside closes it, and focus comes back to ⋯.
 */
export function HudRail({
  label,
  extras,
  children,
  className,
  ...rest
}: Omit<HTMLAttributes<HTMLDivElement>, 'children'> & {
  label: string;
  /** Behind ⋯ (none: no ⋯). */
  extras?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  // The menu would run up under the HUD's pills: the rail's own buttons step
  // aside meanwhile, so the rest has the rail's whole height.
  const [tall, setTall] = useState(false);
  const id = useId();
  const moreRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!open || !list) return;
    const hud = [...document.querySelectorAll<HTMLElement>('.hud-top, .hud-sub')]
      .map((e) => e.getBoundingClientRect())
      .filter((r) => r.height > 0);
    const under = Math.max(0, ...hud.map((r) => r.bottom));
    if (list.getBoundingClientRect().top < under + 8) setTall(true);
  }, [open]);
  const close = (focus = true) => {
    setOpen(false);
    setTall(false);
    if (focus) moreRef.current?.focus({ preventScroll: true });
  };
  useEffect(() => {
    if (!open) return;
    // Into the menu: its first button.
    listRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({
      preventScroll: true,
    });
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setOpen(false);
      setTall(false);
      moreRef.current?.focus({ preventScroll: true });
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open]);
  return (
    <div
      {...rest}
      className={`hud-rail${open ? ' is-open' : ''}${tall ? ' is-tall' : ''}${className ? ` ${className}` : ''}`}
      role="group"
      aria-label={label}
      data-hud-rail=""
    >
      {open && <div className="hud-dim" aria-hidden="true" onClick={() => close(false)} />}
      {extras && open && (
        <div
          className="hud-rail-extra"
          id={id}
          ref={listRef}
          role="group"
          aria-label={t('More')}
          // Picking one closes the menu (after its own click has run).
          onClick={(e) => {
            if ((e.target as HTMLElement).closest('button')) {
              setOpen(false);
              setTall(false);
            }
          }}
        >
          {extras}
        </div>
      )}
      {extras && (
        <HudButton
          ref={moreRef}
          icon="more"
          label={t('More')}
          className="hud-more-btn"
          data-hud-more=""
          aria-expanded={open}
          aria-controls={open ? id : undefined}
          onClick={() => (open ? close() : setOpen(true))}
        />
      )}
      {children}
    </div>
  );
}

/**
 * The terminal's view in a trip's scene: in 3D (./Terminal3D, lazy) where
 * the player draws 3D and WebGL works, else the drawn view (`fallback`):
 * Lite, no WebGL, or a context that failed. `before` goes above the canvas
 * in 3D (the departures board at the ticket desk).
 */
import { lazy, Suspense, useState, type ReactNode } from 'react';
import { use3d } from '../../three-kit/quality';
import type { TerminalOpts, Zone } from './terminal3d';
import './terminal.css';

const Terminal3D = lazy(() => import('./Terminal3D'));

export function TerminalScene({
  opts,
  zone,
  playing,
  fallback,
  before,
  words,
  onTap,
}: {
  opts: TerminalOpts;
  zone: Zone;
  playing: boolean;
  fallback: ReactNode;
  before?: ReactNode;
  /** What the 3D scene shows, in words (hidden: screen readers and tests). */
  words?: ReactNode;
  onTap?: () => void;
}) {
  const three = use3d();
  const [failed, setFailed] = useState(false);
  if (!three || failed) return <>{fallback}</>;
  return (
    <>
      {before}
      <div
        className="terminal-scene"
        data-terminal={opts.mode}
        data-terminal-zone={zone}
        data-hall={zone}
        onClick={onTap}
      >
        <Suspense fallback={<div className="terminal-loading" aria-hidden="true" />}>
          <Terminal3D opts={opts} zone={zone} playing={playing} onFail={() => setFailed(true)} />
        </Suspense>
        {words && <div className="sr-only">{words}</div>}
      </div>
    </>
  );
}

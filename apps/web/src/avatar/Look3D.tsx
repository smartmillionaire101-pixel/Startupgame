/**
 * A look as the game's 3D person, on a small turntable (./look3dScene.ts),
 * updating as it changes: the wardrobe's outfit and the avatar creator. The
 * 2D figure (`children`) stays as the fallback: shown until the 3D one is
 * drawing, and for good where 3D can't run (no WebGL, the Lite setting). It
 * stays in the page either way (hidden), so what it says about the look is
 * still there.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { AvatarLook } from '../city/art';
import { useQuality, webglAvailable } from '../three-kit/quality';
import type { Preview } from './look3dScene';

/** The CC0 models turned off (runway.models = off): no 3D preview either. (No three.js here.) */
function modelsOff(): boolean {
  try {
    return localStorage.getItem('runway.models') === 'off';
  } catch {
    return false;
  }
}

export function Look3D({
  look,
  width,
  height,
  label,
  children,
}: {
  look: AvatarLook;
  width: number;
  height: number;
  label?: string;
  children: ReactNode;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const view = useRef<Preview | null>(null);
  const [ready, setReady] = useState(false);
  const quality = useQuality();
  // (With the CC0 models turned off, runway.models = off: the 2D figure only, as before.)
  const on = quality === '3d' && webglAvailable() && !modelsOff();
  const latest = useRef(look);
  // (Built again only when the look itself changes, not each render.)
  const key = JSON.stringify(look);
  useEffect(() => {
    latest.current = JSON.parse(key) as AvatarLook;
    view.current?.setLook(latest.current);
  }, [key]);

  useEffect(() => {
    if (!on || !canvas.current) return;
    let gone = false;
    import('./look3dScene')
      .then((m) => {
        if (gone || !canvas.current) return;
        view.current = m.createPreview(canvas.current, latest.current);
        setReady(true);
      })
      .catch(() => setReady(false));
    return () => {
      gone = true;
      view.current?.dispose();
      view.current = null;
      setReady(false);
    };
  }, [on]);

  return (
    <div
      className="look3d"
      data-look3d={ready ? 'ready' : on ? 'loading' : 'off'}
      style={{ position: 'relative', width, height, flex: 'none' }}
      role={label ? 'img' : undefined}
      aria-label={label}
    >
      <div
        style={{
          visibility: ready ? 'hidden' : 'visible',
          display: 'flex',
          justifyContent: 'center',
        }}
      >
        {children}
      </div>
      {on && (
        <canvas
          ref={canvas}
          aria-hidden="true"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
        />
      )}
    </div>
  );
}

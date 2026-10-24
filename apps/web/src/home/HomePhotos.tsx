/**
 * Photos of your home (player feedback: "take pictures of their house"), and
 * since the camera (../photos/snap.ts) of sky views, game results and your
 * company: the same sheet, floating over the screen (`floating`).
 * "📷 Photo" in the home scene reads the 3D view (Home3DApi.snapshot) and
 * opens this sheet: the picture, Save (a download), Share where the phone
 * can share files, and the last few photos you took ("Your photos").
 *
 * Photos are kept on this device only, in localStorage (`runway.homePhotos`):
 * at most MAX_PHOTOS small JPEGs, oldest dropped first when storage is short.
 */
import { useEffect, useMemo, useState } from 'react';
import './home.css';
import './home-photos.css';
import { t } from '../i18n';

export interface HomePhoto {
  id: string;
  /** When it was taken (ms). */
  at: number;
  /** A JPEG data URL. */
  src: string;
}

const KEY = 'runway.homePhotos';
const MAX_PHOTOS = 6;
/** Characters of storage the photos may use together (~2.5 MB). */
const MAX_CHARS = 2_500_000;

function loadPhotos(): HomePhoto[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]') as unknown;
    if (!Array.isArray(raw)) return [];
    return raw.filter(
      (p): p is HomePhoto =>
        !!p &&
        typeof p.id === 'string' &&
        typeof p.at === 'number' &&
        typeof p.src === 'string' &&
        p.src.startsWith('data:image/jpeg'),
    );
  } catch {
    return [];
  }
}

/** Write the list, dropping the oldest until it fits; returns what was kept. */
function store(list: HomePhoto[]): HomePhoto[] {
  let keep = list.slice(0, MAX_PHOTOS);
  while (keep.length && keep.reduce((n, p) => n + p.src.length, 0) > MAX_CHARS)
    keep = keep.slice(0, -1);
  for (;;) {
    try {
      localStorage.setItem(KEY, JSON.stringify(keep));
      return keep;
    } catch {
      // Storage full or blocked: drop the oldest and try again (an empty list last).
      if (!keep.length) return [];
      keep = keep.slice(0, -1);
    }
  }
}

/** Keep a new photo (newest first). */
export function addPhoto(src: string): HomePhoto[] {
  const at = Date.now();
  const old = loadPhotos();
  // Unique on this device: the time, and a count when two land in the same ms.
  let id = at.toString(36);
  for (let n = 1; old.some((p) => p.id === id); n++) id = `${at.toString(36)}-${n}`;
  return store([{ id, at, src }, ...old]);
}

function removePhoto(id: string): HomePhoto[] {
  return store(loadPhotos().filter((p) => p.id !== id));
}

/** A data URL as a file (to share). */
function fileOf(src: string, name: string): File | null {
  try {
    const [head, body] = src.split(',');
    const bytes = Uint8Array.from(atob(body ?? ''), (c) => c.charCodeAt(0));
    return new File([bytes], name, { type: head?.match(/data:([^;]+)/)?.[1] ?? 'image/jpeg' });
  } catch {
    return null;
  }
}

const slug = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'home';

export function PhotoSheet({
  first,
  city,
  onClose,
  title,
  file: fileBase = 'my-home',
  floating = false,
}: {
  /** The photo just taken (opens on it), if any. */
  first: string | null;
  /** The city, for the file's name (my-home-lagos.jpg). */
  city: string;
  onClose: () => void;
  /** The sheet's title (default: "Photo of your home"). */
  title?: string;
  /** The file's name before the city ("my-golf-round" → my-golf-round-lagos.jpg). */
  file?: string;
  /** Over the whole screen (a sky view, a game, a company screen), not inside a scene. */
  floating?: boolean;
}) {
  const [photos, setPhotos] = useState(loadPhotos);
  const [shown, setShown] = useState<string | null>(first ?? photos[0]?.src ?? null);
  // Share: only where the phone can share a picture file.
  const name = `${fileBase}-${slug(city)}.jpg`;
  const heading = title ?? t('Photo of your home');
  const file = useMemo(() => (shown ? fileOf(shown, name) : null), [shown, name]);
  const canShare =
    !!file && typeof navigator !== 'undefined' && !!navigator.canShare?.({ files: [file] });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const share = async () => {
    if (!file) return;
    try {
      await navigator.share({ files: [file], title: title ?? t('My home') });
    } catch {
      /* cancelled */
    }
  };
  const remove = (p: HomePhoto) => {
    const next = removePhoto(p.id);
    setPhotos(next);
    if (shown === p.src) setShown(next[0]?.src ?? null);
  };

  return (
    <div className={`home-sheet-back${floating ? ' photo-float' : ''}`} onClick={onClose}>
      <section
        className="home-sheet home-photos"
        role="dialog"
        aria-label={heading}
        data-home-photos=""
        onClick={(e) => e.stopPropagation()}
      >
        <header>
          <h3>{heading}</h3>
          <button type="button" className="icon-btn" aria-label={t('Close')} onClick={onClose}>
            ✕
          </button>
        </header>
        {shown ? (
          <img
            className="home-photo-big"
            src={shown}
            alt={title ? t('Your photo') : t('Your home, as you saw it')}
          />
        ) : (
          <p className="small muted">{t('Couldn’t take a photo on this device.')}</p>
        )}
        <div className="home-photo-actions">
          {shown && (
            <a
              className="btn btn-primary btn-sm"
              href={shown}
              download={name}
              data-action="save-photo"
            >
              {t('Save picture')}
            </a>
          )}
          {canShare && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              data-action="share-photo"
              onClick={() => void share()}
            >
              {t('Share')}
            </button>
          )}
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
            {t('Close')}
          </button>
        </div>
        {photos.length > 0 && (
          <>
            <h4 className="home-photo-head">{t('Your photos')}</h4>
            <p className="small muted">{t('Kept on this device only.')}</p>
            <ul className="home-photo-list" aria-label={t('Your photos')}>
              {photos.map((p) => (
                <li key={p.id} data-photo={p.id}>
                  <button
                    type="button"
                    className="home-photo-thumb"
                    aria-pressed={p.src === shown}
                    aria-label={t('Show photo from {when}', {
                      when: new Date(p.at).toLocaleString(),
                    })}
                    onClick={() => setShown(p.src)}
                  >
                    <img src={p.src} alt="" />
                  </button>
                  <button
                    type="button"
                    className="home-photo-del"
                    aria-label={t('Delete photo')}
                    onClick={() => remove(p)}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}

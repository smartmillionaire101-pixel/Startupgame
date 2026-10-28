/**
 * A camera button for any screen: takes the picture `make` draws (a results
 * card, ./snap.ts), keeps it with your photos and opens the photo sheet to
 * save or share it.
 */
import { useState } from 'react';
import { PhotoSheet, addPhoto } from '../home/HomePhotos';
import { HudButton } from '../ui';

export function SnapButton({
  make,
  label,
  title,
  file,
  city,
  className = 'btn btn-subtle',
  action = 'snap',
  hud,
}: {
  /** Draws the picture (a JPEG data URL), or null when it can't. */
  make: () => string | null;
  label: string;
  /** The photo sheet's title. */
  title: string;
  /** The file's name before the city. */
  file: string;
  city: string;
  className?: string;
  /** The `data-action`, for tests. */
  action?: string;
  /** A round camera icon in a scene's rail (the floating HUD's), its name the label. */
  hud?: boolean;
}) {
  const [photo, setPhoto] = useState<{ src: string | null } | null>(null);
  const take = () => {
    let src: string | null = null;
    try {
      src = make();
    } catch {
      src = null;
    }
    if (src) addPhoto(src);
    setPhoto({ src });
  };
  return (
    <>
      {hud ? (
        <HudButton
          icon="camera"
          label={label}
          className={className}
          data-action={action}
          onClick={take}
        />
      ) : (
        <button
          type="button"
          className={`${className} snap-btn`}
          data-action={action}
          onClick={take}
        >
          <span aria-hidden="true">📷</span> {label}
        </button>
      )}
      {photo && (
        <PhotoSheet
          first={photo.src}
          city={city}
          title={title}
          file={file}
          floating
          onClose={() => setPhoto(null)}
        />
      )}
    </>
  );
}

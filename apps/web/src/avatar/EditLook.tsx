/**
 * Phase 6a: Me → "Edit my look". Opens the character creator on the look you
 * have now (a haircut from town included) and saves it on the server, so
 * every device and every other player sees it.
 */
import { useMemo, useState } from 'react';
import type { Appearance } from '@runway/engine';
import { appearanceOfLook, avatarLook } from '../city/art';
import { setLookOverride, useLookVersion } from '../city/acts/look';
import { genderOf } from '../city/life';
import { t } from '../i18n';
import { useView } from '../store';
import { Button, Sheet } from '../ui';
import { Creator } from './Creator';
import { Portrait } from './Portrait';

/** Your portrait, with the button that opens the creator under it. */
export function MyLook({ size = 88 }: { size?: number }) {
  const { view, send, busy } = useView();
  const me = view.me;
  const gender = genderOf(me) ?? 'female';
  const [open, setOpen] = useState(false);
  const v = useLookVersion();
  const look = useMemo(
    () => avatarLook(me.background?.id, me.id, gender),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- v: a saved look changed
    [me.background?.id, me.id, gender, v],
  );
  const save = async (a: Appearance) => {
    const r = await send({ type: 'player.appearance', appearance: a }, t('Look saved.'));
    if (r === null) return;
    // The server's look is the one now: this device's haircut is in it.
    setLookOverride(me.id, null);
    setOpen(false);
  };
  return (
    <div className="profile-look" data-my-look="">
      <Portrait
        id={me.id}
        bg={me.background?.id}
        gender={gender}
        size={size}
        label={t('Your look')}
        className="profile-portrait"
      />
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        {t('Edit my look')}
      </Button>
      {open && (
        <Sheet title={t('Edit my look')} onClose={() => setOpen(false)}>
          <Creator
            initial={appearanceOfLook(look)}
            gender={gender}
            bottom={look.bottom}
            busy={busy}
            onSave={(a) => void save(a)}
            onCancel={() => setOpen(false)}
          />
        </Sheet>
      )}
    </div>
  );
}

/**
 * Phase 6a: the character creator. A big live preview (your portrait and
 * your figure as the map draws it), then one tab per part — face, hair,
 * extras, top — with big swatches and thumbnails, plus Random and Save.
 *
 * Shown from onboarding (skippable: a random look is already picked) and
 * from Me → "Edit my look". It only edits an `Appearance`; the caller saves
 * it (`player.appearance`).
 */
import { useMemo, useState } from 'react';
import {
  FACE_SHAPES,
  GLASSES,
  HAIR_COLOURS,
  SKIN_TONES,
  TOP_COLOURS,
  GENDER_PARTS,
  defaultAppearance,
  fitAppearance,
  type Appearance,
} from '@runway/engine';
import { AvatarFigure, lookFromAppearance } from '../city/art';
import { t } from '../i18n';
import { Button } from '../ui';
import { PortraitOf } from './Portrait';
import './avatar.css';

type Gender = 'female' | 'male';

/** A random look (crypto, not the game's seeded RNG: nothing in the world depends on it). */
export function randomAppearance(gender?: Gender | null): Appearance {
  const n = crypto.getRandomValues(new Uint32Array(1))[0]!;
  return defaultAppearance(`random:${n}`, gender);
}

export const HAIR_NAME: Record<Appearance['hairStyle'], () => string> = {
  bald: () => t('Shaved'),
  buzz: () => t('Buzz cut'),
  short: () => t('Short'),
  curly: () => t('Curly'),
  afro: () => t('Afro'),
  twists: () => t('Twists'),
  locs: () => t('Locs'),
  braids: () => t('Braids'),
  bun: () => t('Bun'),
  long: () => t('Long and straight'),
};
const FACE_NAME: Record<Appearance['face'], () => string> = {
  oval: () => t('Oval face'),
  round: () => t('Round face'),
  square: () => t('Square face'),
  long: () => t('Long face'),
};
const FACIAL_NAME: Record<Appearance['facialHair'], () => string> = {
  none: () => t('No facial hair'),
  stubble: () => t('Stubble'),
  moustache: () => t('Moustache'),
  goatee: () => t('Goatee'),
  beard: () => t('Full beard'),
};
const GLASSES_NAME: Record<Appearance['glasses'], () => string> = {
  none: () => t('No glasses'),
  round: () => t('Round glasses'),
  square: () => t('Square glasses'),
  shades: () => t('Sunglasses'),
};
const HEADWEAR_NAME: Record<Appearance['headwear'], () => string> = {
  none: () => t('Nothing on my head'),
  cap: () => t('Cap'),
  beanie: () => t('Beanie'),
  headwrap: () => t('Headwrap'),
  gele: () => t('Gele'),
};
export const TOP_NAME: Record<Appearance['topStyle'], () => string> = {
  tee: () => t('T-shirt'),
  shirt: () => t('Shirt'),
  blazer: () => t('Blazer'),
  hoodie: () => t('Hoodie'),
  kaftan: () => t('Kaftan'),
  dress: () => t('Dress'),
  suit: () => t('Suit'),
  blouse: () => t('Blouse'),
};
export const HAIR_COLOUR_NAME: (() => string)[] = [
  () => t('Black'),
  () => t('Dark brown'),
  () => t('Brown'),
  () => t('Light brown'),
  () => t('Auburn'),
  () => t('Blonde'),
  () => t('Grey'),
  () => t('Burgundy'),
];
const TOP_COLOUR_NAME: (() => string)[] = [
  () => t('Teal'),
  () => t('Blue'),
  () => t('Navy'),
  () => t('Red'),
  () => t('Green'),
  () => t('Amber'),
  () => t('Purple'),
  () => t('Pink'),
  () => t('Orange'),
  () => t('Black'),
  () => t('White'),
  () => t('Gold'),
];

type Tab = 'face' | 'hair' | 'extras' | 'top';
const TABS: { id: Tab; name: () => string }[] = [
  { id: 'face', name: () => t('Face') },
  { id: 'hair', name: () => t('Hair') },
  { id: 'extras', name: () => t('Extras') },
  { id: 'top', name: () => t('Top') },
];

/** A row of colour swatches. */
function Swatches({
  label,
  colours,
  names,
  value,
  onPick,
  part,
}: {
  label: string;
  colours: readonly string[];
  names: (i: number) => string;
  value: string;
  onPick: (c: string) => void;
  part: string;
}) {
  return (
    <div className="creator-row" role="group" aria-label={label}>
      <span className="field-label">{label}</span>
      <div className="creator-swatches">
        {colours.map((c, i) => (
          <button
            key={c}
            type="button"
            className="creator-swatch"
            data-part={part}
            data-value={c}
            aria-pressed={value === c}
            aria-label={names(i)}
            title={names(i)}
            style={{ background: c }}
            onClick={() => onPick(c)}
          />
        ))}
      </div>
    </div>
  );
}

/** A row of thumbnails: the portrait with each option tried on. */
function Thumbs<K extends keyof Appearance>({
  label,
  part,
  options,
  names,
  a,
  gender,
  bottom,
  onPick,
  locked,
}: {
  label: string;
  part: K;
  options: readonly Appearance[K][];
  names: Record<string, () => string>;
  a: Appearance;
  gender: Gender;
  bottom: string;
  onPick: (v: Appearance[K]) => void;
  /** Not yours yet (a top you'd buy at the mall): shown, but not picked here. */
  locked?: (v: Appearance[K]) => boolean;
}) {
  return (
    <div className="creator-row" role="group" aria-label={label}>
      <span className="field-label">{label}</span>
      <div className="creator-thumbs">
        {options.map((v) => {
          const shut = !!locked?.(v) && a[part] !== v;
          return (
            <button
              key={String(v)}
              type="button"
              className={`creator-thumb${shut ? ' is-locked' : ''}`}
              data-part={part}
              data-value={String(v)}
              data-locked={shut ? '' : undefined}
              aria-pressed={a[part] === v}
              disabled={shut}
              onClick={() => onPick(v)}
            >
              <PortraitOf
                look={lookFromAppearance({ ...a, [part]: v }, gender, bottom)}
                size={56}
              />
              <span className="creator-thumb-name">{names[String(v)]!()}</span>
              {shut && <span className="creator-thumb-note">{t('At the mall')}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function Creator({
  initial,
  gender,
  bottom = '#1e293b',
  onSave,
  onCancel,
  cancelLabel,
  saveLabel,
  busy,
  tops,
}: {
  initial: Appearance;
  /**
   * The tops you have (Edit my look; play-test: "every top free, so bought
   * clothes add nothing"): the rest are at the mall. Sign-up offers them all.
   */
  tops?: ReadonlySet<string>;
  gender: Gender;
  /** Trousers come with your background; the creator shows them as they are. */
  bottom?: string;
  onSave: (a: Appearance) => void;
  onCancel?: () => void;
  cancelLabel?: string;
  saveLabel?: string;
  busy?: boolean;
}) {
  // Only what this gender wears: a man's look from before he chose has no dress.
  const [a, setA] = useState<Appearance>(() => fitAppearance(initial, gender));
  const parts = GENDER_PARTS[gender];
  const [tab, setTab] = useState<Tab>('face');
  const look = useMemo(() => lookFromAppearance(a, gender, bottom), [a, gender, bottom]);
  const set =
    <K extends keyof Appearance>(k: K) =>
    (v: Appearance[K]) =>
      setA((x) => ({ ...x, [k]: v }));
  const thumbs = { a, gender, bottom };
  return (
    <div className="creator" data-creator="">
      <div className="creator-preview" data-preview="">
        <PortraitOf look={look} size={148} className="creator-portrait" label={t('Your look')} />
        <svg
          className="creator-figure"
          viewBox="-16 -48 32 52"
          width="58"
          height="94"
          aria-hidden="true"
        >
          <AvatarFigure look={look} />
        </svg>
      </div>
      <div className="segmented creator-tabs" role="tablist" aria-label={t('Parts of your look')}>
        {TABS.map((x) => (
          <button
            key={x.id}
            type="button"
            role="tab"
            id={`creator-tab-${x.id}`}
            aria-selected={tab === x.id}
            aria-controls="creator-panel"
            className={tab === x.id ? 'on' : undefined}
            onClick={() => setTab(x.id)}
          >
            {x.name()}
          </button>
        ))}
      </div>
      <div
        className="creator-panel stack"
        id="creator-panel"
        role="tabpanel"
        aria-labelledby={`creator-tab-${tab}`}
      >
        {tab === 'face' && (
          <>
            <Swatches
              label={t('Skin tone')}
              part="skin"
              colours={SKIN_TONES}
              names={(i) => t('Skin tone {n}', { n: i + 1 })}
              value={a.skin}
              onPick={(c) => set('skin')(c as Appearance['skin'])}
            />
            <Thumbs
              label={t('Face shape')}
              part="face"
              options={FACE_SHAPES}
              names={FACE_NAME}
              onPick={set('face')}
              {...thumbs}
            />
          </>
        )}
        {tab === 'hair' && (
          <>
            <Thumbs
              label={t('Hairstyle')}
              part="hairStyle"
              options={parts.hairStyle}
              names={HAIR_NAME}
              onPick={set('hairStyle')}
              {...thumbs}
            />
            <Swatches
              label={t('Hair colour')}
              part="hairColor"
              colours={HAIR_COLOURS}
              names={(i) => HAIR_COLOUR_NAME[i]!()}
              value={a.hairColor}
              onPick={set('hairColor')}
            />
          </>
        )}
        {tab === 'extras' && (
          <>
            {parts.facialHair.length > 1 && (
              <Thumbs
                label={t('Facial hair')}
                part="facialHair"
                options={parts.facialHair}
                names={FACIAL_NAME}
                onPick={set('facialHair')}
                {...thumbs}
              />
            )}
            <Thumbs
              label={t('Glasses')}
              part="glasses"
              options={GLASSES}
              names={GLASSES_NAME}
              onPick={set('glasses')}
              {...thumbs}
            />
            <Thumbs
              label={t('Headwear')}
              part="headwear"
              options={parts.headwear}
              names={HEADWEAR_NAME}
              onPick={set('headwear')}
              {...thumbs}
            />
          </>
        )}
        {tab === 'top' && (
          <>
            <Thumbs
              label={t('Top')}
              part="topStyle"
              options={parts.topStyle}
              names={TOP_NAME}
              onPick={set('topStyle')}
              locked={tops ? (v) => !tops.has(v) : undefined}
              {...thumbs}
            />
            <Swatches
              label={t('Top colour')}
              part="topColor"
              colours={TOP_COLOURS}
              names={(i) => TOP_COLOUR_NAME[i]!()}
              value={a.topColor}
              onPick={set('topColor')}
            />
          </>
        )}
      </div>
      <div className="creator-actions">
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            // A random look keeps to the tops you have.
            const r = randomAppearance(gender);
            setA(tops && !tops.has(r.topStyle) ? { ...r, topStyle: a.topStyle } : r);
          }}
        >
          {t('Random')}
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            {cancelLabel ?? t('Cancel')}
          </Button>
        )}
        <Button type="button" loading={busy} onClick={() => onSave(a)}>
          {saveLabel ?? t('Save my look')}
        </Button>
      </div>
    </div>
  );
}

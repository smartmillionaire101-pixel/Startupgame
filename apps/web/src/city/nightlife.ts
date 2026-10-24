/**
 * Nightlife that feels of its city (player feedback: "the clubs and bars are
 * the same"). Every bar, club, lounge, beach club and live-music venue gets a
 * style, picked deterministically from its city, its kind, its name and its
 * id: an Afrobeats club with a VIP booth in Lagos, a highlife spot in Accra,
 * a palm-wine bar in Freetown, a gengetone club in Nairobi, a terrace lounge
 * in Kigali, an amapiano warehouse or a shisanyama in Johannesburg, a shisha
 * rooftop or a Nile boat in Cairo, a skyline rooftop in Dubai, a pub with a
 * dartboard in London, a speakeasy or a techno warehouse in San Francisco.
 *
 * A style is its floor plan (where people stand and what they do), its look
 * (palette, light, props), its crowd (how many, how they dress) and its
 * music (a genre with a groove for ./nightlife-audio.ts). Pure data and
 * functions: ./NightArt.tsx draws it in 2D, ../interiors3d/nightlife3d.ts in
 * 3D. Venue types are generic, never real venue names.
 */
import type { AvatarLook } from './art';
import type { ClubLook } from './clubLook';
import { hash } from './contract';
import type { Slot, Activity } from './rooms';

// ---------------------------------------------------------------------------
// Music

export type GenreId =
  | 'afrobeats'
  | 'alte'
  | 'fuji'
  | 'highlife'
  | 'azonto'
  | 'palmwine'
  | 'afropop'
  | 'gengetone'
  | 'benga'
  | 'afro-house'
  | 'afro-soul'
  | 'amapiano'
  | 'jazz'
  | 'deep-house'
  | 'mahraganat'
  | 'tarab'
  | 'arabic-house'
  | 'grime'
  | 'uk-garage'
  | 'britpop'
  | 'indie'
  | 'techno'
  | 'nu-disco';

/** A two-bar loop on a 16-step grid: 'x' hit, 'o' accent / open, '.' rest. */
export interface Groove {
  bpm: number;
  /** 0 straight … 0.33 heavy shuffle on the off 16ths. */
  swing: number;
  kick: string;
  snare: string;
  clap: string;
  hat: string;
  shaker: string;
  /** Hand drums: conga, talking drum, darbuka (pitch in Hz). */
  perc: string;
  percHz: number;
  /** Amapiano's log drum: a pitched, sliding bass hit. */
  log?: string;
  /** Bass notes per step, as scale degrees (0–9) or '.'; '-' holds. */
  bass: string;
  /** The tonic (MIDI) and the scale (semitones). */
  root: number;
  scale: number[];
  /** Chords per bar (scale degrees of the root of each). */
  chords: number[];
  chordVoice: 'pad' | 'piano' | 'stab' | 'organ' | 'none';
  /** Chord hits per step ('x') for stabs and piano; pads ignore it. */
  comp: string;
  /** The lead instrument and its notes (scale degrees, '.' rest). */
  lead: 'pluck' | 'guitar' | 'oud' | 'square' | 'saw' | 'bell' | 'piano' | 'none';
  melody: string;
}

export interface Genre {
  id: GenreId;
  /** Shown in "Now playing · …" (translated with tx). */
  label: string;
  groove: Groove;
}

const MAJ_PENT = [0, 2, 4, 7, 9];
const MIN_PENT = [0, 3, 5, 7, 10];
const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10];
const DORIAN = [0, 2, 3, 5, 7, 9, 10];
/** Maqam hijaz: the augmented second that says Cairo. */
const HIJAZ = [0, 1, 4, 5, 7, 8, 10];

const g = (o: Partial<Groove> & Pick<Groove, 'bpm' | 'root' | 'scale'>): Groove => ({
  swing: 0,
  kick: '',
  snare: '',
  clap: '',
  hat: '',
  shaker: '',
  perc: '',
  percHz: 220,
  bass: '',
  chords: [0, 0],
  chordVoice: 'none',
  comp: '',
  lead: 'none',
  melody: '',
  ...o,
});

export const GENRES: Record<GenreId, Genre> = {
  afrobeats: {
    id: 'afrobeats',
    label: 'Afrobeats',
    groove: g({
      bpm: 104,
      root: 57,
      scale: MAJ_PENT,
      kick: 'x..x..x...x..x..x..x..x...x..x..',
      clap: '....x.......x.......x.......x...',
      shaker: 'xoxxxoxxxoxxxoxxxoxxxoxxxoxxxoxx',
      perc: '..x..x.x..x..x....x..x.x..x.x.x.',
      percHz: 260,
      bass: '0.....0...3.....2.....2...4.....',
      chords: [0, 3],
      chordVoice: 'stab',
      comp: '...x.....x.x...x...x.....x.x...x',
      lead: 'pluck',
      melody: '4.3.2...0.2.....4.3.2...3.1.....',
    }),
  },
  alte: {
    id: 'alte',
    label: 'Alté',
    groove: g({
      bpm: 92,
      root: 55,
      scale: DORIAN,
      swing: 0.18,
      kick: 'x.......x.x.....x.......x.x.....',
      snare: '....x.......x.......x.......x...',
      hat: 'x.x.x.x.x.x.x.x.x.x.x.x.x.x.x.x.',
      bass: '0-------3-------5-------4-------',
      chords: [0, 3],
      chordVoice: 'piano',
      comp: 'x.....x...x.....x.....x...x.....',
      lead: 'bell',
      melody: '........4...2...........6...4...',
    }),
  },
  fuji: {
    id: 'fuji',
    label: 'Fuji & juju',
    groove: g({
      bpm: 116,
      root: 55,
      scale: MAJOR,
      kick: 'x.......x.......x.......x.......',
      shaker: 'x.xxx.xxx.xxx.xxx.xxx.xxx.xxx.xx',
      perc: 'x..x.xx.x..x.x..x..x.xx.x..xx.x.',
      percHz: 180,
      hat: '..x...x...x...x...x...x...x...x.',
      bass: '0...4...3...4...0...4...1...4...',
      chords: [0, 3],
      chordVoice: 'none',
      lead: 'guitar',
      melody: '4.2.4.5.4.2.0...3.1.3.4.3.1.6...',
    }),
  },
  highlife: {
    id: 'highlife',
    label: 'Highlife',
    groove: g({
      bpm: 122,
      root: 60,
      scale: MAJOR,
      kick: 'x.......x.......x.......x.......',
      snare: '......x.......x.......x.......x.',
      perc: 'x.x.xx.x.x.x.xx.x.x.xx.x.x.x.xx.',
      percHz: 900,
      shaker: '..x...x...x...x...x...x...x...x.',
      bass: '0...2.4.3...1.3.4...6.1.0...2.4.',
      chords: [0, 3],
      chordVoice: 'none',
      lead: 'guitar',
      melody: '4.2.0.2.4.5.4.2.3.1.6.1.3.4.3.1.',
    }),
  },
  azonto: {
    id: 'azonto',
    label: 'Azonto & hiplife',
    groove: g({
      bpm: 110,
      root: 58,
      scale: MAJ_PENT,
      kick: 'x...x..xx...x...x...x..xx...x.x.',
      clap: '....x.......x.......x.......x...',
      hat: 'x.xxx.xxx.xxx.xxx.xxx.xxx.xxx.xx',
      perc: '...x..x....x..x....x..x....x..x.',
      percHz: 320,
      bass: '0.......2.....3.0.......4.....3.',
      chords: [0, 2],
      chordVoice: 'stab',
      comp: 'x..x..x...x.....x..x..x...x.....',
      lead: 'square',
      melody: '4.4.3.2.......0.4.4.3.2.....3.2.',
    }),
  },
  palmwine: {
    id: 'palmwine',
    label: 'Palm-wine guitar',
    groove: g({
      bpm: 96,
      root: 62,
      scale: MAJOR,
      shaker: 'x.x.x.x.x.x.x.x.x.x.x.x.x.x.x.x.',
      perc: 'x.....x.....x...x.....x.....x...',
      percHz: 200,
      bass: '0.......4.......3.......4.......',
      chords: [0, 3],
      lead: 'guitar',
      melody: '0.2.4.2.0.4.2.4.3.1.3.5.4.2.4.1.',
    }),
  },
  afropop: {
    id: 'afropop',
    label: 'Afropop',
    groove: g({
      bpm: 102,
      root: 59,
      scale: MAJ_PENT,
      kick: 'x..x....x..x....x..x....x..x..x.',
      clap: '....x.......x.......x.......x...',
      shaker: 'xxxoxxxoxxxoxxxoxxxoxxxoxxxoxxxo',
      perc: '..x...x...x.x.....x...x...x.x...',
      percHz: 300,
      bass: '0.....2.......3.0.....4.......3.',
      chords: [0, 3],
      chordVoice: 'pad',
      lead: 'bell',
      melody: '2.4...3.2.0.....4.4.3...2.3.....',
    }),
  },
  gengetone: {
    id: 'gengetone',
    label: 'Gengetone',
    groove: g({
      bpm: 100,
      root: 53,
      scale: MIN_PENT,
      kick: 'x..x..x.x..x....x..x..x.x..x.x..',
      snare: '....x.......x.......x.......x.xx',
      hat: 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
      bass: '0..0..0.3..3....0..0..0.4..2....',
      chords: [0, 3],
      chordVoice: 'none',
      lead: 'square',
      melody: '0.0.3.0.4.3.....0.0.3.0.2.0.....',
    }),
  },
  benga: {
    id: 'benga',
    label: 'Benga',
    groove: g({
      bpm: 134,
      root: 62,
      scale: MAJOR,
      kick: 'x...x...x...x...x...x...x...x...',
      hat: '..x...x...x...x...x...x...x...x.',
      snare: '....x.......x.......x.......x...',
      bass: '0.2.4.2.0.2.4.2.3.5.4.2.4.2.1.2.',
      chords: [0, 4],
      lead: 'guitar',
      melody: '4565454245654542565654346565432.',
    }),
  },
  'afro-house': {
    id: 'afro-house',
    label: 'Afro-house',
    groove: g({
      bpm: 122,
      root: 57,
      scale: MINOR,
      kick: 'x...x...x...x...x...x...x...x...',
      hat: '..o...o...o...o...o...o...o...o.',
      shaker: 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
      perc: 'x..x..x...x.x...x..x..x...x..x..',
      percHz: 240,
      bass: '0.....0...0.....5.....5...4.....',
      chords: [0, 5],
      chordVoice: 'pad',
      lead: 'pluck',
      melody: '........4.2.0...........4.5.4...',
    }),
  },
  'afro-soul': {
    id: 'afro-soul',
    label: 'Afro-soul',
    groove: g({
      bpm: 88,
      root: 60,
      scale: MAJOR,
      swing: 0.12,
      kick: 'x.......x.......x.....x.x.......',
      snare: '....x.......x.......x.......x...',
      shaker: 'x.x.x.x.x.x.x.x.x.x.x.x.x.x.x.x.',
      bass: '0-------5-------3-------4-------',
      chords: [0, 3],
      chordVoice: 'piano',
      comp: 'x.......x...x...x.......x...x...',
      lead: 'guitar',
      melody: '4...2...4.5.4...3...1...0.......',
    }),
  },
  amapiano: {
    id: 'amapiano',
    label: 'Amapiano',
    groove: g({
      bpm: 113,
      root: 53,
      scale: MINOR,
      kick: 'x.......x.......x.......x.......',
      clap: '....x.......x.......x.......x...',
      shaker: 'xoxxxoxxxoxxxoxxxoxxxoxxxoxxxoxx',
      log: '...x..x...x..x.....x..x...x.x...',
      bass: '...0..4...3..0.....0..4...5.4...',
      chords: [0, 5],
      chordVoice: 'piano',
      comp: 'x.....x.....x...x.....x.....x...',
      lead: 'none',
    }),
  },
  jazz: {
    id: 'jazz',
    label: 'Jazz',
    groove: g({
      bpm: 96,
      root: 53,
      scale: DORIAN,
      swing: 0.3,
      kick: 'x...............x...............',
      hat: 'x...x.x.x...x.x.x...x.x.x...x.x.',
      snare: '..............x...............x.',
      bass: '0...2...4...5...3...4...6...1...',
      chords: [0, 3],
      chordVoice: 'piano',
      comp: '......x.....x.........x...x.....',
      lead: 'piano',
      melody: '4.5.6...4...2.......3.4.5...3.1.',
    }),
  },
  'deep-house': {
    id: 'deep-house',
    label: 'Deep house',
    groove: g({
      bpm: 120,
      root: 57,
      scale: MINOR,
      kick: 'x...x...x...x...x...x...x...x...',
      clap: '....x.......x.......x.......x...',
      hat: '..o...o...o...o...o...o...o...o.',
      bass: '0.....0...0...3.5.....5...5...4.',
      chords: [0, 5],
      chordVoice: 'organ',
      comp: '...x..x....x..x....x..x....x..x.',
      lead: 'none',
    }),
  },
  mahraganat: {
    id: 'mahraganat',
    label: 'Mahraganat',
    groove: g({
      bpm: 128,
      root: 57,
      scale: HIJAZ,
      kick: 'x..x..x.x...x...x..x..x.x...x.x.',
      snare: '....x.......x.......x.......x...',
      perc: 'x..x..x.xx.x.x..x..x..x.xx.xx.x.',
      percHz: 420,
      hat: 'x.x.x.x.x.x.x.x.x.x.x.x.x.x.x.x.',
      bass: '0..0..0.1..1....0..0..0.2..1....',
      chords: [0, 1],
      lead: 'saw',
      melody: '2.1.2.3.2.1.0...4.3.2.3.2.1.1.0.',
    }),
  },
  tarab: {
    id: 'tarab',
    label: 'Oud & tarab',
    groove: g({
      bpm: 86,
      root: 57,
      scale: HIJAZ,
      perc: 'x..x..x.x..x..x.x..x..x.x..x..x.',
      percHz: 160,
      shaker: '..x...x...x...x...x...x...x...x.',
      bass: '0.......0.......1.......0.......',
      chords: [0, 0],
      lead: 'oud',
      melody: '0.1.2...3.2.1.0.4.3.2.1.2...1.0.',
    }),
  },
  'arabic-house': {
    id: 'arabic-house',
    label: 'Arabic house',
    groove: g({
      bpm: 122,
      root: 55,
      scale: HIJAZ,
      kick: 'x...x...x...x...x...x...x...x...',
      hat: '..o...o...o...o...o...o...o...o.',
      perc: 'x..x..x...x.x...x..x..x...x.xx..',
      percHz: 380,
      bass: '0.....0...0.....1.....1...0.....',
      chords: [0, 1],
      chordVoice: 'pad',
      lead: 'oud',
      melody: '4.3.4.....3.2.1.0.1.2.....1.0...',
    }),
  },
  grime: {
    id: 'grime',
    label: 'Grime',
    groove: g({
      bpm: 140,
      root: 50,
      scale: MINOR,
      kick: 'x.........x.....x.........x..x..',
      snare: '........x...............x.......',
      hat: 'x.x.x.x.x.x.x.xxx.x.x.x.x.x.x.xx',
      bass: '0-----0.....5---0-----0.....4---',
      chords: [0, 5],
      lead: 'square',
      melody: '0...0.2.0...4.3.0...0.2.0...2.1.',
    }),
  },
  'uk-garage': {
    id: 'uk-garage',
    label: 'UK garage & house',
    groove: g({
      bpm: 132,
      root: 55,
      scale: MINOR,
      swing: 0.22,
      kick: 'x.........x.....x.........x..x..',
      snare: '....x.......x.......x.......x...',
      hat: '..x...x...x...x...x...x...x...x.',
      shaker: 'x.xxx.xxx.xxx.xxx.xxx.xxx.xxx.xx',
      bass: '0...0.....3.5...0...0.....5.4...',
      chords: [0, 5],
      chordVoice: 'organ',
      comp: '...x..x.....x.x....x..x.....x.x.',
      lead: 'none',
    }),
  },
  britpop: {
    id: 'britpop',
    label: 'Britpop & pub classics',
    groove: g({
      bpm: 118,
      root: 52,
      scale: MAJOR,
      kick: 'x.......x.x.....x.......x.x.....',
      snare: '....x.......x.......x.......x...',
      hat: 'x.x.x.x.x.x.x.x.x.x.x.x.x.x.x.x.',
      bass: '0.0.0.0.0.0.0.0.3.3.3.3.4.4.4.4.',
      chords: [0, 3],
      chordVoice: 'stab',
      comp: 'x.x.x.x.x.x.x.x.x.x.x.x.x.x.x.x.',
      lead: 'saw',
      melody: '4...4.5.4.2.....3...3.4.3.1.....',
    }),
  },
  indie: {
    id: 'indie',
    label: 'Indie rock',
    groove: g({
      bpm: 126,
      root: 57,
      scale: MAJOR,
      kick: 'x.....x.x.......x.....x.x.......',
      snare: '....x.......x.......x.......x...',
      hat: 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
      bass: '0.0.0.0.5.5.5.5.3.3.3.3.4.4.4.4.',
      chords: [0, 5],
      chordVoice: 'stab',
      comp: 'x..x..x.x..x..x.x..x..x.x..x..x.',
      lead: 'guitar',
      melody: '........4.2.4.5.........3.1.2.0.',
    }),
  },
  techno: {
    id: 'techno',
    label: 'Techno',
    groove: g({
      bpm: 128,
      root: 45,
      scale: MINOR,
      kick: 'x...x...x...x...x...x...x...x...',
      clap: '....x.......x.......x.......x...',
      hat: 'xxoxxxoxxxoxxxoxxxoxxxoxxxoxxxox',
      bass: '.00.0.00.00.0.20.00.0.00.00.3.20',
      chords: [0, 0],
      lead: 'saw',
      melody: '0.......0.....3.0.......0...4.2.',
    }),
  },
  'nu-disco': {
    id: 'nu-disco',
    label: 'Nu-disco',
    groove: g({
      bpm: 118,
      root: 57,
      scale: DORIAN,
      kick: 'x...x...x...x...x...x...x...x...',
      clap: '....x.......x.......x.......x...',
      hat: '..o...o...o...o...o...o...o...o.',
      shaker: 'x.x.x.x.x.x.x.x.x.x.x.x.x.x.x.x.',
      bass: '0.7.0.7.0.7.0.7.2.9.2.9.4.8.4.8.',
      chords: [0, 3],
      chordVoice: 'stab',
      comp: '..x...x...x...x...x...x...x...x.',
      lead: 'bell',
      melody: '4...4.5.6...4.......3.4.5...3...',
    }),
  },
};

// ---------------------------------------------------------------------------
// Styles

/** The floor plan: where the bar, the floor, the seats and the stage are. */
export type Layout =
  | 'dancefloor'
  | 'warehouse'
  | 'pub'
  | 'speakeasy'
  | 'rooftop'
  | 'shisha'
  | 'beach'
  | 'yard'
  | 'boat'
  | 'band';

type Light = 'neon' | 'disco' | 'strobe' | 'warm' | 'dim' | 'lantern' | 'sunset';

/** What's outside an open-air venue. */
export type Backdrop =
  | 'skyline'
  | 'towers'
  | 'spire'
  | 'bridge'
  | 'wheel'
  | 'hills'
  | 'river'
  | 'sea'
  | 'lagoon'
  | 'wall';

type Prop =
  | 'vip'
  | 'mirrorball'
  | 'lasers'
  | 'neon-sign'
  | 'speakers'
  | 'darts'
  | 'pool'
  | 'tv'
  | 'taps'
  | 'hookah'
  | 'cushions'
  | 'lanterns'
  | 'braai'
  | 'crates'
  | 'fairy-lights'
  | 'palms'
  | 'bonfire'
  | 'piano'
  | 'oud'
  | 'drums'
  | 'candles'
  | 'art'
  | 'graffiti'
  | 'arches'
  | 'fermenters'
  | 'calabash'
  | 'gold'
  | 'plants'
  | 'chalkboard';

type Dress = 'glam' | 'aso-ebi' | 'smart' | 'casual' | 'beach' | 'street' | 'tech' | 'kaftan';

export interface NightStyle {
  id: string;
  /** What kind of place it is, under the title: "Afrobeats club" (translated with tx). */
  label: string;
  genre: GenreId;
  layout: Layout;
  /** Walls (indoor) or the sky's floor colour (outdoor). */
  wall: string;
  /** The 2D floor. */
  floor: string;
  /** The 3D floor's texture and tint. */
  floor3d:
    | 'parquet'
    | 'parquet-dark'
    | 'tile'
    | 'marble'
    | 'carpet'
    | 'concrete'
    | 'checker'
    | 'dance'
    | 'sand'
    | 'stone'
    | 'oak';
  floorTint?: string;
  /** Counters, sofas, cloths. */
  accent: string;
  /** Three light colours (neon, beams, bulbs). */
  glow: [string, string, string];
  light: Light;
  backdrop?: Backdrop;
  props: Prop[];
  /** How full it gets, 0.6 (intimate) … 1.5 (packed). */
  crowd: number;
  dress: Dress;
  /** A word in neon on the wall (not a venue name): "AFROBEATS", "LIVE". */
  neon?: string;
  /** Tray labels by the engine item id (translated with tx). The command is the same. */
  relabel?: Record<string, string>;
  /** A club's own look over its city's style (./clubLook.ts), when it has one. */
  club?: ClubLook;
}

const S = (o: NightStyle): NightStyle => o;

/** Every style. Ids are stable (tests and data attributes use them). */
export const STYLES: Record<string, NightStyle> = Object.fromEntries(
  [
    // ---- Lagos
    S({
      id: 'lagos-afrobeats-club',
      label: 'Afrobeats club',
      genre: 'afrobeats',
      layout: 'dancefloor',
      wall: '#1a0b2e',
      floor: '#0f0a1e',
      floor3d: 'dance',
      accent: '#b45309',
      glow: ['#a855f7', '#f59e0b', '#22d3ee'],
      light: 'neon',
      props: ['vip', 'neon-sign', 'speakers', 'gold', 'lasers'],
      crowd: 1.4,
      dress: 'glam',
      neon: 'AFROBEATS',
      relabel: {
        dance: 'Hit the dance floor',
        vip: 'Book a VIP booth',
        bottle: 'Bottle service with sparklers',
        entry: 'Get in past the bouncer',
      },
    }),
    S({
      id: 'lagos-owambe-lounge',
      label: 'Owambe lounge',
      genre: 'fuji',
      layout: 'band',
      wall: '#3b1d0a',
      floor: '#5a3a1a',
      floor3d: 'marble',
      floorTint: '#e7d3a8',
      accent: '#d4a017',
      glow: ['#fbbf24', '#f472b6', '#facc15'],
      light: 'warm',
      props: ['gold', 'drums', 'speakers', 'fairy-lights'],
      crowd: 1.3,
      dress: 'aso-ebi',
      neon: 'OWAMBE',
      relabel: {
        drink: 'Chapman and small chops',
        round: 'Spray money on the band',
        food: 'Jollof and small chops',
      },
    }),
    S({
      id: 'lagos-rooftop',
      label: 'Lagoon rooftop lounge',
      genre: 'alte',
      layout: 'rooftop',
      backdrop: 'lagoon',
      wall: '#0b1a33',
      floor: '#3f3a36',
      floor3d: 'oak',
      accent: '#0f766e',
      glow: ['#f59e0b', '#5eead4', '#f472b6'],
      light: 'sunset',
      props: ['fairy-lights', 'plants', 'speakers'],
      crowd: 1,
      dress: 'glam',
      relabel: { cocktail: 'Cocktail by the lagoon' },
    }),
    S({
      id: 'lagos-smoke-lounge',
      label: 'Shisha lounge',
      genre: 'afrobeats',
      layout: 'shisha',
      wall: '#2a0f1f',
      floor: '#3b1d2e',
      floor3d: 'carpet',
      floorTint: '#4a1d3a',
      accent: '#be185d',
      glow: ['#f472b6', '#a855f7', '#fbbf24'],
      light: 'neon',
      props: ['hookah', 'cushions', 'neon-sign', 'speakers'],
      crowd: 1,
      dress: 'glam',
      neon: 'VIBES',
      relabel: { shisha: 'Order shisha', 'live-dj': 'Afrobeats DJ night' },
    }),
    S({
      id: 'lagos-beach',
      label: 'Afrobeats beach party',
      genre: 'afrobeats',
      layout: 'beach',
      backdrop: 'sea',
      wall: '#0b1a33',
      floor: '#e8c98f',
      floor3d: 'sand',
      accent: '#ea580c',
      glow: ['#f97316', '#22d3ee', '#facc15'],
      light: 'sunset',
      props: ['palms', 'bonfire', 'speakers'],
      crowd: 1.2,
      dress: 'beach',
    }),
    // ---- Accra
    S({
      id: 'accra-highlife-spot',
      label: 'Highlife spot',
      genre: 'highlife',
      layout: 'yard',
      backdrop: 'wall',
      wall: '#14532d',
      floor: '#9a6b3f',
      floor3d: 'stone',
      floorTint: '#b08a5a',
      accent: '#ca8a04',
      glow: ['#facc15', '#dc2626', '#16a34a'],
      light: 'warm',
      props: ['fairy-lights', 'crates', 'speakers', 'plants'],
      crowd: 1,
      dress: 'casual',
      relabel: { drink: 'A cold beer at the spot', food: 'Kelewele and grilled tilapia' },
    }),
    S({
      id: 'accra-azonto-club',
      label: 'Azonto club',
      genre: 'azonto',
      layout: 'dancefloor',
      wall: '#0c1f14',
      floor: '#0a140e',
      floor3d: 'dance',
      accent: '#ca8a04',
      glow: ['#facc15', '#ef4444', '#22c55e'],
      light: 'disco',
      props: ['vip', 'mirrorball', 'speakers', 'neon-sign'],
      crowd: 1.3,
      dress: 'street',
      neon: 'AZONTO',
      relabel: { dance: 'Azonto on the dance floor', vip: 'Book a VIP table' },
    }),
    S({
      id: 'accra-sky-lounge',
      label: 'Sky lounge',
      genre: 'afro-soul',
      layout: 'rooftop',
      backdrop: 'towers',
      wall: '#13213d',
      floor: '#44403c',
      floor3d: 'tile',
      floorTint: '#d6d3d1',
      accent: '#a16207',
      glow: ['#fbbf24', '#38bdf8', '#f472b6'],
      light: 'sunset',
      props: ['fairy-lights', 'plants'],
      crowd: 0.9,
      dress: 'smart',
    }),
    S({
      id: 'accra-highlife-live',
      label: 'Live highlife band',
      genre: 'highlife',
      layout: 'band',
      wall: '#3f2a14',
      floor: '#6b4423',
      floor3d: 'parquet',
      accent: '#15803d',
      glow: ['#facc15', '#dc2626', '#22c55e'],
      light: 'warm',
      props: ['drums', 'speakers', 'fairy-lights'],
      crowd: 1.1,
      dress: 'casual',
    }),
    S({
      id: 'accra-labadi-beach',
      label: 'Beach bar at Labadi',
      genre: 'azonto',
      layout: 'beach',
      backdrop: 'sea',
      wall: '#0b1a33',
      floor: '#e9cf9a',
      floor3d: 'sand',
      accent: '#16a34a',
      glow: ['#facc15', '#ef4444', '#22c55e'],
      light: 'sunset',
      props: ['palms', 'bonfire', 'drums', 'speakers'],
      crowd: 1.2,
      dress: 'beach',
      relabel: { sunset: 'Drums and dancing on the sand' },
    }),
    // ---- Freetown
    S({
      id: 'freetown-palmwine',
      label: 'Palm-wine bar',
      genre: 'palmwine',
      layout: 'yard',
      backdrop: 'sea',
      wall: '#3f2a14',
      floor: '#c9a46a',
      floor3d: 'sand',
      accent: '#92400e',
      glow: ['#fbbf24', '#fb923c', '#fde68a'],
      light: 'lantern',
      props: ['palms', 'calabash', 'lanterns', 'crates'],
      crowd: 0.8,
      dress: 'casual',
      relabel: { drink: 'A calabash of palm wine', round: 'Palm wine for the table' },
    }),
    S({
      id: 'freetown-club',
      label: 'Afropop club',
      genre: 'afropop',
      layout: 'dancefloor',
      wall: '#0a1f2e',
      floor: '#081621',
      floor3d: 'dance',
      accent: '#0369a1',
      glow: ['#22c55e', '#38bdf8', '#f8fafc'],
      light: 'neon',
      props: ['vip', 'speakers', 'neon-sign', 'lasers'],
      crowd: 1.2,
      dress: 'street',
      neon: 'SALONE',
      relabel: { dance: 'Hit the dance floor' },
    }),
    S({
      id: 'freetown-sunset-deck',
      label: 'Sunset deck',
      genre: 'afropop',
      layout: 'rooftop',
      backdrop: 'sea',
      wall: '#1e3a5f',
      floor: '#7c5a3a',
      floor3d: 'oak',
      accent: '#0e7490',
      glow: ['#fb923c', '#facc15', '#38bdf8'],
      light: 'sunset',
      props: ['fairy-lights', 'palms'],
      crowd: 0.9,
      dress: 'beach',
    }),
    S({
      id: 'freetown-live-yard',
      label: 'Gumbe and palm-wine yard',
      genre: 'palmwine',
      layout: 'band',
      wall: '#2f3a1a',
      floor: '#7a5a34',
      floor3d: 'stone',
      floorTint: '#a3825a',
      accent: '#65a30d',
      glow: ['#fde68a', '#fb923c', '#a3e635'],
      light: 'lantern',
      props: ['drums', 'lanterns', 'calabash'],
      crowd: 1,
      dress: 'casual',
    }),
    S({
      id: 'freetown-shisha',
      label: 'Shisha lounge',
      genre: 'afropop',
      layout: 'shisha',
      wall: '#1f2a1a',
      floor: '#3a2f1f',
      floor3d: 'carpet',
      floorTint: '#5b3a1a',
      accent: '#15803d',
      glow: ['#a3e635', '#fbbf24', '#38bdf8'],
      light: 'lantern',
      props: ['hookah', 'cushions', 'lanterns'],
      crowd: 0.9,
      dress: 'smart',
      relabel: { shisha: 'Order shisha' },
    }),
    S({
      id: 'freetown-beach',
      label: 'Beach club',
      genre: 'afropop',
      layout: 'beach',
      backdrop: 'sea',
      wall: '#0b1a33',
      floor: '#efd9a8',
      floor3d: 'sand',
      accent: '#0ea5e9',
      glow: ['#38bdf8', '#facc15', '#22c55e'],
      light: 'sunset',
      props: ['palms', 'bonfire', 'calabash'],
      crowd: 1,
      dress: 'beach',
    }),
    // ---- Nairobi
    S({
      id: 'nairobi-gengetone-club',
      label: 'Gengetone club',
      genre: 'gengetone',
      layout: 'dancefloor',
      wall: '#111827',
      floor: '#0b1220',
      floor3d: 'concrete',
      floorTint: '#4b5563',
      accent: '#dc2626',
      glow: ['#ef4444', '#22c55e', '#facc15'],
      light: 'neon',
      props: ['graffiti', 'speakers', 'lasers', 'vip'],
      crowd: 1.4,
      dress: 'street',
      neon: 'GENGE',
      relabel: { dance: 'Hit the dance floor', vip: 'Grab a VIP booth' },
    }),
    S({
      id: 'nairobi-rooftop',
      label: 'Rooftop lounge',
      genre: 'afro-house',
      layout: 'rooftop',
      backdrop: 'skyline',
      wall: '#0f1d3a',
      floor: '#57534e',
      floor3d: 'tile',
      floorTint: '#a8a29e',
      accent: '#166534',
      glow: ['#facc15', '#22c55e', '#f97316'],
      light: 'sunset',
      props: ['fairy-lights', 'plants', 'speakers'],
      crowd: 1,
      dress: 'smart',
      relabel: { drink: 'Dawa cocktail on the roof', cocktail: 'Dawa cocktail on the roof' },
    }),
    S({
      id: 'nairobi-benga-hall',
      label: 'Benga hall',
      genre: 'benga',
      layout: 'band',
      wall: '#1e3a8a',
      floor: '#7c4a1e',
      floor3d: 'parquet',
      accent: '#dc2626',
      glow: ['#ef4444', '#facc15', '#22c55e'],
      light: 'warm',
      props: ['drums', 'speakers'],
      crowd: 1.2,
      dress: 'casual',
    }),
    S({
      id: 'nairobi-hookah',
      label: 'Hookah lounge',
      genre: 'afropop',
      layout: 'shisha',
      wall: '#1c1917',
      floor: '#3f2a1c',
      floor3d: 'carpet',
      floorTint: '#7c2d12',
      accent: '#b45309',
      glow: ['#f59e0b', '#ef4444', '#a3e635'],
      light: 'lantern',
      props: ['hookah', 'cushions', 'lanterns', 'tv'],
      crowd: 1,
      dress: 'smart',
      relabel: { shisha: 'Order a hookah' },
    }),
    S({
      id: 'nairobi-warehouse',
      label: 'Gengetone warehouse party',
      genre: 'gengetone',
      layout: 'warehouse',
      wall: '#27272a',
      floor: '#18181b',
      floor3d: 'concrete',
      accent: '#facc15',
      glow: ['#facc15', '#ef4444', '#22c55e'],
      light: 'strobe',
      props: ['graffiti', 'speakers', 'lasers'],
      crowd: 1.5,
      dress: 'street',
    }),
    // ---- Kigali
    S({
      id: 'kigali-terrace',
      label: 'Terrace lounge on the hills',
      genre: 'afro-soul',
      layout: 'rooftop',
      backdrop: 'hills',
      wall: '#16324f',
      floor: '#6b5b45',
      floor3d: 'oak',
      accent: '#15803d',
      glow: ['#fde68a', '#86efac', '#fdba74'],
      light: 'sunset',
      props: ['fairy-lights', 'plants', 'candles'],
      crowd: 0.7,
      dress: 'smart',
      relabel: { drink: 'A glass on the terrace', cocktail: 'A glass on the terrace' },
    }),
    S({
      id: 'kigali-afro-house',
      label: 'Afro-house club',
      genre: 'afro-house',
      layout: 'warehouse',
      wall: '#1c2541',
      floor: '#0f172a',
      floor3d: 'concrete',
      floorTint: '#334155',
      accent: '#0891b2',
      glow: ['#22d3ee', '#a3e635', '#facc15'],
      light: 'neon',
      props: ['speakers', 'lasers', 'plants'],
      crowd: 1.1,
      dress: 'smart',
    }),
    S({
      id: 'kigali-live',
      label: 'Afro-fusion live lounge',
      genre: 'afro-soul',
      layout: 'band',
      wall: '#2b2d42',
      floor: '#5c4033',
      floor3d: 'parquet',
      accent: '#0d9488',
      glow: ['#fde68a', '#5eead4', '#fda4af'],
      light: 'warm',
      props: ['drums', 'plants', 'candles'],
      crowd: 0.9,
      dress: 'smart',
    }),
    // ---- Johannesburg
    S({
      id: 'joburg-amapiano',
      label: 'Amapiano club',
      genre: 'amapiano',
      layout: 'warehouse',
      wall: '#1f1b2e',
      floor: '#121018',
      floor3d: 'concrete',
      floorTint: '#3f3f46',
      accent: '#7c3aed',
      glow: ['#a855f7', '#f97316', '#38bdf8'],
      light: 'neon',
      props: ['speakers', 'lasers', 'graffiti', 'neon-sign'],
      crowd: 1.5,
      dress: 'street',
      neon: 'AMAPIANO',
      relabel: { dance: 'Dance to the log drum', entry: 'Get in for the amapiano set' },
    }),
    S({
      id: 'joburg-shisanyama',
      label: 'Shisanyama',
      genre: 'amapiano',
      layout: 'yard',
      backdrop: 'wall',
      wall: '#7c2d12',
      floor: '#8a6a4a',
      floor3d: 'concrete',
      floorTint: '#a8a29e',
      accent: '#b91c1c',
      glow: ['#fb923c', '#facc15', '#f87171'],
      light: 'warm',
      props: ['braai', 'crates', 'speakers', 'fairy-lights'],
      crowd: 1.2,
      dress: 'casual',
      relabel: {
        food: 'Braai meat and pap',
        drink: 'A cold one by the braai',
        round: 'Buy the table a round',
      },
    }),
    S({
      id: 'joburg-jazz',
      label: 'Jazz bar in Maboneng',
      genre: 'jazz',
      layout: 'speakeasy',
      wall: '#3a1f1a',
      floor: '#2a1a12',
      floor3d: 'parquet-dark',
      accent: '#991b1b',
      glow: ['#fbbf24', '#f87171', '#fde68a'],
      light: 'dim',
      props: ['piano', 'art', 'candles'],
      crowd: 0.8,
      dress: 'smart',
      relabel: {
        drink: 'A whisky with the jazz',
        'live-dj': 'Live jazz set',
        cocktail: 'Order a craft cocktail',
      },
    }),
    S({
      id: 'joburg-jazz-shebeen',
      label: 'Jazz shebeen',
      genre: 'jazz',
      layout: 'band',
      wall: '#3b2f2f',
      floor: '#5b4636',
      floor3d: 'parquet',
      accent: '#a16207',
      glow: ['#fbbf24', '#fde68a', '#fb923c'],
      light: 'dim',
      props: ['piano', 'crates', 'candles'],
      crowd: 1,
      dress: 'smart',
    }),
    S({
      id: 'joburg-rooftop',
      label: 'Deep-house rooftop',
      genre: 'deep-house',
      layout: 'rooftop',
      backdrop: 'skyline',
      wall: '#1a1033',
      floor: '#44403c',
      floor3d: 'concrete',
      floorTint: '#78716c',
      accent: '#6d28d9',
      glow: ['#c084fc', '#fb923c', '#38bdf8'],
      light: 'sunset',
      props: ['fairy-lights', 'speakers', 'plants'],
      crowd: 1.1,
      dress: 'glam',
    }),
    // ---- Cairo
    S({
      id: 'cairo-shisha-rooftop',
      label: 'Shisha rooftop',
      genre: 'tarab',
      layout: 'rooftop',
      backdrop: 'river',
      wall: '#1f1a3a',
      floor: '#8a6d4a',
      floor3d: 'stone',
      floorTint: '#c8b08a',
      accent: '#b45309',
      glow: ['#fbbf24', '#f97316', '#fde68a'],
      light: 'lantern',
      props: ['hookah', 'lanterns', 'cushions', 'oud'],
      crowd: 1,
      dress: 'kaftan',
      relabel: {
        cocktail: 'Mint tea and shisha',
        drink: 'Mint tea and shisha',
        sundowner: 'Shisha at sunset over the Nile',
      },
    }),
    S({
      id: 'cairo-shisha-cafe',
      label: 'Shisha café',
      genre: 'tarab',
      layout: 'shisha',
      wall: '#5b3a1a',
      floor: '#8a6a3a',
      floor3d: 'checker',
      floorTint: '#e7dcc6',
      accent: '#0f766e',
      glow: ['#fbbf24', '#2dd4bf', '#f97316'],
      light: 'lantern',
      props: ['hookah', 'lanterns', 'oud', 'tv'],
      crowd: 1.1,
      dress: 'kaftan',
      relabel: { shisha: 'Shisha and mint tea', cocktail: 'Karkadeh and coffee' },
    }),
    S({
      id: 'cairo-mahraganat',
      label: 'Mahraganat club',
      genre: 'mahraganat',
      layout: 'dancefloor',
      wall: '#2a0a12',
      floor: '#14060a',
      floor3d: 'dance',
      accent: '#d97706',
      glow: ['#f43f5e', '#facc15', '#22d3ee'],
      light: 'disco',
      props: ['mirrorball', 'speakers', 'vip', 'lasers'],
      crowd: 1.4,
      dress: 'street',
      neon: 'SHAABI',
      relabel: { dance: 'Dance to mahraganat' },
    }),
    S({
      id: 'cairo-nile-boat',
      label: 'Nile boat club',
      genre: 'mahraganat',
      layout: 'boat',
      backdrop: 'river',
      wall: '#0c1a33',
      floor: '#7c5a3a',
      floor3d: 'oak',
      accent: '#1d4ed8',
      glow: ['#facc15', '#f472b6', '#38bdf8'],
      light: 'neon',
      props: ['lanterns', 'speakers', 'fairy-lights'],
      crowd: 1.2,
      dress: 'glam',
      relabel: { dance: 'Dance on the deck', entry: 'Board the boat' },
    }),
    S({
      id: 'cairo-oud-house',
      label: 'Oud house',
      genre: 'tarab',
      layout: 'band',
      wall: '#4a2c17',
      floor: '#6b4a2a',
      floor3d: 'carpet',
      floorTint: '#7f1d1d',
      accent: '#0f766e',
      glow: ['#fbbf24', '#2dd4bf', '#fde68a'],
      light: 'lantern',
      props: ['oud', 'lanterns', 'cushions'],
      crowd: 0.9,
      dress: 'kaftan',
    }),
    // ---- Dubai
    S({
      id: 'dubai-rooftop',
      label: 'Skyline rooftop lounge',
      genre: 'arabic-house',
      layout: 'rooftop',
      backdrop: 'spire',
      wall: '#0b1026',
      floor: '#d6d3d1',
      floor3d: 'marble',
      accent: '#a16207',
      glow: ['#fbbf24', '#e879f9', '#38bdf8'],
      light: 'sunset',
      props: ['gold', 'fairy-lights', 'plants', 'speakers'],
      crowd: 1.1,
      dress: 'glam',
      relabel: {
        drink: 'Mocktail with a skyline view',
        cocktail: 'Mocktail with a skyline view',
        bottle: 'Champagne table by the glass',
      },
    }),
    S({
      id: 'dubai-club',
      label: 'Glitzy superclub',
      genre: 'arabic-house',
      layout: 'dancefloor',
      wall: '#111111',
      floor: '#0a0a0a',
      floor3d: 'marble',
      floorTint: '#1f1f1f',
      accent: '#ca8a04',
      glow: ['#fbbf24', '#e879f9', '#f8fafc'],
      light: 'disco',
      props: ['vip', 'gold', 'mirrorball', 'lasers', 'neon-sign'],
      crowd: 1.3,
      dress: 'glam',
      neon: 'GOLD',
      relabel: {
        vip: 'Book a gold VIP table',
        bottle: 'Bottle parade with sparklers',
        dance: 'Hit the dance floor',
      },
    }),
    S({
      id: 'dubai-majlis',
      label: 'Majlis shisha lounge',
      genre: 'arabic-house',
      layout: 'shisha',
      wall: '#3a2a1a',
      floor: '#c8b08a',
      floor3d: 'marble',
      floorTint: '#e8dcc4',
      accent: '#a16207',
      glow: ['#fbbf24', '#fde68a', '#e879f9'],
      light: 'lantern',
      props: ['hookah', 'cushions', 'lanterns', 'gold'],
      crowd: 0.9,
      dress: 'kaftan',
      relabel: { shisha: 'Order shisha in the majlis' },
    }),
    S({
      id: 'dubai-jazz-garden',
      label: 'Jazz garden',
      genre: 'jazz',
      layout: 'band',
      wall: '#14281d',
      floor: '#3f4a3c',
      floor3d: 'stone',
      floorTint: '#d6d3d1',
      accent: '#a16207',
      glow: ['#fde68a', '#fbbf24', '#86efac'],
      light: 'warm',
      props: ['piano', 'palms', 'fairy-lights', 'candles'],
      crowd: 0.9,
      dress: 'smart',
    }),
    S({
      id: 'dubai-beach',
      label: 'Beach club',
      genre: 'deep-house',
      layout: 'beach',
      backdrop: 'spire',
      wall: '#0b1026',
      floor: '#f1e2bf',
      floor3d: 'sand',
      accent: '#0e7490',
      glow: ['#fbbf24', '#38bdf8', '#f8fafc'],
      light: 'sunset',
      props: ['palms', 'gold', 'speakers'],
      crowd: 1,
      dress: 'beach',
    }),
    // ---- London
    S({
      id: 'london-pub',
      label: 'Pub with darts',
      genre: 'britpop',
      layout: 'pub',
      wall: '#3f1d14',
      floor: '#4a2e1d',
      floor3d: 'parquet-dark',
      accent: '#14532d',
      glow: ['#fbbf24', '#fde68a', '#f59e0b'],
      light: 'warm',
      props: ['darts', 'pool', 'taps', 'tv', 'chalkboard'],
      crowd: 1,
      dress: 'casual',
      relabel: {
        drink: 'Order a pint',
        round: 'Get a round in',
        food: 'Fish and chips',
        quiz: 'Pub quiz',
      },
    }),
    S({
      id: 'london-jazz',
      label: 'Jazz bar',
      genre: 'jazz',
      layout: 'speakeasy',
      wall: '#1c1917',
      floor: '#292524',
      floor3d: 'parquet-dark',
      accent: '#7f1d1d',
      glow: ['#fbbf24', '#f87171', '#fde68a'],
      light: 'dim',
      props: ['piano', 'candles', 'art'],
      crowd: 0.8,
      dress: 'smart',
      relabel: {
        drink: 'A negroni with the trio',
        cocktail: 'A negroni with the trio',
        'live-dj': 'Live jazz set',
      },
    }),
    S({
      id: 'london-grime',
      label: 'Grime club under the arches',
      genre: 'grime',
      layout: 'warehouse',
      wall: '#4a1d14',
      floor: '#1a1210',
      floor3d: 'concrete',
      floorTint: '#3f3f46',
      accent: '#dc2626',
      glow: ['#ef4444', '#f8fafc', '#38bdf8'],
      light: 'strobe',
      props: ['arches', 'speakers', 'lasers'],
      crowd: 1.4,
      dress: 'street',
      neon: 'GRIME',
      relabel: { dance: 'Skank to the MC' },
    }),
    S({
      id: 'london-house',
      label: 'House club',
      genre: 'uk-garage',
      layout: 'dancefloor',
      wall: '#0f172a',
      floor: '#020617',
      floor3d: 'dance',
      accent: '#2563eb',
      glow: ['#38bdf8', '#e879f9', '#a3e635'],
      light: 'disco',
      props: ['arches', 'mirrorball', 'speakers'],
      crowd: 1.3,
      dress: 'street',
    }),
    S({
      id: 'london-rooftop',
      label: 'Rooftop terrace',
      genre: 'uk-garage',
      layout: 'rooftop',
      backdrop: 'wheel',
      wall: '#1e293b',
      floor: '#57534e',
      floor3d: 'oak',
      accent: '#0f766e',
      glow: ['#fde68a', '#38bdf8', '#f472b6'],
      light: 'sunset',
      props: ['fairy-lights', 'plants'],
      crowd: 1,
      dress: 'smart',
      relabel: { cocktail: 'Spritz with a view' },
    }),
    S({
      id: 'london-indie',
      label: 'Indie gig room',
      genre: 'indie',
      layout: 'band',
      wall: '#18181b',
      floor: '#292524',
      floor3d: 'parquet-dark',
      accent: '#b91c1c',
      glow: ['#f43f5e', '#facc15', '#38bdf8'],
      light: 'neon',
      props: ['drums', 'speakers', 'graffiti'],
      crowd: 1.2,
      dress: 'casual',
    }),
    // ---- San Francisco
    S({
      id: 'sf-speakeasy',
      label: 'Speakeasy cocktail bar',
      genre: 'jazz',
      layout: 'speakeasy',
      wall: '#14281d',
      floor: '#1c1917',
      floor3d: 'checker',
      floorTint: '#1c1917',
      accent: '#7c2d12',
      glow: ['#fbbf24', '#fde68a', '#34d399'],
      light: 'dim',
      props: ['candles', 'piano', 'art'],
      crowd: 0.7,
      dress: 'smart',
      relabel: {
        drink: 'Order a craft cocktail',
        round: 'Cocktails for the booth',
        'live-dj': 'Live jazz set',
        cocktail: 'Order a craft cocktail',
      },
    }),
    S({
      id: 'sf-brewery',
      label: 'Tech-crowd brewery',
      genre: 'indie',
      layout: 'pub',
      wall: '#57534e',
      floor: '#78716c',
      floor3d: 'concrete',
      accent: '#ca8a04',
      glow: ['#fde68a', '#fbbf24', '#e5e7eb'],
      light: 'warm',
      props: ['fermenters', 'taps', 'chalkboard', 'pool', 'fairy-lights'],
      crowd: 1,
      dress: 'tech',
      relabel: {
        drink: 'Taste the IPAs on tap',
        round: 'A flight of craft beers',
        food: 'Tacos from the food truck',
        quiz: 'Startup trivia night',
      },
    }),
    S({
      id: 'sf-techno',
      label: 'Techno warehouse',
      genre: 'techno',
      layout: 'warehouse',
      wall: '#0a0a0a',
      floor: '#0a0a0a',
      floor3d: 'concrete',
      floorTint: '#27272a',
      accent: '#dc2626',
      glow: ['#ef4444', '#f8fafc', '#7c3aed'],
      light: 'strobe',
      props: ['speakers', 'lasers'],
      crowd: 1.4,
      dress: 'tech',
      neon: 'TECHNO',
      relabel: { dance: 'Lose yourself on the floor' },
    }),
    S({
      id: 'sf-rooftop',
      label: 'Bay view rooftop',
      genre: 'nu-disco',
      layout: 'rooftop',
      backdrop: 'bridge',
      wall: '#13213d',
      floor: '#57534e',
      floor3d: 'oak',
      accent: '#c2410c',
      glow: ['#fb923c', '#fde68a', '#38bdf8'],
      light: 'sunset',
      props: ['fairy-lights', 'plants', 'speakers'],
      crowd: 1,
      dress: 'tech',
    }),
    S({
      id: 'sf-funk',
      label: 'Funk and soul room',
      genre: 'nu-disco',
      layout: 'band',
      wall: '#3b0764',
      floor: '#2e1065',
      floor3d: 'parquet-dark',
      accent: '#c026d3',
      glow: ['#e879f9', '#facc15', '#38bdf8'],
      light: 'disco',
      props: ['drums', 'mirrorball', 'speakers'],
      crowd: 1.1,
      dress: 'tech',
    }),
  ].map((s) => [s.id, s]),
);

/** Where each city's nightlife comes from: its kinds, and names that hint at a style. */
interface CityNight {
  /** Business kind → styles to pick from (by the id's hash). */
  kinds: Record<string, string[]>;
  /** A name that says what it is ("Riverboat", "Jazz", "Shisha") picks that style. */
  hints?: [RegExp, string][];
}

const CITY: Record<string, CityNight> = {
  lagos: {
    kinds: {
      nightclub: ['lagos-afrobeats-club'],
      bar: ['lagos-owambe-lounge'],
      pub: ['lagos-owambe-lounge'],
      'lounge-bar': ['lagos-rooftop'],
      lounge: ['lagos-smoke-lounge'],
      'beach-club': ['lagos-beach'],
      'live-music': ['lagos-owambe-lounge'],
    },
    hints: [
      [/rooftop|sky|lagoon/i, 'lagos-rooftop'],
      [/smoke|shisha|hookah/i, 'lagos-smoke-lounge'],
    ],
  },
  accra: {
    kinds: {
      nightclub: ['accra-azonto-club'],
      bar: ['accra-highlife-spot'],
      pub: ['accra-highlife-spot'],
      'lounge-bar': ['accra-sky-lounge'],
      lounge: ['accra-sky-lounge'],
      'beach-club': ['accra-labadi-beach'],
      'live-music': ['accra-highlife-live'],
    },
    hints: [[/labadi|beach/i, 'accra-labadi-beach']],
  },
  freetown: {
    kinds: {
      nightclub: ['freetown-club'],
      bar: ['freetown-palmwine'],
      pub: ['freetown-palmwine'],
      'lounge-bar': ['freetown-sunset-deck'],
      lounge: ['freetown-shisha'],
      'beach-club': ['freetown-beach'],
      'live-music': ['freetown-live-yard'],
    },
    hints: [
      [/shisha|hookah/i, 'freetown-shisha'],
      [/sunset|deck/i, 'freetown-sunset-deck'],
    ],
  },
  nairobi: {
    kinds: {
      nightclub: ['nairobi-gengetone-club', 'nairobi-warehouse'],
      bar: ['nairobi-rooftop'],
      pub: ['nairobi-rooftop'],
      'lounge-bar': ['nairobi-rooftop'],
      lounge: ['nairobi-hookah'],
      'beach-club': ['lagos-beach'],
      'live-music': ['nairobi-benga-hall'],
    },
    hints: [
      [/hookah|shisha/i, 'nairobi-hookah'],
      [/benga/i, 'nairobi-benga-hall'],
      [/groove/i, 'nairobi-gengetone-club'],
    ],
  },
  kigali: {
    kinds: {
      nightclub: ['kigali-afro-house'],
      bar: ['kigali-terrace'],
      pub: ['kigali-terrace'],
      'lounge-bar': ['kigali-terrace'],
      lounge: ['kigali-terrace'],
      'beach-club': ['kigali-terrace'],
      'live-music': ['kigali-live'],
    },
  },
  johannesburg: {
    kinds: {
      nightclub: ['joburg-amapiano'],
      bar: ['joburg-shisanyama', 'joburg-jazz'],
      pub: ['joburg-shisanyama'],
      'lounge-bar': ['joburg-rooftop'],
      lounge: ['joburg-shisanyama'],
      'beach-club': ['joburg-rooftop'],
      'live-music': ['joburg-jazz-shebeen'],
    },
    hints: [
      [/shebeen/i, 'joburg-jazz-shebeen'],
      [/gallery|maboneng|jazz/i, 'joburg-jazz'],
      [/taproom|tap|braai|nyama|shisa/i, 'joburg-shisanyama'],
      [/rooftop/i, 'joburg-rooftop'],
    ],
  },
  cairo: {
    kinds: {
      nightclub: ['cairo-mahraganat'],
      bar: ['cairo-shisha-rooftop'],
      pub: ['cairo-shisha-cafe'],
      'lounge-bar': ['cairo-shisha-rooftop'],
      lounge: ['cairo-shisha-cafe'],
      'beach-club': ['cairo-nile-boat'],
      'live-music': ['cairo-oud-house'],
    },
    hints: [
      [/boat|river|nile|felucca/i, 'cairo-nile-boat'],
      [/rooftop|terrace/i, 'cairo-shisha-rooftop'],
    ],
  },
  dubai: {
    kinds: {
      nightclub: ['dubai-club'],
      bar: ['dubai-rooftop'],
      pub: ['dubai-rooftop'],
      'lounge-bar': ['dubai-rooftop'],
      lounge: ['dubai-majlis'],
      'beach-club': ['dubai-beach'],
      'live-music': ['dubai-jazz-garden'],
    },
    hints: [
      [/majlis|shisha/i, 'dubai-majlis'],
      [/rooftop|sky/i, 'dubai-rooftop'],
      [/jazz/i, 'dubai-jazz-garden'],
    ],
  },
  london: {
    kinds: {
      nightclub: ['london-grime', 'london-house'],
      bar: ['london-pub', 'london-jazz'],
      pub: ['london-pub'],
      'lounge-bar': ['london-rooftop'],
      lounge: ['london-jazz'],
      'beach-club': ['london-rooftop'],
      'live-music': ['london-indie'],
    },
    hints: [
      [/velvet/i, 'london-house'],
      [/neon/i, 'london-grime'],
      [/taproom|lamb|lantern|arms|tavern|inn/i, 'london-pub'],
      [/copper|still|amber|jazz/i, 'london-jazz'],
      [/terrace|rooftop|skyline/i, 'london-rooftop'],
    ],
  },
  'san-francisco': {
    kinds: {
      nightclub: ['sf-techno'],
      bar: ['sf-speakeasy', 'sf-brewery'],
      pub: ['sf-brewery'],
      'lounge-bar': ['sf-rooftop'],
      lounge: ['sf-speakeasy'],
      'beach-club': ['sf-rooftop'],
      'live-music': ['sf-funk'],
    },
    hints: [
      [/tap|brew|taproom/i, 'sf-brewery'],
      [/tavern|velvet|speakeasy/i, 'sf-speakeasy'],
      [/rooftop/i, 'sf-rooftop'],
    ],
  },
};

/** The business kinds with a nightlife style (karaoke keeps its own room). */
const NIGHT_KIND = /^(nightclub|bar|pub|lounge-bar|lounge|beach-club|live-music)$/;

/** A stand-in for a city we don't know: by kind. */
const FALLBACK: Record<string, string[]> = {
  nightclub: ['lagos-afrobeats-club', 'sf-techno', 'joburg-amapiano'],
  bar: ['london-pub', 'sf-speakeasy'],
  pub: ['london-pub'],
  'lounge-bar': ['nairobi-rooftop'],
  lounge: ['cairo-shisha-cafe'],
  'beach-club': ['lagos-beach'],
  'live-music': ['accra-highlife-live'],
};

/**
 * The style of a venue, or null if it isn't a nightlife place. Deterministic:
 * the same city, kind, name and id always give the same style.
 */
export function nightStyleOf(v: {
  market: string;
  id: string;
  kind: string;
  name?: string;
}): NightStyle | null {
  const kind = v.kind.toLowerCase();
  if (!NIGHT_KIND.test(kind)) return null;
  const city = CITY[v.market];
  const hint = city?.hints?.find(([re]) => re.test(v.name ?? ''));
  if (hint) {
    const s = STYLES[hint[1]];
    // A hint can't turn a pub into a beach: it must fit the kind's own room.
    if (s && fits(kind, s)) return s;
  }
  const pool = city?.kinds[kind] ?? FALLBACK[kind] ?? [];
  if (!pool.length) return null;
  return STYLES[pool[hash(`${v.market}:${v.id}`) % pool.length]!] ?? null;
}

/** Hints only pick styles that suit the kind (a club stays a place to dance). */
function fits(kind: string, s: NightStyle): boolean {
  if (kind === 'nightclub') return ['dancefloor', 'warehouse', 'boat'].includes(s.layout);
  if (kind === 'live-music') return s.layout === 'band' || s.layout === 'speakeasy';
  if (kind === 'beach-club') return ['beach', 'boat', 'rooftop'].includes(s.layout);
  return !['dancefloor', 'warehouse', 'boat'].includes(s.layout);
}

export const genreOf = (s: NightStyle): Genre => GENRES[s.genre];

// ---------------------------------------------------------------------------
// Floor plans: where people go (the same 360 × 240 room as ./rooms.ts).

const P = (
  x: number,
  y: number,
  act: Activity,
  who: Slot['who'] = 'guest',
  more: Partial<Slot> = {},
): Slot => ({ x, y, act, who, ...more });

/**
 * The slots of each floor plan: staff first (the owner takes the first: the
 * bar, the grill, the door), then the style's own staff (a DJ, a band), then
 * guests, best spots first.
 */
export const LAYOUT_SLOTS: Record<Layout, Slot[]> = {
  dancefloor: [
    P(318, 150, 'serving', 'staff', { flip: true }),
    P(180, 136, 'dj', 'staff'),
    P(176, 196, 'dancing'),
    P(130, 202, 'dancing', 'guest', { flip: true }),
    P(224, 200, 'dancing'),
    P(34, 186, 'drinking', 'guest', { sit: true }),
    P(78, 186, 'relaxing', 'guest', { sit: true, flip: true }),
    P(152, 220, 'dancing'),
    P(204, 222, 'dancing', 'guest', { flip: true }),
    P(250, 214, 'dancing'),
    P(110, 228, 'dancing', 'guest', { flip: true }),
    P(296, 196, 'drinking', 'guest', { flip: true }),
    P(138, 178, 'dancing'),
    P(214, 176, 'dancing', 'guest', { flip: true }),
    P(176, 238, 'dancing'),
    P(236, 238, 'dancing', 'guest', { flip: true }),
    P(344, 200, 'chatting', 'guest', { flip: true }),
    P(34, 222, 'chatting', 'guest', { sit: true }),
    P(78, 222, 'drinking', 'guest', { sit: true, flip: true }),
    P(262, 186, 'dancing'),
    P(96, 206, 'dancing'),
  ],
  warehouse: [
    P(40, 150, 'serving', 'staff'),
    P(180, 134, 'dj', 'staff'),
    P(120, 176, 'dancing'),
    P(160, 180, 'dancing', 'guest', { flip: true }),
    P(200, 178, 'dancing'),
    P(240, 176, 'dancing', 'guest', { flip: true }),
    P(100, 202, 'dancing', 'guest', { flip: true }),
    P(140, 204, 'dancing'),
    P(180, 206, 'dancing', 'guest', { flip: true }),
    P(220, 204, 'dancing'),
    P(260, 202, 'dancing', 'guest', { flip: true }),
    P(30, 192, 'drinking'),
    P(120, 230, 'dancing'),
    P(160, 232, 'dancing', 'guest', { flip: true }),
    P(200, 230, 'dancing'),
    P(240, 232, 'dancing', 'guest', { flip: true }),
    P(296, 186, 'dancing'),
    P(64, 216, 'chatting', 'guest', { flip: true }),
    P(330, 206, 'dancing', 'guest', { flip: true }),
    P(80, 182, 'dancing'),
    P(280, 220, 'dancing'),
  ],
  pub: [
    P(110, 146, 'serving', 'staff'),
    P(60, 180, 'drinking', 'guest', { sit: true }),
    P(104, 180, 'drinking', 'guest', { sit: true }),
    P(148, 180, 'chatting', 'guest', { sit: true }),
    P(266, 168, 'playing', 'guest', { flip: true }),
    P(306, 190, 'drinking', 'guest', { flip: true }),
    P(150, 222, 'playing'),
    P(232, 214, 'watching', 'guest', { flip: true }),
    P(40, 224, 'drinking', 'guest', { sit: true }),
    P(84, 224, 'chatting', 'guest', { sit: true, flip: true }),
    P(220, 170, 'drinking'),
    P(250, 238, 'chatting'),
    P(344, 200, 'watching', 'guest', { flip: true }),
    P(190, 186, 'chatting', 'guest', { flip: true }),
  ],
  speakeasy: [
    P(232, 146, 'serving', 'staff'),
    P(52, 150, 'playing', 'staff'),
    P(176, 180, 'drinking', 'guest', { sit: true }),
    P(216, 180, 'drinking', 'guest', { sit: true }),
    P(256, 180, 'chatting', 'guest', { sit: true }),
    P(296, 180, 'drinking', 'guest', { sit: true }),
    P(54, 206, 'drinking', 'guest', { sit: true }),
    P(104, 206, 'chatting', 'guest', { sit: true, flip: true }),
    P(54, 236, 'chatting', 'guest', { sit: true }),
    P(104, 236, 'drinking', 'guest', { sit: true, flip: true }),
    P(196, 226, 'drinking', 'guest', { sit: true }),
    P(246, 226, 'chatting', 'guest', { sit: true, flip: true }),
    P(340, 196, 'drinking', 'guest', { flip: true }),
  ],
  rooftop: [
    P(314, 152, 'serving', 'staff', { flip: true }),
    P(54, 142, 'dj', 'staff'),
    P(118, 166, 'drinking'),
    P(160, 164, 'chatting', 'guest', { flip: true }),
    P(110, 204, 'relaxing', 'guest', { sit: true }),
    P(160, 204, 'drinking', 'guest', { sit: true, flip: true }),
    P(214, 230, 'chatting', 'guest', { sit: true }),
    P(264, 230, 'drinking', 'guest', { sit: true, flip: true }),
    P(226, 166, 'drinking'),
    P(262, 186, 'chatting', 'guest', { flip: true }),
    P(54, 196, 'dancing'),
    P(80, 226, 'dancing', 'guest', { flip: true }),
    P(196, 186, 'drinking', 'guest', { flip: true }),
    P(350, 200, 'chatting', 'guest', { flip: true }),
    P(30, 232, 'dancing'),
  ],
  shisha: [
    P(306, 150, 'serving', 'staff', { flip: true }),
    P(58, 150, 'playing', 'staff'),
    P(104, 194, 'relaxing', 'guest', { sit: true }),
    P(154, 194, 'chatting', 'guest', { sit: true, flip: true }),
    P(206, 194, 'relaxing', 'guest', { sit: true }),
    P(256, 194, 'drinking', 'guest', { sit: true, flip: true }),
    P(70, 232, 'chatting', 'guest', { sit: true }),
    P(120, 232, 'relaxing', 'guest', { sit: true, flip: true }),
    P(184, 232, 'drinking', 'guest', { sit: true }),
    P(234, 232, 'relaxing', 'guest', { sit: true, flip: true }),
    P(346, 196, 'chatting', 'guest', { flip: true }),
    P(30, 196, 'chatting'),
  ],
  beach: [
    P(312, 152, 'serving', 'staff', { flip: true }),
    P(150, 140, 'dj', 'staff'),
    P(180, 184, 'dancing'),
    P(136, 196, 'dancing', 'guest', { flip: true }),
    P(226, 194, 'dancing'),
    P(154, 226, 'dancing'),
    P(212, 228, 'dancing', 'guest', { flip: true }),
    P(48, 200, 'relaxing', 'guest', { sit: true }),
    P(94, 200, 'drinking', 'guest', { sit: true }),
    P(270, 196, 'drinking', 'guest', { flip: true }),
    P(350, 192, 'chatting', 'guest', { flip: true }),
    P(110, 236, 'dancing'),
    P(250, 222, 'dancing'),
    P(40, 236, 'chatting'),
  ],
  yard: [
    P(70, 150, 'serving', 'staff'),
    P(300, 148, 'serving', 'staff', { flip: true }),
    P(130, 194, 'eating', 'guest', { sit: true }),
    P(176, 194, 'drinking', 'guest', { sit: true, flip: true }),
    P(230, 202, 'drinking', 'guest', { sit: true }),
    P(276, 202, 'chatting', 'guest', { sit: true, flip: true }),
    P(110, 232, 'chatting', 'guest', { sit: true }),
    P(156, 232, 'eating', 'guest', { sit: true, flip: true }),
    P(30, 186, 'chatting'),
    P(100, 164, 'waiting', 'guest', { flip: true }),
    P(214, 236, 'dancing'),
    P(252, 236, 'dancing', 'guest', { flip: true }),
    P(346, 196, 'drinking', 'guest', { flip: true }),
    P(214, 168, 'chatting'),
  ],
  boat: [
    P(44, 152, 'serving', 'staff'),
    P(190, 140, 'dj', 'staff'),
    P(150, 184, 'dancing'),
    P(196, 186, 'dancing', 'guest', { flip: true }),
    P(240, 184, 'dancing'),
    P(130, 210, 'dancing', 'guest', { flip: true }),
    P(176, 214, 'dancing'),
    P(222, 212, 'dancing', 'guest', { flip: true }),
    P(296, 182, 'relaxing', 'guest', { sit: true }),
    P(340, 182, 'drinking', 'guest', { sit: true, flip: true }),
    P(90, 190, 'drinking'),
    P(260, 222, 'dancing'),
    P(150, 236, 'dancing', 'guest', { flip: true }),
    P(40, 214, 'chatting'),
    P(200, 236, 'dancing'),
  ],
  band: [
    P(330, 150, 'serving', 'staff', { flip: true }),
    P(180, 134, 'singing', 'staff'),
    P(118, 136, 'playing', 'staff'),
    P(240, 136, 'playing', 'staff', { flip: true }),
    P(156, 196, 'dancing'),
    P(204, 200, 'dancing', 'guest', { flip: true }),
    P(48, 196, 'eating', 'guest', { sit: true }),
    P(94, 196, 'drinking', 'guest', { sit: true, flip: true }),
    P(262, 200, 'drinking', 'guest', { sit: true }),
    P(306, 200, 'chatting', 'guest', { sit: true, flip: true }),
    P(180, 226, 'dancing'),
    P(134, 230, 'dancing', 'guest', { flip: true }),
    P(226, 232, 'watching'),
    P(70, 234, 'watching', 'guest', { flip: true }),
    P(350, 220, 'drinking', 'guest', { flip: true }),
  ],
};

/** The style's own staff, after the owner: who stands in the second (third…) staff slots. */
export function styleStaff(s: NightStyle): { seed: string; role: string }[] {
  switch (s.layout) {
    case 'dancefloor':
    case 'warehouse':
    case 'boat':
    case 'beach':
      return [{ seed: 'dj', role: 'DJ' }];
    case 'rooftop':
      return [{ seed: 'dj', role: 'DJ' }];
    case 'band':
      return [
        { seed: 'singer', role: 'Singer' },
        { seed: 'player', role: s.props.includes('oud') ? 'Oud player' : 'Guitarist' },
        { seed: 'drums', role: s.props.includes('piano') ? 'Pianist' : 'Drummer' },
      ];
    case 'speakeasy':
      return [{ seed: 'pianist', role: s.props.includes('piano') ? 'Pianist' : 'Musician' }];
    case 'shisha':
      return [{ seed: 'oud', role: s.props.includes('oud') ? 'Oud player' : 'Shisha attendant' }];
    case 'yard':
      return [
        {
          seed: 'grill',
          role: s.props.includes('braai') ? 'Braai master' : 'Bartender',
        },
      ];
    default:
      return [];
  }
}

/** How many regulars fill the room: the style's crowd, not every room's two to four. */
export function nightRegulars(
  s: NightStyle,
  placeId: string,
  month: number,
  present: number,
): number {
  const guests = LAYOUT_SLOTS[s.layout].filter((x) => x.who === 'guest').length;
  const want = Math.round((3 + (hash(`${placeId}:${month}`) % 3)) * s.crowd * 1.6);
  return Math.max(0, Math.min(guests - 1, want) - present);
}

/** The room kind's scripts and crowd still apply; this is the floor plan the scene draws. */
export function nightSlots(s: NightStyle): Slot[] {
  return LAYOUT_SLOTS[s.layout];
}

/** Open-air floor plans (no walls in 3D; a sky in 2D). */
export const isOpenAir = (s: NightStyle) =>
  s.layout === 'rooftop' ||
  s.layout === 'beach' ||
  s.layout === 'yard' ||
  s.layout === 'boat' ||
  (s.layout === 'band' && s.props.includes('palms'));

// ---------------------------------------------------------------------------
// The crowd's clothes

const DRESS: Record<Dress, { tops: string[]; styles: string[]; head?: string; shades?: number }> = {
  glam: {
    tops: ['#111827', '#f8fafc', '#ca8a04', '#be185d', '#7c3aed'],
    styles: ['dress', 'blazer', 'shirt'],
    shades: 0.3,
  },
  'aso-ebi': {
    tops: ['#d4a017', '#be185d', '#0f766e'],
    styles: ['kaftan', 'dress', 'kaftan'],
    head: 'gele',
  },
  smart: {
    tops: ['#1e3a8a', '#f8fafc', '#334155', '#7f1d1d', '#0f766e'],
    styles: ['shirt', 'blazer'],
  },
  casual: {
    tops: ['#2563eb', '#16a34a', '#a16207', '#dc2626', '#64748b'],
    styles: ['tee', 'shirt', 'hoodie'],
  },
  beach: {
    tops: ['#f97316', '#22d3ee', '#facc15', '#f472b6', '#f8fafc'],
    styles: ['tee', 'shirt'],
    shades: 0.5,
  },
  street: {
    tops: ['#ef4444', '#facc15', '#22c55e', '#111827', '#f8fafc', '#a855f7'],
    styles: ['hoodie', 'tee'],
    head: 'cap',
    shades: 0.2,
  },
  tech: {
    tops: ['#334155', '#1e293b', '#0f766e', '#64748b', '#e2e8f0'],
    styles: ['hoodie', 'tee', 'shirt'],
  },
  kaftan: {
    tops: ['#f8fafc', '#e7dcc6', '#1e293b', '#0f766e', '#7f1d1d'],
    styles: ['kaftan', 'shirt', 'kaftan'],
    head: 'headwrap',
  },
};

/**
 * A guest's outfit for the night: the style's dress code, picked by their
 * id (most of the room; a few came as they are).
 */
export function dressFor(s: NightStyle, look: AvatarLook, id: string): AvatarLook {
  const h = hash(`${s.id}:${id}`);
  if (h % 5 === 0) return look;
  const d = DRESS[s.dress];
  const female = look.gender === 'female';
  let style = d.styles[(h >>> 3) % d.styles.length]! as NonNullable<AvatarLook['topStyle']>;
  if (style === 'dress' && !female) style = 'shirt';
  const out: AvatarLook = { ...look, top: d.tops[(h >>> 6) % d.tops.length]!, topStyle: style };
  if (d.head === 'gele' && female && (h >>> 9) % 3 !== 0) out.headwear = 'gele';
  else if (d.head === 'cap' && !female && (h >>> 9) % 3 === 0) out.headwear = 'cap';
  else if (d.head === 'headwrap' && female && (h >>> 9) % 4 === 0) out.headwear = 'headwrap';
  if (d.shades && ((h >>> 12) % 100) / 100 < d.shades) out.glasses = 'shades';
  return out;
}

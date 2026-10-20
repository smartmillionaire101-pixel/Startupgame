/**
 * What golfers wear on the course, whatever they wear in town: a polo
 * (drawn as a shirt) over tailored trousers and a cap. Nobody plays in a
 * dress, a kaftan or a tie. The polo keeps the player's own colour; the
 * trousers are a golf neutral picked from the look's seed.
 */
import type { AvatarLook } from '../art';

/** Course trousers: stone, white, navy, grey, charcoal. */
const TROUSERS = ['#d6cfbf', '#f1f5f9', '#1e3a8a', '#94a3b8', '#334155'];

/** Plain white polos read as a shirt and tie from afar: give them a little colour. */
const POLO_FOR_WHITE = '#0ea5e9';

export function golfAttire(look: AvatarLook, seed: string): AvatarLook {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const top = /^#(f{3}|f{6}|e2e8f0|f1f5f9)$/i.test(look.top) ? POLO_FOR_WHITE : look.top;
  return {
    ...look,
    top,
    bottom: TROUSERS[h % TROUSERS.length]!,
    topStyle: 'shirt',
    trousers: true,
    headwear: 'cap',
    // A tie, lanyard or scarf stays in the clubhouse; glasses are their own part.
    accessory: look.accessory === 'glasses' ? 'glasses' : 'none',
  };
}

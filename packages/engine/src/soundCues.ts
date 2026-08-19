import { GameEvent } from './types.js';

/**
 * Semantic sound cue names, derived from raw engine events so the client doesn't need to
 * infer "what just happened" from state diffs. Independent of commentary (which is gated on
 * a bot existing to "speak") — sound cues fire for every player, every time.
 */
export type SfxCue = 'deal' | 'bid' | 'play' | 'spadesBroken' | 'trickWon' | 'handScored' | 'matchOver';

const CUE_BY_EVENT: Partial<Record<GameEvent['type'], SfxCue>> = {
  handStarted: 'deal',
  bidPlaced: 'bid',
  spadesBroken: 'spadesBroken',
  trickWon: 'trickWon',
  handScored: 'handScored',
  matchOver: 'matchOver',
};

/** Maps a batch of raw engine events to the sound cues the client should play, in order.
 * `cardPlayed` isn't in the flat lookup table above since every single one gets the same
 * plain 'play' cue regardless of what else it did (trickWon/spadesBroken fire as their OWN
 * separate cues right alongside it when relevant, so a trick-winning spade gets all three). */
export function deriveSoundCues(events: GameEvent[]): SfxCue[] {
  const cues: SfxCue[] = [];
  for (const event of events) {
    if (event.type === 'cardPlayed') {
      cues.push('play');
      continue;
    }
    const cue = CUE_BY_EVENT[event.type];
    if (cue) cues.push(cue);
  }
  return cues;
}
